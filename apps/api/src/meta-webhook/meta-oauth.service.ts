import { BadRequestException, Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthPrincipal } from "../../../../packages/shared/src/index";
import { PrismaService } from "../prisma.service";
import type { CompleteWhatsAppSignupDto } from "../resource.dto";

type InstagramTokenResponse = {
  access_token?: string;
  user_id?: number | string;
  permissions?: string[];
  token_type?: string;
  expires_in?: number;
  error_type?: string;
  code?: number;
  error_message?: string;
};

type InstagramProfileResponse = {
  id?: string;
  user_id?: string;
  username?: string;
  account_type?: string;
};

type FacebookTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string };
};

type FacebookPage = { id?: string; name?: string; access_token?: string };
type FacebookPagesResponse = { data?: FacebookPage[] };

@Injectable()
export class MetaOAuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(ConfigService) private readonly config: ConfigService) {}

  async startInstagramLogin(principal: AuthPrincipal) {
    const organizationId = this.organizationId(principal);
    const clientId = this.config.get<string>("META_INSTAGRAM_APP_ID")?.trim() || this.config.get<string>("META_APP_ID")?.trim();
    const clientSecret = this.config.get<string>("META_INSTAGRAM_APP_SECRET")?.trim() || this.config.get<string>("META_APP_SECRET")?.trim();
    const redirectUri = this.redirectUri();
    if (!clientId || !clientSecret || !redirectUri) throw new BadRequestException("Faltan credenciales OAuth de Instagram en Railway");

    const authorizationUrl = new URL("https://www.instagram.com/oauth/authorize");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", this.config.get<string>("META_INSTAGRAM_SCOPES")?.trim() || "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments");
    authorizationUrl.searchParams.set("state", this.signState(organizationId));
    return { authorizationUrl: authorizationUrl.toString() };
  }

  async startFacebookLogin(principal: AuthPrincipal) {
    const organizationId = this.organizationId(principal);
    const clientId = this.config.get<string>("META_APP_ID")?.trim();
    const clientSecret = this.config.get<string>("META_APP_SECRET")?.trim();
    if (!clientId || !clientSecret) throw new BadRequestException("Faltan credenciales OAuth de Facebook en Railway");
    const authorizationUrl = new URL(`https://www.facebook.com/${this.graphVersion()}/dialog/oauth`);
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", this.facebookRedirectUri());
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", this.config.get<string>("META_FACEBOOK_SCOPES")?.trim() || "pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging");
    authorizationUrl.searchParams.set("state", this.signState(organizationId));
    return { authorizationUrl: authorizationUrl.toString() };
  }

  async completeInstagramLogin(input: { code?: string; error?: string; errorDescription?: string; state?: string; redirectUri?: string }) {
    if (input.error) throw new BadRequestException(input.errorDescription || input.error);
    const code = input.code?.trim();
    if (!code) throw new BadRequestException("Instagram no devolviÃ³ cÃ³digo de autorizaciÃ³n");

    const organizationId = await this.organizationIdFromState(input.state);
    const token = await this.exchangeCode(code, input.redirectUri);
    if (!token.access_token) throw new InternalServerErrorException("Instagram no devolviÃ³ token de acceso");

    const encryptedToken = this.encrypt(token.access_token);
    const profile = await this.fetchProfile(token.access_token).catch(() => undefined);
    const externalAccountId = profile?.user_id || profile?.id || (token.user_id ? String(token.user_id) : undefined);
    const scopes = Array.isArray(token.permissions) ? token.permissions : [];
    const expiresAt = typeof token.expires_in === "number" ? new Date(Date.now() + token.expires_in * 1000) : null;

    await (this.prisma as any).metaConnection.upsert({
      where: { organizationId_provider: { organizationId, provider: "INSTAGRAM" } },
      create: {
        organizationId,
        provider: "INSTAGRAM",
        externalAccountId,
        username: profile?.username,
        accessTokenEncrypted: encryptedToken,
        tokenType: token.token_type,
        scopes,
        expiresAt,
        status: "CONNECTED",
        lastError: null,
        connectedAt: new Date(),
      },
      update: {
        externalAccountId,
        username: profile?.username,
        accessTokenEncrypted: encryptedToken,
        tokenType: token.token_type,
        scopes,
        expiresAt,
        status: "CONNECTED",
        lastError: null,
        connectedAt: new Date(),
      },
    });

    return {
      organizationId,
      externalAccountId,
      username: profile?.username,
    };
  }

  async completeFacebookLogin(input: { code?: string; error?: string; errorDescription?: string; state?: string; redirectUri?: string }) {
    if (input.error) throw new BadRequestException(input.errorDescription || input.error);
    const code = input.code?.trim();
    if (!code) throw new BadRequestException("Facebook no devolvió código de autorización");
    const organizationId = await this.organizationIdFromState(input.state);
    const token = await this.exchangeFacebookCode(code, input.redirectUri);
    if (!token.access_token) throw new BadRequestException(token.error?.message || "Facebook no devolvió token de acceso");
    const pages = await this.fetchFacebookPages(token.access_token);
    const page = pages[0];
    if (!page?.id || !page.access_token) throw new BadRequestException("No se encontró una página de Facebook administrable. Autoriza una cuenta con una Página y vuelve a intentar.");
    const expiresAt = typeof token.expires_in === "number" ? new Date(Date.now() + token.expires_in * 1000) : null;
    await (this.prisma as any).metaConnection.upsert({
      where: { organizationId_provider: { organizationId, provider: "FACEBOOK" } },
      create: { organizationId, provider: "FACEBOOK", externalAccountId: page.id, username: page.name, accessTokenEncrypted: this.encrypt(page.access_token), tokenType: token.token_type, scopes: this.config.get<string>("META_FACEBOOK_SCOPES")?.trim().split(",").filter(Boolean) ?? [], expiresAt, status: "CONNECTED", lastError: null, connectedAt: new Date() },
      update: { externalAccountId: page.id, username: page.name, accessTokenEncrypted: this.encrypt(page.access_token), tokenType: token.token_type, scopes: this.config.get<string>("META_FACEBOOK_SCOPES")?.trim().split(",").filter(Boolean) ?? [], expiresAt, status: "CONNECTED", lastError: null, connectedAt: new Date() },
    });
    return { organizationId, externalAccountId: page.id, username: page.name };
  }

  async completeWhatsAppEmbeddedSignup(principal: AuthPrincipal, dto: CompleteWhatsAppSignupDto) {
    const organizationId = this.organizationId(principal);
    if (!this.config.get<string>("META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID")?.trim()) throw new BadRequestException("Falta configurar el registro integrado de WhatsApp Business en Meta.");
    const subscription = await (this.prisma as any).subscription.findFirst({ where: { organizationId, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, include: { planPrice: true } });
    if (!subscription || (subscription.planPrice?.channelsLimit ?? 0) < 1) throw new BadRequestException("WhatsApp Business requiere un plan activo que incluya al menos un canal.");
    const token = await this.exchangeEmbeddedSignupCode(dto.authorizationCode);
    if (!token.access_token) throw new BadRequestException(token.error?.message || "Meta no devolvió un token de WhatsApp Business");
    const subscribeResponse = await fetch(`https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(dto.wabaId)}/subscribed_apps`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ access_token: token.access_token }) });
    if (!subscribeResponse.ok) throw new BadRequestException("Meta no permitió suscribir el webhook de WhatsApp Business. Revisa permisos, app y número.");
    await (this.prisma as any).metaConnection.upsert({
      where: { organizationId_provider: { organizationId, provider: "WHATSAPP" } },
      create: { organizationId, provider: "WHATSAPP", externalAccountId: dto.wabaId, username: dto.displayName?.trim() || dto.phoneNumberId, accessTokenEncrypted: this.encrypt(token.access_token), tokenType: token.token_type, scopes: { phoneNumberId: dto.phoneNumberId }, expiresAt: typeof token.expires_in === "number" ? new Date(Date.now() + token.expires_in * 1000) : null, status: "CONNECTED", lastError: null, connectedAt: new Date() },
      update: { externalAccountId: dto.wabaId, username: dto.displayName?.trim() || dto.phoneNumberId, accessTokenEncrypted: this.encrypt(token.access_token), tokenType: token.token_type, scopes: { phoneNumberId: dto.phoneNumberId }, expiresAt: typeof token.expires_in === "number" ? new Date(Date.now() + token.expires_in * 1000) : null, status: "CONNECTED", lastError: null, connectedAt: new Date() },
    });
    return { provider: "meta", channel: "WHATSAPP", status: "CONNECTED", accountLabel: dto.displayName?.trim() || dto.phoneNumberId };
  }

  async status(principal: AuthPrincipal) {
    const organizationId = this.organizationId(principal);
    const connection = await (this.prisma as any).metaConnection.findUnique({
      where: { organizationId_provider: { organizationId, provider: "INSTAGRAM" } },
      select: { status: true, externalAccountId: true, username: true, connectedAt: true, expiresAt: true, lastError: true },
    });
    return {
      provider: "meta",
      instagram: connection ? { ...connection, connected: connection.status === "CONNECTED" } : { connected: false, status: "NOT_CONNECTED" },
      whatsapp: this.config.get<string>("WHATSAPP_STATUS") ?? "pending",
    };
  }

  private async exchangeCode(code: string, redirectUriOverride?: string): Promise<InstagramTokenResponse> {
    const clientId = this.config.get<string>("META_INSTAGRAM_APP_ID")?.trim() || this.config.get<string>("META_APP_ID")?.trim();
    const clientSecret = this.config.get<string>("META_INSTAGRAM_APP_SECRET")?.trim() || this.config.get<string>("META_APP_SECRET")?.trim();
    const redirectUri = redirectUriOverride || this.redirectUri();
    if (!clientId || !clientSecret || !redirectUri) throw new InternalServerErrorException("Faltan credenciales OAuth de Instagram");

    const body = new URLSearchParams();
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
    body.set("grant_type", "authorization_code");
    body.set("redirect_uri", redirectUri);
    body.set("code", code);

    const response = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await response.json().catch(() => ({}))) as InstagramTokenResponse;
    if (!response.ok) throw new BadRequestException(data.error_message || "Instagram rechazÃ³ el cÃ³digo de autorizaciÃ³n");
    return data;
  }

  private async fetchProfile(accessToken: string): Promise<InstagramProfileResponse> {
    const response = await fetch(`https://graph.instagram.com/me?fields=id,user_id,username,account_type&access_token=${encodeURIComponent(accessToken)}`);
    if (!response.ok) return {};
    return (await response.json().catch(() => ({}))) as InstagramProfileResponse;
  }

  private async exchangeFacebookCode(code: string, redirectUriOverride?: string): Promise<FacebookTokenResponse> {
    const clientId = this.config.get<string>("META_APP_ID")?.trim();
    const clientSecret = this.config.get<string>("META_APP_SECRET")?.trim();
    if (!clientId || !clientSecret) throw new InternalServerErrorException("Faltan credenciales OAuth de Facebook");
    const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUriOverride || this.facebookRedirectUri(), code });
    const response = await fetch(`https://graph.facebook.com/${this.graphVersion()}/oauth/access_token?${params.toString()}`);
    const data = (await response.json().catch(() => ({}))) as FacebookTokenResponse;
    if (!response.ok) throw new BadRequestException(data.error?.message || "Facebook rechazó el código de autorización");
    return data;
  }

  private async exchangeEmbeddedSignupCode(code: string): Promise<FacebookTokenResponse> {
    const clientId = this.config.get<string>("META_APP_ID")?.trim();
    const clientSecret = this.config.get<string>("META_APP_SECRET")?.trim();
    if (!clientId || !clientSecret) throw new InternalServerErrorException("Faltan credenciales de Meta para WhatsApp Business");
    const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code });
    const response = await fetch(`https://graph.facebook.com/${this.graphVersion()}/oauth/access_token?${params.toString()}`);
    const data = (await response.json().catch(() => ({}))) as FacebookTokenResponse;
    if (!response.ok) throw new BadRequestException(data.error?.message || "Meta rechazó el código de WhatsApp Business");
    return data;
  }

  private async fetchFacebookPages(accessToken: string) {
    const response = await fetch(`https://graph.facebook.com/${this.graphVersion()}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(accessToken)}`);
    if (!response.ok) throw new BadRequestException("No fue posible listar las páginas de Facebook autorizadas");
    return ((await response.json().catch(() => ({}))) as FacebookPagesResponse).data ?? [];
  }

  private redirectUri() {
    return this.config.get<string>("META_INSTAGRAM_REDIRECT_URI")?.trim() || `${this.config.getOrThrow<string>("BACKEND_URL").replace(/\/$/, "")}/api/v1/meta/instagram/callback`;
  }

  private facebookRedirectUri() {
    return this.config.get<string>("META_FACEBOOK_REDIRECT_URI")?.trim() || `${this.config.getOrThrow<string>("BACKEND_URL").replace(/\/$/, "")}/api/v1/meta/facebook/callback`;
  }

  private graphVersion() {
    return this.config.get<string>("META_GRAPH_VERSION")?.trim() || "v23.0";
  }

  private organizationId(principal: AuthPrincipal) {
    if (!principal.organizationId) throw new BadRequestException("Organizacion requerida para conectar Instagram");
    return principal.organizationId;
  }

  private signState(organizationId: string) {
    const payload = Buffer.from(JSON.stringify({ organizationId, expiresAt: Date.now() + 10 * 60_000, nonce: randomBytes(16).toString("hex") })).toString("base64url");
    const signature = createHmac("sha256", this.stateSecret()).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  }

  private async organizationIdFromState(state?: string) {
    const [payload, signature, extra] = state?.trim().split(".") ?? [];
    if (!payload || !signature || extra) throw new BadRequestException("La autorizacion de Instagram expiro o no es valida. Intenta conectarla de nuevo.");
    const expected = createHmac("sha256", this.stateSecret()).update(payload).digest("base64url");
    const providedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) throw new BadRequestException("La autorizacion de Instagram no es valida. Intenta conectarla de nuevo.");
    let decoded: { organizationId?: string; expiresAt?: number };
    try { decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
    catch { throw new BadRequestException("La autorizacion de Instagram no es valida. Intenta conectarla de nuevo."); }
    if (!decoded.organizationId || !decoded.expiresAt || decoded.expiresAt < Date.now()) throw new BadRequestException("La autorizacion de Instagram expiro. Intenta conectarla de nuevo.");
    const organization = await this.prisma.organization.findFirst({ where: { id: decoded.organizationId, status: "ACTIVE" }, select: { id: true } });
    if (!organization) throw new BadRequestException("La organizacion ya no esta disponible para conectar Instagram");
    return organization.id;
  }

  private stateSecret() {
    return this.config.getOrThrow<string>("APP_ENCRYPTION_KEY");
  }

  private encrypt(value: string) {
    const key = createHash("sha256").update(this.config.getOrThrow<string>("APP_ENCRYPTION_KEY")).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
  }

  private async resolveOrganizationId(state?: string) {
    const stateId = state?.trim();
    const candidate = stateId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stateId)
      ? stateId
      : this.config.get<string>("META_ORGANIZATION_ID")?.trim();
    if (candidate) {
      const organization = await this.prisma.organization.findFirst({ where: { id: candidate, status: "ACTIVE" }, select: { id: true } });
      if (organization) return organization.id;
    }
    const organization = await this.prisma.organization.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!organization) throw new BadRequestException("No hay organizaciÃ³n activa para conectar Instagram");
    return organization.id;
  }
}
