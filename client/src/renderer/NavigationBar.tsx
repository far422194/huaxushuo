import { Home, ChevronLeft, ChevronRight } from "lucide-react";
import { useRuntime } from "./runtime";

// 演示导航条：固定在 Deck 容器底部，覆盖在 slide 上方
// - 进度条：当前页 / 总页数
// - 按钮：首页 / 上一页 / 下一页
// 编辑器画布会通过 showNavigation={false} 关闭（Toolbar 已有切页）
export function NavigationBar() {
  const { currentIndex, totalSlides, next, prev, goToIndex } = useRuntime();
  if (totalSlides <= 1) return null;

  const goHome = () => goToIndex(0);
  const ratio = ((currentIndex + 1) / totalSlides) * 100;

  return (
    <div
      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: "6px",
      }}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/85 backdrop-blur-md shadow-lg border border-black/5">
        <NavButton onClick={goHome} disabled={currentIndex === 0} title="回到首页">
          <Home size={14} />
        </NavButton>
        <NavButton onClick={prev} disabled={currentIndex === 0} title="上一页（←）">
          <ChevronLeft size={14} />
        </NavButton>
        <span className="px-2 text-xs tabular-nums text-slate-600 select-none min-w-[44px] text-center">
          {currentIndex + 1} / {totalSlides}
        </span>
        <NavButton
          onClick={next}
          disabled={currentIndex >= totalSlides - 1}
          title="下一页（→）"
        >
          <ChevronRight size={14} />
        </NavButton>
      </div>
      <div className="relative h-1 rounded-full bg-black/10 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-300"
          style={{ width: `${ratio}%`, backgroundColor: "var(--hxs-primary)" }}
        />
      </div>
    </div>
  );
}

function NavButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        "p-1.5 rounded-full transition-colors " +
        (disabled
          ? "opacity-30 cursor-not-allowed text-slate-400"
          : "text-slate-700 hover:bg-slate-100")
      }
    >
      {children}
    </button>
  );
}
