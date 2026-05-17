import { StateStorage, createJSONStorage } from "zustand/middleware";
import { LocalStorageLike, getDeviceLocalStorage } from "../lib/deviceStorage";
import { defaultSyncSpaceId } from "../lib/supabase";
import { LocalUserSettings, PersistedAppState } from "./types";

export const legacyAppStateStorageKey = "smart-shoppingcart:v1";
export const legacyUserSettingsStorageKey = "smart-shoppingcart:user-settings:v1";
export const syncClientIdStorageKey = "smart-shoppingcart:sync-client-id";
export const syncSpaceIdStorageKey = "smart-shoppingcart:sync-space-id";
export const legacyImportCompleteStorageKey = "smart-shoppingcart:zustand-import-complete:v1";

export function createAppJsonStorage() {
  return createJSONStorage(() => appStateStorage);
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
    locale: "pt-PT"
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
      locale: typeof parsedSettings.locale === "string" ? parsedSettings.locale : fallbackSettings.locale
    };
  } catch {
    return fallbackSettings;
  }
}

export function shouldImportLegacyState(): boolean {
  return getAppStorage()?.getItem(legacyImportCompleteStorageKey) !== "true";
}

export function markLegacyStateImported(): void {
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

const appStateStorage: StateStorage = {
  getItem: (name) => getAppStorage()?.getItem(name) ?? null,
  setItem: (name, value) => {
    getAppStorage()?.setItem(name, value);
  },
  removeItem: (name) => {
    getAppStorage()?.removeItem(name);
  }
};
