import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { RevenueService } from "./revenue.service";
import {TelegramService}from"../integrations/services/telegram.service";
@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);
  constructor(private readonly revenue: RevenueService,private readonly telegram:TelegramService) {}
  @Cron("0 */2 * * * *")
  async scheduledScan() { try { await this.revenue.scanAllOrganizations(); } catch (error) { this.logger.error("Portfolio scan failed", error instanceof Error ? error.stack : undefined); } }

  @Cron("15 * * * * *")
  async scheduledActions() { try { await this.revenue.executeScheduledActions(); } catch (error) { this.logger.error("Scheduled revenue actions failed", error instanceof Error ? error.stack : undefined); } }
  @Cron("30 */5 * * * *")async approachingSchedules(){try{await this.revenue.notifyApproachingSchedules();}catch(error){this.logger.error("Scheduled notification failed",error instanceof Error?error.stack:undefined);}}

  @Cron("30 10 * * * *")
  async outcomeEvaluation() { try { await this.revenue.evaluateOutcomes(); } catch (error) { this.logger.error("Outcome evaluation failed", error instanceof Error ? error.stack : undefined); } }

  @Cron("45 */5 * * * *")
  async deliveryRetries(){try{await this.telegram.retryFailedDeliveries();}catch(error){this.logger.error("Notification retry failed",error instanceof Error?error.stack:undefined);}}

  @Cron("0 0 * * * *", { timeZone: "UTC" })
  async morningBriefing() { try { await this.revenue.briefAllOrganizations(); } catch (error) { this.logger.error("Daily briefing failed", error instanceof Error ? error.stack : undefined); } }
  @Cron("0 5 * * * *", { timeZone: "UTC" })
  async endOfDaySummary(){try{await this.revenue.endOfDayAllOrganizations();}catch(error){this.logger.error("End-of-day summary failed",error instanceof Error?error.stack:undefined);}}
}
