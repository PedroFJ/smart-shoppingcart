import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enAdd from "./locales/en/add.json";
import enAuth from "./locales/en/auth.json";
import enCommon from "./locales/en/common.json";
import enErrors from "./locales/en/errors.json";
import enHome from "./locales/en/home.json";
import enList from "./locales/en/list.json";
import enMissing from "./locales/en/missing.json";
import enRouteEditor from "./locales/en/route-editor.json";
import enSettings from "./locales/en/settings.json";
import enShop from "./locales/en/shop.json";
import enSummary from "./locales/en/summary.json";
import enWelcome from "./locales/en/welcome.json";
import ptPtAdd from "./locales/pt-PT/add.json";
import ptPtAuth from "./locales/pt-PT/auth.json";
import ptPtCommon from "./locales/pt-PT/common.json";
import ptPtErrors from "./locales/pt-PT/errors.json";
import ptPtHome from "./locales/pt-PT/home.json";
import ptPtList from "./locales/pt-PT/list.json";
import ptPtMissing from "./locales/pt-PT/missing.json";
import ptPtRouteEditor from "./locales/pt-PT/route-editor.json";
import ptPtSettings from "./locales/pt-PT/settings.json";
import ptPtShop from "./locales/pt-PT/shop.json";
import ptPtSummary from "./locales/pt-PT/summary.json";
import ptPtWelcome from "./locales/pt-PT/welcome.json";

export const namespaces = [
  "common",
  "errors",
  "welcome",
  "auth",
  "home",
  "list",
  "add",
  "shop",
  "summary",
  "route-editor",
  "missing",
  "settings"
] as const;

export type Locale = "en" | "pt-PT" | "pt-BR" | "es";

export function resolveInitialLocale(): Locale {
  const deviceLocale = Localization.getLocales()[0]?.languageTag;
  return mapDeviceLocale(deviceLocale);
}

export function mapDeviceLocale(languageTag?: string): Locale {
  if (!languageTag) {
    return "pt-PT";
  }

  const normalizedTag = languageTag.toLowerCase();

  if (normalizedTag === "pt-br") {
    return "pt-BR";
  }

  if (normalizedTag.startsWith("pt")) {
    return "pt-PT";
  }

  if (normalizedTag.startsWith("es")) {
    return "es";
  }

  return "pt-PT";
}

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: "v4",
    defaultNS: "common",
    fallbackLng: {
      "pt-BR": ["pt-PT", "en"],
      es: ["en"],
      default: ["en"]
    },
    interpolation: {
      escapeValue: false
    },
    lng: resolveInitialLocale(),
    ns: namespaces,
    resources: {
      en: {
        add: enAdd,
        auth: enAuth,
        common: enCommon,
        errors: enErrors,
        home: enHome,
        list: enList,
        missing: enMissing,
        "route-editor": enRouteEditor,
        settings: enSettings,
        shop: enShop,
        summary: enSummary,
        welcome: enWelcome
      },
      "pt-PT": {
        add: ptPtAdd,
        auth: ptPtAuth,
        common: ptPtCommon,
        errors: ptPtErrors,
        home: ptPtHome,
        list: ptPtList,
        missing: ptPtMissing,
        "route-editor": ptPtRouteEditor,
        settings: ptPtSettings,
        shop: ptPtShop,
        summary: ptPtSummary,
        welcome: ptPtWelcome
      }
    }
  });

export default i18n;
