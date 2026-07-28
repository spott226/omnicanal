import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import type { Response } from "express";
import type { AuthPrincipal, AppRole } from "../../../packages/shared/src/index";
import { PrismaService } from "./prisma.service";
import type { LoginDto, RegisterDto, SelectOrganizationDto } from "./auth.dto";

type TokenPayload = { sub: string; sid: string; organizationId: string | null; role: AppRole };

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(JwtService) private readonly jwt: JwtService, @Inject(ConfigService) private readonly config: ConfigService) {}

  async register(dto: RegisterDto, response: Response) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException("Este correo ya tiene una cuenta");
    const planPrice = await (this.prisma as any).planPrice.findUnique({ where: { plan_interval: { plan: dto.plan, interval: dto.interval } } });
    if (!planPrice?.active) throw new ForbiddenException("El plan seleccionado no está disponible");
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 7 * 86_400_000);
    const passwordHash = await hash(dto.password, 12);
    const baseSlug = this.slugify(dto.businessName);
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name: dto.name.trim(), email, passwordHash, status: "ACTIVE" } });
      const organization = await tx.organization.create({ data: { name: dto.businessName.trim(), slug: await this.uniqueSlug(tx, baseSlug), status: "ACTIVE", mode: "LIVE", plan: dto.plan } });
      await tx.membership.create({ data: { organizationId: organization.id, userId: user.id, role: "ORGANIZATION_ADMIN" } });
      const sessionId = randomUUID();
      await tx.session.create({ data: { id: sessionId, userId: user.id, organizationId: organization.id, tokenHash: this.hash(sessionId), expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) } });
      await (tx as any).subscription.create({ data: { organizationId: organization.id, planPriceId: planPrice.id, status: "TRIALING", trialStartedAt: now, trialEndsAt, currentPeriodStartsAt: now, currentPeriodEndsAt: trialEndsAt } });
      await (tx as any).billingEvent.create({ data: { organizationId: organization.id, type: "TRIAL_STARTED_FROM_REGISTRATION", payload: { plan: dto.plan, interval: dto.interval, trialDays: 7 } } });
      await tx.auditLog.create({ data: { organizationId: organization.id, userId: user.id, action: "ORGANIZATION_REGISTERED", entityType: "Organization", entityId: organization.id } });
      return { user, organization, sessionId };
    });
    const token = await this.sign({ sub: result.user.id, sid: result.sessionId, organizationId: result.organization.id, role: "ORGANIZATION_ADMIN" });
    this.setCookies(response, token);
    return { user: { id: result.user.id, name: result.user.name, email: result.user.email }, organization: result.organization, role: "ORGANIZATION_ADMIN", trialEndsAt, requiresOrganizationSelection: false };
  }

  async login(dto: LoginDto, response: Response) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() }, include: { memberships: { include: { organization: true } } } });
    if (!user || user.status !== "ACTIVE" || !(await compare(dto.password, user.passwordHash))) throw new UnauthorizedException("Credenciales incorrectas");
    const superMembership = user.memberships.find((membership: { role: AppRole }) => membership.role === "SUPER_ADMIN");
    const membership = superMembership ?? (dto.organizationSlug ? user.memberships.find((item: { organization: { slug: string } }) => item.organization.slug === dto.organizationSlug) : user.memberships[0]);
    if (!membership) throw new ForbiddenException("El usuario no pertenece a una organización");
    if (membership.organization.status !== "ACTIVE") throw new ForbiddenException("La organización está deshabilitada");
    const sessionId = randomUUID();
    const organizationId = membership.role === "SUPER_ADMIN" ? null : membership.organizationId;
    await this.prisma.session.create({ data: { id: sessionId, userId: user.id, organizationId, tokenHash: this.hash(sessionId), expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) } });
    const token = await this.sign({ sub: user.id, sid: sessionId, organizationId, role: membership.role });
    this.setCookies(response, token);
    return { user: { id: user.id, name: user.name, email: user.email }, organization: organizationId ? membership.organization : null, role: membership.role, requiresOrganizationSelection: membership.role === "SUPER_ADMIN" };
  }

  async verify(token?: string): Promise<AuthPrincipal> {
    if (!token) throw new UnauthorizedException("Sesión requerida");
    let payload: TokenPayload;
    try { payload = await this.jwt.verifyAsync<TokenPayload>(token, { secret: this.config.getOrThrow<string>("JWT_SECRET") }); }
    catch { throw new UnauthorizedException("Sesión inválida"); }
    const session = await this.prisma.session.findFirst({ where: { id: payload.sid, userId: payload.sub, tokenHash: this.hash(payload.sid), revokedAt: null, expiresAt: { gt: new Date() } }, include: { user: true, organization: true } });
    if (!session || session.user.status !== "ACTIVE") throw new UnauthorizedException("Sesión expirada");
    if (session.organization && session.organization.status !== "ACTIVE") throw new ForbiddenException("La organización está deshabilitada");
    if (payload.role !== "SUPER_ADMIN" && payload.organizationId) {
      const membership = await this.prisma.membership.findUnique({ where: { organizationId_userId: { organizationId: payload.organizationId, userId: payload.sub } } });
      if (!membership || membership.role !== payload.role) throw new ForbiddenException("Membresía inválida");
    }
    await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    return { userId: session.user.id, sessionId: session.id, organizationId: payload.organizationId, role: payload.role, email: session.user.email, name: session.user.name };
  }

  async selectOrganization(principal: AuthPrincipal, dto: SelectOrganizationDto, response: Response) {
    if (principal.role !== "SUPER_ADMIN") throw new ForbiddenException("Solo el superadministrador puede seleccionar otra organización");
    const organization = await this.prisma.organization.findFirst({ where: { id: dto.organizationId, status: "ACTIVE" } });
    if (!organization) throw new ForbiddenException("Organización no disponible");
    await this.prisma.session.update({ where: { id: principal.sessionId }, data: { organizationId: organization.id } });
    const token = await this.sign({ sub: principal.userId, sid: principal.sessionId, organizationId: organization.id, role: "SUPER_ADMIN" });
    this.setCookies(response, token);
    await this.prisma.auditLog.create({ data: { organizationId: organization.id, userId: principal.userId, action: "SUPER_ADMIN_SELECTED_ORGANIZATION", entityType: "Organization", entityId: organization.id } });
    return { organization };
  }

  async logout(principal: AuthPrincipal, response: Response) {
    await this.prisma.session.updateMany({ where: { id: principal.sessionId, userId: principal.userId }, data: { revokedAt: new Date() } });
    response.clearCookie("nexoia_session"); response.clearCookie("nexoia_csrf");
    return { ok: true };
  }

  private sign(payload: TokenPayload) { return this.jwt.signAsync(payload, { secret: this.config.getOrThrow<string>("JWT_SECRET"), expiresIn: "8h", issuer: "nexoia-api", audience: "nexoia-web" }); }
  private hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
  private slugify(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || `negocio-${randomUUID().slice(0, 8)}`; }
  private async uniqueSlug(tx: any, baseSlug: string) {
    let slug = baseSlug;
    let counter = 2;
    while (await tx.organization.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${baseSlug}-${counter}`;
      counter += 1;
    }
    return slug;
  }
  private setCookies(response: Response, token: string) {
    const secure = this.config.get<string>("NODE_ENV") === "production";
    response.cookie("nexoia_session", token, { httpOnly: true, secure, sameSite: "strict", maxAge: 8 * 60 * 60 * 1000, path: "/" });
    response.cookie("nexoia_csrf", randomBytes(24).toString("hex"), { httpOnly: false, secure, sameSite: "strict", maxAge: 8 * 60 * 60 * 1000, path: "/" });
  }
}
