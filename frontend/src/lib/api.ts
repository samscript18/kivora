import axios from "axios";
import type {
  ActivityEntry,
  AskResult,
  Capabilities,
  DashboardData,
  Incident,
  MarketSignal,
  Opportunity,
  OwnerBrief,
  AuthUser,
  OrganizationSummary,
  PortfolioData,
  PreviewResult,
  Report,
  ReportType,
  ResolveResult,
  SegmentsData,
  StrategiesData,
  TelegramLinkResult,
  TelegramStatus,
  UnderwriteResult,
  WheelhouseConnection,
  OrganizationMembers,
  OrganizationRole,
  WorkItem,
  ManagedPortfolio,
  AssistantMessage,
  ListingWorkspace,
  NotificationItem,
} from "@/types/api";

// ─── Query keys ──────────────────────────────────────────────────────────────
export const QUERY_KEYS = {
  dashboard: ["dashboard"] as const,
  capabilities: ["capabilities"] as const,
  portfolio: ["portfolio"] as const,
  incidents: ["incidents"] as const,
  opportunities: ["opportunities"] as const,
  marketIntelligence: ["market-intelligence"] as const,
  segments: ["segments"] as const,
  activity: ["activity"] as const,
  reports: ["reports"] as const,
  briefs: ["briefs"] as const,
  telegramStatus: ["telegram-status"] as const,
  organizations: ["organizations"] as const,
  wheelhouseConnections: ["wheelhouse-connections"] as const,
  members: ["organization-members"] as const,
  assistantHistory: ["assistant-history"] as const,
  notifications: ["notifications"] as const,
  strategies: (listingId: string) => ["strategies", listingId] as const,
  listingWorkspace: (listingId: string) => ["listing-workspace", listingId] as const,
} as const;

// ─── Envelope ────────────────────────────────────────────────────────────────
type Envelope<T> = { success: true; data: T };
type ErrorEnvelope = {
  success: false;
  code?: string;
  message?: string;
  details?: unknown;
  requestId?: string;
};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

// ─── Axios instance ───────────────────────────────────────────────────────────
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api",
  timeout: 20_000,
});

let accessTokenProvider: null | (() => Promise<string | null>) = null;
let organizationIdProvider: null | (() => string | null) = null;

export const setAccessTokenProvider = (
  provider: typeof accessTokenProvider,
) => {
  accessTokenProvider = provider;
};

export const setOrganizationIdProvider = (provider: typeof organizationIdProvider) => {
  organizationIdProvider = provider;
};

api.interceptors.request.use(async (config) => {
  const token = await accessTokenProvider?.();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const organizationId = organizationIdProvider?.();
  if (organizationId) config.headers["X-Kivora-Organization-Id"] = organizationId;
  return config;
});

const unwrap = async <T>(request: Promise<{ data: Envelope<T> }>) => {
  try {
    return (await request).data.data;
  } catch (error) {
    if (axios.isAxiosError<ErrorEnvelope>(error)) {
      const payload = error.response?.data;
      throw new ApiRequestError(
        payload?.message || "The request could not be completed.",
        payload?.code,
        error.response?.status,
        payload?.details,
        payload?.requestId,
      );
    }
    throw error;
  }
};

type ActivityWire = Partial<ActivityEntry> & {
  title?: string;
  meta?: string;
  time?: string;
};

const normalizeActivity = (item: ActivityWire, index: number): ActivityEntry => {
  const action = item.action || item.title || "portfolio_check_completed";
  const createdAt = item.createdAt || item.time || new Date().toISOString();
  return {
    ...item,
    _id: item._id || `${action}-${createdAt}-${index}`,
    action,
    actor: item.actor || item.meta || "Kivora automation",
    createdAt,
  };
};

// ─── API functions ────────────────────────────────────────────────────────────
export const getDashboard = async () => {
  const data = await unwrap(api.get<Envelope<DashboardData>>("/dashboard", { timeout: 120_000 }));
  return {
    ...data,
    activity: (data.activity as ActivityWire[]).map(normalizeActivity),
  };
};

export const getPortfolio = () =>
  unwrap(api.get<Envelope<PortfolioData>>("/portfolio", { timeout: 120_000 }));
export const getListingWorkspace=(id:string)=>unwrap(api.get<Envelope<ListingWorkspace>>(`/listings/${encodeURIComponent(id)}/workspace`, { timeout: 120_000 }));
export const getIntegrationSettings=()=>unwrap(api.get<Envelope<Array<Record<string,any>>>>("/integration-settings"));
export const updateIntegrationSettings=(provider:string,input:Record<string,unknown>)=>unwrap(api.patch<Envelope<Record<string,any>>>(`/integration-settings/${provider}`,input));
export const testIntegrationSettings=(provider:string)=>unwrap(api.post<Envelope<Record<string,any>>>(`/integration-settings/${provider}/test`));
export const revokeIntegrationCredential=(provider:string)=>unwrap(api.delete<Envelope<Record<string,any>>>(`/integration-settings/${provider}/credential`));
export const getNotificationPreferences=()=>unwrap(api.get<Envelope<Record<string,any>>>("/integration-settings/notifications/preferences"));
export const saveNotificationPreferences=(scope:"organization"|"user"|"portfolio",input:Record<string,unknown>)=>unwrap(api.patch<Envelope<Record<string,any>>>(`/integration-settings/notifications/preferences/${scope}`,input));

