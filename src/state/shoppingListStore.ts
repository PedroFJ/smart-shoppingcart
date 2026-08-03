import { create } from "zustand";
import { createAppJsonStorage, persist } from "./persistence";
import { PersistedAppState, ShoppingItem } from "./types";

type ShoppingListState = {
  shoppingItems: ShoppingItem[];
  lastChange: ShoppingItem | null;
  shoppingDoneNotice: boolean;
  setShoppingItems: (shoppingItems: ShoppingItem[]) => void;
  setLastChange: (lastChange: ShoppingItem | null) => void;
  setShoppingDoneNotice: (shoppingDoneNotice: boolean) => void;
  hydrateFromLegacy: (legacyState: PersistedAppState | null) => void;
};

export const useShoppingListStore = create<ShoppingListState>()(
  persist(
    (set) => ({
      shoppingItems: [],
      lastChange: null,
      shoppingDoneNotice: false,
      setShoppingItems: (shoppingItems) => set({ shoppingItems }),
      setLastChange: (lastChange) => set({ lastChange }),
      setShoppingDoneNotice: (shoppingDoneNotice) => set({ shoppingDoneNotice }),
      hydrateFromLegacy: (nextLegacyState) => {
        if (!nextLegacyState) {
          return;
        }

        set({
          shoppingItems: nextLegacyState.shoppingItems,
          shoppingDoneNotice: nextLegacyState.shoppingDoneNotice
        });
      }
    }),
    {
      name: "smart-shoppingcart:shopping-list-store:v1",
      storage: createAppJsonStorage<Pick<ShoppingListState, "shoppingItems" | "shoppingDoneNotice">>(),
      version: 0,
      partialize: (state) => ({
        shoppingItems: state.shoppingItems,
        shoppingDoneNotice: state.shoppingDoneNotice
      })
    }
  )
);
