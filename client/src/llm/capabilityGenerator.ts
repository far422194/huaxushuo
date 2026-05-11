import { SlideSchema, type Slide, type Theme, HXS_UTILITIES, HXS_ICON_NAMES } from "@shared/dsl";
import { getActiveConfig } from "./settings";
import type { ProviderConfig } from "./types";
import { createAnthropic, createOpenAI } from "./clientFactory";
import type { Pattern, PatternCategory } from "@/data/patterns";
import type { Skill } from "@/data/skills";
import { getCurrentLang } from "@/i18n";
import { getCapabilityGeneratorSystem } from "@/i18n/prompts";
import type { Lang } from "@/i18n/types";

// 把 utility 白名单按 category 分组成紧凑列表
const UTILITY_REFERENCE = (() => {
  const groups: Record<string, string[]> = {};
  for (const u of HXS_UTILITIES) (groups[u.category] ??= []).push(u.name);
  return Object.entries(groups)
    .map(([cat, names]) => `- ${cat}: ${names.join(", ")}`)
    .join("\n");
})();

// 按 UI 语言取 system prompt 模板，replace 占位符为运行时白名单数据
const buildSystem = (lang: Lang): string => {
  const template = getCapabilityGeneratorSystem(lang);
  return template
    .replace("__UTILITY_REFERENCE__", UTILITY_REFERENCE)
    .replace("__ICON_LIST_30__", HXS_ICON_NAMES.slice(0, 30).join(", "))
    .replace("__ICON_TOTAL__", String(HXS_ICON_NAMES.length));
};


// 工具 schema 的 description 按 UI 语言切换：让 LLM 在 tool_call 决策时也按目标语言写 name/description/systemAddon
const buildTool = (lang: Lang) => ({
  name: "build_capability",
  description:
    lang === "en"
      ? "Recognize a reference image into both a pattern (page template) and a skill (style recipe)"
      : "从参考图同时识别为 pattern（页面样板）+ skill（风格能力包）双产物",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              lang === "en"
                ? "≤ 3-word English short name; do not include the word 'style'"
                : "2-8 字中文短名，不含『风格』二字",
          },
          description: {
            type: "string",
            description:
              lang === "en"
                ? "≤ 60 chars single-sentence purpose"
                : "≤ 30 字一句话用途",
          },
          category: {
            type: "string",
            enum: ["hero", "section", "stat", "list", "compare", "flow", "quote", "cta", "decor"],
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description:
              lang === "en"
                ? "3-6 short tags in English or Chinese"
                : "3-6 个英文 / 中文标签",
          },
          themeHint: {
            type: "object",
            properties: {
              mode: { type: "string", enum: ["light", "dark"] },
              primary: { type: "string", description: "16 进制 #rrggbb，可选" },
            },
          },
          slides: {
            type: "array",
            description:
              lang === "en"
                ? "Must contain exactly 1 item; each is a DSL SlideSchema-compliant slide JSON (id = empty string)"
                : "必须 1 项；每项是符合 DSL SlideSchema 的 slide JSON（id 留空字符串）",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                layout: { type: "string" },
                transition: { type: "string" },
                utilities: { type: "array", items: { type: "string" } },
                background: {
                  type: "object",
                  description:
                    lang === "en"
                      ? "Optional. type must be exactly one of 'solid' | 'gradient' | 'image'. " +
                        "solid: {type:'solid', color:'#hex'}; " +
                        "gradient: {type:'gradient', from:'#hex', to:'#hex', angle?:number}; " +
                        "image: {type:'image', url:'data:|http(s)://', opacity?:number}. " +
                        "Other type values are not supported; if no background is needed, omit the field entirely."
                      : "可选。type 必须严格为 'solid'|'gradient'|'image' 三选一。" +
                        "solid: {type:'solid', color:'#hex'}；" +
                        "gradient: {type:'gradient', from:'#hex', to:'#hex', angle?:number}；" +
                        "image: {type:'image', url:'data:|http(s)://', opacity?:number}。" +
                        "不支持其他 type 值；不需要背景时直接不输出此字段。",
                },
                blocks: { type: "array" },
              },
              required: ["id", "layout", "blocks"],
            },
          },
        },
        required: ["name", "description", "category", "tags", "slides"],
      },
      skill: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              lang === "en" ? "≤ 3-word English short name" : "2-8 字中文短名",
          },
          description: {
            type: "string",
            description:
              lang === "en"
                ? "≤ 60 chars single-sentence description"
                : "≤ 30 字一句话描述",
          },
          triggers: {
            type: "array",
            items: { type: "string" },
            description:
              lang === "en" ? "4-8 trigger keywords" : "4-8 个触发词",
          },
          systemAddon: {
            type: "string",
            description:
              lang === "en"
                ? "600-1000 word directive style recipe (imperative form)"
                : "600-1000 字风格能力配方，指令式写法",
          },
          recommendBlocks: { type: "array", items: { type: "string" } },
          recommendUtilities: { type: "array", items: { type: "string" } },
          recommendTheme: {
            type: "object",
            properties: {
              mode: { type: "string", enum: ["light", "dark"] },
              colors: {
                type: "object",
                properties: {
                  bg: { type: "string" },
                  fg: { type: "string" },
                  primary: { type: "string" },
                  accent: { type: "string" },
                },
              },
            },
          },
        },
        required: ["name", "description", "triggers", "systemAddon", "recommendBlocks", "recommendUtilities"],
      },
    },
    required: ["pattern", "skill"],
  },
});

