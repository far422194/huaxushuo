import { nanoid } from "nanoid";
import type { Slide } from "@shared/dsl";
import type { PromptSource } from "./contentPrompts";
import { BUILTIN_PATTERNS } from "./patternsBuiltin";

// 视觉模式样板：把高质量页面沉淀为可复用 pattern
// 每个 pattern 是 1 页或多页 slide 的 JSON 主体（不含 deck.theme，让用户当前主题透出）
// 用户在编辑器选 pattern 插入；LLM 也能用 patternRef 引用 pattern id 复用其 layout/utilities/blocks 框架
export type PatternCategory =
  | "hero" | "section" | "stat" | "list"
  | "compare" | "flow" | "quote" | "cta" | "decor";

export interface Pattern {
  id: string;
  name: string;
  description: string;
  category: PatternCategory;
  tags: string[];
  source: PromptSource;
  slides: Slide[];
  // 推荐主题模式（命中 skill 时让 LLM 配套套用；可选）
  themeHint?: { mode: "light" | "dark"; primary?: string };
  createdAt: number;
}

const STORAGE_KEY = "hxs.patterns";

interface Stored {
  generated: Pattern[];
  userSaved: Pattern[];
  // 用户从 user-saved/ai-generated 提升上来的"用户内置"，独立管理
  builtin: Pattern[];
}

function loadStored(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { generated: [], userSaved: [], builtin: [] };
    const parsed = JSON.parse(raw);
    return {
      generated: Array.isArray(parsed.generated) ? parsed.generated : [],
      userSaved: Array.isArray(parsed.userSaved) ? parsed.userSaved : [],
      builtin: Array.isArray(parsed.builtin) ? parsed.builtin : [],
    };
  } catch {
    return { generated: [], userSaved: [], builtin: [] };
  }
}

function saveStored(s: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore quota
  }
}

// 加载：整体按 createdAt 倒序，最新生成在最前；不再按 source 分组
// 源码 BUILTIN_PATTERNS（createdAt = 0）自然落到列表末尾
export function loadAllPatterns(): Pattern[] {
  const s = loadStored();
  return [
    ...s.builtin,
    ...s.userSaved,
    ...s.generated,
    ...BUILTIN_PATTERNS,
  ].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export function loadPatternsBySource(source: PromptSource | "all"): Pattern[] {
  const all = loadAllPatterns();
  if (source === "all") return all;
  return all.filter((p) => p.source === source);
}

export function loadPatternsByCategory(category: PatternCategory | "all"): Pattern[] {
  const all = loadAllPatterns();
  if (category === "all") return all;
  return all.filter((p) => p.category === category);
}

export function getPattern(id: string): Pattern | undefined {
  return loadAllPatterns().find((p) => p.id === id);
}

// 用户保存当前页为 pattern：从 SlideList 右键菜单触发
export function addUserSavedPattern(input: Omit<Pattern, "id" | "createdAt" | "source">): Pattern {
  const s = loadStored();
  const next: Pattern = {
    ...input,
    id: `p_${nanoid(8)}`,
    createdAt: Date.now(),
    source: "user-saved",
  };
  s.userSaved.push(next);
  saveStored(s);
  return next;
}

// AI 一键生成的 pattern 批量写入（覆盖之前的 ai-generated 列表）
export function setGeneratedPatterns(patterns: Omit<Pattern, "id" | "createdAt" | "source">[]) {
  const s = loadStored();
  s.generated = patterns.map((p) => ({
    ...p,
    id: `p_${nanoid(8)}`,
    createdAt: Date.now(),
    source: "ai-generated",
  }));
  saveStored(s);
}

// 导出：所有非源码内置的 pattern（builtin/userSaved/ai-generated 三个动态来源）
// 用于"导出我的库"——源码 BUILTIN_PATTERNS 项目方维护，无需导出
export function loadDynamicPatterns(): Pattern[] {
  const s = loadStored();
  return [...s.builtin, ...s.userSaved, ...s.generated];
}

// 批量导入：按各 pattern 的 source 字段写入对应分区
// mode="skip" → id 冲突时跳过（保护已有数据，默认）；mode="overwrite" → 覆盖冲突项
// 返回 { added, updated, skipped } 统计
export function bulkAddPatterns(
  patterns: Pattern[],
  options: { mode?: "skip" | "overwrite" } = {}
): { added: number; updated: number; skipped: number } {
  const mode = options.mode ?? "skip";
  const s = loadStored();
  const regionOf: Record<Pattern["source"], "builtin" | "userSaved" | "generated"> = {
    "builtin": "builtin",
    "user-saved": "userSaved",
    "ai-generated": "generated",
  };
  const findExisting = (id: string): { region: "builtin" | "userSaved" | "generated"; idx: number } | null => {
    for (const region of ["builtin", "userSaved", "generated"] as const) {
      const idx = s[region].findIndex((p) => p.id === id);
      if (idx >= 0) return { region, idx };
    }
    return null;
  };

  let added = 0, updated = 0, skipped = 0;
  for (const p of patterns) {
    const existing = findExisting(p.id);
    if (existing) {
      if (mode === "overwrite") {
        s[existing.region].splice(existing.idx, 1);
        s[regionOf[p.source]].push(p);
        updated++;
      } else {
        skipped++;
      }
    } else {
      s[regionOf[p.source]].push(p);
      added++;
    }
  }
  saveStored(s);
  return { added, updated, skipped };
}

// 删除：所有动态来源都允许（源码 BUILTIN_PATTERNS 不可删，源码改）
export function deletePattern(id: string): boolean {
  const s = loadStored();
  let removed = false;
  for (const key of ["builtin", "userSaved", "generated"] as const) {
    const idx = s[key].findIndex((p) => p.id === id);
    if (idx >= 0) {
      s[key].splice(idx, 1);
      removed = true;
    }
  }
  if (removed) saveStored(s);
  return removed;
}
