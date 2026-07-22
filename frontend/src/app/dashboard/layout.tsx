"use client";
import { usePrivy } from "@privy-io/react-auth";
import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login } = usePrivy();

  if (!ready) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-canvas p-4 text-center">
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-slate-500 sm:text-xs sm:tracking-widest">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          Preparing your revenue workspace…
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-canvas p-3 sm:p-5">
        <div className="glass-card w-full max-w-md rounded-2xl p-5 text-center sm:p-8">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-accent/25 bg-accent/10 text-accent">
            <ShieldCheck size={22} />
          </div>
          <h1 className="font-display mt-6 text-2xl font-bold tracking-tight">
            Your revenue workspace is protected.
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Sign in to load your live portfolio and authorize revenue actions.
          </p>
          <button
            onClick={login}
            className="mx-auto mt-7 flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-bold text-white hover:bg-accent/90 transition-colors"
          >
            Sign in securely <ArrowRight size={15} />
          </button>
          <Link href="/" className="mt-5 block text-xs text-slate-500 hover:text-slate-400">
            Return to product overview
          </Link>
        </div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}

function NoPrivy({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return <NoPrivy>{children}</NoPrivy>;
  }
  return <AuthGate>{children}</AuthGate>;
}