export interface CapabilityGenInput {
  // 用户上传的 1-3 张参考图 base64 dataURL
  images: string[];
  // 可选用途描述（中文）
  brief?: string;
}

// 解析后归一化的 pattern 候选（不含 id / createdAt / source —— UI 保存时由 addUserSavedPattern 填）
export type PatternCandidate = Omit<Pattern, "id" | "createdAt" | "source">;
// 同 skill
export type SkillCandidate = Omit<Skill, "id" | "createdAt" | "source">;

// 单张图的产物：一份 pattern 候选 + 一份 skill 候选；任一可缺失
export interface CapabilityItem {
  pattern?: PatternCandidate;
  patternError?: string;
  skill?: SkillCandidate;
  // 单 item 完全失败时设（pattern + skill 都没解析出来）
  itemError?: string;
  // 输入图片的 base64 dataURL（UI 显示缩略图用）
  sourceImage?: string;
}

export interface CapabilityGenResult {
  // 每张输入图独立产出一项；单图也用 items 数组（length=1）保持结构统一
  items: CapabilityItem[];
  // 全部失败 / 路由失败时设
  error?: string;
}

// 错误文案双语 helper（capabilityGenerator 内部用）
const errMsg = (lang: Lang, key: string, ...args: string[]): string => {
  const en = lang === "en";
  switch (key) {
    case "needImage":
      return en ? "Please upload at least 1 reference image." : "至少上传 1 张参考图";
    case "noVisionModel":
      return en
        ? "No image-capable model is enabled. Please enable an 'omni' or 'multimodal' model in Model Settings."
        : "未找到支持图片识别的已启用模型。请在「大模型配置」启用一个能力为『全能型』或『全模态』的模型";
    case "noVisionModelShort":
      return en ? "No image-capable model is enabled" : "未找到支持图片识别的已启用模型";
    case "noValidStructure":
      return en ? "No valid structure was extracted" : "未识别出任何有效结构";
    case "genFailUnknown":
      return en ? "Generation failed: unknown error" : "生成失败：未知错误";
    case "noActiveModel":
      return en ? "No active model" : "无可用模型";
    case "visionNotSupported":
      return en ? `Model may not support image recognition: ${args[0]}` : `模型可能不支持图片识别：${args[0]}`;
    case "toolAndJsonFail":
      return en
        ? `Generation failed (both tool and JSON fallback returned nothing): ${args[0]}`
        : `生成失败（tool 与 JSON 兜底均无解析结果）：${args[0]}`;
    case "toolFailJsonAlsoFail":
      return en
        ? `Generation failed (tool failed + JSON fallback also failed): ${args[0]}; fallback error: ${args[1]}`
        : `生成失败（tool 失败 + JSON 兜底也失败）：${args[0]}；兜底错误：${args[1]}`;
    case "genFail":
      return en ? `Generation failed: ${args[0]}` : `生成失败：${args[0]}`;
    default:
      return key;
  }
};

