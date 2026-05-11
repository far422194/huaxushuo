export type Lang = "zh-CN" | "en";

export const SUPPORTED_LANGS: Lang[] = ["zh-CN", "en"];

export const LANG_LABEL: Record<Lang, string> = {
  "zh-CN": "简体中文",
  en: "English",
};

export const DEFAULT_LANG: Lang = "zh-CN";

export const I18N_NAMESPACES = [
  "common",
  "home",
  "editor",
  "dialog",
  "chat",
  "error",
  "prompt-meta",
] as const;

export type I18nNamespace = (typeof I18N_NAMESPACES)[number];

export function normalizeLang(raw: string | undefined | null): Lang {
  if (!raw) return DEFAULT_LANG;
  if (raw.toLowerCase().startsWith("zh")) return "zh-CN";
  if (raw.toLowerCase().startsWith("en")) return "en";
  return DEFAULT_LANG;
}
