import { useRouter } from "expo-router";
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { defaultItinerary, sections } from "../../../src/data/sampleData";
import { inferSectionRoute } from "../../../src/domain/routeInference";
import { useTripLifecycle } from "../../../src/hooks/useTripLifecycle";
import { useRoutesStore } from "../../../src/state/routesStore";
import { useStoresStore } from "../../../src/state/storesStore";

const sectionNameById = new Map(sections.map((section) => [section.id, section.name]));

export default function SummaryRoute() {
  const { t } = useTranslation("summary");
  const router = useRouter();
  const pickEvents = useRoutesStore((state) => state.pickEvents);
  const selectedStoreId = useStoresStore((state) => state.selectedStoreId);
  const stores = useStoresStore((state) => state.supermarketProfiles);
  const storeItineraries = useStoresStore((state) => state.storeItineraries);
  const { finalizeShoppingTrip, saveInferredRoute } = useTripLifecycle();
  const currentRoute = storeItineraries[selectedStoreId] ?? defaultItinerary;
  const inferredRoute = inferSectionRoute(pickEvents, currentRoute);
  const storeName = stores.find((store) => store.id === selectedStoreId)?.name ?? selectedStoreId;
  const confidenceBand = getConfidenceBand(inferredRoute.confidence);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7F9" translucent={false} />
      <View style={styles.screen}>
        <Text style={styles.title}>{t("title")}</Text>
        <Text style={styles.storeName}>{t("store", { store: storeName })}</Text>
        <View style={[styles.confidencePill, { backgroundColor: confidenceBand.backgroundColor }]}>
          <Text style={[styles.confidenceText, { color: confidenceBand.color }]}>
            {t(`confidence.${confidenceBand.key}`)} - {t("confidence.value", { value: Math.round(inferredRoute.confidence * 100) })}
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.routeList}>
          {inferredRoute.sectionIds.map((sectionId, index) => (
            <View key={sectionId} style={styles.routeRow}>
              <Text style={styles.routeNumber}>{index + 1}</Text>
              <Text style={styles.routeName}>{sectionNameById.get(sectionId) ?? sectionId}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => saveInferredRoute(inferredRoute.sectionIds)}>
            <Text style={styles.primaryText}>{t("actions.save")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={finalizeShoppingTrip}>
            <Text style={styles.secondaryText}>{t("actions.discard")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tertiaryButton} onPress={() => router.replace("/shop")}>
            <Text style={styles.tertiaryText}>{t("actions.back")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function getConfidenceBand(confidence: number): {
  key: "reliable" | "partial" | "limited";
  color: string;
  backgroundColor: string;
} {
  if (confidence >= 0.6) {
    return { key: "reliable", color: "#1F7A4C", backgroundColor: "#E8F5EE" };
  }

  if (confidence >= 0.3) {
    return { key: "partial", color: "#8A5A00", backgroundColor: "#FFF4E0" };
  }

  return { key: "limited", color: "#A33E22", backgroundColor: "#FDECE8" };
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F5F7F9", flex: 1, paddingTop: StatusBar.currentHeight ?? 0 },
  screen: { flex: 1, padding: 16 },
  title: { color: "#18212F", fontSize: 28, fontWeight: "900", marginBottom: 4 },
  storeName: { color: "#596579", fontSize: 16, fontWeight: "700", marginBottom: 12 },
  confidencePill: { alignSelf: "flex-start", borderRadius: 8, marginBottom: 14, paddingHorizontal: 12, paddingVertical: 8 },
  confidenceText: { fontSize: 14, fontWeight: "900" },
  routeList: { gap: 8, paddingBottom: 16 },
  routeRow: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#D8DEE8", borderRadius: 8, borderWidth: 1, flexDirection: "row", gap: 12, minHeight: 54, padding: 10 },
  routeNumber: { color: "#12616F", fontSize: 17, fontWeight: "900", textAlign: "center", width: 34 },
  routeName: { color: "#18212F", flex: 1, fontSize: 16, fontWeight: "800" },
  actions: { gap: 8, paddingTop: 8 },
  primaryButton: { alignItems: "center", backgroundColor: "#12616F", borderRadius: 8, justifyContent: "center", minHeight: 54, paddingHorizontal: 16 },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  secondaryButton: { alignItems: "center", backgroundColor: "#E6F4EA", borderRadius: 8, justifyContent: "center", minHeight: 54, paddingHorizontal: 16 },
  secondaryText: { color: "#12616F", fontSize: 16, fontWeight: "900" },
  tertiaryButton: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#B8C2D1", borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 54, paddingHorizontal: 16 },
  tertiaryText: { color: "#3E4A5A", fontSize: 16, fontWeight: "900" }
});
