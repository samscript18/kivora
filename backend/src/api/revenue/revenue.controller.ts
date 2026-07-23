import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApprovalGuard } from '../auth/guards/approval.guard';
import { AuthenticatedUser, PrivyAuthGuard } from '../auth/guards/privy-auth.guard';
import { TelegramService } from '../integrations/services/telegram.service';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { AskDto, EditReportDto, ReportDto, StrategyDto, UnderwriteDto } from './dto/revenue.dto';
import {
  AssignWorkItemDto,
  CommentDto,
  ExecuteRecommendationDto,
  ScheduleRecommendationDto,
  TransitionRecommendationDto,
} from './dto/operations.dto';
import { RevenueService } from './revenue.service';
import { recommendedPricingStrategy } from './scheduled-action';

@Controller()
export class RevenueController {
  constructor(
    private readonly revenue: RevenueService,
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
  ) {}
  @Get('capabilities') @UseGuards(PrivyAuthGuard) capabilities(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.capabilitiesFor(user);
  }
  @Get('dashboard') @UseGuards(PrivyAuthGuard) dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.dashboard(user);
  }
  @Get('portfolio') @UseGuards(PrivyAuthGuard) portfolio(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.portfolio(user);
  }
  @Get('listings/:id/workspace') @UseGuards(PrivyAuthGuard) listingWorkspace(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.listingWorkspaceDepth(id, user);
  }
  @Get('incidents') @UseGuards(PrivyAuthGuard) incidents(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.getIncidents(user);
  }
  @Get('opportunities') @UseGuards(PrivyAuthGuard) opportunities(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.getOpportunities(user);
  }
  @Get('owner-briefs') @UseGuards(PrivyAuthGuard) briefs(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.getBriefs(user);
  }
  @Post('owner-briefs/:id/send') @UseGuards(PrivyAuthGuard) sendBrief(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.sendBrief(id, user.sub, user);
  }
  @Post('scan') @UseGuards(ApprovalGuard) scan(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.scanPortfolio(user);
  }
  @Post('underwrite') @UseGuards(PrivyAuthGuard) underwrite(@Body() body: UnderwriteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.revenue.underwrite(body.address, body.marketId, body.acquisitionCost, body.annualExpenses, user);
  }
  @Post('incidents/:id/preview') @UseGuards(PrivyAuthGuard) preview(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.revenue.preview(id, user);
  }
  @Post('incidents/:id/resolve') @UseGuards(ApprovalGuard) resolve(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.revenue.resolve(id, user || 'Approved service');
  }

  @Get('market-intelligence') @UseGuards(PrivyAuthGuard) marketIntelligence(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.getMarketIntelligence(user);
  }
  @Post('market-intelligence/refresh') @UseGuards(PrivyAuthGuard) refreshMarketIntelligence(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.refreshMarketIntelligence(user);
  }
  @Get('listings/:id/strategies') @UseGuards(PrivyAuthGuard) strategies(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.strategies(id, user);
  }
  @Post('listings/:id/strategies/apply') @UseGuards(ApprovalGuard) applyStrategy(
    @Param('id') id: string,
    @Body() body: StrategyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.applyStrategy(id, body.strategy, user);
  }
  @Get('segments') @UseGuards(PrivyAuthGuard) segments(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.segments(user);
  }
  @Get('segments/:id') @UseGuards(PrivyAuthGuard) segment(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.segment(Number(id), user);
  }
  @Get('activity') @UseGuards(PrivyAuthGuard) activity(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.getActivity(user);
  }
  @Get('reports') @UseGuards(PrivyAuthGuard) reports(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.getReports(user);
  }
  @Post('reports/executive') @UseGuards(PrivyAuthGuard) generateReport(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.generateExecutiveReport(user);
  }
  @Post('reports/generate') @UseGuards(PrivyAuthGuard) generateTypedReport(
    @Body() body: ReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.generateReport(body.type, user, body.listingId);
  }
  @Post('reports/:id/finalize') @UseGuards(PrivyAuthGuard) finalizeReport(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.finalizeReport(id, user);
  }
  @Post('reports/:id/deliver') @UseGuards(PrivyAuthGuard) deliverReport(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.deliverReport(id, user);
  }
  @Post('reports/:id/edit') @UseGuards(PrivyAuthGuard) editReport(
    @Param('id') id: string,
    @Body() body: EditReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.editReport(id, body.body, user);
  }
  @Get('reports/:id/export/:format')
  @UseGuards(PrivyAuthGuard)
  async exportReport(
    @Param('id') id: string,
    @Param('format') format: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: { setHeader(name: string, value: string): void; send(body: Buffer): void },
  ) {
    if (!(['pdf', 'csv'] as string[]).includes(format)) throw new UnauthorizedException('Unsupported report format');
    const exported = await this.revenue.exportReport(id, format as 'pdf' | 'csv', user);
    response.setHeader('Content-Type', exported.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(exported.buffer);
  }
  @Post('assistant/ask') @UseGuards(PrivyAuthGuard) ask(@Body() body: AskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.revenue.ask(body.question, user);
  }
  @Get('assistant/history') @UseGuards(PrivyAuthGuard) assistantHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.assistantHistory(user);
  }
  @Delete('assistant/history') @UseGuards(PrivyAuthGuard) clearAssistantHistory(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.clearAssistantHistory(user);
  }

  @Get('recommendations') @UseGuards(PrivyAuthGuard) recommendations(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.recommendations(user);
  }
  @Post('recommendations/:id/decision') @UseGuards(PrivyAuthGuard) recommendationDecision(
    @Param('id') id: string,
    @Body() body: TransitionRecommendationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.transitionRecommendation(id, body.decision, user, body.reason, body.until);
  }
  @Post('recommendations/:id/schedule') @UseGuards(PrivyAuthGuard) scheduleRecommendation(
    @Param('id') id: string,
    @Body() body: ScheduleRecommendationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.scheduleRecommendation(id, body.executeAt, user, body.reason, body.simulationId);
  }
  @Get('revenue-actions') @UseGuards(PrivyAuthGuard) actions(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.listActions(user);
  }
  @Post('revenue-actions/:id/revert') @UseGuards(PrivyAuthGuard) revertAction(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.revertAction(id, user);
  }
  @Get('outcomes') @UseGuards(PrivyAuthGuard) outcomes(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.listOutcomes(user);
  }
  @Get('work-items/:kind/:id') @UseGuards(PrivyAuthGuard) workItem(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.workItem(kind, id, user);
  }
  @Post('work-items/:kind/:id/assign') @UseGuards(PrivyAuthGuard) assignWorkItem(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: AssignWorkItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.assignWorkItem(kind, id, body.userId, user);
  }
  @Post('work-items/:kind/:id/comments') @UseGuards(PrivyAuthGuard) comment(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: CommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.commentOnWorkItem(kind, id, body.body, user);
  }
  @Post('recommendations/:id/simulations') @UseGuards(PrivyAuthGuard) recommendationSimulations(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.simulateRecommendation(id, user);
  }
  @Post('recommendations/:id/execute') @UseGuards(PrivyAuthGuard) executeRecommendation(
    @Param('id') id: string,
    @Body() body: ExecuteRecommendationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.executeRecommendation(id, body.simulationId, user);
  }
  @Get('notifications') @UseGuards(PrivyAuthGuard) notifications(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.listNotifications(user);
  }
  @Post('notifications/:id/read') @UseGuards(PrivyAuthGuard) readNotification(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revenue.readNotification(id, user);
  }
  @Get('operational-summary') @UseGuards(PrivyAuthGuard) operationalSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.operationalSummary(user);
  }

  @Get('telegram/status')
  @UseGuards(PrivyAuthGuard)
  telegramStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.telegram.status(user.sub, user.organizationId);
  }

  @Post('telegram/link')
  @UseGuards(PrivyAuthGuard)
  telegramLink(@CurrentUser() user: AuthenticatedUser) {
    return this.telegram.createLink(user.sub);
  }

  @Post('telegram/connect')
  @UseGuards(PrivyAuthGuard)
  telegramConnect(@CurrentUser() user: AuthenticatedUser, @Body() body: { intent: string; signature: string }) {
    return this.telegram.consumeLinkIntent(user.sub, body.intent, body.signature, user.organizationId);
  }

  @Delete('telegram/connection')
  @UseGuards(PrivyAuthGuard)
  telegramDisconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.telegram.disconnect(user.sub, user.organizationId);
  }

  @Post('telegram/webhook/register')
  @UseGuards(ApprovalGuard)
  telegramRegisterWebhook() {
    const publicUrl = this.config.get<string>('BACKEND_PUBLIC_URL');
    const secret = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET');
    if (!publicUrl || !secret) throw new UnauthorizedException('Telegram webhook configuration is incomplete');
    return this.telegram.registerWebhook(publicUrl, secret);
  }

  @Post('telegram/webhook')
  async telegramWebhook(
    @Headers('x-telegram-bot-api-secret-token') suppliedSecret: string | undefined,
    @Body() body: Record<string, any>,
  ) {
    const expected = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET');
    if (!expected || suppliedSecret !== expected)
      throw new UnauthorizedException('Telegram webhook signature is invalid');
    const message = body?.message;
    const start = typeof message?.text === 'string' && /^\/start(?:\s+connect)?$/.test(message.text);
    if (start && message?.from && message?.chat) return this.telegram.createLinkIntent(message.from, message.chat);

    const callback = body?.callback_query;
    if (callback?.data && callback?.message?.chat?.id && callback?.from?.id) {
      const chatId = String(callback.message.chat.id);
      let actor: any;
      let intent: any;
      try {
        // Telegram acknowledgement is UX only. Do not let a transient Bot API
        // failure prevent the signed Kivora action from being evaluated.
        await this.telegram.acknowledgeCallback(String(callback.id), "Processing action…").catch(() => undefined);
        actor = await this.telegram.linkedActor(chatId, String(callback.from.id));
        await this.telegram.sendChatAction(chatId).catch(() => undefined);
        intent = await this.telegram.consumeActionIntent(callback.data, actor);
        const user = actor as AuthenticatedUser;
        if (intent.action === 'details') {
          const rec: any = await this.revenue.telegramRecommendation(intent.recommendationId || intent.entityId, user);
          const buttons = [] as any[];
          if (rec.proposedAction !== 'manual_review') {
            const intendedStrategy = recommendedPricingStrategy(rec);
            for (const strategy of intendedStrategy ? [intendedStrategy] : ['conservative', 'balanced', 'aggressive'])
              buttons.push([
                {
                  text: `Preview ${strategy}`,
                  callback_data: await this.telegram.createActionIntent(
                    user.organizationId,
                    user.sub,
                    `preview_${strategy}`,
                    String(rec._id),
                    { recommendationId: String(rec._id) },
                  ),
                },
              ]);
          }
          buttons.push([
            {
              text: 'Ignore 24h',
              callback_data: await this.telegram.createActionIntent(
                user.organizationId,
                user.sub,
                'ignore',
                String(rec._id),
                { recommendationId: String(rec._id) },
              ),
            },
            {
              text: 'Dismiss',
              callback_data: await this.telegram.createActionIntent(
                user.organizationId,
                user.sub,
                'dismiss',
                String(rec._id),
                { recommendationId: String(rec._id) },
              ),
            },
          ]);
          await this.telegram.sendToChat(
            chatId,
            `${rec.title}\n\nEvidence: ${JSON.stringify(rec.evidence).slice(0, 1200)}\n\nImpact: ${rec.currency} ${Number(rec.estimatedImpact || 0).toLocaleString()}\nConfidence: ${rec.confidence}%\nExpires: ${new Date(rec.expiresAt).toLocaleString()}`,
            { inline_keyboard: buttons },
          );
          return { ok: true };
        }
        if (intent.action.startsWith('preview_')) {
          const strategy = intent.action.replace('preview_', '');
          const previews: any = await this.revenue.simulateRecommendation(
            intent.recommendationId || intent.entityId,
            user,
          );
          const selected = previews.strategies.find((item: any) => item.key === strategy && item.available);
          if (!selected) throw new UnauthorizedException('Selected strategy preview is unavailable');
          const approve = await this.telegram.createActionIntent(
            user.organizationId,
            user.sub,
            'approve_recommendation',
            intent.entityId,
            { recommendationId: intent.recommendationId || intent.entityId, simulationId: selected.simulationId },
          );
          const schedule = await this.telegram.createActionIntent(
            user.organizationId,
            user.sub,
            'schedule_recommendation',
            intent.entityId,
            { recommendationId: intent.recommendationId || intent.entityId, simulationId: selected.simulationId },
          );
          await this.telegram.sendToChat(
            chatId,
            `📈 ${selected.label} preview\n\nProjected revenue: ${Number(selected.projectedRevenue || 0).toLocaleString()}\nEstimated uplift: ${Number(selected.estimatedUplift || 0).toLocaleString()}\nSource: ${selected.source}\nExpires: ${new Date(selected.expiresAt).toLocaleString()}`,
            {
              inline_keyboard: [
                [
                  { text: 'Approve & execute', callback_data: approve },
                  { text: 'Schedule +1 hour', callback_data: schedule },
                ],
              ],
            },
          );
          return { ok: true };
        }
        if (intent.action === 'approve_recommendation') {
          await this.revenue
            .transitionRecommendation(
              intent.recommendationId!,
              'approve',
              user,
              'Approved through signed Telegram intent',
            )
            .catch(async (error) => {
              const rec: any = await this.revenue.telegramRecommendation(intent.recommendationId!, user);
              if (rec.status !== 'APPROVED') throw error;
            });
          const result: any = await this.revenue.executeRecommendation(
            intent.recommendationId!,
            intent.simulationId!,
            user,
          );
          await this.telegram.sendToChat(
            chatId,
            `✅ Action result: ${result.status}\nVerified listings: ${result.verifiedCount ?? 0}/${result.totalListings ?? result.children?.length ?? 1}\n\nThe execution and its verification record are persisted in Kivora.`,
            { inline_keyboard: [[{ text: "Open action workspace", url: `${this.config.get<string>('FRONTEND_URL', 'http://localhost:3000').replace(/\/$/, '')}/dashboard/activity` }]] },
          );
          return { ok: true };
        }
        if (intent.action === 'schedule_recommendation') {
          await this.revenue
            .transitionRecommendation(
              intent.recommendationId!,
              'approve',
              user,
              'Approved for scheduling through signed Telegram intent',
            )
            .catch(() => undefined);
          const at = new Date(Date.now() + 60 * 60_000);
          await this.revenue.scheduleRecommendation(
            intent.recommendationId!,
            at.toISOString(),
            user,
            'Scheduled through signed Telegram intent',
            intent.simulationId,
          );
          await this.telegram.sendToChat(
            chatId,
            `🕐 Scheduled for ${at.toISOString()}. Current state and preview validity will be checked again before execution.`,
          );
          return { ok: true };
        }
        if (['ignore', 'dismiss'].includes(intent.action)) {
          await this.revenue.transitionRecommendation(
            intent.recommendationId || intent.entityId,
            intent.action,
            user,
            intent.action === 'dismiss'
              ? 'Dismissed through signed Telegram control'
              : 'Ignored through signed Telegram control',
            intent.action === 'ignore' ? new Date(Date.now() + 86400000).toISOString() : undefined,
          );
          await this.telegram.sendToChat(chatId, `Recommendation ${intent.action}d.`);
          return { ok: true };
        }
        if (intent.action === 'cancel_schedule') {
          await this.revenue.transitionRecommendation(
            intent.recommendationId!,
            'cancel',
            user,
            'Cancelled through signed Telegram control',
          );
          await this.telegram.sendToChat(chatId, 'Scheduled action cancelled.');
          return { ok: true };
        }
        if (intent.action === 'revert_action') {
          const result: any = await this.revenue.revertAction(intent.revenueActionId!, user);
          await this.telegram.sendToChat(chatId, `Revert result: ${result.status}`);
          return { ok: true };
        }
        if (intent.action === 'preview') {
          const result = await this.revenue.preview(intent.entityId, actor as AuthenticatedUser);
          await this.telegram.sendToChat(
            chatId,
            `📈 Live Wheelhouse preview\n\nCurrent revenue: $${result.currentRevenue.toLocaleString()}\nOptimized revenue: $${result.optimizedRevenue.toLocaleString()}\nProjected recovery: $${result.projectedRecovery.toLocaleString()}\n\nNo pricing was changed. Use the separately signed approval button in the original alert if you want to proceed.`,
          );
          return { ok: true };
        }
        if (intent.action === 'approve') {
          if (!['owner', 'administrator', 'revenue_manager', 'manager', 'admin'].includes(actor.organizationRole))
            throw new UnauthorizedException('Manager approval is required');
          const result = await this.revenue.resolve(intent.entityId, actor as AuthenticatedUser);
          await this.telegram.sendToChat(
            chatId,
            `✅ Dynamic pricing restored and verified.\n\nProjected revenue protected: $${result.recovered.toLocaleString()}`,
          );
          return { ok: true };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 300) : "The action could not be completed";
        await this.telegram.acknowledgeCallback(String(callback.id), message.slice(0, 120)).catch(() => undefined);
        if (actor) await this.telegram.recordCallbackFailure(actor, chatId, error, intent || {});
        const recovery = /Telegram action intent is expired|already used|belongs to another user/i.test(message)
          ? "For an expired or already-used button, open the latest recommendation alert and choose Details & previews to generate fresh signed controls."
          : "No pricing was changed. Review the message above, then open the recommendation in Kivora to refresh its live evidence before trying again.";
        await this.telegram.sendToChat(chatId, `⚠️ I couldn’t complete that action. ${message}\n\n${recovery}`).catch(() => undefined);
        // Telegram has already received user feedback. Returning 200 prevents
        // delivery retries from replaying a single-use callback intent.
        return { ok: false };
      }
    }

    const messageChatId = message?.chat?.id ? String(message.chat.id) : undefined;
    try {
      if (message?.text === '/briefing' && messageChatId && message?.from?.id) {
        await this.telegram.sendChatAction(messageChatId).catch(() => undefined);
        const actor = await this.telegram.linkedActor(messageChatId, String(message.from.id));
        const dashboard = await this.revenue.dashboard(actor as AuthenticatedUser);
        return this.telegram.dailyBriefing(messageChatId, dashboard.summary);
      }
      if (message?.text === '/opportunities' && messageChatId && message?.from?.id) {
        await this.telegram.sendChatAction(messageChatId).catch(() => undefined);
        const actor = await this.telegram.linkedActor(messageChatId, String(message.from.id));
        const items = await this.revenue.getOpportunities(actor as AuthenticatedUser);
        const text = items.length
          ? items
              .slice(0, 8)
              .map(
                (item, index) =>
                  `${index + 1}. ${item.property}\n${item.action}\nEstimated impact: $${item.impact.toLocaleString()} · ${item.confidence}% confidence`,
              )
              .join('\n\n')
          : 'No live revenue opportunities are currently open.';
        return this.telegram.sendToChat(messageChatId, text);
      }
      if (message?.text === '/help' && messageChatId)
        return this.telegram.sendToChat(
          messageChatId,
          'Kivora commands\n/briefing — portfolio summary\n/opportunities — ranked revenue opportunities\n\nOr ask a question about your live portfolio in natural language.',
        );
      if (typeof message?.text === 'string' && !message.text.startsWith('/') && messageChatId && message?.from?.id) {
        await this.telegram.sendChatAction(messageChatId).catch(() => undefined);
        const actor = await this.telegram.linkedActor(messageChatId, String(message.from.id));
        const response = await this.revenue.ask(message.text.slice(0, 500), actor as AuthenticatedUser, 'telegram');
        return this.telegram.sendToChat(messageChatId, response.body.slice(0, 4000));
      }
    } catch (error) {
      // Telegram retries every non-2xx webhook response. A failed provider
      // lookup or a stale account link must not trap all later user messages in
      // Telegram's queue. Reply when possible and acknowledge the update.
      const detail = error instanceof Error ? error.message.slice(0, 220) : 'The request could not be completed';
      if (messageChatId) {
        await this.telegram.sendToChat(
          messageChatId,
          `⚠️ I couldn’t complete that request. ${detail}\n\nIf this chat was recently reconnected, open Kivora Settings → Telegram and reconnect it, then try again.`,
        ).catch(() => undefined);
      }
      return { ok: false };
    }
    return { ok: true };
  }
}
