import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editor";
import { DeckPanel } from "./panels/DeckPanel";
import { SlidePanel } from "./panels/SlidePanel";
import { BlockPanel } from "./panels/BlockPanel";
import { Tabs } from "./panels/Tabs";

type TopTab = "deck" | "slide" | "block";

export function PropertyPanel() {
  const { t } = useTranslation("editor");
  const { t: tCommon } = useTranslation("common");
  const deck = useEditorStore((s) => s.deck);
  const selection = useEditorStore((s) => s.selection);
  const currentIndex = useEditorStore((s) => s.currentIndex);
  const selectSlide = useEditorStore((s) => s.selectSlide);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const streamingMode = useEditorStore((s) => s.streamingMode);

  const slide = selection.slideId ? deck.slides.find((s) => s.id === selection.slideId) : undefined;
  const block = slide && typeof selection.blockIndex === "number" ? slide.blocks[selection.blockIndex] : undefined;

  // TAB 状态根据 selection 自动推导：选了 block → block，选了 slide → slide，否则 deck
  const derivedTab: TopTab = block ? "block" : slide ? "slide" : "deck";
  const [tab, setTab] = useState<TopTab>(derivedTab);
  // selection 变化时同步 TAB
  useEffect(() => {
    setTab(derivedTab);
  }, [derivedTab]);

  const handleTabChange = (next: TopTab) => {
    setTab(next);
    if (next === "deck") {
      clearSelection();
    } else if (next === "slide") {
      // 没选 slide 时自动选当前页
      const target = slide ?? deck.slides[currentIndex] ?? deck.slides[0];
      if (target) selectSlide(target.id);
    } else if (next === "block" && slide) {
      // 内容块 TAB 仅在已有 slide 时可点（disabled 控制）；这里保留 selection 不变
    }
  };

  return (
    <aside className="w-80 border-l border-slate-200 bg-white flex flex-col flex-shrink-0 relative">
      {streamingMode && (
        <div className="absolute inset-0 z-10 bg-white/75 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 pointer-events-none">
          <svg className="animate-spin h-5 w-5 text-violet-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span className="text-xs text-slate-500">{tCommon("actions.generating")}</span>
        </div>
      )}
      <Tabs<TopTab>
        value={tab}
        onChange={handleTabChange}
        options={[
          { value: "deck", label: t("panels.deckTab") },
          { value: "slide", label: t("panels.slideTab"), disabled: deck.slides.length === 0 },
          {
            value: "block",
            label: t("panels.blockTab"),
            disabled: !block,
            hint: !block ? t("panels.noSelection") : undefined,
          },
        ]}
      />
      <div className="flex-1 overflow-auto">
        {tab === "deck" && <DeckPanel />}
        {tab === "slide" && slide && <SlidePanel slide={slide} />}
        {tab === "block" && slide && block && (
          <BlockPanel slide={slide} blockIndex={selection.blockIndex!} block={block} />
        )}
        {/* 兜底：选 slide TAB 但还没真正选中 slide */}
        {tab === "slide" && !slide && (
          <p className="px-4 py-6 text-xs text-slate-400 text-center">{t("panels.slideTab")}</p>
        )}
      </div>
    </aside>
  );
}
