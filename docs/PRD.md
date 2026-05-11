# 华胥说 · 产品需求文档（PRD）

> 版本：0.7
> 最后更新：2026-05-09

## 1. 产品定位

**一句话**：用一句自然语言生成可交互、可分享的演示网站。

**面向场景**：
- 产品发布（B2B/B2C 新品上线，比 PPT 更有交互、比建站更轻）
- 内容讲解（课程/培训/科普）
- 概念原型分享（创业者向投资人/团队展示）

**与同类产品的差异**：
- vs PPT：可点击、有动效、有变量状态
- vs Gamma/Tome：更偏"可交互的产品原型演示"，而非纯静态 deck
- vs Figma：不要求设计能力，自然语言驱动
- vs v0/bolt.new：结构化 DSL 生成，可控、可编辑、稳定，不是直接出代码

## 2. 核心用户旅程

```
首页（对话框 + 风格库 + 内容案例库 + 画幅选择 + 顶栏：历史 / 存储 / 配置（模型 / 图库） / 语言）
  ↓ 选风格 / 上传图参考 / 输入需求 / 选历史会话 / 套用案例填入对话框 / 切换 zh-CN ↔ en
LLM（按能力路由 + 用户 max_tokens + 输出语言指令 + 配图自主决策）生成 deck.json
  ↓ 校验通过、主题对比度自动归一、deck 提交到 store
进入编辑器：左缩略图 / 中画布（ScaleStage 缩放） / 右属性面板 / 右下浮动 ChatPanel
  ↓ 后台异步：picsum 占位图 → 关键词查 Pexels 替换为真图（已配置 API key）
继续对话微调（patch）/ 属性面板手动调 / 撤销重做 / 切换风格 / 复用 Pattern 模板库
  ↓
（可选）提取脱敏框架 → 保存到内容案例库；从图片新建 Pattern + Skill 双产物
  ↓
点"发布"（zip / Cloudflare 一键直传 / PDF 导出 三选一）
  ↓
浏览器内打包 zip（注入 deck，patternRef 预展开）→ 4 个平台部署命令
或：浏览器 → 自部署 Worker → CF Pages Direct Upload API 自动直传
或：html-to-image 截图 + jspdf 拼装为 PDF
```

## 3. 当前功能范围

### 3.1 已上线

#### 3.1.1 演示生成与渲染
- 自然语言生成演示（默认 4-7 页，可显式要求 20+，长文档按段标记自动分批生成）
- **11 种布局**：hero / title-content / two-column / **three-column** / **four-column** / **five-column** / bullet-list / quote / cta / embed + **free**（自由布局，每个 block 用 position 百分比绝对定位，编辑器内可鼠标拖动到任意位置；一键从其他 layout 转换并保留当前实际位置）
- **12 种 block**：基础 9 种（text / heading / image / button / list / badge / iframe / **icon** / card）+ 高级 3 种（form / modal / tab）
  - icon 用 lucide-react，60 个白名单图标，按 tone 取主题色变量自动联动风格
  - 多栏布局支持 `column: col1-col5`（向后兼容 left/right/center）；带列宽自适应与全宽 center 头部行
- **30+ 视觉变体 utilities 白名单**：所有 block 与 slide 都可加 `utilities?: string[]`（≤8 个），运行时按白名单过滤。9 个分类：毛玻璃 4 / 阴影 5 / 边框 3 / 形状 2 / 底纹 5（网格/点阵/斜线/噪点/径向）/ 文字 3（渐变/发光/字距）/ 间距 2 / 动画 3（脉冲/浮动/悬浮）/ 旋转 3。CSS 用 `color-mix` 取主题色，自动随风格联动；老浏览器降级；尊重 `prefers-reduced-motion`
- **5 种交互动作**：next / prev / jumpTo / openLink / setVar
- 文本变量插值 `{{varName}}` + 跨页状态联动
- 键盘 / 鼠标导航
- **6 种转场动效**：none / fade / slide-left / slide-up / zoom / **magic（Magic Move 飞行过渡）**
- **转场时长可调**（每页独立设 0–3000ms，未设则用类型默认）
- **3 种画幅模式**：`auto`（Web 全屏自适应可滚动）/ `16:9`（默认 · 宽屏 PPT）/ `4:3`（标准 PPT）
  - 固定画幅严格 overflow-hidden 不允许溢出；ScaleStage 用 1280×720 / 1024×768 固定 viewport + transform-scale 等比缩放居中，保证整页内容完整可见
  - system prompt 在固定画幅时强约束：block ≤ 5、heading ≤ 14 字、text ≤ 60 字、list ≤ 6 条、嵌套 ≤ 3、内容多主动拆页；底部预留 80-100px 安全区避让进度胶囊
- 主题色 + 字体（中文优先字体栈：Inter → 苹方 / 思源黑体 / 微软雅黑）+ 圆角配置；亮色 / 暗色双模式
- **对比度防护（双层）**：
  - 编辑器实时显示：DeckPanel 显示 bg↔fg / bg↔primary 对比度数值（WCAG 2.x）+ 4 档徽章；< 4.5 时琥珀警告 + 一键自动修正前景
  - **生成态自动归一（兜底）**：`processToolCall` 在 deck 校验通过后自动跑 `normalizeThemeContrast`——dark 模式下 fg 与 bg 对比 < 3:1 时替换为安全色（#f1f5f9）；muted 与 bg 对比 < 2.5:1 时替换；不达标主题被静默修复后再提交，避免 LLM 偶发出"暗夜配深字"灾难
