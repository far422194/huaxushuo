import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical, Trash2, Move } from "lucide-react";
import type { Slide, Background, Block, Layout, Transition } from "@shared/dsl";
import { LAYOUTS } from "@shared/dsl";
import { useEditorStore } from "@/store/editor";
import { Section, Field, Select, ColorInput, TextInput } from "./forms";
import { ImageInput } from "./ImageInput";
import { UtilitiesEditor } from "./UtilitiesEditor";
import { Tabs } from "./Tabs";
import { AddBlockToolbar } from "./BlockPanel";
import { filterUtilities } from "@shared/dsl";
import { cn } from "@/lib/cn";

type SlideTab = "base" | "content" | "utils";

function useTransitionOptions(): { value: Transition; label: string }[] {
  const { t } = useTranslation("editor");
  return [
    { value: "none", label: t("panels.transitionTypes.none") },
    { value: "fade", label: t("panels.transitionTypes.fade") },
    { value: "slide-left", label: t("panels.transitionTypes.slide-left") },
    { value: "slide-up", label: t("panels.transitionTypes.slide-up") },
    { value: "zoom", label: t("panels.transitionTypes.zoom") },
    { value: "magic", label: t("panels.transitionTypes.magic") },
  ];
}

function defaultDurationMs(t: Transition): number {
  switch (t) {
    case "none": return 0;
    case "fade": return 400;
    case "slide-left": return 400;
    case "slide-up": return 400;
    case "zoom": return 450;
    case "magic": return 250;
  }
}

export function SlidePanel({ slide }: { slide: Slide }) {
  const { t } = useTranslation("editor");
  const transitionOptions = useTransitionOptions();
  const updateSlide = useEditorStore((s) => s.updateSlide);
  const [tab, setTab] = useState<SlideTab>("base");

  return (
    <>
      <Tabs<SlideTab>
        value={tab}
        onChange={setTab}
        size="sm"
        options={[
          { value: "base", label: t("blockTab.base") },
          { value: "content", label: t("blockTab.content") },
          { value: "utils", label: t("blockTab.utils") },
        ]}
      />
      {tab === "base" && (
        <>
      <Section title={t("panels.slide.layout")}>
        <Field>
          <Select<Layout>
            value={slide.layout}
            onChange={(v) => updateSlide(slide.id, (s) => { s.layout = v; })}
            options={LAYOUTS.map((l) => ({ value: l, label: t(`layout.${l}`) }))}
          />
        </Field>
        {slide.layout !== "free" ? (
          <ConvertToFreeButton slideId={slide.id} />
        ) : (
          <p className="text-[10px] text-blue-600 leading-relaxed bg-blue-50 border border-blue-100 px-2 py-1.5 rounded">
            {t("panels.slide.freeHint")}
          </p>
        )}
      </Section>

      <Section title={t("panels.slide.transition")}>
        <Field label={t("panels.slide.transitionType")}>
          <Select<Transition>
            value={slide.transition}
            onChange={(v) => updateSlide(slide.id, (s) => { s.transition = v; })}
            options={transitionOptions}
          />
        </Field>
        <Field
          label={t("panels.slide.transitionDuration", {
            ms: slide.transitionDuration ?? defaultDurationMs(slide.transition),
            suffix: slide.transitionDuration === undefined ? t("panels.slide.transitionDurationDefault") : "",
          })}
          hint={t("panels.slide.transitionHint")}
        >
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={2000}
              step={50}
              value={slide.transitionDuration ?? defaultDurationMs(slide.transition)}
              onChange={(e) =>
                updateSlide(slide.id, (s) => {
                  s.transitionDuration = Number(e.target.value);
                })
              }
              className="flex-1"
            />
            {slide.transitionDuration !== undefined && (
              <button
                onClick={() =>
                  updateSlide(slide.id, (s) => {
                    s.transitionDuration = undefined;
                  })
                }
                className="text-[10px] text-slate-500 hover:text-slate-800 underline"
              >
                {t("panels.slide.reset")}
              </button>
            )}
          </div>
        </Field>
      </Section>

      <Section title={t("panels.slide.background")}>
        <Field label={t("panels.slide.backgroundType")}>
          <Select<"none" | "solid" | "gradient" | "image">
            value={(slide.background?.type ?? "none") as "none" | "solid" | "gradient" | "image"}
            onChange={(v) => {
              updateSlide(slide.id, (s) => {
                if (v === "none") s.background = undefined;
                else if (v === "solid") s.background = { type: "solid", color: "#ffffff" };
                else if (v === "gradient")
                  s.background = { type: "gradient", from: "#2563eb", to: "#7c3aed", angle: 135 };
                else s.background = { type: "image", url: "https://", opacity: 1 };
              });
            }}
            options={[
              { value: "none", label: t("panels.slide.bgInherit") },
              { value: "solid", label: t("panels.slide.bgSolid") },
              { value: "gradient", label: t("panels.slide.bgGradient") },
              { value: "image", label: t("panels.slide.bgImage") },
            ]}
          />
        </Field>
        {slide.background && <BackgroundFields slide={slide} bg={slide.background} />}
      </Section>

      <Section title={t("panels.slide.notes")}>
        <Field>
          <TextInput
            value={slide.notes ?? ""}
            onChange={(e) =>
              updateSlide(slide.id, (s) => {
                s.notes = e.target.value || undefined;
              })
            }
            placeholder={t("panels.slide.notesPlaceholder")}
          />
        </Field>
      </Section>
        </>
      )}

      {tab === "content" && (
        <>
          {slide.blocks.length > 0 && (
            <Section title={t("panels.slide.blocksOrder")}>
              <BlockOrderList slide={slide} />
            </Section>
          )}
          <AddBlockToolbar slide={slide} />
        </>
      )}

      {tab === "utils" && (
      <Section title={t("panels.slide.visualVariants")}>
        <UtilitiesEditor
          value={filterUtilities(slide.utilities)}
          onChange={(next) =>
            updateSlide(slide.id, (s) => {
              s.utilities = next.length > 0 ? next : undefined;
            })
          }
          hint={t("panels.slide.visualHint")}
        />
      </Section>
      )}
    </>
  );
}

