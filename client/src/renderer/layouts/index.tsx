import { useRef } from "react";
import { motion } from "framer-motion";
import type { Slide, Block, Layout } from "@shared/dsl";
import { filterUtilities, splitTextUtilities } from "@shared/dsl";
import { BlockRenderer } from "../blocks";
import { useRuntime } from "../runtime";
import { useEditorStore } from "@/store/editor";
import { cn } from "@/lib/cn";

type LayoutProps = { slide: Slide };

// padding / gap 用 inline px style 而非 Tailwind className：
// 避免 PDF 导出（modern-screenshot SVG image document）中 rem 解析异常 / md:* 评估异常
// 让预览 / PDF / 缩略图都走同一 hard-code px 路径
const PADDING_DEFAULT_STYLE: React.CSSProperties = { padding: 80 };
const PADDING_NARROW_STYLE: React.CSSProperties = { padding: 64 };

// magic 转场默认时长（ms）；与 SlidePanel 的 defaultDurationMs("magic") 对齐
const MAGIC_DEFAULT_MS = 250;

// 块包装：携带 data-block-index 供 Canvas 点击委托使用，并在编辑模式渲染选中描边
// 编辑模式下支持 HTML5 drag-and-drop —— 拖动 block 到目标位置即重排同 slide 内的顺序
// 若 block.magicId 存在，挂载 framer-motion layoutId 实现 Keynote 风格的 Magic Move 飞行过渡
// magicDurationMs 来自当前 slide.transitionDuration（用户在 SlidePanel 调的转场时长），跟随生效
function BlockWrap({
  block,
  index,
  slideId,
  magicDurationMs,
}: {
  block: Block;
  index: number;
  slideId: string;
  magicDurationMs: number;
}) {
  const { editor } = useRuntime();
  const isEditing = !!editor;
  const selected = editor?.selectedBlockIndex === index;
  const magicId = (block as any).magicId as string | undefined;
  // text utilities（hxs-text-gradient 等）须应用在内层文字元素上，从 outer 剔除
  const { nonText: utilities } = splitTextUtilities(filterUtilities((block as any).utilities));

  // 拖拽状态从 store 读，BlockWrap 跨布局/列共享
  const moveBlock = useEditorStore((s) => s.moveBlock);
  const dragFrom = useEditorStore((s) => s.dragBlockFrom);
  const dragOver = useEditorStore((s) => s.dragBlockOver);
  const setDragBlock = useEditorStore((s) => s.setDragBlock);

  const isDragging = isEditing && dragFrom === index;
  const isDragOver = isEditing && dragOver === index && dragFrom !== null && dragFrom !== index;

  const handleDragStart = (e: React.DragEvent) => {
    if (!isEditing) return;
    setDragBlock({ from: index, over: null });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    // 阻止冒泡到 Canvas 的 click capture（拖拽与点击选中互不干扰）
    e.stopPropagation();
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!isEditing || dragFrom === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOver !== index) setDragBlock({ from: dragFrom, over: index });
  };
  const handleDragLeave = () => {
    if (!isEditing) return;
    if (dragOver === index) setDragBlock({ from: dragFrom, over: null });
  };
  const handleDrop = (e: React.DragEvent) => {
    if (!isEditing) return;
    e.preventDefault();
    e.stopPropagation();
    if (dragFrom !== null && dragFrom !== index) {
      moveBlock(slideId, dragFrom, index);
    }
    setDragBlock({ from: null, over: null });
  };
  const handleDragEnd = () => {
    if (!isEditing) return;
    setDragBlock({ from: null, over: null });
  };

  // 外层普通 div 处理 native drag-and-drop（motion.div 的 onDragStart 被 framer-motion 占用为 PanInfo 回调）
  // 内层 motion.div 仅在 magicId 存在时挂载，做 Keynote 风格飞行过渡
  // 用 tween + duration 让用户在 SlidePanel 调的转场时长精确生效（spring 不接受 duration）
  const inner = magicId ? (
    <motion.div
      layoutId={magicId}
      layout="position"
      transition={{ duration: magicDurationMs / 1000, ease: "easeInOut" }}
    >
      <BlockRenderer block={block} />
    </motion.div>
  ) : (
    <BlockRenderer block={block} />
  );

  return (
    <div
      data-block-index={index}
      draggable={isEditing}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      // outer 容器加 border-radius：让 hxs-shadow-glow 的 1px ring 与 outline 跟随圆角，
      // 避免圆角 block（按钮 / card）外层出现"4 个直角短线"
      style={{ borderRadius: "var(--hxs-radius)" }}
      className={cn(
        "relative",
        isEditing && "transition-[outline] outline outline-2 outline-transparent",
        isEditing && "hover:outline-blue-300/60 cursor-grab active:cursor-grabbing",
        selected && "outline-blue-500",
        isDragging && "opacity-40",
        isDragOver && "outline-blue-500 ring-2 ring-blue-400 ring-offset-2",
        ...utilities
      )}
    >
      {inner}
    </div>
  );
}

