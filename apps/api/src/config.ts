import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().startsWith("postgresql://"),
  REDIS_URL: z.string().startsWith("redis://"),
  JWT_SECRET: z.string().min(32),
  SESSION_SECRET: z.string().min(32),
  APP_ENCRYPTION_KEY: z.string().min(32),
  FRONTEND_URL: z.string().url(),
  BACKEND_URL: z.string().url(),
  CORS_ORIGIN: z.string().url(),
  AI_PROVIDER_MODE: z.enum(["mock", "openai"]).optional().default("mock"),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().optional().default(""),
  CHANNEL_PROVIDER_MODE: z.enum(["mock", "meta"]).optional().default("mock"),
  META_APP_ID: z.string().optional().default(""),
  META_APP_SECRET: z.string().optional().default(""),
  META_VERIFY_TOKEN: z.string().optional().default(""),
  META_WEBHOOK_CALLBACK_URL: z.string().url().optional(),
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  STRIPE_SUCCESS_URL: z.string().url().optional(),
  STRIPE_CANCEL_URL: z.string().url().optional(),
  BILLING_PROVIDER_MODE: z.enum(["mock", "stripe"]).optional().default("mock"),
});

export type AppEnvironment = z.infer<typeof schema>;

export function validateEnvironment(values: Record<string, unknown>): AppEnvironment {
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    throw new Error(`Configuración inválida: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  }
  return parsed.data;
}
