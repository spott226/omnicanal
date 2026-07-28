import { Body, Controller, Get, Inject, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { AuthPrincipal } from "../../../packages/shared/src/index";
import { AuthService } from "./auth.service";
import { LoginDto, SelectOrganizationDto } from "./auth.dto";
import { CsrfGuard, CurrentPrincipal, SessionGuard } from "./security";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Post("login") login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) { return this.auth.login(dto, response); }
  @Get("session") @UseGuards(SessionGuard) session(@CurrentPrincipal() principal: AuthPrincipal) { return principal; }
  @Post("select-organization") @UseGuards(SessionGuard, CsrfGuard) select(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: SelectOrganizationDto, @Res({ passthrough: true }) response: Response) { return this.auth.selectOrganization(principal, dto, response); }
  @Post("logout") @UseGuards(SessionGuard, CsrfGuard) logout(@CurrentPrincipal() principal: AuthPrincipal, @Res({ passthrough: true }) response: Response) { return this.auth.logout(principal, response); }
  @Post("forgot-password") forgotPassword() { return { ok: true, message: "Si la cuenta existe, recibirá instrucciones." }; }
}
