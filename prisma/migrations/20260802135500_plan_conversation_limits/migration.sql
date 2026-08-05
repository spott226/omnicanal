UPDATE "PlanPrice"
SET "monthlyContactsLimit" = 500,
    "aiResponsesLimit" = 500
WHERE "plan" = 'STARTER';

UPDATE "PlanPrice"
SET "monthlyContactsLimit" = 2000,
    "aiResponsesLimit" = 2000
WHERE "plan" = 'PRO';

UPDATE "PlanPrice"
SET "monthlyContactsLimit" = 5000,
    "aiResponsesLimit" = 5000
WHERE "plan" = 'ENTERPRISE';
