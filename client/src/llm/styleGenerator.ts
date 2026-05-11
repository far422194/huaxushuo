import type { Theme } from "@shared/dsl";
import { getActiveConfig } from "./settings";
import type { ProviderConfig } from "./types";
import { createAnthropic, createOpenAI } from "./clientFactory";
import { getCurrentLang } from "@/i18n";
import { getStyleGeneratorSystem } from "@/i18n/prompts";
import type { Lang } from "@/i18n/types";

// 工具 schema 的 description 按 UI 语言切换，让 LLM 在 tool_call 决策时也按目标语言生成 name/description/styleInstructions
const buildTool = (lang: Lang) => ({
  name: "build_style",
  description:
    lang === "en"
      ? "Build style metadata + visual data (name + description + emoji + theme + fonts + radius)"
      : "构造风格元数据 + 视觉数据（name + description + emoji + 主题色 + 字体 + 圆角）",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          lang === "en"
            ? "≤ 3-word English style name (do not include the word 'style' itself)"
            : "2-6 字中文风格名（不要包含『风格』两个字）",
      },
      description: {
        type: "string",
        description:
          lang === "en"
            ? "≤ 60 chars single-sentence description with concrete visual anchors"
            : "≤ 30 字一句话描述，含具体视觉锚点",
      },
      emoji: {
        type: "string",
        description: lang === "en" ? "1-2 char short symbol" : "1-2 字符的简短符号",
      },
      theme: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["light", "dark"] },
          colors: {
            type: "object",
            properties: {
              bg: { type: "string", description: "16 进制颜色 #rrggbb" },
              fg: { type: "string", description: "16 进制颜色 #rrggbb" },
              primary: { type: "string", description: "16 进制颜色 #rrggbb" },
              accent: { type: "string", description: "16 进制颜色 #rrggbb" },
              muted: { type: "string", description: "16 进制颜色 #rrggbb" },
            },
            required: ["bg", "fg", "primary", "accent", "muted"],
          },
          fonts: {
            type: "object",
            properties: {
              heading: { type: "string" },
              body: { type: "string" },
            },
            required: ["heading", "body"],
          },
          radius: { type: "string", enum: ["none", "sm", "md", "lg", "xl"] },
        },
        required: ["mode", "colors", "fonts", "radius"],
      },
      styleInstructions: {
        type: "string",
        description:
          lang === "en"
            ? "180-300 word directive style instructions (concrete, imperative); injected as-is when generating decks; expand image-recognition findings here"
            : "150-250 字的风格指令（具体、指令式），后续生成 deck 时直接注入；从图片或描述中提取的视觉特征要在这里展开",
      },
    },
    required: ["name", "description", "emoji", "theme", "styleInstructions"],
  },
});

export interface StyleGenInput {
  // 用户文字描述，与 images 至少有一项
  brief: string;
  // 参考图片 base64 dataURL 数组（如 "data:image/png;base64,..."）。为空时纯文字模式
  images?: string[];
}

export interface StyleGenResult {
  name?: string;
  description?: string;
  emoji?: string;
  theme?: Theme;
  // LLM 输出的 150-250 字风格指令（图片识别 + 文字综合提取）
  styleInstructions?: string;
  error?: string;
}

export async function generateStyleDefinition(input: StyleGenInput): Promise<StyleGenResult> {
  const hasImages = (input.images?.length ?? 0) > 0;
  const lang = getCurrentLang();
  // 有图片：走"图片识别"场景路由（用户可在配置页面自定义优先级，默认 全模态 → 全能 → 仅文本）
  // 无图片：走默认"普通生成"场景（默认 全能 → 仅文本 → 全模态）
  const active = hasImages ? getActiveConfig("image-recognition") : getActiveConfig();
  if (!active) {
    return {
      error: hasImages
        ? lang === "en"
          ? "No image-capable model is enabled. Please enable an 'omni' or 'multimodal' model in Model Settings, or remove images and generate from text only."
          : "未找到支持图片识别的已启用模型。请在「大模型配置」启用一个能力为『全能型』或『全模态』的模型，或移除图片仅用文字描述生成。"
        : lang === "en"
          ? "No model configured. Please set the API key in Settings first."
          : "未配置大模型，请先在设置中填入 API Key",
    };
  }
  const briefSection = input.brief.trim()
    ? lang === "en"
      ? `User text description:\n"""\n${input.brief.trim()}\n"""\n`
      : `用户文字描述：\n"""\n${input.brief.trim()}\n"""\n`
    : lang === "en"
      ? "(No text description provided; derive the style from the image only.)\n"
      : "（用户未填文字描述，请仅依据图片提取风格）\n";
  const imageSection = hasImages
    ? lang === "en"
      ? `\nUser attached ${input.images!.length} reference image(s). Observe colors, typography, whitespace, decoration, and overall mood, and fold those findings into styleInstructions.\n`
      : `\n用户附了 ${input.images!.length} 张参考图片。请仔细观察色彩、字体、留白、装饰、整体氛围，将识别结果融合到 styleInstructions 中。\n`
    : "";
  const userMessage =
    lang === "en"
      ? `${briefSection}${imageSection}\nCall the build_style tool and return the style name + single-sentence description + emoji + full theme + styleInstructions (the core field).`
      : `${briefSection}${imageSection}\n请调用 build_style 工具，输出风格名 + 一句话描述 + emoji + 完整 theme + styleInstructions（核心字段）。`;

  const system = getStyleGeneratorSystem(lang);
  const tool = buildTool(lang);

  try {
    let raw: any;
    if (active.provider === "anthropic") {
      raw = await callAnthropic(userMessage, input.images ?? [], active.config, system, tool);
    } else {
      raw = await callOpenAI(userMessage, input.images ?? [], active.config, system, tool);
    }
    return validateAndPack(raw, lang);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    // 多模态请求被服务端拒绝时给具体提示（部分国产兼容服务不支持 vision）
    if (hasImages && /image|vision|multimodal|content.*format/i.test(msg)) {
      return {
        error:
          lang === "en"
            ? `The current model may not support image recognition: ${msg}\nTry a vision-capable model (e.g. GPT-4o / Claude / Gemini 2.5 Pro / Qwen-VL) or generate from text only.`
            : `当前模型可能不支持图片识别：${msg}\n建议改用支持视觉的模型（如 GPT-4o / Claude / Gemini 2.5 Pro / Qwen-VL），或仅用文字描述生成。`,
      };
    }
    return {
      error: (lang === "en" ? "Generation failed: " : "生成失败：") + msg,
    };
  }
}

