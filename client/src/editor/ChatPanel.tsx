import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  Send,
  Square,
  X,
  Brain,
  Loader2,
  History as HistoryIcon,
  Palette,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useEditorStore, isPlaceholderSlideId, SKELETON_SLIDE_ID } from "@/store/editor";
import { generate, estimatePageCount, type ProgressEvent } from "@/llm/agent";
import { hasValidConfig, getActiveModelConfig, PROVIDER_LABELS } from "@/llm/settings";
import {
  loadConversations,
  upsertConversation,
  type ChatMessage,
} from "@/data/conversations";
import {
  loadAllStylePrompts,
  getStylePrompt,
} from "@/data/stylePrompts";
import { ProviderSettingsDialog } from "./ProviderSettingsDialog";
import { HistoryDialog } from "./HistoryDialog";
import { cn } from "@/lib/cn";
import { phaseLabel } from "@/lib/phaseLabel";
import { SlideGridProgress } from "@/lib/slideGridProgress";
import { PromptSizeChip, type PromptInfo } from "@/lib/promptSizeChip";
import { localizedName } from "@/data/builtinLabels";
import type { BatchInfo } from "@/llm/types";

export function ChatPanel() {
  const { t } = useTranslation("chat");
  const [open, setOpen] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ phase: ProgressEvent["kind"]; current: number; estimate: number; bytes?: number; batch?: BatchInfo; modelName?: string; promptInfo?: PromptInfo } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const deck = useEditorStore((s) => s.deck);
  const loadDeck = useEditorStore((s) => s.loadDeck);
  const streamingMode = useEditorStore((s) => s.streamingMode);
  // 排除骨架与占位：tool 阶段预插的 placeholder 不计入「已生成」，避免进度条因占位虚高
  const streamingSlideCount = useEditorStore((s) => {
    if (!s.streamingMode) return 0;
    let n = 0;
    for (const sl of s.deck.slides) {
      if (sl.id === SKELETON_SLIDE_ID) continue;
      if (isPlaceholderSlideId(sl.id)) continue;
      n++;
    }
    return n;
  });
  const conversationId = useEditorStore((s) => s.currentConversationId);
  const setConversationId = useEditorStore((s) => s.setCurrentConversationId);
  const styleId = useEditorStore((s) => s.selectedStyleId);
  const setStyleId = useEditorStore((s) => s.setSelectedStyleId);
  const selectedStyle = useMemo(
    () => (styleId ? getStylePrompt(styleId) : undefined),
    [styleId]
  );

  // 切换对话或视图时重新载入消息
  useEffect(() => {
    if (conversationId) {
      const conv = loadConversations().find((c) => c.id === conversationId);
      setMessages(conv?.messages ?? []);
    } else {
      setMessages([]);
    }
  }, [conversationId]);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const submit = async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!hasValidConfig()) {
      setShowKeyDialog(true);
      return;
    }

    const userMsg: ChatMessage = { role: "user", text, timestamp: Date.now() };
    const afterUser = [...messages, userMsg];
    setMessages(afterUser);
    setInput("");
    setLoading(true);
    const initialEstimate = estimatePageCount(text, deck);
    const activeModel = getActiveModelConfig();
    setProgress({
      phase: "connecting",
      current: 0,
      estimate: initialEstimate,
      // 显示真实模型 ID（如 mimo-v2.5-pro）而非用户自定义别名（如"我的 Mimo"）
      modelName: activeModel?.model,
    });

    // 每轮新提交从 0 计时:用户在多轮对话中调整 deck 时,看到的应该是"这一轮花了多久"
    // 而不是整个会话的累计耗时(那个值已经存在 conversation.durationMs 里,历史窗口可看)
    const controller = new AbortController();
    controllerRef.current = controller;
    const startedAt = Date.now();

    const result = await generate({
      userMessage: text,
      currentDeck: deck,
      styleId,
      signal: controller.signal,
      onProgress: (e) => {
        // estimate 修正：分批 orchestrator 通过 batch.totalPages 主动告知真实总页数，
        // 弥补提交时 estimatePageCount 文本匹配可能不准的情况（例：用户用「## 第 1..46 页」
        // 大纲分段，cleaned 把局部页码全剔除后 max=0 → estimate 缩到 default）
        const mergeEstimate = (prevEstimate: number) => {
          const tp = e.batch?.totalPages ?? 0;
          return tp > prevEstimate ? tp : prevEstimate;
        };
        // batch chip 防闪烁：N 批并发时多个 worker 的 progress 事件交错到达，
        // 直接覆盖 batch 会让 chip "(批 X/Y)" 在不同批次间反复跳变。
        // 只在 e.batch.current >= prev.batch.current 时更新，保证 chip 单调递增
        const mergeBatch = (prevBatch: typeof e.batch | undefined) =>
          e.batch && (!prevBatch || e.batch.current >= prevBatch.current)
            ? e.batch
            : prevBatch;
        if (e.kind === "page") {
          // page 事件不让 e.estimate 覆盖（避免 LLM 实际输出页数推高 estimate 的旧 bug）；
          // 仅当分批 batch.totalPages 提供权威值时才修正
          // current(批内页码)也只升不降，避免并发批之间跳变
          setProgress((prev) => {
            if (!prev) return prev;
            const nextCurrent = e.current > prev.current ? e.current : prev.current;
            return { ...prev, phase: "page", current: nextCurrent, batch: mergeBatch(prev.batch), estimate: mergeEstimate(prev.estimate) };
          });
        } else if (e.kind === "slide" || e.kind === "tool") {
          // 流式承载会通过 store 更新 UI，这里仅同步 phase + batch
          setProgress((prev) => (prev ? { ...prev, phase: "slide" as any, batch: mergeBatch(prev.batch), estimate: mergeEstimate(prev.estimate) } : prev));
        } else if (e.kind === "receiving") {
          setProgress((prev) => (prev ? { ...prev, phase: "receiving", bytes: e.bytes, batch: mergeBatch(prev.batch), estimate: mergeEstimate(prev.estimate) } : prev));
        } else if (e.kind === "reasoning") {
          setProgress((prev) => (prev ? { ...prev, phase: "reasoning", bytes: e.bytes, batch: mergeBatch(prev.batch), estimate: mergeEstimate(prev.estimate) } : prev));
        } else if (e.kind === "prompt") {
          setProgress((prev) => {
            if (!prev) return prev;
            const thisCall = e.systemChars + e.userChars;
            const cumulativeChars = e.batch
              ? (prev.promptInfo?.cumulativeChars ?? 0) + thisCall
              : thisCall;
            return {
              ...prev,
              estimate: mergeEstimate(prev.estimate),
              promptInfo: {
                systemChars: e.systemChars,
                userChars: e.userChars,
                segments: e.segments,
                cumulativeChars,
                maxTokens: e.maxTokens,
              },
            };
          });
        } else {
          setProgress((prev) => (prev ? { ...prev, phase: e.kind, batch: mergeBatch(prev.batch), estimate: mergeEstimate(prev.estimate) } : prev));
        }
      },
    });

    controllerRef.current = null;
    setLoading(false);
    setProgress(null);

    let finalMessages: ChatMessage[];
    let nextDeck = deck;

    if (result.cancelled) {
      const kept = result.deck?.slides?.length ?? 0;
      const cancelText = kept > 0
        ? t("messages.stoppedKept", { count: kept })
        : t("messages.stopped");
      finalMessages = [
        ...afterUser,
        { role: "assistant", text: cancelText, timestamp: Date.now() },
      ];
      if (result.deck) nextDeck = result.deck;
    } else if (result.error) {
      finalMessages = [
        ...afterUser,
        { role: "error", text: result.error, timestamp: Date.now() },
      ];
    } else if (result.deck) {
      finalMessages = [
        ...afterUser,
        {
          role: "assistant",
          text: result.summary || (result.source === "create" ? t("messages.createdNew") : t("messages.applied")),
          source: result.source,
          timestamp: Date.now(),
        },
      ];
      nextDeck = result.deck;
      // agent 已通过 commitStreamingDeck 写入 store 时跳过 loadDeck（避免清空历史栈）
      if (!result.appliedToStore) loadDeck(result.deck);
    } else {
      finalMessages = afterUser;
    }
    setMessages(finalMessages);

    // upsert conversation
    let convId = conversationId;
    if (!convId) {
      convId = nanoid(10);
      setConversationId(convId);
    }
    const existing = loadConversations().find((c) => c.id === convId);
    upsertConversation({
      id: convId,
      title: nextDeck.meta.title || finalMessages[0]?.text.slice(0, 30) || t("fallbackTitle"),
      deck: nextDeck,
      messages: finalMessages,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      // 累加本轮耗时：编辑器内多轮调整时累计显示真实总时间，而不是每次只看最近一轮
      durationMs: (existing?.durationMs ?? 0) + (Date.now() - startedAt),
    });
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title={t("open")}
          className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-blue-600 text-white shadow-xl hover:bg-blue-700 hover:scale-105 transition-all flex items-center justify-center"
        >
          <Sparkles size={22} />
        </button>
      )}

      {open && (
        <div
          className="fixed bottom-6 right-6 z-30 w-[400px] max-w-[90vw] bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          style={{ height: "min(640px, 85vh)" }}
        >
          <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles size={16} className="text-blue-600 flex-shrink-0" />
              <span className="text-sm font-semibold flex-shrink-0">{t("title")}</span>
              <ActiveModelBadge />
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => setShowStylePicker(true)}
                title={t("stylePicker")}
                className={cn(
                  "p-1.5 rounded text-slate-500",
                  selectedStyle ? "bg-purple-50 text-purple-600 hover:bg-purple-100" : "hover:bg-slate-100"
                )}
              >
                <Palette size={14} />
              </button>
              <button
                onClick={() => setShowHistory(true)}
                title={t("history")}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
              >
                <HistoryIcon size={14} />
              </button>
              <button
                onClick={() => setShowKeyDialog(true)}
                title={t("modelSettings")}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
              >
                <Brain size={14} />
              </button>
              <button
                onClick={() => setOpen(false)}
                title={t("collapse")}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
              >
                <X size={14} />
              </button>
            </div>
          </header>

          {selectedStyle && (
            <div className="px-3 py-1.5 border-b border-slate-100 flex items-center gap-1.5 bg-purple-50/50 flex-shrink-0">
              <Palette size={11} className="text-purple-600 flex-shrink-0" />
              <span className="text-[11px] text-purple-700">
                {selectedStyle.emoji} {localizedName(selectedStyle, "style")}
              </span>
              <button
                onClick={() => setStyleId(undefined)}
                className="ml-auto text-[10px] text-purple-500 hover:underline"
              >
                {t("selectedStyle.clear")}
              </button>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3 space-y-3">
            {messages.length === 0 && <EmptyHint />}
            {messages.map((m, i) => (
              <MessageBubble key={i} msg={m} />
            ))}
            {loading && progress && (
              <ProgressBubble
                progress={progress}
                streamingMode={streamingMode}
                streamingSlideCount={streamingSlideCount}
              />
            )}
          </div>

          <div className="border-t border-slate-200 p-3 flex-shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={loading}
                placeholder={t("input.placeholder")}
                rows={2}
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
              />
              {loading ? (
                <button
                  onClick={() => controllerRef.current?.abort()}
                  title={t("stop")}
                  className="p-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700"
                >
                  <Square size={16} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={!input.trim()}
                  className={cn(
                    "p-2 rounded-lg",
                    !input.trim()
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  )}
                >
                  <Send size={16} />
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              {loading ? t("hint.loading") : t("hint.ready")}
            </p>
          </div>
        </div>
      )}

      {showKeyDialog && <ProviderSettingsDialog onClose={() => setShowKeyDialog(false)} />}
      {showHistory && <HistoryDialog onClose={() => setShowHistory(false)} />}
      {showStylePicker && (
        <StylePickerDialog
          currentId={styleId}
          onPick={(id) => {
            setStyleId(id);
            setShowStylePicker(false);
          }}
          onClose={() => setShowStylePicker(false)}
        />
      )}
    </>
  );
}

// phaseLabel 已抽到 @/lib/phaseLabel 共用

// 组件挂载时刻起算的"已等待秒数"。每 1s tick，让用户感知进程未卡死。
// baseSeconds 参数用于在编辑器内对当前 conversation 已累计的耗时做累加显示，
// 避免每次新一轮调整把"已用时间"重置为 0。
export function useElapsedSeconds(baseSeconds = 0): number {
  const [, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    startRef.current = Date.now();
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return baseSeconds + Math.floor((Date.now() - startRef.current) / 1000);
}

function ProgressBubble({
  progress,
  streamingMode,
  streamingSlideCount,
  baseSeconds = 0,
}: {
  progress: { phase: ProgressEvent["kind"]; current: number; estimate: number; bytes?: number; batch?: BatchInfo; modelName?: string; promptInfo?: PromptInfo };
  streamingMode: boolean;
  streamingSlideCount: number;
  baseSeconds?: number;
}) {
  const { t } = useTranslation("chat");
  // 等待计时器：组件挂载即开始计时；每 1s tick 一次让 elapsed 更新
  const elapsed = useElapsedSeconds(baseSeconds);
  const indeterminate = !streamingMode && progress.phase !== "page";
  // 进度比例：分批模式用全局已生成页数 / 总页数（保单调，不会每批回零）
  const ratio = streamingMode
    ? Math.min(100, (streamingSlideCount / Math.max(1, progress.estimate)) * 100)
    : progress.phase === "page"
    ? Math.min(100, (progress.current / Math.max(1, progress.estimate)) * 100)
    : 30;
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] px-3 py-2.5 bg-blue-50 text-blue-800 rounded-lg rounded-bl-sm text-xs border border-blue-200 min-w-[200px]">
        <div className="flex items-center gap-2 mb-1.5">
          <Loader2 size={12} className="animate-spin flex-shrink-0" />
          <span className="font-medium flex-1">
            {phaseLabel(progress.phase, progress.current, progress.estimate, streamingMode, streamingSlideCount, progress.bytes, progress.batch)}
          </span>
          {progress.modelName && (
            <span
              className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[9px] font-medium border border-blue-200 max-w-[120px] truncate"
              title={t("modelBadge.active", { model: progress.modelName })}
            >
              {progress.modelName}
            </span>
          )}
          {progress.promptInfo && (
            <PromptSizeChip
              info={progress.promptInfo}
              isBatch={!!progress.batch}
              className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[9px] font-medium border border-blue-200 cursor-help tabular-nums flex-shrink-0"
            />
          )}
          <span className="tabular-nums text-[10px] text-blue-600 flex-shrink-0">
            {elapsed}s
          </span>
          {!streamingMode && progress.phase === "page" && (
            <span className="tabular-nums text-[10px] text-blue-600">
              {progress.current} / {progress.estimate}
            </span>
          )}
        </div>
        <div className="relative w-full h-1 rounded-full bg-blue-100 overflow-hidden">
          <div
            className={
              indeterminate
                ? "absolute inset-y-0 left-0 w-1/4 bg-blue-500 rounded-full hxs-progress-flow"
                : "absolute inset-y-0 left-0 bg-blue-500 rounded-full transition-[width] duration-300"
            }
            style={indeterminate ? undefined : { width: `${ratio}%` }}
          />
        </div>
        {progress.estimate > 0 && (
          // generated 双源 max：streamingSlideCount（slide 事件 append 数）与 progress.current
          // （anthropic/openai 兜底 layout 计数事件）任一推动都能让矩阵动；
          // 单次 streaming 模式下 parser 失败时 layout 计数仍能感知；patch 模式下 streamingMode=false 用 current
          <SlideGridProgress
            className="mt-2"
            total={progress.estimate}
            generated={Math.max(streamingMode ? streamingSlideCount : 0, progress.current ?? 0)}
            batch={progress.batch}
            phase={progress.phase}
          />
        )}
        {(progress.phase === "connecting" || progress.phase === "thinking") && (
          <p className="text-[10px] text-blue-600/80 mt-1.5 leading-relaxed">
            {elapsed < 5
              ? t("elapsed.earlyHint")
              : elapsed < 15
              ? t("elapsed.midHint")
              : elapsed < 45
              ? t("elapsed.longHint")
              : t("elapsed.veryLongHint")}
          </p>
        )}
      </div>
    </div>
  );
}

