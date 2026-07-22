"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getReports,
  getBriefs,
  generateReport,
  sendBrief,
  getPortfolio,
  QUERY_KEYS,
  downloadReport,
  finalizeReport,
  deliverReport,
} from "@/lib/api";
import { useState } from "react";
import { FileBarChart, Send, Copy, FileText, Plus, Download } from "lucide-react";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { toast } from "sonner";
import type { Report, OwnerBrief, ReportType } from "@/types/api";
import { RichText } from "@/components/ui/RichText";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<"reports" | "briefs">("reports");
  const [reportType, setReportType] = useState<ReportType>("executive");
  const [selectedListingId, setSelectedListingId] = useState<string>("");

  const reportsQuery = useQuery({
    queryKey: QUERY_KEYS.reports,
    queryFn: getReports,
  });

  const briefsQuery = useQuery({
    queryKey: QUERY_KEYS.briefs,
    queryFn: getBriefs,
  });

  const portfolioQuery = useQuery({
    queryKey: QUERY_KEYS.portfolio,
    queryFn: getPortfolio,
  });

  const generateReportMutation = useMutation({
    mutationFn: () => generateReport({ type: reportType, listingId: selectedListingId || undefined }),
    onSuccess: () => {
      toast.success("Report Generated", { description: "Grounded in live metrics and stored market signals." });
      reportsQuery.refetch();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to generate report"),
  });

  const sendBriefMutation = useMutation({
    mutationFn: (id: string) => sendBrief(id),
    onSuccess: () => {
      toast.success("Brief Delivered", { description: "Sent to the connected mobile companion." });
      briefsQuery.refetch();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to deliver brief"),
  });
  const finalizeMutation = useMutation({ mutationFn: finalizeReport, onSuccess: () => { reportsQuery.refetch(); toast.success("Report finalized"); }, onError: (err) => toast.error(err instanceof Error ? err.message : "Finalization failed") });
  const deliverMutation = useMutation({ mutationFn: deliverReport, onSuccess: () => { reportsQuery.refetch(); toast.success("Finalized report delivered and tracked"); }, onError: (err) => toast.error(err instanceof Error ? err.message : "Delivery failed") });

  const reports: Report[] = reportsQuery.data ?? [];
  const briefs: OwnerBrief[] = briefsQuery.data ?? [];
  const listings = portfolioQuery.data?.listings ?? [];

  return (
    <div className="mx-auto max-w-[1440px] p-4 sm:p-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Grounded Communications</div>
          <h2 className="font-display mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
            Reports & Owner Briefs
          </h2>
          <p className="mt-1 text-[12px] text-slate-400">
            Audit reports, executive summaries, and owner communications generated from live portfolio data.
          </p>
        </div>
        <SourceBadge source="kivora" />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab("reports")}
          className={`flex items-center gap-2 py-3 border-b-2 transition-colors ${
            activeTab === "reports" ? "border-accent text-accent" : "border-transparent text-slate-400 hover:text-foreground"
          }`}
        >
          <FileBarChart size={15} /> Reports ({reports.length})
        </button>
        <button
          onClick={() => setActiveTab("briefs")}
          className={`flex items-center gap-2 py-3 border-b-2 transition-colors ${
            activeTab === "briefs" ? "border-accent text-accent" : "border-transparent text-slate-400 hover:text-foreground"
          }`}
        >
          <FileText size={15} /> Owner Briefs ({briefs.length})
        </button>
      </div>

      {/* Reports Section */}
      {activeTab === "reports" && (
        <div className="space-y-6">
          {/* Generator Card */}
          <div className="card rounded-2xl p-6 space-y-4">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
              <Plus size={16} className="text-accent" /> Generate New Report
            </h3>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="report-type" className="text-[10px] uppercase font-mono text-slate-500 block mb-1">Report Type</label>
                <select
                  id="report-type"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as ReportType)}
                  className="w-full rounded-xl border border-border bg-elevated p-3 text-xs text-foreground outline-none focus:border-accent"
                >
                  <option value="executive">Executive Summary</option>
                  <option value="portfolio">Portfolio Performance</option>
                  <option value="owner">Owner Performance Report</option>
                  <option value="revenue">Revenue Audit Summary</option>
                </select>
              </div>

              {reportType === "owner" && (
                <div>
                  <label htmlFor="report-property" className="text-[10px] uppercase font-mono text-slate-500 block mb-1">Target Property</label>
                  <select
                    id="report-property"
                    value={selectedListingId}
                    onChange={(e) => setSelectedListingId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-elevated p-3 text-xs text-foreground outline-none focus:border-accent"
                  >
                    <option value="">Choose property...</option>
                    {listings.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nickname || item.title || item.id}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-end sm:col-span-1">
                <button
                  disabled={generateReportMutation.isPending || (reportType === "owner" && !selectedListingId)}
                  onClick={() => generateReportMutation.mutate()}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent py-3 text-xs font-bold text-white hover:bg-accent/90 disabled:opacity-40 transition-colors"
                >
                  <FileBarChart size={14} />
                  {generateReportMutation.isPending ? "Generating..." : "Generate Report"}
                </button>
              </div>
            </div>
          </div>

          {/* List */}
          {reportsQuery.isLoading ? (
            <div className="grid gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : reportsQuery.error ? (
            <ErrorState error={reportsQuery.error} onRetry={() => reportsQuery.refetch()} />
          ) : reports.length === 0 ? (
            <div className="card rounded-2xl">
              <EmptyState heading="No Reports Generated" body="Use the control panel above to generate your first live report." />
            </div>
          ) : (
            <div className="grid gap-4">
              {reports.map((item) => (
                <article key={item._id} className="card overflow-hidden rounded-2xl">
                  <div className="h-1 bg-gradient-to-r from-accent via-orange-400/70 to-transparent" />
                  <div className="space-y-5 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><div className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent">{item.type} report</div><h3 className="mt-1 font-semibold tracking-tight text-foreground">{item.title}</h3></div>
                    <span className="font-mono text-[9px] uppercase px-2 py-0.5 rounded bg-white/5 text-slate-400">
                      {item.status}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-white/[0.05] bg-black/20 p-5"><RichText text={item.body}/></div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-4"><div className="mr-auto text-[9px] font-mono uppercase tracking-[0.12em] text-slate-500">Live portfolio evidence · {item.currency || "USD"}</div>{item.status === "draft" && <button onClick={() => finalizeMutation.mutate(item._id)} className="rounded-lg bg-accent px-3 py-2 text-[10px] font-semibold text-white">Finalize</button>}{["ready", "shared"].includes(item.status) && <button onClick={()=>deliverMutation.mutate(item._id)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 px-3 py-2 text-[10px] text-emerald-300"><Send size={12}/> Deliver</button>}<button onClick={() => downloadReport(item._id, "pdf").catch((error) => toast.error(error instanceof Error ? error.message : "PDF download failed"))} className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/[0.02] px-3 py-2 text-[10px] font-semibold"><Download size={12}/> Styled PDF</button><button onClick={() => downloadReport(item._id, "csv").catch((error) => toast.error(error instanceof Error ? error.message : "CSV download failed"))} className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/[0.02] px-3 py-2 text-[10px] font-semibold"><Download size={12}/> Detailed CSV</button></div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Briefs Section */}
      {activeTab === "briefs" && (
        <div className="space-y-4">
          {briefsQuery.isLoading ? (
            <div className="grid gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : briefsQuery.error ? (
            <ErrorState error={briefsQuery.error} onRetry={() => briefsQuery.refetch()} />
          ) : briefs.length === 0 ? (
            <div className="card rounded-2xl">
              <EmptyState heading="No Owner Briefs Available" body="Owner briefs generated from portfolio scans will appear here." />
            </div>
          ) : (
            <div className="grid gap-4">
              {briefs.map((item) => (
                <article key={item._id} className="card rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-mono text-slate-500">{item.owner || "Owner Communication"}</span>
                      <h3 className="font-bold text-foreground text-sm mt-0.5">{item.subject}</h3>
                    </div>
                    <span className={`text-[9px] font-mono uppercase font-bold px-2 py-0.5 rounded ${
                      item.status === "sent" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                    }`}>
                      {item.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {item.body}
                  </p>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/5">
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(item.body);
                        toast.success("Brief text copied to clipboard");
                      }}
                      className="inline-flex items-center gap-1 rounded-xl border border-border bg-elevated px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 transition-colors"
                    >
                      <Copy size={13} /> Copy Text
                    </button>
                    <button
                      disabled={sendBriefMutation.isPending || item.status === "sent"}
                      onClick={() => sendBriefMutation.mutate(item._id)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
                    >
                      <Send size={13} /> {item.status === "sent" ? "Delivered" : "Send Mobile Companion Brief"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
