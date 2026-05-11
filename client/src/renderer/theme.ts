import type { Theme, Background } from "@shared/dsl";

// 中文优先的 fallback 字体栈
const CN_FALLBACK = `"PingFang SC", "Hiragino Sans GB", "Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif`;
const CN_SERIF_FALLBACK = `"Songti SC", "Source Han Serif SC", "Noto Serif SC", "STSong", Georgia, serif`;

function fontStack(name: string): string {
  if (/serif|Georgia|times/i.test(name)) {
    return `"${name}", ${CN_SERIF_FALLBACK}`;
  }
  return `"${name}", ${CN_FALLBACK}`;
}

// 把主题转成 CSS 变量；inline style 能直接挂到容器上
export function themeToCssVars(theme: Theme): React.CSSProperties {
  const c = theme.colors;
  return {
    ["--hxs-bg" as string]: c.bg,
    ["--hxs-fg" as string]: c.fg,
    ["--hxs-primary" as string]: c.primary,
    ["--hxs-accent" as string]: c.accent ?? c.primary,
    ["--hxs-muted" as string]: c.muted ?? "#94a3b8",
    // 命名语义色：未提供时用合理默认（红 / 绿 / 橙 / 蓝），保证 utility / tone 渲染始终有色
    ["--hxs-danger" as string]:  c.danger  ?? "#ef4444",
    ["--hxs-success" as string]: c.success ?? "#22c55e",
    ["--hxs-warning" as string]: c.warning ?? "#f97316",
    ["--hxs-info" as string]:    c.info    ?? "#0ea5e9",
    ["--hxs-radius" as string]: radiusValue(theme.radius),
    ["--hxs-font-heading" as string]: fontStack(theme.fonts.heading),
    ["--hxs-font-body" as string]: fontStack(theme.fonts.body),
    fontFamily: fontStack(theme.fonts.body),
    color: c.fg,
    backgroundColor: c.bg,
  };
}

function radiusValue(radius: Theme["radius"]): string {
  switch (radius) {
    case "none": return "0";
    case "sm": return "0.25rem";
    case "md": return "0.5rem";
    case "lg": return "0.75rem";
    case "xl": return "1rem";
    default: return "0.5rem";
  }
}

export function backgroundToStyle(bg?: Background): React.CSSProperties {
  if (!bg) return {};
  if (bg.type === "solid") {
    return { backgroundColor: bg.color };
  }
  if (bg.type === "gradient") {
    const angle = bg.angle ?? 135;
    return { backgroundImage: `linear-gradient(${angle}deg, ${bg.from}, ${bg.to})` };
  }
  // image
  return {
    backgroundImage: `url(${bg.url})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    opacity: bg.opacity,
  };
}
