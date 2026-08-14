import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
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
      return Promise.all([this.connection(principal.organizationId, "INSTAGRAM"), this.connection(principal.organizationId, "FACEBOOK"), this.connection(principal.organizationId, "WHATSAPP")]).then(([instagram, facebook, whatsapp]) => CHANNELS.map((channel) => {
          const connection = channel === "INSTAGRAM" ? instagram : channel === "FACEBOOK" ? facebook : whatsapp;
          if (connection) return this.item(channel, "CONNECTED", mode, connection.username || connection.externalAccountId || `${LABELS[channel]} conectado`);
          if (channel === "WHATSAPP") return this.item(channel, "PENDING", mode, "Requiere plan activo y registro integrado de WhatsApp Business.");
          return this.item(channel, "CONFIGURING", mode, `Autoriza ${LABELS[channel]} con la cuenta de este negocio.`);
        }));
    }
    return CHANNELS.map((channel, index) => this.item(channel, index === 2 ? "CONFIGURING" : "CONNECTED_MOCK", mode));
  }

  async connect(principal: AuthPrincipal, channel: ChannelKey) {
    const mode = this.mode();
    if (mode === "meta" && channel === "WHATSAPP") {
      await this.requireActivePlan(principal);
      const configId = this.config.get<string>("META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID")?.trim();
      if (!configId) {
        return this.item(channel, "CONFIGURING", mode, "Plan activo. Falta habilitar el registro integrado de WhatsApp en Meta.");
      }
      return this.item(channel, "CONFIGURING", mode, "Plan activo. Abre el registro integrado de Meta para vincular el numero de WhatsApp Business.");
    }
    if (mode === "meta") return this.item(channel, "CONFIGURING", mode);
    return this.item(channel, "CONNECTED_MOCK", mode);
  }

  async disconnect(principal: AuthPrincipal, channel: ChannelKey) {
    if (this.mode() === "meta" && principal.organizationId) {
      await (this.prisma as any).metaConnection.deleteMany({ where: { organizationId: principal.organizationId, provider: channel } });
    }
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

  private async connection(organizationId: string | null | undefined, provider: ChannelKey) {
    if (!organizationId) return null;
    return (this.prisma as any).metaConnection.findUnique({
      where: { organizationId_provider: { organizationId, provider } },
      select: { status: true, externalAccountId: true, username: true },
    }).then((connection: { status: string; externalAccountId?: string | null; username?: string | null } | null) => connection?.status === "CONNECTED" ? connection : null);
  }

  private async requireActivePlan(principal: AuthPrincipal) {
    if (!principal.organizationId) throw new ForbiddenException("Organizacion requerida para conectar WhatsApp Business");
    const subscription = await (this.prisma as any).subscription.findFirst({
      where: { organizationId: principal.organizationId },
      orderBy: { createdAt: "desc" },
      include: { planPrice: true },
    });
    if (!subscription || subscription.status !== "ACTIVE") {
      throw new ForbiddenException("WhatsApp Business requiere un plan activo. Elige un plan y completa el pago antes de preparar la conexion.");
    }
    if ((subscription.planPrice?.channelsLimit ?? 0) < 1) {
      throw new ForbiddenException("Tu plan no incluye canales. Actualiza tu plan antes de conectar WhatsApp Business.");
    }
    return subscription;
  }
}
