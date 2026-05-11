import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Wand2, Loader2, Eye, Save, Check, Image as ImageIcon, Upload } from "lucide-react";
import { generateStyleDefinition } from "@/llm/styleGenerator";
import { hasValidConfig, getActiveModelConfig } from "@/llm/settings";
import {
  addUserSavedStylePrompt,
  type StylePrompt,
} from "@/data/stylePrompts";
import { StyleCover } from "./StyleCard";
import { StylePreviewDialog } from "./StylePreviewDialog";
import { ProviderSettingsDialog } from "./ProviderSettingsDialog";
import { cn } from "@/lib/cn";

type Status =
  | { kind: "idle" }
  | { kind: "generating"; modelName?: string }
  | { kind: "ready"; style: StylePrompt }
  | { kind: "error"; message: string };

export function NewStyleDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (style: StylePrompt) => void;
}) {
  const { t } = useTranslation("dialog");
  const [brief, setBrief] = useState("");
  const [images, setImages] = useState<string[]>([]); // 参考图片 base64 dataURL，最多 3 张
  const [imageError, setImageError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_IMAGES = 3;
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB / 张

  // 文字描述 ≥ 5 字 或 至少有 1 张图片
  const canGenerate =
    (brief.trim().length >= 5 || images.length > 0) && status.kind !== "generating";

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImageError(null);
    const remain = MAX_IMAGES - images.length;
    const accepted = Array.from(files).slice(0, remain);
    if (accepted.length < files.length) {
      setImageError(t("newStyle.imageError.tooMany", { max: MAX_IMAGES }));
    }
    const next: string[] = [];
    for (const f of accepted) {
      if (!f.type.startsWith("image/")) {
        setImageError(t("newStyle.imageError.notImage", { name: f.name }));
        continue;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        setImageError(t("newStyle.imageError.tooLarge", { name: f.name }));
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
    // 同一图片再次选择能触发 onChange
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setImageError(null);
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    if (!hasValidConfig()) {
      setShowSettings(true);
      return;
    }
    // 命中模型按当前是否带图片走对应路由场景，与 generateStyleDefinition 内部一致
    const hasImg = images.length > 0;
    const activeModel = getActiveModelConfig(hasImg ? "image-recognition" : undefined);
    setStatus({ kind: "generating", modelName: activeModel?.name });
    const startedAt = Date.now();
    const result = await generateStyleDefinition({ brief: brief.trim(), images });
    if (result.error || !result.theme) {
      setStatus({ kind: "error", message: result.error ?? t("newStyle.errorFallback") });
      return;
    }
    // styleInstructions 优先用 LLM 输出（含图片识别+文字综合提取）；纯文字模式回退到用户原文
    const finalInstructions =
      result.styleInstructions?.trim() ||
      brief.trim() ||
      t("newStyle.draft.fallbackInstructions");
    const style: StylePrompt = {
      id: "draft-" + Date.now(),
      name: result.name?.trim() || t("newStyle.draft.fallbackName"),
      description: result.description?.trim() || (brief.trim().slice(0, 30) || t("newStyle.draft.fallbackDescription")),
      emoji: result.emoji ?? "◐",
      theme: result.theme,
      styleInstructions: finalInstructions,
      source: "user-saved",
      createdAt: Date.now(),
      durationMs: Date.now() - startedAt,
    };
    setStatus({ kind: "ready", style });
  };

  // 在右侧 ReadyView 中允许用户修改 name / description；写回 status.style
  const updateStyleField = (field: "name" | "description", value: string) => {
    setStatus((prev) => {
      if (prev.kind !== "ready") return prev;
      return { kind: "ready", style: { ...prev.style, [field]: value } };
    });
  };

  const handleSave = () => {
    if (status.kind !== "ready") return;
    const saved = addUserSavedStylePrompt({
      name: status.style.name,
      description: status.style.description,
      emoji: status.style.emoji,
      theme: status.style.theme,
      styleInstructions: status.style.styleInstructions,
      durationMs: status.style.durationMs,
    });
    setSavedFlash(true);
    setTimeout(() => {
      onSaved(saved);
    }, 800);
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/55 flex items-center justify-center z-50 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[860px] max-w-full max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Wand2 size={18} className="text-purple-600" />
            <h2 className="text-lg font-semibold">{t("newStyle.title")}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 flex min-h-0">
          {/* 左：仅一段提示词 + AI 一键生成；风格名/描述/emoji/主题色由 AI 自动产出 */}
          <aside className="w-[400px] border-r border-slate-200 overflow-auto p-5 flex-shrink-0 space-y-4">
            <FormField
              label={t("newStyle.briefLabel")}
              required
              hint={t("newStyle.briefHint")}
            >
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder={t("newStyle.briefPlaceholder")}
                rows={6}
                className={cn(inputCls, "resize-none min-h-[150px]")}
              />
            </FormField>

            {/* 参考图片：可选，最多 3 张，用 base64 内嵌发给视觉模型识别 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-700 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <ImageIcon size={12} />
                  {t("newStyle.imagesLabel", { max: MAX_IMAGES })}
                </span>
                <span className="text-[10px] text-slate-400 font-normal">
                  {t("newStyle.imagesHint")}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {images.map((url, i) => (
                  <div
                    key={i}
                    className="relative aspect-square rounded border border-slate-200 overflow-hidden bg-slate-50 group"
                  >
                    <img src={url} alt={t("newStyle.imagesLabel", { max: MAX_IMAGES })} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      title={t("newStyle.actions.cancel")}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {images.length < MAX_IMAGES && (
                  <label className="aspect-square flex flex-col items-center justify-center rounded border-2 border-dashed border-slate-300 text-slate-400 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50/30 text-xs gap-1 cursor-pointer transition">
                    <Upload size={16} />
                    <span>{t("newStyle.uploadButton")}</span>
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
              {imageError && (
                <p className="text-[11px] text-amber-700">{imageError}</p>
              )}
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
                  {t("newStyle.generating")}
                </>
              ) : status.kind === "ready" ? (
                <>
                  <Wand2 size={14} />
                  {t("newStyle.regenerate")}
                </>
              ) : (
                <>
                  <Wand2 size={14} />
                  {t("newStyle.generate")}
                </>
              )}
            </button>

            {status.kind === "generating" && status.modelName && (
              <p className="text-[11px] text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1.5 rounded">
                {t("newStyle.modelHint")}<span className="font-medium">{status.modelName}</span>
              </p>
            )}

            <p className="text-[11px] text-slate-500 leading-relaxed">
              {t("newStyle.previewIntroHint")}
            </p>

            {status.kind === "error" && (
              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded whitespace-pre-wrap">
                {status.message}
              </div>
            )}
          </aside>

          {/* 右：预览结果 */}
          <main className="flex-1 min-w-0 overflow-auto p-5 bg-slate-50/50">
            {status.kind === "idle" || status.kind === "error" ? (
              <Placeholder hasError={status.kind === "error"} />
            ) : status.kind === "generating" ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                <Loader2 size={32} className="animate-spin text-purple-500" />
                <p className="text-sm">{t("newStyle.placeholder.generating")}</p>
                {status.modelName && (
                  <p className="text-[11px] text-purple-600">
                    {t("newStyle.placeholder.modelTag")}<span className="font-medium">{status.modelName}</span>
                  </p>
                )}
              </div>
            ) : (
              <ReadyView
                style={status.style}
                onPreview={() => setPreviewOpen(true)}
                onSave={handleSave}
                saved={savedFlash}
                onUpdateField={updateStyleField}
              />
            )}
          </main>
        </div>

        <footer className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded text-slate-600 hover:bg-slate-100"
          >
            {t("newStyle.actions.cancel")}
          </button>
        </footer>
      </div>

      {previewOpen && status.kind === "ready" && (
        <StylePreviewDialog
          style={status.style}
          selected={false}
          onClose={() => setPreviewOpen(false)}
          onUse={() => setPreviewOpen(false)}
        />
      )}
      {showSettings && <ProviderSettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 text-sm border border-slate-200 rounded outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100";

function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-700 mb-1.5 font-medium">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[10px] text-slate-400 mt-1 leading-relaxed">{hint}</span>}
    </label>
  );
}

function Placeholder({ hasError }: { hasError: boolean }) {
  const { t } = useTranslation("dialog");
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8 text-slate-400">
      <Wand2 size={32} className="opacity-40 mb-3" />
      <p className="text-sm font-medium">{hasError ? t("newStyle.placeholder.errorTitle") : t("newStyle.placeholder.idleTitle")}</p>
      <p className="text-xs mt-1.5 max-w-xs">
        {t("newStyle.placeholder.hint")}
      </p>
    </div>
  );
}

