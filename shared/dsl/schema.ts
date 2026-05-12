import { z } from "zod";
import { LAYOUTS } from "./layouts";
import { ActionSchema } from "./actions";
import { HXS_ICON_NAMES } from "./icons";

// 主题
const ColorsSchema = z.object({
  bg: z.string(),
  fg: z.string(),
  primary: z.string(),
  accent: z.string().optional(),
  muted: z.string().optional(),
  // 命名语义色（一页内同时出现 4+ 颜色场景使用）
  // 未提供时主题层注入合理默认（红 / 绿 / 橙 / 蓝）
  danger: z.string().optional(),
  success: z.string().optional(),
  warning: z.string().optional(),
  info: z.string().optional(),
});

const FontsSchema = z.object({
  heading: z.string(),
  body: z.string(),
});

const ThemeSchema = z.object({
  mode: z.enum(["light", "dark"]).default("light"),
  colors: ColorsSchema,
  fonts: FontsSchema,
  radius: z.enum(["none", "sm", "md", "lg", "xl"]).default("md"),
});

// 转场
const TransitionSchema = z.enum([
  "none",
  "fade",
  "slide-left",
  "slide-up",
  "zoom",
  "magic",
]);

// 图片 URL：允许 http(s) 链接或 data:image/ base64（用户本地上传）
const ImageUrl = z.string().refine(
  (s) => /^https?:\/\//.test(s) || /^data:image\//.test(s),
  { message: "图片地址应为 http(s) URL 或 data:image/ base64" }
);

// 背景
const BackgroundSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("solid"), color: z.string() }),
  z.object({
    type: z.literal("gradient"),
    from: z.string(),
    to: z.string(),
    angle: z.number().optional(),
  }),
  z.object({ type: z.literal("image"), url: ImageUrl, opacity: z.number().min(0).max(1).optional() }),
]);

// 共用
const ButtonVariant = z.enum(["primary", "secondary", "ghost", "outline"]);
// two-column 用 left/right/center；three/four/five-column 用 col1-col5；center 在所有多栏布局中作全宽头部
const Column = z.enum(["left", "right", "center", "col1", "col2", "col3", "col4", "col5"]);

// 完整 tone palette：扩展 badge / icon / list-item / table-cell / stat / flow-step / chrome / 富文本 segments 都用这套
// fg/current 仅给 icon 用（fg = 取主文字色；current = 继承父级 currentColor）
const ToneFull = z.enum([
  "primary", "accent", "muted", "fg",
  "danger", "success", "warning", "info",
  "current",
]);
// 不含 current 的 tone（其他 block 用，current 仅 icon）
const Tone = z.enum([
  "primary", "accent", "muted", "fg",
  "danger", "success", "warning", "info",
]);

// 富文本 segments：标题/正文中支持局部染色或加粗
// LLM 可以混用：text 字段可以是字符串（旧路径，最常用）或 segment 数组（需要局部染色时）
// gradient = 主→accent 渐变（对应 hxs-text-gradient）
const RichTextSegmentSchema = z.object({
  text: z.string(),
  tone: z.enum([
    "fg", "primary", "accent", "muted",
    "danger", "success", "warning", "info",
    "gradient",
  ]).optional(),
  bold: z.boolean().optional(),
});

const RichTextSchema = z.union([
  z.string(),
  z.array(RichTextSegmentSchema).min(1),
]);

// magicId：相同 id 的 block 在两页之间做 Magic Move（飞行）过渡
const MagicId = z.string().optional();

// utilities：白名单视觉变体类（如 hxs-frost / hxs-bg-grid 等），运行时按白名单过滤
// 详见 ./utilities.ts。最多 8 个，避免组合爆炸
const UtilityList = z.array(z.string()).max(8).optional();

// position：仅 slide.layout === "free" 时生效，按容器百分比定位
// xPct/yPct 是 block 左上角相对 slide 容器的百分比；widthPct/heightPct 可选（不设则按内容自适应）
const PositionSchema = z.object({
  xPct: z.number().min(-20).max(120),
  yPct: z.number().min(-20).max(120),
  widthPct: z.number().min(0).max(120).optional(),
  heightPct: z.number().min(0).max(120).optional(),
}).optional();

