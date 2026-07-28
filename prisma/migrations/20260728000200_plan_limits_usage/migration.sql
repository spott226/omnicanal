ALTER TABLE "PlanPrice" ADD COLUMN "channelsLimit" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PlanPrice" ADD COLUMN "aiResponsesLimit" INTEGER NOT NULL DEFAULT 500;

UPDATE "PlanPrice"
SET "channelsLimit" = 1,
    "aiResponsesLimit" = 500
WHERE "plan" = 'STARTER';

UPDATE "PlanPrice"
SET "channelsLimit" = 3,
    "aiResponsesLimit" = 3000
WHERE "plan" = 'PRO';

UPDATE "PlanPrice"
SET "channelsLimit" = 10,
    "aiResponsesLimit" = 10000
WHERE "plan" = 'ENTERPRISE';
