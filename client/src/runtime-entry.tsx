import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DeckSchema, type Deck as DeckT } from "@shared/dsl";
import { Deck } from "./renderer";
import "./index.css";

// 独立站入口：从 index.html 中的 <script id="deck-data"> 读 deck.json，校验后挂载
function readDeck(): DeckT {
  const node = document.getElementById("deck-data");
  if (!node || !node.textContent) {
    throw new Error("未找到 deck-data 节点");
  }
  const raw = node.textContent.trim();
  // 模板期占位符未被替换时给出明确提示
  if (raw === "__DECK_JSON__") {
    throw new Error("当前页面是 runtime 模板（未注入 deck）。请先发布。");
  }
  const json = JSON.parse(raw);
  const result = DeckSchema.safeParse(json);
  if (!result.success) {
    console.error(result.error);
    throw new Error("deck.json 校验失败");
  }
  return result.data;
}

function App() {
  try {
    const deck = readDeck();
    return (
      <div className="w-screen h-screen">
        <Deck deck={deck} />
      </div>
    );
  } catch (err) {
    return (
      <div className="w-screen h-screen flex items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <h1 className="text-2xl font-semibold mb-2">无法加载演示</h1>
          <p className="text-sm text-slate-600">
            {err instanceof Error ? err.message : "未知错误"}
          </p>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
