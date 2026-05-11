import type { Deck } from "@shared/dsl";
import i18next from "i18next";
import {
  buildSystemPrompt,
  buildFixedAspectConstraint,
  buildUserPageCountConstraint,
  extractExplicitPageCount,
} from "./prompts";
import { TOOLS } from "./tools";
import { getActiveConfig } from "./settings";
import { getProvider } from "./providers";
import { getStylePrompt } from "@/data/stylePrompts";
import { useEditorStore } from "@/store/editor";
import { detectSegments, type PromptSegment } from "./segmentMessage";
import { matchSkill, buildSkillAddon } from "./skillMatcher";
import { getSkill } from "@/data/skills";
import { getCurrentLang } from "@/i18n";
import type { Lang } from "@/i18n/types";
import { hasPexelsApiKey } from "./pexels";
import { buildImageSubstitutions } from "./enrichImages";
import { chooseMaxTokens, inferPagesPerBatch } from "./maxTokens";
import type { AgentResult, BatchInfo, ProgressEvent } from "./types";

export interface AgentOptions {
  userMessage: string;
  currentDeck?: Deck;
  // 仅用于消息上下文展示，不参与 patch 应用（分批时传瘦身版以减少输入 token）
  contextDeck?: Deck;
  styleId?: string;
  // 用户在 Home 主动选的 Skill id；命中时优先于 trigger 自动匹配
  skillId?: string;
  aspectRatio?: "auto" | "16:9" | "4:3";
  onProgress?: (e: ProgressEvent) => void;
  signal?: AbortSignal;
  // 分批续接时传原始完整文案：让 estimatePageCount 与翻译模式 length 判定基于原文，而非每批拼装的 batchUserMessage
  originalUserMessage?: string;
  // 显式强制走翻译模式（砍 CREATIVE_ADDONS 省 ~4000 input token）。分批续接必用
  forceTranslationMode?: boolean;
  // 输出语言：影响 LLM 生成的 deck 文案语言。不传时取当前 i18n 语言
  targetLang?: Lang;
  // 分批模式 wrapper 在调 generateOnce 时透传：让 max_tokens 决策识别"每批小目标"场景
  batchInfo?: BatchInfo;
}

// 中文数字 → 阿拉伯数字（覆盖一-九十九，足够 deck 页数估算）
const CN_DIGIT: Record<string, number> = {
  一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};
// 英文数字 → 阿拉伯（覆盖 one-ninety + 整十；deck 页数足够，hundreds 极少出现）
const EN_DIGIT: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
// 解析中/英/阿拉伯数字字符串为整数；不识别时返回 0
function parseNumWord(s: string): number {
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s);
  const lower = s.toLowerCase();
  if (lower in EN_DIGIT) return EN_DIGIT[lower]!;
  // 「twenty-one」「thirty five」等复合英文：拆开取和（容错处理，不强求语法）
  if (/^[a-z]+[-\s][a-z]+$/i.test(s)) {
    const parts = lower.split(/[-\s]+/);
    let sum = 0;
    for (const p of parts) sum += EN_DIGIT[p] ?? 0;
    if (sum > 0) return sum;
  }
  // 中文：十X / X十 / X十Y / 单字
  if (s.length === 1) return CN_DIGIT[s] ?? 0;
  if (s === "十") return 10;
  if (s.startsWith("十")) return 10 + (CN_DIGIT[s[1]!] ?? 0);
  if (s.endsWith("十")) return (CN_DIGIT[s[0]!] ?? 0) * 10;
  if (s.includes("十")) {
    const [a, b] = s.split("十");
    return (CN_DIGIT[a!] ?? 0) * 10 + (CN_DIGIT[b!] ?? 0);
  }
  return 0;
}
// 保留旧名（向后兼容内部调用）
const parseChineseNum = parseNumWord;