- **配图（默认必须有，AI 自主判断）**：image block url 强制走 `https://picsum.photos/seed/{slug}/{w}/{h}` 占位（永远 200，不会 404）；介绍 / 产品 / 概念性内容应当配图（hero 全屏底图 opacity 0.4-0.55 + two-column 内联），数据 / 流程 / 编号清单 / 终页 cta 不加图。除用户明确说"不要图 / 纯文字"外不允许 0 配图
- **配图色彩冲突防护**：图本身有不可预知色彩（picsum / Pexels 都是随机摄影图），任何裸 heading + text 直接漂在 image background 上都可能瞬间被吃掉。Prompt 规则强制：image 作 background 时 heading 必须加 `hxs-text-glow` 描边发光，或外包一层 `hxs-frost`/`hxs-frost-dark`/`hxs-translucent` 玻璃卡承托；slug 与主题色配合（dark 主题选深底图 slug、light 主题选明亮素材，避免深主题配蓝天图吃掉浅色 fg）

#### 3.1.1a 视觉精修
- system prompt 内置「视觉设计原则」：大胆字号、强对比渐变、避免单调居中、善用 badge 制造节奏、每 3-4 页一个"重击页"、首页必用 hero+badge+渐变、CTA 短而硬、消除营销废话
- block 视觉升级：heading H1 7xl + tracking-tighter；button 厚阴影 + hover 上浮；card 大内边距 + 24px 厚阴影；badge uppercase + 拉宽字距；list 大色点 / 有序列表 `01 02 03` 大号编号
- layout 节奏精修：hero/cta gap-10 + 居中堆叠节奏感；quote 左上右下大引号装饰（主色 18% 透明度）；two-column 列间 gap-12；CTA 自动按钮组横排

#### 3.1.1b 高级交互块（form / modal / tab）
- **form**：`formId`（CSV 分组键）+ 1-10 个字段；7 种字段类型（text/email/textarea/select/checkbox/number/radio）；提交后行为可选「停留显示成功提示」「下一页」「跳到指定页」；提交存浏览器 localStorage（同源，编辑器与发布站点各自独立）
- **modal**：触发按钮（4 种 variant）+ portal 弹窗（含 ESC/遮罩关闭、淡入缩放动画）；弹窗内容支持基础 7 种 block + form
- **tab**：1-6 个 tab，每个 tab 含独立 `blocks[]`；切换有底线指示器（layoutId 平滑过渡）；子块同 modal
- **嵌套约束**：modal/tab 内不能再嵌 modal/tab/card 自身；form 不嵌套其他 block（fields 即内容）
- **提交记录管理**：编辑器 Toolbar 加 `Database` 入口 → FormSubmissionsDialog 按 formId 分组、表格视图、单条删除、批量清空、UTF-8 BOM CSV 导出
- **限制说明**：发布站点提交存访客本机 localStorage，演示者无法直接看到。仅适合"演示中收集体验反馈"，不适合生产数据收集

#### 3.1.2 多大模型接入（按能力分槽 + 用户路由配置）

浏览器直连，token 仅存 localStorage。

##### 3.1.2a 协议
- **Anthropic 协议**：Claude（默认 Sonnet 4.6）—— 多模态 content 用 `{type:"image", source:{type:"base64",...}}`
- **OpenAI 兼容协议**（一份代码覆盖 8 个预设服务 + 自定义）：OpenAI GPT · Google Gemini · DeepSeek · 智谱 GLM · 阿里巴巴 Qwen · 月之暗面 Kimi · MiniMax · 小米 MiMo · 自定义 baseURL/model
  - 多模态 content：`{type:"image_url", image_url:{url:"data:image/...;base64,..."}}`，与 MiMo 等服务文档对齐
  - 流式累积 assistant 消息严格规范化：补 `role:"assistant"`、tool_calls 时 content 设 null、避免空 tool_calls 数组（解决部分严格服务 400 Param Incorrect）

##### 3.1.2b 模型能力档位
每个 ModelConfig 必填一个 `capability`：
- **全能型（general）**：文本 + 图像识别（Claude / GPT-4o / Gemini / Qwen-Max / GLM-4-Plus）
- **强推理（text-only）**：纯文本推理（DeepSeek-V3、Kimi 等）
- **全模态（multimodal）**：文本 + 图像 + 视频 + 音频（小米 MiMo / Qwen-Omni 等）

PRESETS 自带合理的 capability 默认值。

##### 3.1.2c 按能力分槽启用
- `LlmSettings.activeIds: { general?, text-only?, multimodal? }` —— 每能力同时只能启用一个，不同能力可同时启用不同模型
- 旧 v2 数据（单 activeId）自动迁移到 `activeIds.general`

##### 3.1.2d 路由优先级配置（用户可自定义）
- 两个场景：**普通生成（默认 全能型 → 强推理 → 全模态）** / **图片识别（默认 全模态 → 全能型 → 强推理）**
- 在配置弹窗顶部 RoutingPriorityEditor 用 ⬆/⬇ 调整顺序，自定义后显示「重置」按钮恢复默认
- `getActiveConfig(scenario)` 按场景顺序查找第一个可用模型，前者未启用自动回退到下一项
- styleGenerator 在有图片时自动走 `image-recognition` 场景

