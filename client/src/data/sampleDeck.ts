import type { Deck, Theme } from "@shared/dsl";
import i18n from "@/i18n";

// 通用 4 页样板：用于风格预览（注入不同 theme）
// 文案走 i18n（dialog:stylePreview.sampleDeck.*），随 UI 语言切换
// 用 i18n 单例 t 函数：sampleDeck 不在 React 树内，无法用 useTranslation
export function buildSampleDeckWithTheme(theme: Theme, brandName: string = "Northstar"): Deck {
  const t = (key: string, opts?: Record<string, unknown>): string =>
    i18n.t(`stylePreview.sampleDeck.${key}`, { ns: "dialog", ...opts }) as string;
  const oldWayItems = i18n.t("stylePreview.sampleDeck.oldWayItems", {
    ns: "dialog",
    returnObjects: true,
  }) as string[];
  const newWayItems = i18n.t("stylePreview.sampleDeck.newWayItems", {
    ns: "dialog",
    returnObjects: true,
  }) as string[];
  return {
    version: "1.0",
    meta: { title: t("previewTitle", { brand: brandName }), aspectRatio: "16:9" },
    theme,
    variables: {},
    slides: [
      {
        id: "p-1",
        layout: "hero",
        transition: "fade",
        background:
          theme.mode === "dark"
            ? { type: "gradient", from: theme.colors.bg, to: theme.colors.primary, angle: 135 }
            : undefined,
        blocks: [
          { type: "badge", text: t("newProduct"), tone: "accent" },
          { type: "heading", level: 1, text: brandName },
          { type: "text", text: t("heroSubtitle") },
          {
            type: "button",
            label: t("ctaLearnMore"),
            variant: "primary",
            onClick: { action: "next" },
          },
        ],
      },
      {
        id: "p-2",
        layout: "two-column",
        transition: "fade",
        blocks: [
          {
            type: "card",
            column: "left",
            title: t("oldWayTitle"),
            children: [{ type: "list", ordered: false, items: oldWayItems }],
          },
          {
            type: "card",
            column: "right",
            title: t("newWayTitle"),
            children: [{ type: "list", ordered: false, items: newWayItems }],
          },
        ],
      },
      {
        id: "p-3",
        layout: "quote",
        transition: "fade",
        blocks: [
          { type: "heading", level: 2, text: t("quote", { brand: brandName }) },
          { type: "text", text: t("quoteAttribution") },
        ],
      },
      {
        id: "p-4",
        layout: "cta",
        transition: "fade",
        blocks: [
          { type: "heading", level: 2, text: t("ctaTitle") },
          { type: "text", text: t("ctaSubtitle") },
          {
            type: "button",
            label: t("ctaButton"),
            variant: "primary",
            onClick: { action: "openLink", url: "https://example.com" },
          },
        ],
      },
    ],
  };
}
