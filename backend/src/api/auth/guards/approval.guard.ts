import { CanActivate,ExecutionContext,Injectable,UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrivyAuthGuard } from "./privy-auth.guard";
@Injectable()
export class ApprovalGuard implements CanActivate {
  constructor(private readonly config:ConfigService,private readonly privy:PrivyAuthGuard){}
  async canActivate(context:ExecutionContext){const request=context.switchToHttp().getRequest<{headers:Record<string,string>;user?:{role:string}}>();const expected=this.config.get<string>("KIVORA_APPROVAL_TOKEN");const supplied=request.headers["x-kivora-approval-token"];if(expected&&supplied===expected)return true;await this.privy.canActivate(context);if(request.user&&["manager","admin"].includes(request.user.role))return true;throw new UnauthorizedException("Manager authentication or a valid approval token is required")}
}
