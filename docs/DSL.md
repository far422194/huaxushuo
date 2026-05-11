# DSL 设计文档

> 权威实现：[`shared/dsl/schema.ts`](../shared/dsl/schema.ts)（Zod schema）
> 当前版本：`1.0`
> 最后更新：2026-05-09

本文档与 schema.ts 一一对应；任何字段歧义以代码为准，本文档跟踪同步。

## 1. 顶层结构

```ts
type Deck = {
  version: "1.0";
  meta: {
    title: string;
    description?: string;
    author?: string;
    // auto = 自适应 Web 全屏（默认推荐，可滚动）；16:9 / 4:3 = 固定 PPT 比例
    aspectRatio: "auto" | "16:9" | "4:3";
    // 全局开启每页右上角页码 N/M，可被单页 slide.showPageNumber 覆盖
    showPageNumbers?: boolean;
  };
  theme: Theme;
  variables: Record<string, string | number | boolean>;
  slides: Slide[];   // ≥ 1，无硬上限
};
```

页数无硬性上限（编辑器允许任意数量）；system prompt 给「建议密度」让模型自我克制（默认每页 4-6、紧凑模式 ≤ 4）。

## 2. 主题（Theme）

```ts
type Theme = {
  mode: "light" | "dark";
  colors: {
    bg: string;          // 必填，hex
    fg: string;          // 必填，hex
    primary: string;     // 必填，hex
    accent?: string;     // 可选，未提供时回落到 primary
    muted?: string;      // 可选，默认 #94a3b8

    // 命名语义色（一页同时出现 4+ 颜色场景使用），未提供时主题层注入合理默认
    danger?: string;     // 默认 #ef4444（红）
    success?: string;    // 默认 #22c55e（绿）
    warning?: string;    // 默认 #f97316（橘）
    info?: string;       // 默认 #0ea5e9（蓝）
  };
  fonts: { heading: string; body: string };
  radius: "none" | "sm" | "md" | "lg" | "xl";  // 默认 "md"
};
```

**渲染期注入的 CSS 变量**（`client/src/renderer/theme.ts`）：
`--hxs-bg` / `--hxs-fg` / `--hxs-primary` / `--hxs-accent` / `--hxs-muted` / `--hxs-danger` / `--hxs-success` / `--hxs-warning` / `--hxs-info` / `--hxs-radius` / `--hxs-font-heading` / `--hxs-font-body`。所有 utilities 与 block 组件都从这套 CSS 变量取色，避免硬编码裸 hex。

**对比度兜底**：`processToolCall` 在 LLM 工具调用落地后自动跑 `normalizeThemeContrast`——dark 模式下 fg 与 bg 对比 < 3:1 时替换为安全色（#f1f5f9）；muted 与 bg 对比 < 2.5:1 时替换。仅 LLM 路径生效，编辑器手改主题色不经此处。

## 3. Slide

```ts
type Slide = {
  id: string;                // 唯一，建议 nanoid；为空字符串时客户端自动补
  layout: Layout;
  transition: Transition;    // 默认 "fade"
  transitionDuration?: number; // 0–3000ms，未设则用 transition 类型默认（fade/slide 400ms, magic 250ms, zoom 450ms）
  background?: Background;
  notes?: string;            // 演讲者备注，渲染期不显示
  utilities?: string[];      // 视觉变体白名单（最多 8 个），运行时按白名单过滤
  showPageNumber?: boolean;  // 单页是否显示右上角 N/M（覆盖 deck.meta.showPageNumbers）
  patternRef?: string;       // 引用 Pattern 库 id，详见 §10
  blocks: Block[];           // 无硬上限
};
```

## 4. 布局（Layout · 11 种）

| layout | 用途 | 典型 blocks |
|---|---|---|
| `hero` | 封面 / opening | badge + heading(1) + text + button |
| `title-content` | 标题正文 | heading(2) + text/list/image |
| `two-column` | 两栏对比 | card{column:"left"} + card{column:"right"} |
| `three-column` | 三栏均分 | 3 个 block 各 column:"col1/col2/col3" |
| `four-column` | 四栏网格 | 4 个 block 各 col1-col4，建议每栏 1-2 block |
| `five-column` | 五栏网格 | 5 个 block 各 col1-col5，建议极简 |
| `bullet-list` | 要点列表 | heading + list + button |
| `quote` | 引用强调 | heading（带引号装饰）+ text（出处） |
| `cta` | 行动号召 | heading(2) + text + button(primary) + button(outline) |
| `embed` | 嵌入页 | iframe |
| `free` | 自由布局 | 每个 block 用 `position` 百分比绝对定位（详见 §9） |

