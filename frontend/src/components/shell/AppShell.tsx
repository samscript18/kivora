"use client";
import { useState } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { AnimatePresence, motion } from "framer-motion";
import { OnboardingModal } from "@/components/dashboard/OnboardingModal";
import { usePathname } from "next/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="app-environment relative min-h-screen overflow-x-clip bg-canvas">
      <div className="app-grid pointer-events-none fixed inset-0" />
      <div className="app-aurora app-aurora-one pointer-events-none fixed" />
      <div className="app-aurora app-aurora-two pointer-events-none fixed" />
      <div className="app-light-sweep pointer-events-none fixed inset-0" />
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              className="fixed inset-y-0 left-0 z-50 lg:hidden"
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
      <div className="relative z-10 flex min-h-screen flex-col lg:ml-[304px]">
        <TopBar onMenuOpen={() => setMobileOpen(true)} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={pathname}
            className="dashboard-surface flex-1"
            id="main-content"
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, filter: "blur(7px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
      <OnboardingModal />
    </div>
  );
}
