import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultItinerary } from "../data/sampleData";
import { createAppJsonStorage, readLegacyAppState, shouldImportLegacyState } from "./persistence";
import { StoreItineraries, StoreProductOrders, StoreStopOrders, SupermarketProfile } from "./types";

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

const legacyState = shouldImportLegacyState() ? readLegacyAppState() : null;
const defaultStoreItineraries = supermarketProfiles.reduce<StoreItineraries>((itineraries, store) => {
  itineraries[store.id] = defaultItinerary;
  return itineraries;
}, {});

type StoresState = {
  selectedStoreId: string;
  storeItineraries: StoreItineraries;
  storeStopOrders: StoreStopOrders;
  storeProductOrders: StoreProductOrders;
  selectStore: (storeId: string) => void;
  setStoreItineraries: (storeItineraries: StoreItineraries) => void;
  setStoreStopOrders: (storeStopOrders: StoreStopOrders) => void;
  setStoreProductOrders: (storeProductOrders: StoreProductOrders) => void;
};

export const useStoresStore = create<StoresState>()(
  persist(
    (set) => ({
      selectedStoreId: legacyState?.selectedStoreId ?? defaultStoreId,
      storeItineraries: legacyState?.storeItineraries ?? defaultStoreItineraries,
      storeStopOrders: legacyState?.storeStopOrders ?? { supercor: defaultSupercorStopOrder },
      storeProductOrders: legacyState?.storeProductOrders ?? {},
      selectStore: (selectedStoreId) => set({ selectedStoreId }),
      setStoreItineraries: (storeItineraries) => set({ storeItineraries }),
      setStoreStopOrders: (storeStopOrders) => set({ storeStopOrders }),
      setStoreProductOrders: (storeProductOrders) => set({ storeProductOrders })
    }),
    {
      name: "smart-shoppingcart:stores-store:v1",
      storage: createAppJsonStorage()
    }
  )
);
