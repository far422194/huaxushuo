import { nanoid } from "nanoid";

export type PromptSource = "builtin" | "ai-generated" | "user-saved";

// 内容提示词：描述演示主题/结构（用户输入或预设的内容指令）
export interface ContentPrompt {
  id: string;
  title: string;
  prompt: string;
  source: PromptSource;
  createdAt: number;
  // 生成本案例的耗时（毫秒，整批共享）。仅 ai-generated 才有意义
  durationMs?: number;
}

const STORAGE_KEY = "hxs.content_prompts";

// 内置内容案例已清空。用户可通过「AI 再生成一批」按需生成案例。
export const BUILTIN_CONTENT_PROMPTS: ContentPrompt[] = [];

interface Stored {
  generated: ContentPrompt[];
  userSaved: ContentPrompt[];
}

function loadStored(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { generated: [], userSaved: [] };
    const parsed = JSON.parse(raw);
    return {
      generated: Array.isArray(parsed.generated) ? parsed.generated : [],
      userSaved: Array.isArray(parsed.userSaved) ? parsed.userSaved : [],
    };
  } catch {
    return { generated: [], userSaved: [] };
  }
}

function saveStored(s: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore quota
  }
}

export function loadAllContentPrompts(): ContentPrompt[] {
  const s = loadStored();
  return [
    ...s.userSaved.sort((a, b) => b.createdAt - a.createdAt),
    ...s.generated.sort((a, b) => b.createdAt - a.createdAt),
    ...BUILTIN_CONTENT_PROMPTS,
  ];
}

export function loadContentPromptsBySource(source: PromptSource | "all"): ContentPrompt[] {
  const all = loadAllContentPrompts();
  return source === "all" ? all : all.filter((p) => p.source === source);
}

export function addUserSavedContentPrompt(input: { title: string; prompt: string }): ContentPrompt {
  const s = loadStored();
  const p: ContentPrompt = {
    id: nanoid(8),
    title: input.title.trim(),
    prompt: input.prompt.trim(),
    source: "user-saved",
    createdAt: Date.now(),
  };
  s.userSaved.unshift(p);
  saveStored(s);
  return p;
}

export function replaceGeneratedContentPrompts(generated: ContentPrompt[]) {
  const s = loadStored();
  s.generated = generated;
  saveStored(s);
}

export function deleteContentPrompt(id: string) {
  const s = loadStored();
  s.generated = s.generated.filter((p) => p.id !== id);
  s.userSaved = s.userSaved.filter((p) => p.id !== id);
  saveStored(s);
}
