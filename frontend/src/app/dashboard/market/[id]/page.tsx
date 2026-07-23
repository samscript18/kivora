"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CloudRain, ExternalLink, MapPin, Sparkles } from "lucide-react";
import { getMarketIntelligence, getPortfolio, QUERY_KEYS } from "@/lib/api";
import { ErrorState } from "@/components/ui/EmptyState";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { ConfidenceIndicator } from "@/components/ui/ConfidenceIndicator";
import type { MarketSignal } from "@/types/api";

const humanize = (value: unknown) => String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function formatDate(value?: string) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function displayValue(value: unknown) {
  if (value == null || value === "") return "Unavailable";
  if (Array.isArray(value)) return value.length ? value.map((item) => (item && typeof item === "object" ? JSON.stringify(item) : String(item))).join(" · ") : "None";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function MarketSignalDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const signalId = decodeURIComponent(String(params.id || ""));

  const marketQuery = useQuery({
    queryKey: QUERY_KEYS.marketIntelligence,
    queryFn: getMarketIntelligence,
  });
  const portfolioQuery = useQuery({
    queryKey: QUERY_KEYS.portfolio,
    queryFn: getPortfolio,
  });

  const signal = useMemo(() => (marketQuery.data ?? []).find((item) => item.externalId === signalId) as MarketSignal | undefined, [marketQuery.data, signalId]);
  const listingMap = useMemo(() => new Map((portfolioQuery.data?.listings ?? []).map((listing) => [String(listing.id), listing])), [portfolioQuery.data?.listings]);
  const affectedListings = (signal?.listingIds ?? []).map((listingId) => {
    const listing = listingMap.get(listingId);
    return {
      id: listingId,
      title: listing?.nickname || listing?.title || listingId,
      location: listing?.location?.address || listing?.location?.city || listing?.channel,
    };
  });

  if (marketQuery.isLoading || portfolioQuery.isLoading) {
    return <div className="dashboard-page space-y-6"><div className="skeleton h-8 w-48" /><div className="skeleton h-40 w-full rounded-2xl" /></div>;
  }

  if (marketQuery.error || portfolioQuery.error || !signal) {
    return <div className="dashboard-page space-y-6"><button onClick={() => router.push("/dashboard/market")} className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-foreground"><ArrowLeft size={14} /> Back to market signals</button><ErrorState heading="Signal Not Found" error={marketQuery.error || portfolioQuery.error || new Error(`Could not find market signal: ${signalId}`)} onRetry={() => marketQuery.refetch()} /></div>;
  }

  const isEvent = signal.kind === "event";
  const fields = [
    ["Confidence", `${signal.confidence}%`],
    ["Affected listings", String(signal.affectedListings)],
    ["Direction", signal.demandDirection || "Unavailable"],
    ["Source", signal.source || "Unavailable"],
    ["Starts", formatDate(signal.startDate)],
    ["Ends", formatDate(signal.endDate)],
    ["Location", signal.location || "Unavailable"],
  ] as const;

  return (
    <div className="dashboard-page space-y-6">
      <button onClick={() => router.push("/dashboard/market")} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-foreground transition-colors">
        <ArrowLeft size={14} /> Back to market signals
      </button>

      <section className="card overflow-hidden rounded-3xl border border-white/10 p-5 sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge source={isEvent ? "ticketmaster" : "openweather"} />
              <span className="rounded-full border border-white/10 bg-white/3 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">{signal.kind}</span>
            </div>
            <div className="flex items-start gap-3">
              <div className={`grid h-12 w-12 flex-none place-items-center rounded-2xl ${isEvent ? "bg-amber-500/10 text-amber-400" : "bg-sky-500/10 text-sky-400"}`}>
                {isEvent ? <Sparkles size={22} /> : <CloudRain size={22} />}
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{signal.title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{signal.description || "Live market signal detected for target area."}</p>
              </div>
            </div>
            {signal.location && <div className="flex items-center gap-1.5 text-xs text-slate-400"><MapPin size={13} className="text-slate-500" />{signal.location}</div>}
          </div>
          <div className="min-w-55 rounded-2xl border border-white/10 bg-white/2 p-4">
            <ConfidenceIndicator value={signal.confidence} />
            <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
              {fields.map(([label, value]) => <div key={label} className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</div><div className="mt-1 wrap-break-word text-foreground">{value}</div></div>)}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section className="rounded-2xl border border-white/5 bg-white/2 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-foreground">Signal Details</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {signal.sourceUrl && <DetailCard label="Source URL" value={<a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">Open source <ExternalLink size={12} /></a>} />}
              <DetailCard label="Evidence" value={displayValue(signal.evidence)} />
              <DetailCard label="Listing IDs" value={signal.listingIds?.length ? signal.listingIds.join(", ") : "None recorded"} />
              <DetailCard label="Demand Direction" value={signal.demandDirection || "Unavailable"} />
            </div>
          </section>

          <section className="rounded-2xl border border-white/5 bg-white/2 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-foreground">Timeline</h2>
            <div className="mt-4 space-y-3 text-xs text-slate-400">
              <TimelineRow label="Starts" value={formatDate(signal.startDate)} />
              <TimelineRow label="Ends" value={formatDate(signal.endDate)} />
              <TimelineRow label="Source" value={signal.source || "Unavailable"} />
              <TimelineRow label="Affected listings" value={String(signal.affectedListings)} />
            </div>
          </section>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground">Affected Listings</h2>
          <p className="mt-1 text-xs text-slate-400">These portfolio listings are linked to this signal and can be opened individually for the live listing workspace.</p>
        </div>
        {affectedListings.length === 0 ? (
          <div className="card rounded-2xl p-5 text-sm text-slate-400">No listing links were stored for this signal yet.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {affectedListings.map((listing) => (
              <Link key={listing.id} href={`/dashboard/listings/${encodeURIComponent(listing.id)}`} className="card group rounded-2xl border border-white/5 bg-white/2 p-4 transition-colors hover:border-white/15 hover:bg-white/4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground group-hover:text-accent">{listing.title}</div>
                    <div className="mt-1 text-[11px] text-slate-400">{listing.location || "Linked listing"}</div>
                  </div>
                  <ExternalLink size={14} className="shrink-0 text-slate-500" />
                </div>
                <div className="mt-3 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-500">ID: {listing.id}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-xl border border-white/5 bg-black/10 p-3 text-xs text-slate-400"><div className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</div><div className="mt-1 wrap-break-word text-foreground">{value}</div></div>;
}

function TimelineRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/10 px-3 py-2.5"><span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</span><span className="text-right text-foreground">{value}</span></div>;
}