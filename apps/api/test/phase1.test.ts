/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hash } from "bcryptjs";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "../src/auth.service";
import { AIProviderService } from "../src/ai-provider.service";
import { ChannelProviderService } from "../src/channel-provider.service";
import { validateEnvironment } from "../src/config";
import { HealthController } from "../src/health.controller";
import { ResourceService, safePercentage } from "../src/resource.service";
import { SubscriptionGuard, TenantGuard } from "../src/security";
import { roleAllows, type AuthPrincipal } from "../../../packages/shared/src/index";

const principalA: AuthPrincipal = { userId: "user-a", sessionId: "session-a", organizationId: "org-a", role: "ORGANIZATION_ADMIN", email: "a@nexoia.local", name: "Admin A" };

test("valida variables obligatorias y rechaza secretos débiles", () => {
  assert.throws(() => validateEnvironment({ DATABASE_URL: "postgresql://x", REDIS_URL: "redis://x", JWT_SECRET: "short" }));
  const env = validateEnvironment({ DATABASE_URL: "postgresql://nexoia:nexoia@localhost:5432/nexoia", REDIS_URL: "redis://localhost:6379", JWT_SECRET: "x".repeat(32), SESSION_SECRET: "y".repeat(32), APP_ENCRYPTION_KEY: "z".repeat(32), FRONTEND_URL: "http://localhost:3000", BACKEND_URL: "http://localhost:3001", CORS_ORIGIN: "http://localhost:3000" });
  assert.equal(env.PORT, 3001);
  assert.equal(env.AI_PROVIDER_MODE, "mock");
  assert.equal(env.CHANNEL_PROVIDER_MODE, "mock");
  assert.equal(env.BILLING_PROVIDER_MODE, "mock");
  const realModes = validateEnvironment({ DATABASE_URL: "postgresql://nexoia:nexoia@localhost:5432/nexoia", REDIS_URL: "redis://localhost:6379", JWT_SECRET: "x".repeat(32), SESSION_SECRET: "y".repeat(32), APP_ENCRYPTION_KEY: "z".repeat(32), FRONTEND_URL: "http://localhost:3000", BACKEND_URL: "http://localhost:3001", CORS_ORIGIN: "http://localhost:3000", AI_PROVIDER_MODE: "openai", CHANNEL_PROVIDER_MODE: "meta", BILLING_PROVIDER_MODE: "stripe" });
  assert.equal(realModes.AI_PROVIDER_MODE, "openai");
  assert.equal(realModes.CHANNEL_PROVIDER_MODE, "meta");
  assert.equal(realModes.BILLING_PROVIDER_MODE, "stripe");
  const localMode = validateEnvironment({ DATABASE_URL: "postgresql://nexoia:nexoia@localhost:5432/nexoia", REDIS_URL: "redis://localhost:6379", JWT_SECRET: "x".repeat(32), SESSION_SECRET: "y".repeat(32), APP_ENCRYPTION_KEY: "z".repeat(32), FRONTEND_URL: "http://localhost:3000", BACKEND_URL: "http://localhost:3001", CORS_ORIGIN: "http://localhost:3000", AI_PROVIDER_MODE: "local" });
  assert.equal(localMode.AI_PROVIDER_MODE, "local");
  assert.equal(localMode.LOCAL_AI_BASE_URL, "http://localhost:11434");
  assert.equal(localMode.LOCAL_AI_MODEL, "qwen2.5:3b");
});

test("backend no bloquea crear contactos por limite de conversaciones", async () => {
  const fake: any = {
    subscription: { findFirst: async () => ({ planPrice: { monthlyContactsLimit: 1 } }) },
    contact: { create: async ({ data }: any) => data },
  };
  const service = new ResourceService(fake);
  const result = await service.createContact(principalA, { firstName: "Nuevo" });
  assert.equal(result.firstName, "Nuevo");
});