function validateAndPack(raw: any, lang: Lang): StyleGenResult {
  if (!raw) return { error: lang === "en" ? "Model returned no result" : "模型未返回结果" };
  // 中文 12 字 ≈ 英文 ~3 words ≈ 30 chars；英文用更宽松的上限避免被截断
  const nameMax = lang === "en" ? 40 : 12;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, nameMax) : "";
  const descMax = lang === "en" ? 100 : 60;
  const description = typeof raw.description === "string" ? raw.description.trim().slice(0, descMax) : "";
  const emoji = typeof raw.emoji === "string" ? raw.emoji.slice(0, 4) : "◐";
  const styleInstructions = typeof raw.styleInstructions === "string" ? raw.styleInstructions.trim().slice(0, 1200) : undefined;
  const t = raw.theme;
  if (!t || typeof t !== "object") {
    return { error: lang === "en" ? "Model did not return theme" : "模型未返回 theme" };
  }
  const c = t.colors ?? {};
  const theme: Theme = {
    mode: t.mode === "dark" ? "dark" : "light",
    colors: {
      bg: typeof c.bg === "string" ? c.bg : "#ffffff",
      fg: typeof c.fg === "string" ? c.fg : "#0f172a",
      primary: typeof c.primary === "string" ? c.primary : "#2563eb",
      accent: typeof c.accent === "string" ? c.accent : undefined,
      muted: typeof c.muted === "string" ? c.muted : undefined,
    },
    fonts: {
      heading: typeof t.fonts?.heading === "string" ? t.fonts.heading : "Inter",
      body: typeof t.fonts?.body === "string" ? t.fonts.body : "Inter",
    },
    radius: ["none", "sm", "md", "lg", "xl"].includes(t.radius) ? t.radius : "md",
  };
  return { name, description, emoji, theme, styleInstructions };
}

// 把 dataURL 拆成 mediaType + base64 数据：Anthropic 需要这两段独立字段
function splitDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mediaType: m[1]!, data: m[2]! };
}

async function callAnthropic(
  userMessage: string,
  images: string[],
  cfg: ProviderConfig,
  system: string,
  tool: ReturnType<typeof buildTool>,
): Promise<any> {
  const client = createAnthropic(cfg);
  // 多模态 content：先放图片再放文字（Anthropic 推荐顺序）
  const contentParts: any[] = [];
  for (const url of images) {
    const parts = splitDataUrl(url);
    if (parts) {
      contentParts.push({
        type: "image",
        source: { type: "base64", media_type: parts.mediaType, data: parts.data },
      });
    }
  }
  contentParts.push({ type: "text", text: userMessage });

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
    messages: [{ role: "user", content: images.length > 0 ? contentParts : userMessage }],
  });
  const tu = resp.content.find((b: any) => b.type === "tool_use") as any;
  if (!tu) throw new Error("model did not call the tool");
  return tu.input;
}

async function callOpenAI(
  userMessage: string,
  images: string[],
  cfg: ProviderConfig,
  system: string,
  tool: ReturnType<typeof buildTool>,
): Promise<any> {
  const client = createOpenAI(cfg);
  // 多模态 user content：OpenAI 兼容 image_url 形态，data URL 形如 "data:image/png;base64,..."
  // 顺序：image_url 在前、text 在后 —— 与小米 MiMo 多模态文档示例一致；多数视觉模型也偏好图片先于指代它的文字
  // 参考：https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/multimodal-understanding/image-understanding
  const userContent: any =
    images.length > 0
      ? [
          ...images.map((url) => ({ type: "image_url", image_url: { url } })),
          { type: "text", text: userMessage },
        ]
      : userMessage;

  const resp = await client.chat.completions.create({
    model: cfg.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
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
