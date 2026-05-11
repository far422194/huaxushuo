import { applyPatch, type Operation } from "fast-json-patch";
import { nanoid } from "nanoid";
import type { ZodError } from "zod";
import { DeckSchema, type Deck } from "@shared/dsl";

// 各 provider 共用的工具调用处理逻辑
export interface ProcessOptions {
  toolName: string;
  toolInput: any;
  currentDeck?: Deck;
}

export interface ProcessOutcome {
  deck?: Deck;
  source?: "create" | "patch";
  summary?: string;
  error?: string;
}

export function processToolCall({ toolName, toolInput, currentDeck }: ProcessOptions): ProcessOutcome {
  if (toolName === "create_deck") {
    // 宽容兜底：LLM 偶尔把 deck 误传为 JSON 字符串、用别名 input/value，或把 deck 字段直接平铺到 toolInput 顶层
    const deckCandidate = coerceDeck(toolInput);
    if (!deckCandidate) {
      const raw = (toolInput as any)?.deck;
      const isString = typeof raw === "string";
      const isTruncatedString =
        isString && raw.indexOf("{") >= 0 && !raw.trimEnd().endsWith("}");
      let stringifiedWarning = "";
      if (isString) {
        stringifiedWarning =
          `\n\n🚨🚨🚨 致命错误：你把 \`deck\` 字段值写成了 **JSON 字符串**（用双引号包裹整个 deck 对象），这是错误的！${
            isTruncatedString
              ? "更糟的是字符串被 max_tokens 截断了，连完整 deck 都没收到。"
              : ""
          }\n\n` +
          "**绝对禁止**：\n" +
          "```\n" +
          "❌ 错误：\"deck\": \"{\\\"version\\\": \\\"1.0\\\", \\\"meta\\\": ...}\"   ← 整个 deck 被引号包成 string\n" +
          "```\n\n" +
          "**必须使用真正的 JSON 对象（无引号包裹整体）**：\n" +
          "```\n" +
          "✅ 正确：\"deck\": {\"version\": \"1.0\", \"meta\": {...}, \"theme\": {...}, \"slides\": [...]}\n" +
          "```\n\n" +
          "本次重试请直接以 JSON 对象形式输出 deck，**绝不能把整个对象用引号包成字符串**。";
      }
      const hint = isTruncatedString
        ? "\n\n[用户侧建议] 字符串化 deck 输出已被 max_tokens 截断（这是部分服务的 streaming 协议 quirk，LLM 即使要输出真 object 也会被服务端串成字符串再截断）。**回灌 prompt 警告无法解决，必须调参**：\n  ① 在「模型设置」把当前模型的「最大输出 tokens」调高到 32000-64000（mimo / Gemini / Claude Sonnet 4.6 都支持 64K 量级）\n  ② 减少单次生成页数（明确说「5 页」别说「20 页」）\n  ③ 换更稳定的服务（Anthropic 原生协议 / GPT-4o / Gemini）"
        : "";
      return {
        error: `input.deck 必须是 JSON 对象（含 version/meta/theme/slides 字段），不能是字符串。\n实际收到：\`${JSON.stringify(toolInput).slice(0, 200)}\`${stringifiedWarning}${hint}`,
      };
    }
    const filled = fillSlideIds(deckCandidate);
    const result = DeckSchema.safeParse(filled);
    if (!result.success) return { error: formatZodError(result.error, filled) };
    return {
      deck: normalizeThemeContrast(result.data),
      source: "create",
      summary: `已生成 ${result.data.slides.length} 页演示`,
    };
  }

  if (toolName === "patch_deck") {
    if (!currentDeck) return { error: "patch_deck 需要现有 deck，但当前为空" };
    // 宽容兜底：LLM 偶尔把 patches 误传为字符串、单个 op 对象，或用别名（operations/ops/patch）
    const patches = coercePatches(toolInput);
    if (!patches) {
      // 检测「字符串化」/「字符串化 + 截断」组合
      const raw = (toolInput as any)?.patches;
      const isString = typeof raw === "string";
      const isTruncatedString =
        isString && raw.indexOf("[") >= 0 && !raw.trimEnd().endsWith("]");

      // 重试时回灌给 LLM 的错误：用极强势的语气 + 具体示例，避免 LLM 反复犯同样错
      let stringifiedWarning = "";
      if (isString) {
        stringifiedWarning =
          `\n\n🚨🚨🚨 致命错误：你把 \`patches\` 字段值写成了 **JSON 字符串**（用双引号包裹整个数组），这是错误的！${
            isTruncatedString
              ? "更糟的是字符串被 max_tokens 截断了，连第一个 op 都没写完，整批失败。"
              : ""
          }\n\n` +
          "**绝对禁止**：\n" +
          "```\n" +
          "❌ 错误：\"patches\": \"[{\\\"op\\\": \\\"add\\\", ...}]\"      ← 整个数组被引号包成 string\n" +
          "❌ 错误：\"patches\": \"[\\n  {\\n    \\\"op\\\": ...\\n  }\\n]\"  ← 同样错误\n" +
          "```\n\n" +
          "**必须使用真正的 JSON 数组（无引号包裹整体）**：\n" +
          "```\n" +
          "✅ 正确：\"patches\": [{\"op\": \"add\", \"path\": \"/slides/-\", \"value\": {...}}]\n" +
          "```\n\n" +
          "本次重试请直接以 JSON 数组形式输出 patches，**绝不能把整个数组用引号包成字符串**。";
      }

      const hint = isTruncatedString
        ? "\n\n[用户侧建议] 你的字符串化输出已被 max_tokens 截断 → 即使本次重试成功，也建议：①调高「最大输出 tokens」（mimo/Gemini 可填 64000）②减少每批页数（默认每批 3 页，长 deck 拆更小批）③换更稳定的服务（Anthropic / GPT-4o）"
        : "";

      return {
        error: `input.patches 必须是数组，每元素形如 \`{op:"add"|"replace"|"remove", path:"/slides/-", value:<slide>}\`。\n实际收到：\`${JSON.stringify(toolInput).slice(0, 200)}\`${stringifiedWarning}${hint}`,
      };
    }
    const base = JSON.parse(JSON.stringify(currentDeck));
    let patched: unknown;
    try {
      const r = applyPatch(base, patches as Operation[], true, false);
      patched = r.newDocument;
    } catch (err: any) {
      return { error: `patch 应用失败：${err?.message ?? String(err)}` };
    }
    const filled = fillSlideIds(patched);
    const result = DeckSchema.safeParse(filled);
    if (!result.success) return { error: formatZodError(result.error, filled) };
    return {
      deck: normalizeThemeContrast(result.data),
      source: "patch",
      summary: toolInput.summary || "已应用更新",
    };
  }

  return { error: `未知工具：${toolName}` };
}