// 从用户输入估算预计页数：覆盖中英文常见量词（页/张/篇/节/章/幻灯片/PPT/slides/pages）。
// 支持中文数字（一/两/三/…/十/十一/二十）和阿拉伯数字。
// 用 matchAll 取所有命中里**最大的数字**，避免「## 第 1 页」开头被误判为 1 页。
// 例：「## 第 1 页 ... ## 第 10 页 ...」→ 10；「做 8 页 PPT」→ 8；「生成一页」→ 1；「三页演示」→ 3。
// 排除「第 N 页 / 最后 N 页 / 倒数 N 页」等局部页码引用——这些是页面索引不是总页数。
// 找不到数字时：兜底数 markdown「## 第 N 页 / ## Page N」结构化标记数（≥ 3 个标记取最大编号），
// 否则 patch 场景至少 5 页；create 默认 5。
export function estimatePageCount(userMessage: string, currentDeck?: Deck): number {
  // 先剔除「第 N 页/张」「最后 N 页」「倒数 N 页」类局部引用，避免「修改第 4 页」被当作 estimate=4
  // 数字支持：阿拉伯 / 中文（一-十）/ 英文（one-twenty + 整十；含「twenty-one」复合）
  const NUM_PATTERN =
    "\\d+|[一二两三四五六七八九十]+|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\\s](?:one|two|three|four|five|six|seven|eight|nine))?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen";
  const UNIT_PATTERN = "页|张|个?页面|个?幻灯片|篇|节|章节?|slides?|pages?";
  const LOCAL_RE = new RegExp(`(?:第|最后|倒数|last)\\s*(?:${NUM_PATTERN})\\s*(?:${UNIT_PATTERN})`, "gi");
  const cleaned = userMessage.replace(LOCAL_RE, "");
  const TOTAL_RE = new RegExp(`(${NUM_PATTERN})\\s*(?:${UNIT_PATTERN}|个?PPT)`, "gi");
  let max = 0;
  for (const m of cleaned.matchAll(TOTAL_RE)) {
    const n = parseNumWord(m[1]!);
    if (n > 0 && n < 200 && n > max) max = n;
  }
  if (max > 0) return max;

  // 兜底：数 markdown / 纯文本结构化分段标记的最大编号
  // 用户写「## 第 1 页 ... ## 第 46 页 ...」或纯「第 1 页：xxx」「第 2 页：yyy」分段时，
  // 上面 cleaned 把所有「第 N 页」剔除会让 max=0，矩阵格数缩回 default 5（或被零散误匹配压到更小）。
  // 这里数行首「(可选 #) 第 N 页/部分/章/节 / Page N / Slide N」标记，≥ 3 个时取最大编号。
  // ≥ 3 限制避免「修改第 4 页加图」单一引用被当作总页数；# 前缀可选覆盖纯文本大纲。
  const lines = userMessage.split("\n");
  const markerRe =
    /^\s*(?:#+\s*)?(?:第\s*(\d+|[一二两三四五六七八九十]+)\s*[\s.、)：:．\-—]?\s*(?:页|部分|章|节)|(?:Page|Slide|Section)\s+(\d+))/i;
  let markerMax = 0;
  let markerCount = 0;
  for (const line of lines) {
    const m = line.match(markerRe);
    if (m) {
      const n = parseChineseNum(m[1] ?? m[2] ?? "");
      if (n > 0 && n < 200) {
        markerCount++;
        if (n > markerMax) markerMax = n;
      }
    }
  }
  if (markerCount >= 3 && markerMax > 0) return markerMax;

  // 最终兜底：复用 detectSegments（含 autoSegmentFallback）切段结果。
  // 覆盖以下场景：用户用「---」分隔符、「## 1. 标题」纯编号标题、纯散文长文按段落自动切分等。
  // ≥ 3 段才用作 estimate，与 shouldBatchByPrompt 阈值对齐。
  const segs = detectSegments(userMessage);
  if (segs.length >= 3) return segs.length;

  if (currentDeck) return Math.max(currentDeck.slides.length, 5);
  return 5;
}

// 是否应分批生成：用户文案足够长 + 检测到 ≥ 3 段标记 + 仅 create 模式
// 短文案或散文（无标记）不分批，保持单次生成的旧路径，零回归
const PROMPT_LENGTH_THRESHOLD = 2000;

// 把 segments 按指定 size 分块，每块对应一次 LLM 往返
// size 由 inferPagesPerBatch 按模型 cap 推出（小模型 3 页/批，大模型 12 页/批）
function chunkSegments(segments: PromptSegment[], size: number): PromptSegment[][] {
  const chunks: PromptSegment[][] = [];
  for (let i = 0; i < segments.length; i += size) {
    chunks.push(segments.slice(i, i + size));
  }
  return chunks;
}

function shouldBatchByPrompt(opts: AgentOptions): { batch: boolean; segments: PromptSegment[] } {
  if (opts.currentDeck) return { batch: false, segments: [] };
  if (opts.userMessage.length < PROMPT_LENGTH_THRESHOLD) return { batch: false, segments: [] };
  const segments = detectSegments(opts.userMessage);
  if (segments.length < 3) return { batch: false, segments: [] };
  return { batch: true, segments };
}

// 构造单批 user message：含当前 chunk 内多段文案 + 批次说明（不重发完整原文，节省 prefill）
function buildBatchPrompt(
  chunk: PromptSegment[],
  chunkIdx: number,
  totalChunks: number,
  accumulatedPages: number,
  totalPages: number
): string {
  const isFirst = chunkIdx === 0;
  const pageStart = accumulatedPages + 1;
  const pageEnd = accumulatedPages + chunk.length;
  const pageRange = chunk.length === 1 ? `第 ${pageStart} 页` : `第 ${pageStart}-${pageEnd} 页`;

  const header = `[分批生成模式 第 ${chunkIdx + 1}/${totalChunks} 批]\n本批输出：${pageRange}（共 ${totalPages} 页 deck）\n`;
  const instructions = isFirst
    ? `\n首批要求：调用 \`create_deck\` 工具，生成本批 ${chunk.length} 页 + 完整 deck 元数据（meta/theme/version/variables）。后续批次会继续追加。\n`
    : `\n续接要求：调用 \`patch_deck\` 工具，按本批 ${chunk.length} 个 \`{op:"add", path:"/slides/-", value:<slide>}\` 顺序追加到末尾。**沿用首批已建立的 theme/colors/字体/layout 倾向，保持视觉一致**。不要修改已有页（不要发 replace/remove）。\n`;

  // chunk 内每段保留原始 body（已含原标记行），段间用分隔符强化页边界
  const bodyParts = chunk.map((seg, i) => `--- 第 ${pageStart + i} 页内容 ---\n${seg.body.trim()}`);

  return `${header}${instructions}\n═══ 本批文案 ═══\n${bodyParts.join("\n\n")}\n`;
}

// 单次生成（非分批，或被分批 orchestrator 调用的单批）。
// skipStoreStreaming=true 时：不自己启动/提交/取消 store streaming；slide 也不直接 append（由外层 orchestrator 控制）
async function generateOnce(opts: AgentOptions, skipStoreStreaming = false): Promise<AgentResult> {
  const active = getActiveConfig();
  if (!active) {
    return { error: i18next.t("error:noProvider") };
  }

  // 拼装 system prompt：根据输入特征选基础（翻译模式省 ~3500-4500 token）+ 风格指令
  // 分批模式下 opts.userMessage 是单批拼装的 batchPrompt（含「第 N 页」会污染 estimatePageCount 与 length 判定），
  // 用 originalUserMessage（原始完整文案）做估算更准
  const promptForEstimate = opts.originalUserMessage ?? opts.userMessage;
  const estimatedPages = estimatePageCount(promptForEstimate, opts.currentDeck);
  const targetLang: Lang = opts.targetLang ?? getCurrentLang();
  // 各段独立 measure，便于发 prompt 事件给 UI 显示分段大小（chip + tooltip）
  let systemPrompt = buildSystemPrompt({
    userMessage: promptForEstimate,
    estimatedPages,
    aspectRatio: opts.aspectRatio,
    forceTranslationMode: opts.forceTranslationMode,
    targetLang,
  });
  const baseLen = systemPrompt.length;

  let styleLen = 0;
  if (opts.styleId) {
    const style = getStylePrompt(opts.styleId);
    if (style) {
      const styleSeg = `\n\n## 用户指定的视觉风格基准：${style.name}\n\n${style.description}\n\n${style.styleInstructions}\n\n**deck.theme 必须使用以下设置（除非用户明确要求改）**：\n\`\`\`json\n${JSON.stringify(style.theme, null, 2)}\n\`\`\``;
      systemPrompt += styleSeg;
      styleLen = styleSeg.length;
    }
  }

  // Skill 注入：用户主动选的优先；否则按用户消息的触发词自动匹配
  // 翻译模式（用户给了详细结构化文案）下不注入 skill —— 用户已成型的内容不需要"创意激发"
  // 分批续接（forceTranslationMode）也跳过，避免每批多扛 skill prompt 体积
  // **拼接位置**：skill 配方注入到 user message 头部（不动 system prompt 尾部），
  // 让 system prompt 在不同 skill 切换时保持稳定 → Anthropic ephemeral cache 与
  // OpenAI 兼容服务的自动 prefix cache 命中率从 ~70% 提升到 ~95%
  let skillAddon = "";
  let skillName: string | undefined;
  if (!opts.forceTranslationMode) {
    const skill = opts.skillId ? getSkill(opts.skillId) : matchSkill(promptForEstimate);
    if (skill) {
      skillAddon = buildSkillAddon(skill);
      skillName = skill.name;
    }
  }

  // 固定画幅约束最终强化：把约束追加到 systemPrompt 末尾（在 skill / pattern fewshot 之后）
  // LLM 对末尾内容注意力更敏感；避免被风格配方"多 block 多视觉"稀释
  // auto 画幅不需要（允许滚动）；固定画幅必须强约束
  let aspectLen = 0;
  if (opts.aspectRatio && opts.aspectRatio !== "auto") {
    const aspectSeg = "\n\n" + buildFixedAspectConstraint(opts.aspectRatio);
    systemPrompt += aspectSeg;
    aspectLen = aspectSeg.length;
  }

  // 用户页数严格遵守约束：当用户消息含明确页数（"10 页"、"5 张"等）时注入
  // 放在最末尾让 LLM 最后读到；优先级高于"主动拆页"等建议，低于画幅 overflow-hidden 物理限制
  // 分批续接（forceTranslationMode）已经按用户分段强制 1:N 映射，此处也注入更稳妥
  let pagesLen = 0;
  const explicitPages = extractExplicitPageCount(promptForEstimate);
  if (explicitPages !== undefined) {
    const pagesSeg = "\n\n" + buildUserPageCountConstraint(explicitPages);
    systemPrompt += pagesSeg;
    pagesLen = pagesSeg.length;
  }

  const provider = getProvider(active.provider);

  // 边生边渲：仅 create 模式（无 currentDeck）启用；patch 走原路径
  // 分批模式（skipStoreStreaming）下：不自己管理 store，由外层 orchestrator 处理
  const canStream = !skipStoreStreaming && !opts.currentDeck;
  let streamingStarted = false;

  // 记录 slide 事件首末时间戳，用于 result 时点判定真流式 vs buffered：
  // - 真流式：slide 事件均匀分散（首末间隔 > N×40ms），尾延迟可砍到 200ms 仅给 React 一帧 commit
  // - buffered：slide 事件几乎同时到达（首末间隔 < N×40ms），仍按旧公式留时间让 store throttle 排完
  let firstSlideAt = 0;
  let lastSlideAt = 0;

  // reasoning 失控检测：reasoning bytes > 200KB 视为 thinking 模型放飞自我，
  // 自动 abort 当前调用并以更小 max_tokens（fixed mode）重试一次。
  // 阈值标定：10 页 deck 实际输出 ~15K JSON，200K 几乎可断定模型在反复纠结而非生成内容。
  const REASONING_RUNAWAY_THRESHOLD = 200_000;
  let runawayTriggered = false;
  let runawayCtrl = new AbortController();
  const externalSignal = opts.signal;
  const fwdExternalAbort = () => runawayCtrl.abort();
  if (externalSignal) {
    if (externalSignal.aborted) runawayCtrl.abort();
    else externalSignal.addEventListener("abort", fwdExternalAbort);
  }

  const wrappedOnProgress = (e: ProgressEvent) => {
    // reasoning 失控：阈值触发就 abort 当前 provider 调用（仅一次）
    if (
      e.kind === "reasoning" &&
      e.bytes > REASONING_RUNAWAY_THRESHOLD &&
      !runawayTriggered
    ) {
      runawayTriggered = true;
      runawayCtrl.abort();
    }
    // 工具名一确认就启动流式承载（仅 create_deck，且非分批模式）
    if (
      canStream &&
      !streamingStarted &&
      e.kind === "tool" &&
      e.name === "create_deck"
    ) {
      useEditorStore.getState().startStreamingDeck();
      streamingStarted = true;
    }
    // 单页落地：append 到 store
    if (streamingStarted && e.kind === "slide") {
      useEditorStore.getState().appendStreamingSlide(e.slide);
      const now = Date.now();
      if (firstSlideAt === 0) firstSlideAt = now;
      lastSlideAt = now;
    }
    opts.onProgress?.(e);
  };

  // skill 配方拼到 user message 头部（context 在前、任务在后，符合 LLM 训练分布）
  const finalUserMessage = skillAddon
    ? `${skillAddon}\n\n---\n\n${opts.userMessage}`
    : opts.userMessage;

  // 算实际 max_tokens（智能/固定模式决策结果），随 prompt 事件发给 UI 便于用户验证
  // 分批路径下用「本批页数」做 estimate（与 inferPagesPerBatch 推出的批粒度联动）
  // 单次路径下用整 deck 估算页数，行为不变
  const effectiveMaxTokens = chooseMaxTokens({
    mode: active.config.maxTokensMode,
    override: active.config.maxOutputTokens,
    model: active.config.model,
    provider: active.provider,
    estimate: opts.batchInfo?.pageCount ?? estimatedPages,
    batched: !!opts.batchInfo,
  });

  // 发 prompt 事件：让 UI 在调用 LLM 前就拿到本次 prompt 体积 + 分段 + 实际 max_tokens
  // 分批模式下 batchOnProgress 会自动注入 batch info；单次模式不带 batch
  opts.onProgress?.({
    kind: "prompt",
    systemChars: systemPrompt.length,
    userChars: finalUserMessage.length,
    segments: {
      base: baseLen,
      skill: skillAddon.length,
      style: styleLen,
      aspect: aspectLen,
      pages: pagesLen,
      userRaw: opts.userMessage.length,
      skillName,
    },
    maxTokens: effectiveMaxTokens,
  });

  let result = await provider.generate({
    systemPrompt,
    tools: TOOLS,
    userMessage: finalUserMessage,
    currentDeck: opts.currentDeck,
    contextDeck: opts.contextDeck,
    config: active.config,
    onProgress: wrappedOnProgress,
    estimatedPages,
    signal: runawayCtrl.signal,
    batchInfo: opts.batchInfo,
  });

  // runaway 触发的取消（非用户主动取消）→ 自动重试一次，max_tokens 减半 + 强制 fixed mode
  // reasoning 阶段还没进入 tool_use，streamingStarted 仍为 false，store 状态干净，可直接重试
  if (
    result.cancelled &&
    runawayTriggered &&
    !externalSignal?.aborted
  ) {
    const halvedTokens = Math.max(2000, Math.floor(effectiveMaxTokens / 2));
    const halvedConfig = {
      ...active.config,
      maxTokensMode: "fixed" as const,
      maxOutputTokens: halvedTokens,
    };

    // 重置 runaway 状态 + signal forward
    if (externalSignal) externalSignal.removeEventListener("abort", fwdExternalAbort);
    runawayTriggered = false;
    runawayCtrl = new AbortController();
    if (externalSignal) {
      if (externalSignal.aborted) runawayCtrl.abort();
      else externalSignal.addEventListener("abort", fwdExternalAbort);
    }

    // 通知 UI：max_tokens 已降，重新进入 thinking
    opts.onProgress?.({
      kind: "prompt",
      systemChars: systemPrompt.length,
      userChars: finalUserMessage.length,
      segments: {
        base: baseLen,
        skill: skillAddon.length,
        style: styleLen,
        aspect: aspectLen,
        pages: pagesLen,
        userRaw: opts.userMessage.length,
        skillName,
      },
      maxTokens: halvedTokens,
    });

    result = await provider.generate({
      systemPrompt,
      tools: TOOLS,
      userMessage: finalUserMessage,
      currentDeck: opts.currentDeck,
      contextDeck: opts.contextDeck,
      config: halvedConfig,
      onProgress: wrappedOnProgress,
      estimatedPages,
      signal: runawayCtrl.signal,
      batchInfo: opts.batchInfo,
    });
  }

  // 清理 listener
  if (externalSignal) externalSignal.removeEventListener("abort", fwdExternalAbort);

  // 流式承载收尾：根据 result 状态分发
  if (streamingStarted) {
    const store = useEditorStore.getState();
    if (result.deck && !result.cancelled) {
      // tail delay 自适应：根据 slide 事件首末时间分布判断真流式 vs buffered
      // - 真流式：events 分散（首末间隔 > N×40ms）→ store 已逐格 append 完成，仅留 200ms 给 React commit
      // - buffered：events 同 tick 批量（首末间隔 < N×40ms）→ store 80ms throttle 还在排队，
      //   按旧公式 min(2000, N×80+100) 留足时间让矩阵填满后再切 editor
      // - 无 slide 事件（parser 漂移走 page 兜底）→ 按 buffered 处理保险
      const slidesCount = result.deck.slides.length || estimatedPages;
      const slideSpread = lastSlideAt - firstSlideAt;
      const trulyStreamed = firstSlideAt > 0 && slideSpread > slidesCount * 40;
      const tailDelay = trulyStreamed ? 200 : Math.min(2000, slidesCount * 80 + 100);
      await new Promise((resolve) => setTimeout(resolve, tailDelay));
      store.commitStreamingDeck(result.deck);
      // 生成完成才切到 editor，避免边生边渲时用户看到半成品
      useEditorStore.getState().setView("editor");
    } else if (result.cancelled) {
      store.cancelStreamingDeck({ keepPartial: true });
      const after = useEditorStore.getState().deck;
      if (after.slides.length > 0) {
        result.deck = after;
        useEditorStore.getState().setView("editor");
      }
    } else {
      store.cancelStreamingDeck({ keepPartial: false });
    }
    result.appliedToStore = true;
  }

  return result;
}

// 续接批最大并发数：受 provider rate limit 制约，3 是 80% 收益且 429 触发率低的折中
const MAX_CONCURRENT_BATCHES = 3;

// 受控并发：从 items 头开始最多 concurrency 个并发执行 worker；返回与 items 同序的 R[]
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const slots = Math.min(concurrency, items.length);
  const runners: Promise<void>[] = [];
  for (let s = 0; s < slots; s++) {
    runners.push(
      (async () => {
        while (true) {
          const i = nextIndex++;
          if (i >= items.length) return;
          results[i] = await worker(items[i]!, i);
        }
      })(),
    );
  }
  await Promise.all(runners);
  return results;
}

