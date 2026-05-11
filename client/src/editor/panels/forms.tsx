import type { DeckAction, Slide } from "@shared/dsl";
import { cn } from "@/lib/cn";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 py-3 border-b border-slate-200 last:border-b-0">
      <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-3 font-medium">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      {label && <span className="block text-xs text-slate-600 mb-1">{label}</span>}
      {children}
      {hint && <span className="block text-[10px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

const baseInput =
  "w-full px-2 py-1.5 text-sm border border-slate-200 rounded bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(baseInput, props.className)} />;
}

export function TextAreaInput(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(baseInput, "resize-y min-h-[60px]", props.className)} />;
}

export function NumberInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="number" {...props} className={cn(baseInput, props.className)} />;
}

export function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(baseInput, "flex-1 font-mono text-xs")}
      />
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(baseInput, "appearance-none cursor-pointer")}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-slate-300"
      />
      {label && <span className="text-sm text-slate-600">{label}</span>}
    </label>
  );
}

// 列表字符串数组编辑（如 ListBlock.items）
export function StringListEditor({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      {values.map((v, i) => (
        <div key={i} className="flex gap-1">
          <TextInput
            value={v}
            onChange={(e) => {
              const next = [...values];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={placeholder}
          />
          <button
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="px-2 text-xs text-rose-500 hover:bg-rose-50 rounded"
            type="button"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...values, ""])}
        type="button"
        className="text-xs text-blue-600 hover:underline"
      >
        + 增加一项
      </button>
    </div>
  );
}

// 交互动作编辑器
export function ActionInput({
  value,
  onChange,
  slides,
}: {
  value: DeckAction;
  onChange: (next: DeckAction) => void;
  slides: Slide[];
}) {
  const action = value.action;
  return (
    <div className="space-y-2">
      <Select
        value={action}
        onChange={(next) => {
          // 切换动作类型时给一个合理初值
          switch (next) {
            case "next": onChange({ action: "next" }); break;
            case "prev": onChange({ action: "prev" }); break;
            case "jumpTo": onChange({ action: "jumpTo", slideId: slides[0]?.id ?? "" }); break;
            case "openLink": onChange({ action: "openLink", url: "https://example.com" }); break;
            case "setVar": onChange({ action: "setVar", name: "var1", value: "" }); break;
          }
        }}
        options={[
          { value: "next", label: "下一页" },
          { value: "prev", label: "上一页" },
          { value: "jumpTo", label: "跳转到指定页" },
          { value: "openLink", label: "打开外链" },
          { value: "setVar", label: "设置变量" },
        ]}
      />
      {value.action === "jumpTo" && (
        <Select
          value={value.slideId}
          onChange={(slideId) => onChange({ action: "jumpTo", slideId })}
          options={slides.map((s, i) => ({ value: s.id, label: `第 ${i + 1} 页` }))}
        />
      )}
      {value.action === "openLink" && (
        <TextInput
          value={value.url}
          onChange={(e) => onChange({ action: "openLink", url: e.target.value })}
          placeholder="https://"
        />
      )}
      {value.action === "setVar" && (
        <div className="space-y-1.5">
          <TextInput
            value={value.name}
            onChange={(e) => onChange({ action: "setVar", name: e.target.value, value: value.value })}
            placeholder="变量名"
          />
          <TextInput
            value={String(value.value)}
            onChange={(e) => onChange({ action: "setVar", name: value.name, value: e.target.value })}
            placeholder="值"
          />
        </div>
      )}
    </div>
  );
}
