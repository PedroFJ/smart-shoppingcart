import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from "react-native";
import { useTranslation } from "react-i18next";
import { defaultItinerary } from "../../../src/data/sampleData";
import { formatItemDetails } from "../../../src/domain/productFormat";
import {
  CART_DRAG_STEP,
  clampIndex,
  defaultSupercorStopOrder,
  getStoreStopName,
  sortPickingItems
} from "../../../src/domain/routeOrdering";
import { useTripLifecycle } from "../../../src/hooks/useTripLifecycle";
import { bootstrapLegacyState } from "../../../src/state/bootstrap";
import { useShoppingListStore } from "../../../src/state/shoppingListStore";
import { useStoresStore } from "../../../src/state/storesStore";
import { useTripStore } from "../../../src/state/tripStore";
import { getSectionCardStyle } from "../../../src/ui/sectionStyles";

const androidStatusBarInset = Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 0;

export default function ShopRoute() {
  const { t } = useTranslation("shop");
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const shoppingItems = useShoppingListStore((state) => state.shoppingItems);
  const lastChange = useShoppingListStore((state) => state.lastChange);
  const stores = useStoresStore((state) => state.supermarketProfiles);
  const selectedStoreId = useStoresStore((state) => state.selectedStoreId);
  const storeItineraries = useStoresStore((state) => state.storeItineraries);
  const storeStopOrders = useStoresStore((state) => state.storeStopOrders);
  const storeProductOrders = useStoresStore((state) => state.storeProductOrders);
  const selectStore = useStoresStore((state) => state.selectStore);
  const isCheckoutLocked = useTripStore((state) => state.isCheckoutLocked);
  const {
    cancelCheckout,
    endShoppingTrip,
    markCartItemStatus,
    movePickingItem,
    reorderPickingItem,
    requestCheckout,
    startShoppingTrip,
    undoLastChange
  } = useTripLifecycle();
  const selectedStoreRoute = storeItineraries[selectedStoreId] ?? defaultItinerary;
  const selectedStoreStopOrder = storeStopOrders[selectedStoreId] ?? defaultSupercorStopOrder;
  const items = useMemo(() => sortPickingItems(
    shoppingItems.filter((item) => item.status === "needed"),
    selectedStoreId,
    selectedStoreRoute,
    selectedStoreStopOrder,
    storeProductOrders[selectedStoreId]
  ), [shoppingItems, selectedStoreId, selectedStoreRoute, selectedStoreStopOrder, storeProductOrders]);
  const visibleItemIds = items.map((item) => item.id);
  const [draggingProductId, setDraggingProductId] = useState<string | null>(null);
  const [hoveredDragProductId, setHoveredDragProductId] = useState<string | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const dragStartPageY = useRef(0);
  const dragVisibleItemIdsRef = useRef(visibleItemIds);
  const checkoutConfirmTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkoutConfirmed = useRef(false);
  const dragSourceIndex = draggingProductId ? visibleItemIds.indexOf(draggingProductId) : -1;
  const dragTargetIndex = dragSourceIndex >= 0
    ? clampIndex(dragSourceIndex + Math.round(dragOffsetY / CART_DRAG_STEP), 0, items.length - 1)
    : -1;

  useEffect(() => {
    bootstrapLegacyState();
    startShoppingTrip();
  }, []);

  useEffect(() => {
    if (draggingProductId === null) {
      dragVisibleItemIdsRef.current = visibleItemIds;
    }
  }, [draggingProductId, visibleItemIds]);

  useEffect(() => {
    if (!isCheckoutLocked) {
      checkoutConfirmed.current = false;
      return;
    }

    checkoutConfirmTimeout.current = setTimeout(cancelCheckout, 4000);
    return clearCheckoutConfirmTimer;
  }, [isCheckoutLocked]);

  function clearCheckoutConfirmTimer() {
    if (checkoutConfirmTimeout.current) {
      clearTimeout(checkoutConfirmTimeout.current);
      checkoutConfirmTimeout.current = null;
    }
  }

  function confirmCheckout() {
    if (checkoutConfirmed.current) {
      return;
    }

    checkoutConfirmed.current = true;
    clearCheckoutConfirmTimer();
    endShoppingTrip();
  }

  function finishDragging(productId: string, offsetY: number) {
    const dragVisibleItemIds = dragVisibleItemIdsRef.current;
    const sourceIndex = dragVisibleItemIds.indexOf(productId);
    const targetIndex = sourceIndex >= 0
      ? clampIndex(sourceIndex + Math.round(offsetY / CART_DRAG_STEP), 0, dragVisibleItemIds.length - 1)
      : -1;

    setDraggingProductId(null);
    setDragOffsetY(0);
    dragStartPageY.current = 0;

    if (targetIndex >= 0 && targetIndex !== sourceIndex) {
      reorderPickingItem(productId, targetIndex, dragVisibleItemIds);
    }
  }

  function renderCheckoutConfirmButton() {
    if (Platform.OS === "web") {
      return createElement("button", {
        type: "button",
        onClick: confirmCheckout,
        onMouseDown: confirmCheckout,
        style: checkoutConfirmWebButtonStyle
      }, createElement("span", { style: checkoutConfirmWebTextStyle }, t("checkout.confirm")));
    }

    return (
      <TouchableOpacity style={styles.checkoutButton} onPress={confirmCheckout}>
        <Text pointerEvents="none" style={styles.checkoutConfirmText}>{t("checkout.confirm")}</Text>
      </TouchableOpacity>
    );
  }

  function renderCheckoutActions() {
    if (isCheckoutLocked) {
      return (
        <View style={styles.topActions}>
          {renderCheckoutConfirmButton()}
          <TouchableOpacity
            accessibilityLabel={t("checkout.cancel")}
            style={styles.cancelButton}
            onPress={cancelCheckout}
          >
            <Text style={styles.cancelButtonText}>{t("checkout.cancelSymbol")}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.topActions}>
        <TouchableOpacity
          disabled={!lastChange}
          style={[styles.undoButton, !lastChange && styles.disabledButton]}
          onPress={undoLastChange}
        >
          <Text style={[styles.undoButtonText, !lastChange && styles.disabledText]}>{t("actions.undo")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.checkoutButton} onPress={requestCheckout}>
          <Text style={styles.checkoutButtonText}>{t("checkout.request")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7F9" translucent={false} />
      <View style={styles.screen}>
        <View style={[styles.storePanel, compact && styles.storePanelCompact]}>
          <View style={styles.storeHeader}>
            <Text style={styles.sectionLabel}>{t("store.label")}</Text>
            <TouchableOpacity style={styles.editRouteButton} onPress={() => router.push("/shop/route-editor")}>
              <Text style={styles.editRouteText}>{t("store.editRoute")}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storeRail}>
            {stores.map((store) => {
              const active = store.id === selectedStoreId;
              return (
                <TouchableOpacity
                  key={store.id}
                  style={[styles.storeButton, compact && styles.storeButtonCompact, active && styles.storeButtonActive]}
                  onPress={() => selectStore(store.id)}
                >
                  <Text style={[styles.storeName, active && styles.storeNameActive]}>{store.name}</Text>
                  <Text style={[styles.storeDetail, active && styles.storeDetailActive]}>{store.detail}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {renderCheckoutActions()}

        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.title}>{t("empty.title")}</Text>
            <Text style={styles.emptyText}>{t("empty.body")}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.listTitle}>{t("list.title")}</Text>
            <ScrollView
              style={styles.listScroller}
              contentContainerStyle={styles.pickingList}
              scrollEnabled={draggingProductId === null}
            >
              {items.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.pickRow,
                    getSectionCardStyle(item.sectionId),
                    draggingProductId === item.id && styles.pickRowDragging,
                    draggingProductId !== null && draggingProductId !== item.id
                      && dragTargetIndex === index && styles.pickRowDropTarget,
                    draggingProductId === item.id && { transform: [{ translateY: dragOffsetY }] }
                  ]}
                >
                  <View
                    accessibilityLabel={t("actions.drag", { product: item.name })}
                    style={[
                      styles.dragHandle,
                      hoveredDragProductId === item.id && styles.dragHandleHover,
                      draggingProductId === item.id && styles.dragHandleActive
                    ]}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderTerminationRequest={() => false}
                    onResponderGrant={(event) => {
                      setHoveredDragProductId(item.id);
                      setDraggingProductId(item.id);
                      setDragOffsetY(0);
                      dragStartPageY.current = event.nativeEvent.pageY;
                    }}
                    onResponderMove={(event) => setDragOffsetY(event.nativeEvent.pageY - dragStartPageY.current)}
                    onResponderRelease={(event) => {
                      finishDragging(item.id, event.nativeEvent.pageY - dragStartPageY.current);
                      setHoveredDragProductId(null);
                    }}
                    onResponderTerminate={(event) => {
                      finishDragging(item.id, event.nativeEvent.pageY - dragStartPageY.current);
                      setHoveredDragProductId(null);
                    }}
                  >
                    <Text style={styles.dragHandleText}>|||</Text>
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>{formatItemDetails(item)}</Text>
                    <Text style={styles.stopName}>{getStoreStopName(selectedStoreId, item)}</Text>
                    {item.note && <Text style={styles.itemNote}>{item.note}</Text>}
                  </View>
                  <View style={styles.itemActions}>
                    <View style={styles.arrowRow}>
                      <TouchableOpacity
                        accessibilityLabel={t("actions.moveUp", { product: item.name })}
                        disabled={index === 0}
                        style={[styles.arrowButton, index === 0 && styles.disabledButton]}
                        onPress={() => movePickingItem(item.id, "up", visibleItemIds)}
                      >
                        <Text style={[styles.arrowText, index === 0 && styles.disabledText]}>↑</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        accessibilityLabel={t("actions.moveDown", { product: item.name })}
                        disabled={index === items.length - 1}
                        style={[styles.arrowButton, index === items.length - 1 && styles.disabledButton]}
                        onPress={() => movePickingItem(item.id, "down", visibleItemIds)}
                      >
                        <Text style={[styles.arrowText, index === items.length - 1 && styles.disabledText]}>↓</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={styles.pickedButton} onPress={() => markCartItemStatus(item.id, "picked")}>
                      <Text style={styles.pickedButtonText}>{t("actions.picked")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.missingButton} onPress={() => markCartItemStatus(item.id, "missing")}>
                      <Text style={styles.missingButtonText}>{t("actions.missing")}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const checkoutConfirmWebButtonStyle = {
  alignItems: "center",
  backgroundColor: "#A33E22",
  border: 0,
  borderRadius: 8,
  cursor: "pointer",
  display: "flex",
  height: 48,
  justifyContent: "center",
  minWidth: 170,
  padding: "0 18px"
} as const;

const checkoutConfirmWebTextStyle = {
  color: "#FFFFFF",
  fontFamily: "system-ui",
  fontSize: 16,
  fontWeight: 800
} as const;

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F5F7F9", flex: 1, paddingTop: androidStatusBarInset },
  screen: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  storePanel: { backgroundColor: "#FFFFFF", borderColor: "#D8DEE8", borderRadius: 8, borderWidth: 1, marginBottom: 10, padding: 12 },
  storePanelCompact: { marginHorizontal: -4, paddingHorizontal: 10 },
  storeHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  sectionLabel: { color: "#596579", fontSize: 13, fontWeight: "900", textTransform: "uppercase" },
  editRouteButton: { alignItems: "center", backgroundColor: "#E7F1F2", borderRadius: 8, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  editRouteText: { color: "#12616F", fontSize: 14, fontWeight: "900" },
  storeRail: { flexDirection: "row", gap: 8, paddingRight: 8 },
  storeButton: { backgroundColor: "#F5F7F9", borderColor: "#B8C2D1", borderRadius: 8, borderWidth: 1, minHeight: 64, minWidth: 150, paddingHorizontal: 12, paddingVertical: 8 },
  storeButtonCompact: { minWidth: 132 },
  storeButtonActive: { backgroundColor: "#12616F", borderColor: "#12616F" },
  storeName: { color: "#18212F", fontSize: 15, fontWeight: "900" },
  storeNameActive: { color: "#FFFFFF" },
  storeDetail: { color: "#596579", fontSize: 12, fontWeight: "700", marginTop: 2 },
  storeDetailActive: { color: "#DDECEF" },
  topActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end", marginBottom: 10, minHeight: 48 },
  undoButton: { alignItems: "center", backgroundColor: "#E7F1F2", borderRadius: 8, flex: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 12 },
  undoButtonText: { color: "#12616F", fontSize: 15, fontWeight: "900" },
  checkoutButton: { alignItems: "center", backgroundColor: "#A33E22", borderRadius: 8, justifyContent: "center", minHeight: 48, minWidth: 132, paddingHorizontal: 18 },
  checkoutButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  checkoutConfirmText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  cancelButton: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#A33E22", borderRadius: 8, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  cancelButtonText: { color: "#A33E22", fontSize: 17, fontWeight: "900" },
  disabledButton: { backgroundColor: "#E5E8ED", borderColor: "#D1D6DE" },
  disabledText: { color: "#929BA8" },
  listTitle: { color: "#18212F", fontSize: 18, fontWeight: "900", marginBottom: 8 },
  listScroller: { flex: 1 },
  pickingList: { gap: 10, paddingBottom: 24 },
  pickRow: { alignItems: "center", borderRadius: 8, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 118, padding: 10 },
  pickRowDragging: { elevation: 7, opacity: 0.92, zIndex: 10 },
  pickRowDropTarget: { borderColor: "#12616F", borderWidth: 3 },
  dragHandle: { alignItems: "center", alignSelf: "stretch", backgroundColor: "#FFFFFF", borderColor: "#B8C2D1", borderRadius: 8, borderWidth: 1, justifyContent: "center", minWidth: 42 },
  dragHandleHover: { backgroundColor: "#E7F1F2" },
  dragHandleActive: { backgroundColor: "#12616F", borderColor: "#12616F" },
  dragHandleText: { color: "#596579", fontSize: 15, fontWeight: "900", transform: [{ rotate: "90deg" }] },
  itemInfo: { flex: 1, minWidth: 90 },
  itemName: { color: "#18212F", fontSize: 17, fontWeight: "900" },
  itemMeta: { color: "#596579", fontSize: 13, marginTop: 3 },
  stopName: { color: "#12616F", fontSize: 13, fontWeight: "800", marginTop: 3 },
  itemNote: { color: "#3E4A5A", fontSize: 13, fontStyle: "italic", marginTop: 3 },
  itemActions: { alignItems: "stretch", gap: 6, width: 102 },
  arrowRow: { flexDirection: "row", gap: 6 },
  arrowButton: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#B8C2D1", borderRadius: 8, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  arrowText: { color: "#18212F", fontSize: 22, fontWeight: "900" },
  pickedButton: { alignItems: "center", backgroundColor: "#1F7A4C", borderRadius: 8, height: 48, justifyContent: "center", width: 102 },
  pickedButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  missingButton: { alignItems: "center", backgroundColor: "#FFF0EB", borderColor: "#A33E22", borderRadius: 8, borderWidth: 1, height: 48, justifyContent: "center", width: 102 },
  missingButtonText: { color: "#A33E22", fontSize: 14, fontWeight: "900" },
  emptyState: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  title: { color: "#18212F", fontSize: 26, fontWeight: "900", marginBottom: 8, textAlign: "center" },
  emptyText: { color: "#596579", fontSize: 16, fontWeight: "700", lineHeight: 22, textAlign: "center" }
});
