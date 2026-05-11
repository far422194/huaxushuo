import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, LayoutTemplate, Trash2, Upload, Download, FolderUp } from "lucide-react";
import { downloadLibrary, parseLibraryImport, applyLibraryImport, type LibraryExport } from "@/data/libraryIo";
import {
  loadAllPatterns,
  loadPatternsBySource,
  deletePattern,
  type Pattern,
  type PatternCategory,
} from "@/data/patterns";
import type { PromptSource } from "@/data/contentPrompts";
import { useEditorStore } from "@/store/editor";
import { Deck } from "@/renderer/Deck";
import { DEFAULT_THEME } from "@shared/dsl";
import { cn } from "@/lib/cn";
import { EnhanceCapabilityDialog } from "./EnhanceCapabilityDialog";
import { ScaleStage } from "./ScaleStage";
import { localizedName, localizedDescription } from "@/data/builtinLabels";

// pattern 缩略图 viewport：用 1280×720 的 16:9 逻辑舞台渲染，再由 ScaleStage 等比缩放到容器尺寸
// 让 hero/title-content 这类按全屏演示设计的内容（heading text-7xl 等）在 200×112 缩略图里也能完整可见
const THUMB_STAGE = { w: 1280, h: 720 };

const CATEGORY_KEYS: Array<PatternCategory | "all"> = [
  "all", "hero", "section", "stat", "list", "compare", "flow", "quote", "cta", "decor",
];

const SOURCE_KEYS: Array<PromptSource | "all"> = ["all", "builtin", "user-saved", "ai-generated"];

