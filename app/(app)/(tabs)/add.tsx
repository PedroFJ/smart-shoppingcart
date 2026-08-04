import { createElement, type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  FlatList,
  ListRenderItemInfo,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View
} from "react-native";
import { useTranslation } from "react-i18next";
import { defaultItinerary, Product, sections } from "../../../src/data/sampleData";
import { filterBySearch } from "../../../src/domain/search";
import { formatLastPicked, formatProductDetails, getProductSortLabel } from "../../../src/domain/productFormat";
import { sortByRoute } from "../../../src/domain/routeInference";
import { useProductLifecycle } from "../../../src/hooks/useProductLifecycle";
import { useVoiceSearch } from "../../../src/hooks/useVoiceSearch";
import { bootstrapLegacyState } from "../../../src/state/bootstrap";
import { useProductsStore } from "../../../src/state/productsStore";
import { useSettingsStore } from "../../../src/state/settingsStore";
import { useShoppingListStore } from "../../../src/state/shoppingListStore";
import { VoiceSearchButton } from "../../../src/ui/components/VoiceSearchButton";
import { getSectionCardStyle } from "../../../src/ui/sectionStyles";

const androidStatusBarInset = Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 0;
const webSearchInputChromeReset = {
  outlineStyle: "none",
  outlineWidth: 0,
  outlineColor: "transparent",
  boxShadow: "none"
} as unknown as TextStyle;