function BackgroundFields({ slide, bg }: { slide: Slide; bg: Background }) {
  const { t } = useTranslation("editor");
  const updateSlide = useEditorStore((s) => s.updateSlide);
  if (bg.type === "solid") {
    return (
      <Field label={t("panels.slide.color")}>
        <ColorInput
          value={bg.color}
          onChange={(v) => updateSlide(slide.id, (s) => { (s.background as any) = { type: "solid", color: v }; })}
        />
      </Field>
    );
  }
  if (bg.type === "gradient") {
    return (
      <>
        <Field label={t("panels.slide.fromColor")}>
          <ColorInput
            value={bg.from}
            onChange={(v) => updateSlide(slide.id, (s) => { (s.background as any).from = v; })}
          />
        </Field>
        <Field label={t("panels.slide.toColor")}>
          <ColorInput
            value={bg.to}
            onChange={(v) => updateSlide(slide.id, (s) => { (s.background as any).to = v; })}
          />
        </Field>
        <Field label={t("panels.slide.angle")}>
          <input
            type="range"
            min={0}
            max={360}
            value={bg.angle ?? 135}
            onChange={(e) =>
              updateSlide(slide.id, (s) => {
                (s.background as any).angle = Number(e.target.value);
              })
            }
            className="w-full"
          />
        </Field>
      </>
    );
  }
  // image
  return (
    <Field label={t("panels.slide.imageUrl")}>
      <ImageInput
        value={bg.url}
        onChange={(url) => updateSlide(slide.id, (s) => { (s.background as any).url = url; })}
      />
    </Field>
  );
}

function useBlockTypeShortLabels(): Record<Block["type"], string> {
  const { t } = useTranslation("editor");
  return {
    text: t("block.text"),
    code: t("block.code"),
    heading: t("block.heading"),
    image: t("block.image"),
    button: t("block.button"),
    list: t("block.list"),
    badge: t("block.badge"),
    iframe: t("block.iframe"),
    icon: t("block.icon"),
    card: t("block.card"),
    form: t("block.form"),
    modal: t("block.modal"),
    tab: t("block.tab"),
    stat: t("block.stat"),
    flow: t("block.flow"),
    table: t("block.table"),
    chrome: t("block.chrome"),
  };
}

// RichText / list-item union 取首段纯文本用于摘要
function flatText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((s) => (s && typeof s === "object" && "text" in s ? String((s as { text: string }).text) : "")).join("");
  if (value && typeof value === "object" && "text" in value) return String((value as { text: string }).text);
  return "";
}

function blockSummary(b: Block): string {
  switch (b.type) {
    case "text":    return flatText(b.text).slice(0, 32);
    case "code":    return b.title || b.lang || b.code.slice(0, 32);
    case "heading": return flatText(b.text).slice(0, 32);
    case "image":   return b.alt || (b.url.startsWith("data:") ? "本地图片" : b.url.slice(0, 40));
    case "button":  return b.label;
    case "list":    return flatText(b.items[0]).slice(0, 28) + (b.items.length > 1 ? ` +${b.items.length - 1}` : "");
    case "badge":   return b.text;
    case "iframe":  return b.url.slice(0, 40);
    case "icon":    return `${b.name} · ${b.size ?? 32}px · ${b.tone}`;
    case "card":    return b.title || `卡片（${b.children.length} 项）`;
    case "form":    return `表单 ${b.formId} · ${b.fields.length} 字段`;
    case "modal":   return `弹窗：${b.triggerLabel}`;
    case "tab":     return `选项卡 × ${b.tabs.length}`;
    case "stat":    return `${b.value}${b.label ? " · " + b.label : ""}`;
    case "flow":    return `流程 ${b.steps.length} 步`;
    case "table":   return `表格 ${b.headers.length}×${b.rows.length}`;
    case "chrome":  return `${b.variant === "mac" ? "macOS" : "浏览器"}${b.title ? " · " + b.title : ""}`;
  }
}

