import { nanoid } from "nanoid";
import type { Theme } from "@shared/dsl";
import type { PromptSource } from "./contentPrompts";
import { BUILTIN_SKILLS } from "./skillsBuiltin";

// 能力包（Skill）：一份"风格能力 Prompt 配方 + 推荐 pattern + 推荐 block / utility"组合
// LLM 在生成前匹配触发词，命中后把 systemAddon + 推荐 pattern JSON 注入 system prompt
// 与 StylePrompt（视觉/语调风格）解耦：StylePrompt 给主题色/字体/styleInstructions；Skill 给生成策略
export interface Skill {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  systemAddon: string;
  fewshotPatternIds: string[];
  recommendBlocks: string[];
  recommendUtilities: string[];
  recommendTheme?: Partial<Theme>;
  source: PromptSource;
  createdAt: number;
}

const STORAGE_KEY = "hxs.skills";

interface Stored {
  generated: Skill[];
  userSaved: Skill[];
  builtin: Skill[];
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
    // ignore
  }
}

// 加载：整体按 createdAt 倒序，最新生成在最前；不再按 source 分组
export function loadAllSkills(): Skill[] {
  const s = loadStored();
  return [
    ...s.builtin,
    ...s.userSaved,
    ...s.generated,
    ...BUILTIN_SKILLS,
  ].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export function getSkill(id: string): Skill | undefined {
  return loadAllSkills().find((s) => s.id === id);
}

export function addUserSavedSkill(input: Omit<Skill, "id" | "createdAt" | "source">): Skill {
  const s = loadStored();
  const next: Skill = {
    ...input,
    id: `sk_${nanoid(8)}`,
    createdAt: Date.now(),
    source: "user-saved",
  };
  s.userSaved.push(next);
  saveStored(s);
  return next;
}

// 导出：所有非源码内置的 skill
export function loadDynamicSkills(): Skill[] {
  const s = loadStored();
  return [...s.builtin, ...s.userSaved, ...s.generated];
}

// 批量导入：按 source 写入对应分区
// mode="skip" → id 冲突跳过（默认）；mode="overwrite" → 覆盖冲突项
export function bulkAddSkills(
  skills: Skill[],
  options: { mode?: "skip" | "overwrite" } = {}
): { added: number; updated: number; skipped: number } {
  const mode = options.mode ?? "skip";
  const s = loadStored();
  const regionOf: Record<Skill["source"], "builtin" | "userSaved" | "generated"> = {
    "builtin": "builtin",
    "user-saved": "userSaved",
    "ai-generated": "generated",
  };
  const findExisting = (id: string): { region: "builtin" | "userSaved" | "generated"; idx: number } | null => {
    for (const region of ["builtin", "userSaved", "generated"] as const) {
      const idx = s[region].findIndex((sk) => sk.id === id);
      if (idx >= 0) return { region, idx };
    }
    return null;
  };

  let added = 0, updated = 0, skipped = 0;
  for (const sk of skills) {
    const existing = findExisting(sk.id);
    if (existing) {
      if (mode === "overwrite") {
        s[existing.region].splice(existing.idx, 1);
        s[regionOf[sk.source]].push(sk);
        updated++;
      } else {
        skipped++;
      }
    } else {
      s[regionOf[sk.source]].push(sk);
      added++;
    }
  }
  saveStored(s);
  return { added, updated, skipped };
}

export function deleteSkill(id: string): boolean {
  const s = loadStored();
  let removed = false;
  for (const key of ["builtin", "userSaved", "generated"] as const) {
    const idx = s[key].findIndex((sk) => sk.id === id);
    if (idx >= 0) {
      s[key].splice(idx, 1);
      removed = true;
    }
  }
  if (removed) saveStored(s);
  return removed;
}
