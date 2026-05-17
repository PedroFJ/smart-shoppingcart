import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultItinerary, SectionId } from "../data/sampleData";
import { PickEvent } from "../domain/routeInference";
import { createAppJsonStorage, readLegacyAppState, shouldImportLegacyState } from "./persistence";
import { StoreItineraries } from "./types";

const legacyState = shouldImportLegacyState() ? readLegacyAppState() : null;

type RoutesState = {
  itinerary: SectionId[];
  storeItineraries: StoreItineraries;
  pickEvents: PickEvent<SectionId>[];
  setItinerary: (itinerary: SectionId[]) => void;
  setStoreItineraries: (storeItineraries: StoreItineraries) => void;
  setPickEvents: (pickEvents: PickEvent<SectionId>[]) => void;
};

export const useRoutesStore = create<RoutesState>()(
  persist(
    (set) => ({
      itinerary: legacyState?.itinerary ?? defaultItinerary,
      storeItineraries: legacyState?.storeItineraries ?? {},
      pickEvents: legacyState?.pickEvents ?? [],
      setItinerary: (itinerary) => set({ itinerary }),
      setStoreItineraries: (storeItineraries) => set({ storeItineraries }),
      setPickEvents: (pickEvents) => set({ pickEvents })
    }),
    {
      name: "smart-shoppingcart:routes-store:v1",
      storage: createAppJsonStorage()
    }
  )
);
