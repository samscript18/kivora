import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
      : <span key={index}>{part.replace(/`([^`]+)`/g, "$1")}</span>,
  );
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = String(text || "").split(/\r?\n/);
  return <div className={`min-w-0 space-y-2.5 break-words text-[13px] leading-6 text-slate-300 ${className}`}>
    {blocks.map((raw, index) => {
      const line = raw.trim();
      if (!line) return <div key={index} className="h-1" />;
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading) return <h4 key={index} className="pt-2 text-[13px] font-semibold tracking-tight text-foreground">{inline(heading[2])}</h4>;
      const bullet = /^[-*]\s+(.+)$/.exec(line);
      if (bullet) return <div key={index} className="flex min-w-0 gap-2.5"><span className="mt-[9px] h-1 w-1 flex-none rounded-full bg-accent"/><p className="min-w-0">{inline(bullet[1])}</p></div>;
      const numbered = /^(\d+)\.\s+(.+)$/.exec(line);
      if (numbered) return <div key={index} className="flex gap-2.5"><span className="font-mono text-[10px] text-accent">{numbered[1].padStart(2, "0")}</span><p>{inline(numbered[2])}</p></div>;
      return <p key={index}>{inline(line)}</p>;
    })}
  </div>;
}