// 主入口：每张图独立调用 → 各自产出独立的 pattern + skill 候选
// 用户在 UI 中自主决定每项是否保存（pattern / skill 独立勾选）
export async function generateCapability(input: CapabilityGenInput): Promise<CapabilityGenResult> {
  const lang = getCurrentLang();
  if (!input.images?.length) {
    return { items: [], error: errMsg(lang, "needImage") };
  }
  const active = getActiveConfig("image-recognition");
  if (!active) {
    return { items: [], error: errMsg(lang, "noVisionModel") };
  }

  // 逐张调用 → 收集 N 个独立 item（解决多图 + tool calling 国产模型兼容性差的问题）
  const items: CapabilityItem[] = [];
  for (const img of input.images) {
    const item = await generateCapabilitySingle({ images: [img], brief: input.brief }, lang);
    item.sourceImage = img;
    items.push(item);
  }

  // 全部 item 都没有有效产物 → 整体失败
  const hasAnyValid = items.some((it) => it.pattern || it.skill);
  if (!hasAnyValid) {
    const firstErr = items.find((it) => it.itemError)?.itemError ?? errMsg(lang, "noValidStructure");
    return { items, error: firstErr };
  }
  return { items };
}

// 单张图调用：返回 CapabilityItem（pattern / skill / patternError / itemError 任意组合）
// 失败兜底：tool 调用失败时（国产模型常见兼容问题）自动降级到"无 tool + JSON 输出"模式
// 整体重试：双重失败（tool 失败 + JSON 兜底也无解）时再整体走一次（处理首次冷启动抖动）
async function generateCapabilitySingle(input: CapabilityGenInput, lang: Lang): Promise<CapabilityItem> {
  const active = getActiveConfig("image-recognition");
  if (!active) {
    return { itemError: errMsg(lang, "noVisionModelShort") };
  }

  // 整体重试最多 2 次（首次抖动场景，第 2 次通常成功）
  let lastErr: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await tryOneAttempt(input, active, lang);
    // 拿到任意有效产物（pattern 或 skill）即可
    if (r.pattern || r.skill) return r;
    lastErr = r.itemError;
    // 视觉模型不支持类错误不重试（确定性失败）—— 中英文模式提示都识别
    if (lastErr && /模型可能不支持图片识别|未找到支持图片识别|may not support image recognition|No image-capable model/.test(lastErr)) {
      return r;
    }
  }
  return { itemError: lastErr ?? errMsg(lang, "genFailUnknown") };
}

