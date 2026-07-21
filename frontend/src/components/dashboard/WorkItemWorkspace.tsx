"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, RefreshCw, CalendarClock, MessageSquare, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { assignWorkItem, commentOnWorkItem, decideRecommendation, executeRecommendation, getOrganizationMembers, getWorkItem, revertRevenueAction, scheduleRecommendation, simulateRecommendation } from "@/lib/api";

const money = (value: number, currency = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(value || 0);
const idOf = (value: { id?: string; _id?: string } | null | undefined) => value?.id || value?._id || "";
const tomorrowIso=()=>new Date(Date.now()+86_400_000).toISOString();

export function WorkItemWorkspace({ kind, id, onClose }: { kind: "incident" | "opportunity"; id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [executeAt, setExecuteAt] = useState("");
  const queryKey = ["work-item", kind, id];
  const { data, isLoading, error } = useQuery({ queryKey, queryFn: () => getWorkItem(kind, id) });
  const members=useQuery({queryKey:["organization-members"],queryFn:getOrganizationMembers});
  const refresh = () => { qc.invalidateQueries({ queryKey }); qc.invalidateQueries({ queryKey: [kind === "incident" ? "incidents" : "opportunities"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const decision = useMutation({ mutationFn: (value: string) => decideRecommendation(idOf(data?.recommendation), value, reason || undefined, value === "ignore" ? tomorrowIso() : undefined), onSuccess: () => { toast.success("Decision recorded"); refresh(); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Decision failed") });
  const simulate = useMutation({ mutationFn: () => simulateRecommendation(idOf(data?.recommendation)), onSuccess: () => { toast.success("Fresh live previews saved"); refresh(); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Preview failed") });
  const execute = useMutation({ mutationFn: () => executeRecommendation(idOf(data?.recommendation), idOf(data?.simulations?.[0])), onSuccess: () => { toast.success("Action completed; verification result recorded"); refresh(); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed") });
  const schedule = useMutation({ mutationFn: () => scheduleRecommendation(idOf(data?.recommendation), new Date(executeAt).toISOString(), reason || undefined, idOf(simulation)), onSuccess: () => { toast.success("Action scheduled"); refresh(); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Scheduling failed") });
  const addComment = useMutation({ mutationFn: () => commentOnWorkItem(kind, id, comment), onSuccess: () => { setComment(""); refresh(); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Comment failed") });
  const revert = useMutation({ mutationFn: revertRevenueAction, onSuccess: () => { toast.success("Previous state restored and verified"); refresh(); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Revert failed") });
  const assign=useMutation({mutationFn:(userId:string)=>assignWorkItem(kind,id,userId||undefined),onSuccess:()=>{toast.success("Assignment updated");refresh();},onError:(e)=>toast.error(e instanceof Error?e.message:"Assignment failed")});
  const entity = data?.entity || {};
  const recommendation = data?.recommendation;
  const simulation = data?.simulations?.[0];

  return <><button className="fixed inset-0 z-40 bg-black/60" onClick={onClose} aria-label="Close workspace" />
    <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l border-border bg-surface p-5 shadow-2xl sm:p-7">
      <div className="flex items-center"><div><div className="eyebrow">{kind} action workspace</div><h2 className="font-display text-xl font-bold">{entity.title || entity.type || "Loading…"}</h2></div><button onClick={onClose} className="ml-auto rounded-lg border border-border p-2"><X size={15}/></button></div>
      {isLoading ? <p className="mt-8 text-sm text-slate-400">Loading the complete lifecycle…</p> : error ? <p className="mt-8 text-sm text-red-400">{error instanceof Error ? error.message : "Unable to load workspace"}</p> : <div className="mt-6 space-y-5">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={kind === "incident" ? "Revenue at risk" : "Projected opportunity"} value={money(Number(entity.revenueAtRisk || entity.projectedRevenueGain || entity.impact), entity.currency || recommendation?.currency)} />
          <Stat label="Confidence" value={`${entity.confidence || recommendation?.confidence || 0}%`} />
          <Stat label="Risk" value={entity.riskLevel || entity.severity || "Unrated"} />
          <Stat label="Lifecycle" value={recommendation?.status || entity.status || "open"} />
        </section>
        <label className="block rounded-xl border border-border bg-elevated p-3 text-[10px] text-slate-500">Assigned team member<select value={String(entity.assignedTo||"")} onChange={e=>assign.mutate(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-surface p-2 text-xs text-foreground"><option value="">Unassigned</option>{members.data?.members.filter(m=>m.status==="active").map(member=><option key={member.id} value={member.userId}>{member.user?.name||member.user?.email||member.userId}</option>)}</select></label>
        <Section title="What happened"><p>{entity.explanation || entity.suggested?.reason || entity.detectionSource || entity.type}</p></Section>
        <Section title="Evidence and affected scope"><pre>{JSON.stringify({ affectedListings: entity.listingIds || [entity.listingId].filter(Boolean), affectedDates: entity.affectedDates || [], evidence: entity.evidence }, null, 2)}</pre></Section>
        <Section title="Financial calculation"><pre>{JSON.stringify(entity.impactCalculation || recommendation?.impactCalculation || { unavailable: "No defensible stored calculation" }, null, 2)}</pre></Section>
        {recommendation && <Section title="Recommendation"><p className="font-semibold text-foreground">{recommendation.title}</p><p>{recommendation.explanation}</p><p className="mt-2">Action: {recommendation.proposedAction} · expires {new Date(recommendation.expiresAt).toLocaleString()}</p></Section>}
        {simulation && <Section title="Latest persistent simulation"><pre>{JSON.stringify({ strategy: simulation.selectedStrategy, baseline: simulation.baselineState, livePreview: simulation.previewResponse, modeled: simulation.calculatedProjections, expiresAt: simulation.expiresAt }, null, 2)}</pre></Section>}
        <div className="rounded-xl border border-border p-4 space-y-3"><label className="text-[10px] uppercase text-slate-500">Reason for ignore, dismiss, cancel, or scheduling</label><input value={reason} onChange={(e)=>setReason(e.target.value)} className="w-full rounded-lg border border-border bg-elevated px-3 py-2 text-xs" placeholder="Explain the decision"/><div className="flex flex-wrap gap-2">
          <Action icon={<RefreshCw size={13}/>} label="Refresh previews" onClick={()=>simulate.mutate()} disabled={!recommendation || simulate.isPending}/>
          <Action label="Review" onClick={()=>decision.mutate("review")} disabled={!recommendation}/><Action label="Approve" onClick={()=>decision.mutate("approve")} disabled={!recommendation||!data?.capabilities?.canApprove}/>
          <Action label="Ignore 24h" onClick={()=>decision.mutate("ignore")} disabled={!recommendation}/><Action label="Dismiss" onClick={()=>decision.mutate("dismiss")} disabled={!recommendation || !reason.trim()}/><Action label="Cancel" onClick={()=>decision.mutate("cancel")} disabled={recommendation?.status !== "SCHEDULED"}/>
          <Action icon={<ShieldCheck size={13}/>} label="Apply & verify" onClick={()=>execute.mutate()} disabled={!data?.capabilities?.canExecute || execute.isPending}/>
        </div><div className="flex gap-2"><input type="datetime-local" value={executeAt} onChange={(e)=>setExecuteAt(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-elevated px-3 py-2 text-xs"/><Action icon={<CalendarClock size={13}/>} label="Schedule" onClick={()=>schedule.mutate()} disabled={!executeAt || recommendation?.status !== "APPROVED"||!data?.capabilities?.canExecute}/></div>{data?.capabilities&&!data.capabilities.canExecute&&<p className="text-[10px] text-amber-300">Execution unavailable: write access {data.capabilities.writeAccess}; recommendation fresh {String(data.capabilities.recommendationFresh)}; simulation fresh {String(data.capabilities.simulationFresh)}.</p>}</div>
        <Section title="Actions and measured outcomes"><div className="space-y-3">{data?.actions?.map((action)=><div key={action.id || action._id} className="rounded-lg border border-border p-3"><div className="flex items-center gap-2"><span className="font-semibold text-foreground">{action.actionType}</span><span className="ml-auto uppercase">{action.status}</span></div>{action.revertInformation?.supported && action.status === "VERIFIED" && <button onClick={()=>window.confirm("Restore the exact previous Wheelhouse state and verify it?") && revert.mutate(action.id || action._id)} className="mt-2 rounded-lg border border-amber-500/20 px-3 py-2 text-[10px] text-amber-300">Previewed previous state: {JSON.stringify(action.revertInformation.previousState)} · Revert</button>}</div>)}</div><pre className="mt-3">{JSON.stringify({ outcomes: data?.outcomes || [] }, null, 2)}</pre></Section>
        <Section title="Activity and collaboration"><div className="space-y-2">{[...(data?.activity || []), ...(data?.comments || [])].map((entry, index)=>{ const item = entry as Record<string, any>; return <div key={item._id || index} className="border-b border-border pb-2 text-xs">{item.body || item.action} <span className="text-slate-600">{item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}</span></div>; })}</div><div className="mt-3 flex gap-2"><input value={comment} onChange={(e)=>setComment(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-elevated px-3 py-2 text-xs" placeholder="Add an organization-visible note"/><Action icon={<MessageSquare size={13}/>} label="Comment" onClick={()=>addComment.mutate()} disabled={!comment.trim()}/></div></Section>
      </div>}
    </aside></>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-border bg-elevated p-3"><div className="text-[8px] uppercase text-slate-500">{label}</div><div className="mt-1 truncate text-sm font-bold capitalize">{value}</div></div>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-xl border border-border bg-elevated p-4 text-xs leading-relaxed text-slate-400"><h3 className="mb-2 text-[11px] font-bold text-foreground">{title}</h3>{children}</section>; }
function Action({ label, icon, onClick, disabled }: { label: string; icon?: React.ReactNode; onClick: () => void; disabled?: boolean }) { return <button onClick={onClick} disabled={disabled} className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/5 px-3 py-2 text-[11px] font-semibold hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35">{icon}{label}</button>; }