多栏布局（`two/three/four/five-column`）支持 `column: "col1"-"col5"`，向后兼容旧的 `"left" | "right" | "center"`（center 在所有多栏布局中作全宽头部行）。

## 5. 转场（Transition · 6 种）

```ts
type Transition = "none" | "fade" | "slide-left" | "slide-up" | "zoom" | "magic";
```

- `magic` 启用 Magic Move 飞行过渡，详见 §11
- `transitionDuration` 可独立覆盖每页，未设则用类型默认值

## 6. 背景（Background）

```ts
type Background =
  | { type: "solid"; color: string }
  | { type: "gradient"; from: string; to: string; angle?: number }   // 默认 135 度
  | { type: "image"; url: string; opacity?: number };                // opacity 0–1
```

`url` 必须是 `https?://...` 或 `data:image/...;base64,...`。LLM 生成时强制走 `https://picsum.photos/seed/{slug}/{w}/{h}` 占位（永远 200，不会 404）；用户配 Pexels API key 后后台异步用 slug 关键词查真图替换（详见 §13）。

## 7. Block（16 种 discriminated union）

按 `type` 字段做 discriminated union 校验。所有 block 都额外支持以下通用字段：

| 字段 | 适用 | 含义 |
|---|---|---|
| `column?` | 多栏布局 | `"left" / "right" / "center" / "col1"-"col5"`，仅 multi-column 生效 |
| `magicId?` | 全部 | Magic Move 飞行 id（§11） |
| `utilities?` | 全部 | 视觉变体白名单数组（最多 8 个，§8） |
| `position?` | 全部 | `{ xPct, yPct, widthPct?, heightPct? }`，仅 layout="free" 生效（§9） |

### 7.1 基础 9 种

| type | 关键字段 |
|---|---|
| `text` | `text: RichText` · `align?: "left"\|"center"\|"right"` |
| `heading` | `level: 1\|2\|3` · `text: RichText` · `align?` |
| `image` | `url: ImageUrl` · `alt?` · `fit: "cover"\|"contain"`（默认 cover）· `widthPx?` / `heightPx?`（16-4096） |
| `button` | `label: string` · `variant: "primary"\|"secondary"\|"ghost"\|"outline"` · `onClick: Action` |
| `list` | `items: ListItem[]` · `ordered: boolean`（默认 false） |
| `badge` | `text: string` · `tone: Tone`（默认 primary） |
| `iframe` | `url: string`（合法 url）· `height?: number` |
| `icon` | `name: HxsIconName`（白名单 §12）· `size?: 8-256`（默认 32）· `tone: ToneFull`（默认 primary）· `strokeWidth?: 0.5-3`（默认 2）· `align?` |
| `card` | `title?` · `subtitle?` · `children: CardChildBlock[]`（不嵌 card 自身） |

### 7.2 高级 3 种（form / modal / tab）

```ts
// form 字段类型 7 种
type FormFieldType = "text" | "email" | "textarea" | "select" | "checkbox" | "number" | "radio";

type FormBlock = {
  type: "form";
  formId: string;                    // CSV 分组键
  fields: FormField[];               // 1–10 个
  submitLabel: string;               // 默认 "提交"
  successMessage: string;            // 默认 "感谢，已提交。"
  onSubmit?: { type: "none" } | { type: "next" } | { type: "jumpTo"; slideId: string };
};

type FormField = {
  name: string;                      // 仅字母数字下划线，字母开头（CSV 列名）
  label: string;                     // 中文写在这里
  type: FormFieldType;
  placeholder?: string;
  required: boolean;                 // 默认 false
  options?: { value: string; label: string }[];   // 仅 select / radio
  min?: number; max?: number;        // 仅 number
  rows?: number;                     // 仅 textarea，1–20
};
```

```ts
type ModalBlock = {
  type: "modal";
  triggerLabel: string;              // 触发按钮文字
  triggerVariant: ButtonVariant;     // 默认 primary
  title?: string;
  children: ContainerChildBlock[];   // 基础 7 种 + form + icon，不嵌 modal/tab/card 自身
};

type TabBlock = {
  type: "tab";
  tabs: { id: string; label: string; blocks: ContainerChildBlock[] }[];  // 1–6 个
  defaultTabId?: string;
};
```

### 7.3 数据装饰 4 种

