type SeverityVariant = "critical" | "high" | "medium" | "low";
type StatusVariant = "healthy" | "opportunity" | "warning" | "pending" | "applied" | "failed" | "dismissed" | "disconnected" | "sync_issue";

type BadgeVariant = SeverityVariant | StatusVariant | string;

const map: Record<string, { cls: string; label?: string }> = {
  critical:      { cls: "badge-critical",     label: "Critical" },
  high:          { cls: "badge-critical",     label: "High" },
  medium:        { cls: "badge-warning",      label: "Medium" },
  low:           { cls: "badge-opportunity",  label: "Low" },
  healthy:       { cls: "badge-healthy",      label: "Healthy" },
  opportunity:   { cls: "badge-opportunity",  label: "Opportunity" },
  warning:       { cls: "badge-warning",      label: "Warning" },
  pending:       { cls: "badge-pending",      label: "Pending" },
  applied:       { cls: "badge-applied",      label: "Applied" },
  failed:        { cls: "badge-critical",     label: "Failed" },
  dismissed:     { cls: "badge-disconnected", label: "Dismissed" },
  disconnected:  { cls: "badge-disconnected", label: "Disconnected" },
  sync_issue:    { cls: "badge-warning",      label: "Sync issue" },
};

interface StatusBadgeProps {
  variant: BadgeVariant;
  label?: string;
  size?: "xs" | "sm";
}

export function StatusBadge({ variant, label, size = "xs" }: StatusBadgeProps) {
  const entry = map[variant] ?? { cls: "badge-disconnected" };
  const text = label ?? entry.label ?? variant;
  const sizeCls = size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-2 py-0.5 text-[9px]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wider ${sizeCls} ${entry.cls}`}>
      {text}
    </span>
  );
}

interface SeverityDotProps {
  severity: SeverityVariant;
}

export function SeverityDot({ severity }: SeverityDotProps) {
  const dotMap: Record<SeverityVariant, string> = {
    critical: "bg-red-500",
    high:     "bg-orange-500",
    medium:   "bg-amber-500",
    low:      "bg-sky-500",
  };
  return <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${dotMap[severity]}`} aria-label={`${severity} severity`} />;
}
