import { BadRequestException, Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma.service";

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

@Injectable()
export class MetaOAuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(ConfigService) private readonly config: ConfigService) {}

  async completeInstagramLogin(input: { code?: string; error?: string; errorDescription?: string; state?: string; redirectUri?: string }) {
    if (input.error) throw new BadRequestException(input.errorDescription || input.error);
    const code = input.code?.trim();
    if (!code) throw new BadRequestException("Instagram no devolviÃ³ cÃ³digo de autorizaciÃ³n");

    const organizationId = await this.resolveOrganizationId(input.state);
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

  async status() {
    const organizationId = await this.resolveOrganizationId();
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

  private redirectUri() {
    return this.config.get<string>("META_INSTAGRAM_REDIRECT_URI")?.trim() || `${this.config.getOrThrow<string>("BACKEND_URL").replace(/\/$/, "")}/api/v1/meta/instagram/callback`;
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
