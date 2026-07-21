import { Controller, Get, UseGuards } from "@nestjs/common";
import { MetricsService } from "./metrics.service";
import { ApprovalGuard } from "../auth/guards/approval.guard";

@Controller("metrics")
@UseGuards(ApprovalGuard)
export class MonitoringController { constructor(private readonly metrics: MetricsService) {} @Get() snapshot() { return this.metrics.snapshot(); } }