test("equipo crea membresias persistentes y respeta limite de usuarios", async () => {
  const created: any[] = [];
  const fake: any = {
    subscription: { findFirst: async () => ({ planPrice: { seatsLimit: 2 } }) },
    membership: {
      count: async () => 1,
    },
    $transaction: async (callback: any) => callback({
      user: {
        findUnique: async () => null,
        create: async ({ data }: any) => ({ id: "user-team", ...data }),
      },
      membership: {
        findUnique: async () => null,
        create: async ({ data }: any) => { created.push(data); return { id: "membership-team", ...data, user: { id: data.userId, name: "Agente", email: "agente@mercadia.local", status: "ACTIVE", createdAt: new Date() } }; },
      },
      auditLog: { create: async () => ({}) },
    }),
  };
  const service = new ResourceService(fake);
  const member = await service.inviteMember(principalA, { name: "Agente", email: "agente@mercadia.local", role: "AGENT" });
  assert.equal(member.role, "AGENT");
  assert.equal(created[0].organizationId, "org-a");
  assert.match(member.temporaryPassword, /^Next-/);
});

test("conversaciones permiten tomar, devolver a IA y cerrar con auditoria", async () => {
  const updates: any[] = [];
  const auditLogs: any[] = [];
  const messages: any[] = [];
  const tx: any = {
    message: { create: async ({ data }: any) => { const row = { id: `msg-${messages.length + 1}`, createdAt: new Date(), ...data }; messages.push(row); return row; } },
    conversation: { update: async ({ data }: any) => { updates.push(data); return data; }, findFirstOrThrow: async () => ({ id: "conversation-a", organizationId: "org-a", aiStatus: updates.at(-1)?.aiStatus, status: updates.at(-1)?.status, contact: { firstName: "Mariana", leadTemperature: "HOT", leadScore: 90, tags: [] }, messages, appointments: [], reminders: [] }) },
    auditLog: { create: async ({ data }: any) => { auditLogs.push(data); return data; } },
  };
  const fake: any = {
    conversation: { findFirst: async ({ where }: any) => where.organizationId === "org-a" ? { id: "conversation-a" } : null },
    $transaction: async (callback: any) => callback(tx),
  };
  const service = new ResourceService(fake);
  assert.equal((await service.takeConversation(principalA, "conversation-a")).aiStatus, "TRANSFERRED");
  assert.equal((await service.returnConversationToAi(principalA, "conversation-a")).aiStatus, "ACTIVE");
  assert.equal((await service.closeConversation(principalA, "conversation-a")).status, "CLOSED");
  assert.deepEqual(auditLogs.map(log => log.action), ["CONVERSATION_TAKEN", "CONVERSATION_RETURNED_TO_AI", "CONVERSATION_CLOSED"]);
  assert.equal(messages.length, 3);
});

test("conversaciones normaliza paginacion aunque llegue incompleta", async () => {
  const calls: any[] = [];
  const fake: any = {
    conversation: {
      findMany: async (args: any) => { calls.push(args); return []; },
      count: async () => 0,
    },
  };
  const service = new ResourceService(fake);
  const result = await service.conversations(principalA, { page: undefined, pageSize: undefined, sort: "desc" } as any);
  assert.equal(result.total, 0);
  assert.equal(calls[0].skip, 0);
  assert.equal(calls[0].take, 25);
});

test("proveedor IA mock responde con configuracion del negocio", async () => {
  const service = new AIProviderService({ get: () => "mock" } as any);
  const result = await service.simulate({ agentName: "Nia", businessName: "Mercadia Ops", prompt: "Haz una pregunta por mensaje", message: "hola", turn: 0 });
  assert.equal(result.provider, "mock");
  assert.equal(result.model, "local-test");
  assert.match(result.reply, /Mercadia Ops/);
  assert.match(result.reply, /Nia/);
});

