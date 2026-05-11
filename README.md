# 华胥说

[English](./README.en.md) · 简体中文

**华胥说**：将思维逻辑转化为可见且直观的演示说明（交互式网站），它不追求复杂的呈现形式，只考虑用简单、直观的呈现成为你讲解的腹稿，**让你专注讲解工作本身**，不会在制作环节（制作PPT、制作图片等方式）成为阻碍，从构思→讲解**变得更加优雅**。

```bash
# 一键创建项目(推荐)
npx @huaxushuo/cli init huaxushuo
cd huaxushuo && pnpm dev
```

## 为什么用华胥说

市面上工具要么走纯静态 deck（Gamma / Tome）失去交互能力，要么走直出 React（v0 / bolt.new）失去结构与可控。

华胥说选择第三条路：**用LLM 输出 DSL，实现确定性渲染**。

> 致力于：用自然语言短时间就能生成可讲解的篇幅内容（30秒生成10页，5-10分钟生成20～30页）

- vs PPT：可点击、有动效、有变量状态、可一键发布到公网
- vs 思维导图：更贴近逻辑的渐进式阐述，杜绝了多支线思维情况下的放大缩小及展开折叠
- vs Gamma / Tome：更偏「可交互产品原型演示」，不是纯静态 deck
- vs Figma：不需要设计能力，自然语言驱动
- vs v0 / bolt.new：结构化 DSL 生成，可控、可编辑、稳定

## 核心能力

每一页落到 `1280×720`（或 `1024×768` / 自适应竖屏）画布上；layout / block / utilities 全部由 Zod schema 严格定义，运行时按白名单过滤。LLM 输出 deck JSON，确定性渲染器渲染——既保留对话生成的灵活，又避免「直接出代码」类工具的脆弱与失控。

### 🎨 11 layout × 16 block × 30+ utility

`hero` / `title-content` / `two-column` / `three-column` / `four-column` / `five-column` / `bullet-list` / `quote` / `cta` / `embed` / `free` 11 种布局；基础 9 种 block（text / heading / image / button / list / badge / iframe / icon / card）+ 高级 3 种（form / modal / tab）+ 数据装饰 4 种（stat / flow / table / chrome）。30+ 视觉变体（毛玻璃 / 阴影 / 底纹 / 文字渐变 / 倾斜 / 浮动）按白名单受控注入；CSS 用 `color-mix` 与主题联动。

### 🤖 多模型多协议接入

Anthropic 原生协议 + OpenAI 兼容协议（一份代码覆盖 9 个预设：OpenAI / Deepseek / Kimi / 智谱 GLM / 阿里通义千问 / SiliconFlow / Google Gemini / 小米 MiMo / 自定义 baseURL）。模型按能力分槽（**全能 / 仅文本 / 全模态**），用户可自定义路由优先级，图片识别等场景自动路由到多模态槽。Anthropic system prompt 打 `cache_control: ephemeral`，多轮编辑命中率 > 90%。

### ⚡ 边生边渲 + 长文档分批

自研 `streamParser` 扫 partial JSON 中 `"slides":[` 数组对象边界，每识别到一个完整 slide 先经 `SlideSchema` 单页校验，通过则即时入 store 渲染——首页通常 **1-2 秒**内落地。长文档（≥ 2000 字 + ≥ 3 段标记）自动分批生成，每批 3 页，瘦身 contextDeck 让续接 input token 从 ~6000 降到 ~2000，10 页 deck 从 10 次往返压到 4 次（3+3+3+1），prefill 成本 -60%。中断保留已生成部分，⌘Z 一步回到生成前。

### 🖼️ 配图体系（picsum + Pexels）

LLM 自主决策何时配图（介绍 / 产品 / 概念性内容应当配图，数据 / 流程 / 编号清单 / 终页 cta 不加图），写出 `picsum.photos/seed/{slug}/{w}/{h}` 占位 URL（永远 200，不会 404）。配置 Pexels API key 后后台异步用 slug 关键词查真图替换——用户先看到 deck，几秒后无感升级。图与文字色彩冲突防护是必须而非可选：image 作 background 时 heading 强制加 `hxs-text-glow` 或外包玻璃卡承托。

### ✨ 视觉模式 Pattern + 风格能力包 Skill

10 个内置视觉模板（`patternsBuiltin.ts`：暗色光晕 hero / stat 三宫格 / mac 窗口封面 / 卡片色带 / 编号四色 / 对比表格 / 痛点对比 / 三步流程 / 大字金句 / 暗色 CTA），用户可整 slide 写 `patternRef:"<id>"` 引用复用 layout/utilities，仅用 blocks 字段覆盖文案。6 个内置风格能力包（`skillsBuiltin.ts`）含触发词 + systemAddon 600-1200 字配方 + 推荐 pattern fewshot；用户消息命中触发词自动注入。从图片新建 Pattern + Skill 双产物对话框，零代码扩张库容量。

