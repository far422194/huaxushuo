# 项目进展（华胥说）

> 自然语言生成交互式演示网站。MVP 单机 Web 编辑器形态。
> 实施计划归档于 `~/.claude/plans/ppt-lively-patterson.md`，本文档跟踪进展。

## 已完成功能（Week 1 + Week 2 + Week 3 + Week 4 + 业务扩展 + 风格系统 + Magic Move + 转场时长 + 自定义风格 + 流式可中断 + 边生边渲 + 高级交互块 + 编辑体验微调 + 视觉变体白名单 + 编辑/预览/对比度修正 + 大 deck 截断修复 + 体验修复 + computeMaxTokens 修正 + 长文本+风格 速度稳定优化 + Notion 长图风格扩张 + Pattern/Skill 创造性扩展 + 能力补充图片识别 + Cloudflare 一键直传 + 发布与对话历史微调 + SlideList 真缩略图 + PDF 导出 + i18n 多语言 + 配图体系 + Pexels 图库 + 配置入口聚合 + CLI 自动安装依赖 + runtime 模板首启动自检）

### 一键直传报"未找到 __DECK_JSON__ 占位符"修复(最新)

`client/public/runtime-template/` 在 `.gitignore` 内，需 `pnpm build:runtime` 才生成。
首次 `pnpm dev` 直接点"一键直传"时，`fetch('/runtime-template/runtime.html')`
被 Vite SPA fallback 兜底回主站 `index.html`(HTTP 200),里头没有占位符,
触发了误导性的"模板版本不匹配"错误。

**改动**:
- 根 `package.json` 新增 `ensure-runtime` 脚本(对齐已有 `ensure-deps` 模式):
  `[ -f client/public/runtime-template/runtime.html ] || pnpm run build:runtime`
- `dev` 脚本前置 `ensure-runtime`,首次启动按需补建;build/build:runtime 不变
- `client/src/publish/runtime.ts` 报错文案细化:检测响应体若像主站 shell
  (含 `id="root"` 且无 `deck-data`),给出"dev 兜底返回主站 index.html"专属提示,
  否则提示模板过期;两者都明确指引执行 `pnpm build:runtime`

**结论**:之后 `pnpm dev` 第一次开就有 runtime-template,不需要手动 `build:runtime`;
若运行时模板源代码改了导致老产物失效,新错误文案也能精准指路。

### CLI npx scaffold 后自动安装依赖

`npx @huaxushuo/cli init xxx` 之前需要用户手动跑 `cd / pnpm install / pnpm dev` 三步,
对齐 create-vite/create-next-app 的体验,改成 scaffold 后自动安装,最终用户只剩
`cd xxx && pnpm dev` 两步。

**改动**:
- `cli/src/utils/run.ts` 新增 `hasPnpm()` (spawnSync 探测) 和 `installDeps(cwd)`
  (spawn pnpm install,stdio inherit)
- `cli/src/commands/init.ts` 在 `rewriteProjectName` 之后加 `maybeInstall` 分支:
  - `--no-install` → 跳过,引导维持三步
  - pnpm 缺失 → warn 提示 `npm i -g pnpm`,scaffold 不报错,引导降级
  - install 失败(非零退出码) → warn 提示手动装,scaffold 不报错,引导降级
  - install 成功 → outro 提示只剩 `cd` + `pnpm dev`
- `cli/src/index.ts` 注册 `--no-install` flag
- `README.md` / `README.en.md` 同步示例命令(快速开始两段都更新)
- `cli/package.json` version 0.1.0 → 0.1.1

**dogfood 验证**(均通过):
- 默认行为:`init xxx` 自动跑完 pnpm install,引导显示两步
- `--no-install`:跳过装依赖,引导显示三步
- 模拟 PATH 缺 pnpm:scaffold 完成 + warn 提示,不崩溃

### 选题灵感 + 能力包识别按 UI 语言切换

延续 promptExtractor / styleGenerator 双语化，补齐剩余两个 LLM 生成器。

**`promptGenerator.ts`**（演示选题灵感）
- `i18n/prompts/{zh-CN,en}.ts` 加 `PROMPT_GENERATOR_SYSTEM_*`，覆盖任务描述 + 风格约束（"避免营销腔" / "no marketing fluff"）+ 内置案例避重清单
- `getPromptGeneratorSystem(lang)` getter
- 入口 `generatePromptCases` 取 `getCurrentLang()`，`buildTool(lang)` 切换 tool schema description，user message + 错误文案双语；`toCases(raw, durationMs, lang)` title 长度上限中文 16 / 英文 60

**`capabilityGenerator.ts`**（图片识别 → pattern + skill 双产物）
- SYSTEM 极长（含 DSL 速览 + UTILITY_REFERENCE / HXS_ICON_NAMES 运行时插值），用 **占位符 template** 双语化：
  - `i18n/prompts/{zh-CN,en}.ts` 加 `CAPABILITY_GENERATOR_SYSTEM_*`，含 `__UTILITY_REFERENCE__` / `__ICON_LIST_30__` / `__ICON_TOTAL__` 占位
  - `buildSystem(lang)` 在 capabilityGenerator 内 replace 占位为运行时白名单数据
- `buildTool(lang)` 切换 tool schema 中所有 field description（pattern.name / skill.systemAddon 等）
- `JSON_OUTPUT_INSTRUCTION_{ZH,EN}` 兜底（tool calling 失败时用 JSON 直输）也双语化
- 抽出 `errMsg(lang, key, ...args)` helper 集中管理 ~10 处错误文案双语
- `validateAndPack(raw, lang)` / `parseSkill(raw, lang)` / `cleanAndValidateSlide(rawSlide, lang)` 都接 lang 参数：
  - 中文 pattern.name 16 字 / 英文 40 chars
  - 中文 description 60 字 / 英文 100 chars
  - 视觉模型不支持错误识别正则扩展英文模式（`may not support image recognition` / `did not call the tool`）

**关键文件**：`client/src/llm/{promptGenerator,capabilityGenerator}.ts`、
`client/src/i18n/prompts/{zh-CN,en,index}.ts`。

至此 4 个 LLM 生成器（promptExtractor / styleGenerator / promptGenerator / capabilityGenerator）+ deck 主生成器（agent.ts，已有 targetLang 支持）全部按 UI 语言切换。

### 风格定义生成按 UI 语言切换

延续上一轮 promptExtractor 双语化，同步处理 styleGenerator。

**根因**：`styleGenerator.ts` 的 SYSTEM 与 TOOL schema 写死中文，
输出强制中文 name（「2-6 字中文风格名」）+ styleInstructions 也是中文，
切英文 UI 后仍输出中文风格案例。

**修复**（同 promptExtractor 模式）：
1. **`i18n/prompts/zh-CN.ts`** 加 `STYLE_GENERATOR_SYSTEM_ZH` 常量
2. **`i18n/prompts/en.ts`** 加 `STYLE_GENERATOR_SYSTEM_EN`（English 翻译版）
3. **`i18n/prompts/index.ts`** 加 `getStyleGeneratorSystem(lang)` getter
4. **`styleGenerator.ts`**：
   - `generateStyleDefinition` 入口取 `getCurrentLang()`
   - `buildTool(lang)` 让 tool schema 的 description 按语言切换
   - user message 各段（briefSection / imageSection / 调用工具指令）按语言切换
   - 错误文案（无配置 / 多模态被拒 / 生成失败 / theme 缺失 / 模型未返回）按语言切换
   - validateAndPack(raw, lang) 接 lang 参数：name 长度上限中文 12 / 英文 40，
     description 上限中文 60 / 英文 100，错误文案中英分别
   - callAnthropic / callOpenAI 接受 system + tool 参数

**关键文件**：`client/src/llm/styleGenerator.ts`、
`client/src/i18n/prompts/{zh-CN,en,index}.ts`。

**类似功能未做**：
- `promptGenerator.ts`（演示选题灵感生成）SYSTEM 写死中文
- `capabilityGenerator.ts`（能力包识别）SYSTEM 写死中文
两者也输出给用户看的内容，需 UI 语言切换才完整 ↳ 待用户确认是否一并双语化。

### 内容框架提取按 UI 语言切换

用户反馈：提取框架（promptExtractor）生成的 title/prompt 要根据 UI 中/英切换。

**根因**：`promptExtractor.ts` 的 SYSTEM 与 TOOL description 写死中文，
输出强制中文 title（「≤ 8 字的中文标题」），切英文 UI 后仍输出中文案例。

**修复**（按 i18n 当前语言取对应 system prompt + tool schema）：

1. **`i18n/prompts/zh-CN.ts`** 加 `PROMPT_EXTRACTOR_SYSTEM_ZH` 常量（原 SYSTEM）
2. **`i18n/prompts/en.ts`** 加 `PROMPT_EXTRACTOR_SYSTEM_EN`（English 翻译版）
3. **`i18n/prompts/index.ts`** 加 `getPromptExtractorSystem(lang)` getter
4. **`promptExtractor.ts`**：
   - `extractContentPrompt` 入口取 `getCurrentLang()`
   - `buildTool(lang)` 让 tool schema 的 description 也按语言切换（影响 LLM 在 tool_call 决策时的语言倾向）
   - user message、错误文案、title 长度上限（中文 16 / 英文 60）按语言切换
   - callAnthropic / callOpenAI 接受 system + tool 参数（不再依赖模块级常量）

**关键文件**：`client/src/llm/promptExtractor.ts`、
`client/src/i18n/prompts/{zh-CN,en,index}.ts`。

### 英文数字 estimate 识别

用户反馈：英文输入「Generate an introduction to cat breeds, around ten pages long.」矩阵只 5 格。

**根因**：`estimatePageCount` 正则只识别阿拉伯数字（`\d+`）和中文数字（`[一二两三四五六七八九十]+`），
英文「ten」「twenty」等不在白名单 → max=0 → fallback default 5。

**修复**（`agent.ts parseNumWord` + `estimatePageCount` + `prompts.ts parseCnNum` + `extractExplicitPageCount`）：

1. **数字解析器扩展**：parseNumWord 加 `EN_DIGIT` 表（one-nineteen + 整十 twenty/thirty/.../ninety）；
   支持复合 `twenty-one` / `thirty five` 拆开求和（容错处理常见英文表达）

2. **regex 模式抽出**为 `NUM_PATTERN` 常量统一管理，覆盖三种数字形式：
   - `\d+` 阿拉伯
   - `[一二两三四五六七八九十]+` 中文
   - `(?:twenty|thirty|...|ninety)(?:[-\s](?:one|two|...))?` 英文复合
   - `one|two|...|ten|eleven|...|nineteen` 英文单词

3. **LOCAL_RE 局部页码引用** 加 `last`（剔除「last N pages」单引用，与中文「最后 N 页」对齐）

4. `prompts.ts extractExplicitPageCount` 同步扩展（用户写「10 pages」「ten slides」时
   注入 `buildUserPageCountConstraint` 让 LLM 严格遵守页数）

**验证场景**：
- 「ten pages long」→ estimate=10 ✓
- 「twenty pages」→ estimate=20 ✓
- 「twenty-one slides」→ estimate=21 ✓
- 「last 3 pages」（patch 模式）→ 不命中（被 LOCAL_RE 剔除）✓
- 「page 4」（单引用）→ 不命中（被 LOCAL_RE 剔除）✓

**关键文件**：`client/src/llm/agent.ts:46`、`client/src/llm/prompts.ts:256`。

### 分批 max_tokens 13K 截断修复

用户反馈：cap=16K 模型分批生成时报「输出被你设置的 max_tokens=13000 截断」。

**根因**：T0-4 改动把单页 budget 8K → 5K（`estimate × 5000 + 3000`）后，
分批模式下 cap=16K 模型 `pagesPerBatch=2`，每批 max_tokens = 2×5000+3000 = **13000**（小于 cap=16K）。
LLM 在 2 页 + thinking + tool_use 内输出超 13K → 被截。
对比旧公式 8K：2×8000+4000 = 20K → 被 cap=16K 限到 16K，从未触发截断。

**修复**（`maxTokens.ts chooseMaxTokens`）：分批 vs 单次差异化
```ts
const target = opts.batched ? cap : opts.estimate * 5000 + 3000;
```
- **分批**：直接用 cap。`pagesPerBatch` 已限了每批工作量上限（cap≤16K → 2 页/批），
  给到 cap 让 thinking 模型不被 squash。与旧 ≥ T0-4 之前的实际行为一致
- **单次**：保持 5K 公式（`estimate × 5000 + 3000`），按用户实际页数分配，cap 内最大化

**验证场景**：
- cap=16K + 分批 2 页/批：16K（cap，不再 13K 截断）✓
- cap=64K + 分批 8 页/批：64K（cap）✓
- cap=128K + 单次 10 页：53K（按 estimate 算）✓
- cap=128K + 单次 1 页：8K（按 estimate 算，省 KV cache）✓

**关键文件**：`client/src/llm/maxTokens.ts:88`。

### 矩阵格数 estimate 兜底修复

用户反馈：生成 46 页时进度矩阵只有 2 个格子；首轮修复后用户报「输入是第 N 页格式但还是 2 格」。

**根因**：`estimatePageCount` 先剔除「第 N 页」局部引用再找「N 页」总数表达，
当用户用「## 第 1 页 ... ## 第 46 页」做大纲分段且正文里没写「46 页」总数时，
cleaned 后 max=0，又被零散误匹配（如「2 章」「2 节」「2 个段落」）压到很小的值，
最终 `progress.estimate=2`，矩阵 `cellCount=max(estimate, generated, 1)` 缩到 2 格。

首轮兜底加了 markerRe（# 前缀强制）+ detectSegments 二级兜底，但用户实际可能用
**无 `#` 前缀的纯文本「第 N 页：」**做大纲，依旧匹配不上。

**最终修复**（三处协同）：

1. **`agent.ts estimatePageCount` markerRe `#` 前缀改为可选**
   ```
   /^\s*(?:#+\s*)?(?:第\s*N\s*…\s*(?:页|部分|章|节)|(?:Page|Slide|Section)\s+N)/
   ```
   覆盖纯文本大纲；≥ 3 个标记 + 单行约束防误判

2. **`segmentMessage.ts MARKERS` 同步开放 `#` 前缀可选**
   让 detectSegments 能识别纯文本「第 N 页：」大纲 → shouldBatchByPrompt 正确触发分批
   → 后续 batchInfo.totalPages 修正路径生效

3. **`types.ts BatchInfo` 加 `totalPages` 字段；分批 orchestrator 主动告知 UI 真实总页数**
   - `agent.ts runBatchAttempt` 构造 batchInfo / segInfo 时填 `totalPages`
   - `ChatPanel/Home onProgress` 收到任意带 batch 的事件时 `estimate = max(prev.estimate, batch.totalPages)`
   - 这条路径不依赖文本匹配，分批 orchestrator 知道精确 segments.length 就直接告诉 UI

**验证场景**：
- 「## 第 1 页 ... ## 第 46 页」markdown 大纲 → 分批触发；batch.totalPages=46 ✓
- 纯文本「第 1 页：xxx ... 第 46 页：yyy」无 # → MARKERS 第 1 条命中；分批触发 ✓
- 短文本「修改第 4 页加图」（patch 模式）→ 单引用不触发兜底，走 default 5 ✓
- 长文本无标记的散文 ≥ 3500 字 → autoSegmentFallback 切段；分批触发 ✓

**关键文件**：`client/src/llm/agent.ts:69`、`client/src/llm/segmentMessage.ts:11`、
`client/src/llm/types.ts:32`、`client/src/editor/{ChatPanel,Home}.tsx`。

### 生成速度优化 Tier 1

T0 落地后继续推进 Tier 1：续接批受控并发 + reasoning 失控自动恢复。
计划归档于 `~/.claude/plans/steady-tumbling-pine.md`。

**T1-1 续接批受控并发**（`agent.ts:507 generateBatched` 重构）

- 旧实现：N 批严格 await 串行，10 批 deck = 10×单批延迟 ≈ 120s。
- 新实现：
  - 首批同步 await 建立 baseline（meta/theme），让续接批共享视觉风格
  - 2..N 批用 `runWithConcurrency` 受控并发（max=3，平衡 provider rate limit 与速度收益）
  - 抽 `runBatchAttempt` 帮助函数封装单批 LLM 调用 + split-and-conquer fallback
  - 各批 result.deck 含 baseline + 该批新页，按 chunkIdx 顺序合并 newSlides
  - applyStreamingBatch(finalDeck) 整体替换重组 store deck 顺序
  - keepView=true 让用户停在 Home，并发期间 store deck 中间态用户看不到（仅看进度条）
- slide id 不冲突：每批 streamParser 独立调 `validate.ts fillOneSlideId` 补 nanoid(8)，跨批冲突概率 64^-8 可忽略
- 期望墙钟：10 批 deck 从 N×T 降到 ~max(T, ceil((N-1)/3) × T)，约节省 70%

**T1-2 reasoning 失控自动 abort + 降级重试**（`agent.ts:135 generateOnce`）

- 阈值：reasoning bytes > 200KB（10 页 deck 实际 deck 输出 ~15K，200K 几乎可断定 thinking 模型在反复纠结）
- 实现：generateOnce 内部维护 `runawayCtrl: AbortController`，将外部 `opts.signal` forward 进来
- wrappedOnProgress 收到 reasoning 事件超阈值时调 `runawayCtrl.abort()` 并打 `runawayTriggered` 标记
- provider 收到 abort 走 cancel 路径返回 `{ cancelled: true }`
- agent 区分：`cancelled && runawayTriggered && !externalSignal.aborted` → 是 runaway 触发，不是用户取消
- 自动重试一次：`max_tokens = halvedTokens`（floor(effective/2)），`maxTokensMode="fixed"` 强制使用
- reasoning 阶段还没进入 tool_use，`streamingStarted=false`，store 状态干净，重试无需清理
- 重新发 `prompt` 事件让 UI 看到新的 max_tokens
- 用户主动取消时不重试（按 externalSignal.aborted 区分）
- 效果：thinking 模型卡 400s+ 场景从用户手动取消变为 ≤ 60s 自动恢复

**关键文件**：`client/src/llm/agent.ts`（约 +260 / -260 行净增 0）。

### 生成速度优化 Tier 0

审查单次/分批两种生成模式后落地 4 项本地化速度优化（计划归档于 `~/.claude/plans/steady-tumbling-pine.md`）。
零回归改动，仅触及 `agent.ts`/`maxTokens.ts`，约 100 行。

**T0-1 单次完成 tail delay 自适应**（`agent.ts:135 generateOnce`）

记录 slide 事件首末时间戳，result 时点判定真流式 vs buffered：
- 真流式（首末间隔 > N×40ms）→ tail delay 砍到 200ms（仅给 React 一帧 commit）
- buffered（同 tick 批量到达）→ 沿用 `min(2000, N×80+100)` 让 store 80ms throttle 排完
- 无 slide 事件（parser 漂移走 page 兜底）→ 按 buffered 处理保险

收益：真流式单次（Anthropic 等）省 1-2s 完成尾巴等待。

**T0-2 子循环 split-and-conquer 二分递归**（`agent.ts:404+`）

旧实现：续接批失败 → 1 页/子批严格串行（8 页 chunk = 8 次 LLM 往返）。
新实现：抽 `recoverByBisect` 递归函数，入口先二分（main 已失败一次跳过整段）：
- 对子段先尝试整段，成功就停
- 失败且 size>1 则二分左右递归
- 单页失败放弃这一页

收益：8 页 chunk 全成功场景从 8 次往返降至 2 次（省 75%）；
单页失败场景 ≈ 5 次（省 ~37%）；常态拆小后大概率成功。

**T0-3 续接批 contextDeck 瘦身**（`agent.ts:362+` + 子循环段）

旧：续接批 contextDeck.slides 留 `{id,layout,blocks:[]}` 骨架，让 LLM 看已有页。
新：contextDeck.slides 设空数组——LLM 不需要看 id 数组（slide.id 约定填空字符串由客户端补 nanoid，不存在 id 冲突）；已有页数由 buildBatchPrompt header「本批输出：第 X-Y 页（共 Z 页）」告知。

收益：50 页续接 deck 每批省 3-5KB prefill；prefill 阶段提速。

**T0-4 chooseMaxTokens 公式微调**（`maxTokens.ts:88`）

`target = estimate × 8000 + 4000` → `estimate × 5000 + 3000`。
- 单页 budget 8K→5K：实测单页 slide JSON ~3K + thinking 增量 ~1.5K，5K 已覆盖
- headroom 4K→3K
- 旧公式偏奢侈，给 thinking 模型留过多空间反而诱发 reasoning 失控

例：10 页 deck 在 cap=128K 模型上 84K → 53K；缓解 reasoning 失控空间，prefill 略快。
回归保障：保持 `min(target, cap)` 不变；复杂多 block slide 单页极限内仍可生成。

**关键文件**：`client/src/llm/agent.ts`、`client/src/llm/maxTokens.ts`。

**待做（Tier 1，分两阶段）**：
- T1-1：续接批 2..N 受控并发（max 3）；预期 10 批 deck 墙钟 120s → 40s
- T1-2：reasoning bytes > 200KB 自动 abort + 降级重试

### SlideGridProgress 内部平滑动画

用户反馈：前一轮三处修复后矩阵效果还是不好，仍是「字节涨 + 矩阵静止 + 最后一下出来」。

**根因**：上一轮加 max 双源（streamingSlideCount + progress.current）治标不治本——
buffered 输出场景下 layout 计数 page 事件也是瞬间从 0 跳到 N，progress.current 立即是 N，
矩阵 generated=N 立即满屏。store 层的 appendStreamingSlide 80ms throttle 排队被
progress.current 旁路掉。

