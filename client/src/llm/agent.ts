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
import { detectSegments, buildVirtualPageSegments, type PromptSegment } from "./segmentMessage";
import { parseNumWord, extractTotalPageCount } from "./pageCountParse";
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

// 数字解析 / 页数正则迁移到 pageCountParse 公共模块
// parseNumWord, extractTotalPageCount, NUM_PATTERN, UNIT_PATTERN 等共享给 prompts.ts 同步使用
const parseChineseNum = parseNumWord;

// 从用户输入估算预计页数：覆盖中英文常见量词（页/张/篇/节/章/幻灯片/PPT/slides/pages）。
// 支持中文数字（一/两/三/…/十/十一/二十）和阿拉伯数字。
// 用 matchAll 取所有命中里**最大的数字**，避免「## 第 1 页」开头被误判为 1 页。
// 例：「## 第 1 页 ... ## 第 10 页 ...」→ 10；「做 8 页 PPT」→ 8；「生成一页」→ 1；「三页演示」→ 3。
// 排除「第 N 页 / 最后 N 页 / 倒数 N 页」等局部页码引用——这些是页面索引不是总页数。
// 找不到数字时：兜底数 markdown「## 第 N 页 / ## Page N」结构化标记数（≥ 3 个标记取最大编号），
// 否则 patch 场景至少 5 页；create 默认 5。
export function estimatePageCount(userMessage: string, currentDeck?: Deck): number {
  // 1. 明确总页数（"N 页"）优先，剔除「第 N 页 / 最后 N 页」等局部引用
  const explicit = extractTotalPageCount(userMessage);
  if (explicit !== undefined) return explicit;

  // 2. 结构化分段：detectSegments 切几段就是生成几页（与实际分批口径完全一致——含「- 第N页」
  //    列表项标记、``` 围栏内跳过等规则）。≥ 3 段才构成分段方案。
  //    用"段数"而非"最大页码编号"是关键：用户跳号 / 只填少量内容却随意写「## 第50页」时，
  //    段数只反映实际写了几块内容，不会被一个大编号带飞（取最大编号会虚高到 50）。
  const segs = detectSegments(userMessage);
  if (segs.length >= 3) return segs.length;

  // 3. < 3 段：数行首页标记的"数量"（每个标记 = 一页），同样不取最大编号。
  //    带 # 的「## 第 N 页」是无歧义大纲标题，≥ 1 即采信；
  //    无 # 的纯文本标记需 ≥ 3（避免单行「第 4 页换图」这类句中/指令引用被当页数；
  //    该情况通常已被上面 detectSegments 拦截，这里是防御性兜底）。
  const lines = userMessage.split("\n");
  const markerRe =
    /^\s*(?:#+\s*)?(?:第\s*(\d+|[一二两三四五六七八九十]+)\s*[\s.、)：:．\-—]?\s*(?:页|部分|章|节)|(?:Page|Slide|Section)\s+(\d+))/i;
  let markerCount = 0;
  let hashMarkerCount = 0; // 带 markdown 标题前缀（#+）的页标记数量
  for (const line of lines) {
    const m = line.match(markerRe);
    if (!m) continue;
    const n = parseChineseNum(m[1] ?? m[2] ?? "");
    if (n <= 0 || n >= 200) continue; // 过滤无效 / 超范围编号
    markerCount++;
    if (/^\s*#/.test(line)) hashMarkerCount++;
  }
  if (hashMarkerCount > 0) return hashMarkerCount;
  if (markerCount >= 3) return markerCount;

  // 4. 兜底
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
// originalUserMessage：用于虚拟 chunk（短指令 + 大页数场景）回灌用户原始诉求；非虚拟 chunk 不使用
function buildBatchPrompt(
  chunk: PromptSegment[],
  chunkIdx: number,
  totalChunks: number,
  accumulatedPages: number,
  totalPages: number,
  originalUserMessage?: string,
): string {
  const isFirst = chunkIdx === 0;
  const pageStart = accumulatedPages + 1;
  const pageEnd = accumulatedPages + chunk.length;
  const pageRange = chunk.length === 1 ? `第 ${pageStart} 页` : `第 ${pageStart}-${pageEnd} 页`;

  const header = `[分批生成模式 第 ${chunkIdx + 1}/${totalChunks} 批]\n本批输出：${pageRange}（共 ${totalPages} 页 deck）\n`;
  const orderRule = `\n⚠️ **严格页码顺序约束**：本批输出的 slide 必须严格按"本批文案"中给出的页码顺序生成（第 ${pageStart} 页 → 第 ${pageEnd} 页），不可调换顺序、合并段落、跳过页码。用户在大纲中标的页号即 deck 内 slide 索引序，乱序会让用户看到错位的内容。\n`;
  const instructions = isFirst
    ? `\n首批要求：调用 \`create_deck\` 工具，生成本批 ${chunk.length} 页 + 完整 deck 元数据（meta/theme/version/variables）。后续批次会继续追加。${orderRule}`
    : `\n续接要求：调用 \`patch_deck\` 工具，按本批 ${chunk.length} 个 \`{op:"add", path:"/slides/-", value:<slide>}\` **严格按页码顺序**追加到末尾（op 数组中第一个对应第 ${pageStart} 页，最后一个对应第 ${pageEnd} 页）。**沿用首批已建立的 theme/colors/字体/layout 倾向，保持视觉一致**。不要修改已有页（不要发 replace/remove）。${orderRule}`;

  // 虚拟 chunk（短指令 + 大页数场景）：所有 body 为空 → 不输出"本批文案"块，
  // 改为回灌用户原始诉求 + 本批页码范围，让 LLM 自行规划本批主题
  const isVirtualChunk = chunk.every((seg) => seg.body.trim() === "");
  if (isVirtualChunk) {
    const original = originalUserMessage?.trim();
    const originalBlock = original ? `\n═══ 用户原始诉求 ═══\n${original}\n` : "";
    const exactRule = `\n⚠️ **严格数量约束**：本批必须输出正好 ${chunk.length} 张 slide（${pageRange}），不可少 1 张也不可多 1 张。\n`;
    const virtualHint = isFirst
      ? `\n本批由 LLM 按用户原始诉求自行规划主题；不要把 ${totalPages} 页规划塞进 ${chunk.length} 页，本批仅承担前 ${chunk.length} 页（封面/概览/起手主题）。\n`
      : `\n本批仍按用户原始诉求自行规划主题；已生成的页见上下文 deck（已有 ${accumulatedPages} 页），**禁止重复**已有主题，按 deck 已建立的节奏推进下 ${chunk.length} 页。**deck 必须最终达到 ${totalPages} 页才算完成**，本批不输出够 ${chunk.length} 张会导致整体缺页。\n`;
    return `${header}${instructions}${originalBlock}${exactRule}${virtualHint}`;
  }

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
    const aspectSeg = "\n\n" + buildFixedAspectConstraint(opts.aspectRatio, targetLang);
    systemPrompt += aspectSeg;
    aspectLen = aspectSeg.length;
  }

  // 用户页数严格遵守约束：当用户消息含明确页数（"10 页"、"5 张"等）时注入
  // 放在最末尾让 LLM 最后读到；优先级高于"主动拆页"等建议，低于画幅 overflow-hidden 物理限制
  // 分批续接（forceTranslationMode）已经按用户分段强制 1:N 映射，此处也注入更稳妥
  let pagesLen = 0;
  const explicitPages = extractExplicitPageCount(promptForEstimate);
  if (explicitPages !== undefined) {
    const pagesSeg = "\n\n" + buildUserPageCountConstraint(explicitPages, targetLang);
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

  // 429 限流退避：与 runaway 分支并列。
  // 这里识别 provider 透传的 rateLimited 标记（providers/{anthropic,openai}.ts 在 catch 落地处设置）。
  // 与 runaway 的差异：429 是请求频率/并发超限，与 max_tokens 无关 → 不能走减半 max_tokens 那条路径，
  // 减半下次照样 429。正确响应是指数退避（1.5s → 3s）等服务端 reset bucket。
  //
  // 边界：若首次请求同时撞了 reasoning runaway + 429，让 runaway 分支优先处理（!runawayTriggered 守卫）；
  // runaway 减半 max_tokens 比 429 退避更可能解决"复合故障"。重试期间若新触发 runaway，
  // runawayCtrl 会 abort retry 请求 → result.cancelled=true → 跳出循环走 runaway 分支级联恢复。
  const RATE_LIMIT_MAX_RETRY = 2;
  let rateLimitAttempt = 0;
  while (
    result.rateLimited &&
    !runawayTriggered &&
    rateLimitAttempt < RATE_LIMIT_MAX_RETRY &&
    !externalSignal?.aborted
  ) {
    const delay = 1500 * Math.pow(2, rateLimitAttempt) + Math.random() * 500;
    rateLimitAttempt++;
    opts.onProgress?.({ kind: "thinking" });  // UI 退回 thinking 文案，避免错误条闪一下
    await new Promise((r) => setTimeout(r, delay));
    if (externalSignal?.aborted) break;
    // max_tokens / config 不变（429 与 token 数无关），纯退避重试
    result = await provider.generate({
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
  }

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
export const MAX_CONCURRENT_BATCHES = 3;

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

  // slide 事件落 store 仅在首批（i=0）启用：
  // 多批并发时 3 个 worker 同时 append 会让用户中途看到乱序（高 chunkIdx 完成快的页先落地）；
  // 续接批的 slide 事件只透传给 UI（进度 / 矩阵格亮）不写 store，等 attempt 完成后
  // orchestrator 用 applyStreamingBatch 按 chunkIdx 顺序整体替换，保证最终顺序正确
  const isFirstBatch = i === 0;
  const buildOnProgress = (info: BatchInfo) => (e: ProgressEvent) => {
    if (e.kind === "slide" && isFirstBatch) {
      useEditorStore.getState().appendStreamingSlide(e.slide);
    }
    opts.onProgress?.({ ...e, batch: info });
  };

  // 本批所处阶段的真实并发数：首批同步建 baseline (i=0) 实际只有 1 路在跑；
  // 续接批共享 baseline 后才进入 runWithConcurrency 并发池，最多 min(MAX_CONCURRENT_BATCHES, totalBatches-1) 路
  const remainingBatches = totalBatches - 1;
  const batchInfo: BatchInfo = {
    current: i + 1,
    total: totalBatches,
    pageOffset: pageOffsetExpected,
    pageCount: chunk.length,
    totalPages,
    concurrency: isFirstBatch ? 1 : Math.max(1, Math.min(MAX_CONCURRENT_BATCHES, remainingBatches)),
  };

  const batchResult = await generateOnce(
    {
      userMessage: buildBatchPrompt(chunk, i, totalBatches, pageOffsetExpected, totalPages, opts.userMessage),
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
          userMessage: buildBatchPrompt(segs, i, totalBatches, startOffset, totalPages, opts.userMessage),
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

  // 缺页兜底：LLM 在 patch_deck 续批里少加 1-2 张是常见软违规（"K 个 op:add"是软约束）。
  // 循环补齐：合并后若 < totalPages 且无 fatal 失败，跑补齐批（LLM 看已合并 deck + 缺额张数 → patch_deck 续 missing 张）。
  // 每轮若 mergedSlides 没增长 → break（LLM 误判 deck 已完成 / patch ops 为空，再补也无用）。最多 3 轮上限防死循环。
  const MAX_FILLUP_ROUNDS = 3;
  for (let round = 0; round < MAX_FILLUP_ROUNDS; round++) {
    if (opts.signal?.aborted) break;
    if (firstFatalError) break;
    if (mergedSlides.length >= totalPages) break;
    if (mergedSlides.length <= baselineCount) break;
    const missing = totalPages - mergedSlides.length;
    const before = mergedSlides.length;
    const fillupBase: Deck = { ...baseline, slides: mergedSlides.slice() };
    const fillupChunk = buildVirtualPageSegments(missing);
    const fillupAttempt = await runBatchAttempt({
      chunkIdx: totalBatches + round,
      chunk: fillupChunk,
      baseDeck: fillupBase,
      pageOffsetExpected: mergedSlides.length,
      totalBatches: totalBatches + round + 1,
      totalPages,
      opts,
    });
    if (!fillupAttempt.cancelled && fillupAttempt.deck) {
      mergedSlides.push(...fillupAttempt.deck.slides.slice(mergedSlides.length));
    }
    if (mergedSlides.length === before) break; // LLM 没真补 → 退出避免无意义循环
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
  let batchSegments = decision.segments;
  const active = getActiveConfig();
  const pagesPerBatch = active
    ? inferPagesPerBatch(active.config.model, active.provider, active.config.maxOutputTokens)
    : 3;
  if (decision.batch && decision.segments.length <= pagesPerBatch) {
    useBatched = false;
  }

  // 虚拟分批：短指令 + 明确大页数（如"做个 20 页性能说明"）落到单次路径时，
  // 中小模型一次性吐 20 页 deck 容易 stop_reason=end_turn 自我截断在 3-5 页。
  // 触发条件：未走分批 + 非 patch 模式 + explicit pages > 单批粒度 → 按页数构造虚拟 segments。
  // explicit pages ≤ pagesPerBatch 时单批就能装下，保留单次路径以保留 streamingMode 体验。
  if (!useBatched && !opts.currentDeck) {
    const explicit = extractExplicitPageCount(opts.userMessage);
    if (explicit !== undefined && explicit > pagesPerBatch) {
      useBatched = true;
      batchSegments = buildVirtualPageSegments(explicit);
    }
  }

  const result = useBatched
    ? await generateBatched(opts, batchSegments)
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
    if (subs.size === 0) return;
    // 版本号兜底：用 deck 引用做"未被用户编辑过"的判定
    // 若用户在 buildImageSubstitutions 期间编辑了 deck，store 的 deck 引用已变（commit 会替换）
    // → 跳过替换避免：① 覆盖用户改动 ② 不入 undo 栈导致无法回滚
    if (useEditorStore.getState().deck !== deck) return;
    useEditorStore.getState().replaceImageUrls(subs);
  } catch {
    // 静默失败：网络/限流/解析错误都不影响已渲染 deck
  }
}

export type { AgentResult, ProgressEvent } from "./types";
