import { motion } from "framer-motion";
import type { Slide as SlideT, Transition } from "@shared/dsl";
import { filterUtilities, splitTextUtilities } from "@shared/dsl";
import { LayoutRenderer } from "./layouts";
import { useRuntime } from "./runtime";
import { cn } from "@/lib/cn";

const TRANSITION_VARIANTS: Record<
  Transition,
  { initial: any; animate: any; exit: any; transition?: any }
> = {
  none: {
    initial: { opacity: 1 },
    animate: { opacity: 1 },
    exit: { opacity: 1 },
  },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.4 },
  },
  "slide-left": {
    initial: { opacity: 0, x: 60 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -60 },
    transition: { duration: 0.4, ease: "easeOut" },
  },
  "slide-up": {
    initial: { opacity: 0, y: 40 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -40 },
    transition: { duration: 0.4, ease: "easeOut" },
  },
  zoom: {
    initial: { opacity: 0, scale: 0.92 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.04 },
    transition: { duration: 0.45, ease: "easeOut" },
  },
  // Magic Move：整页容器淡入淡出（轻微），让带 magicId 的子元素通过 layoutId 飞过去
  magic: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.25 },
  },
};

export function Slide({
  slide,
  isAuto = false,
  showPageNumber = false,
  staticMode = false,
  flowMode = false,
}: {
  slide: SlideT;
  isAuto?: boolean;
  showPageNumber?: boolean;
  // staticMode：跳过入场 / 退场动画，用 div 替代 motion.div
  // 缩略图（SlideList）+ PDF 导出场景使用，避免重渲时被入场 variant 拉成"flicker"
  staticMode?: boolean;
  // flowMode：PDF 导出 auto 画幅时使用。让 Slide 容器从 absolute inset-0 + overflow-y-auto 解放为
  // relative + 自然撑开，使长内容（超过一屏）能完整渲染并被 modern-screenshot 截图截到。
  // 不影响主舞台（编辑器要保留滚动语义）/ 缩略图（外层有 overflow-hidden 兜底）/ 固定画幅 PDF
  flowMode?: boolean;
}) {
  const variant = TRANSITION_VARIANTS[slide.transition];
  // 背景与底纹层已由 Deck 层独立渲染（按 bgKey 智能转场，同背景切页时不重渲）
  // Slide 仅渲染内容层 + 非底纹 utilities（如阴影、文字效果，但这些通常是 block 级别）
  const allUtils = filterUtilities(slide.utilities);
  // text utilities（hxs-text-gradient 等）不应用在 slide 容器上
  const { nonText: otherUtils } = splitTextUtilities(
    allUtils.filter((u) => !/^hxs-bg-/.test(u))  // 底纹类已由 BackgroundLayer 渲染
  );
  // 用户自定义时长覆盖默认
  const transition =
    slide.transitionDuration !== undefined
      ? { ...(variant.transition ?? {}), duration: slide.transitionDuration / 1000 }
      : variant.transition;

  // 容器形态按 (flowMode, isAuto) 切换：
  // - flowMode + isAuto: 流式撑开（PDF 完整截 auto 画幅长内容），无 absolute / 无 y-overflow
  // - isAuto:            主舞台 / 缩略图 auto 画幅，absolute 锁高 + 内部 y-auto 滚动
  // - 固定画幅:           absolute 锁高 + 严格 overflow-hidden 防溢出
  const flowAuto = flowMode && isAuto;
  const modeClassName = flowAuto
    ? "relative w-full z-10 overflow-x-hidden"
    : isAuto
    ? "absolute inset-0 z-10 overflow-y-auto overflow-x-hidden"
    : "absolute inset-0 z-10 overflow-hidden";
  const containerClassName = cn(modeClassName, ...otherUtils);

  const inner = (
    <>
      {/* 内容层：背景由 Deck 的 BackgroundLayer 持续渲染（同背景切页时不会重渲，达到"仅内容动"效果）
          flowAuto 时去掉 h-full（让内容撑开高度），但保留 min-h-full（基线一屏） */}
      <div className={cn("relative w-full min-h-full", flowAuto ? "" : "h-full")}>
        <LayoutRenderer slide={slide} staticMode={staticMode} />
      </div>
      {showPageNumber && <SlidePageNumber />}
    </>
  );

  if (staticMode) {
    return <div key={slide.id} className={containerClassName}>{inner}</div>;
  }

  return (
    <motion.div
      key={slide.id}
      className={containerClassName}
      initial={variant.initial}
      animate={variant.animate}
      exit={variant.exit}
      transition={transition}
    >
      {inner}
    </motion.div>
  );
}

// 页码标签：右上角小字 N/M；从 RuntimeContext 拿 currentIndex / totalSlides
function SlidePageNumber() {
  const { currentIndex, totalSlides } = useRuntime();
  const n = String(currentIndex + 1).padStart(2, "0");
  const m = String(totalSlides).padStart(2, "0");
  return (
    <div
      aria-hidden
      className="absolute z-20 text-xs tracking-wider tabular-nums select-none pointer-events-none"
      style={{
        top: "1.5rem",
        right: "2rem",
        color: "var(--hxs-muted)",
        opacity: 0.7,
        fontFamily: "var(--hxs-font-body)",
      }}
    >
      {n} / {m}
    </div>
  );
}
