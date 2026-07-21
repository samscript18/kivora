type Source = "wheelhouse" | "market" | "comps" | "ticketmaster" | "openweather" | "kivora" | "groq";

interface SourceBadgeProps {
  source: Source | string;
}

const sourceMap: Record<string, { label: string; cls: string }> = {
  wheelhouse:  { label: "Live pricing", cls: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" },
  market:      { label: "Market signal", cls: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" },
  comps:       { label: "Comparable set", cls: "bg-violet-500/10 text-violet-400 border border-violet-500/20" },
  ticketmaster:{ label: "Event signal", cls: "bg-blue-500/10 text-blue-400 border border-blue-500/20" },
  openweather: { label: "Weather signal", cls: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  kivora:      { label: "Kivora insight", cls: "bg-orange-500/10 text-orange-400 border border-orange-500/20" },
  groq:        { label: "Grounded answer", cls: "bg-orange-500/10 text-orange-400 border border-orange-500/20" },
};

export function SourceBadge({ source }: SourceBadgeProps) {
  const entry = sourceMap[source.toLowerCase()] ?? { label: source, cls: "bg-white/5 text-slate-400 border border-white/10" };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider ${entry.cls}`}>
      {entry.label}
    </span>
  );
}