interface BatchAttemptResult {
  // 完整 deck（首批 = 新建 deck；续接 = baseDeck + 该批新增页）。失败时 undefined
  deck?: Deck;
  cancelled: boolean;
  // 致命错误（整批失败、用户取消等）
  error?: string;
  // 部分失败原因（recoverByBisect 部分恢复时填）
  partialError?: string;
}

// 单批尝试：调 generateOnce + 失败时走二分递归 fallback。
// 不直接写 store（store 由调用方在合适时机整理），slide 事件仍通过 progress forward
async function runBatchAttempt(args: {
  chunkIdx: number;
  chunk: PromptSegment[];
  baseDeck: Deck | undefined;        // 续接批=baseline（首批 deck），首批=undefined
  pageOffsetExpected: number;        // 按 chunk 顺序累计预期 offset
  totalBatches: number;
  totalPages: number;
  opts: AgentOptions;
}): Promise<BatchAttemptResult> {
  const { chunkIdx: i, chunk, baseDeck, pageOffsetExpected, totalBatches, totalPages, opts } = args;

  if (opts.signal?.aborted) return { deck: undefined, cancelled: true };

  const buildContextDeck = (curBase: Deck | undefined): Deck | undefined =>
    curBase
      ? ({
          version: curBase.version,
          meta: curBase.meta,
          theme: curBase.theme,
          variables: curBase.variables ?? {},
          slides: [] as Deck["slides"],
        } as Deck)
      : undefined;

  const buildOnProgress = (info: BatchInfo) => (e: ProgressEvent) => {
    if (e.kind === "slide") useEditorStore.getState().appendStreamingSlide(e.slide);
    opts.onProgress?.({ ...e, batch: info });
  };

  const batchInfo: BatchInfo = {
    current: i + 1,
    total: totalBatches,
    pageOffset: pageOffsetExpected,
    pageCount: chunk.length,
    totalPages,
  };

  const batchResult = await generateOnce(
    {
      userMessage: buildBatchPrompt(chunk, i, totalBatches, pageOffsetExpected, totalPages),
      currentDeck: baseDeck,
      contextDeck: buildContextDeck(baseDeck),
      styleId: opts.styleId,
      aspectRatio: opts.aspectRatio,
      onProgress: buildOnProgress(batchInfo),
      signal: opts.signal,
      originalUserMessage: opts.userMessage,
      forceTranslationMode: true,
      batchInfo,
    },
    /* skipStoreStreaming */ true,
  );

  if (batchResult.cancelled) return { deck: undefined, cancelled: true };
  if (batchResult.deck && !batchResult.error) return { deck: batchResult.deck, cancelled: false };

  // 失败兜底：仅续接批（i > 0）+ 多页 chunk 走 split-and-conquer
  if (i > 0 && chunk.length > 1) {
    const tryGenerateSegments = async (
      segs: PromptSegment[],
      curBase: Deck | undefined,
      startOffset: number,
    ) => {
      const segInfo: BatchInfo = {
        current: i + 1,
        total: totalBatches,
        pageOffset: startOffset,
        pageCount: segs.length,
        totalPages,
      };
      return generateOnce(
        {
          userMessage: buildBatchPrompt(segs, i, totalBatches, startOffset, totalPages),
          currentDeck: curBase,
          contextDeck: buildContextDeck(curBase),
          styleId: opts.styleId,
          aspectRatio: opts.aspectRatio,
          onProgress: buildOnProgress(segInfo),
          signal: opts.signal,
          originalUserMessage: opts.userMessage,
          forceTranslationMode: true,
          batchInfo: segInfo,
        },
        /* skipStoreStreaming */ true,
      );
    };

    const recoverByBisect = async (
      segs: PromptSegment[],
      curBase: Deck | undefined,
      startOffset: number,
    ): Promise<{ deck: Deck | undefined; recovered: number; error?: string; cancelled?: boolean }> => {
      if (opts.signal?.aborted) return { deck: curBase, recovered: 0, cancelled: true };
      const res = await tryGenerateSegments(segs, curBase, startOffset);
      if (res.cancelled) return { deck: curBase, recovered: 0, cancelled: true };
      if (res.deck && !res.error) {
        // 并发场景下不在此处 applyStreamingBatch（避免多 task 互相覆盖）；最终调用方一次性整理
        return { deck: res.deck, recovered: segs.length };
      }
      if (segs.length <= 1) {
        return {
          deck: curBase,
          recovered: 0,
          error: res.error ?? i18next.t("error:agent.unknown"),
        };
      }
      const m = Math.floor(segs.length / 2);
      const left = await recoverByBisect(segs.slice(0, m), curBase, startOffset);
      if (left.cancelled) return left;
      const right = await recoverByBisect(segs.slice(m), left.deck, startOffset + left.recovered);
      return {
        deck: right.deck,
        recovered: left.recovered + right.recovered,
        error: left.error ?? right.error,
        cancelled: right.cancelled,
      };
    };

    // 入口：跳过整段重试（main 已失败一次），直接二分
    const m = Math.floor(chunk.length / 2);
    const leftRes = await recoverByBisect(chunk.slice(0, m), baseDeck, pageOffsetExpected);
    if (leftRes.cancelled) return { deck: undefined, cancelled: true };
    const rightRes = await recoverByBisect(
      chunk.slice(m),
      leftRes.deck,
      pageOffsetExpected + leftRes.recovered,
    );
    if (rightRes.cancelled) return { deck: undefined, cancelled: true };

    const totalRecovered = leftRes.recovered + rightRes.recovered;
    const partialError = leftRes.error ?? rightRes.error;
    if (rightRes.deck && totalRecovered > 0) {
      return { deck: rightRes.deck, cancelled: false, partialError };
    }
    return {
      deck: undefined,
      cancelled: false,
      error: partialError ?? batchResult.error ?? i18next.t("error:agent.unknown"),
    };
  }

  return {
    deck: undefined,
    cancelled: false,
    error: batchResult.error ?? i18next.t("error:agent.unknown"),
  };
}

