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
import { getDashboard, QUERY_KEYS } from "@/lib/api";

const nav = [
  { icon: Home,          label: "War Room",     href: "/dashboard/war-room",    badge: "primary" },
  { icon: Building2,     label: "Portfolio",    href: "/dashboard/portfolio",   badge: null },
  { icon: BarChart2,     label: "Listings",     href: "/dashboard/listings",    badge: null },
  { icon: TrendingUp,    label: "Opportunities",href: "/dashboard/opportunities",badge: "opportunities" },
  { icon: AlertTriangle, label: "Incidents",    href: "/dashboard/incidents",   badge: "incidents" },
  { icon: FlameKindling, label: "Market Intel", href: "/dashboard/market",      badge: null },
  { icon: Zap,           label: "Simulator",    href: "/dashboard/simulator",   badge: null },
  { icon: FileText,      label: "Reports",      href: "/dashboard/reports",     badge: null },
  { icon: Bot,           label: "AI Assistant", href: "/dashboard/assistant",   badge: null },
  { icon: Activity,      label: "Activity",     href: "/dashboard/activity",    badge: null },
] as const;

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/30">
        <Zap size={17} fill="currentColor" />
      </div>
      <div>
        <div className="font-display text-[20px] font-extrabold tracking-[-0.06em] text-foreground">
          kivora
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
  const { data } = useQuery({ queryKey: QUERY_KEYS.dashboard, queryFn: getDashboard, staleTime: 60_000 });
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
          : "desktop-only fixed inset-y-0 left-0"
      } flex w-[232px] flex-col border-r border-border bg-surface`}
      aria-label="Primary navigation"
    >
      {/* Header */}
      <div className="flex h-[64px] items-center justify-between px-5 border-b border-border">
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

      {/* Portfolio indicator */}
      <div className="mx-4 mt-4 rounded-xl bg-white/[0.03] border border-border px-3 py-2.5">
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
      <nav className="mt-4 min-h-0 flex-1 overflow-y-auto px-3 scrollbar-none" aria-label="Workspace navigation">
        <div className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600">
          Workspace
        </div>
        <ul role="list" className="space-y-0.5">
          {nav.map(({ icon: Icon, label, href, badge }) => {
            const isActive = pathname === href || (href !== "/dashboard/war-room" && pathname.startsWith(href));
            const count = badge && badgeCount[badge] ? badgeCount[badge] : 0;
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onClose}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                    isActive
                      ? "bg-accent/10 text-accent"
                      : "text-slate-400 hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  <Icon size={16} className="flex-shrink-0" />
                  <span className="flex-1 truncate">{label}</span>
                  {count > 0 && (
                    <span className="badge-critical flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[9px] font-bold">
                      {count}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-3 py-4 space-y-1">
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
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
        >
          <MessageSquare size={14} />
          Ask Kivora anything
        </Link>
      </div>
    </aside>
  );
}
