import { useMemo } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TextStyle, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { isSupabaseConfigured } from "../../../src/lib/supabase";
import { useSettingsStore } from "../../../src/state/settingsStore";
import { useStoresStore } from "../../../src/state/storesStore";
import { useSyncStore } from "../../../src/state/syncStore";
import { SyncStatus } from "../../../src/state/types";

const APP_VERSION = "0.1.1";
const UPDATE_CHANNEL = "staging";

export default function SettingsScreen() {
  const { t } = useTranslation("settings");
  const smartStartEnabled = useSettingsStore((state) => state.smartStartEnabled);
  const setSmartStartEnabled = useSettingsStore((state) => state.setSmartStartEnabled);
  const userName = useSettingsStore((state) => state.userName);
  const setUserName = useSettingsStore((state) => state.setUserName);
  const voiceSearchEnabled = useSettingsStore((state) => state.voiceSearchEnabled);
  const setVoiceSearchEnabled = useSettingsStore((state) => state.setVoiceSearchEnabled);
  const defaultStoreId = useSettingsStore((state) => state.defaultStoreId);
  const setDefaultStoreId = useSettingsStore((state) => state.setDefaultStoreId);
  const stores = useStoresStore((state) => state.supermarketProfiles);
  const activeSyncSpaceId = useSyncStore((state) => state.activeSyncSpaceId);
  const syncSpaceDraft = useSyncStore((state) => state.syncSpaceDraft);
  const setSyncSpaceDraft = useSyncStore((state) => state.setSyncSpaceDraft);
  const commitSyncSpaceDraft = useSyncStore((state) => state.commitSyncSpaceDraft);
  const syncStatus = useSyncStore((state) => state.syncStatus);

  const selectedStoreName = useMemo(() => {
    return stores.find((store) => store.id === defaultStoreId)?.name ?? stores[0]?.name ?? "";
  }, [defaultStoreId, stores]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.settingsContent}>
        <View style={styles.settingsPanel}>
          <Text style={styles.settingsTitle}>{t("arranque.title")}</Text>
          <View style={styles.settingsRow}>
            <View style={styles.settingsRowText}>
              <Text style={styles.settingsLabel}>{t("arranque.smartStart.label")}</Text>
              <Text style={styles.settingsText}>{t("arranque.smartStart.body")}</Text>
            </View>
            <Switch
              accessibilityHint={t("arranque.smartStart.body")}
              accessibilityLabel={t("arranque.smartStart.label")}
              value={smartStartEnabled}
              onValueChange={setSmartStartEnabled}
              trackColor={{ false: "#C8D0DB", true: "#9AD4D9" }}
              thumbColor={smartStartEnabled ? "#12616F" : "#F7F9FC"}
            />
          </View>
        </View>

        <View style={styles.settingsPanel}>
          <Text style={styles.settingsTitle}>{t("user.title")}</Text>
          <Text style={styles.settingsText}>{t("user.intro")}</Text>
          <TextInput
            accessibilityLabel={t("user.nameLabel")}
            style={styles.settingsInput}
            value={userName}
            onChangeText={setUserName}
            placeholder={t("user.namePlaceholder")}
          />
        </View>

        <View style={styles.settingsPanel}>
          <Text style={styles.settingsTitle}>{t("account.title")}</Text>
          <Text style={styles.settingsText}>{t("account.body")}</Text>
          <View style={styles.settingsDisabledAction}>
            <Text style={styles.settingsDisabledActionText}>{t("account.unavailable")}</Text>
          </View>
        </View>

        <View style={styles.settingsPanel}>
          <Text style={styles.settingsTitle}>{t("family.title")}</Text>
          <View style={styles.syncPanelHeader}>
            <View style={styles.syncPanelText}>
              <Text style={styles.settingsText}>
                {isSupabaseConfigured
                  ? t("family.connectedBody", { code: activeSyncSpaceId })
                  : t("family.disconnectedBody")}
              </Text>
            </View>
            <Text
              accessibilityLabel={isSupabaseConfigured ? t("family.pillSync") : t("family.pillLocal")}
              accessibilityRole="text"
              style={[styles.syncPill, getSyncPillStyle(syncStatus)]}
            >
              {isSupabaseConfigured ? t("family.pillSync") : t("family.pillLocal")}
            </Text>
          </View>
          <View style={styles.syncSpaceRow}>
            <TextInput
              accessibilityLabel={t("family.codeLabel")}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.syncSpaceInput}
              value={syncSpaceDraft}
              onChangeText={setSyncSpaceDraft}
              placeholder={t("family.codePlaceholder")}
            />
            <TouchableOpacity
              accessibilityHint={t("family.useButtonHint")}
              accessibilityLabel={t("family.useButton")}
              accessibilityRole="button"
              style={styles.syncSpaceButton}
              onPress={commitSyncSpaceDraft}
            >
              <Text style={styles.syncSpaceButtonText}>{t("family.useButton")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.settingsPanel}>
          <Text style={styles.settingsTitle}>{t("search.title")}</Text>
          <View style={styles.settingsRow}>
            <View style={styles.settingsRowText}>
              <Text style={styles.settingsLabel}>{t("search.voice.label")}</Text>
              <Text style={styles.settingsText}>{t("search.voice.body")}</Text>
            </View>
            <Switch
              accessibilityHint={t("search.voice.body")}
              accessibilityLabel={t("search.voice.label")}
              value={voiceSearchEnabled}
              onValueChange={setVoiceSearchEnabled}
              trackColor={{ false: "#C8D0DB", true: "#9AD4D9" }}
              thumbColor={voiceSearchEnabled ? "#12616F" : "#F7F9FC"}
            />
          </View>
        </View>

        <View style={styles.settingsPanel}>
          <Text style={styles.settingsTitle}>{t("store.title")}</Text>
          <Text style={styles.settingsText}>{t("store.intro", { name: selectedStoreName })}</Text>
          <View style={styles.defaultStoreGrid}>
            {stores.map((store) => {
              const isSelected = store.id === defaultStoreId;

              return (
                <TouchableOpacity
                  accessibilityHint={t("store.selectHint")}
                  accessibilityLabel={store.name}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  key={store.id}
                  style={[styles.defaultStoreButton, isSelected && styles.defaultStoreButtonActive]}
                  onPress={() => setDefaultStoreId(store.id)}
                >
                  <Text style={[styles.defaultStoreButtonText, isSelected && styles.defaultStoreButtonTextActive]}>{store.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.settingsPanel}>
          <Text style={styles.settingsTitle}>{t("about.title")}</Text>
          <Text style={styles.settingsText}>{t("about.body")}</Text>
          <Text style={styles.settingsMeta}>{t("about.meta", { channel: UPDATE_CHANNEL, version: APP_VERSION })}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getSyncPillStyle(syncStatus: SyncStatus): TextStyle {
  if (syncStatus === "synced") {
    return styles.syncPill_synced;
  }

  if (syncStatus === "saving" || syncStatus === "loading") {
    return styles.syncPill_saving;
  }

  if (syncStatus === "offline" || syncStatus === "error") {
    return styles.syncPill_error;
  }

  return styles.syncPill_local;
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#F5F7F9",
    flex: 1
  },
  settingsContent: {
    gap: 12,
    padding: 16,
    paddingBottom: 24
  },
  settingsPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8DEE8",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  settingsTitle: {
    color: "#18212F",
    fontSize: 18,
    fontWeight: "900"
  },
  settingsText: {
    color: "#4B5565",
    fontSize: 15,
    lineHeight: 21
  },
  settingsInput: {
    borderColor: "#B8C2D1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#18212F",
    fontSize: 16,
    fontWeight: "800",
    minHeight: 48,
    paddingHorizontal: 12
  },
  settingsRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  settingsRowText: {
    flex: 1
  },
  settingsLabel: {
    color: "#18212F",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 2
  },
  settingsMeta: {
    color: "#596579",
    fontSize: 13,
    fontWeight: "800"
  },
  settingsDisabledAction: {
    alignItems: "center",
    backgroundColor: "#EEF2F6",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12
  },
  settingsDisabledActionText: {
    color: "#596579",
    fontSize: 14,
    fontWeight: "900"
  },
  defaultStoreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  defaultStoreButton: {
    alignItems: "center",
    borderColor: "#B8C2D1",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12
  },
  defaultStoreButtonActive: {
    backgroundColor: "#12616F",
    borderColor: "#12616F"
  },
  defaultStoreButtonText: {
    color: "#18212F",
    fontSize: 14,
    fontWeight: "900"
  },
  defaultStoreButtonTextActive: {
    color: "#FFFFFF"
  },
  syncPanelHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  syncPanelText: {
    flex: 1
  },
  syncPill: {
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  syncPill_local: {
    backgroundColor: "#EEF2F6",
    color: "#596579"
  },
  syncPill_saving: {
    backgroundColor: "#E8F5FF",
    color: "#12616F"
  },
  syncPill_synced: {
    backgroundColor: "#E5F6EB",
    color: "#1F7A3A"
  },
  syncPill_error: {
    backgroundColor: "#FFE8E8",
    color: "#A12828"
  },
  syncSpaceRow: {
    flexDirection: "row",
    gap: 8
  },
  syncSpaceInput: {
    borderColor: "#B8C2D1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#18212F",
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    minHeight: 48,
    paddingHorizontal: 12
  },
  syncSpaceButton: {
    alignItems: "center",
    backgroundColor: "#12616F",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 76,
    paddingHorizontal: 12
  },
  syncSpaceButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900"
  }
});