export const enableMarketIntelligence = () => Promise.all([
  updateIntegrationSettings("ticketmaster", { enabled: true, credentialMode: "platform", settings: {} }),
  updateIntegrationSettings("openweather", { enabled: true, credentialMode: "platform", settings: {} }),
]);

export const getIncidents = () =>
  unwrap(api.get<Envelope<Incident[]>>("/incidents"));

export const getOpportunities = () =>
  unwrap(api.get<Envelope<Opportunity[]>>("/opportunities"));

export const getBriefs = () =>
  unwrap(api.get<Envelope<OwnerBrief[]>>("/owner-briefs"));

export const getCapabilities = () =>
  unwrap(api.get<Envelope<Capabilities>>("/capabilities"));
export const getNotifications = () => unwrap(api.get<Envelope<NotificationItem[]>>("/notifications"));
export const readNotification = (id:string) => unwrap(api.post<Envelope<NotificationItem>>(`/notifications/${encodeURIComponent(id)}/read`));

export const previewIncident = (id: string) =>
  unwrap(api.post<Envelope<PreviewResult>>(`/incidents/${id}/preview`));

export const resolveIncident = (id: string) =>
  unwrap(api.post<Envelope<ResolveResult>>(`/incidents/${id}/resolve`));

export const underwriteProperty = (input: {
  address: string;
  marketId: number;
  acquisitionCost: number;
  annualExpenses: number;
}) => unwrap(api.post<Envelope<UnderwriteResult>>("/underwrite", input));

export const sendBrief = (id: string) =>
  unwrap(api.post<Envelope<{ ok: true }>>(`/owner-briefs/${id}/send`));

export const getTelegramStatus = () =>
  unwrap(api.get<Envelope<TelegramStatus>>("/telegram/status"));

export const createTelegramLink = () =>
  unwrap(api.post<Envelope<TelegramLinkResult>>("/telegram/link"));

export const disconnectTelegram = () =>
  unwrap(
    api.delete<Envelope<{ connected: false }>>("/telegram/connection"),
  );

export const syncUser = (profile: { email?: string; name?: string }) =>
  unwrap(api.post<Envelope<AuthUser>>("/auth/sync", profile));

export const getOrganizations = () =>
  unwrap(api.get<Envelope<OrganizationSummary[]>>("/auth/organizations"));

export const createOrganization = (input: { name: string; defaultCurrency?: string; defaultTimezone?: string }) =>
  unwrap(api.post<Envelope<OrganizationSummary>>("/auth/organizations", input));
export const updateOrganization = (input: { name?: string; defaultCurrency?: string; defaultTimezone?: string }) =>
  unwrap(api.patch<Envelope<OrganizationSummary>>("/auth/organizations/current", input));
export const setDefaultOrganization = () => unwrap(api.post<Envelope<{ organizationId: string; default: true }>>("/auth/organizations/current/default"));
export const getOrganizationMembers = () => unwrap(api.get<Envelope<OrganizationMembers>>("/auth/organizations/current/members"));
export const inviteOrganizationMember = (input: { email: string; role: Exclude<OrganizationRole, "owner"> }) => unwrap(api.post<Envelope<{ id: string; email: string; role: OrganizationRole; status: "sent"; expiresAt: string }>>("/auth/organizations/current/invitations", input));
export const acceptOrganizationInvitation = (token: string) => unwrap(api.post<Envelope<{ organizationId: string; role: OrganizationRole; status: "active" }>>("/auth/invitations/accept", { token }));
export const revokeOrganizationInvitation = (id: string) => unwrap(api.delete<Envelope<{ id: string; status: "revoked" }>>(`/auth/organizations/current/invitations/${id}`));
export const updateOrganizationMember = (id: string, input: { role?: Exclude<OrganizationRole, "owner">; status?: "active" | "suspended" | "removed" }) => unwrap(api.patch<Envelope<unknown>>(`/auth/organizations/current/members/${id}`, input));

export const getWheelhouseConnections = () => unwrap(api.get<Envelope<WheelhouseConnection[]>>("/wheelhouse-connections"));
export const createWheelhouseConnection = (input: { displayName: string; credential: string }) => unwrap(api.post<Envelope<WheelhouseConnection>>("/wheelhouse-connections", input));
export const testWheelhouseConnection = (id: string) => unwrap(api.post<Envelope<{ connected: true; listingCount: number; capabilities: Record<string, unknown> }>>(`/wheelhouse-connections/${id}/test`));
export const replaceWheelhouseCredential = (id: string, credential: string) => unwrap(api.patch<Envelope<WheelhouseConnection>>(`/wheelhouse-connections/${id}/credential`, { credential }));
export const revokeWheelhouseConnection = (id: string) => unwrap(api.delete<Envelope<{ id: string; status: "revoked" }>>(`/wheelhouse-connections/${id}`));
export const getManagedPortfolios = () => unwrap(api.get<Envelope<ManagedPortfolio[]>>("/portfolios"));
export const createManagedPortfolio = (input: { connectionId: string; name: string; description?: string; defaultCurrency?: string; timezone?: string }) => unwrap(api.post<Envelope<ManagedPortfolio>>("/portfolios", input));
export const archiveManagedPortfolio = (id: string) => unwrap(api.delete<Envelope<unknown>>(`/portfolios/${id}`));
export const moveListingMapping = (mappingId: string, portfolioId: string) => unwrap(api.post<Envelope<unknown>>(`/portfolios/listings/${mappingId}/move`, { portfolioId }));

