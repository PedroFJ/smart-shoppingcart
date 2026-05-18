import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

export default function SettingsLayout() {
  const { t } = useTranslation("settings");

  return <Stack screenOptions={{ headerShown: true, headerTitle: t("headerTitle") }} />;
}
