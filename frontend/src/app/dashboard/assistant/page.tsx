"use client";

import { useMutation } from "@tanstack/react-query";
import { askKivora } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import { Bot, Send, User, Sparkles, HelpCircle } from "lucide-react";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const messageId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

const suggestedPrompts = [
  "What is my biggest revenue risk today?",
  "Which listings need immediate pricing review?",
  "Show active demand signals for Nashville.",
  "Explain today's top recommended action.",
  "Compare occupancy pace against market benchmarks."
];

export default function AssistantPage() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const askMutation = useMutation({
    mutationFn: askKivora,
    onSuccess: (result) => {
      setMessages((prev) => [...prev, { id: messageId(), role: "assistant", text: result.body }]);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Kivora could not answer right now.";
      setMessages((prev) => [...prev, { id: messageId(), role: "assistant", text: `I couldn't complete that answer. ${message}` }]);
      toast.error(message);
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, askMutation.isPending]);

  const handleSend = (textToSend?: string) => {
    const q = (textToSend || question).trim();
    if (!q || askMutation.isPending) return;

    setMessages((prev) => [...prev, { id: messageId(), role: "user", text: q }]);
    if (!textToSend) setQuestion("");
    askMutation.mutate(q);
  };

  return (
    <div className="mx-auto max-w-[1440px] p-4 sm:p-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Context-Aware AI Assistant</div>
          <h2 className="font-display mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
            Ask Kivora AI
          </h2>
          <p className="mt-1 text-[12px] text-slate-400">
            Natural-language answers grounded strictly in your latest live portfolio data.
          </p>
        </div>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
          Portfolio grounded
        </span>
      </div>

      {/* Suggested Prompts */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
        <HelpCircle size={14} className="text-slate-500 flex-shrink-0" />
        <span className="text-[11px] text-slate-500 flex-shrink-0">Suggested:</span>
        {suggestedPrompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => handleSend(prompt)}
            disabled={askMutation.isPending}
            className="px-3 py-1.5 rounded-xl border border-border bg-elevated text-[11px] text-slate-300 hover:text-foreground hover:bg-white/5 flex-shrink-0 transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Chat Container */}
      <div className="card rounded-2xl flex flex-col h-[520px] overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent">
                <Bot size={24} />
              </span>
              <h3 className="font-bold text-sm text-foreground">Grounded AI Revenue Operations</h3>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                Ask about current incidents, revenue risks, strategy modeling, or owner briefs.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl bg-accent/10 text-accent mt-0.5">
                      <Bot size={16} />
                    </span>
                  )}
                  <div
                    className={`max-w-xl rounded-2xl p-4 text-xs leading-relaxed ${
                      isUser
                        ? "bg-accent text-white font-medium"
                        : "border border-border bg-elevated text-slate-200"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                  {isUser && (
                    <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl bg-white/5 text-slate-400 mt-0.5">
                      <User size={16} />
                    </span>
                  )}
                </div>
              );
            })
          )}
          {askMutation.isPending && (
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <Sparkles size={16} className="text-accent animate-spin" />
              Kivora is inspecting your latest portfolio signals...
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-4 bg-elevated/50 flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask Kivora about your live portfolio..."
            className="flex-1 rounded-xl border border-border bg-elevated px-4 py-3 text-xs text-foreground placeholder-slate-500 outline-none focus:border-accent"
          />
          <button
            disabled={!question.trim() || askMutation.isPending}
            onClick={() => handleSend()}
            className="rounded-xl bg-accent px-5 text-white font-bold text-xs hover:bg-accent/90 disabled:opacity-40 transition-colors"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
