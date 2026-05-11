import type { Deck, Theme } from "@shared/dsl";

// 通用 4 页样板：用于风格预览（注入不同 theme）
export function buildSampleDeckWithTheme(theme: Theme, brandName: string = "Northstar"): Deck {
  return {
    version: "1.0",
    meta: { title: `${brandName} 风格预览`, aspectRatio: "16:9" },
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
          { type: "badge", text: "新品发布", tone: "accent" },
          { type: "heading", level: 1, text: brandName },
          { type: "text", text: "重新定义日常工作的开始。" },
          {
            type: "button",
            label: "了解更多",
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
            title: "传统方式",
            children: [{ type: "list", ordered: false, items: ["手工繁琐", "信息分散", "难以协作"] }],
          },
          {
            type: "card",
            column: "right",
            title: "我们的方式",
            children: [{ type: "list", ordered: false, items: ["自动同步", "一处可见", "实时协作"] }],
          },
        ],
      },
      {
        id: "p-3",
        layout: "quote",
        transition: "fade",
        blocks: [
          { type: "heading", level: 2, text: `"用过 ${brandName} 后回不去了。"` },
          { type: "text", text: "— 一位早期用户" },
        ],
      },
      {
        id: "p-4",
        layout: "cta",
        transition: "fade",
        blocks: [
          { type: "heading", level: 2, text: "立即开始" },
          { type: "text", text: "30 天免费试用，无需信用卡。" },
          {
            type: "button",
            label: "免费试用",
            variant: "primary",
            onClick: { action: "openLink", url: "https://example.com" },
          },
        ],
      },
    ],
  };
}
