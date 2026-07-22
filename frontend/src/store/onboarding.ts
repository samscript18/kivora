"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type OnboardingState = {
  manuallyOpen: boolean;
  dismissedOrganizations: string[];
  open: () => void;
  close: () => void;
  dismiss: (organizationId: string) => void;
  resetForSignIn: () => void;
};

export const useOnboardingStore = create<OnboardingState>()(persist((set) => ({
  manuallyOpen: false,
  dismissedOrganizations: [],
  open: () => set({ manuallyOpen: true }),
  close: () => set({ manuallyOpen: false }),
  dismiss: (organizationId) => set((state) => ({ manuallyOpen: false, dismissedOrganizations: [...new Set([...state.dismissedOrganizations, organizationId])] })),
  resetForSignIn: () => set({ manuallyOpen: false, dismissedOrganizations: [] }),
}), { name: "kivora-onboarding-session", storage: createJSONStorage(() => sessionStorage), partialize: (state) => ({ dismissedOrganizations: state.dismissedOrganizations }) }));
