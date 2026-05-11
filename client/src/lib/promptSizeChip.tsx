import { useTranslation } from "react-i18next";
import type { PromptSegments } from "@/llm/types";

// 进度条上的 prompt 体积 chip：显示本次（或本批）发给 LLM 的 system + user message 总体积
// hover tooltip 展示分段明细 + token 估算
// 组件由 Home ProgressBar 与 ChatPanel ProgressBubble 共用

export interface PromptInfo {
  systemChars: number;
  userChars: number;
  segments: PromptSegments;
  // 分批模式下的累计字符数（UI 层在收到每个 prompt 事件时累加）；单次模式与本次相等
  cumulativeChars: number;
  // 本次请求实际 max_tokens（智能/固定模式决策结果）；UI 据此 chip 显示让用户验证
  maxTokens?: number;
}

// 字符 → token 粗估：中英文混合按 0.4 折算（中文 ~0.5、英文 ~0.25，混合取中间值）
// 量级正确即可，不追求精确（精确需要走 tokenizer 实例化）
function charsToTokens(chars: number): number {
  return Math.round(chars * 0.4);
}

function fmtKB(chars: number): string {
  return (chars / 1024).toFixed(1);
}

// max_tokens 紧凑显示：≥1000 用 K 后缀（16K / 32K），否则原数字
function fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return `${n}`;
}

export function PromptSizeChip({
  info,
  isBatch,
  className,
}: {
  info: PromptInfo;
  isBatch?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("chat");
  const totalChars = info.systemChars + info.userChars;
  const totalKb = fmtKB(totalChars);
  const cumKb = fmtKB(info.cumulativeChars);

  // tooltip 用 \n 分行（浏览器原生 title 支持多行；不引入额外 popover 库）
  const lines: string[] = [t("promptSize.tooltipTitle")];
  if (info.segments.base > 0) {
    lines.push(t("promptSize.tooltipBase", { kb: fmtKB(info.segments.base) }));
  }
  if (info.segments.skill > 0) {
    lines.push(
      t("promptSize.tooltipSkill", {
        kb: fmtKB(info.segments.skill),
        name: info.segments.skillName ?? "",
      })
    );
  }
  if (info.segments.style > 0) {
    lines.push(t("promptSize.tooltipStyle", { kb: fmtKB(info.segments.style) }));
  }
  if (info.segments.aspect > 0) {
    lines.push(t("promptSize.tooltipAspect", { kb: fmtKB(info.segments.aspect) }));
  }
  if (info.segments.pages > 0) {
    lines.push(t("promptSize.tooltipPages", { kb: fmtKB(info.segments.pages) }));
  }
  if (info.userChars > 0) {
    lines.push(t("promptSize.tooltipUserMsg", { kb: fmtKB(info.userChars) }));
  }
  lines.push(
    t("promptSize.tooltipTotal", {
      kb: totalKb,
      tokens: (charsToTokens(totalChars) / 1024).toFixed(1),
    })
  );
  if (info.maxTokens != null && info.maxTokens > 0) {
    lines.push(t("promptSize.tooltipMaxTokens", { value: info.maxTokens.toLocaleString() }));
  }
  const tooltip = lines.join("\n");

  const baseLabel = isBatch
    ? t("promptSize.chipBatch", { kb: totalKb, cumKb })
    : t("promptSize.chip", { kb: totalKb });
  const maxLabel = info.maxTokens != null && info.maxTokens > 0
    ? ` · max ${fmtTokens(info.maxTokens)}`
    : "";

  return (
    <span
      className={
        className ??
        "px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium border border-slate-200 cursor-help tabular-nums"
      }
      title={tooltip}
    >
      📝 {baseLabel}{maxLabel}
    </span>
  );
}
