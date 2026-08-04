import { StyleSheet, ViewStyle } from "react-native";
import { SectionId } from "../data/sampleData";

export function getSectionCardStyle(sectionId: SectionId): ViewStyle {
  return sectionCardStyles[sectionId] ?? sectionCardStyles.pantry;
}

const sectionCardStyles = StyleSheet.create<Record<SectionId, ViewStyle>>({
  bakery: {
    backgroundColor: "#FFF7E6",
    borderColor: "#DDA13B",
    borderLeftWidth: 6
  },
  "personal-care": {
    backgroundColor: "#F3F0FF",
    borderColor: "#7C6BC4",
    borderLeftWidth: 6
  },
  cleaning: {
    backgroundColor: "#EEF8F7",
    borderColor: "#249184",
    borderLeftWidth: 6
  },
  "fruit-veg": {
    backgroundColor: "#F0F8E8",
    borderColor: "#5D9436",
    borderLeftWidth: 6
  },
  frozen: {
    backgroundColor: "#ECF7FF",
    borderColor: "#368ABF",
    borderLeftWidth: 6
  },
  meat: {
    backgroundColor: "#FFF0F0",
    borderColor: "#C35C58",
    borderLeftWidth: 6
  },
  fish: {
    backgroundColor: "#EFF8FF",
    borderColor: "#2E7FA3",
    borderLeftWidth: 6
  },
  dairy: {
    backgroundColor: "#F5F7FF",
    borderColor: "#6680C4",
    borderLeftWidth: 6
  },
  pantry: {
    backgroundColor: "#FFF5ED",
    borderColor: "#C77A3A",
    borderLeftWidth: 6
  },
  drinks: {
    backgroundColor: "#EEF6FF",
    borderColor: "#3178B8",
    borderLeftWidth: 6
  },
  household: {
    backgroundColor: "#F3F6F1",
    borderColor: "#6E8064",
    borderLeftWidth: 6
  }
});
