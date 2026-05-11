import type { Theme, Deck } from "@shared/dsl";
import { SYSTEM_PROMPT } from "./prompts";
import { TOOLS } from "./tools";
import { getActiveConfig } from "./settings";
import { getProvider } from "./providers";

// 按 theme + styleInstructions 让 LLM 生成 4 页风格预览样板。
// 不走 agent.generate 的流式承载（不修改 store / 不切视图），结果只用于 StylePreviewDialog 内的右侧预览。
export async function generateStyleSampleDeck(
  theme: Theme,
  styleInstructions: string,
  signal?: AbortSignal
): Promise<{ deck?: Deck; error?: string; cancelled?: boolean }> {
  const active = getActiveConfig();
  if (!active) return { error: "未配置大模型，请先在设置中填入 API Key" };

  const userMessage = `## 任务
生成一份 4 页样板演示，仅用于风格预览。

## 必须使用的 theme（保持不变，不要修改任何 colors / fonts / radius / mode）
\`\`\`json
${JSON.stringify(theme, null, 2)}
\`\`\`

## 视觉风格指令（按此呈现）
${styleInstructions}

## 内容
通用品牌产品介绍（不要出现具体公司名/产品名，可用占位词如"产品"/"我们"/"用户"）。

## 输出要求
- 调用 create_deck 工具
- \`meta.aspectRatio\` 必须是 \`"16:9"\`（样板预览专用）
- 4 页：①hero 封面、②two-column 或 bullet-list 展示特性、③quote 引用、④cta 行动号召
- 文案要短而有锋，符合上面风格指令的语调；颜色严格用 theme.colors，不写裸 hex
- 不要加 form / modal / tab 等高级块，样板用基础 8 种就够`;

  const provider = getProvider(active.provider);
  // 不传 onProgress → provider 走非流式分支（messages.create / chat.completions.create）
  const result = await provider.generate({
    systemPrompt: SYSTEM_PROMPT,
    tools: TOOLS,
    userMessage,
    config: active.config,
    estimatedPages: 4,
    signal,
  });

  if (result.cancelled) return { cancelled: true };
  if (result.error) return { error: result.error };
  if (!result.deck) return { error: "模型未返回 deck" };
  return { deck: result.deck };
}
