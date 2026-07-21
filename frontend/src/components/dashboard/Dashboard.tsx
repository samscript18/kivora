"use client";

import { getDashboard, previewIncident, resolveIncident } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Bot,
  Building2,
  Check,
  ChevronDown,
  CircleDollarSign,
  CloudSun,
  Command,
  FileText,
  Gauge,
  House,
  LayoutDashboard,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ProductView, type WorkspaceView } from "./ProductViews";
import { TelegramSettings } from "./TelegramSettings";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#173f2e] text-[#d8f45b]">
        <Zap size={18} fill="currentColor" />
      </div>
      <div>
        <div className="display text-[20px] font-extrabold tracking-[-.06em]">
          kivora
        </div>
        <div className="mt-[-3px] text-[8px] font-bold uppercase tracking-[.18em] text-[#78827d]">
          Revenue intelligence
        </div>
      </div>
    </div>
  );
}

function Sidebar({
  mobile,
  onClose,
  active,
  onNavigate,
  onSettings,
}: {
  mobile?: boolean;
  onClose?: () => void;
  active: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  onSettings: () => void;
}) {
  const nav = [
    { i: LayoutDashboard, l: "Overview" },
    { i: AlertTriangle, l: "Incidents" },
    { i: Building2, l: "Portfolio" },
    { i: TrendingUp, l: "Opportunities" },
    { i: CloudSun, l: "Market intelligence" },
    { i: Sparkles, l: "Strategy simulator" },
    { i: Users, l: "Portfolios" },
    { i: FileText, l: "Owner briefs" },
    { i: FileText, l: "Reports" },
    { i: Activity, l: "Activity" },
    { i: MessageSquare, l: "AI assistant" },
    { i: House, l: "Underwrite" },
  ];
  return (
    <aside
      className={`${mobile ? "fixed inset-y-0 left-0 z-50 shadow-2xl" : "desktop-only fixed inset-y-0 left-0"} flex w-[248px] flex-col border-r border-[#dfe4e0] bg-[#f9faf9] px-4 py-5`}
    >
      <div className="mb-9 flex items-center justify-between px-2">
        <Logo />
        {mobile && (
          <button onClick={onClose}>
            <X size={20} />
          </button>
        )}
      </div>
      <div className="px-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#9aa39e]">
        Workspace
      </div>
      <nav className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {nav.map(({ i: I, l }) => (
          <button
            key={l}
            onClick={() => {
              onNavigate(l as WorkspaceView);
              onClose?.();
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${active === l ? "bg-[#e8eee9] text-[#173f2e]" : "text-[#66706b] hover:bg-[#f0f3f1]"}`}
          >
            <I size={17} />
            <span className="flex-1 text-left">{l}</span>
          </button>
        ))}
      </nav>
      <div className="mt-4 rounded-2xl bg-[#173f2e] p-4 text-white">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-[#d8f45b]">
          <Bot size={15} /> Live monitoring
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-white/65">
          Portfolio scans run every 2 minutes.
        </p>
      </div>
      <button
        onClick={() => {
          onSettings();
          onClose?.();
        }}
        className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2 text-[12px] font-semibold text-[#65706a]"
      >
        <Settings size={16} /> Settings
      </button>
    </aside>
  );
}

function Metric({
  label,
  value,
  detail,
  icon: I,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: any;
  tone: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card rounded-2xl p-5"
    >
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-semibold text-[#7e8883]">{label}</div>
        <div className={`grid h-8 w-8 place-items-center rounded-lg ${tone}`}>
          <I size={16} />
        </div>
      </div>
      <div className="display mt-3 text-[26px] font-bold tracking-[-.04em]">
        {value}
      </div>
      <div className="mt-1 text-[10px] text-[#8a938e]">{detail}</div>
    </motion.div>
  );
}

function IncidentPanel({
  incident,
  onOpen,
}: {
  incident: any;
  onOpen: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className="overflow-hidden rounded-2xl border border-[#edcfc6] bg-[#fffaf8]"
    >
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fbe4dd] text-[#a5402c]">
          <AlertTriangle size={21} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#f7dfd8] px-2 py-1 text-[9px] font-bold uppercase tracking-[.1em] text-[#9d402f]">
              Critical incident
            </span>
            <span className="text-[10px] text-[#929993]">
              {incident.detectedAt}
            </span>
          </div>
          <h2 className="display mt-2 text-[17px] font-bold tracking-[-.025em]">
            {incident.title}
          </h2>
          <p className="mt-1 text-[11px] text-[#737c77]">
            {incident.listing} · {incident.location}
          </p>
        </div>
        <div className="flex items-center gap-7 sm:border-l sm:border-[#ecdcd6] sm:pl-7">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[.1em] text-[#9c8178]">
              Revenue at risk
            </div>
            <div className="display mt-1 text-xl font-bold text-[#9e402e]">
              {money(incident.revenueAtRisk)}
            </div>
          </div>
          <button
            onClick={onOpen}
            className="flex items-center gap-2 rounded-xl bg-[#173f2e] px-4 py-3 text-[11px] font-bold text-white transition hover:bg-[#20583e]"
          >
            Investigate <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </motion.section>
  );
}

export function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
    retry: 1,
  });
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [active, setActive] = useState<WorkspaceView>("Overview");
  if (isLoading)
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 text-sm text-[#68736d]">
          <span className="live-dot h-2 w-2 rounded-full bg-[#1b6b4a]" />
          Connecting to live revenue engine…
        </div>
      </div>
    );
  if (error || !data)
    return (
      <div className="grid min-h-screen place-items-center bg-[#030303] p-6">
        <div className="glass-card max-w-lg rounded-2xl p-8 text-center">
          <h1 className="text-xl font-bold">Live connection required</h1>
          <p className="mt-3 text-sm text-red-400">
            {error instanceof Error
              ? error.message
              : "The revenue service did not return live data."}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Your workspace connection needs attention. Kivora never substitutes
            synthetic data.
          </p>
          <button
            onClick={() => setSettingsOpen(true)}
            className="mt-5 rounded-xl border border-white/10 px-4 py-3 text-xs font-bold"
          >
            Mobile companion settings
          </button>
        </div>
        <TelegramSettings
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      </div>
    );
  const s = data.summary;
  return (
    <div className="kivora-dashboard min-h-screen bg-[#030303]">
      <Sidebar
        active={active}
        onNavigate={setActive}
        onSettings={() => setSettingsOpen(true)}
      />
      {menu && (
        <Sidebar
          mobile
          active={active}
          onNavigate={setActive}
          onClose={() => setMenu(false)}
          onSettings={() => setSettingsOpen(true)}
        />
      )}
      <main className="min-h-screen md:ml-[248px]">
        <header className="sticky top-0 z-30 flex h-[70px] items-center border-b border-[#e0e5e1] bg-[#f4f6f4]/90 px-4 backdrop-blur-xl sm:px-7">
          <button className="mr-3 md:hidden" onClick={() => setMenu(true)}>
            <Menu size={20} />
          </button>
          <div>
            <h1 className="display text-[17px] font-bold tracking-[-.03em]">
              {active}
            </h1>
            <div className="mt-0.5 flex items-center gap-2 text-[9px] text-[#84908a]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2d9768]" /> Live
              portfolio intelligence
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="relative grid h-9 w-9 place-items-center rounded-xl border border-[#dfe4e0] bg-white text-[#637069]">
              <Bell size={15} />
            </button>
          </div>
        </header>
        {active === "Overview" ? (
          <div className="mx-auto max-w-[1440px] p-4 sm:p-7">
            <div className="mb-6">
              <div className="text-[11px] text-[#77817c]">
                {new Date().toLocaleDateString(undefined, {
                  dateStyle: "full",
                })}
              </div>
              <h2 className="display mt-1 text-2xl font-bold tracking-[-.04em] sm:text-[29px]">
                Live portfolio overview
              </h2>
              <p className="mt-1 text-[12px] text-[#7a8580]">
                All figures below come from the latest verified portfolio scan.
              </p>
            </div>
            <section className="card mb-5 overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between border-b border-white/8 p-5">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[.18em] text-accent">
                    AI Revenue War Room
                  </div>
                  <h3 className="display mt-1 text-lg font-bold">
                    Today&apos;s highest-impact actions
                  </h3>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 font-mono text-[9px] text-slate-400">
                  LIVE PRIORITY QUEUE
                </span>
              </div>
              <div className="divide-y divide-white/6">
                {data.priorities?.length ? (
                  data.priorities
                    .slice(0, 5)
                    .map((priority: any, index: number) => (
                      <div
                        key={priority.id}
                        className="flex items-center gap-4 p-4"
                      >
                        <span className="font-mono text-xs text-accent">
                          0{index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-bold">
                            {priority.title}
                          </div>
                          <div className="mt-1 truncate text-[10px] text-slate-500">
                            {priority.property} · {priority.action}
                          </div>
                        </div>
                        <div className="text-right">
                          {priority.impact != null && (
                            <div className="text-xs font-bold text-accent-2">
                              {money(priority.impact)}
                            </div>
                          )}
                          <div className="text-[9px] text-slate-500">
                            {priority.confidence}% confidence
                          </div>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="p-5 text-xs text-slate-500">
                    No actions are currently ranked.
                  </div>
                )}
              </div>
            </section>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Metric
                label="Portfolio health"
                value={`${s.health}/100`}
                detail="Latest listing snapshots"
                icon={ShieldCheck}
                tone="bg-[#e4f2ea] text-[#26704f]"
              />
              <Metric
                label="30-day revenue"
                value={money(s.revenue)}
                detail="Latest verified KPI total"
                icon={CircleDollarSign}
                tone="bg-[#edf5cf] text-[#5c7219]"
              />
              <Metric
                label="Revenue at risk"
                value={money(s.atRisk)}
                detail="Detected live incidents"
                icon={AlertTriangle}
                tone="bg-[#fbe6e0] text-[#aa4935]"
              />
              <Metric
                label="Opportunities"
                value={String(s.opportunities)}
                detail="Derived from open incidents"
                icon={TrendingUp}
                tone="bg-[#e5ebf5] text-[#49678f]"
              />
              <Metric
                label="30-day occupancy"
                value={`${s.occupancy}%`}
                detail="Latest verified KPI average"
                icon={Gauge}
                tone="bg-[#eee8f8] text-[#73579a]"
              />
            </div>
            <div className="mt-5">
              {data.incident ? (
                <IncidentPanel
                  incident={data.incident}
                  onOpen={() => {
                    setSelectedIncident(data.incident);
                    setOpen(true);
                  }}
                />
              ) : (
                <div className="card rounded-2xl p-6 text-sm text-[#68736d]">
                  No open incidents in the latest live scan.
                </div>
              )}
            </div>
            <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
              <section className="card rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="display text-[14px] font-bold">
                      Portfolio revenue
                    </h3>
                    <p className="mt-1 text-[10px] text-[#8a938e]">
                      Actual versus local market benchmark
                    </p>
                  </div>
                  <button className="rounded-lg border border-[#e2e6e3] px-3 py-2 text-[10px] font-semibold">
                    Last 7 days{" "}
                    <ChevronDown className="ml-1 inline" size={11} />
                  </button>
                </div>
                <div className="mt-5 h-[230px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.trend}>
                      <defs>
                        <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0"
                            stopColor="#1b6b4a"
                            stopOpacity=".24"
                          />
                          <stop
                            offset="1"
                            stopColor="#1b6b4a"
                            stopOpacity="0"
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#edf0ed" />
                      <XAxis
                        dataKey="day"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 9, fill: "#89938d" }}
                      />
                      <Tooltip
                        formatter={(v) => money(Number(v))}
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid #e2e6e3",
                          fontSize: 11,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#1b6b4a"
                        strokeWidth={2.2}
                        fill="url(#rev)"
                      />
                      <Area
                        type="monotone"
                        dataKey="market"
                        stroke="#aeb7b1"
                        strokeDasharray="4 4"
                        fill="transparent"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section className="card rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="display text-[14px] font-bold">
                      Top opportunities
                    </h3>
                    <p className="mt-1 text-[10px] text-[#8a938e]">
                      Ranked by recoverable revenue
                    </p>
                  </div>
                  <MoreHorizontal size={17} className="text-[#7e8883]" />
                </div>
                <div className="mt-4 divide-y divide-[#edf0ed]">
                  {data.opportunities.map((o: any, i: number) => (
                    <div
                      key={o.property}
                      className="flex items-center gap-3 py-3.5"
                    >
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#edf2ee] text-[10px] font-bold text-[#446052]">
                        0{i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-bold">
                          {o.property}
                        </div>
                        <div className="mt-1 truncate text-[9px] text-[#87908b]">
                          {o.action} · {o.confidence}% confidence
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] font-bold text-[#1b6b4a]">
                          +{money(o.impact)}
                        </div>
                        <span className="text-[8px] uppercase text-[#969f99]">
                          {o.tag}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="mt-3 flex w-full items-center justify-center gap-1 text-[10px] font-bold text-[#366a52]">
                  View all opportunities <ArrowRight size={11} />
                </button>
              </section>
            </div>
            <section className="card mt-5 rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="display text-[14px] font-bold">
                    Kivora activity
                  </h3>
                  <p className="mt-1 text-[10px] text-[#8a938e]">
                    Autonomous actions and portfolio checks
                  </p>
                </div>
                <span className="flex items-center gap-2 text-[9px] font-bold text-[#47705d]">
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#2a8e61]" />{" "}
                  MONITORING
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {data.activity.map((a: any) => (
                  <div
                    key={a.title}
                    className="flex items-start gap-3 rounded-xl border border-[#e7eae8] p-3.5"
                  >
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#edf3ef] text-[#367055]">
                      <Check size={14} />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold">{a.title}</div>
                      <div className="mt-1 text-[9px] text-[#8a938e]">
                        {a.meta}
                      </div>
                    </div>
                    <span className="ml-auto text-[9px] text-[#a0a8a3]">
                      {a.time}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <ProductView
            view={active}
            onIncident={(incident) => {
              setSelectedIncident(incident);
              setOpen(true);
            }}
          />
        )}
      </main>
      <TelegramSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      {(selectedIncident || data.incident) && (
        <IncidentDrawer
          open={open}
          onClose={() => setOpen(false)}
          incident={selectedIncident || data.incident}
        />
      )}
    </div>
  );
}

function IncidentDrawer({
  open,
  onClose,
  incident,
}: {
  open: boolean;
  onClose: () => void;
  incident: any;
}) {
  const [stage, setStage] = useState<
    "analysis" | "previewing" | "result" | "resolved"
  >("analysis");
  const [previewResult, setPreviewResult] = useState<any>();
  const qc = useQueryClient();
  const preview = useMutation({
    mutationFn: () => previewIncident(incident.id),
    onMutate: () => setStage("previewing"),
    onSuccess: (result) => {
      setPreviewResult(result);
      setStage("result");
    },
    onError: (error) => {
      setStage("analysis");
      toast.error(
        error instanceof Error ? error.message : "Live preview failed",
      );
    },
  });
  const fix = useMutation({
    mutationFn: () => resolveIncident(incident.id),
    onSuccess: (result) => {
      setStage("resolved");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Dynamic pricing restored", {
        description: `${money(result.recovered)} in projected revenue protected.`,
      });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Live resolution failed",
      ),
  });
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-[#13251d]/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 290 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-[560px] overflow-y-auto bg-[#fbfcfb] shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex h-16 items-center border-b border-[#e3e7e4] bg-[#fbfcfb]/95 px-5 backdrop-blur">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#a24532]">
                <AlertTriangle size={14} /> Revenue incident
              </div>
              <button
                onClick={onClose}
                className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-[#e1e6e2]"
              >
                <X size={15} />
              </button>
            </div>
            <div className="p-5 sm:p-7">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#f8e2dc] px-2.5 py-1 text-[9px] font-bold text-[#9f402d]">
                  CRITICAL
                </span>
                <span className="text-[10px] text-[#929b96]">
                  Detected {incident.detectedAt}
                </span>
              </div>
              <h2 className="display mt-4 text-[25px] font-bold leading-tight tracking-[-.045em]">
                {incident.title}
              </h2>
              <p className="mt-2 text-[12px] text-[#6f7974]">
                {incident.listing} · {incident.location}
              </p>
              <div className="mt-6 grid grid-cols-3 overflow-hidden rounded-2xl border border-[#e5e8e6] bg-white">
                <div className="p-4">
                  <div className="text-[8px] font-bold uppercase tracking-wider text-[#929a96]">
                    Current rate
                  </div>
                  <div className="mt-2 text-lg font-bold text-[#9f432f]">
                    {money(incident.currentRate)}
                  </div>
                </div>
                <div className="border-x border-[#e8ebe9] p-4">
                  <div className="text-[8px] font-bold uppercase tracking-wider text-[#929a96]">
                    Recommended
                  </div>
                  <div className="mt-2 text-lg font-bold text-[#1b6b4a]">
                    {money(incident.recommendedRate)}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-[8px] font-bold uppercase tracking-wider text-[#929a96]">
                    At risk
                  </div>
                  <div className="mt-2 text-lg font-bold">
                    {money(incident.revenueAtRisk)}
                  </div>
                </div>
              </div>
              {stage === "resolved" ? (
                <Resolved incident={incident} />
              ) : (
                <>
                  <div className="mt-7">
                    <div className="flex items-center gap-2 text-[11px] font-bold">
                      <Bot size={15} className="text-[#1b6b4a]" /> Kivora’s
                      diagnosis
                    </div>
                    <div className="soft-grid mt-3 rounded-2xl border border-[#dfe6e1] bg-[#f6f9f7] p-5">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#173f2e] text-[#d8f45b]">
                          <Command size={13} />
                        </span>
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-[#7d8982]">
                            Root cause
                          </div>
                          <div className="text-[11px] font-bold">
                            {incident.cause}
                          </div>
                        </div>
                        <span className="ml-auto text-[10px] font-bold text-[#1b6b4a]">
                          {incident.confidence}% confidence
                        </span>
                      </div>
                      <p className="mt-4 text-[12px] leading-relaxed text-[#64716a]">
                        {incident.explanation}
                      </p>
                    </div>
                  </div>
                  <div className="mt-7">
                    <div className="text-[11px] font-bold">
                      Verified evidence
                    </div>
                    <div className="mt-3 space-y-2">
                      {incident.factors.map((f: any) => (
                        <div
                          key={f.label}
                          className="flex items-center rounded-xl border border-[#e5e9e6] bg-white p-3"
                        >
                          <span className="text-[10px] text-[#707a75]">
                            {f.label}
                          </span>
                          <span className="ml-auto text-[11px] font-bold">
                            {f.value}
                          </span>
                          <span className="ml-2 w-28 text-right text-[9px] text-[#98a09c]">
                            {f.note}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {stage === "previewing" && (
                    <div className="mt-7 rounded-2xl border border-[#dce4df] bg-white p-5">
                      <div className="flex items-center gap-3">
                        <span className="live-dot h-2 w-2 rounded-full bg-[#1b6b4a]" />
                        <div>
                          <div className="text-[11px] font-bold">
                            Requesting live strategy preview
                          </div>
                          <div className="mt-1 text-[9px] text-[#84908a]">
                            Comparing current and proposed rates without
                            mutating preferences.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {stage === "result" && previewResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-7 overflow-hidden rounded-2xl border border-[#cfdcc6] bg-[#f7faed]"
                    >
                      <div className="border-b border-[#dae4d2] p-4">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-[#49621f]">
                          <Sparkles size={14} /> LIVE PREVIEW COMPLETE
                        </div>
                      </div>
                      <div className="grid grid-cols-3 p-4 text-center">
                        <div>
                          <div className="text-[8px] uppercase text-[#87927e]">
                            Recovery
                          </div>
                          <div className="mt-1 text-lg font-bold text-[#32623f]">
                            +{money(previewResult.projectedRecovery)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[8px] uppercase text-[#87927e]">
                            Current
                          </div>
                          <div className="mt-1 text-sm font-bold">
                            {money(previewResult.currentRevenue)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[8px] uppercase text-[#87927e]">
                            Optimized
                          </div>
                          <div className="mt-1 text-sm font-bold">
                            {money(previewResult.optimizedRevenue)}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                  <div className="mt-8 border-t border-[#e5e8e6] pt-5">
                    {stage === "analysis" && incident.canPreview !== false ? (
                      <button
                        onClick={() => preview.mutate()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#173f2e] py-3.5 text-[11px] font-bold text-white"
                      >
                        <Zap size={14} /> Run live strategy preview
                      </button>
                    ) : stage === "analysis" ? (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center text-[10px] text-amber-300">
                        This incident requires a manual operational review.
                        Kivora will not make an unrelated pricing change.
                      </div>
                    ) : stage === "result" ? (
                      <button
                        disabled={fix.isPending}
                        onClick={() => fix.mutate()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#d8f45b] py-3.5 text-[11px] font-bold text-[#173f2e]"
                      >
                        <ShieldCheck size={15} />{" "}
                        {fix.isPending
                          ? "Restoring…"
                          : "Approve & restore dynamic pricing"}
                      </button>
                    ) : null}
                    <p className="mt-3 text-center text-[9px] text-[#929b96]">
                      The preview is live and non-mutating. Approval performs
                      the approved pricing update.
                    </p>
                  </div>
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Resolved({ incident }: { incident: any }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mt-7"
    >
      <div className="rounded-2xl bg-[#173f2e] p-6 text-white">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-[#d8f45b] text-[#173f2e]">
          <Check size={20} />
        </div>
        <h3 className="display mt-5 text-xl font-bold">Revenue protected.</h3>
        <p className="mt-2 text-[11px] leading-relaxed text-white/65">
          Dynamic pricing was restored and verified for {incident.listing}.
          Portfolio synchronization completed.
        </p>
        <div className="mt-5 flex items-end justify-between border-t border-white/10 pt-5">
          <span className="text-[9px] uppercase tracking-wider text-white/50">
            Projected recovery
          </span>
          <span className="text-2xl font-bold text-[#d8f45b]">
            {money(incident.revenueAtRisk)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
