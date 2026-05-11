import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Upload, X, Download, Loader2, Check, ExternalLink, Copy,
  AlertCircle, Cloud, Settings, FileText, Square,
} from "lucide-react";
import { useEditorStore } from "@/store/editor";
import { exportAsZip, buildZipBlob } from "@/publish/exportZip";
import { exportAsPdf, buildPdfFilename } from "@/publish/exportPdf";
import { PdfStage } from "@/publish/PdfStage";
import { getDeployTargets, type DeployTarget } from "@/publish/deployHints";
import { directUploadToCloudflare } from "@/publish/directUpload";
import {
  loadDeploySettings, saveDeploySettings, isDeployConfigured,
  type DeploySettings,
} from "@/data/deploySettings";
import { cn } from "@/lib/cn";

type Tab = "zip" | "direct" | "pdf";

type ZipStatus =
  | { kind: "idle" }
  | { kind: "building" }
  | { kind: "error"; message: string }
  | { kind: "ready"; blobUrl: string; filename: string };

type DirectStatus =
  | { kind: "idle" }
  | { kind: "uploading"; loaded: number; total: number; phase: "build" | "upload" }
  | { kind: "error"; message: string }
  | { kind: "ready"; url: string; aliases: string[]; fileCount: number };

type PdfStatus =
  | { kind: "idle" }
  | { kind: "exporting"; current: number; total: number }
  | { kind: "error"; message: string }
  | { kind: "ready"; blobUrl: string; filename: string };

