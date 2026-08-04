import { useMemo } from "react";
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View
} from "react-native";
import { useTranslation } from "react-i18next";
import { defaultItinerary, sections } from "../../../src/data/sampleData";
import { formatLastPicked, formatListItemDetails, normalizeQuantityText } from "../../../src/domain/productFormat";
import { sortShoppingItems } from "../../../src/domain/routeOrdering";
import { filterBySearch } from "../../../src/domain/search";
import { useVoiceSearch } from "../../../src/hooks/useVoiceSearch";
import { useSettingsStore } from "../../../src/state/settingsStore";
import { selectNeededItems, useShoppingListStore } from "../../../src/state/shoppingListStore";
import { VoiceSearchButton } from "../../../src/ui/components/VoiceSearchButton";
import { getSectionCardStyle } from "../../../src/ui/sectionStyles";

const androidStatusBarInset = Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 0;
const webSearchInputChromeReset = {
  outlineStyle: "none",
  outlineWidth: 0,
  outlineColor: "transparent",
  boxShadow: "none"
} as unknown as TextStyle;

export default function ListRoute() {
  const { t } = useTranslation();
  const locale = useSettingsStore((state) => state.locale);
  const departmentFilter = useSettingsStore((state) => state.departmentFilter);
  const setDepartmentFilter = useSettingsStore((state) => state.setDepartmentFilter);
  const searchText = useSettingsStore((state) => state.listSearch);
  const setSearchText = useSettingsStore((state) => state.setListSearch);
  const voiceSearchEnabled = useSettingsStore((state) => state.voiceSearchEnabled);
  const shoppingItems = useShoppingListStore((state) => state.shoppingItems);
  const shoppingDoneNotice = useShoppingListStore((state) => state.shoppingDoneNotice);
  const clearShoppingDoneNotice = useShoppingListStore((state) => state.clearShoppingDoneNotice);
  const updateItemStatus = useShoppingListStore((state) => state.updateItemStatus);
  const toggleAcceptsAlternatives = useShoppingListStore((state) => state.toggleAcceptsAlternatives);
  const updateItemNote = useShoppingListStore((state) => state.updateItemNote);
  const updateItemQuantity = useShoppingListStore((state) => state.updateItemQuantity);
  const neededItems = useMemo(() => selectNeededItems({ shoppingItems }), [shoppingItems]);
  const items = useMemo(() => sortShoppingItems(neededItems, defaultItinerary, locale), [neededItems, locale]);
  const availableDepartments = sections.filter((section) => {
    return items.some((item) => item.sectionId === section.id);
  });
  const effectiveDepartmentFilter = departmentFilter === "all" || availableDepartments.some((section) => section.id === departmentFilter)
    ? departmentFilter
    : "all";
  const departmentItems = effectiveDepartmentFilter === "all"
    ? items
    : items.filter((item) => item.sectionId === effectiveDepartmentFilter);
  const visibleItems = filterBySearch(departmentItems, searchText);
  const isListEmpty = items.length === 0;
  const listVoiceSearch = useVoiceSearch({
    contextualStrings: items.map((item) => item.name),
    enabled: voiceSearchEnabled,
    onTranscript: setSearchText
  });

  function clearFilters() {
    setDepartmentFilter("all");
    setSearchText("");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7F9" translucent={false} />
      <View style={styles.screen}>
        <Text style={styles.title}>{t("list:headerTitle")}</Text>

        {shoppingDoneNotice && (
          <View style={styles.shoppingDoneNotice}>
            <View style={styles.shoppingDoneTextColumn}>
              <Text style={styles.shoppingDoneTitle}>{t("list:shoppingDone.title")}</Text>
              <Text style={styles.shoppingDoneText}>{t("list:shoppingDone.body")}</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel={t("list:shoppingDone.clear")}
              accessibilityRole="button"
              style={styles.noticeClearButton}
              onPress={clearShoppingDoneNotice}
            >
              <Text style={styles.noticeClearButtonText}>{t("list:shoppingDone.clear")}</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          alwaysBounceHorizontal
          directionalLockEnabled
          contentContainerStyle={styles.filterBar}
          style={styles.filterRail}
        >
          <TouchableOpacity
            accessibilityLabel={t("list:filter.all")}
            accessibilityRole="button"
            accessibilityState={{ selected: effectiveDepartmentFilter === "all" }}
            style={[styles.filterButton, effectiveDepartmentFilter === "all" && styles.filterButtonActive]}
            onPress={() => setDepartmentFilter("all")}
          >
            <Text style={[styles.filterText, effectiveDepartmentFilter === "all" && styles.filterTextActive]}>
              {t("list:filter.all")}
            </Text>
          </TouchableOpacity>
          {availableDepartments.map((section) => {
            const isActive = effectiveDepartmentFilter === section.id;

            return (
              <TouchableOpacity
                accessibilityLabel={section.name}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                key={section.id}
                style={[styles.filterButton, isActive && styles.filterButtonActive]}
                onPress={() => setDepartmentFilter(section.id)}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                  {section.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.searchBox}>
          <TextInput
            accessibilityLabel={t("list:search.ariaLabel")}
            style={[styles.searchInput, webSearchInputChromeReset]}
            value={searchText}
            onChangeText={setSearchText}
            placeholder={t("list:search.placeholder")}
          />
          {voiceSearchEnabled && listVoiceSearch.isAvailable && (
            <VoiceSearchButton
              accessibilityHint={t("list:voice.hint")}
              accessibilityLabel={t("list:voice.label")}
              isListening={listVoiceSearch.isListening}
              onPress={listVoiceSearch.toggle}
            />
          )}
        </View>

        <ScrollView contentContainerStyle={styles.listContent}>
          {isListEmpty && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t("list:empty.noItems")}</Text>
            </View>
          )}
          {!isListEmpty && visibleItems.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t("list:empty.noVisible")}</Text>
              <TouchableOpacity
                accessibilityLabel={t("list:empty.clearFilters")}
                accessibilityRole="button"
                style={styles.secondaryButtonFull}
                onPress={clearFilters}
              >
                <Text style={styles.secondaryButtonText}>{t("list:empty.clearFilters")}</Text>
              </TouchableOpacity>
            </View>
          )}
          {visibleItems.map((item) => (
            <View key={item.id} style={[styles.itemCard, getSectionCardStyle(item.sectionId)]}>
              <View style={styles.itemColumn}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemMeta}>{formatListItemDetails(item)}</Text>
                <Text style={styles.lastPickedText}>{formatLastPicked(item.lastPickedAt, locale, t)}</Text>
                <View style={styles.alternativesControl}>
                  <Text style={styles.alternativesLabel}>{t("list:row.alternatives.label")}</Text>
                  <Switch
                    accessibilityLabel={t("list:row.alternatives.label")}
                    accessibilityHint={t("list:row.alternatives.hint")}
                    onValueChange={() => toggleAcceptsAlternatives(item.id)}
                    value={item.acceptsAlternatives}
                  />
                </View>
              </View>
              <View style={styles.quantityColumn}>
                <View style={styles.quantityHeader}>
                  <Text style={styles.fieldLabel}>{t("list:row.quantity.label")}</Text>
                </View>
                <TextInput
                  accessibilityLabel={`${t("list:row.quantity.ariaLabel")} - ${item.name}`}
                  style={[styles.quantityInput, webSearchInputChromeReset]}
                  value={item.quantity}
                  onChangeText={(quantity) => updateItemQuantity(item.id, quantity)}
                  onBlur={() => updateItemQuantity(item.id, normalizeQuantityText(item.quantity))}
                  onEndEditing={(event) => updateItemQuantity(item.id, normalizeQuantityText(event.nativeEvent.text))}
                  onSubmitEditing={(event) => updateItemQuantity(item.id, normalizeQuantityText(event.nativeEvent.text))}
                  placeholder={t("list:row.quantity.placeholder")}
                />
              </View>
              <View style={styles.noteColumn}>
                <View style={styles.noteHeader}>
                  <Text style={styles.fieldLabel}>{t("list:row.note.label")}</Text>
                  <TouchableOpacity
                    accessibilityLabel={t("list:row.postpone")}
                    accessibilityHint={t("list:row.postponeHint")}
                    accessibilityRole="button"
                    style={styles.listPostponeAction}
                    onPress={() => updateItemStatus(item.id, "skipped")}
                  >
                    <Text style={styles.rowAction}>{t("list:row.postpone")}</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  accessibilityLabel={`${t("list:row.note.ariaLabel")} - ${item.name}`}
                  style={[styles.noteInput, webSearchInputChromeReset]}
                  value={item.note ?? ""}
                  onChangeText={(note) => updateItemNote(item.id, note)}
                  placeholder={t("list:row.note.placeholder")}
                  placeholderTextColor="#596579"
                  multiline
                />
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#F5F7F9",
    flex: 1,
    paddingTop: androidStatusBarInset
  },
  screen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12
  },
  title: {
    color: "#18212F",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 12
  },
  shoppingDoneNotice: {
    alignItems: "center",
    backgroundColor: "#FFF4D6",
    borderColor: "#B98200",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
    padding: 12
  },
  shoppingDoneTextColumn: {
    flex: 1,
    gap: 2
  },
  shoppingDoneTitle: {
    color: "#4C3200",
    fontSize: 16,
    fontWeight: "900"
  },
  shoppingDoneText: {
    color: "#5C4510",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  noticeClearButton: {
    alignItems: "center",
    backgroundColor: "#7A4F00",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 72,
    paddingHorizontal: 10
  },
  noticeClearButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900"
  },
  filterBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingBottom: 10,
    paddingRight: 20,
    paddingTop: 2
  },
  filterRail: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 2,
    maxHeight: 62,
    width: "100%"
  },
  filterButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#B8C2D1",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 118,
    paddingHorizontal: 14
  },
  filterButtonActive: {
    backgroundColor: "#12616F",
    borderColor: "#12616F"
  },
  filterText: {
    color: "#18212F",
    fontSize: 15,
    fontWeight: "800"
  },
  filterTextActive: {
    color: "#FFFFFF"
  },
  searchBox: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#B8C2D1",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 12,
    minHeight: 52,
    paddingHorizontal: 12
  },
  searchInput: {
    color: "#18212F",
    flex: 1,
    fontSize: 17,
    minHeight: 44
  },
  listContent: {
    gap: 10,
    paddingBottom: 24
  },
  itemCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8DEE8",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 132,
    padding: 12
  },
  itemColumn: {
    flex: 1.15,
    gap: 4,
    justifyContent: "center",
    minWidth: 112
  },
  itemName: {
    color: "#18212F",
    fontSize: 19,
    fontWeight: "800"
  },
  itemMeta: {
    color: "#596579",
    fontSize: 15,
    marginTop: 4
  },
  lastPickedText: {
    color: "#596579",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 0
  },
  alternativesControl: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    marginTop: 8,
    minHeight: 32
  },
  alternativesLabel: {
    color: "#3E4A5A",
    flex: 1,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  quantityColumn: {
    gap: 6,
    justifyContent: "flex-start",
    width: 82
  },
  quantityHeader: {
    justifyContent: "center",
    minHeight: 36
  },
  fieldLabel: {
    color: "#596579",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  quantityInput: {
    borderColor: "#B8C2D1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#18212F",
    fontSize: 16,
    fontWeight: "800",
    height: 66,
    paddingHorizontal: 12
  },
  noteColumn: {
    flex: 1,
    gap: 6
  },
  noteHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 36
  },
  listPostponeAction: {
    alignItems: "flex-end",
    justifyContent: "center",
    minHeight: 44,
    paddingLeft: 12
  },
  rowAction: {
    color: "#A33E22",
    fontSize: 16,
    fontWeight: "800"
  },
  noteInput: {
    borderColor: "#B8C2D1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#18212F",
    fontSize: 17,
    height: 66,
    padding: 12,
    textAlignVertical: "top"
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#D8DEE8",
    borderRadius: 8,
    borderStyle: "dashed",
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 180,
    padding: 24
  },
  emptyText: {
    color: "#596579",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
    textAlign: "center"
  },
  secondaryButtonFull: {
    alignItems: "center",
    backgroundColor: "#E6F4EA",
    borderRadius: 8,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 54,
    paddingHorizontal: 16
  },
  secondaryButtonText: {
    color: "#12616F",
    fontSize: 16,
    fontWeight: "800"
  }
});