// 把各种 LLM 误传的 deck 形态归一到原始对象：
// 1. toolInput.deck 是 object：直接用
// 2. toolInput.deck 是完整 JSON 字符串：parse 后看是不是 object
// 3. toolInput.deck 是被 max_tokens 截断的字符串：扫到最后一个完整 slide 闭合点 + 补 "]}" 让用户拿到前 N 页
// 4. 用了别名 input/value/data：依次尝试
// 5. toolInput 自己就长得像 deck（含 version + slides）：当 deck 用
// 失败返回 null，由调用方报具体错误
function coerceDeck(toolInput: any): any | null {
  if (!toolInput || typeof toolInput !== "object") return null;

  const looksLikeDeck = (v: any): boolean =>
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Array.isArray(v.slides);

  // 优先按 .deck 字段查；再按常见别名；最后看 toolInput 自身像不像 deck
  const candidates = [
    toolInput.deck,
    toolInput.input,
    toolInput.value,
    toolInput.data,
    toolInput,
  ];
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    if (looksLikeDeck(c)) return c;
    if (typeof c === "string") {
      try {
        const parsed = JSON.parse(c);
        if (looksLikeDeck(parsed)) return parsed;
      } catch {
        // 截断 / 非法 JSON：尝试恢复（仅当字符串看起来像 deck JSON 起步——含 "slides": 字段）
        const recovered = recoverTruncatedDeckString(c);
        if (recovered) return recovered;
      }
    }
  }
  return null;
}

