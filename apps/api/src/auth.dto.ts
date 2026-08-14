import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength } from "class-validator";

const REGISTER_PLANS = ["MICRO", "STARTER", "PRO", "ENTERPRISE"] as const;
const BILLING_INTERVALS = ["MONTHLY", "YEARLY"] as const;
type RegisterPlan = (typeof REGISTER_PLANS)[number];
type BillingInterval = (typeof BILLING_INTERVALS)[number];

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @Length(8, 200) password!: string;
  @IsOptional() @IsString() @MaxLength(100) organizationSlug?: string;
  @IsOptional() @IsBoolean() remember?: boolean;
}

export class SelectOrganizationDto {
  @IsUUID() organizationId!: string;
}

export class RegisterDto {
  @IsString() @MaxLength(120) name!: string;
  @IsEmail() email!: string;
  @IsString() @Length(10, 200) password!: string;
  @IsString() @MaxLength(120) businessName!: string;
  @IsEnum(REGISTER_PLANS) plan!: RegisterPlan;
  @IsEnum(BILLING_INTERVALS) interval!: BillingInterval;
  @IsOptional() @IsBoolean() startWithTrial?: boolean;
}

export class ForgotPasswordDto {
  @IsEmail() email!: string;
}

export class ResetPasswordDto {
  @IsString() @Length(20, 200) token!: string;
  @IsString() @Length(10, 200) password!: string;
}
