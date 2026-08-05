/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { MetaWebhookService } from "../src/meta-webhook/meta-webhook.service";

const config = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as any;

test("Meta GET verifica token y devuelve challenge", () => {
  const service = new MetaWebhookService({} as any, config({ META_VERIFY_TOKEN: "verify-ok" }));
  assert.equal(service.verify("subscribe", "verify-ok", "12345"), "12345");
  assert.throws(() => service.verify("subscribe", "bad", "12345"), ForbiddenException);
});

test("Meta valida X-Hub-Signature-256 cuando llega", () => {
  const body = Buffer.from(JSON.stringify({ object: "page" }));
  const secret = "app-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const service = new MetaWebhookService({} as any, config({ META_APP_SECRET: secret }));
  assert.doesNotThrow(() => service.validateSignature(body, signature));
  assert.throws(() => service.validateSignature(body, "sha256=bad"), ForbiddenException);
});

test("Meta extrae eventos de Instagram y Messenger", () => {
  const service = new MetaWebhookService({} as any, config({}));
  const instagram = service.extractEvents({ object: "instagram", entry: [{ messaging: [{ sender: { id: "ig-user" }, recipient: { id: "ig-business" }, timestamp: 1760000000000, message: { mid: "ig-mid", text: "hola" } }] }] });
  assert.equal(instagram[0].channel, "INSTAGRAM");
  assert.equal(instagram[0].messageId, "ig-mid");
  assert.equal(instagram[0].text, "hola");

  const page = service.extractEvents({ object: "page", entry: [{ messaging: [{ sender: { id: "fb-user" }, recipient: { id: "page-id" }, message: { mid: "fb-mid", text: "precio" } }] }] });
  assert.equal(page[0].channel, "FACEBOOK");
});

test("Meta guarda evento bruto, contacto, conversacion y mensaje recibido", async () => {
  const created: Record<string, any[]> = { events: [], contacts: [], conversations: [], messages: [] };
  const tx: any = {
    contact: {
      findFirst: async () => null,
      create: async ({ data }: any) => { const row = { id: "contact-a", ...data }; created.contacts.push(row); return row; },
      update: async ({ data }: any) => ({ id: "contact-a", ...data }),
    },
    conversation: {
      findFirst: async () => null,
      create: async ({ data }: any) => { const row = { id: "conversation-a", ...data }; created.conversations.push(row); return row; },
      update: async ({ data }: any) => data,
    },
    message: { create: async ({ data }: any) => { created.messages.push(data); return { id: "message-a", ...data }; } },
  };
  const prisma: any = {
    organization: { findFirst: async () => ({ id: "org-a" }) },
    metaWebhookEvent: {
      findUnique: async () => null,
      create: async ({ data }: any) => { created.events.push(data); return { id: "event-a", ...data }; },
    },
    $transaction: async (callback: any) => callback(tx),
  };
  const service = new MetaWebhookService(prisma, config({ META_PAGE_ID: "page-id", META_IG_BUSINESS_ACCOUNT_ID: "ig-business" }));
  await service.receive({ object: "instagram", entry: [{ messaging: [{ sender: { id: "ig-user" }, recipient: { id: "ig-business" }, timestamp: 1760000000000, message: { mid: "mid-a", text: "cuanto gelish" } }] }] }, Buffer.from("{}"));
  assert.equal(created.events[0].messageId, "mid-a");
  assert.equal(created.contacts[0].instagramUsername, "ig-user");
  assert.equal(created.conversations[0].channel, "INSTAGRAM");
  assert.equal(created.messages[0].content, "cuanto gelish");
  assert.equal(created.messages[0].direction, "INBOUND");
});

test("Meta dispara respuesta IA automatica despues de guardar mensaje entrante", async () => {
  const calls: any[] = [];
  const tx: any = {
    contact: {
      findFirst: async () => ({ id: "contact-a" }),
      update: async () => ({ id: "contact-a" }),
    },
    conversation: {
      findFirst: async () => ({ id: "conversation-a" }),
      update: async () => ({}),
    },
    message: { create: async () => ({ id: "message-a" }) },
  };
  const prisma: any = {
    organization: { findFirst: async () => ({ id: "org-a" }) },
    metaWebhookEvent: {
      findUnique: async () => null,
      create: async ({ data }: any) => ({ id: "event-a", ...data }),
    },
    $transaction: async (callback: any) => callback(tx),
  };
  const resources: any = {
    autoReplyFromInbound: async (organizationId: string, conversationId: string, text: string) => calls.push({ organizationId, conversationId, text }),
  };
  const service = new MetaWebhookService(prisma, config({ META_PAGE_ID: "page-id" }), resources);
  await service.receive({ object: "page", entry: [{ messaging: [{ sender: { id: "fb-user" }, recipient: { id: "page-id" }, message: { mid: "mid-auto", text: "precio gelish" } }] }] }, Buffer.from("{}"));
  assert.deepEqual(calls[0], { organizationId: "org-a", conversationId: "conversation-a", text: "precio gelish" });
});

test("Meta ignora mensajes enviados por la propia pagina", async () => {
  const created: any[] = [];
  const prisma: any = {
    organization: { findFirst: async () => ({ id: "org-a" }) },
    metaWebhookEvent: { findUnique: async () => null, create: async ({ data }: any) => { created.push(data); return data; } },
    $transaction: async () => { throw new Error("no debe crear conversacion"); },
  };
  const service = new MetaWebhookService(prisma, config({ META_PAGE_ID: "page-id" }));
  await service.receive({ object: "page", entry: [{ messaging: [{ sender: { id: "page-id" }, recipient: { id: "fb-user" }, message: { mid: "own-mid", text: "respuesta" } }] }] }, Buffer.from("{}"));
  assert.equal(created[0].ignoredReason, "own_page_message");
});

test("Meta usa META_ORGANIZATION_ID cuando hay varios workspaces", async () => {
  let eventData: any;
  const prisma: any = {
    organization: {
      findFirst: async ({ where }: any) => where.id === "d6e48cbf-0abe-4869-a945-554efcf26a79" ? { id: where.id } : null,
    },
    metaWebhookEvent: { findUnique: async () => null, create: async ({ data }: any) => { eventData = data; return data; } },
    $transaction: async () => { throw new Error("no debe crear conversacion"); },
  };
  const service = new MetaWebhookService(prisma, config({ META_ORGANIZATION_ID: "d6e48cbf-0abe-4869-a945-554efcf26a79", META_PAGE_ID: "page-id" }));
  const result = await service.receive({ object: "page", entry: [{ messaging: [{ sender: { id: "page-id" }, recipient: { id: "fb-user" }, message: { mid: "own-mid-2", text: "respuesta" } }] }] }, Buffer.from("{}"));
  assert.deepEqual(result, { received: true });
  assert.equal(eventData.organizationId, "d6e48cbf-0abe-4869-a945-554efcf26a79");
});
