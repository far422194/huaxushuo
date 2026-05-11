import { SlideSchema, type Slide } from "@shared/dsl";
import { fillOneSlideId } from "./validate";

// 流式解析器：从 LLM 工具调用的 partial JSON 中提取每个完整 slide。
// 支持两种工具：
//   - create_deck：定位 "slides":[ 后扫单页对象，整体作 slide
//   - patch_deck：定位 "patches":[ 后扫每个 patch 对象，仅提取形如 {op:"add",path:"/slides/-",value:{...}} 的 value
// 单个 slide 闭合后 JSON.parse + fillOneSlideId + SlideSchema.safeParse；通过则发出，失败则跳过。
// 其他工具或 patch 中的非 add 操作空操作。

export interface SlideStreamParser {
  setToolName(name: string): void;
  feed(deltaJson: string): Slide[];
  isCreate(): boolean;
  getEmittedCount(): number;
}

export function createSlideStreamParser(): SlideStreamParser {
  let buffer = "";
  let scanCursor = 0;        // 全局扫描游标，下次 feed 从这里继续
  let arrayStart = -1;       // 数组 `[` 之后第一个字符的位置；-1 未找到
  let mode: "none" | "create" | "patch" = "none";
  let toolDecided = false;
  let emittedCount = 0;
  let arrayClosed = false;   // 已遇到目标数组的 ] 关闭

  const setToolName = (name: string) => {
    toolDecided = true;
    if (name === "create_deck") mode = "create";
    else if (name === "patch_deck") mode = "patch";
    else mode = "none";
  };

  const feed = (delta: string): Slide[] => {
    buffer += delta;
    if (!toolDecided || mode === "none" || arrayClosed) return [];

    // 第一步：定位目标数组开始位置（仅找一次）
    if (arrayStart < 0) {
      const match = mode === "create"
        ? locateArrayStart(buffer, "slides")
        : locateArrayStart(buffer, "patches");
      if (match < 0) return [];
      arrayStart = match;
      scanCursor = match;
    }

    const out: Slide[] = [];
    let i = scanCursor;
    const len = buffer.length;

    while (i < len) {
      const ch = buffer[i];
      // 跳过空白与逗号
      if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t" || ch === ",") {
        i++;
        continue;
      }
      // 数组结束
      if (ch === "]") {
        arrayClosed = true;
        scanCursor = i + 1;
        break;
      }
      // 期望对象起始
      if (ch !== "{") {
        // 异常字符，前进一格继续
        i++;
        continue;
      }
      // 找到对象起点，扫闭合
      const objEnd = findObjectEnd(buffer, i);
      if (objEnd < 0) {
        // 未闭合，等待更多 delta；保留 cursor 在对象起点
        scanCursor = i;
        return out;
      }
      const slice = buffer.slice(i, objEnd + 1);
      const slide = mode === "create" ? tryParseSlide(slice) : tryExtractAddSlide(slice);
      if (slide) {
        out.push(slide);
        emittedCount++;
      }
      // 不论成功与否都前进（失败的 slide 等最终整体 deck 校验时再被发现）
      i = objEnd + 1;
      scanCursor = i;
    }

    if (i >= len) scanCursor = i;
    return out;
  };

  return {
    setToolName,
    feed,
    isCreate: () => mode === "create",
    getEmittedCount: () => emittedCount,
  };
}

// 在 buffer 中找 `"<key>":[` 的位置（外层 `[` 之后第一个字符）
function locateArrayStart(buffer: string, key: string): number {
  const re = new RegExp(`"${key}"\\s*:\\s*\\[`, "g");
  const m = re.exec(buffer);
  if (!m) return -1;
  return m.index + m[0].length;
}

// 从 start（必须指向 `{`）开始扫，返回闭合 `}` 的索引；未闭合返回 -1
function findObjectEnd(buffer: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < buffer.length; i++) {
    const ch = buffer[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function tryParseSlide(slice: string): Slide | null {
  let raw: any;
  try {
    raw = JSON.parse(slice);
  } catch {
    return null;
  }
  const filled = fillOneSlideId(raw);
  const r = SlideSchema.safeParse(filled);
  if (!r.success) return null;
  return r.data;
}

// 从单个 JSON Patch 操作对象中提取 slide。
// 严格层：识别 {op:"add", path:"/slides/-", value:{...}}（prompt 里建议的标准形态）
// 宽松层：LLM 输出格式漂移容错——只要 op 是 add（或缺省）且 value 看起来像 slide（含 layout/blocks），
//   不死磕 path 必须为 "/slides/-"（path:"/slides/0"、"/slides/12" 等同样接受）
// 兜底层：raw 自身就像 slide（LLM 直接吐裸 slide 而非 patch）也能识别
// 这样续接批的流式 slide 事件不再因 path 写法差异静默丢失，进度按页实时反馈
function tryExtractAddSlide(slice: string): Slide | null {
  let raw: any;
  try {
    raw = JSON.parse(slice);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;

  // 候选 slide：优先取 value，失败回落到 raw 自身（覆盖 LLM 直接吐 slide 的情况）
  const candidates: any[] = [];
  if (raw.value && typeof raw.value === "object") {
    // op 缺省也接受；明确是 remove/replace/move/copy 才跳过（这些不该作为 slide 提取）
    if (raw.op === undefined || raw.op === "add") {
      candidates.push(raw.value);
    }
  }
  // raw 自身像 slide（无 op 字段且含 layout）
  if (raw.op === undefined && raw.layout && Array.isArray(raw.blocks)) {
    candidates.push(raw);
  }

  for (const cand of candidates) {
    const filled = fillOneSlideId(cand);
    const r = SlideSchema.safeParse(filled);
    if (r.success) return r.data;
  }
  return null;
}
