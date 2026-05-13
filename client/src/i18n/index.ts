import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import { DEFAULT_LANG, I18N_NAMESPACES, normalizeLang, type Lang } from "./types";
import { preferenceDetector, navigatorDetector } from "./detector";
import { usePreferences } from "@/store/preferences";

import zhCommon from "./locales/zh-CN/common.json";
import zhHome from "./locales/zh-CN/home.json";
import zhEditor from "./locales/zh-CN/editor.json";
import zhDialog from "./locales/zh-CN/dialog.json";
import zhChat from "./locales/zh-CN/chat.json";
import zhError from "./locales/zh-CN/error.json";
import zhPromptMeta from "./locales/zh-CN/prompt-meta.json";

import enCommon from "./locales/en/common.json";
import enHome from "./locales/en/home.json";
import enEditor from "./locales/en/editor.json";
import enDialog from "./locales/en/dialog.json";
import enChat from "./locales/en/chat.json";
import enError from "./locales/en/error.json";
import enPromptMeta from "./locales/en/prompt-meta.json";

const resources = {
  "zh-CN": {
    common: zhCommon,
    home: zhHome,
    editor: zhEditor,
    dialog: zhDialog,
    chat: zhChat,
    error: zhError,
    "prompt-meta": zhPromptMeta,
  },
  en: {
    common: enCommon,
    home: enHome,
    editor: enEditor,
    dialog: enDialog,
    chat: enChat,
    error: enError,
    "prompt-meta": enPromptMeta,
  },
} as const;

const detector = new LanguageDetector();
detector.addDetector(preferenceDetector);
detector.addDetector(navigatorDetector);

i18n
  .use(detector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANG,
    supportedLngs: ["zh-CN", "en"],
    nonExplicitSupportedLngs: false,
    load: "currentOnly",
    ns: [...I18N_NAMESPACES],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: {
      order: ["preferenceStore", "navigatorNormalized"],
      caches: [],
    },
    react: { useSuspense: false },
  });

// 同步 document.documentElement.lang —— 让 a11y screen reader / 浏览器渲染 / SEO 正确识别页面语言
// index.html 默认写死 "zh-CN"，切换语言后必须更新
function syncHtmlLang(lang: Lang): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
}

const initial = normalizeLang(i18n.resolvedLanguage ?? i18n.language);
if (initial !== i18n.resolvedLanguage) {
  void i18n.changeLanguage(initial);
}
syncHtmlLang(initial);
// 后续语言事件（changeLanguage / detector 检测）也同步
i18n.on("languageChanged", (lng) => syncHtmlLang(normalizeLang(lng)));

export function getCurrentLang(): Lang {
  return normalizeLang(usePreferences.getState().language ?? i18n.resolvedLanguage ?? i18n.language);
}

export async function setLanguage(lang: Lang): Promise<void> {
  usePreferences.getState().setLanguage(lang);
  if (i18n.resolvedLanguage !== lang) {
    await i18n.changeLanguage(lang);
  }
  syncHtmlLang(lang);
}

export default i18n;
