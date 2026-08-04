import { useRouter } from "expo-router";
import { defaultItinerary, Product, SectionId, sections } from "../data/sampleData";
import {
  clampIndex,
  completeSectionRoute,
  completeStoreStopOrder,
  defaultSupercorStopOrder,
  getSupercorRouteStopId,
  sortPickingItems
} from "../domain/routeOrdering";
import { buildNextShoppingList } from "../domain/tripList";
import { useProductsStore } from "../state/productsStore";
import { useRoutesStore } from "../state/routesStore";
import { useSettingsStore } from "../state/settingsStore";
import { useShoppingListStore } from "../state/shoppingListStore";
import { useStoresStore } from "../state/storesStore";
import { ListStatus, ShoppingItem } from "../state/types";
import { useTripStore } from "../state/tripStore";

type MoveDirection = "up" | "down";

export function useTripLifecycle() {
  const router = useRouter();

  function startShoppingTrip(): void {
    const tripState = useTripStore.getState();

    if (!tripState.hasActiveTrip) {
      const neededIds = useShoppingListStore.getState().shoppingItems
        .filter((item) => item.status === "needed")
        .map((item) => item.id);
      tripState.setActiveTripItemIds(neededIds);
      tripState.setHasActiveTrip(true);
    }
  }

  function markCartItemStatus(productId: string, status: ListStatus): void {
    const shoppingState = useShoppingListStore.getState();
    const item = shoppingState.shoppingItems.find((currentItem) => currentItem.id === productId);

    if (!item) {
      return;
    }

    const pickedAt = status === "picked" ? new Date().toISOString() : undefined;
    const pickedQuantity = normalizeQuantityText(item.quantity || item.defaultQuantity || "1 un");
    shoppingState.setLastChange(item);
    shoppingState.setShoppingItems(shoppingState.shoppingItems.map((currentItem) => (
      currentItem.id === productId
        ? { ...currentItem, status, lastPickedAt: pickedAt ?? currentItem.lastPickedAt }
        : currentItem
    )));

    if (pickedAt) {
      const productsState = useProductsStore.getState();
      const updatedProducts = productsState.products.map((product) => (
        product.id === productId
          ? { ...product, defaultQuantity: pickedQuantity, lastPickedAt: pickedAt }
          : product
      ));

      productsState.setProducts(updatedProducts.some((product) => product.id === productId)
        ? updatedProducts
        : [
            ...updatedProducts,
            { ...productFromShoppingItem(item), defaultQuantity: pickedQuantity, lastPickedAt: pickedAt }
          ]);
    }

    if (status !== "needed") {
      const routesState = useRoutesStore.getState();
      routesState.setPickEvents([
        ...routesState.pickEvents,
        {
          productId: item.id,
          sectionId: item.sectionId,
          pickedAt: Date.now(),
          action: status === "picked" ? "picked" : status
        }
      ]);
    }
  }

  function movePickingItem(productId: string, direction: MoveDirection, visibleItemIds: string[]): void {
    const sourceIndex = visibleItemIds.indexOf(productId);
    const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;

    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= visibleItemIds.length) {
      return;
    }

    reorderProductOrder(productId, targetIndex, visibleItemIds);
  }

  function reorderPickingItem(productId: string, targetVisibleIndex: number, visibleItemIds: string[]): void {
    const sourceIndex = visibleItemIds.indexOf(productId);
    const targetIndex = clampIndex(targetVisibleIndex, 0, visibleItemIds.length - 1);

    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return;
    }

    reorderProductOrder(productId, targetIndex, visibleItemIds);
  }

  function reorderProductOrder(productId: string, targetIndex: number, visibleItemIds: string[]): void {
    const nextOrder = [...visibleItemIds];
    const sourceIndex = nextOrder.indexOf(productId);
    const [movedProductId] = nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, movedProductId);

    const storesState = useStoresStore.getState();
    storesState.setStoreProductOrders({
      ...storesState.storeProductOrders,
      [storesState.selectedStoreId]: nextOrder
    });
    updateSelectedStoreRouteFromProductOrder(nextOrder);
  }

  function updateSelectedStoreRouteFromProductOrder(productOrder: string[]): void {
    const storesState = useStoresStore.getState();
    const selectedStoreId = storesState.selectedStoreId;
    const pickingItems = getPickingItems();
    const itemById = new Map(pickingItems.map((item) => [item.id, item]));

    if (selectedStoreId === "supercor") {
      const cartStopOrder = productOrder
        .map((productId) => {
          const item = itemById.get(productId);
          return item ? getSupercorRouteStopId(item) : undefined;
        })
        .filter((stopId): stopId is string => Boolean(stopId))
        .filter((stopId, index, route) => route.indexOf(stopId) === index);

      if (cartStopOrder.length === 0) {
        return;
      }

      const remainingStops = completeStoreStopOrder(
        storesState.storeStopOrders[selectedStoreId] ?? defaultSupercorStopOrder
      ).filter((stopId) => !cartStopOrder.includes(stopId));
      storesState.setStoreStopOrders({
        ...storesState.storeStopOrders,
        [selectedStoreId]: [...cartStopOrder, ...remainingStops]
      });
      return;
    }

    const cartSectionOrder = productOrder
      .map((productId) => itemById.get(productId)?.sectionId)
      .filter((sectionId): sectionId is SectionId => Boolean(sectionId))
      .filter((sectionId, index, route) => route.indexOf(sectionId) === index);

    if (cartSectionOrder.length === 0) {
      return;
    }

    const selectedRoute = storesState.storeItineraries[selectedStoreId] ?? defaultItinerary;
    const remainingSections = completeSectionRoute(selectedRoute)
      .filter((sectionId) => !cartSectionOrder.includes(sectionId));
    storesState.setStoreItineraries({
      ...storesState.storeItineraries,
      [selectedStoreId]: [...cartSectionOrder, ...remainingSections]
    });
  }

  function moveStoreSection(routeItemId: string, direction: MoveDirection): void {
    const storesState = useStoresStore.getState();
    const selectedStoreId = storesState.selectedStoreId;

    if (selectedStoreId === "supercor") {
      const currentRoute = completeStoreStopOrder(
        storesState.storeStopOrders[selectedStoreId] ?? defaultSupercorStopOrder
      );
      const nextRoute = moveRouteItem(currentRoute, routeItemId, direction);

      if (nextRoute) {
        storesState.setStoreStopOrders({ ...storesState.storeStopOrders, [selectedStoreId]: nextRoute });
        storesState.setStoreProductOrders({ ...storesState.storeProductOrders, [selectedStoreId]: [] });
      }
      return;
    }

    if (!isSectionId(routeItemId)) {
      return;
    }

    const currentRoute = completeSectionRoute(storesState.storeItineraries[selectedStoreId] ?? defaultItinerary);
    const nextRoute = moveRouteItem(currentRoute, routeItemId, direction);

    if (nextRoute) {
      storesState.setStoreItineraries({ ...storesState.storeItineraries, [selectedStoreId]: nextRoute });
      storesState.setStoreProductOrders({ ...storesState.storeProductOrders, [selectedStoreId]: [] });
    }
  }

  function undoLastChange(): void {
    const shoppingState = useShoppingListStore.getState();
    const lastChange = shoppingState.lastChange;

    if (!lastChange) {
      return;
    }

    shoppingState.setShoppingItems(shoppingState.shoppingItems.map((item) => (
      item.id === lastChange.id
        ? { ...item, status: lastChange.status, lastPickedAt: lastChange.lastPickedAt }
        : item
    )));

    const productsState = useProductsStore.getState();
    productsState.setProducts(productsState.products.map((product) => (
      product.id === lastChange.id
        ? {
            ...product,
            defaultQuantity: lastChange.defaultQuantity,
            lastPickedAt: lastChange.lastPickedAt
          }
        : product
    )));

    const routesState = useRoutesStore.getState();
    routesState.setPickEvents(routesState.pickEvents.filter((event) => event.productId !== lastChange.id));
    shoppingState.setLastChange(null);
  }

  function requestCheckout(): void {
    const tripState = useTripStore.getState();
    tripState.setLockedPickingIds(getPickingItems().map((item) => item.id));
    tripState.setCheckoutLocked(true);
  }

  function cancelCheckout(): void {
    const tripState = useTripStore.getState();
    tripState.setCheckoutLocked(false);
    tripState.setLockedPickingIds([]);
  }

  function endShoppingTrip(): void {
    useTripStore.getState().setCheckoutLocked(false);
    const hasLearnedPicks = useRoutesStore.getState().pickEvents.some((event) => event.action === "picked");

    if (hasLearnedPicks) {
      router.push("/shop/summary");
      return;
    }

    finalizeShoppingTrip();
  }

  function saveInferredRoute(sectionIds: SectionId[]): void {
    const storesState = useStoresStore.getState();
    storesState.setStoreItineraries({
      ...storesState.storeItineraries,
      [storesState.selectedStoreId]: sectionIds
    });
    finalizeShoppingTrip();
  }

  function finalizeShoppingTrip(): void {
    const shoppingState = useShoppingListStore.getState();
    const tripState = useTripStore.getState();
    const tripIds = tripState.activeTripItemIds.length > 0
      ? tripState.activeTripItemIds
      : tripState.lockedPickingIds;
    const tripItemIds = tripState.hasActiveTrip ? new Set(tripIds) : null;
    const productsState = useProductsStore.getState();

    productsState.setProducts(mergeProductsWithShoppingItems(productsState.products, shoppingState.shoppingItems));
    shoppingState.setShoppingItems(buildNextShoppingList(shoppingState.shoppingItems, tripItemIds));
    shoppingState.setLastChange(null);
    shoppingState.setShoppingDoneNotice(true);
    useRoutesStore.getState().setPickEvents([]);
    tripState.resetTrip();

    const settingsState = useSettingsStore.getState();
    settingsState.setDepartmentFilter("all");
    settingsState.setListSearch("");
    settingsState.setAddSearch("");
    router.replace("/list");
  }

  return {
    cancelCheckout,
    endShoppingTrip,
    finalizeShoppingTrip,
    markCartItemStatus,
    movePickingItem,
    moveStoreSection,
    reorderPickingItem,
    requestCheckout,
    saveInferredRoute,
    startShoppingTrip,
    undoLastChange
  };
}

