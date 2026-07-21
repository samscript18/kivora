"use client";
import { Bell, Menu, Search } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { getDashboard, QUERY_KEYS } from "@/lib/api";
import { SyncStatus } from "@/components/ui/SyncStatus";
import { usePathname } from "next/navigation";

const pageTitles: Record<string, { title: string; subtitle?: string }> = {
  "/dashboard/war-room":     { title: "Revenue War Room",    subtitle: "Today's highest-impact actions" },
  "/dashboard/portfolio":    { title: "Portfolio Dashboard", subtitle: "Performance analytics" },
  "/dashboard/listings":     { title: "Listings",            subtitle: "All properties" },
  "/dashboard/opportunities":{ title: "Opportunities",       subtitle: "Revenue upside pipeline" },
  "/dashboard/incidents":    { title: "Incident Center",     subtitle: "Revenue risks and operational failures" },
  "/dashboard/market":       { title: "Market Intelligence", subtitle: "Events and weather demand signals" },
  "/dashboard/simulator":    { title: "Strategy Simulator",  subtitle: "What-if scenario modeling" },
  "/dashboard/reports":      { title: "Reports",             subtitle: "Owner communications and portfolio summaries" },
  "/dashboard/assistant":    { title: "AI Assistant",        subtitle: "Revenue questions answered from live data" },
  "/dashboard/activity":     { title: "Activity",            subtitle: "Audit trail of all platform actions" },
  "/dashboard/settings":     { title: "Settings",            subtitle: "Integrations and workspace configuration" },
};

interface TopBarProps {
  onMenuOpen: () => void;
}

export function TopBar({ onMenuOpen }: TopBarProps) {
  const pathname = usePathname();
  const { user, logout } = usePrivy();
  const { data, dataUpdatedAt } = useQuery({
    queryKey: QUERY_KEYS.dashboard,
    queryFn: getDashboard,
    staleTime: 60_000,
  });

  const page = pageTitles[pathname] ?? { title: "Kivora", subtitle: "Revenue operations platform" };
  const lastSynced = dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : undefined;
  const criticalCount = data?.summary.criticalIncidents ?? 0;
  const initials = (user?.email?.address ?? "U").slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-[64px] items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur-xl sm:px-6">
      {/* Mobile menu button */}
      <button
        className="grid h-9 w-9 place-items-center rounded-lg border border-border text-slate-400 hover:bg-white/5 md:hidden"
        onClick={onMenuOpen}
        aria-label="Open navigation"
      >
        <Menu size={17} />
      </button>

      {/* Page title */}
      <div className="min-w-0 flex-1">
        <h1 className="font-display truncate text-[16px] font-bold tracking-tight text-foreground">
          {page.title}
        </h1>
        <div className="flex items-center gap-3">
          {page.subtitle && (
            <span className="hidden text-[10px] text-slate-500 sm:block">{page.subtitle}</span>
          )}
          <SyncStatus
            connected={!!data}
            lastSynced={lastSynced}
          />
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Search (placeholder — navigates to assistant) */}
        <a
          href="/dashboard/assistant"
          className="hidden items-center gap-2 rounded-xl border border-border bg-elevated px-3 py-2 text-[11px] text-slate-500 hover:text-slate-300 sm:flex"
          aria-label="Search or ask Kivora"
        >
          <Search size={13} />
          <span>Ask Kivora…</span>
          <kbd className="ml-2 rounded border border-white/10 px-1 py-0.5 font-mono text-[9px] text-slate-600">⌘K</kbd>
        </a>

        {/* Notification bell */}
        <a
          href="/dashboard/incidents"
          className="relative grid h-9 w-9 place-items-center rounded-xl border border-border text-slate-400 hover:bg-white/5"
          aria-label={`${criticalCount} critical incidents`}
        >
          <Bell size={15} />
          {criticalCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
              {criticalCount > 9 ? "9+" : criticalCount}
            </span>
          )}
        </a>

        {/* User avatar */}
        <div className="relative">
          <button
            onClick={logout}
            title="Sign out"
            className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 font-mono text-xs font-bold text-accent hover:bg-accent/20 transition-colors"
            aria-label="Sign out"
          >
            {initials}
          </button>
        </div>
      </div>
    </header>
  );
}
