// ─── Core envelope ───────────────────────────────────────────────────────────
export type Envelope<T> = { success: true; data: T };

// ─── Shared primitives ───────────────────────────────────────────────────────
export type IncidentSeverity = "critical" | "high" | "medium" | "low";
export type OpportunityStatus = string;
export type RecommendationLifecycleStatus = "DRAFT" | "READY" | "REVIEWED" | "APPROVED" | "SCHEDULED" | "EXECUTING" | "APPLIED" | "VERIFYING" | "VERIFIED" | "MEASURING" | "COMPLETED" | "IGNORED" | "DISMISSED" | "EXPIRED" | "CANCELLED" | "FAILED" | "PARTIALLY_APPLIED" | "REVERTED" | "ROLLBACK_FAILED";
export type ActionStatus =
  | "suggested"
  | "awaiting_approval"
  | "scheduled"
  | "applying"
  | "applied"
  | "failed"
  | "dismissed"
  | "reverted";
export type ReportStatus = "draft" | "generating" | "ready" | "failed" | "shared" | "archived";
export type ReportType = "executive" | "portfolio" | "owner" | "revenue";
export type SignalKind = "event" | "weather";
export type StrategyKey = "conservative" | "balanced" | "aggressive";

export type OrganizationRole = "owner" | "administrator" | "revenue_manager" | "analyst" | "viewer";
export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
  defaultCurrency?: string;
  defaultTimezone: string;
}
export interface AuthUser {
  id: string;
  name: string;
  email?: string;
  organizationId: string;
  organizationRole: OrganizationRole;
}
export interface WheelhouseConnection {
  id: string;
  displayName: string;
  status: "connected" | "degraded" | "revoked" | "reauthorization_required";
  readCapability: boolean;
  writeCapability: boolean;
  supportedMutationTypes: string[];
  lastSuccessfulSynchronization?: string;
  lastFailedSynchronization?: string;
  lastError?: string;
  capabilities?: Record<string, unknown>;
}
export interface ManagedPortfolio { id: string; connectionId: string; name: string; description?: string; defaultCurrency: string; timezone: string; status: string; listingCount?: number; }
export interface OrganizationMember {
  id: string;
  userId: string;
  role: OrganizationRole;
  status: "active" | "suspended" | "removed";
  joinedAt?: string;
  user?: { name: string; email?: string; timezone?: string };
}
export interface OrganizationInvitation { id: string; email: string; role: OrganizationRole; status: string; expiresAt: string; }
export interface OrganizationMembers { members: OrganizationMember[]; invitations: OrganizationInvitation[]; }

// ─── Listing ─────────────────────────────────────────────────────────────────
export interface ListingLocation {
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
}

export interface ListingMetrics {
  health: number;
  revenue: number;
  occupancy: number;
  forwardOccupancy?: number;
  adr: number;
  revpar: number;
  pickup?: string;
  dynamicPricingEnabled: boolean;
  revenueAtRisk?: number;
  openOpportunities?: number;
}

export interface Listing {
  id: string;
  nickname?: string;
  title?: string;
  channel?: string;
  location?: ListingLocation;
  metrics?: ListingMetrics;
  thumbnail?: string;
  bedrooms?: number;
  beds?: number;
  bathrooms?: number;
  propertyType?: string;
  roomType?: string;
  currency?: string;
  ownerName?: string;
  starRating?: number;
  reviewCount?: number;
  photoCount?: number;
  minimumStay?: number;
  amenities?: string[];
  lastSynced?: string;
}

export interface WheelhouseMonthlyKpi {
  month: string;
  adr?: number;
  lead_time?: number;
  occupancy?: number;
  occupancy_adjusted?: number;
  revpar?: number;
  revenue?: number;
  los?: number;
  comp_set_adr?: number;
  comp_set_lead_time?: number;
  comp_set_occupancy?: number;
  comp_set_revpar?: number;
  comp_set_revenue?: number;
  comp_set_los?: number;
}

export interface WheelhouseReservation {
  id: string;
  status?: string;
  start_date: string;
  end_date: string;
  booked_at?: string;
  num_guests?: number;
  currency?: string;
  total_price?: number;
  nightly_subtotal?: number;
  confirmation_code?: string;
  source_name?: string;
}

