"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCapabilities, getPortfolio, getStrategies, applyStrategy, QUERY_KEYS } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  ArrowLeft,
  ShieldCheck,
  Zap,
  TrendingUp,
  AlertTriangle,
  Bot,
  Sparkles,
  CheckCircle2
} from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { ActionConfirmDialog } from "@/components/ui/ActionConfirmDialog";
import { toast } from "sonner";
import type { Listing } from "@/types/api";

const money = (value: number | undefined) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);

const pct = (value: number | undefined) => `${((value ?? 0) * 100).toFixed(1)}%`;

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = decodeURIComponent(String(params.id || ""));
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"audit" | "simulator" | "comps">("audit");
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Load portfolio to get listing details
  const portfolioQuery = useQuery({
    queryKey: QUERY_KEYS.portfolio,
    queryFn: getPortfolio,
  });

  const capabilitiesQuery = useQuery({
    queryKey: QUERY_KEYS.capabilities,
    queryFn: getCapabilities,
    staleTime: 60_000,
  });
  const canWrite = capabilitiesQuery.data?.wheelhouse.writeActions === true;

  // Load strategies for simulator tab
  const strategiesQuery = useQuery({
    queryKey: QUERY_KEYS.strategies(listingId),
    queryFn: () => getStrategies(listingId),
    enabled: Boolean(listingId),
  });

  const applyMutation = useMutation({
    mutationFn: (strategyKey: string) => applyStrategy(listingId, strategyKey),
    onSuccess: (result) => {
      toast.success(`Strategy "${result.strategy || selectedStrategy}" applied successfully`, {
        description: "Pricing synchronization was queued. Metrics will update shortly.",
      });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.portfolio });
      strategiesQuery.refetch();
      setConfirmOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to apply strategy");
      setConfirmOpen(false);
    },
  });

  const listing: Listing | undefined = portfolioQuery.data?.listings.find(
    (item) => String(item.id) === listingId
  );

  if (portfolioQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[1440px] p-4 sm:p-7 space-y-6">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (portfolioQuery.error || !listing) {
    return (
      <div className="mx-auto max-w-[1440px] p-4 sm:p-7 space-y-6">
        <button
          onClick={() => router.push("/dashboard/listings")}
          className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-foreground"
        >
          <ArrowLeft size={14} /> Back to listings
        </button>
        <ErrorState
          heading="Listing Not Found"
          error={portfolioQuery.error || new Error(`Could not find listing ID: ${listingId}`)}
          onRetry={() => portfolioQuery.refetch()}
        />
      </div>
    );
  }

  const m = listing.metrics;
  const isDynamic = Boolean(m?.dynamicPricingEnabled);
  const title = listing.nickname || listing.title || listing.id;

  return (
    <div className="mx-auto max-w-[1440px] p-4 sm:p-7 space-y-6">
      {/* Top Breadcrumb */}
      <button
        onClick={() => router.push("/dashboard/listings")}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} /> Back to listings
      </button>

      {/* Listing Header Banner */}
      <div className="card rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/30">
              <Building2 size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <StatusBadge variant={isDynamic ? "healthy" : "warning"} label={isDynamic ? "DYNAMIC ON" : "REVIEW NEEDED"} />
                <SourceBadge source="wheelhouse" />
                <span className="text-[10px] font-mono text-slate-500">ID: {listing.id}</span>
              </div>
              <h1 className="font-display mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {title}
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                {listing.location?.address || listing.location?.city || listing.channel || "Location unspecified"}
                {listing.bedrooms ? ` · ${listing.bedrooms} Bedroom${listing.bedrooms > 1 ? "s" : ""}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab("simulator")}
              className="flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-xs font-bold text-white hover:bg-accent/90 transition-colors"
            >
              <Zap size={14} /> Simulate Strategy
            </button>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Health Score"
          value={m?.health != null ? `${m.health}/100` : "—"}
          detail="Live pricing diagnostic score"
          icon={ShieldCheck}
          tone={m?.health && m.health >= 80 ? "healthy" : m?.health && m.health >= 60 ? "warning" : "critical"}
        />
        <MetricCard
          label="30-Day Revenue"
          value={money(m?.revenue)}
          detail="Actual booked revenue"
          icon={TrendingUp}
          tone="neutral"
        />
        <MetricCard
          label="Occupancy Rate"
          value={m?.occupancy != null ? pct(m.occupancy) : "—"}
          detail="Trailing 30-day average"
          icon={CheckCircle2}
          tone="neutral"
        />
        <MetricCard
          label="ADR / RevPAR"
          value={`${money(m?.adr)}`}
          detail={`RevPAR: ${money(m?.revpar)}`}
          icon={Sparkles}
          tone="neutral"
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border gap-6 text-xs font-semibold">
        {[
          { id: "audit", label: "Audit & Diagnostics", icon: Bot },
          { id: "simulator", label: "Strategy Simulator", icon: Zap },
          { id: "comps", label: "Market & Comps Comparison", icon: TrendingUp },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 py-3 border-b-2 transition-colors ${
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-slate-400 hover:text-foreground"
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: AI Audit */}
      {activeTab === "audit" && (
        <div className="space-y-6">
          <section className="card rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/10 text-accent">
                <Bot size={16} />
              </span>
              <div>
                <h3 className="font-display text-sm font-bold text-foreground">
                  Automated Audit Summary
                </h3>
                <p className="text-[11px] text-slate-500">
                  Grounded in live pace, calendar restrictions, and competitive rates
                </p>
              </div>
            </div>

            <div className="soft-grid rounded-xl border border-border bg-elevated p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Diagnostic Findings</span>
                <StatusBadge variant={isDynamic ? "healthy" : "warning"} label={isDynamic ? "LIVE" : "REVIEW"} />
              </div>
              <p className="text-xs leading-relaxed text-slate-300">
                Dynamic pricing is {isDynamic ? "active" : "inactive"}. The latest verified snapshot reports {m?.occupancy != null ? `${pct(m.occupancy)} occupancy` : "no occupancy value"}, {m?.adr != null ? `${money(m.adr)} ADR` : "no ADR value"}, and {m?.revpar != null ? `${money(m.revpar)} RevPAR` : "no RevPAR value"}.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 pt-2">
              <div className="rounded-xl border border-border bg-elevated p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <CheckCircle2 size={15} /> What is Working
                </div>
                <ul className="mt-3 space-y-2 text-xs text-slate-400">
                  <li>• Listing data is present in the latest connected portfolio snapshot</li>
                  <li>• Pricing status is reported directly by the live listing preference</li>
                  <li>• Revenue, occupancy, ADR, and RevPAR use verified KPI fields</li>
                </ul>
              </div>

              <div className="rounded-xl border border-border bg-elevated p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                  <AlertTriangle size={15} /> Required Next Steps
                </div>
                <ul className="mt-3 space-y-2 text-xs text-slate-400">
                  {!isDynamic ? (
                    <li>• Apply the recommended Balanced or Aggressive pricing rule</li>
                  ) : (
                    <li>• Review upcoming local event pricing surges in Market Intel</li>
                  )}
                  <li>• Review live neighborhood and competitive benchmarks when available</li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Tab 2: Simulator */}
      {activeTab === "simulator" && (
        <div className="space-y-6">
          <section className="card rounded-2xl p-6">
            <h3 className="font-display text-base font-bold text-foreground">
              Revenue Strategy Simulator
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Evaluate conservative, balanced, and aggressive scenarios before approving updates.
            </p>

            {strategiesQuery.isLoading ? (
              <div className="grid gap-4 md:grid-cols-3 mt-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton h-48 rounded-xl" />
                ))}
              </div>
            ) : strategiesQuery.error ? (
              <div className="mt-6">
                <ErrorState error={strategiesQuery.error} onRetry={() => strategiesQuery.refetch()} />
              </div>
            ) : strategiesQuery.data?.strategies?.length ? (
              <div className="grid gap-4 md:grid-cols-3 mt-6">
                {strategiesQuery.data.strategies.map((strat) => (
                  <div
                    key={strat.key}
                    className={`card rounded-2xl p-5 flex flex-col justify-between ${
                      strat.key === "balanced" ? "ring-1 ring-accent bg-accent/[0.02]" : ""
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-foreground capitalize">{strat.label || strat.key}</span>
                        {strat.key === "balanced" && (
                          <span className="badge-healthy text-[9px] px-2 py-0.5 rounded-full font-bold">
                            RECOMMENDED
                          </span>
                        )}
                      </div>

                      {strat.available ? (
                        <div className="mt-4 space-y-2">
                          <div className="text-[10px] uppercase font-mono text-slate-500">Projected 30d Revenue</div>
                          <div className="font-display text-xl font-bold text-foreground">
                            {money(strat.projectedRevenue)}
                          </div>
                          <div className={`text-xs font-semibold ${strat.estimatedUplift >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {strat.estimatedUplift >= 0 ? "+" : ""}{money(strat.estimatedUplift)} estimated uplift
                          </div>
                        </div>
                      ) : (
                        <p className="mt-4 text-xs text-slate-500">{strat.reason || "Not applicable for current listing settings."}</p>
                      )}
                    </div>

                    {strat.available && canWrite && (
                      <button
                        onClick={() => {
                          setSelectedStrategy(strat.key);
                          setConfirmOpen(true);
                        }}
                        className="mt-6 w-full rounded-xl bg-accent py-2.5 text-xs font-bold text-white hover:bg-accent/90 transition-colors"
                      >
                        Approve & Apply Strategy
                      </button>
                    )}
                    {strat.available && !canWrite && (
                      <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-center text-[10px] leading-4 text-amber-300">
                        Preview only · write access required to apply
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState heading="No Strategy Options" body="No pricing presets were returned for this listing." />
            )}
          </section>
        </div>
      )}

      {/* Tab 3: Comps Comparison */}
      {activeTab === "comps" && (
        <div className="card rounded-2xl p-6 space-y-4">
          <h3 className="font-display text-base font-bold text-foreground">
            Comp-Set & Market Benchmark Comparison
          </h3>
          <p className="text-xs text-slate-400">
            Live listing performance for {listing.location?.city || "the target market"}. Competitive deltas are shown only when the connected data supplies them.
          </p>

          <div className="grid gap-4 sm:grid-cols-3 pt-2">
            <div className="rounded-xl border border-border bg-elevated p-4">
              <div className="text-[10px] uppercase font-mono text-slate-500">Listing ADR</div>
              <div className="mt-2 text-xl font-bold text-foreground">{money(m?.adr)}</div>
              <div className="mt-1 text-xs text-slate-400">Latest verified listing KPI</div>
            </div>
            <div className="rounded-xl border border-border bg-elevated p-4">
              <div className="text-[10px] uppercase font-mono text-slate-500">Listing Occupancy</div>
              <div className="mt-2 text-xl font-bold text-foreground">{m?.occupancy != null ? pct(m.occupancy) : "—"}</div>
              <div className="mt-1 text-xs text-slate-400">Latest verified listing KPI</div>
            </div>
            <div className="rounded-xl border border-border bg-elevated p-4">
              <div className="text-[10px] uppercase font-mono text-slate-500">Listing RevPAR</div>
              <div className="mt-2 text-xl font-bold text-foreground">{money(m?.revpar)}</div>
              <div className="mt-1 text-xs text-slate-400">Latest verified listing KPI</div>
            </div>
          </div>
        </div>
      )}

      {/* Strategy Confirmation Modal */}
      <ActionConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => selectedStrategy && applyMutation.mutate(selectedStrategy)}
        loading={applyMutation.isPending}
        title="Apply Strategy Update"
        description={`You are about to change the revenue pricing strategy for "${title}" to "${selectedStrategy}".`}
        confirmLabel="Approve & Apply"
        summary={
          <div className="text-xs text-slate-300 space-y-1">
            <div>• Strategy: <span className="font-bold uppercase text-accent">{selectedStrategy}</span></div>
            <div>• Destination: Connected pricing workspace</div>
            <div>• Synchronization: Instant automatic scan triggered</div>
          </div>
        }
      />
    </div>
  );
}