// 单次尝试：tool calling → 失败时 JSON 兜底；缺 pattern 时 JSON 补
async function tryOneAttempt(
  input: CapabilityGenInput,
  active: ReturnType<typeof getActiveConfig>,
  lang: Lang,
): Promise<CapabilityItem> {
  if (!active) return { itemError: errMsg(lang, "noActiveModel") };

  const briefSection = input.brief?.trim()
    ? lang === "en"
      ? `User's brief about intended use:\n"""\n${input.brief.trim()}\n"""\n`
      : `用户简要描述用途：\n"""\n${input.brief.trim()}\n"""\n`
    : lang === "en"
      ? "(No text description; please extract purely from the image.)\n"
      : "（用户未填文字描述，请仅依据图片提取）\n";
  const userMessage =
    lang === "en"
      ? `${briefSection}\nObserve the image carefully and call the \`build_capability\` tool to return both pattern and skill structured outputs.\n\nThe pattern is for concrete page reuse (referenced via patternRef); the skill is for style triggering (injected via systemAddon). Leave skill.fewshotPatternIds as an empty array — the UI will fill it on save.`
      : `${briefSection}\n请仔细观察图片，调用 \`build_capability\` 工具，返回 pattern + skill 两个结构化产物。\n\nPattern 用于具体页面复用（patternRef 引用），skill 用于风格触发（systemAddon 注入）。skill.fewshotPatternIds 留空数组，UI 保存时会自动填入。`;

  const system = buildSystem(lang);
  const tool = buildTool(lang);

  // 主路径：tool calling
  try {
    let raw: any;
    if (active.provider === "anthropic") {
      raw = await callAnthropic(userMessage, input.images, active.config, system, tool);
    } else {
      raw = await callOpenAI(userMessage, input.images, active.config, system, tool);
    }
    const result = validateAndPack(raw, lang);

    // 缺 pattern 时改用 JSON 输出补一次（绕开 tool schema 处理 bug）
    if (!result.pattern && result.skill && result.patternError) {
      try {
        const retryRaw = active.provider === "anthropic"
          ? await callAnthropicJsonOutput(input.images, input.brief ?? "", active.config, system, lang)
          : await callOpenAIJsonOutput(input.images, input.brief ?? "", active.config, system, lang);
        if (retryRaw) {
          const retryResult = validateAndPack(retryRaw, lang);
          if (retryResult.pattern) {
            return { ...retryResult, skill: retryResult.skill ?? result.skill };
          }
        }
      } catch {
        // JSON 重试也失败：忽略，沿用首次结果（至少 skill 可用）
      }
    }
    return result;
  } catch (err: any) {
    const msg = err?.message ?? String(err);

    if (/image|vision|multimodal|content.*format/i.test(msg)) {
      return { itemError: errMsg(lang, "visionNotSupported", msg) };
    }

    // 工具调用类错误：降级到 JSON 输出
    if (/未调用工具|tool.*call|function.*call|did not call the tool/i.test(msg)) {
      try {
        const raw = active.provider === "anthropic"
          ? await callAnthropicJsonOutput(input.images, input.brief ?? "", active.config, system, lang)
          : await callOpenAIJsonOutput(input.images, input.brief ?? "", active.config, system, lang);
        if (!raw) {
          return { itemError: errMsg(lang, "toolAndJsonFail", msg) };
        }
        return validateAndPack(raw, lang);
      } catch (jsonErr: any) {
        return {
          itemError: errMsg(lang, "toolFailJsonAlsoFail", msg, jsonErr?.message ?? String(jsonErr)),
        };
      }
    }

    return { itemError: errMsg(lang, "genFail", msg) };
  }
}

// JSON 输出兜底：不传 tools，让模型直接输出 JSON 文本；客户端 tryExtractJson 解析
// 国产兼容服务对 tool calling 支持差时的最终退路
const JSON_OUTPUT_INSTRUCTION_ZH = `\n\n## 输出形式（极其重要）\n**直接输出 JSON 对象本身**，第一个字符必须是 \`{\`，最后一个字符必须是 \`}\`。无任何 markdown 代码块包装、无说明文字、无注释。\n\nJSON 顶层结构：\n\`\`\`\n{\n  "pattern": {\n    "name": "...", "description": "...", "category": "hero|section|stat|list|compare|flow|quote|cta|decor",\n    "tags": ["..."], "themeHint": {"mode":"light|dark","primary":"#hex"},\n    "slides": [{"id":"", "layout":"...", "blocks":[...]}]\n  },\n  "skill": {\n    "name": "...", "description": "...",\n    "triggers": ["..."], "systemAddon": "...",\n    "recommendBlocks": [...], "recommendUtilities": [...]\n  }\n}\n\`\`\`\nslides 必须 1 项；slide.id 留空字符串；blocks 严格按 16 种 type；utilities/icon 在白名单内。`;

