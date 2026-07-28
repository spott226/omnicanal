import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import type { AuthPrincipal } from "../../../../packages/shared/src/index";
import { CurrentPrincipal, Protected } from "../security";
import { BillingService } from "./billing.service";
import { CheckoutDto } from "./billing.dto";

const ADMINS = ["SUPER_ADMIN", "ORGANIZATION_ADMIN"] as const;

@Controller("billing")
export class BillingController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  @Get("plans") @Protected(...ADMINS) plans() { return this.billing.plans(); }
  @Get("subscription") @Protected(...ADMINS) subscription(@CurrentPrincipal() principal: AuthPrincipal) { return this.billing.currentSubscription(principal); }
  @Get("usage") @Protected(...ADMINS) usage(@CurrentPrincipal() principal: AuthPrincipal) { return this.billing.usage(principal); }
  @Post("checkout") @Protected(...ADMINS) checkout(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: CheckoutDto) { return this.billing.createCheckout(principal, dto.planPriceId); }
}
