import type { Pattern } from "./patterns";

// 内置 Pattern 库：10 个覆盖参考截图所有视觉的高质量页面样板
// id 必须稳定（外部 patternRef 引用依赖此 id）；slides 数组至少 1 项，每项符合 SlideSchema
// 注：slide.id 留空字符串（展开时由调用方填）；blocks/utilities 用现有 16 block × 37 utility 表达
//
// 覆盖意图：
// - 截图 1 头部 hero + 底部 stat → dark-glow-hero + stat-grid-3
// - 截图 2 mac chrome 装饰 → mac-window-cover
// - 截图 3 多卡左竖条列表 → card-list-bars
// - 截图 4 痛点对比箭头 → painpoint-vs-solution
// - 截图 5 编号方块清单 → numbered-quad-tone + flow-3step
// - 截图 6 数据对比表 → dark-comparison-table

export const BUILTIN_PATTERNS: Pattern[] = [
  {
    id: "dark-glow-hero",
    name: "暗色光晕封面",
    description: "暗底 + 渐变 badge + 大标题局部染色 + 角落光晕（教程长图首页同款）",
    category: "hero",
    tags: ["dark", "hero", "tutorial", "notion", "小红书"],
    source: "builtin",
    themeHint: { mode: "dark", primary: "#22d3ee" },
    createdAt: 0,
    slides: [
      {
        id: "",
        layout: "hero",
        transition: "zoom",
        utilities: ["hxs-bg-corner-glow"],
        blocks: [
          { type: "badge", text: "教程长图", tone: "primary", utilities: ["hxs-text-gradient"] },
          {
            type: "heading",
            level: 1,
            text: [
              { text: "别再裸用 " },
              { text: "Claude Code", tone: "gradient" },
              { text: " 了！" },
            ],
            align: "center",
          },
          { type: "text", text: "让开发效率直接拉满", align: "center" },
        ],
      },
    ],
  },
  {
    id: "stat-grid-3",
    name: "三列大数字",
    description: "三列 stat block 横排，关键指标震撼展示",
    category: "stat",
    tags: ["stat", "metrics", "dark"],
    source: "builtin",
    createdAt: 0,
    slides: [
      {
        id: "",
        layout: "three-column",
        transition: "fade",
        blocks: [
          { type: "stat", value: "32", label: "技能", tone: "info", column: "col1", align: "center" },
          { type: "stat", value: "8", label: "MCP 服务器", tone: "success", column: "col2", align: "center" },
          { type: "stat", value: "4.7", label: "Opus", tone: "warning", column: "col3", align: "center" },
        ],
      },
    ],
  },
  {
    id: "mac-window-cover",
    name: "macOS 窗口装饰封面",
    description: "顶部 chrome 三圆点 + 大留白主体 + 标签",
    category: "section",
    tags: ["mac", "section", "chrome", "教程长图"],
    source: "builtin",
    themeHint: { mode: "dark" },
    createdAt: 0,
    slides: [
      {
        id: "",
        layout: "title-content",
        transition: "fade",
        blocks: [
          { type: "chrome", variant: "mac", title: "核心概念" },
          { type: "heading", level: 2, text: "两个不可错过的能力", align: "left" },
          { type: "text", text: "理解这两个，AI 开发就开窍了。" },
        ],
      },
    ],
  },
  {
    id: "card-list-bars",
    name: "彩条卡片列表",
    description: "多张卡片左侧不同色高亮竖条，Notion / 小红书风格关键模式",
    category: "list",
    tags: ["dark", "card", "list", "notion", "小红书"],
    source: "builtin",
    themeHint: { mode: "dark" },
    createdAt: 0,
    slides: [
      {
        id: "",
        layout: "bullet-list",
        transition: "fade",
        blocks: [
          {
            type: "card",
            title: "Skills 技能",
            subtitle: "封装好的提示词/工作流，让 AI 更懂怎么干",
            utilities: ["hxs-bar-l-info"],
            children: [{ type: "badge", text: "运行于大模型内部", tone: "info" }],
          },
          {
            type: "card",
            title: "MCP 服务器",
            subtitle: "真正的工具能力，让 AI 真的能去干",
            utilities: ["hxs-bar-l-success"],
            children: [{ type: "badge", text: "运行于本地进程", tone: "success" }],
          },
        ],
      },
    ],
  },
  {
    id: "numbered-quad-tone",
    name: "四色编号清单",
    description: "list block ordered 模式 + 4 色循环 tone（黄/青/紫/粉）编号方块",
    category: "list",
    tags: ["list", "numbered", "dark", "小红书"],
    source: "builtin",
    themeHint: { mode: "dark" },
    createdAt: 0,
    slides: [
      {
        id: "",
        layout: "title-content",
        transition: "fade",
        blocks: [
          {
            type: "heading",
            level: 1,
            text: [
              { text: "Pencil 到底有多" },
              { text: "强", tone: "warning" },
              { text: "？" },
            ],
            align: "center",
          },
          {
            type: "list",
            ordered: true,
            items: [
              { text: "自然语言 → 设计稿，20-40 分钟搞定", tone: "warning" },
              { text: "设计稿 → 代码，还原度 98%+", tone: "info" },
              { text: "支持多种技术栈，一键多端", tone: "accent" },
              { text: "边说边改，实时调整", tone: "danger" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "dark-comparison-table",
    name: "暗色对比表格",
    description: "table block + highlightCol，关键列染色 + bold（实测对比页同款）",
    category: "compare",
    tags: ["table", "compare", "dark", "数据"],
    source: "builtin",
    themeHint: { mode: "dark" },
    createdAt: 0,
    slides: [
      {
        id: "",
        layout: "title-content",
        transition: "fade",
        blocks: [
          {
            type: "heading",
            level: 1,
            text: [
              { text: "实测" },
              { text: "效率", tone: "info" },
              { text: "对比数据" },
            ],
            align: "center",
          },
          {
            type: "table",
            headers: ["对比指标", "传统方式", "Pencil", "提升"],
            highlightCol: 2,
            rows: [
              [
                "设计稿制作",
                "4-6 小时",
                { text: "20-40 分钟", tone: "warning", bold: true },
                { text: "8 倍", tone: "success", bold: true },
              ],
              [
                "代码还原度",
                "70%-85%",
                { text: "98%+", tone: "warning", bold: true },
                { text: "纠错-90%", tone: "success", bold: true },
              ],
              [
                "多端适配",
                "重复开发",
                { text: "自动生成", tone: "warning", bold: true },
                { text: "省 75%", tone: "success", bold: true },
              ],
            ],
          },
        ],
      },
    ],
  },
  {
    id: "painpoint-vs-solution",
    name: "痛点对比方案",
    description: "红色边框痛点卡片 + 向下箭头 + 绿色边框方案卡片",
    category: "compare",
    tags: ["compare", "painpoint", "solution", "dark"],
    source: "builtin",
    themeHint: { mode: "dark" },
    createdAt: 0,
    slides: [
      {
        id: "",
        layout: "title-content",
        transition: "fade",
        blocks: [
          {
            type: "heading",
            level: 1,
            text: [
              { text: "以前做前端的" },
              { text: "痛", tone: "danger" },
              { text: " 你一定懂" },
            ],
            align: "center",
          },
          {
            type: "card",
            title: "传统开发流程",
            utilities: ["hxs-bar-l-danger"],
            children: [
              {
                type: "list",
                ordered: false,
                items: [
                  "设计稿调样式能调半天，间距差 2px 就崩溃",
                  "颜色不对、圆角忘加、反反复复改不完",
                  "设计还原度永远只有 70%-85%",
                  "找设计师太贵，免费模板又不合适",
                  "多端适配需要重复开发，浪费大量时间",
                ],
              },
            ],
          },
          { type: "icon", name: "ArrowDown", size: 28, tone: "warning", align: "center" },
          {
            type: "card",
            title: "用了 Pencil 之后",
            utilities: ["hxs-bar-l-success"],
            children: [
              { type: "text", text: "用嘴说需求 → AI 画设计稿 → 一键出代码", align: "center" },
              { type: "text", text: "不满意？继续说话调整，AI 实时帮你改", align: "center" },
            ],
          },
          {
            type: "flow",
            arrow: "arrow",
            align: "center",
            steps: [
              { label: "用嘴说需求", tone: "success" },
              { label: "AI 画设计稿", tone: "success" },
              { label: "一键出代码", tone: "success" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "flow-3step",
    name: "三步流程图",
    description: "横排 flow block，3 步带箭头连接",
    category: "flow",
    tags: ["flow", "process", "step"],
    source: "builtin",
    createdAt: 0,
    slides: [
      {
        id: "",
        layout: "title-content",
        transition: "fade",
        blocks: [
          { type: "heading", level: 2, text: "三步搞定", align: "center" },
          {
            type: "flow",
            arrow: "arrow",
            align: "center",
            steps: [
              { label: "提需求", tone: "info" },
              { label: "AI 生成", tone: "warning" },
              { label: "一键交付", tone: "success" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "bold-quote-glow",
    name: "金句光晕引用",
    description: "quote 布局 + 大字 + 光晕装饰，章节切片用",
    category: "quote",
    tags: ["quote", "section", "dark"],
    source: "builtin",
    themeHint: { mode: "dark" },
    createdAt: 0,
    slides: [
      {
        id: "",
        layout: "quote",
        transition: "zoom",
        utilities: ["hxs-bg-corner-glow"],
        blocks: [
          {
            type: "heading",
            level: 1,
            text: [
              { text: "把精力从" },
              { text: "「怎么实现」", tone: "warning" },
              { text: "转到" },
              { text: "「做什么功能」", tone: "success" },
            ],
            align: "center",
            utilities: ["hxs-text-glow"],
          },
        ],
      },
    ],
  },
  {
    id: "dark-cta-glow",
    name: "暗色光晕 CTA",
    description: "暗底 + 主按钮 + 光晕阴影，行动号召页",
    category: "cta",
    tags: ["cta", "dark", "button"],
    source: "builtin",
    themeHint: { mode: "dark" },
    createdAt: 0,
    slides: [
      {
        id: "",
        layout: "cta",
        transition: "zoom",
        utilities: ["hxs-bg-corner-glow"],
        blocks: [
          { type: "heading", level: 1, text: "现在开始", align: "center" },
          { type: "text", text: "IDE 里搜 \"pencil\" → 安装 → 开干！", align: "center" },
          {
            type: "button",
            label: "开始使用",
            variant: "primary",
            onClick: { action: "openLink", url: "https://pencil.so" },
            utilities: ["hxs-shadow-glow", "hxs-animate-glow-pulse"],
          },
        ],
      },
    ],
  },
];
