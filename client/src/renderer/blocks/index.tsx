import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, ArrowRight, ChevronRight, Plus, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import type { Block } from "@shared/dsl";
import { filterUtilities, splitTextUtilities, hasUtilityCategory } from "@shared/dsl";
import { useActionDispatcher, useInterpolated, useInterpolatedRich } from "../runtime";
import type { InterpolatedSegment } from "../runtime";
import { cn } from "@/lib/cn";
import { FormBlock } from "./FormBlock";
import { ICON_MAP } from "./iconMap";

// 提取 block 上的 text utilities（hxs-text-gradient / hxs-text-glow / hxs-tracking-wide）
// 这类 utility 须应用在文字元素本身才能正确 clip:text 渲染
function getBlockTextUtilities(block: Block): string[] {
  const all = filterUtilities((block as any).utilities);
  return splitTextUtilities(all).text;
}

// tone → CSS 颜色变量映射（badge / icon / list / table / stat / flow / RichText 共用）
// "current" 仅 icon 用；"gradient" 仅 RichText 用（特殊，渲染成 inline 渐变）
function toneToColor(tone?: string): string {
  switch (tone) {
    case "primary": return "var(--hxs-primary)";
    case "accent":  return "var(--hxs-accent)";
    case "muted":   return "var(--hxs-muted)";
    case "fg":      return "var(--hxs-fg)";
    case "danger":  return "var(--hxs-danger)";
    case "success": return "var(--hxs-success)";
    case "warning": return "var(--hxs-warning)";
    case "info":    return "var(--hxs-info)";
    case "current": return "currentColor";
    default:        return "var(--hxs-primary)";
  }
}

// 渲染 RichText segments：每段按 tone/bold 应用样式；gradient 用 background-clip text
function renderSegments(segments: InterpolatedSegment[]): React.ReactNode {
  return segments.map((seg, i) => {
    const isGradient = seg.tone === "gradient";
    const style: React.CSSProperties = {
      fontWeight: seg.bold ? 700 : undefined,
    };
    if (isGradient) {
      style.backgroundImage = "linear-gradient(135deg, var(--hxs-primary), var(--hxs-accent))";
      style.WebkitBackgroundClip = "text";
      style.backgroundClip = "text";
      style.color = "transparent";
      // 不设 display: inline-block —— inline-block 是 atomic box 不能跨字断行，
      // PDF 截图（modern-screenshot 序列化 SVG foreignObject）时若像素测量差几px，
      // 整段 gradient 会被推到下一行而非按字断行，造成 PDF 与预览不一致
    } else if (seg.tone) {
      style.color = toneToColor(seg.tone);
    }
    return (
      <span key={i} style={style}>
        {seg.text}
      </span>
    );
  });
}

// 文本：行高松、字号略大；尊重 align；text 字段支持字符串或 RichText 数组
function TextBlock({ block }: { block: Extract<Block, { type: "text" }> }) {
  const rich = useInterpolatedRich(block.text);
  const align = block.align ?? "left";
  const textUtils = getBlockTextUtilities(block);
  return (
    <p
      className={cn("max-w-3xl", ...textUtils)}
      style={{
        fontSize: 20,
        lineHeight: 1.75,
        textAlign: align,
        color: "var(--hxs-fg)",
        opacity: 0.85,
        fontFamily: "var(--hxs-font-body)",
        marginInline: align === "center" ? "auto" : undefined,
      }}
    >
      {rich.isString ? rich.text : renderSegments(rich.segments)}
    </p>
  );
}

