CREATE TABLE "MetaConnection" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'INSTAGRAM',
  "externalAccountId" TEXT,
  "username" TEXT,
  "accessTokenEncrypted" TEXT,
  "tokenType" TEXT,
  "scopes" JSONB,
  "expiresAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'CONNECTED',
  "lastError" TEXT,
  "connectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaConnection_organizationId_provider_key" ON "MetaConnection"("organizationId", "provider");
CREATE INDEX "MetaConnection_organizationId_status_idx" ON "MetaConnection"("organizationId", "status");

ALTER TABLE "MetaConnection"
  ADD CONSTRAINT "MetaConnection_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
