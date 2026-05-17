export type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export function getDeviceLocalStorage(): LocalStorageLike | null {
  return null;
}
