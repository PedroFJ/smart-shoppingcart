import { StateStorage, createJSONStorage, persist } from "zustand/middleware";
import { sections } from "../data/sampleData";
import { isSavedAtNewer } from "../domain/savedAt";
import { LocalStorageLike, getDeviceLocalStorage } from "../lib/deviceStorage";
import { defaultSyncSpaceId } from "../lib/supabase";
import { DepartmentFilter, LocalUserSettings, PersistedAppState } from "./types";

export { persist };

export const legacyAppStateStorageKey = "smart-shoppingcart:v1";
export const legacyUserSettingsStorageKey = "smart-shoppingcart:user-settings:v1";
export const syncClientIdStorageKey = "smart-shoppingcart:sync-client-id";
export const syncSpaceIdStorageKey = "smart-shoppingcart:sync-space-id";
export const legacyImportCompleteStorageKey = "smart-shoppingcart:zustand-import-complete:v1";
export const legacyImportWatermarkStorageKey = "smart-shoppingcart:legacy-import-watermark:v1";

const sectionIds = new Set<string>(sections.map((section) => section.id));

export function createAppJsonStorage<State>() {
  return createJSONStorage<State>(() => appStateStorage);
}

export function readLegacyAppState(): PersistedAppState | null {
  const storage = getAppStorage();
  const rawState = storage?.getItem(legacyAppStateStorageKey);

  if (!rawState) {
    return null;
  }

  try {
    return JSON.parse(rawState) as PersistedAppState;
  } catch {
    return null;
  }
}

export function readLegacyUserSettings(defaultStoreId: string): LocalUserSettings {
  const fallbackSettings: LocalUserSettings = {
    userName: "",
    voiceSearchEnabled: true,
    defaultStoreId,
    smartStartEnabled: false,
    locale: "pt-PT",
    listSearch: "",
    addSearch: "",
    departmentFilter: "all"
  };
  const storage = getAppStorage();
  const rawSettings = storage?.getItem(legacyUserSettingsStorageKey);

  if (!rawSettings) {
    return fallbackSettings;
  }

  try {
    const parsedSettings = JSON.parse(rawSettings) as Partial<LocalUserSettings>;

    return {
      userName: typeof parsedSettings.userName === "string" ? parsedSettings.userName : fallbackSettings.userName,
      voiceSearchEnabled: typeof parsedSettings.voiceSearchEnabled === "boolean"
        ? parsedSettings.voiceSearchEnabled
        : fallbackSettings.voiceSearchEnabled,
      defaultStoreId: typeof parsedSettings.defaultStoreId === "string"
        ? parsedSettings.defaultStoreId
        : fallbackSettings.defaultStoreId,
      smartStartEnabled: typeof parsedSettings.smartStartEnabled === "boolean"
        ? parsedSettings.smartStartEnabled
        : fallbackSettings.smartStartEnabled,
      locale: typeof parsedSettings.locale === "string" ? parsedSettings.locale : fallbackSettings.locale,
      listSearch: typeof parsedSettings.listSearch === "string" ? parsedSettings.listSearch : fallbackSettings.listSearch,
      addSearch: typeof parsedSettings.addSearch === "string" ? parsedSettings.addSearch : fallbackSettings.addSearch,
      departmentFilter: isDepartmentFilter(parsedSettings.departmentFilter)
        ? parsedSettings.departmentFilter
        : fallbackSettings.departmentFilter
    };
  } catch {
    return fallbackSettings;
  }
}

export function isLegacyCutoverComplete(): boolean {
  return getAppStorage()?.getItem(legacyImportCompleteStorageKey) === "true";
}

export function readLegacyImportWatermark(): string {
  return getAppStorage()?.getItem(legacyImportWatermarkStorageKey) ?? "";
}

export function shouldImportLegacyState(legacySavedAt?: string): boolean {
  if (isLegacyCutoverComplete()) {
    return false;
  }

  if (!legacySavedAt) {
    return false;
  }

  return isSavedAtNewer(legacySavedAt, readLegacyImportWatermark());
}

export function markLegacyStateImported(savedAt: string): void {
  getAppStorage()?.setItem(legacyImportWatermarkStorageKey, savedAt);
}

export function markLegacyCutoverComplete(): void {
  getAppStorage()?.setItem(legacyImportCompleteStorageKey, "true");
}

export function getInitialSyncSpaceId(): string {
  return normalizeSyncSpaceId(getAppStorage()?.getItem(syncSpaceIdStorageKey) || defaultSyncSpaceId);
}

export function saveSyncSpaceId(syncSpaceId: string): void {
  getAppStorage()?.setItem(syncSpaceIdStorageKey, normalizeSyncSpaceId(syncSpaceId));
}

export function getOrCreateSyncClientId(): string {
  const storage = getAppStorage();

  if (!storage) {
    return createSyncClientId();
  }

  const existingClientId = storage.getItem(syncClientIdStorageKey);

  if (existingClientId) {
    return existingClientId;
  }

  const nextClientId = createSyncClientId();
  storage.setItem(syncClientIdStorageKey, nextClientId);
  return nextClientId;
}

export function normalizeSyncSpaceId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || defaultSyncSpaceId;
}

function createSyncClientId(): string {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isDepartmentFilter(value: unknown): value is DepartmentFilter {
  return value === "all" || (typeof value === "string" && sectionIds.has(value));
}

function getAppStorage(): LocalStorageLike | null {
  const browserStorage = typeof globalThis !== "undefined" && "localStorage" in globalThis
    ? globalThis.localStorage
    : null;

  if (
    browserStorage &&
    typeof browserStorage.getItem === "function" &&
    typeof browserStorage.setItem === "function" &&
    typeof browserStorage.removeItem === "function"
  ) {
    return browserStorage as LocalStorageLike;
  }

  return getDeviceLocalStorage();
}

// Must stay synchronous until Commit 11. bootstrapLegacyState() in app/_layout.tsx
// assumes persist() has already rehydrated by the time it runs; an async adapter
// breaks that ordering silently, with no typecheck error.
const appStateStorage: StateStorage = {
  getItem: (name) => getAppStorage()?.getItem(name) ?? null,
  setItem: (name, value) => {
    getAppStorage()?.setItem(name, value);
  },
  removeItem: (name) => {
    getAppStorage()?.removeItem(name);
  }
};
