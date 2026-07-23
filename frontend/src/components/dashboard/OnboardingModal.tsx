"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronLeft, ChevronRight, CloudSun, ExternalLink, KeyRound, MessageCircle, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { createTelegramLink, createWheelhouseConnection, enableMarketIntelligence, getIntegrationSettings, getTelegramStatus, getWheelhouseConnections, QUERY_KEYS } from "@/lib/api";
import { useOnboardingStore } from "@/store/onboarding";

export function OnboardingModal() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [marketPromptVisible, setMarketPromptVisible] = useState(false);
  const [name, setName] = useState("Primary Wheelhouse account");
  const [credential, setCredential] = useState("");

  const organizationId = typeof window === "undefined" ? "" : window.localStorage.getItem("kivora.organizationId") || "current";
  const { manuallyOpen, dismissedOrganizations, dismiss } = useOnboardingStore();

  const connections = useQuery({ queryKey: QUERY_KEYS.wheelhouseConnections, queryFn: getWheelhouseConnections });
  const telegram = useQuery({ queryKey: QUERY_KEYS.telegramStatus, queryFn: getTelegramStatus });
  const integrationSettings = useQuery({ queryKey: ["integration-settings"], queryFn: getIntegrationSettings });

  const wheelhouseConnected = Boolean(connections.data?.some((item) => item.status !== "revoked"));
  const mobileConnected = Boolean(telegram.data?.connected);
  const marketIntelligenceEnabled = Boolean(integrationSettings.data?.find((item: any) => item.provider === "ticketmaster" && item.enabled)) && Boolean(integrationSettings.data?.find((item: any) => item.provider === "openweather" && item.enabled));

  const needsSetup = !wheelhouseConnected || !mobileConnected;
  const automatic = !dismissedOrganizations.includes(organizationId) && needsSetup;
  const open = (automatic || manuallyOpen || marketPromptVisible) && !connections.isLoading && !telegram.isLoading;

  const connect = useMutation({
    mutationFn: () => createWheelhouseConnection({ displayName: name.trim(), credential: credential.trim() }),
    onSuccess: () => {
      setCredential("");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.wheelhouseConnections });
      setStep(2);
      toast.success("Wheelhouse connected", { description: "Your first live portfolio synchronization is complete." });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Wheelhouse could not be connected"),
  });

  const link = useMutation({
    mutationFn: createTelegramLink,
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.success("Mobile companion opened", { description: "Tap Start in Telegram, then return here when linking is complete." });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Mobile companion could not be opened"),
  });

  const enableSignals = useMutation({
    mutationFn: enableMarketIntelligence,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["integration-settings"] }),
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.capabilities }),
      ]);
      setMarketPromptVisible(false);
      dismiss(organizationId);
      toast.success("Market intelligence enabled", { description: "Ticketmaster and OpenWeather are now enriching pricing decisions." });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Market intelligence could not be enabled"),
  });

  useEffect(() => {
    if (!open) return;
    // Open on the first incomplete setup item, without preventing a user from
    // navigating back to review a previously completed connection.
    const frame = window.requestAnimationFrame(() => setStep(!wheelhouseConnected ? 1 : !mobileConnected ? 2 : 3));
    return () => window.cancelAnimationFrame(frame);
  // Deliberately reset only when the modal opens or connection state changes.
  }, [open, wheelhouseConnected, mobileConnected]);

  useEffect(() => {
    if (!marketPromptVisible) return;
    if (marketIntelligenceEnabled) {
      const frame = window.requestAnimationFrame(() => {
        setMarketPromptVisible(false);
        dismiss(organizationId);
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [dismiss, marketIntelligenceEnabled, marketPromptVisible, organizationId]);

  const progress = useMemo(() => Number(wheelhouseConnected) + Number(mobileConnected) + Number(marketIntelligenceEnabled), [wheelhouseConnected, mobileConnected, marketIntelligenceEnabled]);

  const close = () => {
    setMarketPromptVisible(false);
    dismiss(organizationId);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button aria-label="Close setup guide" className="fixed inset-0 z-70 bg-black/75 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <div className="pointer-events-none fixed inset-0 z-71 flex items-end justify-center p-3 sm:items-center sm:p-4">
            <motion.section role="dialog" aria-modal="true" aria-labelledby="onboarding-title" initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} transition={{ duration: 0.25 }} className="pointer-events-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0f1012] shadow-2xl">
              <div className="border-b border-white/6 p-5 sm:p-8">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="eyebrow">Welcome to Kivora</div>
                    <h2 id="onboarding-title" className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Let&apos;s connect your revenue workspace.</h2>
                    <p className="mt-2 max-w-xl text-xs leading-5 text-slate-400 sm:text-sm sm:leading-6">Two core connections unlock live portfolio monitoring and mobile decisions, and Market Intelligence adds event and weather signals to your pricing workflow.</p>
                  </div>
                  <button onClick={close} className="shrink-0 rounded-xl border border-border p-2 text-slate-400 hover:text-foreground"><X size={16} /></button>
                </div>
                <div className="mt-5 flex items-center gap-3 sm:mt-6">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/6"><motion.div className="h-full rounded-full bg-accent" animate={{ width: `${(progress / 3) * 100}%` }} /></div>
                  <span className="font-mono text-[10px] text-slate-500">{progress}/3 connected</span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2" aria-label="Setup steps">
                  {[1, 2, 3].map((item) => <button key={item} onClick={() => setStep(item as 1 | 2 | 3)} aria-current={step === item ? "step" : undefined} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[10px] font-mono transition-colors ${step === item ? "bg-accent/10 text-accent" : "text-slate-500 hover:text-slate-300"}`}><span className={`grid h-5 w-5 place-items-center rounded-full border ${step === item ? "border-accent" : "border-white/15"}`}>{item}</span><span className="hidden sm:inline">{item === 1 ? "Wheelhouse" : item === 2 ? "Telegram" : "Signals"}</span></button>)}
                </div>
              </div>

              <div className="p-5 sm:p-8">
                {step === 1 ? (
                  <div>
                    <SetupTitle icon={<KeyRound size={19} />} number="01" title="Connect Wheelhouse" description="Kivora validates the key live, encrypts it, and imports only your organization&apos;s listings." />
                    {wheelhouseConnected ? <CompletedConnection label="Wheelhouse is connected and available for live portfolio reads." /> : <><div className="mt-6 grid gap-3 sm:grid-cols-2">
                      <label className="text-[10px] text-slate-500">Connection name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-elevated p-3 text-xs text-foreground" /></label>
                      <label className="text-[10px] text-slate-500">Wheelhouse API key<input type="password" autoComplete="off" value={credential} onChange={(event) => setCredential(event.target.value)} placeholder="Paste your live API key" className="mt-1.5 w-full rounded-xl border border-border bg-elevated p-3 text-xs text-foreground" /></label>
                    </div>
                    <button disabled={connect.isPending || name.trim().length < 2 || credential.trim().length < 8} onClick={() => connect.mutate()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-xs font-bold text-white disabled:opacity-40 sm:w-auto">{connect.isPending ? "Connecting your live portfolio…" : "Connect Wheelhouse"}<ArrowRight size={14} /></button></>}
                  </div>
                ) : step === 2 ? (
                  <div>
                    <SetupTitle icon={<MessageCircle size={19} />} number="02" title="Connect your mobile companion" description="Receive morning briefings, ask portfolio questions, and review signed actions from Telegram." />
                    {mobileConnected ? <CompletedConnection label="Telegram is connected for mobile briefings and signed actions." /> : <div className="mt-6 rounded-2xl border border-white/6 bg-white/2 p-4 sm:p-5">
                      <p className="text-xs leading-6 text-slate-400">We&apos;ll open Telegram. Tap <strong className="text-foreground">Start</strong>, follow the secure link, then return to Kivora.</p>
                      <button disabled={link.isPending} onClick={() => link.mutate()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-xs font-bold text-white disabled:opacity-40 sm:w-auto">{link.isPending ? "Opening Telegram…" : "Open Telegram"}<ExternalLink size={14} /></button>
                    </div>}
                  </div>
                ) : (
                  <div>
                    <SetupTitle icon={<Sparkles size={19} />} number="03" title="Enable Market Intelligence" description="Connect Ticketmaster and OpenWeather to enrich pricing decisions with event and weather signals." />
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      <FeatureCard title="Event intelligence" icon={<Sparkles size={18} />} text="Live concerts, sports, and venue demand signals are matched to portfolio markets." />
                      <FeatureCard title="Weather intelligence" icon={<CloudSun size={18} />} text="Forecast shifts and severe weather alerts are folded into pricing decisions." />
                    </div>
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                      <button disabled={enableSignals.isPending || marketIntelligenceEnabled} onClick={() => enableSignals.mutate()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-xs font-bold text-white disabled:opacity-40 sm:w-auto">{marketIntelligenceEnabled ? "Market Intelligence enabled" : enableSignals.isPending ? "Enabling intelligence…" : "Enable Market Intelligence"}</button>
                      <button onClick={close} className="inline-flex w-full items-center justify-center rounded-xl border border-border px-5 py-3 text-xs font-semibold text-slate-300 hover:text-foreground sm:w-auto">Maybe later</button>
                    </div>
                  </div>
                )}
                <div className="mt-8 flex items-center justify-between border-t border-white/6 pt-4">
                  <button onClick={() => setStep((current) => Math.max(1, current - 1) as 1 | 2 | 3)} disabled={step === 1} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"><ChevronLeft size={15} />Previous</button>
                  <span className="text-[10px] font-mono text-slate-500">Step {step} of 3</span>
                  <button onClick={() => setStep((current) => Math.min(3, current + 1) as 1 | 2 | 3)} disabled={step === 3} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30">Next<ChevronRight size={15} /></button>
                </div>
              </div>
            </motion.section>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function SetupTitle({ icon, number, title, description }: { icon: ReactNode; number: string; title: string; description: string }) {
  return <div className="flex gap-4"><span className="grid h-11 w-11 flex-none place-items-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">{icon}</span><div><div className="font-mono text-[9px] uppercase tracking-[.18em] text-accent">Step {number}</div><h3 className="mt-1 text-base font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{description}</p></div></div>;
}

function FeatureCard({ title, text, icon }: { title: string; text: string; icon: ReactNode }) {
  return <div className="rounded-2xl border border-white/6 bg-white/2 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-foreground">{icon}{title}</div><p className="mt-2 text-xs leading-5 text-slate-400">{text}</p></div>;
}

function CompletedConnection({ label }: { label: string }) {
  return <div className="mt-6 flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-200"><span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/15 text-emerald-400"><Check size={15} /></span>{label}</div>;
}
