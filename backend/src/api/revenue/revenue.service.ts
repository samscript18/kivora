import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { Connection, Model, Types } from "mongoose";
import { createHash, randomUUID } from "crypto";
import { GroqService } from "../integrations/services/groq.service";
import { MarketIntelligenceService } from "../integrations/services/market-intelligence.service";
import { TelegramService } from "../integrations/services/telegram.service";
import { Preferences, RecommendationResponse, WheelhouseListing, WheelhouseService } from "../integrations/services/wheelhouse.service";
import { AuditLog } from "./schemas/audit-log.schema";
import { Incident } from "./schemas/incident.schema";
import { OwnerBrief } from "./schemas/owner-brief.schema";
import { Report } from "./schemas/report.schema";
import { AssistantMessage } from "./schemas/assistant-message.schema";
import { Snapshot } from "./schemas/snapshot.schema";
import { AuthenticatedUser } from "../auth/guards/privy-auth.guard";
import { ConnectionService } from "./connection.service";
import { CollaborationEntry, DistributedLock, NotificationDelivery, Outcome, PortfolioHealthScore, Recommendation, RevenueAction, RevenueOpportunity, RevenueSignal, ScanCheckpoint, Simulation } from "./schemas/operations.schema";
import { MetricsService } from "../monitoring/metrics.service";
import {OrganizationIntegrationService}from"../integrations/services/organization-integration.service";
import {opportunityRuleEligible}from"./opportunity-rules";
import {recommendedPricingStrategy,scheduledGroupResult}from"./scheduled-action";

