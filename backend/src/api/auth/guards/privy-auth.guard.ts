import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
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
    let claims: { user_id: string };
    try {
      claims = await this.client.utils().auth().verifyAccessToken(bearer);
    } catch {
      throw new UnauthorizedException("Privy access token is invalid or expired");
    }
    // Keep Kivora user/org loading outside the Privy verification catch. A
    // membership or database problem must not be misreported as an expired JWT.
    const requestedOrganizationId = request.headers["x-kivora-organization-id"];
    let user = await this.auth.findOrCreate(claims.user_id, requestedOrganizationId);
    // The access-token claims intentionally contain an ID, not personal profile
    // fields. If a record was first hydrated without an email, resolve the
    // verified account from Privy itself before an invitation can compare it.
    // This also means a browser-provided /auth/sync body is never the authority
    // for invitation access.
    if (!user.email) {
      const profile = await this.getVerifiedProfile(claims.user_id);
      if (profile.email || profile.name) user = await this.auth.findOrCreate(claims.user_id, requestedOrganizationId, profile);
    }
    request.user = { sub: user.id, privyUserId: user.privyUserId, email: user.email, name: user.name, role: user.role, organizationId: user.organizationId!, organizationRole: user.organizationRole! };
    return true;
  }

  private async getVerifiedProfile(privyUserId: string): Promise<{ email?: string; name?: string }> {
    if (!this.client) return {};
    try {
      // The current public `users()` wrapper only exposes identity-token
      // parsing, while Privy's authenticated API resource exposes `_get`.
      // Keep the narrow cast here rather than accepting an email from the
      // browser for an authorization decision.
      const apiClient = this.client as unknown as {
        privyApiClient: { users: { _get: (id: string) => Promise<{ linked_accounts: unknown[] }> } };
      };
      const privyUser = await apiClient.privyApiClient.users._get(privyUserId);
      const accounts = privyUser.linked_accounts as Array<{ type: string; address?: string; email?: string | null; name?: string | null }>;
      const emailAccount = accounts.find((account) => account.type === "email" && this.isEmail(account.address));
      const oauthAccount = accounts.find((account) => this.isEmail(account.email));
      const email = emailAccount?.address || oauthAccount?.email || undefined;
      const name = oauthAccount?.name || undefined;
      return {
        ...(email ? { email: email.toLowerCase() } : {}),
        ...(name ? { name } : {}),
      };
    } catch {
      // Authentication has already been cryptographically verified. Preserve
      // normal product access if Privy's profile endpoint is transiently down;
      // invitation acceptance will safely reject when no verified email exists.
      return {};
    }
  }

  private isEmail(value: unknown): value is string {
    return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }
}
