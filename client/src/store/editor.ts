import { create } from "zustand";
import { produce, type Draft } from "immer";
import { nanoid } from "nanoid";
import type { Deck, Slide, Block, Layout, Theme } from "@shared/dsl";
import { DEFAULT_THEME } from "@shared/dsl";

// 选中维度：deck（无 slide/block）/ slide（仅 slideId）/ block（slideId + blockIndex）
export interface Selection {
  slideId?: string;
  blockIndex?: number;
}

export type EditorView = "home" | "editor";

// 流式承载备份：取消时回滚使用
interface StreamingBackup {
  deck: Deck;
  past: Deck[];
  future: Deck[];
  currentIndex: number;
  selection: Selection;
}

// 骨架 slide id，用于流式期间「等待第一页落地」的占位
export const SKELETON_SLIDE_ID = "__skeleton__";
// 占位 slide id 前缀：tool 事件触发时按 batchInfo.pageCount 预插 N 个占位
// 让用户在 prefill 长空窗期看到「视觉上 N 页骨架」，实际 slide 流式落地时 FIFO 替换
export const PLACEHOLDER_ID_PREFIX = "__placeholder_";

// 单页 block 数量硬上限：schema 端不限制（允许 LLM 生成任意数量），编辑器侧给个保护防止误操作
// 20 应足够任何视觉合理的 slide（hero/title-content 实际 3-6，复杂网格 ≤ 12）
export const BLOCKS_PER_SLIDE_MAX = 20;

export function isPlaceholderSlideId(id: string): boolean {
  return id.startsWith(PLACEHOLDER_ID_PREFIX);
}

interface EditorState {
  view: EditorView;
  deck: Deck;
  currentIndex: number;
  selection: Selection;
  past: Deck[];
  future: Deck[];

  // 当前活跃的对话 id（编辑器内继续对话时把 messages 写到此 conversation）
  currentConversationId?: string;
  // 当前选中的风格提示词 id（影响生成）
  selectedStyleId?: string;

  // 流式承载（仅 create 流式期间为 true，期间不入历史栈）
  streamingMode: boolean;
  streamingBackup?: StreamingBackup;

  // 画布拖拽状态（block 在 slide 内拖动重排时使用），仅 UI 状态，不入历史
  dragBlockFrom: number | null;
  dragBlockOver: number | null;
  setDragBlock: (state: { from: number | null; over: number | null }) => void;

  // 视图与会话
  setView: (v: EditorView) => void;
  setCurrentConversationId: (id: string | undefined) => void;
  setSelectedStyleId: (id: string | undefined) => void;

  // 导航
  setCurrentIndex: (i: number) => void;
  selectSlide: (slideId: string | undefined) => void;
  selectBlock: (slideId: string, blockIndex: number) => void;
  clearSelection: () => void;

  // 提交：所有 deck 变更走这里，自动入栈历史
  commit: (producer: (draft: Draft<Deck>) => void) => void;

  // 高级动作（封装 commit）
  loadDeck: (deck: Deck) => void;
  addSlide: (layout?: Layout) => void;
  // 在当前页之后插入 N 张 slide（来自 Pattern 库）；id 全部重新生成
  insertSlidesAfterCurrent: (slides: Slide[]) => void;
  removeSlide: (slideId: string) => void;
  duplicateSlide: (slideId: string) => void;
  moveSlide: (from: number, to: number) => void;
  updateSlide: (slideId: string, mutate: (draft: Draft<Slide>) => void) => void;
  addBlock: (slideId: string, block: Block) => void;
  removeBlock: (slideId: string, blockIndex: number) => void;
  updateBlock: (slideId: string, blockIndex: number, mutate: (draft: Draft<Block>) => void) => void;
  moveBlock: (slideId: string, from: number, to: number) => void;
  // 自由布局专用：更新 block 在画布的百分比位置
  updateBlockPosition: (slideId: string, blockIndex: number, xPct: number, yPct: number) => void;
  // 把当前 slide 转为自由布局，position 由调用方提供（一般来自 DOM 测量）
  convertSlideToFreeLayout: (slideId: string, positions: { xPct: number; yPct: number }[]) => void;
  updateMeta: (mutate: (draft: Draft<Deck["meta"]>) => void) => void;
  updateTheme: (mutate: (draft: Draft<Theme>) => void) => void;

