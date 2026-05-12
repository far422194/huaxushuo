import jsPDF from "jspdf";
import { domToJpeg } from "modern-screenshot";
import type { Deck } from "@shared/dsl";
import { getStageSizeForAspect } from "./PdfStage";

interface ExportPdfOptions {
  deck: Deck;
  // 离屏渲染节点：尺寸由 deck.meta.aspectRatio 决定（PdfStage 内部处理）
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

// auto 画幅每页可能超长（用户滚动屏）；jsPDF 单页高度无硬限，但 modern-screenshot 在极大高度时
// SVG foreignObject 性能会陡降。这里给一个工程上限：>10000px 截断到 10000，避免页面卡死
const AUTO_HEIGHT_HARD_CAP = 10000;

// 把 deck 每页按画幅尺寸截图后拼成 PDF
// - 16:9 → 1280×720；4:3 → 1024×768（统一画幅，jsPDF 创建时定 format）
// - auto → 宽 1280，每页高度按 renderRoot.scrollHeight 实测；jsPDF 每页 addPage 独立 size
//
// 字号 / spacing 一致性：所有 size critical 的 block 已在 renderer/blocks/index.tsx
// 直接 inline px 渲染，预览 / PDF 走同一 hard-code 路径
export async function exportAsPdf(opts: ExportPdfOptions): Promise<Blob> {
  const { deck, renderRoot, setIndex, onProgress, signal } = opts;

  const stageSize = getStageSizeForAspect(deck.meta.aspectRatio);
  const baseWidth = stageSize.width;
  const isAuto = stageSize.height === undefined;  // auto 画幅没固定 height，按内容实测
  const fixedHeight = stageSize.height ?? 720;

  // 固定画幅：format 创建时定好；auto：首页测出 size 后再创建 jsPDF
  let pdf: jsPDF | undefined;
  if (!isAuto) {
    pdf = new jsPDF({
      orientation: "landscape",
      unit: "px",
      format: [baseWidth, fixedHeight],
    });
  }

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
    // - 加 100ms buffer 给布局稳定 / animation 收尾；最低 200ms 兜底
    const slide = deck.slides[i];
    const td = slide?.transitionDuration ?? 250;
    const waitMs = Math.max(200, td + 100);
    await new Promise<void>((r) => setTimeout(r, waitMs));

    // 等图片 decode + 字体就绪
    await waitForResources(renderRoot);

    // 决定本页截图尺寸：
    // - 固定画幅：用 stage 尺寸
    // - auto：读 renderRoot.scrollHeight（PdfStage div 完全跟随内容真实高度）
    //   不再用 max(720) 兜底 —— 短内容（600px hero）兜底 720 会让截图多出 120px PdfStage backdrop
    //   显示出深绿色块。直接按测得真实高度截，BackgroundLayer 永远撑满 div 范围
    let pageHeight: number;
    if (isAuto) {
      const measured = renderRoot.scrollHeight || renderRoot.offsetHeight || 0;
      // 保底 300 防 0 截图崩；上限 10000 防 SVG foreignObject 性能崩溃
      pageHeight = Math.max(300, Math.min(AUTO_HEIGHT_HARD_CAP, measured));
    } else {
      pageHeight = fixedHeight;
    }

    // 用 JPEG（quality 0.92）替代 PNG：体积减小 5-10×，避免长 deck dataURL 超过 V8 ~512MB 字符串上限
    // auto 长页 scale 退到 1.5（2× 在 10000px 高度下截图会非常慢且易 OOM）
    const scale = isAuto && pageHeight > 2000 ? 1.5 : 2;
    const dataUrl = await domToJpeg(renderRoot, {
      width: baseWidth,
      height: pageHeight,
      scale,
      backgroundColor: "#ffffff",
      quality: 0.92,
    });

    // 首页（auto 模式）：用本页测得尺寸创建 jsPDF；固定画幅已在循环外创建
    // 后续页：addPage 用本页尺寸（auto 时每页 size 可能不同）
    if (!pdf) {
      pdf = new jsPDF({
        orientation: baseWidth >= pageHeight ? "landscape" : "portrait",
        unit: "px",
        format: [baseWidth, pageHeight],
      });
    } else if (i > 0) {
      pdf.addPage(
        [baseWidth, pageHeight],
        baseWidth >= pageHeight ? "landscape" : "portrait",
      );
    }
    pdf.addImage(dataUrl, "JPEG", 0, 0, baseWidth, pageHeight, undefined, "FAST");
  }

  onProgress?.(deck.slides.length, deck.slides.length);
  if (!pdf) throw new Error("PDF 导出失败：deck 为空");
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
