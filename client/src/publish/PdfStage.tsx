import { forwardRef, useMemo } from "react";
import { Deck } from "@/renderer/Deck";
import { getPattern } from "@/data/patterns";
import { expandDeck } from "@/renderer/expandPattern";
import type { Deck as DeckT } from "@shared/dsl";

// PDF 导出离屏舞台：按 deck.meta.aspectRatio 决定容器尺寸；exportPdf 据此截图
//
// 三种画幅适配：
// - "16:9" → 1280×720（演示主流画幅，固定高度）
// - "4:3"  → 1024×768（标准 4:3 画幅，固定高度）
// - "auto" → 宽 1280，**完全跟随内容高度**：div height 不设，Deck/Slide 走 flowMode
//   让内容自然撑开整个 div。modern-screenshot 截图按 div scrollHeight，每页 PDF size 独立。
//
// 关键设计：
// - 真正离屏（left:-99999）：modern-screenshot 用 SVG foreignObject 序列化节点
// - 每页 transition 强制 "none" + Slide staticMode：禁用 framer-motion 入场动画
// - flowMode 在 auto 画幅时让 Deck/Slide 容器从 h-full + overflow-y-auto 解放为 min-h-full + 自然撑开
//
// 历史 bug 防护：
// 1. 曾尝试给 auto 设 height: "auto" → Deck h-full = 0 → 塌缩空白
// 2. 曾尝试 minHeight 720 兜底 → 短 hero（600px）时 div=720 但 Deck/BackgroundLayer 只到 600，
//    600-720 显示 themeStyle bg 色（深绿）色块。
// 解决：去掉 minHeight，让 PdfStage div 完全跟随内容高度，BackgroundLayer 永远撑满

export type PdfStageSize = {
  width: number;
  // 固定画幅给数字 height；auto 给 undefined（让内容撑开）
  height?: number;
};

export function getStageSizeForAspect(
  aspectRatio: DeckT["meta"]["aspectRatio"],
): PdfStageSize {
  if (aspectRatio === "4:3") return { width: 1024, height: 768 };
  if (aspectRatio === "auto") return { width: 1280 };  // 无 height，跟随内容
  return { width: 1280, height: 720 };
}

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

  const size = getStageSizeForAspect(deck.meta.aspectRatio);
  const isAuto = deck.meta.aspectRatio === "auto";

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: 0,
        left: -99999,
        width: size.width,
        // 固定画幅给 height；auto 不设 height，跟随内容
        ...(size.height !== undefined ? { height: size.height } : {}),
        // backgroundColor 跟随 deck theme，避免与 BackgroundLayer 之间露出 #fff 色差
        background: deck.theme.colors.bg,
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
        flowMode={isAuto}
      />
    </div>
  );
});
