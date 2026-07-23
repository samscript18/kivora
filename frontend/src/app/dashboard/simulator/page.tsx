"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPortfolio, getStrategies, applyStrategy, getCapabilities, QUERY_KEYS } from "@/lib/api";
import { useState } from "react";
import { Zap, Building2 } from "lucide-react";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { ActionConfirmDialog } from "@/components/ui/ActionConfirmDialog";
import { toast } from "sonner";

const money = (value: number | undefined) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);

export default function SimulatorPage() {
  const [selectedListingId, setSelectedListingId] = useState<string>("");
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const qc = useQueryClient();

  const portfolioQuery = useQuery({
    queryKey: QUERY_KEYS.portfolio,
    queryFn: getPortfolio,
  });

  const capabilitiesQuery = useQuery({
    queryKey: QUERY_KEYS.capabilities,
    queryFn: getCapabilities,
    staleTime: 60_000,
  });
  const canAnalyze = capabilitiesQuery.data?.permissions?.canAnalyze === true;
  const canWrite = capabilitiesQuery.data?.wheelhouse.writeActions === true && capabilitiesQuery.data?.permissions?.canManageRevenue === true;

  const strategiesQuery = useQuery({
    queryKey: QUERY_KEYS.strategies(selectedListingId),
    queryFn: () => getStrategies(selectedListingId),
    enabled: Boolean(selectedListingId) && canAnalyze,
  });

  const applyMutation = useMutation({
    mutationFn: (strategyKey: string) => applyStrategy(selectedListingId, strategyKey),
    onSuccess: (result) => {
      toast.success(`Strategy "${result.strategy || selectedStrategy}" Applied`, {
        description: "Pricing rules updated and a fresh portfolio scan was queued.",
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

  const listings = portfolioQuery.data?.listings ?? [];

  return (
    <div className="dashboard-page space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Scenario Modeling</div>
          <h2 className="font-display mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
            Revenue Strategy Simulator
          </h2>
          <p className="mt-1 text-[12px] text-slate-400">
            Compare non-mutating conservative, balanced, and aggressive revenue outcomes.
          </p>
        </div>
        <SourceBadge source="wheelhouse" />
      </div>

      {/* Listing Selector */}
      <div className="card space-y-3 rounded-2xl p-4 sm:p-6">
        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Building2 size={15} className="text-accent" /> Select Listing to Model
        </label>
        <select
          value={selectedListingId}
          onChange={(e) => setSelectedListingId(e.target.value)}
          className="w-full rounded-xl border border-border bg-elevated p-3.5 text-xs text-foreground outline-none focus:border-accent"
        >
          <option value="">Choose a live property from your portfolio...</option>
          {listings.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nickname || item.title || item.id} ({item.location?.city || item.channel || "Connected"})
            </option>
          ))}
        </select>
      </div>

      {/* Results */}
      {!canAnalyze && !capabilitiesQuery.isLoading ? (
        <div className="card rounded-2xl border border-amber-500/15 p-5 text-xs text-amber-200">Analyst permission is required to run live strategy previews.</div>
      ) : !selectedListingId ? (
        <div className="card rounded-2xl">
          <EmptyState
            icon={Zap}
            heading="Select a Property"
            body="Choose a listing from the dropdown above to run strategy simulations."
          />
        </div>
      ) : strategiesQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-56 rounded-2xl" />
          ))}
        </div>
      ) : strategiesQuery.error ? (
        <ErrorState error={strategiesQuery.error} onRetry={() => strategiesQuery.refetch()} />
      ) : strategiesQuery.data?.strategies?.length ? (
        <div className="grid gap-4 md:grid-cols-3">
          {strategiesQuery.data.strategies.map((strat) => (
            <article
              key={strat.key}
              className={`card flex flex-col justify-between space-y-6 rounded-2xl p-4 sm:p-6 ${
                strat.key === "balanced" ? "ring-1 ring-accent bg-accent/[0.02]" : ""
              }`}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-lg text-foreground capitalize">{strat.label || strat.key}</h3>
                  {strat.key === "balanced" && (
                    <span className="badge-healthy text-[9px] px-2 py-0.5 rounded-full font-bold">
                      RECOMMENDED
                    </span>
                  )}
                </div>

                {strat.available ? (
                  <div className="space-y-3">
                    <div>
                      <div className="text-[9px] uppercase font-mono text-slate-500">Projected 30d Revenue</div>
                      <div className="font-display text-2xl font-bold text-foreground mt-1">
                        {money(strat.projectedRevenue)}
                      </div>
                    </div>
                    <div className={`text-xs font-semibold ${strat.estimatedUplift >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {strat.estimatedUplift >= 0 ? "+" : ""}{money(strat.estimatedUplift)} estimated uplift
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">{strat.reason || "Not applicable for current listing parameters."}</p>
                )}
              </div>

              {strat.available && canWrite && (
                <button
                  onClick={() => {
                    setSelectedStrategy(strat.key);
                    setConfirmOpen(true);
                  }}
                  className="w-full rounded-xl bg-accent py-3 text-xs font-bold text-white hover:bg-accent/90 transition-colors"
                >
                  Approve & Apply Strategy
                </button>
              )}
              {strat.available && !canWrite && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-center text-[11px] leading-5 text-amber-300">
                  Live preview only — this workspace has read-only pricing access.
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState heading="No Strategy Presets" body="No available pricing presets were returned for this listing." />
      )}

      {/* Confirmation Modal */}
      <ActionConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => selectedStrategy && applyMutation.mutate(selectedStrategy)}
        loading={applyMutation.isPending}
        title="Confirm Strategy Application"
        description={`Are you sure you want to apply the "${selectedStrategy}" revenue strategy to this property?`}
        confirmLabel="Approve Strategy"
      />
    </div>
  );
}
