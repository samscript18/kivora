import { HttpService } from "@nestjs/axios";
import { HttpException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";

export interface WheelhouseListing {
  id: string; channel: string; title?: string; nickname?: string; currency?: string;
  market_id?: number; owner_name?: string; is_active?: boolean; number_of_active_units?: number | null;
  location?: { address?: string; country?: string; latitude?: number; longitude?: number };
}
export interface PriceRecommendation { stay_date: string; price: number; currency?: string; custom_type?: string | null; attr_local_demand?: number; attr_occupancy_pacing?: number; }
export interface RecommendationResponse { data: PriceRecommendation[]; base_price?: number; base_price_recommended?: number; automatic_rate_posting_enabled?: boolean; }
export type Preferences = Record<string, unknown> & { base_price?: number | null; base_price_adjustment?: number | null; automatic_rate_posting_enabled?: boolean };

@Injectable()
export class WheelhouseService {
  private readonly base: string;
  private readonly key?: string;
  private verified=false;
  private lastError?:number;
  constructor(private readonly http: HttpService, config: ConfigService) {
    this.base = config.get("WHEELHOUSE_BASE_URL", "https://api.usewheelhouse.com/ss_api/v1");
    this.key = config.get("WHEELHOUSE_API_KEY");
  }
  get configured() { return Boolean(this.key); }

  private async request<T>(method: "GET" | "POST" | "PUT", path: string, data?: unknown): Promise<T> {
    if (!this.key) throw new ServiceUnavailableException("Wheelhouse key is not configured");
    let lastError: AxiosError | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await firstValueFrom(this.http.request<T>({ method, url: `${this.base}${path}`, data, headers: { "X-Integration-Api-Key": this.key } }));
        this.verified=true;this.lastError=undefined;return response.data;
      } catch (error) {
        lastError = error as AxiosError;
        const status = lastError.response?.status;
        if (![409, 423, 429].includes(status ?? 0) || attempt === 3) break;
        await new Promise(resolve => setTimeout(resolve, Math.min(8000, 1000 * 2 ** attempt + Math.random() * 250)));
      }
    }
    const status = lastError?.response?.status ?? 502;this.verified=false;this.lastError=status;
    const upstream = lastError?.response?.data;
    throw new HttpException({ code: "WHEELHOUSE_REQUEST_FAILED", message: "Wheelhouse request failed", upstreamStatus: status, details: upstream }, status);
  }

  async listings() {
    const all: WheelhouseListing[] = [];
    for (let page = 1; page <= 20; page++) {
      const batch = await this.request<WheelhouseListing[]>("GET", `/listings?exclude_inactive=true&include_managed_listings=true&per_page=100&page=${page}`);
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  }
  recommendations(id: string, channel: string) { return this.request<RecommendationResponse>("GET", `/listings/${encodeURIComponent(id)}/price_recommendations?channel=${encodeURIComponent(channel)}`); }
  preferences(id: string, channel: string) { return this.request<Preferences>("GET", `/preferences/${encodeURIComponent(id)}?channel=${encodeURIComponent(channel)}`); }
  kpis(id: string, channel: string) { return this.request<Record<string, unknown>>("GET", `/listings/${encodeURIComponent(id)}/kpis?channel=${encodeURIComponent(channel)}`); }
  neighborhoodPricing(id: string, channel: string) { return this.request<{data:Array<{stay_date:string;median_price:number;low_price:number;high_price:number;listings_count:number}>;currency:string}>("GET", `/listings/${encodeURIComponent(id)}/neighborhood/pricing?channel=${encodeURIComponent(channel)}`); }
  neighborhoodOccupancy(id: string, channel: string) { return this.request<{data:Array<{stay_date:string;occupancy:number;adjusted_occupancy:number;expected_bookings:number;observed_bookings:number}>}>("GET", `/listings/${encodeURIComponent(id)}/neighborhood/occupancy?channel=${encodeURIComponent(channel)}`); }
  changelog(id: string, channel: string) { return this.request<unknown[]>("GET", `/preferences/${encodeURIComponent(id)}/changelog?channel=${encodeURIComponent(channel)}`); }
  preview(id: string, channel: string, preferences: Preferences) { return this.request<RecommendationResponse>("POST", `/preferences/${encodeURIComponent(id)}/preview?channel=${encodeURIComponent(channel)}`, preferences); }
  updatePreferences(id: string, channel: string, preferences: Preferences) { return this.request<unknown>("PUT", `/preferences/${encodeURIComponent(id)}?channel=${encodeURIComponent(channel)}`, preferences); }
  enableAutomaticPosting(id: string, channel: string) { return this.request<void>("PUT", `/preferences/${encodeURIComponent(id)}/automatic_rate_posting?channel=${encodeURIComponent(channel)}`, { enabled: true }); }
  sync(id: string, channel: string) { return this.request<unknown>("POST", `/listings/${encodeURIComponent(id)}/sync?channel=${encodeURIComponent(channel)}`); }
  marketTimeSeries(marketId: number) { return this.request<unknown>("GET", `/market_report/${marketId}/time_series`); }
  capabilities() { return { configured:this.configured,connected:this.verified,status:!this.configured?"not_configured":this.verified?"verified":"unverified_or_error",lastError:this.lastError??null,mode:this.verified?"live":"disabled",writeActions:this.verified }; }
}
