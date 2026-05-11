import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  Send,
  Square,
  Brain,
  History,
  Loader2,
  RefreshCw,
  Trash2,
  Bookmark,
  Wand2,
  X,
  Palette,
  Database,
  Settings,
  Image as ImageIcon,
  ChevronDown,
} from "lucide-react";
import { getCurrentLang } from "@/i18n";
import { nanoid } from "nanoid";
import { useEditorStore, isPlaceholderSlideId, SKELETON_SLIDE_ID } from "@/store/editor";
import { generate, estimatePageCount, type ProgressEvent } from "@/llm/agent";
import { hasValidConfig, getActiveModelConfig, PROVIDER_LABELS } from "@/llm/settings";
import {
  loadContentPromptsBySource,
  deleteContentPrompt,
  type ContentPrompt,
  type PromptSource,
} from "@/data/contentPrompts";
import {
  loadStylePromptsBySource,
  deleteStylePrompt,
  getStylePrompt,
  type StylePrompt,
} from "@/data/stylePrompts";
import { upsertConversation } from "@/data/conversations";
import { generatePromptCases } from "@/llm/promptGenerator";
import { ProviderSettingsDialog } from "./ProviderSettingsDialog";
import { ImageLibraryDialog } from "./ImageLibraryDialog";
import { HistoryDialog } from "./HistoryDialog";
import { StorageDialog } from "./StorageDialog";
import { PromptSizeChip, type PromptInfo } from "@/lib/promptSizeChip";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { localizedName } from "@/data/builtinLabels";
import { StyleCard } from "./StyleCard";
import { StylePreviewDialog } from "./StylePreviewDialog";
import { NewStyleDialog } from "./NewStyleDialog";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/time";
import { phaseLabel } from "@/lib/phaseLabel";
import { SlideGridProgress } from "@/lib/slideGridProgress";
import type { BatchInfo } from "@/llm/types";
import { DeckSchema, type Deck } from "@shared/dsl";
import magicMoveZh from "@shared/examples/04-magic-move.json";
import magicMoveEn from "@shared/examples/en/04-magic-move.json";

type Status =
  | { kind: "idle" }
  | { kind: "generating"; phase: ProgressEvent["kind"]; current: number; estimate: number; bytes?: number; batch?: BatchInfo; modelName?: string; promptInfo?: PromptInfo }
  | { kind: "error"; message: string }
  | { kind: "cancelled"; kept: number };

type Tab = "style" | "content";

const SOURCE_FILTER_IDS: Array<PromptSource | "all"> = ["all", "builtin", "ai-generated"];

