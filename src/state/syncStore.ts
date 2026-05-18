import { create } from "zustand";
import { isSupabaseConfigured } from "../lib/supabase";
import { getInitialSyncSpaceId, getOrCreateSyncClientId, normalizeSyncSpaceId, saveSyncSpaceId } from "./persistence";
import { SyncStatus } from "./types";

type SyncState = {
  syncClientId: string;
  activeSyncSpaceId: string;
  syncSpaceDraft: string;
  syncStatus: SyncStatus;
  syncMessage: string;
  remoteReady: boolean;
  remoteApplyInProgress: boolean;
  lastRemoteSavedAt: string;
  setSyncSpaceDraft: (syncSpaceDraft: string) => void;
  activateSyncSpace: (syncSpaceId: string) => void;
  commitSyncSpaceDraft: () => void;
  setSyncStatus: (syncStatus: SyncStatus, syncMessage: string) => void;
  setRemoteReady: (remoteReady: boolean) => void;
  setRemoteApplyInProgress: (remoteApplyInProgress: boolean) => void;
  setLastRemoteSavedAt: (lastRemoteSavedAt: string) => void;
  hydrateFromLegacy: () => void;
};

const initialSyncSpaceId = getInitialSyncSpaceId();

export const useSyncStore = create<SyncState>()((set) => ({
  syncClientId: getOrCreateSyncClientId(),
  activeSyncSpaceId: initialSyncSpaceId,
  syncSpaceDraft: initialSyncSpaceId,
  syncStatus: isSupabaseConfigured ? "loading" : "local",
  syncMessage: isSupabaseConfigured ? "A sincronizar" : "Modo local",
  remoteReady: false,
  remoteApplyInProgress: false,
  lastRemoteSavedAt: "",
  setSyncSpaceDraft: (syncSpaceDraft) => set({ syncSpaceDraft }),
  activateSyncSpace: (syncSpaceId) => {
    saveSyncSpaceId(syncSpaceId);
    set({
      activeSyncSpaceId: syncSpaceId,
      syncSpaceDraft: syncSpaceId,
      syncStatus: "loading",
      syncMessage: `A carregar ${syncSpaceId}`
    });
  },
  commitSyncSpaceDraft: () => {
    set((state) => {
      const nextSyncSpaceId = normalizeSyncSpaceId(state.syncSpaceDraft);
      saveSyncSpaceId(nextSyncSpaceId);

      return {
        activeSyncSpaceId: nextSyncSpaceId,
        syncSpaceDraft: nextSyncSpaceId,
        syncStatus: isSupabaseConfigured ? "loading" : "local",
        syncMessage: isSupabaseConfigured ? `A carregar ${nextSyncSpaceId}` : "Modo local"
      };
    });
  },
  setSyncStatus: (syncStatus, syncMessage) => set({ syncStatus, syncMessage }),
  setRemoteReady: (remoteReady) => set({ remoteReady }),
  setRemoteApplyInProgress: (remoteApplyInProgress) => set({ remoteApplyInProgress }),
  setLastRemoteSavedAt: (lastRemoteSavedAt) => set({ lastRemoteSavedAt }),
  hydrateFromLegacy: () => undefined
}));
