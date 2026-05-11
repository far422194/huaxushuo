// WCAG 2.x 颜色对比度计算
// 阈值：≥ 4.5 普通文本（AA）；≥ 3 大文本（AA）；≥ 7 高对比度（AAA）

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let s = hex.trim().replace(/^#/, "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  if (s.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(s)) return null;
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// sRGB → 相对亮度（WCAG 公式）
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

// 对比度（≥ 1）
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// 等级判断
export type ContrastLevel = "fail" | "weak" | "ok" | "great";
export function classifyContrast(ratio: number): ContrastLevel {
  if (ratio < 3) return "fail";       // 普通用户读起来困难
  if (ratio < 4.5) return "weak";     // 大文本通过 AA，普通文本不达标
  if (ratio < 7) return "ok";         // AA 普通文本
  return "great";                     // AAA 高对比度
}

// 给定背景色，找一个尽量保持原色调但对比度 ≥ 4.5 的 fg 候选（黑或白）
export function pickReadableForeground(bg: string, prefer: string = "#0f172a"): string {
  const cWith = contrastRatio(bg, prefer);
  if (cWith >= 4.5) return prefer;
  // 选黑白中对比度更高的那个
  const cBlack = contrastRatio(bg, "#0f172a");
  const cWhite = contrastRatio(bg, "#ffffff");
  return cBlack > cWhite ? "#0f172a" : "#ffffff";
}
