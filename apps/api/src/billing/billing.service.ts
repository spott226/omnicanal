import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthPrincipal } from "../../../../packages/shared/src/index";
import { PrismaService } from "../prisma.service";

const TRIAL_DAYS = 7;

@Injectable()
export class BillingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(ConfigService) private readonly config: ConfigService) {}

  private org(principal: AuthPrincipal) {
    if (!principal.organizationId) throw new ForbiddenException("Organización requerida");
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
    await (this.prisma as any).billingEvent.create({ data: { organizationId, type: "TRIAL_STARTED", payload: { trialDays: TRIAL_DAYS, plan: planPrice.plan } } });
    return this.withComputed(subscription);
  }

  async createCheckout(principal: AuthPrincipal, planPriceId: string) {
    const organizationId = this.org(principal);
    const planPrice = await (this.prisma as any).planPrice.findFirst({ where: { id: planPriceId, active: true } });
    if (!planPrice) throw new BadRequestException("Plan no disponible");
    await this.currentSubscription(principal);
    const stripeReady = Boolean(this.config.get<string>("STRIPE_SECRET_KEY") && planPrice.stripePriceId);
    await (this.prisma as any).billingEvent.create({ data: { organizationId, type: stripeReady ? "CHECKOUT_REQUESTED" : "CHECKOUT_PENDING_STRIPE_KEYS", payload: { planPriceId, plan: planPrice.plan, interval: planPrice.interval } } });
    return {
      provider: "STRIPE",
      status: stripeReady ? "READY_FOR_STRIPE_SESSION" : "STRIPE_CONFIGURATION_REQUIRED",
      checkoutUrl: null,
      message: stripeReady ? "Stripe está listo para crear la sesión real en la siguiente integración." : "Faltan STRIPE_SECRET_KEY y stripePriceId para activar cobro real.",
      planPrice,
    };
  }

  async usage(principal: AuthPrincipal) {
    const organizationId = this.org(principal);
    const subscription = await this.currentSubscription(principal);
    const periodStart = new Date(subscription.currentPeriodStartsAt);
    const conversations = await this.prisma.conversation.count({ where: { organizationId, createdAt: { gte: periodStart } } });
    return { conversations, monthlyContactsLimit: subscription.planPrice.monthlyContactsLimit, seatsLimit: subscription.planPrice.seatsLimit, percent: Math.min(100, Math.round((conversations / Math.max(1, subscription.planPrice.monthlyContactsLimit)) * 100)) };
  }

  private withComputed(subscription: any) {
    const now = Date.now();
    const trialEnds = new Date(subscription.trialEndsAt).getTime();
    const trialDaysLeft = Math.max(0, Math.ceil((trialEnds - now) / 86400000));
    return { ...subscription, trialDays: TRIAL_DAYS, trialDaysLeft, trialExpired: trialDaysLeft === 0 && subscription.status === "TRIALING" };
  }
}
