/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { AuthPrincipal } from "../../../packages/shared/src/index";
import { BillingProviderService } from "../src/billing/billing-provider.service";
import { BillingService } from "../src/billing/billing.service";

const principal: AuthPrincipal = { userId: "user-a", sessionId: "session-a", organizationId: "org-a", role: "ORGANIZATION_ADMIN", email: "admin@nexoia.local", name: "Admin" };

test("billing crea trial de 7 días si la organización no tiene suscripción", async () => {
  const now = Date.now();
  const fake: any = {
    subscription: {
      findFirst: async () => null,
      create: async ({ data, include }: any) => ({ id: "sub-a", ...data, include, planPrice: { id: data.planPriceId, plan: "PRO", interval: "MONTHLY", monthlyContactsLimit: 3000, seatsLimit: 10, amountCents: 199000, currency: "MXN" } }),
    },
    planPrice: { findFirst: async () => ({ id: "price-pro", plan: "PRO", interval: "MONTHLY" }) },
    billingEvent: { create: async () => ({}) },
  };
  const result = await new BillingService(fake, { get: () => "" } as any).currentSubscription(principal);
  assert.equal(result.status, "TRIALING");
  assert.equal(result.trialDays, 7);
  assert.equal(result.trialConversationLimit, 20);
  assert.ok(new Date(result.trialEndsAt).getTime() >= now + 6 * 86_400_000);
});

test("billing calcula limites, consumo restante y advertencias por periodo", async () => {
  const fake: any = {
    subscription: { findFirst: async () => ({ id: "sub-a", status: "TRIALING", trialEndsAt: new Date(Date.now() + 7 * 86_400_000), currentPeriodStartsAt: new Date(Date.now() - 86_400_000), currentPeriodEndsAt: new Date(Date.now() + 6 * 86_400_000), planPrice: { monthlyContactsLimit: 10, seatsLimit: 2, channelsLimit: 2, aiResponsesLimit: 5 } }) },
    contact: { count: async () => 10 },
    membership: { count: async () => 2 },
    conversation: { count: async () => 4, groupBy: async () => [{ channel: "INSTAGRAM" }, { channel: "WHATSAPP" }] },
    message: { count: async ({ where }: any) => where.senderType === "AI" ? 3 : 7 },
  };
  const result = await new BillingService(fake, { get: () => "" } as any).usage(principal);
  assert.equal(result.limits.contacts, 0);
  assert.equal(result.limits.conversations, 20);
  assert.equal(result.usage.channels, 2);
  assert.equal(result.remaining.contacts, 0);
  assert.equal(result.remaining.conversations, 16);
  assert.equal(result.warnings.contacts, null);
  assert.equal(result.warnings.conversations, null);
  assert.equal(result.percent, 20);
});

test("la migración de limites agrega canales y respuestas IA al plan", () => {
  const migration = readFileSync("prisma/migrations/20260728000200_plan_limits_usage/migration.sql", "utf8");
  assert.match(migration, /channelsLimit/);
  assert.match(migration, /aiResponsesLimit/);
  assert.match(migration, /STARTER/);
  assert.match(migration, /ENTERPRISE/);
});

test("checkout queda bloqueado hasta configurar Stripe real", async () => {
  const fake: any = {
    planPrice: { findFirst: async () => ({ id: "price-a", plan: "PRO", interval: "MONTHLY", stripePriceId: null }) },
    subscription: { findFirst: async () => ({ id: "sub-a", status: "TRIALING", trialEndsAt: new Date(Date.now() + 7 * 86_400_000), currentPeriodStartsAt: new Date(), planPrice: { monthlyContactsLimit: 3000 } }) },
    billingEvent: { create: async () => ({}) },
  };
  const result = await new BillingService(fake, { get: (key: string) => key === "BILLING_PROVIDER_MODE" ? "stripe" : "" } as any).createCheckout(principal, "price-a");
  assert.equal(result.status, "STRIPE_CONFIGURATION_REQUIRED");
  assert.equal(result.checkoutUrl, null);
});

