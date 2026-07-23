import { HttpService } from "@nestjs/axios";
import { ConflictException, Injectable, NotFoundException, Optional, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { Model, Types } from "mongoose";
import { firstValueFrom } from "rxjs";
import { User } from "../../auth/schemas/user.schema";
import { TelegramConnection } from "../schemas/telegram-connection.schema";
import { TelegramLink } from "../schemas/telegram-link.schema";
import { Membership } from "../../auth/schemas/membership.schema";
import { TelegramActionIntent, TelegramDelivery, TelegramInteraction } from "../schemas/telegram-operation.schema";
import {OrganizationIntegrationService}from"./organization-integration.service";

type TelegramIdentity = { id: number; username?: string; first_name?: string };
type TelegramChat = { id: number; type: string };

@Injectable()
export class TelegramService {
  private readonly token?: string;
  private readonly linkSecret?: string;
  private readonly frontendUrl: string;
  private readonly apiBase:string;
  private botUsername?: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
    @InjectModel(TelegramConnection.name) private readonly connections: Model<TelegramConnection>,
    @InjectModel(TelegramLink.name) private readonly links: Model<TelegramLink>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @Optional() @InjectModel(Membership.name) private readonly memberships?: Model<Membership>,
    @Optional() @InjectModel(TelegramActionIntent.name) private readonly actionIntents?: Model<TelegramActionIntent>,
    @Optional() @InjectModel(TelegramDelivery.name) private readonly deliveries?: Model<TelegramDelivery>,
    @Optional() @InjectModel(TelegramInteraction.name) private readonly interactions?: Model<TelegramInteraction>,
    @Optional() private readonly organizationSettings?:OrganizationIntegrationService,
  ) {
    this.token = config.get<string>("TELEGRAM_BOT_TOKEN");
    this.linkSecret = config.get<string>("TELEGRAM_LINK_SECRET") || config.get<string>("TELEGRAM_WEBHOOK_SECRET");
    this.frontendUrl = config.get<string>("FRONTEND_URL") || "http://localhost:3000";
    this.apiBase=config.get<string>("TELEGRAM_API_BASE_URL","https://api.telegram.org");
  }

  get configured() { return Boolean(this.token); }

  private requireToken() {
    if (!this.token) throw new ServiceUnavailableException("Telegram bot is not configured");
    return this.token;
  }

  private signature(intentId: string) {
    if (!this.linkSecret) throw new ServiceUnavailableException("Telegram account linking is not configured");
    return createHmac("sha256", this.linkSecret).update(intentId).digest("base64url");
  }

  private async username() {
    if (this.botUsername) return this.botUsername;
    const token = this.requireToken();
    const response = await firstValueFrom(this.http.get<{ ok: boolean; result: { username: string } }>(`${this.apiBase}/bot${token}/getMe`));
    if (!response.data.ok || !response.data.result.username) throw new ServiceUnavailableException("Telegram bot identity could not be verified");
    this.botUsername = response.data.result.username;
    return this.botUsername;
  }

  async createLink(userId: string) {
    this.requireToken();
    const botUsername = await this.username();
    return { url: `https://t.me/${botUsername}?start=connect`, botUsername, userId };
  }

  async createLinkIntent(identity: TelegramIdentity, chat: TelegramChat) {
    this.requireToken();
    const intentId = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await this.links.deleteMany({ chatId: String(chat.id) });
    await this.links.create({ intentId, chatId: String(chat.id), telegramUserId: String(identity.id), username: identity.username, firstName: identity.first_name, chatType: chat.type, expiresAt });
    const signature = this.signature(intentId);
    const url = `${this.frontendUrl.replace(/\/$/, "")}/connect?telegramIntent=${encodeURIComponent(intentId)}&telegramSignature=${encodeURIComponent(signature)}`;
    await this.sendToChat(String(chat.id), "Connect this Telegram account to your Kivora workspace. This secure link expires in 10 minutes.", { inline_keyboard: [[{ text: "Open Kivora", url }]] });
    return { ok: true };
  }

  async registerWebhook(publicBaseUrl: string, secret: string) {
    const token = this.requireToken();
    if (!publicBaseUrl.startsWith("https://")) throw new ServiceUnavailableException("BACKEND_PUBLIC_URL must be a public HTTPS URL");
    const url = `${publicBaseUrl.replace(/\/$/, "")}/api/telegram/webhook`;
    const response = await firstValueFrom(this.http.post<{ ok: boolean; description?: string }>(`${this.apiBase}/bot${token}/setWebhook`, { url, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: false }));
    return { registered: response.data.ok, url, description: response.data.description };
  }

  async consumeLinkIntent(userId: string, intentId: string, suppliedSignature: string, organizationId?: string) {
    const expected = Buffer.from(this.signature(intentId));
    const supplied = Buffer.from(suppliedSignature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new UnauthorizedException("Telegram connection signature is invalid");
    const pending = await this.links.findOneAndDelete({ intentId, expiresAt: { $gt: new Date() } }).lean();
    if (!pending) throw new UnauthorizedException("Telegram connection link is invalid or expired");
    const objectUserId = new Types.ObjectId(userId);
    const objectOrganizationId = organizationId ? new Types.ObjectId(organizationId) : undefined;
    const occupied = await this.connections.findOne({ ...(objectOrganizationId ? { organizationId: objectOrganizationId } : {}), chatId: pending.chatId, userId: { $ne: objectUserId } }).lean();
    if (occupied) throw new ConflictException("This Telegram chat is already connected to another Kivora account");
    const connection = await this.connections.findOneAndUpdate(
      { ...(objectOrganizationId ? { organizationId: objectOrganizationId } : {}), userId: objectUserId },
      { $set: { ...(objectOrganizationId ? { organizationId: objectOrganizationId } : {}), chatId: pending.chatId, telegramUserId: pending.telegramUserId, username: pending.username, firstName: pending.firstName, chatType: pending.chatType, enabled: true, linkedAt: new Date() } },
      { upsert: true, returnDocument: "after" },
    ).lean();
    await this.sendToChat(pending.chatId, "✅ Telegram connected to Kivora. You will now receive live portfolio alerts and can approve revenue actions from this chat.");
    return { connected: true, username: connection?.username, chatType: connection?.chatType };
  }

  async status(userId: string, organizationId?: string) {
    const connection = await this.connections.findOne({ ...(organizationId ? { organizationId: new Types.ObjectId(organizationId) } : {}), userId: new Types.ObjectId(userId), enabled: true }).lean();
    return { botConfigured: this.configured, connected: Boolean(connection), connection: connection ? { username: connection.username, firstName: connection.firstName, chatType: connection.chatType, linkedAt: connection.linkedAt } : null };
  }

  async disconnect(userId: string, organizationId?: string) {
    const result = await this.connections.findOneAndUpdate({ ...(organizationId ? { organizationId: new Types.ObjectId(organizationId) } : {}), userId: new Types.ObjectId(userId), enabled: true }, { $set: { enabled: false } }, { returnDocument: "after" }).lean();
    if (!result) throw new NotFoundException("No active Telegram connection was found");
    return { connected: false };
  }

  async linkedActor(chatId: string, telegramUserId: string) {
    const connection = await this.connections.findOne({ chatId, telegramUserId, enabled: true }).lean();
    if (!connection) throw new UnauthorizedException("This Telegram account is not connected to Kivora");
    const user = await this.users.findById(connection.userId).lean();
    if (!user) throw new UnauthorizedException("The linked Kivora account no longer exists");
    const membership = this.memberships ? await this.memberships.findOne({ organizationId: connection.organizationId, userId: connection.userId, status: "active" }).lean() : undefined;
    if (this.memberships && !membership) throw new UnauthorizedException("The linked user is no longer an active organization member");
    return { id: String(connection.userId), sub: String(connection.userId), privyUserId: user.privyUserId, name: user.name, email: user.email, role: membership?.role || user.role, organizationId: String(connection.organizationId), organizationRole: membership?.role || user.role };
  }

  async sendToChat(chatId: string, text: string, replyMarkup?: unknown) {
    const token = this.requireToken();
    await firstValueFrom(this.http.post(`${this.apiBase}/bot${token}/sendMessage`, { chat_id: chatId, text, reply_markup: replyMarkup }));
    await this.connections.updateOne({ chatId }, { $set: { lastDeliveredAt: new Date() } });
    return { delivered: true };
  }

  async acknowledgeCallback(callbackQueryId: string, text = "Working on it…") {
    const token = this.requireToken();
    await firstValueFrom(this.http.post(`${this.apiBase}/bot${token}/answerCallbackQuery`, { callback_query_id: callbackQueryId, text, show_alert: false }));
    return { acknowledged: true };
  }

  async sendChatAction(chatId: string, action: "typing" | "upload_document" = "typing") {
    const token = this.requireToken();
    await firstValueFrom(this.http.post(`${this.apiBase}/bot${token}/sendChatAction`, { chat_id: chatId, action }));
    return { sent: true };
  }

  async sendToUser(userId: string, text: string, organizationId?: string) {
    const connection = await this.connections.findOne({ ...(organizationId ? { organizationId: new Types.ObjectId(organizationId) } : {}), userId: new Types.ObjectId(userId), enabled: true }).lean();
    if (!connection) throw new NotFoundException("Connect Telegram before sending this message");
    return this.sendToChat(connection.chatId, text);
  }

  async notifyIncident(incident: { id?: string; listing: string; title: string; revenueAtRisk: number; confidence: number }, organizationId?: string) {
    this.requireToken();
    const recipients = await this.connections.find({ ...(organizationId ? { organizationId: new Types.ObjectId(organizationId) } : {}), enabled: true }).select("chatId userId organizationId").lean();
    if (!recipients.length) return { delivered: 0, recipients: 0 };
    const text = `🚨 Kivora revenue incident\n\n${incident.listing}\n${incident.title}\nRevenue at risk: $${Math.round(incident.revenueAtRisk).toLocaleString()}\nConfidence: ${incident.confidence}%`;
    const results = await Promise.allSettled(recipients.map(async (recipient) => {
      const preview = await this.createActionIntent(String(recipient.organizationId), String(recipient.userId), "preview", incident.id || "");
      const approve = await this.createActionIntent(String(recipient.organizationId), String(recipient.userId), "approve", incident.id || "");
      const markup = { inline_keyboard: [[{ text: "Run live preview", callback_data: preview }, { text: "Approve fix", callback_data: approve }], [{ text: "Open Kivora", url: process.env.FRONTEND_URL || "http://localhost:3000" }]] };
      return this.deliverTracked(recipient, "incident", `incident:${incident.id}`, text, markup);
    }));
    return { delivered: results.filter((result) => result.status === "fulfilled").length, recipients: recipients.length };
  }

  async notifyMarketSignal(signal: { kind: string; title: string; location?: string; affectedListings: number; confidence: number }, organizationId?: string) {
    this.requireToken();
    const recipients = await this.connections.find({ ...(organizationId ? { organizationId: new Types.ObjectId(organizationId) } : {}), enabled: true }).select("chatId userId organizationId").lean();
    if (!recipients.length) return { delivered: 0, recipients: 0 };
    const icon = signal.kind === "weather" ? "🌦️" : "🎟️";
    const text = `${icon} Kivora market signal\n\n${signal.title}\n${signal.location || "Connected portfolio"}\nAffected listings: ${signal.affectedListings}\nConfidence: ${signal.confidence}%`;
    const markup = { inline_keyboard: [[{ text: "Open Revenue War Room", url: `${this.frontendUrl.replace(/\/$/, "")}/dashboard` }]] };
    const results = await Promise.allSettled(recipients.map((recipient) => this.deliverTracked(recipient, "market_signal", `signal:${signal.kind}:${signal.title}`, text, markup)));
    return { delivered: results.filter((result) => result.status === "fulfilled").length, recipients: recipients.length };
  }

  async notifyActionResult(organizationId:string,actionId:string,status:string,verified:number,total:number){if(!this.configured)return{delivered:0};let recipients=await this.connections.find({organizationId:new Types.ObjectId(organizationId),enabled:true}).select("chatId userId organizationId").lean();const category=status==="PARTIALLY_APPLIED"?"partial_action":status==="VERIFIED"?"scheduled_action_executed":"action_failed";if(this.organizationSettings)recipients=(await Promise.all(recipients.map(async r=>(await this.organizationSettings!.permits(organizationId,String(r.userId),category,"telegram"))?r:null))).filter(Boolean) as any;const text=`${status==="VERIFIED"?"✅":"⚠️"} Kivora action result\n\nStatus: ${status}\nVerified: ${verified}/${total}\nAction: ${actionId}`;const results=await Promise.allSettled(recipients.map((recipient)=>this.deliverTracked(recipient,"action_result",`action:${actionId}:${status}`,text,{inline_keyboard:[[{text:"Open action workspace",url:`${this.frontendUrl.replace(/\/$/,"")}/dashboard/activity`}]]})));return{delivered:results.filter(r=>r.status==="fulfilled").length};}
  async notifyScheduled(organizationId:string,recommendationId:string,actionId:string,executeAt:Date){if(!this.configured)return{delivered:0};let recipients=await this.connections.find({organizationId:new Types.ObjectId(organizationId),enabled:true}).select("chatId userId organizationId").lean();if(this.organizationSettings)recipients=(await Promise.all(recipients.map(async r=>(await this.organizationSettings!.permits(organizationId,String(r.userId),"scheduled_action_approaching","telegram"))?r:null))).filter(Boolean)as any;const results=await Promise.allSettled(recipients.map(async r=>{const cancel=await this.createActionIntent(organizationId,String(r.userId),"cancel_schedule",recommendationId,{recommendationId,revenueActionId:actionId});return this.deliverTracked(r,"scheduled_action_approaching",`schedule:${actionId}:approaching`,`🕐 Scheduled action approaching\n\nExecution: ${executeAt.toISOString()}\nCurrent state and simulation validity will be refreshed before any mutation.`,{inline_keyboard:[[{text:"Cancel scheduled action",callback_data:cancel}]]});}));return{delivered:results.filter(r=>r.status==="fulfilled").length};}

  async notifyRecommendation(recommendation:any,kind:"incident"|"opportunity",opportunityType?:string) {
    if(!this.configured)return{delivered:0};
    let recipients=await this.connections.find({organizationId:recommendation.organizationId,enabled:true}).select("chatId userId organizationId").lean();
    const opportunityCategory=String(opportunityType||"");
    const category=kind==="incident"?(String(recommendation.severity).toLowerCase()==="critical"?"critical_incident":"high_incident"):opportunityCategory.includes("event")?"event_opportunity":opportunityCategory.includes("weather")?"weather_opportunity":"opportunity";
    if(this.organizationSettings)recipients=(await Promise.all(recipients.map(async r=>(await this.organizationSettings!.permits(String(r.organizationId),String(r.userId),category,"telegram",Number(recommendation.estimatedImpact||0),recommendation.severity,{portfolioId:recommendation.portfolioId?String(recommendation.portfolioId):undefined,assignedUserId:recommendation.assignedTo?String(recommendation.assignedTo):undefined}))?r:null))).filter(Boolean) as any;
    const results=await Promise.allSettled(recipients.map(async(recipient)=>{
      const references={recommendationId:String(recommendation._id)};
      const details=await this.createActionIntent(String(recipient.organizationId),String(recipient.userId),"details",String(recommendation._id),references);
      const ignore=await this.createActionIntent(String(recipient.organizationId),String(recipient.userId),"ignore",String(recommendation._id),references);
      const dismiss=await this.createActionIntent(String(recipient.organizationId),String(recipient.userId),"dismiss",String(recommendation._id),references);
      const text=`${kind==="incident"?"🚨":"💡"} ${recommendation.title}\n\n${recommendation.explanation}\nImpact: ${recommendation.currency} ${Math.round(recommendation.estimatedImpact||0).toLocaleString()}\nConfidence: ${recommendation.confidence}%\nRisk: ${recommendation.risks||"Review current evidence"}`;
      return this.deliverTracked(recipient,`${kind}_recommendation`,`recommendation:${recommendation._id}`,text,{inline_keyboard:[[{text:"Details & previews",callback_data:details}],[{text:"Ignore 24h",callback_data:ignore},{text:"Dismiss",callback_data:dismiss}],[{text:"Open Kivora",url:`${this.frontendUrl.replace(/\/$/,"")}/dashboard/${kind==="incident"?"incidents":"opportunities"}`}]]});
    }));
    return{delivered:results.filter(r=>r.status==="fulfilled").length};
  }

  async recordCallbackFailure(actor:{id:string;organizationId:string},chatId:string,error:unknown,references:{recommendationId?:unknown;simulationId?:unknown;revenueActionId?:unknown;action?:string}={}){
    await this.interactions?.create({organizationId:new Types.ObjectId(actor.organizationId),userId:new Types.ObjectId(actor.id),chatId,type:"callback_failure",action:references.action,recommendationId:references.recommendationId?String(references.recommendationId):undefined,simulationId:references.simulationId?String(references.simulationId):undefined,revenueActionId:references.revenueActionId?String(references.revenueActionId):undefined,status:"failed",error:error instanceof Error?error.message.slice(0,500):"Telegram callback failed"});
  }

  dailyBriefing(chatId: string, summary: { health: number; revenue: number; atRisk: number; opportunities: number; criticalIncidents?: number; marketSignals?: number },priorities:any[]=[] ) {
    const priorityText=priorities.slice(0,5).map((p,i)=>`${i+1}. ${p.title} · ${p.property||"portfolio"} · ${p.impact?Number(p.impact).toLocaleString():"review"}`).join("\n");const text = `🌅 Good morning.\n\nPortfolio health: ${summary.health}/100\nRevenue: $${summary.revenue.toLocaleString()}\nRevenue at risk: $${summary.atRisk.toLocaleString()}\nOpportunities: ${summary.opportunities}\nCritical incidents: ${summary.criticalIncidents ?? 0}\nMarket signals: ${summary.marketSignals ?? 0}${priorityText?`\n\nHighest-impact actions\n${priorityText}`:""}`;
    return this.sendToChat(chatId, text, { inline_keyboard: [[{ text: "Open AI Revenue War Room", url: `${this.frontendUrl.replace(/\/$/, "")}/dashboard` }]] });
  }

  async broadcastBriefing(summary: { health: number; revenue: number; atRisk: number; opportunities: number; criticalIncidents?: number; marketSignals?: number }, organizationId?: string,priorities:any[]=[] ) {
    let recipients = await this.connections.find({ ...(organizationId ? { organizationId: new Types.ObjectId(organizationId) } : {}), enabled: true }).select("chatId userId organizationId").lean();if(organizationId&&this.organizationSettings)recipients=(await Promise.all(recipients.map(async r=>(await this.organizationSettings!.permits(organizationId,String(r.userId),"daily_briefing","telegram"))?r:null))).filter(Boolean) as any;
    const key = `briefing:${new Date().toISOString().slice(0, 10)}`;
    const results = await Promise.allSettled(recipients.map((recipient) => this.deliverTracked(recipient, "daily_briefing", key, undefined, undefined, summary,priorities)));
    return { recipients: recipients.length, delivered: results.filter((result) => result.status === "fulfilled").length };
  }
  async broadcastEndOfDay(organizationId:string,summary:any){let recipients=await this.connections.find({organizationId:new Types.ObjectId(organizationId),enabled:true}).select("chatId userId organizationId").lean();if(this.organizationSettings)recipients=(await Promise.all(recipients.map(async r=>(await this.organizationSettings!.permits(organizationId,String(r.userId),"end_of_day_summary","telegram"))?r:null))).filter(Boolean) as any;const key=`eod:${new Date().toISOString().slice(0,10)}`;const text=`🌙 Kivora end-of-day summary\n\nRevenue protected: ${Number(summary.revenueProtected||0).toLocaleString()}\nProjected opportunities approved: ${Number(summary.projectedOpportunitiesApproved||0).toLocaleString()}\nRealized revenue: ${Number(summary.realizedRevenue||0).toLocaleString()}\nIncidents resolved: ${summary.incidentsResolved||0}\nActions verified: ${summary.actionsVerified||0}\nOwner reports: ${summary.ownerReportsGenerated||0}\nTime saved: ${summary.timeSavedMinutes||0} minutes`;const results=await Promise.allSettled(recipients.map(r=>this.deliverTracked(r,"end_of_day_summary",key,text)));return{recipients:recipients.length,delivered:results.filter(r=>r.status==="fulfilled").length};}

  capabilities() { return { botConfigured: this.configured, mode: this.configured ? "live" : "disabled", routing: "per-user" }; }

  async consumeActionIntent(callbackData: string, actor: { id: string; organizationId: string }) {
    if (!this.actionIntents || !this.linkSecret) throw new ServiceUnavailableException("Secure Telegram approvals are unavailable");
    const match = /^ki:([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/.exec(callbackData);
    if (!match) throw new UnauthorizedException("Telegram action intent is malformed");
    const [, nonce, signature] = match;
    const expected = createHmac("sha256", this.linkSecret).update(nonce).digest("base64url").slice(0, 16);
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new UnauthorizedException("Telegram action signature is invalid");
    const intent = await this.actionIntents.findOneAndUpdate({ nonce, organizationId: new Types.ObjectId(actor.organizationId), userId: new Types.ObjectId(actor.id), consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { returnDocument: "after" }).lean();
    if (!intent) throw new UnauthorizedException("Telegram action intent is expired, already used, or belongs to another user");
    await this.interactions?.create({organizationId:intent.organizationId,userId:intent.userId,chatId:"callback",type:"intent_consumed",action:intent.action,recommendationId:intent.recommendationId,simulationId:intent.simulationId,revenueActionId:intent.revenueActionId,status:"consumed"});
    return { action: intent.action, entityId: intent.entityId, recommendationId:intent.recommendationId,simulationId:intent.simulationId,revenueActionId:intent.revenueActionId,organizationId: String(intent.organizationId), userId: String(intent.userId) };
  }

  async createActionIntent(organizationId: string, userId: string, action: string, entityId: string, references: {recommendationId?:string;simulationId?:string;revenueActionId?:string}={}) {
    if (!this.actionIntents || !this.linkSecret) throw new ServiceUnavailableException("Secure Telegram approvals are unavailable");
    const nonce = randomBytes(12).toString("base64url");
    await this.actionIntents.create({ nonce, organizationId: new Types.ObjectId(organizationId), userId: new Types.ObjectId(userId), action, entityId,...references, expiresAt: new Date(Date.now() + 10 * 60_000) });
    await this.interactions?.create({organizationId:new Types.ObjectId(organizationId),userId:new Types.ObjectId(userId),chatId:"intent",type:"intent_created",action,...references,status:"created",metadata:{expiresInMinutes:10}});
    const signature = createHmac("sha256", this.linkSecret).update(nonce).digest("base64url").slice(0, 16);
    return `ki:${nonce}:${signature}`;
  }

  private async deliverTracked(recipient: { chatId: string; userId?: Types.ObjectId; organizationId: Types.ObjectId }, type: string, deduplicationKey: string, text?: string, markup?: unknown, summary?: { health: number; revenue: number; atRisk: number; opportunities: number; criticalIncidents?: number; marketSignals?: number },priorities:any[]=[] ) {
    let delivery: any;
    if (this.deliveries) {
      try { delivery = await this.deliveries.create({ organizationId: recipient.organizationId, userId: recipient.userId, chatId: recipient.chatId, type, deduplicationKey, status: "pending",attemptCount:0,text,replyMarkup:(markup||undefined) as Record<string,unknown>|undefined }); }
      catch { return { delivered: false, duplicate: true }; }
    }
    try {
      const result = summary ? await this.dailyBriefing(recipient.chatId, summary,priorities) : await this.sendToChat(recipient.chatId, text!, markup);
      if (delivery) await this.deliveries!.updateOne({ _id: delivery._id }, { $set: { status: "delivered", deliveredAt: new Date() },$inc:{attemptCount:1} });
      return result;
    } catch (error) {
      if (delivery) await this.deliveries!.updateOne({ _id: delivery._id }, { $set: { status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "Delivery failed",nextRetryAt:new Date(Date.now()+5*60_000) },$inc:{attemptCount:1} });
      throw error;
    }
  }
  async retryFailedDeliveries(){if(!this.deliveries)return{retried:0,delivered:0};const due:any[]=await this.deliveries.find({status:"failed",attemptCount:{$lt:4},nextRetryAt:{$lte:new Date()}}).limit(50).lean();let delivered=0;for(const item of due){try{await this.sendToChat(item.chatId,item.text||"Kivora notification",item.replyMarkup);await this.deliveries.updateOne({_id:item._id,status:"failed"},{$set:{status:"delivered",deliveredAt:new Date()},$unset:{nextRetryAt:1,error:1},$inc:{attemptCount:1}});delivered++;}catch(error){await this.deliveries.updateOne({_id:item._id},{$set:{error:error instanceof Error?error.message.slice(0,500):"Retry failed",nextRetryAt:new Date(Date.now()+Math.pow(2,item.attemptCount+1)*5*60_000)},$inc:{attemptCount:1}});}}return{retried:due.length,delivered};}
}
