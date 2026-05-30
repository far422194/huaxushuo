import type { Draft } from "immer";
import { useTranslation } from "react-i18next";
import type { Block, Slide } from "@shared/dsl";
import {
  Field,
  TextInput,
  TextAreaInput,
  NumberInput,
  Select,
  Toggle,
  StringListEditor,
  ActionInput,
} from "./forms";
import { ImageInput } from "./ImageInput";
import { UtilitiesEditor } from "./UtilitiesEditor";
import { IconPicker } from "./IconPicker";
import { filterUtilities } from "@shared/dsl";

// RichText 数组扁平化为字符串（编辑器只支持字符串编辑，富文本由 LLM/JSON 写）
function richTextToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((s) => (s && typeof s === "object" && "text" in s ? String((s as { text: string }).text) : "")).join("");
  return "";
}

// list item 同理
function listItemToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "text" in value) return String((value as { text: string }).text);
  return "";
}

interface Props {
  block: Block;
  onMutate: (producer: (draft: Draft<Block>) => void) => void;
  slides: Slide[];
  showColumn?: boolean;
  // "full"（默认，全部）/ "base"（类型字段+列+magicId，不含视觉变体）/ "utils"（仅视觉变体）
  // BlockPanel 用 base/utils 拆 2 TAB；嵌套编辑器保持 full
  mode?: "full" | "base" | "utils";
}

// 单个 block 的所有字段表单（不含 card.children，由外层渲染）
export function InlineBlockEditor({ block, onMutate, slides, showColumn = true, mode = "full" }: Props) {
  return (
    <div className="space-y-3">
      {(mode === "full" || mode === "base") && (
        <>
          <BlockTypeFields block={block} onMutate={onMutate} slides={slides} />
          {showColumn && <ColumnField block={block} onMutate={onMutate} />}
          <MagicIdField block={block} onMutate={onMutate} />
        </>
      )}
      {/* full 模式（嵌套使用）：折叠展示，省空间 */}
      {mode === "full" && (
        <UtilitiesField block={block} onMutate={onMutate} />
      )}
      {/* utils 模式（BlockPanel 顶层 TAB）：直接展开，与 SlidePanel 视觉变体一致 */}
      {mode === "utils" && (
        <UtilitiesEditor
          value={filterUtilities((block as any).utilities)}
          onChange={(next) =>
            onMutate((d) => {
              (d as any).utilities = next.length > 0 ? next : undefined;
            })
          }
        />
      )}
    </div>
  );
}

function UtilitiesField({
  block,
  onMutate,
}: {
  block: Block;
  onMutate: Props["onMutate"];
}) {
  const { t } = useTranslation("editor");
  const { t: tCommon } = useTranslation("common");
  const current = filterUtilities((block as any).utilities);
  return (
    <details className="group rounded border border-slate-200 bg-slate-50/40">
      <summary className="cursor-pointer text-xs text-slate-700 px-2.5 py-1.5 flex items-center justify-between">
        <span>{t("panels.utilities")}</span>
        <span className="text-[10px] text-slate-500">{current.length > 0 ? `${current.length}` : tCommon("actions.more")}</span>
      </summary>
      <div className="px-2.5 pb-2.5 pt-1">
        <UtilitiesEditor
          value={current}
          onChange={(next) =>
            onMutate((d) => {
              (d as any).utilities = next.length > 0 ? next : undefined;
            })
          }
        />
      </div>
    </details>
  );
}

function MagicIdField({
  block,
  onMutate,
}: {
  block: Block;
  onMutate: Props["onMutate"];
}) {
  const { t } = useTranslation("editor");
  const value = (block as any).magicId ?? "";
  return (
    <Field
      label={t("panels.magicId")}
      hint=""
    >
      <TextInput
        value={value}
        onChange={(e) => {
          const v = e.target.value.trim();
          onMutate((draft) => {
            (draft as any).magicId = v || undefined;
          });
        }}
        placeholder="hero-title / cta-button"
      />
    </Field>
  );
}

function ColumnField({
  block,
  onMutate,
}: {
  block: Block;
  onMutate: Props["onMutate"];
}) {
  const { t } = useTranslation("editor");
  const value = ("column" in block ? block.column : undefined) ?? "auto";
  return (
    <Field label={t("panels.column")}>
      <Select<string>
        value={value}
        onChange={(v) =>
          onMutate((draft) => {
            (draft as any).column = v === "auto" ? undefined : v;
          })
        }
        options={[
          { value: "auto", label: "auto" },
          { value: "left", label: "left" },
          { value: "right", label: "right" },
          { value: "center", label: "center" },
          { value: "col1", label: "col 1" },
          { value: "col2", label: "col 2" },
          { value: "col3", label: "col 3" },
          { value: "col4", label: "col 4" },
          { value: "col5", label: "col 5" },
        ]}
      />
    </Field>
  );
}