// 标题：分级字号差距更大，用 heading 字体；text 同样支持 RichText 数组（核心词局部染色）
// 字号 / 行高 / 字距用 inline style 而非 Tailwind className：
// 1) 避免 PDF 导出（modern-screenshot SVG foreignObject → img data URL）中 rem 解析被解析为非 16px 导致字号放大
// 2) 避免响应式断点 md:* 在 SVG image document 内评估行为与预览不一致
// 3) 让预览 / PDF / 缩略图都走同一 hard-code px 路径，绝对一致
function HeadingBlock({ block }: { block: Extract<Block, { type: "heading" }> }) {
  const rich = useInterpolatedRich(block.text);
  const align = block.align ?? "left";
  const level = block.level;
  const textUtils = getBlockTextUtilities(block);
  // 动态字号：短标题用大字保留 hero 视觉，长标题降一档给 PDF 截图字宽容差留 buffer
  // PDF 中 SVG image document 内字体 fallback 让 CJK advance width 比预览大 ~15%，
  // 长标题在 multi-column 窄 padding 下会触发末字换行 —— 按"加权字符数"自适应字号
  // 中文 / 标点权重 1.0（advance ≈ font-size），英文 / 空格 0.5（advance ≈ 0.5×font-size）
  const text = rich.isString
    ? rich.text
    : rich.segments.map((s) => s.text).join("");
  // CJK 字符范围（用 \uXXXX 转义而非字面字符，避免肉眼像乱码）：
  // 一-鿿  CJK 统一汉字
  // 　-〿  CJK 符号 / 标点（含全角空格）
  // ＀-￯  全角字符（含全角逗号 / 句号 / 问号）
  // 额外覆盖 CJK 扩展 A (㐀-䶿 罕用字/古字) + 兼容汉字 (豈-﫿 繁体/异体字)
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\uf900-\ufaff]/g) ?? []).length;
  const otherCount = text.length - cjkCount;
  const weightedLen = cjkCount + otherCount * 0.5;
  // L1 阈值：> 9 → 降到 64（"AI 是生成者,人是决策者" / "交互式演示网站怎么做?" 都触发降级）
  // L2 阈值：> 14（L2 字号 48，容器更宽，容差更大）
  // letterSpacing 对齐原 Tailwind tracking-tighter / tracking-tight
  const sizeStyle: React.CSSProperties =
    level === 1
      ? {
          fontSize: weightedLen > 9 ? 64 : 72,
          lineHeight: 1.05,
          letterSpacing: "-0.05em",
          fontWeight: 800,
        }
      : level === 2
      ? {
          fontSize: weightedLen > 14 ? 40 : 48,
          lineHeight: 1.1,
          letterSpacing: "-0.05em",
          fontWeight: 700,
        }
      : { fontSize: 24, lineHeight: 1.375, letterSpacing: "-0.025em", fontWeight: 600 };
  const Tag = (`h${level}` as unknown) as keyof JSX.IntrinsicElements;
  return (
    <Tag
      className={cn(...textUtils)}
      style={{
        ...sizeStyle,
        textAlign: align,
        color: "var(--hxs-fg)",
        fontFamily: "var(--hxs-font-heading)",
      }}
    >
      {rich.isString ? rich.text : renderSegments(rich.segments)}
    </Tag>
  );
}

// 图片
function ImageBlock({ block }: { block: Extract<Block, { type: "image" }> }) {
  // 显式尺寸优先；都未设时按容器撑满（旧默认行为）
  const hasExplicitSize = block.widthPx !== undefined || block.heightPx !== undefined;
  const style: React.CSSProperties = {
    borderRadius: "var(--hxs-radius)",
    ...(block.widthPx !== undefined ? { width: block.widthPx } : {}),
    ...(block.heightPx !== undefined ? { height: block.heightPx } : {}),
    ...(block.widthPx !== undefined && block.heightPx === undefined ? { height: "auto" } : {}),
    ...(block.heightPx !== undefined && block.widthPx === undefined ? { width: "auto" } : {}),
    objectFit: block.fit,
    maxWidth: "100%",
  };
  return (
    <img
      src={block.url}
      alt={block.alt ?? ""}
      className={cn(!hasExplicitSize && "w-full h-full")}
      style={style}
    />
  );
}

