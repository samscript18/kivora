import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { ApprovalGuard } from "./guards/approval.guard";
import { PrivyAuthGuard } from "./guards/privy-auth.guard";
import { User, UserSchema } from "./schemas/user.schema";
import { Membership, MembershipSchema } from "./schemas/membership.schema";
import { Organization, OrganizationSchema } from "./schemas/organization.schema";
import { Invitation, InvitationSchema } from "./schemas/invitation.schema";
import { InvitationEmailService } from "./services/invitation-email.service";

@Module({
  imports: [
    HttpModule.register({ timeout: 15_000, maxRedirects: 2 }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: Membership.name, schema: MembershipSchema },
      { name: Invitation.name, schema: InvitationSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, InvitationEmailService, ApprovalGuard, PrivyAuthGuard],
  exports: [AuthService, ApprovalGuard, PrivyAuthGuard],
})
export class AuthModule {}
