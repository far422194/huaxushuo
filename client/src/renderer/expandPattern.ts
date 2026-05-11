import type { Slide, Deck } from "@shared/dsl";

// Pattern 解析器：传入 pattern id 返回 pattern 主体（slides 数组），未命中返回 undefined
// 编辑器场景由 client/src/data/patterns.ts 提供；独立站场景不需要（发布前已预展开）
export type PatternResolver = (id: string) => { slides: Slide[] } | undefined;

// 把 pattern 作为 base，slide 自身的非 undefined 字段作 override
// 数组字段（blocks / utilities）：slide 提供则覆盖整个数组；否则用 pattern 的
// 简单字段（layout / transition / background / showPageNumber 等）：slide 提供则覆盖
function mergeSlide(base: Slide, override: Slide): Slide {
  // override.blocks 长度 0 视为"未提供"（让 pattern 默认 blocks 生效）；> 0 则覆盖
  const blocks = override.blocks.length > 0 ? override.blocks : base.blocks;
  const utilities = override.utilities ?? base.utilities;
  // id / patternRef 始终用 override（id 是当前 deck 内唯一标识，不可继承 pattern 的）
  return {
    id: override.id || base.id,
    patternRef: override.patternRef,
    layout: override.layout ?? base.layout,
    transition: override.transition ?? base.transition,
    transitionDuration: override.transitionDuration ?? base.transitionDuration,
    background: override.background ?? base.background,
    notes: override.notes ?? base.notes,
    showPageNumber: override.showPageNumber ?? base.showPageNumber,
    utilities,
    blocks,
  };
}

// 展开单页：若 patternRef 命中 pattern 库则与 base 合并，否则原样返回
export function expandSlide(slide: Slide, resolve?: PatternResolver): Slide {
  if (!slide.patternRef || !resolve) return slide;
  const pat = resolve(slide.patternRef);
  if (!pat || pat.slides.length === 0) return slide;
  // pattern 多页时只用第一页作 base（简化模型；多页 pattern 由 PatternPicker 一次性插入多个 slide）
  return mergeSlide(pat.slides[0], slide);
}

// 整个 deck 一次性预展开（发布时用，让独立站 deck.json self-contained）
export function expandDeck(deck: Deck, resolve?: PatternResolver): Deck {
  if (!resolve) return deck;
  return {
    ...deck,
    slides: deck.slides.map((s) => {
      const expanded = expandSlide(s, resolve);
      // 展开后清理 patternRef 字段（独立站不需要）
      const { patternRef: _omit, ...rest } = expanded;
      return rest as Slide;
    }),
  };
}