function ReadyView({
  style,
  onPreview,
  onSave,
  saved,
  onUpdateField,
}: {
  style: StylePrompt;
  onPreview: () => void;
  onSave: () => void;
  saved: boolean;
  onUpdateField: (field: "name" | "description", value: string) => void;
}) {
  const { t } = useTranslation("dialog");
  return (
    <div className="space-y-4">
      <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <StyleCover style={style} />
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
          {t("newStyle.metaTitle")}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-base">{style.emoji}</span>
          <input
            value={style.name}
            onChange={(e) => onUpdateField("name", e.target.value.slice(0, 16))}
            placeholder={t("newStyle.namePlaceholder")}
            className="flex-1 text-base font-semibold bg-transparent border border-slate-200 rounded px-2 py-1 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
          />
        </div>
        <input
          value={style.description}
          onChange={(e) => onUpdateField("description", e.target.value.slice(0, 60))}
          placeholder={t("newStyle.descriptionPlaceholder")}
          className="w-full text-xs text-slate-600 bg-transparent border border-slate-200 rounded px-2 py-1 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
        />
      </div>

      <div>
        <h4 className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-1.5">
          {t("newStyle.themeColors")}
        </h4>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(style.theme.colors).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-xs bg-white rounded border border-slate-200 px-2 py-1">
              <span
                className="w-4 h-4 rounded border border-slate-200 flex-shrink-0"
                style={{ backgroundColor: v as string }}
              />
              <span className="text-slate-500 w-12">{k}</span>
              <span className="font-mono text-[10px] text-slate-700 truncate">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onPreview}
          className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm px-3 py-2 rounded border border-slate-200 hover:bg-slate-50 text-slate-700"
        >
          <Eye size={14} />
          {t("newStyle.actions.preview")}
        </button>
        <button
          onClick={onSave}
          disabled={saved}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 text-sm px-3 py-2 rounded font-medium",
            saved
              ? "bg-emerald-100 text-emerald-700"
              : "bg-blue-600 text-white hover:bg-blue-700"
          )}
        >
          {saved ? (
            <>
              <Check size={14} />
              {t("newStyle.actions.saved")}
            </>
          ) : (
            <>
              <Save size={14} />
              {t("newStyle.actions.save")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