const JSON_OUTPUT_INSTRUCTION_EN = `\n\n## Output format (critical)\n**Emit the JSON object itself directly** — the first character must be \`{\` and the last must be \`}\`. No markdown code fences, no commentary, no comments.\n\nJSON top-level structure:\n\`\`\`\n{\n  "pattern": {\n    "name": "...", "description": "...", "category": "hero|section|stat|list|compare|flow|quote|cta|decor",\n    "tags": ["..."], "themeHint": {"mode":"light|dark","primary":"#hex"},\n    "slides": [{"id":"", "layout":"...", "blocks":[...]}]\n  },\n  "skill": {\n    "name": "...", "description": "...",\n    "triggers": ["..."], "systemAddon": "...",\n    "recommendBlocks": [...], "recommendUtilities": [...]\n  }\n}\n\`\`\`\nslides must have exactly 1 item; slide.id is the empty string; blocks must strictly follow the 16 block types; utilities/icon must be in the whitelist.`;

const getJsonOutputInstruction = (lang: Lang): string =>
  lang === "en" ? JSON_OUTPUT_INSTRUCTION_EN : JSON_OUTPUT_INSTRUCTION_ZH;

const jsonFallbackTail = (brief: string, lang: Lang): string =>
  lang === "en"
    ? (brief.trim() ? `User's intent: ${brief.trim()}\n\n` : "") +
      "Emit the JSON object directly per the schema above; do not call any tool and do not wrap in markdown."
    : (brief.trim() ? `用户描述用途：${brief.trim()}\n\n` : "") +
      "请按上述 JSON schema 直接输出对象，不要调用工具，不要 markdown 包装。";

async function callAnthropicJsonOutput(
  images: string[],
  brief: string,
  cfg: ProviderConfig,
  system: string,
  lang: Lang,
): Promise<any> {
  const client = createAnthropic(cfg);
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
  contentParts.push({
    type: "text",
    text: jsonFallbackTail(brief, lang),
  });
  const resp = await client.messages.create({
    model: cfg.model,
    max_tokens: 4000,
    system: system + getJsonOutputInstruction(lang),
    messages: [{ role: "user", content: contentParts }],
  });
  const text = (resp.content.find((b: any) => b.type === "text") as any)?.text ?? "";
  return tryExtractJson(text);
}

async function callOpenAIJsonOutput(
  images: string[],
  brief: string,
  cfg: ProviderConfig,
  system: string,
  lang: Lang,
): Promise<any> {
  const client = createOpenAI(cfg);
  const userContent: any = [
    ...images.map((url) => ({ type: "image_url", image_url: { url } })),
    {
      type: "text",
      text: jsonFallbackTail(brief, lang),
    },
  ];
  const resp = await client.chat.completions.create({
    model: cfg.model,
    messages: [
      { role: "system", content: system + getJsonOutputInstruction(lang) },
      { role: "user", content: userContent },
    ],
    max_tokens: 4000,
  });
  const text = resp.choices?.[0]?.message?.content;
  return tryExtractJson(typeof text === "string" ? text : null);
}

// 从纯文本响应中尝试抽取 JSON 对象
function tryExtractJson(text: string | null | undefined): any | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// slide 级可选字段：校验失败时可被剥离重试。必填字段（id/layout/blocks）一旦错误直接返回
const OPTIONAL_SLIDE_FIELDS = new Set([
  "background", "transition", "transitionDuration",
  "utilities", "showPageNumber", "patternRef", "notes",
]);

