import { Stack } from "expo-router";

export default function ProductsStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="new" options={{ presentation: "modal" }} />
      <Stack.Screen name="[productId]/edit" options={{ presentation: "modal" }} />
    </Stack>
  );
}
