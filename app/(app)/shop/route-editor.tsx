import { useRouter } from "expo-router";
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { defaultItinerary } from "../../../src/data/sampleData";
import { defaultSupercorStopOrder, getRouteEditorItems } from "../../../src/domain/routeOrdering";
import { useTripLifecycle } from "../../../src/hooks/useTripLifecycle";
import { useStoresStore } from "../../../src/state/storesStore";

export default function RouteEditorRoute() {
  const { t } = useTranslation("shop");
  const router = useRouter();
  const selectedStoreId = useStoresStore((state) => state.selectedStoreId);
  const stores = useStoresStore((state) => state.supermarketProfiles);
  const storeItineraries = useStoresStore((state) => state.storeItineraries);
  const storeStopOrders = useStoresStore((state) => state.storeStopOrders);
  const { moveStoreSection } = useTripLifecycle();
  const storeName = stores.find((store) => store.id === selectedStoreId)?.name ?? selectedStoreId;
  const routeItems = getRouteEditorItems(
    selectedStoreId,
    storeItineraries[selectedStoreId] ?? defaultItinerary,
    storeStopOrders[selectedStoreId] ?? defaultSupercorStopOrder
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t("routeEditor.title")}</Text>
            <Text style={styles.subtitle}>{t("routeEditor.store", { store: storeName })}</Text>
          </View>
          <TouchableOpacity accessibilityLabel={t("routeEditor.close")} style={styles.closeButton} onPress={() => router.back()}>
            <Text style={styles.closeText}>{t("routeEditor.closeSymbol")}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.routeList}>
          {routeItems.map((routeItem, index) => (
            <View key={routeItem.id} style={styles.routeRow}>
              <Text style={styles.routeNumber}>{index + 1}</Text>
              <Text style={styles.routeName}>{routeItem.name}</Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  accessibilityLabel={t("routeEditor.moveUp", { section: routeItem.name })}
                  disabled={index === 0}
                  style={[styles.arrowButton, index === 0 && styles.disabledButton]}
                  onPress={() => moveStoreSection(routeItem.id, "up")}
                >
                  <Text style={[styles.arrowText, index === 0 && styles.disabledText]}>↑</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityLabel={t("routeEditor.moveDown", { section: routeItem.name })}
                  disabled={index === routeItems.length - 1}
                  style={[styles.arrowButton, index === routeItems.length - 1 && styles.disabledButton]}
                  onPress={() => moveStoreSection(routeItem.id, "down")}
                >
                  <Text style={[styles.arrowText, index === routeItems.length - 1 && styles.disabledText]}>↓</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F5F7F9", flex: 1, paddingTop: StatusBar.currentHeight ?? 0 },
  screen: { flex: 1, padding: 16 },
  header: { alignItems: "center", flexDirection: "row", gap: 12, marginBottom: 16 },
  headerText: { flex: 1 },
  title: { color: "#18212F", fontSize: 25, fontWeight: "900" },
  subtitle: { color: "#596579", fontSize: 15, fontWeight: "700", marginTop: 3 },
  closeButton: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#B8C2D1", borderRadius: 8, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  closeText: { color: "#18212F", fontSize: 17, fontWeight: "900" },
  routeList: { gap: 8, paddingBottom: 24 },
  routeRow: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#D8DEE8", borderRadius: 8, borderWidth: 1, flexDirection: "row", gap: 12, minHeight: 66, padding: 8 },
  routeNumber: { color: "#12616F", fontSize: 17, fontWeight: "900", textAlign: "center", width: 34 },
  routeName: { color: "#18212F", flex: 1, fontSize: 16, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 6 },
  arrowButton: { alignItems: "center", backgroundColor: "#F5F7F9", borderColor: "#B8C2D1", borderRadius: 8, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  arrowText: { color: "#18212F", fontSize: 22, fontWeight: "900" },
  disabledButton: { backgroundColor: "#E5E8ED", borderColor: "#D1D6DE" },
  disabledText: { color: "#929BA8" }
});
