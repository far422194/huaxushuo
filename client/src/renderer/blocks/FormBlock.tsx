import { useState } from "react";
import { nanoid } from "nanoid";
import type { Block, FormField } from "@shared/dsl";
import { useInterpolated, useRuntime } from "../runtime";
import { addSubmission } from "@/data/formSubmissions";
import { cn } from "@/lib/cn";

type FormBlockType = Extract<Block, { type: "form" }>;

export function FormBlock({ block }: { block: FormBlockType }) {
  const { jumpTo, next } = useRuntime();
  const [values, setValues] = useState<Record<string, any>>(() => initialValues(block.fields));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitLabel = useInterpolated(block.submitLabel);
  const successMessage = useInterpolated(block.successMessage);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || submitted) return;
    const errs = validateValues(block.fields, values);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);
    addSubmission({
      id: nanoid(10),
      formId: block.formId,
      values,
      timestamp: Date.now(),
    });
    setSubmitting(false);
    setSubmitted(true);

    const onSubmit = block.onSubmit;
    if (onSubmit) {
      // 给 successMessage 一个露出的时间，再触发跳转
      if (onSubmit.type === "next") {
        setTimeout(() => next(), 600);
      } else if (onSubmit.type === "jumpTo") {
        setTimeout(() => jumpTo(onSubmit.slideId), 600);
      }
    }
  };

  if (submitted) {
    return (
      <div
        className="w-full rounded-2xl px-7 py-8"
        style={{
          maxWidth: 576,
          backgroundColor: "color-mix(in srgb, var(--hxs-primary) 8%, transparent)",
          border: "1px solid color-mix(in srgb, var(--hxs-primary) 25%, transparent)",
          borderRadius: "var(--hxs-radius)",
        }}
      >
        <p
          className="font-semibold"
          style={{
            fontSize: 18,
            lineHeight: "28px",
            color: "var(--hxs-primary)",
            fontFamily: "var(--hxs-font-heading)",
          }}
        >
          {successMessage}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full flex flex-col"
      style={{ maxWidth: 576, gap: 16, color: "var(--hxs-fg)", fontFamily: "var(--hxs-font-body)" }}
    >
      {block.fields.map((field) => (
        <FieldControl
          key={field.name}
          field={field}
          value={values[field.name]}
          error={errors[field.name]}
          onChange={(v) =>
            setValues((prev) => ({ ...prev, [field.name]: v }))
          }
        />
      ))}
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center justify-center self-start font-semibold transition-all active:scale-[0.97] hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
        style={{
          padding: "12px 28px",
          fontSize: 18,
          lineHeight: "28px",
          letterSpacing: "-0.025em",
          backgroundColor: "var(--hxs-primary)",
          color: "#fff",
          borderRadius: "var(--hxs-radius)",
          boxShadow: "0 10px 30px -6px rgba(15,23,42,0.25)",
          fontFamily: "var(--hxs-font-heading)",
        }}
      >
        {submitting ? "提交中…" : submitLabel}
      </button>
    </form>
  );
}

function initialValues(fields: FormField[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of fields) {
    if (f.type === "checkbox") out[f.name] = false;
    else if (f.type === "number") out[f.name] = "";
    else out[f.name] = "";
  }
  return out;
}

function validateValues(fields: FormField[], values: Record<string, any>): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const f of fields) {
    const v = values[f.name];
    if (f.required) {
      if (f.type === "checkbox") {
        if (v !== true) errs[f.name] = "请勾选此项";
      } else if (v === "" || v === undefined || v === null) {
        errs[f.name] = "此项必填";
      }
    }
    if (f.type === "email" && typeof v === "string" && v.length > 0) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errs[f.name] = "邮箱格式不正确";
    }
    if (f.type === "number" && typeof v === "string" && v.length > 0) {
      const n = Number(v);
      if (Number.isNaN(n)) errs[f.name] = "请输入数字";
      else if (f.min !== undefined && n < f.min) errs[f.name] = `不小于 ${f.min}`;
      else if (f.max !== undefined && n > f.max) errs[f.name] = `不大于 ${f.max}`;
    }
  }
  return errs;
}

function FieldControl({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField;
  value: any;
  error?: string;
  onChange: (v: any) => void;
}) {
  const baseInput = "w-full outline-none transition-colors";
  const inputStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: 16,
    lineHeight: "24px",
    backgroundColor: "color-mix(in srgb, var(--hxs-fg) 4%, transparent)",
    border: error
      ? "1.5px solid #f43f5e"
      : "1px solid color-mix(in srgb, var(--hxs-fg) 12%, transparent)",
    borderRadius: "var(--hxs-radius)",
    color: "var(--hxs-fg)",
  };

  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <label
        className="font-semibold"
        style={{
          fontSize: 14,
          lineHeight: "20px",
          letterSpacing: "-0.025em",
          color: "var(--hxs-fg)",
          fontFamily: "var(--hxs-font-heading)",
        }}
      >
        {field.label}
        {field.required && (
          <span className="ml-1" style={{ color: "var(--hxs-primary)" }}>
            *
          </span>
        )}
      </label>

      {field.type === "textarea" ? (
        <textarea
          className={baseInput}
          style={{ ...inputStyle, resize: "vertical", minHeight: 80 }}
          rows={field.rows ?? 4}
          placeholder={field.placeholder}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "select" ? (
        <select
          className={baseInput}
          style={inputStyle}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{field.placeholder ?? "请选择"}</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : field.type === "checkbox" ? (
        <label
          className="inline-flex items-center cursor-pointer"
          style={{ gap: 8, fontSize: 16, lineHeight: "24px" }}
        >
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4"
            style={{ accentColor: "var(--hxs-primary)" }}
          />
          <span style={{ color: "var(--hxs-fg)", opacity: 0.85 }}>
            {field.placeholder ?? field.label}
          </span>
        </label>
      ) : field.type === "radio" ? (
        <div className="flex flex-col" style={{ gap: 8, marginTop: 4 }}>
          {(field.options ?? []).map((opt) => (
            <label
              key={opt.value}
              className="inline-flex items-center cursor-pointer"
              style={{ gap: 8, fontSize: 16, lineHeight: "24px" }}
            >
              <input
                type="radio"
                name={field.name}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
                className="w-4 h-4"
                style={{ accentColor: "var(--hxs-primary)" }}
              />
              <span style={{ color: "var(--hxs-fg)" }}>{opt.label}</span>
            </label>
          ))}
        </div>
      ) : field.type === "number" ? (
        <input
          type="number"
          className={cn(baseInput, "tabular-nums")}
          style={inputStyle}
          placeholder={field.placeholder}
          value={value ?? ""}
          min={field.min}
          max={field.max}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={field.type === "email" ? "email" : "text"}
          className={baseInput}
          style={inputStyle}
          placeholder={field.placeholder}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {error && (
        <span style={{ fontSize: 12, lineHeight: "16px", color: "#f43f5e" }}>
          {error}
        </span>
      )}
    </div>
  );
}