**修复**：在 `SlideGridProgress` 组件内部加平滑动画——
```ts
const [displayGenerated, setDisplayGenerated] = useState(0);
// useEffect 每 80ms 递增 1 直到追上 target generated
```

矩阵渲染用 `displayGenerated` 而非 `generated`：
- generated 瞬时从 0 跳到 N（buffered 场景）→ displayGenerated 仍 80ms/格 渐进追赶
- generated 渐进从 0 涨到 N（真流式场景）→ displayGenerated 紧贴 generated 同步
- 用户始终能看到方格逐格亮起的视觉节奏

**与 generateOnce 完成延迟协同**：`tailDelay = min(2000, slidesCount × 80 + 100)`
预留时间让 displayGenerated 追上 generated 后再 commit + setView。

**关键文件**：`client/src/lib/slideGridProgress.tsx`。

### 矩阵进度多源驱动 + reasoning 阶段视觉反馈

用户反馈：单次模式只看到字节数涨，矩阵不动，最终一下生成完。

**根因**（两段都有问题）：
1. **reasoning 阶段**：LLM 在思考，没有 slide/page 事件 → 矩阵 generated=0 全静止 outline，
   只有「模型推理中… N KB」字节数变化，视觉上「卡住」
2. **tool_use 阶段**：parser 因 slide JSON 格式漂移而 slide 事件不发；anthropic/openai
   的 layout 计数兜底 page 事件被 `!parser.isCreate()` 限制只在 patch 模式发，create 模式没有备援
   → 矩阵 streamingSlideCount=0 不动，progress.current 也不动，只看 receivedBytes 涨

**修复**（三处）：

1. **anthropic.ts + openai.ts 去掉 `!parser.isCreate()` 限制**：layout 兜底 page 事件
   在所有模式下发。即使 parser 失败、slide 事件不来，page 事件也能让 UI 感知「已输出 N 页」。

2. **`SlideGridProgress.generated` 取 max 双源**：
   ```
   max(streamingMode ? streamingSlideCount : 0, status.current ?? 0)
   ```
   slide 事件 append 数 与 layout 计数 page 事件任一推动都能让矩阵动起来。

3. **`SlideGridProgress` 加 `phase` prop + reasoning 阶段所有方格 pulse**：
   - phase=reasoning/thinking/connecting 时所有未生成方格显示 outline+pulse 动画
   - 让 reasoning 阶段的「准备中」体感不再是「全静止」
   - 进入 tool_use 后 phase 切到 receiving/slide/page，pulse 停止，按 generated 逐格亮起

**关键文件**：`client/src/llm/providers/{anthropic,openai}.ts`、`client/src/lib/slideGridProgress.tsx`、`client/src/editor/{ChatPanel,Home}.tsx`。

### estimate 算法 + 矩阵 total 锚定

用户反馈：让 LLM 生成一页，矩阵显示 4 个格子。

**根因**（三个独立问题叠加）：
1. **`estimatePageCount` regex 只识别阿拉伯数字**：「生成一页」「两页」中文数字被忽略 →
   fallback 到 `max(deck.slides.length, 5)` 或 `5`
2. **「第 N 页」误匹配**：用户写「修改第 4 页」时，regex 匹配「4 页」当作总页数
3. **`progress.estimate` 被 page 事件动态推高**：`anthropic.ts` patch 模式下兜底 page 事件
   用 `max(estimate, layout 计数)` 推高 estimate，LLM 实际输出 4 页时 estimate 被推到 4，
   矩阵 cellCount=4

**修复**：

1. **`agent.ts estimatePageCount` + `prompts.ts extractExplicitPageCount`**：
   - 加中文数字解析（一/两/三/…/十/十一/二十）
   - 先剔除「第 N 页 / 最后 N 页 / 倒数 N 页」局部页码引用，再扫总页数
   - 「生成一页」→ estimate=1；「修改第 4 页加图」→ fallback=5（不再误判 4）

2. **ChatPanel + Home 的 page 事件处理保留初始 estimate**：
   - 之前：`{ ..., estimate: e.estimate }` 把 LLM 推高值写回 progress
   - 现在：保留 `prev.estimate`（用户提交时初始算的值），仅更新 `current` 反映已生成页数
   - 矩阵 cellCount=max(初始 estimate, generated, 1)，仍允许 LLM 实际输出更多时扩展

**关键文件**：`client/src/llm/agent.ts`、`client/src/llm/prompts.ts`、`client/src/editor/ChatPanel.tsx`、`client/src/editor/Home.tsx`。

### 单次 buffered 输出场景下矩阵逐格填充

用户反馈：单次模式生成时矩阵进度未生效，生成后直接跳转编辑器。

**根因**：LLM 部分代理/服务端实现会 buffer 整个 `tool_use.input` 后一次性 dump：
- `inputJson` 事件几乎同步触发，parser 一帧解析所有 slide
- `slide` 事件批量在同 tick 触发 `appendStreamingSlide`，N 次 setState 被 React batch 成 1 次渲染
- 用户视角矩阵从 0 直接跳 N，紧跟 commitStreamingDeck + setView("editor")
- 整个 streaming 阶段在毫秒级内结束，看不到任何过渡

**修复（双端）**：

1. **`store/editor.ts` appendStreamingSlide 错峰排队**：维护模块级 `lastScheduledAppendAt`
   时间戳，相邻两次 append 至少间隔 80ms。真流式（每 100ms+ 一个 slide）下 delay=0 立即执行；
   buffered 场景下 N 个 slide 排队 80/160/.../N×80ms 错峰渲染，矩阵能看到逐格填充。
   `startStreamingDeck` 时重置时间戳避免上次残留。

2. **`agent.ts` generateOnce 完成路径动态延迟**：
   ```
   tailDelay = min(2000, slidesCount × 80 + 100)
   ```
   等待 throttle 队列排完再 commit + setView。10 页 → 900ms，20 页 → 1700ms，25+ 页 → 2000ms 封顶。
   `streamingMode` 保持 true 期间矩阵停在「完整填满」状态作为视觉收尾。

**效果**：
- 真流式：行为不变（delay=0 立即 append），完成时少量延迟收尾
- buffered：从「瞬间满屏 + 跳 editor」变成「N 个方格逐格亮起 + 完整状态停留 + 切 editor」

**关键文件**：`client/src/store/editor.ts`、`client/src/llm/agent.ts`。

### 子循环 batchInfo 修复 + reasoning 失控警告

回归审视近期改动，修两个真实问题：

**P1 子循环 max_tokens 过度分配（新公式副作用）**：
`agent.ts` 续接批失败兜底拆 1 页/子批重试时，`generateOnce` 没传 `batchInfo` →
`chooseMaxTokens` 回落到 estimate=整 deck 估算页数（~10）→ 新公式给 10×8K+4K=84K。
旧阶梯映射 estimate≤10 → 16K 误打误撞限制了过度分配；新公式让子循环每页给 84K，
reasoning 模型在子批兜底里有充足空间失控，**子批重试反而比主路径更慢**。

修复：子循环 `generateOnce` 调用补上 `batchInfo: subInfo`（pageCount=1）。
chooseMaxTokens 按 1 页算 → 12K，与子循环实际工作量匹配。

**P2 reasoning 失控警告**：
单次模式 LLM 可能全程在 reasoning（thinking 模型在简单任务上反复纠结），
streamingMode 永远不启动、矩阵不动、只有「模型推理中… N KB」字节数一直涨。
之前没有任何兜底，用户只能猜测「卡了 vs 还在思考」。

修复：`phaseLabel` reasoning 分支在 `bytes > 100KB` 时切换警告文案——
「模型推理已 N KB · 可能 reasoning 失控，建议停止换非 thinking 模型」。
10 页简单 deck 实际 deck 输出仅 ~15K，100KB+ reasoning 几乎可断定模型在 thinking 失控。
i18n 加 zh-CN/en 双语 key。

**关键文件**：`client/src/llm/agent.ts`、`client/src/lib/phaseLabel.ts`、
`client/src/i18n/locales/{zh-CN,en}/chat.json`。

### reasoning 与 deck 输出区分显示

用户反馈：单次模式 400+s 还在「接收数据 N KB」一直涨，每页内容并不复杂，单次模式都没成功完成。

**根因**：上一轮把 `thinking_delta` / `reasoning_content` / `tool_calls.arguments` 都映射到
`receiving` 事件，UI 显示同一个「接收数据中… N KB」无法区分。10 页简单 deck 实际只需 ~15K JSON
输出，但 thinking 模型（DeepSeek-R1 / GLM-4 thinking / Gemini thinking）在简单任务上 reasoning
也可能失控（数十万 token），用户看到的 400KB 几乎全是 reasoning 不是 deck，最终 max_tokens 耗尽
被截断。

**修复**：新增 `kind: "reasoning"` 事件类型，与 `receiving` 分开：
- `anthropic.ts` 的 `thinking_delta` → 发 reasoning（之前发 receiving）
- `openai.ts` 的 `reasoning_content` / `content` → 发 reasoning（独立 reasoningBytes 计数器）
- `tool_calls.arguments` / `inputJson_delta` → 仍发 receiving（独立 receivedBytes）
- phaseLabel 加 reasoning 分支：「模型推理中… N KB（暂未生成 deck 内容）」
- ChatPanel + Home 处理 reasoning 事件，phase 切到 reasoning
- i18n 加 zh-CN/en 双语 key

**视觉效果**：
- 推理阶段：「模型推理中… 200 KB（暂未生成 deck 内容）」→ 用户知道在思考
- 输出阶段：「生成 deck… 5 KB」→ 用户知道开始出内容
- 推理 200KB+ 仍未切到「生成 deck」→ 用户可判断模型 reasoning 失控，主动取消换非 thinking 模型

**未解决**：reasoning 失控本身需要 model-specific 的 `reasoning_effort: "low"` 等参数，
当前未做（不同 provider 字段命名不一）。给用户透明信息，让其自行判断。

**关键文件**：`client/src/llm/types.ts`、`client/src/llm/providers/{anthropic,openai}.ts`、
`client/src/lib/phaseLabel.ts`、`client/src/editor/{ChatPanel,Home}.tsx`、
`client/src/i18n/locales/{zh-CN,en}/chat.json`。

### openai-compat thinking/reasoning 流式可见

用户反馈：上一轮 anthropic.ts 改了之后，单次模式 300s 仍提示「模型已开始响应，等待数据…」。

**根因**：上一轮只改了 anthropic.ts，但用户用的是 openai-compat 模型（OpenAI / DeepSeek / GLM / Qwen / Gemini 等）。`openai.ts` 处理 chat completions stream 时：
- 收到 `delta.content` 只累加到本地变量，不发 progress 事件
- 只有 `delta.tool_calls.function.arguments` 出现时才发 receiving
- DeepSeek-R1、GLM-4 thinking、Gemini thinking 等模型先输出 `reasoning_content` 再 tool_calls，期间 UI 完全静默

**修复**（`client/src/llm/providers/openai.ts`）：在每个 chunk 处理时，累计 reasoning_content + content 字节数，throttle 100ms 发 receiving 事件。兼容多种字段命名：`reasoning_content`（DeepSeek/智谱）、`reasoning`（OpenAI o1）、`thinking`（部分代理）。

**效果**：thinking 阶段 UI 文案从「模型已开始响应，等待数据…」切到「接收数据中… N KB」，
字节数随推理 token 输出实时增长。tool_calls 阶段后续 receivedBytes 继续累加（同一变量），
保持单调递增。

**关键文件**：`client/src/llm/providers/openai.ts:307-326`。

### Anthropic extended thinking 流式可见

用户反馈：单次模式 80s 后 phase 仍停在 thinking 文案「模型已开始响应，等待数据…」。

**根因**：Anthropic 的 extended thinking 是独立的 content_block。10 页 deck 在 Sonnet/Opus 上
thinking 推理可达数千~数万 token（80s+），期间客户端只收到一次 `kind: "thinking"` 后就静默
——没有 tool/slide/page/receiving 事件触发 phase 变化。UI 上文案恒定，elapsed 秒表 + pulse 矩阵
是唯一活跃信号，用户感知「卡死」。

**修复**（`client/src/llm/providers/anthropic.ts`）：在 streamEvent 监听器中捕获
`content_block_delta` + `thinking_delta` 事件，累计 thinking 字数，throttle（100ms）发
`kind: "receiving"` 事件携带字节数。UI 切到 receiving phase 显示「接收数据中… N KB」，
让用户看到字数实时增长——thinking 在 LLM 输出推理 token，语义上确实是「在接收数据」。

**效果**：
- 0-2s：connecting → thinking 切换（不变）
- thinking 进入流式输出后：phase 切到 receiving，文案「接收数据中… X.X KB」
- thinking 结束 + tool_use 开始：现有 tool 事件接管，phase 进入 slide/page
- 与现有 inputJson handler 共享 `lastReceivingAt` throttle 时间戳，避免 thinking→tool_use 切换瞬间事件过密

**关键文件**：`client/src/llm/providers/anthropic.ts:230-254`。

### 单批降级走 generateOnce

用户反馈：执行生成 100 秒后进度仍提示「即将生成第 1-10 页」，没有任何变化。

**根因**：10 页 + ≥3 段文案触发分批；但 cap=128K 模型 `inferPagesPerBatch=12`，10 ≤ 12 →
`chunks.length === 1`——「实际只跑 1 批的分批」。这种情况：
- `generateBatched` 仍走分批 orchestrator，调 `generateOnce` 时传 `skipStoreStreaming=true`
- `generateOnce` 内部因此不启动 `streamingMode`，slide 事件透传到 `batchOnProgress`
- 但 `batchInfo.pageCount=10` 让 thinking 阶段文案恒定为「(批 1/1) 即将生成第 1-10 页」
- LLM 在 10 页 deck 上 thinking 时间长（80-120s+），整个空窗期文案不动
- SlideGridProgress 当前批所有 10 格 pulse，但用户感知不强

**修复**：顶层入口 `generate()` 增加单批降级判断——
即使 `shouldBatchByPrompt` 返回 true，如果 `decision.segments.length ≤ inferPagesPerBatch(...)`
（实际只会跑 1 批），降级为 `generateOnce`。这样：
- `streamingMode` 启动（无 currentDeck 时）
- slide 事件逐页 append，`streamingSlideCount` 实时增长
- `phaseLabel` 走 streaming 分支「正在生成第 X / Y 页…」
- SlideGridProgress 矩阵逐格亮起
- 不再有「(批 1/1)」前缀和恒定 thinking 文案

**关键文件**：`client/src/llm/agent.ts:497`。

### 单次/patch 模式进度反馈兜底

用户反馈：单次生成时 SlideGridProgress 矩阵和「生成第 X 页」文案都不变，直接进编辑器。

**根因**：ChatPanel 在 editor 内提交时总传 `currentDeck`，走 patch 模式：
- `canStream = !skipStoreStreaming && !opts.currentDeck` → `false`
- `streamingMode` 永远不启动
- `streamingSlideCount` selector 在 `!streamingMode` 时直接 `return 0`
- SlideGridProgress 渲染条件 `streamingMode && estimate > 0` 第一项 false → 完全不渲染
- phase 在 page ↔ slide 之间交替，slide 事件覆盖 page 计数导致文案闪烁

**修复**（多处兜底，让 patch 模式也能看到进度反馈）：
1. **SlideGridProgress 渲染条件去掉 `streamingMode &&`**（ChatPanel + Home），只要 `estimate > 0` 就渲染。
2. **`generated` 参数双源**：streaming 模式用 `streamingSlideCount`（slide 事件落地数），
   patch 模式用 `progress.current`（anthropic.ts 的 page 事件兜底，按 layout 字段计数）。
3. **`phaseLabel` 在 phase=slide 但 current>0 时优先显示「生成第 X / Y 页…」**（`client/src/lib/phaseLabel.ts`），
   避免 page↔slide 事件交替导致文案频繁切回「首页准备中…」。

**效果**：
- create 模式（Home 提交，无 currentDeck）：SlideGridProgress 用 streamingSlideCount，逐页落地。
- patch 模式（ChatPanel 提交，有 currentDeck）：SlideGridProgress 用 progress.current（layout 兜底计数），矩阵和文案都能动起来。

**关键文件**：`client/src/editor/ChatPanel.tsx`、`client/src/editor/Home.tsx`、`client/src/lib/phaseLabel.ts`。

### 单次模式 max_tokens 同步切公式

承接上一轮：分批分支已改为「页数 × 8K + 4K」公式，单次分支仍是 16/32/64/128K 阶梯——
这意味着 10 页 deck 不触发分批时（如大模型 cap=128K + 10 页 ≤ pagesPerBatch 12 → 单次跑），
仍只给 16K，复杂 slide 输出超 5K/页时被截断（与之前的分批截断 bug 同根因）。

**修复**：单次分支同样改为 `target = estimate × 8K + 4K`，与分批分支统一。

**效果对比（cap=128K Sonnet）**：
| 场景 | 改前 | 改后 |
|------|------|------|
| 1 页 deck | 16K | 12K |
| 5 页 deck | 16K | 44K |
| 10 页 deck（不分批） | 16K（截断风险） | **84K** |
| 20 页 deck（不分批） | 32K | 128K（截 cap） |

**消除两个旧 bug**（同根因，一并修）：
1. 分批阶段阶梯把 estimate≤10 全压在 16K
2. 单次阶段大 deck 在大 cap 模型上仍 16K 截断

**关键文件**：`client/src/llm/maxTokens.ts`。

### 分批 max_tokens 按本批页数动态分配

承接上一轮：把分批分支改成 `return cap` 后，用户每次看到 max_tokens 都等于「用户设置的最大值」，
体感「永远顶 cap，不智能」。两个极端之间需要一个真正按工作量分配的中间方案。

**修复**：分批分支改为 `target = pageCount × 8K + 4K headroom`，再 `min(cap)`：
- 单页 budget 8K：与 `inferPagesPerBatch` 同标定，覆盖单页 slide JSON + thinking 增量
- headroom 4K：tool 调用骨架 + 整批共享 thinking 起始
- cap 仅作上限（物理极限）

**联动效果**：
| 模型 | cap | 场景 | 第 1 批 | 第 2 批 |
|------|-----|------|--------|---------|
| DeepSeek (16K) | 16K | 10 页/2 页一批 → 5 批 | 20K→16K(cap) | … |
| Qwen (64K) | 64K | 10 页/8 页一批 → 2 批 | 68K→64K(cap) | 20K（2 页） |
| Sonnet (128K) | 128K | 10 页/12 页一批 → 1 批 | 84K（< cap，留余量） | — |

→ 大模型 + 短 deck 才会看到 max_tokens < cap 的智能分配；小模型物理极限只能贴 cap。
→ 关键改进：**分批之间数值会变化**（不同批次不同页数 → 不同 max_tokens），用户能直观感受「按工作量分配」。

**关键文件**：`client/src/llm/maxTokens.ts`。

### 分批 max_tokens 截断修复

用户反馈：自动分配 max_tokens 仍报错「输出被 max_tokens=16000 截断」。诊断到两个独立问题：

1. **`inferPagesPerBatch` cap=16K 给 3 页/批太紧**：平均 5K/页 budget，含 thinking + tool 骨架后
   单页只剩 ~3K。复杂 slide（多 block + 长文 + 图片 URL）易超。
2. **`chooseMaxTokens` 分批分支用 16/32/64/128K 阶梯压缩 target**：`estimate ≤ 10` 都给 16K，
   即使 cap=128K 大模型，分批 estimate ≤ 10 也只给 16K——分批粒度已经控制了输出量，再用 target
   阶梯压缩没意义，反而成了「截断陷阱」。

**修复**：
- `inferPagesPerBatch` 调到 8K/页 budget：cap≤16K → **2 页/批**（之前 3）；cap≤32K → 4 页（之前 5）；
  64K → 8 页；>64K → 12 页。
- `chooseMaxTokens` 分批分支移除阶梯映射，**直接 `return cap`**：分批粒度已由 `inferPagesPerBatch`
  按 cap 选好，max_tokens 就该贴 cap，不必人为再压缩。
- 单次（非分批）路径不动，仍按 `estimate ≤ 10/20/50/...` 选 target 省 KV cache。

**联动效果**：
| 模型 | cap | 每批页数 | 每批 max_tokens |
|------|-----|---------|----------------|
| DeepSeek/Kimi | 16K | 2 | 16K（贴 cap） |
| GLM-5.1 | 32K | 4 | 32K |
| Sonnet | 128K | 12 | 128K（之前是 32K） |

**关键文件**：`client/src/llm/maxTokens.ts`。

### SlideGridProgress 视觉化页生成进度

**纠正前一轮误判**：占位 slide 加在 store 里，但分批生成期间用户停留在 Home 视图
（`startStreamingDeck({ keepView: true })`），Home 不渲染 deck slides，所以占位永远不可见。
真正能让用户感受到「按页落地」的视觉锚点要加在 ProgressBar 区域。

**新增组件**：`client/src/lib/slideGridProgress.tsx`
- N 个 8×8px 小方格按页对应总数（estimate）
- 三档状态：已生成蓝填充 / 当前批 outline+pulse / 未到批浅灰 outline
- 超过 80 页折行 + 显示 `+N`
- 接入位置：ChatPanel 的 `ProgressBubble`（进度条下方）+ Home 的 `ProgressBar`（同位置）

**配套清理**：删掉 `agent.ts` `batchOnProgress` 中的 `insertPlaceholderSlides` 调用（用户看不到，
徒增 store 复杂度）。store 的 placeholder API 保留作为以后让 editor 视图边生边渲的基础设施。

