import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Deck as DeckT, Slide as SlideT } from "@shared/dsl";
import { filterUtilities, splitUtilities } from "@shared/dsl";
import { Slide } from "./Slide";
import { RuntimeProvider, type Variables, type EditorBinding } from "./runtime";
import { themeToCssVars, backgroundToStyle } from "./theme";
import { NavigationBar } from "./NavigationBar";
import { expandSlide, type PatternResolver } from "./expandPattern";
import { cn } from "@/lib/cn";

export interface DeckProps {
  deck: DeckT;
  // 编辑器可外控当前页（可选）
  controlledIndex?: number;
  onIndexChange?: (index: number) => void;
  // 是否启用键盘导航（独立站默认 true，编辑器可关）
  keyboardNav?: boolean;
  // 编辑模式绑定（传入即激活编辑视觉，如选中描边）
  editor?: EditorBinding;
  // AnimatePresence 转场模式：popLayout（默认，配合 Magic Move）/ sync / wait
  // 全屏预览推荐 sync —— 转场更稳定可见
  transitionMode?: "popLayout" | "sync" | "wait";
  // 是否在 deck 容器底部显示导航条（进度 + 首页/上一页/下一页）
  // 独立站默认 true；编辑器画布传 false（Toolbar 已有切页）
  showNavigation?: boolean;
  // Pattern 解析器：编辑器场景注入；未注入时 patternRef 字段不展开（独立站发布前已预展开）
  resolvePattern?: PatternResolver;
  // 静态导出模式（PDF 导出）：跳过 AnimatePresence + 背景层 fade，所有 motion 立即定格
  // 避免：旧 slide 退出动画未完成时被截图导致重叠 / 背景渐显未结束导致色值偏淡
  staticExport?: boolean;
}

export function Deck({
  deck,
  controlledIndex,
  onIndexChange,
  keyboardNav = true,
  editor,
  transitionMode = "popLayout",
  showNavigation = true,
  resolvePattern,
  staticExport = false,
}: DeckProps) {
  const [internalIndex, setInternalIndex] = useState(0);
  const isControlled = controlledIndex !== undefined;
  const currentIndex = isControlled ? controlledIndex! : internalIndex;

  const setIndex = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(deck.slides.length - 1, next));
      if (!isControlled) setInternalIndex(clamped);
      onIndexChange?.(clamped);
    },
    [deck.slides.length, isControlled, onIndexChange]
  );

  const [variables, setVariables] = useState<Variables>(() => ({ ...deck.variables }));

  // deck 切换时重置变量
  useEffect(() => {
    setVariables({ ...deck.variables });
    if (!isControlled) setInternalIndex(0);
  }, [deck, isControlled]);

  const next = useCallback(() => setIndex(currentIndex + 1), [currentIndex, setIndex]);
  const prev = useCallback(() => setIndex(currentIndex - 1), [currentIndex, setIndex]);
  const jumpTo = useCallback(
    (slideId: string) => {
      const idx = deck.slides.findIndex((s) => s.id === slideId);
      if (idx >= 0) setIndex(idx);
    },
    [deck.slides, setIndex]
  );
  const goToIndex = useCallback((i: number) => setIndex(i), [setIndex]);
  const setVar = useCallback(
    (name: string, value: string | number | boolean) =>
      setVariables((v) => ({ ...v, [name]: value })),
    []
  );

  // 键盘导航
  useEffect(() => {
    if (!keyboardNav) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboardNav, next, prev]);

  const runtimeValue = useMemo(
    () => ({
      theme: deck.theme,
      variables,
      currentIndex,
      totalSlides: deck.slides.length,
      next,
      prev,
      jumpTo,
      goToIndex,
      setVar,
      editor,
    }),
    [deck.theme, variables, currentIndex, deck.slides.length, next, prev, jumpTo, goToIndex, setVar, editor]
  );

  const themeStyle = themeToCssVars(deck.theme);
  const rawCurrent = deck.slides[currentIndex];
  // patternRef 展开：编辑器场景注入 resolver；命中 pattern 时合并 base + slide override
  const current = useMemo(
    () => (rawCurrent ? expandSlide(rawCurrent, resolvePattern) : undefined),
    [rawCurrent, resolvePattern]
  );

  // auto 模式下允许内部纵向滚动（Web 自适应），固定比例时保持裁剪
  const isAuto = deck.meta.aspectRatio === "auto";

  // 单页 showPageNumber 优先；未设则跟随 deck.meta.showPageNumbers
  const effectiveShowPageNumber =
    current?.showPageNumber ?? deck.meta.showPageNumbers ?? false;

  // 背景层 key：按 background + 底纹 utility 计算；相同 key 时切页背景层不重渲染（保持稳定）
  // 不同 key 时背景层独立做 fade 转场，与内容层并行
  const bgKey = useMemo(() => buildBackgroundKey(current), [current]);

  return (
    <RuntimeProvider value={runtimeValue}>
      <div
        className={
          isAuto
            ? "relative w-full h-full overflow-y-auto overflow-x-hidden"
            : "relative w-full h-full overflow-hidden"
        }
        style={themeStyle}
        data-theme-mode={deck.theme.mode}
        data-aspect-ratio={deck.meta.aspectRatio}
      >
        {/* 背景层：按 bgKey 独立 AnimatePresence。同 key 不重渲 → 同背景切页时背景纹丝不动；
            不同 key 时仅背景做 fade，与内容层并行（内容层走自己的 transition variant）
            staticExport 时跳过 AnimatePresence，让 BackgroundLayer 立即定格，避免 PDF 截到 fade 中间状态 */}
        {staticExport ? (
          current && <BackgroundLayer key={bgKey} slide={current} instant />
        ) : (
          <AnimatePresence mode="sync">
            {current && <BackgroundLayer key={bgKey} slide={current} />}
          </AnimatePresence>
        )}

        {/* mode="popLayout" 配合 Magic Move 跨 slide 共享布局；mode="sync" 用于全屏预览（转场更稳定）
            staticExport 时跳过 AnimatePresence + 让 Slide 用静态 div，旧 slide 立即卸载避免重叠 / 缩略图入场动画 flicker */}
        {staticExport ? (
          current && (
            <Slide
              key={current.id}
              slide={current}
              isAuto={isAuto}
              showPageNumber={effectiveShowPageNumber}
              staticMode
            />
          )
        ) : (
          <AnimatePresence mode={transitionMode}>
            {current && (
              <Slide
                key={current.id}
                slide={current}
                isAuto={isAuto}
                showPageNumber={effectiveShowPageNumber}
              />
            )}
          </AnimatePresence>
        )}
        {showNavigation && <NavigationBar />}
      </div>
    </RuntimeProvider>
  );
}

