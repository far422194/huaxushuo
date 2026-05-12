import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Database, Trash2, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

// HXS 用到的所有 localStorage 命名空间元数据
// 注：data/* 内的 STORAGE_KEY 是单一可信源，这里只镜像声明、统一渲染
interface StorageModule {
  key: string;            // localStorage key（必须与 data/*.ts 的 STORAGE_KEY 一致）
  labelKey: string;       // i18n: storage.modules.{X}.label
  descKey: string;        // i18n: storage.modules.{X}.desc
  countOf?: (data: any) => number; // 解析后取条目数
}

const MODULES: StorageModule[] = [
  {
    key: "hxs.conversations",
    labelKey: "modules.conversations.label",
    descKey: "modules.conversations.desc",
    countOf: (d) => (Array.isArray(d) ? d.length : 0),
  },
  {
    key: "hxs.style_prompts",
    labelKey: "modules.stylePrompts.label",
    descKey: "modules.stylePrompts.desc",
    // 风格库存储结构：{ userSaved, generated }
    countOf: (d) => (d?.userSaved?.length ?? 0) + (d?.generated?.length ?? 0),
  },
  {
    key: "hxs.content_prompts",
    labelKey: "modules.contentPrompts.label",
    descKey: "modules.contentPrompts.desc",
    // 内容案例存储结构：{ generated, userSaved }（修复：原配置写成 hxs.prompts 读不到导致始终 0）
    countOf: (d) => (d?.generated?.length ?? 0) + (d?.userSaved?.length ?? 0),
  },
  {
    key: "hxs.patterns",
    labelKey: "modules.patterns.label",
    descKey: "modules.patterns.desc",
    // Pattern 存储结构：{ generated, userSaved, builtin }
    countOf: (d) =>
      (d?.generated?.length ?? 0) + (d?.userSaved?.length ?? 0) + (d?.builtin?.length ?? 0),
  },
  {
    key: "hxs.skills",
    labelKey: "modules.skills.label",
    descKey: "modules.skills.desc",
    countOf: (d) =>
      (d?.generated?.length ?? 0) + (d?.userSaved?.length ?? 0) + (d?.builtin?.length ?? 0),
  },
  {
    key: "hxs.form_submissions",
    labelKey: "modules.formSubmissions.label",
    descKey: "modules.formSubmissions.desc",
    countOf: (d) => (Array.isArray(d) ? d.length : 0),
  },
  {
    key: "hxs.llm.settings",
    labelKey: "modules.llmSettings.label",
    descKey: "modules.llmSettings.desc",
  },
  {
    key: "hxs.deploy_settings",
    labelKey: "modules.deploySettings.label",
    descKey: "modules.deploySettings.desc",
  },
  {
    key: "hxs.pexels_api_key",
    labelKey: "modules.pexels.label",
    descKey: "modules.pexels.desc",
  },
  {
    key: "hxs.preferences",
    labelKey: "modules.preferences.label",
    descKey: "modules.preferences.desc",
  },
];

interface RowData {
  module: StorageModule;
  bytes: number;
  count: number;
  exists: boolean;
}

