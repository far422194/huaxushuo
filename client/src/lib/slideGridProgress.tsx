import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { BatchInfo, ProgressEvent } from "@/llm/types";

// 分批生成进度的视觉化：N 个小方格按页对应总数（estimate），状态有四档
// 1) done: 已生成 → 蓝色填充
// 2) inBatch: 当前批范围内但未生成 → 蓝色 outline + pulse 动画（分批模式）
// 3) reasoning: connecting/thinking/reasoning 阶段所有未生成方格 pulse（视觉提示「准备中」）
// 4) pending: 其他情况 → 浅灰 outline
//
// reasoning 阶段（LLM 在思考，未输出 deck）：所有方格 pulse，让用户看到视觉变化而非全静止；
// receiving/slide/page 阶段（LLM 在输出 deck）：方格按 generated 逐格亮起。
export function SlideGridProgress({
  total,
  generated,
  batch,
  phase,
  className,
}: {
  total: number;
  generated: number;
  batch?: BatchInfo;
  phase?: ProgressEvent["kind"];
  className?: string;
}) {
  // 平滑动画：buffered 输出场景下 generated 可能从 0 瞬间跳到 N（layout 计数 / slide 事件批量到达），
  // 矩阵会一次性满屏看不到逐格填充。在组件内部用 displayGenerated state 平滑过渡——
  // 每 STEP_MS 递增 1 直到追上 target generated，让矩阵填充始终保持视觉节奏。
  const [displayGenerated, setDisplayGenerated] = useState(0);
  const targetRef = useRef(0);
  targetRef.current = generated;
  useEffect(() => {
    const STEP_MS = 80;
    if (displayGenerated >= generated) {
      // 目标比当前小（重置场景，如新一次生成），直接对齐
      if (displayGenerated > generated) setDisplayGenerated(generated);
      return;
    }
    const id = setInterval(() => {
      setDisplayGenerated((d) => {
        if (d >= targetRef.current) {
          return targetRef.current;
        }
        return d + 1;
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, [generated, displayGenerated]);

  // 总格数取 max(estimate, generated) 防止 estimate 不准导致溢出 100% 后无格可点亮
  const cellCount = Math.max(total, generated, 1);
  // 上限保护：超过 80 页时只显示前 80（避免移动端折行过多 + 大 deck 性能）
  const displayCount = Math.min(cellCount, 80);
  const truncated = cellCount > displayCount;

  const batchStart = batch ? batch.pageOffset + 1 : 0;
  const batchEnd = batch ? batch.pageOffset + batch.pageCount : 0;
  // reasoning/thinking/connecting 阶段：LLM 还没输出 deck，让所有未生成方格 pulse 给视觉反馈
  const isPreOutput = phase === "reasoning" || phase === "thinking" || phase === "connecting";

  const cells = [];
  for (let i = 1; i <= displayCount; i++) {
    // 用 displayGenerated 平滑值而非瞬时 generated，避免 buffered 场景一次性满屏
    const isDone = i <= displayGenerated;
    const isInBatch = !!batch && !isDone && i >= batchStart && i <= batchEnd;
    const isReasoningPulse = !isDone && !isInBatch && isPreOutput;
    cells.push(
      <span
        key={i}
        title={`${i}/${cellCount}`}
        className={cn(
          "inline-block w-2 h-2 rounded-sm transition-colors duration-200",
          isDone
            ? "bg-blue-500"
            : isInBatch
              ? "border border-blue-400 bg-blue-200/60 animate-pulse"
              : isReasoningPulse
                ? "border border-blue-300 bg-blue-100/50 animate-pulse"
                : "border border-blue-200/70 bg-transparent",
        )}
      />,
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-[3px] items-center", className)}>
      {cells}
      {truncated && (
        <span className="text-[10px] text-blue-500/70 ml-1">+{cellCount - displayCount}</span>
      )}
    </div>
  );
}
