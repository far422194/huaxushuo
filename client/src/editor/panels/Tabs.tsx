import { cn } from "@/lib/cn";

// 通用水平 TAB 切换组件 —— PropertyPanel 顶层与各 Panel 内层共用
export function Tabs<T extends string>({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; disabled?: boolean; hint?: string }[];
  size?: "sm" | "md";
}) {
  const padCls = size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs";
  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 bg-slate-50/60 sticky top-0 z-10">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            onClick={() => !o.disabled && onChange(o.value)}
            title={o.hint}
            className={cn(
              "rounded font-medium transition-colors",
              padCls,
              active
                ? "bg-white text-blue-700 shadow-sm border border-slate-200"
                : o.disabled
                ? "text-slate-300 cursor-not-allowed"
                : "text-slate-500 hover:text-slate-800 hover:bg-white/60"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
