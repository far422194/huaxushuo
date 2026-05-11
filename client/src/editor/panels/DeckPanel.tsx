import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Wand2 } from "lucide-react";
import { useEditorStore } from "@/store/editor";
import { Section, Field, TextInput, ColorInput, Select } from "./forms";
import { Tabs } from "./Tabs";
import { contrastRatio, classifyContrast, pickReadableForeground } from "@/lib/contrast";

type DeckTab = "info" | "colors" | "type";

export function DeckPanel() {
  const { t } = useTranslation("editor");
  const meta = useEditorStore((s) => s.deck.meta);
  const theme = useEditorStore((s) => s.deck.theme);
  const updateMeta = useEditorStore((s) => s.updateMeta);
  const updateTheme = useEditorStore((s) => s.updateTheme);
  const [tab, setTab] = useState<DeckTab>("info");

  return (
    <>
      <Tabs<DeckTab>
        value={tab}
        onChange={setTab}
        size="sm"
        options={[
          { value: "info", label: t("panels.deck.tabInfo") },
          { value: "colors", label: t("panels.deck.tabColors") },
          { value: "type", label: t("panels.deck.tabType") },
        ]}
      />

      {tab === "info" && (
        <Section title={t("panels.deck.info")}>
          <Field label={t("panels.deck.title")}>
            <TextInput
              value={meta.title}
              onChange={(e) => updateMeta((m) => { m.title = e.target.value; })}
            />
          </Field>
          <Field label={t("panels.deck.description")}>
            <TextInput
              value={meta.description ?? ""}
              onChange={(e) => updateMeta((m) => { m.description = e.target.value; })}
            />
          </Field>
          <Field label={t("panels.deck.author")}>
            <TextInput
              value={meta.author ?? ""}
              onChange={(e) => updateMeta((m) => { m.author = e.target.value; })}
            />
          </Field>
          <Field
            label={t("panels.deck.ratio")}
            hint={t("panels.deck.ratioHint")}
          >
            <Select
              value={meta.aspectRatio}
              onChange={(v) => updateMeta((m) => { m.aspectRatio = v; })}
              options={[
                { value: "auto", label: t("panels.deck.ratioAuto") },
                { value: "16:9", label: t("panels.deck.ratio169") },
                { value: "4:3", label: t("panels.deck.ratio43") },
              ]}
            />
          </Field>
        </Section>
      )}

      {tab === "colors" && (
        <Section title={t("panels.colors.title")}>
          <Field label={t("panels.colors.bg")}>
            <ColorInput value={theme.colors.bg} onChange={(v) => updateTheme((t2) => { t2.colors.bg = v; })} />
          </Field>
          <Field label={t("panels.colors.fg")}>
            <ColorInput value={theme.colors.fg} onChange={(v) => updateTheme((t2) => { t2.colors.fg = v; })} />
          </Field>
          <Field label={t("panels.colors.primary")}>
            <ColorInput value={theme.colors.primary} onChange={(v) => updateTheme((t2) => { t2.colors.primary = v; })} />
          </Field>
          <Field label={t("panels.colors.accent")}>
            <ColorInput
              value={theme.colors.accent ?? theme.colors.primary}
              onChange={(v) => updateTheme((t2) => { t2.colors.accent = v; })}
            />
          </Field>
          <Field label={t("panels.colors.muted")}>
            <ColorInput
              value={theme.colors.muted ?? "#94a3b8"}
              onChange={(v) => updateTheme((t2) => { t2.colors.muted = v; })}
            />
          </Field>
          <ContrastPanel
            bg={theme.colors.bg}
            fg={theme.colors.fg}
            primary={theme.colors.primary}
            onAutoFix={(safeFg) => updateTheme((t2) => { t2.colors.fg = safeFg; })}
          />
        </Section>
      )}

      {tab === "type" && (
        <Section title={t("panels.type.title")}>
          <Field label={t("panels.type.headingFont")}>
            <TextInput
              value={theme.fonts.heading}
              onChange={(e) => updateTheme((t2) => { t2.fonts.heading = e.target.value; })}
            />
          </Field>
          <Field label={t("panels.type.bodyFont")}>
            <TextInput
              value={theme.fonts.body}
              onChange={(e) => updateTheme((t2) => { t2.fonts.body = e.target.value; })}
            />
          </Field>
          <Field label={t("panels.type.radius")}>
            <Select
              value={theme.radius}
              onChange={(v) => updateTheme((t2) => { t2.radius = v; })}
              options={[
                { value: "none", label: t("panels.type.radiusOptions.none") },
                { value: "sm", label: t("panels.type.radiusOptions.sm") },
                { value: "md", label: t("panels.type.radiusOptions.md") },
                { value: "lg", label: t("panels.type.radiusOptions.lg") },
                { value: "xl", label: t("panels.type.radiusOptions.xl") },
              ]}
            />
          </Field>
          <Field label={t("panels.type.mode")}>
            <Select
              value={theme.mode}
              onChange={(v) => updateTheme((t2) => { t2.mode = v; })}
              options={[
                { value: "light", label: t("panels.type.modeLight") },
                { value: "dark", label: t("panels.type.modeDark") },
              ]}
            />
          </Field>
        </Section>
      )}
    </>
  );
}