function readModule(m: StorageModule): RowData {
  const raw = localStorage.getItem(m.key);
  if (raw == null) return { module: m, bytes: 0, count: 0, exists: false };
  // 字节估算：每字符 2 字节（UTF-16）
  const bytes = raw.length * 2;
  let count = 0;
  if (m.countOf) {
    try {
      count = m.countOf(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }
  return { module: m, bytes, count, exists: true };
}

function readUnknownKeys(): RowData[] {
  // localStorage 上其他非 hxs.* 的 key（用户可能装过其他插件）
  const out: RowData[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith("hxs.")) continue;
    const raw = localStorage.getItem(key);
    if (raw == null) continue;
    out.push({
      module: { key, labelKey: "", descKey: "" },
      bytes: raw.length * 2,
      count: 0,
      exists: true,
    });
  }
  return out;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// 浏览器 localStorage 配额一般 5-10MB（厂商不同）。我们按 5MB 估算
const ESTIMATED_QUOTA = 5 * 1024 * 1024;

export function StorageDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("dialog");
  const { t: tCommon } = useTranslation("common");
  const [version, setVersion] = useState(0);

  const { rows, otherRows, total } = useMemo(() => {
    const rows = MODULES.map(readModule);
    const otherRows = readUnknownKeys();
    const total = [...rows, ...otherRows].reduce((s, r) => s + r.bytes, 0);
    return { rows, otherRows, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const refresh = () => setVersion((v) => v + 1);
  const usagePct = Math.min(100, (total / ESTIMATED_QUOTA) * 100);

  const handleClear = (key: string, label: string) => {
    if (!confirm(`${label} — ${t("storage.confirmClear")}`)) return;
    localStorage.removeItem(key);
    refresh();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/55 flex items-center justify-center z-50 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[640px] max-w-full max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Database size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold">{t("storage.title")}</h2>
            <span className="text-[11px] text-slate-400">localStorage</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={refresh}
              className="p-1.5 rounded text-slate-500 hover:bg-slate-100"
              title={tCommon("actions.refresh")}
            >
              <RefreshCw size={14} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded text-slate-400 hover:text-slate-700">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="px-5 py-3 border-b border-slate-200 flex-shrink-0 bg-slate-50/50">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-700 font-medium">{t("storage.size")}</span>
            <span className="font-mono text-slate-600">
              {formatBytes(total)} / ≈ 5 MB ({usagePct.toFixed(1)}%)
            </span>
          </div>
          <div className="relative h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-[width] duration-300",
                usagePct < 60 ? "bg-blue-500" : usagePct < 85 ? "bg-amber-500" : "bg-rose-500"
              )}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          {usagePct >= 85 && (
            <p className="mt-1.5 text-[11px] text-rose-700 inline-flex items-center gap-1">
              <AlertTriangle size={11} />
              {t("storage.quotaWarn")}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <Row key={r.module.key} row={r} onClear={handleClear} />
            ))}
            {otherRows.length > 0 && (
              <li className="px-5 pt-3 pb-1 text-[10px] uppercase tracking-wider text-slate-400">
                {t("storage.otherKeys")}
              </li>
            )}
            {otherRows.map((r) => (
              <Row key={r.module.key} row={r} onClear={handleClear} />
            ))}
          </ul>
        </div>

        <footer className="px-5 py-2.5 border-t border-slate-200 flex justify-between items-center text-[11px] text-slate-500 flex-shrink-0">
          <span>{t("storage.footerNote")}</span>
          <button onClick={onClose} className="px-2.5 py-1 rounded text-slate-600 hover:bg-slate-100">
            {tCommon("actions.close")}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Row({
  row,
  onClear,
}: {
  row: RowData;
  onClear: (key: string, label: string) => void;
}) {
  const { t } = useTranslation("dialog");
  // labelKey 为空 → 未知命名空间，label 直接用 storage key 字面
  const isUnknown = !row.module.labelKey;
  const label = isUnknown ? row.module.key : t(`storage.${row.module.labelKey}`);
  const desc = isUnknown ? t("storage.otherDesc") : t(`storage.${row.module.descKey}`);
  return (
    <li className="px-5 py-2.5 flex items-center gap-3 hover:bg-slate-50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800 truncate">{label}</span>
          {row.module.countOf && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
              {row.count} {t("storage.countSuffix")}
            </span>
          )}
          {!row.exists && (
            <span className="text-[10px] text-slate-400">{t("storage.notWritten")}</span>
          )}
        </div>
        <p className="text-[11px] text-slate-500 truncate font-mono">{row.module.key}</p>
        <p className="text-[10px] text-slate-400 truncate">{desc}</p>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        <span className="font-mono text-xs text-slate-700 tabular-nums">
          {formatBytes(row.bytes)}
        </span>
        {row.exists && (
          <button
            onClick={() => onClear(row.module.key, label)}
            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
            title={t("storage.clear")}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </li>
  );
}