// 一键把当前 slide 转为自由布局：从 DOM 测量当前 block 实际渲染位置，转为百分比坐标，提交 store
function ConvertToFreeButton({ slideId }: { slideId: string }) {
  const convert = useEditorStore((s) => s.convertSlideToFreeLayout);
  const slides = useEditorStore((s) => s.deck.slides);
  const slide = slides.find((s) => s.id === slideId);

  const handleClick = () => {
    if (!slide) return;
    // 在 Canvas 内查找当前 slide 的舞台元素
    // Slide 渲染为 .absolute.inset-0；其内的 layout 容器是 stage
    const allSlideEls = document.querySelectorAll<HTMLElement>(
      "[data-aspect-ratio] .absolute.inset-0"
    );
    let stageEl: HTMLElement | null = null;
    for (const el of allSlideEls) {
      // 只取当前可见的（offsetParent 非空）
      if (el.offsetParent !== null) {
        stageEl = el;
        break;
      }
    }
    if (!stageEl) return;
    const stageRect = stageEl.getBoundingClientRect();
    if (stageRect.width <= 0 || stageRect.height <= 0) return;

    const blockEls = Array.from(stageEl.querySelectorAll<HTMLElement>("[data-block-index]"));
    const positions: { xPct: number; yPct: number }[] = new Array(slide.blocks.length).fill(null);
    for (const el of blockEls) {
      const idxStr = el.getAttribute("data-block-index");
      if (!idxStr) continue;
      const idx = Number(idxStr);
      if (Number.isNaN(idx) || idx < 0 || idx >= slide.blocks.length) continue;
      const r = el.getBoundingClientRect();
      positions[idx] = {
        xPct: ((r.left - stageRect.left) / stageRect.width) * 100,
        yPct: ((r.top - stageRect.top) / stageRect.height) * 100,
      };
    }
    // 兜底：未测到的 block 给阶梯式默认位置
    for (let i = 0; i < slide.blocks.length; i++) {
      if (!positions[i]) positions[i] = { xPct: 10, yPct: 10 + i * 12 };
    }
    convert(slideId, positions);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Free layout"
      className="w-full text-[11px] inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-blue-400"
    >
      <Move size={11} />
      Free layout
    </button>
  );
}

// 当前 slide 的 block 列表 + HTML5 拖拽重排 + 单击选中 + 删除
function BlockOrderList({ slide }: { slide: Slide }) {
  const { t } = useTranslation("editor");
  const blockShortLabels = useBlockTypeShortLabels();
  const moveBlock = useEditorStore((s) => s.moveBlock);
  const removeBlock = useEditorStore((s) => s.removeBlock);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const selectedIdx = useEditorStore((s) => s.selection.blockIndex);

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const onDrop = (toIdx: number) => {
    if (dragFrom !== null && dragFrom !== toIdx) {
      moveBlock(slide.id, dragFrom, toIdx);
    }
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <div className="space-y-1">
      {slide.blocks.map((b, idx) => {
        const isSelected = selectedIdx === idx;
        const isDragging = dragFrom === idx;
        const isDragOver = dragOver === idx && dragFrom !== null && dragFrom !== idx;
        return (
          <div
            key={idx}
            draggable
            onDragStart={(e) => {
              setDragFrom(idx);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(idx));
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOver !== idx) setDragOver(idx);
            }}
            onDragLeave={() => {
              if (dragOver === idx) setDragOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(idx);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
            onClick={() => selectBlock(slide.id, idx)}
            className={cn(
              "group flex items-center gap-1.5 px-2 py-1.5 rounded border bg-white cursor-pointer transition-all",
              isSelected ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-400",
              isDragging && "opacity-40",
              isDragOver && "border-blue-500 ring-2 ring-blue-300"
            )}
          >
            <GripVertical size={11} className="text-slate-300 cursor-grab active:cursor-grabbing flex-shrink-0" />
            <span className="text-[10px] tabular-nums text-slate-400 w-4 flex-shrink-0">{idx + 1}</span>
            <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-600 flex-shrink-0">
              {blockShortLabels[b.type]}
            </span>
            <span className="text-xs text-slate-700 truncate flex-1" title={blockSummary(b)}>
              {blockSummary(b)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeBlock(slide.id, idx);
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex-shrink-0"
              title={t("panels.delete")}
            >
              <Trash2 size={11} />
            </button>
          </div>
        );
      })}
      <p className="text-[10px] text-slate-400 mt-1">
        {slide.blocks.length} / 6
      </p>
    </div>
  );
}
