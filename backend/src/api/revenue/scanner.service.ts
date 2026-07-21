import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { RevenueService } from "./revenue.service";
@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);
  constructor(private readonly revenue: RevenueService) {}
  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledScan() { try { await this.revenue.scanPortfolio(); } catch (error) { this.logger.error("Portfolio scan failed", error instanceof Error ? error.stack : undefined); } }
}
