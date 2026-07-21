import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { ApprovalGuard } from "./guards/approval.guard";
import { PrivyAuthGuard } from "./guards/privy-auth.guard";
import { User, UserSchema } from "./schemas/user.schema";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, ApprovalGuard, PrivyAuthGuard],
  exports: [AuthService, ApprovalGuard, PrivyAuthGuard],
})
export class AuthModule {}
