import { create } from "zustand";
import { createAppJsonStorage, persist, readLegacyAppState, shouldImportLegacyState } from "./persistence";
import { DepartmentFilter, PersistedAppState, ShoppingItem } from "./types";

const legacyState = shouldImportLegacyState() ? readLegacyAppState() : null;

type ShoppingListState = {
  shoppingItems: ShoppingItem[];
  lastChange: ShoppingItem | null;
  shoppingDoneNotice: boolean;
  departmentFilter: DepartmentFilter;
  listSearch: string;
  addSearch: string;
  setShoppingItems: (shoppingItems: ShoppingItem[]) => void;
  setLastChange: (lastChange: ShoppingItem | null) => void;
  setShoppingDoneNotice: (shoppingDoneNotice: boolean) => void;
  setDepartmentFilter: (departmentFilter: DepartmentFilter) => void;
  setListSearch: (listSearch: string) => void;
  setAddSearch: (addSearch: string) => void;
  hydrateFromLegacy: (legacyState: PersistedAppState | null) => void;
};

export const useShoppingListStore = create<ShoppingListState>()(
  persist<ShoppingListState>(
    (set) => ({
      shoppingItems: legacyState?.shoppingItems ?? [],
      lastChange: null,
      shoppingDoneNotice: legacyState?.shoppingDoneNotice ?? false,
      departmentFilter: legacyState?.departmentFilter ?? "all",
      listSearch: legacyState?.listSearch ?? "",
      addSearch: "",
      setShoppingItems: (shoppingItems) => set({ shoppingItems }),
      setLastChange: (lastChange) => set({ lastChange }),
      setShoppingDoneNotice: (shoppingDoneNotice) => set({ shoppingDoneNotice }),
      setDepartmentFilter: (departmentFilter) => set({ departmentFilter }),
      setListSearch: (listSearch) => set({ listSearch }),
      setAddSearch: (addSearch) => set({ addSearch }),
      hydrateFromLegacy: (nextLegacyState) => {
        if (!nextLegacyState) {
          return;
        }

        set({
          shoppingItems: nextLegacyState.shoppingItems,
          shoppingDoneNotice: nextLegacyState.shoppingDoneNotice,
          departmentFilter: nextLegacyState.departmentFilter,
          listSearch: nextLegacyState.listSearch,
          addSearch: ""
        });
      }
    }),
    {
      name: "smart-shoppingcart:shopping-list-store:v1",
      storage: createAppJsonStorage()
    }
  )
);