**视觉效果**：用户在 Home 等待生成时，能看到 N 个方格——LLM prefill 阶段当前批 5-15 格 pulse；
slide 事件落地一页就一格变蓝。从「文案 + 进度条」单一通道升级为「文案 + 进度条 + 方格阵列」三通道反馈。

**关键文件**：`client/src/lib/slideGridProgress.tsx`（新）、`client/src/editor/ChatPanel.tsx`、
`client/src/editor/Home.tsx`、`client/src/llm/agent.ts`。

### 续接批进度按页即时

承接占位骨架——实测发现「续接批的占位永远等不到 slide 事件来替换」，进度仍是「每批整体出」。

**根因**：续接批走 `patch_deck`，`streamParser.ts` 的 `tryExtractAddSlide` 严格要求
`op === "add" && path === "/slides/-"`。LLM 实际输出的 op 格式只要任何字段不严格匹配
（如 `path: "/slides/0"`、字段顺序差异），slide 事件就静默丢失，全批靠
`agent.ts:480` 的 `applyStreamingBatch(accumulated)` 整体覆盖兜底——这就是「按批一次性出现」。

**修复（双端兜底）**：

1. **源头放宽 parser 容错**（`client/src/llm/streamParser.ts:154-185`）：
   - 严格层：保留 `{op:"add", path:"/slides/-", value:{...}}` 精确匹配
   - 宽松层：op 为 add 或缺省，且 value 通过 SlideSchema 校验即可（不死磕 path 写法）
   - 兜底层：raw 自身像 slide（无 op + 含 layout/blocks）也接受
   - 这让续接批的流式 slide 事件不再因 LLM 输出格式漂移而漏发

2. **applyStreamingBatch 占位感知替换**（`client/src/store/editor.ts`）：
   - 之前直接 `set({ deck: deckSoFar })` 整体覆盖，会清掉用户已看到的占位/已生成页
   - 现在先看当前 deck 是否有占位：有则从 `deckSoFar` 尾部按本批新增页数取出真实 slide，
     与占位逐个 FIFO 替换，余下占位剔除；无占位才走原整体替换
   - 兜底保证：即使批内 slide 事件全部漏发，批结束这一刻也能看到「占位被批量填入」的视觉变化

3. **commitStreamingDeck 内部过滤占位**（`editor.ts`）：失败路径下 partial deck 可能含
   占位，commit 入历史时统一过滤，保证最终态干净。

4. **删除 agent.ts 抢在 applyStreamingBatch 之前的 clearStreamingPlaceholders**：
   否则占位感知替换走不到，由 `applyStreamingBatch` 与 `cancelStreamingDeck` 内部统一管理。

**关键文件**：`client/src/llm/streamParser.ts`、`client/src/store/editor.ts`、`client/src/llm/agent.ts`。

### 分批生成进度反馈细化：thinking 提示 + 占位骨架预渲染

承接「分批粒度跟随 cap」的问题——大批粒度（12 页/批）下单批 prefill + thinking 时间显著拉长，
用户在第一页落地前会看到 30+ 秒的「视觉空窗」。从两端做缓解：

**A. thinking phase 显示页范围**：
- `client/src/lib/phaseLabel.ts` —— `thinking` 分支在 `batch` 存在且 `pageCount > 0` 时
  渲染「模型构思中…即将生成第 X-Y 页」（pageCount=1 时为单页文案）。
- ProgressBubble 已有 `elapsed` 秒表 + 早/中/长/极长阶段 hint，无需改动。
- i18n 新增 key：`chat:phase.thinkingBatch` 与 `chat:phase.thinkingBatchSingle`（zh-CN + en）。

**B. tool 事件触发占位骨架预渲染**：
- store（`client/src/store/editor.ts`）新增 `PLACEHOLDER_ID_PREFIX = "__placeholder_"` +
  `isPlaceholderSlideId(id)` helper，以及两个方法：
  - `insertPlaceholderSlides(count)`：tool 名一确认就按 `batchInfo.pageCount` 预插 N 个
    占位 slide（layout=hero，blocks 内一个简短 heading），让分批的「视觉骨架」立刻铺满。
  - `clearStreamingPlaceholders()`：每批 generateOnce 结束后清残留（实际生成 < pageCount 时占位多出来）。
- `appendStreamingSlide` 改为 FIFO：优先替换最早 placeholder，没有才走 push。
- `cancelStreamingDeck({ keepPartial: true })` 在写回 deck 前过滤占位，避免占位泄漏到历史。
- agent.ts `generateBatched` 内 `batchOnProgress` 监听 `kind: "tool"` 时调插占位（每批仅一次），
  generateOnce 返回后调清理。
- ChatPanel + Home 的 `streamingSlideCount` selector 同时排除 SKELETON 与 placeholder，
  避免进度条因占位 slide 数量虚高。

**视觉效果**：分批模式下，tool 名确认（~首批 5-10s 内）就能看到 N 页骨架卡片占满 SlideList；
parser 每解析完一页就替换最早占位；本批结束清理多余占位。配合 ProgressBubble 的「思考中 N 秒
（即将生成第 X-Y 页）」文案，prefill 长空窗期不再「看起来卡死」。

**关键文件**：`client/src/store/editor.ts`、`client/src/llm/agent.ts`、`client/src/lib/phaseLabel.ts`、
`client/src/editor/ChatPanel.tsx`、`client/src/editor/Home.tsx`、`client/src/i18n/locales/{zh-CN,en}/chat.json`。

### 分批粒度跟随模型 cap 智能联动

修复用户反馈「分批生成时 max_tokens 永远 16K，智能分配看似失效」。

**根因**：分批策略将 `PAGES_PER_BATCH` 写死为 3，每批永远是「小问题」（estimate=3 ≤10），智能分配在分批路径上空转；同时 `chooseMaxTokens` 分批分支硬截 16K。两套方案互相打架——大模型用户配的 cap 再高也用不上。

**修复**：让分批粒度本身跟随模型输出 cap，智能分配按本批页数动态选 max_tokens。

- 新增 `inferPagesPerBatch(model, provider, override?)`（`client/src/llm/maxTokens.ts`）：
  - cap ≤ 16K → 3 页/批（DeepSeek/Kimi/GLM-5，零回归）
  - cap ≤ 32K → 5 页/批（GLM-5.1）
  - cap ≤ 64K → 8 页/批（Qwen/Gemini/Haiku/MiMo-omni）
  - cap > 64K → 12 页/批（Sonnet/Opus/GPT-5.5/MiMo-v2.5/MiniMax）
- `chooseMaxTokens` 分批分支由硬截 16K 改为按 estimate 走 16/32/64/128K 映射。
- `BatchInfo` 加 `pageCount` 字段，分批 generateOnce 把 `batchInfo.pageCount` 作为 estimate 传给 `chooseMaxTokens`。
- 删除 `agent.ts` 内 `PAGES_PER_BATCH = 3` 常量，`generateBatched` 在入口处 `inferPagesPerBatch(active.config.model, active.provider, active.config.maxOutputTokens)` 推批大小。

**效果**：36 页文案在 Sonnet 上，LLM 往返从 12 次降到 3 次，速度翻 4 倍；小模型（cap≤16K）行为与改前完全一致，零回归。

**关键文件**：`client/src/llm/maxTokens.ts`、`client/src/llm/agent.ts`、`client/src/llm/types.ts`。

### max_tokens 智能/固定双模式分配

让 `maxOutputTokens` 字段支持两种语义，由用户选择：

**智能分配（auto · 默认）**：
- `maxOutputTokens` 作为「该模型的输出上限 cap」
- 系统按 `estimatePages` + 是否分批 在 cap 内自动选实际 max_tokens：
  - `estimate ≤ 10` → target 16000
  - `estimate ≤ 20` → target 32000
  - `estimate ≤ 50` → target 64000
  - 否则 target 128000
  - 分批模式每批 ≤16K（避免预占大 KV cache）
- 实际 = `min(target, cap)`

**固定分配（fixed · 旧行为）**：
- `maxOutputTokens` 作为「每次都用的固定值」，与场景无关
- 用户填了固定值就直接用（向后兼容旧逻辑）

**未填 cap 时**（无论 mode）：fallback 到 `inferModelOutputCap(model, provider)` —— 按 model name 推断厂商默认输出窗口（DeepSeek 8192 / Kimi 16K / Sonnet 4.6 64K / Gemini 64K 等）。

**新增** `client/src/llm/maxTokens.ts`：导出 `inferModelOutputCap` 与 `chooseMaxTokens(opts)`。

**类型扩展**：
- `ProviderConfig.maxTokensMode?: "auto" | "fixed"`
- `ModelConfig.maxTokensMode?: "auto" | "fixed"`
- `GenerateRequest.batchInfo?: BatchInfo`（让 chooseMaxTokens 识别每批小目标）
- `AgentOptions.batchInfo?: BatchInfo`（agent 分批 wrapper 透传到 generateOnce）

**providers 接入**：移除局部 `computeMaxTokens`，改用 `chooseMaxTokens({ mode, override, model, provider, estimate, batched })`。

**老数据迁移**：`loadSettings` 老数据无 `maxTokensMode` 默认 `"auto"`（让现有用户立即受益——填了大 cap 的小 deck 也不再过度供应 token）。

**FormView UI**：max_tokens 字段下方加「分配模式」段控件（智能/固定），以及对应模式 hint 文案；max_tokens label 从「最大输出 tokens」改为「输出 tokens 上限」更准确反映 cap 语义。i18n 双语完整（zh-CN/en）。

### 模型配置 / 图库配置 dialog 全量 i18n 化

按 CLAUDE.md「功能新增/变更，一定支持多语言版本」要求，把 ProviderSettingsDialog 与 ImageLibraryDialog 两个 dialog 内全部硬编码中文文案改为 `t()` 调用，中英双语完整覆盖。

**新增 i18n key**（zh-CN/en 同步双语）：
- `provider` 命名空间：`capability.{label,desc}.{general,textOnly,multimodal}` / `scenario.{general,imageRecognition}` / `compat.{label,anthropic,openaiCompat}` / `tab.{models,modelsWithCount,routing,proxy,notConfigured}` / `configRow.*`（test/activate/deactivate/titles/testOk）/ `formView.*`（labels/placeholders/hints/buttons）/ `routing.{intro,reset,resetTitle,moveUp,moveDown}` / `proxyEditor.*`
- `imageLibrary` 命名空间（新建）：`title` / `subtitle` / `close` / `pexels.description` / `providerRow.*` / `providerEditor.*`

**Helper 设计** —— `ProviderSettingsDialog.tsx` 顶部加三个映射常量，把 settings.ts 的 enum 值（含 hyphen 的 `text-only` / `image-recognition` / `openai-compat`）映射到 dialog.json 的 camelCase key：
```ts
const CAPABILITY_I18N_KEY: Record<Capability, "general" | "textOnly" | "multimodal">
const COMPAT_I18N_KEY: Record<ProviderId, "anthropic" | "openaiCompat">
const SCENARIO_I18N_KEY: Record<RoutingScenario, "general" | "imageRecognition">
```
所有调用 `t(`provider.capability.label.${CAPABILITY_I18N_KEY[cap]}`)` 之类即可。

**移除的 import**：ProviderSettingsDialog 不再用 settings.ts 的 `CAPABILITY_LABELS / CAPABILITY_DESCRIPTIONS / PROVIDER_LABELS / ROUTING_SCENARIO_LABELS` 常量（这些常量本身保留——Home/ChatPanel 仍引用 PROVIDER_LABELS 显示模型 chip）。

**英文版命名约定**：capability 三档英文对应 `Generalist / Reasoning / Omni`；compat 用 `Anthropic-compatible / OpenAI-compatible`；scenario 用 `General / Image recognition`。

**ImageLibraryDialog**：`PROVIDERS` 数组里的 `description` 字段改为 `descriptionKey`（i18n key）—— 添加新 provider 时只需在 dialog.json 加对应 key，不需要硬编码中英两份。

typecheck 通过；切到英文 UI 时两个 dialog 应全英文显示无中文残留（除源码注释）。

### 大模型配置 ListView Tab 化分区

ListView 信息密度过大（叠了模型列表 + 路由优先级 + 后端代理三类主题），改为 Tab 分离：

**Tab 头部**（位于 header 下方）：
- 「我的模型」+ 配置数量徽章（如 `3`）
- 「路由优先级」+ 状态徽章（自定义/默认）
- 「后端代理」+ 状态徽章（已配置/未配置）

当前 tab 加底部蓝色下划线 + 文字加粗，状态徽章按 tone（neutral/amber/emerald）配色。

**渲染分支**：
- models tab：原 ConfigRow 列表 / 空态 + 新建按钮
- routing tab：直接渲染 RoutingPriorityEditor
- proxy tab：渲染 ProxyUrlEditor 并传 `alwaysExpanded` prop（去掉折叠态二态切换，因为切到该 tab 就是要看/改它）

**ProxyUrlEditor 改造**：加可选 `alwaysExpanded?: boolean` prop，true 时初始 editing=true 且不渲染折叠态徽章 + 编辑/收起按钮；handleSave/handleClear 也跳过 `setEditing(false)`。

**Header 副标题动态化**：随 activeTab 切换显示当前主题相关的描述（按能力分槽... / 自定义查找顺序... / 自部署 Worker 反代...）。

**Footer**：仅 models tab 且非空态时显示「新建配置」主按钮；其他 tab 仅显示「关闭」。

**Tab 不持久化**：每次打开 dialog 默认回到 `models`。

**改动范围**：仅 `client/src/editor/ProviderSettingsDialog.tsx`（ListView 加 state + TabBar 组件 + 内容分支；ProxyUrlEditor 加 prop）。typecheck 通过。

### Web 直连 + 后端代理双模式

实施计划归档于 `~/.claude/plans/web-web-web-qwen-mimo-2-cloudflare-work-virtual-teacup.md`。

**问题**：浏览器直连 LLM API 实测下来 9 家服务的 OPTIONS preflight 都已开放 CORS，但实际使用时仍可能因 token 余额、限流策略、上下文超限、稳定性差异等"非 CORS"原因失败；同时百炼 Coding Plan 等 `coding.dashscope.aliyuncs.com` 子域确实未开 CORS。需要后端代理作为补充路径。

**数据模型**：
- `PresetService.webDirect: boolean` 标记预设是否在 Web 直连下可见
  - `true`（5 家）：Anthropic / OpenAI / Gemini / Qwen / 小米 MiMo（用户实测稳定可用）
  - `false`（4 家）：DeepSeek / 智谱 GLM / 月之暗面 Kimi / MiniMax（CORS 实测开放但稳定性偶发问题，强制走代理）
- `ModelConfig.useProxy?: boolean`（连接方式快照）
- `LlmSettings.proxyUrl?: string`（全局代理 URL，所有走代理的模型共用）
- `loadSettings` 老数据兼容：无 `useProxy` 字段时按 baseURL 反推 PRESET 的 `webDirect` 取反作初值

**SDK 客户端工厂** `client/src/llm/clientFactory.ts`：
- 导出 `createAnthropic(cfg) / createOpenAI(cfg)`，把"是否走代理"决策从 14 处零散调用点收口
- 走代理：baseURL 改为 proxyUrl，加 `defaultHeaders.X-LLM-Target: <真实 baseURL>`
- 不走代理：保持原 SDK 直连行为（向后兼容）
- 边界：useProxy=true 但 proxyUrl 缺失 → console.warn + fallback 直连（避免完全无响应）

**14 处 SDK 创建点全部走工厂**：providers/anthropic ×1、providers/openai ×1、testConnection ×2、promptGenerator ×2、styleGenerator ×2、promptExtractor ×2、capabilityGenerator ×4。各 generator 内部 helper 的 `cfg: { apiKey, model, baseURL? }` 类型签名升级为 `cfg: ProviderConfig`。

**FormView 改造**：
- 在「别名」与「服务预设」之间插入「连接方式」段控件（Globe icon「Web 直连」/ Server icon「后端代理」）
- 服务预设网格按当前连接方式过滤：Web 直连只见自定义 + 5 家；后端代理见全部 9 家 + 自定义
- 切换连接方式时若当前选中的预设在新模式下不可见，清空 selectedPresetId 但保留 baseURL/model
- 选「后端代理」但全局 proxyUrl 未配置时，预设网格上方显示黄色提示条引导用户去 ListView 配置

**ListView 顶部 ProxyUrlEditor**：
- 折叠态：状态徽章（已配置/未配置）+ 当前 URL truncate 显示 + 编辑按钮
- 展开态：URL 输入框 + 测试连通性（GET `${url}/` 看 service 字段是否为 `hxs-llm-proxy`）+ 保存 + 清除
- 测试通过自动保存，节省一次点击

**后端代理 Worker** `server/llm-proxy-worker/`：
- worker.ts：透传 method/path/headers(剔除 Host/Origin/X-LLM-Target/CF-*)/body；流式 SSE 原样回写；OPTIONS preflight + GET / 健康检查 + ALLOWED_TARGETS 白名单（可选）
- wrangler.toml + package.json + tsconfig.json + README.md（5 分钟部署 + 安全建议 + 大陆用户绑自定义域名指引）
- 不持有 token，token 由客户端 Authorization 头透传，纯透明转发

**典型流程**：
1. 用户部署 Worker 拿到 URL → 编辑器顶部 ProxyUrlEditor 填入 → 测试通过自动保存
2. 新建 DeepSeek 配置 → 选「后端代理」连接方式 → 服务预设网格出现 DeepSeek → 选中自动填 baseURL/model → 测试连通性走 Worker 转发到 api.deepseek.com → 通过即用

**验收**：typecheck 通过；功能层面待用户填 Worker URL 实测

### 模型配置表单字段顺序与命名调整

ProviderSettingsDialog 的 FormView 调整：
- 字段顺序：「协议 → 模型能力 → 服务预设」改为「服务预设 → 模型能力 → 兼容协议」（让用户先选服务预设自动填入协议/能力，再按需微调）
- 标签「协议」改为「兼容协议」
- 选项展示文案在表单内联硬编码为「OpenAI 兼容」「Anthropic 兼容」（不动全局 `PROVIDER_LABELS`，避免影响列表态 ConfigRow 显示）
- 服务预设取消按当前协议过滤，一次平铺展示；点击任一预设自动覆盖兼容协议 + 模型能力 + baseURL + model + maxOutputTokens。title 提示里加上协议名方便辨认
- 服务预设清单更新：删除 SiliconFlow，新增 MiniMax（abab6.5s-chat）；阿里通义千问以「阿里巴巴 Qwen」回归。统一标签命名，按使用频率排序：Anthropic Claude / OpenAI GPT / Google Gemini / DeepSeek / 智谱 GLM / 阿里巴巴 Qwen / 月之暗面 Kimi / MiniMax / 小米 MiMo（共 9 项 + 自定义）
- 服务预设按钮加选中态：按当前 draft.provider+baseURL+model 反推匹配的预设并高亮（蓝边 + 浅蓝底 + 加粗），选项被改后自动取消选中；都不匹配 + baseURL/model 都为空时高亮「自定义」
- 图库 Pexels 行加品牌 logo：ImageProviderMeta 加可选 `logoUrl` 字段，ProviderRow 渲染 fallback（有 logo 用 img、无则保留 ImageIcon）；约定品牌资源放在 `client/src/assets/providers/<id>.svg`，目前已置入临时占位 SVG（绿底 P 字），用户替换为真 logo 后无需改代码
- 新增 `client/src/vite-env.d.ts` 提供 Vite 资源 import 的类型声明（解决 svg/png 等 import 报 TS2307）
- 服务预设网格首位追加「自定义」虚线按钮，点击清空 baseURL / model / maxOutputTokens 让用户自填
- 服务预设字段标签去掉括号说明文字，简洁化
- 兼容协议按钮顺序调整为「OpenAI 兼容」在前、「Anthropic 兼容」在后（更符合常用频率）

仅改 `client/src/editor/ProviderSettingsDialog.tsx` 一处；typecheck 通过。

### 配置入口聚合 + 图库 Dialog 拆分

为对应「现在多能力槽 + Pexels 图源 + 未来更多扩展」的现实，把首页顶栏散落的设置入口聚合为「配置」下拉。

**Home 顶栏**：
- 「模型」按钮 → 「配置」下拉按钮（Settings icon + 文本 + ChevronDown）
- 下拉菜单两项：模型（Brain）/ 图库（Image）
- 容器 `inline-block` + 下拉 `left-0 right-0` 让宽度自动与按钮对齐
- 点击外部自动关闭（沿用 Toolbar 加菜单的 useRef + mousedown 模式）

**ImageLibraryDialog（新建）** `client/src/editor/ImageLibraryDialog.tsx`：
- 图源 provider 列表式 — `PROVIDERS` metadata 数组（`id, label, description, applyUrl, getKey/setKey/testKey`）
- 单行 `ProviderRow`：左侧 logo + 名字 + 描述；右侧已配置/未配置徽章 + 编辑按钮
- 点编辑展开内嵌 `ProviderEditor`：API Key 输入（password）+ 测试 + 保存 + 清除 + 申请链接
- 当前列表只有 Pexels 1 项；架构留扩展位（未来加 Unsplash / Pixabay 仅需新建 `<provider>.ts` + 在数组追加一行）

**ProviderSettingsDialog 瘦身**：
- 移除内嵌的 `PexelsKeyEditor`（迁出）+ pexels 模块 import
- 仍保留：模型配置 CRUD + RoutingPriorityEditor

**i18n**：
- 新增 `dialog:config.{title, model, imageLibrary}` 三键（中：配置/模型/图库，英：Config/Model/Image library）

**验收**：typecheck 通过

### Pexels 图库接入

