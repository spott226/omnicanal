import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type SimulateInput = {
  agentName: string;
  businessName: string;
  prompt: string;
  knowledgeContext?: string;
  message: string;
  turn: number;
};

@Injectable()
export class AIProviderService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  mode() {
    return (this.config.get<string>("AI_PROVIDER_MODE") ?? "mock").toLowerCase();
  }

  async simulate(input: SimulateInput) {
    const mode = this.mode();
    const text = input.message.toLowerCase();
    const agentName = input.agentName || "Nia";
    const businessName = input.businessName || "tu negocio";

    if (mode === "openai") {
      return this.openai(input, agentName, businessName);
    }
    if (mode === "deepseek") {
      return this.deepseek(input, agentName, businessName);
    }
    if (mode === "local") {
      return this.local(input, agentName, businessName);
    }

    let reply: string;
    if (input.turn <= 0 || text.includes("hola")) {
      reply = `Gracias por contactar a ${businessName}. Soy ${agentName}, tu asistente virtual. Te puedo ayudar a resolver dudas, calificar tu necesidad o agendar el siguiente paso.`;
    } else if (text.includes("si") || text.includes("sí") || text.includes("videollamada")) {
      reply = "Perfecto. Para prepararla bien, dime cuantos mensajes o conversaciones atienden al mes aproximadamente.";
    } else {
      reply = "Listo. Con esa informacion podemos recomendarte un flujo simple para centralizar mensajes, responder mas rapido y no perder prospectos.";
    }

    return {
      provider: mode,
      model: "local-test",
      agentName,
      reply,
      safety: {
        source: "prompt",
        applied: Boolean(input.prompt),
      },
    };
  }

  private async openai(input: SimulateInput, agentName: string, businessName: string) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY")?.trim();
    if (!apiKey) {
      return {
        provider: "openai",
        model: "sin-configurar",
        agentName,
        reply: "OpenAI no esta configurado. Agrega OPENAI_API_KEY, deja AI_PROVIDER_MODE=openai y reinicia la API.",
        safety: { source: "configuration", applied: false },
      };
    }

    const model = this.config.get<string>("OPENAI_MODEL")?.trim() || "gpt-5";
    const instructions = [
      `Eres ${agentName}, asistente virtual de ${businessName}.`,
      "Responde en espanol claro, directo y comercial.",
      "No inventes precios, horarios, promociones ni integraciones no configuradas.",
      "Usa la informacion real del negocio cuando este disponible. Si el dato no esta en el contexto, dilo y pide el dato faltante.",
      "El cliente puede escribir mal, con slang o incompleto. Interpreta intención comercial y busca coincidencias aproximadas en productos, servicios, FAQs, promociones, horarios y politicas.",
      "Si pregunta 'cuanto', 'precio', 'sale', 'costo', 'vale', 'hay', 'tienen', 'manejan' o escribe solo parte del nombre, revisa primero el catalogo del contexto.",
      "Si hay una coincidencia probable, responde con esa opcion y confirma. Si hay varias opciones, muestra maximo 3 y pregunta cual quiere.",
      "Si falta informacion, pregunta un dato concreto para avanzar.",
      "Maximo 3 oraciones.",
      input.prompt ? `Instrucciones del negocio: ${input.prompt}` : "",
      input.knowledgeContext ? `Contexto real del negocio:\n${input.knowledgeContext}` : "",
    ].filter(Boolean).join("\n");

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          instructions,
          input: input.message,
          max_output_tokens: 220,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof payload?.error?.message === "string" ? payload.error.message : "No fue posible generar respuesta con OpenAI.";
        throw new Error(message);
      }
      const reply = typeof payload?.output_text === "string" && payload.output_text.trim()
        ? payload.output_text.trim()
        : this.extractText(payload) || "No se genero texto. Intenta de nuevo.";
      return {
        provider: "openai",
        model,
        agentName,
        reply,
        safety: { source: "openai", applied: Boolean(input.prompt) },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      return {
        provider: "openai",
        model,
        agentName,
        reply: `No pude conectar con OpenAI: ${message}`,
        safety: { source: "openai_error", applied: false },
      };
    }
  }

  private async deepseek(input: SimulateInput, agentName: string, businessName: string) {
    const apiKey = this.config.get<string>("DEEPSEEK_API_KEY")?.trim();
    if (!apiKey) {
      return {
        provider: "deepseek",
        model: "sin-configurar",
        agentName,
        reply: "DeepSeek no esta configurado. Agrega DEEPSEEK_API_KEY, deja AI_PROVIDER_MODE=deepseek y reinicia la API.",
        safety: { source: "configuration", applied: false },
      };
    }

    const model = this.config.get<string>("DEEPSEEK_MODEL")?.trim() || "deepseek-v4-flash";
    const system = [
      `Eres ${agentName}, asistente virtual de ${businessName}.`,
      "Responde en espanol claro, directo y comercial.",
      "No inventes precios, horarios, promociones ni integraciones no configuradas.",
      "Usa la informacion real del negocio cuando este disponible. Si el dato no esta en el contexto, dilo y pide el dato faltante.",
      "El cliente puede escribir mal, con slang o incompleto. Interpreta intención comercial y busca coincidencias aproximadas en productos, servicios, FAQs, promociones, horarios y politicas.",
      "Si pregunta 'cuanto', 'precio', 'sale', 'costo', 'vale', 'hay', 'tienen', 'manejan' o escribe solo parte del nombre, revisa primero el catalogo del contexto.",
      "Si hay una coincidencia probable, responde con esa opcion y confirma. Si hay varias opciones, muestra maximo 3 y pregunta cual quiere.",
      "Si falta informacion, pregunta un dato concreto para avanzar.",
      "Maximo 3 oraciones.",
      input.prompt ? `Instrucciones del negocio: ${input.prompt}` : "",
      input.knowledgeContext ? `Contexto real del negocio:\n${input.knowledgeContext}` : "",
    ].filter(Boolean).join("\n");

    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: input.message },
          ],
          max_tokens: 220,
          stream: false,
          thinking: { type: "disabled" },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof payload?.error?.message === "string" ? payload.error.message : "No fue posible generar respuesta con DeepSeek.";
        throw new Error(message);
      }
      const reply = payload?.choices?.[0]?.message?.content?.trim() || "No se genero texto. Intenta de nuevo.";
      return {
        provider: "deepseek",
        model,
        agentName,
        reply,
        safety: { source: "deepseek", applied: Boolean(input.prompt) },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      return {
        provider: "deepseek",
        model,
        agentName,
        reply: `No pude conectar con DeepSeek: ${message}`,
        safety: { source: "deepseek_error", applied: false },
      };
    }
  }

  private async local(input: SimulateInput, agentName: string, businessName: string) {
    const baseUrl = (this.config.get<string>("LOCAL_AI_BASE_URL")?.trim() || "http://localhost:11434").replace(/\/+$/, "");
    const model = this.config.get<string>("LOCAL_AI_MODEL")?.trim() || "qwen2.5:3b";
    const system = [
      `Eres ${agentName}, asistente virtual de ${businessName}.`,
      "Responde siempre en espanol claro, directo y comercial.",
      "No inventes precios, horarios, promociones ni integraciones no configuradas.",
      "Usa la informacion real del negocio cuando este disponible. Si el dato no esta en el contexto, dilo y pide el dato faltante.",
      "El cliente puede escribir mal, con slang o incompleto. Interpreta intención comercial y busca coincidencias aproximadas en productos, servicios, FAQs, promociones, horarios y politicas.",
      "Si pregunta 'cuanto', 'precio', 'sale', 'costo', 'vale', 'hay', 'tienen', 'manejan' o escribe solo parte del nombre, revisa primero el catalogo del contexto.",
      "Si hay una coincidencia probable, responde con esa opcion y confirma. Si hay varias opciones, muestra maximo 3 y pregunta cual quiere.",
      "Si falta informacion, pregunta un dato concreto para avanzar.",
      "Maximo 3 oraciones.",
      input.prompt ? `Instrucciones del negocio: ${input.prompt}` : "",
      input.knowledgeContext ? `Contexto real del negocio:\n${input.knowledgeContext}` : "",
    ].filter(Boolean).join("\n");

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: "system", content: system },
            { role: "user", content: input.message },
          ],
          options: { temperature: 0.3, num_predict: 220 },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof payload?.error === "string" ? payload.error : "Ollama no pudo generar respuesta.";
        throw new Error(message);
      }
      const reply = typeof payload?.message?.content === "string" && payload.message.content.trim()
        ? payload.message.content.trim()
        : "No se genero texto. Intenta de nuevo.";
      return {
        provider: "local",
        model,
        agentName,
        reply,
        safety: { source: "ollama", applied: Boolean(input.prompt) },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      return {
        provider: "local",
        model,
        agentName,
        reply: `No pude conectar con Ollama local: ${message}. Verifica que Ollama este abierto y que el modelo ${model} este instalado.`,
        safety: { source: "ollama_error", applied: false },
      };
    }
  }

  private extractText(payload: any) {
    const parts = payload?.output?.flatMap((item: any) => item?.content ?? []) ?? [];
    return parts.map((part: any) => part?.text).filter(Boolean).join("\n").trim();
  }
}
