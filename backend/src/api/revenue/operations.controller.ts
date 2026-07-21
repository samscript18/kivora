import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { AuthenticatedUser, PrivyAuthGuard } from "../auth/guards/privy-auth.guard";
import { ConnectionService } from "./connection.service";
import { CreateConnectionDto, CreatePortfolioDto, MoveListingDto, ReplaceCredentialDto } from "./dto/operations.dto";

@Controller("wheelhouse-connections")
@UseGuards(PrivyAuthGuard)
export class OperationsController {
  constructor(private readonly connections: ConnectionService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.connections.list(user); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateConnectionDto) { return this.connections.create(user, body.displayName, body.credential); }
  @Post(":id/test") test(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.connections.test(user, id); }
  @Patch(":id/credential") replace(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: ReplaceCredentialDto) { return this.connections.replace(user, id, body.credential); }
  @Delete(":id") revoke(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.connections.revoke(user, id); }
}

@Controller("portfolios")
@UseGuards(PrivyAuthGuard)
export class PortfolioOperationsController {
  constructor(private readonly connections: ConnectionService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.connections.listPortfolios(user); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreatePortfolioDto) { return this.connections.createPortfolio(user, body); }
  @Post("listings/:id/move") move(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: MoveListingDto) { return this.connections.moveListing(user, id, body.portfolioId); }
  @Delete(":id") archive(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.connections.archivePortfolio(user, id); }
}
