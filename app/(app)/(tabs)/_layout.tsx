import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="list" options={{ title: t("list:tabTitle") }} />
      <Tabs.Screen name="shop" options={{ title: t("shop:tabTitle") }} />
    </Tabs>
  );
}
