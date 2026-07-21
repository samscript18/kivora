import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { firstValueFrom } from "rxjs";
import { MarketSignal } from "../schemas/market-signal.schema";
import { WheelhouseListing } from "./wheelhouse.service";

type TicketmasterEvent = {
  id: string; name: string; url?: string;
  dates?: { start?: { dateTime?: string; localDate?: string }; end?: { dateTime?: string } };
  classifications?: Array<{ segment?: { name?: string }; genre?: { name?: string } }>;
  _embedded?: { venues?: Array<{ name?: string; city?: { name?: string }; location?: { latitude?: string; longitude?: string } }> };
};
type Forecast = { list?: Array<{ dt: number; main?: { temp?: number }; weather?: Array<{ description?: string }>; wind?: { speed?: number }; rain?: { "3h"?: number }; pop?: number }> };

@Injectable()
export class MarketIntelligenceService {
  private readonly ticketmasterKey?: string;
  private readonly weatherKey?: string;

  constructor(private readonly http: HttpService, config: ConfigService, @InjectModel(MarketSignal.name) private readonly signals: Model<MarketSignal>) {
    this.ticketmasterKey = config.get<string>("TICKETMASTER_API_KEY");
    this.weatherKey = config.get<string>("OPENWEATHER_API_KEY");
  }

  capabilities() {
    return {
      ticketmaster: { configured: Boolean(this.ticketmasterKey), mode: this.ticketmasterKey ? "live" : "disabled" },
      openweather: { configured: Boolean(this.weatherKey), mode: this.weatherKey ? "live" : "disabled" },
    };
  }

  async refresh(listings: WheelhouseListing[]) {
    const clusters = this.clusters(listings).slice(0, 8);
    let events = 0;
    let weather = 0;
    for (const cluster of clusters) {
      if (this.ticketmasterKey) events += await this.refreshEvents(cluster);
      if (this.weatherKey) weather += await this.refreshWeather(cluster);
    }
    return { source: "live external APIs", clusters: clusters.length, events, weather, capabilities: this.capabilities() };
  }

  list() { return this.signals.find({ expiresAt: { $gt: new Date() } }).sort({ startsAt: 1, confidence: -1 }).limit(100).lean(); }

  private clusters(listings: WheelhouseListing[]) {
    const map = new Map<string, { latitude: number; longitude: number; listingIds: string[]; location: string }>();
    for (const listing of listings) {
      const latitude = listing.location?.latitude;
      const longitude = listing.location?.longitude;
      if (typeof latitude !== "number" || typeof longitude !== "number") continue;
      const key = `${latitude.toFixed(1)}:${longitude.toFixed(1)}`;
      const value = map.get(key) ?? { latitude, longitude, listingIds: [], location: listing.location?.address || listing.location?.country || key };
      value.listingIds.push(listing.id);
      map.set(key, value);
    }
    return [...map.values()];
  }

  private async refreshEvents(cluster: { latitude: number; longitude: number; listingIds: string[]; location: string }) {
    const start = new Date();
    const end = new Date(Date.now() + 45 * 86_400_000);
    const response = await firstValueFrom(this.http.get<{ _embedded?: { events?: TicketmasterEvent[] } }>("https://app.ticketmaster.com/discovery/v2/events.json", {
      params: { apikey: this.ticketmasterKey, latlong: `${cluster.latitude},${cluster.longitude}`, radius: 30, unit: "miles", startDateTime: start.toISOString().replace(/\.\d{3}Z$/, "Z"), endDateTime: end.toISOString().replace(/\.\d{3}Z$/, "Z"), size: 20, sort: "date,asc" },
    }));
    const events = response.data._embedded?.events ?? [];
    for (const event of events) {
      const venue = event._embedded?.venues?.[0];
      const segment = event.classifications?.[0]?.segment?.name || "Live event";
      const genre = event.classifications?.[0]?.genre?.name;
      const startsAt = new Date(event.dates?.start?.dateTime || `${event.dates?.start?.localDate}T12:00:00Z`);
      await this.signals.findOneAndUpdate({ externalId: `ticketmaster:${event.id}` }, { $set: {
        kind: "event", title: event.name, description: [segment, genre].filter(Boolean).join(" · "), location: [venue?.name, venue?.city?.name].filter(Boolean).join(", ") || cluster.location,
        latitude: Number(venue?.location?.latitude) || cluster.latitude, longitude: Number(venue?.location?.longitude) || cluster.longitude, startsAt, demandDirection: "up",
        confidence: segment === "Sports" || segment === "Music" ? 78 : 68, affectedListings: cluster.listingIds.length, listingIds: cluster.listingIds,
        source: "Ticketmaster Discovery API", sourceUrl: event.url, evidence: { segment, genre, radiusMiles: 30 }, expiresAt: new Date(startsAt.getTime() + 86_400_000),
      } }, { upsert: true });
    }
    return events.length;
  }

  private async refreshWeather(cluster: { latitude: number; longitude: number; listingIds: string[]; location: string }) {
    const response = await firstValueFrom(this.http.get<Forecast>("https://api.openweathermap.org/data/2.5/forecast", { params: { lat: cluster.latitude, lon: cluster.longitude, appid: this.weatherKey, units: "metric" } }));
    const risky = (response.data.list ?? []).filter((item) => (item.pop ?? 0) >= 0.65 || (item.rain?.["3h"] ?? 0) >= 8 || (item.wind?.speed ?? 0) >= 14 || (item.main?.temp ?? 20) >= 38 || (item.main?.temp ?? 20) <= -8);
    if (!risky.length) return 0;
    const first = risky[0];
    const end = risky[risky.length - 1];
    const descriptions = [...new Set(risky.flatMap((item) => item.weather?.map((weather) => weather.description).filter((value): value is string => Boolean(value)) ?? []))];
    const externalId = `openweather:${cluster.latitude.toFixed(2)}:${cluster.longitude.toFixed(2)}:${new Date(first.dt * 1000).toISOString().slice(0, 10)}`;
    await this.signals.findOneAndUpdate({ externalId }, { $set: {
      kind: "weather", title: descriptions[0] ? `Weather watch: ${descriptions[0]}` : "Material weather change", description: descriptions.join(", "), location: cluster.location,
      latitude: cluster.latitude, longitude: cluster.longitude, startsAt: new Date(first.dt * 1000), endsAt: new Date(end.dt * 1000), demandDirection: "mixed",
      confidence: 74, affectedListings: cluster.listingIds.length, listingIds: cluster.listingIds, source: "OpenWeather 5-day forecast",
      evidence: { forecastIntervals: risky.length, maximumRainMm: Math.max(...risky.map((item) => item.rain?.["3h"] ?? 0)), maximumWindMps: Math.max(...risky.map((item) => item.wind?.speed ?? 0)), probabilityOfPrecipitation: Math.max(...risky.map((item) => item.pop ?? 0)) },
      expiresAt: new Date(end.dt * 1000 + 86_400_000),
    } }, { upsert: true });
    return 1;
  }
}
