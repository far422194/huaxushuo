import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Brain, X, ArrowLeft, Plus, Pencil, Trash2, Check, Zap, Loader2, AlertCircle, Copy, ArrowUp, ArrowDown, RotateCcw, Globe, Server } from "lucide-react";
import { testConnection, type TestResult } from "@/llm/testConnection";
import {
  loadSettings,
  PRESETS,
  ALL_CAPABILITIES,
  addModelConfig,
  updateModelConfig,
  deleteModelConfig,
  setActiveModelConfig,
  deactivateModelConfig,
  cloneModelConfig,
  getRoutingPriority,
  setRoutingPriority,
  resetRoutingPriority,
  getProxyUrl,
  setProxyUrl,
  DEFAULT_ROUTING,
  type RoutingScenario,
  type LlmSettings,
  type ModelConfig,
  type Capability,
} from "@/llm/settings";
import type { ProviderId } from "@/llm/types";
import { inferModelOutputCap } from "@/llm/maxTokens";
import { cn } from "@/lib/cn";

const ALL_PROVIDERS: ProviderId[] = ["openai-compat", "anthropic"];

// i18n helper：把 settings.ts 里的 enum 值映射到 dialog.json 里更短的 camelCase key
const CAPABILITY_I18N_KEY: Record<Capability, "general" | "textOnly" | "multimodal"> = {
  general: "general",
  "text-only": "textOnly",
  multimodal: "multimodal",
};
const COMPAT_I18N_KEY: Record<ProviderId, "anthropic" | "openaiCompat"> = {
  anthropic: "anthropic",
  "openai-compat": "openaiCompat",
};
const SCENARIO_I18N_KEY: Record<RoutingScenario, "general" | "imageRecognition"> = {
  general: "general",
  "image-recognition": "imageRecognition",
};

// capability 用色：general 蓝、text-only 青绿、multimodal 紫
// 三色饱和度对齐（都用 -50 底 + -300 边框 + -700 文字），底色让徽章在白底卡片上有体量；activeBg/activeBorder 用作整行 active 底色
const CAPABILITY_COLORS: Record<Capability, { badge: string; activeBg: string; activeBorder: string }> = {
  general:     { badge: "bg-blue-50 border-blue-300 text-blue-700",       activeBg: "bg-blue-50/60",    activeBorder: "border-blue-300" },
  "text-only": { badge: "bg-teal-50 border-teal-300 text-teal-700",       activeBg: "bg-teal-50/60",    activeBorder: "border-teal-300" },
  multimodal:  { badge: "bg-purple-50 border-purple-300 text-purple-700", activeBg: "bg-purple-50/60",  activeBorder: "border-purple-300" },
};

type View = { kind: "list" } | { kind: "form"; editing?: ModelConfig };

export function ProviderSettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("dialog");
  const [settings, setSettings] = useState<LlmSettings>(() => loadSettings());
  const [view, setView] = useState<View>({ kind: "list" });

  const refresh = () => setSettings(loadSettings());

  // 列表态：点击遮罩自动关闭。编辑/新建表单态：仅可通过关闭按钮退出（防止误点丢失正在编辑的表单数据）
  return (
    <div
      className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50"
      onClick={view.kind === "list" ? onClose : undefined}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[640px] max-w-[94vw] h-[480px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {view.kind === "list" ? (
          <ListView
            settings={settings}
            onClose={onClose}
            onCreate={() => setView({ kind: "form" })}
            onEdit={(c) => setView({ kind: "form", editing: c })}
            onActivate={(id) => { setActiveModelConfig(id); refresh(); }}
            onDeactivate={(id) => { deactivateModelConfig(id); refresh(); }}
            onClone={(id) => { cloneModelConfig(id); refresh(); }}
            onDelete={(c) => {
              if (window.confirm(t("provider.deleteConfirm", { name: c.name }))) {
                deleteModelConfig(c.id);
                refresh();
              }
            }}
          />
        ) : (
          <FormView
            editing={view.editing}
            onCancel={() => setView({ kind: "list" })}
            onSave={(draft) => {
              if (view.editing) updateModelConfig(view.editing.id, draft);
              else addModelConfig(draft);
              refresh();
              setView({ kind: "list" });
            }}
          />
        )}
      </div>
    </div>
  );
}

