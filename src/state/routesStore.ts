import { create } from "zustand";
import { defaultItinerary, SectionId } from "../data/sampleData";
import { PickEvent } from "../domain/routeInference";
import { createAppJsonStorage, persist, readLegacyAppState, shouldImportLegacyState } from "./persistence";
import { PersistedAppState, StoreItineraries } from "./types";

const legacyState = shouldImportLegacyState() ? readLegacyAppState() : null;

type RoutesState = {
  itinerary: SectionId[];
  storeItineraries: StoreItineraries;
  pickEvents: PickEvent<SectionId>[];
  setItinerary: (itinerary: SectionId[]) => void;
  setStoreItineraries: (storeItineraries: StoreItineraries) => void;
  setPickEvents: (pickEvents: PickEvent<SectionId>[]) => void;
  hydrateFromLegacy: (legacyState: PersistedAppState | null) => void;
};

export const useRoutesStore = create<RoutesState>()(
  persist<RoutesState>(
    (set) => ({
      itinerary: legacyState?.itinerary ?? defaultItinerary,
      storeItineraries: legacyState?.storeItineraries ?? {},
      pickEvents: legacyState?.pickEvents ?? [],
      setItinerary: (itinerary) => set({ itinerary }),
      setStoreItineraries: (storeItineraries) => set({ storeItineraries }),
      setPickEvents: (pickEvents) => set({ pickEvents }),
      hydrateFromLegacy: (nextLegacyState) => {
        if (!nextLegacyState) {
          return;
        }

        set({
          itinerary: nextLegacyState.itinerary,
          storeItineraries: nextLegacyState.storeItineraries,
          pickEvents: nextLegacyState.pickEvents
        });
      }
    }),
    {
      name: "smart-shoppingcart:routes-store:v1",
      storage: createAppJsonStorage()
    }
  )
);
