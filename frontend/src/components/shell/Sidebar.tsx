"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Bot,
  Building2,
  FileText,
  FlameKindling,
  Home,
  MessageSquare,
  Settings,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getDashboard, getOrganizations, QUERY_KEYS } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const ORGANIZATION_STORAGE_KEY = "kivora.organizationId";

const navGroups = [
  {
    label: "Overview",
    items: [
      { icon: Home, label: "War Room", href: "/dashboard/war-room", badge: "primary" },
      { icon: Building2, label: "Portfolio", href: "/dashboard/portfolio", badge: null },
      { icon: BarChart2, label: "Listings", href: "/dashboard/listings", badge: null },
    ],
  },
  {
    label: "Revenue decisions",
    items: [
      { icon: TrendingUp, label: "Opportunities", href: "/dashboard/opportunities", badge: "opportunities" },
      { icon: AlertTriangle, label: "Incidents", href: "/dashboard/incidents", badge: "incidents" },
      { icon: FlameKindling, label: "Market Intel", href: "/dashboard/market", badge: null },
      { icon: Zap, label: "Simulator", href: "/dashboard/simulator", badge: null },
    ],
  },
  {
    label: "Operations",
    items: [
      { icon: FileText, label: "Reports", href: "/dashboard/reports", badge: null },
      { icon: Bot, label: "AI Assistant", href: "/dashboard/assistant", badge: null },
      { icon: Activity, label: "Activity", href: "/dashboard/activity", badge: null },
    ],
  },
] as const;

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="kivora-mark relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl">
        <span className="absolute inset-[1px] rounded-[11px] bg-[#09090b]" />
        <Zap className="relative text-white" size={16} fill="currentColor" />
      </div>
      <div>
        <div className="font-display text-[18px] font-bold tracking-[-0.05em] text-foreground">
          Kivora<span className="text-accent">°</span>
        </div>
        <div className="mt-[-3px] font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-slate-500">
          Revenue Ops
        </div>
      </div>
    </div>
  );
}

interface SidebarProps {
  mobile?: boolean;
  onClose?: () => void;
}

export function Sidebar({ mobile, onClose }: SidebarProps) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: QUERY_KEYS.dashboard, queryFn: getDashboard, staleTime: 60_000 });
  const { data: organizations = [] } = useQuery({ queryKey: QUERY_KEYS.organizations, queryFn: getOrganizations });
  const selectedOrganizationId = typeof window === "undefined" ? "" : window.localStorage.getItem(ORGANIZATION_STORAGE_KEY) || organizations[0]?.id || "";
  const criticalIncidents = data?.summary.criticalIncidents ?? 0;
  const opportunities     = data?.summary.opportunities ?? 0;

  const badgeCount: Record<string, number> = {
    incidents:     criticalIncidents,
    opportunities: opportunities,
  };

  return (
    <aside
      className={`${
        mobile
          ? "fixed inset-y-0 left-0 z-50 shadow-2xl"
          : "desktop-only fixed inset-y-5 left-5 rounded-[28px] shadow-2xl"
      } z-40 flex w-[264px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden border border-white/[0.07] bg-[#0c0c0f]/88 shadow-[0_30px_100px_rgba(0,0,0,.5)] backdrop-blur-2xl`}
      aria-label="Primary navigation"
    >
      {/* Header */}
      <div className="flex h-[68px] shrink-0 items-center justify-between border-b border-white/[0.05] px-5">
        <Link href="/dashboard/war-room" onClick={onClose} aria-label="Kivora home">
          <Logo />
        </Link>
        {mobile && (
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/5"
            aria-label="Close navigation"
          >
            <X size={17} />
          </button>
        )}
      </div>

      {/* Organization and portfolio context */}
      <div className="mx-3.5 mt-3.5 shrink-0 rounded-2xl border border-white/[0.065] bg-white/[0.025] px-3.5 py-3">
        {organizations.length > 0 && (
          <select
            aria-label="Active organization"
            value={selectedOrganizationId}
            onChange={(event) => {
              window.localStorage.setItem(ORGANIZATION_STORAGE_KEY, event.target.value);
              void queryClient.invalidateQueries();
            }}
            className="mb-2 w-full truncate rounded-lg border border-border bg-elevated px-2 py-1.5 text-[10px] font-semibold text-foreground outline-none focus:border-accent"
          >
            {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </select>
        )}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Portfolio</span>
          <span className={`flex items-center gap-1 text-[9px] font-bold ${data ? "text-emerald-500" : "text-slate-600"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${data ? "bg-emerald-500 live-dot" : "bg-slate-600"}`} />
            {data ? "Connected" : "—"}
          </span>
        </div>
        <p className="mt-1 text-[11px] font-semibold text-foreground truncate">
          {data ? "Live portfolio" : "Loading…"}
        </p>
        {data && (
          <p className="mt-0.5 text-[9px] text-slate-500">
            {data.capabilities?.wheelhouse?.connected ? "Pricing intelligence connected" : "Partially connected"}
          </p>
        )}
      </div>

      {/* Navigation */}
      <nav className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3 scrollbar-none" aria-label="Workspace navigation">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label} className={groupIndex ? "mt-4" : ""}>
            <div className="mb-1.5 px-2.5 font-mono text-[8px] font-bold uppercase tracking-[0.19em] text-white/25">
              {group.label}
            </div>
            <ul role="list" className="space-y-0.5">
              {group.items.map(({ icon: Icon, label, href, badge }) => {
                const isActive = pathname === href || (href !== "/dashboard/war-room" && pathname.startsWith(href));
                const count = badge && badgeCount[badge] ? badgeCount[badge] : 0;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onClose}
                      aria-current={isActive ? "page" : undefined}
                      className={`sidebar-link group relative flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl px-3 py-2 text-[12px] font-semibold transition ${
                        isActive
                          ? "bg-white/[0.065] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.04)]"
                          : "text-slate-400 hover:bg-white/[0.04] hover:text-foreground"
                      }`}
                    >
                      {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent shadow-[0_0_16px_rgba(232,68,42,.8)]" />}
                      <Icon size={15} className={`shrink-0 transition-transform group-hover:scale-110 ${isActive ? "text-accent" : ""}`} />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      {count > 0 && (
                        <span className="badge-critical flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1 text-[9px] font-bold">
                          {count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 space-y-1 border-t border-white/[0.055] bg-black/10 px-3 py-3">
        <Link
          href="/dashboard/settings"
          onClick={onClose}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-400 hover:bg-white/5 hover:text-foreground transition-colors ${
            pathname === "/dashboard/settings" ? "bg-accent/10 text-accent" : ""
          }`}
        >
          <Settings size={16} />
          <span>Settings</span>
        </Link>
        <Link
          href="/dashboard/assistant"
          onClick={onClose}
          className="flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-[10px] text-slate-500 transition-colors hover:bg-white/[.025] hover:text-slate-300"
        >
          <MessageSquare size={14} />
          <span className="truncate">Ask Kivora anything</span>
        </Link>
      </div>
    </aside>
  );
}
