import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";

export const BILLING_INTERVALS = ["MONTHLY", "YEARLY"] as const;
export const BILLING_PLANS = ["MICRO", "STARTER", "PRO", "ENTERPRISE"] as const;
type BillingIntervalValue = (typeof BILLING_INTERVALS)[number];
type BillingPlanValue = (typeof BILLING_PLANS)[number];

export class CheckoutDto {
  @IsUUID() planPriceId!: string;
}

export class ReconcileCheckoutDto {
  @IsString() sessionId!: string;
}

export class PreviewPlanDto {
  @IsEnum(BILLING_PLANS) plan!: BillingPlanValue;
  @IsEnum(BILLING_INTERVALS) interval!: BillingIntervalValue;
}

export const BILLING_MOCK_ACTIONS = ["ACTIVATE_PLAN", "CHANGE_PLAN", "CANCEL_RENEWAL", "RENEW", "EXPIRE_TRIAL"] as const;
type BillingMockActionValue = (typeof BILLING_MOCK_ACTIONS)[number];

export class BillingMockActionDto {
  @IsEnum(BILLING_MOCK_ACTIONS) action!: BillingMockActionValue;
  @IsOptional() @IsUUID() planPriceId?: string;
}
