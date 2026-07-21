import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { Connection, Model } from "mongoose";
import { GroqService } from "../integrations/services/groq.service";
import { TelegramService } from "../integrations/services/telegram.service";
import { Preferences, RecommendationResponse, WheelhouseListing, WheelhouseService } from "../integrations/services/wheelhouse.service";
import { AuditLog } from "./schemas/audit-log.schema";
import { Incident } from "./schemas/incident.schema";
import { OwnerBrief } from "./schemas/owner-brief.schema";
import { Snapshot } from "./schemas/snapshot.schema";

type Factor = { label: string; value: string; note: string };
type LiveIncident = {
  id: string; externalId: string; listingId: string; channel: string; severity: string; title: string;
  listing: string; location: string; currentRate: number; recommendedRate: number; revenueAtRisk: number;
  confidence: number; cause: string; detectedAt: string; status: string; explanation: string; factors: Factor[];
  preferences?: Preferences; owner?: string;
};

const metricAt = (value: unknown, key: string, period = "0_30") => {
  const object = value as Record<string, unknown> | undefined;
  const metric = object?.[key] as Record<string, unknown> | number | undefined;
  const raw = typeof metric === "object" ? metric?.[period] : metric;
  return typeof raw === "number" ? raw : 0;
};

@Injectable()
export class RevenueService {
  private listingsCache: WheelhouseListing[] = [];
  private incidentsCache: LiveIncident[] = [];
  private lastScan?: string;
  private scanCursor = 0;

  constructor(
    private readonly wheelhouse: WheelhouseService,
    private readonly groq: GroqService,
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(AuditLog.name) private readonly audits: Model<AuditLog>,
    @InjectModel(Incident.name) private readonly incidents: Model<Incident>,
    @InjectModel(Snapshot.name) private readonly snapshots: Model<Snapshot>,
    @InjectModel(OwnerBrief.name) private readonly briefs: Model<OwnerBrief>,
  ) {}

  capabilities() {
    return { wheelhouse: this.wheelhouse.capabilities(), telegram: this.telegram.capabilities(), ai: this.groq.capabilities(), database: { configured: Boolean(this.config.get("MONGODB_URI")), connected: this.connection.readyState === 1 }, lastScan: this.lastScan ?? null };
  }

  async scanPortfolio() {
    if (!this.wheelhouse.configured) throw new ServiceUnavailableException("Wheelhouse is not configured");
    const listings = await this.wheelhouse.listings();
    this.listingsCache = listings;
    const limit = Math.max(1, Math.min(20, this.config.get<number>("SCAN_BATCH_SIZE", 12)));
    const batch = Array.from({ length: Math.min(limit, listings.length) }, (_, i) => listings[(this.scanCursor + i) % listings.length]);
    this.scanCursor = (this.scanCursor + batch.length) % Math.max(1, listings.length);
    const found: LiveIncident[] = [];
    for (let i = 0; i < batch.length; i += 3) {
      const results = await Promise.allSettled(batch.slice(i, i + 3).map((listing) => this.analyzeListing(listing)));
      for (const result of results) if (result.status === "fulfilled" && result.value) found.push(result.value);
    }
    const scannedIds = new Set(batch.map((listing) => listing.id));
    this.incidentsCache = [...this.incidentsCache.filter((incident) => !scannedIds.has(incident.listingId)), ...found];
    this.lastScan = new Date().toISOString();
    for (const incident of found) {
      await this.incidents.findOneAndUpdate({ externalId: incident.externalId }, { $set: { listingId: incident.listingId, channel: incident.channel, listing: incident.listing, title: incident.title, cause: incident.cause, severity: incident.severity, revenueAtRisk: incident.revenueAtRisk, confidence: incident.confidence, status: "open", evidence: { location: incident.location, currentRate: incident.currentRate, recommendedRate: incident.recommendedRate, explanation: incident.explanation, factors: incident.factors } } }, { upsert: true });
      if (this.telegram.configured) await this.telegram.notifyIncident(incident);
    }
    await this.incidents.updateMany({ listingId: { $in: [...scannedIds] }, externalId: { $nin: found.map((incident) => incident.externalId) }, status: "open" }, { $set: { status: "resolved" } });
    return { source: "Wheelhouse live", scanned: batch.length, total: listings.length, incidents: found.length, nextCursor: this.scanCursor };
  }