  // 图片 URL 批量替换：生成态的"配图增强"（picsum → Pexels）专用，不入历史栈
  // 用户手动改图走 updateBlock 路径；这里仅在 agent 异步增强时调用
  replaceImageUrls: (sub: Map<string, string>) => void;

  // 撤销 / 重做
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // 流式承载（不入历史栈；commitStreamingDeck 时把备份 deck 作为单个 history 节点）
  // keepView=true 时不切到 editor 视图（分批模式用：保持在 Home 让用户看进度，全部完成才切）
  startStreamingDeck: (opts?: { keepView?: boolean }) => void;
  appendStreamingSlide: (slide: Slide) => void;
  commitStreamingDeck: (finalDeck: Deck) => void;
  cancelStreamingDeck: (opts: { keepPartial: boolean }) => void;
  // 分批生成的批间过渡：仅替换 deck 不动 past/future/streamingBackup，避免每批都污染撤销栈
  // 最后一批结束才用 commitStreamingDeck 一次性入 past，撤销 1 步即回到分批前
  applyStreamingBatch: (deckSoFar: Deck) => void;
  // 占位 slide：tool 事件确认后按 batchInfo.pageCount 预插 N 个，让用户视觉上立刻有骨架
  insertPlaceholderSlides: (count: number) => void;
  clearStreamingPlaceholders: () => void;
}

const HISTORY_LIMIT = 50;

const blankDeck = (): Deck => ({
  version: "1.0",
  meta: { title: "未命名演示", aspectRatio: "auto" },
  theme: DEFAULT_THEME,
  variables: {},
  slides: [
    {
      id: nanoid(8),
      layout: "hero",
      transition: "fade",
      blocks: [
        { type: "heading", level: 1, text: "新演示", align: "center" },
        { type: "text", text: "用一句自然语言开始构建。", align: "center" },
      ],
    },
  ],
});

const defaultBlockFor = (layout: Layout): Block => {
  switch (layout) {
    case "hero":
    case "cta":
      return { type: "heading", level: 1, text: "新页面", align: "center" };
    case "two-column":
      return { type: "heading", level: 2, text: "新两栏页", align: "center" };
    case "embed":
      return { type: "iframe", url: "https://example.com" };
    default:
      return { type: "heading", level: 2, text: "新页面" };
  }
};

// appendStreamingSlide 批量错峰节奏：相邻两次 append 至少间隔此毫秒数
// 应对 LLM buffered 输出（slide 事件同 tick 批量到达）让用户看到「逐格填充」而非瞬间满屏
const APPEND_MIN_INTERVAL_MS = 80;
let lastScheduledAppendAt = 0;

// 单个占位 slide：tool 阶段预插，等真实 slide 落地时 FIFO 替换
// 用 hero layout + 简短文案保证渲染层零改动（任意视图都能 render）
const makePlaceholderSlide = (idx: number, label: string): Slide => ({
  id: `${PLACEHOLDER_ID_PREFIX}${idx}_${nanoid(4)}`,
  layout: "hero",
  transition: "fade",
  blocks: [
    { type: "heading", level: 2, text: label, align: "center" },
  ],
});

// 骨架 deck：流式开始时占位渲染，避免 currentIndex/边界判断踩空
const skeletonDeck = (): Deck => ({
  version: "1.0",
  meta: { title: "生成中…", aspectRatio: "auto" },
  theme: DEFAULT_THEME,
  variables: {},
  slides: [
    {
      id: SKELETON_SLIDE_ID,
      layout: "hero",
      transition: "fade",
      blocks: [
        { type: "heading", level: 1, text: "生成中…", align: "center" },
        { type: "text", text: "AI 正在边生成边渲染，请稍候。", align: "center" },
      ],
    },
  ],
});

