"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCapabilities, getListingWorkspace, getPortfolio, getStrategies, applyStrategy, QUERY_KEYS } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import {WorkItemWorkspace}from"@/components/dashboard/WorkItemWorkspace";

const money = (value: number | undefined | null, currency = "USD") => {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
};

const pct = (value: number | undefined) => `${((value ?? 0) * 100).toFixed(1)}%`;

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = decodeURIComponent(String(params.id || ""));
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"audit" | "simulator" | "comps" | "operations">("audit");
  const[selectedWork,setSelectedWork]=useState<{kind:"incident"|"opportunity";id:string}|null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [renderedAt]=useState(()=>Date.now());

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
  const workspaceQuery=useQuery({queryKey:QUERY_KEYS.listingWorkspace(listingId),queryFn:()=>getListingWorkspace(listingId),enabled:Boolean(listingId),staleTime:60_000});
  const syncFresh=workspaceQuery.data?.capabilities?.lastSynchronizedAt&&renderedAt-new Date(workspaceQuery.data.capabilities.lastSynchronizedAt).getTime()<6*60*60_000;
  const canWrite = capabilitiesQuery.data?.wheelhouse.writeActions === true&&capabilitiesQuery.data?.permissions?.canManageRevenue===true&&workspaceQuery.data?.capabilities?.writeActions===true&&workspaceQuery.data?.capabilities?.canApprove===true&&workspaceQuery.data?.capabilities?.listingActive===true&&Boolean(syncFresh);

  // Load strategies for simulator tab
  const strategiesQuery = useQuery({
    queryKey: QUERY_KEYS.strategies(listingId),
    queryFn: () => getStrategies(listingId),
    enabled: Boolean(listingId) && activeTab === "simulator" && capabilitiesQuery.data?.permissions?.canAnalyze === true,
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
      <div className="dashboard-page space-y-6">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (portfolioQuery.error || !listing) {
    return (
      <div className="dashboard-page space-y-6">
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
  const workspace = workspaceQuery.data;
  const currency = workspace?.listing.currency || workspace?.listing.portfolio?.currency || listing.currency || "USD";
  const pricingState = m?.dynamicPricingEnabled === true ? "enabled" : m?.dynamicPricingEnabled === false ? "disabled" : "unknown";
  const isDynamic = pricingState === "enabled";
  const title = listing.nickname || listing.title || listing.id;
  const monthlyKpis = workspace?.performance.monthly?.data || [];
  const neighborhoodPricing = workspace?.pricing.neighborhood?.data || [];
  const neighborhoodByDate = new Map(neighborhoodPricing.map((row) => [row.stay_date, row]));
  const priceComparison = (workspace?.pricing.recommendations?.data || []).slice(0, 60).map((row: any) => ({
    date: row.stay_date,
    listing: Number(row.price),
    market: neighborhoodByDate.get(row.stay_date)?.median_price,
    marketLow: neighborhoodByDate.get(row.stay_date)?.low_price,
    marketHigh: neighborhoodByDate.get(row.stay_date)?.high_price,
    minStay: row.min_stay,
    custom: Boolean(row.custom_type),
  }));

  return (
    <div className="dashboard-page space-y-6">
      {/* Top Breadcrumb */}
      <button
        onClick={() => router.push("/dashboard/listings")}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} /> Back to listings
      </button>

      {/* Listing Header Banner */}
      <div className="card relative overflow-hidden rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <div className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/30">
              <Building2 size={26} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge variant={pricingState === "enabled" ? "healthy" : pricingState === "disabled" ? "warning" : "pending"} label={pricingState === "enabled" ? "DYNAMIC ON" : pricingState === "disabled" ? "REVIEW NEEDED" : "STATUS UNAVAILABLE"} />
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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-xs font-bold text-white transition-colors hover:bg-accent/90 md:w-auto"
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
          value={money(m?.revenue, currency)}
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
          value={`${money(m?.adr, currency)}`}
          detail={`RevPAR: ${money(m?.revpar, currency)}`}
          icon={Sparkles}
          tone="neutral"
        />
      </div>
      {workspaceQuery.data&&<section className="card rounded-2xl p-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Info label="Portfolio" value={workspaceQuery.data.listing.portfolio?.name||"Unassigned"}/><Info label="Connection" value={`${workspaceQuery.data.listing.connection?.displayName||"Unknown"} · ${workspaceQuery.data.listing.connection?.status||"unknown"}`}/><Info label="Last synchronized" value={workspaceQuery.data.listing.lastSynchronizedAt?new Date(workspaceQuery.data.listing.lastSynchronizedAt).toLocaleString():"Not recorded"}/><Info label="Property profiles" value={(workspaceQuery.data.listing.propertyProfiles||[]).join(", ")||"Not configured"}/></div></section>}

      {workspace?.liveData && (
        <section className="card rounded-2xl p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-foreground">Live data coverage</h3>
              <p className="mt-1 text-[10px] text-slate-500">
                {workspace.liveData.available.length} Wheelhouse datasets loaded · refreshed {new Date(workspace.liveData.fetchedAt).toLocaleString()}
              </p>
            </div>
            <StatusBadge
              variant={workspace.liveData.unavailable.length ? "warning" : "healthy"}
              label={workspace.liveData.unavailable.length ? `${workspace.liveData.unavailable.length} OPTIONAL FEEDS UNAVAILABLE` : "ALL FEEDS AVAILABLE"}
            />
          </div>
          {workspace.liveData.unavailable.length > 0 && (
            <p className="mt-3 text-[10px] leading-4 text-slate-500">
              Unavailable for this listing or plan: {workspace.liveData.unavailable.map(humanize).join(", ")}. Available datasets remain live and usable.
            </p>
          )}
        </section>
      )}

      {/* Navigation Tabs */}
      <div className="mobile-scroll-row flex gap-6 border-b border-border text-xs font-semibold">
        {[
          { id: "audit", label: "Audit & Diagnostics", icon: Bot },
          { id: "simulator", label: "Strategy Simulator", icon: Zap },
          { id: "comps", label: "Market & Comps Comparison", icon: TrendingUp },
          { id: "operations", label: "Intelligence & Actions", icon: AlertTriangle },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex shrink-0 items-center gap-2 py-3 border-b-2 transition-colors ${
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
                Dynamic pricing is {isDynamic ? "active" : "inactive"}. The latest verified snapshot reports {m?.occupancy != null ? `${pct(m.occupancy)} occupancy` : "no occupancy value"}, {m?.adr != null ? `${money(m.adr, currency)} ADR` : "no ADR value"}, and {m?.revpar != null ? `${money(m.revpar, currency)} RevPAR` : "no RevPAR value"}.
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
      {activeTab === "audit" && workspace && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="card rounded-2xl p-5">
            <h3 className="text-sm font-bold">Rolling performance windows</h3>
            <p className="mt-1 text-[10px] text-slate-500">Forward-looking Wheelhouse KPIs, not extrapolated values.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[7, 30, 60, 90].map((days) => (
                <div key={days} className="rounded-xl border border-border bg-elevated p-3">
                  <div className="text-[9px] font-mono uppercase text-slate-500">Next {days} days</div>
                  <div className="mt-2 text-sm font-bold">{metricPercent(workspace.performance.rolling, "occupancy", `0_${days}`)}</div>
                  <div className="mt-1 text-[10px] text-slate-500">{money(metricValue(workspace.performance.rolling, "revenue", `0_${days}`), currency)} revenue</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card rounded-2xl p-5">
            <h3 className="text-sm font-bold">Wheelhouse system flags</h3>
            <p className="mt-1 text-[10px] text-slate-500">Read-only provider signals attached to this listing.</p>
            {workspace.listing.flags?.length ? (
              <div className="mt-4 space-y-2">
                {workspace.listing.flags.map((flag) => (
                  <div key={flag.name} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="text-xs font-semibold text-amber-300">{humanize(flag.name)}</div>
                    {flag.description && <p className="mt-1 text-[10px] leading-4 text-slate-400">{flag.description}</p>}
                  </div>
                ))}
              </div>
            ) : <p className="mt-4 text-xs text-slate-500">No active system flags were returned.</p>}
          </div>
        </section>
      )}

      {activeTab==="operations"&&<div className="space-y-5">{workspaceQuery.isLoading?<div className="card rounded-2xl p-6 text-xs text-slate-500">Loading organization-scoped intelligence…</div>:workspaceQuery.error?<ErrorState error={workspaceQuery.error} onRetry={()=>workspaceQuery.refetch()}/>:workspaceQuery.data&&<><section className="grid gap-4 md:grid-cols-2"><OperationalList title="Active incidents" empty="No active incidents for this listing." items={(workspaceQuery.data.intelligence.incidents||[]).filter((x:any)=>x.status==="open")} open={(item:any)=>setSelectedWork({kind:"incident",id:item.externalId||item.id})}/><OperationalList title="Active opportunities" empty="No active opportunities currently meet deterministic evidence thresholds." items={(workspaceQuery.data.intelligence.opportunities||[]).filter((x:any)=>["open","under_review","approved"].includes(x.status))} open={(item:any)=>setSelectedWork({kind:"opportunity",id:item.id})}/></section><section className="card rounded-2xl p-5"><h3 className="text-sm font-bold">Live pricing state</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Info label="Base price" value={money(workspaceQuery.data.pricing.preferences?.base_price, currency)}/><Info label="Automatic pricing" value={workspaceQuery.data.pricing.preferences?.dynamic_pricing_enabled===false?"Disabled":"Enabled"}/><Info label="Rate posting" value={workspaceQuery.data.pricing.preferences?.automatic_rate_posting_enabled===false?"Disabled":"Enabled"}/><Info label="Minimum stay" value={workspaceQuery.data.pricing.preferences?.minimum_stay||workspaceQuery.data.pricing.preferences?.min_stay||"Unavailable"}/></div><RecordList title="Recent pricing changes" empty="No recent Wheelhouse pricing changes were returned." items={workspaceQuery.data.pricing.recentChanges?.data||workspaceQuery.data.pricing.recentChanges||[]}/></section><section className="grid gap-4 lg:grid-cols-2"><StatusList title="Revenue actions and verification" empty="No revenue action has been executed for this listing." items={workspaceQuery.data.operations.actions||[]}/><StatusList title="Measured outcomes" empty="No completed measurement window is available yet." items={workspaceQuery.data.operations.outcomes||[]}/><StatusList title="Event and weather signals" empty="No active market signal affects this listing." items={workspaceQuery.data.intelligence.signals||[]}/><StatusList title="Activity and reports" empty="No listing activity has been recorded." items={[...(workspaceQuery.data.operations.activity||[]),...(workspaceQuery.data.operations.reports||[])]}/></section></>}</div>}

      {activeTab === "operations" && workspace && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="card rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold">Upcoming reservations</h3>
                <p className="mt-1 text-[10px] text-slate-500">
                  Stay dates {workspace.liveData?.reservationWindow.startDate} through {workspace.liveData?.reservationWindow.endDate}
                </p>
              </div>
              <span className="text-xs font-bold text-accent">{workspace.operations.reservations.length}</span>
            </div>
            {workspace.operations.reservations.length ? (
              <div className="mt-4 max-h-80 space-y-2 overflow-auto">
                {workspace.operations.reservations.slice(0, 50).map((reservation) => (
                  <div key={reservation.id} className="rounded-xl border border-border bg-elevated p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold">{formatDateRange(reservation.start_date, reservation.end_date)}</div>
                        <div className="mt-1 text-[10px] text-slate-500">
                          {reservation.source_name || "Connected channel"} · {reservation.num_guests ?? "—"} guests
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold">{money(reservation.total_price, reservation.currency || currency)}</div>
                        <div className="mt-1 text-[9px] uppercase text-slate-500">{reservation.status || "booked"}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="mt-4 text-xs text-slate-500">No upcoming reservations were returned for this window.</p>}
          </div>
          <div className="card rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold">Forward pricing calendar</h3>
                <p className="mt-1 text-[10px] text-slate-500">Recommended rates, minimum stay, and custom overrides.</p>
              </div>
              {workspace.pricing.pricingTier && <StatusBadge variant="neutral" label={`${workspace.pricing.pricingTier.name} · ${workspace.pricing.pricingTier.horizon}D`} />}
            </div>
            {priceComparison.length ? (
              <div className="mt-4 max-h-80 overflow-auto">
                <table className="w-full text-left text-[10px]">
                  <thead className="sticky top-0 bg-card text-slate-500"><tr><th className="py-2">Stay date</th><th>Rate</th><th>Market</th><th>Min stay</th></tr></thead>
                  <tbody>
                    {priceComparison.slice(0, 45).map((row: any) => (
                      <tr key={row.date} className="border-t border-border">
                        <td className="py-2.5 text-slate-300">{formatShortDate(row.date)}</td>
                        <td className="font-semibold">{money(row.listing, currency)}{row.custom ? " *" : ""}</td>
                        <td className="text-slate-400">{money(row.market, currency)}</td>
                        <td className="text-slate-400">{row.minStay ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="mt-4 text-xs text-slate-500">No forward price recommendations were returned.</p>}
          </div>
        </section>
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

            {capabilitiesQuery.data?.permissions?.canAnalyze === false ? (
              <div className="mt-6 rounded-xl border border-amber-500/15 p-4 text-xs text-amber-200">Analyst permission is required to run live strategy previews.</div>
            ) : strategiesQuery.isLoading ? (
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
                            {money(strat.projectedRevenue, currency)}
                          </div>
                          <div className={`text-xs font-semibold ${strat.estimatedUplift >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {strat.estimatedUplift >= 0 ? "+" : ""}{money(strat.estimatedUplift, currency)} estimated uplift
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
                        Preview only · requires a write-capable connection, manager permission, an active listing, and synchronization within six hours
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
              <div className="mt-2 text-xl font-bold text-foreground">{money(m?.adr, currency)}</div>
              <div className="mt-1 text-xs text-slate-400">Latest verified listing KPI</div>
            </div>
            <div className="rounded-xl border border-border bg-elevated p-4">
              <div className="text-[10px] uppercase font-mono text-slate-500">Listing Occupancy</div>
              <div className="mt-2 text-xl font-bold text-foreground">{m?.occupancy != null ? pct(m.occupancy) : "—"}</div>
              <div className="mt-1 text-xs text-slate-400">Latest verified listing KPI</div>
            </div>
            <div className="rounded-xl border border-border bg-elevated p-4">
              <div className="text-[10px] uppercase font-mono text-slate-500">Listing RevPAR</div>
              <div className="mt-2 text-xl font-bold text-foreground">{money(m?.revpar, currency)}</div>
              <div className="mt-1 text-xs text-slate-400">Latest verified listing KPI</div>
            </div>
          </div>

          <div className="grid gap-4 pt-2 xl:grid-cols-2">
            <div className="rounded-xl border border-border bg-elevated p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold">60-day price position</h4>
                  <p className="mt-1 text-[10px] text-slate-500">Listing recommendation versus neighborhood median.</p>
                </div>
                <span className="text-[9px] font-mono uppercase text-slate-500">{currency}</span>
              </div>
              {priceComparison.some((row: any) => row.market != null) ? (
                <div className="mt-4 h-64 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={priceComparison} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(148,163,184,.10)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 9, fill: "#64748b" }} minTickGap={28} />
                      <YAxis tick={{ fontSize: 9, fill: "#64748b" }} />
                      <Tooltip contentStyle={{ background: "#121a17", border: "1px solid rgba(148,163,184,.18)", borderRadius: 12, fontSize: 11 }} formatter={(value) => money(Number(value), currency)} labelFormatter={(label) => formatShortDate(String(label ?? ""))} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Line type="monotone" dataKey="listing" name="Listing rate" stroke="#d8f45b" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="market" name="Neighborhood median" stroke="#60a5fa" strokeWidth={2} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="mt-4 text-xs text-slate-500">Neighborhood pricing is not available for this listing or market.</p>}
            </div>

            <div className="rounded-xl border border-border bg-elevated p-4">
              <div>
                <h4 className="text-xs font-bold">Monthly revenue history</h4>
                <p className="mt-1 text-[10px] text-slate-500">Up to 15 months of listing and comp-set performance.</p>
              </div>
              {monthlyKpis.length ? (
                <div className="mt-4 h-64 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyKpis} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(148,163,184,.10)" vertical={false} />
                      <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 9, fill: "#64748b" }} minTickGap={18} />
                      <YAxis tick={{ fontSize: 9, fill: "#64748b" }} />
                      <Tooltip contentStyle={{ background: "#121a17", border: "1px solid rgba(148,163,184,.18)", borderRadius: 12, fontSize: 11 }} formatter={(value) => money(Number(value), workspace?.performance.monthly?.currency || currency)} labelFormatter={(label) => formatMonth(String(label ?? ""))} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="revenue" name="Listing" fill="#d8f45b" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="comp_set_revenue" name="Comp set" fill="#60a5fa" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="mt-4 text-xs text-slate-500">Monthly KPI history is not available for this listing.</p>}
            </div>
          </div>

          {workspace?.pricing.monthlySeasonality?.REC && (
            <div className="rounded-xl border border-border bg-elevated p-4">
              <h4 className="text-xs font-bold">Recommended seasonality curve</h4>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-12">
                {Object.entries(workspace.pricing.monthlySeasonality.REC).map(([month, factor]) => (
                  <div key={month} className="rounded-lg border border-border p-2 text-center">
                    <div className="text-[9px] uppercase text-slate-500">{monthName(Number(month))}</div>
                    <div className={`mt-1 text-xs font-bold ${factor >= 1 ? "text-emerald-400" : "text-amber-300"}`}>{Number(factor).toFixed(2)}×</div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
      {selectedWork&&<WorkItemWorkspace key={`${selectedWork.kind}:${selectedWork.id}`} kind={selectedWork.kind} id={selectedWork.id} onClose={()=>setSelectedWork(null)}/>}</div>
  );
}

function Info({label,value}:{label:string;value:string}){return <div className="min-w-0 rounded-xl border border-border bg-elevated p-3"><div className="text-[9px] uppercase text-slate-500">{label}</div><div className="mt-1 break-words text-xs font-semibold">{value}</div></div>}
function OperationalList({title,empty,items,open}:{title:string;empty:string;items:any[];open:(v:any)=>void}){return <section className="card rounded-2xl p-5"><h3 className="text-sm font-bold">{title}</h3>{items.length?<div className="mt-3 space-y-2">{items.map(item=><button key={item.id||item._id} onClick={()=>open(item)} className="w-full rounded-xl border border-border bg-elevated p-3 text-left"><div className="text-xs font-semibold">{item.title||String(item.type).replaceAll("_"," ")}</div><div className="mt-1 text-[10px] text-slate-500">{item.status} · {item.confidence||0}% confidence · Open evidence and decision workspace</div></button>)}</div>:<p className="mt-3 text-xs text-slate-500">{empty}</p>}</section>}
function StatusList({title,empty,items}:{title:string;empty:string;items:any[]}){return <section className="card rounded-2xl p-5"><h3 className="text-sm font-bold">{title}</h3>{items.length?<div className="mt-3 max-h-80 space-y-2 overflow-auto">{items.slice(0,30).map((item,index)=><div key={item.id||item._id||index} className="rounded-xl border border-border bg-elevated p-3"><div className="flex items-start gap-2"><span className="min-w-0 flex-1 text-xs font-semibold">{item.title||item.actionType||item.type||item.action||"Recorded item"}</span><span className="text-[9px] font-bold uppercase text-slate-500">{item.status||item.deliveryStatus||"recorded"}</span></div><p className="mt-1 text-[10px] text-slate-500">{statusDetail(item)}</p>{(item.createdAt||item.calculatedAt)&&<p className="mt-1 text-[9px] text-slate-600">{new Date(item.createdAt||item.calculatedAt).toLocaleString()}</p>}</div>)}</div>:<p className="mt-3 text-xs text-slate-500">{empty}</p>}</section>}
function statusDetail(item:any){if(item.message)return item.message;if(item.errorDetails?.reason)return item.errorDetails.reason;if(item.verificationResult?.matched===true)return"Wheelhouse state verified";if(item.verificationResult?.matched===false)return"Verification did not match";return"Stored in the organization activity history";}
function RecordList({title,empty,items}:{title:string;empty:string;items:any}){const rows=Array.isArray(items)?items:[];return <div className="mt-5"><h4 className="text-xs font-bold">{title}</h4>{rows.length?<div className="mt-2 grid gap-2 sm:grid-cols-2">{rows.slice(0,12).map((item:any,index:number)=><div key={item.id||item.stay_date||index} className="rounded-lg border border-border bg-elevated p-3 text-[10px] text-slate-400">{item.stay_date||item.date||item.created_at||"Pricing record"} · {item.price!=null?money(item.price):item.action||item.change||"Updated"}</div>)}</div>:<p className="mt-2 text-xs text-slate-500">{empty}</p>}</div>}

function metricValue(
  metrics: Record<string, Record<string, number> | number | null> | null | undefined,
  key: string,
  period: string,
) {
  const metric = metrics?.[key];
  if (!metric || typeof metric !== "object") return undefined;
  const value = metric[period];
  return typeof value === "number" ? value : undefined;
}

function metricPercent(
  metrics: Record<string, Record<string, number> | number | null> | null | undefined,
  key: string,
  period: string,
) {
  const value = metricValue(metrics, key, period);
  return value == null ? "—" : pct(value);
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatShortDate(value: string) {
  if (!value) return "—";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatMonth(value: string) {
  if (!value) return "—";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function formatDateRange(start: string, end: string) {
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

function monthName(month: number) {
  return new Date(Date.UTC(2026, Math.max(0, month - 1), 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}
