import { useMemo } from "react";
import {
  HXS_UTILITIES,
  CATEGORY_LABELS,
  type UtilityDef,
} from "@shared/dsl";
import { cn } from "@/lib/cn";

const MAX = 8;

// 按 category 分组的 chip 多选；选中状态来自 value: string[]，onChange 回写
export function UtilitiesEditor({
  value,
  onChange,
  hint,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  hint?: string;
}) {
  const groups = useMemo(() => {
    const out: Record<string, UtilityDef[]> = {};
    for (const u of HXS_UTILITIES) {
      (out[u.category] ??= []).push(u);
    }
    return out;
  }, []);

  const selected = new Set(value);
  const toggle = (name: string) => {
    if (selected.has(name)) {
      onChange(value.filter((v) => v !== name));
    } else if (value.length < MAX) {
      onChange([...value, name]);
    }
  };

  return (
    <div className="space-y-2.5">
      {Object.entries(groups).map(([cat, list]) => (
        <div key={cat}>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
            {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]}
          </p>
          <div className="flex flex-wrap gap-1">
            {list.map((u) => {
              const isSel = selected.has(u.name);
              return (
                <button
                  key={u.name}
                  type="button"
                  onClick={() => toggle(u.name)}
                  title={u.desc}
                  className={cn(
                    "text-[11px] px-2 py-0.5 rounded border transition-colors",
                    isSel
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-slate-50",
                    !isSel && value.length >= MAX && "opacity-40 cursor-not-allowed"
                  )}
                  disabled={!isSel && value.length >= MAX}
                >
                  {u.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-slate-400 leading-relaxed">
        {hint ?? "已选 " + value.length + " / " + MAX + "。鼠标悬停看用途；切换风格时会重新生效"}
      </p>
    </div>
  );
}
