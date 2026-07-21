import { CanActivate, ExecutionContext, HttpException, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrivyClient } from "@privy-io/node";
import { AuthService } from "../auth.service";

export type AuthenticatedUser = { sub: string; privyUserId: string; email?: string; name: string; role: string; organizationId: string; organizationRole: string };

@Injectable()
export class PrivyAuthGuard implements CanActivate {
  private readonly client?: PrivyClient;

  constructor(config: ConfigService, private readonly auth: AuthService) {
    const appId = config.get<string>("PRIVY_APP_ID");
    const appSecret = config.get<string>("PRIVY_APP_SECRET");
    if (appId && appSecret) this.client = new PrivyClient({ appId, appSecret });
  }

  async canActivate(context: ExecutionContext) {
    if (!this.client) throw new ServiceUnavailableException("Privy authentication is not configured");
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: AuthenticatedUser }>();
    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!bearer) throw new UnauthorizedException("Privy authentication is required");
    try {
      const claims = await this.client.utils().auth().verifyAccessToken(bearer);
      const requestedOrganizationId = request.headers["x-kivora-organization-id"];
      const user = await this.auth.findOrCreate(claims.user_id, requestedOrganizationId);
      request.user = { sub: user.id, privyUserId: user.privyUserId, email: user.email, name: user.name, role: user.role, organizationId: user.organizationId!, organizationRole: user.organizationRole! };
      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new UnauthorizedException("Privy access token is invalid or expired");
    }
  }
}