// 分批生成：首批同步建立 baseline（meta/theme），2..N 批受控并发追加页面。
// 多批 result.deck 各自含 baseline + 该批新页，最终按 chunkIdx 顺序合并 slides 一次性 commit。
async function generateBatched(opts: AgentOptions, segments: PromptSegment[]): Promise<AgentResult> {
  const store = useEditorStore.getState();
  // keepView：分批生成期间留在当前视图（Home），让用户看进度而非半成品 editor
  store.startStreamingDeck({ keepView: true });

  const active = getActiveConfig();
  const pagesPerBatch = active
    ? inferPagesPerBatch(active.config.model, active.provider, active.config.maxOutputTokens)
    : 3;

  const totalPages = segments.length;
  const chunks = chunkSegments(segments, pagesPerBatch);
  const totalBatches = chunks.length;

  // 按 chunk 顺序累计 pageOffset（LLM 1:N 段映射假设；实际 LLM 输出量与 chunk.length 大致贴合）
  const pageOffsetByChunk: number[] = [];
  for (let i = 0, off = 0; i < chunks.length; i++) {
    pageOffsetByChunk.push(off);
    off += chunks[i]!.length;
  }

  if (opts.signal?.aborted) {
    store.cancelStreamingDeck({ keepPartial: false });
    return { cancelled: true, appliedToStore: true };
  }

  // 首批同步：建立 meta/theme baseline，让后续并发批共享视觉风格
  const firstAttempt = await runBatchAttempt({
    chunkIdx: 0,
    chunk: chunks[0]!,
    baseDeck: undefined,
    pageOffsetExpected: 0,
    totalBatches,
    totalPages,
    opts,
  });

  if (firstAttempt.cancelled) {
    store.cancelStreamingDeck({ keepPartial: true });
    const after = useEditorStore.getState().deck;
    if (after.slides.length > 0) useEditorStore.getState().setView("editor");
    return {
      cancelled: true,
      deck: after.slides.length > 0 ? after : undefined,
      appliedToStore: true,
    };
  }
  if (!firstAttempt.deck || firstAttempt.error) {
    // 第 1 批失败：完整回滚，留 Home 显示错误条
    store.cancelStreamingDeck({ keepPartial: false });
    return {
      error: firstAttempt.error || i18next.t("error:agent.firstBatchFailed"),
      appliedToStore: true,
    };
  }

  const baseline = firstAttempt.deck;
  const baselineCount = baseline.slides.length;
  store.applyStreamingBatch(baseline);

  // 单批 deck 走完即收（generate() 入口已对单批降级为 generateOnce，此处兜底）
  if (totalBatches === 1) {
    store.commitStreamingDeck(baseline);
    useEditorStore.getState().setView("editor");
    return {
      deck: baseline,
      source: "create",
      summary: i18next.t("error:agent.batchAllSuccess", {
        count: baseline.slides.length,
        total: 1,
      }),
      appliedToStore: true,
    };
  }

  // 2..N 批受控并发
  const remainingTasks = chunks.slice(1).map((chunk, idx) => ({
    chunkIdx: idx + 1,
    chunk,
    pageOffsetExpected: pageOffsetByChunk[idx + 1]!,
  }));

  const concurrentResults = await runWithConcurrency(
    remainingTasks,
    MAX_CONCURRENT_BATCHES,
    async (task) => {
      if (opts.signal?.aborted) {
        return { task, attempt: { deck: undefined, cancelled: true } as BatchAttemptResult };
      }
      const attempt = await runBatchAttempt({
        chunkIdx: task.chunkIdx,
        chunk: task.chunk,
        baseDeck: baseline,
        pageOffsetExpected: task.pageOffsetExpected,
        totalBatches,
        totalPages,
        opts,
      });
      return { task, attempt };
    },
  );

  // 用户取消：保留首批 + 已并发完成的部分
  const cancelled = concurrentResults.some((r) => r.attempt.cancelled);
  if (cancelled) {
    store.cancelStreamingDeck({ keepPartial: true });
    const after = useEditorStore.getState().deck;
    if (after.slides.length > 0) useEditorStore.getState().setView("editor");
    return {
      cancelled: true,
      deck: after.slides.length > 0 ? after : undefined,
      appliedToStore: true,
    };
  }

  // 按 chunkIdx 顺序合并所有批 newSlides（runWithConcurrency 已保证 results 与 input 同序）
  const mergedSlides: Deck["slides"] = [...baseline.slides];
  let firstFatalError: string | undefined;
  let firstPartialError: string | undefined;
  let failedBatchIdx = 0;
  for (const { task, attempt } of concurrentResults) {
    if (attempt.deck) {
      // 提取该批新增 slides（基于 baseline 之后的部分）
      mergedSlides.push(...attempt.deck.slides.slice(baselineCount));
    }
    if (attempt.partialError && !firstPartialError) firstPartialError = attempt.partialError;
    if (attempt.error && !firstFatalError) {
      firstFatalError = attempt.error;
      failedBatchIdx = task.chunkIdx;
    }
  }

  const finalDeck: Deck = { ...baseline, slides: mergedSlides };

  if (firstFatalError && mergedSlides.length === baselineCount) {
    // 全部续接批失败 → 提交首批 + warning（用户至少能看到首批结果）
    store.applyStreamingBatch(finalDeck);
    store.commitStreamingDeck(finalDeck);
    return {
      deck: finalDeck,
      source: "create",
      summary: i18next.t("error:agent.batchPartialSuccess", {
        count: finalDeck.slides.length,
        current: 1,
        total: totalBatches,
      }),
      warning: i18next.t("error:agent.batchPartialWarning", {
        current: failedBatchIdx + 1,
        total: totalBatches,
        count: finalDeck.slides.length,
        reason: firstFatalError,
      }),
      appliedToStore: true,
    };
  }

  // applyStreamingBatch 整体替换：消除 appendStreamingSlide 中间错乱顺序，按 chunkIdx 重组
  store.applyStreamingBatch(finalDeck);
  store.commitStreamingDeck(finalDeck);
  useEditorStore.getState().setView("editor");

  if (firstFatalError || firstPartialError) {
    return {
      deck: finalDeck,
      source: "create",
      summary: i18next.t("error:agent.batchPartialSuccess", {
        count: finalDeck.slides.length,
        current: totalBatches,
        total: totalBatches,
      }),
      warning: i18next.t("error:agent.batchPartialWarning", {
        current: failedBatchIdx + 1,
        total: totalBatches,
        count: finalDeck.slides.length,
        reason: firstFatalError ?? firstPartialError ?? i18next.t("error:agent.unknown"),
      }),
      appliedToStore: true,
    };
  }

  return {
    deck: finalDeck,
    source: "create",
    summary: i18next.t("error:agent.batchAllSuccess", {
      count: finalDeck.slides.length,
      total: totalBatches,
    }),
    appliedToStore: true,
  };
}


