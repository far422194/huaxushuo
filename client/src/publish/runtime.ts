import type { Deck } from "@shared/dsl";

export interface PublishFile {
  path: string; // 相对路径，如 "index.html" / "assets/runtime-xxx.js"
  bytes: Uint8Array;
  contentType: string;
}

const TEMPLATE_BASE = "runtime-template/";

const TEXT_TYPES = new Set([
  "text/html",
  "application/javascript",
  "text/css",
  "application/json",
]);

export function getContentType(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

export function isTextFile(contentType: string): boolean {
  return [...TEXT_TYPES].some((t) => contentType.startsWith(t));
}

// 防止 deck JSON 中包含 </script> 把外层 <script> 提前闭合
function escapeJsonForScript(s: string): string {
  return s.replace(/<\/(script)/gi, "<\\/$1");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 从 html 文本里解析出 asset 路径列表（/assets/xxx.{js,css,...}）
function extractAssetPaths(html: string): string[] {
  const paths = new Set<string>();
  const regex = /(?:src|href)="(\/assets\/[^"#?]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    if (m[1]) paths.add(m[1]);
  }
  return [...paths];
}

// 从浏览器 fetch 当前应用资源里的 runtime-template，注入 deck，返回独立站文件清单
// 入口必须传"已展开 patternRef 的 deck"（调用方在 PublishDialog 提前 expandDeck），让独立站 deck.json 自包含
export async function buildPublishFiles(deck: Deck): Promise<PublishFile[]> {
  const htmlUrl = baseUrl(TEMPLATE_BASE + "runtime.html");
  let html: string;
  try {
    const resp = await fetch(htmlUrl);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    html = await resp.text();
  } catch (err: any) {
    throw new Error(
      `找不到 runtime 模板（${htmlUrl}）。请在项目根运行 \`pnpm --filter huaxushuo-client build:runtime\` 后重试。原因：${err?.message ?? err}`
    );
  }

  if (!html.includes("__DECK_JSON__")) {
    throw new Error("runtime 模板中未找到 __DECK_JSON__ 占位符，可能模板版本不匹配");
  }

  // 注入 deck JSON
  const deckJson = escapeJsonForScript(JSON.stringify(deck));
  html = html.replace("__DECK_JSON__", deckJson);

  // 替换标题为 deck 标题
  html = html.replace(
    /<title>[^<]*<\/title>/i,
    `<title>${escapeHtml(deck.meta.title || "演示")}</title>`
  );

  const encoder = new TextEncoder();
  const files: PublishFile[] = [
    {
      path: "index.html",
      bytes: encoder.encode(html),
      contentType: "text/html; charset=utf-8",
    },
  ];

  // 拉取所有 asset
  const assetPaths = extractAssetPaths(html);
  for (const assetPath of assetPaths) {
    const url = baseUrl(TEMPLATE_BASE + assetPath.replace(/^\//, ""));
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`无法获取资源 ${url}（HTTP ${resp.status}）`);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    files.push({
      path: assetPath.replace(/^\//, ""),
      bytes,
      contentType: getContentType(assetPath),
    });
  }

  return files;
}

function baseUrl(rel: string): string {
  // import.meta.env.BASE_URL 在 dev 是 "/"，build 时跟随 base 配置
  const base = (import.meta as any).env?.BASE_URL ?? "/";
  return (base.endsWith("/") ? base : base + "/") + rel;
}
