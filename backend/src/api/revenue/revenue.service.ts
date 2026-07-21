import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { Connection, Model } from "mongoose";
import { GroqService } from "../integrations/services/groq.service";
import { MarketIntelligenceService } from "../integrations/services/market-intelligence.service";
import { TelegramService } from "../integrations/services/telegram.service";
import { Preferences, RecommendationResponse, WheelhouseListing, WheelhouseService } from "../integrations/services/wheelhouse.service";
import { AuditLog } from "./schemas/audit-log.schema";
import { Incident } from "./schemas/incident.schema";
import { OwnerBrief } from "./schemas/owner-brief.schema";
import { Report } from "./schemas/report.schema";
import { Snapshot } from "./schemas/snapshot.schema";

type Factor = { label: string; value: string; note: string };
type LiveIncident = {
  id: string; externalId: string; listingId: string; channel: string; severity: string; title: string;
  listing: string; location: string; currentRate: number; recommendedRate: number; revenueAtRisk: number;
  confidence: number; cause: string; detectedAt: string; status: string; explanation: string; factors: Factor[];
  preferences?: Preferences; owner?: string;
  canPreview: boolean; canAutoResolve: boolean;
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
  private lastIntelligenceRefresh?: string;
  private scanCursor = 0;

  constructor(
    private readonly wheelhouse: WheelhouseService,
    private readonly groq: GroqService,
    private readonly market: MarketIntelligenceService,
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(AuditLog.name) private readonly audits: Model<AuditLog>,
    @InjectModel(Incident.name) private readonly incidents: Model<Incident>,
    @InjectModel(Snapshot.name) private readonly snapshots: Model<Snapshot>,
    @InjectModel(OwnerBrief.name) private readonly briefs: Model<OwnerBrief>,
    @InjectModel(Report.name) private readonly reports: Model<Report>,
  ) {}

  capabilities() {
    return { wheelhouse: this.wheelhouse.capabilities(), marketIntelligence: this.market.capabilities(), telegram: this.telegram.capabilities(), ai: this.groq.capabilities(), database: { configured: Boolean(this.config.get("MONGODB_URI")), connected: this.connection.readyState === 1 }, lastScan: this.lastScan ?? null, lastIntelligenceRefresh: this.lastIntelligenceRefresh ?? null };
  }

  async scanPortfolio() {
    if (!this.wheelhouse.configured) throw new ServiceUnavailableException("Wheelhouse is not configured");
    const listings = await this.wheelhouse.listings();
    this.listingsCache = listings;
    // Five Wheelhouse reads per listing plus pagination keeps the default scan below
    // the documented 60-request/minute integration limit.
    const limit = Math.max(1, Math.min(10, this.config.get<number>("SCAN_BATCH_SIZE", 10)));
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
    if (!this.lastIntelligenceRefresh || Date.now() - new Date(this.lastIntelligenceRefresh).getTime() > 60 * 60_000) {
      try {
        await this.refreshIntelligenceFor(listings);
        this.lastIntelligenceRefresh = new Date().toISOString();
      } catch {
        this.lastIntelligenceRefresh = undefined;
      }
    }
    for (const incident of found) {
      const previous = await this.incidents.findOneAndUpdate({ externalId: incident.externalId }, { $set: { listingId: incident.listingId, channel: incident.channel, listing: incident.listing, title: incident.title, cause: incident.cause, severity: incident.severity, revenueAtRisk: incident.revenueAtRisk, confidence: incident.confidence, status: "open", evidence: { location: incident.location, currentRate: incident.currentRate, recommendedRate: incident.recommendedRate, explanation: incident.explanation, factors: incident.factors, canPreview: incident.canPreview, canAutoResolve: incident.canAutoResolve } } }, { upsert: true, returnDocument: "before" }).lean();
      if (this.telegram.configured && (!previous || previous.status !== "open")) await this.telegram.notifyIncident(incident);
    }
    await this.incidents.updateMany({ listingId: { $in: [...scannedIds] }, externalId: { $nin: found.map((incident) => incident.externalId) }, status: "open" }, { $set: { status: "resolved" } });
    return { source: "Wheelhouse live", scanned: batch.length, total: listings.length, incidents: found.length, nextCursor: this.scanCursor };
  }

  private async analyzeListing(listing: WheelhouseListing): Promise<LiveIncident | null> {
    const [preferences, recommendations, kpis, changesResult, flagsResult] = await Promise.all([
      this.wheelhouse.preferences(listing.id, listing.channel),
      this.wheelhouse.recommendations(listing.id, listing.channel),
      this.wheelhouse.kpis(listing.id, listing.channel),
      this.wheelhouse.recentChanges(listing.id, listing.channel).catch(() => undefined),
      this.wheelhouse.flags(listing.id, listing.channel).catch(() => []),
    ]);
    const base = Number(preferences.base_price ?? recommendations.base_price ?? 0);
    const recommended = Number(recommendations.base_price_recommended ?? 0);
    const posting = preferences.automatic_rate_posting_enabled ?? recommendations.automatic_rate_posting_enabled ?? true;
    const occupancy = metricAt(kpis, "occupancy");
    const adr = metricAt(kpis, "adr");
    const revenue = metricAt(kpis, "revenue");
    const revpar = metricAt(kpis, "revpar");
    const pickup = metricAt(kpis, "pickup", "30_0");
    const marketOccupancy = metricAt(kpis, "occupancy_neighborhood");
    const compSetOccupancy = metricAt(kpis, "comp_set_occupancy");
    const revenueScore = metricAt(kpis, "revenue_score");
    const divergence = recommended > 0 && base > 0 ? (recommended - base) / recommended : 0;
    const marketGap = Math.max(0, marketOccupancy - occupancy);
    const health = Math.max(0, Math.min(100, Math.round(100 - (posting ? 0 : 30) - Math.max(0, divergence) * 45 - marketGap * 30)));
    await this.snapshots.create({ listingId: listing.id, channel: listing.channel, health, occupancy, adr, revenue, revpar, pickup, marketOccupancy, compSetOccupancy, revenueScore, dynamicPricingEnabled: posting, basePrice: base, recommendedBasePrice: recommended, raw: { kpis } });
    const serializedFlags = JSON.stringify(flagsResult).toLowerCase();
    const calendarFlag = /(calendar|sync|channel).*(error|fail|stale|disconnect)|(?:error|fail|stale|disconnect).*(calendar|sync|channel)/.test(serializedFlags);
    const slowPace = marketOccupancy > 0 && marketGap >= 0.2;
    const materiallyUnderpriced = divergence >= 0.15;
    const materiallyOverpriced = divergence <= -0.2;
    if (posting && !materiallyUnderpriced && !materiallyOverpriced && !calendarFlag && !slowPace) return null;
    const cause = !posting
      ? "Dynamic pricing disabled"
      : calendarFlag
        ? "Calendar synchronization issue"
        : materiallyUnderpriced
          ? "Listing underpriced versus Wheelhouse"
          : materiallyOverpriced
            ? "Listing overpriced versus Wheelhouse"
            : "Booking pace below market";
    const pricingIncident = !posting || materiallyUnderpriced || materiallyOverpriced;
    const affected = Math.min(30, recommendations.data?.length ?? 0);
    const pricingExposure = Math.abs(recommended - base) * Math.max(1, affected) * Math.max(0.35, occupancy || marketOccupancy || 0);
    const paceExposure = Math.max(0, marketGap) * Math.max(recommended, adr, 1) * 30;
    const atRisk = Math.max(0, Math.round(pricingIncident ? pricingExposure : paceExposure));
    const suffix = !posting ? "posting-disabled" : calendarFlag ? "calendar-sync" : materiallyUnderpriced ? "underpriced" : materiallyOverpriced ? "overpriced" : "slow-pace";
    const title = !posting ? "Dynamic pricing is not posting" : calendarFlag ? "Calendar synchronization needs attention" : materiallyUnderpriced ? "Base price is below Wheelhouse guidance" : materiallyOverpriced ? "Base price may be suppressing occupancy" : "Booking pace is trailing the local market";
    const explanation = pricingIncident
      ? `${cause} is preventing Wheelhouse's recommendation from controlling the effective base rate.`
      : `${cause} was verified from current Wheelhouse flags and rolling market KPIs. Kivora will not change pricing automatically for this issue.`;
    return { id: `${listing.id}-${suffix}`, externalId: `${listing.id}-${suffix}`, listingId: listing.id, channel: listing.channel, severity: atRisk > 3000 || calendarFlag ? "Critical" : "Warning", title, listing: listing.nickname || listing.title || listing.id, location: listing.location?.address || listing.location?.country || "Unknown", currentRate: base, recommendedRate: recommended, revenueAtRisk: atRisk, confidence: Math.min(99, Math.round(78 + Math.abs(divergence) * 20 + (calendarFlag ? 8 : 0))), cause, detectedAt: new Date().toISOString(), status: "open", explanation, factors: [{ label: "Base price gap", value: `${Math.round(divergence * 100)}%`, note: "vs Wheelhouse" }, { label: "30-day occupancy", value: `${Math.round(occupancy * 100)}%`, note: "rolling KPI" }, { label: "Market occupancy", value: `${Math.round(marketOccupancy * 100)}%`, note: "neighborhood KPI" }, { label: "Automatic posting", value: posting ? "On" : "Off", note: "pricing preference" }, { label: "Recent rate change", value: changesResult?.rates || "Unknown", note: "Wheelhouse" }], preferences, owner: listing.owner_name, canPreview: pricingIncident, canAutoResolve: pricingIncident };
  }

  async dashboard() {
    if (!this.lastScan) await this.scanPortfolio();
    const snapshots = await this.snapshots.find().sort({ createdAt: -1 }).limit(Math.max(this.listingsCache.length, 1)).lean();
    const incidents = this.incidentsCache;
    const signals = await this.market.list();
    const revenue = snapshots.reduce((sum, item) => sum + (item.revenue || 0), 0);
    const occupancy = snapshots.length ? snapshots.reduce((sum, item) => sum + (item.occupancy || 0), 0) / snapshots.length : 0;
    const health = snapshots.length ? Math.round(snapshots.reduce((sum, item) => sum + (item.health || 0), 0) / snapshots.length) : 0;
    const opportunities = this.toOpportunities(incidents);
    const trend = await this.snapshots.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 14 * 86_400_000) } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, listingId: "$listingId" }, revenue: { $first: "$revenue" } } },
      { $group: { _id: "$_id.day", revenue: { $sum: "$revenue" } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, day: "$_id", revenue: 1 } },
    ]);
    const activity = await this.audits.find().sort({ createdAt: -1 }).limit(6).lean();
    const priorities = [
      ...incidents.map((incident) => ({ id: incident.id, kind: "incident", title: incident.title, property: incident.listing, impact: incident.revenueAtRisk, confidence: incident.confidence, action: incident.canAutoResolve ? "Run a live preview and review the fix" : "Review the verified operational signal" })),
      ...signals.slice(0, 8).map((signal) => ({ id: signal.externalId, kind: signal.kind, title: signal.title, property: signal.location, impact: null, confidence: signal.confidence, action: "Review demand signal" })),
    ].sort((a, b) => (b.impact ?? b.confidence * 10) - (a.impact ?? a.confidence * 10));
    return {
      source: "Wheelhouse live",
      capabilities: this.capabilities(),
      summary: { health, revenue, atRisk: incidents.reduce((sum, item) => sum + item.revenueAtRisk, 0), opportunities: opportunities.length, occupancy: Number((occupancy * 100).toFixed(1)), criticalIncidents: incidents.filter((item) => item.severity === "Critical").length, marketSignals: signals.length },
      trend, incident: incidents[0] ?? null, opportunities, priorities, signals,
      activity: activity.length ? activity.map((item: any) => ({ title: item.action.replaceAll("_", " "), meta: item.actor || item.source || "Kivora", time: item.createdAt })) : [{ title: "Live portfolio scan completed", meta: `${this.listingsCache.length} Wheelhouse listings`, time: this.lastScan }],
    };
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
  private toOpportunities(items: LiveIncident[]) { return items.map((item) => ({ id: item.id, property: item.listing, action: item.canAutoResolve ? "Restore Wheelhouse dynamic pricing" : `Review ${item.cause.toLowerCase()}`, impact: item.revenueAtRisk, confidence: item.confidence, tag: item.canAutoResolve ? "Approval ready" : "Review required", canPreview: item.canPreview })); }

  getBriefs() { return this.briefs.find().sort({ createdAt: -1 }).limit(50).lean(); }
  getReports() { return this.reports.find().sort({ createdAt: -1 }).limit(50).lean(); }
  getActivity() { return this.audits.find().sort({ createdAt: -1 }).limit(100).lean(); }
  getMarketIntelligence() { return this.market.list(); }

  async refreshMarketIntelligence() {
    if (!this.listingsCache.length) this.listingsCache = await this.wheelhouse.listings();
    const result = await this.refreshIntelligenceFor(this.listingsCache);
    this.lastIntelligenceRefresh = new Date().toISOString();
    return result;
  }

  private async refreshIntelligenceFor(listings: WheelhouseListing[]) {
    const before = new Set((await this.market.list()).map((signal) => signal.externalId));
    const result = await this.market.refresh(listings);
    if (this.telegram.configured) {
      const after = await this.market.list();
      const fresh = after.filter((signal) => !before.has(signal.externalId));
      await Promise.allSettled(fresh.slice(0, 10).map((signal) => this.telegram.notifyMarketSignal(signal)));
    }
    return result;
  }

  async strategies(listingId: string) {
    if (!this.listingsCache.length) this.listingsCache = await this.wheelhouse.listings();
    const listing = this.listingsCache.find((item) => item.id === listingId);
    if (!listing) throw new NotFoundException("Listing not found in the connected Wheelhouse portfolio");
    const [preferences, current] = await Promise.all([this.wheelhouse.preferences(listing.id, listing.channel), this.wheelhouse.recommendations(listing.id, listing.channel)]);
    const options = [
      { key: "conservative", label: "Conservative", basePrice: current.base_price_conservative ?? current.base_price_recommended ?? current.base_price },
      { key: "balanced", label: "Balanced", basePrice: current.base_price_recommended ?? current.base_price },
      { key: "aggressive", label: "Aggressive", basePrice: current.base_price_aggressive ?? current.base_price_recommended ?? current.base_price },
    ];
    const currentRevenue = this.total(current);
    const previews = await Promise.all(options.map(async (option) => {
      if (!option.basePrice) return { ...option, available: false, reason: "Wheelhouse did not return this base-price option" };
      const preview = await this.wheelhouse.preview(listing.id, listing.channel, { ...preferences, base_price: Math.round(option.basePrice), automatic_rate_posting_enabled: true });
      const projectedRevenue = this.total(preview);
      const horizonDays = Math.min(30, preview.data?.length ?? 0);
      return { ...option, available: true, projectedRevenue, projectedAdr: horizonDays ? Math.round(projectedRevenue / horizonDays) : 0, estimatedUplift: projectedRevenue - currentRevenue, horizonDays, source: "Wheelhouse live non-mutating preview" };
    }));
    return { listing: { id: listing.id, channel: listing.channel, name: listing.nickname || listing.title || listing.id }, currentRevenue, strategies: previews, mutated: false };
  }

  async applyStrategy(listingId: string, strategy: "conservative" | "balanced" | "aggressive", actor: string) {
    if (!this.listingsCache.length) this.listingsCache = await this.wheelhouse.listings();
    const listing = this.listingsCache.find((item) => item.id === listingId);
    if (!listing) throw new NotFoundException("Listing not found in the connected Wheelhouse portfolio");
    const before = await this.wheelhouse.preferences(listing.id, listing.channel);
    const type = ({ conservative: "CON", balanced: "REC", aggressive: "AGG" } as const)[strategy];
    await this.wheelhouse.updateSetting(listing.id, listing.channel, "base_price_adjustment", { type });
    await this.wheelhouse.sync(listing.id, listing.channel);
    const after = await this.wheelhouse.preferences(listing.id, listing.channel);
    await this.audits.create({ action: "apply_pricing_strategy", actor, before, after, source: "Wheelhouse RM API", verified: true });
    return { listingId, strategy, preset: type, status: "applied", sync: "queued", source: "Wheelhouse live" };
  }

  async segments() { return { source: "Wheelhouse live", segments: await this.wheelhouse.segments() }; }
  async segment(id: number) { const [listings, metrics] = await Promise.all([this.wheelhouse.segmentListings(id), this.wheelhouse.segmentMetrics(id)]); return { source: "Wheelhouse live", id, listings, metrics }; }

  async generateExecutiveReport(actor: string) {
    return this.generateReport("executive", actor);
  }

  async generateReport(type: "executive" | "portfolio" | "owner" | "revenue", actor: string, listingId?: string) {
    const dashboard = await this.dashboard();
    const portfolio = type === "portfolio" || type === "owner" ? await this.portfolio() : undefined;
    const listing = listingId ? portfolio?.listings.find((item) => item.id === listingId) : undefined;
    if (type === "owner" && !listing) throw new NotFoundException("Choose a live listing for an owner report");
    const facts = {
      generatedAt: new Date().toISOString(), reportType: type, source: dashboard.source,
      summary: dashboard.summary,
      priorities: dashboard.priorities.slice(0, 10),
      opportunities: type === "revenue" || type === "executive" ? dashboard.opportunities.slice(0, 20) : undefined,
      marketSignals: dashboard.signals.slice(0, 10),
      portfolio: type === "portfolio" ? portfolio?.listings.map((item) => ({ id: item.id, name: item.nickname || item.title || item.id, metrics: item.metrics })) : undefined,
      listing: type === "owner" ? listing : undefined,
    };
    const generated = await this.groq.report(type, facts);
    const label = ({ executive: "Executive revenue report", portfolio: "Portfolio performance report", owner: `Owner report — ${listing?.nickname || listing?.title || listingId}`, revenue: "Revenue opportunity summary" })[type];
    const report = await this.reports.create({ type, title: `${label} — ${new Date().toLocaleDateString("en-US")}`, body: generated.body, generatedBy: generated.generatedBy, metrics: facts, status: "draft" });
    await this.audits.create({ action: `generate_${type}_report`, actor, after: { reportId: String(report._id), listingId }, source: "Groq grounded in Wheelhouse live data", verified: true });
    return report.toObject();
  }

  async ask(question: string) {
    const dashboard = await this.dashboard();
    const context = { summary: dashboard.summary, priorities: dashboard.priorities.slice(0, 12), signals: dashboard.signals.slice(0, 12), lastScan: this.lastScan, source: dashboard.source };
    return this.groq.answer(question, context);
  }

  async sendDailyBriefing() {
    const dashboard = await this.dashboard();
    return this.telegram.broadcastBriefing(dashboard.summary);
  }

  async sendBrief(id: string, userId: string) {
    const brief = await this.briefs.findById(id).lean();
    if (!brief) throw new NotFoundException("Owner brief not found");
    await this.telegram.sendToUser(userId, `Owner brief for ${brief.owner || brief.listingId}\n\n${brief.subject}\n\n${brief.body}`);
    return this.briefs.findByIdAndUpdate(id, { $set: { status: "sent", sentAt: new Date() } }, { returnDocument: "after" }).lean();
  }

  async preview(id: string) {
    const current = this.incidentsCache.find((item) => item.id === id);
    if (!current) throw new NotFoundException("Incident not found");
    if (!current.canPreview) throw new ServiceUnavailableException("This operational incident requires manual review and has no safe pricing preview");
    const preferences = current.preferences ?? await this.wheelhouse.preferences(current.listingId, current.channel);
    const proposed = { ...preferences, base_price: null, automatic_rate_posting_enabled: true };
    const [before, after] = await Promise.all([this.wheelhouse.recommendations(current.listingId, current.channel), this.wheelhouse.preview(current.listingId, current.channel, proposed)]);
    const projectedRecovery = Math.max(0, Math.round(this.total(after) - this.total(before)));
    return { projectedRecovery, currentRevenue: this.total(before), optimizedRevenue: this.total(after), mutated: false, source: "Wheelhouse live preview" };
  }

  async resolve(id: string, actor: string) {
    const current = this.incidentsCache.find((item) => item.id === id);
    if (!current) throw new NotFoundException("Incident not found");
    if (!current.canAutoResolve) throw new ServiceUnavailableException("This incident cannot be resolved through an automatic pricing mutation");
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