// 级联剥离重试：LLM 偶尔写出不合规字段时，自动剥离让 pattern 主体仍能保存
// 两类容错：① slide 顶层可选字段错（如 background.type 不合法）→ 剥离整个字段
//          ② blocks[N].* 错（如某 block 缺必填 text）→ 剥离这个出错的 block，保留其他 block
function cleanAndValidateSlide(
  rawSlide: any,
  lang: Lang,
): { ok: true; slide: Slide; cleanedFields: string[] } | { ok: false; error: string } {
  const en = lang === "en";
  let working: any = { ...rawSlide, id: rawSlide?.id || "tmp-validate" };
  if (Array.isArray(working.blocks)) working.blocks = [...working.blocks];
  const cleanedFields: string[] = [];
  const MAX_ATTEMPTS = 12;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const r = SlideSchema.safeParse(working);
    if (r.success) {
      // 即使通过：blocks 不能为空（pattern 必须有内容）；仅剩 0 块时拒绝
      if (r.data.blocks.length === 0) {
        return {
          ok: false,
          error: en
            ? "pattern.slides[0]: all blocks invalid, nothing left after stripping"
            : "pattern.slides[0] 所有 block 均不合规，剥离后无内容可用",
        };
      }
      return { ok: true, slide: r.data, cleanedFields };
    }

    const issue = r.error.issues[0];
    const topField = (issue.path[0] ?? "") as string;

    // ① blocks[N].* 错误：剥离 blocks[N]
    if (topField === "blocks" && typeof issue.path[1] === "number" && Array.isArray(working.blocks)) {
      const blockIdx = issue.path[1] as number;
      if (blockIdx >= 0 && blockIdx < working.blocks.length) {
        working.blocks = working.blocks.filter((_: any, idx: number) => idx !== blockIdx);
        cleanedFields.push(`blocks[${blockIdx}]`);
        continue;
      }
    }

    // ② slide 顶层可选字段错误：剥离整个字段
    if (typeof topField === "string" && OPTIONAL_SLIDE_FIELDS.has(topField)) {
      delete working[topField];
      cleanedFields.push(topField);
      continue;
    }

    // 必填字段错误（id/layout/blocks 整体不是数组等）：无法兜底
    const path = issue.path.join(".");
    return {
      ok: false,
      error: en
        ? `pattern.slides[0] schema check failed: ${path} ${issue.message}`
        : `pattern.slides[0] schema 不通过：${path} ${issue.message}`,
    };
  }

  return {
    ok: false,
    error: en
      ? "pattern.slides[0] schema check still failing after multiple strip attempts"
      : "pattern.slides[0] schema 不通过：多轮剥离后仍未通过",
  };
}

function validateAndPack(raw: any, lang: Lang): CapabilityItem {
  const en = lang === "en";
  if (!raw) return { itemError: en ? "Model returned no result" : "模型未返回结果" };

  // skill 解析（即使 pattern 失败，skill 仍可独立保存）
  const skill = parseSkill(raw.skill, lang);

  // pattern 解析 + slide schema 校验
  const patternRaw = raw.pattern;
  if (!patternRaw || typeof patternRaw !== "object") {
    return skill
      ? {
          skill,
          patternError: en ? "Model did not return a pattern structure" : "模型未返回 pattern 结构",
        }
      : { itemError: en ? "Model did not return any valid structure" : "模型未返回任何有效结构" };
  }
  const slidesRaw = Array.isArray(patternRaw.slides) ? patternRaw.slides : [];
  if (slidesRaw.length === 0) {
    return skill
      ? { skill, patternError: en ? "pattern.slides is empty" : "pattern.slides 为空" }
      : { itemError: en ? "pattern.slides is empty and no skill returned" : "pattern.slides 为空且无 skill" };
  }
  // 仅取第 1 项（单图 → 单页 pattern）；id 留空让保存方填
  const cleanResult = cleanAndValidateSlide(slidesRaw[0], lang);
  if (!cleanResult.ok) {
    return skill ? { skill, patternError: cleanResult.error } : { itemError: cleanResult.error };
  }
  // 校验通过：把 slide.id 重置为空字符串（保存方按需填）
  const slideClean: Slide = { ...cleanResult.slide, id: "" };

  const validCategories: PatternCategory[] = [
    "hero", "section", "stat", "list",
    "compare", "flow", "quote", "cta", "decor",
  ];
  const cat: PatternCategory = validCategories.includes(patternRaw.category)
    ? patternRaw.category
    : "section";

  const themeHint = patternRaw.themeHint && typeof patternRaw.themeHint === "object"
    ? {
        mode: patternRaw.themeHint.mode === "dark" ? "dark" as const : "light" as const,
        primary: typeof patternRaw.themeHint.primary === "string" ? patternRaw.themeHint.primary : undefined,
      }
    : undefined;

  // 中文 16 字 ≈ 英文 ~3 words；英文上限放宽避免被截
  const nameMax = en ? 40 : 16;
  const descMax = en ? 100 : 60;
  const pattern: PatternCandidate = {
    name:
      typeof patternRaw.name === "string"
        ? patternRaw.name.trim().slice(0, nameMax)
        : en
          ? "New Pattern"
          : "新模板",
    description: typeof patternRaw.description === "string" ? patternRaw.description.trim().slice(0, descMax) : "",
    category: cat,
    tags: Array.isArray(patternRaw.tags)
      ? patternRaw.tags.filter((t: unknown) => typeof t === "string").slice(0, 8)
      : [],
    slides: [slideClean],
    themeHint,
  };

  return { pattern, skill };
}

