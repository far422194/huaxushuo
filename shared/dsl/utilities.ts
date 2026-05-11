// HXS Utility 白名单：LLM 与编辑器都从此处取，运行时按此过滤。
// 命名前缀 hxs- 防与用户/Tailwind 冲突；CSS 实现在 client/src/renderer/utilities.css。

export interface UtilityDef {
  name: string;          // class 名（带 hxs- 前缀）
  label: string;         // 编辑器显示用标签
  desc: string;          // 用途/示例（注入给 LLM 的描述）
  category:
    | "surface"          // 毛玻璃 / 半透明
    | "shadow"           // 阴影
    | "border"           // 边框
    | "shape"            // 圆角
    | "pattern"          // 底纹（slide 级首选）
    | "text"             // 文字效果
    | "spacing"          // 间距
    | "motion"           // 动画
    | "transform";       // 旋转/倾斜
}

export const HXS_UTILITIES: UtilityDef[] = [
  // 表面（4）
  { name: "hxs-frost",        label: "毛玻璃",     desc: "毛玻璃卡片：backdrop-blur 半透明白底，需放在有内容/渐变背景上才有效果",  category: "surface" },
  { name: "hxs-frost-dark",   label: "毛玻璃-深色", desc: "毛玻璃深色变体：用于暗色场景或彩色底",                                      category: "surface" },
  { name: "hxs-frost-strong", label: "强毛玻璃",   desc: "更强的模糊（24px）",                                                         category: "surface" },
  { name: "hxs-translucent",  label: "半透明",     desc: "仅半透明白底，无 blur（兼容老环境）",                                        category: "surface" },

  // 阴影（5）
  { name: "hxs-shadow-none",  label: "无阴影",     desc: "去掉阴影",                                                                   category: "shadow" },
  { name: "hxs-shadow-sm",    label: "小阴影",     desc: "轻微阴影",                                                                   category: "shadow" },
  { name: "hxs-shadow-md",    label: "中阴影",     desc: "标准阴影",                                                                   category: "shadow" },
  { name: "hxs-shadow-lg",    label: "大阴影",     desc: "厚重阴影",                                                                   category: "shadow" },
  { name: "hxs-shadow-glow",  label: "光晕阴影",   desc: "主色光晕，适合 cta / hero",                                                  category: "shadow" },

  // 边框（3 + 7 单侧高亮条）
  { name: "hxs-border",       label: "细描边",     desc: "1px primary 描边",                                                           category: "border" },
  { name: "hxs-border-thick", label: "粗描边",     desc: "2px primary 描边，适合标记重点卡片",                                          category: "border" },
  { name: "hxs-no-border",    label: "无边框",     desc: "去掉默认边框",                                                               category: "border" },
  // 卡片左侧 5px 高亮竖条（Notion / 小红书 风格的关键），多卡按 tone 不同形成色彩节奏
  { name: "hxs-bar-l-primary", label: "左竖条-主色",   desc: "卡片左侧 5px primary 高亮条 + 微 inset 阴影", category: "border" },
  { name: "hxs-bar-l-accent",  label: "左竖条-强调色", desc: "卡片左侧 5px accent 高亮条",                  category: "border" },
  { name: "hxs-bar-l-success", label: "左竖条-成功",   desc: "卡片左侧 5px success（绿）高亮条",            category: "border" },
  { name: "hxs-bar-l-warning", label: "左竖条-警示",   desc: "卡片左侧 5px warning（橘）高亮条",            category: "border" },
  { name: "hxs-bar-l-danger",  label: "左竖条-危险",   desc: "卡片左侧 5px danger（红）高亮条",             category: "border" },
  { name: "hxs-bar-l-info",    label: "左竖条-信息",   desc: "卡片左侧 5px info（青蓝）高亮条",             category: "border" },
  { name: "hxs-bar-l-rainbow", label: "左竖条-彩虹",   desc: "卡片左侧渐变彩虹高亮条（仅 hero 等少量页用）", category: "border" },

  // 形状（2）
  { name: "hxs-rounded-full", label: "完全圆角",   desc: "圆形（适合徽章/小卡片）",                                                    category: "shape" },
  { name: "hxs-rounded-sharp",label: "锐利无圆角", desc: "完全直角，建筑感强",                                                         category: "shape" },

  // 底纹（5，slide 级首选）
  { name: "hxs-bg-grid",      label: "网格底纹",   desc: "网格底纹：1px 等距方格淡色，适合 slide 级背景，技术感",                     category: "pattern" },
  { name: "hxs-bg-dots",      label: "点阵底纹",   desc: "点阵底纹：均匀小圆点，适合 slide 级背景",                                    category: "pattern" },
  { name: "hxs-bg-diagonal",  label: "斜线底纹",   desc: "斜线底纹：45 度细斜线，适合区分章节",                                        category: "pattern" },
  { name: "hxs-bg-noise",     label: "噪点底纹",   desc: "噪点质感：SVG 噪点叠加，颗粒纸感",                                           category: "pattern" },
  { name: "hxs-bg-radial",    label: "径向光斑",   desc: "径向光斑：从中心向外的主色光晕，适合 hero",                                  category: "pattern" },
  { name: "hxs-bg-corner-glow", label: "角落光晕", desc: "右上角辐射的大块柔光（Gamma 风格），适合首页/章节页给画面呼吸感",            category: "pattern" },

  // 文字（3）
  { name: "hxs-text-gradient",label: "渐变文字",   desc: "标题文字主→强调色渐变，仅 heading/text 用",                                  category: "text" },
  { name: "hxs-text-glow",    label: "文字发光",   desc: "文字主色发光",                                                               category: "text" },
  { name: "hxs-tracking-wide",label: "字距加宽",   desc: "字距加宽（高级感）",                                                         category: "text" },

  // 间距（2）
  { name: "hxs-pad-tight",    label: "紧凑内边距", desc: "卡片/容器内边距收紧",                                                        category: "spacing" },
  { name: "hxs-pad-loose",    label: "宽松内边距", desc: "卡片/容器内边距加大",                                                        category: "spacing" },

  // 动画（7）
  { name: "hxs-animate-pulse",label: "脉冲动画",   desc: "缓慢脉冲（透明度），吸引注意",                                               category: "motion" },
  { name: "hxs-animate-float",label: "浮动动画",   desc: "上下轻微浮动",                                                               category: "motion" },
  { name: "hxs-hover-lift",   label: "悬浮上浮",   desc: "鼠标悬停时上浮 + 阴影增强（与 rotate 类兼容）",                              category: "motion" },
  { name: "hxs-animate-shimmer",     label: "高光扫过",   desc: "高光条带从左向右扫过元素表面，适合按钮/徽章",                         category: "motion" },
  { name: "hxs-animate-glow-pulse",  label: "光晕呼吸",   desc: "主色光晕呼吸式扩散，适合 CTA 按钮强调",                               category: "motion" },
  { name: "hxs-animate-bounce-soft", label: "轻弹一次",   desc: "进场轻微弹跳一次（不循环），适合首次入场",                            category: "motion" },
  { name: "hxs-animate-gradient-flow", label: "渐变流动文字", desc: "主→accent→主 渐变在文字中循环流动（须用于 heading/text）",        category: "text" },

  // 形变（3）
  { name: "hxs-rotate-1",     label: "微倾斜",     desc: "倾斜 1 度（轻微的趣味性）",                                                  category: "transform" },
  { name: "hxs-rotate-neg-1", label: "反向微倾斜", desc: "倾斜 -1 度",                                                                 category: "transform" },
  { name: "hxs-tilted",       label: "名片倾斜",   desc: "倾斜 -3 度，适合便签/名片质感",                                              category: "transform" },
];

