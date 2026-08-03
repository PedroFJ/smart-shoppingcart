import { defaultStoreId } from "./storesStore";
import {
  isLegacyCutoverComplete,
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

// TRANSITIONAL (Pass 1, Commits 5.5-10): App.tsx is still the writer of record,
// so the legacy blob is re-imported whenever it is newer than the watermark.
// At Commit 11, when App.tsx is deleted: call markLegacyCutoverComplete() once,
// which permanently disables this path. The stores become the writer of record.
export function bootstrapLegacyState(): void {
  if (isLegacyCutoverComplete()) {
    return;
  }

  const legacyState = readLegacyAppState();

  if (!shouldImportLegacyState(legacyState?.savedAt)) {
    return;
  }

  const legacySettings = readLegacyUserSettings(defaultStoreId);

  useProductsStore.getState().hydrateFromLegacy(legacyState);
  useShoppingListStore.getState().hydrateFromLegacy(legacyState);
  useStoresStore.getState().hydrateFromLegacy(legacyState);
  useRoutesStore.getState().hydrateFromLegacy(legacyState);
  useTripStore.getState().hydrateFromLegacy(legacyState);
  useSettingsStore.getState().hydrateFromLegacy(legacySettings);
  useSyncStore.getState().hydrateFromLegacy();
  useAuthStore.getState().hydrateFromLegacy();

  markLegacyStateImported(legacyState!.savedAt);
}