### 🌐 i18n 全量双语（zh-CN / en）

UI + 系统 prompt + 内置库（pattern / skill / style）名字与描述 + 错误提示 + 进度条文案 + 示例 deck **全量** zh-CN + en 双语。BASE_SYSTEM_PROMPT（DSL 文档，~5K token）保留中文不动节省 token；CREATIVE_ADDONS（创意附录与示例 deck）按用户语言切 ZH/EN；末尾输出语言指令独立注入。首次访问按 `navigator.language` 自动检测，用户切换写入 `localStorage` 持久化优先。

### 🛡️ 双层对比度防护

- **编辑器实时**：DeckPanel 显示 bg↔fg / bg↔primary 对比度数值（WCAG 2.x）+ 4 档徽章；< 4.5 时琥珀警告 + 一键自动修正前景
- **生成态自动归一**：`processToolCall` 在 deck 校验通过后自动跑 `normalizeThemeContrast`——dark 模式下 fg 与 bg 对比 < 3:1 时替换为安全色，避免 LLM 偶发出「暗夜配深字」灾难

### 📦 三选一发布形态

- **导出 zip**：浏览器内打包 + 4 平台（Cloudflare Pages / Vercel / Netlify Drop / Surge.sh）一键命令
- **Cloudflare 一键直传**：自部署 Worker 持 token，浏览器永远拿不到 API key，几秒拿到部署 URL
- **导出 PDF**：`html-to-image` 截图 + `jspdf` 拼装，会议留档 / 邮件分享场景

### 🧠 单机优先 · 隐私可控

所有数据（deck / LLM token / Pexels API key / 历史 / 案例 / 风格 / Pattern / Skill / 模型配置 / 语言偏好）仅存浏览器 `localStorage`，不上传任何服务器。除 LLM 调用、发布部署、Pexels 图源查询外，编辑全程可离线。

## 性能与体验数据

| 指标 | 数值 | 备注 |
|---|---|---|
| 首页落地（流式按页边生边渲） | **1-2s** | streamParser 单页校验通过即入 store |
| 单 deck 渲染首屏 | **< 1s** | 主包 gzip ≈ 282KB（编辑器 + 两家 SDK + jszip + qrcode） |
| Runtime 模板（独立站） | gzip ≈ 127KB | 不含编辑器代码 |
| 长文档分批模式首屏 | **≤ 2.5s** | 首批小 prefill；30 页 deck 输入 token 控制在合理范围 |
| Anthropic Sonnet 4.6（cache 命中） | 首字节 **< 1s** | system prompt `cache_control: ephemeral`，多轮编辑命中率 > 90% |
| Anthropic Sonnet 4.6（cold cache） | 首字节 ~2-3s | 首次或 5 分钟空闲后 |
| OpenAI / GPT-4o | 首字节 ~0.8-2s | 自动 prefix cache，命中率高 |
| DeepSeek / Kimi（OpenAI 兼容） | 首字节 ~2-5s | 服务端自动 prefix cache |
| 国产服务（mimo / Qwen 等） | 首字节 ~4-12s | 部分服务无 prefix cache，建议调高 max_tokens |

**生成速度优化项（已上线）**：

- 翻译模式自动判定：用户消息 ≥ 800 字符 或 估算 ≥ 8 页时砍掉 CREATIVE_ADDONS（约 4-5K input token），prefill 提速 30-40%
- Skill 注入位置：从 system prompt 末尾改为 user message 头部，让 system prompt 在不同 skill 切换时保持稳定，cache 命中率从 ~70% 提升至 ~95%
- 进度条 prompt size chip：实时显示本次（或本批）prompt 体积 + 分段（system / skill / style / aspect / pages / user msg）+ token 估算，便于持续优化

## 快速开始

**方式 A — 使用 CLI(推荐)**

```bash
npx @huaxushuo/cli init huaxushuo   # 拉取最新模板并自动安装依赖
cd huaxushuo
pnpm dev                            # 启动编辑器 http://localhost:5173
```

> CLI 默认在 scaffold 后自动跑 `pnpm install`,如需跳过加 `--no-install`。

