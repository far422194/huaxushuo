// 用户输入页数解析公共模块
// 抽出 NUM/UNIT/LOCAL/TOTAL 正则常量 + parseNumWord，给 agent.ts 和 prompts.ts 共用
// 历史教训：两边各自维护一份字面常量，改一处忘另一处 → 行为漂移

// 中文数字 → 阿拉伯数字（覆盖一-九十九，足够 deck 页数估算）
const CN_DIGIT: Record<string, number> = {
  一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

// 英文数字 → 阿拉伯（覆盖 one-ninety + 整十；deck 页数足够，hundreds 极少出现）
const EN_DIGIT: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

// 解析中/英/阿拉伯数字字符串为整数；不识别时返回 0
export function parseNumWord(s: string): number {
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s);
  const lower = s.toLowerCase();
  if (lower in EN_DIGIT) return EN_DIGIT[lower]!;
  // 「twenty-one」「thirty five」等复合英文：拆开取和（容错处理，不强求语法）
  if (/^[a-z]+[-\s][a-z]+$/i.test(s)) {
    const parts = lower.split(/[-\s]+/);
    let sum = 0;
    for (const p of parts) sum += EN_DIGIT[p] ?? 0;
    if (sum > 0) return sum;
  }
  // 中文：十X / X十 / X十Y / 单字
  if (s.length === 1) return CN_DIGIT[s] ?? 0;
  if (s === "十") return 10;
  if (s.startsWith("十")) return 10 + (CN_DIGIT[s[1]!] ?? 0);
  if (s.endsWith("十")) return (CN_DIGIT[s[0]!] ?? 0) * 10;
  if (s.includes("十")) {
    const [a, b] = s.split("十");
    return (CN_DIGIT[a!] ?? 0) * 10 + (CN_DIGIT[b!] ?? 0);
  }
  return 0;
}

// 数字模式：阿拉伯 / 中文（一-十）/ 英文（one-nineteen + 整十 + twenty-one 复合）
export const NUM_PATTERN =
  "\\d+|[一二两三四五六七八九十]+|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\\s](?:one|two|three|four|five|six|seven|eight|nine))?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen";

// 单位模式：覆盖中英文常见量词（页/张/篇/节/章/幻灯片/PPT/slides/pages）
export const UNIT_PATTERN = "页|张|个?页面|个?幻灯片|篇|节|章节?|slides?|pages?";

// 「第 N 页 / 最后 N 页 / 倒数 N 页 / last N pages」等局部页码引用 —— 这些是页面索引不是总页数，需先剔除
export function buildLocalReferenceRegex(): RegExp {
  return new RegExp(`(?:第|最后|倒数|last)\\s*(?:${NUM_PATTERN})\\s*(?:${UNIT_PATTERN})`, "gi");
}

// 「N 页 / N 张 / N pages / N 个 PPT」等总页数表达
export function buildTotalCountRegex(): RegExp {
  return new RegExp(`(${NUM_PATTERN})\\s*(?:${UNIT_PATTERN}|个?PPT)`, "gi");
}

// 从用户消息提取明确总页数 —— 用 matchAll 取所有命中里**最大的数字**
// 例：「## 第 1 页 ... ## 第 10 页 ...」→ 10；「做 8 页 PPT」→ 8；「生成一页」→ 1
// 找不到 / 数值不合理（≥200）时返回 undefined，让调用方决定是否走默认 / 兜底
export function extractTotalPageCount(userMessage: string): number | undefined {
  const cleaned = userMessage.replace(buildLocalReferenceRegex(), "");
  const totalRe = buildTotalCountRegex();
  let max = 0;
  for (const m of cleaned.matchAll(totalRe)) {
    const n = parseNumWord(m[1]!);
    if (n > 0 && n < 200 && n > max) max = n;
  }
  return max > 0 ? max : undefined;
}