// 对比度面板：检测 bg/fg 与 bg/primary，对比度不足时显示警告 + 一键修复
function ContrastPanel({
  bg,
  fg,
  primary,
  onAutoFix,
}: {
  bg: string;
  fg: string;
  primary: string;
  onAutoFix: (safeFg: string) => void;
}) {
  const { t } = useTranslation("editor");
  const fgRatio = contrastRatio(bg, fg);
  const fgLevel = classifyContrast(fgRatio);
  const primaryRatio = contrastRatio(bg, primary);
  const primaryLevel = classifyContrast(primaryRatio);

  const needsFix = fgLevel === "fail" || fgLevel === "weak";
  const safeFg = pickReadableForeground(bg, fg);
  const safeColorWord = safeFg === "#ffffff" ? t("panels.contrast.white") : t("panels.contrast.black");

  return (
    <div className="mt-1 space-y-1.5 rounded border border-slate-200 bg-slate-50/50 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("panels.contrast.title")}</p>
      <ContrastRow label={t("panels.contrast.body")} pair={`${bg}↔${fg}`} ratio={fgRatio} level={fgLevel} />
      <ContrastRow label={t("panels.contrast.primary")} pair={`${bg}↔${primary}`} ratio={primaryRatio} level={primaryLevel} />
      {needsFix && (
        <div className="flex items-start gap-1.5 mt-1 px-2 py-1.5 rounded bg-amber-50 border border-amber-200">
          <AlertTriangle size={11} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[11px] text-amber-800 leading-relaxed">
              {t("panels.contrast.warning")}
            </p>
            {safeFg.toLowerCase() !== fg.toLowerCase() && (
              <button
                onClick={() => onAutoFix(safeFg)}
                className="mt-1 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-amber-600 text-white hover:bg-amber-700"
              >
                <Wand2 size={10} />
                {t("panels.contrast.autoFix", { color: safeColorWord })}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContrastRow({
  label,
  pair,
  ratio,
  level,
}: {
  label: string;
  pair: string;
  ratio: number;
  level: ReturnType<typeof classifyContrast>;
}) {
  const { t } = useTranslation("editor");
  const colorByLevel: Record<typeof level, string> = {
    fail: "text-rose-700 bg-rose-100",
    weak: "text-amber-700 bg-amber-100",
    ok: "text-emerald-700 bg-emerald-100",
    great: "text-emerald-800 bg-emerald-100",
  };
  const labelByLevel: Record<typeof level, string> = {
    fail: t("panels.contrast.level.fail"),
    weak: t("panels.contrast.level.weak"),
    ok: t("panels.contrast.level.ok"),
    great: "AAA",
  };
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-slate-500 w-6">{label}</span>
      <span className="font-mono text-slate-400 truncate flex-1" title={pair}>
        {ratio.toFixed(2)} : 1
      </span>
      <span className={`px-1.5 py-0.5 rounded font-medium ${colorByLevel[level]}`}>
        {labelByLevel[level]}
      </span>
    </div>
  );
}
