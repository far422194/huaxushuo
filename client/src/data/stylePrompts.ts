import { nanoid } from "nanoid";
import type { Theme, Deck } from "@shared/dsl";
import type { PromptSource } from "./contentPrompts";
import { BUILTIN_STYLE_PROMPTS_SOURCE } from "./stylePromptsBuiltin";

// 风格提示词：定义视觉/语调/排版倾向，作为生成的"风格基准"
export interface StylePrompt {
  id: string;
  name: string;             // 简短风格名："极简"
  description: string;      // 一句话描述
  emoji: string;            // 封面卡上的 emoji（与 theme 颜色组合成视觉封面）
  theme: Theme;             // 该风格的主题（用于渲染封面与示例 deck）
  styleInstructions: string;// 注入给 LLM 的风格指令
  source: PromptSource;
  createdAt: number;
  // 生成本风格的耗时（毫秒）。仅 ai-generated/user-saved 才有意义；builtin 没有
  durationMs?: number;
  // 用户保存的"按指令生成的样板 deck"——下次打开预览自动用，不用再调 LLM
  sampleDeck?: Deck;
}

const STORAGE_KEY = "hxs.style_prompts";

// 内置风格库：用户通过「转为内置」提升上来的项目都进入这个数组
// 数组本身是 mutable export：promote/demote 时直接读写 + 同步到 localStorage
// loadStored() 在模块初始化时把 localStorage 中已存的 builtin 项填回此数组
export const BUILTIN_STYLE_PROMPTS: StylePrompt[] = [];

interface Stored {
  generated: StylePrompt[];
  userSaved: StylePrompt[];
  // builtin 字段是 BUILTIN_STYLE_PROMPTS 的持久化镜像（兼容旧数据 key 名不变）
  builtin: StylePrompt[];
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

// 模块加载时填入 BUILTIN_STYLE_PROMPTS：
// 1. 源码硬编码的内置风格（stylePromptsBuiltin.ts）— 永远存在，含 i18n 翻译
// 2. localStorage 中已存的 builtin 项（用户「转为内置」上来的）— 持久化兼容
// 用户项目优先（unshift 在前），创建时间排序由 loadAllStylePrompts 统一处理
(function hydrateBuiltin() {
  const s = loadStored();
  // 源码 builtin 先入数组（createdAt=0 自然排在最末）
  for (const item of BUILTIN_STYLE_PROMPTS_SOURCE) {
    if (!BUILTIN_STYLE_PROMPTS.some((p) => p.id === item.id)) {
      BUILTIN_STYLE_PROMPTS.push(item);
    }
  }
  // 用户提升的项追加（用 id 去重，避免与源码 id 冲突时重复）
  for (const item of s.builtin) {
    if (!BUILTIN_STYLE_PROMPTS.some((p) => p.id === item.id)) {
      BUILTIN_STYLE_PROMPTS.push(item);
    }
  }
})();

function syncBuiltinToStorage() {
  const s = loadStored();
  // 仅持久化"用户提升的"那部分（id 不在源码 SOURCE 里的项）
  // 源码硬编码项不需要写 localStorage（每次模块加载都会自动填入）
  const sourceIds = new Set(BUILTIN_STYLE_PROMPTS_SOURCE.map((p) => p.id));
  s.builtin = BUILTIN_STYLE_PROMPTS.filter((p) => !sourceIds.has(p.id));
  saveStored(s);
}

export function loadAllStylePrompts(): StylePrompt[] {
  const s = loadStored();
  // 排序：整体按 createdAt 倒序，最新生成的在最前
  // BUILTIN_STYLE_PROMPTS 既是源码内置库，也持有用户提升的项，作为单一来源出现
  return [
    ...BUILTIN_STYLE_PROMPTS,
    ...s.userSaved,
    ...s.generated,
  ].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export function loadStylePromptsBySource(source: PromptSource | "all"): StylePrompt[] {
  const all = loadAllStylePrompts();
  if (source === "all") return all;
  // 旧数据兼容：之前保存的 user-saved 风格在筛选「AI 生成」时也合并显示，
  // 让用户的旧风格不会因为去掉「我保存的」分类而隐藏
  if (source === "ai-generated") return all.filter((p) => p.source === "ai-generated" || p.source === "user-saved");
  return all.filter((p) => p.source === source);
}

export function getStylePrompt(id: string): StylePrompt | undefined {
  return loadAllStylePrompts().find((s) => s.id === id);
}

// 用户新建并保存的风格统一归入 ai-generated 区（去掉了「我保存的」分类后，新增项一律落到 AI 生成 tab）
// 函数名保留以兼容现有调用方
export function addUserSavedStylePrompt(input: Omit<StylePrompt, "id" | "source" | "createdAt">): StylePrompt {
  const s = loadStored();
  const p: StylePrompt = {
    id: nanoid(8),
    source: "ai-generated",
    createdAt: Date.now(),
    ...input,
  };
  s.generated.unshift(p);
  saveStored(s);
  return p;
}

export function replaceGeneratedStylePrompts(generated: StylePrompt[]) {
  const s = loadStored();
  s.generated = generated;
  saveStored(s);
}

export function deleteStylePrompt(id: string) {
  const s = loadStored();
  s.generated = s.generated.filter((p) => p.id !== id);
  s.userSaved = s.userSaved.filter((p) => p.id !== id);
  saveStored(s);
  // 同步清除 BUILTIN_STYLE_PROMPTS 里的镜像项
  const idx = BUILTIN_STYLE_PROMPTS.findIndex((p) => p.id === id);
  if (idx >= 0) {
    BUILTIN_STYLE_PROMPTS.splice(idx, 1);
    syncBuiltinToStorage();
  }
}

// 用户保存的风格可改：现在主存放点是 generated（ai-generated），同时兼容旧 user-saved 数据
// builtin（含用户提升的）修改请走"另存为"路径
export function updateUserSavedStylePrompt(
  id: string,
  patch: Partial<Omit<StylePrompt, "id" | "source" | "createdAt">>
): StylePrompt | undefined {
  const s = loadStored();
  const inGen = s.generated.findIndex((p) => p.id === id);
  if (inGen >= 0) {
    const next: StylePrompt = { ...s.generated[inGen]!, ...patch };
    s.generated[inGen] = next;
    saveStored(s);
    return next;
  }
  const inUs = s.userSaved.findIndex((p) => p.id === id);
  if (inUs >= 0) {
    const next: StylePrompt = { ...s.userSaved[inUs]!, ...patch };
    s.userSaved[inUs] = next;
    saveStored(s);
    return next;
  }
  return undefined;
}

