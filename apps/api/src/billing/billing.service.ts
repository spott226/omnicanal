import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthPrincipal } from "../../../../packages/shared/src/index";
import { PrismaService } from "../prisma.service";

const TRIAL_DAYS = 7;
const TRIAL_CONVERSATION_LIMIT = 20;

@Injectable()
export class BillingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(ConfigService) private readonly config: ConfigService) {}

  private org(principal: AuthPrincipal) {
    if (!principal.organizationId) throw new ForbiddenException("Organizacion requerida");
    return principal.organizationId;
  }

  plans() {
    return (this.prisma as any).planPrice.findMany({ where: { active: true, plan: { not: "DEMO" } }, orderBy: [{ interval: "asc" }, { amountCents: "asc" }] });
  }

  async currentSubscription(principal: AuthPrincipal) {
    const organizationId = this.org(principal);
    const existing = await (this.prisma as any).subscription.findFirst({ where: { organizationId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "INCOMPLETE"] } }, orderBy: { createdAt: "desc" }, include: { planPrice: true } });
    if (existing) return this.withComputed(existing);

    const planPrice = await (this.prisma as any).planPrice.findFirst({ where: { plan: "PRO", interval: "MONTHLY", active: true } });
    if (!planPrice) throw new NotFoundException("Plan inicial no configurado");
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 86400000);
    const subscription = await (this.prisma as any).subscription.create({ data: { organizationId, planPriceId: planPrice.id, status: "TRIALING", trialStartedAt: now, trialEndsAt, currentPeriodStartsAt: now, currentPeriodEndsAt: trialEndsAt }, include: { planPrice: true } });
    await (this.prisma as any).billingEvent.create({ data: { organizationId, type: "TRIAL_STARTED", payload: { trialDays: TRIAL_DAYS, trialConversationLimit: TRIAL_CONVERSATION_LIMIT, plan: planPrice.plan } } });
    return this.withComputed(subscription);
  }

  async createCheckout(principal: AuthPrincipal, planPriceId: string) {
    const organizationId = this.org(principal);
    const planPrice = await (this.prisma as any).planPrice.findFirst({ where: { id: planPriceId, active: true } });
    if (!planPrice) throw new BadRequestException("Plan no disponible");
    const subscription = await this.currentSubscription(principal);
    const mode = (this.config.get<string>("BILLING_PROVIDER_MODE") ?? "mock").toLowerCase();

    if (mode === "mock") {
      await (this.prisma as any).billingEvent.create({ data: { organizationId, provider: "MOCK", type: "MOCK_CHECKOUT_PREPARED", payload: { planPriceId, plan: planPrice.plan, interval: planPrice.interval } } });
      return {
        provider: "MOCK",
        status: "MOCK_CHECKOUT_READY",
        checkoutUrl: null,
        message: "Checkout local listo. Stripe real no fue llamado.",
        planPrice,
      };
    }

    const stripePriceId = planPrice.stripePriceId || this.stripePriceIdFor(planPrice.plan, planPrice.interval);
    if (!this.config.get<string>("STRIPE_SECRET_KEY") || !stripePriceId) {
      await (this.prisma as any).billingEvent.create({ data: { organizationId, type: "CHECKOUT_PENDING_STRIPE_KEYS", payload: { planPriceId, plan: planPrice.plan, interval: planPrice.interval } } });
      return {
        provider: "STRIPE",
        status: "STRIPE_CONFIGURATION_REQUIRED",
        checkoutUrl: null,
        message: "Faltan STRIPE_SECRET_KEY y price_id para activar cobro real.",
        planPrice,
      };
    }

    const checkout = await this.createStripeCheckoutSession(principal, subscription, planPrice, stripePriceId);
    await (this.prisma as any).billingEvent.create({ data: { organizationId, provider: "STRIPE", type: "CHECKOUT_SESSION_CREATED", payload: { planPriceId, plan: planPrice.plan, interval: planPrice.interval, checkoutSessionId: checkout.id } } });
    return {
      provider: "STRIPE",
      status: "CHECKOUT_SESSION_CREATED",
      checkoutUrl: checkout.url,
      message: "Checkout de Stripe creado en modo prueba.",
      planPrice,
    };
  }

  async usage(principal: AuthPrincipal) {
    const organizationId = this.org(principal);
    const subscription = await this.currentSubscription(principal);
    const periodStart = new Date(subscription.currentPeriodStartsAt);
    const periodEnd = new Date(subscription.currentPeriodEndsAt);
    const period = { gte: periodStart, lte: periodEnd };
    const [contacts, seats, conversations, channels, aiResponses, messagesReceived, messagesSent] = await Promise.all([
      this.prisma.contact.count({ where: { organizationId } }),
      (this.prisma as any).membership.count({ where: { organizationId } }),
      this.prisma.conversation.count({ where: { organizationId, createdAt: { gte: periodStart } } }),
      this.prisma.conversation.groupBy({ by: ["channel"], where: { organizationId }, _count: { _all: true } }),
      this.prisma.message.count({ where: { organizationId, senderType: "AI", createdAt: period } }),
      this.prisma.message.count({ where: { organizationId, direction: "INBOUND", createdAt: period } }),
      this.prisma.message.count({ where: { organizationId, direction: "OUTBOUND", createdAt: period } }),
    ]);
    const isTrial = subscription.status === "TRIALING";
    const conversationLimit = isTrial ? TRIAL_CONVERSATION_LIMIT : subscription.planPrice.monthlyContactsLimit;
    const limits = {
      contacts: 0,
      conversations: conversationLimit,
      seats: subscription.planPrice.seatsLimit,
      channels: subscription.planPrice.channelsLimit ?? 1,
      aiResponses: subscription.planPrice.aiResponsesLimit ?? 500,
    };
    const usage = { contacts, seats, channels: channels.length, aiResponses, conversations, messagesReceived, messagesSent };
    return {
      period: { startsAt: subscription.currentPeriodStartsAt, endsAt: subscription.currentPeriodEndsAt },
      limits,
      usage,
      remaining: {
        contacts: 0,
        conversations: Math.max(0, limits.conversations - usage.conversations),
        seats: Math.max(0, limits.seats - usage.seats),
        channels: Math.max(0, limits.channels - usage.channels),
        aiResponses: Math.max(0, limits.aiResponses - usage.aiResponses),
      },
      percentages: {
        contacts: 0,
        conversations: this.percent(usage.conversations, limits.conversations),
        seats: this.percent(usage.seats, limits.seats),
        channels: this.percent(usage.channels, limits.channels),
        aiResponses: this.percent(usage.aiResponses, limits.aiResponses),
      },
      warnings: {
        contacts: null,
        conversations: usage.conversations >= limits.conversations ? "Alcanzaste el limite de conversaciones del periodo." : null,
        seats: usage.seats >= limits.seats ? "Alcanzaste el límite de usuarios del plan." : null,
        channels: usage.channels >= limits.channels ? "Alcanzaste el límite de canales del plan." : null,
        aiResponses: usage.aiResponses >= limits.aiResponses ? "Alcanzaste el límite de respuestas IA del periodo." : null,
      },
      conversations: usage.conversations,
      conversationLimit: limits.conversations,
      trialConversationLimit: isTrial ? TRIAL_CONVERSATION_LIMIT : null,
      monthlyContactsLimit: limits.conversations,
      seatsLimit: limits.seats,
      percent: this.percent(usage.conversations, limits.conversations),
    };
  }

  async handleStripeWebhook(rawBody: Buffer | string, signature: string) {
    const webhookSecret = this.config.get<string>("STRIPE_WEBHOOK_SECRET") ?? "";
    if (!webhookSecret) throw new BadRequestException("STRIPE_WEBHOOK_SECRET no configurado");
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    this.verifyStripeSignature(body, signature, webhookSecret);
    const event = JSON.parse(body.toString("utf8"));
    if (!event?.id || !event?.type || !event?.data?.object) throw new BadRequestException("Evento Stripe invalido");
    const existing = await (this.prisma as any).billingEvent.findUnique?.({ where: { provider_providerEventId: { provider: "STRIPE", providerEventId: event.id } } });
    if (existing) return { received: true, duplicate: true };

    const result: any = await this.applyStripeEvent(event);
    if (result.organizationId) {
      await (this.prisma as any).billingEvent.create({
        data: { organizationId: result.organizationId, provider: "STRIPE", providerEventId: event.id, type: event.type, payload: { status: result.status, stripeSubscriptionId: result.stripeSubscriptionId, stripeCustomerId: result.stripeCustomerId } },
      });
    }
    return { received: true, ...result };
  }

  private withComputed(subscription: any) {
    const now = Date.now();
    const trialEnds = new Date(subscription.trialEndsAt).getTime();
    const trialDaysLeft = Math.max(0, Math.ceil((trialEnds - now) / 86400000));
    return { ...subscription, trialDays: TRIAL_DAYS, trialConversationLimit: TRIAL_CONVERSATION_LIMIT, trialDaysLeft, trialExpired: trialDaysLeft === 0 && subscription.status === "TRIALING" };
  }

  private percent(used: number, limit: number) {
    return Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  }

  private stripePriceIdFor(plan: string, interval: string) {
    const normalizedPlan = plan === "PRO" ? "GROWTH" : plan;
    return this.config.get<string>(`STRIPE_PRICE_${normalizedPlan}_${interval}`) ?? "";
  }

  private async applyStripeEvent(event: any) {
    const object = event.data.object;
    if (event.type === "checkout.session.completed") return this.applyCheckoutCompleted(object);
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") return this.applyStripeSubscription(object);
    if (event.type === "invoice.paid") return this.applyInvoice(object, "ACTIVE");
    if (event.type === "invoice.payment_failed") return this.applyInvoice(object, "PAST_DUE");
    return { handled: false, type: event.type };
  }

  private async applyCheckoutCompleted(session: any) {
    const organizationId = String(session.client_reference_id || session.metadata?.organizationId || "");
    if (!organizationId) return { handled: false, reason: "missing_organization" };
    const planPrice = await this.planPriceFromStripeMetadata(session.metadata, session);
    const paymentStatus = String(session.payment_status ?? "");
    const status = paymentStatus === "paid" ? "ACTIVE" : "TRIALING";
    const update: any = {
      status,
      stripeCustomerId: session.customer ? String(session.customer) : undefined,
      stripeSubscriptionId: session.subscription ? String(session.subscription) : undefined,
    };
    if (planPrice) update.planPriceId = planPrice.id;
    await this.updateLocalSubscription(organizationId, update);
    return { handled: true, organizationId, status, stripeCustomerId: update.stripeCustomerId, stripeSubscriptionId: update.stripeSubscriptionId };
  }

  private async applyStripeSubscription(stripeSubscription: any) {
    const organizationId = await this.organizationIdFromStripeObject(stripeSubscription);
    if (!organizationId) return { handled: false, reason: "missing_organization" };
    const planPrice = await this.planPriceFromStripeMetadata(stripeSubscription.metadata, stripeSubscription);
    const update: any = {
      status: this.mapStripeSubscriptionStatus(stripeSubscription.status),
      stripeCustomerId: stripeSubscription.customer ? String(stripeSubscription.customer) : undefined,
      stripeSubscriptionId: stripeSubscription.id ? String(stripeSubscription.id) : undefined,
      cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
    };
    if (planPrice) update.planPriceId = planPrice.id;
    const periodStart = this.dateFromUnix(stripeSubscription.current_period_start);
    const periodEnd = this.dateFromUnix(stripeSubscription.current_period_end);
    const trialEnd = this.dateFromUnix(stripeSubscription.trial_end);
    if (periodStart) update.currentPeriodStartsAt = periodStart;
    if (periodEnd) update.currentPeriodEndsAt = periodEnd;
    if (trialEnd) update.trialEndsAt = trialEnd;
    await this.updateLocalSubscription(organizationId, update);
    return { handled: true, organizationId, status: update.status, stripeCustomerId: update.stripeCustomerId, stripeSubscriptionId: update.stripeSubscriptionId };
  }

  private async applyInvoice(invoice: any, status: "ACTIVE" | "PAST_DUE") {
    const stripeSubscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.parent?.subscription_details?.subscription;
    const organizationId = await this.organizationIdFromStripeObject(invoice);
    const subscription = await (this.prisma as any).subscription.findFirst({
      where: stripeSubscriptionId ? { stripeSubscriptionId } : { stripeCustomerId: String(invoice.customer ?? "") },
      orderBy: { createdAt: "desc" },
    });
    const targetOrganizationId = organizationId || subscription?.organizationId;
    if (!targetOrganizationId) return { handled: false, reason: "missing_organization" };
    const line = invoice.lines?.data?.[0];
    const update: any = { status };
    if (stripeSubscriptionId) update.stripeSubscriptionId = String(stripeSubscriptionId);
    if (invoice.customer) update.stripeCustomerId = String(invoice.customer);
    const periodStart = this.dateFromUnix(line?.period?.start);
    const periodEnd = this.dateFromUnix(line?.period?.end);
    if (periodStart) update.currentPeriodStartsAt = periodStart;
    if (periodEnd) update.currentPeriodEndsAt = periodEnd;
    await this.updateLocalSubscription(targetOrganizationId, update);
    return { handled: true, organizationId: targetOrganizationId, status, stripeCustomerId: update.stripeCustomerId, stripeSubscriptionId: update.stripeSubscriptionId };
  }

  private async updateLocalSubscription(organizationId: string, data: Record<string, unknown>) {
    const current = await (this.prisma as any).subscription.findFirst({ where: { organizationId }, orderBy: { createdAt: "desc" } });
    if (!current) throw new NotFoundException("Suscripcion local no encontrada para Stripe");
    const clean = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    return (this.prisma as any).subscription.update({ where: { id: current.id }, data: clean, include: { planPrice: true } });
  }

  private async organizationIdFromStripeObject(object: any) {
    const metadataOrg = object.metadata?.organizationId || object.subscription_details?.metadata?.organizationId || object.parent?.subscription_details?.metadata?.organizationId;
    if (metadataOrg) return String(metadataOrg);
    const stripeSubscriptionId = typeof object.id === "string" && object.object === "subscription" ? object.id : typeof object.subscription === "string" ? object.subscription : undefined;
    const stripeCustomerId = object.customer ? String(object.customer) : undefined;
    const existing = await (this.prisma as any).subscription.findFirst({
      where: stripeSubscriptionId ? { stripeSubscriptionId } : { stripeCustomerId: stripeCustomerId ?? "" },
      orderBy: { createdAt: "desc" },
    });
    return existing?.organizationId ? String(existing.organizationId) : "";
  }

  private async planPriceFromStripeMetadata(metadata: any, object: any) {
    if (metadata?.planPriceId) {
      const byId = await (this.prisma as any).planPrice.findFirst({ where: { id: String(metadata.planPriceId), active: true } });
      if (byId) return byId;
    }
    const stripePriceId = object.items?.data?.[0]?.price?.id || object.lines?.data?.[0]?.price?.id;
    if (stripePriceId) return (this.prisma as any).planPrice.findFirst({ where: { stripePriceId: String(stripePriceId), active: true } });
    return null;
  }

  private mapStripeSubscriptionStatus(status: string) {
    if (status === "trialing") return "TRIALING";
    if (status === "active") return "ACTIVE";
    if (status === "past_due" || status === "unpaid") return "PAST_DUE";
    if (status === "canceled") return "CANCELLED";
    return "INCOMPLETE";
  }

  private dateFromUnix(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000) : null;
  }

  private verifyStripeSignature(body: Buffer, signature: string, secret: string) {
    const parts = Object.fromEntries(signature.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key, rest.join("=")];
    }));
    const timestamp = parts.t;
    const expected = parts.v1;
    if (!timestamp || !expected) throw new BadRequestException("Firma Stripe incompleta");
    const digest = createHmac("sha256", secret).update(`${timestamp}.${body.toString("utf8")}`).digest("hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    const digestBuffer = Buffer.from(digest, "hex");
    if (expectedBuffer.length !== digestBuffer.length || !timingSafeEqual(expectedBuffer, digestBuffer)) throw new BadRequestException("Firma Stripe invalida");
  }

  private async createStripeCheckoutSession(principal: AuthPrincipal, subscription: any, planPrice: any, stripePriceId: string) {
    const stripeSecretKey = this.config.getOrThrow<string>("STRIPE_SECRET_KEY");
    const frontendUrl = this.config.get<string>("FRONTEND_URL") ?? "http://localhost:3000";
    const successUrl = this.config.get<string>("STRIPE_SUCCESS_URL") ?? `${frontendUrl}?stripe=success`;
    const cancelUrl = this.config.get<string>("STRIPE_CANCEL_URL") ?? `${frontendUrl}?stripe=cancel`;
    const customerId = subscription.stripeCustomerId || await this.createStripeCustomer(principal);
    if (!subscription.stripeCustomerId) {
      await (this.prisma as any).subscription.update({ where: { id: subscription.id }, data: { stripeCustomerId: customerId } });
    }
    const body = new URLSearchParams({
      mode: "subscription",
      customer: customerId,
      client_reference_id: principal.organizationId ?? "",
      success_url: successUrl,
      cancel_url: cancelUrl,
      "line_items[0][price]": stripePriceId,
      "line_items[0][quantity]": "1",
      "metadata[organizationId]": principal.organizationId ?? "",
      "metadata[planPriceId]": planPrice.id,
      "metadata[plan]": planPrice.plan,
      "metadata[interval]": planPrice.interval,
      "subscription_data[metadata][organizationId]": principal.organizationId ?? "",
      "subscription_data[metadata][planPriceId]": planPrice.id,
    });
    if (subscription.status === "TRIALING" && subscription.trialDaysLeft > 0) {
      body.set("subscription_data[trial_period_days]", String(subscription.trialDaysLeft));
    }
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${stripeSecretKey}`, "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.url) throw new BadRequestException(this.stripeErrorMessage(payload, "Stripe no pudo crear el checkout"));
    return payload as { id: string; url: string };
  }

  private async createStripeCustomer(principal: AuthPrincipal) {
    const stripeSecretKey = this.config.getOrThrow<string>("STRIPE_SECRET_KEY");
    const body = new URLSearchParams({
      email: principal.email,
      name: principal.name,
      "metadata[userId]": principal.userId,
      "metadata[organizationId]": principal.organizationId ?? "",
    });
    const response = await fetch("https://api.stripe.com/v1/customers", {
      method: "POST",
      headers: { authorization: `Bearer ${stripeSecretKey}`, "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.id) throw new BadRequestException(this.stripeErrorMessage(payload, "Stripe no pudo crear el cliente"));
    return String(payload.id);
  }

  private stripeErrorMessage(payload: any, fallback: string) {
    const message = typeof payload?.error?.message === "string" ? payload.error.message : "";
    if (message.toLowerCase().includes("invalid api key")) {
      return "La clave secreta de Stripe no es valida. Genera una nueva sk_test en Stripe, actualiza STRIPE_SECRET_KEY y reinicia la API.";
    }
    if (message.toLowerCase().includes("no such price")) {
      return "El price_id de Stripe no existe en esta cuenta. Revisa que los STRIPE_PRICE_* pertenezcan a la misma cuenta que la sk_test.";
    }
    return message || fallback;
  }
}
