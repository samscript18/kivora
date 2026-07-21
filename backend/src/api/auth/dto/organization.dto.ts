import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsTimeZone, Length, Matches, MaxLength } from "class-validator";
import { ORGANIZATION_ROLES, OrganizationRole } from "../schemas/membership.schema";

export class CreateOrganizationDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @Length(3, 80) slug?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) defaultCurrency?: string;
  @IsOptional() @IsTimeZone() defaultTimezone?: string;
}

export class UpdateOrganizationDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) defaultCurrency?: string;
  @IsOptional() @IsTimeZone() defaultTimezone?: string;
}

export class InviteMemberDto {
  @IsEmail() email!: string;
  @IsIn(ORGANIZATION_ROLES.filter((role) => role !== "owner")) role!: Exclude<OrganizationRole, "owner">;
}

export class AcceptInvitationDto { @IsString() @Length(32, 256) token!: string; }
export class ChangeMemberDto {
  @IsOptional() @IsIn(ORGANIZATION_ROLES.filter((role) => role !== "owner")) role?: Exclude<OrganizationRole, "owner">;
  @IsOptional() @IsIn(["active", "suspended", "removed"]) status?: "active" | "suspended" | "removed";
}
export class TransferOwnershipDto { @IsString() @IsNotEmpty() memberId!: string; }
