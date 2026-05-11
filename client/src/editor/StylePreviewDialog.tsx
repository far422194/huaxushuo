import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Check, ChevronLeft, ChevronRight, Pencil, Save, RotateCcw, Wand2, Loader2, BookmarkPlus, ExternalLink } from "lucide-react";
import { nanoid } from "nanoid";
import { type StylePrompt, updateUserSavedStylePrompt, getStylePrompt } from "@/data/stylePrompts";
import { localizedName, localizedDescription } from "@/data/builtinLabels";
import { upsertConversation } from "@/data/conversations";
import { useEditorStore } from "@/store/editor";
import { buildSampleDeckWithTheme } from "@/data/sampleDeck";
import { generateStyleSampleDeck } from "@/llm/sampleDeckGenerator";
import { hasValidConfig } from "@/llm/settings";
import type { Deck } from "@shared/dsl";
import { Deck as DeckRenderer } from "@/renderer";
import { cn } from "@/lib/cn";

export function StylePreviewDialog({
  style: initialStyle,
  selected,
  onClose,
  onUse,
}: {
  style: StylePrompt;
  selected: boolean;
  onClose: () => void;
  onUse: () => void;
}) {
  const { t } = useTranslation("dialog");
  // mount 时直接读 localStorage 最新值，避免 Home useMemo 缓存的 stylePrompts 旧值
  // 让保存的 sampleDeck / styleInstructions 修改在下次打开 dialog 时立即可见
  const [style, setStyle] = useState<StylePrompt>(() => getStylePrompt(initialStyle.id) ?? initialStyle);
  // 自定义样板（本次会话内 LLM 生成的）；与已保存的 style.sampleDeck 区分
  const [customSampleDeck, setCustomSampleDeck] = useState<Deck | null>(null);
  const [regenStatus, setRegenStatus] = useState<"idle" | "generating" | "error">("idle");
  const [regenError, setRegenError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const fallbackSample = useMemo(() => buildSampleDeckWithTheme(style.theme), [style.theme]);
  // 优先级：本次会话生成的 customSampleDeck > 风格保存的 sampleDeck > 内置通用样板
  const sampleDeck = customSampleDeck ?? style.sampleDeck ?? fallbackSample;
  const [pageIndex, setPageIndex] = useState(0);

  // 编辑模式（仅 user-saved 风格可编辑指令）
  const editable = style.source === "user-saved";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(style.styleInstructions);

  // 编辑器 store hooks（用于「在编辑器中打开」）
  const loadDeck = useEditorStore((s) => s.loadDeck);
  const setCurrentConversationId = useEditorStore((s) => s.setCurrentConversationId);

  const handleSave = () => {
    // 指令变更同时清掉已保存样板（避免误导：旧样板基于旧指令）
    const next = updateUserSavedStylePrompt(style.id, {
      styleInstructions: draft.trim(),
      sampleDeck: undefined,
    });
    if (next) setStyle(next);
    setEditing(false);
    setCustomSampleDeck(null);
  };

  const handleRegenerate = async () => {
    if (!hasValidConfig()) {
      setRegenError(t("stylePreview.errorNoModel"));
      setRegenStatus("error");
      return;
    }
    setRegenStatus("generating");
    setRegenError(null);
    const result = await generateStyleSampleDeck(style.theme, style.styleInstructions);
    if (result.error || !result.deck) {
      setRegenError(result.error ?? t("stylePreview.errorGenerate"));
      setRegenStatus("error");
      return;
    }
    setCustomSampleDeck(result.deck);
    setPageIndex(0);
    setRegenStatus("idle");
  };

  // 把当前看到的 sampleDeck 保存到当前风格（仅 user-saved 可改；其他源风格走「另存为我的风格」）
  const handleSaveSample = () => {
    if (!customSampleDeck) return;
    if (style.source !== "user-saved") {
      setRegenError(t("stylePreview.errorBuiltinSave"));
      setRegenStatus("error");
      return;
    }
    const next = updateUserSavedStylePrompt(style.id, { sampleDeck: customSampleDeck });
    if (next) {
      setStyle(next);
      setCustomSampleDeck(null); // 已保存，回退由 style.sampleDeck 接管
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    }
  };

  // 把当前 sampleDeck 作为新对话加载到编辑器（用户可继续编辑发布）
  const handleOpenInEditor = () => {
    const conv = {
      id: nanoid(10),
      title: t("stylePreview.sampleTitle", { name: style.name }),
      deck: sampleDeck,
      messages: [
        {
          role: "assistant" as const,
          text: t("stylePreview.openInEditorMessage", { name: style.name }),
          timestamp: Date.now(),
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    upsertConversation(conv);
    setCurrentConversationId(conv.id);
    loadDeck(sampleDeck);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[1100px] max-w-full max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">{style.emoji}</span>
              <h2 className="text-lg font-semibold truncate">{localizedName(style, "style")}</h2>
              {style.source === "builtin" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{t("stylePreview.tagBuiltin")}</span>
              )}
              {style.source === "ai-generated" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{t("stylePreview.tagAi")}</span>
              )}
              {style.source === "user-saved" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{t("stylePreview.tagMine")}</span>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate">{localizedDescription(style, "style")}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 flex-shrink-0">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 flex min-h-0">
          <aside className="w-72 border-r border-slate-200 flex-shrink-0 bg-slate-50/50 flex flex-col min-h-0">
            <div className="px-4 pt-4 pb-2 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                  {t("stylePreview.instructions")}
                </h3>
                {editable && !editing && (
                  <button
                    onClick={() => {
                      setDraft(style.styleInstructions);
                      setEditing(true);
                    }}
                    className="text-[11px] inline-flex items-center gap-1 text-blue-600 hover:underline"
                    title={t("stylePreview.edit")}
                  >
                    <Pencil size={10} />
                    {t("stylePreview.edit")}
                  </button>
                )}
              </div>
              {editing ? (
                <div className="space-y-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={8}
                    className="w-full text-xs leading-relaxed bg-white p-3 rounded border border-blue-300 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-y min-h-[120px] max-h-[280px]"
                    placeholder={t("stylePreview.editPlaceholder")}
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleSave}
                      className="text-xs inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                    >
                      <Save size={11} />
                      {t("stylePreview.save")}
                    </button>
                    <button
                      onClick={() => {
                        setEditing(false);
                        setDraft(style.styleInstructions);
                      }}
                      className="text-xs inline-flex items-center gap-1 px-2.5 py-1 rounded text-slate-600 hover:bg-slate-100"
                    >
                      <RotateCcw size={11} />
                      {t("stylePreview.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded border border-slate-200 whitespace-pre-wrap max-h-40 overflow-auto">
                  {style.styleInstructions || (
                    <span className="text-slate-400 italic">{t("stylePreview.noInstructions")}</span>
                  )}
                </div>
              )}

              {/* 重新生成样板按钮：让 LLM 按当前指令重做右侧 4 页样板 */}
              {!editing && (
                <button
                  onClick={handleRegenerate}
                  disabled={regenStatus === "generating" || !style.styleInstructions}
                  className={cn(
                    "mt-2 w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium",
                    regenStatus === "generating"
                      ? "bg-purple-100 text-purple-700 cursor-wait"
                      : !style.styleInstructions
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "bg-purple-600 text-white hover:bg-purple-700"
                  )}
                  title={t("stylePreview.regenSampleTooltip")}
                >
                  {regenStatus === "generating" ? (
                    <>
                      <Loader2 size={11} className="animate-spin" />
                      {t("stylePreview.regenSampleRunning")}
                    </>
                  ) : (
                    <>
                      <Wand2 size={11} />
                      {customSampleDeck ? t("stylePreview.regenSampleAgain") : t("stylePreview.regenSampleEnabled")}
                    </>
                  )}
                </button>
              )}
              {regenError && (
                <p className="mt-1.5 text-[10px] text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded leading-relaxed">
                  {regenError}
                </p>
              )}
              {customSampleDeck && (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    {style.source === "user-saved" && (
                      <button
                        onClick={handleSaveSample}
                        disabled={savedFlash}
                        className={cn(
                          "flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium",
                          savedFlash
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                        )}
                        title={t("stylePreview.saveSampleTooltip")}
                      >
                        {savedFlash ? (
                          <>
                            <Check size={11} />
                            {t("stylePreview.savedSample")}
                          </>
                        ) : (
                          <>
                            <BookmarkPlus size={11} />
                            {t("stylePreview.saveSample")}
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={handleOpenInEditor}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium border border-slate-200 hover:bg-slate-50 text-slate-700"
                      title={t("stylePreview.openInEditorTooltip")}
                    >
                      <ExternalLink size={11} />
                      {t("stylePreview.openInEditor")}
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setCustomSampleDeck(null);
                      setPageIndex(0);
                    }}
                    className="text-[10px] text-slate-500 hover:underline"
                  >
                    {t("stylePreview.discardSample", {
                      fallback: style.sampleDeck
                        ? t("stylePreview.discardFallbackSaved")
                        : t("stylePreview.discardFallbackBuiltin"),
                    })}
                  </button>
                </div>
              )}
              {!customSampleDeck && style.sampleDeck && (
                <p className="mt-1 text-[10px] text-emerald-700">
                  {t("stylePreview.savedNote")}
                </p>
              )}
            </div>

            <div className="px-4 pb-4 overflow-auto flex-1 min-h-0">
              <h3 className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mt-4 mb-2">
                {t("stylePreview.themeColors")}
              </h3>
              <div className="space-y-1.5">
                {Object.entries(style.theme.colors).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-4 h-4 rounded border border-slate-200 flex-shrink-0"
                      style={{ backgroundColor: v as string }}
                    />
                    <span className="text-slate-500 w-12">{k}</span>
                    <span className="font-mono text-slate-700">{v}</span>
                  </div>
                ))}
              </div>

              <h3 className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mt-4 mb-2">
                {t("stylePreview.fontsTitle")}
              </h3>
              <div className="text-xs text-slate-600 space-y-1">
                <div>{t("stylePreview.heading")}：<span className="font-medium">{style.theme.fonts.heading}</span></div>
                <div>{t("stylePreview.body")}：<span className="font-medium">{style.theme.fonts.body}</span></div>
                <div>{t("stylePreview.radius")}：<span className="font-medium">{style.theme.radius}</span></div>
                <div>{t("stylePreview.mode")}：<span className="font-medium">{style.theme.mode === "dark" ? t("stylePreview.modeDark") : t("stylePreview.modeLight")}</span></div>
              </div>
            </div>
          </aside>

          <main className="flex-1 min-w-0 flex flex-col bg-slate-100">
            <div className="flex-1 min-h-0 flex items-center justify-center p-4 md:p-6">
              <SampleStage>
                <DeckRenderer
                  deck={sampleDeck}
                  controlledIndex={pageIndex}
                  onIndexChange={setPageIndex}
                  keyboardNav={false}
                  showNavigation={false}
                />
              </SampleStage>
            </div>
            <div className="px-4 py-2 border-t border-slate-200 flex items-center justify-between bg-white flex-shrink-0">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                  disabled={pageIndex === 0}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-slate-500 tabular-nums px-1">
                  {pageIndex + 1} / {sampleDeck.slides.length}
                </span>
                <button
                  onClick={() => setPageIndex((i) => Math.min(sampleDeck.slides.length - 1, i + 1))}
                  disabled={pageIndex >= sampleDeck.slides.length - 1}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
              <span className="text-[10px] text-slate-400">{t("stylePreview.stageNote")}</span>
            </div>
          </main>
        </div>

        <footer className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded text-slate-600 hover:bg-slate-100"
          >
            {t("stylePreview.cancel")}
          </button>
          <button
            onClick={onUse}
            className={cn(
              "inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded font-medium",
              selected
                ? "bg-emerald-100 text-emerald-700"
                : "bg-blue-600 text-white hover:bg-blue-700"
            )}
          >
            {selected ? (
              <>
                <Check size={14} />
                {t("stylePreview.useStyleSelected")}
              </>
            ) : (
              t("stylePreview.useStyle")
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

// 样板舞台：固定 1280×720 viewport（16:9）+ 按容器空间等比 transform: scale。
// 这样 deck 内布局的 padding/字号/min-h-full 都按 1280×720 算，内容确定能完整呈现，
// 外层缩放只改变视觉尺寸不改变内部 layout，无需滚动条。
const STAGE_W = 1280;
const STAGE_H = 720;

function SampleStage({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const s = Math.min(rect.width / STAGE_W, rect.height / STAGE_H);
      setScale(s);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full h-full overflow-hidden">
      <div
        className="absolute top-1/2 left-1/2 bg-white shadow-2xl rounded-lg overflow-hidden"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(-50%, -50%) scale(${scale || 1})`,
          transformOrigin: "center center",
          visibility: scale > 0 ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

