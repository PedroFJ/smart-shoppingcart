import { create } from "zustand";

type AuthState = {
  userId: string | null;
  householdId: string | null;
  setUser: (userId: string | null) => void;
  setHousehold: (householdId: string | null) => void;
};

export const useAuthStore = create<AuthState>()((set) => ({
  userId: null,
  householdId: null,
  setUser: (userId) => set({ userId }),
  setHousehold: (householdId) => set({ householdId })
}));
