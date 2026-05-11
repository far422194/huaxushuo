// 11 种布局：7 种自动排版 + 4 种多栏 + 自由布局
export const LAYOUTS = [
  "hero",
  "title-content",
  "two-column",
  "three-column",
  "four-column",
  "five-column",
  "bullet-list",
  "quote",
  "cta",
  "embed",
  "free",
] as const;

export type Layout = (typeof LAYOUTS)[number];

export const LAYOUT_LABELS: Record<Layout, string> = {
  "hero": "封面",
  "title-content": "标题正文",
  "two-column": "两栏",
  "three-column": "三栏",
  "four-column": "四栏",
  "five-column": "五栏",
  "bullet-list": "要点列表",
  "quote": "引用",
  "cta": "行动号召",
  "embed": "嵌入页",
  "free": "自由布局",
};