type ListViewTab = "models" | "routing" | "proxy";

function ListView({
  settings,
  onClose,
  onCreate,
  onEdit,
  onActivate,
  onDeactivate,
  onClone,
  onDelete,
}: {
  settings: LlmSettings;
  onClose: () => void;
  onCreate: () => void;
  onEdit: (c: ModelConfig) => void;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  onClone: (id: string) => void;
  onDelete: (c: ModelConfig) => void;
}) {
  const { t } = useTranslation("dialog");
  const [activeTab, setActiveTab] = useState<ListViewTab>("models");
  const isEmpty = settings.configs.length === 0;

  const proxyConfigured = !!getProxyUrl();

  return (
    <>
      <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Brain size={18} className="text-slate-600" />
          <div>
            <h2 className="text-base font-semibold">{t("provider.title")}</h2>
            <p className="text-[11px] text-slate-500">{t("provider.subtitle")}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
          <X size={18} />
        </button>
      </header>

      <div className="px-4 pt-2 border-b border-slate-200 flex gap-1 flex-shrink-0">
        <TabButton
          active={activeTab === "models"}
          onClick={() => setActiveTab("models")}
          label={
            settings.configs.length > 0
              ? t("provider.tab.modelsWithCount", { count: settings.configs.length })
              : t("provider.tab.models")
          }
        />
        <TabButton
          active={activeTab === "routing"}
          onClick={() => setActiveTab("routing")}
          label={t("provider.tab.routing")}
        />
        <TabButton
          active={activeTab === "proxy"}
          onClick={() => setActiveTab("proxy")}
          label={t("provider.tab.proxy")}
          badge={proxyConfigured ? undefined : t("provider.tab.notConfigured")}
          badgeTone="neutral"
        />
      </div>

      <main className="flex-1 overflow-auto p-4">
        {activeTab === "routing" && <RoutingPriorityEditor />}
        {activeTab === "proxy" && <ProxyUrlEditor alwaysExpanded />}
        {activeTab === "models" && (
          isEmpty ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
              <Brain size={36} className="opacity-30" />
              <p className="text-sm">{t("provider.emptyTitle")}</p>
              <p className="text-[11px]">{t("provider.emptyHint")}</p>
              <button
                onClick={onCreate}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                <Plus size={14} />
                {t("provider.createNew")}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {settings.configs.map((c) => (
                <ConfigRow
                  key={c.id}
                  config={c}
                  active={settings.activeIds[c.capability] === c.id}
                  onActivate={() => onActivate(c.id)}
                  onDeactivate={() => onDeactivate(c.id)}
                  onClone={() => onClone(c.id)}
                  onEdit={() => onEdit(c)}
                  onDelete={() => onDelete(c)}
                />
              ))}
            </div>
          )
        )}
      </main>

      <footer className="px-4 py-3 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
        {activeTab === "models" && !isEmpty ? (
          <button
            onClick={onCreate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={14} />
            {t("provider.createNew")}
          </button>
        ) : <span />}
        <button
          onClick={onClose}
          className="text-sm px-3 py-1.5 rounded text-slate-600 hover:bg-slate-100"
        >
          {t("provider.close")}
        </button>
      </footer>
    </>
  );
}