// 按钮：阴影更厚、大尺寸、字距更紧
function ButtonBlock({ block }: { block: Extract<Block, { type: "button" }> }) {
  const dispatch = useActionDispatcher();
  const label = useInterpolated(block.label);
  const variant = block.variant;
  const base =
    "inline-flex items-center justify-center px-7 py-3.5 font-semibold transition-all active:scale-[0.97] hover:-translate-y-0.5";
  const sizeStyle: React.CSSProperties = {
    fontSize: 18,
    lineHeight: "28px",
    letterSpacing: "-0.025em",
  };
  const styleByVariant: React.CSSProperties =
    variant === "primary"
      ? {
          backgroundColor: "var(--hxs-primary)",
          color: "#fff",
          borderRadius: "var(--hxs-radius)",
          boxShadow: "0 10px 30px -6px rgba(15,23,42,0.25)",
        }
      : variant === "secondary"
      ? {
          backgroundColor: "var(--hxs-accent)",
          color: "#fff",
          borderRadius: "var(--hxs-radius)",
          boxShadow: "0 10px 30px -6px rgba(15,23,42,0.25)",
        }
      : variant === "outline"
      ? {
          border: "1.5px solid var(--hxs-primary)",
          color: "var(--hxs-primary)",
          borderRadius: "var(--hxs-radius)",
          backgroundColor: "transparent",
        }
      : {
          color: "var(--hxs-fg)",
          textDecoration: "underline",
          textUnderlineOffset: "4px",
          textDecorationThickness: "1.5px",
        };
  return (
    <button className={base} style={{ ...sizeStyle, ...styleByVariant }} onClick={() => dispatch(block.onClick)}>
      {label}
    </button>
  );
}

// 列表：每项可独立染色 + 自定义图标（per-item tone / iconName）
// items 单条可以是字符串（旧路径）或 { text, tone?, iconName? }（per-item 视觉控制）
// 多个对象项搭配不同 tone 形成"黄/青/紫/粉 4 色循环编号"效果（小红书风）
function ListBlock({ block }: { block: Extract<Block, { type: "list" }> }) {
  const Tag = (block.ordered ? "ol" : "ul") as "ol" | "ul";
  return (
    <Tag
      className={cn("space-y-4 list-none pl-0")}
      style={{ fontSize: 20, lineHeight: 1.75 }}
    >
      {block.items.map((item, i) => {
        const isStr = typeof item === "string";
        const text = isStr ? item : item.text;
        const tone = isStr ? undefined : item.tone;
        const iconName = isStr ? undefined : item.iconName;
        return (
          <ListItem
            key={i}
            text={text}
            ordered={block.ordered}
            index={i}
            tone={tone}
            iconName={iconName}
          />
        );
      })}
    </Tag>
  );
}