// 背景层 key：决定是否重新渲染背景。background 与底纹 utility 都纳入 key
function buildBackgroundKey(slide: SlideT | undefined): string {
  if (!slide) return "empty";
  const bg = slide.background ? JSON.stringify(slide.background) : "default";
  const patterns = filterUtilities(slide.utilities)
    .filter((u) => /^hxs-bg-/.test(u))
    .sort()
    .join(",");
  return `${bg}|${patterns}`;
}

// 背景层组件：渲染 slide.background + 底纹 utilities（hxs-bg-grid 等）
// 独立 absolute inset-0；与内容层解耦，由 Deck 层的 AnimatePresence 控制是否重渲
// instant=true：用于 PDF 导出，立即定格不渐显（避免截到背景 fade 中间帧导致颜色还原失真）
//
// image 背景特殊处理：图片层 + theme.bg 半透明渐变 overlay 两层
// 目的：避免 LLM 选了高饱和图片后，前景标题/正文与图片色相近导致不可读
// overlay 用 theme.bg（浅主题用浅覆盖、深主题用深覆盖），顶部更浓底部稍弱保证整体不闷
function BackgroundLayer({ slide, instant }: { slide: SlideT; instant?: boolean }) {
  const bgStyle = backgroundToStyle(slide.background);
  const isImageBg = slide.background?.type === "image";
  const { pattern: patternUtils } = splitUtilities(filterUtilities(slide.utilities));
  return (
    <motion.div
      className="absolute inset-0 z-0"
      style={isImageBg ? undefined : bgStyle}
      initial={instant ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={instant ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: instant ? 0 : 0.4 }}
    >
      {isImageBg && (
        <>
          <div aria-hidden className="absolute inset-0" style={bgStyle} />
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(to bottom, color-mix(in srgb, var(--hxs-bg) 60%, transparent) 0%, color-mix(in srgb, var(--hxs-bg) 30%, transparent) 100%)",
            }}
          />
        </>
      )}
      {patternUtils.map((u) => (
        <div
          key={u}
          aria-hidden
          className={cn("absolute inset-0 pointer-events-none", u)}
        />
      ))}
    </motion.div>
  );
}
