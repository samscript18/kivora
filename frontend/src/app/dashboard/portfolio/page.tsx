"use client";

import { useQuery } from "@tanstack/react-query";
import { getPortfolio, QUERY_KEYS } from "@/lib/api";
import { Building2, ShieldCheck, Gauge, CircleDollarSign, TrendingUp } from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { SkeletonMetricCard, SkeletonCard } from "@/components/ui/Skeleton";
import type { Listing } from "@/types/api";

const money = (value: number | undefined) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);

const pct = (value: number | undefined) => `${((value ?? 0) * 100).toFixed(1)}%`;

export default function PortfolioDashboardPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEYS.portfolio,
    queryFn: getPortfolio,
  });

  const listings: Listing[] = data?.listings ?? [];

  const totalRevenue = listings.reduce((acc, item) => acc + (item.metrics?.revenue || 0), 0);
  const avgOccupancy = listings.length
    ? listings.reduce((acc, item) => acc + (item.metrics?.occupancy || 0), 0) / listings.length
    : 0;
  const avgAdr = listings.length
    ? listings.reduce((acc, item) => acc + (item.metrics?.adr || 0), 0) / listings.length
    : 0;
  const avgRevpar = listings.length
    ? listings.reduce((acc, item) => acc + (item.metrics?.revpar || 0), 0) / listings.length
    : 0;
  const dynamicCount = listings.filter((item) => item.metrics?.dynamicPricingEnabled).length;

  return (
    <div className="dashboard-page space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Portfolio Analytics</div>
          <h2 className="font-display mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
            Portfolio Dashboard
          </h2>
          <p className="mt-1 text-[12px] text-slate-400">
            Portfolio-wide performance metrics, dynamic pricing coverage, and channel distribution.
          </p>
        </div>
        <SourceBadge source="wheelhouse" />
      </div>

      {/* Aggregate Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonMetricCard key={i} />)
        ) : (
          <>
            <MetricCard
              label="Total 30d Revenue"
              value={money(totalRevenue)}
              detail={`Across ${listings.length} properties`}
              icon={CircleDollarSign}
              tone="healthy"
            />
            <MetricCard
              label="Avg Occupancy Rate"
              value={pct(avgOccupancy)}
              detail="Portfolio-wide average"
              icon={Gauge}
              tone="neutral"
            />
            <MetricCard
              label="Average ADR"
              value={money(avgAdr)}
              detail={`RevPAR Avg: ${money(avgRevpar)}`}
              icon={TrendingUp}
              tone="neutral"
            />
            <MetricCard
              label="Dynamic Coverage"
              value={`${dynamicCount}/${listings.length}`}
              detail={`${((dynamicCount / (listings.length || 1)) * 100).toFixed(0)}% automated`}
              icon={ShieldCheck}
              tone={dynamicCount === listings.length ? "healthy" : "warning"}
            />
          </>
        )}
      </div>

      {/* Property Breakdown */}
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="card rounded-2xl">
          <EmptyState
            icon={Building2}
            heading="No Portfolio Properties"
            body="No listings were returned from the latest live portfolio scan."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {listings.map((item) => {
            const m = item.metrics;
            const pricingState = m?.dynamicPricingEnabled === true ? "enabled" : m?.dynamicPricingEnabled === false ? "disabled" : "unknown";
            const title = item.nickname || item.title || item.id;

            return (
              <article key={item.id} className="card space-y-4 rounded-2xl p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-white/5 text-slate-400">
                      <Building2 size={20} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-bold text-foreground text-sm">{title}</h3>
                      <p className="text-[11px] text-slate-500">
                        {item.location?.address || item.location?.city || item.channel || "Location unspecified"}
                      </p>
                    </div>
                  </div>
                  <StatusBadge variant={pricingState === "enabled" ? "healthy" : pricingState === "disabled" ? "warning" : "pending"} label={pricingState === "enabled" ? "DYNAMIC ON" : pricingState === "disabled" ? "REVIEW NEEDED" : "STATUS UNAVAILABLE"} />
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-white/5 pt-3 text-center sm:grid-cols-4 sm:gap-2">
                  <div>
                    <div className="text-[9px] uppercase font-mono text-slate-500">Revenue</div>
                    <div className="text-xs font-bold text-foreground mt-1">{money(m?.revenue)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase font-mono text-slate-500">Occupancy</div>
                    <div className="text-xs font-bold text-slate-300 mt-1">{pct(m?.occupancy)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase font-mono text-slate-500">ADR</div>
                    <div className="text-xs font-bold text-slate-300 mt-1">{money(m?.adr)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase font-mono text-slate-500">Health</div>
                    <div className="text-xs font-bold text-emerald-400 mt-1">{m?.health ?? "—"}</div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
