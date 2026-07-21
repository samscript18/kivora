interface ConfidenceProps {
  value: number; // 0-100
  size?: "sm" | "md";
}

export function ConfidenceIndicator({ value, size = "sm" }: ConfidenceProps) {
  const color =
    value >= 80 ? "text-emerald-400" :
    value >= 60 ? "text-amber-400" :
                  "text-slate-400";
  const label =
    value >= 80 ? "High" :
    value >= 60 ? "Medium" : "Low";
  return (
    <span className={`inline-flex items-baseline gap-1 font-mono ${size === "md" ? "text-sm" : "text-[10px]"} font-bold ${color}`}>
      {value}%
      <span className="text-[8px] font-normal text-slate-500 uppercase tracking-wider">{label}</span>
    </span>
  );
}
