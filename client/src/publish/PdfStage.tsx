import { forwardRef, useMemo } from "react";
import { Deck } from "@/renderer/Deck";
import { getPattern } from "@/data/patterns";
import { expandDeck } from "@/renderer/expandPattern";
import type { Deck as DeckT } from "@shared/dsl";

// PDF 导出离屏舞台：固定 1280×720，渲染 deck 单页供 modern-screenshot 截图
//
// 关键设计：
// - 真正离屏（left:-99999）：modern-screenshot 用 SVG foreignObject 序列化节点，不依赖元素在视口内
//   PublishDialog backdrop 仅 50% 透明，若 PdfStage 在视口内会从蒙层下透出 → 闪烁
// - 每页 transition 强制 "none"，禁用 framer-motion 入场动画（initial=animate=opacity:1 立即可见，避免截到 opacity:0）
export const PdfStage = forwardRef<
  HTMLDivElement,
  { deck: DeckT; index: number }
>(function PdfStage({ deck, index }, ref) {
  const noAnimDeck = useMemo<DeckT>(() => {
    const expanded = expandDeck(deck, getPattern);
    return {
      ...expanded,
      slides: expanded.slides.map((s) => ({ ...s, transition: "none" as const })),
    };
  }, [deck]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: 0,
        left: -99999,
        width: 1280,
        height: 720,
        background: "#fff",
        pointerEvents: "none",
      }}
    >
      <Deck
        deck={noAnimDeck}
        controlledIndex={index}
        keyboardNav={false}
        showNavigation={false}
        transitionMode="sync"
        resolvePattern={getPattern}
        staticExport
      />
    </div>
  );
});