##### 3.1.2e 连接方式（Web 直连 / 后端代理 双模式）
- 每个 ModelConfig 加 `useProxy?: boolean`，FormView 顶部「连接方式」段控件让用户选「Web 直连」（默认）或「后端代理」
- **服务预设按连接方式过滤**：每个预设有 `webDirect: boolean` 标记
  - Web 直连：仅展示「自定义 + 5 家已实测稳定」（Anthropic Claude / OpenAI GPT / Google Gemini / 阿里巴巴 Qwen / 小米 MiMo）
  - 后端代理：展示「自定义 + 全部 9 家」（多出 DeepSeek / 智谱 GLM / 月之暗面 Kimi / MiniMax）
- **全局代理 URL**：LlmSettings.proxyUrl 一个；ListView 顶部 ProxyUrlEditor 配置；所有走代理的 ModelConfig 共用
- **后端代理实现**：自部署 `server/llm-proxy-worker`（Cloudflare Worker），透传请求 + CORS + SSE 流式；token 由客户端透传不持久；ALLOWED_TARGETS 白名单可选
- **客户端工厂** `client/src/llm/clientFactory.ts` 把"是否走代理"决策从 14 处 SDK 创建点收口；走代理时 baseURL=proxyUrl + 注入 X-LLM-Target header
- 老数据兼容：无 useProxy 字段时按 baseURL 反推 PRESET 的 webDirect 取反作初值
- 大陆用户访问 `*.workers.dev` 子域不稳时，README 引导绑 CF Custom Domain（免费）

##### 3.1.2f 配置 UI（ProviderSettingsDialog）
- 列表态：左侧绿/灰圆点显示启用状态 + capability 彩色徽章（蓝/灰/紫）+ 启用按钮（active 时变红色「停用」）+ Copy 一键复制 + 编辑 + 删除
- 列表态可点击外部关闭；编辑/新建表单态仅可通过关闭按钮退出（防误丢失）
- max_tokens 字段支持 override：`computeMaxTokens(estimate, override)` 用户填了直接尊重不再反向 cap；未填用 provider 默认（OpenAI 兼容 8000、Anthropic 32000）；填超过 32000 时显示「过大反而让推理变慢」提示

#### 3.1.3 编辑器
- 三栏布局：左侧缩略图（拖动/复制/删除/上下移）/ 中央画布 / 右侧属性面板
- **画布 ScaleStage**：固定 16:9 / 4:3 画幅时用 1280×720 / 1024×768 固定 viewport + ResizeObserver 动态算 scale 等比缩放居中；内容永远完整可见无滚动，与浏览器 aspect-ratio 实现差异脱钩
- **属性面板三态**：选 deck（标题/主题色/字体/模式/圆角）→ 选 slide（布局/转场类型/时长/背景/备注/添加块）→ 选 block（按 type 分支字段表单 + Magic Move ID + 列归属 + 删除）
- **Magic Move 编辑**：每个 block 可填 magicId，相同 id 的块在两页之间做 Keynote 风格飞行过渡
- **流式生成期间属性面板锁定**：streamingMode 时覆盖半透明遮罩 + loading + 提示，防编辑被流式内容覆盖
- 撤销 / 重做（基于 deck 整体快照，限 50 步）
- 快捷键：⌘Z / ⌘⇧Z 撤销重做、← / → 切页

#### 3.1.4 对话生成

##### 3.1.4a 工具与 Prompt
- 工具调用模式（`create_deck` / `patch_deck`）：首次或重做用 create，已有 deck 时模型优先用 patch（RFC 6902 JSON Patch）
- patch_deck 输入宽容兜底：单个 op 对象自动包成数组 / 字符串 JSON 自动 parse / 别名 `operations`/`ops`/`patch` 自动归一
- Prompt caching：Anthropic system prompt 打 ephemeral cache
- 翻译模式自动判定：用户消息 ≥ 800 字符 或 估算 ≥ 8 页 时砍掉 CREATIVE_ADDONS（约 4000 input token），prefill 提速 30-40%
- 校验失败回灌重试一次（Anthropic 用 `tool_result/is_error`，OpenAI 用 `role:tool`）
- max_tokens 截断检测：finish_reason=length 或 stop_reason=max_tokens 时给具体提示，不浪费重试

##### 3.1.4b 流式按页边生边渲（create 模式）
- 自研 `streamParser` 用 brace 计数 + inString 状态机扫 partial JSON 中 `"slides":[` 数组的对象边界。每识别到一个完整 slide JSON 先经 `SlideSchema.safeParse` 单页校验，通过则即时 `appendStreamingSlide` 入 store 并渲染
- 第一页通常 1-2 秒内落地，后续逐页追加；最终拿到完整 deck 时整体校验作为一次 history 节点提交（⌘Z 一步即可回到生成前）
- 校验失败的单页跳过，等待最终重试；patch 模式不启用边生边渲（patch 通常较小、依赖 path）

