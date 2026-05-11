import i18n from "@/i18n";
import type { BatchInfo, ProgressEvent } from "@/llm/types";

// 进度阶段文字：从 ChatPanel/Home 抽出共用，加分批模式前缀
// 调用者可传 streamingMode + streamingSlideCount 显示"边生成边渲染中… N 页"
// 分批模式下整体前缀「(批 X/Y) 」让用户知道当前在第几批
export function phaseLabel(
  phase: ProgressEvent["kind"],
  current: number,
  estimate: number,
  streamingMode = false,
  streamingSlideCount = 0,
  bytes?: number,
  batch?: BatchInfo
): string {
  const t = i18n.t.bind(i18n);
  const prefix = batch
    ? (t("chat:phase.batchPrefix", { current: batch.current, total: batch.total }) as string)
    : "";
  // 流式模式下已落地至少 1 页：显示「正在生成第 X / Y 页…」（X = 已落地页数 + 1）
  // 全部 emit 完显示「整理收尾…」；0 页落地时落到下方原 phase 文案（让 connecting/thinking 等早期文本继续可见）
  if (streamingMode && streamingSlideCount > 0) {
    const totalPages = Math.max(streamingSlideCount, estimate);
    if (streamingSlideCount >= totalPages) {
      return prefix + (t("chat:phase.finishing") as string);
    }
    return (
      prefix +
      (t("chat:phase.streaming", { current: streamingSlideCount + 1, total: totalPages }) as string)
    );
  }
  switch (phase) {
    case "connecting":
      return prefix + (t("chat:phase.connecting") as string);
    case "thinking":
      // 分批模式下补充「即将生成第 X-Y 页」让用户在 prefill 长空窗期知道在做什么
      if (batch && batch.pageCount > 0) {
        const from = batch.pageOffset + 1;
        const to = batch.pageOffset + batch.pageCount;
        return prefix + (batch.pageCount === 1
          ? (t("chat:phase.thinkingBatchSingle", { page: from }) as string)
          : (t("chat:phase.thinkingBatch", { from, to }) as string));
      }
      return prefix + (t("chat:phase.thinking") as string);
    case "reasoning":
      // 模型推理流（thinking_delta / reasoning_content）；区别于 tool 输出
      // 推理量 > 100KB 切换警告文案：thinking 模型可能 reasoning 失控（10 页简单 deck 实际只需 ~15K
      // 输出，100KB+ reasoning 几乎可断定是模型在反复纠结），提示用户考虑取消换非 thinking 模型
      if (bytes && bytes > 100 * 1024) {
        return prefix + (t("chat:phase.reasoningWarning", { bytes: formatBytes(bytes) }) as string);
      }
      return (
        prefix +
        (bytes
          ? (t("chat:phase.reasoningWithBytes", { bytes: formatBytes(bytes) }) as string)
          : (t("chat:phase.reasoning") as string))
      );
    case "receiving":
      return (
        prefix +
        (bytes
          ? (t("chat:phase.receivingWithBytes", { bytes: formatBytes(bytes) }) as string)
          : (t("chat:phase.receiving") as string))
      );
    case "page":
      return prefix + (t("chat:phase.page", { current, estimate }) as string);
    case "tool":
      return prefix + (t("chat:phase.tool") as string);
    case "slide":
      // patch 模式（非 streaming）下 slide 事件只是 parser 副产品（实际不 append 到 store），
      // 但 anthropic 兜底 page 事件已让 current > 0；此时优先显示「生成第 X / Y 页…」
      // 而不是默认的「首页准备中…」，避免 page ↔ slide 事件交替导致文案闪烁
      if (current > 0 && estimate > 0) {
        return prefix + (t("chat:phase.page", { current, estimate }) as string);
      }
      return prefix + (t("chat:phase.slideStart") as string);
    case "applying":
      return prefix + (t("chat:phase.applying") as string);
    default:
      return prefix + (t("chat:phase.generating") as string);
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
