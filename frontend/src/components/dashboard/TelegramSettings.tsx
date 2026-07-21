"use client";
import {
  createTelegramLink,
  disconnectTelegram,
  getTelegramStatus,
} from "@/lib/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, Link2, MessageCircle, Unlink, X } from "lucide-react";
import { toast } from "sonner";

export function TelegramSettings({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const status = useQuery({
    queryKey: ["telegram-status"],
    queryFn: getTelegramStatus,
    enabled: open,
    refetchInterval: (query) => (query.state.data?.connected ? false : 3000),
    retry: false,
  });
  const link = useMutation({
    mutationFn: createTelegramLink,
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.success("Mobile companion opened", {
        description:
          "Tap Start. The bot will return a signed Kivora connection link.",
      });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not open the companion",
      ),
  });
  const disconnect = useMutation({
    mutationFn: disconnectTelegram,
    onSuccess: () => {
      toast.success("Mobile companion disconnected");
      status.refetch();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not disconnect the companion",
      ),
  });
  if (!open) return null;
  const data = status.data;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#10251b]/40 p-4 backdrop-blur-sm">
      <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start">
          <div className="flex gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#dceeff] text-[#2381c1]">
              <MessageCircle size={20} />
            </span>
            <div>
              <h2 className="display text-xl font-bold">Mobile companion</h2>
              <p className="mt-1 text-[11px] text-[#77827c]">
                Connect your personal chat to receive live alerts and approve
                actions.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg border"
          >
            <X size={14} />
          </button>
        </div>
        {status.isLoading ? (
          <div className="mt-6 text-sm text-[#77827c]">
            Checking your connection…
          </div>
        ) : status.error ? (
          <div className="mt-6 rounded-xl border border-red-200 p-4 text-sm text-red-700">
            Could not load the mobile connection status.
          </div>
        ) : !data?.botConfigured ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            The mobile companion has not been enabled by your workspace
            administrator.
          </div>
        ) : data.connected ? (
          <div className="mt-6">
            <div className="rounded-2xl border border-[#cfe4d7] bg-[#eff8f2] p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-[#236847]">
                <Link2 size={16} /> Connected
              </div>
              <p className="mt-2 text-xs text-[#607069]">
                {data.connection?.firstName ||
                  data.connection?.username ||
                  "Mobile user"}
                {data.connection?.username
                  ? ` · @${data.connection.username}`
                  : ""}
              </p>
              <p className="mt-1 text-[10px] text-[#839089]">
                Only this linked identity can use your Kivora actions.
              </p>
            </div>
            <button
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
              className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 px-4 py-3 text-xs font-bold text-red-700"
            >
              <Unlink size={14} /> Disconnect companion
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <div className="rounded-2xl border bg-[#f7f9f7] p-5 text-xs leading-6 text-[#64716a]">
              Open the mobile assistant and tap <b>Start</b>. It returns a
              one-time signed link that finishes here after your identity is
              verified.
            </div>
            <button
              disabled={link.isPending}
              onClick={() => link.mutate()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2381c1] px-4 py-3 text-xs font-bold text-white"
            >
              <ExternalLink size={14} />{" "}
              {link.isPending ? "Opening companion…" : "Connect companion"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
