import i18n from "@/i18n";

type BuiltinKind = "pattern" | "skill" | "style";

const NS_BY_KIND: Record<BuiltinKind, string> = {
  pattern: "builtinPatterns",
  skill: "builtinSkills",
  style: "builtinStyles",
};

// 内置 pattern / skill / style 的 name/description 是中文硬编码（保留用于 trigger 触发词匹配 + 兼容）
// UI 渲染时优先用 i18n 翻译版本；找不到就用原值。
// 这样不破坏 skillMatcher 的关键字命中（仍按中文 trigger 数组匹配）。
export function localizedName(item: { id: string; name: string; source?: string }, kind: BuiltinKind): string {
  if (item.source !== "builtin") return item.name;
  // i18n.exists 判断 key 是否真实存在（找不到时不会回退到 key 字符串）
  // key 含 namespace 前缀（"dialog:..."），exists 与 t 都接受
  const key = `dialog:${NS_BY_KIND[kind]}.${item.id}.name`;
  if (!i18n.exists(key)) return item.name;
  return i18n.t(key) as string;
}

export function localizedDescription(
  item: { id: string; description: string; source?: string },
  kind: BuiltinKind,
): string {
  if (item.source !== "builtin") return item.description;
  const key = `dialog:${NS_BY_KIND[kind]}.${item.id}.description`;
  if (!i18n.exists(key)) return item.description;
  return i18n.t(key) as string;
}
