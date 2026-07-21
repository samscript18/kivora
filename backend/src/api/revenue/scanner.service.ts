import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { RevenueService } from "./revenue.service";
@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);
  constructor(private readonly revenue: RevenueService) {}
  @Cron("0 */2 * * * *")
  async scheduledScan() { try { await this.revenue.scanPortfolio(); } catch (error) { this.logger.error("Portfolio scan failed", error instanceof Error ? error.stack : undefined); } }

  @Cron("0 0 7 * * *", { timeZone: "Africa/Lagos" })
  async morningBriefing() { try { await this.revenue.sendDailyBriefing(); } catch (error) { this.logger.error("Daily briefing failed", error instanceof Error ? error.stack : undefined); } }
}
