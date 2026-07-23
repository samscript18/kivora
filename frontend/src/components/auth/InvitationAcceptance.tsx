"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, ShieldCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { acceptOrganizationInvitation, setAccessTokenProvider, syncUser } from "@/lib/api";
import { getPrivyProfile } from "@/lib/privy-profile";
import { useOnboardingStore } from "@/store/onboarding";

export function InvitationAcceptance({ token }: { token: string }) {
  const { ready, authenticated, login, getAccessToken, user } = usePrivy();
  const router = useRouter();
  const queryClient = useQueryClient();
  const resetOnboarding = useOnboardingStore((state) => state.resetForSignIn);
  const acceptance = useMutation({
    mutationFn: async () => {
      setAccessTokenProvider(getAccessToken);
      const profile = getPrivyProfile(user);
      if (!profile.email) {
        throw new Error("Privy did not provide a verified email for this session. Please sign out, then sign in using the invited email address.");
      }
      // This is deliberately sequenced before acceptance. The backend uses the
      // stored verified address to enforce an invitation's exact-email rule.
      await syncUser(profile);
      return acceptOrganizationInvitation(token);
    },
    onSuccess: async (result) => {
      window.localStorage.setItem("kivora.organizationId", result.organizationId);
      resetOnboarding();
      await queryClient.invalidateQueries();
      toast.success("You joined the Kivora workspace");
      router.replace("/dashboard/war-room");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Invitation could not be accepted"),
  });

  useEffect(() => {
    if (ready && authenticated && token && !acceptance.isPending && !acceptance.isSuccess && !acceptance.isError) {
      acceptance.mutate();
    }
  }, [ready, authenticated, token, acceptance]);

  if (!token) return <InvitationMessage title="This invitation link is incomplete." body="Ask the workspace administrator to create a new invitation link." />;

  return (
    <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-canvas p-3 sm:p-5">
      <div className="hero-orb absolute left-[8%] top-[12%] h-52 w-52 rounded-full border border-accent/20" />
      <div className="hero-orb-delayed absolute bottom-[8%] right-[8%] h-72 w-72 rounded-full border border-amber-300/10" />
      <section className="glass-card relative z-10 w-full max-w-lg overflow-hidden rounded-[24px] p-5 text-center sm:rounded-[28px] sm:p-10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-accent/25 bg-accent/10 text-accent">
          {acceptance.isSuccess ? <CheckCircle2 size={24} /> : <UserPlus size={24} />}
        </span>
        <div className="eyebrow mt-6">Secure team invitation</div>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-[-.05em] sm:text-3xl">Join the Kivora workspace</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-slate-400">
          Sign in with the exact email address that received this invitation. Kivora will verify the single-use link before adding you to the team.
        </p>
        {!ready ? (
          <div className="mt-7 text-xs text-slate-500">Preparing secure access…</div>
        ) : !authenticated ? (
          <button onClick={login} className="mx-auto mt-7 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-xs font-extrabold text-black">
            Sign in to accept <ArrowRight size={14} />
          </button>
        ) : acceptance.isError ? (
          <div className="mt-7 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-left text-xs leading-6 text-red-300">
            <p>{acceptance.error instanceof Error ? acceptance.error.message : "This link may be expired, already used, revoked, or assigned to a different email."}</p>
            <p className="mt-2 text-red-200/80">The expiry shown in the invitation email is authoritative. If it has not passed, make sure Privy is signed in with the exact invited address.</p>
            <button onClick={() => acceptance.reset()} className="mt-3 block font-bold text-white">Try again</button>
          </div>
        ) : (
          <div className="mt-7 flex items-center justify-center gap-2 text-xs text-slate-400">
            <ShieldCheck size={15} className="text-emerald-400" /> Verifying and joining your workspace…
          </div>
        )}
        <Link href="/" className="mt-7 block text-[11px] text-slate-500 hover:text-white">Return to Kivora</Link>
      </section>
    </main>
  );
}

function InvitationMessage({ title, body }: { title: string; body: string }) {
  return <main className="grid min-h-[100dvh] place-items-center bg-canvas p-3 sm:p-5"><section className="glass-card max-w-md rounded-[24px] p-5 text-center sm:rounded-[28px] sm:p-8"><h1 className="font-display text-2xl font-bold">{title}</h1><p className="mt-3 text-sm leading-6 text-slate-400">{body}</p><Link href="/" className="mt-6 inline-block text-xs font-bold text-accent">Return to Kivora</Link></section></main>;
}
