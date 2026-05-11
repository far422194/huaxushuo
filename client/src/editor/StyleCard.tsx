import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { StylePrompt } from "@/data/stylePrompts";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/time";
import { localizedName, localizedDescription } from "@/data/builtinLabels";

// 风格卡：用 SVG 微缩 16:9 + 主色/字体渲染封面，让用户一眼看到风格
export function StyleCard({
  style,
  selected,
  onClick,
  onDelete,
}: {
  style: StylePrompt;
  selected?: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const { t: tCommon } = useTranslation("common");
  const { t: tDialog } = useTranslation("dialog");
  const displayName = localizedName(style, "style");
  const displayDescription = localizedDescription(style, "style");
  const sourceTag =
    style.source === "ai-generated"
      ? { label: "AI", cls: "bg-amber-50 text-amber-700 border-amber-200" }
      : style.source === "user-saved"
      ? { label: tDialog("stylePreview.tagMine"), cls: "bg-blue-50 text-blue-700 border-blue-200" }
      : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group text-left rounded-xl border bg-white overflow-hidden hover:shadow-md transition-all",
        selected ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-blue-400"
      )}
    >
      <StyleCover style={style} />
      <div className="p-3">
        <div className="flex items-center justify-between gap-1.5">
          <h3 className="text-sm font-semibold text-slate-800 line-clamp-1">{displayName}</h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            {sourceTag && (
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", sourceTag.cls)}>
                {sourceTag.label}
              </span>
            )}
            {onDelete && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onDelete();
                }}
                className="hidden group-hover:inline-flex p-1 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                title={tCommon("actions.delete")}
              >
                <Trash2 size={10} />
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">{displayDescription}</p>
        {style.durationMs ? (
          <p className="text-[10px] text-slate-400 mt-1.5">{formatDuration(style.durationMs)}</p>
        ) : null}
      </div>
    </button>
  );
}

// 风格封面：基于 theme 渲染微缩演示页（背景、标题、几个色点）
export function StyleCover({ style, ratio = "16/9" }: { style: StylePrompt; ratio?: string }) {
  const displayName = localizedName(style, "style");
  const displayDescription = localizedDescription(style, "style");
  const c = style.theme.colors;
  const isDark = style.theme.mode === "dark";
  const bg =
    isDark
      ? `linear-gradient(135deg, ${c.bg} 0%, ${darken(c.primary, -0.4)} 100%)`
      : c.bg;
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        aspectRatio: ratio,
        background: bg,
        fontFamily: style.theme.fonts.heading,
      }}
    >
      <div className="absolute inset-0 flex flex-col justify-between p-4">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: c.accent ?? c.primary, color: isDark ? c.bg : "#fff" }}
          >
            {style.emoji}
          </span>
          <span className="text-[9px] font-medium opacity-70" style={{ color: c.fg }}>
            {displayName}
          </span>
        </div>
        <div>
          <div
            className="font-bold text-xl leading-tight tracking-tight"
            style={{ color: c.fg }}
          >
            {displayName}
          </div>
          <div className="text-[10px] mt-0.5 opacity-70" style={{ color: c.fg }}>
            {displayDescription.slice(0, 18)}
          </div>
          <div className="flex gap-1 mt-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.primary }} />
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.accent ?? c.primary }} />
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.muted ?? c.fg, opacity: 0.4 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// 把 hex 颜色调亮/调暗（amount: -1..1）
function darken(hex: string, amount: number): string {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  r = Math.max(0, Math.min(255, Math.round(r + amount * 255)));
  g = Math.max(0, Math.min(255, Math.round(g + amount * 255)));
  b = Math.max(0, Math.min(255, Math.round(b + amount * 255)));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
