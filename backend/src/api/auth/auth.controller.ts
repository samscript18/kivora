import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { AuthService } from "./auth.service";
import { AuthenticatedUser, PrivyAuthGuard } from "./guards/privy-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post("sync") @UseGuards(PrivyAuthGuard)
  sync(@CurrentUser() user: AuthenticatedUser, @Body() body: { email?: string; name?: string }) { return this.auth.sync(user.privyUserId, body); }

  @Get("me") @UseGuards(PrivyAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) { return user; }

  @Get("organizations") @UseGuards(PrivyAuthGuard)
  organizations(@CurrentUser() user: AuthenticatedUser) { return this.auth.listOrganizations(user.sub); }
}
