import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().startsWith("postgresql://"),
  // Redis is not used by the current runtime yet. Railway may leave an
  // unresolved service reference here when no Redis service is attached, so
  // it must never block the API bootstrap.
  REDIS_URL: z.string().optional().default(""),
  JWT_SECRET: z.string().min(32),
  SESSION_SECRET: z.string().min(32),
  APP_ENCRYPTION_KEY: z.string().min(32),
  FRONTEND_URL: z.string().url(),
  BACKEND_URL: z.string().url(),
  CORS_ORIGIN: z.string().url(),
  AI_PROVIDER_MODE: z.enum(["mock", "local", "openai", "deepseek"]).optional().default("mock"),
  AI_AUTO_REPLY_ENABLED: z.coerce.boolean().optional().default(true),
  LOCAL_AI_BASE_URL: z.string().url().optional().default("http://localhost:11434"),
  LOCAL_AI_MODEL: z.string().optional().default("qwen2.5:3b"),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().optional().default(""),
  DEEPSEEK_API_KEY: z.string().optional().default(""),
  DEEPSEEK_MODEL: z.string().optional().default(""),
  AI_INPUT_COST_PER_MILLION_USD: z.coerce.number().min(0).optional().default(0),
  AI_OUTPUT_COST_PER_MILLION_USD: z.coerce.number().min(0).optional().default(0),
  CHANNEL_PROVIDER_MODE: z.enum(["mock", "meta"]).optional().default("mock"),
  META_APP_ID: z.string().optional().default(""),
  META_APP_SECRET: z.string().optional().default(""),
  META_INSTAGRAM_APP_ID: z.string().optional().default(""),
  META_INSTAGRAM_APP_SECRET: z.string().optional().default(""),
  META_INSTAGRAM_REDIRECT_URI: z.string().url().optional(),
  META_FACEBOOK_REDIRECT_URI: z.string().url().optional(),
  META_FACEBOOK_SCOPES: z.string().optional().default(""),
  META_PAGE_ID: z.string().optional().default(""),
  META_PAGE_ACCESS_TOKEN: z.string().optional().default(""),
  META_IG_BUSINESS_ACCOUNT_ID: z.string().optional().default(""),
  META_ORGANIZATION_ID: z.string().uuid().optional(),
  META_VERIFY_TOKEN: z.string().optional().default(""),
  META_GRAPH_VERSION: z.string().optional().default("v23.0"),
  META_WEBHOOK_CALLBACK_URL: z.string().url().optional(),
  META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: z.string().optional().default(""),
  WHATSAPP_STATUS: z.enum(["pending", "disabled", "enabled"]).optional().default("pending"),
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  STRIPE_SUCCESS_URL: z.string().url().optional(),
  STRIPE_CANCEL_URL: z.string().url().optional(),
  STRIPE_PRICE_MICRO_MONTHLY: z.string().optional().default(""),
  STRIPE_PRICE_MICRO_YEARLY: z.string().optional().default(""),
  STRIPE_PRICE_STARTER_MONTHLY: z.string().optional().default(""),
  STRIPE_PRICE_STARTER_YEARLY: z.string().optional().default(""),
  STRIPE_PRICE_GROWTH_MONTHLY: z.string().optional().default(""),
  STRIPE_PRICE_GROWTH_YEARLY: z.string().optional().default(""),
  STRIPE_PRICE_ADVANCED_MONTHLY: z.string().optional().default(""),
  STRIPE_PRICE_ADVANCED_YEARLY: z.string().optional().default(""),
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
