import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { History as HistoryIcon, X, Trash2, FolderOpen, MessageSquare } from "lucide-react";
import {
  loadConversations,
  deleteConversation,
  type Conversation,
  type ChatMessage,
} from "@/data/conversations";
import { useEditorStore } from "@/store/editor";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/time";

export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("dialog");
  const [list, setList] = useState<Conversation[]>(() => loadConversations());
  const [selectedId, setSelectedId] = useState<string | undefined>(() => loadConversations()[0]?.id);
  const selected = useMemo(() => list.find((c) => c.id === selectedId), [list, selectedId]);

  const loadDeck = useEditorStore((s) => s.loadDeck);
  const setConvId = useEditorStore((s) => s.setCurrentConversationId);

  const refresh = () => setList(loadConversations());

  const remove = (id: string) => {
    deleteConversation(id);
    refresh();
    if (id === selectedId) {
      const next = loadConversations()[0];
      setSelectedId(next?.id);
    }
  };

  const open = (c: Conversation) => {
    if (!c.deck) return; // 失败的会话没有 deck，不可打开
    setConvId(c.id);
    loadDeck(c.deck);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[860px] max-w-[94vw] h-[640px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <HistoryIcon size={18} className="text-slate-600" />
            <h2 className="text-lg font-semibold">{t("history.title")}</h2>
            <span className="text-xs text-slate-400">{list.length}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </header>

        {list.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
            <MessageSquare size={36} className="opacity-30" />
            <p className="text-sm">{t("history.empty")}</p>
            <p className="text-xs">{t("history.empty")}</p>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            <aside className="w-64 border-r border-slate-200 overflow-auto flex-shrink-0">
              {list.map((c) => (
                <ConversationRow
                  key={c.id}
                  conv={c}
                  selected={c.id === selectedId}
                  onSelect={() => setSelectedId(c.id)}
                  onDelete={() => remove(c.id)}
                />
              ))}
            </aside>
            <main className="flex-1 min-w-0 flex flex-col">
              {selected ? (
                <ConversationDetail conv={selected} onOpen={() => open(selected)} />
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                  {t("history.search")}
                </div>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  conv,
  selected,
  onSelect,
  onDelete,
}: {
  conv: Conversation;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("dialog");
  const { t: tChat } = useTranslation("chat");
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group cursor-pointer px-3 py-2.5 border-l-2 border-b border-slate-100",
        selected
          ? "bg-blue-50 border-l-blue-500"
          : "border-l-transparent hover:bg-slate-50"
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="text-sm font-medium text-slate-800 line-clamp-1 flex-1">
          {conv.title || tChat("fallbackTitle")}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-0.5"
          title={t("history.remove")}
        >
          <Trash2 size={11} />
        </button>
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
        {!conv.deck && (
          <span className="px-1 py-px rounded bg-rose-100 text-rose-700 font-medium text-[9px]">失败</span>
        )}
        <span>
          {conv.durationMs ? `耗时 ${formatDuration(conv.durationMs)} · ` : ""}
          {conv.messages.length} 条消息
          {conv.deck ? ` · ${conv.deck.slides.length} 页` : ""}
        </span>
      </div>
    </div>
  );
}

function ConversationDetail({ conv, onOpen }: { conv: Conversation; onOpen: () => void }) {
  const { t } = useTranslation("dialog");
  const { t: tChat } = useTranslation("chat");
  return (
    <>
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate flex items-center gap-2">
            {!conv.deck && (
              <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-medium text-[10px]">失败</span>
            )}
            <span className="truncate">{conv.title || tChat("fallbackTitle")}</span>
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {new Date(conv.createdAt).toLocaleString("zh-CN")}
            {conv.durationMs ? ` · 耗时 ${formatDuration(conv.durationMs)}` : ""}
            {conv.deck ? ` · ${conv.deck.slides.length} 页` : " · 无生成结果"}
          </p>
        </div>
        {conv.deck && (
          <button
            onClick={onOpen}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1.5 flex-shrink-0"
          >
            <FolderOpen size={12} />
            {t("history.load")}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto px-5 py-3 space-y-2.5 bg-slate-50/30">
        {conv.messages.map((m, i) => (
          <Bubble key={i} msg={m} />
        ))}
        {conv.messages.length === 0 && (
          <div className="text-xs text-slate-400 text-center py-8">无消息记录</div>
        )}
      </div>
    </>
  );
}

function Bubble({ msg }: { msg: ChatMessage }) {
  const { t: tChat } = useTranslation("chat");
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3 py-2 bg-blue-600 text-white rounded-lg text-sm whitespace-pre-wrap">
          {msg.text}
        </div>
      </div>
    );
  }
  if (msg.role === "assistant") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] px-3 py-2 bg-white text-slate-800 rounded-lg text-sm whitespace-pre-wrap border border-slate-200">
          {msg.text}
          {msg.source && (
            <span className="ml-2 inline-block text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
              {msg.source === "create" ? tChat("messages.tagCreate") : tChat("messages.tagUpdate")}
            </span>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] px-3 py-2 bg-rose-50 text-rose-700 rounded-lg text-xs whitespace-pre-wrap border border-rose-200">
        {msg.text}
      </div>
    </div>
  );
}