export const HXS_UTILITY_NAMES: Set<string> = new Set(HXS_UTILITIES.map((u) => u.name));

// 按 category 分组，编辑器 UI 用
export function groupUtilitiesByCategory(): Record<string, UtilityDef[]> {
  const out: Record<string, UtilityDef[]> = {};
  for (const u of HXS_UTILITIES) {
    (out[u.category] ??= []).push(u);
  }
  return out;
}

export const CATEGORY_LABELS: Record<UtilityDef["category"], string> = {
  surface: "表面 / 毛玻璃",
  shadow: "阴影",
  border: "边框",
  shape: "形状",
  pattern: "底纹（建议放 slide）",
  text: "文字效果",
  spacing: "间距",
  motion: "动画",
  transform: "旋转 / 倾斜",
};

// 过滤：仅返回白名单内的有效 utility 名（运行时与渲染器都用）
export function filterUtilities(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (s): s is string => typeof s === "string" && HXS_UTILITY_NAMES.has(s)
  );
}

// 拆分 utilities：底纹/背景类 vs 其他。
// 底纹类要单独渲染到 overlay 层（避免被 slide.background 的 inline style 覆盖）
export function isPatternUtility(name: string): boolean {
  const u = HXS_UTILITIES.find((x) => x.name === name);
  return u?.category === "pattern";
}

export function splitUtilities(utilities: string[]): { pattern: string[]; other: string[] } {
  const pattern: string[] = [];
  const other: string[] = [];
  for (const u of utilities) {
    if (isPatternUtility(u)) pattern.push(u);
    else other.push(u);
  }
  return { pattern, other };
}

// 文字效果类：必须应用在内层文字元素上才能正确 clip:text 渲染渐变
// 应用在外层容器会破坏 background / 让所有子元素文字消失
export function isTextUtility(name: string): boolean {
  const u = HXS_UTILITIES.find((x) => x.name === name);
  return u?.category === "text";
}

// 取 utility 的分类（运行时查询）；未知 utility 返回 undefined
export function getUtilityCategory(name: string): UtilityDef["category"] | undefined {
  return HXS_UTILITIES.find((x) => x.name === name)?.category;
}

export function hasUtilityCategory(utilities: string[], category: UtilityDef["category"]): boolean {
  return utilities.some((u) => getUtilityCategory(u) === category);
}

export function splitTextUtilities(utilities: string[]): { text: string[]; nonText: string[] } {
  const text: string[] = [];
  const nonText: string[] = [];
  for (const u of utilities) {
    if (isTextUtility(u)) text.push(u);
    else nonText.push(u);
  }
  return { text, nonText };
}
