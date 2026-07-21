import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