export function Home() {
  const { t } = useTranslation("home");
  const { t: tDialog } = useTranslation("dialog");
  const { t: tEditor } = useTranslation("editor");
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [tab, setTab] = useState<Tab>("style");
  const [filter, setFilter] = useState<PromptSource | "all">("all");
  const [showSettings, setShowSettings] = useState(false);
  const [showImageLibrary, setShowImageLibrary] = useState(false);
  const [configMenuOpen, setConfigMenuOpen] = useState(false);
  const configMenuRef = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showStorage, setShowStorage] = useState(false);
  const [previewStyle, setPreviewStyle] = useState<StylePrompt | null>(null);
  const [showNewStyle, setShowNewStyle] = useState(false);
  const [version, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<"auto" | "16:9" | "4:3">("16:9");
  const controllerRef = useRef<AbortController | null>(null);

  // 配置下拉菜单点击外部关闭
  useEffect(() => {
    if (!configMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!configMenuRef.current?.contains(e.target as Node)) {
        setConfigMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [configMenuOpen]);

  const loadDeck = useEditorStore((s) => s.loadDeck);
  const setCurrentConversationId = useEditorStore((s) => s.setCurrentConversationId);
  const selectedStyleId = useEditorStore((s) => s.selectedStyleId);
  const setSelectedStyleId = useEditorStore((s) => s.setSelectedStyleId);
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

  const contentPrompts = useMemo(
    () => loadContentPromptsBySource(filter),
    [filter, version]
  );
  const stylePrompts = useMemo(
    () => loadStylePromptsBySource(filter),
    [filter, version]
  );
  const selectedStyle = useMemo(
    () => (selectedStyleId ? getStylePrompt(selectedStyleId) : undefined),
    [selectedStyleId, version]
  );

  const triggerGenerate = async (text: string) => {
    if (!text.trim()) return;
    if (!hasValidConfig()) {
      setShowSettings(true);
      return;
    }
    const initialEstimate = estimatePageCount(text);
    const activeModel = getActiveModelConfig();
    setStatus({
      kind: "generating",
      phase: "connecting",
      current: 0,
      estimate: initialEstimate,
      modelName: activeModel?.name,
    });

    const controller = new AbortController();
    controllerRef.current = controller;
    const startedAt = Date.now();

    const result = await generate({
      userMessage: text,
      styleId: selectedStyleId,
      aspectRatio,
      signal: controller.signal,
      onProgress: (e) => {
        setStatus((prev) => {
          if (prev.kind !== "generating") return prev;
          // estimate 修正：分批 orchestrator 通过 batch.totalPages 主动告知真实总页数
          const tp = e.batch?.totalPages ?? 0;
          const estimate = tp > prev.estimate ? tp : prev.estimate;
          if (e.kind === "page") {
            // 不让 e.estimate 覆盖（旧 bug 防护），仅用 batch.totalPages
            return { ...prev, estimate, phase: "page", current: e.current, batch: e.batch };
          }
          if (e.kind === "receiving") {
            return { ...prev, estimate, phase: "receiving", bytes: e.bytes, batch: e.batch };
          }
          if (e.kind === "reasoning") {
            return { ...prev, estimate, phase: "reasoning", bytes: e.bytes, batch: e.batch };
          }
          if (e.kind === "prompt") {
            // 累计：分批模式 += systemChars+userChars；单次模式 = 本次
            const thisCall = e.systemChars + e.userChars;
            const cumulativeChars = e.batch
              ? (prev.promptInfo?.cumulativeChars ?? 0) + thisCall
              : thisCall;
            return {
              ...prev,
              estimate,
              promptInfo: {
                systemChars: e.systemChars,
                userChars: e.userChars,
                segments: e.segments,
                cumulativeChars,
                maxTokens: e.maxTokens,
              },
            };
          }
          return { ...prev, estimate, phase: e.kind, batch: e.batch };
        });
      },
    });

    controllerRef.current = null;

    if (result.cancelled) {
      const kept = result.deck?.slides?.length ?? 0;
      // 如果保留了部分页：写入 conversation 并保留 editor 视图
      if (result.deck && kept > 0) {
        const conv = {
          id: nanoid(10),
          title: result.deck.meta.title || text.slice(0, 30),
          deck: result.deck,
          messages: [
            {
              role: "user" as const,
              text: (selectedStyle ? `${t("chip.styleTag", { name: localizedName(selectedStyle, "style") })} ` : "") + text,
              timestamp: Date.now(),
            },
            {
              role: "assistant" as const,
              text: t("status.stoppedKept", { count: kept }),
              timestamp: Date.now(),
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          durationMs: Date.now() - startedAt,
        };
        upsertConversation(conv);
        setCurrentConversationId(conv.id);
      }
      setStatus({ kind: "cancelled", kept });
      return;
    }

    if (result.error && !result.deck) {
      // 失败也写入对话历史：用户能在「历史」里看到曾失败的会话与具体错误
      saveErrorConversation(text, selectedStyle?.name, result.error, startedAt);
      setStatus({ kind: "error", message: result.error });
      return;
    }
    if (!result.deck) {
      saveErrorConversation(text, selectedStyle?.name, t("status.generationFailed"), startedAt);
      setStatus({ kind: "error", message: t("status.generateFailedShort") });
      return;
    }
    const conv = {
      id: nanoid(10),
      title: result.deck.meta.title || text.slice(0, 30),
      deck: result.deck,
      messages: [
        {
          role: "user" as const,
          text: (selectedStyle ? `[风格：${selectedStyle.name}] ` : "") + text,
          timestamp: Date.now(),
        },
        {
          role: "assistant" as const,
          text: result.summary || t("status.createdNew"),
          source: result.source,
          timestamp: Date.now(),
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      durationMs: Date.now() - startedAt,
    };
    upsertConversation(conv);
    setCurrentConversationId(conv.id);
    // agent 已通过 commitStreamingDeck 写入 store 时跳过 loadDeck（避免清空历史栈）
    if (!result.appliedToStore) loadDeck(result.deck);
    // 部分成功（分批中途失败）：留在 Home 显示警告而非跳 editor
    if (result.warning) {
      setStatus({ kind: "error", message: result.warning + "\n\n已保存到历史记录，可点「历史」查看并继续编辑。" });
    } else {
      setStatus({ kind: "idle" });
    }
  };

  const refreshAiContent = async () => {
    if (!hasValidConfig()) {
      setShowSettings(true);
      return;
    }
    setRefreshing(true);
    const result = await generatePromptCases({ count: 8 });
    setRefreshing(false);
    if (result.error) {
      setStatus({ kind: "error", message: result.error });
      return;
    }
    setVersion((v) => v + 1);
    setFilter("ai-generated");
  };

  // 错误/取消状态由用户手动关闭（点条上的 X），不自动消失，避免错过提示

  return (
    <div className="w-screen h-screen overflow-auto bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-blue-600" />
          <span className="text-lg font-semibold">华胥说</span>
          <ActiveModelBadge />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory(true)}
            className="text-sm px-3 py-1.5 rounded text-slate-600 hover:bg-white/60 inline-flex items-center gap-1.5"
            title={tDialog("history.title")}
          >
            <History size={14} />
            {tEditor("toolbar.history")}
          </button>
          <button
            onClick={() => setShowStorage(true)}
            className="text-sm px-3 py-1.5 rounded text-slate-600 hover:bg-white/60 inline-flex items-center gap-1.5"
            title={tDialog("storage.title")}
          >
            <Database size={14} />
            {tEditor("toolbar.storage")}
          </button>
          <div className="w-px h-5 bg-slate-200 mx-1.5" aria-hidden />
          <div ref={configMenuRef} className="relative inline-block">
            <button
              onClick={() => setConfigMenuOpen((o) => !o)}
              className="text-sm px-3 py-1.5 rounded text-slate-600 hover:bg-white/60 inline-flex items-center gap-1.5"
              title={tDialog("config.title")}
            >
              <Settings size={14} />
              {tDialog("config.title")}
              <ChevronDown size={11} className={configMenuOpen ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {configMenuOpen && (
              <div className="absolute top-full left-0 mt-1 min-w-max bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  onClick={() => {
                    setShowSettings(true);
                    setConfigMenuOpen(false);
                  }}
                >
                  <Brain size={13} className="text-slate-500" />
                  <span className="font-medium">{tDialog("config.model")}</span>
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  onClick={() => {
                    setShowImageLibrary(true);
                    setConfigMenuOpen(false);
                  }}
                >
                  <ImageIcon size={13} className="text-slate-500" />
                  <span className="font-medium">{tDialog("config.imageLibrary")}</span>
                </button>
              </div>
            )}
          </div>
          <LanguageSwitcher compact />
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 mt-12 mb-6">
        <h1 className="text-3xl md:text-4xl font-bold text-center mb-2 text-slate-900">
          {t("title")}
        </h1>
        <p className="text-center text-slate-500 mb-4 text-sm">
          {t("subtitle")}
        </p>
        <div className="flex justify-center mb-6">
          <button
            onClick={() => loadMagicMoveDemo(loadDeck, setCurrentConversationId)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200"
          >
            <Wand2 size={11} />
            {t("magicMoveDemo")}
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-2">
          {/* 已选风格 chip */}
          {selectedStyle && (
            <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                <Palette size={11} />
                <span>{selectedStyle.emoji}</span>
                <span>{localizedName(selectedStyle, "style")}</span>
                <button
                  onClick={() => setSelectedStyleId(undefined)}
                  className="ml-1 hover:bg-purple-100 rounded"
                  title={t("chip.clearStyle")}
                >
                  <X size={10} />
                </button>
              </span>
              <span className="text-[10px] text-slate-400">{t("chip.injectHint")}</span>
            </div>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                triggerGenerate(input);
              }
            }}
            disabled={status.kind === "generating"}
            placeholder={
              selectedStyle
                ? t("input.placeholderWithStyle", { style: localizedName(selectedStyle, "style") })
                : t("input.placeholder")
            }
            rows={3}
            className="w-full px-4 py-3 text-base outline-none resize-none disabled:opacity-50 bg-transparent"
          />
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              {/* 画幅选择器 */}
              <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-xs">
                {(["16:9", "auto", "4:3"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setAspectRatio(r)}
                    disabled={status.kind === "generating"}
                    className={cn(
                      "px-2.5 py-1 transition-colors disabled:opacity-40",
                      aspectRatio === r
                        ? "bg-slate-800 text-white"
                        : "bg-white text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    {r === "auto" ? t("input.aspectAuto") : r}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-400 hidden sm:block">
                {status.kind === "generating" ? t("input.stoppingHint") : t("input.shortcuts")}
              </span>
            </div>
            {status.kind === "generating" ? (
              <button
                onClick={() => controllerRef.current?.abort()}
                title={t("input.stopTitle")}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={() => triggerGenerate(input)}
                disabled={!input.trim()}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium",
                  input.trim()
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                )}
              >
                <Send size={14} />
                {t("input.submit")}
              </button>
            )}
          </div>
        </div>

        {status.kind === "generating" && (
          <ProgressBar
            status={status}
            streamingMode={streamingMode}
            streamingSlideCount={streamingSlideCount}
          />
        )}

        {status.kind === "error" && (
          <div className="mt-3 px-4 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
            <span className="flex-1 whitespace-pre-wrap">{status.message}</span>
            <button
              onClick={() => setStatus({ kind: "idle" })}
              title="×"
              className="flex-shrink-0 text-rose-400 hover:text-rose-700 p-0.5 -mr-1"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {status.kind === "cancelled" && (
          <div className="mt-3 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
            <span className="flex-1">
              {status.kept > 0
                ? t("status.stoppedReturned", { count: status.kept })
                : t("status.stopped")}
            </span>
            <button
              onClick={() => setStatus({ kind: "idle" })}
              title="×"
              className="flex-shrink-0 text-amber-400 hover:text-amber-700 p-0.5 -mr-1"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-12">
        {/* Tab 切换：风格 / 内容案例 */}
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div className="inline-flex p-1 rounded-lg bg-white border border-slate-200">
            <TabButton active={tab === "style"} onClick={() => setTab("style")}>
              <Palette size={12} />
              {t("tabs.styleCount", { count: stylePrompts.length })}
            </TabButton>
            <TabButton active={tab === "content"} onClick={() => setTab("content")}>
              <Sparkles size={12} />
              {t("tabs.contentCount", { count: contentPrompts.length })}
            </TabButton>
          </div>

          <div className="flex items-center gap-1.5">
            {SOURCE_FILTER_IDS.map((id) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full transition-colors",
                  filter === id
                    ? "bg-slate-800 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                {id === "all"
                  ? t("filters.all")
                  : id === "builtin"
                  ? t("filters.builtin")
                  : t("filters.ai")}
              </button>
            ))}
            {tab === "content" && (
              <button
                onClick={refreshAiContent}
                disabled={refreshing}
                title={t("regenBatchTitle")}
                className="text-xs px-3 py-1.5 rounded-full bg-white border border-dashed border-slate-300 text-slate-600 hover:bg-amber-50 hover:border-amber-400 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {refreshing ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <RefreshCw size={11} />
                )}
                {t("regenBatch")}
              </button>
            )}
          </div>
        </div>

        {tab === "style" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <button
              onClick={() => setShowNewStyle(true)}
              className="rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/50 hover:bg-purple-50 hover:border-purple-400 p-4 flex flex-col items-center justify-center gap-2 text-purple-700 min-h-[180px]"
            >
              <Plus size={22} />
              <span className="text-sm font-semibold">{t("newStyle")}</span>
            </button>
            {stylePrompts.map((s) => (
              <StyleCard
                key={s.id}
                style={s}
                selected={s.id === selectedStyleId}
                onClick={() => setPreviewStyle(s)}
                onDelete={
                  s.source === "builtin"
                    ? undefined
                    : () => {
                        deleteStylePrompt(s.id);
                        if (s.id === selectedStyleId) setSelectedStyleId(undefined);
                        setVersion((v) => v + 1);
                      }
                }
              />
            ))}
            {stylePrompts.length === 0 && filter !== "all" && (
              <EmptyHint kind="style" filter={filter} />
            )}
          </div>
        ) : contentPrompts.length === 0 ? (
          <EmptyHint kind="content" filter={filter} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {contentPrompts.map((p) => (
              <ContentCard
                key={p.id}
                prompt={p}
                disabled={status.kind === "generating"}
                onPick={() => {
                  setInput(p.prompt);
                  // 平滑滚到顶部，让用户看见输入框
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onDelete={
                  p.source !== "builtin"
                    ? () => {
                        deleteContentPrompt(p.id);
                        setVersion((v) => v + 1);
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>

      {showSettings && <ProviderSettingsDialog onClose={() => setShowSettings(false)} />}
      {showImageLibrary && <ImageLibraryDialog onClose={() => setShowImageLibrary(false)} />}
      {showHistory && <HistoryDialog onClose={() => setShowHistory(false)} />}
      {showStorage && <StorageDialog onClose={() => setShowStorage(false)} />}
      {previewStyle && (
        <StylePreviewDialog
          style={previewStyle}
          selected={previewStyle.id === selectedStyleId}
          onClose={() => setPreviewStyle(null)}
          onUse={() => {
            setSelectedStyleId(previewStyle.id);
            setPreviewStyle(null);
          }}
        />
      )}
      {showNewStyle && (
        <NewStyleDialog
          onClose={() => setShowNewStyle(false)}
          onSaved={(saved) => {
            setSelectedStyleId(saved.id);
            setVersion((v) => v + 1);
            // 新建保存的风格统一归入「AI 生成」tab，自动切到该筛选让用户看到刚保存的项
            setFilter("ai-generated");
            setShowNewStyle(false);
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-xs px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 transition-colors",
        active ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
      )}
    >
      {children}
    </button>
  );
}

function EmptyHint({
  kind,
  filter,
}: {
  kind: "style" | "content";
  filter: PromptSource | "all";
}) {
  const { t } = useTranslation("home");
  let msg = "";
  if (kind === "style") {
    msg =
      filter === "ai-generated"
        ? t("empty.aiStyle")
        : filter === "builtin"
        ? t("empty.builtinStyle")
        : t("empty.style");
  } else {
    msg = t("empty.content");
  }
  return <div className="text-center py-12 text-sm text-slate-500">{msg}</div>;
}

function ContentCard({
  prompt,
  disabled,
  onPick,
  onDelete,
}: {
  prompt: ContentPrompt;
  disabled?: boolean;
  onPick: () => void;
  onDelete?: () => void;
}) {
  const { t: tCard } = useTranslation("home");
  const { t: tCommon } = useTranslation("common");
  const sourceTag =
    prompt.source === "builtin"
      ? null
      : prompt.source === "ai-generated"
      ? { label: "AI", cls: "bg-amber-50 text-amber-700 border-amber-200" }
      : { label: <Bookmark size={9} />, cls: "bg-blue-50 text-blue-700 border-blue-200" };

  return (
    <button
      onClick={onPick}
      disabled={disabled}
      title={tCard("card.useTip")}
      className="group text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-400 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="text-sm font-semibold text-slate-800 line-clamp-1">{prompt.title}</h3>
        <div className="flex items-center gap-1 flex-shrink-0">
          {sourceTag && (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center", sourceTag.cls)}>
              {sourceTag.label}
            </span>
          )}
          {onDelete && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDelete();
              }}
              className="hidden group-hover:inline-flex p-1 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              title={tCommon("actions.delete")}
            >
              <Trash2 size={10} />
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">{prompt.prompt}</p>
      <div className="flex items-center justify-between mt-2 gap-2">
        {prompt.durationMs ? (
          <span className="text-[10px] text-slate-400">{formatDuration(prompt.durationMs)}</span>
        ) : <span />}
        <span className="text-[10px] text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
          →
        </span>
      </div>
    </button>
  );
}

// phaseLabel + formatBytes 已抽到 @/lib/phaseLabel 共用

// 已等待秒数 hook（与 ChatPanel 同款）
function useElapsedSeconds(): number {
  const [, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    startRef.current = Date.now();
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.floor((Date.now() - startRef.current) / 1000);
}

function ProgressBar({
  status,
  streamingMode,
  streamingSlideCount,
}: {
  status: { phase: ProgressEvent["kind"]; current: number; estimate: number; bytes?: number; batch?: BatchInfo; modelName?: string; promptInfo?: PromptInfo };
  streamingMode: boolean;
  streamingSlideCount: number;
}) {
  const { t: tChat } = useTranslation("chat");
  const elapsed = useElapsedSeconds();
  const indeterminate = !streamingMode && status.phase !== "page";
  // 进度比例：分批模式下 streamingSlideCount 已是全局已生成页数（applyStreamingBatch 累积），保单调
  const ratio = streamingMode
    ? Math.min(100, (streamingSlideCount / Math.max(1, status.estimate)) * 100)
    : status.phase === "page"
    ? Math.min(100, (status.current / Math.max(1, status.estimate)) * 100)
    : 30;
  return (
    <div className="mt-3 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200">
      <div className="flex items-center justify-between text-xs text-blue-800 mb-1.5">
        <span className="font-medium flex-1">
          {phaseLabel(status.phase, status.current, status.estimate, streamingMode, streamingSlideCount, status.bytes, status.batch)}
        </span>
        {status.modelName && (
          <span
            className="ml-2 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium border border-blue-200 max-w-[160px] truncate"
            title={tChat("modelBadge.active", { model: status.modelName })}
          >
            {status.modelName}
          </span>
        )}
        {status.promptInfo && (
          <span className="ml-2">
            <PromptSizeChip
              info={status.promptInfo}
              isBatch={!!status.batch}
              className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium border border-blue-200 cursor-help tabular-nums"
            />
          </span>
        )}
        <span className="tabular-nums text-blue-600 ml-2">
          {elapsed}s
        </span>
        {!streamingMode && status.phase === "page" && (
          <span className="tabular-nums text-blue-600 ml-2">
            {status.current} / {status.estimate}
          </span>
        )}
      </div>
      <div className="relative w-full h-1.5 rounded-full bg-blue-100 overflow-hidden">
        <div
          className={
            indeterminate
              ? "absolute inset-y-0 left-0 w-1/4 bg-blue-500 rounded-full hxs-progress-flow"
              : "absolute inset-y-0 left-0 bg-blue-500 rounded-full transition-[width] duration-300"
          }
          style={indeterminate ? undefined : { width: `${ratio}%` }}
        />
      </div>
      {status.estimate > 0 && (
        // generated 双源 max：streamingSlideCount 与 status.current 任一推动都能让矩阵动
        <SlideGridProgress
          className="mt-2"
          total={status.estimate}
          generated={Math.max(streamingMode ? streamingSlideCount : 0, status.current ?? 0)}
          batch={status.batch}
          phase={status.phase}
        />
      )}
      {(status.phase === "connecting" || status.phase === "thinking") && (
        <p className="text-[11px] text-blue-700/70 mt-1.5 leading-relaxed">
          {elapsed < 5
            ? tChat("elapsed.earlyHint")
            : elapsed < 15
            ? tChat("elapsed.midHint")
            : elapsed < 45
            ? tChat("elapsed.longHint")
            : tChat("elapsed.veryLongHint")}
        </p>
      )}
    </div>
  );
}

function loadMagicMoveDemo(
  loadDeck: (d: Deck) => void,
  setConvId: (id: string | undefined) => void
) {
  const example = getCurrentLang() === "en" ? magicMoveEn : magicMoveZh;
  const result = DeckSchema.safeParse(example);
  if (!result.success) return;
  const conv = {
    id: nanoid(10),
    title: result.data.meta.title,
    deck: result.data,
    messages: [
      {
        role: "assistant" as const,
        text: "已加载 Magic Move 示范 deck。按 → 切页观察 Lumen 标题、副标题、徽章如何在页面间飞行。",
        timestamp: Date.now(),
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  upsertConversation(conv);
  setConvId(conv.id);
  loadDeck(result.data);
}

// 失败时把错误也保存到历史会话，让用户在「历史」里看到曾失败的输入与具体错误
function saveErrorConversation(
  userText: string,
  styleName: string | undefined,
  errorMessage: string,
  startedAt: number,
) {
  const conv = {
    id: nanoid(10),
    title: `[失败] ${userText.slice(0, 26)}`,
    // deck 字段省略：失败的会话没有可加载的 deck
    messages: [
      {
        role: "user" as const,
        text: (styleName ? `[风格：${styleName}] ` : "") + userText,
        timestamp: Date.now(),
      },
      {
        role: "error" as const,
        text: errorMessage,
        timestamp: Date.now(),
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    durationMs: Date.now() - startedAt,
  };
  upsertConversation(conv);
}

function ActiveModelBadge() {
  const { t } = useTranslation("chat");
  const cfg = getActiveModelConfig();
  if (!cfg) {
    return (
      <span
        className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200"
        title={t("modelBadge.notActiveTitle")}
      >
        {t("modelBadge.notActive")}
      </span>
    );
  }
  return (
    <span
      className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
      title={`${cfg.name} · ${PROVIDER_LABELS[cfg.provider]}`}
    >
      {cfg.model}
    </span>
  );
}
