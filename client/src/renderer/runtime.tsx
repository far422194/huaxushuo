import { createContext, useContext, useMemo } from "react";
import type { DeckAction } from "@shared/dsl";
import type { Theme } from "@shared/dsl";

export type Variables = Record<string, string | number | boolean>;

export interface EditorBinding {
  selectedBlockIndex?: number;
}

export interface RuntimeContextValue {
  theme: Theme;
  variables: Variables;
  currentIndex: number;
  totalSlides: number;
  next: () => void;
  prev: () => void;
  jumpTo: (slideId: string) => void;
  goToIndex: (index: number) => void;       // 按索引跳转，NavigationBar 用
  setVar: (name: string, value: string | number | boolean) => void;
  editor?: EditorBinding;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

export function RuntimeProvider({
  value,
  children,
}: {
  value: RuntimeContextValue;
  children: React.ReactNode;
}) {
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): RuntimeContextValue {
  const ctx = useContext(RuntimeContext);
  if (!ctx) throw new Error("useRuntime 必须在 RuntimeProvider 内使用");
  return ctx;
}

// {{varName}} 文本插值
export function interpolate(text: string, vars: Variables): string {
  return text.replace(/\{\{\s*([\w$.-]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v === undefined ? "" : String(v);
  });
}

export function useInterpolated(text: string): string {
  const { variables } = useRuntime();
  return useMemo(() => interpolate(text, variables), [text, variables]);
}

// RichText 插值：字符串走 interpolate；数组对每段单独插值，返回归一化的 segment 数组
// 这是 heading/text 字段渲染的统一入口
export interface InterpolatedSegment {
  text: string;
  tone?: string;
  bold?: boolean;
}
export function useInterpolatedRich(
  value: string | Array<{ text: string; tone?: string; bold?: boolean }>,
): { isString: true; text: string } | { isString: false; segments: InterpolatedSegment[] } {
  const { variables } = useRuntime();
  return useMemo(() => {
    if (typeof value === "string") {
      return { isString: true as const, text: interpolate(value, variables) };
    }
    return {
      isString: false as const,
      segments: value.map((seg) => ({
        text: interpolate(seg.text, variables),
        tone: seg.tone,
        bold: seg.bold,
      })),
    };
  }, [value, variables]);
}

// 把动作转成回调
export function useActionDispatcher() {
  const { next, prev, jumpTo, setVar } = useRuntime();
  return (action: DeckAction) => {
    switch (action.action) {
      case "next":
        next();
        return;
      case "prev":
        prev();
        return;
      case "jumpTo":
        jumpTo(action.slideId);
        return;
      case "openLink":
        window.open(action.url, "_blank", "noopener,noreferrer");
        return;
      case "setVar":
        setVar(action.name, action.value);
        return;
    }
  };
}
