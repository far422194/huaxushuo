import { useLayoutEffect, useRef, useState } from "react";

// 缩放舞台：children 在固定 w×h 的 viewport 渲染，按容器空间等比缩放后居中
// 用 ResizeObserver 监听容器尺寸变化，scale = min(rectW/w, rectH/h)
//
// 用途：让 Deck 的 1280×720 内容能在任意尺寸（缩略图 / 全屏预览 / 编辑器画布）容器内完整可见无溢出
// 容器必须有显式尺寸（aspect-ratio + width 或 height）；ScaleStage 自身 absolute inset-0 撑满
export function ScaleStage({
  w,
  h,
  children,
}: {
  w: number;
  h: number;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setScale(Math.min(rect.width / w, rect.height / h));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <div
        className="absolute top-1/2 left-1/2"
        style={{
          width: w,
          height: h,
          transform: `translate(-50%, -50%) scale(${scale || 1})`,
          transformOrigin: "center center",
          visibility: scale > 0 ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