支持「LLM 输出 picsum 占位图 → 后台异步用 slug 关键词查 Pexels 真图替换」两段式工作流，让生成的 deck 配图既永不 404 又能内容相关。

**新增**：
- `client/src/llm/pexels.ts`：API key 存取（localStorage `hxs.pexels_api_key`）+ `testPexelsApiKey` 验证连通性 + `searchPexelsPhoto(query, orientation)` 含进程级缓存
- `client/src/llm/enrichImages.ts`：扫 deck 收集 picsum URL（解析 slug + 按 URL 比例选 orientation）→ 并发查 Pexels → 返回「原 URL → 新 URL」替换映射
- store action `replaceImageUrls(map)`：递归 walk slide.background + 所有嵌套 block.url（含 card / modal / tab 子块）；不入历史栈（被动增强不消耗 undo）

**接入点**：
- `agent.ts` `generate()` 顶层：成功落地后 fire-and-forget 跑 `enrichDeckImagesAsync`
- 失败 / 限流 / 未配置 key 静默吞，picsum URL 仍可加载（零回归）

**用户体验**：
- 用户先看到 deck（picsum 决定性返回，1-2s）
- 几秒后图片无缝升级为 Pexels 关键词匹配真图
- 同 deck 多页同 query 命中缓存只算 1 次配额（Pexels 免费 tier 200 req/h、20K req/月余裕很大）

**验收**：typecheck 通过；待用户实测：填 API Key 测试连接 → 生成介绍类 deck → 观察 hero 配图从 picsum 切到 Pexels 真图

### 配图原则升级（让 LLM 不再 0 配图）

**根因排查**：
- 5 份示例 deck（含 LLM 见到的 `05-creative-deck.json`）**0 个 image block** → LLM 模仿示例自然 0 图
- CREATIVE_ADDONS 里之前的「配图」段落措辞「AI 自主决策、非强制、≤30%、列了一堆不适合场景」→ 偏向 skip
- 翻译模式（≥800 字 / ≥8 页）整个 CREATIVE_ADDONS 被砍 → 长文档配图引导也跟着没了

**修复 1：示例 deck 加配图示范** `shared/examples/{,en/}05-creative-deck.json`：
- 第 2 页 hero `background.type` 从 `gradient` → `image`（picsum URL + opacity 0.45）
- 新增第 3 页 two-column + 右栏 `image` block fit:"cover"
- 总页数 5 → 6（保持「每页一种 layout」的多样性示范）
- prompts/zh-CN.ts 与 en.ts 顶部例子注解同步：5 → 6 页 + 点出 2 个配图技巧

**修复 2：把配图原则从 CREATIVE_ADDONS 提到 BASE_SYSTEM_PROMPT 第 10 条** `client/src/llm/prompts.ts`：
- 永远生效，不被翻译模式砍
- 措辞收紧：「**默认必须考虑**，除非用户明确说『不要图 / 不配图 / no images / 纯文字』才豁免」
- 「适当配图绝不等于 0 配图」「不允许整份 deck 不见一张配图」
- 介绍 / 产品 / 概念性内容应当配图（hero 全屏底图 0.4-0.55 + two-column 内联）；数据 / 流程 / 编号清单 / 终页 cta 不加图
- 图源约定 picsum.photos + slug 主题强匹配（科技/产品/金融/人文/自然/新品发布各给具体关键词）
- 翻译模式第 2 条显式补充「配图仍按第 10 条执行」，避免 LLM 把翻译模式的「不主动加 X」错误外推到配图

**修复 3：删除 CREATIVE_ADDONS 里重复的「配图判断」段落**（避免冲突 + 避免被翻译模式跳过）

**修复 4：图与内容色彩冲突防护**：
- 图片本身有不可预知色彩（picsum / Pexels 都是随机摄影图），任意裸 heading + text 直接漂在 image background 上都可能撞色让 hero 标题瞬间消失
- 第 10 条新增「配图不能与内容色彩冲突」子段：image 作 background 时 heading 必须加 `hxs-text-glow`（主色发光描边）或外包一层 `card + hxs-frost-dark`/`hxs-translucent` 玻璃卡；slug 选择需与主题色配合（dark 主题深底图 / light 主题明亮素材，避免深主题配蓝天图吃掉浅色 fg）
- 因 Pexels 替换后真图色彩完全不可预测，「文字承托手段」从可选升级为**必须**
- 示例 deck 第 2 页 hero 的 heading utilities 从 `["hxs-text-gradient"]` 升级为 `["hxs-text-gradient", "hxs-text-glow"]` 让 LLM 看到正确范例

**验收**：typecheck 通过；用户判断「不论 prompt 长短都应该有合适配图」+「配图与内容色不能冲突」两项需求已满足

### 主题对比度自动归一

为应对 LLM 偶发输出「mode:"dark"」配过暗 fg/muted 导致正文几乎隐入背景的灾难（用户截图实证）：

- `client/src/llm/validate.ts` 加 `normalizeThemeContrast(deck)`：按 WCAG 相对亮度算 fg/muted vs bg 的对比比值
  - fg 与 bg 对比 < 3:1（AA-large 阈值）→ 替换为安全色（dark→#f1f5f9 / light→#0f172a）
  - muted 与 bg 对比 < 2.5:1 → 替换（dark→#94a3b8 / light→#64748b）
- 在 `processToolCall` 的 create_deck / patch_deck 校验通过后调用，仅 LLM 生成路径生效
- 编辑器手动改主题色不经此处（用户编辑应被尊重）
- 实现：`parseHex` + `relLum` + `contrastRatio` + 局部替换；达标主题原样返回

### Zod union 错误展开（让 LLM 重试有根因）

`slides.4.blocks.1.items.0: Invalid input` 这种 zod 默认 union 错误对 LLM 自修复无价值。改 `formatZodError`：

- 检测 `invalid_union` issue 时递归 `unionErrors`，每个分支取最深 path 的 issue 列出原因
- 附实际收到值快照（截 160 字 JSON）
- 信号从 `· slides.4.blocks.1.items.0: Invalid input` 升级为 `· slides.4.blocks.1.items.0: union 不匹配（分支1: Expected string, received object；分支2 @text: Required） | 实际收到：\`{"title":"...","desc":"..."}\``
- 第二次重试时 LLM 能直接定位修对（缺 text 字段、形态错配等具体根因）

**入参扩展**：`formatZodError(err, input?)` 第二参数可选传入校验前数据；`processToolCall` 两个调用点都补上 `filled`

### 进度条 i18n + Home ProgressBar 补 i18n

发现切英文后 ProgressBar 文案部分仍中文，根因：

1. `lib/phaseLabel.ts` 是纯函数硬编码中文 — 改为读 `i18next.t("chat:phase.*")`
2. Home `ProgressBar` 组件没接 `useTranslation("chat")` — 加上后 `本次请求使用的模型：{{model}}`、elapsed.{early/mid/long/veryLong}Hint 全部走 i18n（这些键早就存在 chat.json，只是没用）

**新增 chat.json `phase.*` 一组键**：batchPrefix / finishing / streaming / connecting / thinking / receiving[WithBytes] / page / tool / slideStart / applying / generating —— 双语全量

**改动文件**：
- `client/src/i18n/locales/{zh-CN,en}/chat.json`
- `client/src/lib/phaseLabel.ts`：`i18n.t.bind(i18n)` 直接调
- `client/src/editor/Home.tsx` ProgressBar 加 `useTranslation("chat")` + 替换 model title 与 elapsed hint



### i18n 多语言支持（最新）

实施计划归档于 `~/.claude/plans/resilient-launching-cascade.md`。本期支持简体中文（zh-CN）+ 英文（en），覆盖 UI + 系统 Prompt + 示例 deck + LLM 输出语言引导（全量），首次访问按浏览器语言自动检测。

**新增**：
- `client/src/i18n/{index,types,detector}.ts` + `locales/{zh-CN,en}/{common,home,editor,dialog,chat,error,prompt-meta}.json`（14 个翻译文件，按命名空间划分）
- `client/src/i18n/prompts/{zh-CN,en,index}.ts`：拆分混合策略——`BASE_SYSTEM_PROMPT`（DSL 文档）保留中文不动，`CREATIVE_ADDONS`（创意原则 + 内嵌示例 JSON）按用户语言双语切换
- `client/src/store/preferences.ts`：首次引入 zustand persist 中间件存储 `language` 偏好，与浏览器自动检测协同（store 优先级高于 navigator）
- `client/src/editor/LanguageSwitcher.tsx`：段控件 `[简体中文 | English]`，嵌入 ProviderSettingsDialog 顶部"界面语言"段
- `shared/examples/en/{04-magic-move,05-creative-deck}.json`：两份英文版示例 deck（用于 Magic Move 演示与 prompt 内嵌 fewshot）

**修改**：
- `client/src/llm/prompts.ts`：`buildSystemPrompt` 新增 `targetLang?: Lang` 参数；按语言取 `getCreativeAddons(lang)` 并在末尾追加 `getOutputLangInstruction(lang)` 注入"输出语言指令"，让 LLM 输出 deck 文案与 UI 语言保持一致；用户消息中显式"请用 X 语言"覆盖 UI 默认
- `client/src/llm/agent.ts`：`AgentOptions` 加 `targetLang`，默认从 `getCurrentLang()`（preferences > navigator > zh-CN）取值并透传到 `buildSystemPrompt`；分批 batch 错误信息全部改 `i18next.t`
- `client/src/llm/providers/anthropic.ts`：所有用户可见错误（鉴权、限流、连接、max_tokens 截断、retry exhausted、tool validation、modelOnlyText）改 `i18next.t('error:...')`
- `client/src/publish/directUpload.ts`：上传错误信息（noWorkerUrl / noProjectName / parseFailed / networkOrCors / timeout / buildFailed）改 `i18next.t`
- `client/src/editor/Toolbar.tsx`：工具栏标题与按钮文案改 `useTranslation("editor")`
- `client/src/editor/Home.tsx`：hero 区标题/副标题/输入框 placeholder/提交按钮改 `t(...)`；`loadMagicMoveDemo` 按 `getCurrentLang()` 选中文/英文版示例
- `client/src/editor/ProviderSettingsDialog.tsx`：ListView 顶部嵌入 `<LanguageSwitcher />` 段
- `client/src/app/main.tsx`：在 createRoot 之前 `import "@/i18n"` 同步初始化

**默认策略**：
- 首次访问：自定义 detector 顺序 `preferences.language` → `navigator.language`（前缀匹配 zh→zh-CN，其余→en）→ `zh-CN`
- 语言切换：即时生效，不重启页面；活跃流式生成不中断，下次请求才使用新语言
- 持久化：用户切换后写入 `localStorage["hxs.preferences"]`，刷新后保持

**输出语言策略**：
- UI 语言决定 deck 输出语言（不参与判定用户输入语言）
- 用户消息中显式"请用 日文/法文/...生成"时优先级最高（已在 prompt-meta 指令中明文允许）

**依赖增量**：`i18next@24` + `react-i18next@15` + `i18next-browser-languagedetector@8`，gzip 净增 ~12KB；翻译文件 zh+en 全量打包 ~10KB gzip；总增量约 30KB gzip。

**第二轮覆盖**（一次到位 + 全面审查）：
- ChatPanel：标题、按钮、placeholder、空态提示、输入框 hint、ProgressBubble 等待文案、StylePicker、ActiveModelBadge、MessageBubble 全量 i18n
- PublishDialog：3 个 Tab 切换、DirectView / DeploySettingsDialog 配置弹窗、ZipReadyView / DeployRow / PdfView 全套状态文案
- EnhanceCapabilityDialog：图片上传段、AI 识别按钮、ItemCard 折叠态/展开态、Pattern/Skill 字段 label、Checkbox titles、ChipEditor placeholder
- NewStyleDialog：风格描述表单、参考图片段、生成态状态、Placeholder 文案、ReadyView 元数据编辑、保存按钮
- StylePreviewDialog：标签徽章（内置/AI/我的）、风格指令编辑、生成样板按钮、保存样板/在编辑器中打开、底部 footer
- PatternPicker：模板库标题、过滤分类与来源、导入/导出 toolbar、复制插入 / 引用模板、删除确认对话框
- panels/BlockPanel：BLOCK_TYPE_LABELS 用 hook 化、所有 Section 标题、表单字段编辑器（FormFieldsEditor）、容器编辑器、Tab 编辑器、AddBlockToolbar
- panels/InlineBlockEditor：MagicId / Column 字段、各 block 主要 Field label（文本/标题/图片 URL/按钮文字/列表项/徽章/图标/卡片标题等核心交互可见 label）
- 兜底：SlideList 拖拽栏、PropertyPanel 顶部 tabs、HistoryDialog、StorageDialog、PreviewDialog 关键文案
- editor.json/dialog.json/chat.json 三个 ns 大幅扩充 keys

**仍含少量硬编码中文**：
- panels/SlidePanel、panels/DeckPanel（主题/动效/布局详细字段名）
- InlineBlockEditor 的 Select options（左对齐/居中、主色/强调色等下拉选项 label）
- StyleCard、Canvas、ExtractPromptDialog、FormSubmissionsDialog 边缘文案
- 各源文件的 `//` 注释（不影响渲染）
影响：用户切到英文 UI 时主要交互文案与按钮均显示英文；下拉选项 / 主题面板的"装饰/字体/圆角"等技术性较强的 select label 仍部分显示中文。继续完整覆盖只需在 zh-CN/en editor.json 补 keys 然后逐个 file Edit。

**示例 deck**：仅 04-magic-move 与 05-creative-deck 有英文版（其余 01/02/03 在 client 内未被引用）。

### PDF 导出

参照 open-slide 做能力对照，补强会议留档 / 邮件分享场景的 PDF 导出能力（与 zip 静态站、Cloudflare 一键直传并列为第三种发布形态）。

**新增**：
- `client/src/publish/exportPdf.ts`：`exportAsPdf({ deck, renderRoot, setIndex, signal, onProgress })` 把 deck 每页按 1280×720 截图（`html-to-image`）后拼为 PDF（`jspdf`），支持 AbortController 取消 + 进度回调；`buildPdfFilename(deck)` 命名复用 zip 同套路
- `client/src/publish/PdfStage.tsx`：固定 1280×720 的离屏渲染舞台（`position: fixed; left: -99999`），渲染管线复用 `Deck` + `expandDeck(getPattern)`，与编辑器画布 / SlideList 缩略图同源；`transitionMode="sync"` 抑制 framer-motion 动画

**UI** `client/src/editor/PublishDialog.tsx`：
- Tab 加第三栏"导出 PDF"（FileText icon）
- `PdfView` 三态：
  - **idle**：演示标题 + 页数 + 主按钮"开始导出 PDF"
  - **exporting**：进度条（构建第 N / M 页 + 百分比）+ "取消"按钮
  - **ready**：绿色成功条 + 显式"下载 PDF"按钮（不自动下载，与 zip 调整一致）
  - **error**：复用 ErrorView
- `PdfStage` 仅在 `tab === "pdf"` 且非 idle 时挂载，避免常驻 DOM 占用
- `setIndex` 实现：`setStageIndex(i) + 等两帧（rAF×2）`，让 React commit + 转场结束后再截图
- 字体加载等待：`document.fonts.ready` 防首页字体未就绪时退化系统字体

**已知限制**（PdfView idle 文案已提示）：
- iframe / 视频等交互内容在 PDF 中无法呈现（html-to-image 不能截 cross-origin iframe 内容）
- 大 deck（50+ 页）耗时较长，进度条 + 取消按钮保证可控性

**依赖**：`html-to-image@1.11.13` + `jspdf@4.2.1`（jspdf 间接 lazy load `html2canvas` 但本流程不用其 .html() API；首屏不影响）

### SlideList 真缩略图

左侧栏从"标题文本占位 + 主题色块"升级为"真实 Deck 渲染缩略图"：
- `client/src/editor/SlideList.tsx` 每页用 `ScaleStage(1280×720)` + `<Deck>` mini deck（仅含本页，16:9 强制）做缩略图，逻辑与 PatternPicker 一致
- mini deck 通过 `useMemo` 依赖 `[slide, theme]` 缓存，未改的 slide 引用不变 → 不触发 Deck 内部 effect 重跑，避免 deck commit 时全列表抖动
- `resolvePattern={getPattern}` 注入，patternRef 引用模板的页面也能在缩略图正确展开
- 缩略图容器 `pointer-events-none`，内部交互不冒泡；序号 + 拖拽手柄移到左上角浮层，hover 操作浮层在右上角
- 底部保留一行 layout 中文标签（"标题封面 / 双栏 / 流程"等）
- 编辑/预览/对比度等已有约束（如 ScaleStage 等比缩放）继续生效，不影响真实画布尺寸渲染

### 发布与对话历史微调

**zip 导出不再自动下载**：
- `client/src/editor/PublishDialog.tsx` 移除 `triggerDownload` 调用，避免每次生成都强制弹出浏览器下载对话框
- ZipReadyView 文案从"已自动下载"改为"点击右侧按钮下载到本地"，下载入口提升为绿色主按钮更显式

**编辑器变动自动同步对话历史**：
- 新增 `client/src/editor/useAutoSyncConversation.ts`：监听 `deck` 变化，600ms debounce 写回当前 conversation（保留 createdAt / messages / durationMs，仅更新 deck / title / updatedAt）
- `EditorShell` 顶层调用 hook
- streamingMode 期间跳过（避免与 commitStreamingDeck 流式机制竞写）；无 currentConversationId 时跳过（用户尚未发起任何对话时不自动建条目）
- 效果：用户在编辑器内任意操作（改文本、加块、换主题等）后，再去"对话历史"打开同一条对话，能立即看到最新版本，而不是停留在最近一次 LLM 调用时的快照

### Cloudflare Pages 一键直传

支持浏览器**不暴露 API Token** 直接发布到 Cloudflare Pages，无需复制 npx 命令到终端。

**架构**：
```
浏览器 → 自部署 Cloudflare Worker（同源 CORS 友好）→ Cloudflare Pages Direct Upload API
```

Worker 持有 `CF_API_TOKEN`（仅 Pages:Edit 最小权限），浏览器看不到。

**新增**：
- `server/cf-deploy-worker/` 完整 Cloudflare Worker 项目
  - `src/worker.ts`：处理 zip 接收 → 解压 → CF Pages 多步上传（jwt / assets check / upload / manifest / deployment）→ 返回部署 URL
  - `wrangler.toml` / `tsconfig.json` / `package.json` / `README.md`（5 分钟部署文档）
- `client/src/data/deploySettings.ts`：localStorage 存 Worker URL + 项目名
- `client/src/publish/directUpload.ts`：浏览器 XHR POST zip blob → Worker，含上传进度 + 部署 URL 返回
- `client/src/publish/exportZip.ts` 加 `buildZipBlob()` 拆出 blob 构造（不带下载触发，复用给直传）

**UI** `client/src/editor/PublishDialog.tsx`：
- 顶部 Tab 切换"一键直传 / 导出 zip"，默认按是否配置过 Worker 切到对应 tab
- 配置弹窗：填 Worker URL + Pages 项目名（首次使用引导）
- 直传 idle 态：未配置 → 黄色警告条 + "立即配置"；已配置 → 蓝色"一键直传 Cloudflare Pages"按钮
- 直传 uploading 态：进度条（构建 / 上传两阶段）+ 百分比 + "约 5-15 秒"提示
- 直传 ready 态：绿色成功条 + 部署 URL（可复制 + 一键访问）+ aliases 别名

**复用现有**：
- `expandDeck` patternRef 预展开（Worker 接收的 zip 已自包含）
- `buildPublishFiles` runtime 模板填充
- `JSZip` 客户端打包（与 Worker 端 JSZip 解压对称）

**部署步骤**（用户首次）：
1. 在 CF 控制台拿 Account ID + 创建 Pages 项目（Direct Upload 模式）+ 创建 API Token（Pages:Edit）
2. `cd server/cf-deploy-worker && pnpm install`
3. 编辑 `wrangler.toml`：填 `CF_ACCOUNT_ID` + `DEFAULT_PROJECT`
4. `npx wrangler secret put CF_API_TOKEN`（粘贴 token）
5. `npx wrangler deploy` → 拿 Worker URL
6. 编辑器发布对话框 → 配置 → 填 Worker URL + 项目名
7. 之后每次"一键直传" → 几秒拿到部署 URL

**安全**：
- API Token 仅在 Worker 内部，浏览器永远拿不到
- `ALLOWED_ORIGIN` 默认 `*`，生产建议改为编辑器域名
- Token 权限最小化（仅 Pages:Edit，不给 Account-level）

**验收**：typecheck + build + build:runtime 全过；服务端 Worker 用 wrangler 单独部署



### 能力补充模块：图片识别驱动 Pattern + Skill 自助生成（最新）

为解决"内置 Pattern/Skill 库硬编码、用户无法用自己视觉灵感扩充"瓶颈，新增图片驱动的能力补充对话框。让用户从一张参考截图（小红书 / 设计稿 / 海报）一次性生成"具体页面样板 + 风格能力包"双产物，自助扩充库容量。Plan 归档于 `~/.claude/plans/image-1-image-2-optimized-thimble.md`。

**LLM 调用层** `client/src/llm/capabilityGenerator.ts`：
- 完全复用 `styleGenerator.ts` 多模态双协议骨架（Anthropic + OpenAI 兼容）；图片在前 text 在后；路由到 `getActiveConfig("image-recognition")` 场景
- system prompt 注入完整 DSL 速览：11 layout / 16 block（重点 stat/flow/table/chrome/RichText/per-item list）/ 37 utility / 8 色 tone palette / 60 icon 白名单子集
- 工具定义 `build_capability` 一次输出 pattern + skill 双结构：
  - pattern: name / description / category（9 类）/ tags / themeHint / slides[1]
  - skill: name / description / triggers[4-8] / systemAddon[600-1000 字] / recommendBlocks / recommendUtilities / recommendTheme
