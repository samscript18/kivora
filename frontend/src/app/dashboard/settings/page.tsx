"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getTelegramStatus,
  createTelegramLink,
  disconnectTelegram,
  getCapabilities,
  getSegments,
  underwriteProperty,
  QUERY_KEYS
} from "@/lib/api";
import { useState } from "react";
import {
  MessageCircle,
  Link2,
  Unlink,
  ExternalLink,
  Building2,
  House,
  ShieldCheck,
  Zap,
  CloudSun,
  Sparkles
} from "lucide-react";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { ActionConfirmDialog } from "@/components/ui/ActionConfirmDialog";
import { toast } from "sonner";
import type { PortfolioSegment } from "@/types/api";
import { useOnboardingStore } from "@/store/onboarding";
import { ExternalIntelligencePanel, NotificationPreferencesPanel, PortfolioSettingsPanel, TeamSettingsPanel, WheelhouseConnectionsPanel, WorkspaceSettingsPanel } from "@/components/dashboard/OperationsSettings";

const money = (value: number | undefined) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);

export default function SettingsPage() {
  const openSetupGuide = useOnboardingStore((state) => state.open);
  const [activeTab, setActiveTab] = useState<"integrations" | "intelligence" | "notifications" | "workspace" | "team" | "portfolios" | "segments" | "underwrite">("integrations");
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);

  // Underwrite Form state
  const [address, setAddress] = useState("");
  const [marketId, setMarketId] = useState("");
  const [cost, setCost] = useState("");
  const [expenses, setExpenses] = useState("");

  const telegramStatusQuery = useQuery({
    queryKey: QUERY_KEYS.telegramStatus,
    queryFn: getTelegramStatus,
  });

  const capabilitiesQuery = useQuery({
    queryKey: QUERY_KEYS.capabilities,
    queryFn: getCapabilities,
  });

  const segmentsQuery = useQuery({
    queryKey: QUERY_KEYS.segments,
    queryFn: getSegments,
  });

  const createTelegramLinkMutation = useMutation({
    mutationFn: createTelegramLink,
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.success("Mobile companion opened", {
        description: "Tap Start in the mobile companion to finish connecting.",
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not generate link"),
  });

  const disconnectTelegramMutation = useMutation({
    mutationFn: disconnectTelegram,
    onSuccess: () => {
      toast.success("Mobile companion disconnected");
      telegramStatusQuery.refetch();
      setDisconnectConfirm(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Disconnect failed"),
  });

  const underwriteMutation = useMutation({
    mutationFn: underwriteProperty,
    onSuccess: () => {
      toast.success("Underwriting Analysis Complete");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Underwriting failed"),
  });

  const telegramData = telegramStatusQuery.data;
  const capabilities = capabilitiesQuery.data;
  const eventIntelligence = capabilities?.marketIntelligence?.ticketmaster;
  const weatherIntelligence = capabilities?.marketIntelligence?.openweather;
  const segments: PortfolioSegment[] = segmentsQuery.data?.segments ?? [];

  const isValidUnderwrite = address && Number(marketId) > 0 && Number(cost) > 0 && Number(expenses) >= 0;

  return (
    <div className="mx-auto max-w-[1440px] p-4 sm:p-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Platform Configuration</div>
          <h2 className="font-display mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
            Settings & Integrations
          </h2>
          <p className="mt-1 text-[12px] text-slate-400">
            Manage data source connections, mobile companion bot settings, and portfolio segments.
          </p>
        </div>
        <button onClick={openSetupGuide} className="rounded-xl border border-border bg-white/[0.02] px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/[0.05]">Open setup guide</button>
      </div>

      {/* Tabs */}
      <div className="flex max-w-full gap-5 overflow-x-auto border-b border-border text-xs font-semibold scrollbar-none">
        <button
          onClick={() => setActiveTab("integrations")}
          className={`flex shrink-0 items-center gap-2 py-3 border-b-2 transition-colors ${
            activeTab === "integrations" ? "border-accent text-accent" : "border-transparent text-slate-400 hover:text-foreground"
          }`}
        >
          <Zap size={15} /> Integrations & Mobile Bot
        </button>
        <button onClick={() => setActiveTab("workspace")} className={`flex shrink-0 items-center gap-2 py-3 border-b-2 transition-colors ${activeTab === "workspace" ? "border-accent text-accent" : "border-transparent text-slate-400 hover:text-foreground"}`}><ShieldCheck size={15}/> Organization</button>
        <button onClick={() => setActiveTab("team")} className={`flex shrink-0 items-center gap-2 py-3 border-b-2 transition-colors ${activeTab === "team" ? "border-accent text-accent" : "border-transparent text-slate-400 hover:text-foreground"}`}><Building2 size={15}/> Team</button>
        <button onClick={() => setActiveTab("portfolios")} className={`flex shrink-0 items-center gap-2 py-3 border-b-2 transition-colors ${activeTab === "portfolios" ? "border-accent text-accent" : "border-transparent text-slate-400 hover:text-foreground"}`}><Building2 size={15}/> Portfolios</button>
        <button onClick={() => setActiveTab("intelligence")} className={`flex shrink-0 items-center gap-2 py-3 border-b-2 transition-colors ${activeTab === "intelligence" ? "border-accent text-accent" : "border-transparent text-slate-400 hover:text-foreground"}`}><Sparkles size={15}/> Intelligence</button>
        <button onClick={() => setActiveTab("notifications")} className={`flex shrink-0 items-center gap-2 py-3 border-b-2 transition-colors ${activeTab === "notifications" ? "border-accent text-accent" : "border-transparent text-slate-400 hover:text-foreground"}`}><MessageCircle size={15}/> Notifications</button>
        <button
          onClick={() => setActiveTab("segments")}
          className={`flex shrink-0 items-center gap-2 py-3 border-b-2 transition-colors ${
            activeTab === "segments" ? "border-accent text-accent" : "border-transparent text-slate-400 hover:text-foreground"
          }`}
        >
          <Building2 size={15} /> Portfolio Segments
        </button>
        <button
          onClick={() => setActiveTab("underwrite")}
          className={`flex shrink-0 items-center gap-2 py-3 border-b-2 transition-colors ${
            activeTab === "underwrite" ? "border-accent text-accent" : "border-transparent text-slate-400 hover:text-foreground"
          }`}
        >
          <House size={15} /> Deal Underwriting Tool
        </button>
      </div>

      {/* Integrations Tab */}
      {activeTab === "integrations" && (
        <div className="grid gap-4 md:grid-cols-2">
          <WheelhouseConnectionsPanel />
          {/* Telegram Mobile Companion */}
          <article className="card rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/10 text-sky-400">
                  <MessageCircle size={20} />
                </span>
                <div>
                  <h3 className="font-bold text-foreground text-sm">Mobile Companion</h3>
                  <p className="text-[11px] text-slate-500">Real-time alerts, daily briefing, and one-tap approvals</p>
                </div>
              </div>
              <StatusBadge
                variant={telegramData?.connected ? "healthy" : "disconnected"}
                label={telegramData?.connected ? "CONNECTED" : "DISCONNECTED"}
              />
            </div>

            {telegramStatusQuery.isLoading ? (
              <div className="text-xs text-slate-500">Checking companion connection...</div>
            ) : telegramData?.connected ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-xs text-slate-300">
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Link2 size={14} /> Mobile companion linked
                  </div>
                  <div className="mt-1">
                    {telegramData.connection?.firstName || telegramData.connection?.username || "Linked Account"}
                    {telegramData.connection?.username ? ` (@${telegramData.connection.username})` : ""}
                  </div>
                </div>
                <button
                  onClick={() => setDisconnectConfirm(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-semibold"
                >
                  <Unlink size={13} /> Disconnect companion
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  Connect the mobile companion to receive daily briefings and authorize pricing recommendations on the go.
                </p>
                <button
                  disabled={createTelegramLinkMutation.isPending}
                  onClick={() => createTelegramLinkMutation.mutate()}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
                >
                  <ExternalLink size={14} />
                  {createTelegramLinkMutation.isPending ? "Connecting..." : "Connect Mobile Companion"}
                </button>
              </div>
            )}
          </article>

          {/* Ticketmaster */}
          <article className="card rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/10 text-blue-400">
                  <Sparkles size={20} />
                </span>
                <div>
                  <h3 className="font-bold text-foreground text-sm">Event Intelligence</h3>
                  <p className="text-[11px] text-slate-500">Live concert, sports, and venue demand signals</p>
                </div>
              </div>
              <StatusBadge
                variant={eventIntelligence?.configured ? "healthy" : "disconnected"}
                label={eventIntelligence?.configured ? "ACTIVE" : "NOT CONFIGURED"}
              />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Detects local events near listings to capture event-driven demand surges and surge pricing windows.
            </p>
          </article>

          {/* OpenWeather */}
          <article className="card rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/10 text-sky-400">
                  <CloudSun size={20} />
                </span>
                <div>
                  <h3 className="font-bold text-foreground text-sm">Weather Intelligence</h3>
                  <p className="text-[11px] text-slate-500">Weather forecast and travel impact data</p>
                </div>
              </div>
              <StatusBadge
                variant={weatherIntelligence?.configured ? "healthy" : "disconnected"}
                label={weatherIntelligence?.configured ? "ACTIVE" : "NOT CONFIGURED"}
              />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Monitors seasonal weather shifts and severe weather warnings that affect regional booking pace.
            </p>
          </article>
        </div>
      )}
      {activeTab === "portfolios" && <PortfolioSettingsPanel />}
      {activeTab === "intelligence" && <ExternalIntelligencePanel />}
      {activeTab === "notifications" && <NotificationPreferencesPanel />}

      {activeTab === "workspace" && <WorkspaceSettingsPanel />}
      {activeTab === "team" && <TeamSettingsPanel />}

      {/* Segments Tab */}
      {activeTab === "segments" && (
        <div className="space-y-4">
          {segmentsQuery.isLoading ? (
            <div className="text-xs text-slate-500">Loading portfolio segments...</div>
          ) : segmentsQuery.error ? (
            <ErrorState error={segmentsQuery.error} onRetry={() => segmentsQuery.refetch()} />
          ) : segments.length === 0 ? (
            <div className="card rounded-2xl">
              <EmptyState heading="No Portfolio Segments" body="No sub-portfolios or market segments currently defined." />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {segments.map((seg) => (
                <article key={seg.id} className="card rounded-2xl p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-foreground text-sm">{seg.name || `Segment ${seg.id}`}</h3>
                    <SourceBadge source="wheelhouse" />
                  </div>
                  <p className="text-xs text-slate-400">{seg.description || seg.type || "Logical portfolio segment"}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Underwrite Tab */}
      {activeTab === "underwrite" && (
        <div className="card rounded-2xl p-6 space-y-6 max-w-3xl">
          <div>
            <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2">
              <House className="text-accent" size={18} /> Live Market Acquisition Underwriting
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Analyze prospective properties using live market data and explicit investment inputs.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[10px] uppercase font-mono text-slate-500 block mb-1">Property Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 124 Ocean Drive, Miami FL"
                className="w-full rounded-xl border border-border bg-elevated p-3 text-xs text-foreground outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-mono text-slate-500 block mb-1">Market ID</label>
              <input
                type="number"
                value={marketId}
                onChange={(e) => setMarketId(e.target.value)}
                placeholder="e.g. 101"
                className="w-full rounded-xl border border-border bg-elevated p-3 text-xs text-foreground outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-mono text-slate-500 block mb-1">Acquisition Cost ($)</label>
              <input
                type="number"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="e.g. 750000"
                className="w-full rounded-xl border border-border bg-elevated p-3 text-xs text-foreground outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-mono text-slate-500 block mb-1">Annual Expenses ($)</label>
              <input
                type="number"
                value={expenses}
                onChange={(e) => setExpenses(e.target.value)}
                placeholder="e.g. 45000"
                className="w-full rounded-xl border border-border bg-elevated p-3 text-xs text-foreground outline-none focus:border-accent"
              />
            </div>
          </div>

          <button
            disabled={!isValidUnderwrite || underwriteMutation.isPending}
            onClick={() =>
              underwriteMutation.mutate({
                address,
                marketId: Number(marketId),
                acquisitionCost: Number(cost),
                annualExpenses: Number(expenses),
              })
            }
            className="rounded-xl bg-accent px-6 py-3 text-xs font-bold text-white hover:bg-accent/90 disabled:opacity-40 transition-colors"
          >
            {underwriteMutation.isPending ? "Analyzing Market Data..." : "Run Underwriting Analysis"}
          </button>

          {underwriteMutation.data && (
            <div className="space-y-4 pt-4 border-t border-white/5">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-border bg-elevated p-4">
                  <div className="text-[9px] uppercase font-mono text-slate-500">Annual Revenue</div>
                  <div className="text-lg font-bold text-foreground mt-1">{money(underwriteMutation.data.annualRevenue)}</div>
                </div>
                <div className="rounded-xl border border-border bg-elevated p-4">
                  <div className="text-[9px] uppercase font-mono text-slate-500">Net Operating Income</div>
                  <div className="text-lg font-bold text-emerald-400 mt-1">{money(underwriteMutation.data.netOperatingIncome)}</div>
                </div>
                <div className="rounded-xl border border-border bg-elevated p-4">
                  <div className="text-[9px] uppercase font-mono text-slate-500">Est. Occupancy</div>
                  <div className="text-lg font-bold text-foreground mt-1">{underwriteMutation.data.occupancy}%</div>
                </div>
                <div className="rounded-xl border border-border bg-elevated p-4">
                  <div className="text-[9px] uppercase font-mono text-slate-500">Cash-on-Cash ROI</div>
                  <div className="text-lg font-bold text-emerald-400 mt-1">{underwriteMutation.data.cashOnCashRoi}%</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <ShieldCheck size={16} className="text-emerald-400" />
                Verified analysis calculated from live market report data.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Disconnect Telegram Confirmation */}
      <ActionConfirmDialog
        open={disconnectConfirm}
        onClose={() => setDisconnectConfirm(false)}
        onConfirm={() => disconnectTelegramMutation.mutate()}
        loading={disconnectTelegramMutation.isPending}
        title="Disconnect Mobile Companion"
        description="Are you sure you want to disconnect your mobile companion from Kivora?"
        confirmLabel="Disconnect"
        variant="destructive"
      />
    </div>
  );
}