test("checkout stripe crea cliente y sesión real en modo test", async () => {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body as URLSearchParams });
    if (url.endsWith("/customers")) return new Response(JSON.stringify({ id: "cus_test_123" }), { status: 200 });
    return new Response(JSON.stringify({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" }), { status: 200 });
  }) as typeof fetch;
  try {
    const fake: any = {
      planPrice: { findFirst: async () => ({ id: "price-local", plan: "PRO", interval: "MONTHLY", stripePriceId: null, active: true }) },
      subscription: {
        findFirst: async () => ({ id: "sub-a", status: "TRIALING", stripeCustomerId: null, trialEndsAt: new Date(Date.now() + 4 * 86_400_000), currentPeriodStartsAt: new Date(), planPrice: { monthlyContactsLimit: 3000 } }),
        update: async () => ({}),
      },
      billingEvent: { create: async () => ({}) },
    };
    const config = {
      get: (key: string) => ({
        BILLING_PROVIDER_MODE: "stripe",
        STRIPE_SECRET_KEY: "sk_test_unit",
        STRIPE_PRICE_GROWTH_MONTHLY: "price_test_growth_monthly",
        FRONTEND_URL: "http://localhost:3000",
      })[key] ?? "",
      getOrThrow: (key: string) => key === "STRIPE_SECRET_KEY" ? "sk_test_unit" : "",
    } as any;
    const result = await new BillingService(fake, config).createCheckout(principal, "price-local");
    assert.equal(result.status, "CHECKOUT_SESSION_CREATED");
    assert.equal(result.checkoutUrl, "https://checkout.stripe.com/c/pay/cs_test_123");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.get("line_items[0][price]"), "price_test_growth_monthly");
    assert.equal(calls[1].body.get("subscription_data[trial_period_days]"), "4");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("webhook stripe guarda ids y mantiene trial con tarjeta registrada", async () => {
  const updates: any[] = [];
  const events: any[] = [];
  const fake: any = {
    billingEvent: {
      findUnique: async () => null,
      create: async ({ data }: any) => events.push(data),
    },
    planPrice: { findFirst: async ({ where }: any) => where.id === "price-local" ? { id: "price-local", plan: "STARTER", interval: "MONTHLY", active: true } : null },
    subscription: {
      findFirst: async () => ({ id: "sub-local", organizationId: "org-a", status: "TRIALING", planPriceId: "price-old" }),
      update: async ({ data }: any) => {
        updates.push(data);
        return { id: "sub-local", ...data };
      },
    },
  };
  const secret = "whsec_unit_test";
  const event = {
    id: "evt_checkout_completed",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        customer: "cus_test_123",
        subscription: "sub_stripe_123",
        client_reference_id: "org-a",
        payment_status: "no_payment_required",
        metadata: { organizationId: "org-a", planPriceId: "price-local" },
      },
    },
  };
  const body = Buffer.from(JSON.stringify(event));
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body.toString("utf8")}`).digest("hex")}`;
  const result = await new BillingService(fake, { get: (key: string) => key === "STRIPE_WEBHOOK_SECRET" ? secret : "" } as any).handleStripeWebhook(body, signature);
  assert.equal(result.received, true);
  assert.equal(updates[0].status, "TRIALING");
  assert.equal(updates[0].stripeCustomerId, "cus_test_123");
  assert.equal(updates[0].stripeSubscriptionId, "sub_stripe_123");
  assert.equal(updates[0].planPriceId, "price-local");
  assert.equal(events[0].providerEventId, "evt_checkout_completed");
});

test("billing provider mock cambia plan sin tocar Stripe", async () => {
  const events: any[] = [];
  const updates: any[] = [];
  const fake: any = {
    subscription: {
      findFirst: async () => ({ id: "sub-a", organizationId: "org-a", planPriceId: "price-old", status: "TRIALING", createdAt: new Date(), planPrice: { id: "price-old", plan: "STARTER" } }),
      update: async ({ data, include }: any) => {
        updates.push(data);
        return { id: "sub-a", ...data, include, planPrice: { id: data.planPriceId, plan: "PRO", interval: "MONTHLY" } };
      },
    },
    planPrice: { findFirst: async ({ where }: any) => ({ id: where.id, active: true, plan: "PRO", interval: "MONTHLY" }) },
    billingEvent: { create: async ({ data }: any) => events.push(data) },
  };
  const result = await new BillingProviderService(fake, { get: () => "mock" } as any).simulate(principal, "CHANGE_PLAN", "price-pro");
  assert.equal(result.provider, "MOCK");
  assert.equal(result.stripeTouched, false);
  assert.equal(updates[0].planPriceId, "price-pro");
  assert.equal(updates[0].status, "ACTIVE");
  assert.equal(events[0].provider, "MOCK");
  assert.equal(events[0].type, "MOCK_CHANGE_PLAN");
});

test("la migración de billing contiene planes, suscripciones y eventos Stripe", () => {
  const migration = readFileSync("prisma/migrations/20260728000100_billing_trial/migration.sql", "utf8");
  for (const table of ["PlanPrice", "Subscription", "BillingEvent"]) assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  assert.match(migration, /CREATE TYPE "SubscriptionStatus"/);
  assert.match(migration, /TRIALING/);
  assert.match(migration, /stripeSubscriptionId/);
});
