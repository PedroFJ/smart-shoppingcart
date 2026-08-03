import { create } from "zustand";
import { createAppJsonStorage, persist } from "./persistence";
import { PersistedAppState } from "./types";

type TripState = {
  isCheckoutLocked: boolean;
  lockedPickingIds: string[];
  activeTripItemIds: string[];
  tripMode: "normal" | "training";
  setCheckoutLocked: (isCheckoutLocked: boolean) => void;
  setLockedPickingIds: (lockedPickingIds: string[]) => void;
  setActiveTripItemIds: (activeTripItemIds: string[]) => void;
  setTripMode: (tripMode: "normal" | "training") => void;
  resetTrip: () => void;
  hydrateFromLegacy: (legacyState: PersistedAppState | null) => void;
};

export const useTripStore = create<TripState>()(
  persist(
    (set) => ({
      isCheckoutLocked: false,
      lockedPickingIds: [],
      activeTripItemIds: [],
      tripMode: "normal",
      setCheckoutLocked: (isCheckoutLocked) => set({ isCheckoutLocked }),
      setLockedPickingIds: (lockedPickingIds) => set({ lockedPickingIds }),
      setActiveTripItemIds: (activeTripItemIds) => set({ activeTripItemIds }),
      setTripMode: (tripMode) => set({ tripMode }),
      resetTrip: () => set({
        isCheckoutLocked: false,
        lockedPickingIds: [],
        activeTripItemIds: [],
        tripMode: "normal"
      }),
      hydrateFromLegacy: (nextLegacyState) => {
        if (!nextLegacyState) {
          return;
        }

        set({
          isCheckoutLocked: nextLegacyState.isCheckoutLocked,
          lockedPickingIds: nextLegacyState.lockedPickingIds,
          activeTripItemIds: nextLegacyState.activeTripItemIds,
          tripMode: "normal"
        });
      }
    }),
    {
      name: "smart-shoppingcart:trip-store:v1",
      storage: createAppJsonStorage<Pick<TripState, "isCheckoutLocked" | "lockedPickingIds" | "activeTripItemIds" | "tripMode">>(),
      version: 0,
      partialize: (state) => ({
        isCheckoutLocked: state.isCheckoutLocked,
        lockedPickingIds: state.lockedPickingIds,
        activeTripItemIds: state.activeTripItemIds,
        tripMode: state.tripMode
      })
    }
  )
);
