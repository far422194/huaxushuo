import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Undo2, Redo2, ChevronLeft, ChevronRight, Plus, Upload, Play, Home as HomeIcon, History as HistoryIcon, Database, LayoutTemplate } from "lucide-react";
import { useEditorStore } from "@/store/editor";
import { LAYOUTS } from "@shared/dsl";
import { cn } from "@/lib/cn";
import { PublishDialog } from "./PublishDialog";
import { HistoryDialog } from "./HistoryDialog";
import { ExtractPromptButton } from "./ExtractPromptDialog";
import { FormSubmissionsDialog } from "./FormSubmissionsDialog";
import { PreviewDialog } from "./PreviewDialog";
import { PatternPicker } from "./PatternPicker";

export function Toolbar() {
  const { t } = useTranslation("editor");
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [patternPickerOpen, setPatternPickerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // 点击新增菜单外部时关闭
  useEffect(() => {
    if (!addOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!addMenuRef.current?.contains(e.target as Node)) {
        setAddOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [addOpen]);
  const setView = useEditorStore((s) => s.setView);
  const setConvId = useEditorStore((s) => s.setCurrentConversationId);
  const deck = useEditorStore((s) => s.deck);
  const currentIndex = useEditorStore((s) => s.currentIndex);
  const setCurrentIndex = useEditorStore((s) => s.setCurrentIndex);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const addSlide = useEditorStore((s) => s.addSlide);

  // 全局快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isEditing) return;

      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        setCurrentIndex(currentIndex + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setCurrentIndex(currentIndex - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, currentIndex, setCurrentIndex]);

  return (
    <div className="h-12 border-b border-slate-200 bg-white flex items-center px-3 gap-1">
      <ToolbarButton
        onClick={() => {
          setConvId(undefined);
          setView("home");
        }}
        title={t("toolbar.back")}
      >
        <HomeIcon size={16} />
      </ToolbarButton>

      <div className="w-px h-5 bg-slate-200 mx-2" />

      <ToolbarButton onClick={undo} disabled={!canUndo} title={`${t("toolbar.undo")} (⌘Z)`}>
        <Undo2 size={16} />
      </ToolbarButton>
      <ToolbarButton onClick={redo} disabled={!canRedo} title={`${t("toolbar.redo")} (⌘⇧Z)`}>
        <Redo2 size={16} />
      </ToolbarButton>

      <div className="w-px h-5 bg-slate-200 mx-2" />

      <ToolbarButton onClick={() => setCurrentIndex(currentIndex - 1)} disabled={currentIndex <= 0} title="←">
        <ChevronLeft size={16} />
      </ToolbarButton>
      <span className="text-xs text-slate-500 px-2 tabular-nums">
        {currentIndex + 1} / {deck.slides.length}
      </span>
      <ToolbarButton
        onClick={() => setCurrentIndex(currentIndex + 1)}
        disabled={currentIndex >= deck.slides.length - 1}
        title="→"
      >
        <ChevronRight size={16} />
      </ToolbarButton>

      <div className="w-px h-5 bg-slate-200 mx-2" />

      <div ref={addMenuRef} className="relative">
        <ToolbarButton onClick={() => setAddOpen((o) => !o)} title={t("toolbar.addSlide")}>
          <Plus size={16} />
          <span className="ml-1 text-xs">{t("toolbar.addSlide")}</span>
        </ToolbarButton>
        {addOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded shadow-lg z-10 min-w-[180px] py-0.5">
            {LAYOUTS.map((l) => (
              <button
                key={l}
                className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-slate-50"
                onClick={() => {
                  addSlide(l);
                  setAddOpen(false);
                }}
              >
                <span className="font-medium text-slate-800">{t(`layout.${l}`)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <ToolbarButton onClick={() => setPatternPickerOpen(true)} title={t("toolbar.history")}>
        <LayoutTemplate size={16} />
      </ToolbarButton>

      <div className="flex-1" />

      <ExtractPromptButton />

      <ToolbarButton onClick={() => setSubmissionsOpen(true)} title={t("toolbar.storage")}>
        <Database size={16} />
      </ToolbarButton>

      <ToolbarButton onClick={() => setHistoryOpen(true)} title={t("toolbar.history")}>
        <HistoryIcon size={16} />
      </ToolbarButton>

      <button
        onClick={() => setPreviewOpen(true)}
        className="ml-1 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
        title={t("toolbar.preview")}
      >
        <Play size={14} />
        {t("toolbar.preview")}
      </button>

      <button
        onClick={() => setPublishOpen(true)}
        className="ml-1 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
        title={t("toolbar.publish")}
      >
        <Upload size={14} />
        {t("toolbar.publish")}
      </button>
      {publishOpen && <PublishDialog onClose={() => setPublishOpen(false)} />}
      {historyOpen && <HistoryDialog onClose={() => setHistoryOpen(false)} />}
      {submissionsOpen && <FormSubmissionsDialog onClose={() => setSubmissionsOpen(false)} />}
      {previewOpen && <PreviewDialog onClose={() => setPreviewOpen(false)} />}
      {patternPickerOpen && <PatternPicker onClose={() => setPatternPickerOpen(false)} />}
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center justify-center px-2 py-1.5 rounded text-slate-600 hover:bg-slate-100",
        disabled && "opacity-30 cursor-not-allowed hover:bg-transparent"
      )}
    >
      {children}
    </button>
  );
}
