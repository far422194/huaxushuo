import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X, Wand2, Loader2, Image as ImageIcon, Upload, Save, AlertTriangle, Plus,
  ChevronDown, ChevronRight, CheckSquare, Square,
} from "lucide-react";
import {
  generateCapability,
  type PatternCandidate,
  type SkillCandidate,
  type CapabilityItem,
} from "@/llm/capabilityGenerator";
import { hasValidConfig, getActiveModelConfig } from "@/llm/settings";
import { addUserSavedPattern, type PatternCategory } from "@/data/patterns";
import { addUserSavedSkill } from "@/data/skills";
import { Deck } from "@/renderer/Deck";
import { DEFAULT_THEME } from "@shared/dsl";
import { ProviderSettingsDialog } from "./ProviderSettingsDialog";
import { ScaleStage } from "./ScaleStage";
import { cn } from "@/lib/cn";

const PREVIEW_STAGE = { w: 1280, h: 720 };

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const CATEGORY_OPTIONS: PatternCategory[] = [
  "hero", "section", "stat", "list",
  "compare", "flow", "quote", "cta", "decor",
];

// item 的 UI 状态：可编辑的 pattern / skill + 用户的勾选 + 折叠态
interface ItemState {
  pattern?: PatternCandidate;
  patternError?: string;
  skill?: SkillCandidate;
  itemError?: string;
  sourceImage?: string;
  savePattern: boolean;
  saveSkill: boolean;
  expanded: boolean;
}

type Status =
  | { kind: "idle" }
  | { kind: "generating"; modelName?: string }
  | { kind: "ready"; items: ItemState[] }
  | { kind: "error"; message: string };

function toItemState(item: CapabilityItem, expanded: boolean): ItemState {
  return {
    pattern: item.pattern,
    patternError: item.patternError,
    skill: item.skill,
    itemError: item.itemError,
    sourceImage: item.sourceImage,
    // 默认勾选可保存项；失败项默认不勾选
    savePattern: !!item.pattern,
    saveSkill: !!item.skill,
    expanded,
  };
}

