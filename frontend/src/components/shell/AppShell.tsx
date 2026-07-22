"use client";
import { useState } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { AnimatePresence, motion } from "framer-motion";
import { OnboardingModal } from "@/components/dashboard/OnboardingModal";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="relative min-h-screen bg-canvas">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(232,68,42,0.045),transparent_34%),radial-gradient(circle_at_86%_12%,rgba(212,164,22,0.025),transparent_26%)]" />
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              className="fixed inset-y-0 left-0 z-50 md:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
            >
              <Sidebar mobile onClose={() => setMobileOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="relative z-10 flex min-h-screen flex-col md:ml-[292px]">
        <TopBar onMenuOpen={() => setMobileOpen(true)} />
        <main className="flex-1" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <OnboardingModal />
    </div>
  );
}
