import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Trash2, MoveUp, MoveDown, GripVertical } from "lucide-react";
import type { Slide, Theme, Deck as DeckT } from "@shared/dsl";
import { useEditorStore } from "@/store/editor";
import { Deck } from "@/renderer/Deck";
import { ScaleStage } from "./ScaleStage";
import { getPattern } from "@/data/patterns";
import { cn } from "@/lib/cn";

type AspectRatio = DeckT["meta"]["aspectRatio"];

// 缩略图按 deck 画幅选 viewport：与主舞台 Canvas 的 STAGE_16_9 / STAGE_4_3 严格对齐
// auto 画幅没有固定 viewport：缩略图取 1280×720 作为"首屏快照"，超出部分被 overflow-hidden 裁剪
// 不再 hard-code 16:9 → 之前的写法在 4:3 deck 下会让缩略图比例变形、auto deck 下与主舞台 wrap point 不一致
function getThumbStage(aspectRatio: AspectRatio): { w: number; h: number; aspectClass: string } {
  if (aspectRatio === "4:3") return { w: 1024, h: 768, aspectClass: "aspect-[4/3]" };
  // 16:9 / auto 都用 1280×720 + 16:9 容器（auto 取首屏快照）
  return { w: 1280, h: 720, aspectClass: "aspect-[16/9]" };
}

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
            aspectRatio={meta.aspectRatio}
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
  aspectRatio: AspectRatio;
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
  const { slide, theme, aspectRatio, index, total, isCurrent, isSelected, isDragging, isDragOver } = props;
  const rootRef = useRef<HTMLDivElement>(null);

  // 缩略图与主舞台严格按同一画幅渲染；auto 画幅取 16:9 首屏快照
  const stage = useMemo(() => getThumbStage(aspectRatio), [aspectRatio]);

  // mini deck：仅含本页 + 与主 deck 同画幅 + 整体 theme；variables 不传（缩略图无交互）
  // useMemo 依赖未变时返回相同对象 → Deck 内部不会重跑 effect
  const miniDeck = useMemo(
    () => ({
      version: "1.0" as const,
      meta: { title: "", aspectRatio },
      theme,
      variables: {},
      slides: [{ ...slide, id: "thumb" }],
    }),
    [slide, theme, aspectRatio]
  );

  // currentIndex 切换到本页时，自动滚动到可见区
  // block: "nearest" 已在视口内不动；半遮挡 / 完全不可见时才滚 → 与浏览器原生焦点行为一致
  // smooth 让滚动有动画反馈,不突兀
  useEffect(() => {
    if (!isCurrent) return;
    const el = rootRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [isCurrent]);

  return (
    <div
      ref={rootRef}
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
      {/* 缩略图主体：真实 Deck 渲染（pointer-events-none 阻止内部交互冒泡）；容器比例随画幅切换 */}
      <div className={cn(stage.aspectClass, "relative overflow-hidden bg-slate-50 pointer-events-none")}>
        <ScaleStage w={stage.w} h={stage.h}>
          <div className="absolute inset-0">
            <Deck
              deck={miniDeck}
              keyboardNav={false}
              showNavigation={false}
              transitionMode="sync"
              resolvePattern={getPattern}
              staticExport
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