function getPickingItems(): ShoppingItem[] {
  const storesState = useStoresStore.getState();
  const selectedStoreId = storesState.selectedStoreId;
  return sortPickingItems(
    useShoppingListStore.getState().shoppingItems.filter((item) => item.status === "needed"),
    selectedStoreId,
    storesState.storeItineraries[selectedStoreId] ?? defaultItinerary,
    storesState.storeStopOrders[selectedStoreId] ?? defaultSupercorStopOrder,
    storesState.storeProductOrders[selectedStoreId]
  );
}

function moveRouteItem<T extends string>(route: T[], routeItemId: T, direction: MoveDirection): T[] | null {
  const sourceIndex = route.indexOf(routeItemId);
  const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;

  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= route.length) {
    return null;
  }

  const nextRoute = [...route];
  nextRoute[sourceIndex] = route[targetIndex];
  nextRoute[targetIndex] = routeItemId;
  return nextRoute;
}

function isSectionId(value: string): value is SectionId {
  return sections.some((section) => section.id === value);
}

function normalizeQuantityText(value: string): string {
  const trimmedValue = value.trim().replace(/\s+/g, " ");

  if (!trimmedValue) {
    return "1 un";
  }

  return /^\d+([,.]\d+)?$/.test(trimmedValue) ? `${trimmedValue} un` : trimmedValue;
}

function mergeProductsWithShoppingItems(products: Product[], items: ShoppingItem[]): Product[] {
  const productById = new Map(products.map((product) => [product.id, product]));

  items.forEach((item) => {
    if (!productById.has(item.id)) {
      productById.set(item.id, productFromShoppingItem(item));
    }
  });

  return Array.from(productById.values());
}

function productFromShoppingItem(item: ShoppingItem): Product {
  return {
    id: item.id,
    name: item.name,
    brand: item.brand,
    note: item.note,
    lastPickedAt: item.lastPickedAt,
    sectionId: item.sectionId,
    defaultQuantity: normalizeQuantityText(item.quantity || item.defaultQuantity || "1 un"),
    defaultAcceptsAlternatives: item.acceptsAlternatives
  };
}
