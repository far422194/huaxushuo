// Pexels 图源接入：deck 生成后扫 picsum.photos seed URL，按 slug 关键词到 Pexels 搜真实摄影图替换
// API key 仅存浏览器 localStorage，不会上传任何服务器
const STORAGE_KEY = "hxs.pexels_api_key";

export function getPexelsApiKey(): string | undefined {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function setPexelsApiKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore quota
  }
}

export function hasPexelsApiKey(): boolean {
  return !!getPexelsApiKey();
}

export type PexelsOrientation = "landscape" | "portrait" | "square";

interface PexelsPhotoSrc {
  medium: string;
  large: string;
  large2x: string;
  original: string;
  landscape: string;
  portrait: string;
}
interface PexelsPhoto {
  id: number;
  src: PexelsPhotoSrc;
  alt: string;
}

// 进程级缓存：相同 query+orientation 不重复调用，省 API 配额
const cache = new Map<string, string | null>();

export async function testPexelsApiKey(
  key: string
): Promise<{ ok: boolean; message?: string }> {
  if (!key.trim()) return { ok: false, message: "API Key 不能为空" };
  try {
    const res = await fetch(
      "https://api.pexels.com/v1/search?query=test&per_page=1",
      { headers: { Authorization: key.trim() } }
    );
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "API Key 无效（401/403）" };
    }
    if (!res.ok) {
      return { ok: false, message: `请求失败：${res.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: `网络错误：${e?.message ?? String(e)}` };
  }
}

// 用 query 关键词到 Pexels 搜图，返回首批 5 张里随机一张的 URL；失败返回 null
// 多次调用相同 query 会被缓存，让"同一 deck 多页配图"也只算一次配额
export async function searchPexelsPhoto(
  query: string,
  orientation: PexelsOrientation = "landscape"
): Promise<string | null> {
  const apiKey = getPexelsApiKey();
  if (!apiKey || !query.trim()) return null;
  const cacheKey = `${query.trim().toLowerCase()}::${orientation}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;
  try {
    const url =
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
      `&per_page=5&orientation=${orientation}`;
    const res = await fetch(url, { headers: { Authorization: apiKey } });
    if (!res.ok) {
      cache.set(cacheKey, null);
      return null;
    }
    const data: { photos?: PexelsPhoto[] } = await res.json();
    const photos = data.photos ?? [];
    if (photos.length === 0) {
      cache.set(cacheKey, null);
      return null;
    }
    const pick = photos[Math.floor(Math.random() * photos.length)]!;
    const sized =
      orientation === "portrait"
        ? pick.src.portrait
        : orientation === "landscape"
        ? pick.src.landscape
        : pick.src.large;
    cache.set(cacheKey, sized);
    return sized;
  } catch {
    cache.set(cacheKey, null);
    return null;
  }
}
