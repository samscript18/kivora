"use client";

export function Switch({ checked, onCheckedChange, label, disabled = false }: { checked: boolean; onCheckedChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onCheckedChange(!checked)} className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full border transition-colors ${checked ? "border-accent/50 bg-accent" : "border-white/10 bg-white/[0.06]"} disabled:cursor-not-allowed disabled:opacity-40`}>
    <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-[22px]" : "translate-x-[3px]"}`} />
  </button>;
}
