import type { Deck } from "@shared/dsl";
import {
  searchPexelsPhoto,
  hasPexelsApiKey,
  type PexelsOrientation,
} from "./pexels";

// 形如 https://picsum.photos/seed/{slug}/{w}/{h}（slug 由 LLM 给的英文 kebab 关键词）
// LLM 生成 deck 时被引导用此 URL 模式，确保始终能加载；后台再换成关键词匹配的 Pexels 图
const PICSUM_RE = /^https?:\/\/picsum\.photos\/seed\/([^/?#]+)\/(\d+)\/(\d+)/i;

interface PicsumMatch {
  slug: string;
  orientation: PexelsOrientation;
}

function parsePicsum(url: string): PicsumMatch | null {
  const m = url.match(PICSUM_RE);
  if (!m) return null;
  // slug 来自 URL 路径段，被 LLM 写成 kebab 形式（如 abstract-tech），还原为空格分隔的关键词喂给 Pexels
  const slug = decodeURIComponent(m[1]!).replace(/[-_]+/g, " ").trim();
  if (!slug) return null;
  const w = parseInt(m[2]!, 10);
  const h = parseInt(m[3]!, 10);
  // 比例决定 Pexels 取图方向：宽大于高用 landscape；高大于宽用 portrait；近方用 square
  const orientation: PexelsOrientation =
    w > h * 1.2 ? "landscape" : h > w * 1.2 ? "portrait" : "square";
  return { slug, orientation };
}

function collectFromBlocks(blocks: any[], collect: (url: string) => void): void {
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "image" && typeof b.url === "string") collect(b.url);
    if ((b.type === "card" || b.type === "modal") && Array.isArray(b.children)) {
      collectFromBlocks(b.children, collect);
    }
    if (b.type === "tab" && Array.isArray(b.tabs)) {
      for (const tab of b.tabs) {
        if (Array.isArray(tab.blocks)) collectFromBlocks(tab.blocks, collect);
      }
    }
  }
}

// 扫 deck → 收集所有 picsum URL → 并发查 Pexels → 返回「原 URL → 新 URL」替换映射
// 未配置 Pexels API key 时直接返回空 map（保留原 picsum URL，不影响渲染）
export async function buildImageSubstitutions(
  deck: Deck
): Promise<Map<string, string>> {
  if (!hasPexelsApiKey()) return new Map();

  const candidates = new Map<string, PicsumMatch>();
  const collect = (url: string) => {
    if (candidates.has(url)) return;
    const parsed = parsePicsum(url);
    if (parsed) candidates.set(url, parsed);
  };
  for (const slide of deck.slides) {
    if (
      slide.background?.type === "image" &&
      typeof slide.background.url === "string"
    ) {
      collect(slide.background.url);
    }
    collectFromBlocks(slide.blocks ?? [], collect);
  }
  if (candidates.size === 0) return new Map();

  const subs = new Map<string, string>();
  await Promise.all(
    Array.from(candidates.entries()).map(async ([url, { slug, orientation }]) => {
      const res = await searchPexelsPhoto(slug, orientation);
      if (res) subs.set(url, res);
    })
  );
  return subs;
}
