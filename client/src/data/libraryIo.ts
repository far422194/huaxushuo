import {
  loadDynamicPatterns,
  bulkAddPatterns,
  type Pattern,
} from "./patterns";
import {
  loadDynamicSkills,
  bulkAddSkills,
  type Skill,
} from "./skills";

// 导出 / 导入的 JSON 顶层结构
// version 用于未来兼容性升级（schema 变化时按 version 走迁移）
export interface LibraryExport {
  version: "1.0";
  exportedAt: string; // ISO 时间
  patterns: Pattern[];
  skills: Skill[];
}

// 收集当前所有动态 pattern + skill，打包为 LibraryExport
export function buildLibraryExport(): LibraryExport {
  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    patterns: loadDynamicPatterns(),
    skills: loadDynamicSkills(),
  };
}

// 触发浏览器下载 .json 文件
export function downloadLibrary(filename?: string): void {
  const data = buildLibraryExport();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const datePart = data.exportedAt.slice(0, 10).replace(/-/g, "");
  a.download = filename ?? `huaxushuo-library-${datePart}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 解析 + 校验导入文件内容；不通过返回错误描述
// 仅做"形状级"校验：版本字段 + 数组类型；详细字段交给 bulkAdd 时各 schema 校验
export function parseLibraryImport(text: string):
  | { ok: true; data: LibraryExport }
  | { ok: false; error: string } {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (err: any) {
    return { ok: false, error: `JSON 解析失败：${err?.message ?? "格式错误"}` };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "文件内容不是合法对象" };
  }
  if (parsed.version !== "1.0") {
    return { ok: false, error: `不支持的版本：${parsed.version}（当前仅支持 1.0）` };
  }
  if (!Array.isArray(parsed.patterns) || !Array.isArray(parsed.skills)) {
    return { ok: false, error: "缺少 patterns 或 skills 数组" };
  }
  return { ok: true, data: parsed as LibraryExport };
}

// 应用导入：调 bulkAdd 写入两个库；返回总计
// mode="skip" 默认（保护已有数据）；"overwrite" 用导入数据覆盖冲突项
export function applyLibraryImport(
  data: LibraryExport,
  options: { mode?: "skip" | "overwrite" } = {}
): {
  patterns: { added: number; updated: number; skipped: number };
  skills: { added: number; updated: number; skipped: number };
} {
  const mode = options.mode ?? "skip";
  return {
    patterns: bulkAddPatterns(data.patterns, { mode }),
    skills: bulkAddSkills(data.skills, { mode }),
  };
}
