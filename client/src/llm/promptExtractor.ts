import type { Deck } from "@shared/dsl";
import { getActiveConfig } from "./settings";
import type { ProviderConfig } from "./types";
import { createAnthropic, createOpenAI } from "./clientFactory";
import { getCurrentLang } from "@/i18n";
import { getPromptExtractorSystem } from "@/i18n/prompts";
import type { Lang } from "@/i18n/types";

// 工具 schema 的 description 按 UI 语言切换，让 LLM 在 tool_call 决策时也按目标语言生成
const buildTool = (lang: Lang) => ({
  name: "extract_prompt",
  description:
    lang === "en"
      ? "Distill a concrete deck into an anonymized reusable content case"
      : "从具体 deck 提取脱敏后的内容案例",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description:
          lang === "en"
            ? "Scenario-type title in ≤ 8 English words"
            : "≤ 8 字的场景类型标题",
      },
      prompt: {
        type: "string",
        description:
          lang === "en"
            ? "Anonymized instruction text with placeholder slots for the user's topic"
            : "脱敏后的指令文本，留出可替换的主题占位",
      },
    },
    required: ["title", "prompt"],
  },
});

export interface ExtractResult {
  title?: string;
  prompt?: string;
  error?: string;
}

export async function extractContentPrompt(deck: Deck): Promise<ExtractResult> {
  const active = getActiveConfig();
  const lang = getCurrentLang();
  if (!active) {
    return {
      error:
        lang === "en"
          ? "No model configured. Please set the API key in Settings first."
          : "未配置大模型，请先在设置中填入 API Key",
    };
  }

  const userMessage =
    lang === "en"
      ? `Below is the full deck.json of the current presentation. Please extract its content framework and anonymize it:

\`\`\`json
${JSON.stringify(deck, null, 2)}
\`\`\``
      : `下面是当前演示的完整 deck.json，请提取其内容框架并脱敏：

\`\`\`json
${JSON.stringify(deck, null, 2)}
\`\`\``;

  const system = getPromptExtractorSystem(lang);
  const tool = buildTool(lang);

  try {
    let raw: any;
    if (active.provider === "anthropic") {
      raw = await callAnthropic(userMessage, active.config, system, tool);
    } else {
      raw = await callOpenAI(userMessage, active.config, system, tool);
    }
    if (!raw || typeof raw.title !== "string" || typeof raw.prompt !== "string") {
      return {
        error:
          lang === "en"
            ? "Model response did not match the expected shape."
            : "模型返回结果不符合预期",
      };
    }
    // title 上限 16 字符（中文）/ 接近 8 词英文也通常 < 60 chars
    const titleMax = lang === "en" ? 60 : 16;
    return { title: raw.title.trim().slice(0, titleMax), prompt: raw.prompt.trim() };
  } catch (err: any) {
    return {
      error:
        (lang === "en" ? "Extract failed: " : "提取失败：") +
        (err?.message ?? String(err)),
    };
  }
}

async function callAnthropic(
  userMessage: string,
  cfg: ProviderConfig,
  system: string,
  tool: ReturnType<typeof buildTool>,
): Promise<any> {
  const client = createAnthropic(cfg);
  const resp = await client.messages.create({
    model: cfg.model,
    max_tokens: 1500,
    system,
    tools: [
      {
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters as any,
      },
    ] as any,
    messages: [{ role: "user", content: userMessage }],
  });
  const tu = resp.content.find((b: any) => b.type === "tool_use") as any;
  if (!tu) throw new Error("model did not call the tool");
  return tu.input;
}

async function callOpenAI(
  userMessage: string,
  cfg: ProviderConfig,
  system: string,
  tool: ReturnType<typeof buildTool>,
): Promise<any> {
  const client = createOpenAI(cfg);
  const resp = await client.chat.completions.create({
    model: cfg.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMessage },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters as any,
        },
      },
    ],
    tool_choice: "auto",
  });
  const tc = resp.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc || tc.type !== "function") throw new Error("model did not call the tool");
  return JSON.parse(tc.function.arguments || "{}");
}
