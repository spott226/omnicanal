import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException, UseGuards, applyDecorators } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AuthPrincipal, AppRole } from "../../../packages/shared/src/index";
import { AuthService } from "./auth.service";
import { PrismaService } from "./prisma.service";

type AuthenticatedRequest = Request & { principal?: AuthPrincipal };
const TRIAL_CONVERSATION_LIMIT = 20;

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.principal = await this.auth.verify(request.cookies?.nexoia_session);
    return true;
  }
}

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal) throw new UnauthorizedException();
    if (!principal.organizationId) throw new ForbiddenException("Selecciona una organización explícitamente");
    return true;
  }
}

const ROLES_KEY = "nexoia_roles";
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal || !required.includes(principal.role)) throw new ForbiddenException("No tienes permiso para esta acción");
    return true;
  }
}

const ALLOW_INACTIVE_SUBSCRIPTION_KEY = "nexoia_allow_inactive_subscription";
export const AllowInactiveSubscription = () => SetMetadata(ALLOW_INACTIVE_SUBSCRIPTION_KEY, true);

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector, @Inject(PrismaService) private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const allowInactive = this.reflector.getAllAndOverride<boolean>(ALLOW_INACTIVE_SUBSCRIPTION_KEY, [context.getHandler(), context.getClass()]);
    if (allowInactive) return true;
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal?.organizationId) throw new ForbiddenException("Organización requerida");
    const subscription = await (this.prisma as any).subscription.findFirst({ where: { organizationId: principal.organizationId }, orderBy: { createdAt: "desc" }, include: { planPrice: true } });
    if (!subscription) throw new ForbiddenException("Suscripción requerida para usar esta funcion");
    if (subscription.status === "ACTIVE") {
      const limit = subscription.planPrice?.monthlyContactsLimit ?? 0;
      if (limit > 0) {
        const conversations = await this.prisma.conversation.count({ where: { organizationId: principal.organizationId, createdAt: { gte: subscription.currentPeriodStartsAt } } });
        if (conversations >= limit) throw new ForbiddenException("Limite de conversaciones del plan alcanzado. Cambia de plan para continuar.");
      }
      return true;
    }
    if (subscription.status === "TRIALING") {
      if (new Date(subscription.trialEndsAt).getTime() <= Date.now()) {
        throw new ForbiddenException("Trial vencido. Activa un plan para continuar.");
      }
      const conversations = await this.prisma.conversation.count({ where: { organizationId: principal.organizationId, createdAt: { gte: subscription.currentPeriodStartsAt } } });
      if (conversations >= TRIAL_CONVERSATION_LIMIT) {
        throw new ForbiddenException("Limite de 20 conversaciones del trial alcanzado. Activa un plan para continuar.");
      }
      return true;
    }
    if (subscription.status === "PAST_DUE") throw new ForbiddenException("Pago pendiente. Actualiza tu plan para continuar.");
    if (subscription.status === "INCOMPLETE") throw new ForbiddenException("Suscripción incompleta o trial vencido. Activa un plan para continuar.");
    if (subscription.status === "CANCELLED") throw new ForbiddenException("Suscripción cancelada. Reactiva un plan para continuar.");
    throw new ForbiddenException("Suscripción no valida para esta funcion");
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
    const origin = request.header("origin");
    if (origin && origin !== this.config.getOrThrow<string>("FRONTEND_URL")) throw new ForbiddenException("Origen no permitido");
    const cookie = request.cookies?.nexoia_csrf;
    const header = request.header("x-csrf-token");
    if (!cookie || !header || cookie !== header) throw new ForbiddenException("Token CSRF inválido");
    return true;
  }
}

export const Protected = (...roles: AppRole[]) => applyDecorators(UseGuards(SessionGuard, TenantGuard, SubscriptionGuard, CsrfGuard, RolesGuard), Roles(...roles));
export const CurrentPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<AuthenticatedRequest>().principal);
