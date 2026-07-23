"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { getCapabilities, getMarketIntelligence, refreshMarketIntelligence, QUERY_KEYS } from "@/lib/api";
import { Sparkles, CloudRain, RefreshCw, FlameKindling, MapPin } from "lucide-react";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { ConfidenceIndicator } from "@/components/ui/ConfidenceIndicator";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { toast } from "sonner";
import type { MarketSignal } from "@/types/api";

export default function MarketIntelligencePage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEYS.marketIntelligence,
    queryFn: getMarketIntelligence,
  });
  const capabilities = useQuery({ queryKey: QUERY_KEYS.capabilities, queryFn: getCapabilities });
  const canAnalyze = Boolean(capabilities.data?.permissions?.canAnalyze);

  const refreshMutation = useMutation({
    mutationFn: refreshMarketIntelligence,
    onSuccess: (result) => {
      const description = `${result.events} live events and ${result.weather} local weather forecasts processed across ${result.clusters} portfolio locations.`;
      if (result.errors.length) toast.warning("Some signals could not be refreshed", { description: `${description} ${result.errors.map((item) => `${item.provider}: ${item.message}`).join(" · ")}` });
      else toast.success("Market intelligence is up to date", { description });
      refetch();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to refresh market signals");
    },
  });

  const signals: MarketSignal[] = data ?? [];

  return (
    <div className="dashboard-page space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="eyebrow">External Demand Intelligence</div>
          <h2 className="font-display mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
            Market & Demand Signals
          </h2>
          <p className="mt-1 text-[12px] text-slate-400">
            Real-time event and weather demand signals matched directly to your portfolio markets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <SourceBadge source="ticketmaster" />
            <SourceBadge source="openweather" />
          </div>

          <button
            disabled={!canAnalyze || refreshMutation.isPending}
            title={canAnalyze ? "Refresh live demand signals" : "Analyst permission is required"}
            onClick={() => refreshMutation.mutate()}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={refreshMutation.isPending ? "animate-spin" : ""} />
            {refreshMutation.isPending ? "Refreshing..." : "Refresh Signals"}
          </button>
        </div>
      </div>

      {/* Grid */}
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : signals.length === 0 ? (
        <div className="card rounded-2xl">
          <EmptyState
            icon={FlameKindling}
            heading="No Market Signals Yet"
            body="Refresh the page to collect live event and local weather forecasts for connected listing locations."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {signals.map((signal) => {
            const isEvent = signal.kind === "event";

            return (
              <Link
                key={signal.externalId}
                href={`/dashboard/market/${encodeURIComponent(signal.externalId)}`}
                id={`signal-${signal.externalId}`}
                className="card group block scroll-mt-24 rounded-2xl p-4 transition-colors hover:border-white/15 hover:bg-white/2 focus-visible:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/20 sm:p-6"
              >
                <article className="flex h-full flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                          isEvent ? "bg-amber-500/10 text-amber-400" : "bg-sky-500/10 text-sky-400"
                        }`}
                      >
                        {isEvent ? <Sparkles size={20} /> : <CloudRain size={20} />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <SourceBadge source={isEvent ? "ticketmaster" : "openweather"} />
                          <span className="text-[10px] font-mono text-slate-500 uppercase">
                            {signal.kind}
                          </span>
                        </div>
                        <h3 className="font-bold text-foreground text-sm leading-snug mt-1">
                          {signal.title}
                        </h3>
                      </div>
                    </div>

                    <ConfidenceIndicator value={signal.confidence} />
                  </div>

                  {signal.location && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <MapPin size={13} className="text-slate-500" />
                      {signal.location}
                    </div>
                  )}

                  <p className="text-xs text-slate-400 leading-relaxed">
                    {signal.description || "Live market signal detected for target area."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3 text-xs text-slate-500">
                  <span>
                    <strong className="text-foreground font-semibold">{signal.affectedListings}</strong> Affected Listing{signal.affectedListings !== 1 ? "s" : ""}
                  </span>

                  {signal.demandDirection && (
                    <span className="font-mono text-[10px] uppercase font-bold text-emerald-400">
                      Demand Shift: {signal.demandDirection}
                    </span>
                  )}
                </div>
                </article>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
