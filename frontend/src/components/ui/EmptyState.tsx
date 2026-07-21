import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  heading: string;
  body?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, heading, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {Icon && (
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-slate-500">
          <Icon size={22} />
        </span>
      )}
      <h3 className="text-sm font-semibold text-slate-300">{heading}</h3>
      {body && <p className="mt-2 max-w-xs text-xs leading-5 text-slate-500">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  error?: unknown;
  heading?: string;
  onRetry?: () => void;
}

export function ErrorState({ error, heading = "Could not load data", onRetry }: ErrorStateProps) {
  const message = error instanceof Error ? error.message : "The request failed. Check the backend connection.";
  return (
    <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
      <p className="text-sm font-semibold text-red-400">{heading}</p>
      <p className="mt-1.5 text-xs text-slate-500">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5"
        >
          Retry
        </button>
      )}
    </div>
  );
}
