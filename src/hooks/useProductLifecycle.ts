import { useCallback } from "react";
import { Product } from "../data/sampleData";
import { useProductsStore } from "../state/productsStore";
import { useRoutesStore } from "../state/routesStore";
import { useShoppingListStore } from "../state/shoppingListStore";
import { ShoppingItem } from "../state/types";
import { useTripStore } from "../state/tripStore";

export function useProductLifecycle() {
  const addCatalogProductToList = useCallback((product: Product): void => {
    const shoppingState = useShoppingListStore.getState();
    const existingItem = shoppingState.shoppingItems.find((item) => item.id === product.id);

    if (existingItem?.status === "needed") {
      return;
    }

    addProductToActiveTrip(product.id);
    shoppingState.setShoppingItems(existingItem
      ? shoppingState.shoppingItems.map((item) => (
          item.id === product.id ? { ...withStatus(product), lastPickedAt: item.lastPickedAt } : item
        ))
      : [...shoppingState.shoppingItems, withStatus(product)]);
  }, []);

  const createAndAddProduct = useCallback((product: Product): void => {
    useProductsStore.getState().upsertProduct(product);
    const shoppingState = useShoppingListStore.getState();
    shoppingState.setShoppingItems([...shoppingState.shoppingItems, withStatus(product)]);
    addProductToActiveTrip(product.id);
  }, []);

  const updateCatalogProduct = useCallback((updatedProduct: Product): void => {
    useProductsStore.getState().upsertProduct(updatedProduct);
    const shoppingState = useShoppingListStore.getState();
    shoppingState.setShoppingItems(shoppingState.shoppingItems.map((item) => (
      item.id === updatedProduct.id
        ? {
            ...item,
            ...updatedProduct,
            quantity: item.quantity,
            note: item.note ?? updatedProduct.note,
            acceptsAlternatives: item.acceptsAlternatives
          }
        : item
    )));
  }, []);

  const deleteCatalogProduct = useCallback((productId: string): void => {
    useProductsStore.getState().deleteProduct(productId);
    const shoppingState = useShoppingListStore.getState();
    shoppingState.setShoppingItems(shoppingState.shoppingItems.filter((item) => item.id !== productId));
    const routesState = useRoutesStore.getState();
    routesState.setPickEvents(routesState.pickEvents.filter((event) => event.productId !== productId));
  }, []);

  return {
    addCatalogProductToList,
    createAndAddProduct,
    deleteCatalogProduct,
    updateCatalogProduct
  };
}

function addProductToActiveTrip(productId: string): void {
  const tripState = useTripStore.getState();

  if (!tripState.hasActiveTrip || tripState.isCheckoutLocked) {
    return;
  }

  tripState.setActiveTripItemIds([...new Set([...tripState.activeTripItemIds, productId])]);
}

function withStatus(product: Product): ShoppingItem {
  return {
    ...product,
    acceptsAlternatives: product.defaultAcceptsAlternatives,
    note: product.note,
    quantity: product.defaultQuantity,
    lastPickedAt: product.lastPickedAt,
    status: "needed"
  };
}
