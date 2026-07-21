"use client";

import { useQuery } from "@tanstack/react-query";
import { getActivity, QUERY_KEYS } from "@/lib/api";
import { Activity as ActivityIcon, ShieldCheck } from "lucide-react";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { SkeletonRow } from "@/components/ui/Skeleton";
import type { ActivityEntry } from "@/types/api";

export default function ActivityPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEYS.activity,
    queryFn: getActivity,
  });

  const activities: ActivityEntry[] = data ?? [];

  return (
    <div className="mx-auto max-w-[1440px] p-4 sm:p-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Operational Integrity</div>
          <h2 className="font-display mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
            Activity & Audit Trail
          </h2>
          <p className="mt-1 text-[12px] text-slate-400">
            Complete record of approved pricing changes, strategy updates, and system scans.
          </p>
        </div>
        <SourceBadge source="kivora" />
      </div>

      {/* Activity List */}
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="card rounded-2xl overflow-hidden divide-y divide-white/5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : activities.length === 0 ? (
        <div className="card rounded-2xl">
          <EmptyState
            icon={ShieldCheck}
            heading="No Recorded Activity"
            body="No approved pricing updates or portfolio actions have been logged yet."
          />
        </div>
      ) : (
        <div className="card rounded-2xl overflow-hidden divide-y divide-white/5">
          {activities.map((item) => (
            <div key={item._id} className="p-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                  <ActivityIcon size={16} />
                </span>
                <div>
                  <div className="text-xs font-semibold text-foreground capitalize">
                    {String(item.action).replaceAll("_", " ")}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Actor: <span className="text-slate-400 font-medium">{item.actor || "Kivora Automation"}</span> · Source: {item.source || "System"}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="font-mono text-[10px] text-slate-500">
                  {new Date(item.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