##### 3.1.4c 分批生成（长文档优化）
- 触发条件：用户消息 ≥ 2000 字符 + 至少 3 段页边界标记
- 标记识别：兼容任意级别 markdown 标题（`#` 到 `######`）+ 中英文页/部分/章/节关键字 + Page/Slide/Section + 水平分隔线；标记 < 3 时按段落 + 字符数（每 ~1500 字符）自动切段兜底（要求 ≥ 3500 字 + 6 段落）
- **每批 ~3 页**（PAGES_PER_BATCH=3）：10 页 deck 从 10 次往返降到 4 次（3+3+3+1），总 prefill 成本 -60%
- 续接批次传瘦身 contextDeck（去 blocks 仅留 meta/theme/slide 骨架），输入 token 从 ~6000 降到 ~2000
- 分批续接强制走翻译模式 + 用原始文案（非拼装的 batchPrompt）做 estimatePages 与翻译模式判定，避免续接退回普通模式多扛 4000 token
- 中途批次失败保留已生成部分到 history，UI 给警告条不跳 editor

##### 3.1.4d 进度反馈
- Home 与 ChatPanel 都有进度条 + 文案：连接模型 → 模型已开始响应 → 接收数据中 X KB → 正在生成第 N / X 页… → 整理收尾…
- streamingMode 排除骨架占位避免误算"已生成 1 页"；估页用 `matchAll` 取所有「N 页」最大值，不被「## 第 1 页」开头污染
- **本次请求使用的模型**：进度条上显示当前命中模型别名 chip（按场景路由结果）；分批模式下每批前缀 `(批 X/Y)`；时间读秒在编辑器内累加显示该会话总耗时

##### 3.1.4e 中断
- 发送按钮 loading 态切「停止」按钮，底层贯通 `AbortController` → SDK `{ signal }`
- 边生边渲时点击停止：保留已生成的 N 页作为新对话写入 conversation；UI 提示「已停止生成 · 保留已生成的 N 页」
- 中止与错误能区分（`AgentResult.cancelled` vs `error`），错误路径回滚到生成前 deck

##### 3.1.4f 错误诊断
- 400 自动降级 max_tokens 重试 2 次（80000 → 40000 → 20000 → ...）
- 400 抛出时附「请求规模」诊断：system 字符 / token、user/assistant/tool 累积字符（含重试消息计数）、当前 max_tokens；> 32000 提示「偏高会挤压输入空间」
- 鉴权 / 限流 / CORS 友好提示（OpenAI 兼容 + Anthropic 双 provider）
- **Zod union 错误展开**：`formatZodError` 检测 `invalid_union` issue 时递归展开 `unionErrors`，列出每个分支拒绝原因 + 实际收到值快照（截 160 字）。原本 `slides.4.blocks.1.items.0: Invalid input` 之类的无效错误现在变成「分支1: Expected string；分支2 @text: Required ｜ 实际收到：{title:"...",desc:"..."}」，让 LLM 重试有具体上下文

##### 3.1.4g 主题对比度自动归一
- `processToolCall` 在 `DeckSchema.safeParse` 通过后调用 `normalizeThemeContrast`：按 WCAG 相对亮度算 fg/muted vs bg 的对比比，未达 AA-large（fg 3:1、muted 2.5:1）时替换为安全色（dark→#f1f5f9 / #94a3b8；light→#0f172a / #64748b）
- 仅在 LLM 生成路径生效，编辑器手动改主题色不经此处
- 解决 LLM 偶发出 `mode:"dark"` 配过暗 fg 导致正文几乎隐入背景的灾难场景

#### 3.1.5 风格系统（StylePrompt）

影响视觉/语调/排版基准。

##### 3.1.5a 风格分类
- **内置（builtin）**：源码硬编码 **6 个高质量风格**：`bs-dark-notion` / `bs-cyberpunk` / `bs-editorial` / `bs-luxury` / `bs-corporate` / `bs-launch`，每个含 emoji + 主题（colors/fonts/radius）+ 风格指令；i18n 双语显示（dialog:builtinStyles.{id}.{name|description}）。BUILTIN_STYLE_PROMPTS 在模块加载时由源码 hydrate 而来，列表统一管理
- **AI 生成（ai-generated）**：用户在「+ 新建风格」录入文字 + 上传图片 → AI 一键生成；新建保存的风格统一进入此分类（已去掉「我保存的」单独分类，也去掉「转为内置」按钮——内置仅由源码维护）
- 来源筛选 tab：全部 / 内置 / AI 生成

##### 3.1.5b 风格预览
- 每张卡用主题色渲染微缩封面；点卡进 StylePreviewDialog
- 左侧风格指令（user-saved 可编辑） + 主题色矩阵 + 字体/圆角；右侧用此风格渲染 4 页样板 deck，可按用户指令重新生成样板（绕过 store / 不污染历史栈）

##### 3.1.5c 自定义风格
- 输入：文字描述 +/或 参考图片（最多 3 张，单张 ≤ 5MB，base64 内嵌发给视觉模型）
- AI 一键生成：模型综合识别图片色彩/字体/留白/装饰/氛围 + 文字补全 emoji + 主题色（5 色）+ 字体 + 圆角 + 模式 + 150-250 字风格指令（指令式）
- AI 生成中显示当前命中模型名（按 image-recognition 场景路由）
- 预览 → 微调 name/description → 保存

