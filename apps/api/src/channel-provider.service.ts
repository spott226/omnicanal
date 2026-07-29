import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type ChannelKey = "INSTAGRAM" | "WHATSAPP" | "FACEBOOK";
type ChannelStatus = "NOT_CONNECTED" | "CONFIGURING" | "CONNECTED_MOCK" | "ERROR" | "TOKEN_EXPIRED";

const CHANNELS: ChannelKey[] = ["INSTAGRAM", "WHATSAPP", "FACEBOOK"];
const LABELS: Record<ChannelKey, string> = { INSTAGRAM: "Instagram", WHATSAPP: "WhatsApp", FACEBOOK: "Facebook" };

@Injectable()
export class ChannelProviderService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  mode() {
    return (this.config.get<string>("CHANNEL_PROVIDER_MODE") ?? "mock").toLowerCase();
  }

  list() {
    const mode = this.mode();
    return CHANNELS.map((channel, index) => this.item(channel, index === 2 ? "CONFIGURING" : "CONNECTED_MOCK", mode));
  }

  connect(channel: ChannelKey) {
    return this.item(channel, "CONNECTED_MOCK", this.mode());
  }

  disconnect(channel: ChannelKey) {
    return this.item(channel, "NOT_CONNECTED", this.mode());
  }

  test(channel: ChannelKey) {
    const mode = this.mode();
    const status: ChannelStatus = mode === "mock" ? "CONNECTED_MOCK" : "CONFIGURING";
    return { ...this.item(channel, status, mode), ok: mode === "mock", message: mode === "mock" ? "Evento mock recibido correctamente. No se llamo a Meta." : "Proveedor real pendiente de configuracion." };
  }

  private item(channel: ChannelKey, status: ChannelStatus, mode: string) {
    return {
      channel,
      label: LABELS[channel],
      provider: mode,
      status,
      isMock: mode === "mock",
      accountLabel: channel === "INSTAGRAM" ? "@mercadia_mock" : channel === "WHATSAPP" ? "+52 55 0000 2026" : "Mercadia Mock Page",
      lastSyncAt: new Date().toISOString(),
      message: this.message(status),
    };
  }

  private message(status: ChannelStatus) {
    return {
      NOT_CONNECTED: "Canal no conectado.",
      CONFIGURING: "Canal en configuracion mock.",
      CONNECTED_MOCK: "Canal conectado en modo mock. No usa cuentas reales.",
      ERROR: "Canal con error de configuracion.",
      TOKEN_EXPIRED: "Token vencido. Requiere reconexion.",
    }[status];
  }
}
