import { Body, Controller, Delete, Get, Headers, Param, Post, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApprovalGuard } from "../auth/guards/approval.guard";
import { AuthenticatedUser, PrivyAuthGuard } from "../auth/guards/privy-auth.guard";
import { TelegramService } from "../integrations/services/telegram.service";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { AskDto, ResolveDto, StrategyDto, UnderwriteDto } from "./dto/revenue.dto";
import { RevenueService } from "./revenue.service";

@Controller()
export class RevenueController {
  constructor(private readonly revenue: RevenueService, private readonly telegram: TelegramService, private readonly config: ConfigService) {}
  @Get("capabilities") capabilities() { return this.revenue.capabilities(); }
  @Get("dashboard") @UseGuards(PrivyAuthGuard) dashboard() { return this.revenue.dashboard(); }
  @Get("portfolio") @UseGuards(PrivyAuthGuard) portfolio() { return this.revenue.portfolio(); }
  @Get("incidents") @UseGuards(PrivyAuthGuard) incidents() { return this.revenue.getIncidents(); }
  @Get("opportunities") @UseGuards(PrivyAuthGuard) opportunities() { return this.revenue.getOpportunities(); }
  @Get("owner-briefs") @UseGuards(PrivyAuthGuard) briefs() { return this.revenue.getBriefs(); }
  @Post("owner-briefs/:id/send") @UseGuards(PrivyAuthGuard) sendBrief(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.revenue.sendBrief(id, user.sub); }
  @Post("scan") @UseGuards(ApprovalGuard) scan() { return this.revenue.scanPortfolio(); }
  @Post("underwrite") @UseGuards(PrivyAuthGuard) underwrite(@Body() body: UnderwriteDto) { return this.revenue.underwrite(body.address, body.marketId, body.acquisitionCost, body.annualExpenses); }
  @Post("incidents/:id/preview") @UseGuards(PrivyAuthGuard) preview(@Param("id") id: string) { return this.revenue.preview(id); }
  @Post("incidents/:id/resolve") @UseGuards(ApprovalGuard) resolve(@Param("id") id: string, @Body() body: ResolveDto) { return this.revenue.resolve(id, body.approvedBy || "Revenue manager"); }

  @Get("market-intelligence") @UseGuards(PrivyAuthGuard) marketIntelligence() { return this.revenue.getMarketIntelligence(); }
  @Post("market-intelligence/refresh") @UseGuards(ApprovalGuard) refreshMarketIntelligence() { return this.revenue.refreshMarketIntelligence(); }
  @Get("listings/:id/strategies") @UseGuards(PrivyAuthGuard) strategies(@Param("id") id: string) { return this.revenue.strategies(id); }
  @Post("listings/:id/strategies/apply") @UseGuards(ApprovalGuard) applyStrategy(@Param("id") id: string, @Body() body: StrategyDto, @CurrentUser() user: AuthenticatedUser) { return this.revenue.applyStrategy(id, body.strategy, user?.name || "Revenue manager"); }
  @Get("segments") @UseGuards(PrivyAuthGuard) segments() { return this.revenue.segments(); }
  @Get("segments/:id") @UseGuards(PrivyAuthGuard) segment(@Param("id") id: string) { return this.revenue.segment(Number(id)); }
  @Get("activity") @UseGuards(PrivyAuthGuard) activity() { return this.revenue.getActivity(); }
  @Get("reports") @UseGuards(PrivyAuthGuard) reports() { return this.revenue.getReports(); }
  @Post("reports/executive") @UseGuards(PrivyAuthGuard) generateReport(@CurrentUser() user: AuthenticatedUser) { return this.revenue.generateExecutiveReport(user.name); }
  @Post("assistant/ask") @UseGuards(PrivyAuthGuard) ask(@Body() body: AskDto) { return this.revenue.ask(body.question); }

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
    if (message?.text === "/opportunities" && message?.chat?.id && message?.from?.id) {
      await this.telegram.linkedActor(String(message.chat.id), String(message.from.id));
      const items = await this.revenue.getOpportunities();
      const text = items.length ? items.slice(0, 8).map((item, index) => `${index + 1}. ${item.property}\n${item.action}\nEstimated impact: $${item.impact.toLocaleString()} · ${item.confidence}% confidence`).join("\n\n") : "No live revenue opportunities are currently open.";
      return this.telegram.sendToChat(String(message.chat.id), text);
    }
    if (message?.text === "/help" && message?.chat?.id) return this.telegram.sendToChat(String(message.chat.id), "Kivora commands\n/briefing — portfolio summary\n/opportunities — ranked revenue opportunities\n\nOr ask a question about your live portfolio in natural language.");
    if (typeof message?.text === "string" && !message.text.startsWith("/") && message?.chat?.id && message?.from?.id) {
      await this.telegram.linkedActor(String(message.chat.id), String(message.from.id));
      const response = await this.revenue.ask(message.text.slice(0, 500));
      return this.telegram.sendToChat(String(message.chat.id), response.body.slice(0, 4000));
    }
    return { ok: true };
  }
}