  private async analyzeListing(listing: WheelhouseListing): Promise<LiveIncident | null> {
    const [preferences, recommendations, kpis] = await Promise.all([this.wheelhouse.preferences(listing.id, listing.channel), this.wheelhouse.recommendations(listing.id, listing.channel), this.wheelhouse.kpis(listing.id, listing.channel)]);
    const base = Number(preferences.base_price ?? recommendations.base_price ?? 0);
    const recommended = Number(recommendations.base_price_recommended ?? 0);
    const posting = preferences.automatic_rate_posting_enabled ?? recommendations.automatic_rate_posting_enabled ?? true;
    const occupancy = metricAt(kpis, "occupancy");
    const adr = metricAt(kpis, "adr");
    const revenue = metricAt(kpis, "revenue");
    const divergence = recommended > 0 && base > 0 ? (recommended - base) / recommended : 0;
    const health = Math.max(0, Math.round(100 - (posting ? 0 : 30) - Math.max(0, divergence) * 45));
    await this.snapshots.create({ listingId: listing.id, channel: listing.channel, health, occupancy, adr, revenue, raw: { kpis } });
    if (posting && divergence < 0.3) return null;
    const cause = !posting ? "Dynamic pricing disabled" : "Manual base price override";
    const affected = Math.min(30, recommendations.data?.length ?? 0);
    const atRisk = Math.max(0, Math.round((recommended - base) * affected * Math.max(0.35, occupancy || 0)));
    const suffix = !posting ? "posting-disabled" : "base-override";
    return { id: `${listing.id}-${suffix}`, externalId: `${listing.id}-${suffix}`, listingId: listing.id, channel: listing.channel, severity: atRisk > 3000 ? "Critical" : "Warning", title: !posting ? "Dynamic pricing is not posting" : "Manual base price suppressing market demand", listing: listing.nickname || listing.title || listing.id, location: listing.location?.address || listing.location?.country || "Unknown", currentRate: base, recommendedRate: recommended, revenueAtRisk: atRisk, confidence: Math.min(99, Math.round(80 + Math.abs(divergence) * 20)), cause, detectedAt: new Date().toISOString(), status: "open", explanation: `${cause} is preventing Wheelhouse's recommendation from controlling the effective base rate.`, factors: [{ label: "Base price gap", value: `${Math.round(divergence * 100)}%`, note: "vs Wheelhouse" }, { label: "30-day occupancy", value: `${Math.round(occupancy * 100)}%`, note: "rolling KPI" }, { label: "Automatic posting", value: posting ? "On" : "Off", note: "pricing preference" }], preferences, owner: listing.owner_name };
  }

  async dashboard() {
    if (!this.lastScan) await this.scanPortfolio();
    const snapshots = await this.snapshots.find().sort({ createdAt: -1 }).limit(Math.max(this.listingsCache.length, 1)).lean();
    const incidents = this.incidentsCache;
    const revenue = snapshots.reduce((sum, item) => sum + (item.revenue || 0), 0);
    const occupancy = snapshots.length ? snapshots.reduce((sum, item) => sum + (item.occupancy || 0), 0) / snapshots.length : 0;
    const health = snapshots.length ? Math.round(snapshots.reduce((sum, item) => sum + (item.health || 0), 0) / snapshots.length) : 0;
    const opportunities = this.toOpportunities(incidents);
    return { source: "Wheelhouse live", capabilities: this.capabilities(), summary: { health, revenue, atRisk: incidents.reduce((sum, item) => sum + item.revenueAtRisk, 0), opportunities: opportunities.length, occupancy: Number((occupancy * 100).toFixed(1)) }, trend: [], incident: incidents[0] ?? null, opportunities, activity: [{ title: "Live portfolio scan completed", meta: `${this.listingsCache.length} Wheelhouse listings`, time: this.lastScan }] };
  }

  async portfolio() {
    if (!this.lastScan) await this.scanPortfolio();
    const snapshots = await this.snapshots.find({ listingId: { $in: this.listingsCache.map((item) => item.id) } }).sort({ createdAt: -1 }).lean();
    const latest = new Map<string, Snapshot>();
    snapshots.forEach((snapshot) => { if (!latest.has(snapshot.listingId)) latest.set(snapshot.listingId, snapshot); });
    return { source: "Wheelhouse live", listings: this.listingsCache.map((listing) => ({ ...listing, metrics: latest.get(listing.id) ?? null })) };
  }

  async getIncidents() {
    if (!this.lastScan) await this.scanPortfolio();
    return this.incidentsCache;
  }

  async getOpportunities() { return this.toOpportunities(await this.getIncidents()); }
  private toOpportunities(items: LiveIncident[]) { return items.map((item) => ({ id: item.id, property: item.listing, action: item.cause === "Dynamic pricing disabled" ? "Restore automatic rate posting" : "Remove the manual base-price override", impact: item.revenueAtRisk, confidence: item.confidence, tag: "Live incident" })); }

  getBriefs() { return this.briefs.find().sort({ createdAt: -1 }).limit(50).lean(); }

