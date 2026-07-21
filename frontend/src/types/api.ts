// ─── Core envelope ───────────────────────────────────────────────────────────
export type Envelope<T> = { success: true; data: T };

// ─── Shared primitives ───────────────────────────────────────────────────────
export type IncidentSeverity = "critical" | "high" | "medium" | "low";
export type OpportunityStatus =
  | "open"
  | "under_review"
  | "awaiting_approval"
  | "scheduled"
  | "applied"
  | "dismissed"
  | "expired"
  | "failed";
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

// ─── Listing ─────────────────────────────────────────────────────────────────
export interface ListingLocation {
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  lat?: number;
  lng?: number;
}

export interface ListingMetrics {
  health: number;
  revenue: number;
  occupancy: number;
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
  propertyType?: string;
  lastSynced?: string;
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
  demandDirection?: "up" | "down" | "neutral";
  startDate?: string;
  endDate?: string;
  severity?: string;
  source?: string;
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
