"use client";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { useEffect } from "react";

interface ActionConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  summary?: React.ReactNode;
}

export function ActionConfirmDialog({
  open,
  onClose,
  onConfirm,
  loading,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  summary,
}: ActionConfirmDialogProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto p-3 sm:items-center sm:p-4"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
          >
            <div className="card max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {variant === "destructive" && (
                    <span className="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-red-500/10 text-red-400">
                      <AlertTriangle size={16} />
                    </span>
                  )}
                  <div>
                    <h2 id="dialog-title" className="font-semibold text-foreground">{title}</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg border border-white/10 text-slate-500 hover:text-slate-300"
                  aria-label="Close dialog"
                >
                  <X size={13} />
                </button>
              </div>

              {summary && (
                <div className="mt-5 rounded-xl bg-white/[0.03] border border-white/8 p-4">
                  {summary}
                </div>
              )}

              <div className="mt-5 flex flex-col-reverse gap-2 min-[380px]:flex-row">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 rounded-xl border border-white/10 py-2.5 text-xs font-semibold text-slate-400 hover:bg-white/5 disabled:opacity-40"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={onConfirm}
                  disabled={loading}
                  className={`flex-1 rounded-xl py-2.5 text-xs font-bold disabled:opacity-50 ${
                    variant === "destructive"
                      ? "bg-red-600 text-white hover:bg-red-500"
                      : "bg-accent text-white hover:bg-accent/90"
                  }`}
                >
                  {loading ? "Working…" : confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