// 截断恢复：deck 字符串被 max_tokens 截断时，扫到最后一个完整 slide 闭合点 + 补 "]}" 闭合 slides 数组与 deck 对象
// 假设：LLM 几乎都按 schema 顺序输出（version → meta → theme → variables → slides），slides 是顶层最后字段
// 让用户至少拿到前 N 个完整 slide，而不是整次生成失败；调用方会在错误条里给出 max_tokens 调高建议
function recoverTruncatedDeckString(text: string): any | null {
  const slidesMatch = text.match(/"slides"\s*:\s*\[/);
  if (!slidesMatch) return null;
  const slidesStart = slidesMatch.index! + slidesMatch[0].length;

  let depth = 0;
  let inString = false;
  let escape = false;
  let lastSafeSlideEnd = -1;
  for (let i = slidesStart; i < text.length; i++) {
    const ch = text[i]!;
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (inString) {
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      // 数组深度 0 + 遇到 } 表示 slides 数组里一个 slide 元素的闭合
      if (depth === 0 && ch === "}") lastSafeSlideEnd = i;
      // depth < 0 表示遇到 slides 数组的 ]，正常完整结束
      if (depth < 0) break;
    }
  }
  if (lastSafeSlideEnd < 0) return null;

  // 截到 lastSafeSlideEnd+1，补 ] 闭合 slides 数组、补 } 闭合 deck 对象
  const truncated = text.slice(0, lastSafeSlideEnd + 1) + "]}";
  try {
    const parsed = JSON.parse(truncated);
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray(parsed.slides) &&
      parsed.slides.length > 0
    ) {
      return parsed;
    }
  } catch {
    // 截断点更早（例如还在 theme 字段里），无法挽救
  }
  return null;
}

// 把各种 LLM 误传的 patch 形态归一到 RFC 6902 op 数组：
// 1. patches 是数组：直接用
// 2. patches 是完整 JSON 字符串：parse 后看是不是数组
// 3. patches 是被 max_tokens 截断的字符串：尽力恢复（截到最后一个完整 op 闭合）
// 4. patches 是单个 op 对象（含 op 字段）：包成 [op]
// 5. 用了别名 operations/ops/patch：递归处理
// 失败返回 null，由调用方报具体错误
function coercePatches(toolInput: any): any[] | null {
  if (!toolInput || typeof toolInput !== "object") return null;

  const candidates = [toolInput.patches, toolInput.operations, toolInput.ops, toolInput.patch];
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    if (Array.isArray(c)) return c;
    if (typeof c === "string") {
      // 先尝试完整 parse
      try {
        const parsed = JSON.parse(c);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === "object" && typeof parsed.op === "string") return [parsed];
      } catch {
        // 尝试截断恢复：扫到最后一个完整 op 对象闭合
        const recovered = recoverTruncatedPatchArray(c);
        if (recovered && recovered.length > 0) return recovered;
      }
    }
    if (typeof c === "object" && typeof (c as any).op === "string") {
      return [c];
    }
  }
  return null;
}

// 截断恢复：LLM 把 patches 写成字符串又被 max_tokens 截断时，扫 brace 计数取最后一个完整 op 闭合点
// 让用户至少能拿到前 N 页（即使第 N+1 页中途被截）
function recoverTruncatedPatchArray(text: string): any[] | null {
  const start = text.indexOf("[");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastSafeEnd = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (inString) {
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      // 在数组深度为 1 时遇到 } 表示一个 op 闭合（数组本身 [ 占 depth=1，op 的 } 让 depth 回到 1）
      if (depth === 1 && ch === "}") lastSafeEnd = i;
    }
  }
  if (lastSafeEnd < 0) return null;
  const truncated = text.slice(start, lastSafeEnd + 1) + "]";
  try {
    const arr = JSON.parse(truncated);
    return Array.isArray(arr) && arr.length > 0 ? arr : null;
  } catch {
    return null;
  }
}

// 主题对比度归一：dark 模式下 LLM 偶尔写出过暗的 fg/muted（与 bg 对比度 < 3:1），
// 导致正文几乎隐入背景。这里按 WCAG 相对亮度算对比度，未达 AA-large（3:1）时
// 替换为安全色（dark→#f1f5f9 / #94a3b8；light→#0f172a / #64748b）。
// 仅在 LLM 输出落地处生效，编辑器手动改色不经此路径。
const SAFE_FG: Record<"light" | "dark", string> = {
  light: "#0f172a",
  dark: "#f1f5f9",
};
const SAFE_MUTED: Record<"light" | "dark", string> = {
  light: "#64748b",
  dark: "#94a3b8",
};

