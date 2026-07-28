import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CHANNEL_DATA, DAILY_CHANNELS, DEMO_AUTOMATIONS, FUNNEL, channelPercentageTotal, hasNegativeDailyValue, hotLeadToAppointmentRate, newLeadToAppointmentRate } from "../app/demo-data.ts";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("renderiza el acceso conectado de next.io", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>next\.io by Mercadia — AI customer ops<\/title>/i);
  assert.match(html, /Inicia sesión en next\.io/);
  assert.doesNotMatch(html, /demo@nexoia\.local|NexoDemo2026!/);
  assert.match(html, /autoComplete="off"/);
  assert.match(html, /Acceso conectado/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("el inicio de sesión no permite entrar mediante un fallback local", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  assert.match(app, /await api\.login\(email,password\); setLoggedIn\(true\)/);
  assert.match(app, /await api\.logout\(\)/);
  assert.match(app, /Cerrar sesión/);
  assert.doesNotMatch(app, /setRuntimeMode\("demo"\)/);
  assert.doesNotMatch(app, /useState\("demo@nexoia\.local"\)|useState\("NexoDemo2026!"\)/);
  assert.doesNotMatch(app, /esta cuenta conserva la demo local/);
});

test("incluye los flujos críticos de la preview", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  for (const label of ["Resumen", "Conversaciones", "Contactos", "Knowledge Base", "Automatizaciones", "Agente de IA", "Laboratorio", "Estadísticas", "Canales", "Configuración"]) assert.match(app, new RegExp(label));
  assert.match(app, /initialConversations/);
  assert.match(app, /Proveedor simulado/);
  assert.match(app, /Agendar videollamada/);
  assert.match(app, /Modo demostración/);
});

test("incluye UI y cliente API para Knowledge Base", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  const apiClient = await readFile(new URL("../app/api-client.ts", import.meta.url), "utf8");
  for (const label of ["FAQs", "Productos", "Servicios", "Promociones", "Horarios", "Políticas"]) assert.match(app, new RegExp(label));
  assert.match(app, /knowledgeConfig/);
  assert.match(apiClient, /knowledgeList/);
  assert.match(apiClient, /knowledgeCreate/);
  assert.match(apiClient, /knowledgeUpdate/);
  assert.match(apiClient, /knowledgeDelete/);
});

test("incluye facturación, trial de 7 días y preparación de Stripe", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  const apiClient = await readFile(new URL("../app/api-client.ts", import.meta.url), "utf8");
  assert.match(app, /PRUEBA ACTIVA DE 7 DÍAS/);
  assert.match(app, /Stripe Checkout/);
  assert.match(app, /billingCheckout/);
  assert.match(apiClient, /billingPlans/);
  assert.match(apiClient, /billingSubscription/);
  assert.match(apiClient, /billingUsage/);
});

test("mantiene métricas y embudo matemáticamente consistentes", () => {
  assert.equal(channelPercentageTotal, 100);
  assert.equal(Object.values(CHANNEL_DATA).reduce((sum, channel) => sum + channel.count, 0), 1284);
  assert.equal(newLeadToAppointmentRate, 3.5);
  assert.equal(hotLeadToAppointmentRate, 13.5);
  assert.deepEqual(FUNNEL.map(stage => stage.value), [...FUNNEL].map(stage => stage.value).sort((a,b)=>b-a));
});

test("la gráfica solo recibe segmentos positivos que suman su total", () => {
  assert.equal(hasNegativeDailyValue, false);
  assert.equal(DAILY_CHANNELS.length, 14);
  for (const day of DAILY_CHANNELS) assert.equal(day.instagram + day.whatsapp + day.facebook, day.total);
});

test("incluye filtros y acciones interactivas de conversaciones", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  for (const value of ["IA activa", "Pausadas", "Humano", "Con cita", "Clasificación cambiada", "Recordatorio programado", "Nota guardada"]) assert.match(app, new RegExp(value));
  assert.match(app, /transferred:!active\.transferred/);
  assert.match(app, /ai:!active\.ai/);
  assert.match(app, /organizationId:"org_aurea_labs_demo"/);
});

test("incluye prompt, laboratorio contextual y automatización VIP", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  assert.match(app, /Prompt general/);
  assert.match(app, /tokens aproximados/);
  assert.match(app, /userTurns/);
  assert.match(app, /Simulación completada/);
  assert.ok(DEMO_AUTOMATIONS.some(rule => rule.trigger.includes("VIP") && rule.action === "Enviar mensaje privado"));
});

test("la sesión visual permanece conectada a datos persistentes", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  assert.match(app, /Datos persistentes · API/);
  assert.doesNotMatch(app, /Restablecer todos los datos de demostración/);
});
