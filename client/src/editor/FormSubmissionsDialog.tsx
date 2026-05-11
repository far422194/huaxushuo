import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Download, Trash2, Database } from "lucide-react";
import {
  loadSubmissions,
  listSubmissionsByForm,
  deleteSubmission,
  clearByForm,
  exportFormCsv,
  downloadCsv,
  type FormSubmission,
} from "@/data/formSubmissions";
import { useEditorStore } from "@/store/editor";

export function FormSubmissionsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("dialog");
  const deck = useEditorStore((s) => s.deck);
  const [version, setVersion] = useState(0);

  // 当前 deck 中存在的所有 formId（递归扫 modal/tab/card 的 children/blocks）
  const deckFormIds = useMemo(() => collectFormIds(deck.slides), [deck]);

  // 全部提交按 formId 分组
  const groups = useMemo(() => {
    const all = loadSubmissions();
    const map = new Map<string, FormSubmission[]>();
    for (const s of all) {
      const arr = map.get(s.formId) ?? [];
      arr.push(s);
      map.set(s.formId, arr);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const allFormIds = useMemo(() => {
    const set = new Set<string>([...deckFormIds, ...groups.keys()]);
    return Array.from(set).sort();
  }, [deckFormIds, groups]);

  const [activeFormId, setActiveFormId] = useState<string | null>(allFormIds[0] ?? null);
  const activeSubmissions = activeFormId ? listSubmissionsByForm(activeFormId) : [];

  const refresh = () => setVersion((v) => v + 1);

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[840px] max-w-[95vw] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-blue-600" />
            <h2 className="text-base font-semibold">{t("formSubmissions.title")}</h2>
            <span className="text-[11px] text-slate-400">
              {t("formSubmissions.subtitle")}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={16} />
          </button>
        </header>

        {allFormIds.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
            {t("formSubmissions.emptyAll")}
          </div>
        ) : (
          <div className="flex flex-1 min-h-0">
            {/* 左侧 formId 列表 */}
            <div className="w-48 border-r border-slate-200 overflow-auto p-2 space-y-1 flex-shrink-0">
              {allFormIds.map((id) => {
                const count = groups.get(id)?.length ?? 0;
                const inDeck = deckFormIds.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => setActiveFormId(id)}
                    className={
                      "w-full text-left px-2 py-1.5 rounded text-xs " +
                      (id === activeFormId
                        ? "bg-blue-100 text-blue-700"
                        : "text-slate-600 hover:bg-slate-100")
                    }
                  >
                    <div className="font-mono truncate">{id}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {t("formSubmissions.count", { count })} {inDeck ? "" : t("formSubmissions.notInDeck")}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 右侧 submissions 表格 */}
            <div className="flex-1 flex flex-col min-w-0">
              {activeFormId && (
                <>
                  <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-2 text-xs">
                    <span className="font-mono text-slate-500 truncate flex-1">
                      {activeFormId}
                    </span>
                    <button
                      onClick={() => {
                        const csv = exportFormCsv(activeFormId);
                        downloadCsv(`${activeFormId}.csv`, csv);
                      }}
                      disabled={activeSubmissions.length === 0}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                    >
                      <Download size={11} />
                      {t("formSubmissions.exportCsv")}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(t("formSubmissions.clearConfirm", { formId: activeFormId, count: activeSubmissions.length }))) {
                          clearByForm(activeFormId);
                          refresh();
                        }
                      }}
                      disabled={activeSubmissions.length === 0}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                    >
                      <Trash2 size={11} />
                      {t("formSubmissions.clear")}
                    </button>
                  </div>

                  <div className="flex-1 overflow-auto">
                    {activeSubmissions.length === 0 ? (
                      <div className="text-center text-xs text-slate-400 py-12">
                        {t("formSubmissions.emptyForm")}
                      </div>
                    ) : (
                      <SubmissionsTable
                        submissions={activeSubmissions}
                        onDelete={(id) => {
                          deleteSubmission(id);
                          refresh();
                        }}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SubmissionsTable({
  submissions,
  onDelete,
}: {
  submissions: FormSubmission[];
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation("dialog");
  const { i18n } = useTranslation();
  const fields = useMemo(() => {
    const set = new Set<string>();
    for (const s of submissions) for (const k of Object.keys(s.values)) set.add(k);
    return Array.from(set);
  }, [submissions]);

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
        <tr>
          <th className="px-3 py-2 text-left text-slate-500 font-medium">{t("formSubmissions.time")}</th>
          {fields.map((f) => (
            <th key={f} className="px-3 py-2 text-left text-slate-500 font-medium">
              {f}
            </th>
          ))}
          <th className="px-2 py-2 w-8" />
        </tr>
      </thead>
      <tbody>
        {submissions.map((s) => (
          <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/50">
            <td className="px-3 py-2 text-slate-600 tabular-nums">
              {new Date(s.timestamp).toLocaleString(i18n.resolvedLanguage === "en" ? "en-US" : "zh-CN", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </td>
            {fields.map((f) => {
              const v = s.values[f];
              const display =
                v === undefined
                  ? ""
                  : Array.isArray(v)
                  ? v.join("; ")
                  : String(v);
              return (
                <td key={f} className="px-3 py-2 max-w-[160px] truncate" title={display}>
                  {display}
                </td>
              );
            })}
            <td className="px-2 py-2">
              <button
                onClick={() => onDelete(s.id)}
                className="text-slate-400 hover:text-rose-600"
                title={t("formSubmissions.delete")}
              >
                <Trash2 size={11} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 递归扫 deck 找出所有 formId
function collectFormIds(slides: any[]): string[] {
  const ids = new Set<string>();
  const walk = (blocks: any[]) => {
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      if (b.type === "form" && typeof b.formId === "string") ids.add(b.formId);
      if (b.type === "modal" && Array.isArray(b.children)) walk(b.children);
      if (b.type === "card" && Array.isArray(b.children)) walk(b.children);
      if (b.type === "tab" && Array.isArray(b.tabs)) {
        for (const t of b.tabs) if (Array.isArray(t.blocks)) walk(t.blocks);
      }
    }
  };
  for (const s of slides) if (Array.isArray(s.blocks)) walk(s.blocks);
  return Array.from(ids);
}