export const useEditorStore = create<EditorState>((set, get) => ({
  view: "home",
  deck: blankDeck(),
  currentIndex: 0,
  selection: {},
  past: [],
  future: [],
  currentConversationId: undefined,
  streamingMode: false,
  streamingBackup: undefined,
  dragBlockFrom: null,
  dragBlockOver: null,

  setDragBlock: ({ from, over }) => set({ dragBlockFrom: from, dragBlockOver: over }),

  setView: (v) => set({ view: v }),
  setCurrentConversationId: (id) => set({ currentConversationId: id }),
  setSelectedStyleId: (id) => set({ selectedStyleId: id }),

  setCurrentIndex: (i) => {
    const { deck } = get();
    const len = deck.slides.length;
    if (len === 0) {
      set({ currentIndex: 0 });
      return;
    }
    const clamped = Math.max(0, Math.min(len - 1, i));
    // 用户主动切页(快捷键 / 工具栏按钮)需同步 selection 到新页,让右侧属性栏跟随更新;
    // 原 block 选择跨页无意义,清掉。流式生成 / deck reload 等内部场景走直接 set,不经此入口
    const newSlideId = deck.slides[clamped]?.id;
    set({
      currentIndex: clamped,
      selection: newSlideId ? { slideId: newSlideId } : {},
    });
  },

  selectSlide: (slideId) => {
    const { deck } = get();
    if (!slideId) {
      set({ selection: {} });
      return;
    }
    const idx = deck.slides.findIndex((s) => s.id === slideId);
    if (idx >= 0) {
      set({ selection: { slideId }, currentIndex: idx });
    }
  },

  selectBlock: (slideId, blockIndex) => {
    const { deck } = get();
    const idx = deck.slides.findIndex((s) => s.id === slideId);
    if (idx >= 0) set({ selection: { slideId, blockIndex }, currentIndex: idx });
  },

  clearSelection: () => set({ selection: {} }),

  commit: (producer) => {
    const { deck, past } = get();
    const next = produce(deck, producer);
    if (next === deck) return;
    const nextPast = past.length >= HISTORY_LIMIT ? past.slice(1) : past;
    set({ deck: next, past: [...nextPast, deck], future: [] });
  },

  loadDeck: (deck) => {
    set({
      deck,
      currentIndex: 0,
      selection: {},
      past: [],
      future: [],
      view: "editor",
    });
  },

  replaceImageUrls: (sub) => {
    if (sub.size === 0) return;
    const { deck } = get();
    const next = produce(deck, (draft) => {
      for (const slide of draft.slides) {
        if (
          slide.background?.type === "image" &&
          sub.has(slide.background.url)
        ) {
          slide.background.url = sub.get(slide.background.url)!;
        }
        walkAndSwapImageUrls(slide.blocks as any, sub);
      }
    });
    if (next !== deck) set({ deck: next });
  },

  addSlide: (layout = "title-content") => {
    const id = nanoid(8);
    get().commit((draft) => {
      const insertAt = (get().currentIndex ?? 0) + 1;
      draft.slides.splice(insertAt, 0, {
        id,
        layout,
        transition: "fade",
        blocks: [defaultBlockFor(layout)],
      });
    });
    // 选中新加的页
    const newIdx = (get().currentIndex ?? 0) + 1;
    set({ currentIndex: newIdx, selection: { slideId: id } });
  },

  insertSlidesAfterCurrent: (slides) => {
    if (slides.length === 0) return;
    const newSlides = slides.map((s) => ({ ...s, id: nanoid(8) }));
    get().commit((draft) => {
      const insertAt = (get().currentIndex ?? 0) + 1;
      draft.slides.splice(insertAt, 0, ...newSlides);
    });
    const newIdx = (get().currentIndex ?? 0) + 1;
    set({ currentIndex: newIdx, selection: { slideId: newSlides[0].id } });
  },

  removeSlide: (slideId) => {
    // 删除前记录被删 slide 在 deck 中的索引，用于决定新 selection 切到哪张
    const prevDeck = get().deck;
    const removedIdx = prevDeck.slides.findIndex((s) => s.id === slideId);
    get().commit((draft) => {
      if (draft.slides.length <= 1) return;
      const idx = draft.slides.findIndex((s) => s.id === slideId);
      if (idx >= 0) draft.slides.splice(idx, 1);
    });
    const { deck, currentIndex } = get();
    const nextIdx = Math.max(0, Math.min(currentIndex, deck.slides.length - 1));
    // 切到相邻 slide：优先取原索引位置（被删后该位置是后一张），首页删除取 0
    const targetIdx = removedIdx >= 0 ? Math.min(removedIdx, deck.slides.length - 1) : nextIdx;
    const targetSlide = deck.slides[targetIdx];
    set({
      currentIndex: nextIdx,
      // 保留 slide 维度选中，让 PropertyPanel 保持在 slide TAB 而非退回 deck TAB
      selection: targetSlide ? { slideId: targetSlide.id } : {},
    });
  },

  duplicateSlide: (slideId) => {
    const newId = nanoid(8);
    get().commit((draft) => {
      const idx = draft.slides.findIndex((s) => s.id === slideId);
      if (idx < 0) return;
      const original = draft.slides[idx]!;
      const copy: Slide = JSON.parse(JSON.stringify(original));
      copy.id = newId;
      draft.slides.splice(idx + 1, 0, copy);
    });
    const newIdx = get().deck.slides.findIndex((s) => s.id === newId);
    if (newIdx >= 0) set({ currentIndex: newIdx, selection: { slideId: newId } });
  },

  moveSlide: (from, to) => {
    const prevCurrent = get().currentIndex;
    get().commit((draft) => {
      if (from < 0 || from >= draft.slides.length) return;
      const clampedTo = Math.max(0, Math.min(draft.slides.length - 1, to));
      const [item] = draft.slides.splice(from, 1);
      if (item) draft.slides.splice(clampedTo, 0, item);
    });
    // currentIndex 跟随被移动页 / 相对位移补偿，避免主舞台显示错误页
    const len = get().deck.slides.length;
    if (len === 0) return;
    const clampedTo = Math.max(0, Math.min(len - 1, to));
    let next = prevCurrent;
    if (prevCurrent === from) {
      // 用户拖的就是当前页 → 跟随到目标位置
      next = clampedTo;
    } else if (from < prevCurrent && clampedTo >= prevCurrent) {
      // 被拖页原本在当前页之前，移到当前页或之后 → 当前页相对前移 1
      next = prevCurrent - 1;
    } else if (from > prevCurrent && clampedTo <= prevCurrent) {
      // 被拖页原本在当前页之后，移到当前页或之前 → 当前页相对后移 1
      next = prevCurrent + 1;
    }
    if (next !== prevCurrent) {
      set({ currentIndex: Math.max(0, Math.min(len - 1, next)) });
    }
  },

  updateSlide: (slideId, mutate) => {
    get().commit((draft) => {
      const slide = draft.slides.find((s) => s.id === slideId);
      if (slide) mutate(slide);
    });
  },

  addBlock: (slideId, block) => {
    get().commit((draft) => {
      const slide = draft.slides.find((s) => s.id === slideId);
      if (!slide) return;
      if (slide.blocks.length >= BLOCKS_PER_SLIDE_MAX) return;
      slide.blocks.push(block as Draft<Block>);
    });
  },

  removeBlock: (slideId, blockIndex) => {
    get().commit((draft) => {
      const slide = draft.slides.find((s) => s.id === slideId);
      if (!slide) return;
      slide.blocks.splice(blockIndex, 1);
    });
    set({ selection: { slideId } });
  },

  updateBlock: (slideId, blockIndex, mutate) => {
    get().commit((draft) => {
      const slide = draft.slides.find((s) => s.id === slideId);
      if (!slide) return;
      const block = slide.blocks[blockIndex];
      if (block) mutate(block);
    });
  },

  moveBlock: (slideId, from, to) => {
    get().commit((draft) => {
      const slide = draft.slides.find((s) => s.id === slideId);
      if (!slide) return;
      if (from < 0 || from >= slide.blocks.length) return;
      const clamped = Math.max(0, Math.min(slide.blocks.length - 1, to));
      const [item] = slide.blocks.splice(from, 1);
      if (item) slide.blocks.splice(clamped, 0, item);
    });
  },

  updateBlockPosition: (slideId, blockIndex, xPct, yPct) => {
    get().commit((draft) => {
      const slide = draft.slides.find((s) => s.id === slideId);
      if (!slide) return;
      const block = slide.blocks[blockIndex];
      if (!block) return;
      const cur = (block as any).position ?? {};
      (block as any).position = { ...cur, xPct, yPct };
    });
  },

  convertSlideToFreeLayout: (slideId, positions) => {
    get().commit((draft) => {
      const slide = draft.slides.find((s) => s.id === slideId);
      if (!slide) return;
      slide.layout = "free";
      slide.blocks.forEach((b, i) => {
        const p = positions[i];
        if (p) {
          const cur = (b as any).position ?? {};
          (b as any).position = { ...cur, xPct: p.xPct, yPct: p.yPct };
        }
      });
    });
  },

  updateMeta: (mutate) => {
    get().commit((draft) => mutate(draft.meta));
  },

  updateTheme: (mutate) => {
    get().commit((draft) => mutate(draft.theme));
  },

  undo: () => {
    const { past, future, deck } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1]!;
    set({
      deck: prev,
      past: past.slice(0, -1),
      future: [...future, deck],
      selection: {},
    });
  },

  redo: () => {
    const { past, future, deck } = get();
    if (future.length === 0) return;
    const next = future[future.length - 1]!;
    set({
      deck: next,
      past: [...past, deck],
      future: future.slice(0, -1),
      selection: {},
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  startStreamingDeck: (opts) => {
    if (get().streamingMode) return;
    // 重置 append throttle 时间戳，避免上次 streaming 残留 schedule 影响本次首页 delay
    lastScheduledAppendAt = 0;
    const { deck, past, future, currentIndex, selection, view } = get();
    set({
      streamingMode: true,
      streamingBackup: { deck, past, future, currentIndex, selection },
      deck: skeletonDeck(),
      currentIndex: 0,
      selection: {},
      // 始终保留当前视图：生成完成后由调用方显式 setView("editor")
      // 避免边生边渲时用户在 editor 看到只有 N-1 页的半成品状态
      view: opts?.keepView !== false ? view : "editor",
    });
  },

  appendStreamingSlide: (slide: Slide) => {
    if (!get().streamingMode) return;

    // 批量错峰：LLM buffered 输出场景下，多个 slide 事件可能在同一 tick 内同步触发
    // （N 个 setState 被 React 合并为一帧，用户看不到逐格填充）。
    // 用 lastScheduledAt 时间戳排队，保证相邻两次 append 至少间隔 APPEND_MIN_INTERVAL_MS。
    // 真流式场景（每 100ms+ 来一个 slide）下 delay=0 立即 append，无副作用；
    // buffered 场景下 N 个 slide 错峰 80ms 渲染一个，矩阵能看到逐格填充过程。
    const now = Date.now();
    const scheduledAt = Math.max(now, lastScheduledAppendAt + APPEND_MIN_INTERVAL_MS);
    lastScheduledAppendAt = scheduledAt;
    const delay = scheduledAt - now;

    const doAppend = () => {
      if (!get().streamingMode) return;
      const next = produce(get().deck, (draft) => {
        // 第一次 append 时移除骨架占位
        if (draft.slides.length === 1 && draft.slides[0]?.id === SKELETON_SLIDE_ID) {
          draft.slides.splice(0, 1);
        }
        // 优先 FIFO 替换最早的 placeholder（tool 阶段预插的占位）
        // 没有 placeholder 才走 push 老路径
        const phIdx = draft.slides.findIndex((s) => isPlaceholderSlideId(s.id));
        if (phIdx >= 0) {
          draft.slides[phIdx] = slide as Draft<Slide>;
        } else {
          draft.slides.push(slide as Draft<Slide>);
        }
      });
      // 高亮当前页：替换 placeholder 时跟着移到该位置；否则停在末尾
      const currentIndex = (() => {
        const i = next.slides.findIndex((s) => s.id === slide.id);
        return i >= 0 ? i : Math.max(0, next.slides.length - 1);
      })();
      set({ deck: next, currentIndex });
    };

    if (delay === 0) {
      doAppend();
    } else {
      setTimeout(doAppend, delay);
    }
  },

  insertPlaceholderSlides: (count: number) => {
    if (!get().streamingMode) return;
    if (count <= 0) return;
    const next = produce(get().deck, (draft) => {
      // 首次插入时移除骨架占位（与 appendStreamingSlide 行为对齐）
      if (draft.slides.length === 1 && draft.slides[0]?.id === SKELETON_SLIDE_ID) {
        draft.slides.splice(0, 1);
      }
      const baseIdx = draft.slides.length;
      for (let i = 0; i < count; i++) {
        // 文案保持简短：用户已在 ProgressBubble 看到「即将生成第 X-Y 页」，
        // 占位卡片内只需要一个轻量提示，避免视觉噪声
        draft.slides.push(makePlaceholderSlide(baseIdx + i, "…") as Draft<Slide>);
      }
    });
    set({ deck: next });
  },

  clearStreamingPlaceholders: () => {
    if (!get().streamingMode) return;
    const { deck } = get();
    if (!deck.slides.some((s) => isPlaceholderSlideId(s.id))) return;
    const next = produce(deck, (draft) => {
      draft.slides = draft.slides.filter((s) => !isPlaceholderSlideId(s.id)) as Draft<Slide>[];
    });
    set({ deck: next, currentIndex: Math.max(0, next.slides.length - 1) });
  },

  applyStreamingBatch: (deckSoFar: Deck) => {
    if (!get().streamingMode) return;
    const current = get().deck;
    const placeholderCount = current.slides.filter((s) => isPlaceholderSlideId(s.id)).length;

    // 占位感知替换：批内 slide 事件可能因 LLM 输出格式漂移而漏发（占位没被实时替换）。
    // 此时不能整体替换 deck（会清掉用户已看到的已生成页 + 失去本批渐进感），
    // 而是把 deckSoFar 尾部「本批新增的页数」与当前占位逐个对应替换，余下占位剔除。
    if (placeholderCount > 0 && deckSoFar.slides.length >= placeholderCount) {
      // 本批实际新增页数 = deckSoFar 总页数 - 当前 deck 中真实页数（排除占位）
      const realNow = current.slides.length - placeholderCount;
      const realNew = Math.max(0, deckSoFar.slides.length - realNow);
      // 从 deckSoFar 尾部取 realNew 页，依次替换占位（FIFO），多余占位剔除
      const newSlides = deckSoFar.slides.slice(deckSoFar.slides.length - realNew);
      const next = produce(current, (draft) => {
        let used = 0;
        const filtered: Draft<Slide>[] = [];
        for (const s of draft.slides) {
          if (isPlaceholderSlideId(s.id)) {
            if (used < newSlides.length) {
              filtered.push(newSlides[used] as Draft<Slide>);
              used++;
            }
            // 用完真实新页就丢掉剩余占位（实际生成 < pageCount）
          } else {
            filtered.push(s);
          }
        }
        // meta/theme/version 等顶层字段以 deckSoFar 为准（最新 LLM 返回）
        draft.slides = filtered;
        draft.meta = deckSoFar.meta;
        draft.theme = deckSoFar.theme;
        draft.variables = deckSoFar.variables;
        draft.version = deckSoFar.version;
      });
      set({ deck: next, currentIndex: Math.max(0, next.slides.length - 1) });
      return;
    }

    // 无占位（首批 / 占位已全部被实时替换）：保持原整体替换语义
    set({ deck: deckSoFar, currentIndex: Math.max(0, deckSoFar.slides.length - 1) });
  },

  commitStreamingDeck: (finalDeck: Deck) => {
    const { streamingBackup, past } = get();
    // 兜底过滤：finalDeck 可能来自 partial（含占位的 store deck），保证入历史的 deck 干净
    const cleaned = finalDeck.slides.some((s) => isPlaceholderSlideId(s.id))
      ? { ...finalDeck, slides: finalDeck.slides.filter((s) => !isPlaceholderSlideId(s.id)) }
      : finalDeck;
    if (!streamingBackup) {
      // 没备份时（异常路径），直接 loadDeck 行为
      set({ deck: cleaned, currentIndex: 0, selection: {}, streamingMode: false });
      return;
    }
    // 备份的 deck 作为撤销目标入 past（受 HISTORY_LIMIT 截断）
    const nextPast = past.length >= HISTORY_LIMIT ? past.slice(1) : past;
    set({
      deck: cleaned,
      past: [...nextPast, streamingBackup.deck],
      future: [],
      currentIndex: 0,
      selection: {},
      streamingMode: false,
      streamingBackup: undefined,
    });
  },

  cancelStreamingDeck: ({ keepPartial }) => {
    const { streamingBackup, deck, past } = get();
    if (!streamingBackup) {
      set({ streamingMode: false });
      return;
    }
    // 真实落地的 slide（排除骨架与占位）
    const realSlides = deck.slides.filter(
      (s) => s.id !== SKELETON_SLIDE_ID && !isPlaceholderSlideId(s.id),
    );
    const noReal = realSlides.length === 0;

    if (!keepPartial || noReal) {
      // 完整回滚到备份
      set({
        deck: streamingBackup.deck,
        past: streamingBackup.past,
        future: streamingBackup.future,
        currentIndex: streamingBackup.currentIndex,
        selection: streamingBackup.selection,
        streamingMode: false,
        streamingBackup: undefined,
      });
      return;
    }
    // 保留已生成部分：剔除占位后写回 deck，备份 deck 入 past 作为撤销目标
    const cleanedDeck =
      realSlides.length === deck.slides.length
        ? deck
        : { ...deck, slides: realSlides };
    const nextPast = past.length >= HISTORY_LIMIT ? past.slice(1) : past;
    set({
      deck: cleanedDeck,
      currentIndex: Math.max(0, cleanedDeck.slides.length - 1),
      past: [...nextPast, streamingBackup.deck],
      future: [],
      streamingMode: false,
      streamingBackup: undefined,
    });
  },
}));

// 递归 walk slide.blocks，命中替换映射就改 url（含 card/modal/tab 嵌套子块）
function walkAndSwapImageUrls(blocks: any[], sub: Map<string, string>): void {
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "image" && typeof b.url === "string" && sub.has(b.url)) {
      b.url = sub.get(b.url);
    }
    if ((b.type === "card" || b.type === "modal") && Array.isArray(b.children)) {
      walkAndSwapImageUrls(b.children, sub);
    }
    if (b.type === "tab" && Array.isArray(b.tabs)) {
      for (const tab of b.tabs) {
        if (Array.isArray(tab.blocks)) walkAndSwapImageUrls(tab.blocks, sub);
      }
    }
  }
}
