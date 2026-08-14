import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthPrincipal } from "../../../packages/shared/src/index";
import { PrismaService } from "./prisma.service";

type ChannelKey = "INSTAGRAM" | "WHATSAPP" | "FACEBOOK";
type ChannelStatus = "NOT_CONNECTED" | "CONFIGURING" | "CONNECTED" | "CONNECTED_MOCK" | "ERROR" | "TOKEN_EXPIRED" | "PENDING";

const CHANNELS: ChannelKey[] = ["INSTAGRAM", "WHATSAPP", "FACEBOOK"];
const LABELS: Record<ChannelKey, string> = { INSTAGRAM: "Instagram", WHATSAPP: "WhatsApp", FACEBOOK: "Facebook" };

@Injectable()
export class ChannelProviderService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService, @Inject(PrismaService) private readonly prisma: PrismaService) {}

  mode() {
    return (this.config.get<string>("CHANNEL_PROVIDER_MODE") ?? "mock").toLowerCase();
  }

  list(principal: AuthPrincipal) {
    const mode = this.mode();
    if (mode === "meta") {
      return this.instagramConnection(principal.organizationId).then((instagram) => CHANNELS.map((channel) => {
        if (channel === "INSTAGRAM" && instagram) return this.item(channel, "CONNECTED", mode, instagram.username || instagram.externalAccountId || "Cuenta Instagram conectada");
        if (channel === "WHATSAPP") return this.item(channel, "PENDING", mode, "WhatsApp pendiente");
        return this.item(channel, "CONFIGURING", mode, channel === "FACEBOOK" ? "Facebook pendiente" : "Sin cuenta conectada");
      }));
    }
    return CHANNELS.map((channel, index) => this.item(channel, index === 2 ? "CONFIGURING" : "CONNECTED_MOCK", mode));
  }

  connect(channel: ChannelKey) {
    const mode = this.mode();
    if (mode === "meta") return this.item(channel, channel === "WHATSAPP" ? "PENDING" : "CONFIGURING", mode);
    return this.item(channel, "CONNECTED_MOCK", mode);
  }

  disconnect(channel: ChannelKey) {
    return this.item(channel, "NOT_CONNECTED", this.mode());
  }

  test(channel: ChannelKey) {
    const mode = this.mode();
    const status: ChannelStatus = mode === "mock" ? "CONNECTED_MOCK" : "CONFIGURING";
    return { ...this.item(channel, status, mode), ok: mode === "mock", message: mode === "mock" ? "Evento mock recibido correctamente. No se llamo a Meta." : "Proveedor real pendiente de configuracion." };
  }

  private item(channel: ChannelKey, status: ChannelStatus, mode: string, accountLabel?: string) {
    return {
      channel,
      label: LABELS[channel],
      provider: mode,
      status,
      isMock: mode === "mock",
      accountLabel: accountLabel ?? (mode === "mock" ? (channel === "INSTAGRAM" ? "@mercadia_mock" : channel === "WHATSAPP" ? "+52 55 0000 2026" : "Mercadia Mock Page") : "Sin cuenta conectada"),
      lastSyncAt: new Date().toISOString(),
      message: this.message(status),
    };
  }

  private message(status: ChannelStatus) {
    return {
      NOT_CONNECTED: "Canal no conectado.",
      CONFIGURING: "Canal listo para autorizarse con el proveedor real.",
      CONNECTED: "Canal conectado con proveedor real.",
      CONNECTED_MOCK: "Canal conectado en modo mock. No usa cuentas reales.",
      PENDING: "Canal pendiente para una fase posterior.",
      ERROR: "Canal con error de configuracion.",
      TOKEN_EXPIRED: "Token vencido. Requiere reconexion.",
    }[status];
  }

  private async instagramConnection(organizationId?: string | null) {
    if (!organizationId) return null;
    return (this.prisma as any).metaConnection.findUnique({
      where: { organizationId_provider: { organizationId, provider: "INSTAGRAM" } },
      select: { status: true, externalAccountId: true, username: true },
    }).then((connection: { status: string; externalAccountId?: string | null; username?: string | null } | null) => connection?.status === "CONNECTED" ? connection : null);
  }
}
