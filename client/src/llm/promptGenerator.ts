import { nanoid } from "nanoid";
import { getActiveConfig } from "./settings";
import type { ProviderConfig } from "./types";
import { createAnthropic, createOpenAI } from "./clientFactory";
import { replaceGeneratedContentPrompts, type ContentPrompt } from "@/data/contentPrompts";
import { getCurrentLang } from "@/i18n";
import { getPromptGeneratorSystem } from "@/i18n/prompts";
import type { Lang } from "@/i18n/types";

// 工具 schema 的 description 按 UI 语言切换，让 LLM 在 tool_call 决策时也按目标语言生成
const buildTool = (lang: Lang) => ({
  name: "generate_prompts",
  description:
    lang === "en"
      ? "Return a set of deck-topic prompt cases"
      : "返回一组演示主题案例",
  parameters: {
    type: "object",
    properties: {
      prompts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: lang === "en" ? "Short title ≤ 8 words" : "≤8 字简短标题",
            },
            prompt: {
              type: "string",
              description:
                lang === "en"
                  ? "Instruction that can be pasted directly into the generator"
                  : "可直接发给生成工具的指令",
            },
          },
          required: ["title", "prompt"],
        },
      },
    },
    required: ["prompts"],
  },
});

export interface GeneratePromptsResult {
  prompts?: ContentPrompt[];
  error?: string;
}

interface RawPrompt {
  title: string;
  prompt: string;
}

function toCases(raw: RawPrompt[], durationMs: number, lang: Lang): ContentPrompt[] {
  const now = Date.now();
  // 中文 16 字 ≈ 英文 ~3 words；英文按字符算需更宽松上限避免被截断
  const titleMax = lang === "en" ? 60 : 16;
  return raw
    .filter((r) => r && typeof r.title === "string" && typeof r.prompt === "string")
    .slice(0, 12)
    .map<ContentPrompt>((r) => ({
      id: nanoid(8),
      title: r.title.slice(0, titleMax),
      prompt: r.prompt.trim(),
      source: "ai-generated",
      createdAt: now,
      durationMs,
    }));
}

export async function generatePromptCases({
  count = 8,
}: { count?: number } = {}): Promise<GeneratePromptsResult> {
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
      ? `Generate ${count} cases on different topics, balanced across domains.`
      : `生成 ${count} 个不同主题的案例，主题要均衡分布在不同领域。`;
  const system = getPromptGeneratorSystem(lang);
  const tool = buildTool(lang);
  const startedAt = Date.now();

  let raw: RawPrompt[];
  try {
    if (active.provider === "anthropic") {
      raw = await callAnthropic(userMessage, active.config, system, tool);
    } else {
      raw = await callOpenAICompat(userMessage, active.config, system, tool);
    }
  } catch (err: any) {
    return {
      error:
        (lang === "en" ? "Generation failed: " : "生成失败：") +
        (err?.message ?? String(err)),
    };
  }

  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      error: lang === "en" ? "Model returned an empty case list" : "模型返回的案例为空",
    };
  }

  const cases = toCases(raw, Date.now() - startedAt, lang);
  replaceGeneratedContentPrompts(cases);
  return { prompts: cases };
}

async function callAnthropic(
  userMessage: string,
  cfg: ProviderConfig,
  system: string,
  tool: ReturnType<typeof buildTool>,
): Promise<RawPrompt[]> {
  const client = createAnthropic(cfg);
  const resp = await client.messages.create({
    model: cfg.model,
    max_tokens: 2000,
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
  return (tu.input?.prompts ?? []) as RawPrompt[];
}

async function callOpenAICompat(
  userMessage: string,
  cfg: ProviderConfig,
  system: string,
  tool: ReturnType<typeof buildTool>,
): Promise<RawPrompt[]> {
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
  let parsed: any;
  try {
    parsed = JSON.parse(tc.function.arguments || "{}");
  } catch {
    throw new Error("failed to parse tool arguments as JSON");
  }
  return (parsed?.prompts ?? []) as RawPrompt[];
}
