import { Body, Controller, Delete, Get, Headers, Param, Post, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApprovalGuard } from "../auth/guards/approval.guard";
import { AuthenticatedUser, PrivyAuthGuard } from "../auth/guards/privy-auth.guard";
import { TelegramService } from "../integrations/services/telegram.service";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { ResolveDto, UnderwriteDto } from "./dto/revenue.dto";
import { RevenueService } from "./revenue.service";

@Controller()
export class RevenueController {
  constructor(private readonly revenue: RevenueService, private readonly telegram: TelegramService, private readonly config: ConfigService) {}
  @Get("capabilities") capabilities() { return this.revenue.capabilities(); }
  @Get("dashboard") dashboard() { return this.revenue.dashboard(); }
  @Get("portfolio") portfolio() { return this.revenue.portfolio(); }
  @Get("incidents") incidents() { return this.revenue.getIncidents(); }
  @Get("opportunities") opportunities() { return this.revenue.getOpportunities(); }
  @Get("owner-briefs") briefs() { return this.revenue.getBriefs(); }
  @Post("owner-briefs/:id/send") @UseGuards(PrivyAuthGuard) sendBrief(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.revenue.sendBrief(id, user.sub); }
  @Post("scan") @UseGuards(ApprovalGuard) scan() { return this.revenue.scanPortfolio(); }
  @Post("underwrite") underwrite(@Body() body: UnderwriteDto) { return this.revenue.underwrite(body.address, body.marketId, body.acquisitionCost, body.annualExpenses); }
  @Post("incidents/:id/preview") preview(@Param("id") id: string) { return this.revenue.preview(id); }
  @Post("incidents/:id/resolve") @UseGuards(ApprovalGuard) resolve(@Param("id") id: string, @Body() body: ResolveDto) { return this.revenue.resolve(id, body.approvedBy || "Revenue manager"); }

  @Get("telegram/status") @UseGuards(PrivyAuthGuard)
  telegramStatus(@CurrentUser() user: AuthenticatedUser) { return this.telegram.status(user.sub); }

  @Post("telegram/link") @UseGuards(PrivyAuthGuard)
  telegramLink(@CurrentUser() user: AuthenticatedUser) { return this.telegram.createLink(user.sub); }

  @Post("telegram/connect") @UseGuards(PrivyAuthGuard)
  telegramConnect(@CurrentUser() user: AuthenticatedUser, @Body() body: { intent: string; signature: string }) { return this.telegram.consumeLinkIntent(user.sub, body.intent, body.signature); }

  @Delete("telegram/connection") @UseGuards(PrivyAuthGuard)
  telegramDisconnect(@CurrentUser() user: AuthenticatedUser) { return this.telegram.disconnect(user.sub); }

  @Post("telegram/webhook/register") @UseGuards(ApprovalGuard)
  telegramRegisterWebhook() {
    const publicUrl = this.config.get<string>("BACKEND_PUBLIC_URL");
    const secret = this.config.get<string>("TELEGRAM_WEBHOOK_SECRET");
    if (!publicUrl || !secret) throw new UnauthorizedException("Telegram webhook configuration is incomplete");
    return this.telegram.registerWebhook(publicUrl, secret);
  }

  @Post("telegram/webhook")
  async telegramWebhook(@Headers("x-telegram-bot-api-secret-token") suppliedSecret: string | undefined, @Body() body: Record<string, any>) {
    const expected = this.config.get<string>("TELEGRAM_WEBHOOK_SECRET");
    if (!expected || suppliedSecret !== expected) throw new UnauthorizedException("Telegram webhook signature is invalid");
    const message = body?.message;
    const start = typeof message?.text === "string" && /^\/start(?:\s+connect)?$/.test(message.text);
    if (start && message?.from && message?.chat) return this.telegram.createLinkIntent(message.from, message.chat);

    const callback = body?.callback_query;
    if (callback?.data && callback?.message?.chat?.id && callback?.from?.id) {
      const chatId = String(callback.message.chat.id);
      const actor = await this.telegram.linkedActor(chatId, String(callback.from.id));
      if (callback.data.startsWith("preview:")) {
        const result = await this.revenue.preview(callback.data.slice(8));
        await this.telegram.sendToChat(chatId, `📈 Live Wheelhouse preview\n\nCurrent revenue: $${result.currentRevenue.toLocaleString()}\nOptimized revenue: $${result.optimizedRevenue.toLocaleString()}\nProjected recovery: $${result.projectedRecovery.toLocaleString()}\n\nNo pricing was changed.`, { inline_keyboard: [[{ text: "Approve & restore pricing", callback_data: `approve:${callback.data.slice(8)}` }]] });
        return { ok: true };
      }
      if (callback.data.startsWith("approve:")) {
        if (!["manager", "admin"].includes(actor.role)) throw new UnauthorizedException("Manager approval is required");
        const result = await this.revenue.resolve(callback.data.slice(8), `${actor.name} via Telegram`);
        await this.telegram.sendToChat(chatId, `✅ Dynamic pricing restored and verified.\n\nProjected revenue protected: $${result.recovered.toLocaleString()}`);
        return { ok: true };
      }
    }

    if (message?.text === "/briefing" && message?.chat?.id && message?.from?.id) {
      await this.telegram.linkedActor(String(message.chat.id), String(message.from.id));
      const dashboard = await this.revenue.dashboard();
      return this.telegram.dailyBriefing(String(message.chat.id), dashboard.summary);
    }
    return { ok: true };
  }
}