test("proveedor IA local usa Ollama sin claves pagadas", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedBody: any;
  globalThis.fetch = (async (url: any, init: any) => {
    requestedUrl = String(url);
    requestedBody = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ message: { content: "Respuesta local de prueba" } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as any;
  try {
    const config = { get: (key: string) => ({ AI_PROVIDER_MODE: "local", LOCAL_AI_BASE_URL: "http://localhost:11434", LOCAL_AI_MODEL: "qwen2.5:3b" } as Record<string, string>)[key] } as any;
    const result = await new AIProviderService(config).simulate({ agentName: "Nia", businessName: "Mercadia Ops", prompt: "Usa contexto", message: "hola", turn: 0 });
    assert.equal(requestedUrl, "http://localhost:11434/api/chat");
    assert.equal(requestedBody.model, "qwen2.5:3b");
    assert.equal(result.provider, "local");
    assert.equal(result.reply, "Respuesta local de prueba");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("simulador de IA alimenta el modelo con conocimiento real del negocio", async () => {
  const captured: any[] = [];
  const fake: any = {
    organization: { findUniqueOrThrow: async () => ({ name: "Spa Luna", timezone: "America/Mexico_City", industry: "Spa", website: "https://spaluna.mx", description: "Spa de masajes y faciales" }) },
    prompt: { findFirst: async () => ({ agentName: "Sofia", publishedVersion: { content: "Responde breve y agenda cuando aplique" }, versions: [] }) },
    faq: { findMany: async () => [{ question: "¿Aceptan tarjeta?", answer: "Sí, aceptamos tarjeta y transferencia." }] },
    product: { findMany: async () => [{ sku: "CREMA-01", name: "Crema hidratante", description: "Crema facial", price: { toString: () => "450" }, currency: "MXN" }] },
    service: { findMany: async () => [{ code: "MASAJE-60", name: "Masaje relajante", description: "Sesión relajante", price: { toString: () => "900" }, currency: "MXN", durationMinutes: 60 }] },
    promotion: { findMany: async () => [{ code: "BIENVENIDA", name: "Promo bienvenida", description: "10% en primera cita", discountType: "PERCENTAGE", discountValue: { toString: () => "10" }, startsAt: new Date("2026-01-01T00:00:00.000Z"), endsAt: new Date("2026-12-31T00:00:00.000Z") }] },
    businessSchedule: { findMany: async () => [{ name: "Horario principal", timezone: "America/Mexico_City", entries: [{ dayOfWeek: "MONDAY", opensAt: "09:00", closesAt: "18:00", closed: false }] }] },
    policy: { findMany: async () => [{ type: "CUSTOM", title: "Citas", content: "Llega 10 minutos antes de tu cita.", version: 1 }] },
  };
  const aiProvider: any = { simulate: async (input: any) => { captured.push(input); return { provider: "local", model: "qwen2.5:3b", agentName: input.agentName, reply: "ok" }; } };
  await new ResourceService(fake, aiProvider).simulateAi(principalA, { message: "¿Que servicios tienen?", turn: 0 });
  assert.match(captured[0].knowledgeContext, /Spa Luna/);
  assert.match(captured[0].knowledgeContext, /Masaje relajante/);
  assert.match(captured[0].knowledgeContext, /Crema hidratante/);
  assert.match(captured[0].knowledgeContext, /10 minutos antes/);
  assert.match(captured[0].knowledgeContext, /Horario principal/);
});

test("proveedor de canales mock no llama Meta y expone estados claros", () => {
  const service = new ChannelProviderService({ get: () => "mock" } as any);
  const channels = service.list();
  assert.equal(channels.length, 3);
  assert.equal(channels[0].provider, "mock");
  assert.equal(channels[0].isMock, true);
  const result = service.test("INSTAGRAM");
  assert.equal(result.ok, true);
  assert.match(result.message, /No se llamo a Meta/);
});

test("login correcto crea sesión y login incorrecto falla", async () => {
  const passwordHash = await hash("NexoDemo2026!", 4);
  const fake: any = { user: { findUnique: async ({ where }: any) => where.email === "demo@nexoia.local" ? { id: "u1", email: where.email, name: "Laura", status: "ACTIVE", passwordHash, memberships: [{ role: "ORGANIZATION_ADMIN", organizationId: "o1", organization: { id: "o1", slug: "aurea-labs-demo", status: "ACTIVE" } }] } : null }, session: { create: async ({ data }: any) => data } };
  const config: any = { getOrThrow: (key: string) => key === "JWT_SECRET" ? "x".repeat(32) : "http://localhost:3000", get: () => "test" };
  const service = new AuthService(fake, new JwtService(), config);
  const cookies: string[] = []; const response: any = { cookie: (name: string) => cookies.push(name) };
  const result = await service.login({ email: "demo@nexoia.local", password: "NexoDemo2026!", organizationSlug: "aurea-labs-demo" }, response);
  assert.equal(result.role, "ORGANIZATION_ADMIN"); assert.deepEqual(cookies, ["nexoia_session", "nexoia_csrf"]);
  await assert.rejects(() => service.login({ email: "demo@nexoia.local", password: "incorrecta" }, response));
});

test("registro crea usuario, negocio, membresía admin y trial con plan elegido", async () => {
  const created: Record<string, any> = {};
  const tx: any = {
    user: { create: async ({ data }: any) => (created.user = { id: "user-new", ...data }) },
    organization: {
      findUnique: async () => null,
      create: async ({ data }: any) => (created.organization = { id: "org-new", ...data }),
    },
    membership: { create: async ({ data }: any) => (created.membership = data) },
    session: { create: async ({ data }: any) => (created.session = data) },
    subscription: { create: async ({ data }: any) => (created.subscription = data) },
    billingEvent: { create: async ({ data }: any) => (created.billingEvent = data) },
    auditLog: { create: async ({ data }: any) => (created.auditLog = data) },
  };
  const fake: any = {
    user: { findUnique: async () => null },
    planPrice: { findUnique: async ({ where }: any) => ({ id: "price-pro-year", active: true, ...where.plan_interval }) },
    $transaction: async (callback: any) => callback(tx),
  };
  const service = new AuthService(fake, new JwtService(), { getOrThrow: () => "x".repeat(32), get: () => "test" } as any);
  const cookies: string[] = []; const response: any = { cookie: (name: string) => cookies.push(name) };
  const result = await service.register({ name: "Leniel", email: "nuevo@mercadia.local", password: "Password2026!", businessName: "Mercadia Demo", plan: "PRO", interval: "YEARLY" }, response);
  assert.equal(result.role, "ORGANIZATION_ADMIN");
  assert.equal(created.organization.slug, "mercadia-demo");
  assert.equal(created.organization.plan, "PRO");
  assert.equal(created.membership.role, "ORGANIZATION_ADMIN");
  assert.equal(created.subscription.planPriceId, "price-pro-year");
  assert.equal(created.subscription.status, "TRIALING");
  assert.ok(created.subscription.trialEndsAt instanceof Date);
  assert.deepEqual(cookies, ["nexoia_session", "nexoia_csrf"]);
});

test("rutas de tenant exigen organización seleccionada", () => {
  const guard = new TenantGuard();
  const context = (principal: unknown) => ({ switchToHttp: () => ({ getRequest: () => ({ principal }) }) }) as any;
  assert.throws(() => guard.canActivate(context(undefined)));
  assert.throws(() => guard.canActivate(context({ ...principalA, role: "SUPER_ADMIN", organizationId: null })));
  assert.equal(guard.canActivate(context(principalA)), true);
});

test("guard de suscripcion permite trial vigente y bloquea trial vencido", async () => {
  const reflector: any = { getAllAndOverride: () => false };
  const fake: any = {
    subscription: { findFirst: async ({ where }: any) => ({ organizationId: where.organizationId, status: "TRIALING", trialEndsAt: where.organizationId === "org-a" ? new Date(Date.now() + 86_400_000) : new Date(Date.now() - 86_400_000), currentPeriodStartsAt: new Date(Date.now() - 86_400_000), planPrice: { plan: "PRO" } }) },
    conversation: { count: async () => 0 },
  };
  const guard = new SubscriptionGuard(reflector, fake);
  const context = (principal: AuthPrincipal) => ({ switchToHttp: () => ({ getRequest: () => ({ principal }) }), getHandler: () => "handler", getClass: () => "class" }) as any;
  assert.equal(await guard.canActivate(context(principalA)), true);
  await assert.rejects(() => guard.canActivate(context({ ...principalA, organizationId: "org-expired" })), /trial vencido|incompleta/i);
});

test("guard de suscripcion bloquea trial al llegar a 20 conversaciones", async () => {
  const reflector: any = { getAllAndOverride: () => false };
  const fake: any = {
    subscription: { findFirst: async ({ where }: any) => ({ organizationId: where.organizationId, status: "TRIALING", trialEndsAt: new Date(Date.now() + 86_400_000), currentPeriodStartsAt: new Date(Date.now() - 86_400_000), planPrice: { plan: "PRO" } }) },
    conversation: { count: async () => 20 },
  };
  const guard = new SubscriptionGuard(reflector, fake);
  const context = (principal: AuthPrincipal) => ({ switchToHttp: () => ({ getRequest: () => ({ principal }) }), getHandler: () => "handler", getClass: () => "class" }) as any;
  await assert.rejects(() => guard.canActivate(context(principalA)), /20 conversaciones|Activa un plan/i);
});

test("guard de suscripcion bloquea plan activo al llegar al limite de conversaciones", async () => {
  const reflector: any = { getAllAndOverride: () => false };
  const fake: any = {
    subscription: { findFirst: async () => ({ status: "ACTIVE", currentPeriodStartsAt: new Date(Date.now() - 86_400_000), planPrice: { monthlyContactsLimit: 3 } }) },
    conversation: { count: async () => 3 },
  };
  const guard = new SubscriptionGuard(reflector, fake);
  const context = { switchToHttp: () => ({ getRequest: () => ({ principal: principalA }) }), getHandler: () => "handler", getClass: () => "class" } as any;
  await assert.rejects(() => guard.canActivate(context), /L[ií]mite de conversaciones/);
});

test("guard de suscripcion permite rutas de billing aunque el trial este vencido", async () => {
  const reflector: any = { getAllAndOverride: () => true };
  const fake: any = { subscription: { findFirst: async () => { throw new Error("no debe consultar billing"); } } };
  const guard = new SubscriptionGuard(reflector, fake);
  const context = { switchToHttp: () => ({ getRequest: () => ({ principal: principalA }) }), getHandler: () => "handler", getClass: () => "class" } as any;
  assert.equal(await guard.canActivate(context), true);
});

test("roles tienen permisos distintos en backend", () => {
  assert.equal(roleAllows("ORGANIZATION_ADMIN", "prompt:write"), true);
  assert.equal(roleAllows("AGENT", "prompt:write"), false);
  assert.equal(roleAllows("SUPERVISOR", "analytics:read"), true);
});

test("un usuario A no puede leer ni actualizar recursos de B modificando ids", async () => {
  const fake: any = {
    contact: { findFirst: async ({ where }: any) => where.id === "contact-b" && where.organizationId === "org-b" ? { id: "contact-b" } : null, update: async () => { throw new Error("no debe ejecutarse"); } },
    conversation: { findFirst: async ({ where }: any) => where.id === "conversation-b" && where.organizationId === "org-b" ? { id: "conversation-b" } : null },
  };
  const service = new ResourceService(fake);
  await assert.rejects(() => service.updateContact(principalA, "contact-b", { firstName: "Ataque" }));
  await assert.rejects(() => service.conversation(principalA, "conversation-b"));
  await assert.rejects(() => service.createNote(principalA, { contactId: "contact-b", content: "Ataque" }));
  await assert.rejects(() => service.createAppointment(principalA, { contactId: "contact-b", conversationId: "conversation-b", scheduledAt: new Date().toISOString() }));
});

test("CRUD permitido siempre conserva organizationId de la sesión", async () => {
  let created: any; const fake: any = { contact: { create: async ({ data }: any) => (created = data), findFirst: async ({ where }: any) => where.organizationId === "org-a" ? { id: where.id } : null, update: async ({ data }: any) => data, delete: async () => ({}) } };
  const service = new ResourceService(fake);
  await service.createContact(principalA, { firstName: "Mariana", leadScore: 80 });
  assert.equal(created.organizationId, "org-a");
  assert.equal((await service.updateContact(principalA, "contact-a", { firstName: "Mariana L." })).firstName, "Mariana L.");
  assert.deepEqual(await service.deleteContact(principalA, "contact-a"), { ok: true });
});

test("cálculos de dashboard no generan porcentajes negativos", () => {
  assert.equal(safePercentage(12, 347), 3.5);
  assert.equal(safePercentage(-5, 100), 0);
  assert.equal(safePercentage(5, 0), 0);
});

test("health check reporta API viva", () => {
  const controller = new HealthController({ $queryRaw: async () => [{ ok: 1 }] } as any);
  assert.equal(controller.health().status, "ok");
});

test("deep health check reporta PostgreSQL conectado", async () => {
  const controller = new HealthController({ $queryRaw: async () => [{ ok: 1 }] } as any);
  assert.equal((await controller.deepHealth()).database, "connected");
});

test("migración y seed demo son reproducibles y protegidos", () => {
  const migration = readFileSync("prisma/migrations/20260721000100_phase1_production/migration.sql", "utf8");
  const seed = readFileSync("prisma/seed.ts", "utf8");
  const reset = readFileSync("prisma/reset-demo.ts", "utf8");
  assert.match(migration, /CREATE TABLE "Organization"/);
  assert.match(seed, /DEMO_CONTACT_COUNT = 25/);
  assert.match(seed, /demo@nexoia\.local/);
  assert.match(reset, /organization\.mode !== "DEMO"/);
});