// block 通用：discriminated union
// text 字段支持字符串（最常用）或 RichText 数组（需要局部染色 / 局部加粗时）
const TextBlock = z.object({
  type: z.literal("text"),
  text: RichTextSchema,
  align: z.enum(["left", "center", "right"]).optional(),
  column: Column.optional(),
  magicId: MagicId,
  utilities: UtilityList,
  position: PositionSchema,
});

const HeadingBlock = z.object({
  type: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  text: RichTextSchema,
  align: z.enum(["left", "center", "right"]).optional(),
  column: Column.optional(),
  magicId: MagicId,
  utilities: UtilityList,
  position: PositionSchema,
});

const ImageBlock = z.object({
  type: z.literal("image"),
  url: ImageUrl,
  alt: z.string().optional(),
  fit: z.enum(["contain", "cover"]).default("cover"),
  // 像素尺寸：未设则按容器自适应（width 100%、height auto）。设了就强制使用
  widthPx: z.number().int().min(16).max(4096).optional(),
  heightPx: z.number().int().min(16).max(4096).optional(),
  column: Column.optional(),
  magicId: MagicId,
  utilities: UtilityList,
  position: PositionSchema,
});

const ButtonBlock = z.object({
  type: z.literal("button"),
  label: z.string(),
  variant: ButtonVariant.default("primary"),
  onClick: ActionSchema,
  column: Column.optional(),
  magicId: MagicId,
  utilities: UtilityList,
  position: PositionSchema,
});

// items 升级：单条可以是字符串（旧路径），也可以是对象（per-item tone / icon）
// 多个对象项搭配不同 tone 形成"黄/青/紫/粉 4 色循环编号"效果（小红书风）
const ListItemSchema = z.union([
  z.string(),
  z.object({
    text: z.string(),
    tone: Tone.optional(),
    iconName: z.enum(HXS_ICON_NAMES).optional(),
  }),
]);

const ListBlock = z.object({
  type: z.literal("list"),
  items: z.array(ListItemSchema).min(1),
  ordered: z.boolean().default(false),
  column: Column.optional(),
  magicId: MagicId,
  utilities: UtilityList,
  position: PositionSchema,
});

const BadgeBlock = z.object({
  type: z.literal("badge"),
  text: z.string(),
  tone: Tone.default("primary"),
  column: Column.optional(),
  magicId: MagicId,
  utilities: UtilityList,
  position: PositionSchema,
});

const IframeBlock = z.object({
  type: z.literal("iframe"),
  url: z.string().url(),
  height: z.number().int().positive().optional(),
  column: Column.optional(),
  magicId: MagicId,
  utilities: UtilityList,
  position: PositionSchema,
});

// 图标：仅白名单 lucide 名可用；size 是像素值；tone 同 badge 用 theme 颜色变量
const IconBlock = z.object({
  type: z.literal("icon"),
  name: z.enum(HXS_ICON_NAMES),
  size: z.number().int().min(8).max(256).optional(),  // 默认 32
  tone: ToneFull.default("primary"),
  strokeWidth: z.number().min(0.5).max(3).optional(), // lucide stroke-width，默认 2
  align: z.enum(["left", "center", "right"]).optional(),
  column: Column.optional(),
  magicId: MagicId,
  utilities: UtilityList,
  position: PositionSchema,
});

// 统计大数字块：value 是大字号渲染的数字 / 短字符串，label 是下方小字注释
// trend 可选，渲染向上 / 向下 / 横线箭头（"+12%" 向上 / "-5%" 向下 / "持平" 横线）
const StatBlock = z.object({
  type: z.literal("stat"),
  value: z.string().min(1),
  label: z.string().optional(),
  tone: Tone.default("primary"),
  trend: z.enum(["up", "down", "flat"]).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  column: Column.optional(),
  magicId: MagicId,
  utilities: UtilityList,
  position: PositionSchema,
});

// 横排流程块：steps 是 2-6 个步骤；每步可独立染色；arrow 决定连接符
const FlowStepSchema = z.object({
  label: z.string().min(1),
  tone: Tone.optional(),
});
const FlowBlock = z.object({
  type: z.literal("flow"),
  steps: z.array(FlowStepSchema).min(2).max(6),
  arrow: z.enum(["arrow", "chevron", "plus"]).default("arrow"),
  align: z.enum(["left", "center", "right"]).optional(),
  column: Column.optional(),
  magicId: MagicId,
  utilities: UtilityList,
  position: PositionSchema,
});