type Factor = { label: string; value: string; note: string };
type LiveIncident = {
  id: string; externalId: string; listingId: string; channel: string; severity: string; title: string;
  listing: string; location: string; currentRate: number; recommendedRate: number; revenueAtRisk: number;
  confidence: number; cause: string; detectedAt: string; status: string; explanation: string; factors: Factor[];
  preferences?: Preferences; owner?: string;
  evidence?: Record<string, unknown>;
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
  private readonly tenantListings = new Map<string, WheelhouseListing[]>();
  private readonly tenantIncidents = new Map<string, LiveIncident[]>();
  private readonly tenantLastScan = new Map<string, string>();
  private readonly tenantIntelligenceRefresh = new Map<string, string>();

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
    @Optional() private readonly connectionService?: ConnectionService,
    @Optional() @InjectModel(ScanCheckpoint.name) private readonly checkpoints?: Model<ScanCheckpoint>,
    @Optional() @InjectModel(DistributedLock.name) private readonly locks?: Model<DistributedLock>,
    @Optional() @InjectModel(RevenueOpportunity.name) private readonly opportunityRecords?: Model<RevenueOpportunity>,
    @Optional() @InjectModel(Recommendation.name) private readonly recommendationRecords?: Model<Recommendation>,
    @Optional() @InjectModel(Simulation.name) private readonly simulations?: Model<Simulation>,
    @Optional() @InjectModel(RevenueAction.name) private readonly actions?: Model<RevenueAction>,
    @Optional() @InjectModel(Outcome.name) private readonly outcomes?: Model<Outcome>,
    @Optional() private readonly metrics?: MetricsService,
    @Optional() @InjectModel(RevenueSignal.name) private readonly signalRecords?: Model<RevenueSignal>,
    @Optional() @InjectModel(CollaborationEntry.name) private readonly collaboration?: Model<CollaborationEntry>,
    @Optional() @InjectModel(NotificationDelivery.name) private readonly notifications?: Model<NotificationDelivery>,
    @Optional() @InjectModel(PortfolioHealthScore.name) private readonly healthScores?: Model<PortfolioHealthScore>,
    @Optional() private readonly organizationSettings?:OrganizationIntegrationService,
    @Optional() @InjectModel(AssistantMessage.name) private readonly assistantMessages?: Model<AssistantMessage>,
  ) {}

  capabilities() {
    return { wheelhouse: this.wheelhouse.capabilities(), marketIntelligence: this.market.capabilities(), telegram: this.telegram.capabilities(), ai: this.groq.capabilities(), database: { configured: Boolean(this.config.get("MONGODB_URI")), connected: this.connection.readyState === 1 }, lastScan: this.lastScan ?? null, lastIntelligenceRefresh: this.lastIntelligenceRefresh ?? null };
  }

  async capabilitiesFor(actor: AuthenticatedUser) {
    const scope = await this.scope(actor);
    return {
      ...this.capabilities(),
      wheelhouse: this.scopedWheelhouseCapabilities(scope),
      permissions: {
        canManageOrganization: ["owner", "administrator"].includes(actor.organizationRole),
        canManageRevenue: ["owner", "administrator", "revenue_manager"].includes(actor.organizationRole),
        canAnalyze: ["owner", "administrator", "revenue_manager", "analyst"].includes(actor.organizationRole),
      },
      lastScan: this.lastScanFor(actor) ?? null,
      lastIntelligenceRefresh: this.tenantIntelligenceRefresh.get(this.tenantKey(actor)) ?? null,
    };
  }

  async scanPortfolio(actor?: AuthenticatedUser, requestedConnectionId?: string) {
    const scope = await this.scope(actor, requestedConnectionId);
    const tenantKey = this.tenantKey(actor);
    const lockOwner = randomUUID();
    const lockKey = `scan:${tenantKey}:${scope.connectionId || "legacy"}`;
    if (actor && !(await this.acquireLock(lockKey, lockOwner, 10 * 60_000))) throw new ConflictException("A portfolio scan is already running for this connection");
    try {
    if (!scope.credential && !this.wheelhouse.configured) throw new ServiceUnavailableException("Wheelhouse is not configured");
    const listings = await this.wheelhouse.listings(scope.credential);
    if (actor) {
      await this.synchronizeListingMappings(actor, listings, scope.connectionId, scope.portfolioId);
      if (requestedConnectionId && this.connection.db) {
        const connectionListingIds = await this.connection.db.collection("listingmappings")
          .find({ organizationId: new Types.ObjectId(actor.organizationId), connectionId: new Types.ObjectId(requestedConnectionId) }, { projection: { externalListingId: 1 } })
          .toArray();
        const replace = new Set(connectionListingIds.map((row) => String(row.externalListingId)));
        this.tenantListings.set(tenantKey, [...this.listingsFor(actor).filter((listing) => !replace.has(listing.id)), ...listings]);
      } else {
        this.tenantListings.set(tenantKey, listings);
      }
    } else this.listingsCache = listings;
    // Five Wheelhouse reads per listing plus pagination keeps the default scan below
    // the documented 60-request/minute integration limit.
    const limit = Math.max(1, Math.min(10, this.config.get<number>("SCAN_BATCH_SIZE", 10)));
    let cursor = actor ? await this.checkpointCursor(actor.organizationId, scope.connectionId) : this.scanCursor;
    if (cursor >= listings.length) cursor = 0;
    const batch = listings.slice(cursor, cursor + limit);
    const completedCycle = cursor + batch.length >= listings.length;
    const nextCursor = completedCycle ? 0 : cursor + batch.length;
    if (!actor) this.scanCursor = nextCursor;
    await this.updateCheckpoint(actor, scope.connectionId, cursor, nextCursor, batch.length, listings.length, completedCycle, "running");
    const found: LiveIncident[] = [];
    for (let i = 0; i < batch.length; i += 3) {
      const results = await Promise.allSettled(batch.slice(i, i + 3).map((listing) => this.analyzeListing(listing, actor, scope.credential, scope.portfolioId)));
      for (const result of results) if (result.status === "fulfilled" && result.value) found.push(result.value);
    }
    const scannedIds = new Set(batch.map((listing) => listing.id));
    const currentIncidents = this.incidentsFor(actor);
    const merged = [...currentIncidents.filter((incident) => !scannedIds.has(incident.listingId)), ...found];
    if (actor) this.tenantIncidents.set(tenantKey, merged); else this.incidentsCache = merged;
    const scannedAt = new Date().toISOString();
    if (actor) this.tenantLastScan.set(tenantKey, scannedAt); else this.lastScan = scannedAt;
    const intelligenceRefresh = actor ? this.tenantIntelligenceRefresh.get(tenantKey) : this.lastIntelligenceRefresh;
    if (!intelligenceRefresh || Date.now() - new Date(intelligenceRefresh).getTime() > 60 * 60_000) {
      try {
        await this.refreshIntelligenceFor(listings, actor, scope.portfolioId);
        const refreshedAt = new Date().toISOString();
        if (actor) this.tenantIntelligenceRefresh.set(tenantKey, refreshedAt); else this.lastIntelligenceRefresh = refreshedAt;
      } catch {
        if (actor) this.tenantIntelligenceRefresh.delete(tenantKey); else this.lastIntelligenceRefresh = undefined;
      }
    }
    for (const incident of found) {
      const orgScope = this.orgScope(actor);
      const impactCalculation = { method: "rate_gap_x_available_horizon_x_occupancy_probability", inputs: { currentRate: incident.currentRate, targetRate: incident.recommendedRate, affectedNights: Number(incident.evidence?.affectedNights || 0), occupancyProbability: Number(incident.evidence?.occupancyProbability || 0) }, assumptions: ["Wheelhouse recommendation is the defensible target", "Only the current preview horizon is included"], calculatedAt: new Date() };
      const previous = await this.incidents.findOneAndUpdate({ ...orgScope, externalId: incident.externalId }, { $set: { ...orgScope, ...(scope.portfolioId ? { portfolioId: new Types.ObjectId(scope.portfolioId) } : {}), listingId: incident.listingId, channel: incident.channel, listing: incident.listing, title: incident.title, cause: incident.cause, rootCause: incident.cause, severity: incident.severity, revenueAtRisk: incident.revenueAtRisk, confidence: incident.confidence, status: "open", verificationState: "unverified", evidence: { location: incident.location, currentRate: incident.currentRate, recommendedRate: incident.recommendedRate, explanation: incident.explanation, factors: incident.factors, canPreview: incident.canPreview, canAutoResolve: incident.canAutoResolve, affectedNights: incident.evidence?.affectedNights, occupancyProbability: incident.evidence?.occupancyProbability, impactCalculation } } }, { upsert: true, returnDocument: "before" }).lean();
      if (actor && this.signalRecords) await this.signalRecords.findOneAndUpdate({ organizationId: new Types.ObjectId(actor.organizationId), deduplicationKey: `incident:${incident.externalId}:${scannedAt.slice(0, 13)}` }, { $set: { organizationId: new Types.ObjectId(actor.organizationId), ...(scope.portfolioId ? { portfolioId: new Types.ObjectId(scope.portfolioId) } : {}), deduplicationKey: `incident:${incident.externalId}:${scannedAt.slice(0, 13)}`, source: "wheelhouse", type: this.signalType(incident.cause), listingId: incident.listingId, listingIds: [incident.listingId], observedValue: { currentRate: incident.currentRate, recommendedRate: incident.recommendedRate }, previousValue: (incident.evidence?.previousState as Record<string, unknown>) || {}, evidence: { factors: incident.factors, impactCalculation }, detectedAt: new Date(scannedAt), validUntil: new Date(Date.now() + 24 * 60 * 60_000) } }, { upsert: true });
      if (actor) await this.ensureRecommendation(actor, incident, scope.portfolioId, impactCalculation);
      if (this.telegram.configured && actor && (!previous || previous.status !== "open")) await this.telegram.notifyIncident(incident, actor.organizationId);
    }
    await this.incidents.updateMany({ ...this.orgScope(actor), listingId: { $in: [...scannedIds] }, externalId: { $nin: found.map((incident) => incident.externalId) }, status: "open" }, { $set: { status: "resolved", resolvedAt: new Date(), verificationState: "condition_cleared" } });
    if (actor) { await this.persistHealthScore(actor, scope.portfolioId); await this.audits.create({ organizationId: new Types.ObjectId(actor.organizationId), actorUserId: new Types.ObjectId(actor.sub), actor: actor.name, action: "portfolio_scan_completed", entityType: "scan", entityId: `${scope.connectionId}:${scannedAt}`, after: { scanned: batch.length, total: listings.length, incidents: found.length, completeCycle: completedCycle }, source: "Wheelhouse live", verified: true }); }
    await this.updateCheckpoint(actor, scope.connectionId, cursor, nextCursor, batch.length, listings.length, completedCycle, "idle");
    this.metrics?.increment("portfolio_scans_completed_total"); this.metrics?.increment("incidents_detected_total", {}, found.length); this.metrics?.observe("portfolio_scan_coverage_percent", listings.length ? (batch.length / listings.length) * 100 : 100);
    return { source: "Wheelhouse live", scanned: batch.length, total: listings.length, incidents: found.length, nextCursor, completeCycle: completedCycle };
    } catch (error) {
      await this.failCheckpoint(actor, scope.connectionId, error);
      throw error;
    } finally {
      if (actor) await this.releaseLock(lockKey, lockOwner);
    }
  }

  private async analyzeListing(listing: WheelhouseListing, actor?: AuthenticatedUser, credential?: string, portfolioId?: string): Promise<LiveIncident | null> {
    const previousSnapshot = await this.snapshots.findOne({ ...this.orgScope(actor), listingId: listing.id }).sort({ createdAt: -1 }).lean();
    const [preferences, recommendations, kpis, changesResult, flagsResult] = await Promise.all([
      this.wheelhouse.preferences(listing.id, listing.channel, credential),
      this.wheelhouse.recommendations(listing.id, listing.channel, credential),
      this.wheelhouse.kpis(listing.id, listing.channel, credential),
      this.wheelhouse.recentChanges(listing.id, listing.channel, credential).catch(() => undefined),
      this.wheelhouse.flags(listing.id, listing.channel, credential).catch(() => []),
    ]);
    const base = Number(preferences.base_price ?? recommendations.base_price ?? 0);
    const recommended = Number(recommendations.base_price_recommended ?? 0);
    const posting = preferences.automatic_rate_posting_enabled ?? recommendations.automatic_rate_posting_enabled ?? true;
    const forwardOccupancy = metricAt(kpis, "occupancy", "0_30");
    const occupancy = metricAt(kpis, "occupancy", "30_0");
    const adr = metricAt(kpis, "adr", "30_0");
    const revenue = metricAt(kpis, "revenue", "30_0");
    const revpar = metricAt(kpis, "revpar", "30_0");
    const pickup = metricAt(kpis, "pickup", "30_0");
    const marketOccupancy = metricAt(kpis, "occupancy_neighborhood");
    const compSetOccupancy = metricAt(kpis, "comp_set_occupancy");
    const revenueScore = metricAt(kpis, "revenue_score");
    const divergence = recommended > 0 && base > 0 ? (recommended - base) / recommended : 0;
    const marketGap = Math.max(0, marketOccupancy - forwardOccupancy);
    const health = Math.max(0, Math.min(100, Math.round(100 - (posting ? 0 : 30) - Math.max(0, divergence) * 45 - marketGap * 30)));
    await this.snapshots.create({ ...this.orgScope(actor), ...(portfolioId ? { portfolioId: new Types.ObjectId(portfolioId) } : {}), listingId: listing.id, channel: listing.channel, health, occupancy, forwardOccupancy, adr, revenue, revpar, pickup, marketOccupancy, compSetOccupancy, revenueScore, dynamicPricingEnabled: posting, basePrice: base, recommendedBasePrice: recommended, raw: { kpis } });
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
    const pricingExposure = Math.abs(recommended - base) * Math.max(1, affected) * Math.max(0.35, forwardOccupancy || marketOccupancy || 0);
    const paceExposure = Math.max(0, marketGap) * Math.max(recommended, adr, 1) * 30;
    const atRisk = Math.max(0, Math.round(pricingIncident ? pricingExposure : paceExposure));
    const suffix = !posting ? "posting-disabled" : calendarFlag ? "calendar-sync" : materiallyUnderpriced ? "underpriced" : materiallyOverpriced ? "overpriced" : "slow-pace";
    const title = !posting ? "Dynamic pricing is not posting" : calendarFlag ? "Calendar synchronization needs attention" : materiallyUnderpriced ? "Base price is below Wheelhouse guidance" : materiallyOverpriced ? "Base price may be suppressing occupancy" : "Booking pace is trailing the local market";
    const explanation = pricingIncident
      ? `${cause} is preventing Wheelhouse's recommendation from controlling the effective base rate.`
      : `${cause} was verified from current Wheelhouse flags and rolling market KPIs. Kivora will not change pricing automatically for this issue.`;
    return { id: `${listing.id}-${suffix}`, externalId: `${listing.id}-${suffix}`, listingId: listing.id, channel: listing.channel, severity: atRisk > 3000 || calendarFlag ? "Critical" : "Warning", title, listing: listing.nickname || listing.title || listing.id, location: listing.location?.address || listing.location?.country || "Unknown", currentRate: base, recommendedRate: recommended, revenueAtRisk: atRisk, confidence: Math.min(99, Math.round(78 + Math.abs(divergence) * 20 + (calendarFlag ? 8 : 0))), cause, detectedAt: new Date().toISOString(), status: "open", explanation, factors: [{ label: "Base price gap", value: `${Math.round(divergence * 100)}%`, note: "vs Wheelhouse" }, { label: "Forward 30-day occupancy", value: `${Math.round(forwardOccupancy * 100)}%`, note: "booking pace KPI" }, { label: "Trailing 30-day occupancy", value: `${Math.round(occupancy * 100)}%`, note: "historical KPI" }, { label: "Market occupancy", value: `${Math.round(marketOccupancy * 100)}%`, note: "neighborhood KPI" }, { label: "Automatic posting", value: posting ? "On" : "Off", note: "pricing preference" }, { label: "Recent rate change", value: changesResult?.rates || "Unknown", note: "Wheelhouse" }], evidence: { affectedNights: affected, occupancyProbability: Math.max(0.35, forwardOccupancy || marketOccupancy || 0), previousState: previousSnapshot ? { health: previousSnapshot.health, occupancy: previousSnapshot.occupancy, adr: previousSnapshot.adr, revenue: previousSnapshot.revenue, basePrice: previousSnapshot.basePrice } : {} }, preferences, owner: listing.owner_name, canPreview: pricingIncident, canAutoResolve: pricingIncident };
  }

  async dashboard(actor?: AuthenticatedUser) {
    if (!this.lastScanFor(actor)) await this.scanPortfolio(actor);
    const activeScope = await this.scope(actor);
    const listings = this.listingsFor(actor);
    const snapshots = await this.snapshots.find(this.orgScope(actor)).sort({ createdAt: -1 }).limit(Math.max(listings.length, 1)).lean();
    const incidents = this.incidentsFor(actor);
    const signals = await this.market.list(actor?.organizationId);
    const revenue = snapshots.reduce((sum, item) => sum + (item.revenue || 0), 0);
    const occupancy = snapshots.length ? snapshots.reduce((sum, item) => sum + (item.occupancy || 0), 0) / snapshots.length : 0;
    const health = snapshots.length ? Math.round(snapshots.reduce((sum, item) => sum + (item.health || 0), 0) / snapshots.length) : 0;
    const listingNames = new Map(listings.map((listing) => [listing.id, listing.nickname || listing.title || "Connected property"]));
    const opportunityFilter = actor ? { organizationId: new Types.ObjectId(actor.organizationId), status: { $in: ["open", "under_review", "approved", "ignored"] }, expiresAt: { $gt: new Date() } } : null;
    const opportunities = actor && this.opportunityRecords
      ? await this.opportunityRecords.find(opportunityFilter!).sort({ projectedRevenueGain: -1 }).limit(50).lean().then((rows) => rows.map((row: any) => this.serializeOpportunity(row, listingNames)))
      : this.toOpportunities(incidents);
    const opportunityTotals = actor && this.opportunityRecords
      ? (await this.opportunityRecords.aggregate([{ $match: opportunityFilter! }, { $group: { _id: null, count: { $sum: 1 }, impact: { $sum: "$projectedRevenueGain" } } }]))[0] || { count: 0, impact: 0 }
      : { count: opportunities.length, impact: opportunities.reduce((sum: number, item: any) => sum + Number(item.impact || 0), 0) };
    const [recommendationSummary, actionSummary, outcomeSummary, latestHealth, productivity] = actor ? await Promise.all([
      this.recommendationRecords?.aggregate([{ $match: { organizationId: new Types.ObjectId(actor.organizationId) } }, { $group: { _id: "$status", count: { $sum: 1 }, impact: { $sum: "$estimatedImpact" } } }]) || [],
      this.actions?.aggregate([{ $match: { organizationId: new Types.ObjectId(actor.organizationId) } }, { $group: { _id: "$status", count: { $sum: 1 } } }]) || [],
      this.outcomes?.aggregate([{ $match: { organizationId: new Types.ObjectId(actor.organizationId) } }, { $group: { _id: null, revenueProtected: { $sum: "$revenueProtected" }, realizedRevenue: { $sum: { $ifNull: ["$realizedRevenue", 0] } }, recent: { $sum: { $cond: [{ $gte: ["$createdAt", new Date(Date.now() - 7 * 86_400_000)] }, 1, 0] } } } }]) || [],
      this.healthScores?.findOne({ organizationId: new Types.ObjectId(actor.organizationId) }).sort({ calculatedAt: -1 }).lean() || null,
      this.calculateProductivity(actor),
    ]) : [[], [], [], null, { minutesSaved: 0, calculation: { method: "activity_count_x_configured_manual_duration", inputs: {} } }];
    const recommendationCounts = Object.fromEntries((recommendationSummary as any[]).map((row) => [row._id, row.count]));
    const actionCounts = Object.fromEntries((actionSummary as any[]).map((row) => [row._id, row.count]));
    const outcomeTotals = (outcomeSummary as any[])[0] || { revenueProtected: 0, realizedRevenue: 0, recent: 0 };
    const trend = await this.snapshots.aggregate([
      { $match: { ...this.orgScope(actor), createdAt: { $gte: new Date(Date.now() - 14 * 86_400_000) } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, listingId: "$listingId" }, revenue: { $first: "$revenue" } } },
      { $group: { _id: "$_id.day", revenue: { $sum: "$revenue" } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, day: "$_id", revenue: 1 } },
    ]);
    const activity = await this.audits.find(this.orgScope(actor)).sort({ createdAt: -1 }).limit(6).lean();
    const priorities = [
      ...incidents.map((incident) => ({ id: incident.id, kind: "incident", title: incident.title, property: incident.listing, impact: incident.revenueAtRisk, confidence: incident.confidence, action: incident.canAutoResolve ? "Run a live preview and review the fix" : "Review the verified operational signal" })),
      ...opportunities.slice(0, 12).map((opportunity: any) => ({ id: opportunity.id, kind: "opportunity", title: opportunity.action || opportunity.type, property: opportunity.property, impact: opportunity.impact, confidence: opportunity.confidence, action: "Review revenue opportunity", expiresAt: opportunity.expiresAt })),
      ...signals.slice(0, 8).map((signal) => ({ id: signal.externalId, kind: signal.kind, title: signal.title, property: signal.location, impact: null, confidence: signal.confidence, action: "Review demand signal" })),
    ].map((item: any) => ({ ...item, type: item.kind, priorityScore: this.priorityScore(item) })).sort((a, b) => b.priorityScore - a.priorityScore);
    return {
      source: "Wheelhouse live",
      capabilities: { ...this.capabilities(), wheelhouse: this.scopedWheelhouseCapabilities(activeScope), lastScan: this.lastScanFor(actor) ?? null, lastIntelligenceRefresh: actor ? this.tenantIntelligenceRefresh.get(this.tenantKey(actor)) ?? null : this.lastIntelligenceRefresh ?? null },
      summary: { health: (latestHealth as any)?.overallScore ?? health, healthDetails: latestHealth, revenue, atRisk: incidents.reduce((sum, item) => sum + item.revenueAtRisk, 0), projectedOpportunity: opportunityTotals.impact, opportunities: opportunityTotals.count, occupancy: Number((occupancy * 100).toFixed(1)), criticalIncidents: incidents.filter((item) => item.severity === "Critical").length, marketSignals: signals.length, activeRecommendations: Object.entries(recommendationCounts).filter(([status]) => !["COMPLETED", "DISMISSED", "EXPIRED", "CANCELLED", "FAILED"].includes(status)).reduce((sum, [, count]) => sum + Number(count), 0), awaitingApproval: Number(recommendationCounts.READY || 0) + Number(recommendationCounts.REVIEWED || 0), scheduledActions: Number(actionCounts.SCHEDULED || 0), verificationFailures: Number(actionCounts.FAILED || 0) + Number(actionCounts.PARTIALLY_APPLIED || 0), revenueProtected: outcomeTotals.revenueProtected || 0, realizedRevenue: outcomeTotals.realizedRevenue || 0, recentOutcomes: outcomeTotals.recent || 0, timeSavedMinutes: productivity.minutesSaved, timeSavedCalculation: productivity.calculation },
      trend, incident: incidents[0] ?? null, opportunities, priorities, signals,
      activity: activity.length
        ? activity.map((item: any) => ({ _id: String(item._id), action: item.action, actor: item.actor || item.source || "Kivora", createdAt: item.createdAt }))
        : [{ _id: `portfolio-scan-${this.lastScanFor(actor)}`, action: "live_portfolio_scan_completed", actor: `${listings.length} connected listings`, createdAt: this.lastScanFor(actor) }],
    };
  }

  async portfolio(actor?: AuthenticatedUser) {
    if (!this.lastScanFor(actor)) await this.scanPortfolio(actor);
    const listings = this.listingsFor(actor);
    const snapshots = await this.snapshots.find({ ...this.orgScope(actor), listingId: { $in: listings.map((item) => item.id) } }).sort({ createdAt: -1 }).lean();
    const latest = new Map<string, Snapshot>();
    snapshots.forEach((snapshot) => { if (!latest.has(snapshot.listingId)) latest.set(snapshot.listingId, snapshot); });
    return {
      source: "Wheelhouse live",
      listings: listings.map((listing) => ({
        ...listing,
        location: listing.location ? {
          ...listing.location,
          lat: listing.location.latitude,
          lng: listing.location.longitude,
        } : undefined,
        bedrooms: listing.num_bedrooms,
        beds: listing.num_beds,
        bathrooms: listing.num_bathrooms,
        propertyType: listing.property_type,
        roomType: listing.room_type,
        thumbnail: listing.thumb_url,
        ownerName: listing.owner_name,
        starRating: listing.star_rating,
        reviewCount: listing.num_reviews,
        photoCount: listing.num_photos,
        minimumStay: listing.base_min_night_stay,
        metrics: latest.get(listing.id) ?? null,
      })),
    };
  }
  async listingWorkspace(id:string,actor:AuthenticatedUser){if(!this.connectionService||!this.connection.db)throw new ServiceUnavailableException("Listing workspace unavailable");const organizationId=new Types.ObjectId(actor.organizationId);const mapping:any=await this.connection.db.collection("listingmappings").findOne({organizationId,externalListingId:id,active:true});if(!mapping)throw new NotFoundException("Active organization listing not found");const {connection,credential}=await this.connectionService.credential(actor,String(mapping.connectionId));const [preferences,pricing,recentChanges,neighborhood,snapshots,incidents,opportunities,signals]=await Promise.all([this.wheelhouse.preferences(id,mapping.channel,credential),this.wheelhouse.recommendations(id,mapping.channel,credential),this.wheelhouse.recentChanges(id,mapping.channel,credential).catch(()=>null),this.wheelhouse.neighborhoodPricing(id,mapping.channel,credential).catch(()=>null),this.snapshots.find({organizationId,listingId:id}).sort({createdAt:-1}).limit(60).lean(),this.incidents.find({organizationId,listingId:id}).sort({createdAt:-1}).limit(30).lean(),this.opportunityRecords?.find({organizationId,$or:[{listingId:id},{listingIds:id}]}).sort({createdAt:-1}).limit(30).lean()||[],this.connection.db.collection("marketsignals").find({organizationId,listingIds:id,expiresAt:{$gt:new Date()}}).sort({startsAt:1}).limit(30).toArray()]);const incidentIds=incidents.map((x:any)=>x._id),opportunityIds=(opportunities as any[]).map(x=>x._id);const recommendations:any[]=this.recommendationRecords?await this.recommendationRecords.find({organizationId,$or:[{listingId:id},{listingIds:id},{incidentId:{$in:incidentIds}},{opportunityId:{$in:opportunityIds}}]}).sort({createdAt:-1}).lean():[];const recIds=recommendations.map(x=>x._id);const [simulations,actions,reports]=await Promise.all([this.simulations?.find({organizationId,recommendationId:{$in:recIds}}).sort({createdAt:-1}).lean()||[],this.actions?.find({organizationId,$or:[{targetListings:id},{recommendationId:{$in:recIds}}]}).sort({createdAt:-1}).lean()||[],this.reports.find({organizationId,$or:[{"metrics.listing.id":id},{"metrics.listingId":id}]}).sort({createdAt:-1}).lean()]);const outcomes=this.outcomes&&(actions as any[]).length?await this.outcomes.find({organizationId,actionId:{$in:(actions as any[]).map(x=>x._id)}}).sort({createdAt:-1}).lean():[];const entityIds=[...recIds,...(actions as any[]).map(x=>x._id)].map(String);const activity=await this.audits.find({organizationId,$or:[{entityId:{$in:entityIds}},{incidentId:{$in:incidents.map((x:any)=>x.externalId)}}]}).sort({createdAt:-1}).limit(100).lean();const portfolio=await this.connection.db.collection("portfolios").findOne({_id:mapping.portfolioId,organizationId});return{listing:{id,name:mapping.name,market:mapping.market,status:mapping.active?"active":"archived",channel:mapping.channel,lastSynchronizedAt:mapping.lastSynchronizedAt,propertyProfiles:mapping.propertyProfiles||[],assigneeIds:mapping.assigneeIds||[],portfolio:portfolio?{id:String(portfolio._id),name:portfolio.name,timezone:portfolio.timezone,currency:portfolio.defaultCurrency}:null,connection:{id:String(connection._id),displayName:connection.displayName,status:connection.status,readCapability:connection.readCapability,writeCapability:connection.writeCapability}},performance:{current:snapshots[0]||null,history:snapshots},pricing:{preferences,recommendations:pricing,recentChanges,neighborhood},intelligence:{incidents:incidents.map(x=>this.serializeDocument(x)),opportunities:(opportunities as any[]).map(x=>this.serializeDocument(x)),recommendations:recommendations.map(x=>this.serializeDocument(x)),signals},operations:{simulations:(simulations as any[]).map(x=>this.serializeDocument(x)),actions:(actions as any[]).map(x=>this.serializeDocument(x)),outcomes:(outcomes as any[]).map(x=>this.serializeDocument(x)),activity,reports},capabilities:{...this.wheelhouse.capabilities(credential),canApprove:["owner","administrator","revenue_manager"].includes(actor.organizationRole),listingActive:mapping.active,lastSynchronizedAt:mapping.lastSynchronizedAt}};}

  async getIncidents(actor?: AuthenticatedUser) {
    if (!this.lastScanFor(actor)) await this.scanPortfolio(actor);
    return this.incidentsFor(actor);
  }

  async listingWorkspaceDepth(id: string, actor: AuthenticatedUser) {
    await this.ensureListingMapping(actor, id);
    const workspace: any = await this.listingWorkspace(id, actor);
    if (!this.connectionService) return workspace;

    const { credential } = await this.connectionService.credential(actor, workspace.listing.connection.id);
    const channel = workspace.listing.channel;
    const now = new Date();
    const historyStart = new Date(now);
    historyStart.setUTCDate(historyStart.getUTCDate() - 30);
    const reservationEnd = new Date(now);
    reservationEnd.setUTCDate(reservationEnd.getUTCDate() + 180);
    const date = (value: Date) => value.toISOString().slice(0, 10);
    const unavailable: string[] = [];
    const optional = async <T>(name: string, request: Promise<T>): Promise<T | null> => {
      try {
        return await request;
      } catch {
        unavailable.push(name);
        return null;
      }
    };

    const [
      details,
      pricingTier,
      rollingKpis,
      monthlyKpis,
      neighborhoodOccupancy,
      reservations,
      flags,
      basePriceHistory,
      checkinCheckout,
      minMaxPrices,
      monthlySeasonality,
    ] = await Promise.all([
      optional("listing_details", this.wheelhouse.listing(id, channel, credential)),
      optional("pricing_tier", this.wheelhouse.pricingTier(id, channel, credential)),
      optional("rolling_kpis", this.wheelhouse.kpis(id, channel, credential)),
      optional("monthly_kpis", this.wheelhouse.monthlyKpis(id, channel, credential)),
      optional("neighborhood_occupancy", this.wheelhouse.neighborhoodOccupancy(id, channel, credential)),
      optional("reservations", this.wheelhouse.reservations(id, channel, date(now), date(reservationEnd), credential)),
      optional("flags", this.wheelhouse.flags(id, channel, credential)),
      optional("base_price_history", this.wheelhouse.basePriceHistory(id, channel, date(historyStart), date(now), credential)),
      optional("checkin_checkout", this.wheelhouse.checkinCheckout(id, channel, credential)),
      optional("min_max_prices", this.wheelhouse.minMaxPrices(id, channel, credential)),
      optional("monthly_seasonality", this.wheelhouse.monthlySeasonality(id, channel, credential)),
    ]);

    if (workspace.pricing.neighborhood == null) unavailable.push("neighborhood_pricing");
    if (workspace.pricing.recentChanges == null) unavailable.push("recent_changes");
    const uniqueUnavailable = [...new Set(unavailable)];
    const available = [
      "preferences",
      "price_recommendations",
      ...(workspace.pricing.neighborhood != null ? ["neighborhood_pricing"] : []),
      ...(workspace.pricing.recentChanges != null ? ["recent_changes"] : []),
      ...(details ? ["listing_details"] : []),
      ...(pricingTier ? ["pricing_tier"] : []),
      ...(rollingKpis ? ["rolling_kpis"] : []),
      ...(monthlyKpis ? ["monthly_kpis"] : []),
      ...(neighborhoodOccupancy ? ["neighborhood_occupancy"] : []),
      ...(reservations ? ["reservations"] : []),
      ...(flags ? ["flags"] : []),
      ...(basePriceHistory ? ["base_price_history"] : []),
      ...(checkinCheckout ? ["checkin_checkout"] : []),
      ...(minMaxPrices ? ["min_max_prices"] : []),
      ...(monthlySeasonality ? ["monthly_seasonality"] : []),
    ];

    return {
      ...workspace,
      listing: {
        ...workspace.listing,
        ...(details || {}),
        name: details?.nickname || details?.title || workspace.listing.name,
        flags: flags || [],
      },
      performance: {
        ...workspace.performance,
        rolling: rollingKpis,
        monthly: monthlyKpis,
      },
      pricing: {
        ...workspace.pricing,
        pricingTier,
        neighborhoodOccupancy,
        basePriceHistory,
        checkinCheckout,
        minMaxPrices,
        monthlySeasonality,
      },
      operations: {
        ...workspace.operations,
        reservations: reservations || [],
      },
      liveData: {
        fetchedAt: new Date().toISOString(),
        available,
        unavailable: uniqueUnavailable,
        reservationWindow: { startDate: date(now), endDate: date(reservationEnd) },
      },
    };
  }

  async getOpportunities(actor?: AuthenticatedUser) {
    if (actor && this.opportunityRecords) {
      // Keep historical records available: their linked recommendation lifecycle
      // (READY, CANCELLED, COMPLETED, etc.) is a first-class filter in the UI.
      const rows = await this.opportunityRecords.find({ organizationId: new Types.ObjectId(actor.organizationId), status: { $ne: "superseded" } }).sort({ projectedRevenueGain: -1, confidence: -1, createdAt: -1 }).limit(200).lean();
      const names = await this.opportunityListingNames(rows, actor);
      const recommendationIds = rows.map((row: any) => row.recommendationId).filter(Boolean);
      const recommendations = this.recommendationRecords && recommendationIds.length
        ? await this.recommendationRecords.find({ organizationId: new Types.ObjectId(actor.organizationId), _id: { $in: recommendationIds } }).select("_id opportunityId status").lean()
        : [];
      const lifecycleByOpportunity = new Map<string, string>();
      for (const recommendation of recommendations as any[]) {
        lifecycleByOpportunity.set(String(recommendation.opportunityId), recommendation.status);
      }
      return rows.map((row: any) => this.serializeOpportunity(row, names, lifecycleByOpportunity.get(String(row._id))));
    }
    return this.toOpportunities(await this.getIncidents(actor));
  }
  private toOpportunities(items: LiveIncident[]) { return items.map((item) => ({ id: item.id, property: item.listing, action: item.canAutoResolve ? "Restore Wheelhouse dynamic pricing" : `Review ${item.cause.toLowerCase()}`, impact: item.revenueAtRisk, confidence: item.confidence, tag: item.canAutoResolve ? "Approval ready" : "Review required", canPreview: item.canPreview })); }

  getBriefs(actor?: AuthenticatedUser) { return this.briefs.find(this.orgScope(actor)).sort({ createdAt: -1 }).limit(50).lean(); }
  getReports(actor?: AuthenticatedUser) { return this.reports.find(this.orgScope(actor)).sort({ createdAt: -1 }).limit(50).lean(); }
  getActivity(actor?: AuthenticatedUser) { return this.audits.find(this.orgScope(actor)).sort({ createdAt: -1 }).limit(100).lean(); }
  getMarketIntelligence(actor?: AuthenticatedUser) { return this.market.list(actor?.organizationId); }

  async refreshMarketIntelligence(actor?: AuthenticatedUser) {
    if (actor) this.requireAnalyst(actor);
    const scope = await this.scope(actor);
    let listings = this.listingsFor(actor);
    if (!listings.length) { listings = await this.wheelhouse.listings(scope.credential); this.setListings(actor, listings); }
    const result = await this.refreshIntelligenceFor(listings, actor, scope.portfolioId);
    if (actor) this.tenantIntelligenceRefresh.set(this.tenantKey(actor), new Date().toISOString()); else this.lastIntelligenceRefresh = new Date().toISOString();
    return result;
  }

  private async refreshIntelligenceFor(listings: WheelhouseListing[], actor?: AuthenticatedUser, portfolioId?: string) {
    const before = new Set((await this.market.list(actor?.organizationId)).map((signal) => signal.externalId));
    const result = await this.market.refresh(listings, actor?.organizationId, portfolioId);
    if (this.telegram.configured) {
      const after = await this.market.list(actor?.organizationId);
      const fresh = after.filter((signal) => !before.has(signal.externalId));
      await Promise.allSettled(fresh.slice(0, 10).map((signal) => this.telegram.notifyMarketSignal(signal, actor?.organizationId)));
    }
    if (actor && this.opportunityRecords) {
      try {
        const scope = await this.scope(actor);
        await this.detectIndependentOpportunities(actor, listings, scope.credential, portfolioId,scope.connectionId);
      } catch (error) {
        result.errors.push({
          provider: "Wheelhouse opportunity scan",
          location: "Connected portfolio",
          message: this.errorMessage(error),
        });
      }
    }
    return result;
  }

  async strategies(listingId: string, actor?: AuthenticatedUser, recommendationId?: string) {
    if (actor) this.requireAnalyst(actor);
    const scope = await this.scope(actor);
    let listings = this.listingsFor(actor);
    if (!listings.length) { listings = await this.wheelhouse.listings(scope.credential); this.setListings(actor, listings); }
    const listing = listings.find((item) => item.id === listingId);
    if (!listing) throw new NotFoundException("Listing not found in the connected Wheelhouse portfolio");
    const [preferences, current] = await Promise.all([this.wheelhouse.preferences(listing.id, listing.channel, scope.credential), this.wheelhouse.recommendations(listing.id, listing.channel, scope.credential)]);
    const options = [
      { key: "conservative", label: "Conservative", basePrice: current.base_price_conservative ?? current.base_price_recommended ?? current.base_price },
      { key: "balanced", label: "Balanced", basePrice: current.base_price_recommended ?? current.base_price },
      { key: "aggressive", label: "Aggressive", basePrice: current.base_price_aggressive ?? current.base_price_recommended ?? current.base_price },
    ];
    const currentRevenue = this.total(current);
    const previews = await Promise.all(options.map(async (option) => {
      if (!option.basePrice) return { ...option, available: false, reason: "Wheelhouse did not return this base-price option" };
      const preview = await this.wheelhouse.preview(listing.id, listing.channel, { ...preferences, base_price: Math.round(option.basePrice), automatic_rate_posting_enabled: true }, scope.credential);
      const projectedRevenue = this.total(preview);
      const horizonDays = Math.min(30, preview.data?.length ?? 0);
      return { ...option, available: true, projectedRevenue, projectedAdr: horizonDays ? Math.round(projectedRevenue / horizonDays) : 0, estimatedUplift: projectedRevenue - currentRevenue, horizonDays, source: "Wheelhouse live non-mutating preview" };
    }));
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    const serializedPreviews: any[] = [...previews];
    if (actor && this.simulations) {
      for (let index = 0; index < previews.length; index++) {
        const preview = previews[index]; if (!("estimatedUplift" in preview)) continue;
        const simulation = await this.simulations.create({ organizationId: new Types.ObjectId(actor.organizationId), userId: new Types.ObjectId(actor.sub), ...(scope.portfolioId ? { portfolioId: new Types.ObjectId(scope.portfolioId) } : {}), ...(recommendationId && Types.ObjectId.isValid(recommendationId) ? { recommendationId: new Types.ObjectId(recommendationId) } : {}), scope: "single_listing", inputSettings: { listingId, channel: listing.channel, strategy: preview.key, basePrice: preview.basePrice }, baselineState: { preferences, currentRevenue }, previewResponse: preview, calculatedProjections: { method: "wheelhouse_preview_sum", estimatedUplift: preview.estimatedUplift, horizonDays: preview.horizonDays, uncertainty: "Wheelhouse preview; not a guaranteed booking outcome", occupancy: "unavailable_from_preview", revpar: "unavailable_from_preview", bookingPace: "unavailable_from_preview" }, selectedStrategy: preview.key, expiresAt });
        serializedPreviews[index] = { ...preview, simulationId: String(simulation._id), expiresAt };
      }
    }
    return { listing: { id: listing.id, channel: listing.channel, name: listing.nickname || listing.title || listing.id }, currentRevenue, strategies: serializedPreviews, mutated: false, expiresAt };
  }

  async applyStrategy(listingId: string, strategy: "conservative" | "balanced" | "aggressive", actor: AuthenticatedUser | string, metadata?: { recommendationId?: Types.ObjectId; simulationId?: Types.ObjectId; parentActionId?: Types.ObjectId; connectionId?: Types.ObjectId }) {
    const user = typeof actor === "string" ? undefined : actor;
    const actorName = typeof actor === "string" ? actor : actor.name;
    let scope = await this.scope(user);
    if (user && metadata?.connectionId && this.connectionService) { const selected = await this.connectionService.credential(user, String(metadata.connectionId)); const portfolio = await this.connection.db!.collection("portfolios").findOne({ organizationId: new Types.ObjectId(user.organizationId), connectionId: metadata.connectionId, status: "active" }); scope = { credential: selected.credential, connectionId: String(metadata.connectionId), portfolioId: portfolio ? String(portfolio._id) : undefined }; }
    this.wheelhouse.assertWriteAccess(scope.credential);
    let listings = this.listingsFor(user);
    if (!listings.length) { listings = await this.wheelhouse.listings(scope.credential); this.setListings(user, listings); }
    const listing = listings.find((item) => item.id === listingId);
    if (!listing) throw new NotFoundException("Listing not found in the connected Wheelhouse portfolio");
    const before = await this.wheelhouse.preferences(listing.id, listing.channel, scope.credential);
    const type = ({ conservative: "CON", balanced: "REC", aggressive: "AGG" } as const)[strategy];
    const idempotencyKey = createHash("sha256").update(`${user?.organizationId || "legacy"}:${listingId}:${strategy}:${JSON.stringify(before)}`).digest("hex");
    let action: any;
    if (user && this.actions) {
      action = await this.actions.findOneAndUpdate({ organizationId: new Types.ObjectId(user.organizationId), idempotencyKey }, { $setOnInsert: { organizationId: new Types.ObjectId(user.organizationId), ...(scope.portfolioId ? { portfolioId: new Types.ObjectId(scope.portfolioId) } : {}), connectionId: new Types.ObjectId(scope.connectionId!), requestedBy: new Types.ObjectId(user.sub), approvedBy: new Types.ObjectId(user.sub), ...(metadata?.recommendationId ? { recommendationId: metadata.recommendationId } : {}), ...(metadata?.simulationId ? { simulationId: metadata.simulationId } : {}), ...(metadata?.parentActionId ? { parentActionId: metadata.parentActionId } : {}), actionType: "apply_pricing_preset", targetListings: [listingId], requestedPayload: { strategy, preset: type }, baselineState: before, idempotencyKey, status: "EXECUTING", attemptCount: 0 } }, { upsert: true, returnDocument: "after" }).lean();
      if (action.status !== "EXECUTING") return this.serializeAction(action);
      await this.actions.updateOne({ _id: action._id }, { $inc: { attemptCount: 1 } });
    }
    try {
    const upstream = await this.wheelhouse.updateSetting(listing.id, listing.channel, "base_price_adjustment", { type }, scope.credential);
      await this.markConnectionWriteVerified(user, scope.connectionId);
      const syncResult = await this.requestWheelhouseSync(listing.id, listing.channel, scope.credential);
      const after = await this.wheelhouse.preferences(listing.id, listing.channel, scope.credential);
      const actual = (after as any).base_price_adjustment;
      const verified = actual === type || (typeof actual === "object" && actual?.type === type);
      const status = verified ? "VERIFIED" : "APPLIED";
      const verificationResult = { supported: actual !== undefined, expected: { base_price_adjustment: type }, actual: { base_price_adjustment: actual }, matched: verified, sync: syncResult };
      if (action && this.actions) await this.actions.updateOne({ _id: action._id }, { $set: { status, upstreamResponse: this.safeUpstream(upstream), verificationResult, executedAt: new Date(), completedAt: new Date(), revertInformation: { supported: true, previousState: before, actionType: "restore_preferences" }, ...(verified ? { verifiedAt: new Date() } : {}) } });
      await this.audits.create({ ...this.orgScope(user), ...(user ? { actorUserId: new Types.ObjectId(user.sub) } : {}), action: "apply_pricing_strategy", actor: actorName, entityType: "revenue_action", entityId: action ? String(action._id) : undefined, before, after, source: "Wheelhouse RM API", verified });
      if (verified && action && user && this.outcomes) await this.createOutcome(user, action._id, before, 0, listing.currency || "USD");
      this.metrics?.increment("revenue_actions_executed_total", { type: "pricing_preset", status });
      return { listingId, strategy, preset: type, status, verified, verificationResult, actionId: action ? String(action._id) : undefined, sync: "requested", source: "Wheelhouse live" };
    } catch (error) {
      if (action && this.actions) await this.actions.updateOne({ _id: action._id }, { $set: { status: "FAILED", errorDetails: { message: this.errorMessage(error) }, completedAt: new Date() } });
      throw error;
    }
  }

  async segments(actor?: AuthenticatedUser) { const scope = await this.scope(actor); return { source: "Wheelhouse live", segments: await this.wheelhouse.segments(scope.credential) }; }
  async segment(id: number, actor?: AuthenticatedUser) { const scope = await this.scope(actor); const [listings, metrics] = await Promise.all([this.wheelhouse.segmentListings(id, scope.credential), this.wheelhouse.segmentMetrics(id, scope.credential)]); return { source: "Wheelhouse live", id, listings, metrics }; }

  async generateExecutiveReport(actor: AuthenticatedUser | string) {
    return this.generateReport("executive", actor);
  }

  async generateReport(type: "executive" | "portfolio" | "owner" | "revenue", actor: AuthenticatedUser | string, listingId?: string) {
    const user = typeof actor === "string" ? undefined : actor;
    if(user&&!["owner","administrator","revenue_manager","analyst"].includes(user.organizationRole))throw new ForbiddenException("Report analyst permission is required");
    const actorName = typeof actor === "string" ? actor : actor.name;
    const organization:any=user&&this.connection.db?await this.connection.db.collection("organizations").findOne({_id:new Types.ObjectId(user.organizationId)},{projection:{defaultCurrency:1,defaultTimezone:1}}):null;
    const dashboard = await this.dashboard(user);
    const portfolio = type === "portfolio" || type === "owner" ? await this.portfolio(user) : undefined;
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
    const body = this.reportBody(generated.body, type, facts);
    const label = ({ executive: "Executive revenue report", portfolio: "Portfolio performance report", owner: `Owner report — ${listing?.nickname || listing?.title || listingId}`, revenue: "Revenue opportunity summary" })[type];
    const report = await this.reports.create({ ...this.orgScope(user), type, title: `${label} — ${new Date().toLocaleDateString("en-US")}`, body, generatedBy: generated.generatedBy, metrics: facts, status: "draft", currency: listing?.currency || organization?.defaultCurrency || "USD", timezone: organization?.defaultTimezone || "UTC", version: 1 });
    await this.audits.create({ ...this.orgScope(user), ...(user ? { actorUserId: new Types.ObjectId(user.sub) } : {}), action: `generate_${type}_report`, actor: actorName, entityType: "report", entityId: String(report._id), after: { reportId: String(report._id), listingId }, source: "Groq grounded in Wheelhouse live data", verified: true });
    return report.toObject();
  }

  async ask(question: string, actor?: AuthenticatedUser, channel: "web" | "telegram" = "web") {
    const history = actor && this.assistantMessages ? await this.assistantMessages.find({ organizationId: new Types.ObjectId(actor.organizationId), userId: new Types.ObjectId(actor.sub) }).sort({ createdAt: -1 }).limit(12).lean() : [];
    const dashboard = await this.dashboard(actor);
    const rankedIncidents = [...this.incidentsFor(actor)].sort((a, b) => b.revenueAtRisk - a.revenueAtRisk);
    const largest = rankedIncidents[0];
    const context = {
      asOf: this.lastScanFor(actor),
      currency: "USD",
      portfolioSummary: dashboard.summary,
      revenueRisk: {
        activeIncidentCount: rankedIncidents.length,
        criticalIncidentCount: dashboard.summary.criticalIncidents,
        totalRevenueAtRisk: dashboard.summary.atRisk,
        largestIncident: largest ? {
          id: largest.id,
          title: largest.title,
          property: largest.listing,
          cause: largest.cause,
          measuredRevenueAtRisk: largest.revenueAtRisk,
          currentRate: largest.currentRate,
          recommendedRate: largest.recommendedRate,
          confidence: largest.confidence,
        } : null,
      },
      opportunities: dashboard.opportunities.slice(0, 12),
      demandSignals: dashboard.signals.slice(0, 12).map((signal) => ({
        kind: signal.kind,
        title: signal.title,
        location: signal.location,
        confidence: signal.confidence,
        affectedListings: signal.affectedListings,
        measuredRevenueImpact: null,
      })),
      conversationHistory: history.reverse().map((message) => ({ role: message.role, text: message.text })),
    };
    if (actor && this.assistantMessages) await this.assistantMessages.create({ organizationId: new Types.ObjectId(actor.organizationId), userId: new Types.ObjectId(actor.sub), role: "user", text: question.trim(), channel, grounded: true });
    const answer = await this.groq.answer(question, context);
    if (actor && this.assistantMessages) await this.assistantMessages.create({ organizationId: new Types.ObjectId(actor.organizationId), userId: new Types.ObjectId(actor.sub), role: "assistant", text: answer.body, channel, generatedBy: answer.generatedBy, grounded: answer.grounded });
    return answer;
  }

  async assistantHistory(actor: AuthenticatedUser) {
    if (!this.assistantMessages) return [];
    const rows = await this.assistantMessages.find({ organizationId: new Types.ObjectId(actor.organizationId), userId: new Types.ObjectId(actor.sub) }).sort({ createdAt: -1 }).limit(100).lean();
    return rows.reverse().map((message: any) => ({ id: String(message._id), role: message.role, text: message.text, createdAt: message.createdAt, grounded: message.grounded }));
  }

  async clearAssistantHistory(actor: AuthenticatedUser) {
    if (!this.assistantMessages) return { cleared: 0 };
    const result = await this.assistantMessages.deleteMany({ organizationId: new Types.ObjectId(actor.organizationId), userId: new Types.ObjectId(actor.sub) });
    return { cleared: result.deletedCount };
  }

  async sendDailyBriefing(actor?: AuthenticatedUser) {
    const dashboard = await this.dashboard(actor);
    return this.telegram.broadcastBriefing(dashboard.summary, actor?.organizationId,dashboard.priorities);
  }

  async sendBrief(id: string, userId: string, actor?: AuthenticatedUser) {
    if(actor&&!['owner','administrator','revenue_manager'].includes(actor.organizationRole))throw new ForbiddenException("Revenue manager permission is required");
    const briefId = this.objectId(id);
    const brief = await this.briefs.findOne({ _id: briefId, ...this.orgScope(actor) }).lean();
    if (!brief) throw new NotFoundException("Owner brief not found");
    await this.telegram.sendToUser(userId, `Owner brief for ${brief.owner || brief.listingId}\n\n${brief.subject}\n\n${brief.body}`, actor?.organizationId);
    return this.briefs.findOneAndUpdate({ _id: briefId, ...this.orgScope(actor) }, { $set: { status: "sent", sentAt: new Date() } }, { returnDocument: "after" }).lean();
  }

  async preview(id: string, actor?: AuthenticatedUser) {
    const current = this.incidentsFor(actor).find((item) => item.id === id);
    if (!current) throw new NotFoundException("Incident not found");
    if (!current.canPreview) throw new ServiceUnavailableException("This operational incident requires manual review and has no safe pricing preview");
    const scope = await this.scope(actor);
    const preferences = current.preferences ?? await this.wheelhouse.preferences(current.listingId, current.channel, scope.credential);
    const proposed = { ...preferences, base_price: null, automatic_rate_posting_enabled: true };
    const [before, after] = await Promise.all([this.wheelhouse.recommendations(current.listingId, current.channel, scope.credential), this.wheelhouse.preview(current.listingId, current.channel, proposed, scope.credential)]);
    const projectedRecovery = Math.max(0, Math.round(this.total(after) - this.total(before)));
    return { projectedRecovery, currentRevenue: this.total(before), optimizedRevenue: this.total(after), mutated: false, source: "Wheelhouse live preview" };
  }

  async resolve(id: string, actor: AuthenticatedUser | string) {
    const user = typeof actor === "string" ? undefined : actor;
    const actorName = typeof actor === "string" ? actor : actor.name;
    const scope = await this.scope(user);
    this.wheelhouse.assertWriteAccess(scope.credential);
    const current = this.incidentsFor(user).find((item) => item.id === id);
    if (!current) throw new NotFoundException("Incident not found");
    if (!current.canAutoResolve) throw new ServiceUnavailableException("This incident cannot be resolved through an automatic pricing mutation");
    const generated = await this.groq.ownerBrief({ owner: current.owner, listing: current.listing, cause: current.cause, impact: current.revenueAtRisk, action: "We restored Wheelhouse dynamic pricing and queued a channel synchronization." });
    let recommendation: any;
    if (user && this.recommendationRecords) {
      const storedIncident = await this.incidents.findOne({ organizationId: new Types.ObjectId(user.organizationId), externalId: current.externalId }).lean();
      if (storedIncident) {
        recommendation = await this.recommendationRecords.findOne({ organizationId: new Types.ObjectId(user.organizationId), incidentId: storedIncident._id, status: { $in: ["READY", "REVIEWED", "APPROVED"] }, expiresAt: { $gt: new Date() } }).lean();
        if (!recommendation) throw new ConflictException("A current approval-ready recommendation is required");
        if (recommendation.status !== "APPROVED") await this.recommendationRecords.updateOne({ _id: recommendation._id, status: recommendation.status }, { $set: { status: "APPROVED" }, $push: { transitions: { from: recommendation.status, to: "APPROVED", actorUserId: user.sub, actor: user.name, at: new Date(), reason: "Approved through incident resolution workflow" } } });
      }
    }
    const before = current.preferences ?? await this.wheelhouse.preferences(current.listingId, current.channel, scope.credential);
    const evidenceRate = Number(recommendation?.evidence?.currentRate);
    if (recommendation && Number.isFinite(evidenceRate) && Math.abs(Number(before.base_price || 0) - evidenceRate) > 1) {
      await this.recommendationRecords!.updateOne({ _id: recommendation._id }, { $set: { status: "EXPIRED", decisionReason: "Live pricing state changed before execution" }, $push: { transitions: { from: recommendation.status, to: "EXPIRED", actor: "system", at: new Date(), reason: "Stale evidence" } } });
      throw new ConflictException("Recommendation evidence is stale; refresh the portfolio analysis before approval");
    }
    const after = { ...before, base_price: null, automatic_rate_posting_enabled: true };
    const idempotencyKey = createHash("sha256").update(`${user?.organizationId || "legacy"}:${id}:restore:${JSON.stringify(before)}`).digest("hex");
    let action: any;
    if (user && this.actions) {
      action = await this.actions.findOneAndUpdate({ organizationId: new Types.ObjectId(user.organizationId), idempotencyKey }, { $setOnInsert: { organizationId: new Types.ObjectId(user.organizationId), ...(scope.portfolioId ? { portfolioId: new Types.ObjectId(scope.portfolioId) } : {}), connectionId: new Types.ObjectId(scope.connectionId!), ...(recommendation ? { recommendationId: recommendation._id } : {}), requestedBy: new Types.ObjectId(user.sub), approvedBy: new Types.ObjectId(user.sub), actionType: "restore_dynamic_pricing", targetListings: [current.listingId], requestedPayload: after, baselineState: before, idempotencyKey, status: "EXECUTING", attemptCount: 0 } }, { upsert: true, returnDocument: "after" }).lean();
      if (action.status !== "EXECUTING") return { ...this.serializeAction(action), recovered: current.revenueAtRisk };
      await this.actions.updateOne({ _id: action._id }, { $inc: { attemptCount: 1 } });
    }
    try {
    await this.wheelhouse.updatePreferences(current.listingId, current.channel, after, scope.credential);
    await this.wheelhouse.enableAutomaticPosting(current.listingId, current.channel, scope.credential);
    await this.markConnectionWriteVerified(user, scope.connectionId);
    const syncResult = await this.requestWheelhouseSync(current.listingId, current.channel, scope.credential);
    const verified = await this.wheelhouse.preferences(current.listingId, current.channel, scope.credential);
    if (verified.base_price !== null && verified.base_price !== undefined) throw new ServiceUnavailableException("Wheelhouse verification failed: the base-price override remains active");
    this.setIncidents(user, this.incidentsFor(user).filter((item) => item.id !== id));
    if (action && this.actions) await this.actions.updateOne({ _id: action._id }, { $set: { status: "VERIFIED", verificationResult: { matched: true, expected: { base_price: null, automatic_rate_posting_enabled: true }, actual: verified, sync: syncResult }, revertInformation: { supported: true, previousState: before, actionType: "restore_preferences" }, executedAt: new Date(), verifiedAt: new Date(), completedAt: new Date() } });
    if (recommendation && this.recommendationRecords) await this.recommendationRecords.updateOne({ _id: recommendation._id }, { $set: { status: "VERIFIED" }, $push: { transitions: { $each: [{ from: "APPROVED", to: "EXECUTING", actor: actorName, at: new Date() }, { from: "EXECUTING", to: "APPLIED", actor: "system", at: new Date() }, { from: "APPLIED", to: "VERIFYING", actor: "system", at: new Date() }, { from: "VERIFYING", to: "VERIFIED", actor: "system", at: new Date(), actionId: action ? String(action._id) : undefined }] } } });
    await Promise.all([this.audits.create({ ...this.orgScope(user), ...(user ? { actorUserId: new Types.ObjectId(user.sub) } : {}), action: "restore_dynamic_pricing", incidentId: id, actor: actorName, entityType: "revenue_action", entityId: action ? String(action._id) : undefined, before, after: verified, projectedImpact: current.revenueAtRisk, verified: true }), this.incidents.updateOne({ ...this.orgScope(user), externalId: current.externalId }, { $set: { status: "resolved", resolvedAt: new Date(), verificationState: "verified" } }), this.briefs.create({ ...this.orgScope(user), listingId: current.listingId, owner: current.owner, subject: "Revenue protection update", body: generated.body, status: "draft" })]);
    if (action && user && this.outcomes) await this.createOutcome(user, action._id, before, current.revenueAtRisk, "USD");
    this.metrics?.increment("revenue_actions_executed_total", { type: "restore_dynamic_pricing", status: "VERIFIED" }); this.metrics?.increment("action_verification_total", { result: "success" });
    return { status: "VERIFIED", recovered: current.revenueAtRisk, projectedRevenueProtected: current.revenueAtRisk, realizedRevenue: null, actionId: action ? String(action._id) : undefined, ownerDrafted: true, ownerBrief: generated.body, sync: "verified", source: "Wheelhouse live" };
    } catch(error) {
      if(action&&this.actions)await this.actions.updateOne({_id:action._id},{ $set:{status:"FAILED",completedAt:new Date(),errorDetails:{message:this.errorMessage(error),classification:"execution_or_verification_error"}}});
      if(recommendation&&this.recommendationRecords)await this.recommendationRecords.updateOne({_id:recommendation._id,status:{$in:["APPROVED","EXECUTING"]}},{$set:{status:"FAILED",decisionReason:this.errorMessage(error)},$push:{transitions:{from:recommendation.status==="APPROVED"?"APPROVED":"EXECUTING",to:"FAILED",actor:"system",at:new Date(),reason:this.errorMessage(error),actionId:action?String(action._id):undefined}}});
      this.metrics?.increment("revenue_actions_executed_total",{type:"restore_dynamic_pricing",status:"FAILED"});throw error;
    }
  }

  async underwrite(address: string, marketId: number, acquisitionCost: number, annualExpenses: number, actor?: AuthenticatedUser) {
    if (actor) this.requireAnalyst(actor);
    const scope = await this.scope(actor);
    const raw = await this.wheelhouse.marketTimeSeries(marketId, scope.credential);
    const monthlyRevenue = this.findNumbers(raw, "revenue").slice(-12);
    if (!monthlyRevenue.length) throw new ServiceUnavailableException("Wheelhouse market report did not contain revenue data");
    const annualRevenue = Math.round(monthlyRevenue.reduce((sum, value) => sum + value, 0));
    const occupancyValues = this.findNumbers(raw, "occupancy");
    const adrValues = this.findNumbers(raw, "adr");
    const noi = annualRevenue - annualExpenses;
    const roi = acquisitionCost > 0 ? noi / acquisitionCost * 100 : 0;
    return { address, marketId, score: Math.max(1, Math.min(99, Math.round(50 + roi * 3))), recommendation: roi >= 10 ? "acquire" : "review", annualRevenue, annualExpenses, netOperatingIncome: noi, cashOnCashRoi: Number(roi.toFixed(1)), adr: this.average(adrValues), occupancy: Number((this.average(occupancyValues) * 100).toFixed(1)), comparableListings: 0, confidence: Math.min(95, 60 + monthlyRevenue.length * 3), source: "Wheelhouse live market report" };
  }

  async recommendations(actor: AuthenticatedUser) {
    if (!this.recommendationRecords) return [];
    await this.recommendationRecords.updateMany({ organizationId: new Types.ObjectId(actor.organizationId), status: { $nin: ["COMPLETED", "DISMISSED", "CANCELLED", "FAILED", "REVERTED", "EXPIRED"] }, expiresAt: { $lte: new Date() } }, { $set: { status: "EXPIRED" }, $push: { transitions: { to: "EXPIRED", actor: "system", at: new Date(), reason: "Recommendation validity period ended" } } });
    return this.recommendationRecords.find({ organizationId: new Types.ObjectId(actor.organizationId) }).sort({ estimatedImpact: -1, createdAt: -1 }).limit(200).lean();
  }
  async telegramRecommendation(id:string,actor:AuthenticatedUser){if(!this.recommendationRecords)throw new ServiceUnavailableException("Recommendations unavailable");const item:any=await this.recommendationRecords.findOne({_id:this.objectId(id),organizationId:new Types.ObjectId(actor.organizationId)}).lean();if(!item)throw new NotFoundException("Recommendation not found");return this.serializeDocument(item);}

  async transitionRecommendation(id: string, decision: string, actor: AuthenticatedUser, reason?: string, until?: string) {
    if (!this.recommendationRecords) throw new ServiceUnavailableException("Recommendation persistence is unavailable");
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException("Recommendation identifier is invalid");
    // Authorization is evaluated before lifecycle state so an unprivileged caller
    // cannot infer whether an approval target is currently actionable.
    if (decision === "approve" && !["owner", "administrator", "revenue_manager"].includes(actor.organizationRole)) throw new ForbiddenException("Revenue manager permission is required");
    this.requireAnalyst(actor);
    const recommendation = await this.recommendationRecords.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(actor.organizationId) }).lean();
    if (!recommendation) throw new NotFoundException("Recommendation not found");
    const transitions: Record<string, Record<string, string[]>> = {
      review: { READY: ["REVIEWED"] }, approve: { READY: ["APPROVED"], REVIEWED: ["APPROVED"] },
      ignore: { READY: ["IGNORED"], REVIEWED: ["IGNORED"] }, dismiss: { READY: ["DISMISSED"], REVIEWED: ["DISMISSED"] },
      reopen: { IGNORED: ["READY"], DISMISSED: ["READY"], FAILED: ["READY"] }, cancel: { SCHEDULED: ["CANCELLED"] },
    };
    const next = transitions[decision]?.[recommendation.status]?.[0];
    if (!next) throw new ConflictException(`Cannot ${decision} a ${recommendation.status} recommendation`);
    if (["dismiss"].includes(decision) && !reason?.trim()) throw new BadRequestException("A dismissal reason is required");
    if (recommendation.expiresAt <= new Date() && !["reopen", "cancel"].includes(decision)) throw new ConflictException("Recommendation has expired and must be refreshed");
    const ignoredUntil = decision === "ignore" ? new Date(until || Date.now() + 24 * 60 * 60_000) : undefined;
    if (ignoredUntil && ignoredUntil <= new Date()) throw new BadRequestException("Ignore duration must end in the future");
    const update: Record<string, unknown> = { status: next, decisionReason: reason, ...(ignoredUntil ? { ignoredUntil } : {}) };
    const updated = await this.recommendationRecords.findOneAndUpdate({ _id: recommendation._id, organizationId: recommendation.organizationId, status: recommendation.status }, { $set: update, $push: { transitions: { from: recommendation.status, to: next, actorUserId: actor.sub, actor: actor.name, at: new Date(), reason } } }, { returnDocument: "after" }).lean();
    if (!updated) throw new ConflictException("Recommendation changed while the decision was being processed");
    await this.audits.create({ organizationId: new Types.ObjectId(actor.organizationId), actorUserId: new Types.ObjectId(actor.sub), actor: actor.name, action: `recommendation_${decision}`, entityType: "recommendation", entityId: id, before: { status: recommendation.status }, after: { status: next, reason, ignoredUntil }, source: "Kivora", verified: true });
    if (decision === "cancel" && this.actions) await this.actions.updateMany({ organizationId: new Types.ObjectId(actor.organizationId), recommendationId: recommendation._id, status: "SCHEDULED" }, { $set: { status: "CANCELLED", completedAt: new Date(), errorDetails: { reason: reason || "Cancelled by user" } } });
    if(decision==="cancel")await this.notify(actor,"scheduled_action_cancelled",`recommendation:${id}:cancelled`,"Scheduled action cancelled",reason||"Cancelled by user","info",{recommendationId:id});
    return updated;
  }

  async scheduleRecommendation(id: string, executeAt: string, actor: AuthenticatedUser, reason?: string, simulationId?: string) {
    if (!this.recommendationRecords || !this.actions) throw new ServiceUnavailableException("Action scheduling is unavailable");
    if (!["owner", "administrator", "revenue_manager"].includes(actor.organizationRole)) throw new ForbiddenException("Revenue manager permission is required");
    const executeDate = new Date(executeAt);
    if (!Number.isFinite(executeDate.getTime()) || executeDate <= new Date()) throw new BadRequestException("Scheduled execution must be in the future");
    const recommendation = await this.recommendationRecords.findOne({ _id: this.objectId(id), organizationId: new Types.ObjectId(actor.organizationId), status: "APPROVED", expiresAt: { $gt: executeDate } }).lean();
    if (!recommendation) throw new ConflictException("Only a current approved recommendation can be scheduled before it expires");
    let simulation: any;
    if (recommendation.proposedAction === "apply_pricing_preset") {
      if (!simulationId || !this.simulations) throw new BadRequestException("A current strategy simulation is required for a scheduled preset");
      simulation = await this.simulations.findOne({ _id: this.objectId(simulationId), organizationId: recommendation.organizationId, recommendationId: recommendation._id, expiresAt: { $gt: executeDate } }).lean();
      if (!simulation) throw new ConflictException("The selected simulation expires before scheduled execution; refresh and choose a later-valid preview");
      const sourceOpportunity:any=recommendation.opportunityId&&this.opportunityRecords?await this.opportunityRecords.findOne({_id:recommendation.opportunityId,organizationId:recommendation.organizationId}).lean():null;const intendedStrategy=recommendedPricingStrategy(recommendation,sourceOpportunity);if(intendedStrategy&&simulation.selectedStrategy!==intendedStrategy)throw new ConflictException(`The approved recommendation requires the ${intendedStrategy} preset; choose its matching preview`);
    }
    let scope = await this.scope(actor);const scheduleListings=recommendation.listingIds?.length?recommendation.listingIds:recommendation.listingId?[recommendation.listingId]:[];const scheduleMapping:any=scheduleListings.length&&this.connection?.db?await this.connection.db.collection("listingmappings").findOne({organizationId:new Types.ObjectId(actor.organizationId),externalListingId:scheduleListings[0],active:true}):null;if(scheduleMapping&&String(scheduleMapping.connectionId)!==scope.connectionId){const selected=await this.connectionService!.credential(actor,String(scheduleMapping.connectionId));scope={credential:selected.credential,connectionId:String(scheduleMapping.connectionId),portfolioId:String(scheduleMapping.portfolioId)};}
    const idempotencyKey = createHash("sha256").update(`${actor.organizationId}:${id}:${executeDate.toISOString()}`).digest("hex");
    const action = await this.actions.findOneAndUpdate({ organizationId: new Types.ObjectId(actor.organizationId), idempotencyKey }, { $setOnInsert: { organizationId: new Types.ObjectId(actor.organizationId), ...(scope.portfolioId ? { portfolioId: new Types.ObjectId(scope.portfolioId) } : {}), connectionId: new Types.ObjectId(scope.connectionId!), recommendationId: recommendation._id, ...(simulation ? { simulationId: simulation._id } : {}), requestedBy: new Types.ObjectId(actor.sub), approvedBy: new Types.ObjectId(actor.sub), actionType: recommendation.proposedAction, targetListings: recommendation.listingIds?.length ? recommendation.listingIds : recommendation.listingId ? [recommendation.listingId] : [], targetDates: recommendation.affectedDates, requestedPayload: { proposedAction: recommendation.proposedAction, ...(simulation ? { strategy: simulation.selectedStrategy } : {}) }, baselineState: recommendation.evidence, idempotencyKey, status: "SCHEDULED", scheduledAt: executeDate } }, { upsert: true, returnDocument: "after" }).lean();
    await this.recommendationRecords.updateOne({ _id: recommendation._id, status: "APPROVED" }, { $set: { status: "SCHEDULED", decisionReason: reason }, $push: { transitions: { from: "APPROVED", to: "SCHEDULED", actorUserId: actor.sub, actor: actor.name, at: new Date(), reason } } });
    return this.serializeAction(action);
  }

  async listActions(actor: AuthenticatedUser) { return this.actions ? this.actions.find({ organizationId: new Types.ObjectId(actor.organizationId) }).sort({ createdAt: -1 }).limit(200).lean() : []; }
  async listOutcomes(actor: AuthenticatedUser) { return this.outcomes ? this.outcomes.find({ organizationId: new Types.ObjectId(actor.organizationId) }).sort({ createdAt: -1 }).limit(200).lean() : []; }

  async revertAction(id: string, actor: AuthenticatedUser) {
    if (!this.actions || !this.connectionService || !this.connection.db) throw new ServiceUnavailableException("Action reversion is unavailable");
    if (!["owner", "administrator", "revenue_manager"].includes(actor.organizationRole)) throw new ForbiddenException("Revenue manager permission is required");
    const organizationId = new Types.ObjectId(actor.organizationId);
    const original: any = await this.actions.findOne({ _id: this.objectId(id), organizationId, status: "VERIFIED", "revertInformation.supported": true }).lean();
    if (!original?.revertInformation?.previousState || original.targetListings?.length !== 1) throw new ConflictException("This action has no supported deterministic revert");
    const idempotencyKey = createHash("sha256").update(`${actor.organizationId}:revert:${id}`).digest("hex");
    const revert: any = await this.actions.findOneAndUpdate({ organizationId, idempotencyKey }, { $setOnInsert: { organizationId, portfolioId: original.portfolioId, connectionId: original.connectionId, recommendationId: original.recommendationId, requestedBy: new Types.ObjectId(actor.sub), approvedBy: new Types.ObjectId(actor.sub), actionType: "revert_preferences", targetListings: original.targetListings, targetDates: original.targetDates || [], requestedPayload: original.revertInformation.previousState, baselineState: original.verificationResult?.actual || {}, idempotencyKey, status: "EXECUTING", attemptCount: 1, parentActionId: original._id } }, { upsert: true, returnDocument: "after" }).lean();
    if (revert.status !== "EXECUTING") return this.serializeAction(revert);
    const { credential } = await this.connectionService.credential(actor, String(original.connectionId)); const listingId = original.targetListings[0];
    const mapping = await this.connection.db.collection("listingmappings").findOne({ organizationId, connectionId: original.connectionId, externalListingId: listingId, active: true });
    if (!mapping?.channel) throw new ConflictException("The listing mapping required for reversion is no longer active");
    const expected = original.revertInformation.previousState as Record<string, unknown>;
    try {
      const upstream = await this.wheelhouse.updatePreferences(listingId, mapping.channel, expected, credential); await this.markConnectionWriteVerified(actor,String(original.connectionId)); const syncResult=await this.requestWheelhouseSync(listingId,mapping.channel,credential);
      const actual = await this.wheelhouse.preferences(listingId, mapping.channel, credential); const keys = ["base_price", "automatic_rate_posting_enabled", "base_price_adjustment"].filter((key) => key in expected);
      const matched = keys.length > 0 && keys.every((key) => JSON.stringify((actual as any)[key]) === JSON.stringify((expected as any)[key])); const status = matched ? "VERIFIED" : "FAILED";
      await this.actions.updateOne({ _id: revert._id, organizationId }, { $set: { status, upstreamResponse: this.safeUpstream(upstream), verificationResult: { matched, keys, expected, actual, sync:syncResult }, executedAt: new Date(), completedAt: new Date(), ...(matched ? { verifiedAt: new Date() } : {}) } });
      if (matched) await this.actions.updateOne({ _id: original._id, organizationId }, { $set: { status: "REVERTED" } });
      await this.audits.create({ organizationId, actorUserId: new Types.ObjectId(actor.sub), actor: actor.name, action: "revert_revenue_action", entityType: "revenue_action", entityId: String(revert._id), before: revert.baselineState, after: actual, source: "Wheelhouse RM API", verified: matched });
      return { ...this.serializeAction(revert), status, verificationResult: { matched, keys, expected, actual } };
    } catch (error) { await this.actions.updateOne({ _id: revert._id, organizationId }, { $set: { status: "ROLLBACK_FAILED", completedAt: new Date(), errorDetails: { message: this.errorMessage(error) } } }); throw error; }
  }

  async workItem(kind: string, id: string, actor: AuthenticatedUser) {
    const organizationId = new Types.ObjectId(actor.organizationId); let entity: any; let recommendation: any;
    if (kind === "incident") {
      entity = await this.incidents.findOne({ organizationId, $or: [{ externalId: id }, ...(Types.ObjectId.isValid(id) ? [{ _id: new Types.ObjectId(id) }] : [])] }).lean();
      if (!entity) throw new NotFoundException("Incident not found");
      recommendation = this.recommendationRecords ? await this.recommendationRecords.findOne({ organizationId, incidentId: entity._id }).sort({ createdAt: -1 }).lean() : null;
    } else if (kind === "opportunity") {
      if (!this.opportunityRecords || !Types.ObjectId.isValid(id)) throw new NotFoundException("Opportunity not found");
      entity = await this.opportunityRecords.findOne({ _id: new Types.ObjectId(id), organizationId }).lean(); if (!entity) throw new NotFoundException("Opportunity not found");
      recommendation = this.recommendationRecords ? await this.recommendationRecords.findOne({ organizationId, opportunityId: entity._id }).sort({ createdAt: -1 }).lean() : null;
    } else throw new BadRequestException("Work item kind must be incident or opportunity");
    const simulations = recommendation && this.simulations ? await this.simulations.find({ organizationId, recommendationId: recommendation._id }).sort({ createdAt: -1 }).lean() : [];
    const actions = recommendation && this.actions ? await this.actions.find({ organizationId, recommendationId: recommendation._id }).sort({ createdAt: -1 }).lean() : [];
    const outcomes = this.outcomes && actions.length ? await this.outcomes.find({ organizationId, actionId: { $in: actions.map((action: any) => action._id) } }).sort({ createdAt: -1 }).lean() : [];
    const entityIds = [String(entity._id), recommendation ? String(recommendation._id) : "", ...actions.map((action: any) => String(action._id))].filter(Boolean);
    const [activity, comments, signals] = await Promise.all([
      this.audits.find({ organizationId, $or: [{ entityId: { $in: entityIds } }, ...(kind === "incident" ? [{ incidentId: entity.externalId }] : [])] }).sort({ createdAt: -1 }).limit(100).lean(),
      this.collaboration ? this.collaboration.find({ organizationId, entityType: kind, entityId: String(entity._id) }).sort({ createdAt: 1 }).lean() : [],
      this.signalRecords ? this.signalRecords.find({ organizationId, listingIds: { $in: entity.listingIds?.length ? entity.listingIds : [entity.listingId] }, validUntil: { $gt: new Date() } }).sort({ detectedAt: -1 }).limit(20).lean() : [],
    ]);
    const evidence = entity.evidence || {};
    entity.explanation = entity.explanation || entity.rootCause || evidence.explanation || entity.detectionSource || entity.cause || entity.title || "Kivora detected a material change that needs review.";
    entity.affectedDates = entity.affectedDates?.length ? entity.affectedDates : evidence.affectedDates || [];
    entity.impactCalculation = entity.impactCalculation || evidence.impactCalculation;
    const scope=await this.scope(actor).catch(()=>({credential:undefined,connectionId:undefined,portfolioId:undefined}));const intendedStrategy=recommendedPricingStrategy(recommendation,entity);const selectedSimulation:any=simulations.find((item:any)=>item.selectedStrategy===intendedStrategy)||simulations[0];const canApprove=["owner","administrator","revenue_manager"].includes(actor.organizationRole)&&recommendation&&new Date(recommendation.expiresAt)>new Date();const wheelhouseCapability=this.scopedWheelhouseCapabilities(scope);return { kind, entity: this.serializeDocument(entity), recommendation: recommendation ? this.serializeDocument(recommendation) : null, simulations: simulations.map((item: any) => this.serializeDocument(item)), selectedSimulation:selectedSimulation?this.serializeDocument(selectedSimulation):null,intendedStrategy, actions: actions.map((item: any) => this.serializeDocument(item)), outcomes: outcomes.map((item: any) => this.serializeDocument(item)), activity, comments, signals,capabilities:{canApprove:Boolean(canApprove),canExecute:Boolean(canApprove&&recommendation.status==="APPROVED"&&selectedSimulation&&new Date(selectedSimulation.expiresAt)>new Date()&&recommendation.proposedAction!=="manual_review"&&wheelhouseCapability.writeActions),simulationFresh:Boolean(selectedSimulation&&new Date(selectedSimulation.expiresAt)>new Date()),recommendationFresh:Boolean(recommendation&&new Date(recommendation.expiresAt)>new Date()),writeAccess:wheelhouseCapability.writeAccess} };
  }

  async assignWorkItem(kind: string, id: string, userId: string | undefined, actor: AuthenticatedUser) {
    this.requireAnalyst(actor);
    if (!this.connection.db) throw new ServiceUnavailableException("Database unavailable"); const organizationId = new Types.ObjectId(actor.organizationId);
    if (userId) { if (!Types.ObjectId.isValid(userId) || !await this.connection.db.collection("memberships").findOne({ organizationId, userId: new Types.ObjectId(userId), status: "active" })) throw new BadRequestException("Assignee must be an active organization member"); }
    const model: any = kind === "incident" ? this.incidents : kind === "opportunity" ? this.opportunityRecords : null; if (!model) throw new BadRequestException("Unsupported work item kind");
    const filter = kind === "incident" ? { organizationId, $or: [{ externalId: id }, ...(Types.ObjectId.isValid(id) ? [{ _id: new Types.ObjectId(id) }] : [])] } : { organizationId, _id: this.objectId(id) };
    const updated = await model.findOneAndUpdate(filter, userId ? { $set: { assignedTo: new Types.ObjectId(userId) } } : { $unset: { assignedTo: 1 } }, { returnDocument: "after" }).lean(); if (!updated) throw new NotFoundException("Work item not found");
    if (this.recommendationRecords) await this.recommendationRecords.updateMany({ organizationId, ...(kind === "incident" ? { incidentId: updated._id } : { opportunityId: updated._id }) }, userId ? { $set: { assignedTo: new Types.ObjectId(userId) } } : { $unset: { assignedTo: 1 } });
    await this.audits.create({ organizationId, actorUserId: new Types.ObjectId(actor.sub), actor: actor.name, action: "work_item_assigned", entityType: kind, entityId: String(updated._id), after: { assignedTo: userId || null }, source: "Kivora", verified: true }); return this.serializeDocument(updated);
  }

  async commentOnWorkItem(kind: string, id: string, body: string, actor: AuthenticatedUser) {
    this.requireAnalyst(actor);
    if (!this.collaboration) throw new ServiceUnavailableException("Comments unavailable"); const item = await this.workItem(kind, id, actor);
    const comment = await this.collaboration.create({ organizationId: new Types.ObjectId(actor.organizationId), entityType: kind, entityId: String(item.entity._id || item.entity.id), userId: new Types.ObjectId(actor.sub), body: body.trim() });
    await this.audits.create({ organizationId: new Types.ObjectId(actor.organizationId), actorUserId: new Types.ObjectId(actor.sub), actor: actor.name, action: "comment_added", entityType: kind, entityId: String(item.entity._id || item.entity.id), after: { commentId: String(comment._id) }, source: "Kivora", verified: true }); return this.serializeDocument(comment.toObject());
  }

  async simulateRecommendation(id: string, actor: AuthenticatedUser) {
    this.requireAnalyst(actor);
    if (!this.recommendationRecords) throw new ServiceUnavailableException("Recommendations unavailable"); const recommendation = await this.recommendationRecords.findOne({ _id: this.objectId(id), organizationId: new Types.ObjectId(actor.organizationId), status: { $nin: ["DISMISSED", "EXPIRED", "CANCELLED", "COMPLETED"] }, expiresAt: { $gt: new Date() } }).lean();
    if (!recommendation) throw new ConflictException("Recommendation is unavailable or expired"); const listingId = recommendation.listingId || recommendation.listingIds?.[0]; if (!listingId) throw new BadRequestException("Recommendation has no listing target");
    return this.strategies(listingId, actor, id);
  }

  async executeRecommendation(id: string, simulationId: string, actor: AuthenticatedUser) {
    if (!this.recommendationRecords || !this.simulations || !this.actions) throw new ServiceUnavailableException("Recommendation execution unavailable");
    if (!["owner", "administrator", "revenue_manager"].includes(actor.organizationRole)) throw new ForbiddenException("Revenue manager permission is required"); const organizationId = new Types.ObjectId(actor.organizationId);
    const recommendation = await this.recommendationRecords.findOne({ _id: this.objectId(id), organizationId, status: "APPROVED", expiresAt: { $gt: new Date() } }).lean(); if (!recommendation) throw new ConflictException("Recommendation must be approved before execution");
    const simulation = await this.simulations.findOne({ _id: this.objectId(simulationId), organizationId, recommendationId: recommendation._id, expiresAt: { $gt: new Date() } }).lean(); if (!simulation) throw new ConflictException("Simulation is expired or does not belong to this recommendation; refresh previews");
    const sourceOpportunity:any=recommendation.opportunityId&&this.opportunityRecords?await this.opportunityRecords.findOne({_id:recommendation.opportunityId,organizationId}).lean():null;const intendedStrategy=recommendedPricingStrategy(recommendation,sourceOpportunity);if(intendedStrategy&&simulation.selectedStrategy!==intendedStrategy)throw new ConflictException(`The approved recommendation requires the ${intendedStrategy} preset; refresh and use its matching preview`);
    if (recommendation.proposedAction === "restore_dynamic_pricing" && recommendation.incidentId) { const incident = await this.incidents.findOne({ _id: recommendation.incidentId, organizationId }).lean(); if (!incident) throw new NotFoundException("Related incident not found"); return this.resolve(incident.externalId, actor); }
    if (recommendation.proposedAction !== "apply_pricing_preset") throw new ConflictException("This recommendation has no supported automatic Wheelhouse action");
    let scope = await this.scope(actor); const listings = recommendation.listingIds?.length ? recommendation.listingIds : recommendation.listingId ? [recommendation.listingId] : []; if (!listings.length) throw new BadRequestException("Recommendation has no listing targets");const targetMapping:any=await this.connection.db!.collection("listingmappings").findOne({organizationId,externalListingId:listings[0],active:true});if(!targetMapping)throw new ConflictException("Active organization listing mapping not found");if(String(targetMapping.connectionId)!==scope.connectionId){const selected=await this.connectionService!.credential(actor,String(targetMapping.connectionId));scope={credential:selected.credential,connectionId:String(targetMapping.connectionId),portfolioId:String(targetMapping.portfolioId)};}
    const parentKey = createHash("sha256").update(`${actor.organizationId}:${id}:${simulationId}:group`).digest("hex");
    const parent: any = await this.actions.findOneAndUpdate({ organizationId, idempotencyKey: parentKey }, { $setOnInsert: { organizationId, ...(scope.portfolioId ? { portfolioId: new Types.ObjectId(scope.portfolioId) } : {}), connectionId: new Types.ObjectId(scope.connectionId!), recommendationId: recommendation._id, simulationId: simulation._id, requestedBy: new Types.ObjectId(actor.sub), approvedBy: new Types.ObjectId(actor.sub), actionType: "grouped_pricing_preset", targetListings: listings, requestedPayload: { strategy: simulation.selectedStrategy }, baselineState: recommendation.evidence, idempotencyKey: parentKey, status: "EXECUTING", attemptCount: 1 } }, { upsert: true, returnDocument: "after" }).lean();
    if (parent.status !== "EXECUTING") return this.serializeAction(parent);
    await this.recommendationRecords.updateOne({ _id: recommendation._id, organizationId }, { $set: { status: "EXECUTING" }, $push: { transitions: { from: recommendation.status, to: "EXECUTING", actorUserId: actor.sub, actor: actor.name, at: new Date() } } });
    const children = [];
    for (const listingId of listings) { try { children.push(await this.applyStrategy(listingId, simulation.selectedStrategy as any, actor, { recommendationId: recommendation._id, simulationId: simulation._id, parentActionId: parent._id, connectionId: new Types.ObjectId(scope.connectionId!) })); } catch (error) { children.push({ listingId, status: "FAILED", error: this.errorMessage(error) }); } }
    const grouped=scheduledGroupResult(children,children.length);const {verified,applied,failed}=grouped;const status=grouped.status;
    await this.actions.updateOne({ _id: parent._id, organizationId }, { $set: { status, verificationResult: { matched:status==="VERIFIED",total: children.length, verified, applied, failed, children }, completedAt: new Date(), ...(status === "VERIFIED" ? { verifiedAt: new Date() } : {}) } });
    await this.recommendationRecords.updateOne({ _id: recommendation._id, organizationId }, { $set: { status }, $push: { transitions: { from: "EXECUTING", to: status, actor: "system", at: new Date(), actionId: String(parent._id) } } });
    if (status === "VERIFIED") await this.createOutcome(actor, parent._id, recommendation.evidence, recommendation.estimatedImpact, recommendation.currency, false);
    const parentOutcome = this.outcomes ? await this.outcomes.findOne({ organizationId, actionId: parent._id }).lean() : null;
    if (recommendation.opportunityId && this.opportunityRecords) await this.opportunityRecords.updateOne({ _id: recommendation.opportunityId, organizationId }, { $set: { status: status === "VERIFIED" ? "approved" : "under_review", simulationId: simulation._id, actionId: parent._id, ...(parentOutcome ? { outcomeId: parentOutcome._id } : {}) } });
    await this.notify(actor, "action_result", `action:${parent._id}:${status}`, status === "VERIFIED" ? "Revenue action verified" : status === "APPLIED" ? "Revenue action applied; verification unavailable" : "Revenue action needs attention", `${verified} verified, ${applied} applied without read-back verification, and ${failed} failed of ${children.length}.`, status === "VERIFIED" ? "success" : "warning", { actionId: String(parent._id), recommendationId: id });
    return { ...this.serializeAction(parent), status, children };
  }

  async listNotifications(actor: AuthenticatedUser) { return this.notifications ? this.notifications.find({ organizationId: new Types.ObjectId(actor.organizationId), channel: "in_app",$or:[{userId:new Types.ObjectId(actor.sub)},{userId:{$exists:false}}] }).sort({ createdAt: -1 }).limit(100).lean() : []; }
  async readNotification(id: string, actor: AuthenticatedUser) { if (!this.notifications) throw new ServiceUnavailableException("Notifications unavailable"); const updated = await this.notifications.findOneAndUpdate({ _id: this.objectId(id), organizationId: new Types.ObjectId(actor.organizationId), channel: "in_app",$or:[{userId:new Types.ObjectId(actor.sub)},{userId:{$exists:false}}] }, { $set: { readAt: new Date() } }, { returnDocument: "after" }).lean(); if (!updated) throw new NotFoundException("Notification not found"); return updated; }

  async operationalSummary(actor: AuthenticatedUser) {
    const organizationId = new Types.ObjectId(actor.organizationId); const start = new Date(); start.setHours(0, 0, 0, 0);
    const [outcomes, actions, reports, resolved, productivity, approved] = await Promise.all([this.outcomes?.find({ organizationId, createdAt: { $gte: start } }).lean() || [], this.actions?.find({ organizationId, verifiedAt: { $gte: start } }).lean() || [], this.reports.find({ organizationId, createdAt: { $gte: start } }).lean(), this.incidents.countDocuments({ organizationId, resolvedAt: { $gte: start } }), this.calculateProductivity(actor), this.recommendationRecords?.aggregate([{ $match: { organizationId, status: { $in: ["APPROVED", "SCHEDULED", "EXECUTING", "VERIFIED", "MEASURING", "COMPLETED"] }, updatedAt: { $gte: start } } }, { $group: { _id: null, amount: { $sum: "$estimatedImpact" } } }]) || []]);
    return { asOf: new Date(), revenueProtected: outcomes.reduce((sum: number, item: any) => sum + Number(item.revenueProtected || 0), 0), projectedOpportunitiesApproved: (approved as any[])[0]?.amount || 0, realizedRevenue: outcomes.reduce((sum: number, item: any) => sum + Number(item.realizedRevenue || 0), 0), incidentsResolved: resolved, actionsVerified: actions.filter((action: any) => action.status === "VERIFIED").length, ownerReportsGenerated: reports.filter((report: any) => report.type === "owner").length, timeSavedMinutes: productivity.minutesSaved, calculations: { productivity: productivity.calculation, realizedRevenue: "Only populated by completed measurable outcome evaluation; zero is a valid measured absence." } };
  }

  async executeScheduledActions() {
    if (!this.actions || !this.recommendationRecords || !this.connectionService) return { due: 0, executed: 0 };
    const due = await this.actions.find({ status: "SCHEDULED", scheduledAt: { $lte: new Date() } }).sort({ scheduledAt: 1 }).limit(50).lean();
    let executed = 0;
    for (const action of due) {
      const owner = randomUUID(); const key = `action:${String(action._id)}`;
      if (!(await this.acquireLock(key, owner, 5 * 60_000))) continue;
      try {
        const claimed = await this.actions.findOneAndUpdate({ _id: action._id, status: "SCHEDULED" }, { $set: { status: "EXECUTING", executedAt: new Date() }, $inc: { attemptCount: 1 } }, { returnDocument: "after" }).lean();
        if (!claimed) continue;
        const recommendation = action.recommendationId ? await this.recommendationRecords.findOne({ _id: action.recommendationId, organizationId: action.organizationId, status: "SCHEDULED", expiresAt: { $gt: new Date() } }).lean() : null;
        if (!recommendation) { await this.actions.updateOne({ _id: action._id }, { $set: { status: "CANCELLED", completedAt: new Date(), errorDetails: { reason: "Recommendation expired or changed before execution" } } }); continue; }
        const actor = { sub: String(action.requestedBy), privyUserId: "system", name: "Kivora scheduler", role: "admin", organizationId: String(action.organizationId), organizationRole: "administrator" } as AuthenticatedUser;
        const { credential } = await this.connectionService.credential(actor, String(action.connectionId)); this.wheelhouse.assertWriteAccess(credential);
        if (action.actionType === "apply_pricing_preset") {
          const simulation: any = action.simulationId && this.simulations ? await this.simulations.findOne({ _id: action.simulationId, organizationId: action.organizationId, recommendationId: recommendation._id, expiresAt: { $gt: new Date() } }).lean() : null;
          if (!simulation) { await this.cancelScheduledExecution(action, recommendation, "Selected simulation expired before execution", actor); continue; }
          const targets = action.targetListings || []; const childResults:any[]=[];
          for(const listingId of targets){
            const mapping=await this.connection.db!.collection("listingmappings").findOne({organizationId:action.organizationId,connectionId:action.connectionId,externalListingId:listingId,active:true});
            if(!mapping?.channel){childResults.push({listingId,status:"FAILED",error:"Active listing mapping not found"});continue;}
            const current=await this.wheelhouse.preferences(listingId,mapping.channel,credential); const expectedBase=Number((simulation.baselineState as any)?.preferences?.base_price ?? (recommendation.evidence as any)?.currentRate);
            if(Number.isFinite(expectedBase)&&Math.abs(Number(current.base_price||0)-expectedBase)>1){childResults.push({listingId,status:"CANCELLED",error:"Portfolio state materially changed",expectedBasePrice:expectedBase,actualBasePrice:current.base_price});continue;}
            try{childResults.push(await this.applyStrategy(listingId,simulation.selectedStrategy,actor,{recommendationId:recommendation._id,simulationId:simulation._id,parentActionId:action._id,connectionId:action.connectionId}));}catch(error){childResults.push({listingId,status:"FAILED",error:this.errorMessage(error)});}
          }
          const grouped=scheduledGroupResult(childResults,targets.length);const verifiedCount=grouped.verified;const finalStatus=grouped.status;
          await this.actions.updateOne({_id:action._id,organizationId:action.organizationId},{$set:{status:finalStatus,verificationResult:{matched:finalStatus==="VERIFIED",total:targets.length,verified:verifiedCount,applied:grouped.applied,failed:grouped.failed,cancelled:grouped.cancelled,children:childResults},completedAt:new Date(),...(finalStatus==="VERIFIED"?{verifiedAt:new Date()}:{})}});
          await this.recommendationRecords.updateOne({_id:recommendation._id,organizationId:action.organizationId},{$set:{status:finalStatus,decisionReason:finalStatus==="CANCELLED"?"Portfolio state changed before execution":undefined},$push:{transitions:{from:"SCHEDULED",to:finalStatus,actor:"system",at:new Date(),actionId:String(action._id)}}});
          if(finalStatus==="VERIFIED") await this.createOutcome(actor,action._id,recommendation.evidence,recommendation.estimatedImpact,recommendation.currency,false);
          await this.notify(actor,"scheduled_action_result",`scheduled:${action._id}:${finalStatus}`,finalStatus==="VERIFIED"?"Scheduled preset verified":finalStatus==="APPLIED"?"Scheduled preset applied; verification unavailable":"Scheduled preset needs attention",`${verifiedCount} verified, ${grouped.applied} applied without read-back verification, and ${grouped.failed} failed of ${targets.length}.`,finalStatus==="VERIFIED"?"success":"warning",{actionId:String(action._id),children:childResults});
          await this.telegram.notifyActionResult(actor.organizationId,String(action._id),finalStatus,verifiedCount,targets.length).catch(()=>undefined); if(verifiedCount>0)executed++;
          continue;
        }
        const listingId = action.targetListings[0]; const mapping = await this.connection.db!.collection("listingmappings").findOne({ organizationId: action.organizationId, connectionId: action.connectionId, externalListingId: listingId, active: true });
        if (!mapping?.channel) { await this.actions.updateOne({ _id: action._id }, { $set: { status: "FAILED", completedAt: new Date(), errorDetails: { reason: "Active organization-scoped listing mapping not found" } } }); continue; }
        const current = await this.wheelhouse.preferences(listingId, mapping.channel, credential); const evidenceRate = Number((recommendation.evidence as any)?.currentRate);
        if (Number.isFinite(evidenceRate) && Math.abs(Number(current.base_price || 0) - evidenceRate) > 1) { await this.cancelScheduledExecution(action,recommendation,"Evidence became stale before scheduled execution",actor); continue; }
        if (action.actionType !== "restore_dynamic_pricing") { await this.actions.updateOne({ _id: action._id }, { $set: { status: "FAILED", completedAt: new Date(), errorDetails: { reason: "Scheduled action type is not supported by the live Wheelhouse adapter" } } }); continue; }
        const proposed = { ...current, base_price: null, automatic_rate_posting_enabled: true }; const upstream=await this.wheelhouse.updatePreferences(listingId, mapping.channel, proposed, credential); await this.wheelhouse.enableAutomaticPosting(listingId, mapping.channel, credential); await this.markConnectionWriteVerified(actor,String(action.connectionId)); const syncResult=await this.requestWheelhouseSync(listingId,mapping.channel,credential); const verified = await this.wheelhouse.preferences(listingId, mapping.channel, credential); const matched=verified.base_price===null||verified.base_price===undefined;
        await this.actions.updateOne({ _id: action._id }, { $set: { status:matched?"VERIFIED":"FAILED",upstreamResponse:this.safeUpstream(upstream),verifiedAt:matched?new Date():undefined,completedAt:new Date(),verificationResult:{matched,expected:{base_price:null,automatic_rate_posting_enabled:true},actual:verified,sync:syncResult}}});
        await this.recommendationRecords.updateOne({_id:recommendation._id},{$set:{status:matched?"VERIFIED":"FAILED"},$push:{transitions:{from:"SCHEDULED",to:matched?"VERIFIED":"FAILED",actor:"system",at:new Date()}}}); if(matched){await this.createOutcome(actor,action._id,current,recommendation.estimatedImpact,recommendation.currency);executed++;} await this.notify(actor,"scheduled_action_result",`scheduled:${action._id}:${matched}`,matched?"Scheduled action verified":"Scheduled action verification failed",matched?"Wheelhouse state matched the approved change.":"Wheelhouse state did not match the approved change.",matched?"success":"error",{actionId:String(action._id)}); await this.telegram.notifyActionResult(actor.organizationId,String(action._id),matched?"VERIFIED":"FAILED",matched?1:0,1).catch(()=>undefined);
      } catch (error) { const reason=this.errorMessage(error);await this.actions.updateOne({ _id: action._id }, { $set: { status: "FAILED", completedAt: new Date(), errorDetails: { message: reason, classification:"execution_error" } } });if(action.recommendationId)await this.recommendationRecords.updateOne({_id:action.recommendationId,organizationId:action.organizationId,status:{$in:["SCHEDULED","EXECUTING"]}},{$set:{status:"FAILED",decisionReason:reason},$push:{transitions:{from:"SCHEDULED",to:"FAILED",actor:"system",at:new Date(),reason,actionId:String(action._id)}}}); }
      finally { await this.releaseLock(key, owner); }
    }
    this.metrics?.increment("scheduled_actions_executed_total", {}, executed); return { due: due.length, executed };
  }
  async notifyApproachingSchedules(){if(!this.actions)return{due:0};const now=new Date(),until=new Date(Date.now()+30*60_000);const due:any[]=await this.actions.find({status:"SCHEDULED",scheduledAt:{$gt:now,$lte:until}}).lean();for(const action of due)await this.telegram.notifyScheduled(String(action.organizationId),String(action.recommendationId),String(action._id),action.scheduledAt).catch(()=>undefined);return{due:due.length};}

  private async cancelScheduledExecution(action:any,recommendation:any,reason:string,actor:AuthenticatedUser){await this.actions!.updateOne({_id:action._id,organizationId:action.organizationId},{$set:{status:"CANCELLED",completedAt:new Date(),errorDetails:{reason}}});await this.recommendationRecords!.updateOne({_id:recommendation._id,organizationId:action.organizationId},{$set:{status:"CANCELLED",decisionReason:reason},$push:{transitions:{from:"SCHEDULED",to:"CANCELLED",actor:"system",at:new Date(),reason}}});await this.notify(actor,"scheduled_action_cancelled",`scheduled:${action._id}:cancelled`,`Scheduled action cancelled`,reason,"warning",{actionId:String(action._id)});}

  async exportReport(id: string, format: "pdf" | "csv", actor: AuthenticatedUser) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException("Report identifier is invalid");
    const report: any = await this.reports.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(actor.organizationId) }).lean();
    if (!report) throw new NotFoundException("Report not found");
    report.body = this.reportBody(report.body, report.type || "executive", report.metrics || {});
    const safeName = String(report.title || "kivora-report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
    const buffer = format === "pdf" ? this.createPdf(report) : this.createCsv(report);
    await this.audits.create({ organizationId: new Types.ObjectId(actor.organizationId), actorUserId: new Types.ObjectId(actor.sub), actor: actor.name, action: "report_downloaded", entityType: "report", entityId: id, after: { format, bytes: buffer.length }, source: "Kivora", verified: true });
    return { buffer, filename: `${safeName || "kivora-report"}.${format}`, contentType: format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8" };
  }

  async editReport(id: string, body: string, actor: AuthenticatedUser) {
    if(!["owner","administrator","revenue_manager","analyst"].includes(actor.organizationRole))throw new ForbiddenException("Report editor permission is required");
    const report: any = await this.reports.findOne({ _id: this.objectId(id), organizationId: new Types.ObjectId(actor.organizationId), status: "draft" }).lean();
    if (!report) throw new ConflictException("Only an organization-scoped draft report can be edited");
    const updated = await this.reports.findOneAndUpdate({ _id: report._id, organizationId: report.organizationId, status: "draft", version: report.version }, { $set: { body }, $inc: { version: 1 }, $push: { versions: { version: report.version, body: report.body, savedAt: new Date(), savedBy: actor.sub } } }, { returnDocument: "after" }).lean();
    if (!updated) throw new ConflictException("Report changed while it was being edited");
    await this.audits.create({ organizationId: report.organizationId, actorUserId: new Types.ObjectId(actor.sub), actor: actor.name, action: "report_edited", entityType: "report", entityId: id, before: { version: report.version }, after: { version: updated.version }, source: "Kivora", verified: true }); return updated;
  }

  async finalizeReport(id: string, actor: AuthenticatedUser) {
    if (!["owner", "administrator", "revenue_manager"].includes(actor.organizationRole)) throw new ForbiddenException("Revenue manager permission is required");
    const updated = await this.reports.findOneAndUpdate({ _id: this.objectId(id), organizationId: new Types.ObjectId(actor.organizationId), status: "draft" }, { $set: { status: "ready", finalizedAt: new Date() } }, { returnDocument: "after" }).lean();
    if (!updated) throw new ConflictException("Only a draft report can be finalized");
    await this.audits.create({ organizationId: new Types.ObjectId(actor.organizationId), actorUserId: new Types.ObjectId(actor.sub), actor: actor.name, action: "report_finalized", entityType: "report", entityId: id, after: { version: updated.version, status: "ready" }, source: "Kivora", verified: true });await this.notify(actor,"report_ready",`report:${id}:ready:${updated.version}`,"Report ready",`${updated.title} version ${updated.version} is finalized and ready to download.`,"info",{reportId:id});if(!this.organizationSettings||await this.organizationSettings.permits(actor.organizationId,actor.sub,"report_ready","telegram"))await this.telegram.sendToUser(actor.sub,`📄 Report ready\n\n${updated.title}\nVersion ${updated.version}\nOpen Kivora to review, download, or deliver it.`,actor.organizationId).catch(()=>undefined); return updated;
  }

  async deliverReport(id: string, actor: AuthenticatedUser) {
    if(!["owner","administrator","revenue_manager"].includes(actor.organizationRole))throw new ForbiddenException("Revenue manager permission is required");
    const report: any = await this.reports.findOne({ _id: this.objectId(id), organizationId: new Types.ObjectId(actor.organizationId), status: { $in: ["ready", "shared"] } }).lean();
    if (!report) throw new ConflictException("Only a finalized organization-scoped report can be delivered");
    const attemptedAt = new Date();
    try {
      await this.telegram.sendToUser(actor.sub, `📄 ${report.title}\n\n${String(report.body).slice(0, 3500)}\n\nVersion ${report.version} · ${report.currency || "organization currency"} · ${report.timezone || "organization timezone"}`, actor.organizationId);
      await this.reports.updateOne({ _id: report._id, organizationId: report.organizationId }, { $set: { status: "shared" }, $push: { deliveries: { channel: "telegram", recipientUserId: actor.sub, version: report.version, status: "delivered", attemptedAt, deliveredAt: new Date() } } });
      await this.audits.create({ organizationId: report.organizationId, actorUserId: new Types.ObjectId(actor.sub), actor: actor.name, action: "report_delivered", entityType: "report", entityId: id, after: { channel: "telegram", version: report.version }, source: "Kivora", verified: true }); return { id, channel: "telegram", status: "delivered", version: report.version };
    } catch (error) { await this.reports.updateOne({ _id: report._id, organizationId: report.organizationId }, { $push: { deliveries: { channel: "telegram", recipientUserId: actor.sub, version: report.version, status: "failed", attemptedAt, error: this.errorMessage(error) } } }); throw error; }
  }

  async scanAllOrganizations() {
    if (!this.connectionService) return this.scanPortfolio();
    const collection = this.connection.db!.collection("wheelhouseconnections");
    const active = await collection.find({ status: { $ne: "revoked" } }, { projection: { _id: 1, organizationId: 1, createdBy: 1 } }).toArray();
    const results = [];
    for (const connection of active) {
      const actor = { sub: String(connection.createdBy), privyUserId: "system", name: "Kivora scanner", role: "admin", organizationId: String(connection.organizationId), organizationRole: "administrator" } as AuthenticatedUser;
      try { results.push({ organizationId: actor.organizationId, connectionId: String(connection._id), ...(await this.scanPortfolio(actor, String(connection._id))) }); }
      catch (error) { results.push({ organizationId: actor.organizationId, error: this.errorMessage(error) }); }
    }
    return results;
  }

  async briefAllOrganizations() {
    if (!this.connectionService) return this.sendDailyBriefing();
    const active = await this.connection.db!.collection<{ organizationId: Types.ObjectId; createdBy: Types.ObjectId }>("wheelhouseconnections").find({ status: { $ne: "revoked" } }, { projection: { organizationId: 1, createdBy: 1 } }).toArray();
    const unique = new Map(active.map((connection) => [String(connection.organizationId), connection]));
    const results = [];
    for (const connection of unique.values()) {
      const actor = { sub: String(connection.createdBy), privyUserId: "system", name: "Kivora briefing worker", role: "admin", organizationId: String(connection.organizationId), organizationRole: "administrator" } as AuthenticatedUser;
      try { if(!await this.organizationLocalHour(actor.organizationId,7))continue;results.push({ organizationId: actor.organizationId, ...(await this.sendDailyBriefing(actor)) }); }
      catch (error) { results.push({ organizationId: actor.organizationId, error: this.errorMessage(error) }); }
    }
    return results;
  }
  async endOfDayAllOrganizations(){if(!this.connectionService)return[];const rows=await this.connection.db!.collection<any>("wheelhouseconnections").find({status:{$ne:"revoked"}}).toArray();const unique=new Map(rows.map(row=>[String(row.organizationId),row]));const output=[];for(const row of unique.values()){const actor={sub:String(row.createdBy),privyUserId:"system",name:"Kivora outcome worker",role:"admin",organizationId:String(row.organizationId),organizationRole:"administrator"}as AuthenticatedUser;try{if(!await this.organizationLocalHour(actor.organizationId,20))continue;const summary=await this.operationalSummary(actor);output.push({organizationId:actor.organizationId,...await this.telegram.broadcastEndOfDay(actor.organizationId,summary)});}catch(error){output.push({organizationId:actor.organizationId,error:this.errorMessage(error)});}}return output;}
  private async organizationLocalHour(organizationId:string,hour:number){const org:any=await this.connection.db!.collection("organizations").findOne({_id:new Types.ObjectId(organizationId)});try{return Number(new Intl.DateTimeFormat("en-GB",{timeZone:org?.defaultTimezone||"UTC",hour:"2-digit",hour12:false}).format(new Date()))===hour;}catch{return false;}}

  private async scope(actor?: AuthenticatedUser, connectionId?: string) {
    if (!actor || !this.connectionService) return { credential: undefined as string | undefined, connectionId: undefined as string | undefined, portfolioId: undefined as string | undefined };
    const { connection, credential } = await this.connectionService.credential(actor, connectionId);
    const portfolio = await this.connection.db!.collection("portfolios").findOne({ organizationId: new Types.ObjectId(actor.organizationId), connectionId: connection._id, status: "active" }, { projection: { _id: 1 } });
    return { credential, connectionId: String(connection._id), portfolioId: portfolio ? String(portfolio._id) : undefined, writeCapability: Boolean(connection.writeCapability) };
  }
  private async synchronizeListingMappings(
    actor: AuthenticatedUser,
    listings: WheelhouseListing[],
    connectionId?: string,
    portfolioId?: string,
  ) {
    if (!this.connection.db || !connectionId || !listings.length) return;
    const organizationId = new Types.ObjectId(actor.organizationId);
    const connectionObjectId = new Types.ObjectId(connectionId);
    let resolvedPortfolioId = portfolioId ? new Types.ObjectId(portfolioId) : undefined;
    if (!resolvedPortfolioId) {
      const portfolio = await this.connection.db.collection("portfolios").findOne({ organizationId, connectionId: connectionObjectId, status: "active" }, { projection: { _id: 1 } });
      resolvedPortfolioId = portfolio?._id;
    }
    if (!resolvedPortfolioId) return;
    const synchronizedAt = new Date();
    await this.connection.db.collection("listingmappings").bulkWrite(listings.map((listing) => ({
      updateOne: {
        filter: { organizationId, connectionId: connectionObjectId, externalListingId: listing.id, channel: listing.channel },
        update: {
          $set: {
            name: listing.nickname || listing.title || listing.id,
            market: listing.location?.address || listing.location?.country,
            currency: listing.currency || "USD",
            source: JSON.parse(JSON.stringify(listing)),
            lastSynchronizedAt: synchronizedAt,
            active: listing.is_active !== false,
          },
          $setOnInsert: {
            organizationId,
            connectionId: connectionObjectId,
            portfolioId: resolvedPortfolioId,
            externalListingId: listing.id,
            channel: listing.channel,
            includedInReporting: true,
            propertyProfiles: [],
            assigneeIds: [],
          },
        },
        upsert: true,
      },
    })), { ordered: false });
  }
  private async ensureListingMapping(actor: AuthenticatedUser, listingId: string) {
    if (!this.connection.db) return;
    const organizationId = new Types.ObjectId(actor.organizationId);
    if (await this.connection.db.collection("listingmappings").findOne({ organizationId, externalListingId: listingId, active: true }, { projection: { _id: 1 } })) return;
    const scope = await this.scope(actor);
    const cached = this.listingsFor(actor).find((listing) => listing.id === listingId);
    if (cached) {
      await this.synchronizeListingMappings(actor, [cached], scope.connectionId, scope.portfolioId);
      return;
    }
    const snapshot: any = await this.snapshots.findOne({ organizationId, listingId }).sort({ createdAt: -1 }).lean();
    if (snapshot?.channel) {
      const incident: any = await this.incidents.findOne({ organizationId, listingId }).sort({ createdAt: -1 }).lean();
      await this.synchronizeListingMappings(actor, [{ id: listingId, channel: snapshot.channel, title: incident?.listing || listingId }], scope.connectionId, scope.portfolioId);
      return;
    }
    const live = await this.wheelhouse.listings(scope.credential);
    this.setListings(actor, live);
    await this.synchronizeListingMappings(actor, live, scope.connectionId, scope.portfolioId);
  }
  private tenantKey(actor?: AuthenticatedUser) { return actor?.organizationId || "legacy"; }
  private orgScope(actor?: AuthenticatedUser) { return actor?.organizationId ? { organizationId: new Types.ObjectId(actor.organizationId) } : {}; }
  private listingsFor(actor?: AuthenticatedUser) { return actor ? this.tenantListings.get(this.tenantKey(actor)) || [] : this.listingsCache; }
  private setListings(actor: AuthenticatedUser | undefined, listings: WheelhouseListing[]) { if (actor) this.tenantListings.set(this.tenantKey(actor), listings); else this.listingsCache = listings; }
  private incidentsFor(actor?: AuthenticatedUser) { return actor ? this.tenantIncidents.get(this.tenantKey(actor)) || [] : this.incidentsCache; }
  private setIncidents(actor: AuthenticatedUser | undefined, incidents: LiveIncident[]) { if (actor) this.tenantIncidents.set(this.tenantKey(actor), incidents); else this.incidentsCache = incidents; }
  private lastScanFor(actor?: AuthenticatedUser) { return actor ? this.tenantLastScan.get(this.tenantKey(actor)) : this.lastScan; }
  private objectId(value: string) { if (!Types.ObjectId.isValid(value)) throw new BadRequestException("Resource identifier is invalid"); return new Types.ObjectId(value); }
  private requireAnalyst(actor: AuthenticatedUser) { if (!["owner", "administrator", "revenue_manager", "analyst"].includes(actor.organizationRole)) throw new ForbiddenException("Analyst permission is required"); }
  private scopedWheelhouseCapabilities(scope: { credential?: string; writeCapability?: boolean }) { const capability = this.wheelhouse.capabilities(scope.credential); return scope.writeCapability && capability.writeAccess === "unverified" ? { ...capability, writeAccess: "verified", writeActions: true } : capability; }
  private async markConnectionWriteVerified(actor?: AuthenticatedUser, connectionId?: string) { if (!actor || !connectionId || !this.connection.db) return; await this.connection.db.collection("wheelhouseconnections").updateOne({ _id: new Types.ObjectId(connectionId), organizationId: new Types.ObjectId(actor.organizationId), status: { $ne: "revoked" } }, { $set: { writeCapability: true, supportedMutationTypes: ["pricing_preset", "remove_base_price_override", "automatic_rate_posting", "listing_sync"], lastSuccessfulSynchronization: new Date() } }); }
  private errorMessage(error: unknown) { return error instanceof Error ? error.message.slice(0, 500) : "Operation failed"; }
  private async requestWheelhouseSync(listingId:string,channel:string,credential?:string){try{return{queued:true,response:this.safeUpstream(await this.wheelhouse.sync(listingId,channel,credential))};}catch(error){if(error instanceof HttpException&&[423,429].includes(error.getStatus()))return{queued:false,deferred:true,upstreamStatus:error.getStatus(),reason:error.getStatus()===423?"A recent Wheelhouse sync is already queued":"Wheelhouse daily sync allowance is unavailable; the pricing setting was still saved"};throw error;}}
  private safeUpstream(value: unknown) { return value && typeof value === "object" ? value as Record<string, unknown> : { acknowledged: value !== undefined }; }
  private serializeDocument(value: any) {
    if (!value) return value;
    const document = typeof value.toObject === "function" ? value.toObject() : { ...value };
    if (document._id) document.id = String(document._id);
    for (const key of ["organizationId", "portfolioId", "connectionId", "recommendationId", "simulationId", "actionId", "outcomeId", "assignedTo", "userId", "requestedBy", "approvedBy", "parentActionId"])
      if (document[key]) document[key] = String(document[key]);
    return document;
  }
  private async notify(actor: AuthenticatedUser, type: string, deduplicationKey: string, title: string, message: string, severity: string, metadata: Record<string, unknown> = {}) {
    if (!this.notifications) return;
    if(this.organizationSettings&&!await this.organizationSettings.permits(actor.organizationId,actor.sub,type,"in_app",Number(metadata.impact||0),severity))return;
    await this.notifications.findOneAndUpdate(
      { organizationId: new Types.ObjectId(actor.organizationId), channel: "in_app", deduplicationKey },
      { $setOnInsert: { organizationId: new Types.ObjectId(actor.organizationId), userId: new Types.ObjectId(actor.sub), channel: "in_app", type, deduplicationKey, title, message, severity, metadata, status: "delivered", deliveredAt: new Date() } },
      { upsert: true },
    );
  }
  private serializeAction(action: any) { return { ...action, id: String(action._id), organizationId: String(action.organizationId), connectionId: String(action.connectionId) }; }
  private serializeOpportunity(row: any, listingNames = new Map<string, string>(), lifecycleStatus?: string) { const ids: string[] = row.listingIds?.length ? row.listingIds : row.listingId ? [row.listingId] : []; const resolved = ids.map((id) => listingNames.get(id)).filter((name): name is string => Boolean(name)); const property = resolved.length === 1 ? resolved[0] : resolved.length > 1 ? `${resolved[0]} + ${resolved.length - 1} more` : ids.length > 1 ? `${ids.length} connected properties` : "Connected property"; return { id: String(row._id), property, listingId: row.listingId, action: row.suggested?.action || row.type, impact: row.projectedRevenueGain, confidence: row.confidence, tag: row.riskLevel, status: lifecycleStatus || row.status, opportunityStatus: row.status, lifecycleStatus: lifecycleStatus || (row.status === "completed" ? "COMPLETED" : row.status === "expired" ? "EXPIRED" : "READY"), category: row.type, discoveredAt: row.createdAt, expiresAt: row.expiresAt, currentState: JSON.stringify(row.baseline), proposedState: JSON.stringify(row.suggested), evidence: row.evidence, affectedListings: row.listingIds?.length || (row.listingId ? 1 : 0) }; }
  private async opportunityListingNames(rows: any[], actor: AuthenticatedUser) { const live = new Map(this.listingsFor(actor).map((listing) => [listing.id, listing.nickname || listing.title || ""])); if (!this.connection.db) return live; const ids = [...new Set(rows.flatMap((row) => row.listingIds?.length ? row.listingIds : row.listingId ? [row.listingId] : []).filter(Boolean))]; if (!ids.length) return live; const mappings = await this.connection.db.collection("listingmappings").find({ organizationId: new Types.ObjectId(actor.organizationId), externalListingId: { $in: ids }, active: true }).project({ externalListingId: 1, name: 1 }).toArray(); for (const mapping of mappings) if (mapping.name && !live.get(mapping.externalListingId)) live.set(mapping.externalListingId, mapping.name); return live; }
  private priorityScore(item: any) { const impact = Math.min(50, Math.max(0, Number(item.impact || 0) / 200)); const confidence = Math.max(0, Math.min(100, Number(item.confidence || 0))) * 0.25; const severity = item.severity === "Critical" ? 20 : item.severity === "Warning" ? 10 : 0; const urgency = item.expiresAt ? Math.max(0, 15 - (new Date(item.expiresAt).getTime() - Date.now()) / 86_400_000) : 5; return Number((impact + confidence + severity + urgency).toFixed(2)); }
  private signalType(cause: string) { return cause.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
  private async persistHealthScore(actor: AuthenticatedUser, portfolioId?: string) {
    if (!this.healthScores) return;
    const match = { organizationId: new Types.ObjectId(actor.organizationId), ...(portfolioId ? { portfolioId: new Types.ObjectId(portfolioId) } : {}) };
    const latest: any[] = await this.snapshots.aggregate([{ $match: match }, { $sort: { createdAt: -1 } }, { $group: { _id: "$listingId", snapshot: { $first: "$$ROOT" } } }, { $replaceRoot: { newRoot: "$snapshot" } }]);
    if (!latest.length) return;
    const average = (key: string) => latest.reduce((sum, item) => sum + Number(item[key] || 0), 0) / latest.length;
    const occupancy = Math.min(100, average("occupancy") * 100); const market = average("marketOccupancy") * 100; const competitiveness = market > 0 ? Math.max(0, Math.min(100, 100 - Math.abs(market - occupancy))) : 50;
    const pricing = latest.filter((item) => item.dynamicPricingEnabled).length / latest.length * 100; const freshness = latest.filter((item) => Date.now() - new Date(item.createdAt).getTime() < 6 * 60 * 60_000).length / latest.length * 100;
    const activeIncidents = await this.incidents.countDocuments({ organizationId: match.organizationId, status: "open" }); const incidentHealth = Math.max(0, 100 - activeIncidents * 12);
    const components = { occupancy: Number(occupancy.toFixed(1)), marketCompetitiveness: Number(competitiveness.toFixed(1)), dynamicPricing: Number(pricing.toFixed(1)), synchronizationFreshness: Number(freshness.toFixed(1)), incidentHealth };
    const weights = { occupancy: 0.25, marketCompetitiveness: 0.2, dynamicPricing: 0.2, synchronizationFreshness: 0.15, incidentHealth: 0.2 };
    const overallScore = Math.round(Object.entries(weights).reduce((sum, [key, weight]) => sum + components[key as keyof typeof components] * weight, 0));
    await this.healthScores.create({ ...match, overallScore, componentScores: components, inputs: { listingCount: latest.length, activeIncidents, calculatedFrom: "latest persisted listing snapshots" }, weights, explanation: `Health is ${overallScore}/100 from occupancy, market competitiveness, dynamic pricing, synchronization freshness, and active incidents.`, calculatedAt: new Date() });
  }
  private async calculateProductivity(actor: AuthenticatedUser) {
    const baselines = { portfolio_scan_completed: 12, generate_executive_report: 45, generate_portfolio_report: 40, generate_owner_report: 30, generate_revenue_report: 35, restore_dynamic_pricing: 10, apply_pricing_strategy: 8 };
    const rows = await this.audits.aggregate([{ $match: { organizationId: new Types.ObjectId(actor.organizationId), createdAt: { $gte: new Date(Date.now() - 30 * 86_400_000) } } }, { $group: { _id: "$action", count: { $sum: 1 } } }]);
    const inputs = Object.fromEntries(rows.filter((row) => baselines[row._id as keyof typeof baselines]).map((row) => [row._id, { count: row.count, minutesEach: baselines[row._id as keyof typeof baselines] }]));
    const minutesSaved = Object.values(inputs).reduce((sum: number, item: any) => sum + item.count * item.minutesEach, 0);
    return { minutesSaved, calculation: { method: "activity_count_x_configured_manual_duration", periodDays: 30, inputs, assumptions: "Baseline durations are documented organization defaults and can be replaced by measured organization settings." } };
  }

  private async checkpointCursor(organizationId: string, connectionId?: string) {
    if (!this.checkpoints || !connectionId) return 0;
    const checkpoint = await this.checkpoints.findOne({ organizationId: new Types.ObjectId(organizationId), connectionId: new Types.ObjectId(connectionId) }).lean();
    return checkpoint?.cursor || 0;
  }
  private async updateCheckpoint(actor: AuthenticatedUser | undefined, connectionId: string | undefined, cursor: number, nextCursor: number, scanned: number, total: number, complete: boolean, status: string) {
    if (!actor || !connectionId || !this.checkpoints) return;
    const now = new Date();
    await this.checkpoints.findOneAndUpdate({ organizationId: new Types.ObjectId(actor.organizationId), connectionId: new Types.ObjectId(connectionId) }, { $set: { key: `${actor.organizationId}:${connectionId}`, cursor: nextCursor, listingsScanned: nextCursor, listingsRemaining: Math.max(0, total - (cursor + scanned)), status, ...(complete ? { completedAt: now, lastCompletePortfolioScan: now, listingsScanned: total, listingsRemaining: 0 } : {}) }, $setOnInsert: { startedAt: now, retryCount: 0 } }, { upsert: true });
  }
  private async failCheckpoint(actor: AuthenticatedUser | undefined, connectionId: string | undefined, error: unknown) { if (actor && connectionId && this.checkpoints) await this.checkpoints.updateOne({ organizationId: new Types.ObjectId(actor.organizationId), connectionId: new Types.ObjectId(connectionId) }, { $set: { status: "failed", lastError: this.errorMessage(error) }, $inc: { retryCount: 1 } }); }
  private async acquireLock(key: string, owner: string, ttl: number) {
    if (!this.locks) return true;
    const now = new Date();
    const existing = await this.locks.findOneAndUpdate({ key, $or: [{ expiresAt: { $lte: now } }, { owner }] }, { $set: { owner, expiresAt: new Date(Date.now() + ttl) } }, { returnDocument: "after" }).lean();
    if (existing) return existing.owner === owner;
    try { await this.locks.create({ key, owner, expiresAt: new Date(Date.now() + ttl) }); return true; } catch { return false; }
  }
  private async releaseLock(key: string, owner: string) { if (this.locks) await this.locks.deleteOne({ key, owner }); }

  private async ensureRecommendation(actor: AuthenticatedUser, incident: LiveIncident, portfolioId: string | undefined, impactCalculation: Record<string, unknown>) {
    if (!this.recommendationRecords) return;
    const storedIncident = await this.incidents.findOne({ organizationId: new Types.ObjectId(actor.organizationId), externalId: incident.externalId }).lean();
    if (!storedIncident) return;
    const existing = await this.recommendationRecords.findOne({ organizationId: new Types.ObjectId(actor.organizationId), incidentId: storedIncident._id, status: { $nin: ["EXPIRED", "DISMISSED", "COMPLETED", "CANCELLED", "REVERTED"] } }).lean();
    if (existing) return;
    const recommendation=await this.recommendationRecords.create({ organizationId: new Types.ObjectId(actor.organizationId), ...(portfolioId ? { portfolioId: new Types.ObjectId(portfolioId) } : {}), incidentId: storedIncident._id, listingId: incident.listingId, listingIds: [incident.listingId], affectedDates: [], title: incident.title, explanation: incident.explanation, proposedAction: incident.canAutoResolve ? "restore_dynamic_pricing" : "manual_review", evidence: storedIncident.evidence, impactCalculation, estimatedImpact: incident.revenueAtRisk, currency: "USD", confidence: incident.confidence, risks: incident.canAutoResolve ? "Live portfolio state may change before approval; Kivora re-fetches state before execution." : "No supported Wheelhouse mutation is available for this condition.", expiresAt: new Date(Date.now() + 24 * 60 * 60_000), status: "READY", transitions: [{ from: "DRAFT", to: "READY", actor: "system", at: new Date() }] });
    await this.notify(actor,incident.severity==="Critical"?"critical_incident":"high_incident",`recommendation:${recommendation._id}`,recommendation.title,recommendation.explanation,incident.severity.toLowerCase(),{recommendationId:String(recommendation._id),impact:recommendation.estimatedImpact});
    await this.telegram.notifyRecommendation(recommendation,"incident").catch(()=>undefined);
  }
  private async createOutcome(actor: AuthenticatedUser, actionId: Types.ObjectId, baseline: Record<string, unknown>, projected: number, currency: string, protectedRevenue = true) {
    if (!this.outcomes) return;
    await this.outcomes.findOneAndUpdate({ organizationId: new Types.ObjectId(actor.organizationId), actionId }, { $setOnInsert: { organizationId: new Types.ObjectId(actor.organizationId), actionId, baselineSnapshot: baseline, projectedRevenueGain: projected, currency, revenueProtected: protectedRevenue ? projected : 0, attributionConfidence: 0, measurementStartsAt: new Date(), measurementEndsAt: new Date(Date.now() + 7 * 86_400_000), status: "pending", attributionNotes: protectedRevenue ? "Revenue protected is the quantified incident exposure removed after verified execution; it is not realized cash revenue." : "Projected opportunity is not realized revenue. Attribution begins after verified execution." } }, { upsert: true });
  }

  async evaluateOutcomes() {
    if (!this.outcomes || !this.actions) return { evaluated: 0, completed: 0, unattributed: 0 };
    const due = await this.outcomes.find({ status: { $in: ["pending", "measuring"] }, measurementStartsAt: { $lte: new Date() } }).limit(100).lean();
    let completed = 0; let unattributed = 0;
    for (const outcome of due as any[]) {
      const action: any = await this.actions.findOne({ _id: outcome.actionId, organizationId: outcome.organizationId, status: { $in: ["VERIFIED", "PARTIALLY_APPLIED"] } }).lean();
      if (!action) continue;
      const listingId = action.targetListings?.[0];
      const baseline: any = listingId ? await this.snapshots.findOne({ organizationId: outcome.organizationId, listingId, createdAt: { $lte: action.executedAt || action.createdAt } }).sort({ createdAt: -1 }).lean() : null;
      const post: any = listingId ? await this.snapshots.findOne({ organizationId: outcome.organizationId, listingId, createdAt: { $gte: outcome.measurementStartsAt } }).sort({ createdAt: -1 }).lean() : null;
      if (new Date(outcome.measurementEndsAt) > new Date()) { await this.outcomes.updateOne({ _id: outcome._id, organizationId: outcome.organizationId }, { $set: { status: "measuring", ...(post ? { postActionSnapshot: post } : {}) } }); continue; }
      if (!baseline || !post) { await this.outcomes.updateOne({ _id: outcome._id, organizationId: outcome.organizationId }, { $set: { status: "unattributed", attributionConfidence: 0, attributionNotes: "The measurement window ended without comparable organization-scoped pre/post KPI snapshots; no realized revenue is claimed." } }); unattributed++; continue; }
      const revenueDelta = Number(post.revenue || 0) - Number(baseline.revenue || 0);
      await this.outcomes.updateOne({ _id: outcome._id, organizationId: outcome.organizationId }, { $set: { status: "completed", baselineSnapshot: baseline, postActionSnapshot: post, occupancyChange: Number(post.occupancy || 0) - Number(baseline.occupancy || 0), adrChange: Number(post.adr || 0) - Number(baseline.adr || 0), revparChange: Number(post.revpar || 0) - Number(baseline.revpar || 0), bookingPaceChange: Number(post.pickup || 0) - Number(baseline.pickup || 0), realizedRevenue: revenueDelta, attributionConfidence: 40, attributionNotes: "Observed portfolio movement during the action window. Attribution is limited because external demand and booking timing are not controlled." } }); completed++;
    }
    return { evaluated: due.length, completed, unattributed };
  }

  private async detectIndependentOpportunities(actor: AuthenticatedUser, listings: WheelhouseListing[], credential?: string, portfolioId?: string,connectionId?:string) {
    if (!this.opportunityRecords) return;
    await this.opportunityRecords.updateMany({ organizationId: new Types.ObjectId(actor.organizationId), status: { $in: ["open", "under_review"] }, expiresAt: { $lte: new Date() } }, { $set: { status: "expired" } });
    const signals = await this.market.list(actor.organizationId);
    const eventSettings:any=await this.organizationSettings?.providerSettings(actor.organizationId,"ticketmaster");
    const byId = new Map(listings.map((listing) => [listing.id, listing]));
    for (const signal of signals.filter((item) => item.kind === "event" && item.startsAt).slice(0, 12)) {
      const affectedDate = new Date(signal.startsAt!).toISOString().slice(0, 10);
      for (const listingId of signal.listingIds.slice(0, 8)) {
        const listing = byId.get(listingId);
        if (!listing) continue;
        try {
          const [preferences, recommendations, kpis] = await Promise.all([
            this.wheelhouse.preferences(listing.id, listing.channel, credential),
            this.wheelhouse.recommendations(listing.id, listing.channel, credential),
            this.wheelhouse.kpis(listing.id, listing.channel, credential),
          ]);
          const affected = (recommendations.data || []).filter((day) => Math.abs(new Date(day.stay_date).getTime() - new Date(affectedDate).getTime()) <= 86_400_000);
          const demandDays = affected.filter((day) => Number(day.attr_local_demand || 0) > 0.05);
          if (!demandDays.length) continue;
          const baselineRate = Number(preferences.base_price || recommendations.base_price || 0);
          const suggestedRate = Math.round(demandDays.reduce((sum, day) => sum + Number(day.price || 0), 0) / demandDays.length);
          const occupancyProbability = Math.max(0.2, Math.min(0.95, metricAt(kpis, "occupancy") || metricAt(kpis, "occupancy_neighborhood") || 0.5));
          const grossUplift = Math.max(0, suggestedRate - baselineRate) * demandDays.length * occupancyProbability;
          const confidence = Math.min(95, Math.round((signal.confidence + 70) / 2));
          const projectedRevenueGain = Math.round(grossUplift * confidence / 100);
          if (projectedRevenueGain < Number(eventSettings?.opportunityThreshold||0)||projectedRevenueGain<=0) continue;
          const deduplicationKey = `event:${signal.externalId}:${listing.id}:${affectedDate}`;
          const opportunity = await this.opportunityRecords.findOneAndUpdate({ organizationId: new Types.ObjectId(actor.organizationId), deduplicationKey }, { $set: {
            ...(connectionId?{connectionId:new Types.ObjectId(connectionId)}:{}),
            organizationId: new Types.ObjectId(actor.organizationId), ...(portfolioId ? { portfolioId: new Types.ObjectId(portfolioId) } : {}), deduplicationKey, type: "event_driven_demand", listingId: listing.id, listingIds: [listing.id], affectedDates: demandDays.map((day) => day.stay_date),
            evidence: { eventId: signal.externalId, event: signal.title, source: signal.source, eventConfidence: signal.confidence, wheelhouseLocalDemand: demandDays.map((day) => ({ date: day.stay_date, localDemand: day.attr_local_demand, recommendedPrice: day.price })), occupancyProbability },
            baseline: { basePrice: baselineRate, occupancyProbability }, suggested: { action: "Review event pricing strategy", targetRate: suggestedRate }, projectedRevenueGain, impactCalculation: { method: "rate_gap_x_affected_nights_x_occupancy_x_confidence", inputs: { baselineRate, suggestedRate, affectedNights: demandDays.length, occupancyProbability, confidence }, assumptions: ["Event signal is corroborated by Wheelhouse local demand", "Uplift applies only to affected available nights"], currency: listing.currency || "USD", calculatedAt: new Date() }, currency: listing.currency || "USD", confidence, riskLevel: "medium", expiresAt: new Date(signal.startsAt!), refreshedAt: new Date(), detectionSource: "Ticketmaster signal corroborated by Wheelhouse local-demand attributes", relatedSignalId: signal.externalId, status: "open",
          } }, { upsert: true, returnDocument: "after" }).lean();
          if (opportunity) await this.ensureOpportunityRecommendation(actor, opportunity);
        } catch { /* A partial provider failure cannot justify an opportunity. */ }
      }
    }

    const mappings = await this.connection.db!.collection<{ externalListingId: string; propertyProfiles?: string[] }>("listingmappings").find({ organizationId: new Types.ObjectId(actor.organizationId), externalListingId: { $in: listings.map((listing) => listing.id) } }, { projection: { externalListingId: 1, propertyProfiles: 1 } }).toArray();
    const profiles = new Map(mappings.map((mapping) => [mapping.externalListingId, mapping.propertyProfiles || []]));
    const weatherSettings:any=await this.organizationSettings?.providerSettings(actor.organizationId,"openweather");const enabledProfiles:string[]=weatherSettings?.enabledPropertyProfiles||[];
    for (const signal of signals.filter((item) => item.kind === "weather" && item.startsAt && item.endsAt)) {
      const description = `${signal.title} ${signal.description || ""}`.toLowerCase();
      for (const listingId of signal.listingIds) {
        const listingProfiles = (profiles.get(listingId) || []).filter(profile=>!enabledProfiles.length||enabledProfiles.includes(profile));
        const positiveRain = /(rain|storm)/.test(description) && listingProfiles.some((profile) => ["shopping_district", "indoor_attraction_area", "downtown", "business_district"].includes(profile));
        const positiveSnow = /snow/.test(description) && listingProfiles.includes("ski_destination");
        if (!positiveRain && !positiveSnow) continue;
        const affectedDates = this.dateRange(signal.startsAt!, signal.endsAt!);
        const deduplicationKey = `weather:${signal.externalId}:${listingId}:${affectedDates[0]}`;
        const opportunity = await this.opportunityRecords.findOneAndUpdate({ organizationId: new Types.ObjectId(actor.organizationId), deduplicationKey }, { $set: {
          ...(connectionId?{connectionId:new Types.ObjectId(connectionId)}:{}),
          organizationId: new Types.ObjectId(actor.organizationId), ...(portfolioId ? { portfolioId: new Types.ObjectId(portfolioId) } : {}), deduplicationKey, type: "property_aware_weather_demand", listingId, listingIds: [listingId], affectedDates,
          evidence: { forecast: signal.description, signalSource: signal.source, propertyProfiles: listingProfiles, interpretationRule: positiveSnow ? "snow_can_increase_ski_destination_demand" : "rain_can_shift_demand_toward_indoor_attractions" }, baseline: { pricingImpact: "not_measured" }, suggested: { action: "Review Wheelhouse demand and booking pace before changing price" }, projectedRevenueGain: 0, impactCalculation: { method: "not_calculated", inputs: { forecast: signal.description, propertyProfiles: listingProfiles }, assumptions: ["Weather alone does not support a revenue forecast"], currency: byId.get(listingId)?.currency || "USD", calculatedAt: new Date() }, currency: byId.get(listingId)?.currency || "USD", confidence: Math.min(85, signal.confidence), riskLevel: "medium", expiresAt: signal.endsAt!, refreshedAt: new Date(), detectionSource: "OpenWeather forecast interpreted by persisted property profile", relatedSignalId: signal.externalId, status: "open",
        } }, { upsert: true, returnDocument: "after" }).lean();
        if (opportunity) await this.ensureOpportunityRecommendation(actor, opportunity);
      }
    }
    await this.detectPortfolioOpportunities(actor, listings, credential, portfolioId,connectionId);
  }
  private async detectPortfolioOpportunities(actor: AuthenticatedUser, listings: WheelhouseListing[], credential?: string, portfolioId?: string,connectionId?:string) {
    if (!this.opportunityRecords) return;
    if(!listings.length)return;
    const organizationId = new Types.ObjectId(actor.organizationId); const detected = new Set<string>();
    const profiles = await this.connection.db!.collection("listingmappings").find({ organizationId, externalListingId: { $in: listings.map((item) => item.id) }, active: true }).project({ externalListingId: 1, propertyProfiles: 1 }).toArray();
    const profileMap = new Map(profiles.map((item: any) => [item.externalListingId, item.propertyProfiles || []]));
    for (const listing of listings) {
      const history: any[] = await this.snapshots.find({ organizationId, listingId: listing.id }).sort({ createdAt: -1 }).limit(8).lean();
      if (!history.length) continue;
      const current = history[0]; const previous = history[1]; const currency = listing.currency || "USD";
      let preferences: any; let recommendations: any; let neighborhood: any;
      try { [preferences, recommendations, neighborhood] = await Promise.all([this.wheelhouse.preferences(listing.id, listing.channel, credential), this.wheelhouse.recommendations(listing.id, listing.channel, credential), this.wheelhouse.neighborhoodPricing(listing.id, listing.channel, credential).catch(() => null)]); } catch { continue; }
      const days: any[] = recommendations?.data || []; const future = days.filter((day) => new Date(day.stay_date) > new Date()); const occupancy = Number(current.occupancy || 0); const marketOccupancy = Number(current.marketOccupancy || 0); const base = Number(current.basePrice || preferences?.base_price || recommendations?.base_price || 0); const target = Number(current.recommendedBasePrice || recommendations?.base_price_recommended || base);
      const add = async (type: string, dates: string[], evidence: Record<string, unknown>, baseline: Record<string, unknown>, suggested: Record<string, unknown>, impact: number, confidence: number, riskLevel: string, method: string, assumptions: string[], actionable = true) => {
        if (!dates.length || impact < 0 || confidence < 55) return; const signature = createHash("sha256").update(JSON.stringify({ type, listing: listing.id, dates: dates.slice(0, 2), suggested })).digest("hex").slice(0, 16); const deduplicationKey = `rule:${type}:${listing.id}:${dates[0]}:${signature}`; detected.add(deduplicationKey);
        const record: any = await this.opportunityRecords!.findOneAndUpdate({ organizationId, deduplicationKey }, { $set: { organizationId, ...(portfolioId ? { portfolioId: new Types.ObjectId(portfolioId) } : {}), ...(connectionId ? { connectionId: new Types.ObjectId(connectionId) } : {}), deduplicationKey, type, listingId: listing.id, listingIds: [listing.id], affectedDates: dates, evidence, baseline, suggested, projectedRevenueGain: Math.round(impact), impactCalculation: { method, inputs: { baseline, suggested, affectedDates: dates, affectedInventory: 1 }, assumptions, currency, confidenceRange: [Math.max(0, confidence - 15), Math.min(100, confidence + 5)], calculatedAt: new Date() }, currency, confidence, riskLevel, expiresAt: new Date(`${dates[dates.length - 1]}T23:59:59.999Z`), refreshedAt: new Date(), detectionSource: "Deterministic Wheelhouse portfolio rule", status: "open" } }, { upsert: true, returnDocument: "after" }).lean();
        if (record) await this.ensureOpportunityRecommendation(actor, { ...record, actionable });
      };
      const marketAcceleration = previous && Number(current.marketOccupancy || 0) - Number(previous.marketOccupancy || 0) >= .08 && marketOccupancy - occupancy >= .12;
      if (marketAcceleration&&opportunityRuleEligible("market_demand_acceleration",{marketAcceleration:Number(current.marketOccupancy||0)-Number(previous.marketOccupancy||0),marketGap:marketOccupancy-occupancy})) { const dates = future.slice(0, 14).map((d) => d.stay_date); const gap = Math.max(0, target - base); await add("market_demand_acceleration", dates, { currentMarketOccupancy: marketOccupancy, previousMarketOccupancy: previous.marketOccupancy, listingOccupancy: occupancy, wheelhouseTarget: target }, { basePrice: base, occupancy }, { action: "Apply balanced pricing preset", targetRate: target }, gap * dates.length * Math.max(.35, marketOccupancy), 78, "medium", "rate_gap_x_future_nights_x_market_occupancy", ["Market occupancy accelerated at least 8 points", "Listing trails market by at least 12 points"]); }
      const paceDays = future.filter((d) => Number(d.attr_occupancy_pacing || 0) <= -.1 && Number(d.price || 0) < target * 1.05).slice(0, 14);
      if (paceDays.length >= 3 && marketOccupancy - occupancy >= .1) { const dates = paceDays.map((d) => d.stay_date); const proposed = Math.max(base, Math.round(paceDays.reduce((s,d)=>s+Number(d.price||base),0)/paceDays.length)); await add("booking_pace_divergence", dates, { listingOccupancy: occupancy, marketOccupancy, paceAttributes: paceDays.map((d)=>({ date:d.stay_date, pace:d.attr_occupancy_pacing, price:d.price })) }, { basePrice: base, occupancy }, { action: "Apply conservative pricing preset", targetRate: proposed }, Math.max(0, proposed-base)*dates.length*Math.max(.3,occupancy), 74, "medium", "defensible_rate_gap_x_affected_nights_x_occupancy", ["At least three future dates show negative Wheelhouse pace", "Listing occupancy trails market"]); }
      const compDays = (neighborhood?.data || []).filter((d:any)=>new Date(d.stay_date)>new Date() && Number(d.listings_count||0)>=3 && Number(d.median_price||0)>target*1.12).slice(0,14);
      if (compDays.length >= 3) { const dates=compDays.map((d:any)=>d.stay_date); const median=Math.round(compDays.reduce((s:number,d:any)=>s+Number(d.median_price),0)/compDays.length); await add("comparable_price_movement",dates,{ comparableDays:compDays.map((d:any)=>({date:d.stay_date,median:d.median_price,count:d.listings_count})),wheelhouseTarget:target},{basePrice:base},{action:"Apply balanced pricing preset",targetRate:Math.min(median,target*1.2)},Math.max(0,Math.min(median,target*1.2)-base)*dates.length*Math.max(.35,occupancy),76,"medium","comparable_rate_gap_x_nights_x_occupancy",["At least three dates have three or more comparables","Comparable median exceeds Wheelhouse target by 12%"]); }
      const weekday = future.filter((d)=>{const n=new Date(d.stay_date).getUTCDay();return n>=1&&n<=4&&Number(d.attr_local_demand||0)>.08&&Number(d.price||0)>base*1.08;}).slice(0,12);
      if (weekday.length>=3 && occupancy<marketOccupancy) { const dates=weekday.map(d=>d.stay_date); const rate=Math.round(weekday.reduce((s,d)=>s+Number(d.price),0)/weekday.length); await add("weekday_occupancy",dates,{localDemand:weekday.map(d=>({date:d.stay_date,demand:d.attr_local_demand,price:d.price})),listingOccupancy:occupancy,marketOccupancy},{basePrice:base},{action:"Apply conservative pricing preset",targetRate:rate},Math.max(0,rate-base)*dates.length*Math.max(.3,occupancy),70,"low","weekday_rate_gap_x_nights_x_occupancy",["Three or more weekdays have positive local demand","Listing occupancy trails market"]); }
      const weekends=future.filter((d)=>[5,6].includes(new Date(d.stay_date).getUTCDay())&&Number(d.price||0)>base*1.15).slice(0,12);
      if(weekends.length>=2){const dates=weekends.map(d=>d.stay_date);const rate=Math.round(weekends.reduce((s,d)=>s+Number(d.price),0)/weekends.length);await add("weekend_pricing_premium",dates,{wheelhouseWeekendRecommendations:weekends.map(d=>({date:d.stay_date,price:d.price,demand:d.attr_local_demand}))},{basePrice:base},{action:"Apply balanced pricing preset",targetRate:rate},Math.max(0,rate-base)*dates.length*Math.max(.4,occupancy),72,"low","weekend_rate_gap_x_nights_x_occupancy",["At least two weekend recommendations exceed base price by 15%"]);}
      const lastMinute=future.filter((d)=>{const delta=(new Date(d.stay_date).getTime()-Date.now())/86400000;return delta<=7&&Number(d.attr_local_demand||0)>.1&&Number(d.price||0)>base*1.1;});
      if(lastMinute.length>=2){const dates=lastMinute.map(d=>d.stay_date);const rate=Math.round(lastMinute.reduce((s,d)=>s+Number(d.price),0)/lastMinute.length);await add("last_minute_demand",dates,{daysToStay:"0-7",recommendations:lastMinute},{basePrice:base},{action:"Apply aggressive pricing preset",targetRate:rate},Math.max(0,rate-base)*dates.length*Math.max(.45,marketOccupancy),75,"medium","last_minute_rate_gap_x_nights_x_market_occupancy",["Local demand is above 10% on at least two dates inside seven days"]);}
      const farFuture=future.filter((d)=>{const delta=(new Date(d.stay_date).getTime()-Date.now())/86400000;return delta>=45&&Number(d.attr_local_demand||0)>.08&&Number(d.price||0)>base*1.12;}).slice(0,14);
      if(farFuture.length>=3){const dates=farFuture.map(d=>d.stay_date);const rate=Math.round(farFuture.reduce((s,d)=>s+Number(d.price),0)/farFuture.length);await add("far_future_demand",dates,{daysToStay:"45+",recommendations:farFuture},{basePrice:base},{action:"Apply balanced pricing preset",targetRate:rate},Math.max(0,rate-base)*dates.length*.35,68,"medium","far_future_rate_gap_x_nights_x_probability",["Three or more dates beyond 45 days have corroborating demand and rate recommendations"]);}
      const luxury=(profileMap.get(listing.id) as string[]||[]).some((p)=>["luxury","resort","premium"].includes(p)); const highComp=(neighborhood?.data||[]).filter((d:any)=>Number(d.listings_count||0)>=5&&Number(d.high_price||0)>base*1.3).slice(0,10);
      if(luxury&&highComp.length>=3){const dates=highComp.map((d:any)=>d.stay_date);const rate=Math.round(highComp.reduce((s:number,d:any)=>s+Number(d.high_price),0)/highComp.length*.85);await add("luxury_listing_premium",dates,{propertyProfiles:profileMap.get(listing.id),comparableHighPrices:highComp},{basePrice:base},{action:"Apply aggressive pricing preset",targetRate:rate},Math.max(0,rate-base)*dates.length*Math.max(.3,occupancy),67,"high","premium_comp_gap_x_nights_x_occupancy",["Listing is explicitly profiled as luxury/resort/premium","Five or more comparables support the upper price band"]);}
      const minimumStay=Number(preferences?.minimum_stay||preferences?.min_stay||0); const available=(preferences?.calendar||preferences?.availability) as any[]|undefined;
      if(minimumStay>1&&Array.isArray(available)){const short=available.filter((d:any)=>d.available===true&&new Date(d.date||d.stay_date)>new Date()&&Number(d.gap_nights||0)>0&&Number(d.gap_nights)<minimumStay).slice(0,10);if(short.length){const dates=short.map((d:any)=>d.date||d.stay_date);await add("minimum_stay_optimization",dates,{minimumStay,availableGapRecords:short},{minimumStay},{action:"Review minimum-stay adjustment",proposedMinimumStay:Math.max(1,Math.min(...short.map((d:any)=>Number(d.gap_nights))))},base*dates.length*Math.max(.2,occupancy),72,"medium","available_gap_nights_x_base_rate_x_booking_probability",["Calendar explicitly marks the dates available","Gap is shorter than the active minimum stay"],false);await add("gap_night_optimization",dates,{minimumStay,currentCalendar:short},{availableGapNights:dates.length},{action:"Review gap-night rule",proposedMinimumStay:Math.max(1,Math.min(...short.map((d:any)=>Number(d.gap_nights))))},base*dates.length*Math.max(.2,occupancy),74,"medium","gap_nights_x_base_rate_x_booking_probability",["Future calendar gap remains available","Active minimum stay prevents booking the gap"],false);}}
      if(history.length>=4){const older=history.slice(2).reduce((s:any,x:any)=>s+Number(x.marketOccupancy||0),0)/(history.length-2);if(marketOccupancy-older>=.1&&future.filter(d=>Number(d.attr_local_demand||0)>.05).length>=4){const seasonal=future.filter(d=>Number(d.attr_local_demand||0)>.05).slice(0,21);const dates=seasonal.map(d=>d.stay_date);await add("seasonal_demand",dates,{currentMarketOccupancy:marketOccupancy,historicalMarketOccupancy:older,localDemandDates:seasonal.length},{basePrice:base},{action:"Apply balanced pricing preset",targetRate:target},Math.max(0,target-base)*dates.length*Math.max(.35,marketOccupancy),73,"medium","seasonal_rate_gap_x_dates_x_market_occupancy",["Market occupancy is at least 10 points above persisted historical baseline","Four or more future dates have positive local demand"]);}}
    }
    const ruleTypes=["market_demand_acceleration","booking_pace_divergence","comparable_price_movement","weekday_occupancy","weekend_pricing_premium","last_minute_demand","far_future_demand","luxury_listing_premium","minimum_stay_optimization","gap_night_optimization","seasonal_demand"];
    const stale:any[]=await this.opportunityRecords.find({organizationId,type:{$in:ruleTypes},status:{$in:["open","under_review"]},deduplicationKey:{$nin:[...detected]}}).lean();
    for(const item of stale){const replacement=[...detected].find((key)=>key.startsWith(`rule:${item.type}:${item.listingId}:`));const status=replacement?"superseded":"completed";const reason=replacement?"Materially different current evidence produced a replacement recommendation":"Condition no longer met by current live evidence";await this.opportunityRecords.updateOne({_id:item._id,organizationId},{$set:{status,refreshedAt:new Date(),resolutionReason:reason,...(replacement?{supersededByDeduplicationKey:replacement}:{})}});if(item.recommendationId&&this.recommendationRecords)await this.recommendationRecords.updateOne({_id:item.recommendationId,organizationId,status:{$in:["READY","REVIEWED","APPROVED"]}},{$set:{status:replacement?"CANCELLED":"COMPLETED",decisionReason:reason},$push:{transitions:{from:item.status,to:replacement?"CANCELLED":"COMPLETED",actor:"system",at:new Date(),reason}}});}
  }
  private dateRange(start: Date, end: Date) { const output: string[] = []; for (let date = new Date(start); date <= end && output.length < 14; date = new Date(date.getTime() + 86_400_000)) output.push(date.toISOString().slice(0, 10)); return output; }
  private async ensureOpportunityRecommendation(actor: AuthenticatedUser, opportunity: any) {
    if (!this.recommendationRecords) return;
    const existing = await this.recommendationRecords.findOne({ organizationId: opportunity.organizationId, opportunityId: opportunity._id, status: { $nin: ["EXPIRED", "DISMISSED", "COMPLETED", "CANCELLED", "REVERTED"] } }).lean();
    if (existing) return;
    const actionable = opportunity.actionable !== false && !["property_aware_weather_demand","minimum_stay_optimization","gap_night_optimization"].includes(opportunity.type);
    const recommendation = await this.recommendationRecords.create({ organizationId: opportunity.organizationId, portfolioId: opportunity.portfolioId, opportunityId: opportunity._id, listingId: opportunity.listingId, listingIds: opportunity.listingIds, affectedDates: opportunity.affectedDates, title: `Review ${String(opportunity.type).replaceAll("_", " ")}`, explanation: `Current organization-scoped Wheelhouse evidence satisfies the deterministic ${String(opportunity.type).replaceAll("_", " ")} rule. Review its stored evidence and calculation before deciding.`, proposedAction: actionable ? "apply_pricing_preset" : "manual_review", evidence: opportunity.evidence, impactCalculation: opportunity.impactCalculation || { method: "not_calculated", inputs: { baseline: opportunity.baseline, suggested: opportunity.suggested }, estimated: opportunity.projectedRevenueGain, calculatedAt: new Date() }, estimatedImpact: opportunity.projectedRevenueGain, currency: opportunity.currency, confidence: opportunity.confidence, risks: opportunity.riskLevel === "high" ? "High uncertainty or premium positioning requires careful review." : "Demand may change before affected dates; current state is refreshed before execution.", expiresAt: opportunity.expiresAt, status: "READY", transitions: [{ from: "DRAFT", to: "READY", actor: "system", at: new Date() }] });
    await this.opportunityRecords!.updateOne({ _id: opportunity._id, organizationId: opportunity.organizationId }, { $set: { recommendationId: recommendation._id } });
    await this.notify(actor,opportunity.type==="event_driven_demand"?"event_opportunity":opportunity.type==="property_aware_weather_demand"?"weather_opportunity":"opportunity",`recommendation:${recommendation._id}`,recommendation.title,recommendation.explanation,opportunity.riskLevel,{recommendationId:String(recommendation._id),impact:recommendation.estimatedImpact});
    await this.telegram.notifyRecommendation(recommendation,"opportunity",String((opportunity as any).type||"")).catch(()=>undefined);
    this.metrics?.increment("opportunities_created_total", { type: opportunity.type });
  }
  private reportBody(generated: string, type: string, facts: any) {
    const cleaned = String(generated || "").trim();
    if (cleaned.replace(/[*_#`\s-]/g, "").length >= 40) return cleaned;
    const summary = facts.summary || {};
    const priorities = (facts.priorities || []).slice(0, 5);
    const signals = (facts.marketSignals || []).slice(0, 5);
    return [
      `# ${type[0].toUpperCase()}${type.slice(1)} revenue report`,
      "## Portfolio summary",
      `- Portfolio health: ${summary.health ?? summary.healthScore ?? "Unavailable"}`,
      `- Revenue at risk: ${summary.atRisk ?? 0}`,
      `- Open opportunities: ${summary.opportunities ?? 0}`,
      `- Critical incidents: ${summary.criticalIncidents ?? 0}`,
      "## Highest-impact actions",
      ...(priorities.length ? priorities.map((item: any) => `- ${item.title || item.action || item.property}: ${item.impact ?? item.revenueAtRisk ?? 0} measured or projected impact`) : ["- No active priority met the current evidence threshold."]),
      "## Market intelligence",
      ...(signals.length ? signals.map((item: any) => `- ${item.title} — ${item.location || "portfolio location"} (${item.confidence ?? 0}% confidence)`) : ["- No active event or weather signal is stored for this reporting period."]),
      "## Recommended next step",
      priorities[0] ? `Review ${priorities[0].title || priorities[0].action || "the highest-impact action"} and its supporting evidence before approval.` : "Continue monitoring the live portfolio for material changes.",
    ].join("\n");
  }

  private createCsv(report: any) {
    if (!report?.metrics && !report?.title && !report?.body) {
      const legacyRows: Array<[string, string]> = [];
      const flatten = (value: unknown, path: string) => { if (value === null || typeof value !== "object") legacyRows.push([path, value == null ? "" : String(value)]); else if (Array.isArray(value)) value.forEach((child, index) => flatten(child, `${path}[${index}]`)); else Object.entries(value as Record<string, unknown>).forEach(([key, child]) => flatten(child, path ? `${path}.${key}` : key)); };
      flatten(report || {}, ""); const quoteLegacy = (value: string) => `"${value.replace(/"/g, '""')}"`;
      return Buffer.from(["field,value", ...legacyRows.map(([field, value]) => `${quoteLegacy(field)},${quoteLegacy(value)}`)].join("\n"), "utf8");
    }
    const rows: string[][] = [
      ["Kivora Revenue Operations Report", "", ""],
      ["Report", "Title", String(report.title || "")],
      ["Report", "Type", String(report.type || "")],
      ["Report", "Status", String(report.status || "")],
      ["Report", "Generated", new Date(report.createdAt || Date.now()).toISOString()],
      ["Report", "Currency", String(report.currency || "USD")],
      ["Report", "Timezone", String(report.timezone || "UTC")],
      ["", "", ""],
      ["Narrative", "Section", "Content"],
    ];
    let section = "Overview";
    for (const raw of String(report.body || "").split(/\r?\n/)) {
      const line = raw.trim(); if (!line) continue;
      if (/^#{1,3}\s+/.test(line)) { section = line.replace(/^#{1,3}\s+/, "").replace(/\*\*/g, ""); continue; }
      rows.push(["Narrative", section, line.replace(/^[-*]\s+/, "").replace(/\*\*/g, "")]);
    }
    rows.push(["", "", ""], ["Live data", "Metric", "Value"]);
    const walk = (value: unknown, path: string) => {
      if (value === null || typeof value !== "object") rows.push(["Live data", path || "value", value == null ? "" : String(value)]);
      else if (Array.isArray(value)) value.forEach((child, index) => walk(child, `${path || "items"} ${index + 1}`));
      else Object.entries(value as Record<string, unknown>).forEach(([key, child]) => walk(child, path ? `${path} / ${key}` : key));
    };
    walk(report.metrics || {}, "");
    const quote = (value: string) => { const safe = /^[=+\-@]/.test(value) ? `'${value}` : value; return `"${safe.replace(/"/g, '""')}"`; };
    return Buffer.from(`\uFEFF${rows.map((row) => row.map((cell) => quote(cell)).join(",")).join("\r\n")}`, "utf8");
  }

  private createPdf(report: any) {
    type PdfLine = { text: string; style: "heading" | "body" | "bullet" };
    const ascii = (value: string) => value.normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/\*\*/g, "").trimEnd();
    const wrap = (text: string, width = 88) => { const words = ascii(text).split(/\s+/).filter(Boolean); const lines: string[] = []; let line = ""; for (const word of words) { if (`${line} ${word}`.trim().length > width && line) { lines.push(line); line = word; } else line = `${line} ${word}`.trim(); } return lines.length || line ? [...lines, ...(line ? [line] : [])] : [""]; };
    const content: PdfLine[] = [];
    for (const raw of String(report.body || "").split(/\r?\n/)) {
      const line = raw.trim(); if (!line) { content.push({ text: "", style: "body" }); continue; }
      const heading = /^#{1,3}\s+/.test(line); const bullet = /^[-*]\s+/.test(line);
      const text = line.replace(/^#{1,3}\s+/, "").replace(/^[-*]\s+/, "");
      wrap(text, heading ? 68 : bullet ? 82 : 88).forEach((part, index) => content.push({ text: `${bullet && index === 0 ? "- " : bullet ? "  " : ""}${part}`, style: heading ? "heading" : bullet ? "bullet" : "body" }));
    }
    const pages: PdfLine[][] = []; for (let index = 0; index < content.length; index += 32) pages.push(content.slice(index, index + 32)); if (!pages.length) pages.push([]);
    const objectCount = 5 + pages.length * 2; const objects = new Map<number, string>();
    objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
    const pageIds = pages.map((_, index) => 6 + index * 2);
    objects.set(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
    objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    objects.set(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    objects.set(5, `<< /Producer (Kivora Revenue Operations) /Title (${ascii(String(report.title || "Kivora report")).replace(/[()]/g, "")}) >>`);
    const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    pages.forEach((page, index) => {
      const pageId = pageIds[index]; const contentId = pageId + 1; const commands: string[] = ["q", "0.91 0.27 0.16 rg", "0 744 612 48 re f", "Q", `BT /F2 9 Tf 0.35 0.10 0.06 rg 50 718 Td (REVENUE OPERATIONS REPORT) Tj ET`, `BT /F2 15 Tf 1 1 1 rg 50 765 Td (${escape(ascii(String(report.title || "Kivora report")).slice(0, 72))}) Tj ET`, `BT /F1 8 Tf 0.38 0.40 0.44 rg 50 701 Td (${escape(`${String(report.type || "report").toUpperCase()}  |  ${String(report.currency || "USD")}  |  ${new Date(report.createdAt || Date.now()).toLocaleDateString("en-US")}`)}) Tj ET`];
      let y = 677;
      for (const line of page) { if (!line.text) { y -= 7; continue; } const heading = line.style === "heading"; commands.push(`BT /${heading ? "F2" : "F1"} ${heading ? 11 : 9} Tf ${heading ? "0.91 0.27 0.16" : "0.15 0.17 0.20"} rg 50 ${y} Td (${escape(line.text)}) Tj ET`); y -= heading ? 19 : 14; }
      commands.push("q", "0.88 0.89 0.91 RG", "50 38 m 562 38 l S", "Q", `BT /F1 8 Tf 0.42 0.44 0.48 rg 50 22 Td (Kivora - Live portfolio intelligence) Tj ET`, `BT /F1 8 Tf 0.42 0.44 0.48 rg 520 22 Td (${index + 1} / ${pages.length}) Tj ET`);
      const stream = commands.join("\n"); objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`); objects.set(contentId, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    });
    let pdf = "%PDF-1.4\n"; const offsets = [0]; for (let id = 1; id <= objectCount; id++) { offsets[id] = Buffer.byteLength(pdf); pdf += `${id} 0 obj\n${objects.get(id)}\nendobj\n`; } const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`; for (let id = 1; id <= objectCount; id++) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`; pdf += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF`; return Buffer.from(pdf, "binary");
  }

  private total(data: RecommendationResponse) { return (data.data ?? []).slice(0, 30).reduce((sum, item) => sum + (Number(item.price) || 0), 0); }
  private average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
  private findNumbers(value: unknown, key: string): number[] { const output: number[] = []; const walk = (current: unknown) => { if (Array.isArray(current)) current.forEach(walk); else if (current && typeof current === "object") for (const [name, child] of Object.entries(current)) { if (name.toLowerCase().includes(key) && typeof child === "number") output.push(child); walk(child); } }; walk(value); return output; }
}