- 校验：用 `SlideSchema.safeParse` 校验 pattern.slides[0]，失败时仅返回 skill + patternError 提示用户"仅可保存 skill"
- 视觉模型不支持错误友好提示

**双产物 UI** `client/src/editor/EnhanceCapabilityDialog.tsx`：
- 三态切换（input / generating / ready）；input 态 1-3 张图上传（3×3 缩略图网格，单张 ≤ 5MB，FileReader base64）+ 可选 brief textarea；模型未配置时打开 ProviderSettingsDialog
- ready 态左右双面板：左 pattern 预览（小尺寸 Deck 渲染 + name/description/category/tags 表单）+ 右 skill 编辑（name/description/triggers/systemAddon/recommendBlocks/recommendUtilities，各项含可加可删 chip 编辑器）
- 底部 4 按钮："两者都保存"（自动把 pattern.id 回填到 skill.fewshotPatternIds）/ "仅保存 pattern" / "仅保存 skill"（pattern 失败时唯一可用）/ "重新生成"
- pattern 校验失败时显示 amber 警告条，禁用"两者都保存"与"仅保存 pattern"按钮，但保留"仅保存 skill"

**入口** `client/src/editor/PatternPicker.tsx` header 加紫色"上传图片新建"按钮：触发 dialog；保存后自动 refresh PatternPicker 列表

**保存逻辑**：
- pattern 走 `addUserSavedPattern`（已有）；source 设为 user-saved；自动 nanoid 生成 id
- skill 走 `addUserSavedSkill`（已有）；fewshotPatternIds 在保存"两者都保存"时自动填入刚保存 pattern 的 id；"仅保存 skill"时为空数组
- 保存的 skill 自动通过 `loadAllSkills`（agent.ts 已使用）进入 LLM 触发匹配池——下次用户用对应 trigger 即激活新 skill

**复用的成熟基础设施**（避免重造轮子）：
- styleGenerator.ts 双协议多模态调用骨架（splitDataUrl + callAnthropic + callOpenAI）
- NewStyleDialog 的图片上传 + 三态切换 UI 模式
- getActiveConfig("image-recognition") 路由
- SlideSchema.safeParse 静态校验
- addUserSavedPattern / addUserSavedSkill 数据层 API

**长期意义**：
- 零代码扩张——库容量随用户使用线性增长，项目方不必为每种风格改源码
- 风格领域自治——每用户的库自然演化出符合自己审美 / 行业的 pattern + skill 集合
- 与已有体系协同——StylePrompt（视觉风格）/ Pattern（视觉模式）/ Skill（生成策略）三层乘法 + 现在每层都可由用户图片自助补充 → 表达力指数级增长

**验收**：typecheck + build + build:runtime 全过；主包 +9KB gzip 至 311KB；runtime 不变（编辑器代码不入 runtime）。待用户实测：在 PatternPicker 点"上传图片新建" → 上传 1 张暗色教程截图 + brief "教程长图" → 验证 ready 态左侧 pattern 缩略图 + 右侧 skill 元数据；选"两者都保存"后 PatternPicker 列表多 1 个 user-saved pattern，skills 库多 1 个 user-saved skill（fewshotPatternIds 含刚保存 pattern.id）；闭环：在 Home 输入命中新 skill 触发词的 prompt → LLM 应注入新 skill 的 systemAddon + 引用新 pattern 的 fewshot JSON

### Pattern 库 + Skill 能力包（让 DSL 具备创造性）

为解决 DSL 枚举式扩张的根本瓶颈（每加一种视觉就要改 schema/renderer/editor/prompts 4 处），引入"创造性沉淀"基础设施：让"创造性"通过 **Pattern 复用 + Skill 配方** 实现，DSL 仍保持结构化与确定性渲染。Plan 归档于 `~/.claude/plans/image-1-image-2-optimized-thimble.md`。

**L1 Pattern 库（视觉模式样板）**：
- `client/src/data/patterns.ts` 数据层（仿 stylePrompts：内置/用户保存/AI 生成/Pin 提升 + localStorage）
- `client/src/data/patternsBuiltin.ts` 内置 10 个高质量样板：dark-glow-hero / stat-grid-3 / mac-window-cover / card-list-bars / numbered-quad-tone / dark-comparison-table / painpoint-vs-solution / flow-3step / bold-quote-glow / dark-cta-glow（覆盖 6 张参考截图所有视觉）
- `client/src/editor/PatternPicker.tsx` 网格 + 类别 + 来源筛选 + 缩略图预览 + 详情面板，支持"完整插入"或"以 patternRef 引用方式插入"两种粒度
- Toolbar 加"模板"按钮触发；店家可后续在 SlideList 加"保存为模板"右键

**L2 Skill 能力包（按需 prompt 配方）**：
- `client/src/data/skills.ts` 数据层 + `skillsBuiltin.ts` 6 个内置：dark-notion-tutorial / dark-cyberpunk / editorial-magazine / minimal-luxury / corporate-pitch / launch-fanfare
- 每个 skill 含触发词数组 + systemAddon（紧凑配方 ~600-1200 字）+ 推荐 pattern id + 推荐 block / utility + 推荐主题
- `client/src/llm/skillMatcher.ts` 简单字符串包含匹配；`buildSkillAddon` 把 skill 配方 + 推荐 pattern 完整 JSON 拼到 system prompt 末尾
- `agent.ts` `generateOnce` 注入 skill：用户主动选的优先（`opts.skillId`），否则按用户消息触发词自动匹配；翻译模式（forceTranslationMode）下不注入避免续接每批多扛体积

**L3 Schema 微开口**：
- `SlideSchema.patternRef?: string` 一个新可选字段
- 新增 `client/src/renderer/expandPattern.ts`：`expandSlide(slide, resolver)` 把 pattern 作为 base 与 slide override 合并；`expandDeck` 整 deck 一次性预展开（发布用）
- Deck.tsx 加 `resolvePattern?: PatternResolver` prop；编辑器 Canvas / PreviewDialog / PatternPicker 注入 `getPattern`；独立站发布时 `exportZip` 调 `expandDeck` 预展开（runtime 不需要 pattern 库）

**编辑器集成**：
- store 加 `insertSlidesAfterCurrent(slides)` action（PatternPicker 用）
- pattern picker 提供两种插入：完整 pattern.slides（self-contained 不依赖 pattern 库存在）/ 仅 patternRef 引用（pattern 修改时所有引用页面自动跟随）

**Prompt 整合**：
- `prompts.ts` DSL 速览加 patternRef 字段说明 + Pattern 库使用约定（"命中能力包时优先用 patternRef，blocks 仅覆盖文案"）
- 老式逐字写视觉的方式仍保留（未命中能力包时）

**为什么不做 CSS passthrough / Tailwind passthrough**：
- 失控风险大（contrast 灾难、性能差的滤镜、错误的 z-index）
- pattern 库 + skill 配方已能覆盖绝大多数场景
- 与"简单稳定主流方案、不过度工程"原则一致

**长期意义**：
- 数据驱动迭代：pattern 库越大 → LLM 学习样本越好 → 生成品质提升 ≠ 代码改更多
- 能力解耦：StylePrompt（视觉风格）/ Pattern（视觉模式）/ Skill（生成策略）三者乘法，远胜"加更多 block"线性扩张
- 用户成为创作者：保存的好页面成为可复用资产；后续可加 pattern 导入导出社区分享

**验收**：typecheck + build + build:runtime 全过；10 个内置 pattern 用 SlideSchema.safeParse 全部通过；旧 deck 渲染不变。待用户实测：在 Home 输入"做一份小红书风格 Pencil 教程长图"看 LLM 是否会用 patternRef 复用 + 推荐 block

### Notion / 小红书 暗色长图 风格能力扩张
为支持「教程长图 / 小红书风暗色分享」视觉，对 DSL / 渲染器 / Prompt 做端到端扩张。Plan 归档于 `~/.claude/plans/image-1-image-2-optimized-thimble.md`。

**Schema 层**：
- `theme.colors` 新增可选语义色 `danger / success / warning / info`（红/绿/橘/蓝），`theme.ts` 注入对应 CSS 变量，未提供时用合理默认
- 新增 `RichTextSchema`：`heading.text` / `text.text` 字段支持 `string | Array<{ text, tone?, bold? }>`，让标题中部分词独立染色（核心动词/关键数字渐变高亮）。`useInterpolatedRich` 对每段单独插值
- `BadgeBlock.tone` / `IconBlock.tone` 扩展到完整 palette（旧 3 档 → 8 档）
- `ListBlock.items` 升级为 `Array<string | { text, tone?, iconName? }>`，per-item 染色 + 自定义图标编号；渲染编号方块/圆点按 tone 颜色，自定义 icon 替代默认 marker
- 新增 4 个 block：
  - `stat`：超大数字 + 小标签 + 可选 trend 箭头
  - `flow`：横排流程 chip（2-6 步），arrow / chevron / plus 三种连接符，每步可独立 tone
  - `table`：headers + rows，单元格支持对象 `{text, tone?, bold?}`；highlightCol 整列 primary 底色强调
  - `chrome`：mac 三圆点 + title / browser 地址栏样式
- `meta.showPageNumbers` + `slide.showPageNumber`：右上角小灰字 N/M 自动注入；从 RuntimeContext 拿 currentIndex/totalSlides

**Utilities 层**：
- 新增 7 个左侧高亮竖条：`hxs-bar-l-{primary|accent|success|warning|danger|info|rainbow}` —— 5px border-left 配 1.25rem padding-left；rainbow 用 border-image 渐变
- 用法约定：多卡片纵向列表用不同 tone 的左竖条形成色彩节奏（Notion 风核心手法）

**渲染器**：
- 共享 `toneToColor()` 工具：badge / icon / stat / flow / list / table / RichText 共用
- `renderSegments()` 渲染 RichText：tone 用 CSS 变量；`gradient` 用 background-clip:text 主→accent 渐变

**编辑器**：
- BlockPanel `BLOCK_TYPE_LABELS` + `SIMPLE_BLOCK_TYPES` + `defaultChild` 加 4 个新 block；属性面板加对应字段表单
- 编辑器对 RichText 数组与 list 对象项**只支持降级为字符串编辑**；遇到富文本数据显示琥珀提示「编辑后将转为纯文本，要保留色彩请用 JSON 或对话调整」
- SlidePanel `blockSummary` / SlideList 缩略图 `headingText` 都用 `flatText` helper 兼容 RichText 数组

**Prompt**：
- DSL 速览补：theme palette 4 色 / showPageNumber / RichText 形态 / per-item list 形态 / 4 个新 block / utilities 左竖条配方 / **通用 tone 全集** 8 色说明
- 新增「暗色 Notion / 小红书 教程长图风格」长配方段（9 条具体范式）：基础架构 → 标题局部染色 → 卡片节奏 → 数据对比 → 流程图 → 编号心得 → 大数字 hero → 章节装饰 → CTA 金句条
- 旧"超大数字震撼"配方从「free 布局拼」改为「直接用 stat block」

**兼容性**：
- 4 个真实 examples（01-04）全部 schema.safeParse 通过；05-creative-deck 仅作为 LLM few-shot 示例（id 留空），非渲染目标
- 旧 deck text 字段是 string 不变；list items 是 string[] 不变；新字段全 optional

**验收**：typecheck + build（294KB gzip，+8KB）+ build:runtime（129KB gzip，+2KB）全过。待用户实测：用「参考下面 6 张图风格做一份 6 页 Pencil 教程演示」+ 上传截图，看 LLM 是否会用新能力（RichText / 左竖条 / per-item tone / table / flow / stat / chrome / 页码）

### 毛玻璃 utility 主题自适应修复
- **现象**：暗色主题下 card 出现浅色背景 + 浅色文字（截图：暗夜极客风格 + 浅卡 + 浅灰白文字几乎不可见）
- **根因**：`hxs-frost` / `hxs-frost-strong` / `hxs-translucent` 用写死的 `rgba(255,255,255,0.X)`，dark 主题下盖在深底上呈浅色，但文字 `--hxs-fg` 仍是浅灰白 → 灾难性低对比
- **修**：
  - `index.css` 把这三个毛玻璃类的 background-color 改为按 `--hxs-bg` 主题变量 `color-mix` 取半透：light 主题自动呈现浅玻璃、dark 主题自动呈现深玻璃，文字色与底色自然对比
  - 老浏览器无 backdrop-filter 时回落到更高不透明度（仍走 color-mix）
  - `hxs-frost-dark` 保持原行为（强制深色玻璃，用于 light 主题反差暗块）
  - `prompts.ts` 颜色对比度红线段加 dark 模式警示：明确说 hxs-frost / hxs-translucent 已自动按主题切，但任何写死浅色固定值都会和默认 fg 冲突
- 验收：typecheck + build + build:runtime 通过

### 取消每页 block 数量硬性上限
- DSL `SlideSchema.blocks` 移除 `.max(6)` 限制 → 编辑器允许添加任意数量内容块
- system prompt 文案统一从"硬性 ≤ N"改为"建议密度"语气：
  - 创作约束：每页 4-6 个（DSL 无硬性上限），≥ 8 页紧凑模式建议 ≤ 4
  - 固定画幅约束：常规约 5、留白布局 3，DSL 无硬性上限但塞太多会被画幅裁切
- PRD §4 同步更新页数/块数策略说明
- 验收：typecheck + build 通过

### patches 字符串化 + 截断容错
- **现象**：mimo 在 streaming 模式下把 `patches` 字段值序列化成 JSON 字符串（部分服务的 tool_calls.arguments 实现 quirk），且字符串被 max_tokens 截断 → coercePatches `JSON.parse` 失败 → 整批 3 页失败
- **修**：
  - `validate.ts` 加 `recoverTruncatedPatchArray(text)`：扫 brace 计数定位最后一个完整 op 对象的闭合点，截断处补 `]` 后 parse；让用户至少拿到前 N 个完整 op
  - `coercePatches` 字符串路径 catch 后调用恢复函数兜底
  - 错误信息检测「字符串 + 含 `[` 但不以 `]` 收尾」特征，附诊断提示「调高 max_tokens / 减小每批页数 / 换更稳服务」
  - `prompts.ts` 在 patch_deck 形态约束里加更强禁令：明确禁止 `"patches": "[...]"` 字符串化 + 警告字符串化容易超 max_tokens 被截断
- 验收：typecheck + build 通过

### PRD 全面回填
- `docs/PRD.md` 0.5 → 0.6，回填自上次更新（2026-05-07）以来的所有功能演进：
  - 11 种布局（含 three/four/five-column）+ 12 种 block + 30+ utilities + 6 转场 + 3 画幅
  - 模型能力档位（general / text-only / multimodal）+ 按能力分槽启用 + 路由优先级配置（用户可调）
  - 风格图片识别（多模态 base64）+ 内置清空 + Pin 提升机制 + 移除「我保存的」分类
  - 分批生成（PAGES_PER_BATCH=3 + 自动切段兜底 + 多级 markdown 标题识别）
  - 翻译模式判定 + estimatePages matchAll + 续接强制翻译模式
  - 编辑器 / 预览 ScaleStage 缩放（1280×720 / 1024×768 viewport）
  - 配置 UI 改造（圆点 + capability 徽章 + 一键复制 + 停用 + 路由配置 + 列表态外部点击关闭）
  - max_tokens 策略修正、错误诊断真实规模、流式 assistant 消息规范化
  - 进度文案（正在生成第 X/Y 页 + 整理收尾）+ 模型名 chip 展示 + 累加耗时
  - patch_deck 输入宽容兜底
- 新增 §7「已解决的设计权衡（决策记录）」对关键改向理由做归档
- §8 未尽事项重写：标记已解决项目、保留待优化项

### AI 请求中追加模型名展示
- 三个 AI 触发场景的进度态都加了"本次请求使用的模型"提示：
  - **Home 生成演示**：ProgressBar 进度文案旁加蓝色 chip 显示模型别名
  - **编辑器 ChatPanel 对话调整**：ProgressBubble 同样加 chip
  - **NewStyleDialog 一键生成**：左侧表单下加紫色提示条，右侧 generating 占位下加副文案
- 模型名按场景命中：Home/ChatPanel 用 `getActiveModelConfig()`（默认 general 路由）；NewStyleDialog 按是否带图片走 `image-recognition` 或默认
- Status / progress state 都加 `modelName?: string` 字段，进度条 hover 显示完整 title
- 验收：typecheck + build 通过

### 路由优先级改为可配置
- 移除上一轮的只读 CapabilityRoutingHint 提示卡
- 数据层（`settings.ts`）：
  - 加 `RoutingScenario = "general" | "image-recognition"` 类型 + `ROUTING_SCENARIO_LABELS` + `DEFAULT_ROUTING` 常量
  - `LlmSettings.routing?: Partial<Record<RoutingScenario, Capability[]>>` 持久化用户自定义优先级
  - `getActiveConfig(input)` 入参支持场景名（按 routing 配置查）/ Capability[] 数组（兼容旧调用）/ undefined（默认 general 场景）
  - 加 `getRoutingPriority(sc)` / `setRoutingPriority(sc, order)` / `resetRoutingPriority(sc)` API
  - 加 `isValidPriority` / `sanitizeRouting` 校验：只接受含全部 3 个能力且不重复的数组，否则回退默认
- styleGenerator 改用场景名调路由：图片识别走 `getActiveConfig("image-recognition")`，纯文字走默认
- UI（`ProviderSettingsDialog.tsx`）：在列表 main 顶部加 `RoutingPriorityEditor`：
  - 两行场景：普通生成 / 图片识别
  - 每行三个 capability chip，前面带优先级序号 1/2/3，每个 chip 后跟 ⬆/⬇ 按钮上下移动调序
  - 已被自定义时显示「重置」按钮恢复默认
  - 改动即时持久化
- 验收：typecheck + build 通过
- `ProviderSettingsDialog` 列表 main 区顶部加 `CapabilityRoutingHint` 卡片：
  - 上行：三个能力槽的彩色徽章 + 当前启用模型名（绿点 = 已启用 / 灰点 = 未启用）
  - 下行：默认路由优先级说明 ——「普通生成 = 全能 → 仅文本推理 → 全模态理解；图片识别 = 全模态理解 → 全能（前者未启用时自动回退）」
- 让用户在分槽启用后仍能一眼看出每个场景实际命中哪个模型，不必心算
- 验收：typecheck + build 通过

### 预览页面左右多余留白修复
- **现象**：PreviewDialog 固定比例预览时，左右两侧多出明显留白
- **根因**：外层容器组合了 `aspectRatio: 16/9` + `width: min(100%, 100vh*16/9)` + `maxHeight: 100%` 三者；当 main 区高度受 maxHeight 限制时，浏览器为保持 aspect-ratio 反向压缩 width，导致容器没顶到 main 全宽
- **修**：移除外层 aspectRatio/width 计算；外层改为 `relative w-full h-full`，让内层 ScaleStage 负责把 1280×720 / 1024×768 viewport 等比缩放居中；白底/圆角/阴影下沉到舞台内层（`absolute inset-0` 覆盖 1280×720），保证 16:9 形状由固定 viewport 决定，与浏览器 aspect-ratio 实现差异脱钩
- 验收：typecheck + build 通过

### 多级 markdown 标题分段标记识别
- **现象**：用户文档用 `### 第1页` `#### 第4页` `##### 第5页` `###### 第6页` 等 3-6 级标题写大纲（46 页），但分批生成只走 1/1 批 —— marker 没匹配上，全文退到自动切段
- **根因**：`segmentMessage.ts` 的 marker 正则写的是 `^##\s*第\s*\d+...`，仅识别二级标题；多级标题首字符仍是 `##` 但后面不是 `\s` 或「第」，不匹配
- **修**：把第 1/2/3 条 marker 的 `^##` 改为 `^#+`，兼容任意级别 markdown 标题
- 效果：含 46 个 `### 第N页` 的文档现在能正确切出 46 段，按 PAGES_PER_BATCH=3 → 16 批生成
- 验收：typecheck + build 通过

### 取消内置文案 + 行为对齐新分类
- StyleCard 的 PinOff 按钮 title：「取消内置（转回我的保存）」→「取消内置（转回 AI 生成）」
- `demoteBuiltinStylePrompt` 实现：从 stored.builtin 移到 stored.generated，source 改为 `"ai-generated"`（之前是写到 userSaved）
- 验收：typecheck + build 通过

### 移除「我保存的」分类 + 新建风格归入 AI 生成
- 数据层（`stylePrompts.ts`）：
  - `addUserSavedStylePrompt` 实现改为写入 `stored.generated`，source = `"ai-generated"`（函数名保留以兼容现有调用方）
  - `loadStylePromptsBySource("ai-generated")` 把旧 `user-saved` 数据合并显示，避免去掉分类后旧风格隐藏
  - `updateUserSavedStylePrompt` 同时支持 generated 与 userSaved 两个来源（旧数据可继续编辑）
- UI（`Home.tsx`）：
  - `SOURCE_FILTERS` 去掉 `user-saved` 项，只剩「全部 / 内置 / AI 生成」
  - NewStyleDialog 保存后自动 `setFilter("ai-generated")`（原来切到 `user-saved`）
  - EmptyHint 同步移除 user-saved 文案分支，AI 生成空态加引导「点 + 新建风格 让 AI 帮你做一个」
- 验收：typecheck + build 通过

