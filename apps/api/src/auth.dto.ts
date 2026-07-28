import { IsEmail, IsOptional, IsString, IsUUID, Length, MaxLength } from "class-validator";

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @Length(8, 200) password!: string;
  @IsOptional() @IsString() @MaxLength(100) organizationSlug?: string;
}

export class SelectOrganizationDto {
  @IsUUID() organizationId!: string;
}