// 自由布局专用 wrapper：absolute 定位 + 百分比坐标 + pointer events 拖动
// 区别于 BlockWrap 的"顺序拖拽"，这里是"位置拖拽"
//
// 性能关键：拖动期间不走 React state，直接用 CSS transform 修改 DOM —— GPU composite 层 60fps 跟手
// 释放时把 translate 转回百分比 left/top 一次性提交到 store（入历史栈，可撤销）
function FreeBlockWrap({
  block,
  index,
  slideId,
  magicDurationMs,
}: {
  block: Block;
  index: number;
  slideId: string;
  magicDurationMs: number;
}) {
  const { editor } = useRuntime();
  const isEditing = !!editor;
  const selected = editor?.selectedBlockIndex === index;
  const magicId = (block as any).magicId as string | undefined;
  // text utilities（hxs-text-gradient 等）须应用在内层文字元素上，从 outer 剔除
  const { nonText: utilities } = splitTextUtilities(filterUtilities((block as any).utilities));

  const updateBlockPosition = useEditorStore((s) => s.updateBlockPosition);

  const pos = ((block as any).position ?? { xPct: 10, yPct: 10 + index * 12 }) as {
    xPct: number;
    yPct: number;
    widthPct?: number;
    heightPct?: number;
  };

  const wrapperRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isEditing) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select, label")) return;
    const wrapper = wrapperRef.current;
    const stage = wrapper?.parentElement;
    if (!wrapper || !stage) return;
    const stageRect = stage.getBoundingClientRect();
    if (stageRect.width <= 0 || stageRect.height <= 0) return;

    e.stopPropagation();
    e.preventDefault();
    // pointer capture 让后续 pointermove/up 锁定在 wrapper 上，跨元素也能收到
    try {
      wrapper.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const startX = e.clientX;
    const startY = e.clientY;
    let lastDx = 0;
    let lastDy = 0;
    let rafId = 0;
    let pending = false;

    const apply = () => {
      pending = false;
      // 直接改 DOM transform —— 无 React re-render，无 layout，仅 composite
      wrapper.style.transform = `translate(${lastDx}px, ${lastDy}px)`;
    };

    const onMove = (ev: PointerEvent) => {
      lastDx = ev.clientX - startX;
      lastDy = ev.clientY - startY;
      // requestAnimationFrame 节流：每帧最多一次更新（60Hz）
      if (!pending) {
        pending = true;
        rafId = requestAnimationFrame(apply);
      }
    };

    const onUp = (ev: PointerEvent) => {
      wrapper.removeEventListener("pointermove", onMove);
      wrapper.removeEventListener("pointerup", onUp);
      wrapper.removeEventListener("pointercancel", onUp);
      try {
        wrapper.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      if (rafId) cancelAnimationFrame(rafId);
      // 清掉拖动期临时 transform
      wrapper.style.transform = "";

      const dxPct = (lastDx / stageRect.width) * 100;
      const dyPct = (lastDy / stageRect.height) * 100;
      if (Math.abs(dxPct) < 0.3 && Math.abs(dyPct) < 0.3) return;

      const newX = Math.max(-10, Math.min(110, pos.xPct + dxPct));
      const newY = Math.max(-10, Math.min(110, pos.yPct + dyPct));
      updateBlockPosition(slideId, index, newX, newY);
    };

    wrapper.addEventListener("pointermove", onMove);
    wrapper.addEventListener("pointerup", onUp);
    wrapper.addEventListener("pointercancel", onUp);
  };

  const inner = magicId ? (
    <motion.div
      layoutId={magicId}
      layout="position"
      transition={{ duration: magicDurationMs / 1000, ease: "easeInOut" }}
    >
      <BlockRenderer block={block} />
    </motion.div>
  ) : (
    <BlockRenderer block={block} />
  );

  return (
    <div
      ref={wrapperRef}
      data-block-index={index}
      onPointerDown={handlePointerDown}
      style={{
        position: "absolute",
        left: `${pos.xPct}%`,
        top: `${pos.yPct}%`,
        ...(pos.widthPct !== undefined ? { width: `${pos.widthPct}%` } : {}),
        ...(pos.heightPct !== undefined ? { height: `${pos.heightPct}%` } : {}),
        cursor: isEditing ? "grab" : "default",
        touchAction: isEditing ? "none" : undefined,
        userSelect: isEditing ? "none" : undefined,
        // 提示浏览器 transform 会变化 —— 提升到 GPU 层
        willChange: isEditing ? "transform" : undefined,
        // 让 box-shadow / outline 跟随圆角，避免圆角 block 周围出现"4 个直角短线"
        borderRadius: "var(--hxs-radius)",
      }}
      className={cn(
        "transition-none",
        isEditing && "outline outline-2 outline-transparent hover:outline-blue-300/60",
        selected && "outline outline-2 outline-blue-500",
        ...utilities
      )}
    >
      {inner}
    </div>
  );
}