// 表格：数据对比专用。单元格可以是字符串（旧路径），也可以是对象（tone 染色 + bold）
// highlightCol 指定要强调的列（0-based），整列 primary 描边强调
const TableCellSchema = z.union([
  z.string(),
  z.object({
    text: z.string(),
    tone: Tone.optional(),
    bold: z.boolean().optional(),
  }),
]);
const TableBlock = z.object({
  type: z.literal("table"),
  headers: z.array(z.string()).min(1).max(8),
  rows: z.array(z.array(TableCellSchema).min(1)).min(1).max(20),
  highlightCol: z.number().int().min(0).optional(),
  column: Column.optional(),
  magicId: MagicId,
  utilities: UtilityList,
  position: PositionSchema,
});

// macOS / 浏览器窗口装饰条：模拟应用截图、教程长图常用
// mac = 红黄绿三个 12px 圆点；browser = 浏览器地址栏样式
const ChromeBlock = z.object({
  type: z.literal("chrome"),
  variant: z.enum(["mac", "browser"]).default("mac"),
  title: z.string().optional(),
  column: Column.optional(),
  magicId: MagicId,
  utilities: UtilityList,
  position: PositionSchema,
});

// CardBlock 可嵌套上述基础块（不含 card / modal / tab / form 自身，避免无限递归）
// stat / flow / table / chrome 均为叶子块，允许嵌入 —— 卡片里放 KPI、迷你流程、对比表是常见诉求
const CardChildBlock = z.discriminatedUnion("type", [
  TextBlock,
  HeadingBlock,
  ImageBlock,
  ButtonBlock,
  ListBlock,
  BadgeBlock,
  IframeBlock,
  IconBlock,
  StatBlock,
  FlowBlock,
  TableBlock,
  ChromeBlock,
]);

const CardBlock = z.object({
  type: z.literal("card"),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  children: z.array(CardChildBlock).default([]),
  column: Column.optional(),
  magicId: MagicId,
  utilities: UtilityList,
  position: PositionSchema,
});

// 表单字段：7 种字段类型
export const FORM_FIELD_TYPES = [
  "text",
  "email",
  "textarea",
  "select",
  "checkbox",
  "number",
  "radio",
] as const;

const FormFieldOption = z.object({
  value: z.string(),
  label: z.string(),
});

const FormFieldSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "字段名仅允许字母数字下划线，且必须以字母开头"),
  label: z.string().min(1),
  type: z.enum(FORM_FIELD_TYPES),
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
  // 仅 select / radio 用
  options: z.array(FormFieldOption).optional(),
  // 仅 number 用
  min: z.number().optional(),
  max: z.number().optional(),
  // 仅 textarea 用
  rows: z.number().int().min(1).max(20).optional(),
});

export type FormField = z.infer<typeof FormFieldSchema>;

const FormSubmitBehavior = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("next") }),
  z.object({ type: z.literal("jumpTo"), slideId: z.string() }),
]);

const FormBlock = z.object({
  type: z.literal("form"),
  formId: z.string().min(1),                   // 同一 deck 内多个 form 区分；CSV 导出按此分组
  fields: z.array(FormFieldSchema).min(1).max(10),
  submitLabel: z.string().default("提交"),
  successMessage: z.string().default("感谢，已提交。"),
  onSubmit: FormSubmitBehavior.optional(),
  column: Column.optional(),
  magicId: MagicId,
  utilities: UtilityList,
  position: PositionSchema,
});

// modal 与 tab 的子块：基础 8 种 + form + 叶子型容器（stat/flow/table/chrome）
// 不允许 modal/tab/card 自身，避免递归
const ContainerChildBlock = z.discriminatedUnion("type", [
  TextBlock,
  HeadingBlock,
  ImageBlock,
  ButtonBlock,
  ListBlock,
  BadgeBlock,
  IframeBlock,
  IconBlock,
  FormBlock,
  StatBlock,
  FlowBlock,
  TableBlock,
  ChromeBlock,
]);