### 内置风格清空 + 用户可提升保存案例为内置
- **诉求**：清空内置案例，对保存的案例加入「转入内置」功能
- 数据层（`stylePrompts.ts`）：
  - `BUILTIN_STYLE_PROMPTS = []`（源码硬编码内置全清）
  - `Stored` 加 `builtin: StylePrompt[]`（用户提升上来的内置，持久化在 localStorage）
  - `loadAllStylePrompts` 顺序：用户内置 → user-saved → ai-generated → 源码 builtin
  - `promoteStylePromptToBuiltin(id)`：从 userSaved/generated 移到 builtin，source 改为 "builtin"
  - `demoteBuiltinStylePrompt(id)`：把用户提升的 builtin 转回 user-saved
  - `deleteStylePrompt` 同步清理 builtin 数组
- UI（`StyleCard.tsx` + `Home.tsx`）：
  - StyleCard 加 `onPromote` / `onDemote` 可选回调
  - hover 时显示对应图标按钮：Pin（绿色 - 转为内置）/ PinOff（琥珀色 - 取消内置）/ Trash（红色 - 删除）
  - Home 按 source 分配：user-saved/ai-generated 显示 Pin；builtin 显示 PinOff；所有动态来源都允许删除
- 验收：typecheck + build 通过

### 内置风格精简为两条
- 删除：极简留白 / 鲜艳活力 / 商务严谨 / 文艺编辑 / 赛博科技 / 暖色温馨 / 黑金高奢 / 友好手绘（共 8 条）
- 保留并重新设计为 builtin：
  - **暗夜极客（s-dark-geek）**：GitHub 暗色（#0d1117）+ 终端绿主色（#00ff88）+ 酷蓝强调（#58a6ff）+ Inter 无衬线 + sm 圆角；styleInstructions 强调命令行/工程师审美、网格底纹、文字微发光、克制冷峻
  - **青辉玻璃（s-cyan-glass）**：浅青蓝底（#e0f2fe）+ 青色 cyan 主（#06b6d4）+ 淡紫蓝强调（#818cf8）+ xl 圆角；styleInstructions 强调 hxs-frost 毛玻璃叠层、hxs-bg-radial 光晕、温和清新文案
- dist 旧 ID（s-minimal 等）仅出现在构建产物里，重新 build 已覆盖
- 验收：typecheck + build（934KB / 282KB gzip）+ build:runtime（127KB gzip）全通过

### 大模型配置弹窗外部点击行为分态
- 列表态：点遮罩自动关闭（恢复常规弹窗行为）
- 编辑/新建表单态：仅可通过关闭按钮退出，防止误点丢失正在编辑的 baseURL/apiKey/能力档位等表单数据
- 实现：外层遮罩 `onClick={view.kind === "list" ? onClose : undefined}` + 内层卡片 stopPropagation
- 验收：typecheck + build 通过

### 模型配置列表 UI 简化
- 左侧启用状态：`使用中`/`未启用` 文字徽章 → 改用 2.5×2.5 圆点（绿色 = 使用中，灰色 = 未启用），鼠标悬停查看完整说明
- 右侧启用按钮：`启用为 全能/全模态/仅文本推理` → 简化为单字「启用」，capability 信息已由列表行 capability 徽章承载，无需在按钮重复
- 停用样式：琥珀色 → 红色（`border-rose-300 text-rose-700 hover:bg-rose-50`），更明确警示
- 验收：typecheck + build 通过

### 模型配置一键复制 + 停用操作
- 数据层（`settings.ts`）：
  - `cloneModelConfig(id)`：基于现有 config 复制，name 自动加「(副本)」后缀，已存在时递增编号；新 id；仅在对应能力槽空时自动启用
  - `deactivateModelConfig(id)`：当且仅当该 config 当前占用对应能力槽时，把它从槽里撤下，其他槽不动
- UI（`ProviderSettingsDialog.tsx`）：
  - 列表行加 Copy 图标按钮（位于"启用为 X"按钮右侧）
  - 启用按钮在 active 时文案变「停用」，颜色由蓝色（启用）改为琥珀色（停用），点击调用 deactivate
- 验收：typecheck + build 通过

### 多模态 content 顺序对齐 MiMo 文档
- **背景**：用户提示参照小米 MiMo 多模态图片识别文档调整 base64 传入方式
- **对比**：
  - 字段格式 `{ type: "image_url", image_url: { url: "data:{MIME};base64,..." } }`：当前实现已正确，无需调整
  - **顺序差异**：MiMo 文档示例是 image_url 在前 → text 在后；当前是 text 在前 → image 在后。部分视觉模型对顺序敏感（图片需在指代它的文字之前提供上下文）
- **修**：`styleGenerator.ts:callOpenAI` 把 images 放在 text 之前
- 验收：typecheck + build 通过

### 模型能力档位 + 按能力分槽启用
- **诉求**：每个模型配置加能力档（全能 / 仅文本推理 / 全模态理解），唯一启用改为按能力维度独立启用；图片识别等场景自动路由到「全模态 / 全能」
- **数据层**（`settings.ts`）：
  - 新增 `Capability` 类型 + `CAPABILITY_LABELS / DESCRIPTIONS / ALL_CAPABILITIES` 常量
  - `ModelConfig` 加 `capability: Capability` 字段
  - `LlmSettings.activeId?` 改为 `activeIds: Partial<Record<Capability, string>>`（每能力一槽）
  - `getActiveConfig(preferred?: Capability[])` 按优先级数组查找第一个有效启用：默认 `["general", "text-only", "multimodal"]`
  - `setActiveModelConfig(id)` 按 config.capability 写入对应槽
  - `addModelConfig` 仅在槽空时自动启用；`updateModelConfig` 改 capability 时迁移启用状态；`deleteModelConfig` 同步清理槽
  - 数据迁移：旧 v2 `activeId` 自动转写到 `activeIds.general`；旧 ModelConfig 缺 capability 默认 general
  - PRESETS 加 capability：mimo=multimodal、Anthropic/GPT-4o/Gemini/Qwen/GLM=general、Deepseek/Kimi/SiliconFlow=text-only
- **图片识别路由**（`styleGenerator.ts`）：有图片时调 `getActiveConfig(["multimodal", "general"])`；无可用模型时给具体提示让用户启用支持图片的模型
- **UI**（`ProviderSettingsDialog.tsx`）：
  - ListView 行内显示 capability 彩色徽章（蓝/灰/紫）；active 判断改为 `activeIds[c.capability] === c.id`；启用按钮文案改为「启用为<能力名>」
  - FormView 加 3-button capability 选择器 + 实时显示能力描述；applyPreset 时连带写 capability
- 验收：typecheck + build 通过

### 大模型配置弹窗禁止外部点击关闭
- 现象：编辑大模型配置时误点弹窗外阴影区直接关闭，正在编辑的 baseURL/apiKey 等表单内容丢失
- 修：`ProviderSettingsDialog.tsx` 去掉外层遮罩 `onClick={onClose}` + 内层 stopPropagation；保留 header X 按钮 + footer 取消按钮关闭路径
- 验收：typecheck + build 通过

### 风格新建支持图片识别
- **诉求**：新建风格时，除了写文字描述，还能上传参考图片（设计稿/海报/截图），让 AI 识别其视觉风格并把提示词写入 styleInstructions
- **实现**：
  - `styleGenerator.ts`：`StyleGenInput` 加 `images?: string[]`（base64 dataURL 数组）；callAnthropic 用 `{type:"image", source:{base64,...}}`，callOpenAI 用 `{type:"image_url", image_url:{url}}`，data URL 直接传
  - SYSTEM 重写：明确"用户可能给文字、图片、或两者"；图片识别要点（主色/字体/留白/装饰/氛围）；要求 LLM 必须输出 `styleInstructions`（150-250 字指令式风格指引）
  - TOOL parameters 加 `styleInstructions` 必填字段；validateAndPack 解析后透传
  - `NewStyleDialog.tsx`：brief textarea 下方加 3×3 缩略图网格上传区，最多 3 张，单张 ≤ 5MB；FileReader 转 base64 dataURL；canGenerate 改为「文字 ≥ 5 字 或 至少 1 张图」
  - 保存时 styleInstructions 优先用 LLM 输出（图文综合）；纯文字模式回退用户原文
  - 多模态请求被拒（部分国产服务不支持 vision）→ 友好错误提示建议换支持视觉的模型
- 验收：typecheck + build 通过

### 编辑器内会话耗时累加显示
- **现象**：在编辑器内对话调整或追加生成时，进度条上方的 elapsed 读秒每次都从 0 开始，覆盖了首次创建及之前轮次的耗时
- **修**：
  - `ChatPanel.tsx`：submit 开始时读 `existingBefore.durationMs` 锁定为 `baseSecondsAtStart`（state），传给 ProgressBubble
  - `useElapsedSeconds(baseSeconds = 0)` 加可选 base 参数，返回 `baseSeconds + 本轮 tick`
  - `upsertConversation` 时 `durationMs = (existing?.durationMs ?? 0) + 本轮耗时`，从覆盖改为累加
  - Home（首次创建）不需要改，baseSeconds 默认 0 兼容
- 验收：typecheck + build 通过

### 编辑器画布缩放展示 + 底部安全区约束
- **现象 1**：编辑器中间画布 16:9/4:3 时内容若超出容器尺寸会被裁剪（看不到完整页）
- **现象 2**：演示态底部进度胶囊（NavigationBar）遮挡 LLM 生成内容底部
- **修**：
  - `Canvas.tsx` + `PreviewDialog.tsx` 都加 `ScaleStage(w,h)`：固定 1280×720（16:9）/ 1024×768（4:3）逻辑 viewport，ResizeObserver 监听容器尺寸 → `transform: scale(min(rectW/w, rectH/h))` 等比缩放居中。内容永远完整可见无滚动；auto 画幅保持原 Web 自适应不变
  - PreviewDialog 保留内置 NavigationBar（演示态固定 UI）
  - `prompts.ts` 在固定画幅约束里加「底部安全区」条款：底部 80-100px 是进度胶囊覆盖区，禁止放内容；可见安全高度按 1280×620 / 1024×668 设计；底部留呼吸空间
- 验收：typecheck + build 通过

### patch_deck 输入形态宽容兜底
- **现象**：分批续接 LLM 调 `patch_deck` 时，2 次重试都因 `input.patches 不是数组` 失败
- **根因**：LLM 偶尔把 patches 误传为单 op 对象、JSON 字符串、或用别名 `operations`/`ops`/`patch`，旧逻辑直接 reject
- **修**：
  - `validate.ts` 加 `coercePatches(toolInput)` 归一化：数组直接用；字符串 parse；单 op 对象包成 [op]；别名兼容
  - 错误消息更具体：附实际收到的 input 片段 + 正确格式示例，让 LLM 重试时知道怎么修
  - `prompts.ts` 在 JSON Patch 段后加「patch_deck 调用必须遵守的形态」明确约束 + 正确示例 JSON
- 验收：typecheck + build 通过

### estimate 污染 + 画幅溢出修复
- **问题 1**：分批生成中途显示「整理收尾…」。根因：`estimatePageCount` 用 `match`（不带 g 标志）取首匹配，「## 第 1 页 ...」开头命中 "1" → estimate=1 → 第 1 页落地立即触发收尾文案
  - 修：改用 `matchAll` 遍历所有命中，取最大数字。「## 第 1 页 ... ## 第 10 页」→ 正确得 10
- **问题 2**：选 16:9 / 4:3 画幅时内容仍能纵向滚动溢出。根因：`Deck.tsx` 外层按 aspectRatio 设了 overflow，但 `Slide.tsx` 内层 absolute inset-0 始终用 `overflow-y-auto` 接管滚动，外层 hidden 失效
  - 修：`Slide.tsx` 加 `isAuto?: boolean` prop；非 auto 时改 `overflow-hidden`；`Deck.tsx` 透传 `isAuto`
  - 同时 `prompts.ts` 在固定画幅时往 system prompt 注入强约束：block ≤ 5、heading ≤ 14 字、text ≤ 60 字、list ≤ 6 条、嵌套 ≤ 3、内容多时主动拆页，让 LLM 从源头控制单页密度
- 验收：typecheck + build（934KB / 282KB gzip）+ build:runtime（127KB gzip）全通过

### 流式累积 assistant 消息缺 role 字段修复
- **现象**：max_tokens=32000 仍 400；total input ~6.5K、max_tokens 8K 远未超限；4 条消息累积 = 重试场景
- **根因**：OpenAI provider 的 streamAndCollect 累积 message 时手动构造 `{ finish_reason, message: { content, tool_calls } }`——**缺 `role: "assistant"`**。非流式分支 SDK 自带 role；流式只能手动补。zod 失败重试场景下，无 role 的 message 被 push 回 messages 数组，mimo 等严格服务在第二次请求时直接 400
- **修**：
  - `streamAndCollect` 返回 message 显式加 `role: "assistant"`；同时仅在有 tool_calls 时才输出 tool_calls 字段（空数组 `[]` 部分服务不接受）
  - `normalizeAssistantMessage` 兜底：强制 role="assistant"，无 tool_calls 时删 tool_calls 字段，有 tool_calls 时 content 必须为 null
- 验收：typecheck + build 通过

### assistant 消息 tool_calls + content="" 兼容性修复
- **现象**：mimo 分批续接 zod 重试时 push 的 assistant 消息含 tool_calls 但 content="" → 第二次请求 mimo 报 `400 Param Incorrect`，input ~6.5K token + max_tokens 8K 远未超限
- **根因**：OpenAI 规范规定 assistant 消息含 tool_calls 时 content 应为 null（不是空字符串）；mimo 等国产兼容服务严格校验，遇到 `""` 直接拒绝
- **修**：openai.ts 加 `normalizeAssistantMessage(msg)` 辅助：含 tool_calls 时把空字符串/undefined content 替换为 null；3 处 `messages.push(choice.message)` 全部走这个规范化
- 验收：typecheck + build 通过

### 400 错误诊断信息修正（最新）
- **现象**：mimo + max_tokens=80000 时分批末批失败，错误显示 `user=60 字符` 但实际 messages 总规模几 KB（误导）
- **根因**：openai.ts:158 旧逻辑 `userLen = messages[messages.length - 1]?.content?.length`——zod 校验失败重试场景下末条是 60 字符的「请直接调用工具…」短重发提示，掩盖真实规模
- **修**：改为 messages 数组所有 content 字符总和（减去 system 已单独计数）；多轮时附「N 条消息累积，含重试」标记；max_tokens ≥ 32000 时附「偏高会挤压输入可用空间」提示
- 验收：typecheck + build 通过

### 进度条文案微调（含 hotfix）
- **现象 1**：流式生成时进度条主文「边生成边渲染中… 已生成 N 页」与右侧 `N / total` 数字重复
- **现象 2**：刚点击生成时显示「已生成 1 页」语义不准
- **现象 3（hotfix）**：上一版改完后点生成立刻显示「整理收尾…」、原本的 connecting/thinking 等文本消失
  - 根因：`streamingSlideCount` 直接读 `deck.slides.length`，但 `startStreamingDeck` 先塞了一个 `__skeleton__` 占位 slide → 误算成 1 页；同时 estimate 默认 5 但 totalPages 取 max(1, estimate) 后边界判断不当
- **修**：
  - `Home.tsx` + `ChatPanel.tsx` 的 `streamingSlideCount` selector 排除骨架占位
  - `lib/phaseLabel.ts` streamingMode 分支改为：仅 `streamingSlideCount > 0` 时才显示「正在生成第 X / Y 页…」（X = streamingSlideCount + 1，Y = max(已落地, estimate)）；0 页落地时**落到原 switch** 让 connecting/thinking/receiving 等早期文本继续可见；全部 emit 完显示「整理收尾…」
  - 删掉 streamingMode 下右侧重复的 `N / total` 数字
- 验收：typecheck + build 通过

### 长文本+风格 速度稳定优化（三件套）

针对「Home 选风格案例 + 输入长需求文案」场景的稳定+速度优化。Plan 归档于 `~/.claude/plans/clever-splashing-dream.md`。

**改动 1 · 修分批续接退回普通模式 + estimatePageCount 污染**
- 现象：分批续接每批 `userMessage` 是单段文案（几百字），`buildSystemPrompt` 用 `userMessage.length >= 800` 自动判翻译模式 → 续接批次反而退回普通模式，每批多扛 4000 token CREATIVE_ADDONS。原本为减小 prefill 的分批反而更慢
- 同时 `estimatePageCount` 从 batchPrompt 拼出的「第 N 页」错捞数字
- 修：`AgentOptions` 加 `originalUserMessage` + `forceTranslationMode`；`generateOnce` 用 `originalUserMessage` 算 estimatePages；`buildSystemPrompt` 加 `forceTranslationMode` 参数；分批续接调用时显式传 `forceTranslationMode=true`
- 收益：每批省 ~4000 input token，prefill -30~40%

**改动 2 · segmentMessage 自动切段兜底**
- 之前：必须 ≥3 段 `## 第 N 页` 标记才分批，散文式长需求退回单次大 prefill
- 修：`detectSegments` 加兜底——marker hits<3 时，若 `length >= 3500` 且 `\n\n` 切的非空段落数 >= 6，按段落边界 + ~1500 字符目标贪心打包；末尾残留段落（< 500 字符）合并到上一段避免边角段；title 取首段首行前 30 字
- 阈值保守（3500/6），中等文案仍走单次生成路径，零回归

**改动 3 · 每批 ~3 页（PAGES_PER_BATCH=3）**
- 之前：每段=1 页固定，10 段标记 = 10 次串行 LLM 往返
- 修：新增 `chunkSegments(segments, size)`；`buildBatchPrompt` 签名改为 `(chunk, chunkIdx, totalChunks, accumulatedPages, totalPages)`，header「本批输出：第 X-Y 页（共 N 页 deck）」，body 拼 chunk 内多段并加「--- 第 N 页内容 ---」分隔；首批/续接 instruction 文案对应改成 chunk.length 页
- streamParser 按 `}` 闭合扫 emit，多页 JSON 流中第 1 页闭合就 emit，**首屏不延后**，只是后续页变成「每秒 ~3 页接连落地」
- 收益：10 页 deck 从 10 次往返 → 4 次（3+3+3+1），总 prefill -60%

- 验收：typecheck + build（932KB / 281KB gzip，+1.7KB gzip）+ build:runtime（127KB gzip 不变）全通过；待用户实测 7 个手测点

### computeMaxTokens override 被 estimate 反向 cap 修复
- **现象**：用户在「最大输出 tokens」填 80000，分批生成第 3/10 批仍被 max_tokens=6890 截断
- **根因**：`computeMaxTokens(estimate, override)` 注释说「max_tokens 是上限不是配额，直接返回 ceiling」，实现却写成 `Math.min(override, max(need, 5500))`——当 estimate=3 时 need=6890，把 override 80000 反向截到 6890。注释与实现脱节
- **触发链**：分批模式 buildBatchPrompt 拼出「本批输出：第 3 页（共 10 页 deck）」，estimatePageCount 正则匹配第一个 `\d+\s*页` 命中 "3 页" → estimate=3 → need=ceil((3×1100+2000)×1.3)=6890 → 80000 被截到 6890
- **修复**：`providers/openai.ts` 与 `providers/anthropic.ts` 两处 computeMaxTokens 改为「override > 0 时直接 return override」；未设置时才用 need 算保护性默认值（OpenAI 5500-8000、Anthropic 5500-32000）
- 验收：typecheck 通过

### 400 错误自动降级 + 信息提炼
- **痛点**：批次失败只看到 "400 Param Incorrect"。SDK 的 `err.error` 已含响应体，但旧代码只用 `err.message` 把详情吞掉了。同时国产兼容服务普遍把"max_tokens 超过该模型上限"也含糊报成 "Param Incorrect"，没有具体提示
- **修复 1（信息提炼）**：openai/anthropic 两 provider 加 `extractServerDetail`，按 `err.error.error.message` → `err.error.message` → JSON 兜底逐级取真实服务端说明；400 错误优先显示 detail
- **修复 2（自动降级重试）**：openai provider 在 catch 到 400 时自动把 `max_tokens` 减半最多 2 次（8000 → 4000 → 2000）后重试同一请求；适配国产服务把 max_tokens 超限报成模糊 "Param Incorrect" 的场景。降级使用独立的 `max400Retries` 计数器，不消耗校验重试配额
- **修复 3（请求规模诊断）**：降到底仍 400 时，错误消息附 `[请求规模] system=X 字符 / user=Y 字符 / max_tokens=Z` 让用户能看出究竟哪部分超了
- 验收：typecheck 通过

### 两处布局 Bug 修复
- **自由布局切换后内容不可见**：`FreeLayout` 用 `h-full` 但内容层仅有 `min-h-full`（无显式高度），CSS 规范下 `h-full` 回退为 `auto`，所有 `position:absolute` 子块被 `overflow-hidden` 裁掉。修复：`Slide.tsx` 内容层加 `h-full`（与 `min-h-full` 共存，取较大值），使 `FreeLayout` 的 `h-full` 能正确解析为幻灯片高度
- **多栏布局标题落入第一列**：`MultiColumnLayout` 中无 `col1-col5` 标记的 block 错误归入 `col1`。修复：无 `col\d` 匹配时直接推入 `center`（全宽头部），与用户期望的"标题在列内容之上"一致