export function EnhanceCapabilityDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t } = useTranslation("dialog");
  const [brief, setBrief] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canGenerate = images.length > 0 && status.kind !== "generating";

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImageError(null);
    const remain = MAX_IMAGES - images.length;
    const accepted = Array.from(files).slice(0, remain);
    if (accepted.length < files.length) {
      setImageError(t("enhance.imageError.tooMany", { max: MAX_IMAGES }));
    }
    const next: string[] = [];
    for (const f of accepted) {
      if (!f.type.startsWith("image/")) {
        setImageError(t("enhance.imageError.notImage", { name: f.name }));
        continue;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        setImageError(t("enhance.imageError.tooLarge", { name: f.name }));
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(f);
      });
      next.push(dataUrl);
    }
    setImages((prev) => [...prev, ...next].slice(0, MAX_IMAGES));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (idx: number) =>
    setImages((prev) => prev.filter((_, i) => i !== idx));

  const handleGenerate = async () => {
    if (!canGenerate) return;
    if (!hasValidConfig()) {
      setShowSettings(true);
      return;
    }
    const activeModel = getActiveModelConfig("image-recognition");
    if (!activeModel) {
      setStatus({
        kind: "error",
        message: t("enhance.errorNoImageModel"),
      });
      return;
    }
    // 显示真实模型 ID(如 mimo-v2.5-pro)而非用户自定义别名(如"我的 Mimo")
    setStatus({ kind: "generating", modelName: activeModel.model });
    const result = await generateCapability({ brief: brief.trim(), images });
    if (result.error) {
      setStatus({ kind: "error", message: result.error });
      return;
    }
    if (result.items.length === 0) {
      setStatus({ kind: "error", message: t("enhance.errorEmpty") });
      return;
    }
    // 单 item 默认展开；多 item 默认折叠节省空间，第 1 项展开
    const items = result.items.map((it, i) =>
      toItemState(it, result.items.length === 1 || i === 0),
    );
    setStatus({ kind: "ready", items });
  };

  // 状态修改：item 级
  const updateItem = (idx: number, patch: Partial<ItemState>) => {
    setStatus((prev) => {
      if (prev.kind !== "ready") return prev;
      const next = prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
      return { ...prev, items: next };
    });
  };
  const updateItemPattern = (idx: number, fn: (p: PatternCandidate) => PatternCandidate) => {
    setStatus((prev) => {
      if (prev.kind !== "ready") return prev;
      const next = prev.items.map((it, i) =>
        i === idx && it.pattern ? { ...it, pattern: fn(it.pattern) } : it,
      );
      return { ...prev, items: next };
    });
  };
  const updateItemSkill = (idx: number, fn: (s: SkillCandidate) => SkillCandidate) => {
    setStatus((prev) => {
      if (prev.kind !== "ready") return prev;
      const next = prev.items.map((it, i) =>
        i === idx && it.skill ? { ...it, skill: fn(it.skill) } : it,
      );
      return { ...prev, items: next };
    });
  };

  const setAllSave = (savePattern: boolean, saveSkill: boolean) => {
    setStatus((prev) => {
      if (prev.kind !== "ready") return prev;
      const next = prev.items.map((it) => ({
        ...it,
        savePattern: savePattern && !!it.pattern,
        saveSkill: saveSkill && !!it.skill,
      }));
      return { ...prev, items: next };
    });
  };

  const handleSaveSelected = () => {
    if (status.kind !== "ready") return;
    let savedPatternCount = 0;
    let savedSkillCount = 0;
    for (const item of status.items) {
      let savedPatternId: string | undefined;
      if (item.savePattern && item.pattern) {
        const saved = addUserSavedPattern(item.pattern);
        savedPatternId = saved.id;
        savedPatternCount++;
      }
      if (item.saveSkill && item.skill) {
        addUserSavedSkill({
          ...item.skill,
          // 同 item 内 pattern + skill 都保存时绑定 fewshotPatternIds
          fewshotPatternIds: savedPatternId ? [savedPatternId] : [],
        });
        savedSkillCount++;
      }
    }
    if (savedPatternCount === 0 && savedSkillCount === 0) {
      // 什么都没勾选；提示并保留对话框
      return;
    }
    onSaved?.();
    onClose();
  };

  const counts =
    status.kind === "ready"
      ? {
          patterns: status.items.filter((it) => it.savePattern && it.pattern).length,
          skills: status.items.filter((it) => it.saveSkill && it.skill).length,
        }
      : { patterns: 0, skills: 0 };
  const totalToSave = counts.patterns + counts.skills;

  return (
    <div
      className="fixed inset-0 bg-slate-900/55 flex items-center justify-center z-50 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[1100px] max-w-[95vw] h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Wand2 size={18} className="text-purple-600" />
            <h2 className="text-lg font-semibold">{t("enhance.title")}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("publish.footer.cancel")}>
            <X size={18} />
          </button>
        </header>

        {status.kind !== "ready" ? (
          <div className="flex-1 flex min-h-0">
            <aside className="w-[420px] border-r border-slate-200 overflow-auto p-5 flex-shrink-0 space-y-4">
              <div>
                <p className="text-sm text-slate-700 leading-relaxed mb-3">{t("enhance.intro")}</p>
                <ul className="text-xs text-slate-600 space-y-1 ml-4 list-disc">
                  <li>{t("enhance.introPattern")}</li>
                  <li>{t("enhance.introSkill")}</li>
                  <li className="text-slate-500">{t("enhance.introNote")}</li>
                </ul>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-700 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <ImageIcon size={12} />
                    {t("enhance.imagesLabel", { max: MAX_IMAGES })}
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {t("enhance.imagesHint")}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {images.map((url, i) => (
                    <div
                      key={i}
                      className="relative aspect-square rounded border border-slate-200 overflow-hidden bg-slate-50 group"
                    >
                      <img src={url} alt={t("enhance.imagesLabel", { max: MAX_IMAGES })} className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        title={t("enhance.deleteButton")}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {images.length < MAX_IMAGES && (
                    <label className="aspect-square flex flex-col items-center justify-center rounded border-2 border-dashed border-slate-300 text-slate-400 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50/30 text-xs gap-1 cursor-pointer transition">
                      <Upload size={16} />
                      <span>{t("enhance.uploadButton")}</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                {imageError && <p className="text-[11px] text-amber-700">{imageError}</p>}
              </div>

              <div>
                <label className="block text-xs text-slate-700 font-medium mb-1.5">
                  {t("enhance.briefLabel")}
                </label>
                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder={t("enhance.briefPlaceholder")}
                  rows={3}
                  className="w-full text-sm border border-slate-200 rounded px-2.5 py-1.5 resize-none focus:outline-none focus:border-purple-400"
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={cn(
                  "w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm",
                  canGenerate
                    ? "bg-purple-600 text-white hover:bg-purple-700"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                )}
              >
                {status.kind === "generating" ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {t("enhance.generating")}{images.length > 1 ? t("enhance.generatingMulti", { count: images.length }) : ""}
                  </>
                ) : (
                  <>
                    <Wand2 size={14} />
                    {t("enhance.generate")}
                  </>
                )}
              </button>

              {status.kind === "generating" && status.modelName && (
                <p className="text-[11px] text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1.5 rounded">
                  {t("enhance.modelHint")}<span className="font-medium">{status.modelName}</span>
                </p>
              )}

              {status.kind === "error" && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded whitespace-pre-wrap">
                  {status.message}
                </div>
              )}

              <p className="text-[11px] text-slate-500 leading-relaxed">
                {t("enhance.completedHint")}
              </p>
            </aside>

            <main className="flex-1 min-w-0 overflow-auto p-5 bg-slate-50/50 flex items-center justify-center">
              {status.kind === "idle" || status.kind === "error" ? (
                <div className="text-sm text-slate-400 text-center">
                  <ImageIcon size={48} className="mx-auto mb-3 text-slate-300" />
                  {t("enhance.placeholderIdle")}
                </div>
              ) : (
                <div className="text-slate-400 flex flex-col items-center gap-3">
                  <Loader2 size={32} className="animate-spin text-purple-500" />
                  <p className="text-sm">
                    {t("enhance.placeholderRunning", {
                      which: images.length > 1 ? `${images.length} ` : "",
                    })}
                  </p>
                  <p className="text-[11px]">{t("enhance.placeholderNote")}</p>
                </div>
              )}
            </main>
          </div>
        ) : (
          // ready 态：items 列表
          <div className="flex-1 flex min-h-0 flex-col">
            {/* 全局快捷工具栏 */}
            {status.items.length > 1 && (
              <div className="px-5 py-2 border-b border-slate-200 flex items-center gap-2 text-xs flex-shrink-0">
                <span className="text-slate-500">{t("enhance.items.summaryHeader", { count: status.items.length })}</span>
                <span className="text-slate-300 mx-1">|</span>
                <button
                  onClick={() => setAllSave(true, true)}
                  className="px-2 py-1 rounded text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                >
                  <CheckSquare size={12} />{t("enhance.items.selectAll")}
                </button>
                <button
                  onClick={() => setAllSave(false, false)}
                  className="px-2 py-1 rounded text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                >
                  <Square size={12} />{t("enhance.items.selectNone")}
                </button>
                <button
                  onClick={() => setAllSave(true, false)}
                  className="px-2 py-1 rounded text-slate-700 hover:bg-slate-100"
                >
                  {t("enhance.items.onlyPattern")}
                </button>
                <button
                  onClick={() => setAllSave(false, true)}
                  className="px-2 py-1 rounded text-slate-700 hover:bg-slate-100"
                >
                  {t("enhance.items.onlySkill")}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-slate-50/50">
              {status.items.map((item, idx) => (
                <ItemCard
                  key={idx}
                  index={idx}
                  total={status.items.length}
                  item={item}
                  onToggleExpanded={() => updateItem(idx, { expanded: !item.expanded })}
                  onToggleSavePattern={() =>
                    updateItem(idx, { savePattern: !item.savePattern })
                  }
                  onToggleSaveSkill={() =>
                    updateItem(idx, { saveSkill: !item.saveSkill })
                  }
                  onUpdatePattern={(fn) => updateItemPattern(idx, fn)}
                  onUpdateSkill={(fn) => updateItemSkill(idx, fn)}
                />
              ))}
            </div>

            <footer className="px-5 py-3 border-t border-slate-200 flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleSaveSelected}
                disabled={totalToSave === 0}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 rounded font-semibold text-sm",
                  totalToSave > 0
                    ? "bg-purple-600 text-white hover:bg-purple-700"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed",
                )}
                title={totalToSave > 0
                  ? t("enhance.footer.saveTooltip", { patterns: counts.patterns, skills: counts.skills })
                  : t("enhance.footer.saveDisabledTooltip")}
              >
                <Save size={14} />
                {totalToSave > 0
                  ? t("enhance.footer.saveBoth", { patterns: counts.patterns, skills: counts.skills })
                  : t("enhance.footer.saveNone")}
              </button>
              <button
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-sm text-slate-600 hover:bg-slate-100"
              >
                {t("enhance.footer.cancel")}
              </button>
              <button
                onClick={handleGenerate}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded text-sm text-purple-700 hover:bg-purple-50"
                title={t("enhance.footer.regenerateTooltip")}
              >
                <Wand2 size={14} />
                {t("enhance.footer.regenerate")}
              </button>
            </footer>
          </div>
        )}

        {showSettings && <ProviderSettingsDialog onClose={() => setShowSettings(false)} />}
      </div>
    </div>
  );
}

// 单个识别结果卡片：折叠态显示标题 + 缩略图 + 复选框；展开态显示完整 pattern + skill 编辑
function ItemCard({
  index,
  total,
  item,
  onToggleExpanded,
  onToggleSavePattern,
  onToggleSaveSkill,
  onUpdatePattern,
  onUpdateSkill,
}: {
  index: number;
  total: number;
  item: ItemState;
  onToggleExpanded: () => void;
  onToggleSavePattern: () => void;
  onToggleSaveSkill: () => void;
  onUpdatePattern: (fn: (p: PatternCandidate) => PatternCandidate) => void;
  onUpdateSkill: (fn: (s: SkillCandidate) => SkillCandidate) => void;
}) {
  const { t } = useTranslation("dialog");
  const hasPattern = !!item.pattern;
  const hasSkill = !!item.skill;
  const fullyFailed = !hasPattern && !hasSkill;

  return (
    <section
      className={cn(
        "rounded-lg border bg-white overflow-hidden",
        fullyFailed
          ? "border-rose-200"
          : item.expanded
          ? "border-purple-300 shadow-sm"
          : "border-slate-200",
      )}
    >
      {/* 卡片头：标题 + 缩略图 + 复选框 */}
      <header
        className="px-3 py-2.5 flex items-center gap-3 cursor-pointer select-none hover:bg-slate-50"
        onClick={onToggleExpanded}
      >
        <button className="text-slate-400" aria-label={item.expanded ? t("enhance.card.collapse") : t("enhance.card.expand")}>
          {item.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {item.sourceImage && (
          <img
            src={item.sourceImage}
            alt={t("enhance.card.indexLabel", { index: index + 1, total })}
            className="w-12 h-12 rounded object-cover border border-slate-200 flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold flex items-center gap-2">
            <span>{t("enhance.card.indexLabel", { index: index + 1, total })}</span>
            {fullyFailed && (
              <span className="text-[11px] text-rose-700 inline-flex items-center gap-1">
                <AlertTriangle size={12} />
                {t("enhance.card.failed")}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {item.pattern?.name || item.skill?.name || item.itemError || t("enhance.card.noProduct")}
          </div>
        </div>

        {/* 复选框：保存 pattern / 保存 skill */}
        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={item.savePattern}
            disabled={!hasPattern}
            onChange={onToggleSavePattern}
            label={t("enhance.card.patternLabel")}
            color="purple"
            invalid={!!item.patternError}
          />
          <Checkbox
            checked={item.saveSkill}
            disabled={!hasSkill}
            onChange={onToggleSaveSkill}
            label={t("enhance.card.skillLabel")}
            color="emerald"
          />
        </div>
      </header>

      {/* 展开态详情 */}
      {item.expanded && (
        <div className="border-t border-slate-100">
          {item.itemError && (
            <div className="px-4 py-3 bg-rose-50 border-b border-rose-200 text-xs text-rose-800 whitespace-pre-wrap">
              {item.itemError}
            </div>
          )}

          <div className="flex">
            {/* 左：pattern 区 */}
            <div className="w-[52%] border-r border-slate-100 p-4 space-y-3">
              <div className="text-xs font-semibold text-purple-700">{t("enhance.card.patternHeader")}</div>
              {item.patternError && !item.pattern ? (
                <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded p-2 flex gap-2">
                  <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium">{t("enhance.card.patternErrorTitle")}</div>
                    <div className="text-[11px] mt-1">{item.patternError}</div>
                  </div>
                </div>
              ) : item.pattern ? (
                <>
                  <div className="relative aspect-[16/9] rounded-md overflow-hidden bg-white shadow-sm border border-slate-200 pointer-events-none">
                    <ScaleStage w={PREVIEW_STAGE.w} h={PREVIEW_STAGE.h}>
                      <div className="absolute inset-0">
                        <Deck
                          deck={{
                            version: "1.0",
                            meta: { title: item.pattern.name, aspectRatio: "16:9" },
                            theme: {
                              ...DEFAULT_THEME,
                              mode: item.pattern.themeHint?.mode ?? "light",
                              colors: {
                                ...DEFAULT_THEME.colors,
                                primary: item.pattern.themeHint?.primary ?? DEFAULT_THEME.colors.primary,
                                ...(item.pattern.themeHint?.mode === "dark"
                                  ? { bg: "#0a0a0a", fg: "#e5e7eb" }
                                  : {}),
                              },
                            },
                            variables: {},
                            slides: item.pattern.slides.map((s, i) => ({ ...s, id: `prv-${index}-${i}` })),
                          }}
                          keyboardNav={false}
                          showNavigation={false}
                          transitionMode="sync"
                        />
                      </div>
                    </ScaleStage>
                  </div>
                  <div className="space-y-2">
                    <Field label={t("enhance.fields.name")}>
                      <input
                        value={item.pattern.name}
                        onChange={(e) => onUpdatePattern((p) => ({ ...p, name: e.target.value }))}
                        className={inputCls}
                      />
                    </Field>
                    <Field label={t("enhance.fields.description")}>
                      <input
                        value={item.pattern.description}
                        onChange={(e) => onUpdatePattern((p) => ({ ...p, description: e.target.value }))}
                        className={inputCls}
                      />
                    </Field>
                    <Field label={t("enhance.fields.category")}>
                      <select
                        value={item.pattern.category}
                        onChange={(e) => onUpdatePattern((p) => ({ ...p, category: e.target.value as PatternCategory }))}
                        className={inputCls}
                      >
                        {CATEGORY_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {t(`enhance.categoryOptions.${c}`)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t("enhance.fields.tags")}>
                      <ChipEditor
                        values={item.pattern.tags}
                        onChange={(tags) => onUpdatePattern((p) => ({ ...p, tags }))}
                      />
                    </Field>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-400">{t("enhance.card.noPattern")}</div>
              )}
            </div>

            {/* 右：skill 区 */}
            <div className="flex-1 min-w-0 p-4 space-y-3">
              <div className="text-xs font-semibold text-emerald-700">{t("enhance.card.skillHeader")}</div>
              {item.skill ? (
                <div className="space-y-2">
                  <Field label={t("enhance.fields.name")}>
                    <input
                      value={item.skill.name}
                      onChange={(e) => onUpdateSkill((s) => ({ ...s, name: e.target.value }))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label={t("enhance.fields.description")}>
                    <input
                      value={item.skill.description}
                      onChange={(e) => onUpdateSkill((s) => ({ ...s, description: e.target.value }))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label={t("enhance.fields.triggers")}>
                    <ChipEditor
                      values={item.skill.triggers}
                      onChange={(triggers) => onUpdateSkill((s) => ({ ...s, triggers }))}
                    />
                  </Field>
                  <Field label={t("enhance.fields.systemAddon")}>
                    <textarea
                      value={item.skill.systemAddon}
                      onChange={(e) => onUpdateSkill((s) => ({ ...s, systemAddon: e.target.value }))}
                      rows={8}
                      className={cn(inputCls, "resize-y font-mono text-[11px] leading-relaxed")}
                    />
                  </Field>
                  <Field label={t("enhance.fields.recommendBlocks")}>
                    <ChipEditor
                      values={item.skill.recommendBlocks}
                      onChange={(v) => onUpdateSkill((s) => ({ ...s, recommendBlocks: v }))}
                    />
                  </Field>
                  <Field label={t("enhance.fields.recommendUtilities")}>
                    <ChipEditor
                      values={item.skill.recommendUtilities}
                      onChange={(v) => onUpdateSkill((s) => ({ ...s, recommendUtilities: v }))}
                    />
                  </Field>
                </div>
              ) : (
                <div className="text-xs text-slate-400">{t("enhance.card.noSkill")}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Checkbox({
  checked,
  disabled,
  onChange,
  label,
  color,
  invalid,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
  color: "purple" | "emerald";
  invalid?: boolean;
}) {
  const { t } = useTranslation("dialog");
  const colorCls =
    color === "purple"
      ? "text-purple-600 border-purple-300 bg-purple-50"
      : "text-emerald-700 border-emerald-300 bg-emerald-50";
  const offCls = "text-slate-400 border-slate-200 bg-white";
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      title={
        disabled
          ? t("enhance.card.checkboxNoneTitle", { label })
          : invalid
          ? t("enhance.card.checkboxInvalidTitle", { label })
          : t("enhance.card.checkboxSaveTitle", { label })
      }
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-medium transition",
        disabled
          ? "border-slate-200 text-slate-300 bg-slate-50 cursor-not-allowed"
          : checked
          ? colorCls
          : offCls,
      )}
    >
      {checked ? <CheckSquare size={12} /> : <Square size={12} />}
      <span>{label}</span>
    </button>
  );
}

const inputCls = "w-full text-sm border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-purple-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-slate-600 font-medium mb-1">{label}</span>
      {children}
    </label>
  );
}

// 简单 chip 编辑器：列出现有项 + 末尾输入框；回车 / 失焦 / 逗号触发新增
function ChipEditor({
  values,
  onChange,
  maxLen = 16,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  maxLen?: number;
}) {
  const { t } = useTranslation("dialog");
  const [draft, setDraft] = useState("");
  const commit = () => {
    const v = draft.trim().slice(0, maxLen);
    if (!v || values.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 border border-slate-200 rounded px-2 py-1.5 min-h-[34px] focus-within:border-purple-400">
      {values.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-slate-100 rounded"
        >
          {v}
          <button
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="text-slate-400 hover:text-rose-600"
            title={t("enhance.chip.delete")}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={values.length === 0 ? t("enhance.chip.placeholder") : ""}
        className="flex-1 min-w-[80px] text-xs outline-none bg-transparent"
      />
      {draft.trim() && (
        <button
          onClick={commit}
          className="text-purple-600 hover:bg-purple-50 rounded p-0.5"
          title={t("enhance.chip.add")}
        >
          <Plus size={12} />
        </button>
      )}
    </div>
  );
}
