import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { compare } from "bcryptjs";
import type { Response } from "express";
import type { AuthPrincipal, AppRole } from "../../../packages/shared/src/index";
import { PrismaService } from "./prisma.service";
import type { LoginDto, SelectOrganizationDto } from "./auth.dto";

type TokenPayload = { sub: string; sid: string; organizationId: string | null; role: AppRole };

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(JwtService) private readonly jwt: JwtService, @Inject(ConfigService) private readonly config: ConfigService) {}

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
  private setCookies(response: Response, token: string) {
    const secure = this.config.get<string>("NODE_ENV") === "production";
    response.cookie("nexoia_session", token, { httpOnly: true, secure, sameSite: "strict", maxAge: 8 * 60 * 60 * 1000, path: "/" });
    response.cookie("nexoia_csrf", randomBytes(24).toString("hex"), { httpOnly: false, secure, sameSite: "strict", maxAge: 8 * 60 * 60 * 1000, path: "/" });
  }
}