export function PatternPicker({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("dialog");
  const [tick, setTick] = useState(0);
  const categoryLabel = (c: PatternCategory | "all") =>
    c === "all" ? t("patternPicker.filter.all") : t(`patternPicker.categories.${c}`);
  const sourceLabel = (s: PromptSource | "all") => {
    if (s === "all") return t("patternPicker.filter.all");
    if (s === "builtin") return t("patternPicker.filter.sourceBuiltin");
    if (s === "user-saved") return t("patternPicker.filter.sourceUser");
    return t("patternPicker.filter.sourceAi");
  };
  const [category, setCategory] = useState<PatternCategory | "all">("all");
  const [source, setSource] = useState<PromptSource | "all">("all");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [importToast, setImportToast] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<LibraryExport | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => setTick((t) => t + 1);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // 同名文件再次选择能触发 onChange
    try {
      const text = await file.text();
      const parsed = parseLibraryImport(text);
      if (!parsed.ok) {
        setImportToast(`${parsed.error}`);
        return;
      }
      // 解析成功 → 先弹确认条让用户选 skip / overwrite，避免静默覆盖
      setPendingImport(parsed.data);
      setImportToast(null);
    } catch (err: any) {
      setImportToast(String(err?.message ?? err));
    }
  };

  const doImport = (mode: "skip" | "overwrite") => {
    if (!pendingImport) return;
    const result = applyLibraryImport(pendingImport, { mode });
    const fmt = (r: { added: number; updated: number; skipped: number }) =>
      mode === "overwrite"
        ? `+${r.added} / overwrite ${r.updated}`
        : `+${r.added}（skip ${r.skipped}）`;
    setImportToast(`pattern ${fmt(result.patterns)} · skill ${fmt(result.skills)}`);
    setPendingImport(null);
    refresh();
  };

  const list = useMemo(() => {
    void tick;
    let l = source === "all" ? loadAllPatterns() : loadPatternsBySource(source);
    if (category !== "all") l = l.filter((p) => p.category === category);
    return l;
  }, [tick, source, category]);

  const selected = useMemo(
    () => list.find((p) => p.id === selectedId) ?? list[0],
    [list, selectedId]
  );

  const insertSlides = useEditorStore((s) => s.insertSlidesAfterCurrent);

  const insert = (p: Pattern) => {
    insertSlides(p.slides);
    onClose();
  };

  const insertAsRef = (p: Pattern) => {
    // 插入仅含 patternRef 引用 + 空 blocks 的轻量 slide，让 LLM 风格的"复用模式"也能在编辑器手动用
    insertSlides([
      {
        id: "",
        layout: p.slides[0]?.layout ?? "title-content",
        transition: "fade",
        patternRef: p.id,
        blocks: [],
      },
    ]);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[1100px] max-w-[95vw] h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <LayoutTemplate size={16} className="text-slate-500" />
            <span>{t("patternPicker.title")}</span>
            <span className="text-xs text-slate-400 font-normal ml-2">
              {t("patternPicker.footerCount", { count: list.length })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadLibrary()}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
              title={t("patternPicker.exportLibTitle")}
            >
              <Download size={12} />
              {t("patternPicker.exportLib")}
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
              title={t("patternPicker.importLibTitle")}
            >
              <FolderUp size={12} />
              {t("patternPicker.importLib")}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImport}
            />
            <button
              onClick={() => setEnhanceOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700"
              title={t("patternPicker.enhanceTitle")}
            >
              <Upload size={12} />
              {t("patternPicker.enhance")}
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100" aria-label={t("publish.footer.cancel")}>
              <X size={16} />
            </button>
          </div>
        </header>
        {pendingImport && (
          <div className="px-5 py-2.5 text-xs bg-blue-50 border-b border-blue-200 flex items-center gap-3">
            <FolderUp size={14} className="text-blue-600 flex-shrink-0" />
            <span className="flex-1 text-blue-900">
              即将导入 <strong>{pendingImport.patterns.length}</strong> 个 pattern + <strong>{pendingImport.skills.length}</strong> 个 skill。如有 id 冲突：
            </span>
            <button
              onClick={() => doImport("skip")}
              className="px-2.5 py-1 rounded bg-white border border-blue-300 text-blue-700 hover:bg-blue-100"
              title={t("patternPicker.importMode.skipTitle")}
            >
              {t("patternPicker.importMode.skip")}
            </button>
            <button
              onClick={() => doImport("overwrite")}
              className="px-2.5 py-1 rounded bg-amber-500 text-white hover:bg-amber-600"
              title={t("patternPicker.importMode.overwriteTitle")}
            >
              {t("patternPicker.importMode.overwrite")}
            </button>
            <button
              onClick={() => setPendingImport(null)}
              className="px-2 py-1 text-blue-600 hover:bg-blue-100 rounded"
            >
              {t("publish.footer.cancel")}
            </button>
          </div>
        )}
        {importToast && (
          <div className="px-5 py-2 text-xs text-emerald-800 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
            <span>{importToast}</span>
            <button
              onClick={() => setImportToast(null)}
              className="text-emerald-600 hover:text-emerald-900"
              aria-label={t("publish.footer.cancel")}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* 筛选条 */}
        <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-slate-400">{t("patternPicker.filter.category")}</span>
            {CATEGORY_KEYS.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "px-2 py-0.5 rounded",
                  category === c ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {categoryLabel(c)}
              </button>
            ))}
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1">
            <span className="text-slate-400">{t("patternPicker.filter.source")}</span>
            {SOURCE_KEYS.map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={cn(
                  "px-2 py-0.5 rounded",
                  source === s ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {sourceLabel(s)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* 左侧网格：一行 4 个缩略图，超出滚动 */}
          <div className="w-[58%] overflow-y-auto p-3 grid grid-cols-4 gap-2">
            {list.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  "group text-left border rounded-md overflow-hidden transition",
                  selected?.id === p.id
                    ? "border-blue-500 ring-2 ring-blue-200"
                    : "border-slate-200 hover:border-slate-300"
                )}
                title={`${localizedName(p, "pattern")} · ${categoryLabel(p.category)}${p.tags.length ? ` · ${p.tags.slice(0, 3).join(" · ")}` : ""}`}
              >
                <div className="aspect-[16/9] bg-slate-50 relative pointer-events-none overflow-hidden">
                  <ScaleStage w={THUMB_STAGE.w} h={THUMB_STAGE.h}>
                    <div className="absolute inset-0">
                      <Deck
                        deck={{
                          version: "1.0",
                          meta: { title: localizedName(p, "pattern"), aspectRatio: "16:9" },
                          theme: { ...DEFAULT_THEME, mode: p.themeHint?.mode ?? "light", colors: { ...DEFAULT_THEME.colors, primary: p.themeHint?.primary ?? DEFAULT_THEME.colors.primary, ...(p.themeHint?.mode === "dark" ? { bg: "#0a0a0a", fg: "#e5e7eb" } : {}) } },
                          variables: {},
                          slides: [{ ...p.slides[0], id: "thumb" }],
                        }}
                        keyboardNav={false}
                        showNavigation={false}
                        transitionMode="sync"
                      />
                    </div>
                  </ScaleStage>
                </div>
                <div className="px-2.5 py-2">
                  <div className="text-[12px] font-medium truncate" style={{ color: "#1e293b" }}>{localizedName(p, "pattern")}</div>
                </div>
              </button>
            ))}
            {list.length === 0 && (
              <div className="col-span-4 text-center text-sm text-slate-500 py-12">
                {t("patternPicker.noResult")}
              </div>
            )}
          </div>

          {/* 右侧详情 */}
          <aside className="flex-1 border-l border-slate-200 flex flex-col">
            {selected ? (
              <>
                <div className="p-5 border-b border-slate-200">
                  <div className="text-base font-semibold mb-1">{localizedName(selected, "pattern")}</div>
                  <div className="text-sm text-slate-600 leading-relaxed">{localizedDescription(selected, "pattern")}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selected.tags.map((t) => (
                      <span key={t} className="text-[11px] px-1.5 py-0.5 bg-slate-100 rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex-1 min-h-[260px] overflow-hidden p-4 bg-slate-50 flex items-center justify-center">
                  <div className="relative aspect-[16/9] w-full max-h-full rounded-md overflow-hidden bg-white shadow-sm pointer-events-none">
                    <ScaleStage w={THUMB_STAGE.w} h={THUMB_STAGE.h}>
                      <div className="absolute inset-0">
                        <Deck
                          deck={{
                            version: "1.0",
                            meta: { title: localizedName(selected, "pattern"), aspectRatio: "16:9" },
                            theme: { ...DEFAULT_THEME, mode: selected.themeHint?.mode ?? "light", colors: { ...DEFAULT_THEME.colors, primary: selected.themeHint?.primary ?? DEFAULT_THEME.colors.primary, ...(selected.themeHint?.mode === "dark" ? { bg: "#0a0a0a", fg: "#e5e7eb" } : {}) } },
                            variables: {},
                            slides: selected.slides.map((s, i) => ({ ...s, id: `prv-${i}` })),
                          }}
                          keyboardNav={false}
                          showNavigation={false}
                          transitionMode="sync"
                        />
                      </div>
                    </ScaleStage>
                  </div>
                </div>
                <footer className="p-4 border-t border-slate-200 flex items-center gap-2 text-xs">
                  <button
                    onClick={() => insert(selected)}
                    className="px-3 py-1.5 bg-slate-900 text-white rounded font-semibold hover:bg-slate-800"
                    title={t("patternPicker.useCopyTitle", { count: selected.slides.length })}
                  >
                    {t("patternPicker.useCopy")}
                  </button>
                  <button
                    onClick={() => insertAsRef(selected)}
                    className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50"
                    title={t("patternPicker.useRefTitle")}
                  >
                    {t("patternPicker.useRef")}
                  </button>
                  {/* 源码 BUILTIN 不能删（id 在源码里）；动态源 user-saved / ai-generated / 之前提升的 builtin 可删 */}
                  {selected.source !== "builtin" || isDynamicBuiltin(selected.id) ? (
                    <button
                      onClick={() => {
                        if (confirm(t("patternPicker.deleteConfirm", { name: localizedName(selected, "pattern") }))) {
                          deletePattern(selected.id);
                          refresh();
                          setSelectedId(undefined);
                        }
                      }}
                      className="ml-auto px-2 py-1 text-rose-700 hover:bg-rose-50 rounded"
                      title={t("patternPicker.delete")}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </footer>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                {t("patternPicker.preview")}
              </div>
            )}
          </aside>
        </div>
      </div>
      {enhanceOpen && (
        <EnhanceCapabilityDialog
          onClose={() => setEnhanceOpen(false)}
          onSaved={() => {
            setEnhanceOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// 用户提升上来的"动态内置"id 以 "p_" 开头（addUserSavedPattern 生成）；源码内置 id 是稳定字符串
function isDynamicBuiltin(id: string): boolean {
  return id.startsWith("p_");
}