##### 3.1.5d 风格管理
- Trash（红）：从 storage 删除（所有动态来源都允许；源码内置不可删）
- 移除「Pin 转为内置 / PinOff 取消内置」按钮——内置由源码硬编码维护，避免用户误改导致内置库混乱
- Pattern 模板库同样移除 Pin/PinOff 转内置功能（保持一致心智）

##### 3.1.5e 使用基准
选风格后对话框旁显示 chip，生成时把风格指令 + 主题硬性约束注入 system prompt。

#### 3.1.6 内容案例库（ContentPrompt）

描述演示主题/结构。

- 内置为空，按需让 AI 生成（一次 8 个，主题均衡分布）
- **选案例 = 填入对话框**（不直接发送，方便用户编辑后再生成）
- **从已生成 deck 一键提取脱敏框架**：替换品牌/人名/具体 URL/具体数字 → 占位符（保留页数、章节、叙事节奏、视觉风格倾向）→ 编辑后保存
- 删除单条 / 来源筛选（全部 / 内置 / AI 生成）

#### 3.1.7 首页 Home
- 顶部入口（左→右）：当前模型徽章 / 历史 / 存储管理 / **配置（下拉：模型 / 图库）** / 语言切换（zh-CN ↔ EN）
  - 「配置」是聚合按钮，点击展开下拉，菜单两项「模型」「图库」分别打开 ProviderSettingsDialog（模型槽 + 路由优先级）与 ImageLibraryDialog（图源列表式管理，当前 Pexels）
  - 下拉宽度与按钮自动对齐，点击外部自动关闭
  - 语言切换走 LanguageSwitcher 段控件，即时生效不重启
- 中央：欢迎语 + 大对话框（Enter 发送 / Shift+Enter 换行）+ 已选风格 chip + 画幅选择（16:9 / auto / 4:3）+「试试 Magic Move 示例」（按当前 i18n 语言加载对应版本示例）
- 下方：风格 / 内容案例双 Tab + 来源筛选（全部 / 内置 / AI 生成）+ 「+ 新建风格」（虚线卡片）/「AI 再生成一批」（仅内容 tab）
- 风格 tab 默认进入；点风格卡进预览弹窗
- 流式生成不提前切 view，全部完成才切到 editor，避免用户看到半成品

#### 3.1.8 对话历史
- 自动持久化每个会话（最多 50 条）：完整消息流 + 最终 deck 快照 + 时间戳 + 累计耗时
- 编辑器内多轮调整时 `durationMs` 累加（不覆盖），历史里展示真实总耗时
- HistoryDialog：左列表（标题/相对时间/消息数/页数/总耗时）+ 右详情（消息流 + 「在编辑器中打开」恢复 deck + 删除）
- 三处入口：Home 顶部 / ChatPanel header / Editor Toolbar

#### 3.1.9 发布
- 浏览器内打 zip：注入当前 deck.json 到预构建 runtime 模板 → 触发自动下载
- zip 内含独立可运行的 `index.html` + `assets/` + `README.md`（4 个平台一键部署命令）
- 4 个目标：Cloudflare Pages / Vercel / Netlify Drop / Surge.sh —— PublishDialog 内提供命令一键复制

#### 3.1.10 国际化（i18n · 简体中文 + 英文）

##### 3.1.10a 覆盖范围
- **全量双语**：UI 文案 + 系统 Prompt（创意附录与示例 deck 双语）+ 错误提示 + LLM 输出语言引导 + 进度条文案（`chat:phase.*`）+ 大模型设置弹窗 + 内置库（patterns / skills / styles）名字与描述
- **拆分混合策略**：`BASE_SYSTEM_PROMPT`（DSL 语义/约束/工具说明，~5000 字）保留中文不动；`CREATIVE_ADDONS`（创意原则 + 内嵌 fewshot JSON 示例 deck）按用户语言切 `_ZH` / `_EN` 两份
- **输出语言指令**：在 system prompt 末尾注入「最终输出 deck 内所有用户可见文案一律使用 X 语言」（来自 `prompt-meta.json`，由 i18next.t 取）；用户消息显式「请用 X 语言生成」时优先级最高

##### 3.1.10b 语言检测与切换
- **首次访问**：自定义 detector 顺序 `usePreferences.language` → `navigator.language`（前缀匹配 zh→zh-CN，其余→en）→ `zh-CN` 兜底
- **持久化**：用户切换写入 `localStorage["hxs.preferences"]`，刷新保持
- **入口**：Home 顶栏右上角段控件 `[简 | EN]`（`LanguageSwitcher compact`）；点击即时生效不重启
- **流式生成中切语言**：i18next 切换是同步的，但已发出的 LLM 请求不会被中断，下次请求生效

##### 3.1.10c 翻译命名空间（7 个）
| ns | 用途 |
|---|---|
| `common` | 全局复用按钮、确认/取消、语言名 |
| `home` | Home 页（hero 标题、对话框、Magic Move demo 按钮） |
| `editor` | Toolbar / BlockPanel / InlineBlockEditor / SlideList / Canvas / 11 个 layout 名 / 16 个 block 名 |
| `dialog` | Publish / Provider / EnhanceCapability / NewStyle / StylePreview / PatternPicker / **ImageLibrary** / **config** 入口 |
| `chat` | ChatPanel + 流式状态 + `phase.*` 进度文案 |
| `error` | anthropic.ts / agent.ts / publish/directUpload.ts |
| `prompt-meta` | 注入 LLM 的输出语言指令 |

