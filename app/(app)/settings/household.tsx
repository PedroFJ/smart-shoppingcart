import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

export default function HouseholdSettingsStub() {
  const { t } = useTranslation("settings");

  return (
    <View style={styles.screen}>
      <Text accessibilityHint={t("stub.emBreveHint")} style={styles.text}>
        {t("stub.emBreve")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    backgroundColor: "#F5F7F9",
    flex: 1,
    justifyContent: "center",
    padding: 16
  },
  text: {
    color: "#18212F",
    fontSize: 18,
    fontWeight: "900"
  }
});