export function PublishDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("dialog");
  const deck = useEditorStore((s) => s.deck);
  const [tab, setTab] = useState<Tab>(isDeployConfigured() ? "direct" : "zip");
  const [zipStatus, setZipStatus] = useState<ZipStatus>({ kind: "idle" });
  const [directStatus, setDirectStatus] = useState<DirectStatus>({ kind: "idle" });
  const [pdfStatus, setPdfStatus] = useState<PdfStatus>({ kind: "idle" });
  const [pdfStageIndex, setPdfStageIndex] = useState(0);
  const pdfStageRef = useRef<HTMLDivElement>(null);
  const pdfAbortRef = useRef<AbortController | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const startBuild = async () => {
    setZipStatus({ kind: "building" });
    try {
      const { blobUrl, filename } = await exportAsZip(deck);
      setZipStatus({ kind: "ready", blobUrl, filename });
    } catch (err: any) {
      setZipStatus({ kind: "error", message: err?.message ?? String(err) });
    }
  };

  const startPdfExport = async () => {
    setPdfStatus({ kind: "exporting", current: 0, total: deck.slides.length });
    setPdfStageIndex(0);
    const controller = new AbortController();
    pdfAbortRef.current = controller;
    try {
      // 等舞台首次挂载（rAF×2 让 React commit 完成）
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      );
      const root = pdfStageRef.current;
      if (!root) throw new Error(t("publish.pdf.stageNotReady"));
      const blob = await exportAsPdf({
        deck,
        renderRoot: root,
        signal: controller.signal,
        // setIndex 仅负责切页 + 等 React commit；具体等待时长由 exportPdf 按 slide.transitionDuration 决定
        setIndex: (i) =>
          new Promise<void>((r) => {
            setPdfStageIndex(i);
            requestAnimationFrame(() => requestAnimationFrame(() => r()));
          }),
        onProgress: (current, total) => {
          setPdfStatus({ kind: "exporting", current, total });
        },
      });
      const blobUrl = URL.createObjectURL(blob);
      setPdfStatus({ kind: "ready", blobUrl, filename: buildPdfFilename(deck) });
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setPdfStatus({ kind: "idle" });
      } else {
        setPdfStatus({ kind: "error", message: err?.message ?? String(err) });
      }
    } finally {
      pdfAbortRef.current = null;
    }
  };

  const cancelPdfExport = () => {
    pdfAbortRef.current?.abort();
  };

  const startDirectUpload = async () => {
    const settings = loadDeploySettings();
    if (!isDeployConfigured()) {
      setShowSettings(true);
      return;
    }
    try {
      setDirectStatus({ kind: "uploading", loaded: 0, total: 1, phase: "build" });
      const { blob } = await buildZipBlob(deck);
      setDirectStatus({ kind: "uploading", loaded: 0, total: blob.size, phase: "upload" });
      const result = await directUploadToCloudflare({
        workerUrl: settings.workerUrl,
        projectName: settings.projectName,
        zipBlob: blob,
        onProgress: (loaded, total) => {
          setDirectStatus({ kind: "uploading", loaded, total, phase: "upload" });
        },
      });
      if (!result.ok || !result.url) {
        setDirectStatus({ kind: "error", message: result.error ?? t("publish.error.retry") });
        return;
      }
      setDirectStatus({
        kind: "ready",
        url: result.url,
        aliases: result.aliases ?? [],
        fileCount: result.fileCount ?? 0,
      });
    } catch (err: any) {
      setDirectStatus({ kind: "error", message: err?.message ?? String(err) });
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[600px] max-w-[92vw] max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-blue-600" />
            <h2 className="text-lg font-semibold">{t("publish.title")}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </header>

        {/* Tab 切换 */}
        <div className="px-6 pt-3 border-b border-slate-200 flex items-center gap-4 text-sm">
          <button
            onClick={() => setTab("direct")}
            className={cn(
              "px-3 py-2 -mb-px border-b-2 transition flex items-center gap-1.5",
              tab === "direct"
                ? "border-blue-600 text-blue-700 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            <Cloud size={14} />
            {t("publish.tab.direct")}
          </button>
          <button
            onClick={() => setTab("zip")}
            className={cn(
              "px-3 py-2 -mb-px border-b-2 transition flex items-center gap-1.5",
              tab === "zip"
                ? "border-blue-600 text-blue-700 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            <Download size={14} />
            {t("publish.tab.zip")}
          </button>
          <button
            onClick={() => setTab("pdf")}
            className={cn(
              "px-3 py-2 -mb-px border-b-2 transition flex items-center gap-1.5",
              tab === "pdf"
                ? "border-blue-600 text-blue-700 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            <FileText size={14} />
            {t("publish.tab.pdf")}
          </button>
          <span className="ml-auto" />
          <button
            onClick={() => setShowSettings(true)}
            className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-50"
            title={t("publish.configureTitle")}
          >
            <Settings size={12} />
            {t("publish.configure")}
          </button>
        </div>

        <div className="px-6 py-4 overflow-auto flex-1">
          {tab === "direct" && (
            <DirectView
              status={directStatus}
              onStart={startDirectUpload}
              onConfigure={() => setShowSettings(true)}
              configured={isDeployConfigured()}
              title={deck.meta.title}
              slideCount={deck.slides.length}
            />
          )}
          {tab === "zip" && (
            <>
              {zipStatus.kind === "idle" && (
                <ZipIdleView
                  title={deck.meta.title}
                  slideCount={deck.slides.length}
                  onStart={startBuild}
                />
              )}
              {zipStatus.kind === "building" && <BuildingView />}
              {zipStatus.kind === "error" && <ErrorView message={zipStatus.message} onRetry={startBuild} />}
              {zipStatus.kind === "ready" && (
                <ZipReadyView blobUrl={zipStatus.blobUrl} filename={zipStatus.filename} />
              )}
            </>
          )}
          {tab === "pdf" && (
            <PdfView
              status={pdfStatus}
              title={deck.meta.title}
              slideCount={deck.slides.length}
              onStart={startPdfExport}
              onCancel={cancelPdfExport}
            />
          )}
        </div>

        {/* 离屏舞台：仅 pdf tab 且非 idle 时挂载，避免常驻渲染 */}
        {tab === "pdf" && pdfStatus.kind !== "idle" && pdfStatus.kind !== "error" && (
          <PdfStage ref={pdfStageRef} deck={deck} index={pdfStageIndex} />
        )}

        <footer className="px-6 py-3 border-t border-slate-200 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="text-sm px-4 py-1.5 rounded text-slate-600 hover:bg-slate-100"
          >
            {zipStatus.kind === "ready" || directStatus.kind === "ready" || pdfStatus.kind === "ready"
              ? t("publish.footer.done")
              : t("publish.footer.cancel")}
          </button>
        </footer>

        {showSettings && (
          <DeploySettingsDialog onClose={() => setShowSettings(false)} />
        )}
      </div>
    </div>
  );
}

// ---------- 一键直传 ----------

function DirectView({
  status, onStart, onConfigure, configured, title, slideCount,
}: {
  status: DirectStatus;
  onStart: () => void;
  onConfigure: () => void;
  configured: boolean;
  title: string;
  slideCount: number;
}) {
  const { t } = useTranslation("dialog");
  if (status.kind === "ready") {
    return <DirectReadyView url={status.url} aliases={status.aliases} fileCount={status.fileCount} />;
  }
  if (status.kind === "error") {
    return <ErrorView message={status.message} onRetry={onStart} />;
  }
  if (status.kind === "uploading") {
    const pct = status.total > 0 ? Math.round((status.loaded / status.total) * 100) : 0;
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-600">
        <Loader2 size={32} className="animate-spin mb-3 text-blue-600" />
        <p className="text-sm font-medium mb-1">
          {status.phase === "build"
            ? t("publish.direct.buildingZip")
            : t("publish.direct.uploading", { pct })}
        </p>
        {status.phase === "upload" && (
          <div className="w-64 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-3">{t("publish.direct.duration")}</p>
      </div>
    );
  }
  // idle
  return (
    <div>
      <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 mb-4">
        <div className="text-sm font-medium text-slate-800 mb-1">{title || t("publish.summary.untitled")}</div>
        <div className="text-xs text-slate-500">
          {t("publish.summary.slides", { count: slideCount })} · {t("publish.summary.directSuffix")}
        </div>
      </div>

      {!configured ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2.5 mb-4 flex items-start gap-2 text-xs text-amber-900">
          <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium mb-1">{t("publish.direct.notConfigured")}</div>
            <p className="leading-relaxed">{t("publish.direct.notConfiguredHint")}</p>
            <button
              onClick={onConfigure}
              className="mt-2 inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-white border border-amber-300 hover:bg-amber-100 text-amber-800"
            >
              <Settings size={11} />
              {t("publish.direct.configureNow")}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-600 leading-relaxed mb-4">{t("publish.direct.intro")}</p>
      )}

      <button
        onClick={onStart}
        disabled={!configured}
        className={cn(
          "w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium",
          configured
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-slate-200 text-slate-400 cursor-not-allowed",
        )}
      >
        <Cloud size={16} />
        {t("publish.direct.submit")}
      </button>
    </div>
  );
}

function DirectReadyView({
  url, aliases, fileCount,
}: { url: string; aliases: string[]; fileCount: number }) {
  const { t } = useTranslation("dialog");
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 mb-4 flex items-start gap-2">
        <Check size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-emerald-800 mb-1">{t("publish.direct.deployed")}</div>
          <p className="text-xs text-emerald-700 mb-2">
            {t("publish.direct.uploadedFiles", { count: fileCount })}
          </p>

          <div className="flex items-center gap-2 bg-white border border-emerald-200 rounded px-2 py-1.5">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-xs text-blue-700 hover:underline font-mono truncate"
            >
              {url}
            </a>
            <button
              onClick={copy}
              className={cn(
                "text-xs px-2 py-0.5 rounded inline-flex items-center gap-1 border flex-shrink-0",
                copied
                  ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100",
              )}
            >
              {copied ? <Check size={10} /> : <Copy size={10} />}
              {copied ? t("publish.direct.copied") : t("publish.direct.copy")}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1 flex-shrink-0"
            >
              <ExternalLink size={10} />
              {t("publish.direct.visit")}
            </a>
          </div>

          {aliases.length > 0 && (
            <div className="text-[10px] text-emerald-700 mt-2">
              {t("publish.direct.aliases")}{aliases.map((a) => (
                <a key={a} href={a} target="_blank" rel="noopener noreferrer" className="ml-1 underline">
                  {a}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">{t("publish.direct.previewNote")}</p>
    </div>
  );
}

// ---------- 配置弹窗 ----------

function DeploySettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("dialog");
  const [settings, setSettings] = useState<DeploySettings>(loadDeploySettings());
  const save = () => {
    saveDeploySettings(settings);
    onClose();
  };
  return (
    <div
      className="fixed inset-0 bg-slate-900/55 flex items-center justify-center z-[60] p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[480px] max-w-[92vw] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-slate-600" />
            <h3 className="text-base font-semibold">{t("publish.deploy.title")}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={16} />
          </button>
        </header>

        <div className="p-5 space-y-3 text-sm">
          <p className="text-xs text-slate-600 leading-relaxed">{t("publish.deploy.intro")}</p>

          <Field label={t("publish.deploy.workerUrl")} hint={t("publish.deploy.workerHint")}>
            <input
              type="url"
              value={settings.workerUrl}
              onChange={(e) => setSettings({ ...settings, workerUrl: e.target.value })}
              placeholder="https://hxs-deploy.your-subdomain.workers.dev"
              className="w-full text-sm border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
            />
          </Field>

          <Field label={t("publish.deploy.projectName")} hint={t("publish.deploy.projectHint")}>
            <input
              type="text"
              value={settings.projectName}
              onChange={(e) => setSettings({ ...settings, projectName: e.target.value })}
              placeholder="my-deck"
              className="w-full text-sm border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
            />
          </Field>
        </div>

        <footer className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-4 py-1.5 rounded text-slate-600 hover:bg-slate-100"
          >
            {t("publish.deploy.cancel")}
          </button>
          <button
            onClick={save}
            className="text-sm px-4 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            {t("publish.deploy.save")}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-slate-500 mt-1 leading-relaxed">{hint}</span>}
    </label>
  );
}

// ---------- 导出 zip（原逻辑） ----------

function ZipIdleView({
  title, slideCount, onStart,
}: {
  title: string;
  slideCount: number;
  onStart: () => void;
}) {
  const { t } = useTranslation("dialog");
  return (
    <div>
      <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 mb-4">
        <div className="text-sm font-medium text-slate-800 mb-1">{title || t("publish.summary.untitled")}</div>
        <div className="text-xs text-slate-500">
          {t("publish.summary.slides", { count: slideCount })} · {t("publish.summary.zipSuffix")}
        </div>
      </div>
      <p className="text-xs text-slate-600 leading-relaxed mb-4">{t("publish.zip.intro")}</p>
      <button
        onClick={onStart}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium"
      >
        <Download size={16} />
        {t("publish.zip.submit")}
      </button>
    </div>
  );
}

function BuildingView() {
  const { t } = useTranslation("dialog");
  return (
    <div className="flex flex-col items-center justify-center py-10 text-slate-600">
      <Loader2 size={32} className="animate-spin mb-3 text-blue-600" />
      <p className="text-sm">{t("publish.zip.building")}</p>
    </div>
  );
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation("dialog");
  return (
    <div>
      <div className="flex gap-2 p-4 rounded border border-rose-200 bg-rose-50 text-rose-700 mb-4">
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
        <pre className="text-xs whitespace-pre-wrap font-sans flex-1">{message}</pre>
      </div>
      <button
        onClick={onRetry}
        className="text-sm px-4 py-1.5 rounded border border-slate-200 hover:bg-slate-50"
      >
        {t("publish.error.retry")}
      </button>
    </div>
  );
}

function ZipReadyView({ blobUrl, filename }: { blobUrl: string; filename: string }) {
  const { t } = useTranslation("dialog");
  return (
    <div>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 mb-4 flex items-start gap-2">
        <Check size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-emerald-800 truncate">
            {t("publish.zip.ready", { filename })}
          </div>
          <p className="text-xs text-emerald-700 mt-0.5">{t("publish.zip.readyHint")}</p>
        </div>
        <a
          href={blobUrl}
          download={filename}
          className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1 flex-shrink-0"
        >
          <Download size={12} />
          {t("publish.zip.download")}
        </a>
      </div>

      <div className="mb-2">
        <h3 className="text-sm font-semibold mb-1">{t("publish.zip.deployToPublic")}</h3>
        <p className="text-xs text-slate-500 mb-3">{t("publish.zip.deployIntro")}</p>
      </div>
      <div className="space-y-2">
        {getDeployTargets().map((target) => (
          <DeployRow key={target.id} target={target} />
        ))}
      </div>
    </div>
  );
}

function DeployRow({ target }: { target: DeployTarget }) {
  const { t } = useTranslation("dialog");
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(target.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const isCommand = target.command !== "（无需命令）";
  return (
    <div className="border border-slate-200 rounded p-3 bg-white">
      <div className="flex items-center justify-between mb-1">
        <a
          href={target.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-slate-800 hover:text-blue-600 inline-flex items-center gap-1"
        >
          {target.label}
          <ExternalLink size={11} className="opacity-50" />
        </a>
        {isCommand && (
          <button
            onClick={copy}
            className={cn(
              "text-xs px-2 py-0.5 rounded inline-flex items-center gap-1 border",
              copied
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            )}
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? t("publish.direct.copied") : t("publish.direct.copy")}
          </button>
        )}
      </div>
      <code className="block text-xs font-mono bg-slate-50 px-2 py-1.5 rounded text-slate-700 overflow-x-auto">
        {target.command}
      </code>
      <p className="text-[10px] text-slate-500 mt-1">{target.hint}</p>
    </div>
  );
}

// ---------- 导出 PDF ----------

function PdfView({
  status, title, slideCount, onStart, onCancel,
}: {
  status: PdfStatus;
  title: string;
  slideCount: number;
  onStart: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("dialog");
  if (status.kind === "ready") {
    return (
      <div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 mb-4 flex items-start gap-2">
          <Check size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-emerald-800 truncate">
              {t("publish.pdf.ready", { filename: status.filename })}
            </div>
            <p className="text-xs text-emerald-700 mt-0.5">{t("publish.pdf.readyHint")}</p>
          </div>
          <a
            href={status.blobUrl}
            download={status.filename}
            className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1 flex-shrink-0"
          >
            <Download size={12} />
            {t("publish.pdf.download")}
          </a>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">{t("publish.pdf.afterNote")}</p>
      </div>
    );
  }
  if (status.kind === "error") {
    return <ErrorView message={status.message} onRetry={onStart} />;
  }
  if (status.kind === "exporting") {
    const pct = status.total > 0 ? Math.round((status.current / status.total) * 100) : 0;
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-600">
        <Loader2 size={32} className="animate-spin mb-3 text-blue-600" />
        <p className="text-sm font-medium mb-1">
          {t("publish.pdf.exporting", {
            current: Math.min(status.current + 1, status.total),
            total: status.total,
            pct,
          })}
        </p>
        <div className="w-64 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2">
          <div
            className="h-full bg-blue-600 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <button
          onClick={onCancel}
          className="mt-4 inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-rose-200 text-rose-600 hover:bg-rose-50"
        >
          <Square size={11} fill="currentColor" />
          {t("publish.pdf.cancel")}
        </button>
        <p className="text-[11px] text-slate-400 mt-2">{t("publish.pdf.slowHint")}</p>
      </div>
    );
  }
  // idle
  return (
    <div>
      <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 mb-4">
        <div className="text-sm font-medium text-slate-800 mb-1">{title || t("publish.summary.untitled")}</div>
        <div className="text-xs text-slate-500">
          {t("publish.summary.slides", { count: slideCount })} · {t("publish.summary.pdfSuffix")}
        </div>
      </div>
      <p className="text-xs text-slate-600 leading-relaxed mb-4">{t("publish.pdf.intro")}</p>
      <button
        onClick={onStart}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium"
      >
        <FileText size={16} />
        {t("publish.pdf.submit")}
      </button>
    </div>
  );
}
