"use client";

import { useQuery } from "@tanstack/react-query";
import { getPortfolio, QUERY_KEYS } from "@/lib/api";
import { useState, useMemo } from "react";
import { Search, Building2, ChevronRight, SlidersHorizontal } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import Link from "next/link";
import type { Listing } from "@/types/api";

const money = (value: number | undefined) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);

const pct = (value: number | undefined) => `${((value ?? 0) * 100).toFixed(1)}%`;

export default function ListingsPage() {
  const [search, setSearch] = useState("");
  const [filterDynamic, setFilterDynamic] = useState<"all" | "enabled" | "disabled">("all");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEYS.portfolio,
    queryFn: getPortfolio,
  });

  const filtered = useMemo(() => {
    const list = data?.listings ?? [];
    return list.filter((item: Listing) => {
      const name = `${item.nickname || item.title || item.id} ${item.location?.address || ""} ${item.location?.city || ""}`.toLowerCase();
      const matchesSearch = name.includes(search.toLowerCase());
      const isDynamic = Boolean(item.metrics?.dynamicPricingEnabled);

      if (!matchesSearch) return false;
      if (filterDynamic === "enabled") return isDynamic;
      if (filterDynamic === "disabled") return !isDynamic;
      return true;
    });
  }, [data?.listings, search, filterDynamic]);

  const listingCount = data?.listings?.length ?? 0;

  return (
    <div className="dashboard-page space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Portfolio Inventory</div>
          <h2 className="font-display mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
            Listings Management
          </h2>
          <p className="mt-1 text-[12px] text-slate-400">
            Real-time status, health scores, ADR, RevPAR, and dynamic pricing controls.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge source="wheelhouse" />
          <span className="text-[11px] font-mono text-slate-500">
            {listingCount} Connected Listing{listingCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Toolbar / Filters */}
      <div className="card rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, address, or city..."
            className="w-full rounded-xl border border-border bg-elevated pl-10 pr-4 py-2.5 text-xs text-foreground placeholder-slate-500 outline-none focus:border-accent"
          />
        </div>

        <div className="mobile-scroll-row flex w-full items-center gap-2 pb-1 sm:w-auto sm:pb-0">
          <SlidersHorizontal size={14} className="text-slate-500 flex-shrink-0" />
          <span className="text-[11px] text-slate-500 flex-shrink-0">Pricing:</span>
          {(["all", "enabled", "disabled"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setFilterDynamic(opt)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-colors ${
                filterDynamic === opt
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "bg-elevated border border-border text-slate-400 hover:bg-white/5"
              }`}
            >
              {opt === "all" ? "All Statuses" : opt === "enabled" ? "Dynamic On" : "Review Needed"}
            </button>
          ))}
        </div>
      </div>

      {/* Table / List */}
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="card rounded-2xl overflow-hidden divide-y divide-white/5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card rounded-2xl">
          <EmptyState
            icon={Building2}
            heading="No listings found"
            body={search ? "No properties match your active search filter." : "No live properties are currently connected to this workspace."}
          />
        </div>
      ) : (
        <div className="card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[880px] w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-elevated/50 font-mono text-[9px] uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-5">Listing</th>
                  <th className="py-3.5 px-4">Market / Address</th>
                  <th className="py-3.5 px-4 text-center">Health</th>
                  <th className="py-3.5 px-4 text-right">30d Revenue</th>
                  <th className="py-3.5 px-4 text-right">Occupancy</th>
                  <th className="py-3.5 px-4 text-right">ADR</th>
                  <th className="py-3.5 px-4 text-right">RevPAR</th>
                  <th className="py-3.5 px-4 text-center">Dynamic Pricing</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {filtered.map((item) => {
                  const m = item.metrics;
                  const isDynamic = Boolean(m?.dynamicPricingEnabled);
                  const title = item.nickname || item.title || item.id;
                  const locationStr = item.location?.address || item.location?.city || item.channel || "Location unspecified";

                  return (
                    <tr
                      key={item.id}
                      className="group hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-4 px-5">
                        <Link href={`/dashboard/listings/${encodeURIComponent(item.id)}`} className="flex items-center gap-3">
                          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-white/5 text-slate-400 group-hover:text-accent group-hover:bg-accent/10 transition-colors">
                            <Building2 size={16} />
                          </span>
                          <div className="min-w-0">
                            <span className="font-semibold text-foreground truncate block group-hover:text-accent transition-colors">
                              {title}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              ID: {item.id}
                            </span>
                          </div>
                        </Link>
                      </td>
                      <td className="py-4 px-4 text-slate-400 truncate max-w-[200px]">
                        {locationStr}
                      </td>
                      <td className="py-4 px-4 text-center font-mono font-bold">
                        <span className={m?.health && m.health >= 80 ? "text-emerald-400" : m?.health && m.health >= 60 ? "text-amber-400" : "text-red-400"}>
                          {m?.health != null ? `${m.health}/100` : "—"}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right font-mono font-semibold text-foreground">
                        {money(m?.revenue)}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-300">
                        {m?.occupancy != null ? pct(m.occupancy) : "—"}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-300">
                        {money(m?.adr)}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-300">
                        {money(m?.revpar)}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <StatusBadge variant={isDynamic ? "healthy" : "warning"} label={isDynamic ? "DYNAMIC ON" : "REVIEW"} />
                      </td>
                      <td className="py-4 px-4 text-right">
                        <Link
                          href={`/dashboard/listings/${encodeURIComponent(item.id)}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-elevated px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-foreground hover:bg-white/5 transition-colors"
                        >
                          Audit <ChevronRight size={13} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
