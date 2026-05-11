// IconBlock 白名单：仅这些 lucide-react 图标名可用，避免 LLM 用偏门图标导致渲染失败。
// 命名严格用 lucide-react 的 PascalCase 导出名（如 ArrowRight 而非 arrow-right）。
// 共 71 个，覆盖导航 / 状态 / 通讯 / 媒体 / UI / 业务 / 数据 / 安全 / 时间 / 用户 / 商业 / 装饰。

export const HXS_ICON_NAMES = [
  // 导航箭头（10）
  "ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown",
  "ChevronRight", "ChevronLeft", "ChevronUp", "ChevronDown",
  "ExternalLink", "Link",
  // 状态反馈（5）
  "Check", "X", "AlertCircle", "Info", "AlertTriangle",
  // 通讯（4）
  "Mail", "Phone", "MessageCircle", "Send",
  // 媒体（7）
  "Play", "Pause", "Image", "Video", "Music", "MonitorPlay", "Presentation",
  // UI 工具（12）
  "Search", "Filter", "Settings", "Menu", "Plus",
  "Layers", "LayoutTemplate", "Palette", "RefreshCw", "SlidersHorizontal",
  "FileText", "MousePointerClick",
  // 业务亮点（8）
  "Star", "Heart", "ThumbsUp", "Award", "Crown", "Zap", "Flame", "Box",
  // 数据图表（4）
  "BarChart", "TrendingUp", "Activity", "Target",
  // 安全工具（4）
  "Lock", "Shield", "Key", "ShieldCheck",
  // 时间位置（4）
  "Clock", "Calendar", "MapPin", "Globe",
  // 用户（3）
  "User", "Users", "UserPlus",
  // 商业（3）
  "ShoppingCart", "CreditCard", "DollarSign",
  // 装饰强调（7）
  "Sparkles", "Wand2", "Lightbulb", "Rocket", "Compass", "Eye", "CheckCircle",
] as const;

export type HxsIconName = (typeof HXS_ICON_NAMES)[number];

export const HXS_ICON_NAMES_SET: Set<string> = new Set(HXS_ICON_NAMES);

export function isValidIconName(name: unknown): name is HxsIconName {
  return typeof name === "string" && HXS_ICON_NAMES_SET.has(name);
}
