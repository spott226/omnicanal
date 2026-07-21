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

test("renderiza el acceso demo de NexoIA", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>NexoIA — Atención que convierte<\/title>/i);
  assert.match(html, /Inicia sesión en NexoIA/);
  assert.match(html, /demo@nexoia\.mx/);
  assert.match(html, /Acceso de demostración/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("incluye los flujos críticos de la preview", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  for (const label of ["Resumen", "Conversaciones", "Contactos", "Automatizaciones", "Agente de IA", "Laboratorio", "Estadísticas", "Canales", "Configuración"]) assert.match(app, new RegExp(label));
  assert.match(app, /initialConversations/);
  assert.match(app, /Proveedor simulado/);
  assert.match(app, /Agendar videollamada/);
  assert.match(app, /Modo demostración/);
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

test("el restablecimiento demo solicita confirmación", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  assert.match(app, /window\.confirm\("¿Restablecer todos los datos de demostración\?/);
  assert.match(app, /Datos de demostración restablecidos/);
});
