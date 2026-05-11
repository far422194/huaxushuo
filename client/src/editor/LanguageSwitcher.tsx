import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { setLanguage, getCurrentLang } from "@/i18n";
import { LANG_LABEL, SUPPORTED_LANGS, type Lang } from "@/i18n/types";

interface LanguageSwitcherProps {
  /** compact=true 时隐藏标题与说明，仅显示段控件，适合放进顶栏 */
  compact?: boolean;
}

const SHORT_LABEL: Record<Lang, string> = {
  "zh-CN": "简",
  en: "EN",
};

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { t } = useTranslation("dialog");
  const { t: tCommon } = useTranslation("common");
  const current = getCurrentLang();

  const handleSelect = async (lang: Lang) => {
    if (lang === current) return;
    await setLanguage(lang);
  };

  if (compact) {
    return (
      <div
        className="inline-flex items-center rounded-md border border-slate-200 overflow-hidden"
        role="group"
        aria-label={tCommon("language.label")}
      >
        <span className="px-2 py-1 text-slate-400" aria-hidden>
          <Languages size={13} />
        </span>
        {SUPPORTED_LANGS.map((lang) => {
          const active = lang === current;
          return (
            <button
              key={lang}
              type="button"
              onClick={() => handleSelect(lang)}
              title={LANG_LABEL[lang]}
              className={
                "px-2 py-1 text-xs transition-colors border-l border-slate-200 " +
                (active
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50")
              }
              aria-pressed={active}
            >
              {SHORT_LABEL[lang]}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-slate-700">{t("provider.language")}</div>
      <div className="inline-flex rounded-md border border-slate-200 overflow-hidden">
        {SUPPORTED_LANGS.map((lang) => {
          const active = lang === current;
          return (
            <button
              key={lang}
              type="button"
              onClick={() => handleSelect(lang)}
              className={
                "px-3 py-1.5 text-sm transition-colors " +
                (active
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50")
              }
              aria-pressed={active}
            >
              {LANG_LABEL[lang]}
            </button>
          );
        })}
      </div>
      <div className="text-xs text-slate-500">{t("provider.languageHint")}</div>
    </div>
  );
}
