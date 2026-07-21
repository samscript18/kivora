import { Global, Module } from "@nestjs/common";
import { MetricsService } from "./metrics.service";
import { MonitoringController } from "./monitoring.controller";
import { AuthModule } from "../auth/auth.module";

@Global()
@Module({ imports: [AuthModule], controllers: [MonitoringController], providers: [MetricsService], exports: [MetricsService] })
export class MonitoringModule {}