function BlockTypeFields({
  block,
  onMutate,
  slides,
}: {
  block: Block;
  onMutate: Props["onMutate"];
  slides: Slide[];
}) {
  const { t } = useTranslation("editor");
  switch (block.type) {
    case "text":
      return (
        <>
          <Field label={t("block.text")}>
            <TextAreaInput
              value={typeof block.text === "string" ? block.text : richTextToString(block.text)}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "text") d.text = e.target.value;
                })
              }
            />
          </Field>
          {Array.isArray(block.text) && (
            <p className="text-xs text-amber-600">
              该文本含富文本片段（局部染色），编辑后将转为纯文本。需保留分段染色请用 JSON 编辑或对话调整。
            </p>
          )}
          <Field label={t("inline.align")}>
            <Select<"left" | "center" | "right">
              value={(block.align ?? "left") as any}
              onChange={(v) =>
                onMutate((d) => {
                  if (d.type === "text") d.align = v;
                })
              }
              options={[
                { value: "left", label: "左对齐" },
                { value: "center", label: "居中" },
                { value: "right", label: "右对齐" },
              ]}
            />
          </Field>
        </>
      );
    case "heading":
      return (
        <>
          <Field label={t("block.heading")}>
            <TextInput
              value={typeof block.text === "string" ? block.text : richTextToString(block.text)}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "heading") d.text = e.target.value;
                })
              }
            />
          </Field>
          {Array.isArray(block.text) && (
            <p className="text-xs text-amber-600">
              该标题含富文本片段（局部染色），编辑后将转为纯文本。需保留分段染色请用 JSON 编辑或对话调整。
            </p>
          )}
          <Field label={t("inline.level")}>
            <Select<"1" | "2" | "3" | "4" | "5" | "6">
              value={String(block.level) as any}
              onChange={(v) =>
                onMutate((d) => {
                  if (d.type === "heading") d.level = Number(v) as 1 | 2 | 3 | 4 | 5 | 6;
                })
              }
              options={[
                { value: "1", label: "H1 (120)" },
                { value: "2", label: "H2 (88)" },
                { value: "3", label: "H3 (72)" },
                { value: "4", label: "H4 (64)" },
                { value: "5", label: "H5 (56)" },
                { value: "6", label: "H6 (48)" },
              ]}
            />
          </Field>
          <Field label={t("inline.align")}>
            <Select<"left" | "center" | "right">
              value={(block.align ?? "left") as any}
              onChange={(v) =>
                onMutate((d) => {
                  if (d.type === "heading") d.align = v;
                })
              }
              options={[
                { value: "left", label: "左对齐" },
                { value: "center", label: "居中" },
                { value: "right", label: "右对齐" },
              ]}
            />
          </Field>
        </>
      );
    case "image":
      return (
        <>
          <Field label={t("inline.url")}>
            <ImageInput
              value={block.url}
              onChange={(url) =>
                onMutate((d) => {
                  if (d.type === "image") d.url = url;
                })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="宽度（px，留空自适应）">
              <NumberInput
                value={block.widthPx ?? ""}
                onChange={(e) =>
                  onMutate((d) => {
                    if (d.type !== "image") return;
                    const n = Number(e.target.value);
                    d.widthPx =
                      e.target.value === "" || Number.isNaN(n)
                        ? undefined
                        : Math.max(16, Math.min(4096, Math.round(n)));
                  })
                }
                placeholder="auto"
              />
            </Field>
            <Field label="高度（px，留空自适应）">
              <NumberInput
                value={block.heightPx ?? ""}
                onChange={(e) =>
                  onMutate((d) => {
                    if (d.type !== "image") return;
                    const n = Number(e.target.value);
                    d.heightPx =
                      e.target.value === "" || Number.isNaN(n)
                        ? undefined
                        : Math.max(16, Math.min(4096, Math.round(n)));
                  })
                }
                placeholder="auto"
              />
            </Field>
          </div>
          <Field label={t("inline.alt")}>
            <TextInput
              value={block.alt ?? ""}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "image") d.alt = e.target.value;
                })
              }
            />
          </Field>
          <Field label={t("inline.fit")}>
            <Select<"cover" | "contain">
              value={block.fit}
              onChange={(v) =>
                onMutate((d) => {
                  if (d.type === "image") d.fit = v;
                })
              }
              options={[
                { value: "cover", label: "覆盖（裁切）" },
                { value: "contain", label: "包含（留白）" },
              ]}
            />
          </Field>
        </>
      );
    case "button":
      return (
        <>
          <Field label={t("inline.label")}>
            <TextInput
              value={block.label}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "button") d.label = e.target.value;
                })
              }
            />
          </Field>
          <Field label={t("inline.variant")}>
            <Select<"primary" | "secondary" | "ghost" | "outline">
              value={block.variant}
              onChange={(v) =>
                onMutate((d) => {
                  if (d.type === "button") d.variant = v;
                })
              }
              options={[
                { value: "primary", label: "主按钮" },
                { value: "secondary", label: "次按钮" },
                { value: "outline", label: "描边" },
                { value: "ghost", label: "幽灵" },
              ]}
            />
          </Field>
          <Field label="点击动作">
            <ActionInput
              value={block.onClick}
              onChange={(action) =>
                onMutate((d) => {
                  if (d.type === "button") d.onClick = action;
                })
              }
              slides={slides}
            />
          </Field>
        </>
      );
    case "list":
      return (
        <>
          <Field label={t("inline.items")}>
            <StringListEditor
              values={block.items.map(listItemToString)}
              onChange={(items) =>
                onMutate((d) => {
                  if (d.type === "list") {
                    // 编辑时把对象项扁平为字符串项；如要 per-item 染色请用 JSON / 对话调整
                    d.items = items;
                  }
                })
              }
            />
          </Field>
          {block.items.some((it) => typeof it !== "string") && (
            <p className="text-xs text-amber-600">
              该列表含 per-item 染色，编辑后将转为纯文本项。要保留色彩请用 JSON 编辑或对话调整。
            </p>
          )}
          <Field>
            <Toggle
              value={block.ordered}
              onChange={(v) =>
                onMutate((d) => {
                  if (d.type === "list") d.ordered = v;
                })
              }
              label="有序列表"
            />
          </Field>
        </>
      );
    case "badge":
      return (
        <>
          <Field label={t("inline.label")}>
            <TextInput
              value={block.text}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "badge") d.text = e.target.value;
                })
              }
            />
          </Field>
          <Field label="色调">
            <Select<"primary" | "accent" | "muted" | "fg" | "danger" | "success" | "warning" | "info">
              value={block.tone}
              onChange={(v) =>
                onMutate((d) => {
                  if (d.type === "badge") d.tone = v;
                })
              }
              options={[
                { value: "primary", label: "主色" },
                { value: "accent", label: "强调色" },
                { value: "muted", label: "弱化" },
                { value: "fg", label: "前景色" },
                { value: "danger", label: "危险（红）" },
                { value: "success", label: "成功（绿）" },
                { value: "warning", label: "警示（橘）" },
                { value: "info", label: "信息（蓝）" },
              ]}
            />
          </Field>
        </>
      );
    case "icon":
      return (
        <>
          <Field label={t("inline.iconName")}>
            <IconPicker
              value={block.name}
              onChange={(name) =>
                onMutate((d) => {
                  if (d.type === "icon") d.name = name;
                })
              }
            />
          </Field>
          <Field label={t("inline.size")}>
            <NumberInput
              value={block.size ?? 32}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "icon") {
                    const n = Number(e.target.value);
                    d.size = e.target.value === "" || Number.isNaN(n) ? undefined : Math.max(8, Math.min(256, n));
                  }
                })
              }
            />
          </Field>
          <Field label="颜色">
            <Select<"primary" | "accent" | "muted" | "fg" | "danger" | "success" | "warning" | "info" | "current">
              value={block.tone}
              onChange={(v) =>
                onMutate((d) => {
                  if (d.type === "icon") d.tone = v;
                })
              }
              options={[
                { value: "primary", label: "主色" },
                { value: "accent", label: "强调色" },
                { value: "muted", label: "弱化色" },
                { value: "fg", label: "前景色" },
                { value: "danger", label: "危险（红）" },
                { value: "success", label: "成功（绿）" },
                { value: "warning", label: "警示（橘）" },
                { value: "info", label: "信息（蓝）" },
                { value: "current", label: "继承父级（currentColor）" },
              ]}
            />
          </Field>
          <Field label="描边粗细（0.5-3，默认 2）">
            <NumberInput
              step="0.25"
              value={block.strokeWidth ?? 2}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "icon") {
                    const n = Number(e.target.value);
                    d.strokeWidth = e.target.value === "" || Number.isNaN(n) ? undefined : Math.max(0.5, Math.min(3, n));
                  }
                })
              }
            />
          </Field>
          <Field label={t("inline.align")}>
            <Select<"left" | "center" | "right">
              value={(block.align ?? "left") as any}
              onChange={(v) =>
                onMutate((d) => {
                  if (d.type === "icon") d.align = v;
                })
              }
              options={[
                { value: "left", label: "左" },
                { value: "center", label: "居中" },
                { value: "right", label: "右" },
              ]}
            />
          </Field>
        </>
      );
    case "iframe":
      return (
        <>
          <Field label={t("inline.url")}>
            <TextInput
              value={block.url}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "iframe") d.url = e.target.value;
                })
              }
            />
          </Field>
          <Field label="高度（px）">
            <NumberInput
              value={block.height ?? 480}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "iframe") d.height = Number(e.target.value) || undefined;
                })
              }
            />
          </Field>
        </>
      );
    case "card":
      return (
        <>
          <Field label={t("inline.title")}>
            <TextInput
              value={block.title ?? ""}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "card") d.title = e.target.value || undefined;
                })
              }
            />
          </Field>
          <Field label={t("inline.subtitle")}>
            <TextInput
              value={block.subtitle ?? ""}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "card") d.subtitle = e.target.value || undefined;
                })
              }
            />
          </Field>
        </>
      );
    case "form":
      return (
        <>
          <Field label="表单 ID（提交分组用，CSV 导出按此分）">
            <TextInput
              value={block.formId}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "form") d.formId = e.target.value;
                })
              }
            />
          </Field>
          <Field label="提交按钮文字">
            <TextInput
              value={block.submitLabel}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "form") d.submitLabel = e.target.value;
                })
              }
            />
          </Field>
          <Field label="成功提示">
            <TextInput
              value={block.successMessage}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "form") d.successMessage = e.target.value;
                })
              }
            />
          </Field>
          <Field label="提交后行为">
            <Select<"none" | "next" | "jumpTo">
              value={(block.onSubmit?.type ?? "none") as any}
              onChange={(v) =>
                onMutate((d) => {
                  if (d.type !== "form") return;
                  if (v === "none") d.onSubmit = { type: "none" };
                  else if (v === "next") d.onSubmit = { type: "next" };
                  else if (v === "jumpTo")
                    d.onSubmit = { type: "jumpTo", slideId: slides[0]?.id ?? "" };
                })
              }
              options={[
                { value: "none", label: "仅显示成功提示" },
                { value: "next", label: "提交后下一页" },
                { value: "jumpTo", label: "跳转到指定页" },
              ]}
            />
          </Field>
          {block.onSubmit?.type === "jumpTo" && (
            <Field label="跳转目标页">
              <Select
                value={block.onSubmit.slideId}
                onChange={(slideId) =>
                  onMutate((d) => {
                    if (d.type === "form" && d.onSubmit?.type === "jumpTo")
                      d.onSubmit.slideId = slideId;
                  })
                }
                options={slides.map((s, i) => ({ value: s.id, label: `第 ${i + 1} 页` }))}
              />
            </Field>
          )}
          <p className="text-[10px] text-slate-400">
            字段配置在下方「表单字段」面板编辑。
          </p>
        </>
      );
    case "modal":
      return (
        <>
          <Field label="触发按钮文字">
            <TextInput
              value={block.triggerLabel}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "modal") d.triggerLabel = e.target.value;
                })
              }
            />
          </Field>
          <Field label="按钮样式">
            <Select<"primary" | "secondary" | "ghost" | "outline">
              value={block.triggerVariant}
              onChange={(v) =>
                onMutate((d) => {
                  if (d.type === "modal") d.triggerVariant = v;
                })
              }
              options={[
                { value: "primary", label: "主按钮" },
                { value: "secondary", label: "次按钮" },
                { value: "outline", label: "描边" },
                { value: "ghost", label: "幽灵" },
              ]}
            />
          </Field>
          <Field label="弹窗标题（可空）">
            <TextInput
              value={block.title ?? ""}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "modal") d.title = e.target.value || undefined;
                })
              }
            />
          </Field>
          <p className="text-[10px] text-slate-400">
            弹窗内容在下方「弹窗内容」面板编辑。
          </p>
        </>
      );
    case "tab":
      return (
        <>
          <Field label="默认选项卡">
            <Select
              value={block.defaultTabId ?? block.tabs[0]?.id ?? ""}
              onChange={(v) =>
                onMutate((d) => {
                  if (d.type === "tab") d.defaultTabId = v;
                })
              }
              options={block.tabs.map((t) => ({ value: t.id, label: t.label }))}
            />
          </Field>
          <p className="text-[10px] text-slate-400">
            选项卡列表与各自内容在下方「选项卡」面板编辑。
          </p>
        </>
      );
    case "stat":
      return (
        <>
          <Field label="数值">
            <TextInput
              value={block.value}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "stat") d.value = e.target.value;
                })
              }
            />
          </Field>
          <Field label="标签（小字）">
            <TextInput
              value={block.label ?? ""}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "stat") d.label = e.target.value || undefined;
                })
              }
            />
          </Field>
          <Field label="色调">
            <Select<"primary" | "accent" | "muted" | "fg" | "danger" | "success" | "warning" | "info">
              value={block.tone}
              onChange={(v) =>
                onMutate((d) => {
                  if (d.type === "stat") d.tone = v;
                })
              }
              options={[
                { value: "primary", label: "主色" },
                { value: "accent", label: "强调色" },
                { value: "fg", label: "前景色" },
                { value: "danger", label: "危险（红）" },
                { value: "success", label: "成功（绿）" },
                { value: "warning", label: "警示（橘）" },
                { value: "info", label: "信息（蓝）" },
                { value: "muted", label: "弱化" },
              ]}
            />
          </Field>
          <Field label="趋势">
            <Select<"none" | "up" | "down" | "flat">
              value={(block.trend ?? "none") as any}
              onChange={(v) =>
                onMutate((d) => {
                  if (d.type === "stat") d.trend = v === "none" ? undefined : v;
                })
              }
              options={[
                { value: "none", label: "无" },
                { value: "up", label: "↗ 向上" },
                { value: "down", label: "↘ 向下" },
                { value: "flat", label: "— 持平" },
              ]}
            />
          </Field>
        </>
      );
    case "flow":
      return (
        <>
          <Field label="步骤标签（每行一个）">
            <StringListEditor
              values={block.steps.map((s) => s.label)}
              onChange={(labels) =>
                onMutate((d) => {
                  if (d.type === "flow") {
                    // 编辑时仅改 label；tone 由 LLM/JSON 设
                    d.steps = labels.slice(0, 6).map((l, i) => ({
                      label: l,
                      tone: d.steps[i]?.tone,
                    }));
                    if (d.steps.length < 2) d.steps.push({ label: "新步骤" });
                  }
                })
              }
            />
          </Field>
          <Field label="连接符">
            <Select<"arrow" | "chevron" | "plus">
              value={block.arrow}
              onChange={(v) =>
                onMutate((d) => {
                  if (d.type === "flow") d.arrow = v;
                })
              }
              options={[
                { value: "arrow", label: "→ 箭头" },
                { value: "chevron", label: "› 雪佛龙" },
                { value: "plus", label: "+ 加号" },
              ]}
            />
          </Field>
        </>
      );
    case "table":
      return (
        <>
          <p className="text-xs text-slate-500">
            表格的 headers / rows / 单元格 tone 可在 JSON 编辑或对话调整。一期编辑器仅支持核心字段。
          </p>
          <Field label="高亮列（0-based，留空不高亮）">
            <NumberInput
              value={block.highlightCol ?? ""}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "table") {
                    const n = Number(e.target.value);
                    d.highlightCol = e.target.value === "" || Number.isNaN(n) ? undefined : Math.max(0, n);
                  }
                })
              }
            />
          </Field>
          <p className="text-[11px] text-slate-400">
            当前列数 {block.headers.length} · 当前行数 {block.rows.length}
          </p>
        </>
      );
    case "chrome":
      return (
        <>
          <Field label={t("inline.variant")}>
            <Select<"mac" | "browser">
              value={block.variant}
              onChange={(v) =>
                onMutate((d) => {
                  if (d.type === "chrome") d.variant = v;
                })
              }
              options={[
                { value: "mac", label: "macOS（红黄绿圆点）" },
                { value: "browser", label: "浏览器地址栏" },
              ]}
            />
          </Field>
          <Field label="标题（可选）">
            <TextInput
              value={block.title ?? ""}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "chrome") d.title = e.target.value || undefined;
                })
              }
            />
          </Field>
        </>
      );
    case "code":
      return (
        <>
          <Field label={t("block.code")}>
            <TextAreaInput
              value={block.code}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "code") d.code = e.target.value;
                })
              }
            />
          </Field>
          <Field label={t("inline.codeLang")}>
            <TextInput
              value={block.lang ?? ""}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "code") d.lang = e.target.value || undefined;
                })
              }
            />
          </Field>
          <Field label={t("inline.codeTitle")}>
            <TextInput
              value={block.title ?? ""}
              onChange={(e) =>
                onMutate((d) => {
                  if (d.type === "code") d.title = e.target.value || undefined;
                })
              }
            />
          </Field>
        </>
      );
  }
}
