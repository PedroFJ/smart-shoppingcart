import { create } from "zustand";
import { createAppJsonStorage, persist } from "./persistence";
import { ListStatus, PersistedAppState, ShoppingItem } from "./types";

export type ShoppingListState = {
  shoppingItems: ShoppingItem[];
  lastChange: ShoppingItem | null;
  shoppingDoneNotice: boolean;
  setShoppingItems: (shoppingItems: ShoppingItem[]) => void;
  setLastChange: (lastChange: ShoppingItem | null) => void;
  setShoppingDoneNotice: (shoppingDoneNotice: boolean) => void;
  clearShoppingDoneNotice: () => void;
  updateItemStatus: (productId: string, status: ListStatus) => void;
  toggleAcceptsAlternatives: (productId: string) => void;
  updateItemNote: (productId: string, note: string) => void;
  updateItemQuantity: (productId: string, quantity: string) => void;
  hydrateFromLegacy: (legacyState: PersistedAppState | null) => void;
};

export function selectNeededItems(state: Pick<ShoppingListState, "shoppingItems">): ShoppingItem[] {
  return state.shoppingItems.filter((item) => item.status === "needed");
}

export const useShoppingListStore = create<ShoppingListState>()(
  persist(
    (set) => ({
      shoppingItems: [],
      lastChange: null,
      shoppingDoneNotice: false,
      setShoppingItems: (shoppingItems) => set({ shoppingItems }),
      setLastChange: (lastChange) => set({ lastChange }),
      setShoppingDoneNotice: (shoppingDoneNotice) => set({ shoppingDoneNotice }),
      clearShoppingDoneNotice: () => set({ shoppingDoneNotice: false }),
      updateItemStatus: (productId, status) => set((state) => {
        const changedItem = state.shoppingItems.find((item) => item.id === productId) ?? null;

        if (!changedItem) {
          return state;
        }

        return {
          lastChange: changedItem,
          shoppingItems: state.shoppingItems.map((item) => (
            item.id === productId ? { ...item, status } : item
          ))
        };
      }),
      toggleAcceptsAlternatives: (productId) => set((state) => ({
        shoppingItems: state.shoppingItems.map((item) => (
          item.id === productId
            ? { ...item, acceptsAlternatives: !item.acceptsAlternatives }
            : item
        ))
      })),
      updateItemNote: (productId, note) => set((state) => ({
        shoppingItems: state.shoppingItems.map((item) => (
          item.id === productId ? { ...item, note } : item
        ))
      })),
      updateItemQuantity: (productId, quantity) => set((state) => ({
        shoppingItems: state.shoppingItems.map((item) => (
          item.id === productId ? { ...item, quantity } : item
        ))
      })),
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
