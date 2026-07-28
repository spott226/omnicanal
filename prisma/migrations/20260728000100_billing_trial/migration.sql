CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'INCOMPLETE');

CREATE TABLE "PlanPrice" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan" "Plan" NOT NULL,
  "interval" "BillingInterval" NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'MXN',
  "amountCents" INTEGER NOT NULL,
  "monthlyContactsLimit" INTEGER NOT NULL,
  "seatsLimit" INTEGER NOT NULL,
  "stripePriceId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanPrice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subscription" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "planPriceId" UUID NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  "trialStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trialEndsAt" TIMESTAMP(3) NOT NULL,
  "currentPeriodStartsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currentPeriodEndsAt" TIMESTAMP(3) NOT NULL,
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'STRIPE',
  "providerEventId" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanPrice_plan_interval_key" ON "PlanPrice"("plan", "interval");
CREATE INDEX "PlanPrice_active_plan_idx" ON "PlanPrice"("active", "plan");
CREATE INDEX "Subscription_organizationId_status_idx" ON "Subscription"("organizationId", "status");
CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");
CREATE INDEX "Subscription_stripeSubscriptionId_idx" ON "Subscription"("stripeSubscriptionId");
CREATE INDEX "BillingEvent_organizationId_createdAt_idx" ON "BillingEvent"("organizationId", "createdAt");
CREATE UNIQUE INDEX "BillingEvent_provider_providerEventId_key" ON "BillingEvent"("provider", "providerEventId");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planPriceId_fkey" FOREIGN KEY ("planPriceId") REFERENCES "PlanPrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingEvent" ADD CONSTRAINT "BillingEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PlanPrice" ("plan", "interval", "currency", "amountCents", "monthlyContactsLimit", "seatsLimit", "updatedAt") VALUES
('STARTER', 'MONTHLY', 'MXN', 99000, 1000, 3, CURRENT_TIMESTAMP),
('PRO', 'MONTHLY', 'MXN', 199000, 3000, 10, CURRENT_TIMESTAMP),
('ENTERPRISE', 'MONTHLY', 'MXN', 349000, 10000, 25, CURRENT_TIMESTAMP),
('STARTER', 'YEARLY', 'MXN', 948000, 1000, 3, CURRENT_TIMESTAMP),
('PRO', 'YEARLY', 'MXN', 1908000, 3000, 10, CURRENT_TIMESTAMP),
('ENTERPRISE', 'YEARLY', 'MXN', 3348000, 10000, 25, CURRENT_TIMESTAMP);