function ListItem({
  text,
  ordered,
  index,
  tone,
  iconName,
}: {
  text: string;
  ordered: boolean;
  index: number;
  tone?: string;
  iconName?: string;
}) {
  const interpolated = useInterpolated(text);
  // 1. 自定义 icon 优先（替代圆点 / 编号）
  // 2. ordered 渲染编号方块：tone 时整块染色，否则 primary
  // 3. 默认渲染圆点：tone 时用 tone 色，否则 primary
  const accentColor = toneToColor(tone);
  const IconComp = iconName ? (ICON_MAP as Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>>)[iconName] : undefined;

  let marker: React.ReactNode;
  if (IconComp) {
    marker = (
      <span
        className="inline-flex items-center justify-center flex-shrink-0 mt-1"
        style={{ color: accentColor }}
      >
        <IconComp size={20} strokeWidth={2.2} />
      </span>
    );
  } else if (ordered) {
    marker = (
      <span
        className="inline-flex items-center justify-center font-bold text-sm flex-shrink-0 mt-0.5"
        style={{
          backgroundColor: accentColor,
          color: "#fff",
          width: "1.75rem",
          height: "1.75rem",
          borderRadius: "0.4rem",
          fontFamily: "var(--hxs-font-heading)",
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
    );
  } else {
    marker = (
      <span
        className="mt-3 inline-block w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: accentColor }}
      />
    );
  }

  return (
    <li className="flex items-start gap-3 leading-relaxed" style={{ color: "var(--hxs-fg)" }}>
      {marker}
      <span style={{ opacity: 0.92 }}>{interpolated}</span>
    </li>
  );
}

// 徽章：uppercase + tracking 拉宽，质感更高；tone 扩展到完整 palette
function BadgeBlock({ block }: { block: Extract<Block, { type: "badge" }> }) {
  const text = useInterpolated(block.text);
  return (
    <span
      className="inline-flex items-center px-3 py-1 font-semibold uppercase"
      style={{
        fontSize: 12,
        lineHeight: "16px",
        letterSpacing: "0.18em",
        // 强制单行：badge 视觉就是不该换行；PDF 截图引擎 inline style 测量差几 px 也不能让它折行
        whiteSpace: "nowrap",
        backgroundColor: toneToColor(block.tone),
        color: "#fff",
        borderRadius: "9999px",
        fontFamily: "var(--hxs-font-heading)",
      }}
    >
      {text}
    </span>
  );
}

// 嵌入
function IframeBlock({ block }: { block: Extract<Block, { type: "iframe" }> }) {
  return (
    <iframe
      src={block.url}
      className="w-full"
      style={{
        height: block.height ?? 480,
        borderRadius: "var(--hxs-radius)",
        border: 0,
        boxShadow: "0 20px 50px -12px rgba(15,23,42,0.18)",
      }}
      sandbox="allow-scripts allow-same-origin allow-forms"
    />
  );
}

// 卡片：厚阴影 + 大内边距 + 细描边
// 当 block.utilities 含 surface/shadow/border/shape 类时，让出对应 inline style，让 utility 的 !important 生效
function CardBlock({ block }: { block: Extract<Block, { type: "card" }> }) {
  const title = useInterpolated(block.title ?? "");
  const subtitle = useInterpolated(block.subtitle ?? "");
  const utilities = filterUtilities((block as any).utilities);
  // 注：utilities 已由 BlockWrap 应用到外层 wrap div，此处不再重复 apply（避免左竖条 / 阴影 ring 双重渲染）
  // 仍保留 hasUtility* 判断 → inline style 与 utility 的 !important 互斥（不写冲突的 inline style）

  const hasSurface = hasUtilityCategory(utilities, "surface");
  const hasShadow = hasUtilityCategory(utilities, "shadow");
  const hasBorder = hasUtilityCategory(utilities, "border");
  const hasShape = hasUtilityCategory(utilities, "shape");

  // inline style 仅在没有对应 utility 时设，避免与 utility 的 !important 互相覆盖错乱
  // 背景用 --hxs-bg 作基色而非 transparent，避免 slide 自定义深色背景时浅色文字不可见
  const inlineStyle: React.CSSProperties = {};
  if (!hasSurface) inlineStyle.backgroundColor = "color-mix(in srgb, var(--hxs-fg) 6%, var(--hxs-bg))";
  if (!hasShape) inlineStyle.borderRadius = "var(--hxs-radius)";
  if (!hasBorder) inlineStyle.border = "1px solid color-mix(in srgb, var(--hxs-fg) 10%, transparent)";
  if (!hasShadow) inlineStyle.boxShadow = "0 24px 60px -24px rgba(15,23,42,0.18)";

  return (
    <div
      className={cn("flex flex-col h-full")}
      style={{ padding: 36, gap: 20, ...inlineStyle }}
    >
      {block.title && (
        <div>
          <h3
            className="font-bold"
            style={{
              fontSize: 30,
              lineHeight: "36px",
              letterSpacing: "-0.025em",
              color: "var(--hxs-fg)",
              fontFamily: "var(--hxs-font-heading)",
            }}
          >
            {title}
          </h3>
          {block.subtitle && (
            <p
              className="mt-1.5"
              style={{ fontSize: 14, lineHeight: 1.625, color: "var(--hxs-muted)" }}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
      <div className="flex flex-col gap-4 items-start">
        {block.children.map((child, i) => (
          <BlockRenderer key={i} block={child} />
        ))}
      </div>
    </div>
  );
}

// 图标：从 lucide-react 动态映射；非白名单或不存在则返回 null；tone 扩展到完整 palette
function IconBlock({ block }: { block: Extract<Block, { type: "icon" }> }) {
  const Component = ICON_MAP[block.name];
  if (!Component) return null;

  const size = block.size ?? 32;
  const align = block.align ?? "left";
  const justify =
    align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";

  return (
    <span style={{ display: "flex", width: "100%", justifyContent: justify, color: toneToColor(block.tone) }}>
      <Component size={size} strokeWidth={block.strokeWidth ?? 2} />
    </span>
  );
}

// 弹窗：触发按钮 + portal 弹窗（含 children blocks）
function ModalBlock({ block }: { block: Extract<Block, { type: "modal" }> }) {
  const [open, setOpen] = useState(false);
  const triggerLabel = useInterpolated(block.triggerLabel);
  const title = useInterpolated(block.title ?? "");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const variant = block.triggerVariant;
  const triggerStyle: React.CSSProperties =
    variant === "primary"
      ? {
          backgroundColor: "var(--hxs-primary)",
          color: "#fff",
          borderRadius: "var(--hxs-radius)",
          boxShadow: "0 10px 30px -6px rgba(15,23,42,0.25)",
        }
      : variant === "secondary"
      ? {
          backgroundColor: "var(--hxs-accent)",
          color: "#fff",
          borderRadius: "var(--hxs-radius)",
          boxShadow: "0 10px 30px -6px rgba(15,23,42,0.25)",
        }
      : variant === "outline"
      ? {
          border: "1.5px solid var(--hxs-primary)",
          color: "var(--hxs-primary)",
          borderRadius: "var(--hxs-radius)",
          backgroundColor: "transparent",
        }
      : {
          color: "var(--hxs-fg)",
          textDecoration: "underline",
          textUnderlineOffset: "4px",
          textDecorationThickness: "1.5px",
        };

  return (
    <>
      <button
        className="inline-flex items-center justify-center px-7 py-3.5 font-semibold transition-all active:scale-[0.97] hover:-translate-y-0.5"
        style={{
          fontSize: 18,
          lineHeight: "28px",
          letterSpacing: "-0.025em",
          ...triggerStyle,
          fontFamily: "var(--hxs-font-heading)",
        }}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                className="fixed inset-0 z-[1000] flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setOpen(false)}
                style={{ padding: 32, backgroundColor: "rgba(15, 23, 42, 0.55)" }}
              >
                <motion.div
                  className="relative max-w-2xl w-full max-h-[85vh] overflow-y-auto"
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 4 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    backgroundColor: "var(--hxs-bg)",
                    color: "var(--hxs-fg)",
                    borderRadius: "var(--hxs-radius)",
                    border: "1px solid color-mix(in srgb, var(--hxs-fg) 8%, transparent)",
                    boxShadow: "0 30px 80px -20px rgba(15, 23, 42, 0.4)",
                  }}
                >
                  <button
                    className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-black/5"
                    onClick={() => setOpen(false)}
                    aria-label="关闭弹窗"
                    style={{ color: "var(--hxs-muted)" }}
                  >
                    <X size={18} />
                  </button>
                  <div style={{ padding: 36 }}>
                    {block.title && (
                      <h3
                        className="font-bold mb-5 pr-8"
                        style={{
                          fontSize: 30,
                          lineHeight: "36px",
                          letterSpacing: "-0.025em",
                          color: "var(--hxs-fg)",
                          fontFamily: "var(--hxs-font-heading)",
                        }}
                      >
                        {title}
                      </h3>
                    )}
                    <div className="flex flex-col gap-4 items-start">
                      {block.children.map((child, i) => (
                        <BlockRenderer key={i} block={child} />
                      ))}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

// Tab 切换：标签栏 + 当前 tab 内容
function TabBlock({ block }: { block: Extract<Block, { type: "tab" }> }) {
  const initial = block.defaultTabId ?? block.tabs[0]?.id ?? "";
  const [activeId, setActiveId] = useState(initial);
  const active = block.tabs.find((t) => t.id === activeId) ?? block.tabs[0];
  // 同一页多个 TabBlock 实例需要独立的 layoutId namespace 避免 framer-motion 把不同 tab 的下划线认成同一元素
  // magicId 存在时（用户主动开启 Magic Move 跨 slide 飞行）优先用 magicId，否则用 React.useId() 保证唯一
  const reactId = useId();
  const layoutNamespace = (block as any).magicId ?? reactId;
  if (!active) return null;
  return (
    <div className="w-full max-w-3xl">
      <div
        className="flex items-center gap-1 mb-4 border-b"
        style={{ borderColor: "color-mix(in srgb, var(--hxs-fg) 12%, transparent)" }}
      >
        {block.tabs.map((t) => {
          const tabLabel = t.label;
          const isActive = t.id === active.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className="relative px-4 py-2.5 font-semibold transition-colors"
              style={{
                fontSize: 16,
                lineHeight: "24px",
                letterSpacing: "-0.025em",
                color: isActive ? "var(--hxs-primary)" : "var(--hxs-fg)",
                opacity: isActive ? 1 : 0.6,
                fontFamily: "var(--hxs-font-heading)",
              }}
            >
              {tabLabel}
              {isActive && (
                <motion.span
                  layoutId={`tab-underline-${layoutNamespace}`}
                  className="absolute left-0 right-0 -bottom-px h-0.5"
                  style={{ backgroundColor: "var(--hxs-primary)" }}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-4 items-start py-2">
        {active.blocks.map((child, i) => (
          <BlockRenderer key={i} block={child} />
        ))}
      </div>
    </div>
  );
}

// 统计大数字：value 大字号 + tone 染色 + 可选 trend 箭头；label 小字注释
function StatBlock({ block }: { block: Extract<Block, { type: "stat" }> }) {
  const value = useInterpolated(block.value);
  const label = useInterpolated(block.label ?? "");
  const align = block.align ?? "center";
  const justify =
    align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const valueColor = toneToColor(block.tone);
  const TrendIcon =
    block.trend === "up" ? ArrowUpRight :
    block.trend === "down" ? ArrowDownRight :
    block.trend === "flat" ? Minus : null;
  return (
    <div
      className="flex flex-col gap-1"
      style={{ alignItems: justify === "flex-start" ? "flex-start" : justify === "flex-end" ? "flex-end" : "center", textAlign: align }}
    >
      <div className="flex items-center gap-2">
        <span
          className="font-extrabold"
          style={{
            fontSize: 72,
            lineHeight: 1,
            letterSpacing: "-0.05em",
            color: valueColor,
            fontFamily: "var(--hxs-font-heading)",
          }}
        >
          {value}
        </span>
        {TrendIcon && (
          <TrendIcon size={28} strokeWidth={2.4} style={{ color: valueColor }} />
        )}
      </div>
      {block.label && (
        <span
          className="mt-1"
          style={{
            fontSize: 16,
            lineHeight: "24px",
            color: "var(--hxs-muted)",
            fontFamily: "var(--hxs-font-body)",
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

// 横排流程：steps 渲染为 chip + 步骤间插入箭头
function FlowBlock({ block }: { block: Extract<Block, { type: "flow" }> }) {
  const align = block.align ?? "center";
  const justify =
    align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const ArrowComp = block.arrow === "chevron" ? ChevronRight : block.arrow === "plus" ? Plus : ArrowRight;
  return (
    <div
      className="flex flex-wrap items-center"
      style={{ gap: 16, justifyContent: justify, width: "100%" }}
    >
      {block.steps.map((step, i) => {
        const color = toneToColor(step.tone ?? "primary");
        return (
          <span key={i} className="inline-flex items-center" style={{ gap: 16 }}>
            <span
              className="inline-flex items-center px-4 py-2 font-semibold"
              style={{
                fontSize: 16,
                lineHeight: "24px",
                color,
                border: `1.5px solid ${color}`,
                borderRadius: "var(--hxs-radius)",
                backgroundColor: "color-mix(in srgb, currentColor 10%, transparent)",
                fontFamily: "var(--hxs-font-heading)",
              }}
            >
              <FlowStepText text={step.label} />
            </span>
            {i < block.steps.length - 1 && (
              <ArrowComp size={20} strokeWidth={2.4} style={{ color: "var(--hxs-muted)" }} />
            )}
          </span>
        );
      })}
    </div>
  );
}
function FlowStepText({ text }: { text: string }) {
  return <>{useInterpolated(text)}</>;
}

// 表格：headers + rows；单元格可对象（tone / bold）；highlightCol 整列 primary 描边强调
function TableBlock({ block }: { block: Extract<Block, { type: "table" }> }) {
  const colCount = block.headers.length;
  const highlightIdx = block.highlightCol;
  return (
    <div className="w-full overflow-x-auto">
      <table
        className="w-full text-base"
        style={{
          borderCollapse: "separate",
          borderSpacing: 0,
          fontFamily: "var(--hxs-font-body)",
          color: "var(--hxs-fg)",
        }}
      >
        <thead>
          <tr>
            {block.headers.map((h, i) => {
              const isHL = i === highlightIdx;
              return (
                <th
                  key={i}
                  className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wider"
                  style={{
                    color: isHL ? "var(--hxs-primary)" : "var(--hxs-muted)",
                    borderBottom: "1px solid color-mix(in srgb, var(--hxs-fg) 14%, transparent)",
                  }}
                >
                  {h}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, ri) => (
            <tr key={ri}>
              {Array.from({ length: colCount }).map((_, ci) => {
                const cell = row[ci];
                const isStr = typeof cell === "string";
                const text = cell === undefined ? "" : isStr ? cell : cell.text;
                const tone = !cell || isStr ? undefined : cell.tone;
                const bold = !cell || isStr ? undefined : cell.bold;
                const isHL = ci === highlightIdx;
                return (
                  <td
                    key={ci}
                    className="px-4 py-3"
                    style={{
                      color: tone ? toneToColor(tone) : "var(--hxs-fg)",
                      fontWeight: bold ? 700 : 400,
                      borderTop:
                        ri === 0
                          ? undefined
                          : "1px solid color-mix(in srgb, var(--hxs-fg) 8%, transparent)",
                      backgroundColor: isHL
                        ? "color-mix(in srgb, var(--hxs-primary) 6%, transparent)"
                        : undefined,
                    }}
                  >
                    <TableCellText text={text} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function TableCellText({ text }: { text: string }) {
  return <>{useInterpolated(text)}</>;
}

// 窗口装饰条：mac = 红/黄/绿 三圆点 + title + 分隔线；browser = 简化地址栏样式
function ChromeBlock({ block }: { block: Extract<Block, { type: "chrome" }> }) {
  const title = useInterpolated(block.title ?? "");
  if (block.variant === "browser") {
    return (
      <div
        className="w-full flex items-center gap-3 px-4 py-2 rounded-md"
        style={{
          border: "1px solid color-mix(in srgb, var(--hxs-fg) 12%, transparent)",
          backgroundColor: "color-mix(in srgb, var(--hxs-fg) 4%, var(--hxs-bg))",
        }}
      >
        <span className="flex gap-1.5">
          <span style={{ width: 10, height: 10, borderRadius: 9999, background: "#ff5f57" }} />
          <span style={{ width: 10, height: 10, borderRadius: 9999, background: "#febc2e" }} />
          <span style={{ width: 10, height: 10, borderRadius: 9999, background: "#28c840" }} />
        </span>
        <span
          className="flex-1 text-sm px-3 py-1 rounded-md truncate"
          style={{
            color: "var(--hxs-muted)",
            backgroundColor: "color-mix(in srgb, var(--hxs-fg) 6%, transparent)",
          }}
        >
          {title || "https://"}
        </span>
      </div>
    );
  }
  // mac
  return (
    <div className="w-full">
      <div className="flex items-center justify-between pb-3">
        <span className="flex gap-2">
          <span style={{ width: 12, height: 12, borderRadius: 9999, background: "#ff5f57" }} />
          <span style={{ width: 12, height: 12, borderRadius: 9999, background: "#febc2e" }} />
          <span style={{ width: 12, height: 12, borderRadius: 9999, background: "#28c840" }} />
        </span>
        {block.title && (
          <span
            className="text-sm"
            style={{ color: "var(--hxs-muted)", fontFamily: "var(--hxs-font-body)" }}
          >
            {title}
          </span>
        )}
      </div>
      <div
        style={{
          height: 1,
          backgroundColor: "color-mix(in srgb, var(--hxs-fg) 12%, transparent)",
        }}
      />
    </div>
  );
}

export function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case "text": return <TextBlock block={block} />;
    case "heading": return <HeadingBlock block={block} />;
    case "image": return <ImageBlock block={block} />;
    case "button": return <ButtonBlock block={block} />;
    case "list": return <ListBlock block={block} />;
    case "badge": return <BadgeBlock block={block} />;
    case "iframe": return <IframeBlock block={block} />;
    case "icon": return <IconBlock block={block} />;
    case "card": return <CardBlock block={block} />;
    case "form": return <FormBlock block={block} />;
    case "modal": return <ModalBlock block={block} />;
    case "tab": return <TabBlock block={block} />;
    case "stat": return <StatBlock block={block} />;
    case "flow": return <FlowBlock block={block} />;
    case "table": return <TableBlock block={block} />;
    case "chrome": return <ChromeBlock block={block} />;
  }
}
