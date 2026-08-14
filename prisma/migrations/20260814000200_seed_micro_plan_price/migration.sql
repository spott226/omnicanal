INSERT INTO "PlanPrice" (
  "plan", "interval", "currency", "amountCents", "monthlyContactsLimit", "seatsLimit", "channelsLimit", "aiResponsesLimit", "active", "updatedAt"
) VALUES
  ('MICRO', 'MONTHLY', 'MXN', 4900, 20, 1, 1, 20, true, CURRENT_TIMESTAMP),
  ('MICRO', 'YEARLY', 'MXN', 49000, 20, 1, 1, 20, true, CURRENT_TIMESTAMP)
ON CONFLICT ("plan", "interval") DO UPDATE SET
  "currency" = EXCLUDED."currency",
  "amountCents" = EXCLUDED."amountCents",
  "monthlyContactsLimit" = EXCLUDED."monthlyContactsLimit",
  "seatsLimit" = EXCLUDED."seatsLimit",
  "channelsLimit" = EXCLUDED."channelsLimit",
  "aiResponsesLimit" = EXCLUDED."aiResponsesLimit",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
