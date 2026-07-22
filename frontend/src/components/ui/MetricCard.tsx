import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tone?: "healthy" | "critical" | "warning" | "opportunity" | "pending" | "neutral";
  onClick?: () => void;
}

const toneMap: Record<string, string> = {
  healthy:     "bg-emerald-500/10 text-emerald-400",
  critical:    "bg-red-500/10 text-red-400",
  warning:     "bg-amber-500/10 text-amber-400",
  opportunity: "bg-sky-500/10 text-sky-400",
  pending:     "bg-violet-500/10 text-violet-400",
  neutral:     "bg-white/5 text-slate-400",
};

export function MetricCard({ label, value, detail, icon: Icon, tone = "neutral", onClick }: MetricCardProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`card min-w-0 rounded-2xl p-4 text-left transition-colors sm:p-5 ${onClick ? "cursor-pointer hover:border-white/15" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-semibold leading-tight text-slate-400">{label}</span>
        <span className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ${toneMap[tone]}`}>
          <Icon size={15} />
        </span>
      </div>
      <div className="font-display mt-3 break-words text-[22px] font-bold leading-none tracking-tight sm:text-[26px]">
        {value}
      </div>
      {detail && <div className="mt-1.5 text-[10px] text-slate-500">{detail}</div>}
    </Tag>
  );
}
