import { Storage as SQLiteStorage } from "expo-sqlite/kv-store";
import { LocalStorageLike } from "./deviceStorage";

export function getDeviceLocalStorage(): LocalStorageLike {
  return {
    getItem: (key) => SQLiteStorage.getItemSync(key),
    setItem: (key, value) => SQLiteStorage.setItemSync(key, value),
    removeItem: (key) => {
      SQLiteStorage.removeItemSync(key);
    }
  };
}
