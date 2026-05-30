// 用户提示词分段：把详细文案按页面/章节标记切成多段，让 agent 按段分批生成 deck
// 解决：长文案（≥ 2000 字符）单次发给 LLM 时 prefill 慢，拆段后每批仅含当前段，prefill 大幅减小

export interface PromptSegment {
  title: string; // 段标题（去掉 markdown 前缀的标记行原文）
  body: string; // 段内容（含标记行 + 内容直到下一段或文末）
}

// 标记行匹配优先级：从上到下逐条尝试，命中即定该 deck 的分段方案
// 兼容 ## ~ ###### 任意级别 markdown 标题（用户写大纲时常嵌套多级，如「### 第1页」「###### 第6页」）
// 标题前缀（#+）/ 列表前缀（- * +）/ 纯文本均可：用户常把部分页码写成「- 第8页 xxx」列表项，
//   缩进列表「  - 第36页」也要识别，否则这些行被并进上一段，页数被吞（实测 63 页大纲漏成 49 页）
// （≥ 3 行命中才视为分段方案，单行「修改第 4 页加图」无法触发，无误判风险）
const LEAD = "(?:(?:#+|[-*+])\\s*)?"; // 可选前缀：markdown 标题 # / 列表符号 - * +
const MARKERS: RegExp[] = [
  new RegExp(`^\\s*${LEAD}第\\s*\\d+\\s*[\\s.、)：:．\\-—]?\\s*(?:页|部分|章|节)`), // 第 1 页 / 第 1 部分
  new RegExp(`^\\s*${LEAD}(?:Page|Slide|Section)\\s+\\d+`, "i"), // Page 1 / Slide 1
  /^#+\s*\d+[\s.、)]/, // ## 1. xxx / #### 1) xxx（无「页」字，纯编号标题；这条仍要求 # 前缀避免误命中正文里的「1. xxx」）
  /^---+\s*$/, // 水平分隔线（最弱信号，仅当上面都没命中）
];

// 标出 ``` 围栏内的行号（含围栏起止行本身）。代码 / 目录树 / 配置片段里常有以 # - 「第N页」
// 开头的行（如目录树「├- CLAUDE.md」、注释「# 项目层级」），不剔除会被当成分段标记把代码块切碎。
// 围栏不配对（奇数个 ```）时退化为「最后一个 ``` 之后全部视作围栏内」——宁可少切也不切碎代码。
function computeFencedLines(lines: string[]): Set<number> {
  const fenced = new Set<number>();
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i]!)) {
      fenced.add(i);
      inFence = !inFence;
      continue;
    }
    if (inFence) fenced.add(i);
  }
  return fenced;
}

// 检测分段：返回切出来的段数组。如果没匹配上任何标记或段数 < 3，返回空数组（让上层退化单次生成）
export function detectSegments(userMessage: string): PromptSegment[] {
  const lines = userMessage.split("\n");
  const fenced = computeFencedLines(lines);

  // 找哪条 marker 命中最多次，用它作为分段依据（围栏内的行不计入）
  let bestRegex: RegExp | null = null;
  let bestHits = 0;
  for (const re of MARKERS) {
    let hits = 0;
    for (let i = 0; i < lines.length; i++) if (!fenced.has(i) && re.test(lines[i]!)) hits++;
    if (hits > bestHits) {
      bestHits = hits;
      bestRegex = re;
    }
  }
  if (!bestRegex || bestHits < 3) return autoSegmentFallback(userMessage);

  // 用命中的正则切段：标记行作为段起点，前面的内容（如果有）丢弃成 preamble 不入段
  // 围栏内的行只入 body、不作切点，整块代码随所属段一起保留
  const segments: PromptSegment[] = [];
  let cur: PromptSegment | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!fenced.has(i) && bestRegex.test(line)) {
      if (cur) segments.push(cur);
      // title 前缀清理对齐 LEAD：标题 #+ 与列表符号 - * + 都剥掉（含缩进列表的行首空白）
      cur = { title: line.replace(/^\s*(?:#+|[-*+])\s*/, "").trim(), body: line + "\n" };
    } else if (cur) {
      cur.body += line + "\n";
    }
    // 标记行之前的行直接忽略
  }
  if (cur) segments.push(cur);

  // 段数仍 < 3 兜底（虽然 hits ≥ 3，但 cur 可能丢了一段）
  return segments.length >= 3 ? segments : autoSegmentFallback(userMessage);
}

// 自动切段兜底：用户长文案没写 `## 第 N 页` 标记时，按段落边界 + 字符数切
// 触发：length ≥ 3500 且 \n\n 切出的非空段落 ≥ 6；阈值保守，避免对中等文案破坏单次生成路径
const AUTO_SEG_MIN_CHARS = 3500;
const AUTO_SEG_MIN_PARAS = 6;
const AUTO_SEG_TARGET_CHARS = 1500; // 每段目标字符数（贴合首屏 prefill 预算）
function autoSegmentFallback(userMessage: string): PromptSegment[] {
  if (userMessage.length < AUTO_SEG_MIN_CHARS) return [];
  const paragraphs = userMessage.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length < AUTO_SEG_MIN_PARAS) return [];

  // 贪心打包：累计长度接近 AUTO_SEG_TARGET_CHARS 时切段，但保证段落不被切碎
  const segments: PromptSegment[] = [];
  let buf: string[] = [];
  let bufLen = 0;
  for (const para of paragraphs) {
    buf.push(para);
    bufLen += para.length;
    if (bufLen >= AUTO_SEG_TARGET_CHARS) {
      segments.push(makeAutoSeg(buf));
      buf = [];
      bufLen = 0;
    }
  }
  if (buf.length > 0) {
    if (segments.length > 0 && bufLen < AUTO_SEG_TARGET_CHARS / 3) {
      // 残留段落太短：合并到上一段，避免末尾出现明显短小的"边角段"
      const last = segments[segments.length - 1]!;
      last.body += "\n\n" + buf.join("\n\n");
    } else {
      segments.push(makeAutoSeg(buf));
    }
  }
  return segments.length >= 2 ? segments : [];
}

function makeAutoSeg(paragraphs: string[]): PromptSegment {
  const body = paragraphs.join("\n\n");
  const firstLine = paragraphs[0]!.split("\n")[0]!.trim();
  const title = firstLine.length > 30 ? firstLine.slice(0, 30) + "…" : firstLine;
  return { title, body };
}

// 虚拟分页 segments：用户给"短指令 + 明确页数"（如"做个 20 页性能说明"）时，
// 没有详细文案可切段，但仍需分批避免中小模型单次吐 20 页的自我截断。
// body 留空 = 不在 user message 里灌入"本批文案"块；header 的"本批第 X-Y / 共 N 页"足够让 LLM 知道页码范围，
// 续批靠 baseDeck 共享视觉风格 + LLM 自由规划主题。
export function buildVirtualPageSegments(n: number): PromptSegment[] {
  return Array.from({ length: n }, (_, i) => ({
    title: `第 ${i + 1} 页`,
    body: "",
  }));
}
