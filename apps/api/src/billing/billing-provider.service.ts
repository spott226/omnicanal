import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthPrincipal } from "../../../../packages/shared/src/index";
import { PrismaService } from "../prisma.service";

type BillingMockAction = "ACTIVATE_PLAN" | "CHANGE_PLAN" | "CANCEL_RENEWAL" | "RENEW" | "EXPIRE_TRIAL";

@Injectable()
export class BillingProviderService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(ConfigService) private readonly config: ConfigService) {}

  mode() {
    return (this.config.get<string>("BILLING_PROVIDER_MODE") ?? "mock").toLowerCase();
  }

  async simulate(principal: AuthPrincipal, action: BillingMockAction, planPriceId?: string) {
    if (!principal.organizationId) throw new ForbiddenException("Organizacion requerida");
    if (this.mode() !== "mock") throw new BadRequestException("Las simulaciones solo estan disponibles con BILLING_PROVIDER_MODE=mock");

    const subscription = await this.subscription(principal.organizationId);
    const now = new Date();
    const update = await this.updateForAction(principal.organizationId, subscription, action, now, planPriceId);
    const updated = await (this.prisma as any).subscription.update({ where: { id: subscription.id }, data: update, include: { planPrice: true } });
    await (this.prisma as any).billingEvent.create({
      data: {
        organizationId: principal.organizationId,
        provider: "MOCK",
        type: `MOCK_${action}`,
        payload: { mode: "mock", action, planPriceId: update.planPriceId ?? subscription.planPriceId },
      },
    });
    return {
      provider: "MOCK",
      mode: "mock",
      action,
      stripeTouched: false,
      message: this.message(action),
      subscription: updated,
    };
  }

  private async subscription(organizationId: string) {
    const subscription = await (this.prisma as any).subscription.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { planPrice: true },
    });
    if (!subscription) throw new NotFoundException("Suscripcion no encontrada");
    return subscription;
  }

  private async updateForAction(organizationId: string, subscription: any, action: BillingMockAction, now: Date, planPriceId?: string) {
    const thirtyDays = 30 * 86_400_000;
    if (action === "ACTIVATE_PLAN") {
      return { status: "ACTIVE", cancelAtPeriodEnd: false, currentPeriodStartsAt: now, currentPeriodEndsAt: new Date(now.getTime() + thirtyDays) };
    }
    if (action === "CHANGE_PLAN") {
      if (!planPriceId) throw new BadRequestException("planPriceId requerido para cambiar plan");
      const planPrice = await (this.prisma as any).planPrice.findFirst({ where: { id: planPriceId, active: true } });
      if (!planPrice) throw new BadRequestException("Plan no disponible");
      return { planPriceId: planPrice.id, status: "ACTIVE", cancelAtPeriodEnd: false, currentPeriodStartsAt: now, currentPeriodEndsAt: new Date(now.getTime() + thirtyDays) };
    }
    if (action === "CANCEL_RENEWAL") {
      return { cancelAtPeriodEnd: true };
    }
    if (action === "RENEW") {
      return { status: "ACTIVE", cancelAtPeriodEnd: false, currentPeriodStartsAt: now, currentPeriodEndsAt: new Date(now.getTime() + thirtyDays) };
    }
    if (action === "EXPIRE_TRIAL") {
      return { status: "INCOMPLETE", trialEndsAt: now, currentPeriodEndsAt: now };
    }
    throw new BadRequestException(`Accion mock no soportada para ${organizationId}`);
  }

  private message(action: BillingMockAction) {
    return {
      ACTIVATE_PLAN: "Plan activado en modo mock. No se cobro en Stripe.",
      CHANGE_PLAN: "Plan cambiado en modo mock. No se creo sesion de Stripe.",
      CANCEL_RENEWAL: "Renovacion cancelada en modo mock.",
      RENEW: "Periodo renovado en modo mock.",
      EXPIRE_TRIAL: "Trial vencido en modo mock para probar bloqueo posterior.",
    }[action];
  }
}
