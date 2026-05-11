// 表单提交记录：按 formId 分组，存 localStorage。
// MVP 单机模式，没有后端；编辑器与发布站点共享 localStorage 命名空间但同源隔离。

export interface FormSubmission {
  id: string;
  formId: string;
  values: Record<string, string | number | boolean | string[]>;
  timestamp: number;
}

const STORAGE_KEY = "hxs.form_submissions";
const MAX_KEEP = 500;

export function loadSubmissions(): FormSubmission[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

function saveAll(list: FormSubmission[]) {
  try {
    const trimmed = list.slice(0, MAX_KEEP);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // quota 满时退化：仅保留最近 100 条
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 100)));
    } catch {
      /* ignore */
    }
  }
}

export function addSubmission(submission: FormSubmission): void {
  const all = loadSubmissions();
  saveAll([submission, ...all]);
}

export function listSubmissionsByForm(formId: string): FormSubmission[] {
  return loadSubmissions().filter((s) => s.formId === formId);
}

export function listFormIds(): string[] {
  const set = new Set<string>();
  for (const s of loadSubmissions()) set.add(s.formId);
  return Array.from(set);
}

export function deleteSubmission(id: string): void {
  saveAll(loadSubmissions().filter((s) => s.id !== id));
}

export function clearByForm(formId: string): void {
  saveAll(loadSubmissions().filter((s) => s.formId !== formId));
}

// 把指定 formId 的提交导出为 CSV 字符串（含 BOM 以便 Excel 识别 UTF-8）
export function exportFormCsv(formId: string): string {
  const submissions = listSubmissionsByForm(formId);
  if (submissions.length === 0) return "﻿";

  // 收集所有字段名（不同提交可能字段不同，取并集）
  const fieldSet = new Set<string>(["_timestamp"]);
  for (const s of submissions) {
    for (const k of Object.keys(s.values)) fieldSet.add(k);
  }
  const fields = Array.from(fieldSet);

  const rows: string[] = [];
  rows.push(fields.map(escapeCsv).join(","));
  for (const s of submissions) {
    const row = fields.map((f) => {
      if (f === "_timestamp") return escapeCsv(new Date(s.timestamp).toISOString());
      const v = s.values[f];
      if (v === undefined || v === null) return "";
      if (Array.isArray(v)) return escapeCsv(v.join("; "));
      return escapeCsv(String(v));
    });
    rows.push(row.join(","));
  }
  return "﻿" + rows.join("\n");
}

function escapeCsv(s: string): string {
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// 触发浏览器下载
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}
