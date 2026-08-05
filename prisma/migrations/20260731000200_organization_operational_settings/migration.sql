ALTER TABLE "Organization"
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
ADD COLUMN "industry" TEXT,
ADD COLUMN "website" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "notificationSettings" JSONB,
ADD COLUMN "securitySettings" JSONB;
