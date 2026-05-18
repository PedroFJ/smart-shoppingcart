import { create } from "zustand";
import { createAppJsonStorage, persist, readLegacyUserSettings } from "./persistence";
import { defaultStoreId } from "./storesStore";
import { LocalUserSettings } from "./types";

const legacySettings = readLegacyUserSettings(defaultStoreId);

type SettingsState = LocalUserSettings & {
  setUserName: (userName: string) => void;
  setVoiceSearchEnabled: (voiceSearchEnabled: boolean) => void;
  setDefaultStoreId: (defaultStoreId: string) => void;
  setSmartStartEnabled: (smartStartEnabled: boolean) => void;
  setLocale: (locale: string) => void;
  hydrateFromLegacy: (settings: LocalUserSettings) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist<SettingsState>(
    (set) => ({
      ...legacySettings,
      setUserName: (userName) => set({ userName }),
      setVoiceSearchEnabled: (voiceSearchEnabled) => set({ voiceSearchEnabled }),
      setDefaultStoreId: (defaultStoreId) => set({ defaultStoreId }),
      setSmartStartEnabled: (smartStartEnabled) => set({ smartStartEnabled }),
      setLocale: (locale) => set({ locale }),
      hydrateFromLegacy: (settings) => set(settings)
    }),
    {
      name: "smart-shoppingcart:settings-store:v1",
      storage: createAppJsonStorage()
    }
  )
);
