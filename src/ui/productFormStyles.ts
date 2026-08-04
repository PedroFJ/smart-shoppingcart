import { Platform, StatusBar, StyleSheet } from "react-native";

const androidStatusBarInset = Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 0;

export const productFormStyles = StyleSheet.create({
  safeArea: { backgroundColor: "#F5F7F9", flex: 1, paddingTop: androidStatusBarInset },
  screen: { flex: 1, padding: 16 },
  header: { alignItems: "center", flexDirection: "row", gap: 12, marginBottom: 18 },
  title: { color: "#18212F", flex: 1, fontSize: 26, fontWeight: "900" },
  closeButton: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#B8C2D1", borderRadius: 8, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  closeText: { color: "#18212F", fontSize: 17, fontWeight: "900" },
  fields: { gap: 12 },
  fieldGroup: { gap: 6 },
  label: { color: "#596579", fontSize: 13, fontWeight: "900", textTransform: "uppercase" },
  input: { backgroundColor: "#FFFFFF", borderColor: "#B8C2D1", borderRadius: 8, borderWidth: 1, color: "#18212F", fontSize: 17, minHeight: 52, paddingHorizontal: 12 },
  noteInput: { minHeight: 88, paddingTop: 12, textAlignVertical: "top" },
  preferenceButton: { alignItems: "center", borderRadius: 8, justifyContent: "center", minHeight: 52, paddingHorizontal: 14 },
  preferenceOpen: { backgroundColor: "#E6F4EA", borderColor: "#4E8A62", borderWidth: 1 },
  preferenceExact: { backgroundColor: "#F8E8E2", borderColor: "#A33E22", borderWidth: 1 },
  preferenceOpenText: { color: "#245A38", fontSize: 15, fontWeight: "900" },
  preferenceExactText: { color: "#A33E22", fontSize: 15, fontWeight: "900" },
  sectionRail: { gap: 8, paddingBottom: 4, paddingRight: 12 },
  sectionButton: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#B8C2D1", borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 48, minWidth: 118, paddingHorizontal: 12 },
  sectionButtonActive: { backgroundColor: "#12616F", borderColor: "#12616F" },
  sectionText: { color: "#18212F", fontSize: 14, fontWeight: "800" },
  sectionTextActive: { color: "#FFFFFF" },
  actions: { gap: 8, marginTop: 18 },
  primaryButton: { alignItems: "center", backgroundColor: "#12616F", borderRadius: 8, justifyContent: "center", minHeight: 54, paddingHorizontal: 16 },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  secondaryButton: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#B8C2D1", borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 54, paddingHorizontal: 16 },
  secondaryText: { color: "#3E4A5A", fontSize: 16, fontWeight: "900" },
  emptyText: { color: "#596579", fontSize: 16, lineHeight: 22, marginVertical: 24, textAlign: "center" }
});
