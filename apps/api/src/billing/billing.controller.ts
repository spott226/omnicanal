import { Body, Controller, Get, Headers, Inject, Post, Req } from "@nestjs/common";
import type { AuthPrincipal } from "../../../../packages/shared/src/index";
import { AllowInactiveSubscription, CurrentPrincipal, Protected } from "../security";
import { BillingProviderService } from "./billing-provider.service";
import { BillingService } from "./billing.service";
import { BillingMockActionDto, CheckoutDto } from "./billing.dto";

const ADMINS = ["SUPER_ADMIN", "ORGANIZATION_ADMIN"] as const;

@AllowInactiveSubscription()
@Controller("billing")
export class BillingController {
  constructor(@Inject(BillingService) private readonly billing: BillingService, @Inject(BillingProviderService) private readonly provider: BillingProviderService) {}

  @Get("plans") @Protected(...ADMINS) plans() { return this.billing.plans(); }
  @Get("subscription") @Protected(...ADMINS) subscription(@CurrentPrincipal() principal: AuthPrincipal) { return this.billing.currentSubscription(principal); }
  @Get("usage") @Protected(...ADMINS) usage(@CurrentPrincipal() principal: AuthPrincipal) { return this.billing.usage(principal); }
  @Post("checkout") @Protected(...ADMINS) checkout(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: CheckoutDto) { return this.billing.createCheckout(principal, dto.planPriceId); }
  @Post("stripe/webhook") stripeWebhook(@Req() request: any, @Headers("stripe-signature") signature = "") { return this.billing.handleStripeWebhook(request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {})), signature); }
  @Post("simulate") @Protected(...ADMINS) simulate(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: BillingMockActionDto) { return this.provider.simulate(principal, dto.action, dto.planPriceId); }
}
