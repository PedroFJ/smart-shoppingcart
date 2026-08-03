import { create } from "zustand";
import { createAppJsonStorage, persist } from "./persistence";
import { defaultStoreId } from "./storesStore";
import { DepartmentFilter, LocalUserSettings } from "./types";

const defaultLocalUserSettings: LocalUserSettings = {
  userName: "",
  voiceSearchEnabled: true,
  defaultStoreId,
  smartStartEnabled: false,
  locale: "pt-PT",
  listSearch: "",
  addSearch: "",
  departmentFilter: "all"
};

type SettingsState = LocalUserSettings & {
  setUserName: (userName: string) => void;
  setVoiceSearchEnabled: (voiceSearchEnabled: boolean) => void;
  setDefaultStoreId: (defaultStoreId: string) => void;
  setSmartStartEnabled: (smartStartEnabled: boolean) => void;
  setLocale: (locale: string) => void;
  setListSearch: (listSearch: string) => void;
  setAddSearch: (addSearch: string) => void;
  setDepartmentFilter: (departmentFilter: DepartmentFilter) => void;
  hydrateFromLegacy: (settings: LocalUserSettings) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultLocalUserSettings,
      setUserName: (userName) => set({ userName }),
      setVoiceSearchEnabled: (voiceSearchEnabled) => set({ voiceSearchEnabled }),
      setDefaultStoreId: (defaultStoreId) => set({ defaultStoreId }),
      setSmartStartEnabled: (smartStartEnabled) => set({ smartStartEnabled }),
      setLocale: (locale) => set({ locale }),
      setListSearch: (listSearch) => set({ listSearch }),
      setAddSearch: (addSearch) => set({ addSearch }),
      setDepartmentFilter: (departmentFilter) => set({ departmentFilter }),
      hydrateFromLegacy: (settings) => set(settings)
    }),
    {
      name: "smart-shoppingcart:settings-store:v1",
      storage: createAppJsonStorage<LocalUserSettings>(),
      version: 0,
      partialize: (state) => ({
        userName: state.userName,
        voiceSearchEnabled: state.voiceSearchEnabled,
        defaultStoreId: state.defaultStoreId,
        smartStartEnabled: state.smartStartEnabled,
        locale: state.locale,
        listSearch: state.listSearch,
        addSearch: state.addSearch,
        departmentFilter: state.departmentFilter
      })
    }
  )
);
