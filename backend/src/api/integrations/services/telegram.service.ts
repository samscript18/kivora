import { HttpService } from "@nestjs/axios";
import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { Model, Types } from "mongoose";
import { firstValueFrom } from "rxjs";
import { User } from "../../auth/schemas/user.schema";
import { TelegramConnection } from "../schemas/telegram-connection.schema";
import { TelegramLink } from "../schemas/telegram-link.schema";

type TelegramIdentity = { id: number; username?: string; first_name?: string };
type TelegramChat = { id: number; type: string };

@Injectable()
export class TelegramService {
  private readonly token?: string;
  private readonly linkSecret?: string;
  private readonly frontendUrl: string;
  private botUsername?: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
    @InjectModel(TelegramConnection.name) private readonly connections: Model<TelegramConnection>,
    @InjectModel(TelegramLink.name) private readonly links: Model<TelegramLink>,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {
    this.token = config.get<string>("TELEGRAM_BOT_TOKEN");
    this.linkSecret = config.get<string>("TELEGRAM_LINK_SECRET") || config.get<string>("TELEGRAM_WEBHOOK_SECRET");
    this.frontendUrl = config.get<string>("FRONTEND_URL") || "http://localhost:3000";
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
    const response = await firstValueFrom(this.http.get<{ ok: boolean; result: { username: string } }>(`https://api.telegram.org/bot${token}/getMe`));
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
    const response = await firstValueFrom(this.http.post<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${token}/setWebhook`, { url, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: false }));
    return { registered: response.data.ok, url, description: response.data.description };
  }

  async consumeLinkIntent(userId: string, intentId: string, suppliedSignature: string) {
    const expected = Buffer.from(this.signature(intentId));
    const supplied = Buffer.from(suppliedSignature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new UnauthorizedException("Telegram connection signature is invalid");
    const pending = await this.links.findOneAndDelete({ intentId, expiresAt: { $gt: new Date() } }).lean();
    if (!pending) throw new UnauthorizedException("Telegram connection link is invalid or expired");
    const objectUserId = new Types.ObjectId(userId);
    const occupied = await this.connections.findOne({ chatId: pending.chatId, userId: { $ne: objectUserId } }).lean();
    if (occupied) throw new ConflictException("This Telegram chat is already connected to another Kivora account");
    const connection = await this.connections.findOneAndUpdate(
      { userId: objectUserId },
      { $set: { chatId: pending.chatId, telegramUserId: pending.telegramUserId, username: pending.username, firstName: pending.firstName, chatType: pending.chatType, enabled: true, linkedAt: new Date() } },
      { upsert: true, returnDocument: "after" },
    ).lean();
    await this.sendToChat(pending.chatId, "✅ Telegram connected to Kivora. You will now receive live portfolio alerts and can approve revenue actions from this chat.");
    return { connected: true, username: connection?.username, chatType: connection?.chatType };
  }

  async status(userId: string) {
    const connection = await this.connections.findOne({ userId: new Types.ObjectId(userId), enabled: true }).lean();
    return { botConfigured: this.configured, connected: Boolean(connection), connection: connection ? { username: connection.username, firstName: connection.firstName, chatType: connection.chatType, linkedAt: connection.linkedAt } : null };
  }

  async disconnect(userId: string) {
    const result = await this.connections.findOneAndUpdate({ userId: new Types.ObjectId(userId), enabled: true }, { $set: { enabled: false } }, { returnDocument: "after" }).lean();
    if (!result) throw new NotFoundException("No active Telegram connection was found");
    return { connected: false };
  }

  async linkedActor(chatId: string, telegramUserId: string) {
    const connection = await this.connections.findOne({ chatId, telegramUserId, enabled: true }).lean();
    if (!connection) throw new UnauthorizedException("This Telegram account is not connected to Kivora");
    const user = await this.users.findById(connection.userId).lean();
    if (!user) throw new UnauthorizedException("The linked Kivora account no longer exists");
    return { id: String(connection.userId), name: user.name, role: user.role };
  }

  async sendToChat(chatId: string, text: string, replyMarkup?: unknown) {
    const token = this.requireToken();
    await firstValueFrom(this.http.post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: chatId, text, reply_markup: replyMarkup }));
    await this.connections.updateOne({ chatId }, { $set: { lastDeliveredAt: new Date() } });
    return { delivered: true };
  }

  async sendToUser(userId: string, text: string) {
    const connection = await this.connections.findOne({ userId: new Types.ObjectId(userId), enabled: true }).lean();
    if (!connection) throw new NotFoundException("Connect Telegram before sending this message");
    return this.sendToChat(connection.chatId, text);
  }

  async notifyIncident(incident: { id?: string; listing: string; title: string; revenueAtRisk: number; confidence: number }) {
    this.requireToken();
    const recipients = await this.connections.find({ enabled: true }).select("chatId").lean();
    if (!recipients.length) return { delivered: 0, recipients: 0 };
    const text = `🚨 Kivora revenue incident\n\n${incident.listing}\n${incident.title}\nRevenue at risk: $${Math.round(incident.revenueAtRisk).toLocaleString()}\nConfidence: ${incident.confidence}%`;
    const markup = { inline_keyboard: [[{ text: "Run live preview", callback_data: `preview:${incident.id}` }, { text: "Approve fix", callback_data: `approve:${incident.id}` }], [{ text: "Open Kivora", url: process.env.FRONTEND_URL || "http://localhost:3000" }]] };
    const results = await Promise.allSettled(recipients.map((recipient) => this.sendToChat(recipient.chatId, text, markup)));
    return { delivered: results.filter((result) => result.status === "fulfilled").length, recipients: recipients.length };
  }

  async notifyMarketSignal(signal: { kind: string; title: string; location?: string; affectedListings: number; confidence: number }) {
    this.requireToken();
    const recipients = await this.connections.find({ enabled: true }).select("chatId").lean();
    if (!recipients.length) return { delivered: 0, recipients: 0 };
    const icon = signal.kind === "weather" ? "🌦️" : "🎟️";
    const text = `${icon} Kivora market signal\n\n${signal.title}\n${signal.location || "Connected portfolio"}\nAffected listings: ${signal.affectedListings}\nConfidence: ${signal.confidence}%`;
    const markup = { inline_keyboard: [[{ text: "Open Revenue War Room", url: `${this.frontendUrl.replace(/\/$/, "")}/dashboard` }]] };
    const results = await Promise.allSettled(recipients.map((recipient) => this.sendToChat(recipient.chatId, text, markup)));
    return { delivered: results.filter((result) => result.status === "fulfilled").length, recipients: recipients.length };
  }

  dailyBriefing(chatId: string, summary: { health: number; revenue: number; atRisk: number; opportunities: number; criticalIncidents?: number; marketSignals?: number }) {
    const text = `🌅 Good morning.\n\nPortfolio health: ${summary.health}/100\nRevenue: $${summary.revenue.toLocaleString()}\nRevenue at risk: $${summary.atRisk.toLocaleString()}\nOpportunities: ${summary.opportunities}\nCritical incidents: ${summary.criticalIncidents ?? 0}\nMarket signals: ${summary.marketSignals ?? 0}`;
    return this.sendToChat(chatId, text, { inline_keyboard: [[{ text: "Open AI Revenue War Room", url: `${this.frontendUrl.replace(/\/$/, "")}/dashboard` }]] });
  }

  async broadcastBriefing(summary: { health: number; revenue: number; atRisk: number; opportunities: number; criticalIncidents?: number; marketSignals?: number }) {
    const recipients = await this.connections.find({ enabled: true }).select("chatId").lean();
    const results = await Promise.allSettled(recipients.map((recipient) => this.dailyBriefing(recipient.chatId, summary)));
    return { recipients: recipients.length, delivered: results.filter((result) => result.status === "fulfilled").length };
  }

  capabilities() { return { botConfigured: this.configured, mode: this.configured ? "live" : "disabled", routing: "per-user" }; }
}
