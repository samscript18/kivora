import { CanActivate,ExecutionContext,Injectable,UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrivyAuthGuard } from "./privy-auth.guard";
@Injectable()
export class ApprovalGuard implements CanActivate {
  constructor(private readonly config:ConfigService,private readonly privy:PrivyAuthGuard){}
  async canActivate(context:ExecutionContext){const request=context.switchToHttp().getRequest<{headers:Record<string,string>;user?:{role:string;organizationRole?:string}}>();const expected=this.config.get<string>("KIVORA_APPROVAL_TOKEN");const supplied=request.headers["x-kivora-approval-token"];if(expected&&supplied===expected)return true;await this.privy.canActivate(context);const role=request.user?.organizationRole||request.user?.role;if(role&&["owner","administrator","revenue_manager","manager","admin"].includes(role))return true;throw new UnauthorizedException("Revenue Manager permission or a valid approval token is required")}
}
