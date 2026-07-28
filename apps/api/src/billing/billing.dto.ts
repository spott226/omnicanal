import { IsEnum, IsUUID } from "class-validator";

export const BILLING_INTERVALS = ["MONTHLY", "YEARLY"] as const;
export const BILLING_PLANS = ["STARTER", "PRO", "ENTERPRISE"] as const;
type BillingIntervalValue = (typeof BILLING_INTERVALS)[number];
type BillingPlanValue = (typeof BILLING_PLANS)[number];

export class CheckoutDto {
  @IsUUID() planPriceId!: string;
}

export class PreviewPlanDto {
  @IsEnum(BILLING_PLANS) plan!: BillingPlanValue;
  @IsEnum(BILLING_INTERVALS) interval!: BillingIntervalValue;
}