export const connectTelegram = (intent: string, signature: string) =>
  unwrap(api.post<Envelope<{ connected: true }>>("/telegram/connect", { intent, signature }));

export const getMarketIntelligence = () =>
  unwrap(api.get<Envelope<MarketSignal[]>>("/market-intelligence"));

export const refreshMarketIntelligence = () =>
  unwrap(api.post<Envelope<{ source: string; clusters: number; events: number; weather: number; errors: Array<{ provider: string; location: string; message: string }> }>>("/market-intelligence/refresh", undefined, { timeout: 120_000 }));

export const getStrategies = (listingId: string) =>
  unwrap(
    api.get<Envelope<StrategiesData>>(
      `/listings/${encodeURIComponent(listingId)}/strategies`,
    ),
  );

export const applyStrategy = (listingId: string, strategy: string) =>
  unwrap(
    api.post<Envelope<{ strategy: string; applied: boolean }>>(
      `/listings/${encodeURIComponent(listingId)}/strategies/apply`,
      { strategy },
    ),
  );

export const getReports = () =>
  unwrap(api.get<Envelope<Report[]>>("/reports"));

export const downloadReport = async (id: string, format: "pdf" | "csv") => {
  const response = await api.get<Blob>(`/reports/${id}/export/${format}`, { responseType: "blob" });
  const disposition = String(response.headers["content-disposition"] || "");
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] || `kivora-report.${format}`;
  const url = URL.createObjectURL(response.data); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
};
export const finalizeReport = (id: string) => unwrap(api.post<Envelope<Report>>(`/reports/${id}/finalize`));
export const deliverReport = (id: string) => unwrap(api.post<Envelope<unknown>>(`/reports/${id}/deliver`));
export const editReport = (id: string, body: string) => unwrap(api.post<Envelope<Report>>(`/reports/${id}/edit`, { body }));

export const generateExecutiveReport = () =>
  unwrap(api.post<Envelope<Report>>("/reports/executive"));

export const generateReport = (input: {
  type: ReportType;
  listingId?: string;
}) => unwrap(api.post<Envelope<Report>>("/reports/generate", input));

export const getActivity = async () => {
  const data = await unwrap(api.get<Envelope<ActivityEntry[]>>("/activity"));
  return (data as ActivityWire[]).map(normalizeActivity);
};

export const askKivora = (question: string) =>
  unwrap(
    api.post<Envelope<AskResult>>("/assistant/ask", { question }),
  );
export const getAssistantHistory = () => unwrap(api.get<Envelope<AssistantMessage[]>>("/assistant/history"));
export const clearAssistantHistory = () => unwrap(api.delete<Envelope<{ cleared: number }>>("/assistant/history"));

export const getSegments = () =>
  unwrap(api.get<Envelope<SegmentsData>>("/segments"));

export const getWorkItem = (kind: "incident" | "opportunity", id: string) =>
  unwrap(api.get<Envelope<WorkItem>>(`/work-items/${kind}/${id}`));
export const decideRecommendation = (id: string, decision: string, reason?: string, until?: string) =>
  unwrap(api.post<Envelope<unknown>>(`/recommendations/${id}/decision`, { decision, reason, until }));
export const simulateRecommendation = (id: string) =>
  unwrap(api.post<Envelope<StrategiesData>>(`/recommendations/${id}/simulations`));
export const executeRecommendation = (id: string, simulationId: string) =>
  unwrap(api.post<Envelope<Record<string, unknown>>>(`/recommendations/${id}/execute`, { simulationId }));
export const scheduleRecommendation = (id: string, executeAt: string, reason?: string, simulationId?: string) =>
  unwrap(api.post<Envelope<unknown>>(`/recommendations/${id}/schedule`, { executeAt, reason, simulationId }));
export const assignWorkItem = (kind: "incident" | "opportunity", id: string, userId?: string) =>
  unwrap(api.post<Envelope<unknown>>(`/work-items/${kind}/${id}/assign`, { userId }));
export const commentOnWorkItem = (kind: "incident" | "opportunity", id: string, body: string) =>
  unwrap(api.post<Envelope<unknown>>(`/work-items/${kind}/${id}/comments`, { body }));
export const revertRevenueAction = (id: string) => unwrap(api.post<Envelope<Record<string, unknown>>>(`/revenue-actions/${id}/revert`));
