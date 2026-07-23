import { HttpService } from "@nestjs/axios";
import { HttpException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";
import { createHash } from "crypto";
import Redis from "ioredis";

interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttl: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}

export interface WheelhouseListing {
  id: string; channel: string; title?: string; nickname?: string; currency?: string;
  market_id?: number; owner_name?: string; is_active?: boolean; number_of_active_units?: number | null;
  description?: string; wheelhouse_id?: number; num_bedrooms?: number; num_beds?: number; num_bathrooms?: number;
  room_type?: string; property_type?: string; star_rating?: number; num_reviews?: number; num_photos?: number;
  thumb_url?: string; access_level?: string; amenities?: string[]; security_deposit?: number;
  base_min_night_stay?: number; wheelhouse_created_at?: string;
  location?: { address?: string; country?: string; postal_code?: string; latitude?: number; longitude?: number };
}
export interface PriceRecommendation { stay_date: string; price: number; currency?: string; min_stay?: number; custom_type?: string | null; attr_local_demand?: number; attr_occupancy_pacing?: number; }
export interface RecommendationResponse { data: PriceRecommendation[]; currency?: string; global_min_stay?: number; base_price?: number; base_price_selected?: number; base_price_recommended?: number; base_price_conservative?: number; base_price_aggressive?: number; anchor_credibility?: number; anchor_price?: number | null; base_price_attribution?: Record<string, number>; automatic_rate_posting_enabled?: boolean; }
export interface MonthlyKpiResponse { currency?: string; data: Array<{ month: string; adr?: number; lead_time?: number; occupancy?: number; occupancy_adjusted?: number; revpar?: number; revenue?: number; los?: number; comp_set_adr?: number; comp_set_lead_time?: number; comp_set_occupancy?: number; comp_set_revpar?: number; comp_set_revenue?: number; comp_set_los?: number; }>; }
export interface Reservation { id: string; status?: string; start_date: string; end_date: string; booked_at?: string; num_guests?: number; currency?: string; total_price?: number; nightly_subtotal?: number; confirmation_code?: string; source_name?: string; }
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
  private readonly memoryCache = new Map<string, { expiresAt: number; value: string }>();
  private readonly cacheTtlSeconds: number;
  private cache?: CacheStore;
  private cacheHits = 0;
  private cacheMisses = 0;
  private redisUnavailableUntil = 0;
  private redisLastError?: string;
  constructor(private readonly http: HttpService, config: ConfigService) {
    this.base = config.get("WHEELHOUSE_BASE_URL", "https://api.usewheelhouse.com/ss_api/v1");
    this.key = config.get("WHEELHOUSE_API_KEY");
    this.cacheTtlSeconds = this.parseCacheTtl(config.get("WHEELHOUSE_CACHE_TTL_SECONDS", "300"));
    const redisUrl = config.get<string>("REDIS_URL");
    if (redisUrl) {
      const redisOptions: Record<string, unknown> = {
        lazyConnect: false,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 5_000,
        // Redis is an optimization, never a reason to keep retrying in the
        // background or to degrade live Wheelhouse reads.
        retryStrategy: (attempt: number) => attempt > 2 ? null : Math.min(1_000, attempt * 250),
      };
      if (redisUrl.startsWith("rediss://")) {
        (redisOptions as { tls?: { rejectUnauthorized: boolean } }).tls = { rejectUnauthorized: false };
      }
      const client = new Redis(redisUrl, redisOptions as never);
      // ioredis emits an `error` event even when individual cache commands are
      // caught. Listening here prevents an unreachable optional cache from
      // becoming an unhandled process error.
      client.on("error", (error) => {
        this.redisUnavailableUntil = Date.now() + 60_000;
        this.redisLastError = error.message.slice(0, 200);
      });
      this.cache = client;
    }
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

  private parseCacheTtl(value: string | undefined) {
    const parsed = Number(value ?? "300");
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
  }

  private cacheKey(method: "GET" | "POST" | "PUT", path: string, credential?: string) {
    const fingerprint = createHash("sha256").update(`${credential || this.key || "default"}:${path}`).digest("hex");
    return `wheelhouse:${method}:${fingerprint}:${path}`;
  }

  private async getCached<T>(key: string): Promise<T | undefined> {
    // Redis is authoritative when configured so a mutation on any API instance
    // invalidates the value for every instance. Memory remains a fallback only.
    if (this.cache && Date.now() >= this.redisUnavailableUntil) {
      try {
        const value = await this.cache.get(key);
        if (value) { this.cacheHits++; return JSON.parse(value) as T; }
      } catch (error) {
        this.markRedisUnavailable(error);
        // Continue to the short-lived local fallback if Redis is unavailable.
      }
    }
    const entry = this.memoryCache.get(key);
    if (entry && entry.expiresAt > Date.now()) { this.cacheHits++; return JSON.parse(entry.value) as T; }
    if (entry) this.memoryCache.delete(key);
    this.cacheMisses++;
    return undefined;
  }

  private async setCached(key: string, value: unknown) {
    if (value === undefined) return;
    const payload = JSON.stringify(value);
    if (this.cache && Date.now() >= this.redisUnavailableUntil) {
      try {
        await this.cache.set(key, payload, "EX", this.cacheTtlSeconds);
        this.memoryCache.delete(key);
        return;
      } catch (error) {
        this.markRedisUnavailable(error);
        // Redis is optional; use a local fallback while it recovers.
      }
    }
    this.memoryCache.set(key, { expiresAt: Date.now() + this.cacheTtlSeconds * 1000, value: payload });
  }

  private async invalidateListingCache(path: string, credential?: string) {
    const match = /^\/(?:preferences|listings)\/([^/?]+).*?[?&]channel=([^&]+)/.exec(path);
    if (!match) return;
    const [, encodedId, encodedChannel] = match;
    const id = decodeURIComponent(encodedId), channel = decodeURIComponent(encodedChannel);
    const paths = [
      `/listings/${encodeURIComponent(id)}?channel=${encodeURIComponent(channel)}`,
      `/listings/${encodeURIComponent(id)}/pricing_tier?channel=${encodeURIComponent(channel)}`,
      `/listings/${encodeURIComponent(id)}/price_recommendations?channel=${encodeURIComponent(channel)}`,
      `/preferences/${encodeURIComponent(id)}?channel=${encodeURIComponent(channel)}`,
      `/preferences/${encodeURIComponent(id)}/changelog?channel=${encodeURIComponent(channel)}`,
      `/listings/${encodeURIComponent(id)}/kpis?channel=${encodeURIComponent(channel)}`,
      `/listings/${encodeURIComponent(id)}/kpis/monthly?channel=${encodeURIComponent(channel)}`,
      `/listings/${encodeURIComponent(id)}/recent_changes?channel=${encodeURIComponent(channel)}`,
      `/listings/${encodeURIComponent(id)}/neighborhood/pricing?channel=${encodeURIComponent(channel)}`,
      `/listings/${encodeURIComponent(id)}/neighborhood/occupancy?channel=${encodeURIComponent(channel)}`,
    ];
    const keys = paths.map((cachedPath) => this.cacheKey("GET", cachedPath, credential));
    keys.forEach((key) => this.memoryCache.delete(key));
    try { if (this.cache && Date.now() >= this.redisUnavailableUntil) await this.cache.del(...keys); } catch (error) { this.markRedisUnavailable(error); /* local invalidation still protects this instance */ }
  }

  private async request<T>(method: "GET" | "POST" | "PUT", path: string, data?: unknown, credential?: string, retryTransient = true): Promise<T> {
    const key = credential || this.key;
    if (!key) throw new ServiceUnavailableException("Wheelhouse key is not configured");
    const state = this.state(credential);
    let lastError: AxiosError | undefined;
    if (method === "GET") {
      const cacheKey = this.cacheKey(method, path, credential);
      const cached = await this.getCached<T>(cacheKey);
      if (cached !== undefined) {
        state.verified=true;state.lastError=undefined;this.syncLegacyState(state, credential);return cached;
      }
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await firstValueFrom(this.http.request<T>({ method, url: `${this.base}${path}`, data, headers: { "X-Integration-Api-Key": key } }));
        state.verified=true;if(method === "PUT")state.writeVerified=true;state.lastError=undefined;this.syncLegacyState(state, credential);
        if (method === "GET") await this.setCached(this.cacheKey(method, path, credential), response.data);
        // Preview requests are read-only. Only writes and an explicit provider
        // sync may change the values represented by cached GET responses.
        else if (method === "PUT" || path.includes("/sync?")) await this.invalidateListingCache(path, credential);
        return response.data;
      } catch (error) {
        lastError = error as AxiosError;
        const status = lastError.response?.status;
        if (!retryTransient || ![409, 423, 429].includes(status ?? 0) || attempt === 3) break;
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
    // A listing-level 404/406/422 or a temporary rate limit does not invalidate
    // the account credential. Only authentication failures prove the live read
    // connection itself is no longer usable.
    if (method === "GET" && [401, 403].includes(status)) state.verified=false;
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
  listing(id: string, channel: string, credential?: string) { return this.request<WheelhouseListing>("GET", `/listings/${encodeURIComponent(id)}?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  pricingTier(id: string, channel: string, credential?: string) { return this.request<{name:string;horizon:number}>("GET", `/listings/${encodeURIComponent(id)}/pricing_tier?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  recommendations(id: string, channel: string, credential?: string) { return this.request<RecommendationResponse>("GET", `/listings/${encodeURIComponent(id)}/price_recommendations?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  preferences(id: string, channel: string, credential?: string) { return this.request<Preferences>("GET", `/preferences/${encodeURIComponent(id)}?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  kpis(id: string, channel: string, credential?: string) { return this.request<Record<string, unknown>>("GET", `/listings/${encodeURIComponent(id)}/kpis?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  neighborhoodPricing(id: string, channel: string, credential?: string) { return this.request<{data:Array<{stay_date:string;median_price:number;low_price:number;high_price:number;listings_count:number}>;currency:string}>("GET", `/listings/${encodeURIComponent(id)}/neighborhood/pricing?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  neighborhoodOccupancy(id: string, channel: string, credential?: string) { return this.request<{data:Array<{stay_date:string;occupancy:number;adjusted_occupancy:number;expected_bookings:number;observed_bookings:number}>}>("GET", `/listings/${encodeURIComponent(id)}/neighborhood/occupancy?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  changelog(id: string, channel: string, credential?: string) { return this.request<unknown[]>("GET", `/preferences/${encodeURIComponent(id)}/changelog?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  recentChanges(id: string, channel: string, credential?: string) { return this.request<{settings?:string;rates?:string}>("GET", `/listings/${encodeURIComponent(id)}/recent_changes?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  async reservations(id: string, channel: string, startDate: string, endDate: string, credential?: string) {
    const all: Reservation[] = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await this.request<Reservation[]>("GET", `/listings/${encodeURIComponent(id)}/reservations?channel=${encodeURIComponent(channel)}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&per_page=100&page=${page}`, undefined, credential);
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  }
  monthlyKpis(id: string, channel: string, credential?: string) { return this.request<MonthlyKpiResponse>("GET", `/listings/${encodeURIComponent(id)}/kpis/monthly?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  flags(id: string, channel: string, credential?: string) { return this.request<Array<{name:string;description?:string}>>("GET", `/listings/${encodeURIComponent(id)}/flags?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  basePriceHistory(id: string, channel: string, startDate: string, endDate: string, credential?: string) { return this.request<Array<{model_date:string;raw_recommendation?:number;recommendation?:number;adjustment?:number;fixed?:number|null;anchor_price?:number|null;anchor_weight?:number;effective_base_price?:number}>>("GET", `/listings/${encodeURIComponent(id)}/base_price_history?channel=${encodeURIComponent(channel)}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`, undefined, credential); }
  checkinCheckout(id: string, channel: string, credential?: string) { return this.request<{data:Array<{stay_date:string;check_in:boolean;check_out:boolean}>}>("GET", `/listings/${encodeURIComponent(id)}/checkin_checkout?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  minMaxPrices(id: string, channel: string, credential?: string) { return this.request<{data:Array<{stay_date:string;min_price:number|null;max_price:number|null}>}>("GET", `/listings/${encodeURIComponent(id)}/min_max_prices?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  monthlySeasonality(id: string, channel: string, credential?: string) { return this.request<Record<"CON"|"REC"|"AGG",Record<string,number>>>("GET", `/listings/${encodeURIComponent(id)}/monthly_seasonality?channel=${encodeURIComponent(channel)}`, undefined, credential); }
  notifications(credential?: string) { return this.request<unknown[]>("GET", "/notifications", undefined, credential); }
  segments(credential?: string) { return this.request<unknown[]>("GET", "/segments", undefined, credential); }
  segmentListings(id: number, credential?: string) { return this.request<unknown[]>("GET", `/segments/${id}/listings`, undefined, credential); }
  segmentMetrics(id: number, credential?: string) { return this.request<unknown>("GET", `/segments/${id}/aggregated_metrics`, undefined, credential); }
  preview(id: string, channel: string, preferences: Preferences, credential?: string) { return this.request<RecommendationResponse>("POST", `/preferences/${encodeURIComponent(id)}/preview?channel=${encodeURIComponent(channel)}`, preferences, credential); }
  updatePreferences(id: string, channel: string, preferences: Preferences, credential?: string) { return this.request<unknown>("PUT", `/preferences/${encodeURIComponent(id)}?channel=${encodeURIComponent(channel)}`, preferences, credential); }
  updateSetting(id: string, channel: string, setting: string, value: { type?: "CON" | "REC" | "AGG"; enabled?: boolean }, credential?: string) { return this.request<void>("PUT", `/preferences/${encodeURIComponent(id)}/${encodeURIComponent(setting)}?channel=${encodeURIComponent(channel)}`, value, credential); }
  enableAutomaticPosting(id: string, channel: string, credential?: string) { return this.request<void>("PUT", `/preferences/${encodeURIComponent(id)}/automatic_rate_posting?channel=${encodeURIComponent(channel)}`, { enabled: true }, credential); }
  sync(id: string, channel: string, credential?: string) { return this.request<unknown>("POST", `/listings/${encodeURIComponent(id)}/sync?channel=${encodeURIComponent(channel)}`, undefined, credential, false); }
  marketTimeSeries(marketId: number, credential?: string) { return this.request<unknown>("GET", `/market_report/${marketId}/time_series`, undefined, credential); }
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
      cache: { backend: this.cache ? "redis" : "memory", status: this.cache && Date.now() < this.redisUnavailableUntil ? "degraded" : "available", ttlSeconds: this.cacheTtlSeconds, hits: this.cacheHits, misses: this.cacheMisses, lastError: this.redisLastError || null },
    };
  }

  private markRedisUnavailable(error: unknown) {
    this.redisUnavailableUntil = Date.now() + 60_000;
    this.redisLastError = error instanceof Error ? error.message.slice(0, 200) : "Redis cache request failed";
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