// 顶层入口：根据用户输入特征决定走分批还是单次
export async function generate(opts: AgentOptions): Promise<AgentResult> {
  const decision = shouldBatchByPrompt(opts);

  // 单批降级：即使触发了分批（≥2000 字 + ≥3 段），如果 inferPagesPerBatch 推出的批粒度
  // ≥ 总段数（如 cap=128K 模型 12 页/批 + 10 段文案），实际只会跑 1 批。
  // 此时走分批 orchestrator 反而引入：
  //   - skipStoreStreaming=true 让 generateOnce 内不启动 streamingMode（页 streaming 失效）
  //   - batchInfo 注入让 thinking 文案常显「(批 1/1) 即将生成第 1-N 页」长时间不变
  //   - 用户在 100s+ thinking 期间看不到任何流式变化
  // 降级为 generateOnce 让用户回到「create_deck 单次模式」体验：streamingMode 启动、
  // slide 事件逐页落地、SlideGridProgress 矩阵逐格亮、phaseLabel 显示「正在生成第 X / Y 页…」
  let useBatched = decision.batch;
  if (decision.batch) {
    const active = getActiveConfig();
    const pagesPerBatch = active
      ? inferPagesPerBatch(active.config.model, active.provider, active.config.maxOutputTokens)
      : 3;
    if (decision.segments.length <= pagesPerBatch) {
      useBatched = false;
    }
  }

  const result = useBatched
    ? await generateBatched(opts, decision.segments)
    : await generateOnce(opts);

  // 后台异步把 picsum 占位 URL 替换为关键词匹配的 Pexels 真图
  // 已配置 API key 才跑；不阻塞返回（用户先看到 deck，图片几秒后无缝升级）
  // 失败/超时静默吞掉，picsum URL 仍可加载，零回归
  if (result.deck && !result.cancelled && !result.error && hasPexelsApiKey()) {
    void enrichDeckImagesAsync(result.deck);
  }
  return result;
}

async function enrichDeckImagesAsync(deck: Deck): Promise<void> {
  try {
    const subs = await buildImageSubstitutions(deck);
    if (subs.size > 0) {
      useEditorStore.getState().replaceImageUrls(subs);
    }
  } catch {
    // 静默失败：网络/限流/解析错误都不影响已渲染 deck
  }
}

export type { AgentResult, ProgressEvent } from "./types";
