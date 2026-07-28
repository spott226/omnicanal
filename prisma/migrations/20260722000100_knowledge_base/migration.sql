-- CreateEnum
CREATE TYPE "KnowledgeType" AS ENUM ('FAQ', 'PRODUCT', 'SERVICE', 'PROMOTION', 'POLICY');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "PolicyType" AS ENUM ('TERMS', 'PRIVACY', 'RETURNS', 'SHIPPING', 'CANCELLATION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "KnowledgeCategory" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "KnowledgeType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "KnowledgeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faq" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "categoryId" UUID,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "categoryId" UUID,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "categoryId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "durationMinutes" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSchedule" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BusinessSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleEntry" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "opensAt" TEXT,
    "closesAt" TEXT,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "categoryId" UUID,
    "type" "PolicyType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeCategory_organizationId_type_deletedAt_idx" ON "KnowledgeCategory"("organizationId", "type", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeCategory_organizationId_type_slug_key" ON "KnowledgeCategory"("organizationId", "type", "slug");

-- CreateIndex
CREATE INDEX "Faq_organizationId_deletedAt_sortOrder_idx" ON "Faq"("organizationId", "deletedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "Faq_organizationId_categoryId_idx" ON "Faq"("organizationId", "categoryId");

-- CreateIndex
CREATE INDEX "Product_organizationId_deletedAt_name_idx" ON "Product"("organizationId", "deletedAt", "name");

-- CreateIndex
CREATE INDEX "Product_organizationId_categoryId_idx" ON "Product"("organizationId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_sku_key" ON "Product"("organizationId", "sku");

-- CreateIndex
CREATE INDEX "Service_organizationId_deletedAt_name_idx" ON "Service"("organizationId", "deletedAt", "name");

-- CreateIndex
CREATE INDEX "Service_organizationId_categoryId_idx" ON "Service"("organizationId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_organizationId_code_key" ON "Service"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Promotion_organizationId_deletedAt_startsAt_endsAt_idx" ON "Promotion"("organizationId", "deletedAt", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_organizationId_code_key" ON "Promotion"("organizationId", "code");

-- CreateIndex
CREATE INDEX "BusinessSchedule_organizationId_deletedAt_name_idx" ON "BusinessSchedule"("organizationId", "deletedAt", "name");

-- CreateIndex
CREATE INDEX "ScheduleEntry_organizationId_deletedAt_idx" ON "ScheduleEntry"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleEntry_organizationId_scheduleId_dayOfWeek_key" ON "ScheduleEntry"("organizationId", "scheduleId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "Policy_organizationId_deletedAt_title_idx" ON "Policy"("organizationId", "deletedAt", "title");

-- CreateIndex
CREATE INDEX "Policy_organizationId_categoryId_idx" ON "Policy"("organizationId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_organizationId_type_version_key" ON "Policy"("organizationId", "type", "version");

-- AddForeignKey
ALTER TABLE "KnowledgeCategory" ADD CONSTRAINT "KnowledgeCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Faq" ADD CONSTRAINT "Faq_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Faq" ADD CONSTRAINT "Faq_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSchedule" ADD CONSTRAINT "BusinessSchedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BusinessSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