// ListView 顶部的 Tab 段控件：当前 tab 加底部蓝色下划线 + 文字加粗
// badge 只在"非常态"时传入（常态如默认/已配置/有数量已合并到 label）
function TabButton({
  active,
  onClick,
  label,
  badge,
  badgeTone = "neutral",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
  badgeTone?: "neutral" | "amber";
}) {
  const toneClass = {
    neutral: "bg-slate-100 text-slate-500 border-slate-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-sm inline-flex items-center gap-1.5 -mb-px border-b-2 transition-colors",
        active
          ? "border-blue-600 text-blue-700 font-semibold"
          : "border-transparent text-slate-500 hover:text-slate-700",
      )}
    >
      {label}
      {badge && (
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", toneClass[badgeTone])}>
          {badge}
        </span>
      )}
    </button>
  );
}

// 全局后端代理 URL 配置：折叠态显示状态徽章；展开态填写 URL + 测试连通性 + 保存 + 清除
// 用户在 FormView 选「后端代理」时，所有走代理的 ModelConfig 共用这一个 URL（一次部署一个 Worker 的常态）
//
// alwaysExpanded：Tab 模式下传 true 跳过折叠态，直接显示展开形态（切到该 tab 就是要看/改它）
function ProxyUrlEditor({ alwaysExpanded = false }: { alwaysExpanded?: boolean } = {}) {
  const { t } = useTranslation("dialog");
  const [editing, setEditing] = useState(alwaysExpanded);
  const [url, setUrl] = useState<string>(() => getProxyUrl() ?? "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [tick, setTick] = useState(0);
  void tick;

  const saved = getProxyUrl();
  const dirty = url.trim() !== (saved ?? "");

  const handleSave = () => {
    setProxyUrl(url.trim() || undefined);
    setTestResult(null);
    if (!alwaysExpanded) setEditing(false);
    setTick((t) => t + 1);
  };

  const handleClear = () => {
    setProxyUrl(undefined);
    setUrl("");
    setTestResult(null);
    if (!alwaysExpanded) setEditing(false);
    setTick((t) => t + 1);
  };

  // 测试连通性：GET ${url}/ 看返回的 service: hxs-llm-proxy
  const handleTest = async () => {
    const target = url.trim();
    if (!target) return;
    setTesting(true);
    setTestResult(null);
    try {
      const resp = await fetch(target.replace(/\/+$/, "") + "/", { method: "GET" });
      if (!resp.ok) {
        setTestResult({ ok: false, message: `HTTP ${resp.status}` });
        return;
      }
      const data = await resp.json().catch(() => null);
      if (data?.service === "hxs-llm-proxy") {
        setTestResult({ ok: true });
        // 通过即保存
        setProxyUrl(target);
        setTick((t) => t + 1);
      } else {
        setTestResult({ ok: false, message: t("provider.proxyEditor.testNotProxy") });
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: err?.message ?? String(err) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mb-3 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200">
      <div className="flex items-center gap-2">
        <Server size={14} className="text-slate-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-slate-700">{t("provider.proxyEditor.label")}</div>
          {saved ? (
            <div className="text-[10px] text-slate-500 font-mono truncate">{saved}</div>
          ) : (
            <div className="text-[10px] text-slate-400">{t("provider.proxyEditor.notConfiguredHint")}</div>
          )}
        </div>
        {!alwaysExpanded && saved && !editing ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex-shrink-0">
            {t("provider.proxyEditor.statusConfigured")}
          </span>
        ) : !alwaysExpanded && !saved && !editing ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 flex-shrink-0">
            {t("provider.proxyEditor.statusNotConfigured")}
          </span>
        ) : null}
        {!alwaysExpanded && (
          <button
            type="button"
            onClick={() => {
              setUrl(saved ?? "");
              setEditing(!editing);
              setTestResult(null);
            }}
            className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1 flex-shrink-0"
          >
            <Pencil size={10} />
            {editing ? t("provider.proxyEditor.collapse") : saved ? t("provider.proxyEditor.edit") : t("provider.proxyEditor.config")}
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-2 pt-2 border-t border-slate-200 space-y-2">
          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setTestResult(null);
            }}
            placeholder={t("provider.proxyEditor.urlPlaceholder")}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded font-mono outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 bg-white"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !url.trim()}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded border font-medium inline-flex items-center gap-1",
                testing || !url.trim()
                  ? "border-slate-200 text-slate-400 cursor-not-allowed"
                  : "border-slate-300 text-slate-700 hover:bg-slate-100 bg-white",
              )}
            >
              {testing ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
              {testing ? t("provider.proxyEditor.testing") : t("provider.proxyEditor.test")}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={handleSave}
                className="text-[11px] px-2.5 py-1 rounded bg-blue-600 text-white font-medium hover:bg-blue-700"
              >
                {t("provider.proxyEditor.save")}
              </button>
            )}
            {saved && (
              <button
                type="button"
                onClick={handleClear}
                className="text-[10px] text-rose-600 hover:underline ml-auto"
              >
                {t("provider.proxyEditor.clear")}
              </button>
            )}
          </div>
          {testResult && (
            <div
              className={cn(
                "text-[10px] flex items-start gap-1",
                testResult.ok ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {testResult.ok ? (
                <>
                  <Check size={11} className="mt-0.5 flex-shrink-0" /> {t("provider.proxyEditor.testOk")}
                </>
              ) : (
                <>
                  <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
                  <span className="break-all">{testResult.message}</span>
                </>
              )}
            </div>
          )}
          <p className="text-[10px] text-slate-500 leading-relaxed">
            {t("provider.proxyEditor.deployHintPrefix")}
            <code className="px-1 py-0.5 bg-slate-200 rounded text-[10px]">server/llm-proxy-worker</code>
            {t("provider.proxyEditor.deployHintSuffix")}
          </p>
        </div>
      )}
    </div>
  );
}

