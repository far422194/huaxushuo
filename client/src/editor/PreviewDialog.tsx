import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, ChevronLeft, ChevronRight, Maximize, Minimize } from "lucide-react";
import { useEditorStore } from "@/store/editor";
import { Deck as DeckRenderer } from "@/renderer";
import { getPattern } from "@/data/patterns";

// 与 Canvas 同款固定逻辑舞台尺寸
const STAGE_16_9 = { w: 1280, h: 720 };
const STAGE_4_3 = { w: 1024, h: 768 };

// 全屏预览：无编辑器干扰，模拟最终演示效果
// ESC 退出；←→ / Space 切页；F 切原生全屏
export function PreviewDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("dialog");
  const deck = useEditorStore((s) => s.deck);
  const startIndex = useEditorStore((s) => s.currentIndex);
  const [pageIndex, setPageIndex] = useState(() => Math.min(startIndex, deck.slides.length - 1));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 用 ref 持有最新 slides 长度，避免 useEffect 因依赖变化重注册 listener
  const totalRef = useRef(deck.slides.length);
  totalRef.current = deck.slides.length;
  // 转场节流：上次切页时间戳，避免快速连按打断动画引起异常
  const lastNavRef = useRef(0);
  const NAV_THROTTLE_MS = 280; // 与默认 fade 转场 ≈ 400ms 接近，留余量

  // 单一 useEffect 监听键盘 + 全屏变化，无依赖（listener 全程不重注册）
  useEffect(() => {
    const guard = () => {
      const now = Date.now();
      if (now - lastNavRef.current < NAV_THROTTLE_MS) return false;
      lastNavRef.current = now;
      return true;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.fullscreenElement) return; // 让浏览器处理 fullscreen ESC
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        e.stopPropagation();
        if (!guard()) return;
        setPageIndex((i) => Math.min(totalRef.current - 1, i + 1));
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        e.stopPropagation();
        if (!guard()) return;
        setPageIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    // 用 capture 阶段拦截，确保比 Editor Toolbar 的 keydown 先收到
    // 否则 ArrowRight 会被 Toolbar 的 listener 也消费，触发 Editor 内部 currentIndex 变化引起 store 变更
    window.addEventListener("keydown", onKey, true);
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[60] bg-slate-900 flex flex-col"
    >
      <header className="flex-shrink-0 px-4 py-2 flex items-center justify-between text-slate-300 bg-slate-900/80 backdrop-blur">
        <div className="text-xs">
          <span className="font-medium text-slate-100">{deck.meta.title || t("publish.summary.untitled")}</span>
          <span className="ml-3 text-slate-400">
            {pageIndex + 1} / {deck.slides.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-500 mr-2 hidden md:inline">
            ← / → · F · {t("preview.exitTip")}
          </span>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded hover:bg-slate-700 text-slate-300"
            title={isFullscreen ? t("publish.footer.cancel") : t("preview.title")}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-700 text-slate-300"
            title={t("preview.exitTip")}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center min-h-0 p-4 md:p-8">
        <PreviewStage deck={deck} pageIndex={pageIndex} setPageIndex={setPageIndex} />
      </div>

      <footer className="flex-shrink-0 px-4 py-2 flex items-center justify-center gap-3 bg-slate-900/80 backdrop-blur">
        <button
          onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
          disabled={pageIndex === 0}
          className="p-1.5 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs text-slate-400 tabular-nums min-w-[60px] text-center">
          {pageIndex + 1} / {deck.slides.length}
        </span>
        <button
          onClick={() => setPageIndex((i) => Math.min(deck.slides.length - 1, i + 1))}
          disabled={pageIndex >= deck.slides.length - 1}
          className="p-1.5 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </footer>
    </div>
  );
}

// 预览舞台：根据画幅模式 (auto / 16:9 / 4:3) 决定容器尺寸
function PreviewStage({
  deck,
  pageIndex,
  setPageIndex,
}: {
  deck: ReturnType<typeof useEditorStore.getState>["deck"];
  pageIndex: number;
  setPageIndex: (i: number) => void;
}) {
  const ratio = deck.meta.aspectRatio;

  if (ratio === "auto") {
    return (
      <div className="w-full h-full max-w-[1440px] bg-white rounded-lg overflow-hidden shadow-2xl">
        {/* 用默认 popLayout（不传 transitionMode），与编辑器一致，保证 Magic Move 在预览下也能跨 slide 飞行过渡 */}
        <DeckRenderer
          deck={deck}
          controlledIndex={pageIndex}
          onIndexChange={setPageIndex}
          keyboardNav={false}
          showNavigation={false}
          resolvePattern={getPattern}
        />
      </div>
    );
  }

  // 固定比例：固定逻辑 viewport（1280×720 / 1024×768）+ transform scale 缩到容器，内容永远完整可见
  // 进度胶囊（NavigationBar）保留——它是演示态固定 UI；LLM 生成时已被约束底部留安全区避让
  // 关键：外层容器不再用 CSS aspectRatio + maxHeight + 显式 width 三者组合（部分浏览器实现下 maxHeight 触发时
  // 会反向压缩 width 导致左右两侧多出留白）。改为外层 100%×100%，由内层 ScaleStage 把固定 viewport 缩到合适大小居中
  const stage = ratio === "16:9" ? STAGE_16_9 : STAGE_4_3;
  return (
    <div className="relative w-full h-full">
      <ScaleStage w={stage.w} h={stage.h}>
        <div className="absolute inset-0 bg-white rounded-lg overflow-hidden shadow-2xl">
          <DeckRenderer
            deck={deck}
            controlledIndex={pageIndex}
            onIndexChange={setPageIndex}
            keyboardNav={false}
            resolvePattern={getPattern}
          />
        </div>
      </ScaleStage>
    </div>
  );
}

// 固定 viewport 缩放舞台（与 Canvas.tsx 同实现：内容按 w×h 渲染，按容器尺寸 ResizeObserver 算 scale 等比缩放居中）
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
