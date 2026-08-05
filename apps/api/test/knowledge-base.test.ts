/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { AuthPrincipal } from "../../../packages/shared/src/index";
import { KnowledgeBaseService } from "../src/knowledge-base/knowledge-base.service";

const principal: AuthPrincipal = { userId: "user-a", sessionId: "session-a", organizationId: "org-a", role: "ORGANIZATION_ADMIN", email: "admin@nexoia.local", name: "Admin" };
const page = { page: 1, pageSize: 10, search: "consulta", sort: "desc" as const };

test("Knowledge Base pagina, busca y aísla resultados por organización", async () => {
  let receivedWhere: any;
  let receivedTake: any;
  const fake: any = {
    product: {
      findMany: async ({ where, take }: any) => { receivedWhere = where; receivedTake = take; return [{ id: "product-a" }]; },
      count: async () => 1,
    },
  };
  const result = await new KnowledgeBaseService(fake).listProducts(principal, page);
  assert.equal(receivedWhere.organizationId, "org-a");
  assert.equal(receivedWhere.deletedAt, null);
  assert.equal(receivedWhere.OR.length, 3);
  assert.equal(receivedTake, 10);
  assert.deepEqual(result, { items: [{ id: "product-a" }], total: 1, page: 1, pageSize: 10, pages: 1 });
});

test("Knowledge Base normaliza pageSize string antes de consultar Prisma", async () => {
  let receivedTake: any;
  let receivedSkip: any;
  const fake: any = {
    product: {
      findMany: async ({ take, skip }: any) => { receivedTake = take; receivedSkip = skip; return []; },
      count: async () => 0,
    },
  };
  const result = await new KnowledgeBaseService(fake).listProducts(principal, { page: "1", pageSize: "25", sort: "desc" } as any);
  assert.equal(receivedTake, 25);
  assert.equal(receivedSkip, 0);
  assert.equal(result.pageSize, 25);
});

test("Knowledge Base impide consultar un registro de otra organización", async () => {
  const fake: any = { faq: { findFirst: async ({ where }: any) => where.organizationId === "org-b" ? { id: where.id } : null } };
  await assert.rejects(() => new KnowledgeBaseService(fake).getFaq(principal, "faq-b"), /FAQ no encontrada/);
});

test("el borrado de FAQ es lógico y genera auditoría", async () => {
  let updateData: any;
  let auditData: any;
  const tx: any = {
    faq: { update: async ({ data }: any) => { updateData = data; return { id: "faq-a" }; } },
    auditLog: { create: async ({ data }: any) => { auditData = data; return data; } },
  };
  const fake: any = {
    faq: { findFirst: async () => ({ id: "faq-a" }) },
    $transaction: async (callback: any) => callback(tx),
  };
  assert.deepEqual(await new KnowledgeBaseService(fake).deleteFaq(principal, "faq-a"), { ok: true });
  assert.equal(updateData.active, false);
  assert.ok(updateData.deletedAt instanceof Date);
  assert.equal(auditData.organizationId, "org-a");
  assert.equal(auditData.action, "KNOWLEDGE_FAQ_DELETED");
});

test("promociones validan porcentaje y vigencia", async () => {
  const service = new KnowledgeBaseService({} as any);
  await assert.rejects(() => service.createPromotion(principal, { code: "BAD", name: "Inválida", discountType: "PERCENTAGE", discountValue: 101, startsAt: "2026-01-01T00:00:00.000Z", endsAt: "2026-01-02T00:00:00.000Z" }), /porcentaje/i);
  await assert.rejects(() => service.createPromotion(principal, { code: "BAD2", name: "Inválida", discountType: "FIXED_AMOUNT", discountValue: 10, startsAt: "2026-01-03T00:00:00.000Z", endsAt: "2026-01-02T00:00:00.000Z" }), /posterior/i);
});

test("horarios rechazan días repetidos e intervalos inválidos", async () => {
  const service = new KnowledgeBaseService({} as any);
  await assert.rejects(() => service.createSchedule(principal, { name: "Principal", timezone: "America/Mexico_City", entries: [{ dayOfWeek: "MONDAY", opensAt: "09:00", closesAt: "18:00" }, { dayOfWeek: "MONDAY", closed: true }] }), /repetir un día/i);
  await assert.rejects(() => service.createSchedule(principal, { name: "Principal", timezone: "America/Mexico_City", entries: [{ dayOfWeek: "TUESDAY", opensAt: "18:00", closesAt: "09:00" }] }), /posterior/i);
});

test("politicas asignan siguiente version para evitar choque por tipo", async () => {
  let createdData: any;
  const tx: any = {
    policy: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.organizationId, "org-a");
        assert.equal(where.type, "CUSTOM");
        assert.equal(where.deletedAt, undefined);
        return { version: 1 };
      },
      create: async ({ data }: any) => { createdData = data; return { id: "policy-a", ...data }; },
    },
    auditLog: { create: async () => ({}) },
  };
  const fake: any = {
    $transaction: async (callback: any) => callback(tx),
  };
  const result = await new KnowledgeBaseService(fake).createPolicy(principal, { type: "CUSTOM", title: "Politica", content: "Contenido", version: 1 });
  assert.equal(createdData.version, 2);
  assert.equal(result.version, 2);
});

test("la migración de Knowledge Base contiene los seis módulos y soft delete", () => {
  const migration = readFileSync("prisma/migrations/20260722000100_knowledge_base/migration.sql", "utf8");
  for (const table of ["Faq", "Product", "Service", "Promotion", "BusinessSchedule", "Policy"]) assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  assert.match(migration, /CREATE TABLE "KnowledgeCategory"/);
  assert.match(migration, /CREATE TABLE "ScheduleEntry"/);
  assert.match(migration, /"deletedAt" TIMESTAMP\(3\)/);
});
