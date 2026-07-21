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
  strategies: (listingId: string) => ["strategies", listingId] as const,
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
  const data = await unwrap(api.get<Envelope<DashboardData>>("/dashboard"));
  return {
    ...data,
    activity: (data.activity as ActivityWire[]).map(normalizeActivity),
  };
};

export const getPortfolio = () =>
  unwrap(api.get<Envelope<PortfolioData>>("/portfolio"));

export const getIncidents = () =>
  unwrap(api.get<Envelope<Incident[]>>("/incidents"));

export const getOpportunities = () =>
  unwrap(api.get<Envelope<Opportunity[]>>("/opportunities"));

export const getBriefs = () =>
  unwrap(api.get<Envelope<OwnerBrief[]>>("/owner-briefs"));

export const getCapabilities = () =>
  unwrap(api.get<Envelope<Capabilities>>("/capabilities"));

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

export const connectTelegram = (intent: string, signature: string) =>
  unwrap(api.post<Envelope<{ connected: true }>>("/telegram/connect", { intent, signature }));

export const getMarketIntelligence = () =>
  unwrap(api.get<Envelope<MarketSignal[]>>("/market-intelligence"));

export const refreshMarketIntelligence = () =>
  unwrap(api.post<Envelope<{ refreshed: true }>>("/market-intelligence/refresh"));

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

export const getSegments = () =>
  unwrap(api.get<Envelope<SegmentsData>>("/segments"));
