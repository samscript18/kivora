import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { AuthService } from "./auth.service";
import { AuthenticatedUser, PrivyAuthGuard } from "./guards/privy-auth.guard";
import { AcceptInvitationDto, ChangeMemberDto, CreateOrganizationDto, InviteMemberDto, TransferOwnershipDto, UpdateOrganizationDto } from "./dto/organization.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post("sync") @UseGuards(PrivyAuthGuard)
  sync(@CurrentUser() user: AuthenticatedUser, @Body() body: { email?: string; name?: string }) { return this.auth.sync(user.privyUserId, body); }

  @Get("me") @UseGuards(PrivyAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) { return user; }

  @Get("organizations") @UseGuards(PrivyAuthGuard)
  organizations(@CurrentUser() user: AuthenticatedUser) { return this.auth.listOrganizations(user.sub); }

  @Post("organizations") @UseGuards(PrivyAuthGuard)
  createOrganization(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateOrganizationDto) { return this.auth.createOrganization(user.sub, body); }

  @Patch("organizations/current") @UseGuards(PrivyAuthGuard)
  updateOrganization(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateOrganizationDto) { return this.auth.updateOrganization(user, body); }

  @Post("organizations/current/default") @UseGuards(PrivyAuthGuard)
  setDefaultOrganization(@CurrentUser() user: AuthenticatedUser) { return this.auth.setDefaultOrganization(user.sub, user.organizationId); }

  @Get("organizations/current/members") @UseGuards(PrivyAuthGuard)
  members(@CurrentUser() user: AuthenticatedUser) { return this.auth.listMembers(user); }

  @Post("organizations/current/invitations") @UseGuards(PrivyAuthGuard)
  invite(@CurrentUser() user: AuthenticatedUser, @Body() body: InviteMemberDto) { return this.auth.invite(user, body); }

  @Delete("organizations/current/invitations/:id") @UseGuards(PrivyAuthGuard)
  revokeInvitation(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.auth.revokeInvitation(user, id); }

  @Post("invitations/accept") @UseGuards(PrivyAuthGuard)
  acceptInvitation(@CurrentUser() user: AuthenticatedUser, @Body() body: AcceptInvitationDto) { return this.auth.acceptInvitation(user, body.token); }

  @Patch("organizations/current/members/:id") @UseGuards(PrivyAuthGuard)
  changeMember(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: ChangeMemberDto) { return this.auth.changeMember(user, id, body); }

  @Post("organizations/current/transfer-ownership") @UseGuards(PrivyAuthGuard)
  transferOwnership(@CurrentUser() user: AuthenticatedUser, @Body() body: TransferOwnershipDto) { return this.auth.transferOwnership(user, body.memberId); }
}
