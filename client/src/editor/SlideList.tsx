import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Trash2, MoveUp, MoveDown, GripVertical } from "lucide-react";
import type { Slide, Theme } from "@shared/dsl";
import { useEditorStore } from "@/store/editor";
import { Deck } from "@/renderer/Deck";
import { ScaleStage } from "./ScaleStage";
import { getPattern } from "@/data/patterns";
import { cn } from "@/lib/cn";

// 缩略图 viewport：1280×720 逻辑舞台 → ScaleStage 等比缩放到容器（约 224×126）
// 让 hero/title-content 这类按全屏演示设计的内容（heading text-7xl 等）在小缩略图里也能完整呈现
const THUMB_STAGE = { w: 1280, h: 720 };

export function SlideList() {
  const { t } = useTranslation("editor");
  const slides = useEditorStore((s) => s.deck.slides);
  const meta = useEditorStore((s) => s.deck.meta);
  const theme = useEditorStore((s) => s.deck.theme);
  const selectedId = useEditorStore((s) => s.selection.slideId);
  const currentIndex = useEditorStore((s) => s.currentIndex);
  const selectSlide = useEditorStore((s) => s.selectSlide);
  const duplicateSlide = useEditorStore((s) => s.duplicateSlide);
  const removeSlide = useEditorStore((s) => s.removeSlide);
  const moveSlide = useEditorStore((s) => s.moveSlide);
  const updateMeta = useEditorStore((s) => s.updateMeta);

  // 拖拽状态：dragFrom 是开始拖动的 slide index；dragOver 是 hover 到的 index
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const handleDrop = (toIdx: number) => {
    if (dragFrom !== null && dragFrom !== toIdx) {
      moveSlide(dragFrom, toIdx);
    }
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <aside className="w-60 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
      <header className="p-3 border-b border-slate-200">
        <input
          value={meta.title}
          onChange={(e) => updateMeta((m) => { m.title = e.target.value; })}
          className="w-full text-sm font-semibold bg-transparent outline-none focus:bg-slate-50 px-1 py-0.5 rounded"
          placeholder={t("toolbar.deckTitlePlaceholder")}
        />
        <p className="text-xs text-slate-500 mt-0.5 px-1">
          {slides.length}
        </p>
      </header>
      <nav className="flex-1 overflow-auto p-2 space-y-2">
        {slides.map((slide, idx) => (
          <SlideThumb
            key={slide.id}
            slide={slide}
            theme={theme}
            index={idx}
            total={slides.length}
            isCurrent={idx === currentIndex}
            isSelected={slide.id === selectedId}
            isDragging={dragFrom === idx}
            isDragOver={dragOver === idx && dragFrom !== null && dragFrom !== idx}
            onSelect={() => selectSlide(slide.id)}
            onDuplicate={(e) => { e.stopPropagation(); duplicateSlide(slide.id); }}
            onRemove={(e) => {
              e.stopPropagation();
              if (slides.length > 1) removeSlide(slide.id);
            }}
            onMoveUp={(e) => { e.stopPropagation(); moveSlide(idx, idx - 1); }}
            onMoveDown={(e) => { e.stopPropagation(); moveSlide(idx, idx + 1); }}
            onDragStart={(e) => {
              setDragFrom(idx);
              e.dataTransfer.effectAllowed = "move";
              // 必须 setData 才能触发 drop 事件
              e.dataTransfer.setData("text/plain", String(idx));
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOver !== idx) setDragOver(idx);
            }}
            onDragLeave={() => {
              if (dragOver === idx) setDragOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(idx);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
          />
        ))}
      </nav>
    </aside>
  );
}

interface ThumbProps {
  slide: Slide;
  theme: Theme;
  index: number;
  total: number;
  isCurrent: boolean;
  isSelected: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onSelect: () => void;
  onDuplicate: (e: React.MouseEvent) => void;
  onRemove: (e: React.MouseEvent) => void;
  onMoveUp: (e: React.MouseEvent) => void;
  onMoveDown: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function SlideThumb(props: ThumbProps) {
  const { t } = useTranslation("editor");
  const { t: tCommon } = useTranslation("common");
  const { slide, theme, index, total, isCurrent, isSelected, isDragging, isDragOver } = props;

  // mini deck：仅含本页，固定 16:9 + 整体 theme；variables 不传（缩略图无交互）
  // useMemo 依赖未变（同一 slide 引用 + 同一 theme 引用）时返回相同对象 → Deck 内部不会重跑 effect
  const miniDeck = useMemo(
    () => ({
      version: "1.0" as const,
      meta: { title: "", aspectRatio: "16:9" as const },
      theme,
      variables: {},
      slides: [{ ...slide, id: "thumb" }],
    }),
    [slide, theme]
  );

  return (
    <div
      onClick={props.onSelect}
      draggable
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      onDragEnd={props.onDragEnd}
      className={cn(
        "relative group cursor-pointer rounded border bg-white overflow-hidden transition-all",
        isCurrent ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-400",
        isSelected && !isCurrent && "border-blue-300",
        isDragging && "opacity-40",
        isDragOver && "border-blue-500 ring-2 ring-blue-300 ring-offset-1"
      )}
    >
      {/* 缩略图主体：真实 Deck 渲染（pointer-events-none 阻止内部交互冒泡） */}
      <div className="aspect-[16/9] relative overflow-hidden bg-slate-50 pointer-events-none">
        <ScaleStage w={THUMB_STAGE.w} h={THUMB_STAGE.h}>
          <div className="absolute inset-0">
            <Deck
              deck={miniDeck}
              keyboardNav={false}
              showNavigation={false}
              transitionMode="sync"
              resolvePattern={getPattern}
            />
          </div>
        </ScaleStage>
      </div>

      {/* 底部序号 + 拖拽手柄 */}
      <div className="px-2 py-1 flex items-center gap-1 text-[10px] font-medium text-slate-600 border-t border-slate-100 cursor-grab active:cursor-grabbing">
        <GripVertical size={10} className="text-slate-300" />
        <span className="tabular-nums">{index + 1}</span>
      </div>

      {/* 悬停操作（右上角浮层） */}
      <div className="absolute top-1 right-1 hidden group-hover:flex items-center gap-0.5 bg-white/95 backdrop-blur rounded shadow-sm border border-slate-200 p-0.5">
        <ThumbIcon onClick={props.onMoveUp} disabled={index === 0} title={t("panels.moveUp")}>
          <MoveUp size={11} />
        </ThumbIcon>
        <ThumbIcon onClick={props.onMoveDown} disabled={index === total - 1} title={t("panels.moveDown")}>
          <MoveDown size={11} />
        </ThumbIcon>
        <ThumbIcon onClick={props.onDuplicate} title={tCommon("actions.duplicate")}>
          <Copy size={11} />
        </ThumbIcon>
        <ThumbIcon onClick={props.onRemove} disabled={total <= 1} title={t("panels.delete")} danger>
          <Trash2 size={11} />
        </ThumbIcon>
      </div>
    </div>
  );
}

function ThumbIcon({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-1 rounded hover:bg-slate-100 text-slate-600",
        danger && "hover:bg-rose-50 hover:text-rose-600",
        disabled && "opacity-30 cursor-not-allowed hover:bg-transparent"
      )}
    >
      {children}
    </button>
  );
}
