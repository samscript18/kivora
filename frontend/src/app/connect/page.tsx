"use client";
import { usePrivy } from "@privy-io/react-auth";
import { Check, Link2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { connectTelegram } from "@/lib/api";

function ConnectFlow() {
  const params = useSearchParams(),
    router = useRouter();
  const { ready, authenticated, login } = usePrivy();
  const [state, setState] = useState<"waiting" | "done" | "error">("waiting");
  const [message, setMessage] = useState(
    "Verify your Kivora identity to finish linking your mobile companion.",
  );
  const started = useRef(false);
  const intent = params.get("telegramIntent"),
    signature = params.get("telegramSignature");
  const invalid = ready && (!intent || !signature);
  const displayState = invalid
    ? "error"
    : authenticated && state === "waiting"
      ? "linking"
      : state;
  const displayMessage = invalid
    ? "This connection link is incomplete. Return to the assistant and tap Start again."
    : message;
  useEffect(() => {
    if (!ready || !authenticated || !intent || !signature || started.current)
      return;
    started.current = true;
    connectTelegram(intent, signature)
      .then(() => {
        setState("done");
        setMessage("Your mobile companion is connected to Kivora.");
        setTimeout(() => router.replace("/dashboard"), 1400);
      })
      .catch((error) => {
        setState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "The mobile connection could not be completed.",
        );
      });
  }, [ready, authenticated, intent, signature, router]);
  return (
    <div className="glass-card w-full max-w-md rounded-3xl p-5 text-center sm:p-8">
      <div
        className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl border ${displayState === "done" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-[#FF1301]/30 bg-[#FF1301]/10 text-accent"}`}
      >
        {displayState === "done" ? <Check /> : <Link2 />}
      </div>
      <div className="mt-5 font-mono text-[10px] uppercase tracking-[.2em] text-accent">
        Mobile companion
      </div>
      <h1 className="mt-3 font-display text-2xl font-black sm:text-3xl">
        {displayState === "done"
          ? "Connection complete."
          : displayState === "linking"
            ? "Linking your account…"
            : "Connect your companion."}
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">{displayMessage}</p>
      {ready && !authenticated && displayState !== "error" && (
        <button
          onClick={login}
          className="mx-auto mt-7 rounded-full bg-gradient-to-r from-accent to-accent-2 px-7 py-3.5 text-sm font-bold"
        >
          Continue securely
        </button>
      )}
    </div>
  );
}
function Missing() {
  return (
    <div className="glass-card max-w-md rounded-3xl p-5 text-center sm:p-8">
      <h1 className="font-display text-2xl font-black">
        Sign-in configuration required
      </h1>
      <p className="mt-3 text-sm text-slate-400">
        Secure sign-in must be enabled before linking your mobile companion.
      </p>
    </div>
  );
}
export default function ConnectPage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#030303] p-3 sm:p-5">
      <Suspense
        fallback={
          <div className="font-mono text-xs text-slate-500">
            Loading secure link…
          </div>
        }
      >
        {process.env.NEXT_PUBLIC_PRIVY_APP_ID ? <ConnectFlow /> : <Missing />}
      </Suspense>
    </main>
  );
}
