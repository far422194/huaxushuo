import JSZip from "jszip";
import type { Deck } from "@shared/dsl";
import { buildPublishFiles } from "./runtime";
import { generateReadme } from "./deployHints";
import { expandDeck } from "@/renderer/expandPattern";
import { getPattern } from "@/data/patterns";

// 构造 zip blob（不带下载链接）：直传场景用此（直接 POST blob 到 Worker）
export async function buildZipBlob(deck: Deck): Promise<{ blob: Blob; filename: string }> {
  // 发布前预展开所有 patternRef，让独立站 deck.json 自包含（runtime 不需要 patterns 数据）
  const expanded = expandDeck(deck, getPattern);
  const files = await buildPublishFiles(expanded);
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.path, f.bytes);
  }
  // 附 README，告诉用户怎么部署
  zip.file("README.md", generateReadme(deck));
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const safeTitle = (deck.meta.title || "huaxushuo")
    .replace(/[^\w一-龥-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `${safeTitle || "deck"}-${stamp}.zip`;
  return { blob, filename };
}

export async function exportAsZip(deck: Deck): Promise<{ blobUrl: string; filename: string }> {
  const { blob, filename } = await buildZipBlob(deck);
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, filename };
}

export function triggerDownload(blobUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 让浏览器有时间消费 URL，再回收
  setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
}