// 封面：大字号居中 + 上下留白拉满，给观众"震撼"的第一印象
function HeroLayout({ slide }: LayoutProps) {
  return (
    <div
      className="min-h-full w-full flex flex-col items-center justify-center text-center"
      style={{ ...PADDING_DEFAULT_STYLE, gap: 40 }}
    >
      {slide.blocks.map((b, i) => (
        <BlockWrap key={i} block={b} index={i} slideId={slide.id} magicDurationMs={slide.transitionDuration ?? MAGIC_DEFAULT_MS} />
      ))}
    </div>
  );
}

// 标题正文：左对齐叙事，第一个 heading 后多空一截制造章节感
function TitleContentLayout({ slide }: LayoutProps) {
  return (
    <div
      className="min-h-full w-full max-w-5xl mx-auto flex flex-col"
      style={{ ...PADDING_DEFAULT_STYLE, gap: 36 }}
    >
      {slide.blocks.map((b, i) => (
        <BlockWrap key={i} block={b} index={i} slideId={slide.id} magicDurationMs={slide.transitionDuration ?? MAGIC_DEFAULT_MS} />
      ))}
    </div>
  );
}

// 两栏：列间距大，制造对比张力
function TwoColumnLayout({ slide }: LayoutProps) {
  const left: { block: Block; index: number }[] = [];
  const right: { block: Block; index: number }[] = [];
  const center: { block: Block; index: number }[] = [];
  slide.blocks.forEach((b, i) => {
    const col = "column" in b ? b.column : undefined;
    if (col === "right") right.push({ block: b, index: i });
    else if (col === "center") center.push({ block: b, index: i });
    else left.push({ block: b, index: i });
  });
  return (
    <div
      className="min-h-full w-full flex flex-col max-w-7xl mx-auto"
      style={{ ...PADDING_DEFAULT_STYLE, gap: 40 }}
    >
      {center.length > 0 && (
        <div className="flex flex-col items-center text-center" style={{ gap: 20 }}>
          {center.map(({ block, index }) => (
            <BlockWrap key={index} block={block} index={index} slideId={slide.id} magicDurationMs={slide.transitionDuration ?? MAGIC_DEFAULT_MS} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 flex-1" style={{ gap: 48 }}>
        <div className="flex flex-col" style={{ gap: 20 }}>
          {left.map(({ block, index }) => (
            <BlockWrap key={index} block={block} index={index} slideId={slide.id} magicDurationMs={slide.transitionDuration ?? MAGIC_DEFAULT_MS} />
          ))}
        </div>
        <div className="flex flex-col" style={{ gap: 20 }}>
          {right.map(({ block, index }) => (
            <BlockWrap key={index} block={block} index={index} slideId={slide.id} magicDurationMs={slide.transitionDuration ?? MAGIC_DEFAULT_MS} />
          ))}
        </div>
      </div>
    </div>
  );
}

// 要点列表：受限宽度居中，列表项目获得"专注感"
function BulletListLayout({ slide }: LayoutProps) {
  return (
    <div
      className="min-h-full w-full flex flex-col justify-center max-w-4xl mx-auto"
      style={{ ...PADDING_DEFAULT_STYLE, gap: 40 }}
    >
      {slide.blocks.map((b, i) => (
        <BlockWrap key={i} block={b} index={i} slideId={slide.id} magicDurationMs={slide.transitionDuration ?? MAGIC_DEFAULT_MS} />
      ))}
    </div>
  );
}

// 引用：超大引号装饰 + 居中 + 收紧宽度
function QuoteLayout({ slide }: LayoutProps) {
  return (
    <div
      className="relative min-h-full w-full flex flex-col items-center justify-center text-center max-w-3xl mx-auto"
      style={{ ...PADDING_DEFAULT_STYLE, gap: 24 }}
    >
      <span
        aria-hidden
        className="absolute leading-none font-serif select-none pointer-events-none"
        style={{ top: 40, left: 48, fontSize: 128, color: "var(--hxs-primary)", opacity: 0.18 }}
      >
        “
      </span>
      <div className="relative z-10 flex flex-col items-center" style={{ gap: 20 }}>
        {slide.blocks.map((b, i) => (
          <BlockWrap key={i} block={b} index={i} slideId={slide.id} magicDurationMs={slide.transitionDuration ?? MAGIC_DEFAULT_MS} />
        ))}
      </div>
      <span
        aria-hidden
        className="absolute leading-none font-serif select-none pointer-events-none"
        style={{ bottom: 40, right: 48, fontSize: 128, color: "var(--hxs-primary)", opacity: 0.18 }}
      >
        ”
      </span>
    </div>
  );
}

// 行动号召：居中 + 按钮组横排（如有多个 button）
function CtaLayout({ slide }: LayoutProps) {
  // 把 button 类型放最后一组以便横向并排
  const nonButtons = slide.blocks
    .map((b, i) => ({ b, i }))
    .filter((x) => x.b.type !== "button");
  const buttons = slide.blocks
    .map((b, i) => ({ b, i }))
    .filter((x) => x.b.type === "button");
  return (
    <div
      className="min-h-full w-full flex flex-col items-center justify-center text-center"
      style={{ ...PADDING_DEFAULT_STYLE, gap: 40 }}
    >
      {nonButtons.map(({ b, i }) => (
        <BlockWrap key={i} block={b} index={i} slideId={slide.id} magicDurationMs={slide.transitionDuration ?? MAGIC_DEFAULT_MS} />
      ))}
      {buttons.length > 0 && (
        <div className="flex flex-wrap items-center justify-center mt-2" style={{ gap: 16 }}>
          {buttons.map(({ b, i }) => (
            <BlockWrap key={i} block={b} index={i} slideId={slide.id} magicDurationMs={slide.transitionDuration ?? MAGIC_DEFAULT_MS} />
          ))}
        </div>
      )}
    </div>
  );
}

// 嵌入
function EmbedLayout({ slide }: LayoutProps) {
  return (
    <div
      className="min-h-full w-full flex flex-col"
      style={{ ...PADDING_NARROW_STYLE, gap: 16 }}
    >
      {slide.blocks.map((b, i) => (
        <BlockWrap key={i} block={b} index={i} slideId={slide.id} magicDurationMs={slide.transitionDuration ?? MAGIC_DEFAULT_MS} />
      ))}
    </div>
  );
}

// 通用多栏布局：3/4/5 栏
// col1-col5 分配到各列；center 作全宽头部；无 column 字段的块归入 col1
function MultiColumnLayout({ slide, cols }: LayoutProps & { cols: 3 | 4 | 5 }) {
  const columns: { block: Block; index: number }[][] = Array.from({ length: cols }, () => []);
  const center: { block: Block; index: number }[] = [];
  slide.blocks.forEach((b, i) => {
    const col = ("column" in b ? b.column : undefined) as string | undefined;
    if (col === "center") { center.push({ block: b, index: i }); return; }
    // col1-col5 → 0-based index
    const m = col?.match(/^col(\d)$/);
    if (!m) { center.push({ block: b, index: i }); return; }
    const colIdx = Math.min(Number(m[1]) - 1, cols - 1);
    columns[colIdx]!.push({ block: b, index: i });
  });
  const gridCls = cols === 3 ? "grid-cols-3" : cols === 4 ? "grid-cols-4" : "grid-cols-5";
  return (
    <div
      className="min-h-full w-full flex flex-col max-w-7xl mx-auto"
      style={{ ...PADDING_NARROW_STYLE, gap: 32 }}
    >
      {center.length > 0 && (
        <div className="flex flex-col items-center text-center" style={{ gap: 16 }}>
          {center.map(({ block, index }) => (
            <BlockWrap key={index} block={block} index={index} slideId={slide.id} magicDurationMs={slide.transitionDuration ?? MAGIC_DEFAULT_MS} />
          ))}
        </div>
      )}
      <div className={cn("grid flex-1", gridCls)} style={{ gap: 32 }}>
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col" style={{ gap: 16 }}>
            {col.map(({ block, index }) => (
              <BlockWrap key={index} block={block} index={index} slideId={slide.id} magicDurationMs={slide.transitionDuration ?? MAGIC_DEFAULT_MS} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// 自由布局：每个 block 用 absolute + 百分比定位，编辑模式下可鼠标拖动
function FreeLayout({ slide }: LayoutProps) {
  return (
    <div className="relative w-full h-full overflow-hidden" data-free-stage>
      {slide.blocks.map((b, i) => (
        <FreeBlockWrap key={i} block={b} index={i} slideId={slide.id} magicDurationMs={slide.transitionDuration ?? MAGIC_DEFAULT_MS} />
      ))}
    </div>
  );
}

const REGISTRY: Record<Layout, React.FC<LayoutProps>> = {
  "hero": HeroLayout,
  "title-content": TitleContentLayout,
  "two-column": TwoColumnLayout,
  "three-column": (p) => <MultiColumnLayout {...p} cols={3} />,
  "four-column": (p) => <MultiColumnLayout {...p} cols={4} />,
  "five-column": (p) => <MultiColumnLayout {...p} cols={5} />,
  "bullet-list": BulletListLayout,
  "quote": QuoteLayout,
  "cta": CtaLayout,
  "embed": EmbedLayout,
  "free": FreeLayout,
};

export function LayoutRenderer({ slide }: LayoutProps) {
  const Component = REGISTRY[slide.layout];
  return <Component slide={slide} />;
}