  async sendBrief(id: string, userId: string) {
    const brief = await this.briefs.findById(id).lean();
    if (!brief) throw new NotFoundException("Owner brief not found");
    await this.telegram.sendToUser(userId, `Owner brief for ${brief.owner || brief.listingId}\n\n${brief.subject}\n\n${brief.body}`);
    return this.briefs.findByIdAndUpdate(id, { $set: { status: "sent", sentAt: new Date() } }, { new: true }).lean();
  }

  async preview(id: string) {
    const current = this.incidentsCache.find((item) => item.id === id);
    if (!current) throw new NotFoundException("Incident not found");
    const preferences = current.preferences ?? await this.wheelhouse.preferences(current.listingId, current.channel);
    const proposed = { ...preferences, base_price: null, automatic_rate_posting_enabled: true };
    const [before, after] = await Promise.all([this.wheelhouse.recommendations(current.listingId, current.channel), this.wheelhouse.preview(current.listingId, current.channel, proposed)]);
    const projectedRecovery = Math.max(0, Math.round(this.total(after) - this.total(before)));
    return { projectedRecovery, currentRevenue: this.total(before), optimizedRevenue: this.total(after), mutated: false, source: "Wheelhouse live preview" };
  }

  async resolve(id: string, actor: string) {
    const current = this.incidentsCache.find((item) => item.id === id);
    if (!current) throw new NotFoundException("Incident not found");
    const generated = await this.groq.ownerBrief({ owner: current.owner, listing: current.listing, cause: current.cause, impact: current.revenueAtRisk, action: "We restored Wheelhouse dynamic pricing and queued a channel synchronization." });
    const before = current.preferences ?? await this.wheelhouse.preferences(current.listingId, current.channel);
    const after = { ...before, base_price: null, automatic_rate_posting_enabled: true };
    await this.wheelhouse.updatePreferences(current.listingId, current.channel, after);
    await this.wheelhouse.enableAutomaticPosting(current.listingId, current.channel);
    await this.wheelhouse.sync(current.listingId, current.channel);
    const verified = await this.wheelhouse.preferences(current.listingId, current.channel);
    if (verified.base_price !== null && verified.base_price !== undefined) throw new ServiceUnavailableException("Wheelhouse verification failed: the base-price override remains active");
    this.incidentsCache = this.incidentsCache.filter((item) => item.id !== id);
    await Promise.all([this.audits.create({ action: "restore_dynamic_pricing", incidentId: id, actor, before, after: verified, projectedImpact: current.revenueAtRisk }), this.incidents.updateOne({ externalId: current.externalId }, { $set: { status: "resolved" } }), this.briefs.create({ listingId: current.listingId, owner: current.owner, subject: "Revenue protection update", body: generated.body, status: "draft" })]);
    return { status: "resolved", recovered: current.revenueAtRisk, ownerDrafted: true, ownerBrief: generated.body, sync: "verified", source: "Wheelhouse live" };
  }

  async underwrite(address: string, marketId: number, acquisitionCost: number, annualExpenses: number) {
    const raw = await this.wheelhouse.marketTimeSeries(marketId);
    const monthlyRevenue = this.findNumbers(raw, "revenue").slice(-12);
    if (!monthlyRevenue.length) throw new ServiceUnavailableException("Wheelhouse market report did not contain revenue data");
    const annualRevenue = Math.round(monthlyRevenue.reduce((sum, value) => sum + value, 0));
    const occupancyValues = this.findNumbers(raw, "occupancy");
    const adrValues = this.findNumbers(raw, "adr");
    const noi = annualRevenue - annualExpenses;
    const roi = acquisitionCost > 0 ? noi / acquisitionCost * 100 : 0;
    return { address, marketId, score: Math.max(1, Math.min(99, Math.round(50 + roi * 3))), recommendation: roi >= 10 ? "acquire" : "review", annualRevenue, annualExpenses, netOperatingIncome: noi, cashOnCashRoi: Number(roi.toFixed(1)), adr: this.average(adrValues), occupancy: Number((this.average(occupancyValues) * 100).toFixed(1)), comparableListings: 0, confidence: Math.min(95, 60 + monthlyRevenue.length * 3), source: "Wheelhouse live market report" };
  }

  private total(data: RecommendationResponse) { return (data.data ?? []).slice(0, 30).reduce((sum, item) => sum + (Number(item.price) || 0), 0); }
  private average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
  private findNumbers(value: unknown, key: string): number[] { const output: number[] = []; const walk = (current: unknown) => { if (Array.isArray(current)) current.forEach(walk); else if (current && typeof current === "object") for (const [name, child] of Object.entries(current)) { if (name.toLowerCase().includes(key) && typeof child === "number") output.push(child); walk(child); } }; walk(value); return output; }
}