function StylePickerDialog({
  currentId,
  onPick,
  onClose,
}: {
  currentId?: string;
  onPick: (id: string | undefined) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("chat");
  const styles = useMemo(() => loadAllStylePrompts(), []);
  return (
    <div
      className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[640px] max-w-[92vw] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Palette size={16} className="text-purple-600" />
            <h2 className="text-base font-semibold">{t("stylePickerDialog.title")}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-auto p-4">
          <button
            onClick={() => onPick(undefined)}
            className={cn(
              "w-full text-left text-xs px-3 py-2 rounded border mb-3",
              !currentId
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 hover:bg-slate-50"
            )}
          >
            {t("stylePickerDialog.none")}
          </button>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {styles.map((s) => (
              <button
                key={s.id}
                onClick={() => onPick(s.id)}
                className={cn(
                  "text-left rounded border p-2.5",
                  s.id === currentId
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-blue-400 hover:bg-slate-50"
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-base">{s.emoji}</span>
                  <span className="text-sm font-semibold">{s.name}</span>
                </div>
                <p className="text-[10px] text-slate-500 line-clamp-2">{s.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActiveModelBadge() {
  const { t } = useTranslation("chat");
  const cfg = getActiveModelConfig();
  if (!cfg) {
    return (
      <span
        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200"
        title={t("modelBadge.notActiveTitle")}
      >
        {t("modelBadge.notActive")}
      </span>
    );
  }
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 truncate"
      title={`${cfg.name} · ${PROVIDER_LABELS[cfg.provider]}`}
    >
      {cfg.model}
    </span>
  );
}

function EmptyHint() {
  const { t } = useTranslation("chat");
  const tips = t("emptyHint.tips", { returnObjects: true }) as string[];
  return (
    <div className="text-xs text-slate-500 leading-relaxed pt-4">
      <p className="mb-2 font-medium text-slate-700">{t("emptyHint.title")}</p>
      <ul className="space-y-1.5 list-disc pl-4">
        {tips.map((tip, i) => (
          <li key={i}>{tip}</li>
        ))}
      </ul>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const { t } = useTranslation("chat");
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3 py-2 bg-blue-600 text-white rounded-lg rounded-br-sm text-sm whitespace-pre-wrap">
          {msg.text}
        </div>
      </div>
    );
  }
  if (msg.role === "assistant") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] px-3 py-2 bg-slate-100 text-slate-800 rounded-lg rounded-bl-sm text-sm whitespace-pre-wrap">
          {msg.text}
          {msg.source && (
            <span className="ml-2 inline-block text-[10px] px-1.5 py-0.5 rounded bg-white text-slate-500">
              {msg.source === "create" ? t("messages.tagCreate") : t("messages.tagUpdate")}
            </span>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] px-3 py-2 bg-rose-50 text-rose-700 rounded-lg text-xs whitespace-pre-wrap border border-rose-200">
        {msg.text}
      </div>
    </div>
  );
}
