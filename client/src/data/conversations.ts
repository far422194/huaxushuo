import type { Deck } from "@shared/dsl";

export interface ChatMessage {
  role: "user" | "assistant" | "error";
  text: string;
  source?: "create" | "patch";
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  // 失败的会话没有 deck（仅含错误消息）；HistoryDialog 这种情况不显示"在编辑器中打开"
  deck?: Deck;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  // 最近一次 generate 调用的耗时（毫秒）。旧数据可能没有
  durationMs?: number;
}

const STORAGE_KEY = "hxs.conversations";
const MAX_KEEP = 50;

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function saveAll(list: Conversation[]) {
  try {
    // 限制总条数防止 localStorage 爆掉
    const trimmed = list.slice(0, MAX_KEEP);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // 超过 quota 时退化：保留最新 20 条
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 20)));
    } catch {
      // 仍失败，直接放弃这次保存
    }
  }
}

export function getConversation(id: string): Conversation | null {
  const list = loadConversations();
  return list.find((c) => c.id === id) ?? null;
}

export function upsertConversation(c: Conversation) {
  const list = loadConversations();
  const idx = list.findIndex((x) => x.id === c.id);
  if (idx >= 0) list[idx] = c;
  else list.unshift(c);
  saveAll(list);
}

export function deleteConversation(id: string) {
  const list = loadConversations().filter((c) => c.id !== id);
  saveAll(list);
}

export function clearAllConversations() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
