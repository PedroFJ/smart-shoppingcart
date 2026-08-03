import { create } from "zustand";
import { defaultItinerary, SectionId } from "../data/sampleData";
import { PickEvent } from "../domain/routeInference";
import { createAppJsonStorage, persist } from "./persistence";
import { PersistedAppState, StoreItineraries } from "./types";

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
  persist(
    (set) => ({
      itinerary: defaultItinerary,
      storeItineraries: {},
      pickEvents: [],
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
      storage: createAppJsonStorage<Pick<RoutesState, "itinerary" | "storeItineraries" | "pickEvents">>(),
      version: 0,
      partialize: (state) => ({
        itinerary: state.itinerary,
        storeItineraries: state.storeItineraries,
        pickEvents: state.pickEvents
      })
    }
  )
);
