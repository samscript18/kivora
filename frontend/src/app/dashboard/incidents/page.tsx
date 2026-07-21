"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCapabilities, getIncidents, resolveIncident, QUERY_KEYS } from "@/lib/api";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { ConfidenceIndicator } from "@/components/ui/ConfidenceIndicator";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { ActionConfirmDialog } from "@/components/ui/ActionConfirmDialog";
import { toast } from "sonner";
import { useState } from "react";
import type { Incident } from "@/types/api";

const money = (value: number | undefined) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);

export default function IncidentsPage() {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEYS.incidents,
    queryFn: getIncidents,
  });

  const { data: capabilities } = useQuery({
    queryKey: QUERY_KEYS.capabilities,
    queryFn: getCapabilities,
    staleTime: 60_000,
  });
  const canWrite = capabilities?.wheelhouse.writeActions === true;

  const fixMutation = useMutation({
    mutationFn: (id: string) => resolveIncident(id),
    onSuccess: (result) => {
      toast.success("Incident Resolved & Dynamic Pricing Restored", {
        description: `${money(result.recovered)} projected revenue protected.`,
      });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.incidents });
      setConfirmOpen(false);
      setSelectedIncident(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to resolve incident");
      setConfirmOpen(false);
    },
  });

  const incidents: Incident[] = data ?? [];

  const totalAtRisk = incidents.reduce((acc, curr) => acc + (curr.revenueAtRisk || 0), 0);

  return (
    <div className="mx-auto max-w-[1440px] p-4 sm:p-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Revenue Risk Center</div>
          <h2 className="font-display mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
            Incident Management
          </h2>
          <p className="mt-1 text-[12px] text-slate-400">
            Detected pricing overrides, sync failures, and revenue leaks across your portfolio.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SourceBadge source="wheelhouse" />
          <div className="card rounded-xl px-4 py-2 text-right">
            <div className="text-[9px] uppercase font-mono text-slate-500">Total Revenue At Risk</div>
            <div className="font-display text-lg font-bold text-red-400">{money(totalAtRisk)}</div>
          </div>
        </div>
      </div>

      {/* Incidents Grid */}
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : incidents.length === 0 ? (
        <div className="card rounded-2xl">
          <EmptyState
            icon={ShieldCheck}
            heading="No Open Incidents"
            body="Your portfolio is currently operating without detected pricing conflicts or sync issues."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {incidents.map((item) => (
            <article
              key={item.id}
              className="card rounded-2xl p-6 flex flex-col justify-between space-y-4 hover:border-white/15 transition-colors"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-400">
                      <AlertTriangle size={20} />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <StatusBadge variant={item.severity || "critical"} />
                        <span className="text-[10px] text-slate-500 font-mono">
                          {item.detectedAt}
                        </span>
                      </div>
                      <h3 className="font-bold text-foreground text-sm leading-snug mt-1">{item.title}</h3>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-red-400">{money(item.revenueAtRisk)}</div>
                    <div className="text-[9px] uppercase text-slate-500 font-mono">At Risk</div>
                  </div>
                </div>

                <div className="text-xs text-slate-400">
                  <span className="font-semibold text-slate-300">Property: </span>
                  {item.listing} {item.location ? `· ${item.location}` : ""}
                </div>

                {/* Rate Delta */}
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-elevated p-3 text-xs">
                  <div>
                    <div className="text-[9px] uppercase font-mono text-slate-500">Current Rate</div>
                    <div className="font-bold text-red-400 mt-0.5">{money(item.currentRate)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase font-mono text-slate-500">Recommended Rate</div>
                    <div className="font-bold text-emerald-400 mt-0.5">{money(item.recommendedRate)}</div>
                  </div>
                </div>

                {item.explanation && (
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {item.explanation}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <ConfidenceIndicator value={item.confidence || 90} />

                {canWrite ? (
                  <button
                    onClick={() => {
                      setSelectedIncident(item);
                      setConfirmOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white hover:bg-accent/90 transition-colors"
                  >
                    <ShieldCheck size={14} /> Resolve & Restore Rate
                  </button>
                ) : (
                  <span className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] font-semibold text-amber-300">
                    Read-only · review required
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      {selectedIncident && (
        <ActionConfirmDialog
          open={confirmOpen}
          onClose={() => {
            setConfirmOpen(false);
            setSelectedIncident(null);
          }}
          onConfirm={() => fixMutation.mutate(selectedIncident.id)}
          loading={fixMutation.isPending}
          title="Resolve Incident & Restore Dynamic Pricing"
          description={`Restoring automated pricing for "${selectedIncident.listing}" will remove overrides and re-enable live rate syncing.`}
          confirmLabel="Restore Dynamic Pricing"
          summary={
            <div className="text-xs text-slate-300 space-y-1">
              <div>• Target Rate: <span className="font-bold text-emerald-400">{money(selectedIncident.recommendedRate)}</span></div>
              <div>• Protected Revenue: <span className="font-bold text-emerald-400">{money(selectedIncident.revenueAtRisk)}</span></div>
              <div>• Destination: Connected pricing workspace</div>
            </div>
          }
        />
      )}
    </div>
  );
}
