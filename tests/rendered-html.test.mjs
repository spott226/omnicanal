import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("renderiza pagina publica profesional de next.io", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>next\.io by Mercadia/i);
  assert.match(html, /SAAS OMNICANAL CON IA/);
  assert.match(html, /Empezar prueba gratis/);
  assert.match(html, /Servicios/);
  assert.match(html, /Precios/);
  assert.doesNotMatch(html, /demo@nexoia\.local|NexoDemo2026!|Your site is taking shape/);
});

test("login, registro y recuperacion usan API real", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  const apiClient = await readFile(new URL("../app/api-client.ts", import.meta.url), "utf8");
  assert.match(app, /await api\.login\(email,password,remember\); setLoggedIn\(true\)/);
  assert.match(app, /await api\.register\(data\); setLoggedIn\(true\)/);
  assert.match(app, /await api\.logout\(\)/);
  assert.match(app, /Olvid/);
  assert.match(apiClient, /forgotPassword/);
  assert.match(apiClient, /resetPassword/);
  assert.doesNotMatch(apiClient, /aurea-labs-demo/);
  assert.doesNotMatch(app, /demo@nexoia\.local|NexoDemo2026!|setRuntimeMode\("demo"\)/);
});

test("mantiene menu MVP y pantallas publicas", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  for (const label of ["Inicio", "Conversaciones", "Contactos", "Entrenar IA", "Base de conocimiento", "Productos y servicios", "Conexiones", "Equipo", "Plan y facturación", "Configuración"]) assert.match(app, new RegExp(label));
  for (const label of ["PublicSite", "Servicios", "Precios", "Empezar prueba gratis"]) assert.match(app, new RegExp(label));
});

test("incluye UI y cliente API para Knowledge Base", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  const apiClient = await readFile(new URL("../app/api-client.ts", import.meta.url), "utf8");
  for (const label of ["FAQs", "Productos", "Servicios", "Promociones", "Horarios", "Políticas"]) assert.match(app, new RegExp(label));
  assert.match(apiClient, /knowledgeList/);
  assert.match(apiClient, /knowledgeCreate/);
  assert.match(apiClient, /knowledgeUpdate/);
  assert.match(apiClient, /knowledgeDelete/);
  assert.match(app, /await load\(kind,""\)/);
  assert.match(app, /setSearch\(""\);setKind\(item\)/);
  assert.match(app, /Nuevo \{config\.singular \?\? config\.label\}/);
});

test("incluye facturacion, trial de 7 dias y preparacion de Stripe", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  const apiClient = await readFile(new URL("../app/api-client.ts", import.meta.url), "utf8");
  assert.match(app, /PRUEBA ACTIVA/);
  assert.match(app, /Checkout Stripe/);
  assert.match(app, /billingCheckout/);
  assert.match(apiClient, /billingPlans/);
  assert.match(apiClient, /billingSubscription/);
  assert.match(apiClient, /billingUsage/);
});

test("inicio y estadisticas no dependen de datos inventados", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  assert.match(app, /const initialConversations: Conversation\[\] = \[\]/);
  assert.match(app, /conversations = realMetrics\?\.conversations \?\? 0/);
  assert.match(app, /Sin actividad/);
  assert.doesNotMatch(app, /DEMO_METRICS|DAILY_CHANNELS|CHANNEL_DATA|org_aurea_labs_demo|Mariana|Carlos alcanz/);
});

test("conversaciones conservan filtros y acciones interactivas", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  for (const value of ["IA activa", "Pausadas", "Humano", "Con cita", "Clasificación cambiada", "Recordatorio programado", "Nota guardada"]) assert.match(app, new RegExp(value));
  assert.match(app, /transferred:!active\.transferred/);
  assert.match(app, /ai:!active\.ai/);
});

test("equipo y canales usan API sin cuentas ficticias", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  assert.match(app, /api\.teamMembers/);
  assert.match(app, /api\.teamInvite/);
  assert.match(app, /api\.channels/);
  assert.match(app, /Sin cuenta conectada/);
  assert.doesNotMatch(app, /mercadia_mock|Mercadia Mock Page|\+52 55 0000 2026/);
});

test("laboratorio y prompt no usan negocio ficticio", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  assert.match(app, /Prompt general/);
  assert.match(app, /tokens aproximados/);
  assert.match(app, /Sin configurar/);
  assert.doesNotMatch(app, /Áurea Labs|aurealabs|Proveedor simulado|Datos simulados/);
});

test("la sesion visual permanece conectada a datos persistentes", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  assert.match(app, /Datos reales/);
  assert.doesNotMatch(app, /Restablecer todos los datos de demostraci/);
});

test("la interfaz no contiene residuos de codificacion rota", async () => {
  const app = await readFile(new URL("../app/NexoApp.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(app, /Ã|Â|â|ð|ï¼|localstrativa|localstraci|ficticia|ficticio/);
  assert.doesNotMatch(css, /Ã|Â|â|ð|ï¼/);
});