### 多栏布局 + 分批生成修复
- **新增 three/four/five-column 布局**：`shared/dsl/layouts.ts` 加三/四/五栏，Column 枚举扩展 col1-col5（向后兼容 left/right/center）；通用 `MultiColumnLayout` 组件按 col1-col5 分配 blocks，center 作全宽头部行；编辑器属性面板列选择器同步更新；system prompt 新增多栏布局说明和适用场景
- **分批生成输入 token 优化**：续接批次（第 2 批起）传瘦身 `contextDeck`（仅 meta/theme/slide骨架，去掉 blocks）作为消息上下文，完整 deck 只用于 patch 应用；4 页 accumulated deck 输入 token 从 ~5000 降到 ~300
- **分批失败不跳编辑器**：中途批次失败时提交已生成部分、留在 Home 显示警告（原因 + 已保存到历史提示）而非直接跳转；`AgentResult` 新增 `warning?` 字段区分部分成功与完全失败；`GenerateRequest` 新增 `contextDeck?` 字段解耦消息展示与 patch 应用
- 验收：typecheck + build（930KB / 280KB gzip）+ build:runtime（127KB gzip）全通过

### 三处体验修复
- **Home 画幅选择器**：输入框底部新增 `16:9 / 全屏(auto) / 4:3` 三档按钮，默认 16:9；选定值注入 system prompt 约束（`meta.aspectRatio 必须为指定值`）；ChatPanel 内对话沿用上次选定值
- **流式生成不提前切视图**：`startStreamingDeck()` 去掉 `view:"editor"` 自动跳转，改为生成完成（`commitStreamingDeck`）后再 `setView("editor")`；中断有结果时同样先切视图。避免边生边渲时用户在 editor 看到只有 N-1 页的半成品
- **卡片背景改为不透明**：CardBlock 默认背景从 `color-mix(..., transparent)` 改为 `color-mix(in srgb, var(--hxs-fg) 6%, var(--hxs-bg))`；确保 slide 有自定义深色渐变背景时，卡片仍有与主题一致的不透明底色，卡片内文字保持可读对比度
- 验收：typecheck + build（928KB / 280KB gzip）全通过

### 体验修复（上一批）
- **属性面板流式生成锁定**：PropertyPanel 读取 `streamingMode` 状态，流式生成期间覆盖半透明遮罩 + loading spinner + "生成中，请稍候…" 提示，防止用户编辑被流式内容覆盖
- **FormBlock 防重复提交**：新增 `submitting` 状态，提交期间按钮 disabled + 显示"提交中…"，防止多次点击重复写入 localStorage
- **Anthropic CORS 错误提示优化**：对标 OpenAI provider 加 `formatAnthropicError()` 函数，区分 401/403 鉴权、429 限流、400 参数错误、连接失败（CORS），给出可操作的排查步骤；原泛泛"API 调用失败"提示升级为结构化中文引导
- 验收：typecheck + build（927KB / 279KB gzip）全通过

### 大 deck 截断修复
- **根因**：用户要求「生成 N 页演示」N 较大时无法生成 —— 实际是输出 token 被 max_tokens 上限截断，JSON 不完整 → Zod 校验失败 → 重试 2 次仍失败 → 流式承载 rollback，UI 仅显示「生成失败」
  - OpenAI 兼容 provider 上限锁 8000、按 500 token/页估，估算 ≥14 页时已经接近，加上中文 token 偏多、含 utilities/嵌套 blocks，实际 10-12 页就会被截
  - Anthropic provider 上限 32000、按 700 token/页估，43 页才到上限，但中文 deck 实测 1000-1500 token/页，30 页左右就接近极限
  - 截断时 SDK 不报错 —— Anthropic 返回 `stop_reason="max_tokens"`、OpenAI 返回 `finish_reason="length"`，旧代码全吞了，让 Zod 报「字段缺失」误导用户
- **修复**：
  - `ProviderConfig` 新增可选 `maxOutputTokens`，让用户按所用模型上限手动调高（DeepSeek 8192、Kimi K2/Qwen3 16K、GLM-4.5/Gemini/Sonnet 4.6 32-64K）
  - 两 provider 的 `computeMaxTokens(estimate, override)` 系数放宽：OpenAI 500→800/页 + 1500 base、Anthropic 700→1100/页 + 2000 base；ceiling 用 override（无则各自默认 8000 / 32000）
  - 截断检测：Anthropic 检 `resp.stop_reason==="max_tokens"`、OpenAI streaming 收集 `finish_reason` 检 `==="length"`，命中直接返回明确错误「输出被 max_tokens 上限截断（当前 X）。建议：减少页数 / 在设置中调高最大输出 tokens」+ 各服务上限提示，不再进重试
  - `ProviderSettingsDialog` 新增「最大输出 tokens（可选）」number 输入框 + 提示文字；切换服务预设时保留 maxOutputTokens（与 apiKey 一起）
- 验收：typecheck + build（910KB / 274KB gzip，+7KB）通过

### 大 deck 输出膨胀治理（B 方案：根因修复）
- **回归确认**：用户反馈"最开始版本没这个问题"——确实是 SUMMARY 里多次扩展功能（IconBlock / utility 白名单 / 反同质化约束 / form/modal/tab / 风格指令）累积导致 LLM 输出膨胀。早期单页 ~400 token，现在 ~1200 token，同样 8K 默认 max_tokens 能装的页数从 18 跌到 6
- **system prompt 瘦身（输入侧 -30%）**：
  - 三个示例 deck 减到一个（保留 creative 示范反同质化），砍 ~6800 字符
  - utility 白名单从「35 行带 desc」改为「9 行按 category 分组、仅列名」，砍 ~1400 字符
  - 拼装后 SYSTEM_PROMPT 从 ~22950 字符降到 ~16150 字符，输入 token 占用 ~15300 → ~10770
- **输出侧紧凑模式（决定单页 token 上限）**：
  - 创作约束第 1 条新增「**≥ 15 页紧凑模式（强制）**」：每页 blocks ≤ 4 个、utilities ≤ 3 个、砍装饰性 utility（动画/倾斜/光晕），只保留底纹/阴影/毛玻璃
  - 反同质化"必须 30% block 带 utilities"改为"建议 30% 左右"；大 deck 主动减半 utility 总量
- 验收：typecheck + build（908KB / 273KB gzip，-2KB）通过；估算紧凑模式后单页 ~600-800 token，8K 默认能装 10-13 页；mimo Pro 等支持 32K+ 输出的服务可装 30+ 页

### 预览快捷键 + 图片尺寸
- **预览快捷键转场异常根因**：PreviewDialog 与 Editor Toolbar 都注册了全局 keydown listener，按 ←→/Space 时两者**同时**响应：Toolbar 改 `currentIndex`（store），PreviewDialog 改本地 `pageIndex`，store 变化触发 PreviewDialog 重新订阅 → 转场被打断或重复触发；点击按钮时仅 React 合成事件，不冒泡到 window keydown，所以正常
- **修复**：
  - PreviewDialog keydown listener 注册时传 `useCapture=true`，在 capture 阶段先于 Toolbar bubble 阶段执行 + `e.stopPropagation()`，确保 Toolbar 不再收到事件
  - useEffect deps 改为 `[]`，listener 全程不重注册；用 `totalRef` 持有最新 slides 长度
  - 加节流：`lastNavRef` + 280ms 阈值，与 fade 转场 ≈ 400ms 接近，防止快速连按打断动画
- **图片尺寸**：
  - DSL：ImageBlock 加 `widthPx?` / `heightPx?`（16-4096 整数 px），未设则按容器自适应
  - 渲染器：显式尺寸用 `style.width/height`；只设宽度时高度 `auto`（保比例）；只设高度同理；都不设回到旧默认 `w-full h-full`
  - 编辑器：image 字段表单加两个 NumberInput（grid 2 列），placeholder 「auto」，越界自动 clamp
- 验收：typecheck + build（889KB / 267KB gzip 不变）+ build:runtime（405KB / 124KB gzip 不变）全通过

### IconBlock：lucide-react 图标支持
- **背景**：用户问"生成的演示是否支持 lucide-react"。原 DSL 没有 icon 类型，LLM 想用图标只能退到 image+URL。现在加 IconBlock 让 LLM 直接调用图标
- **白名单**：`shared/dsl/icons.ts` 列 60 个常用 lucide 名（导航 / 状态 / 通讯 / 媒体 / UI / 业务 / 数据 / 安全 / 时间 / 用户 / 商业 / 装饰）。schema 用 `z.enum(HXS_ICON_NAMES)` 强制
- **DSL**：`IconBlock = { name, size?, tone, strokeWidth?, align?, ... }`，tone 支持 primary/accent/muted/fg/current 5 档（用 CSS 变量取主题色，自动随风格联动）
- **Tree-shaking 关键**：必须用 `import { ArrowRight, ArrowLeft, ... } from "lucide-react"` 静态导入再装 map，不能用 `import * as LucideIcons` —— 后者会让 1500+ 图标全部打入 bundle，第一次实测 1636KB / 397KB gzip。改用静态 map 后只多 6KB gzip
- **新增文件**：`client/src/renderer/blocks/iconMap.ts` —— 60 个图标静态 import + ICON_MAP；客户端与 runtime 共用
- **渲染器**：`blocks/index.tsx` 加 IconBlock 函数，按 tone 取 CSS 变量颜色，按 align 决定容器 justify
- **编辑器**：新建 `panels/IconPicker.tsx` —— 搜索框 + 6 列图标网格 + 点击选中；InlineBlockEditor 加 icon 分支：图标选择器 / size / tone / strokeWidth / align
- **BlockPanel**：BLOCK_TYPE_LABELS 加「图标」；SIMPLE_BLOCK_TYPES + CONTAINER_CHILD_TYPES 都加 icon；defaultChild 给 icon 默认 Sparkles + 32px + primary
- **嵌套**：CardChildBlock + ContainerChildBlock 都允许 icon；icon 不能再嵌（叶子）
- **system prompt**：注入完整 60 个图标白名单 + 用法示例（CTA→ArrowRight、技术→Zap/Rocket、安全→Lock/Shield、清单→CheckCircle）
- 验收：typecheck + build（889KB / 267KB gzip，+21KB）+ build:runtime（404KB / 124KB gzip，+6KB）全通过

### 风格预览升级 + Magic Move 修复
- **预览 Magic Move 修复**：之前 `PreviewDialog` 显式传 `transitionMode="sync"` 导致 layoutId 共享布局过渡失效（编辑器用默认 popLayout 工作正常）。改回默认 popLayout，编辑器与预览转场行为一致，Magic Move 在预览下也能跨 slide 飞行
- **风格元数据 AI 自动填**：原 `NewStyleDialog` 要求用户输入 name + description + brief 三项；改为只输入一段 brief（提示词原文），由 LLM 同时生成 name（2-6 字）+ description（≤ 30 字一句话）+ emoji + theme：
  - `styleGenerator.ts` 的 SYSTEM/TOOL schema 加 name + description；StyleGenInput 简化为 `{ brief }`；StyleGenResult 加 name + description
  - `NewStyleDialog` 左侧表单只剩一个 `brief` 输入框 + 一键生成按钮；右侧 ReadyView 把 AI 生成的 name/description 显示为可编辑 input，用户可微调后保存
  - styleInstructions 仍然是用户原文不被改写
- **风格指令变更后可重新生成样板**：原右侧 4 页样板用 `buildSampleDeckWithTheme(theme)` 固定模板，与 styleInstructions 无关；现新增：
  - 新建 `client/src/llm/sampleDeckGenerator.ts`：`generateStyleSampleDeck(theme, styleInstructions)` 直接调 provider（绕过 agent.generate 的流式承载，不污染 store / 不切视图），让 LLM 按当前 theme + 指令生成 4 页 16:9 样板
  - `StylePreviewDialog` 加按钮「按指令生成样板 / 再次生成样板」（指令未填时禁用）+ loading 态 + 错误提示 + 「恢复内置通用样板」按钮
  - 编辑指令并保存后自动清掉旧自定义样板，提示用户重新生成观察新指令的视觉效果
- 验收：typecheck + build（868KB / 261KB gzip）+ build:runtime（381KB / 119KB gzip）全通过

### 自由布局 free
- **痛点辨析**：之前的画布 block 拖拽只改了 block 在数组中的"顺序"，layout 系统会重新自动排版，所以视觉位置看起来没变 → 用户预期是"任意位置"
- **DSL**：`layouts.ts` 加第 8 种 layout `"free"`；`schema.ts` 加 `PositionSchema = { xPct: number; yPct: number; widthPct?: number; heightPct?: number }`，每个 block 加可选 `position`
- **渲染器**：新增 `FreeLayout` —— 容器 `relative w-full h-full` + `data-free-stage`；新增 `FreeBlockWrap` —— absolute 定位 + 百分比坐标 + pointer events 拖动：
  - pointerdown：记录起点，绑定 window 级 pointermove/pointerup
  - pointermove：仅本地 React state 更新临时偏移（无 store commit），渲染 transform 跟随光标
  - pointerup：判断移动 ≥ 0.3% 才提交，调 `updateBlockPosition` 一次（入历史栈，⌘Z 可撤销）
  - 点击交互元素（button/a/input/textarea/select）不触发拖动；touch-action: none 适配触屏
- **store**：加 `updateBlockPosition(slideId, blockIndex, xPct, yPct)` + `convertSlideToFreeLayout(slideId, positions[])`
- **一键转换**：`SlidePanel` 在非 free layout 时显示「转为自由布局（保留当前位置）」按钮 → 从 DOM 查询 `[data-aspect-ratio]` 内可见 slide 的 `[data-block-index]` 元素，按 boundingClientRect 与 stage rect 的相对位置算百分比，跨 layout（含 two-column 跨列）正确对应回数组 index 后批量提交
- **system prompt**：明确告诉 LLM 仅在用户说"自由排版/任意位置/Keynote 风格"时用 free，否则用 7 种自动排版 layout 保证视觉一致性
- **架构隔离**：FreeLayout 用 FreeBlockWrap（pointer 拖位置），其他 7 layout 仍用 BlockWrap（HTML5 拖顺序），互不干扰
- 验收：typecheck + build（865KB / 260KB gzip，+5KB）+ build:runtime（381KB / 119KB gzip）全通过

### 画布 block 拖拽
- **痛点**：之前的 block 顺序拖拽只在 SlidePanel 侧边面板里，画布上看不到拖拽效果，用户感知不强
- **实现**：BlockWrap 直接挂 native HTML5 drag-and-drop —— `draggable={isEditing}` + onDragStart/Over/Leave/Drop/End。store 加全局 `dragBlockFrom / dragBlockOver`（不入历史）让所有 BlockWrap 共享拖拽态。视觉反馈：拖动半透明、drop 目标蓝色 ring + offset
- **架构调整**：原 BlockWrap 是 motion.div 直接挂 drag handlers，但 framer-motion 把 onDragStart 占用为 PanInfo 回调（非 React.DragEvent）。改为嵌套结构：外层普通 div 处理 native drag + 视觉态，内层仅在有 magicId 时用 motion.div 做 Magic Move
- **跨 layout 工作**：所有 7 layout 内的 BlockWrap 统一加 `slideId={slide.id}` prop，支持 two-column 内 left/right/center 跨列拖拽（拖动会改 blocks 数组顺序但保留 column 字段）
- **runtime 体积变化**：BlockWrap 现引用 useEditorStore，使 runtime bundle 多 ~7KB gzip（110→118KB）。仍在 PRD 约束（≈110KB）附近，可接受；后续可用 lazy import 把编辑路径剥离
- 验收：typecheck + build（861KB / 259KB gzip）+ build:runtime（378KB / 118KB gzip）全通过

### 编辑 / 预览 / 对比度修正
- **样板尺寸（StylePreviewDialog）**：之前 ResizeObserver 算 16:9 容器仍要滚动 —— 根因是样板内部 `min-h-full + py-20` 总高常超容器。改用 **Reveal.js 风格的 transform-scale**：内部固定 1280×720 viewport，外层按容器空间 `Math.min(w/1280, h/720)` 等比缩放；内容布局按 1280×720 算，确保完整可见无滚动
- **块顺序拖拽**：store 加 `moveBlock(slideId, from, to)`；`SlidePanel` 新增 Section「内容块顺序（拖动重排）」，列出当前 slide 内所有 block —— 手柄 / 类型徽章 / 摘要文本（按 type 智能截取） / 单击选中 / 拖拽重排 / hover 显示删除。HTML5 native drag-and-drop 复用 SlideList 模式
- **预览转场**：之前 PreviewDialog 用默认 `mode="popLayout"`（Magic Move 配套）。在普通 fade/slide-left 转场下 popLayout 让退出元素脱离 layout 可能引起视觉异常。`Deck` 加 `transitionMode?: "popLayout" | "sync" | "wait"` prop，默认 popLayout（兼容 Magic Move），PreviewDialog 显式传 `transitionMode="sync"`（旧出新进同时进行，最稳定的演示语义）
- **对比度防护**：
  - 新增 `client/src/lib/contrast.ts`：WCAG 2.x 相对亮度 + `contrastRatio` + `classifyContrast`（fail/weak/ok/great 4 档）+ `pickReadableForeground`（自动挑黑/白）
  - `DeckPanel` 主题色段加 `ContrastPanel`：实时显示 bg↔fg / bg↔primary 对比度数值 + 4 档徽章；< 4.5 时显示琥珀色警告条 + 「自动修正前景」一键按钮
  - `prompts.ts` 加强红线条款 9：明确禁忌（浅+浅、深+深）+ light/dark 模式标准搭配示例 + "高级感不靠低对比度"提醒
- 验收：typecheck + build（860KB / 259KB gzip，+6KB）+ build:runtime（112KB gzip 不变）全通过

### 视觉变体白名单 utilities
- **背景**：之前 LLM 收到「毛玻璃」「网格底纹」「斜线纹」「点阵」「倾斜便签」等提示词无法表达 —— DSL 没有视觉变体字段，只能退到默认 card 样式
- **数据层**：新增 `shared/dsl/utilities.ts` —— 30 个 hxs-* 白名单类，按 9 个 category 分组（surface / shadow / border / shape / pattern / text / spacing / motion / transform）；`filterUtilities(input)` 运行时过滤；导出 HXS_UTILITIES + CATEGORY_LABELS
- **CSS 实现**：新增 `client/src/renderer/utilities.css`，包含 30 个类的具体样式：
  - 毛玻璃：`hxs-frost / hxs-frost-dark / hxs-frost-strong` 用 `backdrop-filter: blur(20-40px)`，老环境降级为半透明
  - 底纹：`hxs-bg-grid / hxs-bg-dots / hxs-bg-diagonal / hxs-bg-noise / hxs-bg-radial` 用 CSS gradient + SVG noise，颜色用 `color-mix` 取主题 fg/primary
  - 阴影 5 级 + 边框 / 形状 / 文字（含主→accent 渐变 + 发光）/ 间距 / 动画（pulse / float / hover-lift）/ 旋转倾斜
  - `prefers-reduced-motion` 媒体查询：动画与 hover 自动关闭
- **DSL schema**：每个 block + slide 都加 `utilities: z.array(z.string()).max(8).optional()`；用 `replace_all` 一次性给 11 个 block + slide 加上
- **渲染器接入**：
  - `LayoutRenderer.BlockWrap` 用 `filterUtilities(block.utilities)` 过滤后展开到 className
  - `Slide.tsx` 同样把 slide.utilities 接到容器 className
- **编辑器**：新增 `panels/UtilitiesEditor.tsx`，按 category 分组的 chip 多选（最多 8 个，超出禁用未选）；`InlineBlockEditor` 用 `<details>` 折叠展开「视觉变体」；`SlidePanel` 加单独 Section
- **入口加载**：`client/src/index.css` 在 Tailwind utilities 之后 `@import` utilities.css；通过 main.tsx 与 runtime-entry.tsx 共用 index.css 自动覆盖客户端与发布产物
- **system prompt**：`client/src/llm/prompts.ts` 注入 30 个 utility 完整列表 + 中文用法约定（毛玻璃/网格底纹/便签倾斜各对应哪些类）；强调底纹放 slide、其他放 block；明确告诉模型遇到具体视觉词就用 utilities 而非退到默认样式
- 验收：typecheck + build（854KB / 256KB gzip，+5KB）+ build:runtime（113KB gzip，+2KB）全通过

### 编辑体验微调
- **图片上传**：新增 `client/src/editor/panels/ImageInput.tsx` 通用组件 — URL 输入 + 本地上传（≤2MB → base64 dataURL 内嵌）+ 缩略预览 + 数据 URL/普通 URL 互斥提示。`InlineBlockEditor` 的 image block 与 `SlidePanel` 的 image 背景都接入此组件。schema 加 `ImageUrl` 类型放宽 zod 校验，允许 `data:image/` 与 `https?://`
- **SlideList 拖拽**：HTML5 native drag-and-drop（draggable + onDragStart/Over/Leave/Drop/End），左侧加 GripVertical 手柄，拖动时半透明，drop 目标蓝色 ring 高亮，调用现有 `moveSlide`
- **全屏预览**：Toolbar 加 Play 按钮 → `PreviewDialog`：全屏 z-60 黑底，header/footer 半透明工具条，键盘 ←/→/Space/PageDown 切页、F 切原生 fullscreen、ESC 退出。auto/16:9/4:3 三种画幅自适应
- **风格指令编辑**：`stylePrompts.ts` 加 `updateUserSavedStylePrompt(id, patch)`（仅 user-saved 可改，builtin/ai-generated 走另存为）。`StylePreviewDialog` 在 user-saved 时显示「编辑」按钮 → textarea + 保存/取消
- **风格预览布局修复**：风格指令框 `max-h-40 + overflow-auto` 限高，内部滚动；其余信息（主题色/字体）始终可见。aside 拆为「指令区固定头 + 主题色滚动区」两段
- **样板尺寸完整**：`SampleStage` 子组件用 ResizeObserver 监听父容器尺寸，按 16:9 比例算 `min(width, height*ratio)` 填充，确保样板始终完整可见不裁切
- 验收：typecheck + build（848KB / 254KB gzip）+ build:runtime（111KB gzip）全通过

