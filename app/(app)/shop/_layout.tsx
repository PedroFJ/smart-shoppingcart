import { Stack } from "expo-router";

export default function ShopStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="route-editor" options={{ presentation: "modal" }} />
      <Stack.Screen name="summary" />
    </Stack>
  );
}
