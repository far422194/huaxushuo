import { useEditorStore } from "@/store/editor";
import { Deck } from "@/renderer";
import { useLayoutEffect, useRef, useState } from "react";
import { getPattern } from "@/data/patterns";

// 固定逻辑舞台尺寸：内容按这个 viewport 渲染，再用 transform: scale 缩到容器实际尺寸
// 1280×720 是 16:9 演示稿主流标尺；4:3 用 1024×768（XGA）
const STAGE_16_9 = { w: 1280, h: 720 };
const STAGE_4_3 = { w: 1024, h: 768 };

// 把 deck.meta.aspectRatio 转成画布盒的尺寸约束
function getCanvasStyle(aspectRatio: string): React.CSSProperties {
  if (aspectRatio === "16:9") {
    return {
      width: "min(calc(100% - 2px), calc((100vh - 9rem) * 16 / 9))",
      aspectRatio: "16 / 9",
    };
  }
  if (aspectRatio === "4:3") {
    return {
      width: "min(calc(100% - 2px), calc((100vh - 9rem) * 4 / 3))",
      aspectRatio: "4 / 3",
    };
  }
  // auto: 自适应 Web 视图，但宽度锁定 1280px 与缩略图 ScaleStage viewport 完全一致
  // 之前 width: 100% + maxWidth: 1440 让主舞台 layout 跟随浏览器宽度变化，wrap point 与
  // 缩略图（永远按 1280 viewport 渲染再 scale）不一致，导致同 H1 标题在主舞台换行而缩略图不换行
  // 锁 1280 后保留 height: 100% + Deck 内部 overflow-y-auto，长内容仍可垂直滚动（auto 语义保留）
  // **flexShrink: 0 至关重要**：父级是 flex item-stretch 容器，flex 子项默认 min-width: auto
  // 会被 shrink 到 < 1280 以适应窄屏父级 → 实际容器宽度小于 1280，wrap point 与缩略图不一致。
  // shrink: 0 强制 1280，父级 overflow-auto 处理超出部分（横向滚动）
  // 代价：窄屏浏览器主舞台会出现横向滚动条；可接受
  return {
    width: 1280,
    height: "100%",
    flexShrink: 0,
  };
}

// 缩放舞台：让 children 在固定 width×height 的 viewport 渲染，按容器空间等比缩放后居中
// 用 ResizeObserver 监听容器尺寸变化，scale = min(rectW/w, rectH/h)
function ScaleStage({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setScale(Math.min(rect.width / w, rect.height / h));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <div
        className="absolute top-1/2 left-1/2"
        style={{
          width: w,
          height: h,
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

export function Canvas() {
  const deck = useEditorStore((s) => s.deck);
  const currentIndex = useEditorStore((s) => s.currentIndex);
  const setCurrentIndex = useEditorStore((s) => s.setCurrentIndex);
  const selection = useEditorStore((s) => s.selection);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const selectSlide = useEditorStore((s) => s.selectSlide);
  const clearSelection = useEditorStore((s) => s.clearSelection);

  const currentSlide = deck.slides[currentIndex];

  const handleClickCapture = (e: React.MouseEvent) => {
    if (!currentSlide) return;
    const target = e.target as HTMLElement;
    const blockEl = target.closest("[data-block-index]") as HTMLElement | null;
    if (blockEl) {
      const idx = Number(blockEl.getAttribute("data-block-index"));
      if (!Number.isNaN(idx)) {
        e.preventDefault();
        e.stopPropagation();
        selectBlock(currentSlide.id, idx);
        return;
      }
    }
    selectSlide(currentSlide.id);
  };

  const ratio = deck.meta.aspectRatio;
  const isAuto = ratio === "auto";
  const stage = ratio === "16:9" ? STAGE_16_9 : ratio === "4:3" ? STAGE_4_3 : null;

  const deckEl = (
    <Deck
      deck={deck}
      controlledIndex={currentIndex}
      onIndexChange={setCurrentIndex}
      keyboardNav={false}
      showNavigation={false}
      editor={{ selectedBlockIndex: selection.blockIndex }}
      resolvePattern={getPattern}
      // 静态渲染管线：与 SlideList 缩略图(staticExport)完全对齐，消除 AnimatePresence /
      // motion.div magicId 飞行带来的 wrap point / layout 差异。
      // 编辑器主舞台编辑场景不需要切页转场；放映态(预览按钮)仍走默认 motion 管线。
      staticExport
    />
  );

  return (
    <div
      className={
        isAuto
          ? "flex-1 flex items-stretch justify-center p-3 overflow-auto"
          : "flex-1 flex items-center justify-center p-6 overflow-auto"
      }
      onClick={(e) => {
        if (e.target === e.currentTarget) clearSelection();
      }}
    >
      <div
        className="relative bg-white shadow-xl overflow-hidden rounded-lg"
        style={getCanvasStyle(ratio)}
        onClickCapture={handleClickCapture}
      >
        {stage ? (
          // 固定画幅：1280×720（16:9）或 1024×768（4:3）的逻辑 viewport + transform scale 缩到容器
          // 内容按固定尺寸渲染，永远完整可见；外层 overflow-hidden 兜底裁剪溢出（虽然 LLM 已被约束尽量不溢出）
          <ScaleStage w={stage.w} h={stage.h}>{deckEl}</ScaleStage>
        ) : (
          // auto：直接 Web 全屏，不缩放
          deckEl
        )}
      </div>
    </div>
  );
}