function parseSkill(raw: any, lang: Lang): SkillCandidate | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  // 中文短名 16 字 ≈ 英文 ~3 words；英文上限放宽
  const nameMax = lang === "en" ? 40 : 16;
  const descMax = lang === "en" ? 140 : 80;
  const triggerMax = lang === "en" ? 32 : 16;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, nameMax) : "";
  const description = typeof raw.description === "string" ? raw.description.trim().slice(0, descMax) : "";
  const triggers = Array.isArray(raw.triggers)
    ? raw.triggers
        .filter((t: unknown) => typeof t === "string" && t.trim().length > 0)
        .map((t: string) => t.trim().slice(0, triggerMax))
        .slice(0, 8)
    : [];
  const systemAddon = typeof raw.systemAddon === "string" ? raw.systemAddon.trim().slice(0, 4000) : "";
  const recommendBlocks = Array.isArray(raw.recommendBlocks)
    ? raw.recommendBlocks.filter((b: unknown) => typeof b === "string").slice(0, 16)
    : [];
  const recommendUtilities = Array.isArray(raw.recommendUtilities)
    ? raw.recommendUtilities.filter((u: unknown) => typeof u === "string").slice(0, 24)
    : [];
  if (!name || !systemAddon || triggers.length === 0) return undefined;

  let recommendTheme: Partial<Theme> | undefined;
  if (raw.recommendTheme && typeof raw.recommendTheme === "object") {
    const t = raw.recommendTheme;
    recommendTheme = {
      mode: t.mode === "dark" ? "dark" : "light",
      ...(t.colors && typeof t.colors === "object"
        ? {
            colors: {
              bg: typeof t.colors.bg === "string" ? t.colors.bg : "#ffffff",
              fg: typeof t.colors.fg === "string" ? t.colors.fg : "#0f172a",
              primary: typeof t.colors.primary === "string" ? t.colors.primary : "#2563eb",
              accent: typeof t.colors.accent === "string" ? t.colors.accent : undefined,
            },
          }
        : {}),
    } as Partial<Theme>;
  }

  return {
    name,
    description,
    triggers,
    systemAddon,
    recommendBlocks,
    recommendUtilities,
    recommendTheme,
    fewshotPatternIds: [], // UI 保存时填入刚保存的 pattern.id
  };
}

// 把 dataURL 拆 mediaType + base64
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
    max_tokens: 4000,
    system,
    tools: [
      {
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters as any,
      },
    ] as any,
    messages: [{ role: "user", content: contentParts }],
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
  const userContent: any = [
    ...images.map((url) => ({ type: "image_url", image_url: { url } })),
    { type: "text", text: userMessage },
  ];

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
    max_tokens: 4000,
  });
  const tc = resp.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc || tc.type !== "function") throw new Error("model did not call the tool");
  return JSON.parse(tc.function.arguments || "{}");
}
