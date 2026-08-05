CREATE TABLE "MetaWebhookEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID,
    "object" TEXT NOT NULL,
    "senderId" TEXT,
    "recipientId" TEXT,
    "messageId" TEXT,
    "channel" "Channel",
    "timestamp" TIMESTAMP(3),
    "rawPayload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "ignoredReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaWebhookEvent_messageId_key" ON "MetaWebhookEvent"("messageId");
CREATE INDEX "MetaWebhookEvent_organizationId_createdAt_idx" ON "MetaWebhookEvent"("organizationId", "createdAt");
CREATE INDEX "MetaWebhookEvent_object_createdAt_idx" ON "MetaWebhookEvent"("object", "createdAt");
CREATE INDEX "MetaWebhookEvent_senderId_idx" ON "MetaWebhookEvent"("senderId");

ALTER TABLE "MetaWebhookEvent" ADD CONSTRAINT "MetaWebhookEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
