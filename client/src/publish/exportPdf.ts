import jsPDF from "jspdf";
import { domToJpeg } from "modern-screenshot";
import type { Deck } from "@shared/dsl";

interface ExportPdfOptions {
  deck: Deck;
  // 离屏渲染节点：固定 1280×720
  renderRoot: HTMLElement;
  // 切到第 i 页并等待渲染稳定，由调用方实现（一般 setState + 等两帧）
  setIndex: (i: number) => Promise<void>;
  onProgress?: (current: number, total: number) => void;
  // 取消信号：循环每次截图前检查
  signal?: AbortSignal;
}

// 等待节点内所有图片 decode 完成 + 字体就绪
// 否则截图可能拿到未解码图（空 alt 文）或退化系统字体
async function waitForResources(root: HTMLElement) {
  const promises: Promise<unknown>[] = [];
  if (document.fonts) {
    promises.push(document.fonts.ready.catch(() => undefined));
  }
  const imgs = Array.from(root.querySelectorAll("img"));
  for (const img of imgs) {
    if (img.complete && img.naturalWidth > 0) continue;
    promises.push(
      img
        .decode()
        .catch(() => undefined)
    );
  }
  await Promise.all(promises);
}

// 把 deck 每页 1280×720 截图后拼成 16:9 横向 PDF
// 字号 / spacing 一致性：所有 size critical 的 block（heading/text/list/button/badge/card title/...）
// 已在 renderer/blocks/index.tsx 直接 inline px style 渲染，预览 / PDF 走同一条 hard-code 路径，
// 不依赖 Tailwind className → CSS rem 解析（SVG image document 内 rem 行为不可控会导致截图偏大）
export async function exportAsPdf(opts: ExportPdfOptions): Promise<Blob> {
  const { deck, renderRoot, setIndex, onProgress, signal } = opts;
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [1280, 720],
  });
  // 字体加载等待：避免首页字体未就绪截到系统宋体
  if (document.fonts) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore
    }
  }
  for (let i = 0; i < deck.slides.length; i++) {
    if (signal?.aborted) throw new DOMException("已取消导出", "AbortError");
    onProgress?.(i, deck.slides.length);
    await setIndex(i);
    if (signal?.aborted) throw new DOMException("已取消导出", "AbortError");
    // 按当前页 transitionDuration 决定等待时长：
    // - 用户在 SlidePanel 调的转场时长直接代表"从切页到内容稳定"所需时间
    // - magic move（layoutId 飞行）也用此值做 framer-motion duration
    // - 加 100ms buffer 给布局稳定 / animation 收尾
    // - 最低 200ms 兜底（用户可能调到极小）
    const slide = deck.slides[i];
    const td = slide?.transitionDuration ?? 250; // 默认 250 与 MAGIC_DEFAULT_MS 对齐
    const waitMs = Math.max(200, td + 100);
    await new Promise<void>((r) => setTimeout(r, waitMs));
    // 等图片 decode + 字体就绪
    await waitForResources(renderRoot);
    // 用 JPEG（quality 0.92）替代 PNG：体积减小 5-10×，避免长 deck 累积 dataURL 超过 V8
    // 字符串长度上限（~512MB）导致 jsPDF 内部 Array.join "Invalid string length" 报错
    // 演示页有大量渐变 / 色块，JPEG 视觉损失几乎不可察觉
    const dataUrl = await domToJpeg(renderRoot, {
      width: 1280,
      height: 720,
      scale: 2,
      backgroundColor: "#ffffff",
      quality: 0.92,
    });
    if (i > 0) pdf.addPage([1280, 720], "landscape");
    pdf.addImage(dataUrl, "JPEG", 0, 0, 1280, 720, undefined, "FAST");
  }
  onProgress?.(deck.slides.length, deck.slides.length);
  return pdf.output("blob");
}

export function buildPdfFilename(deck: Deck): string {
  const safeTitle = (deck.meta.title || "huaxushuo")
    .replace(/[^\w一-龥-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${safeTitle || "deck"}-${stamp}.pdf`;
}