```ts
type StatBlock = {
  type: "stat";
  value: string;                     // 大字号渲染，可数字也可短字符串
  label?: string;                    // 下方小字注释
  tone: Tone;                        // 默认 primary
  trend?: "up" | "down" | "flat";    // 渲染向上/向下/横线箭头
  align?: "left" | "center" | "right";
};

type FlowBlock = {
  type: "flow";
  steps: { label: string; tone?: Tone }[];   // 2–6 步
  arrow: "arrow" | "chevron" | "plus";       // 默认 arrow
  align?;
};

type TableBlock = {
  type: "table";
  headers: string[];                 // 1–8 列
  rows: TableCell[][];               // 1–20 行，每行 ≥ 1 列
  highlightCol?: number;             // 0-based 列索引，整列 primary 描边强调
};

type TableCell = string | { text: string; tone?: Tone; bold?: boolean };

type ChromeBlock = {
  type: "chrome";
  variant: "mac" | "browser";        // 默认 mac
  title?: string;                    // mac variant 显示在三圆点右侧
};
```

### 7.4 统一 Block schema

```ts
const BlockSchema = z.discriminatedUnion("type", [
  TextBlock, HeadingBlock, ImageBlock, ButtonBlock, ListBlock, BadgeBlock,
  IframeBlock, IconBlock, CardBlock, FormBlock, ModalBlock, TabBlock,
  StatBlock, FlowBlock, TableBlock, ChromeBlock,
]);
```

## 8. RichText（heading.text / text.text）

`heading.text` 与 `text.text` 字段支持两种形态：

```ts
type RichText = string | RichTextSegment[];

type RichTextSegment = {
  text: string;
  tone?: "fg" | "primary" | "accent" | "muted"
       | "danger" | "success" | "warning" | "info"
       | "gradient";       // 主→accent 渐变文字
  bold?: boolean;
};
```

- 形态 ① `string`：最常用
- 形态 ② `segment[]`：让一段中部分词单独染色或加粗（核心动词 / 数字 / 产品名做视觉锚点）

```jsonc
// 字符串
{ "type": "heading", "level": 1, "text": "三件值得在意的事" }

// 段数组（局部染色 + gradient）
{
  "type": "heading", "level": 1,
  "text": [
    { "text": "别再裸用 " },
    { "text": "Claude Code", "tone": "gradient" },
    { "text": " 了！" }
  ]
}
```

`{{varName}}` 变量在两种形态中都会被插值。

## 9. Tone palette

```ts
// badge / icon / stat / flow.steps / list-item / table-cell / RichText 共用
type Tone = "primary" | "accent" | "muted" | "fg"
          | "danger" | "success" | "warning" | "info";

// IconBlock 额外支持
type ToneFull = Tone | "current";   // current 继承父级 currentColor
```

## 10. Position（自由布局专用）

```ts
type Position = {
  xPct: number;                      // -20 到 120，左上角 x 百分比
  yPct: number;                      // -20 到 120
  widthPct?: number;                 // 0-120，未设则按内容自适应
  heightPct?: number;
};
```

仅 `slide.layout === "free"` 时生效，其他布局忽略。编辑器内可鼠标拖动到任意位置，一键从其他 layout 转换并保留当前实际位置。

## 11. Utilities 白名单（30+ 类，9 个分类）

权威实现：[`shared/dsl/utilities.ts`](../shared/dsl/utilities.ts)。

| 分类 | utility 名 |
|---|---|
| **surface 毛玻璃 / 半透明** | `hxs-frost` · `hxs-frost-dark` · `hxs-frost-strong` · `hxs-translucent` |
| **shadow 阴影** | `hxs-shadow-none` · `hxs-shadow-sm` · `hxs-shadow-md` · `hxs-shadow-lg` · `hxs-shadow-glow` |
| **border 边框** | `hxs-border` · `hxs-border-thick` · `hxs-no-border` |
| **左竖条**（Notion 风核心手法） | `hxs-bar-l-{primary\|accent\|success\|warning\|danger\|info\|rainbow}` |
| **shape 形状** | `hxs-rounded-full` · `hxs-rounded-sharp` |
| **pattern 底纹**（slide 级首选） | `hxs-bg-grid` · `hxs-bg-dots` · `hxs-bg-diagonal` · `hxs-bg-noise` · `hxs-bg-radial` · `hxs-bg-corner-glow` |
| **text 文字** | `hxs-text-gradient` · `hxs-text-glow` · `hxs-tracking-wide` · `hxs-animate-gradient-flow` |
| **spacing 间距** | `hxs-pad-tight` · `hxs-pad-loose` |
| **motion 动画** | `hxs-animate-pulse` · `hxs-animate-float` · `hxs-hover-lift` · `hxs-animate-shimmer` · `hxs-animate-glow-pulse` · `hxs-animate-bounce-soft` |
| **transform 形变** | `hxs-rotate-1` · `hxs-rotate-neg-1` · `hxs-tilted` |

