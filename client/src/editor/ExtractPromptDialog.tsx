import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  ScanText,
  Loader2,
  RefreshCw,
  Check,
  AlertCircle,
  Bookmark,
} from "lucide-react";
import { useEditorStore } from "@/store/editor";
import { extractContentPrompt } from "@/llm/promptExtractor";
import { hasValidConfig } from "@/llm/settings";
import { addUserSavedContentPrompt } from "@/data/contentPrompts";
import { ProviderSettingsDialog } from "./ProviderSettingsDialog";
import { cn } from "@/lib/cn";

type Status =
  | { kind: "idle" }
  | { kind: "extracting" }
  | { kind: "ready"; title: string; prompt: string }
  | { kind: "error"; message: string };

export function ExtractPromptDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("dialog");
  const deck = useEditorStore((s) => s.deck);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // 进入即自动尝试一次
  useEffect(() => {
    if (status.kind === "idle") {
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    if (!hasValidConfig()) {
      setShowSettings(true);
      setStatus({ kind: "idle" });
      return;
    }
    setStatus({ kind: "extracting" });
    const result = await extractContentPrompt(deck);
    if (result.error || !result.title || !result.prompt) {
      setStatus({ kind: "error", message: result.error ?? t("extractPrompt.errorFallback") });
      return;
    }
    setTitle(result.title);
    setPrompt(result.prompt);
    setStatus({ kind: "ready", title: result.title, prompt: result.prompt });
  };

  const save = () => {
    if (!title.trim() || !prompt.trim()) return;
    addUserSavedContentPrompt({ title: title.trim(), prompt: prompt.trim() });
    setSavedFlash(true);
    setTimeout(() => onClose(), 800);
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[640px] max-w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <ScanText size={18} className="text-emerald-600" />
            <h2 className="text-lg font-semibold">{t("extractPrompt.title")}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </header>

        <div className="px-5 py-4 overflow-auto flex-1">
          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 mb-4 text-xs text-slate-600">
            <span className="font-medium text-slate-800">
              {deck.meta.title || t("publish.summary.untitled")}
            </span>
            <span className="text-slate-400 mx-1">·</span>
            <span>{t("extractPrompt.summarySlides", { count: deck.slides.length })}</span>
            <span className="text-slate-400 mx-1">·</span>
            <span>{t("extractPrompt.summaryHint")}</span>
          </div>

          {status.kind === "extracting" && (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500 gap-3">
              <Loader2 size={28} className="animate-spin text-emerald-500" />
              <p className="text-sm">{t("extractPrompt.extracting")}</p>
            </div>
          )}

          {status.kind === "error" && (
            <div className="space-y-3">
              <div className="flex gap-2 p-3 rounded border border-rose-200 bg-rose-50 text-rose-700">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <pre className="text-xs whitespace-pre-wrap font-sans flex-1">
                  {status.message}
                </pre>
              </div>
              <button
                onClick={run}
                className="text-sm px-4 py-1.5 rounded border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-1.5"
              >
                <RefreshCw size={12} />
                {t("extractPrompt.retry")}
              </button>
            </div>
          )}

          {status.kind === "ready" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-700 mb-1.5 font-medium">
                  {t("extractPrompt.frameTitle")}
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={16}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-700 mb-1.5 font-medium">
                  {t("extractPrompt.frameInstructions")}
                  <span className="text-slate-400 ml-1 font-normal">
                    {t("extractPrompt.frameInstructionsHint")}
                  </span>
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 resize-y font-mono"
                />
              </div>
              <div className="flex justify-between items-center pt-1">
                <button
                  onClick={run}
                  className="text-xs px-3 py-1.5 rounded text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1.5"
                >
                  <RefreshCw size={11} />
                  {t("extractPrompt.regenerate")}
                </button>
                <button
                  onClick={save}
                  disabled={!title.trim() || !prompt.trim() || savedFlash}
                  className={cn(
                    "text-sm px-4 py-1.5 rounded font-medium inline-flex items-center gap-1.5",
                    savedFlash
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                  )}
                >
                  {savedFlash ? (
                    <>
                      <Check size={14} />
                      {t("extractPrompt.saved")}
                    </>
                  ) : (
                    <>
                      <Bookmark size={14} />
                      {t("extractPrompt.save")}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-slate-200 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded text-slate-600 hover:bg-slate-100"
          >
            {status.kind === "ready" ? t("extractPrompt.footerClose") : t("extractPrompt.footerCancel")}
          </button>
        </footer>
      </div>

      {showSettings && (
        <ProviderSettingsDialog
          onClose={() => {
            setShowSettings(false);
            void run();
          }}
        />
      )}
    </div>
  );
}

export function ExtractPromptButton({ className }: { className?: string }) {
  const { t } = useTranslation("dialog");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={t("extractPrompt.buttonTooltip")}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded text-slate-600 hover:bg-slate-100",
          className
        )}
      >
        <ScanText size={14} />
        {t("extractPrompt.buttonTitle")}
      </button>
      {open && <ExtractPromptDialog onClose={() => setOpen(false)} />}
    </>
  );
}
