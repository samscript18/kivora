"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { askKivora, clearAssistantHistory, getAssistantHistory, QUERY_KEYS } from "@/lib/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, User, Sparkles, HelpCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RichText } from "@/components/ui/RichText";

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
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const historyQuery = useQuery({ queryKey: QUERY_KEYS.assistantHistory, queryFn: getAssistantHistory });

  const messages: Message[] = useMemo(() => [...(historyQuery.data || []).map((message) => ({ id: message.id, role: message.role, text: message.text })), ...pendingMessages], [historyQuery.data, pendingMessages]);

  const askMutation = useMutation({
    mutationFn: askKivora,
    onSuccess: async (result) => {
      setPendingMessages((prev) => [...prev, { id: messageId(), role: "assistant", text: result.body }]);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.assistantHistory });
      setPendingMessages([]);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Kivora could not answer right now.";
      setPendingMessages((prev) => [...prev, { id: messageId(), role: "assistant", text: `I couldn't complete that answer. ${message}` }]);
      toast.error(message);
    },
  });
  const clearMutation = useMutation({
    mutationFn: clearAssistantHistory,
    onSuccess: () => { setPendingMessages([]); queryClient.setQueryData(QUERY_KEYS.assistantHistory, []); toast.success("Conversation cleared"); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Conversation could not be cleared"),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, askMutation.isPending]);

  const handleSend = (textToSend?: string) => {
    const q = (textToSend || question).trim();
    if (!q || askMutation.isPending) return;

    setPendingMessages((prev) => [...prev, { id: messageId(), role: "user", text: q }]);
    if (!textToSend) setQuestion("");
    askMutation.mutate(q);
  };

  return (
    <div className="dashboard-page space-y-6">
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
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">Portfolio grounded</span>{messages.length > 0 && <button onClick={() => window.confirm("Clear your saved Kivora conversation?") && clearMutation.mutate()} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[10px] text-slate-400 hover:text-foreground"><Trash2 size={12}/> Clear chat</button>}</div>
      </div>

      {/* Suggested Prompts */}
      <div className="mobile-scroll-row flex items-center gap-2 pb-1">
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
      <div className="card flex h-[min(620px,calc(100dvh-190px))] min-h-[430px] flex-col overflow-hidden rounded-2xl">
        {/* Messages */}
        <div className="flex-1 space-y-4 overflow-y-auto p-3 sm:p-5">
          {historyQuery.isLoading ? <div className="grid h-full place-items-center text-xs text-slate-500">Loading your conversation…</div> : messages.length === 0 ? (
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
                    className={`min-w-0 max-w-[calc(100%-2.75rem)] rounded-2xl p-3 text-xs leading-relaxed sm:max-w-xl sm:p-4 ${
                      isUser
                        ? "bg-accent text-white font-medium"
                        : "border border-border bg-elevated text-slate-200"
                    }`}
                  >
                    {isUser ? <p className="whitespace-pre-wrap">{msg.text}</p> : <RichText text={msg.text} />}
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
        <div className="flex gap-2 border-t border-border bg-elevated/50 p-3 sm:p-4">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask Kivora about your live portfolio..."
            className="min-w-0 flex-1 rounded-xl border border-border bg-elevated px-3 py-3 text-xs text-foreground placeholder-slate-500 outline-none focus:border-accent sm:px-4"
          />
          <button
            disabled={!question.trim() || askMutation.isPending}
            onClick={() => handleSend()}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-xs font-bold text-white transition-colors hover:bg-accent/90 disabled:opacity-40 sm:w-auto sm:px-5"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