**用法约定**：
- 底纹（`hxs-bg-*`）放在 `slide.utilities`，影响整页背景
- 毛玻璃 / 阴影 / 边框 / 形状 / 动画 / 倾斜放在 `block.utilities`（card / heading / button 用得最多）
- 左侧高亮竖条 `hxs-bar-l-{tone}` 放在 card 上；多卡按 tone 不同形成色彩节奏
- CSS 用 `color-mix` 取主题色变量，自动随风格联动；老浏览器降级；尊重 `prefers-reduced-motion`
- 不要叠加冲突类（如同时 `hxs-shadow-none` 与 `hxs-shadow-lg`）

## 12. Icon 白名单（71 个 lucide-react）

权威实现：[`shared/dsl/icons.ts`](../shared/dsl/icons.ts)。

命名严格 PascalCase（`ArrowRight` 而非 `arrow-right`），按用途分组：导航箭头 10 / 状态反馈 5 / 通讯 4 / 媒体 7 / UI 工具 12 / 业务亮点 8 / 数据图表 4 / 安全工具 4 / 时间位置 4 / 用户 3 / 商业 3 / 装饰强调 7。

```jsonc
{ "type": "icon", "name": "Zap", "size": 56, "tone": "accent", "strokeWidth": 2 }
```

写错的 icon 名（不在白名单）会被 schema 拒绝；LLM 在 prompts 速览中读到完整白名单。

## 13. 配图与图源

LLM 生成 image url 强制走 `https://picsum.photos/seed/{english-kebab-slug}/{w}/{h}` 占位约定（永远 200，不会 404）。常用尺寸：

| 画幅 | width × height |
|---|---|
| 16:9 | `1280/720` |
| 4:3 | `1024/768` |
| 竖屏 / auto | `800/1200` |
| 方图 | `800/800` |

用户在「配置 → 图库」配 Pexels API key 后，`agent.ts generate()` 在 deck 落地后 fire-and-forget 跑 `enrichDeckImagesAsync`：扫所有 picsum URL 解析 slug → 按 URL 比例选 orientation（landscape/portrait/square）→ 并发查 Pexels（同 query+orientation 进程级缓存）→ `replaceImageUrls(map)` 一次性 swap。失败 / 限流 / 未配置 key 静默吞，picsum URL 仍能加载（零回归）。

**配图色彩冲突防护**（必须）：image 作 `slide.background` 时 opacity ≤ 0.6；heading 必须加 `hxs-text-glow` 或外包 `card + hxs-frost-dark` / `hxs-translucent` 玻璃卡承托——Pexels 真图色彩不可预测，裸 heading 飘在配图上会被吃掉。

## 14. 交互动作（Action · 5 种）

```ts
type DeckAction =
  | { action: "next" }
  | { action: "prev" }
  | { action: "jumpTo"; slideId: string }
  | { action: "openLink"; url: string }       // 新窗口打开
  | { action: "setVar"; name: string; value: string | number | boolean };
```

`setVar` 修改后，所有引用该变量的 `{{name}}` 文本会重渲染——这是把演示从 PPT 升级为「可交互产品原型」的关键能力。

## 15. 文本变量插值

```ts
deck.variables: Record<string, string | number | boolean>;
```

支持插值的字段：所有 `text` / `heading.text` / `list.items[i]` / `button.label` / `badge.text` / `card.title` / `card.subtitle`，无论 RichText 是 string 还是 segment[]。

```jsonc
{
  "variables": { "userName": "访客", "count": 0 },
  "slides": [{
    "blocks": [
      { "type": "heading", "level": 1, "text": "你好，{{userName}}！" },
      { "type": "text", "text": "已点击 {{count}} 次" },
      { "type": "button", "label": "+1", "onClick": {
          "action": "setVar", "name": "count", "value": "{{count}} + 1"
      }}
    ]
  }]
}
```

## 16. Magic Move（飞行过渡）

在两页之间需要某个元素「飞过去」时：

