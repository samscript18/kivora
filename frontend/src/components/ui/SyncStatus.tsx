"use client";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

interface SyncStatusProps {
  lastSynced?: string;
  connected?: boolean;
  syncing?: boolean;
}

function formatSyncTime(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return d.toLocaleDateString();
  } catch {
    return "Unknown";
  }
}

export function SyncStatus({ lastSynced, connected = true, syncing = false }: SyncStatusProps) {
  if (syncing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-400">
        <RefreshCw size={11} className="animate-spin text-sky-400" />
        Syncing…
      </span>
    );
  }
  if (!connected) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] text-red-400">
        <WifiOff size={11} />
        Disconnected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500">
      <Wifi size={11} className="text-emerald-500" />
      {lastSynced ? `Synced ${formatSyncTime(lastSynced)}` : "Live"}
    </span>
  );
}