function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function relLum(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number | null {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) return null;
  const la = relLum(ra);
  const lb = relLum(rb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function normalizeThemeContrast(deck: Deck): Deck {
  const mode = deck.theme.mode;
  const bg = deck.theme.colors.bg;
  const fg = deck.theme.colors.fg;
  const muted = deck.theme.colors.muted;

  const fgRatio = contrastRatio(fg, bg);
  const mutedRatio = muted ? contrastRatio(muted, bg) : null;

  // 任一项达标即不动；fg < 3 或 muted < 2.5 时才修
  // muted 阈值更低因为视觉上本就该弱化
  const fgBad = fgRatio !== null && fgRatio < 3;
  const mutedBad = mutedRatio !== null && mutedRatio < 2.5;
  if (!fgBad && !mutedBad) return deck;

  return {
    ...deck,
    theme: {
      ...deck.theme,
      colors: {
        ...deck.theme.colors,
        ...(fgBad ? { fg: SAFE_FG[mode] } : {}),
        ...(mutedBad ? { muted: SAFE_MUTED[mode] } : {}),
      },
    },
  };
}

function fillSlideIds(deck: unknown): unknown {
  if (deck && typeof deck === "object" && Array.isArray((deck as any).slides)) {
    const d = deck as any;
    d.slides = d.slides.map(fillOneSlideId);
  }
  return deck;
}

// 单页 id 补全：流式 streamParser 复用此方法
export function fillOneSlideId(slide: any): any {
  if (!slide || typeof slide !== "object") return slide;
  if (!slide.id || typeof slide.id !== "string" || slide.id.length === 0) {
    return { ...slide, id: nanoid(8) };
  }
  return slide;
}

// 把 zod issue 展平为可读字符串
// union 失败时 zod 默认只给 "Invalid input"，对 LLM 自修复无价值；这里递归展开 unionErrors
// 取每个分支的首条最具体 issue（最深 path），让 LLM 看到「分支1 期望 string；分支2 缺 text 字段」
// 同时附上实际收到的值快照（按 path 在 input 中取值），让重试有具体上下文
function formatSingleIssue(issue: any, input?: unknown, depth = 0): string {
  const pathStr = issue.path?.length ? issue.path.join(".") : "(root)";
  const received = depth === 0 && input !== undefined ? pickByPath(input, issue.path ?? []) : undefined;
  const receivedHint =
    received !== undefined
      ? ` | 实际收到：\`${JSON.stringify(received).slice(0, 160)}\``
      : "";

  if (issue.code === "invalid_union" && Array.isArray(issue.unionErrors)) {
    const branches = issue.unionErrors
      .map((sub: any, idx: number) => {
        const subIssue = pickDeepestIssue(sub.issues ?? []);
        if (!subIssue) return `分支${idx + 1}: 未知错误`;
        const subPath = subIssue.path?.length ? subIssue.path.join(".") : "";
        return `分支${idx + 1}${subPath ? ` @${subPath}` : ""}: ${subIssue.message}`;
      })
      .slice(0, 3)
      .join("；");
    return `· ${pathStr}: union 不匹配（${branches}）${receivedHint}`;
  }

  return `· ${pathStr}: ${issue.message}${receivedHint}`;
}

function pickDeepestIssue(issues: any[]): any | null {
  if (!issues.length) return null;
  return issues.reduce((best, cur) =>
    (cur.path?.length ?? 0) > (best.path?.length ?? 0) ? cur : best
  );
}

function pickByPath(root: unknown, path: (string | number)[]): unknown {
  let cur: any = root;
  for (const seg of path) {
    if (cur == null) return undefined;
    cur = cur[seg as any];
  }
  return cur;
}

export function formatZodError(err: ZodError, input?: unknown): string {
  return err.issues
    .slice(0, 8)
    .map((i) => formatSingleIssue(i, input))
    .join("\n");
}

export function buildUserMessage(userMessage: string, currentDeck?: Deck): string {
  return currentDeck
    ? `当前 deck 状态：\n\`\`\`json\n${JSON.stringify(currentDeck, null, 2)}\n\`\`\`\n\n用户指令：${userMessage}`
    : userMessage;
}