const ModalBlock = z.object({
  type: z.literal("modal"),
  triggerLabel: z.string().min(1),
  triggerVariant: ButtonVariant.default("primary"),
  title: z.string().optional(),
  children: z.array(ContainerChildBlock).default([]),
  column: Column.optional(),
  magicId: MagicId,
  utilities: UtilityList,
  position: PositionSchema,
});

const TabSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  blocks: z.array(ContainerChildBlock).default([]),
});

export type Tab = z.infer<typeof TabSchema>;

const TabBlock = z.object({
  type: z.literal("tab"),
  tabs: z.array(TabSchema).min(1).max(6),
  defaultTabId: z.string().optional(),
  column: Column.optional(),
  magicId: MagicId,
  utilities: UtilityList,
  position: PositionSchema,
});

export const BlockSchema = z.discriminatedUnion("type", [
  TextBlock,
  HeadingBlock,
  ImageBlock,
  ButtonBlock,
  ListBlock,
  BadgeBlock,
  IframeBlock,
  IconBlock,
  CardBlock,
  FormBlock,
  ModalBlock,
  TabBlock,
  StatBlock,
  FlowBlock,
  TableBlock,
  ChromeBlock,
]);

export type Block = z.infer<typeof BlockSchema>;

// Slide
export const SlideSchema = z.object({
  id: z.string().min(1),
  layout: z.enum(LAYOUTS),
  transition: TransitionSchema.default("fade"),
  // 转场时长，毫秒。不设则用 transition 类型自带默认（fade/slide 400ms, magic 250ms, zoom 450ms）
  transitionDuration: z.number().int().min(0).max(3000).optional(),
  background: BackgroundSchema.optional(),
  notes: z.string().optional(),
  // 视觉变体（如底纹 hxs-bg-grid / hxs-bg-dots，建议 slide 级别使用）
  utilities: z.array(z.string()).max(8).optional(),
  // 单页是否显示右上角页码 N/M（覆盖 deck meta.showPageNumbers）；undefined 时跟随 meta 设置
  showPageNumber: z.boolean().optional(),
  // 引用 Pattern 库 id：渲染前 pattern 作为 base，slide 自身已设字段（layout/blocks/transition/...）作 override
  // 命中不到时静默回退到 slide 自身（不报错），保证 pattern 库被删除时旧 deck 仍能渲染
  patternRef: z.string().optional(),
  // 编辑器允许任意数量内容块（去掉硬性上限）；生成侧由 system prompt 给「建议密度」约束模型自我克制
  blocks: z.array(BlockSchema),
});

export type Slide = z.infer<typeof SlideSchema>;

// Deck 顶层
export const DeckSchema = z.object({
  version: z.literal("1.0"),
  meta: z.object({
    title: z.string(),
    description: z.string().optional(),
    author: z.string().optional(),
    // auto = 自适应 Web 全屏（默认，推荐）；16:9 / 4:3 = 固定 PPT 比例（仅用于离线投影/打印场景）
    aspectRatio: z.enum(["auto", "16:9", "4:3"]).default("auto"),
    // 全局开启每页右上角页码 N/M。可被单页 slide.showPageNumber 覆盖
    showPageNumbers: z.boolean().optional(),
  }),
  theme: ThemeSchema,
  variables: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  slides: z.array(SlideSchema).min(1),
});

export type Deck = z.infer<typeof DeckSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type Background = z.infer<typeof BackgroundSchema>;
export type Transition = z.infer<typeof TransitionSchema>;

// 默认主题工具
export const DEFAULT_THEME: Theme = {
  mode: "light",
  colors: {
    bg: "#ffffff",
    fg: "#0f172a",
    primary: "#2563eb",
    accent: "#f59e0b",
    muted: "#64748b",
    danger: "#ef4444",
    success: "#22c55e",
    warning: "#f97316",
    info: "#0ea5e9",
  },
  fonts: { heading: "Inter", body: "Inter" },
  radius: "md",
};

// 工具：判断 RichText 是否为字符串
export function isRichTextString(v: unknown): v is string {
  return typeof v === "string";
}
export type RichText = string | Array<{ text: string; tone?: string; bold?: boolean }>;