##### 3.1.10d 双语示例 deck
- `shared/examples/zh-CN/{04-magic-move,05-creative-deck}.json` + `shared/examples/en/{04-magic-move,05-creative-deck}.json`
- `05-creative-deck` 用于 LLM fewshot：6 页（quote / hero / two-column / bullet-list / free / cta），含 2 处配图示范（hero 全屏底图 + two-column 内联 image block）
- 加载点 `loadMagicMoveDemo` 按 `getCurrentLang()` 切对应版本

#### 3.1.11 图库系统（图源接入 · 当前 Pexels）

##### 3.1.11a 工作流
1. LLM 按 prompt 输出 `https://picsum.photos/seed/{slug}/{w}/{h}` 占位图（永远 200，不会 404）
2. deck 校验通过、提交到 store、用户立即看到首版渲染（picsum 决定性返回）
3. **后台异步**（`generate()` 末尾 fire-and-forget）：
   - `buildImageSubstitutions(deck)` 扫所有 picsum URL，按 slug 还原为关键词、按 URL 比例选 orientation（landscape/portrait/square）
   - 并发查 Pexels API（同 query+orientation 进程级缓存）
   - 命中后调 `useEditorStore.replaceImageUrls(substitutions)` 一次性 swap，UI 自然刷新
   - 失败 / 限流 / 未配置 key → 静默吞，picsum 仍能加载（零回归）

##### 3.1.11b 图源管理 UI（ImageLibraryDialog）
- 列表式呈现 provider，每行：logo + 名字 + 描述 + 已配置/未配置徽章 + 编辑按钮
- 点编辑展开内嵌表单：API Key 输入（password 类型）+ 测试连接按钮 + 保存按钮 + 清除链接 + 申请链接
- 当前列表只有 1 项 Pexels；架构留扩展位（`PROVIDERS` metadata 数组：`id, label, description, applyUrl, getKey/setKey/testKey`），未来可加 Unsplash / Pixabay / 自建图床——只需新建一个 `<provider>.ts` + 在数组追加一行
- 入口：Home 顶栏「配置」下拉 → 「图库」

##### 3.1.11c Pexels 接入细节
- API key 仅存 `localStorage["hxs.pexels_api_key"]`，永不上传到任何服务器
- `searchPexelsPhoto(query, orientation)` 走 `https://api.pexels.com/v1/search`，返回 5 张随机一张（避免同 deck 多页雷同）
- `testPexelsApiKey` 用最小请求探测连通性（401/403 → 无效）
- 免费 tier 限流 200 req/h、20K req/月；同 deck 内同 query 命中缓存只算 1 次

##### 3.1.11d store 层 `replaceImageUrls`
- 不入历史栈（被动增强不该消耗 undo step）
- 递归 walk slide.background + 所有 block.url（含 card / modal / tab 嵌套子块）

#### 3.1.12 视觉模式 Pattern + 风格能力包 Skill（创造性沉淀）

为解决 DSL 枚举式扩张瓶颈（每加一种视觉就要改 4 处源码），引入"创造性沉淀"基础设施：让"创造性"通过 Pattern 复用 + Skill 配方实现，DSL 仍保持结构化与确定性渲染。

##### 3.1.12a Pattern（视觉模式样板）
- 数据层 `client/src/data/patterns.ts`：内置 / 用户保存 / AI 生成三类来源 + localStorage 持久化；按 createdAt 倒序统一展示
- 内置 10 个高质量样板（`patternsBuiltin.ts`）：dark-glow-hero / stat-grid-3 / mac-window-cover / card-list-bars / numbered-quad-tone / dark-comparison-table / painpoint-vs-solution / flow-3step / bold-quote-glow / dark-cta-glow，每个含 1 页 slide 主体（不含 deck.theme 让用户主题透出）
- 入口：Toolbar「模板」按钮 → PatternPicker（网格 + 类别 + 来源筛选 + 缩略图）
- 两种插入粒度：「完整插入」展开为 self-contained 页面 / 「以 patternRef 引用」让 pattern 修改时所有引用页面自动跟随
- 移除「转为内置」按钮（与 style 心智一致：内置由源码维护）

##### 3.1.12b Skill（按需 prompt 配方）
- 数据层 `client/src/data/skills.ts`，内置 6 个：dark-notion-tutorial / dark-cyberpunk / editorial-magazine / minimal-luxury / corporate-pitch / launch-fanfare
- 每个 skill 含 triggers[4-8] + systemAddon[600-1200 字] + recommendBlocks + recommendUtilities + recommendTheme + fewshotPatternIds（引用对应 pattern 作 fewshot）
- 命中机制：用户主动选 `opts.skillId` 优先；否则 `matchSkill(userMessage)` 按触发词字符串包含匹配；翻译模式（forceTranslationMode）不注入避免续接每批多扛体积
- `buildSkillAddon` 把 skill 配方 + 推荐 pattern 完整 JSON 拼到 system prompt 末尾