export interface ListingWorkspace {
  listing: Record<string, any> & {
    id: string;
    name: string;
    channel: string;
    currency?: string;
    flags?: Array<{ name: string; description?: string }>;
    portfolio?: { id: string; name: string; timezone?: string; currency?: string } | null;
    connection?: { id: string; displayName: string; status: string; readCapability?: boolean; writeCapability?: boolean };
  };
  performance: {
    current: Record<string, any> | null;
    history: Array<Record<string, any>>;
    rolling?: Record<string, Record<string, number> | number | null> | null;
    monthly?: { currency?: string; data: WheelhouseMonthlyKpi[] } | null;
  };
  pricing: Record<string, any> & {
    pricingTier?: { name: string; horizon: number } | null;
    neighborhood?: { currency?: string; data: Array<{ stay_date: string; median_price: number; low_price: number; high_price: number; listings_count: number }> } | null;
    neighborhoodOccupancy?: { data: Array<{ stay_date: string; occupancy: number; adjusted_occupancy: number; expected_bookings: number; observed_bookings: number }> } | null;
    basePriceHistory?: Array<Record<string, any>> | null;
    monthlySeasonality?: Record<"CON" | "REC" | "AGG", Record<string, number>> | null;
  };
  intelligence: Record<string, Array<Record<string, any>>>;
  operations: Record<string, Array<Record<string, any>>> & { reservations: WheelhouseReservation[] };
  capabilities: Record<string, any>;
  liveData?: { fetchedAt: string; available: string[]; unavailable: string[]; reservationWindow: { startDate: string; endDate: string } };
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export interface DashboardSummary {
  health: number;
  revenue: number;
  atRisk: number;
  opportunities: number;
  occupancy: number;
  criticalIncidents: number;
  marketSignals: number;
  projectedOpportunity?: number;
  activeRecommendations?: number;
  awaitingApproval?: number;
  scheduledActions?: number;
  verificationFailures?: number;
  revenueProtected?: number;
  realizedRevenue?: number;
  timeSavedMinutes?: number;
  healthDetails?: Record<string, unknown>;
}

export interface RevenueTrend {
  day: string;
  revenue: number;
  market?: number;
}

export interface Priority {
  id: string;
  rank: number;
  title: string;
  property: string;
  action: string;
  impact: number;
  confidence: number;
  type?: string;
  kind?: "incident" | "opportunity" | "event" | "weather";
  severity?: IncidentSeverity;
  forecastPeriod?: string;
  cause?: string;
  canPreview?: boolean;
}

export interface OpportunitySummary {
  property: string;
  action: string;
  impact: number;
  confidence: number;
  tag?: string;
  id?: string;
  canPreview?: boolean;
}

export interface ActivityEntry {
  _id: string;
  action: string;
  actor?: string;
  source?: string;
  resource?: string;
  createdAt: string;
  result?: string;
}

export interface NotificationItem {
  id?: string;
  _id?: string;
  type: string;
  title?: string;
  message?: string;
  severity?: string;
  status: string;
  readAt?: string;
  createdAt?: string;
  deliveredAt?: string;
  metadata?: Record<string, unknown>;
}

export interface DashboardData {
  source: string;
  capabilities: Capabilities;
  summary: DashboardSummary;
  trend: RevenueTrend[];
  incident: Incident | null;
  opportunities: OpportunitySummary[];
  activity: ActivityEntry[];
  priorities: Priority[];
  signals: MarketSignal[];
}

// ─── Incident ────────────────────────────────────────────────────────────────
export interface IncidentFactor {
  label: string;
  value: string;
  note?: string;
}

export interface Incident {
  id: string;
  title: string;
  listing: string;
  listingId?: string;
  location?: string;
  severity?: IncidentSeverity;
  currentRate: number;
  recommendedRate: number;
  revenueAtRisk: number;
  detectedAt: string;
  cause?: string;
  explanation?: string;
  confidence?: number;
  factors: IncidentFactor[];
  canPreview?: boolean;
  status?: string;
}

// ─── Opportunity ─────────────────────────────────────────────────────────────
export interface Opportunity {
  id: string;
  property: string;
  listingId?: string;
  action: string;
  impact: number;
  confidence: number;
  tag?: string;
  canPreview?: boolean;
  status?: OpportunityStatus;
  opportunityStatus?: string;
  lifecycleStatus?: RecommendationLifecycleStatus | string;
  category?: string;
  discoveredAt?: string;
  expiresAt?: string;
  currentState?: string;
  proposedState?: string;
  evidence?: string;
  affectedListings?: number;
}

// ─── Market intelligence ─────────────────────────────────────────────────────
export interface MarketSignal {
  externalId: string;
  kind: SignalKind;
  title: string;
  location?: string;
  description?: string;
  confidence: number;
  affectedListings: number;
  listingIds?: string[];
  demandDirection?: "up" | "down" | "neutral";
  startDate?: string;
  endDate?: string;
  severity?: string;
  source?: string;
  sourceUrl?: string;
  evidence?: Record<string, unknown>;
}

// ─── Strategy simulator ──────────────────────────────────────────────────────
export interface Strategy {
  key: StrategyKey;
  label: string;
  available: boolean;
  projectedRevenue: number;
  estimatedUplift: number;
  reason?: string;
  projectedOccupancy?: number;
  projectedAdr?: number;
  projectedRevpar?: number;
}

export interface StrategiesData {
  listingId: string;
  listing?: string;
  strategies: Strategy[];
}

export interface Recommendation {
  id?: string; _id: string; title: string; explanation: string; proposedAction: string;
  estimatedImpact: number; currency: string; confidence: number; risks?: string;
  status: string; expiresAt: string; affectedDates?: string[]; impactCalculation?: Record<string, unknown>;
}
export interface PersistedSimulation {
  id?: string; _id?: string; selectedStrategy: string; baselineState: Record<string, unknown>;
  previewResponse: Record<string, unknown>; calculatedProjections: Record<string, unknown>; expiresAt: string;
}
export interface WorkItem {
  kind: "incident" | "opportunity"; entity: Record<string, any>; recommendation: Recommendation | null;
  simulations: PersistedSimulation[]; actions: Array<Record<string, any>>; outcomes: Array<Record<string, any>>;
  selectedSimulation?: PersistedSimulation | null; intendedStrategy?: string;
  activity: ActivityEntry[]; comments: Array<Record<string, any>>; signals: Array<Record<string, any>>;
  capabilities?: {canApprove:boolean;canExecute:boolean;simulationFresh:boolean;recommendationFresh:boolean;writeAccess:string};
}

// ─── Reports ─────────────────────────────────────────────────────────────────
export interface Report {
  _id: string;
  title: string;
  type: ReportType;
  status: ReportStatus;
  body: string;
  listingId?: string;
  createdAt?: string;
  generatedBy?: string;
  currency?: string;
  timezone?: string;
}

// ─── Owner briefs ────────────────────────────────────────────────────────────
export interface OwnerBrief {
  _id: string;
  owner?: string;
  listingId?: string;
  subject: string;
  body: string;
  status: "pending" | "sent" | "failed";
  createdAt?: string;
}

// ─── Portfolio / segments ────────────────────────────────────────────────────
export interface PortfolioData {
  source: string;
  listings: Listing[];
}

export interface PortfolioSegment {
  id: string | number;
  name?: string;
  description?: string;
  type?: string;
  listingCount?: number;
  markets?: string[];
}

export interface SegmentsData {
  source: string;
  segments: PortfolioSegment[];
}

// ─── Telegram ────────────────────────────────────────────────────────────────
export interface TelegramConnection {
  username?: string;
  firstName?: string;
  chatType?: string;
  linkedAt?: string;
}

export interface TelegramStatus {
  botConfigured: boolean;
  connected: boolean;
  connection: TelegramConnection | null;
}

export interface TelegramLinkResult {
  url: string;
  botUsername: string;
  expiresAt: string;
}

// ─── Incident actions ────────────────────────────────────────────────────────
export interface PreviewResult {
  projectedRecovery: number;
  currentRevenue: number;
  optimizedRevenue: number;
}

export interface ResolveResult {
  recovered: number;
  status: string;
}

// ─── Underwrite ──────────────────────────────────────────────────────────────
export interface UnderwriteResult {
  annualRevenue: number;
  netOperatingIncome: number;
  occupancy: number;
  cashOnCashRoi: number;
}

// ─── AI assistant ────────────────────────────────────────────────────────────
export interface AskResult {
  body: string;
  generatedBy: string;
  grounded: boolean;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  grounded: boolean;
}

// ─── Capabilities ────────────────────────────────────────────────────────────
export interface Capabilities {
  wheelhouse: {
    configured: boolean;
    connected: boolean;
    status: string;
    writeActions: boolean;
    writeAccess: "read_only" | "unverified" | "verified";
    lastError?: number | null;
  };
  permissions?: { canManageOrganization: boolean; canManageRevenue: boolean; canAnalyze: boolean };
  marketIntelligence?: {
    ticketmaster: { configured: boolean; mode: "live" | "disabled" };
    openweather: { configured: boolean; mode: "live" | "disabled" };
  };
  telegram?: Record<string, unknown>;
  ai?: Record<string, unknown>;
  database?: Record<string, unknown>;
  lastScan?: string | null;
  lastIntelligenceRefresh?: string | null;
}
