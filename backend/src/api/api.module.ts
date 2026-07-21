import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AppController } from "../app.controller";
import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { RevenueModule } from "./revenue/revenue.module";

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, AuthModule, IntegrationsModule, RevenueModule, HealthModule],
  controllers: [AppController],
})
export class ApiModule {}
