import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException, UseGuards, applyDecorators } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AuthPrincipal, AppRole } from "../../../packages/shared/src/index";
import { AuthService } from "./auth.service";

type AuthenticatedRequest = Request & { principal?: AuthPrincipal };

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

export const Protected = (...roles: AppRole[]) => applyDecorators(UseGuards(SessionGuard, TenantGuard, CsrfGuard, RolesGuard), Roles(...roles));
export const CurrentPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<AuthenticatedRequest>().principal);