1. 给前后两页的对应 block 设置**相同的 `magicId`**（任意字符串）
2. 把目标页 `transition` 设为 `"magic"`

```jsonc
// 第 1 页 hero
{ "type": "heading", "level": 1, "text": "Lumen", "magicId": "tagline" }

// 第 2 页 hero（transition: "magic"）右上角徽章位置
{ "type": "badge", "text": "Lumen", "magicId": "tagline" }
```

慎用——只对真正需要「同一个元素移动」的场景使用，3-5 个 magic 元素一组最佳。`transitionDuration` 默认 250ms。

## 17. Pattern 引用（patternRef）

```ts
slide.patternRef?: string;
```

引用 Pattern 库 id（`client/src/data/patternsBuiltin.ts` 内置 10 个 + 用户保存）。渲染前 pattern 作为 base，slide 自身已设字段（layout/blocks/transition/...）作 override。命中不到时静默回退到 slide 自身（不报错），保证 pattern 库被删除时旧 deck 仍能渲染。

发布前 `expandDeck(deck, getPattern)` 把所有 `patternRef` 一次性预展开为 self-contained 页面，runtime 不需要 pattern 库（`client/src/renderer/expandPattern.ts`）。

## 18. LLM 工具协议

LLM 通过两个工具与系统交互（`client/src/llm/tools.ts`）：

```ts
// 1. 从零生成完整 deck
create_deck(input: { deck: Deck })

// 2. 对当前 deck 应用 RFC 6902 JSON Patch
patch_deck(input: { patches: Operation[]; summary?: string })

type Operation =
  | { op: "add" | "replace"; path: string; value: unknown }
  | { op: "remove"; path: string };
```

两个工具的 parameters 由 `zod-to-json-schema` 从 `DeckSchema` 自动生成，与 schema 永远同步。

**输入宽容兜底**（`client/src/llm/validate.ts`）：

| 错误形态 | 兜底处理 |
|---|---|
| `deck` 字段被字符串化（部分服务的 streaming tool_calls quirk） | `coerceDeck` 自动 `JSON.parse` |
| `deck` 字符串被 max_tokens 截断 | `recoverTruncatedDeckString` 扫到最后一个完整 slide 闭合点 + 补 `]}`，让用户拿到前 N 页 |
| `patches` 数组被字符串化 | `coercePatches` 自动 `JSON.parse` |
| `patches` 字符串被截断 | `recoverTruncatedPatchArray` 扫到最后一个完整 op 闭合点 + 补 `]` |
| 单个 op 对象漏掉外层数组 | 自动包成 `[op]` |
| 用了别名 `operations` / `ops` / `patch` / `input` / `value` / `data` | 自动归一 |

**Zod union 错误展开**（`formatZodError`）：检测 `invalid_union` issue 时递归 `unionErrors`，列出每个分支拒绝原因 + 实际收到值快照（截 160 字），让 LLM 在重试时有具体根因（而非默认 `Invalid input`）。

## 19. 兼容与扩展点

- **顶层 `version`**：升级抓手，schema 演进不破坏旧 deck
- **block 用 `type` discriminated union**：新增 block 类型不破坏旧 deck（schema.ts `BlockSchema` 末尾追加新成员即可）
- **`theme.colors` 是开放对象**：未来加 token 不破坏现有 deck（未提供时主题层 fallback）
- **`utilities` 走白名单运行时过滤**：`HXS_UTILITY_NAMES` 之外的 class 被静默忽略，schema 不阻止（让旧 deck 在新 utility 引入前仍能 parse）
- **`patternRef` 命中不到静默回退**：pattern 库可独立演进
- **`block.column` 同时支持 left/right/center 与 col1-col5**：旧 two-column deck 不破坏
- **i18n 输出**：deck 文案语言由 `prompt-meta.outputLangInstruction` 控制（zh-CN / en），schema 不绑定语言

## 20. 校验入口

```ts
import { DeckSchema } from "@shared/dsl";

const result = DeckSchema.safeParse(deckJson);
if (!result.success) {
  console.error(result.error);
  return;
}
const deck = result.data;   // 类型安全 Deck
```

LLM 调用路径在 `processToolCall`（`client/src/llm/validate.ts`）内统一走：

```
input → coerceDeck/coercePatches → fillSlideIds → DeckSchema.safeParse
      → normalizeThemeContrast → 提交到 store
```

校验失败回灌 LLM 重试一次（Anthropic 用 `tool_result/is_error`，OpenAI 用 `role:tool`）。