##### 3.1.12c Schema 微开口
- `SlideSchema.patternRef?: string` 一个新可选字段
- `renderer/expandPattern.ts`：`expandSlide(slide, resolver)` 把 pattern 作为 base 与 slide override 合并；`expandDeck` 整 deck 一次性预展开（发布前调用）
- runtime 不需要 pattern 库（发布产物已 self-contained）

##### 3.1.12d 自助扩充：从图片新建 Pattern + Skill
- PatternPicker header 紫色「上传图片新建」按钮 → EnhanceCapabilityDialog
- 1-3 张截图（≤ 5MB 单张）+ 可选 brief → 走 `image-recognition` 路由 → LLM 一次输出 pattern + skill 双结构
- ready 态左 pattern 预览 + 右 skill 编辑；底部 4 按钮（两者都保存 / 仅 pattern / 仅 skill / 重生成）

### 3.2 不做（暂排除）
- 多人协作、版本历史、评论
- Keynote 导出（PDF 导出已上线，见 §3.1.9）
- 第三种语言（日韩等）—— 当前 zh-CN + en 满足主要需求
- 用户系统、付费、企业级权限/审计
- 表单的服务端持久化（演示者直接看到访客提交需要后端，本期仅本地 + CSV 导出）
- LLM 端真实图像生成（DALL-E / SD）—— 本期用 picsum 占位 + Pexels 关键词替换的"两段式"方案，零额外集成；用户已确认是更适合「演示稿配图」场景的方案

### 3.3 计划中（已确认方向）
- 自定义 CSS（受限白名单）+ 自定义字体上传（base64 内嵌，单文件 ≤ 1MB）
- 视频背景 + Lottie 动画（外链 URL）
- 内容案例 / 风格 / Pattern / Skill 的导入导出（在不同设备间共享）
- 图源扩展：Unsplash / Pixabay 等接入（架构已留扩展位，新增 provider 仅需新建一个 `<provider>.ts` + 在 `PROVIDERS` 数组追加一行）
- 翻译模式下 image block 形态的细化指令（避免 LLM 在长文档分批续接时塞过多图）
- ProviderSettingsDialog 的全量 i18n（当前内部仍中文为主，与图库 dialog 不一致）

## 4. 关键约束

- **隐私**：单机模式，所有数据（deck、LLM token、Pexels API key、历史、案例、风格、Pattern、Skill、模型配置、语言偏好）仅存 localStorage，不上传任何服务器
- **离线**：除 LLM 调用、发布部署、Pexels 图源查询外，编辑全程可离线
- **性能**：
  - 单 deck 渲染首屏 < 1s
  - 主包 gzip ≈ 282KB（含两家 SDK + jszip + qrcode + Tailwind + 11 layouts + 12 blocks）
  - runtime 模板 gzip ≈ 127KB
  - 长文档分批模式首屏 ≤ 2.5s（首批小 prefill）
- **成本**：依赖用户自带的 LLM API Key；分批模式 + 翻译模式 + contextDeck 瘦身让 30 页大 deck 输入 token 控制在合理范围；启用 prompt caching 多轮编辑命中率 > 90%
- **页数 / 块数**：DSL 不再硬限页数，**也不再硬限每页 block 数量**（编辑器允许任意数量）；system prompt 给"建议密度"约束让模型自我克制（默认每页 4-6、固定画幅约 5、留白布局 3、≥ 8 页紧凑模式 ≤ 4 + utilities ≤ 3）；明确要求多页时按数量生成
- **画幅**：默认 `16:9`（PPT 主流）；可改 `auto`（Web 自适应可滚动）/ `4:3`；固定画幅严格不溢出，由 ScaleStage 缩放保证整页可见
- **生成体验**：所有 LLM 调用首轮 streaming，避免长时间空白等待；进度条显示当前命中模型别名 + 累加耗时；进度条文案全 i18n（`chat:phase.*`）跟随当前语言
- **i18n 默认策略**：首次访问按 `navigator.language` 自动检测（zh-* → zh-CN，其余 → en）；用户切换后 `localStorage` 持久化优先级最高；BASE_SYSTEM_PROMPT（DSL 速览）保留中文不变（节省 token），CREATIVE_ADDONS（创意附录与示例 deck）按目标语言选 ZH/EN
- **配图策略**：默认每份 deck 至少 1-2 页带配图；介绍 / 产品 / 概念性内容应当配图，数据 / 流程 / 编号清单 / 终页 cta 不加图；除用户明确说"不要图 / 纯文字"外不允许 0 配图。图源约定 `picsum.photos/seed/{slug}/{w}/{h}` 永远 200，配 Pexels API key 后后台异步替换为关键词匹配真图。图与文字色彩冲突防护是**必须**而非可选——image 作 background 时 heading 强制加 `hxs-text-glow` 或外包玻璃卡承托，因为 Pexels 替换后真图色彩完全不可预测
- **max_tokens 策略**：
  - 用户填了直接尊重 override，不再反向 cap
  - 未填用 provider 默认（OpenAI 兼容 8000、Anthropic 32000）
  - 推荐配置：DeepSeek 8192（上限）、Kimi/Qwen 16K、GLM-4.5/Gemini 32K、Sonnet 4.6 32K-64K、mimo 32K
  - 超 32000 显示「偏高会挤压输入可用空间」提示

