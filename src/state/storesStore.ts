import { create } from "zustand";
import { defaultItinerary } from "../data/sampleData";
import { createAppJsonStorage, persist } from "./persistence";
import { PersistedAppState, StoreItineraries, StoreProductOrders, StoreStopOrders, SupermarketProfile } from "./types";

export const supermarketProfiles: SupermarketProfile[] = [
  { id: "supercor", name: "SuperCor", detail: "Percurso principal" },
  { id: "continente", name: "Continente", detail: "Percurso semanal" },
  { id: "pingo-doce", name: "Pingo Doce", detail: "Loja local" },
  { id: "lidl", name: "Lidl", detail: "Compra rápida" },
  { id: "auchan", name: "Auchan", detail: "Hipermercado" },
  { id: "outro", name: "Outro", detail: "Percurso por treinar" }
];

export const defaultStoreId = supermarketProfiles[0].id;
export const defaultSupercorStopOrder = [
  "frutas",
  "legumes",
  "peixaria",
  "conservas",
  "carne-refrigerada",
  "talho",
  "azeites-oleos",
  "charcutaria",
  "cereais",
  "leite-cafe",
  "laticinios",
  "ovos",
  "congelados",
  "vinho-cerveja-aguas",
  "arroz-massas",
  "produtos-banho",
  "higiene-pessoal",
  "guardanapos-papel",
  "limpeza-casa",
  "pao"
];

const defaultStoreItineraries = supermarketProfiles.reduce<StoreItineraries>((itineraries, store) => {
  itineraries[store.id] = defaultItinerary;
  return itineraries;
}, {});

type StoresState = {
  supermarketProfiles: SupermarketProfile[];
  selectedStoreId: string;
  storeItineraries: StoreItineraries;
  storeStopOrders: StoreStopOrders;
  storeProductOrders: StoreProductOrders;
  selectStore: (storeId: string) => void;
  setStoreItineraries: (storeItineraries: StoreItineraries) => void;
  setStoreStopOrders: (storeStopOrders: StoreStopOrders) => void;
  setStoreProductOrders: (storeProductOrders: StoreProductOrders) => void;
  hydrateFromLegacy: (legacyState: PersistedAppState | null) => void;
};

export const useStoresStore = create<StoresState>()(
  persist(
    (set) => ({
      supermarketProfiles,
      selectedStoreId: defaultStoreId,
      storeItineraries: defaultStoreItineraries,
      storeStopOrders: { supercor: defaultSupercorStopOrder },
      storeProductOrders: {},
      selectStore: (selectedStoreId) => set({ selectedStoreId }),
      setStoreItineraries: (storeItineraries) => set({ storeItineraries }),
      setStoreStopOrders: (storeStopOrders) => set({ storeStopOrders }),
      setStoreProductOrders: (storeProductOrders) => set({ storeProductOrders }),
      hydrateFromLegacy: (nextLegacyState) => {
        if (!nextLegacyState) {
          return;
        }

        set({
          selectedStoreId: nextLegacyState.selectedStoreId,
          storeItineraries: nextLegacyState.storeItineraries,
          storeStopOrders: nextLegacyState.storeStopOrders,
          storeProductOrders: nextLegacyState.storeProductOrders
        });
      }
    }),
    {
      name: "smart-shoppingcart:stores-store:v1",
      storage: createAppJsonStorage<Pick<StoresState, "selectedStoreId" | "storeItineraries" | "storeStopOrders" | "storeProductOrders">>(),
      version: 0,
      partialize: (state) => ({
        selectedStoreId: state.selectedStoreId,
        storeItineraries: state.storeItineraries,
        storeStopOrders: state.storeStopOrders,
        storeProductOrders: state.storeProductOrders
      })
    }
  )
);
