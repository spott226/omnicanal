import { IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
const CHANNELS = ["INSTAGRAM", "WHATSAPP", "FACEBOOK"] as const;
const TEMPERATURES = ["COLD", "WARM", "HOT"] as const;
const TRIGGER_TYPES = ["KEYWORD", "LEAD_SCORE", "APPOINTMENT", "NO_RESPONSE", "MANUAL"] as const;
const REMINDER_TYPES = ["FOLLOW_UP", "APPOINTMENT", "CUSTOM"] as const;
const TEAM_ROLES = ["ORGANIZATION_ADMIN", "SUPERVISOR", "AGENT"] as const;
type ChannelValue = (typeof CHANNELS)[number];
type TemperatureValue = (typeof TEMPERATURES)[number];
type TriggerTypeValue = (typeof TRIGGER_TYPES)[number];
type ReminderTypeValue = (typeof REMINDER_TYPES)[number];
type TeamRoleValue = (typeof TEAM_ROLES)[number];

export class PageQueryDto {
  @IsOptional() @IsInt() @Min(1) page = 1;
  @IsOptional() @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsString() @MaxLength(30) sort = "desc";
}

export class CreateContactDto {
  @IsString() @MaxLength(100) firstName!: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEnum(TEMPERATURES) leadTemperature?: TemperatureValue;
  @IsOptional() @IsInt() @Min(0) @Max(100) leadScore?: number;
}
export class UpdateContactDto extends CreateContactDto {}

export class SendMessageDto { @IsString() @MaxLength(4000) content!: string; }
export class CreateNoteDto { @IsUUID() contactId!: string; @IsString() @MaxLength(4000) content!: string; }
export class CreateTagDto { @IsString() @MaxLength(60) name!: string; @IsString() @MaxLength(20) color!: string; }
export class ContactTagDto { @IsUUID() contactId!: string; @IsUUID() tagId!: string; }
export class PromptDto { @IsString() @MaxLength(80) agentName!: string; @IsString() @MaxLength(20000) content!: string; @IsOptional() @IsBoolean() publish?: boolean; }
export class AISimulateDto { @IsString() @MaxLength(4000) message!: string; @IsOptional() @IsString() @MaxLength(30) channel?: string; @IsOptional() @IsInt() @Min(0) @Max(20) turn?: number; }
export class AutomationDto { @IsString() @MaxLength(120) name!: string; @IsOptional() @IsEnum(CHANNELS) channel?: ChannelValue; @IsEnum(TRIGGER_TYPES) triggerType!: TriggerTypeValue; configuration!: Record<string, unknown>; @IsOptional() @IsBoolean() active?: boolean; }
export class AppointmentDto { @IsUUID() contactId!: string; @IsOptional() @IsUUID() conversationId?: string; @IsDateString() scheduledAt!: string; @IsOptional() @IsString() @MaxLength(500) meetingUrl?: string; }
export class ReminderDto { @IsUUID() contactId!: string; @IsOptional() @IsUUID() conversationId?: string; @IsDateString() scheduledAt!: string; @IsEnum(REMINDER_TYPES) type!: ReminderTypeValue; }
export class InviteMemberDto { @IsString() @MaxLength(120) name!: string; @IsEmail() email!: string; @IsEnum(TEAM_ROLES) role!: TeamRoleValue; }
export class UpdateMemberRoleDto { @IsEnum(TEAM_ROLES) role!: TeamRoleValue; }
