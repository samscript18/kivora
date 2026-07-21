import { HttpService } from "@nestjs/axios";
import { HttpException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";
import { createHash } from "crypto";

export interface WheelhouseListing {
  id: string; channel: string; title?: string; nickname?: string; currency?: string;
  market_id?: number; owner_name?: string; is_active?: boolean; number_of_active_units?: number | null;
  location?: { address?: string; country?: string; latitude?: number; longitude?: number };
}
export interface PriceRecommendation { stay_date: string; price: number; currency?: string; custom_type?: string | null; attr_local_demand?: number; attr_occupancy_pacing?: number; }
export interface RecommendationResponse { data: PriceRecommendation[]; base_price?: number; base_price_recommended?: number; base_price_conservative?: number; base_price_aggressive?: number; automatic_rate_posting_enabled?: boolean; }
export type Preferences = Record<string, unknown> & { base_price?: number | null; base_price_adjustment?: number | null; automatic_rate_posting_enabled?: boolean };

@Injectable()
export class WheelhouseService {
  private readonly base: string;
  private readonly key?: string;
  private verified=false;
  private writeVerified=false;
  private readOnlyDetected=false;
  private lastError?:number;
  private readonly connectionState = new Map<string, { verified: boolean; writeVerified: boolean; readOnlyDetected: boolean; lastError?: number }>();
  constructor(private readonly http: HttpService, config: ConfigService) {
    this.base = config.get("WHEELHOUSE_BASE_URL", "https://api.usewheelhouse.com/ss_api/v1");
    this.key = config.get("WHEELHOUSE_API_KEY");
  }
  get configured() { return Boolean(this.key); }

  assertWriteAccess(credential?: string) {
    const state = this.state(credential);
    if (Boolean(credential || this.key) && !state.readOnlyDetected) return;
    throw new HttpException({
      code: "WHEELHOUSE_WRITE_ACCESS_REQUIRED",
      message: Boolean(credential || this.key)
        ? "Wheelhouse rejected this connection as read-only. Live previews remain available, but applying changes requires a write-capable API key."
        : "Connect Wheelhouse before applying revenue changes.",
      details: { writeAccess: Boolean(credential || this.key) ? "read_only" : "not_configured" },
    }, 403);
  }

  private async request<T>(method: "GET" | "POST" | "PUT", path: string, data?: unknown, credential?: string): Promise<T> {
    const key = credential || this.key;
    if (!key) throw new ServiceUnavailableException("Wheelhouse key is not configured");
    const state = this.state(credential);
    let lastError: AxiosError | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await firstValueFrom(this.http.request<T>({ method, url: `${this.base}${path}`, data, headers: { "X-Integration-Api-Key": key } }));
        state.verified=true;if(method === "PUT")state.writeVerified=true;state.lastError=undefined;this.syncLegacyState(state, credential);return response.data;
      } catch (error) {
        lastError = error as AxiosError;
        const status = lastError.response?.status;
        if (![409, 423, 429].includes(status ?? 0) || attempt === 3) break;
        await new Promise(resolve => setTimeout(resolve, Math.min(8000, 1000 * 2 ** attempt + Math.random() * 250)));
      }
    }
    const status = lastError?.response?.status ?? 502;
    const upstream = lastError?.response?.data;
    const upstreamText = JSON.stringify(upstream ?? "").toLowerCase();
    if (status === 403 && upstreamText.includes("read-only")) {
      state.readOnlyDetected = true;
      state.lastError = status;
      this.syncLegacyState(state, credential);
      throw new HttpException({
        code: "WHEELHOUSE_WRITE_ACCESS_REQUIRED",
        message: "Wheelhouse rejected this connection as read-only. Live previews remain available, but applying changes requires a write-capable API key.",
        details: { writeAccess: "read_only" },
      }, 403);
    }
    if (method === "GET") state.verified=false;
    state.lastError=status;
    this.syncLegacyState(state, credential);
    throw new HttpException({ code: "WHEELHOUSE_REQUEST_FAILED", message: "Wheelhouse request failed", upstreamStatus: status, details: upstream }, status);
  }

  async listings(credential?: string) {
    const all: WheelhouseListing[] = [];
    for (let page = 1; page <= 20; page++) {
      const batch = await this.request<WheelhouseListing[]>("GET", `/listings?exclude_inactive=true&include_managed_listings=true&per_page=100&page=${page}`, undefined, credential);
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  }
  recommendations(id: string, channel: string, credential?: string) { return this.request<RecommendationResponse>("GET", `/listings/${encodeURIComponent(id)}/price_recommendations?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  preferences(id: string, channel: string, credential?: string) { return this.request<Preferences>("GET", `/preferences/${encodeURIComponent(id)}?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  kpis(id: string, channel: string, credential?: string) { return this.request<Record<string, unknown>>("GET", `/listings/${encodeURIComponent(id)}/kpis?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  neighborhoodPricing(id: string, channel: string, credential?: string) { return this.request<{data:Array<{stay_date:string;median_price:number;low_price:number;high_price:number;listings_count:number}>;currency:string}>("GET", `/listings/${encodeURIComponent(id)}/neighborhood/pricing?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  neighborhoodOccupancy(id: string, channel: string, credential?: string) { return this.request<{data:Array<{stay_date:string;occupancy:number;adjusted_occupancy:number;expected_bookings:number;observed_bookings:number}>}>("GET", `/listings/${encodeURIComponent(id)}/neighborhood/occupancy?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  changelog(id: string, channel: string) { return this.request<unknown[]>("GET", `/preferences/${encodeURIComponent(id)}/changelog?channel=${encodeURIComponent(channel)}`); }
  recentChanges(id: string, channel: string, credential?: string) { return this.request<{settings?:string;rates?:string}>("GET", `/listings/${encodeURIComponent(id)}/recent_changes?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  reservations(id: string, channel: string, startDate: string, endDate: string, credential?: string) { return this.request<unknown[]>("GET", `/listings/${encodeURIComponent(id)}/reservations?channel=${encodeURIComponent(channel)}&start_date=${startDate}&end_date=${endDate}`, undefined, credential); }
  monthlyKpis(id: string, channel: string, credential?: string) { return this.request<unknown>("GET", `/listings/${encodeURIComponent(id)}/kpis/monthly?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  flags(id: string, channel: string, credential?: string) { return this.request<unknown[]>("GET", `/listings/${encodeURIComponent(id)}/flags?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  notifications() { return this.request<unknown[]>("GET", "/notifications"); }
  segments(credential?: string) { return this.request<unknown[]>("GET", "/segments", undefined, credential); }
  segmentListings(id: number, credential?: string) { return this.request<unknown[]>("GET", `/segments/${id}/listings`, undefined, credential); }
  segmentMetrics(id: number, credential?: string) { return this.request<unknown>("GET", `/segments/${id}/aggregated_metrics`, undefined, credential); }
  preview(id: string, channel: string, preferences: Preferences, credential?: string) { return this.request<RecommendationResponse>("POST", `/preferences/${encodeURIComponent(id)}/preview?channel=${encodeURIComponent(channel)}`, preferences, credential); }
  updatePreferences(id: string, channel: string, preferences: Preferences, credential?: string) { return this.request<unknown>("PUT", `/preferences/${encodeURIComponent(id)}?channel=${encodeURIComponent(channel)}`, preferences, credential); }
  updateSetting(id: string, channel: string, setting: string, value: { type?: "CON" | "REC" | "AGG"; enabled?: boolean }, credential?: string) { return this.request<void>("PUT", `/preferences/${encodeURIComponent(id)}/${encodeURIComponent(setting)}?channel=${encodeURIComponent(channel)}`, value, credential); }
  enableAutomaticPosting(id: string, channel: string, credential?: string) { return this.request<void>("PUT", `/preferences/${encodeURIComponent(id)}/automatic_rate_posting?channel=${encodeURIComponent(channel)}`, { enabled: true }, credential); }
  sync(id: string, channel: string, credential?: string) { return this.request<unknown>("POST", `/listings/${encodeURIComponent(id)}/sync?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  marketTimeSeries(marketId: number) { return this.request<unknown>("GET", `/market_report/${marketId}/time_series`); }
  capabilities(credential?: string) {
    const state = this.state(credential);
    const configured = Boolean(credential || this.key);
    const writeAccess = state.readOnlyDetected
      ? "read_only"
      : state.writeVerified
        ? "verified"
        : "unverified";
    return {
      configured,
      connected: state.verified,
      status: !configured ? "not_configured" : state.verified ? "verified" : "unverified_or_error",
      lastError: state.lastError ?? null,
      mode: state.verified ? "live" : "disabled",
      // Wheelhouse does not expose a non-mutating API-key scope endpoint. A
      // configured connection may attempt an explicitly approved live action;
      // the real upstream response establishes write capability.
      writeActions: configured && !state.readOnlyDetected,
      writeAccess,
    };
  }

  private state(credential?: string) {
    if (!credential) return { verified: this.verified, writeVerified: this.writeVerified, readOnlyDetected: this.readOnlyDetected, lastError: this.lastError };
    const fingerprint = createHash("sha256").update(credential).digest("hex");
    let state = this.connectionState.get(fingerprint);
    if (!state) { state = { verified: false, writeVerified: false, readOnlyDetected: false }; this.connectionState.set(fingerprint, state); }
    return state;
  }
  private syncLegacyState(state: { verified: boolean; writeVerified: boolean; readOnlyDetected: boolean; lastError?: number }, credential?: string) {
    if (credential) return;
    this.verified = state.verified; this.writeVerified = state.writeVerified; this.readOnlyDetected = state.readOnlyDetected; this.lastError = state.lastError;
  }
}
