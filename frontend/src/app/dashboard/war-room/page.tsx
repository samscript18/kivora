"use client";
import {
  getDashboard,
  getIncidents,
  previewIncident,
  resolveIncident,
  QUERY_KEYS,
} from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  Bot,
  Check,
  CircleDollarSign,
  CloudSun,
  Command,
  Gauge,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfidenceIndicator } from "@/components/ui/ConfidenceIndicator";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { SkeletonMetricCard, SkeletonPriorityRow } from "@/components/ui/Skeleton";
import type { Incident, Priority } from "@/types/api";
import { WorkItemWorkspace } from "@/components/dashboard/WorkItemWorkspace";
import { ViewportPortal } from "@/components/ui/ViewportPortal";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n ?? 0);

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// ─── Priority card ────────────────────────────────────────────────────────────
function PriorityCard({
  priority,
  rank,
  onInvestigate,
}: {
  priority: Priority;
  rank: number;
  onInvestigate: () => void;
}) {
  const severity = (priority.severity ?? (rank === 1 ? "critical" : rank <= 3 ? "high" : "medium")) as "critical" | "high" | "medium" | "low";
  return (
    <motion.div
      initial={{ x: -8 }}
      animate={{ x: 0 }}
      transition={{ delay: rank * 0.05 }}
      className="group grid grid-cols-[auto_1fr_auto] items-start gap-2 border-b border-white/6 p-3 transition-colors last:border-b-0 hover:bg-white/[0.02] sm:flex sm:gap-4 sm:p-4"
    >
      {/* Rank */}
      <span className="mt-0.5 font-mono text-xs font-bold text-slate-600 tabular-nums w-5 flex-shrink-0">
        {String(rank).padStart(2, "0")}
      </span>

      {/* Badge */}
      <div className="mt-0.5 hidden flex-shrink-0 sm:block">
        <StatusBadge variant={severity} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="break-words text-[13px] font-semibold text-foreground sm:truncate">{priority.title}</div>
        <div className="mt-0.5 break-words text-[10px] text-slate-500 sm:truncate">
          {priority.property}
          {priority.action ? ` · ${priority.action}` : ""}
        </div>
      </div>

      {/* Impact + confidence */}
      <div className="flex-shrink-0 text-right">
        {priority.impact != null && priority.impact > 0 && (
          <div className="text-[12px] font-bold text-amber-400">{money(priority.impact)}</div>
        )}
        <ConfidenceIndicator value={priority.confidence ?? 0} />
      </div>

      {/* Action */}
      <button
        onClick={onInvestigate}
        className="col-span-3 flex w-full flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[11px] font-semibold text-slate-400 transition-all hover:bg-white/5 hover:text-foreground sm:col-span-1 sm:w-auto sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        aria-label={`Investigate ${priority.title}`}
      >
        Investigate <ArrowRight size={12} />
      </button>
    </motion.div>
  );
}

