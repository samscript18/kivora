import axios from "axios";

export type DashboardData = {
	source: string;
	capabilities: any;
	summary: { health: number; revenue: number; atRisk: number; opportunities: number; occupancy: number };
	trend: Array<{ day: string; revenue: number; market?: number }>;
	incident: any | null;
	opportunities: any[];
	activity: any[];
};

type Envelope<T> = { success: true; data: T };
export const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api", timeout: 20_000 });
let accessTokenProvider: null | (() => Promise<string | null>) = null;
export const setAccessTokenProvider = (provider: typeof accessTokenProvider) => {
	accessTokenProvider = provider;
};
api.interceptors.request.use(async (config) => {
	const token = await accessTokenProvider?.();
	if (token) config.headers.Authorization = `Bearer ${token}`;
	return config;
});
const unwrap = async <T>(request: Promise<{ data: Envelope<T> }>) => (await request).data.data;

export const getDashboard = () => unwrap(api.get<Envelope<DashboardData>>("/dashboard"));
export const getIncidents = () => unwrap(api.get<Envelope<any[]>>("/incidents"));
export const getPortfolio = () => unwrap(api.get<Envelope<{ source: string; listings: any[] }>>("/portfolio"));
export const getOpportunities = () => unwrap(api.get<Envelope<any[]>>("/opportunities"));
export const getBriefs = () => unwrap(api.get<Envelope<any[]>>("/owner-briefs"));
export const getCapabilities = () => unwrap(api.get<Envelope<any>>("/capabilities"));
export const previewIncident = (id: string) => unwrap(api.post<Envelope<any>>(`/incidents/${id}/preview`));
export const resolveIncident = (id: string) => unwrap(api.post<Envelope<any>>(`/incidents/${id}/resolve`, { approvedBy: "Revenue manager" }));
export const underwriteProperty = (input: { address: string; marketId: number; acquisitionCost: number; annualExpenses: number }) => unwrap(api.post<Envelope<any>>("/underwrite", input));
export const sendBrief = (id: string) => unwrap(api.post<Envelope<any>>(`/owner-briefs/${id}/send`));
export const getTelegramStatus = () => unwrap(api.get<Envelope<{ botConfigured: boolean; connected: boolean; connection: { username?: string; firstName?: string; chatType?: string; linkedAt?: string } | null }>>("/telegram/status"));
export const createTelegramLink = () => unwrap(api.post<Envelope<{ url: string; botUsername: string; expiresAt: string }>>("/telegram/link"));
export const disconnectTelegram = () => unwrap(api.delete<Envelope<{ connected: false }>>("/telegram/connection"));
export const syncUser = (profile: { email?: string; name?: string }) => unwrap(api.post<Envelope<any>>("/auth/sync", profile));
export const connectTelegram = (intent: string, signature: string) => unwrap(api.post<Envelope<any>>("/telegram/connect", { intent, signature }));
