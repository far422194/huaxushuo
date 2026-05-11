import { useEffect, useRef } from "react";
import { useEditorStore } from "@/store/editor";
import { loadConversations, upsertConversation } from "@/data/conversations";

const DEBOUNCE_MS = 600;

// 编辑器内 deck 变动时自动 debounce 写回当前 conversation，让"对话历史"始终展示最新版本。
// 关键：仅当"同一 conversation 内 deck 真的发生了用户改动"才写；从历史打开 / 切换对话本身
// 不视为修改（loadDeck 同时换 conversationId + deck，被基线对比识别为切换并跳过）。
export function useAutoSyncConversation() {
  const deck = useEditorStore((s) => s.deck);
  const conversationId = useEditorStore((s) => s.currentConversationId);
  const streamingMode = useEditorStore((s) => s.streamingMode);
  const view = useEditorStore((s) => s.view);
  const timerRef = useRef<number | null>(null);
  // 记录"当前 conversation 已同步的 deck 引用"作为基线
  // - conversationId 变化（切换/打开/清除）：重置基线，不写回
  // - 后续 deck 引用变化（zustand commit 产生新引用）才触发写回
  const baselineRef = useRef<{ id?: string; deck: typeof deck }>({ id: conversationId, deck });

  useEffect(() => {
    // 切换 conversation：重置基线，丢弃已挂起的写回
    if (baselineRef.current.id !== conversationId) {
      baselineRef.current = { id: conversationId, deck };
      if (timerRef.current) window.clearTimeout(timerRef.current);
      return;
    }
    // 同 conversation 内 deck 引用未变（仅 streamingMode/view 等其他依赖变化触发的 effect）
    if (baselineRef.current.deck === deck) return;
    if (!conversationId || streamingMode || view !== "editor") return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const existing = loadConversations().find((c) => c.id === conversationId);
      if (!existing) return;
      upsertConversation({
        ...existing,
        deck,
        title: deck.meta.title || existing.title,
        updatedAt: Date.now(),
      });
      baselineRef.current = { id: conversationId, deck };
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [deck, conversationId, streamingMode, view]);
}
