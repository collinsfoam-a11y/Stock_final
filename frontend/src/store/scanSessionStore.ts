import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface ScanSessionState {
  // Session Context
  currentFloor: string | null;
  currentRack: string | null; // Manual input for rack/shelf identifier
  isSectionActive: boolean;
  activeSessionId: string | null;
  sessionType: "STANDARD" | "BLIND" | "STRICT";
  /** True once AsyncStorage hydration has completed */
  _hydrated: boolean;

  // Actions
  setFloor: (floor: string) => void;
  setRack: (rack: string) => void;
  setActiveSession: (id: string, type: "STANDARD" | "BLIND" | "STRICT") => void;
  clearActiveSession: () => void;
  startSection: () => void;
  closeSection: () => void;
  resumeSession: () => void;
  resetSession: () => void;
}

export const useScanSessionStore = create<ScanSessionState>()(
  persist(
    (set, get) => ({
      currentFloor: null,
      currentRack: null,
      isSectionActive: false,
      activeSessionId: null,
      sessionType: "STANDARD",
      _hydrated: false,

      setFloor: (floor) => set({ currentFloor: floor }),
      setRack: (rack) => set({ currentRack: rack }),
      setActiveSession: (id, type) =>
        set({ activeSessionId: id, sessionType: type }),
      clearActiveSession: () =>
        set({ activeSessionId: null, sessionType: "STANDARD" }),

      startSection: () => {
        const { currentFloor, currentRack } = get();
        if (currentFloor && currentRack) {
          set({ isSectionActive: true });
        }
      },

      closeSection: () => {
        set({
          isSectionActive: false,
          currentFloor: null,
          currentRack: null,
        });
      },

      resumeSession: () => {
        // Guard: do not act on stale defaults before AsyncStorage has hydrated
        if (!get()._hydrated) return;
        const { currentFloor, currentRack, isSectionActive } = get();
        if (isSectionActive && (!currentFloor || !currentRack)) {
          set({ isSectionActive: false });
        }
      },

      resetSession: () => {
        set({
          currentFloor: null,
          currentRack: null,
          isSectionActive: false,
          activeSessionId: null,
          sessionType: "STANDARD",
        });
      },
    }),
    {
      name: "scan-session-storage",
      storage: createJSONStorage(() => AsyncStorage),
      // Mark store as hydrated once AsyncStorage finishes loading so that
      // resumeSession() never runs safety checks against pre-hydration defaults.
      onRehydrateStorage: () => (_state, error) => {
        if (!error) {
          useScanSessionStore.setState({ _hydrated: true });
        }
      },
    },
  ),
);

export const clearScanSessionStore = async () => {
  useScanSessionStore.getState().resetSession();
  try {
    await useScanSessionStore.persist.clearStorage();
  } catch {
    // Best-effort; ignore storage errors.
  }
};
