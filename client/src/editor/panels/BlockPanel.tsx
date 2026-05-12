import { useState } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import type { Block, Slide } from "@shared/dsl";
import { FORM_FIELD_TYPES, type FormField, type Tab } from "@shared/dsl";
import { useEditorStore, BLOCKS_PER_SLIDE_MAX } from "@/store/editor";
import { Section, Field, Select, TextInput, NumberInput, Toggle, StringListEditor } from "./forms";
import { InlineBlockEditor } from "./InlineBlockEditor";
import { Tabs } from "./Tabs";
import { Trash2, Plus, MoveUp, MoveDown } from "lucide-react";

type BlockTab = "base" | "utils";

function useBlockTypeLabels(): Record<Block["type"], string> {
  const { t } = useTranslation("editor");
  return {
    text: t("block.text"),
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

const SIMPLE_BLOCK_TYPES = [
  "text", "heading", "image", "button", "list", "badge", "iframe", "icon",
  "stat", "flow", "table", "chrome",
] as const;
// modal/tab 内可放的子块类型（与 schema 的 ContainerChildBlock 对齐：基础 8 + form + 4 叶子容器）
const CONTAINER_CHILD_TYPES = [
  "text",
  "heading",
  "image",
  "button",
  "list",
  "badge",
  "iframe",
  "icon",
  "form",
  "stat",
  "flow",
  "table",
  "chrome",
] as const;

export function BlockPanel({
  slide,
  blockIndex,
  block,
}: {
  slide: Slide;
  blockIndex: number;
  block: Block;
}) {
  const { t } = useTranslation("editor");
  const blockLabels = useBlockTypeLabels();
  const updateBlock = useEditorStore((s) => s.updateBlock);
  const removeBlock = useEditorStore((s) => s.removeBlock);
  const slides = useEditorStore((s) => s.deck.slides);
  const [tab, setTab] = useState<BlockTab>("base");

  return (
    <>
      <Tabs<BlockTab>
        value={tab}
        onChange={setTab}
        size="sm"
        options={[
          { value: "base", label: t("panels.blockTab") },
          { value: "utils", label: t("panels.section.utilities") },
        ]}
      />

      {tab === "base" && (
        <>
          <Section title={`${blockLabels[block.type]} (#${blockIndex + 1})`}>
            <InlineBlockEditor
              block={block}
              onMutate={(p) => updateBlock(slide.id, blockIndex, p)}
              slides={slides}
              mode="base"
            />
            <Field>
              <button
                onClick={() => removeBlock(slide.id, blockIndex)}
                className="text-xs text-rose-600 hover:bg-rose-50 px-2 py-1 rounded inline-flex items-center gap-1"
              >
                <Trash2 size={12} />
                {t("panels.delete")}
              </button>
            </Field>
          </Section>

          {block.type === "card" && (
            <Section title={t("panels.section.cardChildren")}>
              <CardChildrenEditor slide={slide} blockIndex={blockIndex} card={block} />
            </Section>
          )}
          {block.type === "form" && (
            <Section title={t("panels.section.formFields")}>
              <FormFieldsEditor slide={slide} blockIndex={blockIndex} form={block} />
            </Section>
          )}
          {block.type === "modal" && (
            <Section title={t("panels.section.modalChildren")}>
              <ContainerChildrenEditor
                slide={slide}
                blockIndex={blockIndex}
                container={block}
                kind="modal"
              />
            </Section>
          )}
          {block.type === "tab" && (
            <Section title={t("panels.section.tabs")}>
              <TabsEditor slide={slide} blockIndex={blockIndex} tabBlock={block} />
            </Section>
          )}
        </>
      )}

      {tab === "utils" && (
        <Section title={t("panels.section.utilities")}>
          <InlineBlockEditor
            block={block}
            onMutate={(p) => updateBlock(slide.id, blockIndex, p)}
            slides={slides}
            mode="utils"
          />
        </Section>
      )}
    </>
  );
}

function CardChildrenEditor({
  slide,
  blockIndex,
  card,
}: {
  slide: Slide;
  blockIndex: number;
  card: Extract<Block, { type: "card" }>;
}) {
  const { t } = useTranslation("editor");
  const blockLabels = useBlockTypeLabels();
  const updateBlock = useEditorStore((s) => s.updateBlock);
  const slides = useEditorStore((s) => s.deck.slides);

  const addChild = (type: (typeof SIMPLE_BLOCK_TYPES)[number]) => {
    updateBlock(slide.id, blockIndex, (d) => {
      if (d.type !== "card") return;
      const newChild = defaultChild(type);
      d.children.push(newChild as any);
    });
  };

  const moveChild = (i: number, dir: -1 | 1) => {
    updateBlock(slide.id, blockIndex, (d) => {
      if (d.type !== "card") return;
      const j = i + dir;
      if (j < 0 || j >= d.children.length) return;
      const a = d.children[i]!;
      d.children[i] = d.children[j]!;
      d.children[j] = a;
    });
  };

  const removeChild = (i: number) => {
    updateBlock(slide.id, blockIndex, (d) => {
      if (d.type !== "card") return;
      d.children.splice(i, 1);
    });
  };

  return (
    <div className="space-y-4">
      {card.children.map((child, i) => (
        <div key={i} className="rounded border border-slate-200 p-3 bg-slate-50/50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700">
              {i + 1}. {blockLabels[child.type]}
            </span>
            <div className="flex items-center gap-1">
              <IconBtn onClick={() => moveChild(i, -1)} disabled={i === 0} title={t("panels.moveUp")}>
                <MoveUp size={11} />
              </IconBtn>
              <IconBtn onClick={() => moveChild(i, 1)} disabled={i === card.children.length - 1} title={t("panels.moveDown")}>
                <MoveDown size={11} />
              </IconBtn>
              <IconBtn onClick={() => removeChild(i)} title={t("panels.delete")} danger>
                <Trash2 size={11} />
              </IconBtn>
            </div>
          </div>
          <InlineBlockEditor
            block={child}
            onMutate={(p) =>
              updateBlock(slide.id, blockIndex, (d) => {
                if (d.type === "card") p(d.children[i] as any);
              })
            }
            slides={slides}
            showColumn={false}
          />
        </div>
      ))}
      <Field label={t("panels.section.addChild")}>
        <Select<(typeof SIMPLE_BLOCK_TYPES)[number] | "">
          value=""
          onChange={(v) => v && addChild(v as (typeof SIMPLE_BLOCK_TYPES)[number])}
          options={[
            { value: "" as any, label: "..." },
            ...SIMPLE_BLOCK_TYPES.map((typ) => ({ value: typ, label: blockLabels[typ] })),
          ]}
        />
      </Field>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1 rounded hover:bg-white text-slate-500 ${
        danger ? "hover:bg-rose-50 hover:text-rose-600" : ""
      } ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}

function defaultChild(type: (typeof SIMPLE_BLOCK_TYPES)[number]): Block {
  switch (type) {
    case "text": return { type: "text", text: "新文本" };
    case "heading": return { type: "heading", level: 3, text: "新标题" }; // 默认中标题(L3=旧 L1 视觉)
    case "image": return { type: "image", url: "https://", alt: "", fit: "cover" };
    case "button":
      return {
        type: "button",
        label: "按钮",
        variant: "primary",
        onClick: { action: "next" },
      };
    case "list": return { type: "list", items: ["项 1"], ordered: false };
    case "badge": return { type: "badge", text: "标签", tone: "primary" };
    case "iframe": return { type: "iframe", url: "https://example.com" };
    case "icon": return { type: "icon", name: "Sparkles", size: 32, tone: "primary" };
    case "stat": return { type: "stat", value: "100", label: "用户", tone: "primary" };
    case "flow":
      return {
        type: "flow",
        steps: [{ label: "第一步" }, { label: "第二步" }, { label: "第三步" }],
        arrow: "arrow",
      };
    case "table":
      return {
        type: "table",
        headers: ["指标", "传统方式", "新方式"],
        rows: [
          ["速度", "慢", { text: "快", tone: "success", bold: true }],
          ["成本", "高", { text: "低", tone: "success", bold: true }],
        ],
      };
    case "chrome": return { type: "chrome", variant: "mac", title: "" };
  }
}

// modal/tab 的子块默认值（含 form）
function defaultContainerChild(type: (typeof CONTAINER_CHILD_TYPES)[number]): Block {
  if (type === "form") return defaultFormBlock();
  return defaultChild(type);
}

export function defaultFormBlock(): Extract<Block, { type: "form" }> {
  return {
    type: "form",
    formId: `form_${nanoid(6)}`,
    fields: [
      { name: "name", label: "姓名", type: "text", required: true },
      { name: "email", label: "邮箱", type: "email", required: true },
    ],
    submitLabel: "提交",
    successMessage: "感谢，已提交。",
  };
}

export function defaultModalBlock(): Extract<Block, { type: "modal" }> {
  return {
    type: "modal",
    triggerLabel: "查看详情",
    triggerVariant: "primary",
    title: "弹窗标题",
    children: [{ type: "text", text: "在这里写弹窗内容。" }],
  };
}

export function defaultTabBlock(): Extract<Block, { type: "tab" }> {
  const id1 = nanoid(6);
  const id2 = nanoid(6);
  return {
    type: "tab",
    tabs: [
      { id: id1, label: "选项一", blocks: [{ type: "text", text: "选项一的内容。" }] },
      { id: id2, label: "选项二", blocks: [{ type: "text", text: "选项二的内容。" }] },
    ],
    defaultTabId: id1,
  };
}

// 表单字段编辑器
function FormFieldsEditor({
  slide,
  blockIndex,
  form,
}: {
  slide: Slide;
  blockIndex: number;
  form: Extract<Block, { type: "form" }>;
}) {
  const { t } = useTranslation("editor");
  const fieldTypeLabels = useFormFieldTypeLabels();
  const updateBlock = useEditorStore((s) => s.updateBlock);

  const mutateFields = (fn: (fields: FormField[]) => void) => {
    updateBlock(slide.id, blockIndex, (d) => {
      if (d.type !== "form") return;
      fn(d.fields);
    });
  };

  return (
    <div className="space-y-3">
      {form.fields.map((field, i) => (
        <div
          key={i}
          className="rounded border border-slate-200 p-3 bg-slate-50/50 space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700">
              {`#${i + 1} ${field.label || field.name}`}
            </span>
            <div className="flex items-center gap-1">
              <IconBtn
                onClick={() =>
                  mutateFields((fs) => {
                    if (i === 0) return;
                    const a = fs[i - 1]!;
                    fs[i - 1] = fs[i]!;
                    fs[i] = a;
                  })
                }
                disabled={i === 0}
                title={t("panels.moveUp")}
              >
                <MoveUp size={11} />
              </IconBtn>
              <IconBtn
                onClick={() =>
                  mutateFields((fs) => {
                    if (i >= fs.length - 1) return;
                    const a = fs[i + 1]!;
                    fs[i + 1] = fs[i]!;
                    fs[i] = a;
                  })
                }
                disabled={i === form.fields.length - 1}
                title={t("panels.moveDown")}
              >
                <MoveDown size={11} />
              </IconBtn>
              <IconBtn
                onClick={() =>
                  mutateFields((fs) => {
                    fs.splice(i, 1);
                  })
                }
                title={t("panels.delete")}
                danger
              >
                <Trash2 size={11} />
              </IconBtn>
            </div>
          </div>
          <Field label={t("panels.form.fieldName")} hint={t("panels.form.fieldNameHint")}>
            <TextInput
              value={field.name}
              onChange={(e) =>
                mutateFields((fs) => {
                  fs[i]!.name = e.target.value;
                })
              }
            />
          </Field>
          <Field label={t("panels.form.label")}>
            <TextInput
              value={field.label}
              onChange={(e) =>
                mutateFields((fs) => {
                  fs[i]!.label = e.target.value;
                })
              }
            />
          </Field>
          <Field label={t("panels.form.type")}>
            <Select<(typeof FORM_FIELD_TYPES)[number]>
              value={field.type}
              onChange={(v) =>
                mutateFields((fs) => {
                  fs[i]!.type = v;
                  // 切换类型时清掉不再适用的字段
                  if (v !== "select" && v !== "radio") fs[i]!.options = undefined;
                  if (v !== "number") {
                    fs[i]!.min = undefined;
                    fs[i]!.max = undefined;
                  }
                  if (v !== "textarea") fs[i]!.rows = undefined;
                  // select/radio 切换进来时给一个默认 options
                  if ((v === "select" || v === "radio") && !fs[i]!.options) {
                    fs[i]!.options = [
                      { value: "a", label: "Option A" },
                      { value: "b", label: "Option B" },
                    ];
                  }
                })
              }
              options={FORM_FIELD_TYPES.map((typ) => ({ value: typ, label: fieldTypeLabels[typ] }))}
            />
          </Field>
          <Field label={t("panels.form.placeholder")}>
            <TextInput
              value={field.placeholder ?? ""}
              onChange={(e) =>
                mutateFields((fs) => {
                  fs[i]!.placeholder = e.target.value || undefined;
                })
              }
            />
          </Field>
          <Field>
            <Toggle
              value={field.required}
              onChange={(v) =>
                mutateFields((fs) => {
                  fs[i]!.required = v;
                })
              }
              label={t("panels.form.required")}
            />
          </Field>
          {(field.type === "select" || field.type === "radio") && (
            <Field label={t("panels.form.options")}>
              <StringListEditor
                values={(field.options ?? []).map((o) => `${o.value}=${o.label}`)}
                onChange={(items) =>
                  mutateFields((fs) => {
                    fs[i]!.options = items.map((s) => {
                      const eq = s.indexOf("=");
                      if (eq < 0) return { value: s, label: s };
                      return { value: s.slice(0, eq), label: s.slice(eq + 1) };
                    });
                  })
                }
                placeholder={t("panels.form.optionsPlaceholder")}
              />
            </Field>
          )}
          {field.type === "number" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("panels.form.min")}>
                <NumberInput
                  value={field.min ?? ""}
                  onChange={(e) =>
                    mutateFields((fs) => {
                      const n = Number(e.target.value);
                      fs[i]!.min = e.target.value === "" || Number.isNaN(n) ? undefined : n;
                    })
                  }
                />
              </Field>
              <Field label={t("panels.form.max")}>
                <NumberInput
                  value={field.max ?? ""}
                  onChange={(e) =>
                    mutateFields((fs) => {
                      const n = Number(e.target.value);
                      fs[i]!.max = e.target.value === "" || Number.isNaN(n) ? undefined : n;
                    })
                  }
                />
              </Field>
            </div>
          )}
          {field.type === "textarea" && (
            <Field label={t("panels.form.rows")}>
              <NumberInput
                value={field.rows ?? ""}
                onChange={(e) =>
                  mutateFields((fs) => {
                    const n = Number(e.target.value);
                    fs[i]!.rows = e.target.value === "" || Number.isNaN(n) ? undefined : n;
                  })
                }
              />
            </Field>
          )}
        </div>
      ))}
      <button
        onClick={() =>
          mutateFields((fs) => {
            if (fs.length >= 10) return;
            fs.push({
              name: `field_${fs.length + 1}`,
              label: `Field ${fs.length + 1}`,
              type: "text",
              required: false,
            });
          })
        }
        disabled={form.fields.length >= 10}
        className="text-xs px-2 py-1.5 rounded border border-dashed border-slate-300 text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1 disabled:opacity-40"
      >
        <Plus size={11} />
        {t("panels.section.addBlock")} ({form.fields.length} / 10)
      </button>
    </div>
  );
}

function useFormFieldTypeLabels(): Record<(typeof FORM_FIELD_TYPES)[number], string> {
  const { t } = useTranslation("editor");
  return {
    text: t("panels.form.fieldType.text"),
    email: t("panels.form.fieldType.email"),
    textarea: t("panels.form.fieldType.textarea"),
    select: t("panels.form.fieldType.select"),
    checkbox: t("panels.form.fieldType.checkbox"),
    number: t("panels.form.fieldType.number"),
    radio: t("panels.form.fieldType.radio"),
  };
}

// modal.children / 也用于复用：递归编辑容器子块（与 CardChildrenEditor 类似但允许 form）
function ContainerChildrenEditor({
  slide,
  blockIndex,
  container,
  kind,
}: {
  slide: Slide;
  blockIndex: number;
  container: Extract<Block, { type: "modal" }>;
  kind: "modal";
}) {
  const { t } = useTranslation("editor");
  const blockLabels = useBlockTypeLabels();
  const updateBlock = useEditorStore((s) => s.updateBlock);
  const slides = useEditorStore((s) => s.deck.slides);

  const mutateChildren = (fn: (children: any[]) => void) => {
    updateBlock(slide.id, blockIndex, (d) => {
      if (d.type !== kind) return;
      fn(d.children);
    });
  };

  return (
    <div className="space-y-3">
      {container.children.map((child, i) => (
        <div key={i} className="rounded border border-slate-200 p-3 bg-slate-50/50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700">
              {i + 1}. {blockLabels[child.type as keyof typeof blockLabels]}
            </span>
            <div className="flex items-center gap-1">
              <IconBtn
                onClick={() =>
                  mutateChildren((cs) => {
                    if (i === 0) return;
                    const a = cs[i - 1];
                    cs[i - 1] = cs[i];
                    cs[i] = a;
                  })
                }
                disabled={i === 0}
                title={t("panels.moveUp")}
              >
                <MoveUp size={11} />
              </IconBtn>
              <IconBtn
                onClick={() =>
                  mutateChildren((cs) => {
                    if (i >= cs.length - 1) return;
                    const a = cs[i + 1];
                    cs[i + 1] = cs[i];
                    cs[i] = a;
                  })
                }
                disabled={i === container.children.length - 1}
                title={t("panels.moveDown")}
              >
                <MoveDown size={11} />
              </IconBtn>
              <IconBtn
                onClick={() =>
                  mutateChildren((cs) => {
                    cs.splice(i, 1);
                  })
                }
                title={t("panels.delete")}
                danger
              >
                <Trash2 size={11} />
              </IconBtn>
            </div>
          </div>
          <InlineBlockEditor
            block={child as Block}
            onMutate={(p) =>
              updateBlock(slide.id, blockIndex, (d) => {
                if (d.type !== kind) return;
                p(d.children[i] as any);
              })
            }
            slides={slides}
            showColumn={false}
          />
        </div>
      ))}
      <Field label={t("panels.section.addContent")}>
        <Select<(typeof CONTAINER_CHILD_TYPES)[number] | "">
          value=""
          onChange={(v) => {
            if (!v) return;
            mutateChildren((cs) => {
              cs.push(defaultContainerChild(v as any));
            });
          }}
          options={[
            { value: "" as any, label: "..." },
            ...CONTAINER_CHILD_TYPES.map((typ) => ({
              value: typ,
              label: blockLabels[typ as keyof typeof blockLabels],
            })),
          ]}
        />
      </Field>
    </div>
  );
}

// Tab 编辑器：tabs 数组 + 每个 tab 的内容
function TabsEditor({
  slide,
  blockIndex,
  tabBlock,
}: {
  slide: Slide;
  blockIndex: number;
  tabBlock: Extract<Block, { type: "tab" }>;
}) {
  const { t } = useTranslation("editor");
  const blockLabels = useBlockTypeLabels();
  const updateBlock = useEditorStore((s) => s.updateBlock);
  const slides = useEditorStore((s) => s.deck.slides);

  const mutateTabs = (fn: (tabs: Tab[]) => void) => {
    updateBlock(slide.id, blockIndex, (d) => {
      if (d.type !== "tab") return;
      fn(d.tabs);
    });
  };

  return (
    <div className="space-y-3">
      {tabBlock.tabs.map((tab, ti) => (
        <div key={tab.id} className="rounded border border-slate-200 p-3 bg-slate-50/50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700">
              {`#${ti + 1} ${tab.label}`}
            </span>
            <div className="flex items-center gap-1">
              <IconBtn
                onClick={() =>
                  mutateTabs((ts) => {
                    if (ti === 0) return;
                    const a = ts[ti - 1]!;
                    ts[ti - 1] = ts[ti]!;
                    ts[ti] = a;
                  })
                }
                disabled={ti === 0}
                title={t("panels.moveUp")}
              >
                <MoveUp size={11} />
              </IconBtn>
              <IconBtn
                onClick={() =>
                  mutateTabs((ts) => {
                    if (ti >= ts.length - 1) return;
                    const a = ts[ti + 1]!;
                    ts[ti + 1] = ts[ti]!;
                    ts[ti] = a;
                  })
                }
                disabled={ti === tabBlock.tabs.length - 1}
                title={t("panels.moveDown")}
              >
                <MoveDown size={11} />
              </IconBtn>
              <IconBtn
                onClick={() =>
                  mutateTabs((ts) => {
                    if (ts.length <= 1) return;
                    ts.splice(ti, 1);
                  })
                }
                disabled={tabBlock.tabs.length <= 1}
                title={t("panels.delete")}
                danger
              >
                <Trash2 size={11} />
              </IconBtn>
            </div>
          </div>
          <Field label={t("panels.form.tabLabel")}>
            <TextInput
              value={tab.label}
              onChange={(e) =>
                mutateTabs((ts) => {
                  ts[ti]!.label = e.target.value;
                })
              }
            />
          </Field>

          {tab.blocks.map((child, bi) => (
            <div
              key={bi}
              className="ml-2 mt-1 rounded border border-slate-200 p-2 bg-white space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-slate-500">
                  {bi + 1}. {blockLabels[child.type as keyof typeof blockLabels]}
                </span>
                <IconBtn
                  onClick={() =>
                    mutateTabs((ts) => {
                      ts[ti]!.blocks.splice(bi, 1);
                    })
                  }
                  title={t("panels.delete")}
                  danger
                >
                  <Trash2 size={11} />
                </IconBtn>
              </div>
              <InlineBlockEditor
                block={child as Block}
                onMutate={(p) =>
                  updateBlock(slide.id, blockIndex, (d) => {
                    if (d.type !== "tab") return;
                    p(d.tabs[ti]!.blocks[bi] as any);
                  })
                }
                slides={slides}
                showColumn={false}
              />
            </div>
          ))}

          <Field label={t("panels.section.addTabContent")}>
            <Select<(typeof CONTAINER_CHILD_TYPES)[number] | "">
              value=""
              onChange={(v) => {
                if (!v) return;
                mutateTabs((ts) => {
                  ts[ti]!.blocks.push(defaultContainerChild(v as any) as any);
                });
              }}
              options={[
                { value: "" as any, label: "..." },
                ...CONTAINER_CHILD_TYPES.map((typ) => ({
                  value: typ,
                  label: blockLabels[typ as keyof typeof blockLabels],
                })),
              ]}
            />
          </Field>
        </div>
      ))}

      <button
        onClick={() =>
          mutateTabs((ts) => {
            if (ts.length >= 6) return;
            ts.push({
              id: nanoid(6),
              label: `Tab ${ts.length + 1}`,
              blocks: [{ type: "text", text: "" }],
            });
          })
        }
        disabled={tabBlock.tabs.length >= 6}
        className="text-xs px-2 py-1.5 rounded border border-dashed border-slate-300 text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1 disabled:opacity-40"
      >
        <Plus size={11} />
        {t("panels.section.tabs")} ({tabBlock.tabs.length} / 6)
      </button>
    </div>
  );
}

// 添加块工具栏（点画布选中 slide 时显示在 SlidePanel 底部，这里导出供 PropertyPanel 调用）
export function AddBlockToolbar({ slide }: { slide: Slide }) {
  const { t } = useTranslation("editor");
  const blockLabels = useBlockTypeLabels();
  const addBlock = useEditorStore((s) => s.addBlock);
  const atLimit = slide.blocks.length >= BLOCKS_PER_SLIDE_MAX;
  const limitTitle = atLimit
    ? `已达单页 ${BLOCKS_PER_SLIDE_MAX} 块上限，请先删除或拆页`
    : undefined;
  return (
    <Section title={t("panels.section.addBlock")}>
      <div className="grid grid-cols-2 gap-1">
        {SIMPLE_BLOCK_TYPES.map((typ) => (
          <button
            key={typ}
            onClick={() => addBlock(slide.id, defaultChild(typ))}
            disabled={atLimit}
            title={limitTitle}
            className="text-xs px-2 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
          >
            <Plus size={10} />
            {blockLabels[typ]}
          </button>
        ))}
      </div>
      <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-2 mb-1">{t("panels.section.advancedBlocks")}</p>
      <div className="grid grid-cols-2 gap-1">
        <button
          onClick={() =>
            addBlock(slide.id, { type: "card", title: "", children: [] } as any)
          }
          disabled={atLimit}
          title={limitTitle}
          className="text-xs px-2 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
        >
          <Plus size={10} />
          {blockLabels.card}
        </button>
        <button
          onClick={() => addBlock(slide.id, defaultFormBlock())}
          disabled={atLimit}
          title={limitTitle}
          className="text-xs px-2 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
        >
          <Plus size={10} />
          {blockLabels.form}
        </button>
        <button
          onClick={() => addBlock(slide.id, defaultModalBlock())}
          disabled={atLimit}
          title={limitTitle}
          className="text-xs px-2 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
        >
          <Plus size={10} />
          {blockLabels.modal}
        </button>
        <button
          onClick={() => addBlock(slide.id, defaultTabBlock())}
          disabled={atLimit}
          title={limitTitle}
          className="text-xs px-2 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
        >
          <Plus size={10} />
          {blockLabels.tab}
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mt-1">{slide.blocks.length} / 6</p>
    </Section>
  );
}
