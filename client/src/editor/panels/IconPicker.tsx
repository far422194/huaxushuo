import { useMemo, useState } from "react";
import { HXS_ICON_NAMES, type HxsIconName } from "@shared/dsl";
import { ICON_MAP } from "@/renderer/blocks/iconMap";
import { cn } from "@/lib/cn";

// 图标选择器：搜索 + 网格点击。仅展示白名单 71 个图标
export function IconPicker({
  value,
  onChange,
}: {
  value: HxsIconName | undefined;
  onChange: (name: HxsIconName) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HXS_ICON_NAMES;
    return HXS_ICON_NAMES.filter((n) => n.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="space-y-1.5">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索图标（如 arrow、star、check）"
        className="w-full px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
      <div className="max-h-48 overflow-auto grid grid-cols-6 gap-1 p-1.5 border border-slate-200 rounded bg-slate-50/50">
        {filtered.map((name) => {
          const Component = ICON_MAP[name];
          if (!Component) return null;
          const isSelected = value === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              title={name}
              className={cn(
                "aspect-square flex items-center justify-center rounded transition-colors",
                isSelected
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 hover:bg-blue-100 hover:text-blue-700 border border-slate-200"
              )}
            >
              <Component size={14} strokeWidth={2} />
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-6 py-3 text-center text-[10px] text-slate-400">
            没有匹配的图标
          </p>
        )}
      </div>
      {value && <p className="text-[10px] text-slate-500 font-mono">{value}</p>}
    </div>
  );
}
