import { useEffect, useMemo, useState } from "react";
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, SafeAreaView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { LocalStorageLike, getDeviceLocalStorage } from "../../src/lib/deviceStorage";
import { useSettingsStore } from "../../src/state/settingsStore";

const LOCAL_USER_SETTINGS_KEY = "smart-shoppingcart:user-settings:v1";
const stepKeys = ["list", "add", "shop"] as const;

type StepKey = (typeof stepKeys)[number];

type WelcomeStep = {
  key: StepKey;
};

const steps: WelcomeStep[] = stepKeys.map((key) => ({ key }));

function writeLegacySmartStartSetting(settings: {
  defaultStoreId: string;
  locale: string;
  smartStartEnabled: boolean;
  userName: string;
  voiceSearchEnabled: boolean;
}) {
  const storage = getWelcomeStorage();

  if (!storage) {
    return;
  }

  try {
    const currentRaw = storage.getItem(LOCAL_USER_SETTINGS_KEY);
    const current = currentRaw ? JSON.parse(currentRaw) : {};
    storage.setItem(
      LOCAL_USER_SETTINGS_KEY,
      JSON.stringify({
        ...current,
        ...settings,
        smartStartEnabled: true
      })
    );
  } catch (error) {
    console.warn("Could not save smart start setting.", error);
  }
}

function getWelcomeStorage(): LocalStorageLike | null {
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

export default function WelcomeScreen() {
  const router = useRouter();
  const { t } = useTranslation("welcome");
  const { width } = useWindowDimensions();
  const smartStartEnabled = useSettingsStore((state) => state.smartStartEnabled);
  const setSmartStartEnabled = useSettingsStore((state) => state.setSmartStartEnabled);
  const userName = useSettingsStore((state) => state.userName);
  const voiceSearchEnabled = useSettingsStore((state) => state.voiceSearchEnabled);
  const defaultStoreId = useSettingsStore((state) => state.defaultStoreId);
  const locale = useSettingsStore((state) => state.locale);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const cardWidth = Math.max(280, width - 32);

  const stepItems = useMemo(() => steps, []);

  useEffect(() => {
    if (smartStartEnabled) {
      router.replace("/");
    }
  }, [router, smartStartEnabled]);

  function handleScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / cardWidth);
    setActiveStepIndex(Math.min(Math.max(nextIndex, 0), stepItems.length - 1));
  }

  function handleStart() {
    setSmartStartEnabled(true);
    writeLegacySmartStartSetting({
      defaultStoreId,
      locale,
      smartStartEnabled: true,
      userName,
      voiceSearchEnabled
    });
    router.replace("/");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.hero}>
          <Text style={styles.title}>{t("headline")}</Text>
          <Text style={styles.intro}>{t("intro")}</Text>
        </View>

        <FlatList
          accessibilityRole="adjustable"
          data={stepItems}
          horizontal
          keyExtractor={(item) => item.key}
          onMomentumScrollEnd={handleScrollEnd}
          pagingEnabled
          renderItem={({ item, index }) => (
            <View
              accessibilityLabel={`${t("stepIndicator", { current: index + 1, total: stepItems.length })} - ${t(`steps.${item.key}.title`)}`}
              accessible
              style={[styles.stepCard, { width: cardWidth }]}
            >
              <Text style={styles.stepNumber}>{index + 1}</Text>
              <Text style={styles.stepTitle}>{t(`steps.${item.key}.title`)}</Text>
              <Text style={styles.stepBody}>{t(`steps.${item.key}.body`)}</Text>
            </View>
          )}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          style={styles.steps}
        />

        <View accessibilityElementsHidden importantForAccessibility="no" style={styles.dots}>
          {stepItems.map((item, index) => (
            <View key={item.key} style={[styles.dot, index === activeStepIndex && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity
          accessibilityHint={t("ctaHint")}
          accessibilityLabel={t("cta")}
          accessibilityRole="button"
          onPress={handleStart}
          style={styles.cta}
        >
          <Text style={styles.ctaText}>{t("cta")}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#F5F7F9",
    flex: 1
  },
  screen: {
    flex: 1,
    gap: 16,
    padding: 16
  },
  hero: {
    gap: 10,
    paddingTop: 8
  },
  title: {
    color: "#18212F",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34
  },
  intro: {
    color: "#4B5565",
    fontSize: 16,
    lineHeight: 23
  },
  steps: {
    flexGrow: 0
  },
  stepCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8DEE8",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginRight: 16,
    minHeight: 250,
    padding: 18
  },
  stepNumber: {
    backgroundColor: "#12616F",
    borderRadius: 8,
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    height: 38,
    lineHeight: 38,
    textAlign: "center",
    width: 38
  },
  stepTitle: {
    color: "#18212F",
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 26
  },
  stepBody: {
    color: "#4B5565",
    fontSize: 16,
    lineHeight: 23
  },
  dots: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center"
  },
  dot: {
    backgroundColor: "#B9C4D4",
    borderRadius: 5,
    height: 10,
    width: 10
  },
  dotActive: {
    backgroundColor: "#12616F",
    width: 28
  },
  cta: {
    alignItems: "center",
    backgroundColor: "#12616F",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 20
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900"
  }
});