// ─── Incident drawer ──────────────────────────────────────────────────────────
function IncidentDrawer({
  open,
  onClose,
  incident,
  canWrite,
}: {
  open: boolean;
  onClose: () => void;
  incident: Incident;
  canWrite: boolean;
}) {
  const [stage, setStage] = useState<"analysis" | "previewing" | "result" | "resolved">("analysis");
  const [previewResult, setPreviewResult] = useState<{ projectedRecovery: number; currentRevenue: number; optimizedRevenue: number } | null>(null);
  const qc = useQueryClient();

  const preview = useMutation({
    mutationFn: () => previewIncident(incident.id),
    onMutate: () => setStage("previewing"),
    onSuccess: (result) => { setPreviewResult(result); setStage("result"); },
    onError: (err) => {
      setStage("analysis");
      toast.error(err instanceof Error ? err.message : "Preview failed");
    },
  });

  const fix = useMutation({
    mutationFn: () => resolveIncident(incident.id),
    onSuccess: (result) => {
      setStage("resolved");
      qc.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.incidents });
      toast.success("Dynamic pricing restored", {
        description: `${money(result.recovered)} in projected revenue protected.`,
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Resolution failed"),
  });

  // Reset on incident change
  const incidentId = incident.id;
  useState(() => { setStage("analysis"); setPreviewResult(null); });
  void incidentId;

  return (
    <ViewportPortal lockScroll={open}><AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={`Incident: ${incident.title}`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 290 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[580px] flex-col overflow-y-auto bg-surface shadow-2xl"
          >
            {/* Drawer header */}
            <div className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-surface/95 px-5 backdrop-blur">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-red-400">
                <AlertTriangle size={13} /> Revenue Incident
              </div>
              <button
                onClick={onClose}
                className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-border text-slate-500 hover:text-foreground"
                aria-label="Close incident drawer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 p-5 sm:p-7">
              {/* Severity + time */}
              <div className="flex items-center gap-2">
                <StatusBadge variant={incident.severity ?? "critical"} size="sm" />
                <span className="text-[10px] text-slate-500">
                  Detected {incident.detectedAt}
                </span>
                <SourceBadge source="wheelhouse" />
              </div>

              <h2 className="font-display mt-4 text-2xl font-bold leading-tight tracking-tight">
                {incident.title}
              </h2>
              <p className="mt-2 text-[12px] text-slate-400">
                {incident.listing}
                {incident.location ? ` · ${incident.location}` : ""}
              </p>

              {/* Financial impact grid */}
              <div className="mt-6 grid overflow-hidden rounded-xl border border-border min-[390px]:grid-cols-3">
                {[
                  { label: "Current rate", value: money(incident.currentRate), cls: "text-red-400" },
                  { label: "Recommended", value: money(incident.recommendedRate), cls: "text-emerald-400" },
                  { label: "At risk",      value: money(incident.revenueAtRisk),  cls: "text-amber-400" },
                ].map(({ label, value, cls }, i) => (
                  <div key={label} className={`p-4 ${i > 0 ? "border-t border-border min-[390px]:border-l min-[390px]:border-t-0" : ""}`}>
                    <div className="text-[8px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
                    <div className={`mt-2 text-lg font-bold ${cls}`}>{value}</div>
                  </div>
                ))}
              </div>

              {stage === "resolved" ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-7"
                >
                  <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-6">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500/20 text-emerald-400">
                      <Check size={20} />
                    </div>
                    <h3 className="font-display mt-5 text-xl font-bold text-emerald-400">Revenue protected.</h3>
                    <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
                      Dynamic pricing was restored and verified for {incident.listing}.
                      Portfolio synchronization queued.
                    </p>
                    <div className="mt-5 flex items-end justify-between border-t border-emerald-500/20 pt-5">
                      <span className="text-[9px] uppercase tracking-wider text-slate-500">Projected recovery</span>
                      <span className="font-display text-2xl font-bold text-emerald-400">{money(incident.revenueAtRisk)}</span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <>
                  {/* Kivora diagnosis */}
                  <div className="mt-7">
                    <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold text-foreground">
                      <Bot size={14} className="text-accent" />
                      Kivora diagnosis
                    </div>
                    <div className="soft-grid rounded-xl border border-border bg-elevated p-5">
                      <div className="flex items-start gap-3">
                        <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                          <Command size={13} />
                        </span>
                        <div className="flex-1">
                          <div className="text-[9px] uppercase tracking-wider text-slate-500">Root cause</div>
                          <div className="mt-1 text-[12px] font-semibold text-foreground">{incident.cause ?? "Analysis pending"}</div>
                        </div>
                        {incident.confidence != null && (
                          <ConfidenceIndicator value={incident.confidence} />
                        )}
                      </div>
                      {incident.explanation && (
                        <p className="mt-4 text-[12px] leading-relaxed text-slate-400">{incident.explanation}</p>
                      )}
                    </div>
                  </div>

                  {/* Evidence */}
                  {incident.factors?.length > 0 && (
                    <div className="mt-7">
                      <div className="mb-3 text-[11px] font-semibold text-foreground">Verified evidence</div>
                      <div className="space-y-2">
                        {incident.factors.map((f) => (
                          <div
                            key={f.label}
                            className="flex items-center rounded-xl border border-border bg-elevated px-4 py-3"
                          >
                            <span className="text-[10px] text-slate-400">{f.label}</span>
                            <span className="ml-auto text-[11px] font-bold text-foreground">{f.value}</span>
                            {f.note && <span className="ml-3 w-28 text-right text-[9px] text-slate-500">{f.note}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preview result */}
                  {stage === "previewing" && (
                    <div className="mt-7 rounded-xl border border-border bg-elevated p-5">
                      <div className="flex items-center gap-3">
                        <span className="live-dot h-2 w-2 rounded-full bg-emerald-500" />
                        <div>
                          <div className="text-[11px] font-semibold text-foreground">Requesting live strategy preview</div>
                          <div className="mt-1 text-[9px] text-slate-500">
                            Comparing current and proposed rates — no pricing changes made.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {stage === "result" && previewResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-7 overflow-hidden rounded-xl border border-emerald-500/25 bg-emerald-500/5"
                    >
                      <div className="border-b border-emerald-500/15 px-4 py-3">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-400">
                          <Sparkles size={13} /> Live preview complete — no pricing changed
                        </div>
                      </div>
                      <div className="grid divide-y divide-emerald-500/15 text-center min-[390px]:grid-cols-3 min-[390px]:divide-x min-[390px]:divide-y-0">
                        {[
                          ["Recovery", `+${money(previewResult.projectedRecovery)}`, "text-emerald-400"],
                          ["Current",   money(previewResult.currentRevenue),        "text-foreground"],
                          ["Optimized", money(previewResult.optimizedRevenue),      "text-emerald-400"],
                        ].map(([l, v, cls]) => (
                          <div key={l} className="p-4">
                            <div className="text-[8px] uppercase tracking-wider text-slate-500">{l}</div>
                            <div className={`mt-1.5 text-base font-bold ${cls}`}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* CTA */}
                  <div className="mt-8 border-t border-border pt-5 space-y-3">
                    {stage === "analysis" && incident.canPreview !== false && (
                      <button
                        onClick={() => preview.mutate()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-elevated border border-border py-3.5 text-[12px] font-semibold text-foreground hover:bg-white/5 transition-colors"
                      >
                        <Zap size={14} className="text-accent" />
                        Run live strategy preview
                      </button>
                    )}
                    {stage === "analysis" && incident.canPreview === false && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center text-[11px] text-amber-400">
                        This incident requires manual operational review. Kivora will not apply an automated pricing change.
                      </div>
                    )}
                    {stage === "result" && canWrite && (
                      <button
                        disabled={fix.isPending}
                        onClick={() => fix.mutate()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-[12px] font-bold text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
                      >
                        <ShieldCheck size={15} />
                        {fix.isPending ? "Restoring pricing…" : "Approve & restore dynamic pricing"}
                      </button>
                    )}
                    {stage === "result" && !canWrite && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center text-[11px] leading-5 text-amber-300">
                        Preview complete. This workspace has read-only pricing access, so no live change can be applied.
                      </div>
                    )}
                    <p className="text-center text-[9px] text-slate-600">
                      Previews never change live pricing. Applying a result requires write access.
                    </p>
                  </div>
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence></ViewportPortal>
  );
}

// ─── Portfolio pulse chart ────────────────────────────────────────────────────
function PortfolioPulse({ trend }: { trend: { day: string; revenue: number; market?: number }[] }) {
  if (!trend?.length) return null;
  return (
    <section className="card rounded-2xl p-4 sm:p-5">
      <div className="mb-5 flex flex-col items-start justify-between gap-3 min-[460px]:flex-row min-[460px]:items-center">
        <div>
          <h3 className="font-display text-[14px] font-bold text-foreground">Portfolio revenue trend</h3>
          <p className="mt-0.5 text-[10px] text-slate-500">Live portfolio vs market benchmark · last {trend.length} days</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[9px] text-slate-500 sm:gap-4">
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded bg-accent/60" /> Portfolio</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded border border-slate-600 border-dashed bg-transparent" /> Market</span>
        </div>
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend}>
            <defs>
              <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#e8442a" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#e8442a" stopOpacity="0" />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fill: "#6b7280" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fill: "#6b7280" }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              width={42}
            />
            <Tooltip
              formatter={(v) => [money(Number(v)), ""]}
              contentStyle={{
                background: "#14141a",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                fontSize: 11,
                color: "#f1f1f3",
              }}
            />
            <Area type="monotone" dataKey="revenue" stroke="#e8442a" strokeWidth={2} fill="url(#rev-grad)" />
            <Area type="monotone" dataKey="market" stroke="#4b5563" strokeWidth={1.5} strokeDasharray="4 4" fill="transparent" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ─── Top opportunities summary ────────────────────────────────────────────────
function TopOpportunities({ opportunities }: { opportunities: { property: string; action: string; impact: number; confidence: number; tag?: string }[] }) {
  if (!opportunities?.length) return null;
  return (
    <section className="card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-[14px] font-bold text-foreground">Top opportunities</h3>
          <p className="mt-0.5 text-[10px] text-slate-500">Ranked by recoverable revenue</p>
        </div>
        <a href="/dashboard/opportunities" className="text-[10px] font-semibold text-accent hover:text-accent/80 transition-colors">
          View all →
        </a>
      </div>
      <div className="divide-y divide-white/6">
        {opportunities.slice(0, 5).map((o, i) => (
          <div key={o.property + i} className="flex items-center gap-3 py-3.5">
            <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-sky-500/10 font-mono text-[10px] font-bold text-sky-400">
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold text-foreground">{o.property}</div>
              <div className="mt-0.5 truncate text-[9px] text-slate-500">
                {o.action} · <ConfidenceIndicator value={o.confidence} />
              </div>
            </div>
            <div className="text-right">
              <div className="text-[12px] font-bold text-emerald-400">+{money(o.impact)}</div>
              {o.tag && <div className="text-[8px] uppercase text-slate-600">{o.tag}</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Activity summary ─────────────────────────────────────────────────────────
function RecentActivity({ activity }: { activity: { _id: string; action: string; actor?: string; createdAt: string }[] }) {
  if (!activity?.length) return null;
  return (
    <section className="card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-[14px] font-bold text-foreground">Recent activity</h3>
          <p className="mt-0.5 text-[10px] text-slate-500">Verified actions and portfolio checks</p>
        </div>
        <span className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-500">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
          MONITORING
        </span>
      </div>
      <div className="space-y-2">
        {activity.slice(0, 6).map((a, index) => {
          const date = new Date(a.createdAt);
          return (
            <div key={a._id || `${a.action}-${a.createdAt}-${index}`} className="flex items-start gap-3 rounded-xl border border-border bg-elevated px-3.5 py-3">
              <span className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                <Check size={13} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="truncate text-[11px] font-semibold text-foreground">
                  {String(a.action).replaceAll("_", " ")}
                </div>
                <div className="mt-0.5 text-[9px] text-slate-500">{a.actor ?? "Kivora automation"}</div>
              </div>
              <span className="flex-shrink-0 text-[9px] text-slate-600">
                {Number.isNaN(date.getTime()) ? "Just now" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
      </div>
      <a href="/dashboard/activity" className="mt-3 block text-center text-[10px] font-semibold text-accent hover:text-accent/80">
        View full audit trail →
      </a>
    </section>
  );
}

// ─── War Room page ────────────────────────────────────────────────────────────
export default function WarRoomPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEYS.dashboard,
    queryFn: getDashboard,
    retry: 1,
    refetchInterval: 120_000, // 2 min background refresh
  });

  const { data: incidentData } = useQuery({
    queryKey: QUERY_KEYS.incidents,
    queryFn: getIncidents,
    enabled: !!data,
  });

  const [drawerIncident, setDrawerIncident] = useState<Incident | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [workItem, setWorkItem] = useState<{ kind: "incident" | "opportunity"; id: string } | null>(null);

  function openIncident(incident: Incident) {
    setDrawerIncident(incident);
    setDrawerOpen(true);
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (error) {
    return (
      <div className="dashboard-page">
        <ErrorState
          error={error}
          heading="Could not load live portfolio data"
          onRetry={refetch}
        />
      </div>
    );
  }

  const s = data?.summary;

  return (
    <>
      <div className="dashboard-page space-y-6">
        {/* Page header */}
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
          <div>
            <div className="text-[11px] text-slate-500">{today}</div>
            <h2 className="font-display mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
              {isLoading ? "Loading portfolio…" : "What needs your attention today?"}
            </h2>
            {data && (
              <p className="mt-1 max-w-2xl text-[12px] leading-5 text-slate-400">
                {s!.criticalIncidents > 0
                  ? `${s!.criticalIncidents} critical incident${s!.criticalIncidents > 1 ? "s" : ""} and ${s!.opportunities} open opportunities detected. Resolving the top priority could protect ${money(s!.atRisk)} in revenue.`
                  : s!.opportunities > 0
                  ? `No critical incidents. ${s!.opportunities} revenue opportunities are ready for review.`
                  : "Portfolio is healthy. No critical incidents or open opportunities."}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            <SourceBadge source="wheelhouse" />
            {data && <SourceBadge source="kivora" />}
          </div>
        </div>

        {/* Executive metrics */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonMetricCard key={i} />)
          ) : s ? (
            <>
              <MetricCard label="Portfolio health" value={`${s.health}/100`} detail="Latest listing snapshots" icon={ShieldCheck} tone={s.health >= 80 ? "healthy" : s.health >= 60 ? "warning" : "critical"} />
              <MetricCard label="30-day revenue" value={money(s.revenue)} detail="Latest verified KPI" icon={CircleDollarSign} tone="neutral" />
              <MetricCard label="Revenue at risk" value={money(s.atRisk)} detail="Open incidents" icon={AlertTriangle} tone={s.atRisk > 0 ? "critical" : "healthy"} onClick={() => { window.location.href = "/dashboard/incidents"; }} />
              <MetricCard label="Opportunities" value={String(s.opportunities)} detail="Revenue upside pipeline" icon={TrendingUp} tone="opportunity" onClick={() => { window.location.href = "/dashboard/opportunities"; }} />
              <MetricCard label="30-day occupancy" value={pct(s.occupancy / 100)} detail="Average across portfolio" icon={Gauge} tone="neutral" />
              <MetricCard label="Market signals" value={String(s.marketSignals ?? 0)} detail="Events & weather" icon={CloudSun} tone={s.marketSignals > 0 ? "opportunity" : "neutral"} onClick={() => { window.location.href = "/dashboard/market"; }} />
            </>
          ) : null}
        </div>

        {/* Today's priority queue */}
        <section className="card overflow-hidden rounded-2xl">
          <div className="flex flex-col items-start justify-between gap-3 border-b border-border p-4 min-[430px]:flex-row min-[430px]:items-center sm:p-5">
            <div>
              <div className="eyebrow">Revenue War Room</div>
              <h3 className="font-display mt-1 text-lg font-bold text-foreground">Today&apos;s highest-impact actions</h3>
            </div>
            <span className="shrink-0 rounded-full border border-border px-3 py-1 font-mono text-[9px] text-slate-500">
              LIVE PRIORITY QUEUE
            </span>
          </div>

          <div className="divide-y divide-white/5">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonPriorityRow key={i} />)
            ) : data?.priorities?.length ? (
              data.priorities.slice(0, 8).map((p, i) => (
                <PriorityCard
                  key={p.id}
                  priority={p}
                  rank={i + 1}
                  onInvestigate={() => {
                    if (p.kind === "opportunity" || p.type === "opportunity") { setWorkItem({ kind: "opportunity", id: p.id }); return; }
                    if (p.kind === "incident" || p.type === "incident") {
                      const matched = incidentData?.find((incident) => incident.id === p.id);
                      setWorkItem({ kind: "incident", id: matched?.id || p.id });
                      return;
                    }
                    window.location.href = `/dashboard/market#signal-${encodeURIComponent(p.id)}`;
                  }}
                />
              ))
            ) : (
              <EmptyState
                icon={ShieldCheck}
                heading="No actions ranked right now"
                body="The portfolio is currently healthy. Priority actions will appear here as incidents and opportunities are detected."
              />
            )}
          </div>

          {data?.incident && (
            <div className="border-t border-border p-4">
              <button
                onClick={() => openIncident(data.incident!)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-[11px] font-semibold text-slate-400 hover:bg-white/5 hover:text-foreground transition-colors"
              >
                <AlertTriangle size={13} className="text-red-400" />
                Open critical incident · {money(data.incident.revenueAtRisk)} at risk
                <ArrowRight size={12} />
              </button>
            </div>
          )}
        </section>

        {/* Portfolio pulse + opportunities side by side */}
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          {isLoading ? (
            <>
              <div className="card rounded-2xl p-5 h-[300px] flex items-center justify-center">
                <div className="skeleton h-full w-full rounded-xl" />
              </div>
              <div className="card rounded-2xl p-5 h-[300px] flex items-center justify-center">
                <div className="skeleton h-full w-full rounded-xl" />
              </div>
            </>
          ) : (
            <>
              {data?.trend?.length ? <PortfolioPulse trend={data.trend} /> : null}
              {data?.opportunities?.length ? <TopOpportunities opportunities={data.opportunities} /> : null}
            </>
          )}
        </div>

        {/* Recent activity */}
        {data?.activity?.length ? <RecentActivity activity={data.activity as { _id: string; action: string; actor?: string; createdAt: string }[]} /> : null}

        {/* Signals teaser */}
        {data?.signals?.length ? (
          <section className="card rounded-2xl p-5">
            <div className="mb-4 flex flex-col items-start justify-between gap-2 min-[430px]:flex-row min-[430px]:items-center">
              <div>
                <h3 className="font-display text-[14px] font-bold text-foreground">Market signals</h3>
                <p className="mt-0.5 text-[10px] text-slate-500">Events and weather affecting your portfolio locations</p>
              </div>
              <Link href="/dashboard/market" className="text-[10px] font-semibold text-accent hover:text-accent/80">
                View all signals →
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.signals.slice(0, 4).map((signal) => (
                <div key={signal.externalId} className="flex items-start gap-3 rounded-xl border border-border bg-elevated p-4">
                  <span className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ${signal.kind === "event" ? "bg-amber-500/10 text-amber-400" : "bg-sky-500/10 text-sky-400"}`}>
                    {signal.kind === "event" ? <Sparkles size={15} /> : <CloudSun size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <SourceBadge source={signal.kind === "event" ? "ticketmaster" : "openweather"} />
                    </div>
                    <div className="mt-1 truncate text-[12px] font-semibold text-foreground">{signal.title}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {signal.affectedListings} listing{signal.affectedListings !== 1 ? "s" : ""} affected
                      {signal.demandDirection ? ` · Demand ${signal.demandDirection}` : ""}
                    </div>
                  </div>
                  <ConfidenceIndicator value={signal.confidence} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Quick links for features */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Audit a listing", href: "/dashboard/listings",      icon: BarChart2,     desc: "Review health and issues" },
            { label: "Simulate strategy", href: "/dashboard/simulator",   icon: Zap,           desc: "Compare pricing scenarios" },
            { label: "Generate report",   href: "/dashboard/reports",     icon: ShieldCheck,   desc: "Owner or portfolio report" },
            { label: "Market Intel",      href: "/dashboard/market",      icon: CloudSun,      desc: "Events and weather signals" },
          ].map(({ label, href, icon: Icon, desc }) => (
            <a
              key={href}
              href={href}
              className="card flex flex-col gap-3 rounded-xl p-4 hover:border-white/15 hover:bg-white/[0.02] transition-colors"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-slate-400">
                <Icon size={16} />
              </span>
              <div>
                <div className="text-[12px] font-semibold text-foreground">{label}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">{desc}</div>
              </div>
              <ArrowRight size={13} className="mt-auto text-slate-600" />
            </a>
          ))}
        </div>
      </div>

      {/* Incident drawer */}
      {drawerIncident && (
        <IncidentDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          incident={drawerIncident}
          canWrite={data?.capabilities?.wheelhouse?.writeActions === true}
        />
      )}
      {workItem && <WorkItemWorkspace key={`${workItem.kind}:${workItem.id}`} kind={workItem.kind} id={workItem.id} onClose={() => setWorkItem(null)} />}
    </>
  );
}
