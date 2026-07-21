"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { getOpportunities, previewIncident, QUERY_KEYS } from "@/lib/api";
import { TrendingUp, Zap, Filter } from "lucide-react";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { ConfidenceIndicator } from "@/components/ui/ConfidenceIndicator";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { toast } from "sonner";
import { useState } from "react";
import type { Opportunity } from "@/types/api";

const money = (value: number | undefined) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);

export default function OpportunitiesPage() {
  const [filterTag, setFilterTag] = useState<string>("all");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEYS.opportunities,
    queryFn: getOpportunities,
  });

  const previewMutation = useMutation({
    mutationFn: (id: string) => previewIncident(id),
    onSuccess: (result) => {
      toast.success("Live Strategy Preview Completed", {
        description: `Projected recovery: ${money(result.projectedRecovery)}. Optimized revenue: ${money(result.optimizedRevenue)}.`,
      });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    },
  });

  const opportunities: Opportunity[] = data ?? [];

  const tags = Array.from(new Set(opportunities.map((o) => o.tag).filter(Boolean))) as string[];

  const filtered = opportunities.filter((o) => {
    if (filterTag === "all") return true;
    return o.tag === filterTag;
  });

  const totalUpside = opportunities.reduce((acc, curr) => acc + (curr.impact || 0), 0);

  return (
    <div className="mx-auto max-w-[1440px] p-4 sm:p-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Revenue Upside Pipeline</div>
          <h2 className="font-display mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
            Discovered Opportunities
          </h2>
          <p className="mt-1 text-[12px] text-slate-400">
            Identified revenue improvements derived from verified live portfolio scans.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SourceBadge source="kivora" />
          <div className="card rounded-xl px-4 py-2 text-right">
            <div className="text-[9px] uppercase font-mono text-slate-500">Total Potential Upside</div>
            <div className="font-display text-lg font-bold text-emerald-400">{money(totalUpside)}</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      {tags.length > 0 && (
        <div className="card rounded-2xl p-4 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <Filter size={14} className="text-slate-500 flex-shrink-0" />
          <span className="text-[11px] text-slate-500 flex-shrink-0">Category:</span>
          <button
            onClick={() => setFilterTag("all")}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold capitalize flex-shrink-0 transition-colors ${
              filterTag === "all"
                ? "bg-accent/10 text-accent border border-accent/30"
                : "bg-elevated border border-border text-slate-400 hover:bg-white/5"
            }`}
          >
            All Opportunities ({opportunities.length})
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => setFilterTag(tag)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold capitalize flex-shrink-0 transition-colors ${
                filterTag === tag
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "bg-elevated border border-border text-slate-400 hover:bg-white/5"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Feed Grid */}
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card rounded-2xl">
          <EmptyState
            icon={TrendingUp}
            heading="No open opportunities"
            body="No active revenue opportunities match the selected category filter."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((item) => (
            <article
              key={item.id || item.property}
              className="card rounded-2xl p-6 flex flex-col justify-between space-y-4 hover:border-white/15 transition-colors"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400">
                      <TrendingUp size={18} />
                    </span>
                    <div>
                      <h3 className="font-bold text-foreground text-sm leading-snug">{item.property}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.tag && <StatusBadge variant="opportunity" label={item.tag} />}
                        <SourceBadge source="wheelhouse" />
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-emerald-400">+{money(item.impact)}</div>
                    <div className="text-[9px] uppercase text-slate-500 font-mono">Estimated Upside</div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-elevated p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">Recommended Action:</span>
                    <ConfidenceIndicator value={item.confidence} />
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {item.action}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <span className="text-[10px] font-mono text-slate-500">
                  Grounded in live scan
                </span>

                {item.canPreview !== false && item.id ? (
                  <button
                    disabled={previewMutation.isPending}
                    onClick={() => previewMutation.mutate(item.id!)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
                  >
                    <Zap size={13} />
                    {previewMutation.isPending ? "Simulating..." : "Live Preview"}
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-slate-500">
                    Manual Review Required
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
