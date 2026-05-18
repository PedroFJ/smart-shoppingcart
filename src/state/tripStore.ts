import { create } from "zustand";
import { createAppJsonStorage, persist, readLegacyAppState, shouldImportLegacyState } from "./persistence";
import { PersistedAppState } from "./types";

const legacyState = shouldImportLegacyState() ? readLegacyAppState() : null;

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
  persist<TripState>(
    (set) => ({
      isCheckoutLocked: legacyState?.isCheckoutLocked ?? false,
      lockedPickingIds: legacyState?.lockedPickingIds ?? [],
      activeTripItemIds: legacyState?.activeTripItemIds ?? [],
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
      storage: createAppJsonStorage()
    }
  )
);
