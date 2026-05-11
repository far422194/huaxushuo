import type { CustomDetector } from "i18next-browser-languagedetector";
import { usePreferences } from "@/store/preferences";
import { normalizeLang, DEFAULT_LANG } from "./types";

export const preferenceDetector: CustomDetector = {
  name: "preferenceStore",
  lookup() {
    return usePreferences.getState().language;
  },
};

export const navigatorDetector: CustomDetector = {
  name: "navigatorNormalized",
  lookup() {
    if (typeof navigator === "undefined") return DEFAULT_LANG;
    const langs = (navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language]) as string[];
    for (const raw of langs) {
      const normalized = normalizeLang(raw);
      if (normalized) return normalized;
    }
    return DEFAULT_LANG;
  },
};
