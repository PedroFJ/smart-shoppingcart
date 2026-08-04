import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="list" options={{ title: "Lista" }} />
    </Tabs>
  );
}