// 路由优先级配置：用户可自定义"普通生成"和"图片识别"两个场景下三种能力的查找顺序
// 上移/下移按钮调整顺序；首项是首选，找不到（未启用）时按顺序回退；改动即时持久化
function RoutingPriorityEditor() {
  const { t } = useTranslation("dialog");
  const [tick, setTick] = useState(0);

  const isCustom = (sc: RoutingScenario): boolean => {
    const cur = getRoutingPriority(sc);
    const def = DEFAULT_ROUTING[sc];
    return cur.some((c, i) => c !== def[i]);
  };

  const move = (sc: RoutingScenario, idx: number, dir: -1 | 1) => {
    const arr = [...getRoutingPriority(sc)];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target]!, arr[idx]!];
    setRoutingPriority(sc, arr);
    setTick((t) => t + 1);
  };

  const reset = (sc: RoutingScenario) => {
    resetRoutingPriority(sc);
    setTick((t) => t + 1);
  };

  void tick; // 仅触发 re-read

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        {t("provider.routing.intro")}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(["general", "image-recognition"] as RoutingScenario[]).map((sc) => {
          const order = getRoutingPriority(sc);
          const customized = isCustom(sc);
          return (
            <div key={sc} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  {t(`provider.scenario.${SCENARIO_I18N_KEY[sc]}`)}
                </span>
                {customized && (
                  <button
                    type="button"
                    onClick={() => reset(sc)}
                    title={t("provider.routing.resetTitle")}
                    className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  >
                    <RotateCcw size={11} />
                    {t("provider.routing.reset")}
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {order.map((cap, i) => {
                  const colors = CAPABILITY_COLORS[cap];
                  return (
                    <div key={cap} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-medium w-4 text-center">{i + 1}</span>
                      <span
                        className={cn("flex-1 text-xs px-2 py-1 rounded border font-medium text-center", colors.badge)}
                        title={t(`provider.capability.desc.${CAPABILITY_I18N_KEY[cap]}`)}
                      >
                        {t(`provider.capability.label.${CAPABILITY_I18N_KEY[cap]}`)}
                      </span>
                      <div className="inline-flex">
                        <button
                          type="button"
                          onClick={() => move(sc, i, -1)}
                          disabled={i === 0}
                          title={t("provider.routing.moveUp")}
                          className={cn(
                            "p-1 rounded",
                            i === 0
                              ? "text-slate-300 cursor-not-allowed"
                              : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                          )}
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(sc, i, 1)}
                          disabled={i === order.length - 1}
                          title={t("provider.routing.moveDown")}
                          className={cn(
                            "p-1 rounded",
                            i === order.length - 1
                              ? "text-slate-300 cursor-not-allowed"
                              : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                          )}
                        >
                          <ArrowDown size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfigRow({
  config,
  active,
  onActivate,
  onDeactivate,
  onClone,
  onEdit,
  onDelete,
}: {
  config: ModelConfig;
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onClone: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("dialog");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const r = await testConnection(config);
      setResult(r);
    } finally {
      setTesting(false);
    }
  };

  const capColor = CAPABILITY_COLORS[config.capability];
  const capLabel = t(`provider.capability.label.${CAPABILITY_I18N_KEY[config.capability]}`);
  const capDesc = t(`provider.capability.desc.${CAPABILITY_I18N_KEY[config.capability]}`);
  const compatLabel = t(`provider.compat.${COMPAT_I18N_KEY[config.provider]}`);
  const connectionLabel = config.useProxy
    ? t("provider.connection.proxy")
    : t("provider.connection.webDirect");

  return (
    <div
      className={cn(
        "rounded-lg border",
        active ? `${capColor.activeBorder} ${capColor.activeBg}` : "border-slate-200 bg-white hover:border-slate-300"
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold text-slate-800 truncate">{config.name}</span>
            <span
              className={cn("flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border font-medium", capColor.badge)}
              title={capDesc}
            >
              {capLabel}
            </span>
            {/* 连接方式仅 icon + tooltip：直连无需视觉强调，仅在与"代理"对照时区分；icon 走灰调避免抢 capability 色 */}
            <span
              className="flex-shrink-0 text-slate-500"
              title={connectionLabel}
              aria-label={connectionLabel}
            >
              {config.useProxy ? <Server size={12} /> : <Globe size={12} />}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono truncate">
            {compatLabel} · {config.model}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={runTest}
            disabled={testing}
            title={t("provider.configRow.testTitle")}
            className={cn(
              "text-xs px-2 py-1 rounded border inline-flex items-center gap-1",
              testing
                ? "border-slate-200 text-slate-400 cursor-not-allowed"
                : "border-slate-300 text-slate-600 hover:bg-slate-100"
            )}
          >
            {testing ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
            {testing ? t("provider.configRow.testing") : t("provider.configRow.test")}
          </button>
          <button
            onClick={active ? onDeactivate : onActivate}
            title={
              active
                ? t("provider.configRow.deactivateTitle")
                : t("provider.configRow.activateTitle", { capability: capLabel })
            }
            className={cn(
              "text-xs px-2.5 py-1 rounded border whitespace-nowrap",
              active
                ? "border-rose-300 text-rose-700 hover:bg-rose-50"
                : "border-blue-300 text-blue-700 hover:bg-blue-100"
            )}
          >
            {active ? t("provider.configRow.deactivate") : t("provider.configRow.activate")}
          </button>
          <button
            onClick={onClone}
            title={t("provider.configRow.cloneTitle")}
            className="p-1.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Copy size={13} />
          </button>
          <button
            onClick={onEdit}
            title={t("provider.configRow.editTitle")}
            className="p-1.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            title={t("provider.configRow.deleteTitle")}
            className="p-1.5 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {result && (
        <div
          className={cn(
            "mx-3 mb-2 px-2.5 py-1.5 rounded text-[11px] border flex items-start gap-1.5",
            result.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-700"
          )}
        >
          {result.ok ? (
            <Check size={12} className="flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            {result.ok ? (
              <span>
                {t("provider.configRow.testOk", { ms: result.latencyMs })}
                {result.preview ? <span className="ml-1 text-emerald-600">「{result.preview}」</span> : null}
              </span>
            ) : (
              <span className="whitespace-pre-wrap break-words">{result.error}</span>
            )}
          </div>
          <button
            onClick={() => setResult(null)}
            className="flex-shrink-0 opacity-50 hover:opacity-100"
            title={t("provider.configRow.closeTestResult")}
          >
            <X size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

interface Draft {
  name: string;
  provider: ProviderId;
  capability: Capability;
  apiKey: string;
  model: string;
  baseURL: string;
  maxOutputTokens?: number;
  maxTokensMode: "auto" | "fixed";
  useProxy: boolean;
}

function FormView({
  editing,
  onSave,
  onCancel,
}: {
  editing?: ModelConfig;
  onSave: (draft: Omit<ModelConfig, "id" | "createdAt">) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("dialog");
  const [draft, setDraft] = useState<Draft>(() => ({
    name: editing?.name ?? "",
    provider: editing?.provider ?? "anthropic",
    capability: editing?.capability ?? "general",
    apiKey: editing?.apiKey ?? "",
    model: editing?.model ?? "",
    baseURL: editing?.baseURL ?? "",
    maxOutputTokens: editing?.maxOutputTokens,
    maxTokensMode: editing?.maxTokensMode ?? "auto",  // 默认智能分配
    useProxy: editing?.useProxy ?? false,  // 默认 Web 直连，用户可切换
  }));
  const [showKey, setShowKey] = useState(false);

  // 服务预设选中态：与"兼容协议"解耦——切换协议不动它，
  // 仅在"点预设 / 点自定义 / 改 baseURL 或 model"时变化
  const initialPresetId = editing
    ? PRESETS.find(
        (p) =>
          p.provider === editing.provider &&
          (p.baseURL ?? "") === (editing.baseURL ?? "") &&
          p.model === editing.model,
      )?.id
    : undefined;
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>(initialPresetId);
  // "自定义"按钮是否被显式点击：新建时初始 false（无任何选中态）；
  // 编辑老配置时若 baseURL/model 不匹配任何预设则视为"已是自定义态"
  const [customSelected, setCustomSelected] = useState<boolean>(
    !!editing && !initialPresetId,
  );

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    // 覆盖 provider / baseURL / model / maxOutputTokens；保留 name / apiKey / capability
    // 模型能力作为独立维度由用户控制，不被预设联动
    // maxOutputTokens 走 inferModelOutputCap 单一数据源（与生成态 chooseMaxTokens 一致）
    update({
      provider: preset.provider,
      baseURL: preset.baseURL,
      model: preset.model,
      maxOutputTokens: inferModelOutputCap(preset.model, preset.provider),
    });
    setSelectedPresetId(presetId);
    setCustomSelected(false);
  };

  const canSave = !!(draft.name.trim() && draft.apiKey.trim() && draft.model.trim());

  const save = () => {
    if (!canSave) return;
    onSave({
      name: draft.name.trim(),
      provider: draft.provider,
      capability: draft.capability,
      apiKey: draft.apiKey.trim(),
      model: draft.model.trim(),
      baseURL: draft.baseURL.trim() || undefined,
      maxOutputTokens: draft.maxOutputTokens,
      maxTokensMode: draft.maxTokensMode,
      useProxy: draft.useProxy,
    });
  };

  // 切换连接方式：清掉在新模式下不可见的 selectedPresetId（保留 baseURL/model 让用户继续编辑）
  const setUseProxy = (next: boolean) => {
    update({ useProxy: next });
    if (selectedPresetId) {
      const preset = PRESETS.find((p) => p.id === selectedPresetId);
      // Web 直连下只见 webDirect=true 的预设；后端代理下见全部
      if (preset && next === false && !preset.webDirect) {
        setSelectedPresetId(undefined);
      }
    }
  };

  // 当前连接方式可见的预设：Web 直连只见 webDirect=true，后端代理见全部
  const visiblePresets = draft.useProxy ? PRESETS : PRESETS.filter((p) => p.webDirect);
  const proxyUrl = getProxyUrl();
  const proxyMissing = draft.useProxy && !proxyUrl;

  return (
    <>
      <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-700 p-1 -ml-1"
            title={t("provider.formView.backToList")}
          >
            <ArrowLeft size={16} />
          </button>
          <h2 className="text-base font-semibold truncate">
            {editing
              ? t("provider.formView.titleEdit", { name: editing.name })
              : t("provider.formView.titleNew")}
          </h2>
        </div>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-700">
          <X size={18} />
        </button>
      </header>

      <main className="flex-1 overflow-auto p-5 space-y-3">
        <Field label={t("provider.formView.aliasLabel")}>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder={t("provider.formView.aliasPlaceholder")}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </Field>

        <Field label={t("provider.formView.connectionLabel")}>
          <div className="flex border border-slate-200 rounded overflow-hidden">
            <button
              type="button"
              onClick={() => setUseProxy(false)}
              className={cn(
                "flex-1 px-3 py-2 text-sm transition-colors inline-flex items-center justify-center gap-1.5",
                draft.useProxy === false
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50",
              )}
              title={t("provider.formView.webDirectTitle")}
            >
              <Globe size={13} />
              {t("provider.connection.webDirect")}
            </button>
            <button
              type="button"
              onClick={() => setUseProxy(true)}
              className={cn(
                "flex-1 px-3 py-2 text-sm transition-colors inline-flex items-center justify-center gap-1.5",
                draft.useProxy === true
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50",
              )}
              title={t("provider.formView.proxyTitle")}
            >
              <Server size={13} />
              {t("provider.connection.proxy")}
            </button>
          </div>
          {proxyMissing && (
            <div className="mt-1.5 px-2.5 py-1.5 rounded border border-amber-200 bg-amber-50 text-[11px] text-amber-800 leading-relaxed">
              {t("provider.formView.proxyMissingHint")}
            </div>
          )}
        </Field>

        <Field label={t("provider.formView.presetLabel")}>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => {
                update({ baseURL: "", model: "", maxOutputTokens: undefined });
                setSelectedPresetId(undefined);
                setCustomSelected(true);
              }}
              className={cn(
                "text-xs px-2 py-1.5 rounded border border-dashed truncate transition-colors",
                customSelected
                  ? "border-blue-400 bg-blue-50 text-blue-700 font-semibold"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-blue-50 hover:border-blue-300",
              )}
              title={t("provider.formView.presetCustomTitle")}
            >
              {t("provider.formView.presetCustom")}
            </button>
            {visiblePresets.map((p) => {
              const active = selectedPresetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={cn(
                    "text-xs px-2 py-1.5 rounded border truncate transition-colors",
                    active
                      ? "border-blue-400 bg-blue-50 text-blue-700 font-semibold"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:border-blue-300",
                  )}
                  title={`${t(`provider.compat.${COMPAT_I18N_KEY[p.provider]}`)} · ${p.baseURL || "default"} · ${p.model}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label={t("provider.formView.capabilityLabel")}>
          <div className="grid grid-cols-3 gap-1.5">
            {ALL_CAPABILITIES.map((cap) => (
              <button
                key={cap}
                type="button"
                onClick={() => update({ capability: cap })}
                title={t(`provider.capability.desc.${CAPABILITY_I18N_KEY[cap]}`)}
                className={cn(
                  "px-2 py-2 rounded text-xs transition-colors text-center border",
                  draft.capability === cap
                    ? cn(CAPABILITY_COLORS[cap].activeBorder, CAPABILITY_COLORS[cap].activeBg, "font-semibold text-slate-800")
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {t(`provider.capability.label.${CAPABILITY_I18N_KEY[cap]}`)}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
            {t(`provider.capability.desc.${CAPABILITY_I18N_KEY[draft.capability]}`)}
          </p>
        </Field>

        <Field label={t("provider.compat.label")}>
          <div className="flex border border-slate-200 rounded overflow-hidden">
            {ALL_PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => update({ provider: p })}
                className={cn(
                  "flex-1 px-3 py-2 text-sm transition-colors",
                  draft.provider === p
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {t(`provider.compat.${COMPAT_I18N_KEY[p]}`)}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t("provider.formView.baseURLLabel")}>
          <input
            type="text"
            value={draft.baseURL}
            onChange={(e) => {
              update({ baseURL: e.target.value });
              setSelectedPresetId(undefined);
              setCustomSelected(false);
            }}
            placeholder={
              draft.provider === "anthropic"
                ? t("provider.formView.baseURLPlaceholderAnthropic")
                : t("provider.formView.baseURLPlaceholderOpenAI")
            }
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded font-mono outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </Field>

        <Field label={t("provider.formView.modelLabel")}>
          <input
            type="text"
            value={draft.model}
            onChange={(e) => {
              update({ model: e.target.value });
              setSelectedPresetId(undefined);
              setCustomSelected(false);
            }}
            placeholder={
              draft.provider === "anthropic"
                ? t("provider.formView.modelPlaceholderAnthropic")
                : t("provider.formView.modelPlaceholderOpenAI")
            }
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded font-mono outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </Field>

        <Field label={t("provider.formView.apiKeyLabel")}>
          <div className="flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={draft.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              placeholder={
                draft.provider === "anthropic"
                  ? t("provider.formView.apiKeyPlaceholderAnthropic")
                  : t("provider.formView.apiKeyPlaceholderOpenAI")
              }
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded font-mono outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="text-xs px-3 py-2 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              {showKey ? t("provider.formView.hideKey") : t("provider.formView.showKey")}
            </button>
          </div>
        </Field>

        <Field label={t("provider.formView.maxTokensLabel")}>
          <input
            type="number"
            min={1024}
            max={200000}
            step={1024}
            value={draft.maxOutputTokens ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              update({ maxOutputTokens: v === "" ? undefined : Number(v) });
            }}
            placeholder={
              draft.provider === "anthropic"
                ? t("provider.formView.maxTokensPlaceholderAnthropic")
                : t("provider.formView.maxTokensPlaceholderOpenAI")
            }
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded font-mono outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            {t("provider.formView.maxTokensHint")}
          </p>
          {draft.maxTokensMode === "fixed" && draft.maxOutputTokens != null && draft.maxOutputTokens > 64000 ? (
            <p className="text-[11px] text-amber-600 mt-1 leading-relaxed">
              {t("provider.formView.maxTokensWarn", { n: draft.maxOutputTokens })}
            </p>
          ) : null}

          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-slate-600 flex-shrink-0">
              {t("provider.formView.maxTokensModeLabel")}
            </span>
            <div className="flex border border-slate-200 rounded overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => update({ maxTokensMode: "auto" })}
                title={t("provider.formView.maxTokensModeAutoTitle")}
                className={cn(
                  "px-2.5 py-1 transition-colors",
                  draft.maxTokensMode === "auto"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {t("provider.formView.maxTokensModeAuto")}
              </button>
              <button
                type="button"
                onClick={() => update({ maxTokensMode: "fixed" })}
                title={t("provider.formView.maxTokensModeFixedTitle")}
                className={cn(
                  "px-2.5 py-1 transition-colors",
                  draft.maxTokensMode === "fixed"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {t("provider.formView.maxTokensModeFixed")}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
            {draft.maxTokensMode === "auto"
              ? t("provider.formView.maxTokensModeAutoHint")
              : t("provider.formView.maxTokensModeFixedHint")}
          </p>
        </Field>
      </main>

      <footer className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2 flex-shrink-0">
        <button
          onClick={onCancel}
          className="text-sm px-3 py-1.5 rounded text-slate-600 hover:bg-slate-100"
        >
          {t("provider.formView.cancel")}
        </button>
        <button
          onClick={save}
          disabled={!canSave}
          className="text-sm px-4 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          {t("provider.formView.save")}
        </button>
      </footer>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-slate-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

