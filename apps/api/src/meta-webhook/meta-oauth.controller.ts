import { Controller, Get, Header, HttpCode, Inject, Post, Query, Req } from "@nestjs/common";
import type { AuthPrincipal } from "../../../../packages/shared/src/index";
import { CurrentPrincipal, Protected } from "../security";
import { MetaOAuthService } from "./meta-oauth.service";
import { MetaWebhookService } from "./meta-webhook.service";

@Controller("meta/instagram")
export class MetaOAuthController {
  constructor(@Inject(MetaOAuthService) private readonly oauth: MetaOAuthService, @Inject(MetaWebhookService) private readonly webhook: MetaWebhookService) {}

  @Get("start")
  @Protected("SUPER_ADMIN", "ORGANIZATION_ADMIN", "SUPERVISOR")
  start(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.oauth.startInstagramLogin(principal);
  }

  @Get("callback")
  @Header("content-type", "text/html; charset=utf-8")
  async callback(
    @Query("code") code?: string,
    @Query("error") error?: string,
    @Query("error_description") errorDescription?: string,
    @Query("state") state?: string,
    @Req() request?: any,
  ) {
    const result = await this.oauth.completeInstagramLogin({ code, error, errorDescription, state, redirectUri: this.publicCallbackUrl(request) });
    const account = this.escapeHtml(result.username || result.externalAccountId || "Instagram");
    return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Instagram conectado</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #07111f; color: #e8f7ff; font-family: Arial, sans-serif; }
      main { width: min(560px, calc(100vw - 32px)); border: 1px solid rgba(34, 211, 238, .35); border-radius: 22px; padding: 32px; background: linear-gradient(135deg, rgba(15, 23, 42, .96), rgba(8, 47, 73, .72)); box-shadow: 0 24px 80px rgba(34, 211, 238, .16); }
      p { color: #a9c6d9; line-height: 1.6; }
      .ok { color: #2fffd2; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; font-size: 12px; }
      h1 { margin: 10px 0 8px; font-size: 34px; }
      button { margin-top: 18px; border: 0; border-radius: 14px; padding: 14px 18px; color: #02111d; background: linear-gradient(135deg, #38e8ff, #7c4dff); font-weight: 800; cursor: pointer; }
    </style>
  </head>
  <body>
    <main>
      <div class="ok">Conexion lista</div>
      <h1>Instagram conectado</h1>
      <p>La cuenta <strong>${account}</strong> quedo autorizada para next.io by Mercadia. Ya puedes cerrar esta pestana y volver al panel.</p>
      <button onclick="window.close()">Cerrar pestana</button>
    </main>
  </body>
</html>`;
  }

  @Get("status")
  @Protected()
  status(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.oauth.status(principal);
  }

  @Post("sync")
  @HttpCode(200)
  @Protected()
  sync(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.webhook.syncInstagramInbox(principal);
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character] ?? character));
  }

  private publicCallbackUrl(request?: any) {
    const host = request?.headers?.["x-forwarded-host"] || request?.headers?.host;
    const proto = request?.headers?.["x-forwarded-proto"] || request?.protocol || "https";
    if (!host) return undefined;
    return `${proto}://${host}/api/v1/meta/instagram/callback`;
  }
}
