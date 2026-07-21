interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function SkeletonMetricCard() {
  return (
    <div className="card rounded-2xl p-5" aria-hidden="true">
      <div className="flex items-start justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="mt-4 h-8 w-32" />
      <Skeleton className="mt-2 h-2.5 w-20" />
    </div>
  );
}

export function SkeletonPriorityRow() {
  return (
    <div className="flex items-center gap-4 border-b border-white/6 p-4" aria-hidden="true">
      <Skeleton className="h-4 w-6" />
      <Skeleton className="h-5 w-16 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="h-2.5 w-32" />
      </div>
      <div className="text-right space-y-2">
        <Skeleton className="h-4 w-20 ml-auto" />
        <Skeleton className="h-2.5 w-16 ml-auto" />
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card rounded-2xl p-5 space-y-3" aria-hidden="true">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-b border-white/6 p-4" aria-hidden="true">
      <Skeleton className="h-10 w-10 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-2.5 w-24" />
      </div>
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-4 w-16" />
    </div>
  );
}
