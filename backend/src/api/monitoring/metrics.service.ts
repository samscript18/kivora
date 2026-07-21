import { Injectable } from "@nestjs/common";

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();
  private readonly durations = new Map<string, { count: number; totalMs: number; maxMs: number }>();
  increment(name: string, labels: Record<string, string | number | boolean> = {}, value = 1) { const key = this.key(name, labels); this.counters.set(key, (this.counters.get(key) || 0) + value); }
  observe(name: string, milliseconds: number, labels: Record<string, string | number | boolean> = {}) { const key = this.key(name, labels); const current = this.durations.get(key) || { count: 0, totalMs: 0, maxMs: 0 }; current.count += 1; current.totalMs += milliseconds; current.maxMs = Math.max(current.maxMs, milliseconds); this.durations.set(key, current); }
  snapshot() { return { counters: Object.fromEntries(this.counters), durations: Object.fromEntries([...this.durations].map(([key, value]) => [key, { count: value.count, averageMs: Number((value.totalMs / value.count).toFixed(2)), maxMs: Number(value.maxMs.toFixed(2)) }])), generatedAt: new Date().toISOString() }; }
  private key(name: string, labels: Record<string, string | number | boolean>) { const values = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => `${label}=${String(value).replace(/[,{}]/g, "_")}`).join(","); return values ? `${name}{${values}}` : name; }
}