> CLI 包:[`@huaxushuo/cli`](https://www.npmjs.com/package/@huaxushuo/cli) · 3.9 KB · 支持 `init` / `dev` / `build` / `publish`

**方式 B — 克隆源码**

```bash
git clone https://github.com/far422194/huaxushuo.git
cd huaxushuo
pnpm install                        # pnpm workspace,一次装齐所有子包
pnpm dev
```

首次进入：

1. 点顶栏「配置」→「模型」→ 新建一个模型配置（Anthropic 或 OpenAI 兼容均可）
2. 在主对话框输入需求（如「做一份小米 SU7 春季发布会演示，5 页」）
3. 等首页 1-2 秒落地、剩余页面流式追加
4. 进入编辑器继续对话微调（patch）/ 属性面板手动改 / 撤销重做
5. 点「发布」三选一：zip 导出 / Cloudflare 一键直传 / PDF

可选：「配置」→「图库」→ 填 Pexels API key，让 deck 生成时自动用 slug 关键词查真图替换 picsum 占位图。

## 仓库结构

pnpm workspace · 根目录 `pnpm install` 一次装齐所有子包。

| 路径 | 说明 |
|---|---|
| [`client/`](client) | Vite + React 18 + TS + Tailwind 编辑器与渲染器;双入口(编辑器 / 独立站 runtime) |
| [`shared/`](shared) | DSL 类型与 Zod schema、内置示例 deck、共享工具函数 |
| [`cli/`](cli) | [`@huaxushuo/cli`](https://www.npmjs.com/package/@huaxushuo/cli) 脚手架源码:init / dev / build / publish |
| [`server/cf-deploy-worker/`](server/cf-deploy-worker) | 可选自部署 Cloudflare Worker,用于「一键直传 Pages」隐藏 API token |
| [`server/llm-proxy-worker/`](server/llm-proxy-worker) | 可选 Cloudflare Worker:LLM API 透传代理,绕开 CORS / 稳定性问题 |
| [`docs/`](docs) | PRD(产品需求文档)、DSL 设计文档 |
| [`design/`](design) | 原型设计(.pen 文件) |
| [`tests/`](tests) | 测试 |
| [`scripts/`](scripts) | 构建 / 发布脚本 |

## 开发命令

从仓库根目录(workspace,无需 `cd client`):

```bash
pnpm install            # 安装所有子包依赖
pnpm dev                # 启动编辑器(http://localhost:5173)
pnpm typecheck          # TypeScript 类型检查(含 cli)
pnpm build              # 生产构建
pnpm build:runtime      # 单独构建独立站 runtime 模板(注入 deck 后即可发布)
pnpm lint               # 代码风格检查
pnpm cli:build          # 构建 @huaxushuo/cli
```

针对单个子包可用 `pnpm --filter <name> <script>`,如 `pnpm --filter @huaxushuo/cli build`。

部署 Cloudflare 一键直传 Worker(可选,仅当用「一键直传」发布形态时需要):

```bash
cd server/cf-deploy-worker
# 编辑 wrangler.toml 填 CF_ACCOUNT_ID + DEFAULT_PROJECT
npx wrangler secret put CF_API_TOKEN  # 粘贴 token(仅 Pages:Edit 权限)
npx wrangler deploy                   # 拿 Worker URL
```

详细步骤见 [`server/cf-deploy-worker/README.md`](server/cf-deploy-worker/README.md)。

## 文档

- [产品需求文档（PRD）](docs/PRD.md) — 完整功能范围、关键约束、决策记录、未尽事项
- [DSL 设计文档](docs/DSL.md) — Zod schema 与渲染契约
- [项目进展（SUMMARY）](SUMMARY.md) — 按时间倒序的功能演进与设计决策

## 路线图

**短期**：
- ProviderSettingsDialog 内部全量 i18n 收尾
- 长文档分批 + 配图比例的实证调优
- 图源扩展：Unsplash / Pixabay 等 provider 接入（架构已留扩展位）

**中期**：
- 内容案例 / 风格 / Pattern / Skill / 模型配置 / 图源 API key 的导入导出（设备间共享）
- 自定义 CSS（受限白名单）+ 自定义字体上传
- 视频背景 + Lottie 动画

**长期 / v2**：
- 协作 / 用户系统（需服务端）
- 表单的服务端持久化

更多见 [PRD §3.3 计划中](docs/PRD.md#33-计划中已确认方向)。

## 致谢

- [Anthropic Claude](https://www.anthropic.com/) · [OpenAI](https://openai.com/) · [DeepSeek](https://www.deepseek.com/) · [Moonshot Kimi](https://www.moonshot.cn/) · [智谱 GLM](https://open.bigmodel.cn/) · [阿里通义千问](https://dashscope.aliyuncs.com/) · [SiliconFlow](https://siliconflow.cn/) · [Google Gemini](https://ai.google.dev/) · [小米 MiMo](https://api.xiaomimimo.com/) — 多模型支持
- [Pexels](https://www.pexels.com/api/) — 关键词图源
- [Picsum](https://picsum.photos/) — 决定性占位图源
- [lucide-react](https://lucide.dev/) — 60 个白名单图标
- [framer-motion](https://www.framer.com/motion/) — 转场与 Magic Move 飞行
- [Zod](https://zod.dev/) — DSL schema 校验
- [JSZip](https://stuk.github.io/jszip/) · [html-to-image](https://github.com/bubkoo/html-to-image) · [jspdf](https://github.com/parallax/jsPDF) — 发布流水线

## License

MIT