## 5. 成功度量

- 30 秒内生成第一份可交互演示
- 端到端发布耗时 ≤ 3 分钟（包含 zip 解压 + npx 命令首次拉取）
- DSL 校验通过率 ≥ 95%（首次生成不需要二次纠正）
- 自定义风格可用率 ≥ 90%（用户录入后生成的风格 contrast/可读性达标）
- 长文档（10+ 页带标记）分批生成首屏 ≤ 2.5s，分批失败可保留已生成部分

## 6. 非目标

- 不做"通用网站生成器"——只做演示场景
- 不做企业级权限/审计
- 不替代设计师做精细视觉
- 不锁定单一 LLM 厂商

## 7. 已解决的设计权衡（决策记录）

| 决策点 | 结论 | 理由 |
|---|---|---|
| 内置风格 | 源码不再硬编码内置，由用户 Pin 提升 | 让"内置"变成用户认证过的、长期保留的风格池 |
| 「我保存的」分类 | 移除，新建风格统一进 AI 生成 | 用户日常分不清"AI 生成"vs"我保存"，合并简化心智 |
| 模型唯一启用 | 改为按能力分槽启用 + 路由优先级配置 | 兼顾「图片识别要走多模态」「日常文本要走通用」两个不冲突的需求 |
| 大模型配置弹窗外部点击 | 列表态可关闭、编辑态不可 | 避免编辑表单时误点丢失输入；列表态保留常规交互 |
| max_tokens 上限 | 不再反向限制，尊重用户 override | 用户调到 80000 后被代码 cap 到 6890 是 bug，已修 |
| 浏览器直传 Cloudflare | 改为「打 zip + 4 平台 npx 命令」 | Direct Upload 多步脆弱（CORS/jwt/manifest），命令行更稳；一键直传留 v2 服务端 |
| 编辑器/预览缩放 | 固定 1280×720 viewport + transform-scale | 与浏览器 aspect-ratio + maxHeight 实现差异脱钩，左右无多余留白 |
| 进度文案 | "已生成 1 页" → "正在生成第 X / Y 页…" | 语义更准；首页落地前还显示连接/思考等原 phase 文本 |
| i18n 拆分式策略 | BASE 中文不动 + CREATIVE 双语切换 + prompt-meta 输出语言指令 | DSL 速览翻译有歧义风险，且占 4-5K token；CREATIVE 创意附录翻译收益最大；输出语言由独立 meta 指令控制更清晰 |
| 图源接入 | picsum 占位 + Pexels 后台异步替换 | LLM 凭空写 unsplash ID 容易 404；picsum seed URL 决定性永远 200；Pexels 用 slug 关键词二次匹配更贴合内容；零额外集成可降级 |
| 主题对比度归一 | 在 processToolCall 后自动 normalizeThemeContrast | LLM 偶发出 dark mode 配过暗 fg 导致正文几乎隐入背景；用 WCAG 算对比比值兜底替换为安全色，零侵入 |
| Zod union 错误展开 | 检测 invalid_union 时递归 unionErrors + 实际值快照 | 默认 "Invalid input" 信息无价值，LLM 重试也是瞎猜；展开后 LLM 能直接定位"缺 text 字段"等具体根因 |
| 顶栏「配置」聚合下拉 | 把模型 + 图库收进一个聚合按钮 | 多能力槽 + Pexels 图源 + 后续扩展使顶栏单按钮信息密度不够；下拉一次点开全部子配置入口 |
| 内置 Style/Pattern Pin 移除 | 移除「转为内置 / 取消内置」按钮 | 内置项由源码硬编码维护；用户 Pin 提升的项与源码混在一起会混乱归属，移除让"内置"与"动态"边界清晰 |
| 配图判断不看长短 | 配图原则放进 BASE 第 10 条，翻译模式不豁免 | 之前在 CREATIVE_ADDONS 里被翻译模式砍掉 → 长文档 0 配图；介绍/产品类内容在长 prompt 下也应该配图 |

## 8. 未尽事项

### 已就位但待打磨
- ProviderSettingsDialog 内部尚未做 i18n（外壳与按钮已 i18n，内部表单文案、CAPABILITY_LABELS 等仍中文）
- panels/SlidePanel + panels/DeckPanel 主题/动效/布局详细字段名仍部分中文
- StyleCard / ExtractPromptDialog / FormSubmissionsDialog 边缘文案部分中文
- 翻译模式下「配图自主判断」实测验证（已修但需要长 prompt 场景验证不会被压力测试退化为 0 图）

### 中期待办
- 图源扩展：Unsplash / Pixabay 等 provider 接入（架构已留扩展位）
- 内容案例 / 风格 / Pattern / Skill / 模型配置 的导入导出（设备间共享）
- 自定义 CSS（受限白名单）+ 自定义字体上传
- 视频背景 + Lottie 动画
- 协作 / 用户系统（v2，需要服务端）

### 持续优化
- 错误状态文案库整理（持续优化中）
- 流式承载期间 SlideList 缩略图刷新节奏可优化
- 实测分批 + 多模态混合场景的稳定性（图片识别 + 长文档分批）
- LLM 在生成长 deck 时配图比例的实证调优（目前 prompt 写 30%-50% 区间，实测可能偏低）
