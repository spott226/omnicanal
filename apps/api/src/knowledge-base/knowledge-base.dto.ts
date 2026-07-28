import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export const DISCOUNT_TYPES = ["PERCENTAGE", "FIXED_AMOUNT"] as const;
export const POLICY_TYPES = ["TERMS", "PRIVACY", "RETURNS", "SHIPPING", "CANCELLATION", "CUSTOM"] as const;
export const DAYS_OF_WEEK = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type DiscountTypeValue = (typeof DISCOUNT_TYPES)[number];
export type PolicyTypeValue = (typeof POLICY_TYPES)[number];
export type DayOfWeekValue = (typeof DAYS_OF_WEEK)[number];

export class KnowledgePageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsEnum(["asc", "desc"]) sort: "asc" | "desc" = "desc";
  @IsOptional() @IsBoolean() @Type(() => Boolean) active?: boolean;
}

class CategoryReferenceDto {
  @IsOptional() @IsUUID() categoryId?: string;
}

export class CreateFaqDto extends CategoryReferenceDto {
  @IsString() @MinLength(3) @MaxLength(500) question!: string;
  @IsString() @MinLength(1) @MaxLength(10_000) answer!: string;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateFaqDto extends CategoryReferenceDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(500) question?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(10_000) answer?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class ProductFieldsDto extends CategoryReferenceDto {
  @IsOptional() @IsString() @MaxLength(4_000) description?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateProductDto extends ProductFieldsDto {
  @IsString() @MinLength(1) @MaxLength(80) sku!: string;
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
}

export class UpdateProductDto extends ProductFieldsDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) sku?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
}

class ServiceFieldsDto extends CategoryReferenceDto {
  @IsOptional() @IsString() @MaxLength(4_000) description?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsInt() @IsPositive() @Max(525_600) durationMinutes?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateServiceDto extends ServiceFieldsDto {
  @IsString() @MinLength(1) @MaxLength(80) code!: string;
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
}

export class UpdateServiceDto extends ServiceFieldsDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) code?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
}

class PromotionFieldsDto {
  @IsOptional() @IsString() @MaxLength(4_000) description?: string;
  @IsOptional() @IsEnum(DISCOUNT_TYPES) discountType?: DiscountTypeValue;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() discountValue?: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreatePromotionDto {
  @IsString() @MinLength(1) @MaxLength(80) code!: string;
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(4_000) description?: string;
  @IsEnum(DISCOUNT_TYPES) discountType!: DiscountTypeValue;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() discountValue!: number;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdatePromotionDto extends PromotionFieldsDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) code?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
}

export class ScheduleEntryDto {
  @IsEnum(DAYS_OF_WEEK) dayOfWeek!: DayOfWeekValue;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) opensAt?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) closesAt?: string;
  @IsOptional() @IsBoolean() closed?: boolean;
}

class ScheduleFieldsDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) timezone?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => ScheduleEntryDto) entries?: ScheduleEntryDto[];
}

export class CreateScheduleDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsString() @MinLength(1) @MaxLength(100) timezone!: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => ScheduleEntryDto) entries?: ScheduleEntryDto[];
}

export class UpdateScheduleDto extends ScheduleFieldsDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
}

class PolicyFieldsDto extends CategoryReferenceDto {
  @IsOptional() @IsEnum(POLICY_TYPES) type?: PolicyTypeValue;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(20_000) content?: string;
  @IsOptional() @IsInt() @Min(1) version?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreatePolicyDto extends CategoryReferenceDto {
  @IsEnum(POLICY_TYPES) type!: PolicyTypeValue;
  @IsString() @MinLength(1) @MaxLength(300) title!: string;
  @IsString() @MinLength(1) @MaxLength(20_000) content!: string;
  @IsOptional() @IsInt() @Min(1) version?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdatePolicyDto extends PolicyFieldsDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) title?: string;
}
