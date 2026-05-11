import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Image as ImageIcon, X, Check, AlertCircle, ChevronRight, Pencil } from "lucide-react";
import { cn } from "@/lib/cn";
import { getPexelsApiKey, setPexelsApiKey, testPexelsApiKey } from "@/llm/pexels";
import pexelsLogo from "@/assets/providers/pexels-logo.png";

// 图源 provider 配置：每个 provider 是一行，列表式呈现；点开内嵌表单编辑 API Key
// 当前仅 Pexels；未来可扩展（Unsplash / Pixabay / 自建图床），统一走这个表
type ImageProviderId = "pexels";

interface ImageProviderMeta {
  id: ImageProviderId;
  label: string;
  // i18n key (under dialog:imageLibrary) 用于运行时取本地化描述
  descriptionKey: string;
  // 申请 API Key 的官方页（外链）
  applyUrl: string;
  // 品牌 logo（放在 client/src/assets/providers/）；无则 fallback ImageIcon
  logoUrl?: string;
  // 读 / 写 / 测试 API Key 的接口
  getKey: () => string | undefined;
  setKey: (key: string) => void;
  testKey: (key: string) => Promise<{ ok: boolean; message?: string }>;
}

const PROVIDERS: ImageProviderMeta[] = [
  {
    id: "pexels",
    label: "Pexels",
    descriptionKey: "imageLibrary.pexels.description",
    applyUrl: "https://www.pexels.com/api/",
    logoUrl: pexelsLogo,
    getKey: getPexelsApiKey,
    setKey: setPexelsApiKey,
    testKey: testPexelsApiKey,
  },
];

export function ImageLibraryDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("dialog");
  const [editingId, setEditingId] = useState<ImageProviderId | undefined>();

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50"
      onClick={editingId ? undefined : onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[640px] max-w-[94vw] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <ImageIcon size={18} className="text-slate-600" />
            <div>
              <h2 className="text-base font-semibold">{t("imageLibrary.title")}</h2>
              <p className="text-[11px] text-slate-500">{t("imageLibrary.subtitle")}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </header>

        <main className="flex-1 overflow-auto p-4">
          <div className="space-y-2">
            {PROVIDERS.map((p) => (
              <ProviderRow
                key={p.id}
                meta={p}
                editing={editingId === p.id}
                onToggleEdit={() =>
                  setEditingId(editingId === p.id ? undefined : p.id)
                }
                onDone={() => setEditingId(undefined)}
              />
            ))}
          </div>
        </main>

        <footer className="px-4 py-3 border-t border-slate-200 flex items-center justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded text-slate-600 hover:bg-slate-100"
          >
            {t("imageLibrary.close")}
          </button>
        </footer>
      </div>
    </div>
  );
}

// 单行 provider：左侧 logo + 名字 + 描述；右侧状态徽章 + 编辑按钮；展开后内嵌 ProviderEditor
function ProviderRow({
  meta,
  editing,
  onToggleEdit,
  onDone,
}: {
  meta: ImageProviderMeta;
  editing: boolean;
  onToggleEdit: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation("dialog");
  const configured = !!meta.getKey();

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-3 py-2.5 flex items-center gap-2">
        <div
          className={cn(
            "w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden",
            meta.logoUrl ? "bg-white" : "bg-slate-100",
          )}
        >
          {meta.logoUrl ? (
            <img src={meta.logoUrl} alt={`${meta.label} logo`} className="w-full h-full object-cover" />
          ) : (
            <ImageIcon size={16} className="text-slate-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-800">{meta.label}</div>
          <div className="text-[11px] text-slate-500 truncate">{t(meta.descriptionKey)}</div>
        </div>
        {configured ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            {t("imageLibrary.providerRow.statusConfigured")}
          </span>
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
            {t("imageLibrary.providerRow.statusNotConfigured")}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleEdit}
          className={cn(
            "ml-1 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border font-medium",
            editing
              ? "bg-slate-800 text-white border-slate-800"
              : "border-slate-300 text-slate-700 hover:bg-slate-50"
          )}
        >
          {editing ? (
            <>
              {t("imageLibrary.providerRow.collapse")} <ChevronRight size={11} className="rotate-90" />
            </>
          ) : configured ? (
            <>
              <Pencil size={11} /> {t("imageLibrary.providerRow.edit")}
            </>
          ) : (
            <>
              <Pencil size={11} /> {t("imageLibrary.providerRow.config")}
            </>
          )}
        </button>
      </div>

      {editing && (
        <div className="border-t border-slate-200 bg-slate-50 px-3 py-3">
          <ProviderEditor meta={meta} onDone={onDone} />
        </div>
      )}
    </div>
  );
}

// 单个 provider 的 API Key 编辑器：测试 + 保存 + 清除
function ProviderEditor({
  meta,
  onDone,
}: {
  meta: ImageProviderMeta;
  onDone: () => void;
}) {
  const { t } = useTranslation("dialog");
  const [key, setKey] = useState<string>(() => meta.getKey() ?? "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);

  const saved = meta.getKey();
  const dirty = key.trim() !== (saved ?? "");

  const handleSave = () => {
    meta.setKey(key);
    setTestResult(null);
    onDone();
  };

  const handleTest = async () => {
    if (!key.trim()) return;
    setTesting(true);
    setTestResult(null);
    const r = await meta.testKey(key);
    setTesting(false);
    setTestResult(r);
    if (r.ok) meta.setKey(key);
  };

  const handleClear = () => {
    meta.setKey("");
    setKey("");
    setTestResult(null);
    onDone();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-slate-600 font-medium">{t("imageLibrary.providerEditor.apiKeyLabel")}</label>
        <a
          href={meta.applyUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-blue-600 hover:underline"
        >
          {t("imageLibrary.providerEditor.applyLink")}
        </a>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setTestResult(null);
          }}
          placeholder={
            saved
              ? t("imageLibrary.providerEditor.placeholderConfigured")
              : t("imageLibrary.providerEditor.placeholderEmpty", { label: meta.label })
          }
          className="flex-1 px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:outline-none focus:border-blue-500 font-mono bg-white"
        />
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !key.trim()}
          className={cn(
            "px-2.5 py-1.5 text-[11px] rounded border font-medium",
            testing || !key.trim()
              ? "border-slate-200 text-slate-400 cursor-not-allowed"
              : "border-slate-300 text-slate-700 hover:bg-slate-100 bg-white"
          )}
        >
          {testing ? t("imageLibrary.providerEditor.testing") : t("imageLibrary.providerEditor.test")}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={handleSave}
            className="px-2.5 py-1.5 text-[11px] rounded bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            {t("imageLibrary.providerEditor.save")}
          </button>
        )}
      </div>
      {testResult && (
        <div
          className={cn(
            "text-[10px] flex items-center gap-1",
            testResult.ok ? "text-emerald-600" : "text-rose-600"
          )}
        >
          {testResult.ok ? (
            <>
              <Check size={11} /> {t("imageLibrary.providerEditor.testOk")}
            </>
          ) : (
            <>
              <AlertCircle size={11} /> {testResult.message}
            </>
          )}
        </div>
      )}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[10px] text-slate-500 leading-relaxed flex-1">
          {t("imageLibrary.providerEditor.enrichHint", { label: meta.label })}
        </p>
        {saved && (
          <button
            type="button"
            onClick={handleClear}
            className="ml-2 text-[10px] text-rose-600 hover:underline flex-shrink-0"
          >
            {t("imageLibrary.providerEditor.clear")}
          </button>
        )}
      </div>
    </div>
  );
}
