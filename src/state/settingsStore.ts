import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createAppJsonStorage, readLegacyUserSettings } from "./persistence";
import { defaultStoreId } from "./storesStore";
import { LocalUserSettings } from "./types";

const legacySettings = readLegacyUserSettings(defaultStoreId);

type SettingsState = LocalUserSettings & {
  setUserName: (userName: string) => void;
  setVoiceSearchEnabled: (voiceSearchEnabled: boolean) => void;
  setDefaultStoreId: (defaultStoreId: string) => void;
  setSmartStartEnabled: (smartStartEnabled: boolean) => void;
  setLocale: (locale: string) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...legacySettings,
      setUserName: (userName) => set({ userName }),
      setVoiceSearchEnabled: (voiceSearchEnabled) => set({ voiceSearchEnabled }),
      setDefaultStoreId: (defaultStoreId) => set({ defaultStoreId }),
      setSmartStartEnabled: (smartStartEnabled) => set({ smartStartEnabled }),
      setLocale: (locale) => set({ locale })
    }),
    {
      name: "smart-shoppingcart:settings-store:v1",
      storage: createAppJsonStorage()
    }
  )
);
