import { defaultStoreId } from "./storesStore";
import {
  markLegacyStateImported,
  readLegacyAppState,
  readLegacyUserSettings,
  shouldImportLegacyState
} from "./persistence";
import { useAuthStore } from "./authStore";
import { useProductsStore } from "./productsStore";
import { useRoutesStore } from "./routesStore";
import { useSettingsStore } from "./settingsStore";
import { useShoppingListStore } from "./shoppingListStore";
import { useStoresStore } from "./storesStore";
import { useSyncStore } from "./syncStore";
import { useTripStore } from "./tripStore";

let hasBootstrappedLegacyState = false;

export function bootstrapLegacyState(): void {
  if (hasBootstrappedLegacyState || !shouldImportLegacyState()) {
    hasBootstrappedLegacyState = true;
    return;
  }

  const legacyState = readLegacyAppState();
  const legacySettings = readLegacyUserSettings(defaultStoreId);

  useProductsStore.getState().hydrateFromLegacy(legacyState);
  useShoppingListStore.getState().hydrateFromLegacy(legacyState);
  useStoresStore.getState().hydrateFromLegacy(legacyState);
  useRoutesStore.getState().hydrateFromLegacy(legacyState);
  useTripStore.getState().hydrateFromLegacy(legacyState);
  useSettingsStore.getState().hydrateFromLegacy(legacySettings);
  useSyncStore.getState().hydrateFromLegacy();
  useAuthStore.getState().hydrateFromLegacy();

  markLegacyStateImported();
  hasBootstrappedLegacyState = true;
}
