// max_tokens 决策模块：把"按场景动态选 max_tokens"的逻辑从 providers 抽出来集中管理。
//
// 用户在配置里有两种 mode：
// - "auto"（智能分配，默认）：override 作为"模型输出上限 cap"。系统按 estimatePages + 是否分批
//   在 cap 之内自动选 target。小 deck 自动用小 max_tokens 省 KV cache，大 deck 不被截。
// - "fixed"（固定分配）：override 作为"每次都用这个值"。完全尊重用户的硬指定，无论场景。
//
// 未填 override 时（无论 mode），fallback 到按 model name 推断的厂商上限默认表 + 场景 target。

import type { ProviderId } from "./types";

export type MaxTokensMode = "auto" | "fixed";

// 厂商输出上限默认表（用户未填 override 时的 fallback）
// 注意：这是"输出窗口上限"，不是"上下文窗口"。多数厂商两者不同。
export function inferModelOutputCap(model: string, provider: ProviderId): number {
  const m = model.toLowerCase();
  if (m.includes("deepseek")) return 16000;
  if (m.includes("moonshot") || m.includes("kimi")) return 16000;
  if (m.includes("qwen")) return 64000;
  if (m.includes("glm-5")) return 16000;
  if (m.includes("glm-5.1")) return 32000;
  if (m.includes("gemini")) return 64000;
  if (m.includes("opus-4-7")) return 128000;
  if (m.includes("sonnet-4-6")) return 128000;
  if (m.includes("haiku-4-5")) return 64000;
  if (m.includes("gpt-5.5-pro") || m.includes("gpt-5.5")) return 128000;
  if (m.includes("mimo-v2-omni")) return 64000;
  if (m.includes("mimo-v2.5-pro") || m.includes("mimo-v2.5")) return 128000;
  if (m.includes("minimax") || m.includes("abab")) return 128000;
  return provider === "anthropic" ? 32000 : 16000;
}

// 按模型输出 cap 推「每批应包含多少页」
// 让分批粒度与模型能力联动：cap 越大，每批装得越多，LLM 往返次数越少
// 单页 budget 取 ~8K（含 slide JSON + thinking + tool 调用骨架），覆盖复杂 slide（多 block + 长文）
// 上限 12 页：单批失败成本不会过大，保留分批「首批快出」的本意
export function inferPagesPerBatch(
  model: string,
  provider: ProviderId,
  override?: number,
): number {
  const cap = override && override > 0 ? override : inferModelOutputCap(model, provider);
  if (cap <= 16000) return 2;   // 2 页 × 8K = 16K（cap 全用，每页足够 token 复杂场景）
  if (cap <= 32000) return 4;   // 4 页 × 8K = 32K
  if (cap <= 64000) return 8;   // 8 页 × 8K = 64K
  return 12;                    // 12 页（128K cap 实际只用 ~96K，留余量）
}

// 按场景在 cap 之内选目标 max_tokens
// auto 模式：cap = override || 厂商默认；target = 按 estimate / batched 选；返回 min(target, cap)
// fixed 模式：override > 0 则直接返回 override；无 override 退化为 auto
export function chooseMaxTokens(opts: {
  mode?: MaxTokensMode;
  override?: number;
  model: string;
  provider: ProviderId;
  estimate: number;
  batched?: boolean;
}): number {
  const mode = opts.mode ?? "auto";

  // fixed 模式：用户明确填了固定值就直接用
  if (mode === "fixed" && opts.override && opts.override > 0) {
    return opts.override;
  }

  // auto 或 fixed 但未填 → 走场景决策
  const cap = opts.override && opts.override > 0
    ? opts.override
    : inferModelOutputCap(opts.model, opts.provider);

  // 分批 vs 单次差异化：
  //   - 分批：直接用 cap（pagesPerBatch 已限了每批工作量上限，给到 cap 让 thinking 模型不被 squash）
  //     例 cap=16K + 2 页/批：用 16K 而非 13K，避免 thinking 模型在 2 页 + reasoning 内被截断
  //   - 单次：按「页数 × 单页 budget + 固定 headroom」算
  //     单页 budget 5K：实测单页 slide JSON ~3K token + thinking 增量 ~1.5K
  //     headroom 3K：tool 调用骨架 + 整次共享 thinking 起始的固定开销
  //
  // 单次实例：
  //   - 1 页 deck → 8K；2 页 → 13K；10 页 → 53K（cap=128K 模型不被截）
  //
  // 历史 bug 防护：
  //   1. 「分批永远 16K」（旧阶梯把 estimate≤10 全压在 16K）→ 分批走 cap，自适应模型大小
  //   2. 「单次大 deck 在小 cap 模型上 16K 截断」→ 单次按 estimate 算，cap 内最大化
  //   3. 「分批小 cap + chunk=2 给 13K thinking 截断」→ 分批走 cap，与旧串行行为一致
  const target = opts.batched ? cap : opts.estimate * 5000 + 3000;
  return Math.min(target, cap);
}
