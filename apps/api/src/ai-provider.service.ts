import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type SimulateInput = {
  agentName: string;
  businessName: string;
  prompt: string;
  message: string;
  turn: number;
};

@Injectable()
export class AIProviderService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  mode() {
    return (this.config.get<string>("AI_PROVIDER_MODE") ?? "mock").toLowerCase();
  }

  simulate(input: SimulateInput) {
    const mode = this.mode();
    const text = input.message.toLowerCase();
    const agentName = input.agentName || "Nia";
    const businessName = input.businessName || "tu negocio";
    let reply: string;

    if (mode !== "mock") {
      reply = "El proveedor real de IA aun no esta habilitado. Cambia AI_PROVIDER_MODE a mock o configura la integracion real en su fase.";
    } else if (input.turn <= 0 || text.includes("hola")) {
      reply = `Gracias por contactar a ${businessName}. Soy ${agentName}, tu asistente virtual. ¿Te gustaria ver como funciona en una videollamada breve?`;
    } else if (text.includes("si") || text.includes("sí") || text.includes("videollamada") || text.includes("demo")) {
      reply = "Perfecto. Para prepararla bien, dime cuantos mensajes o conversaciones atienden al mes aproximadamente.";
    } else {
      reply = "Listo. Con esa informacion podemos recomendarte un flujo simple para centralizar mensajes, responder mas rapido y no perder prospectos.";
    }

    return {
      provider: mode,
      model: mode === "mock" ? "nexo-mock-v1" : "pending-real-provider",
      agentName,
      reply,
      safety: {
        source: "prompt",
        applied: Boolean(input.prompt),
      },
    };
  }
}
