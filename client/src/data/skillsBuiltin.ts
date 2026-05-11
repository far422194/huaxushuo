import type { Skill } from "./skills";

// 内置 6 个 Skill：覆盖最常见演示场景
// 每个 systemAddon 控制在 ~600-1200 字（紧凑配方），命中后才注入 prompt 不影响默认场景

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: "dark-notion-tutorial",
    name: "暗色 Notion 教程长图",
    description: "小红书 / 教程长图 / 竖屏分享 暗色风格",
    source: "builtin",
    createdAt: 0,
    triggers: ["小红书", "教程长图", "Notion 长图", "暗色长图", "暗色分享", "竖屏分享", "长图科普", "长图教程"],
    fewshotPatternIds: [
      "dark-glow-hero",
      "card-list-bars",
      "numbered-quad-tone",
      "dark-comparison-table",
    ],
    recommendBlocks: ["stat", "table", "flow", "card", "chrome"],
    recommendUtilities: [
      "hxs-bar-l-success", "hxs-bar-l-warning", "hxs-bar-l-info", "hxs-bar-l-danger",
      "hxs-bg-corner-glow", "hxs-text-gradient", "hxs-text-glow",
    ],
    recommendTheme: {
      mode: "dark",
      colors: { bg: "#0a0a0a", fg: "#e5e7eb", primary: "#22d3ee", accent: "#a78bfa", muted: "#475569" } as any,
    },
    systemAddon: `### 当前命中风格：暗色 Notion / 小红书 教程长图

**强制基础设施**：
- \`meta.aspectRatio: "auto"\`（竖屏长图）
- \`meta.showPageNumbers: true\`（每页右上 N/M）
- \`theme.mode: "dark"\`，bg 用 #0a0a0a / #0f1419 区间深黑；fg 用 #e5e7eb / #f3f4f6 浅灰白
- \`theme.colors\` 必须显式提供 success/warning/danger/info 4 色，让 4 色循环编号 / 多色染色有底色

**核心手法（必须用）**：
1. **标题 RichText 局部染色**：heading.text 用数组形态，把核心动词/产品名/数字单独染色（tone:"gradient"/"warning"/"danger"/"info"）。例：\`text:[{text:"别再裸用 "},{text:"Claude Code",tone:"gradient"},{text:" 了！"}]\`。单段不染色显得平淡，必须有节奏
2. **卡片列表必用左竖条**：card.utilities 选 hxs-bar-l-{success|warning|info|danger|accent} 之一，多卡循环不同色形成色彩节奏（绝对不要用 hxs-border 全四边描边）
3. **数据对比必用 table**：单元格写对象形态 \`{text,tone,bold:true}\` 让关键数字染色加粗；highlightCol 整列底色强调；不要用 four-column 拼网格
4. **流程必用 flow block**：3-5 步用 flow，不用 cta 横排 button 拼
5. **编号心得必用 list 对象项 + ordered:true**：items 数组每条用不同 tone（warning→info→accent→danger 4 色循环）→ 渲染器自动出黄/青/紫/粉 4 色编号方块
6. **大数字震撼必用 stat block**：3-4 个并排放 multi-column；不要用 free 布局拼

**结构建议**（典型 6-8 页教程长图）：
- 第 1 页：dark-glow-hero pattern（封面：badge + 局部染色大标题 + 副标题 + 角落光晕）
- 第 2 页：mac-window-cover 或 card-list-bars（核心概念介绍）
- 第 3-5 页：内容主体（card-list-bars / numbered-quad-tone / flow-3step / 各 1 页）
- 倒数 2 页：dark-comparison-table（数据对比）
- 末页：bold-quote-glow 或 dark-cta-glow（金句 / 行动号召）

**优先用 patternRef 复用**：上面提到的 pattern 都已内置，可在 slide 写 \`patternRef:"dark-glow-hero"\` + 自己的 blocks 覆盖文案，省 token 又保证视觉品质。`,
  },
  {
    id: "dark-cyberpunk",
    name: "暗夜赛博",
    description: "技术感 / 工程师 / 暗黑科技风",
    source: "builtin",
    createdAt: 0,
    triggers: ["赛博", "科技感", "暗夜", "hacker", "极客", "工程师", "技术深度"],
    fewshotPatternIds: ["dark-glow-hero", "mac-window-cover", "stat-grid-3"],
    recommendBlocks: ["stat", "chrome", "table"],
    recommendUtilities: [
      "hxs-bg-grid", "hxs-text-gradient", "hxs-text-glow", "hxs-bg-corner-glow",
      "hxs-border-thick", "hxs-shadow-glow",
    ],
    recommendTheme: {
      mode: "dark",
      colors: { bg: "#0d1117", fg: "#c9d1d9", primary: "#00ff88", accent: "#58a6ff", muted: "#484f58" } as any,
    },
    systemAddon: `### 当前命中风格：暗夜赛博

- \`theme.mode:"dark"\`，bg #0d1117（GitHub 暗）；primary 终端绿 #00ff88；accent 冷蓝 #58a6ff
- 章节页 \`slide.utilities:["hxs-bg-grid"]\` 网格底纹必用
- hero 页 \`slide.utilities:["hxs-bg-corner-glow"]\` + heading 加 hxs-text-glow
- chrome block（mac variant）模拟终端 / IDE 截图
- 字体冷峻精确：fonts.heading "JetBrains Mono" / "Fira Code"，body Inter
- 转场全部 zoom 或 slide-up，不用 fade
- 文案克制冷峻（"请求时长 800ms"比"响应飞快"好；"内存占用 12MB"比"轻量级"好）`,
  },
  {
    id: "editorial-magazine",
    name: "杂志编辑感",
    description: "文艺 / 编辑感 / 长文阅读",
    source: "builtin",
    createdAt: 0,
    triggers: ["编辑感", "杂志", "文艺", "长文", "阅读", "深度文章"],
    fewshotPatternIds: ["bold-quote-glow", "card-list-bars"],
    recommendBlocks: ["card"],
    recommendUtilities: ["hxs-bg-noise", "hxs-tracking-wide"],
    recommendTheme: {
      mode: "light",
      colors: { bg: "#faf7f2", fg: "#1a1a1a", primary: "#8b1a1a", accent: "#a87a3c", muted: "#807060" } as any,
    },
    systemAddon: `### 当前命中风格：杂志编辑感

- \`theme.mode:"light"\`，bg 米白 #faf7f2；fg 近黑 #1a1a1a；primary 深红 #8b1a1a；fonts 衬线（heading "Songti SC"/"Source Han Serif" / body 同）
- slide \`hxs-bg-noise\` 噪点底纹给纸张质感
- 多用 quote 布局做章节切片，不用 cta
- 文案有书卷气，避免营销腔；段落留白多，每页内容少`,
  },
  {
    id: "minimal-luxury",
    name: "极简高奢",
    description: "黑金 / 高级感 / 极简留白",
    source: "builtin",
    createdAt: 0,
    triggers: ["极简", "高奢", "黑金", "高级感", "luxury", "奢华"],
    fewshotPatternIds: ["bold-quote-glow", "dark-cta-glow"],
    recommendBlocks: ["badge"],
    recommendUtilities: ["hxs-rounded-sharp", "hxs-tracking-wide", "hxs-text-gradient"],
    recommendTheme: {
      mode: "dark",
      colors: { bg: "#000000", fg: "#f5f5f5", primary: "#d4af37", accent: "#ffffff", muted: "#666" } as any,
    },
    systemAddon: `### 当前命中风格：极简高奢

- \`theme.mode:"dark"\`，bg 纯黑 #000；primary 香槟金 #d4af37；radius "none" 或 "sm"（锐利无圆角）
- 装饰极少：utilities 一页 ≤ 2 个；不用底纹、不用动画
- 文案精简：每页 blocks ≤ 4；hero 标题 ≤ 8 字
- 字距加宽 \`hxs-tracking-wide\`；衬线 + 大留白`,
  },
  {
    id: "corporate-pitch",
    name: "B2B 路演",
    description: "投资 / 路演 / 企业服务",
    source: "builtin",
    createdAt: 0,
    triggers: ["B2B", "路演", "投资", "pitch", "企业服务", "SaaS"],
    fewshotPatternIds: ["stat-grid-3", "dark-comparison-table", "flow-3step"],
    recommendBlocks: ["stat", "table", "flow"],
    recommendUtilities: ["hxs-bg-grid", "hxs-shadow-md"],
    recommendTheme: {
      mode: "light",
      colors: { bg: "#ffffff", fg: "#0f172a", primary: "#0ea5e9", accent: "#6366f1" } as any,
    },
    systemAddon: `### 当前命中风格：B2B 路演

- 偏冷色（蓝/紫）+ light 模式 + grid 底纹 + 强对比
- 必用 stat block 体现数据；必用 table 做对比；必用 flow 体现流程
- 每页都有量化数据（"3 倍提速"/"成本 -60%"）
- CTA 直接写 ROI：年省成本 / 月活提升 / 转化提升`,
  },
  {
    id: "launch-fanfare",
    name: "新品发布",
    description: "上线 / 发布会 / 新品 hero",
    source: "builtin",
    createdAt: 0,
    triggers: ["新品发布", "上线", "发布会", "launch", "新版本"],
    fewshotPatternIds: ["dark-glow-hero", "stat-grid-3", "dark-cta-glow"],
    recommendBlocks: ["stat", "card"],
    recommendUtilities: [
      "hxs-bg-radial", "hxs-bg-corner-glow",
      "hxs-shadow-glow", "hxs-text-gradient",
      "hxs-animate-glow-pulse",
    ],
    systemAddon: `### 当前命中风格：新品发布

- hero 必用渐变 background + radial 光斑 + 大标题渐变文字 + glow 阴影按钮
- 多用 magic move：logo / slogan 在前后页飞行过渡（同 magicId）
- stat 行展示亮点指标（速度 / 容量 / 用户数）
- CTA 加 \`hxs-animate-glow-pulse\` 让按钮呼吸感更强`,
  },
];
