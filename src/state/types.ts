import { Product, SectionId } from "../data/sampleData";
import { PickEvent } from "../domain/routeInference";

export type ListStatus = "needed" | "picked" | "missing" | "skipped";
export type DepartmentFilter = SectionId | "all";
export type SyncStatus = "local" | "loading" | "synced" | "saving" | "offline" | "error";

export type ShoppingItem = Product & {
  status: ListStatus;
  acceptsAlternatives: boolean;
  note?: string;
  quantity: string;
  lastPickedAt?: string;
  customOrder?: number;
};

export type SupermarketProfile = {
  id: string;
  name: string;
  detail: string;
};

export type StoreItineraries = Record<string, SectionId[]>;
export type StoreProductOrders = Record<string, string[]>;
export type StoreStopOrders = Record<string, string[]>;

export type LocalUserSettings = {
  userName: string;
  voiceSearchEnabled: boolean;
  defaultStoreId: string;
  smartStartEnabled: boolean;
  locale: string;
  listSearch: string;
  addSearch: string;
  departmentFilter: DepartmentFilter;
};

export type PersistedAppState = {
  version: 2;
  products: Product[];
  shoppingItems: ShoppingItem[];
  itinerary: SectionId[];
  storeItineraries: StoreItineraries;
  storeStopOrders: StoreStopOrders;
  storeProductOrders: StoreProductOrders;
  selectedStoreId: string;
  pickEvents: PickEvent<SectionId>[];
  isCheckoutLocked: boolean;
  lockedPickingIds: string[];
  activeTripItemIds: string[];
  shoppingDoneNotice: boolean;
  emptyListDefaultApplied: true;
  savedAt: string;
};