export default function AddRoute() {
  const { t } = useTranslation();
  const router = useRouter();
  const products = useProductsStore((state) => state.products);
  const shoppingItems = useShoppingListStore((state) => state.shoppingItems);
  const departmentFilter = useSettingsStore((state) => state.departmentFilter);
  const setDepartmentFilter = useSettingsStore((state) => state.setDepartmentFilter);
  const searchText = useSettingsStore((state) => state.addSearch);
  const setSearchText = useSettingsStore((state) => state.setAddSearch);
  const voiceSearchEnabled = useSettingsStore((state) => state.voiceSearchEnabled);
  const locale = useSettingsStore((state) => state.locale);
  const { addCatalogProductToList, deleteCatalogProduct } = useProductLifecycle();
  const [pendingDeleteProductId, setPendingDeleteProductId] = useState<string | null>(null);
  const deleteConfirmTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listProductIds = useMemo(() => new Set(
    shoppingItems.filter((item) => item.status === "needed").map((item) => item.id)
  ), [shoppingItems]);
  const availableDepartments = sections.filter((section) => (
    products.some((product) => product.sectionId === section.id && !listProductIds.has(product.id))
  ));
  const addableProducts = products.filter((product) => !listProductIds.has(product.id));
  const sortedAddableProducts = sortByRoute(addableProducts, defaultItinerary, getProductSortLabel);
  const departmentProducts = departmentFilter === "all"
    ? sortedAddableProducts
    : sortedAddableProducts.filter((product) => product.sectionId === departmentFilter);
  const visibleProducts = filterBySearch(departmentProducts, searchText);
  const addVoiceSearch = useVoiceSearch({
    contextualStrings: products.map((product) => product.name),
    enabled: voiceSearchEnabled,
    onTranscript: setSearchText
  });

  useEffect(() => {
    bootstrapLegacyState();
  }, []);

  useEffect(() => clearDeleteConfirmTimer, []);

  function clearDeleteConfirmTimer() {
    if (deleteConfirmTimeout.current) {
      clearTimeout(deleteConfirmTimeout.current);
      deleteConfirmTimeout.current = null;
    }
  }

  function cancelDeleteConfirm() {
    clearDeleteConfirmTimer();
    setPendingDeleteProductId(null);
  }

  function requestDeleteConfirm(productId: string) {
    clearDeleteConfirmTimer();
    setPendingDeleteProductId(productId);
    deleteConfirmTimeout.current = setTimeout(() => {
      setPendingDeleteProductId(null);
      deleteConfirmTimeout.current = null;
    }, 4000);
  }

  function confirmDeleteProduct(productId: string) {
    clearDeleteConfirmTimer();
    setPendingDeleteProductId(null);
    deleteCatalogProduct(productId);
  }

  const renderProduct = useCallback(({ item: product }: ListRenderItemInfo<Product>) => (
    <View style={[styles.catalogCard, getSectionCardStyle(product.sectionId)]}>
      <View style={styles.catalogTopRow}>
        <TouchableOpacity style={styles.catalogInfo} onPress={() => addCatalogProductToList(product)}>
          <Text style={styles.itemName} numberOfLines={1}>{product.name}</Text>
          <Text style={styles.itemMeta} numberOfLines={1}>{formatProductDetails(product)}</Text>
          <Text style={styles.lastPickedText} numberOfLines={1}>{formatLastPicked(product.lastPickedAt, locale, t)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.catalogAddButton} onPress={() => addCatalogProductToList(product)}>
          <Text style={styles.catalogAddText}>{t("add:catalog.add")}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.catalogNoteRow}>
        <Text style={styles.fieldLabel}>{t("add:catalog.noteLabel")}</Text>
        <Text style={styles.catalogNoteText} numberOfLines={2}>{product.note || t("add:catalog.noNote")}</Text>
      </View>
      <View style={styles.catalogFooterRow}>
        <Text style={[styles.preferencePill, product.defaultAcceptsAlternatives ? styles.preferenceOpen : styles.preferenceExact]}>
          {product.defaultAcceptsAlternatives ? t("add:catalog.alternatives") : t("add:catalog.exact")}
        </Text>
        <View style={styles.catalogManageActions}>
          <TouchableOpacity
            style={styles.catalogSmallAction}
            onPress={() => router.push({ pathname: "/products/[productId]/edit", params: { productId: product.id } })}
          >
            <Text style={styles.manageButtonText}>{t("add:catalog.edit")}</Text>
          </TouchableOpacity>
          {renderCatalogDeleteAction(product)}
        </View>
      </View>
    </View>
  ), [addCatalogProductToList, locale, pendingDeleteProductId, router, t]);

  function renderCatalogDeleteAction(product: Product) {
    if (pendingDeleteProductId === product.id) {
      if (Platform.OS === "web") {
        return createElement(
          "div",
          { style: catalogConfirmActionsWebStyle },
          createElement("button", {
            type: "button",
            onClick: () => confirmDeleteProduct(product.id),
            style: catalogDeleteConfirmWebButtonStyle
          }, createElement("span", { style: catalogDeleteConfirmWebTextStyle }, t("add:delete.confirm"))),
          createElement("button", {
            type: "button",
            onClick: cancelDeleteConfirm,
            style: catalogConfirmCancelWebButtonStyle
          }, createElement("span", { style: catalogConfirmCancelWebTextStyle }, t("add:delete.cancelSymbol")))
        );
      }

      return (
        <View style={styles.catalogConfirmActions}>
          <TouchableOpacity style={styles.catalogDeleteConfirmButton} onPress={() => confirmDeleteProduct(product.id)}>
            <Text style={styles.catalogDeleteConfirmText}>{t("add:delete.confirm")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.catalogConfirmCancelButton} onPress={cancelDeleteConfirm}>
            <Text style={styles.catalogConfirmCancelText}>{t("add:delete.cancelSymbol")}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (Platform.OS === "web") {
      return createElement("button", {
        type: "button",
        onClick: () => requestDeleteConfirm(product.id),
        style: catalogActionWebButtonStyle
      }, createElement("span", { style: catalogActionWebTextStyle }, t("add:catalog.delete")));
    }

    return (
      <TouchableOpacity style={styles.catalogSmallAction} onPress={() => requestDeleteConfirm(product.id)}>
        <Text style={styles.deleteButtonText}>{t("add:catalog.delete")}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7F9" translucent={false} />
      <View style={styles.screen}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar} style={styles.filterRail}>
          <TouchableOpacity
            style={[styles.filterButton, departmentFilter === "all" && styles.filterButtonActive]}
            onPress={() => setDepartmentFilter("all")}
          >
            <Text style={[styles.filterText, departmentFilter === "all" && styles.filterTextActive]}>{t("add:filter.all")}</Text>
          </TouchableOpacity>
          {availableDepartments.map((section) => (
            <TouchableOpacity
              key={section.id}
              style={[styles.filterButton, departmentFilter === section.id && styles.filterButtonActive]}
              onPress={() => setDepartmentFilter(section.id)}
            >
              <Text style={[styles.filterText, departmentFilter === section.id && styles.filterTextActive]}>{section.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.searchBox}>
          <TextInput
            accessibilityLabel={t("add:search.label")}
            style={[styles.searchInput, webSearchInputChromeReset]}
            value={searchText}
            onChangeText={setSearchText}
            placeholder={t("add:search.placeholder")}
          />
          {voiceSearchEnabled && addVoiceSearch.isAvailable && (
            <VoiceSearchButton
              accessibilityLabel={t("add:voice.label")}
              accessibilityHint={t("add:voice.hint")}
              isListening={addVoiceSearch.isListening}
              onPress={addVoiceSearch.toggle}
            />
          )}
        </View>
        <TouchableOpacity style={styles.newProductButton} onPress={() => router.push("/products/new")}>
          <Text style={styles.newProductText}>{t("add:newProduct.open")}</Text>
        </TouchableOpacity>
        <FlatList
          data={visibleProducts}
          keyExtractor={(product) => product.id}
          renderItem={renderProduct}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.grid}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t("add:empty")}</Text>
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const catalogActionWebButtonStyle: CSSProperties = { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", backgroundColor: "transparent", borderWidth: 0, color: "#A33E22", cursor: "pointer", display: "flex", fontFamily: "inherit", padding: 0 };
const catalogActionWebTextStyle: CSSProperties = { color: "#A33E22", fontSize: 12, fontWeight: 700, lineHeight: "16px", pointerEvents: "none" };
const catalogConfirmActionsWebStyle: CSSProperties = { alignItems: "center", display: "flex", flexDirection: "row", gap: 8 };
const catalogDeleteConfirmWebButtonStyle: CSSProperties = { minHeight: 44, borderRadius: 8, borderWidth: 0, alignItems: "center", justifyContent: "center", backgroundColor: "#A33E22", color: "#FFFFFF", cursor: "pointer", display: "flex", fontFamily: "inherit", padding: "0 10px" };
const catalogDeleteConfirmWebTextStyle: CSSProperties = { color: "#FFFFFF", fontSize: 12, fontWeight: 700, lineHeight: "16px", pointerEvents: "none" };
const catalogConfirmCancelWebButtonStyle: CSSProperties = { minHeight: 44, minWidth: 44, borderRadius: 8, borderWidth: 1, borderStyle: "solid", borderColor: "#A33E22", alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", color: "#A33E22", cursor: "pointer", display: "flex", fontFamily: "inherit", padding: 0 };
const catalogConfirmCancelWebTextStyle: CSSProperties = { color: "#A33E22", fontSize: 14, fontWeight: 700, lineHeight: "18px", pointerEvents: "none" };

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F5F7F9", flex: 1, paddingTop: androidStatusBarInset },
  screen: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  filterBar: { alignItems: "center", flexDirection: "row", gap: 8, paddingBottom: 10, paddingRight: 20, paddingTop: 2 },
  filterRail: { flexGrow: 0, flexShrink: 0, marginBottom: 2, maxHeight: 62, width: "100%" },
  filterButton: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#B8C2D1", borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 48, minWidth: 118, paddingHorizontal: 14 },
  filterButtonActive: { backgroundColor: "#12616F", borderColor: "#12616F" },
  filterText: { color: "#18212F", fontSize: 15, fontWeight: "800" },
  filterTextActive: { color: "#FFFFFF" },
  searchBox: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#B8C2D1", borderRadius: 8, borderWidth: 1, flexDirection: "row", gap: 8, marginBottom: 12, minHeight: 56, paddingHorizontal: 12 },
  searchInput: { borderWidth: 0, color: "#18212F", flex: 1, fontSize: 17, minHeight: 54, paddingHorizontal: 0, paddingVertical: 0 },
  newProductButton: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#12616F", borderRadius: 8, borderWidth: 2, justifyContent: "center", marginBottom: 12, minHeight: 52 },
  newProductText: { color: "#12616F", fontSize: 17, fontWeight: "900" },
  grid: { paddingBottom: 24 },
  separator: { height: 10 },
  catalogCard: { backgroundColor: "#FFFFFF", borderColor: "#D8DEE8", borderRadius: 8, borderWidth: 1, gap: 8, padding: 12, width: "100%" },
  catalogTopRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  catalogInfo: { flex: 1 },
  itemName: { color: "#18212F", fontSize: 19, fontWeight: "800" },
  itemMeta: { color: "#596579", fontSize: 15, marginTop: 4 },
  lastPickedText: { color: "#596579", fontSize: 13, fontWeight: "700" },
  catalogAddButton: { alignItems: "center", backgroundColor: "#12616F", borderRadius: 8, justifyContent: "center", minHeight: 48, minWidth: 96, paddingHorizontal: 12 },
  catalogAddText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  catalogNoteRow: { backgroundColor: "#F5F7F9", borderRadius: 8, gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  fieldLabel: { color: "#596579", fontSize: 13, fontWeight: "900", textTransform: "uppercase" },
  catalogNoteText: { color: "#3E4A5A", fontSize: 15, fontWeight: "700", lineHeight: 20 },
  catalogFooterRow: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between", minHeight: 44 },
  preferencePill: { alignSelf: "flex-start", borderRadius: 8, fontSize: 13, fontWeight: "800", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 4 },
  preferenceOpen: { backgroundColor: "#E6F4EA", color: "#245A38" },
  preferenceExact: { backgroundColor: "#F8E8E2", color: "#A33E22" },
  catalogManageActions: { alignItems: "center", flexDirection: "row", gap: 14 },
  catalogSmallAction: { justifyContent: "center", minHeight: 44, minWidth: 44 },
  manageButtonText: { color: "#12616F", fontSize: 12, fontWeight: "900" },
  deleteButtonText: { color: "#A33E22", fontSize: 12, fontWeight: "900" },
  catalogConfirmActions: { alignItems: "center", flexDirection: "row", gap: 8 },
  catalogDeleteConfirmButton: { alignItems: "center", backgroundColor: "#A33E22", borderRadius: 8, justifyContent: "center", minHeight: 44, paddingHorizontal: 10 },
  catalogDeleteConfirmText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  catalogConfirmCancelButton: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#A33E22", borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 44, minWidth: 44 },
  catalogConfirmCancelText: { color: "#A33E22", fontSize: 14, fontWeight: "900" },
  emptyState: { justifyContent: "center", minHeight: 120, padding: 16 },
  emptyText: { color: "#596579", fontSize: 17, lineHeight: 24 }
});
