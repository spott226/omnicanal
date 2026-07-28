/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { AuthPrincipal } from "../../../packages/shared/src/index";
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
  assert.ok(new Date(result.trialEndsAt).getTime() >= now + 6 * 86_400_000);
});

test("checkout queda bloqueado hasta configurar Stripe real", async () => {
  const fake: any = {
    planPrice: { findFirst: async () => ({ id: "price-a", plan: "PRO", interval: "MONTHLY", stripePriceId: null }) },
    subscription: { findFirst: async () => ({ id: "sub-a", status: "TRIALING", trialEndsAt: new Date(Date.now() + 7 * 86_400_000), currentPeriodStartsAt: new Date(), planPrice: { monthlyContactsLimit: 3000 } }) },
    billingEvent: { create: async () => ({}) },
  };
  const result = await new BillingService(fake, { get: () => "" } as any).createCheckout(principal, "price-a");
  assert.equal(result.status, "STRIPE_CONFIGURATION_REQUIRED");
  assert.equal(result.checkoutUrl, null);
});

test("la migración de billing contiene planes, suscripciones y eventos Stripe", () => {
  const migration = readFileSync("prisma/migrations/20260728000100_billing_trial/migration.sql", "utf8");
  for (const table of ["PlanPrice", "Subscription", "BillingEvent"]) assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  assert.match(migration, /CREATE TYPE "SubscriptionStatus"/);
  assert.match(migration, /TRIALING/);
  assert.match(migration, /stripeSubscriptionId/);
});