### 高级交互块 form / modal / tab（第 1 批）
- **DSL 扩展**（shared/dsl/schema.ts）：BlockSchema 从 8 种扩到 11 种
  - `FormBlock`：formId / fields[1-10] / submitLabel / successMessage / onSubmit({type: none|next|jumpTo, slideId?})
  - `FormFieldSchema` 7 种类型：text / email / textarea / select / checkbox / number / radio；name 用 regex 限制为字母数字下划线（CSV 列名安全）
  - `ModalBlock`：triggerLabel / triggerVariant / title? / children[]（基础 7 + form，不嵌 modal/tab/card）
  - `TabBlock`：tabs[1-6]（每个含 id/label/blocks[]）/ defaultTabId?；blocks 类型同 modal.children
- **数据层** `client/src/data/formSubmissions.ts`：localStorage `hxs.form_submissions` 存提交（最多 500 条，配额满时退化保留 100 条）；按 formId 分组；UTF-8 BOM CSV 导出（Excel 友好）
- **渲染器**：
  - `blocks/FormBlock.tsx`（独立文件）：受控状态 + 客户端校验（必填 / email 正则 / number 区间）+ 提交后行为分发（none/next/jumpTo）+ 成功状态卡
  - `blocks/index.tsx` 内嵌 ModalBlock（react-portal + framer-motion 弹窗、ESC/遮罩关闭、body overflow lock）+ TabBlock（layoutId 底线动画、内容区独立 blocks 渲染）
  - 选择把 ModalBlock/TabBlock 写在 BlockRenderer 同文件，避免循环依赖（modal/tab 的 children 递归调用 BlockRenderer）
- **编辑器**：
  - InlineBlockEditor 加 form/modal/tab 标量字段表单（formId、submitLabel、onSubmit；triggerLabel、variant、title；defaultTabId）
  - BlockPanel 加 3 个嵌套子内容编辑器：FormFieldsEditor（增删字段、字段类型切换、select/radio 的 options 用 `value=label` 紧凑编辑）、ContainerChildrenEditor（modal 的 children 复用现有 InlineBlockEditor）、TabsEditor（每个 tab 独立 blocks 区，可增删 tab、改 label）
  - AddBlockToolbar 分两组「基础 7 种」+「高级 4 种」（卡片/表单/弹窗/选项卡）
- **表单提交查看 Dialog**：`FormSubmissionsDialog` 按 formId 左侧列表 + 右侧表格视图；标记「已不在 deck」的孤儿 formId；导出 CSV / 单条删除 / 整组清空。Toolbar 加 `Database` 入口
- **system prompt**：BlockRenderer 注释从 8 种扩到 11 种；form 字段类型与 name 约束写明；提示 LLM 仅在用户明确需要时使用高级块（避免滥用）
- **PRD 第 3.2 节调整**：「表单收集、modal、tab 组件」从「不做」移除；新增 3.3 节「计划中」记录后续 3 批
- 验收：`pnpm typecheck` + `pnpm build`（836KB / 250KB gzip）+ `pnpm build:runtime`（111KB gzip）全通过

### 流式可中断 + 按页边生边渲
- **生成中可中断**：`AgentOptions/GenerateRequest` 加 `signal?: AbortSignal`；两个 provider 透传到 SDK（Anthropic `messages.stream(args, { signal })`、OpenAI `chat.completions.create(args, { signal })`）。`AgentResult` 加 `cancelled?: boolean`，与 `deck` 可共存（保留已生成部分）。错误名识别 `APIUserAbortError` / `AbortError` / `signal.aborted` 三种路径
- **流式按页边生边渲（create 模式）**：
  - 新建 `client/src/llm/streamParser.ts`：brace 计数 + inString 状态机解析器。`setToolName('create_deck')` 启用 → `feed(delta)` 累积 buffer → 定位 `"slides":[` → 扫单页对象边界 → JSON.parse + `fillOneSlideId` + `SlideSchema.safeParse`，通过则发出 Slide
  - Anthropic provider：`stream.on('streamEvent')` 过滤 `content_block_start` 拿 tool name + `stream.on('inputJson')` 喂 parser
  - OpenAI provider：首个 `tc.function.name` 触发 tool 事件、每次 arguments delta 喂 parser
  - `ProgressEvent` 增加 `tool` 与 `slide` 两类事件
- **store 流式承载（不入历史）**：`editor.ts` 加 `streamingMode/streamingBackup`、4 个动作：
  - `startStreamingDeck()`：备份当前状态，用骨架 deck（含 `__skeleton__` 占位 slide）替换，view 切 editor
  - `appendStreamingSlide(slide)`：第一次 push 时移除骨架占位，后续追加；同步 currentIndex 到末尾；不动 past/future
  - `commitStreamingDeck(finalDeck)`：备份 deck 入 past 作为单个撤销节点，最终 deck 替换；⌘Z 一步即可回到生成前
  - `cancelStreamingDeck({ keepPartial })`：keepPartial=true 保留部分页（备份入 past 可撤销）；false 完整回滚
- **agent.ts 编排**：包装 onProgress——`tool:create_deck` 事件触发 `startStreamingDeck`，`slide` 事件触发 `appendStreamingSlide`；终态分发 commit / cancel(keepPartial) / cancel(rollback)。`AgentResult.appliedToStore` 标志告诉 UI 不要再 loadDeck（避免清空历史栈）
- **UI**：`ChatPanel` 与 `Home` 加 `controllerRef`、loading 时按钮变红色「停止」（Square 图标）。流式模式下进度文字改「边生成边渲染中… 已生成 N 页」，进度条按已生成页数 / 预计页数计算比率。取消后 ChatPanel 显示 assistant 消息「已停止生成 · 保留已生成的 N 页」；Home 显示琥珀色提示条
- 验收：`pnpm typecheck` + `pnpm build` 全通过；待用户实测中断、边生边渲、错误页跳过、双 provider 兼容、撤销 8 个手测点

### 转场时长 + 自定义风格
- **转场时长**：`Slide` schema 加 `transitionDuration?: number`（0-3000ms）。`Slide.tsx` 渲染时覆盖默认。`SlidePanel` 转场区加滑块（默认值显示当前 transition 的预设时长，调过后右侧出"重置"链接）
- **自定义风格**：
  - `llm/styleGenerator.ts` 用 `build_style` 工具：用户给 name/description/brief，模型返回 emoji + theme（含 colors/fonts/radius/mode）+ styleInstructions（150-250 字详细指令）
  - `editor/NewStyleDialog.tsx` 左录入右预览：表单（name/description/brief）→「AI 一键生成」→ 右侧实时显示封面卡 + 主题色矩阵 + 指令文本 →「预览效果」复用 StylePreviewDialog 看完整 4 页样板 →「保存到我的风格」→ 自动选中并切到「我保存的」筛选
  - Home 风格 tab 网格首位插入虚线"+ 新建风格"卡片
- 验收：typecheck + build + runtime 模板全过

### 业务扩展：首页 / 案例 / 对话历史
- **数据层**
  - `client/src/data/prompts.ts`：12 个内置案例 + AI 生成案例存 `hxs.prompts`（按来源分类）+ 用户保存案例
  - `client/src/data/conversations.ts`：会话持久化（`hxs.conversations`，最多 50 条），含完整消息流 + 最终 deck 快照
- **首页 `Home.tsx`**：进入应用的默认视图。中央大对话框（Enter 发送）+ 4 类筛选（全部 / 内置 / AI 生成 / 我保存的）+ 案例网格 + 「让 AI 再生成一批」按钮。点案例直接发送生成。生成成功后自动 loadDeck + 创建 conversation + 切到 editor 视图
- **案例生成**（`llm/promptGenerator.ts`）：用独立的 system prompt + `generate_prompts` 工具，返回 8 个多样化主题。用户点「再生成一批」覆盖 ai-generated 列表
- **对话持久化**（ChatPanel 改造）：编辑器内每次发送自动 upsert 到 `hxs.conversations`；切换 conversation 时重新加载 messages。生成动作流程：用户消息 → LLM → assistant 消息（含 create/patch 标签）→ 写回 conversation
- **HistoryDialog**：左侧列表（标题/时间/消息数/页数）+ 右侧详情（消息流 + deck 信息 + 「在编辑器中打开」）+ 删除单条
- **入口**：Home 顶部 + ChatPanel header + Editor Toolbar 都加了「历史」入口；Editor Toolbar 加「返回首页」按钮（清当前 conversationId）
- **store 扩展**：`view: home | editor`、`currentConversationId`、`setView`、`setCurrentConversationId`，`loadDeck` 自动切到 editor

### Week 4：导出与发布
- **runtime 预构建**：`pnpm build:runtime` 把渲染器打包到 `client/public/runtime-template/`（dev server 与生产构建都能服务）
- **publish/runtime.ts**：浏览器 fetch 模板 → 注入 deck JSON（防 `</script>` 闭合）→ 替换 title → 解析 `<script src="/assets/...">` 收集所有 asset → 返回文件清单
- **publish/exportZip.ts**：用 jszip 打包 + 自动触发下载；附 `README.md` 含 4 个平台一键部署命令
- **publish/deployHints.ts**：4 个目标的命令与文档链接：
  - Cloudflare Pages — `npx wrangler pages deploy . --project-name=...`
  - Vercel — `npx vercel --prod`
  - Netlify Drop — 拖拽到 https://app.netlify.com/drop
  - Surge.sh — `npx surge .`
- **PublishDialog**：idle / building / error / ready 四态。ready 时展示 4 个平台行（含一键复制命令、文档外链、提示）
- **Toolbar 发布按钮**已启用

**为什么不做"浏览器一键直传 Cloudflare"**：Cloudflare Pages Direct Upload 流程复杂（拿 jwt → 文件 hash 算法 → assets/check → assets/upload → manifest → deployment 多步），且 `api.cloudflare.com` 对浏览器 CORS 不一致，浏览器侧实现脆弱。改用「导出 zip + npx 一键命令」更稳定，用户体验仅多一步（在终端粘贴一行）。一键直传留给 v2，需服务端代理。

### Week 3：LLM 接入（多模型）
- **Provider 抽象**（`client/src/llm/types.ts`）：`Provider` 接口、`ToolDefinition`（标准 JSON Schema）、`AgentResult`、`ProviderConfig`，与具体厂商解耦
- **两个 Provider**：
  - `providers/anthropic.ts`：messages.create + tool_use + cache_control: ephemeral 的 system prompt
  - `providers/openai.ts`：chat.completions.create + function calling，覆盖所有 OpenAI 兼容服务
- **共享逻辑**（`client/src/llm/validate.ts`）：`processToolCall`（create_deck/patch_deck 共用的解析+应用+Zod 校验+nanoid 补 id）、`buildUserMessage`（current deck 嵌入 user 消息）、`formatZodError`
- **Tools**（`client/src/llm/tools.ts`）：provider-agnostic，由 zod-to-json-schema 从 DeckSchema 生成 `create_deck` / `patch_deck` 的 parameters
- **Prompts**（`client/src/llm/prompts.ts`）：DSL 速览 + 创作约束（≤12 页 / ≤6 块 / hero ≤14 字）+ 工具选择指引 + 2 份 few-shot deck
- **配置层**（`client/src/llm/settings.ts`）：localStorage `hxs.llm.settings`。包含 8 个常见服务预设：Anthropic Claude / OpenAI / Deepseek / Kimi / 智谱 GLM / 通义千问 / SiliconFlow / Google Gemini
- **Agent 顶层**（`client/src/llm/agent.ts`）：从 settings 拿激活配置 → 选 provider → 调 generate
- **配置 UI**（`client/src/editor/ProviderSettingsDialog.tsx`）：协议切换 + 服务预设网格 + Base URL（OpenAI 兼容专属）+ Model + API Key
- **ChatPanel**（`client/src/editor/ChatPanel.tsx`）：右下角 Sparkles 浮动按钮 + 400×640 卡片；header 显示当前激活模型徽章；首次发送自动弹设置弹窗

### Week 2：编辑器骨架
- **Zustand store**（`client/src/store/editor.ts`）：deck 状态、selection、past/future 栈（HISTORY_LIMIT=50）。所有 mutation 走 `commit(immer producer)`，自动入栈。
- **三栏编辑器**（`client/src/editor/`）
  - `EditorShell.tsx` 三栏外壳
  - `Toolbar.tsx` 顶部工具条（撤销/重做、上下页、新增 + 7 布局选择、载入示例、发布占位）
  - `SlideList.tsx` 左侧缩略图（aspect-16:9 微缩 + 上移/下移/复制/删除 + 当前页边框）
  - `Canvas.tsx` 中央 16:9 画布，`onClickCapture` 委托找 `[data-block-index]` 实现块选中
  - `PropertyPanel.tsx` + `panels/` 三种维度表单：DeckPanel（meta、theme.colors、字体、圆角、模式）、SlidePanel（layout/transition/background/notes）、BlockPanel + InlineBlockEditor（8 种 block 类型字段表单）+ AddBlockToolbar（点击空白时显示）
  - `panels/forms.tsx` 通用字段：TextInput / NumberInput / ColorInput / Select / Toggle / StringListEditor / ActionInput
  - `panels/InlineBlockEditor.tsx` 抽出的 8 类 block 字段编辑，复用于顶层 block 与 card 子内容
- **快捷键**：⌘Z 撤销、⌘⇧Z 重做、← / → 切页（输入框聚焦时不触发）
- **编辑可视化**：Block 外层 wrapper 携带 `data-block-index`，hover/选中描边由 `RuntimeContext.editor` 驱动，独立站模式（无 editor 注入）不受影响

### Week 1：DSL + 渲染器

- **工程骨架**：Vite + React 18 + TS + Tailwind 双入口（编辑器 / 独立站），pnpm
  路径：`client/`、`shared/`、`docs/`、`design/`、`server/`、`tests/`、`scripts/`
- **DSL Zod schema** — `shared/dsl/`
  - 7 布局：hero / title-content / two-column / bullet-list / quote / cta / embed
  - 8 block：text / heading / image / button / list / badge / iframe / card
  - 5 动作：next / prev / jumpTo / openLink / setVar
  - 主题、变量、转场、背景（solid / gradient / image）
- **示例 deck** — `shared/examples/01-simple-hero.json` / `02-product-compare.json` / `03-launch-deck.json`
- **渲染器** — `client/src/renderer/`
  - `Deck.tsx`：变量状态、当前页索引、键盘导航、AnimatePresence 转场
  - `Slide.tsx`：5 种 Framer Motion 转场
  - `layouts/`：7 种布局组件
  - `blocks/`：8 种 block 组件 + 卡片嵌套
  - `runtime.tsx`：`{{var}}` 文本插值 + 动作分发
  - `theme.ts`：主题色 → CSS 变量
- **独立站入口** — `client/src/runtime-entry.tsx`，从 `<script id="deck-data">` 读 deck，含校验失败友好兜底
- **预览 Playground** — `client/src/app/App.tsx`，左侧示例列表 + 右侧 16:9 画布渲染选中 deck
- **构建/类型检查** — `pnpm typecheck` / `pnpm build` / `pnpm build:runtime` 全部通过

### 流式 + 中断验收快照（历史，已结清）

第 1 批（form/modal/tab）已完成代码层验收：typecheck + build + build:runtime 全通过。后续待做（按用户确认的批次）：
- 第 2 批：自定义字体（base64 内嵌，1MB 上限）+ CSS 变量白名单 — 仍待做
- 第 3 批：视频背景 + Lottie 动画（均外链 URL）— 仍待做
- 第 4 批：Cloudflare Worker 中转一键直传（创建 server/ 目录）— **已上线**

**当时遗留的实测步骤**（保留为流式回归测试参考）：
1. 打开 http://localhost:5173/，配置好 API Key
2. **手测 A（中断）**：发起 8 页生成，2 秒后点停止 → ChatPanel 显示「已停止生成 · 保留已生成的 N 页」，无未捕获 abort 错误
3. **手测 B（边生边渲）**：发起 5 页生成 → 肉眼观察画布逐页加页面，第一页 1-2 秒内落地
4. **手测 C（patch 不变）**：在已有 deck 发 patch 指令 → `streamingMode` 始终 false，patch 流程不受影响
5. **手测 D（撤销）**：边生边渲完成后按 ⌘Z → 一步回到生成前的 deck
6. **手测 E（双 provider）**：分别用 Anthropic 与 OpenAI 兼容 provider 跑一次手测 A+B
7. **手测 F（错误页跳过）**：诱导一页 layout 拼写错 → 流式时该页跳过，最终整体重试

## 当前正在开发

**已就位但待打磨**：
- ProviderSettingsDialog 内部尚未做 i18n（外壳 + 按钮已 i18n，CAPABILITY_LABELS / 路由编辑器内文案仍中文）
- panels/SlidePanel + panels/DeckPanel 主题/动效/布局详细字段名仍部分中文
- StyleCard / ExtractPromptDialog / FormSubmissionsDialog 边缘文案部分中文
- 翻译模式下「配图自主判断」实证验证（已修但需要长 prompt 场景验证不会被压力测试退化为 0 图）
- Pexels 配置后实测：填 key → 生成介绍类 deck → 观察 hero 配图从 picsum 切到 Pexels 真图的耗时与命中率

## 待办（按里程碑）

### 短期
- 图源扩展：Unsplash / Pixabay 等 provider 接入（架构已留扩展位，新增 provider 仅需新建一个 `<provider>.ts` + 在 `PROVIDERS` 数组追加一行）
- ProviderSettingsDialog 全量 i18n（与 ImageLibraryDialog 风格对齐）
- panels/SlidePanel + DeckPanel 字段名 i18n 收尾
- 长文档分批 + 配图比例的实证调优（目前 prompt 写 30%-50% 区间，实测可能偏低）

### 中期
- 内容案例 / 风格 / Pattern / Skill / 模型配置 / 图源 API key 的导入导出（设备间共享）
- 自定义 CSS（受限白名单）+ 自定义字体上传（base64 内嵌，单文件 ≤ 1MB）
- 视频背景 + Lottie 动画（外链 URL）

### 长期 / v2
- 协作 / 用户系统（需要服务端）
- 表单的服务端持久化（演示者直接看到访客提交）
- 第三种语言（日韩等，当前 zh-CN + en 满足主要需求）

## 重要决策与约束

### 架构决策

| 决策 | 内容 |
|---|---|
| 生成范式 | LLM → 结构化 DSL（JSON）→ 确定性渲染器，**不直接出代码** |
| MVP 形态 | 本地 Web 编辑器，无后端；token / API key 仅 localStorage |
| 演示载体 | 自研 React 容器（不用 Reveal.js） |
| 发布形态 | 三选一并存：① 浏览器打 zip + 4 平台命令；② Cloudflare 一键直传（自部署 Worker 持 token）；③ PDF 导出（html-to-image + jspdf） |
| 编辑模式 | 对话生成 + 属性面板微调（不做所见即所得） |
| 校验 | Zod（同时给运行时校验 + 静态类型 + 字段级错误回灌）；invalid_union 自动展开附实际值快照 |
| 撤销/重做 | 整 deck 快照入栈（限 50 步），靠 immer 结构共享省内存；fast-json-patch 留给 LLM 增量编辑使用 |
| 表单 | 受控 input 直连 store action，未引入 react-hook-form |
| 增量编辑 | RFC 6902 JSON Patch（不让 LLM 重出整份） |
| 流式承载 | 工具名一确认就启动 store streaming；按页即时落地（streamParser 单页校验通过即 append）；中断保留已生成部分 |
| 模型路由 | 按能力分槽启用（general / text-only / multimodal）+ 用户可自定义路由优先级（普通生成 vs 图片识别两个场景） |
| i18n 策略 | BASE 中文不动 + CREATIVE 双语切换 + prompt-meta 输出语言指令；首次按 navigator.language 检测 |
| 配图策略 | LLM 输出 picsum 占位（永远 200）+ 后台异步用 slug 关键词查 Pexels 真图替换；默认必须配图，除用户明确说不要 |
| 主题对比度 | 编辑器 DeckPanel 实时显示 + 一键修正；生成态 processToolCall 后自动 normalizeThemeContrast 兜底 |
| 创造性沉淀 | StylePrompt（视觉风格）/ Pattern（视觉模式样板）/ Skill（生成策略配方）三层乘法；用户可从图片自助生成 Pattern + Skill 双产物 |
| 扩展点预留 | DSL `version`、block discriminated union、`renderer/blocks/` 注册表、图源 `PROVIDERS[]` metadata 数组 |

### MVP 砍掉但已上线
- 表单收集、modal、tab → 已上线（高级交互块）
- PDF 导出 → 已上线（PublishDialog 第三 Tab）
- 多语言 → 已上线（zh-CN + en，全量覆盖）
- 浏览器一键直传 Cloudflare → 已上线（自部署 Worker 中转方案）

### 仍未做
- 自定义 CSS、视频背景、Lottie 动画、协作、版本历史、用户系统、表单服务端持久化、LLM 端图像生成（picsum + Pexels 替换方案已替代此需求）

## 关键约束（来自全局 CLAUDE.md）

- 全程简体中文（对话、注释、文档）
- 偏好简单稳定的主流方案，反对过度工程
- 修改要精准，不联动重做（"修改目标要明确，不需要联动整体都重做一遍"）
- 默认目录标准：`docs/PRD.md` / `SUMMARY.md` / `design/` / `client/` / `server/` / `shared/` / `docs/` / `tests/` / `scripts/`
- 代码不写 emoji；最大行宽 100；缩进 2 空格
- 命名：文件 kebab-case、类 PascalCase、函数变量 camelCase、常量 UPPER_SNAKE_CASE
