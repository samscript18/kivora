"use client";
import { Bell, LogOut, Menu, Search } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { getPrivyProfile } from "@/lib/privy-profile";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDashboard, getNotifications, QUERY_KEYS } from "@/lib/api";
import { SyncStatus } from "@/components/ui/SyncStatus";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOnboardingStore } from "@/store/onboarding";

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
  const queryClient = useQueryClient();
  const { user, logout } = usePrivy();
  const resetOnboarding = useOnboardingStore((state) => state.resetForSignIn);
  const { data, dataUpdatedAt } = useQuery({
    queryKey: QUERY_KEYS.dashboard,
    queryFn: getDashboard,
    staleTime: 60_000,
  });

  const page = pageTitles[pathname] ?? { title: "Kivora", subtitle: "Revenue operations platform" };
  const lastSynced = dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : undefined;
  const notifications = useQuery({ queryKey: QUERY_KEYS.notifications, queryFn: getNotifications, staleTime: 30_000, refetchInterval: 60_000 });
  const unreadCount = notifications.data?.filter((item) => !item.readAt).length ?? 0;
  const initials = (getPrivyProfile(user).email ?? "U").slice(0, 1).toUpperCase();
  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    window.localStorage.removeItem("kivora.organizationId");
    window.sessionStorage.removeItem("kivora-onboarding-session");
    resetOnboarding();
    window.location.replace("/");
  };

  return (
    <header className="dashboard-topbar sticky top-3 z-30 mx-3 mt-3 flex min-h-[68px] items-center gap-2 rounded-[22px] border border-white/[0.07] bg-[#0c0c0f]/80 px-2.5 shadow-[0_20px_70px_rgba(0,0,0,.32)] backdrop-blur-2xl sm:mx-5 sm:gap-3 sm:px-5">
      {/* Mobile menu button */}
      <button
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-slate-400 transition hover:bg-white/5 lg:hidden"
        onClick={onMenuOpen}
        aria-label="Open navigation"
      >
        <Menu size={17} />
      </button>

      {/* Page title */}
      <div className="min-w-0 flex-1 py-2">
        <h1 className="truncate font-display text-[15px] font-bold tracking-[-.035em] text-foreground sm:text-[17px]">
          {page.title}
        </h1>
        <div className="mt-0.5 hidden min-w-0 items-center gap-2.5 min-[390px]:flex">
          {page.subtitle && (
            <span className="hidden truncate text-[10px] text-slate-500 lg:block">{page.subtitle}</span>
          )}
          <SyncStatus
            connected={!!data}
            lastSynced={lastSynced}
          />
        </div>
      </div>

      {/* Right section */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {/* Search (placeholder — navigates to assistant) */}
        <Link
          href="/dashboard/assistant"
          className="hidden h-10 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-4 text-[11px] text-slate-500 transition hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-slate-300 xl:flex"
          aria-label="Search or ask Kivora"
        >
          <Search size={13} />
          <span>Ask Kivora…</span>
          <kbd className="ml-2 rounded border border-white/10 px-1 py-0.5 font-mono text-[9px] text-slate-600">⌘K</kbd>
        </Link>

        {/* Notification bell */}
        <Link
          href="/dashboard/activity"
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.02] text-slate-400 transition hover:border-accent/25 hover:bg-accent/[0.06] hover:text-white"
          aria-label={`Open notifications. ${unreadCount} unread`}
        >
          <Bell size={15} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>

        <div className="hidden h-10 w-10 place-items-center rounded-full border border-accent/15 bg-accent/10 font-mono text-xs font-bold text-accent sm:grid" aria-hidden="true">
          {initials}
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] text-[11px] font-semibold text-slate-300 transition hover:border-red-500/25 hover:bg-red-500/[0.06] hover:text-red-300 lg:w-auto lg:px-3"
          aria-label="Log out of Kivora"
        >
          <LogOut size={14} />
          <span className="hidden lg:inline">Log out</span>
        </button>
      </div>
    </header>
  );
}
