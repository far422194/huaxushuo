import i18n from "@/i18n";
import type { Lang } from "@/i18n/types";
import {
  CREATIVE_ADDONS_ZH,
  PROMPT_EXTRACTOR_SYSTEM_ZH,
  STYLE_GENERATOR_SYSTEM_ZH,
  PROMPT_GENERATOR_SYSTEM_ZH,
  CAPABILITY_GENERATOR_SYSTEM_ZH,
} from "./zh-CN";
import {
  CREATIVE_ADDONS_EN,
  PROMPT_EXTRACTOR_SYSTEM_EN,
  STYLE_GENERATOR_SYSTEM_EN,
  PROMPT_GENERATOR_SYSTEM_EN,
  CAPABILITY_GENERATOR_SYSTEM_EN,
} from "./en";

export function getCreativeAddons(lang: Lang): string {
  return lang === "en" ? CREATIVE_ADDONS_EN : CREATIVE_ADDONS_ZH;
}

export function getOutputLangInstruction(lang: Lang): string {
  return i18n.getResource(lang, "prompt-meta", "outputLangInstruction") as string;
}

// 内容框架提取专家 system prompt（按 UI 语言切换中/英）
export function getPromptExtractorSystem(lang: Lang): string {
  return lang === "en" ? PROMPT_EXTRACTOR_SYSTEM_EN : PROMPT_EXTRACTOR_SYSTEM_ZH;
}

// 风格定义生成 system prompt（按 UI 语言切换中/英）
export function getStyleGeneratorSystem(lang: Lang): string {
  return lang === "en" ? STYLE_GENERATOR_SYSTEM_EN : STYLE_GENERATOR_SYSTEM_ZH;
}

// 演示选题灵感生成 system prompt（按 UI 语言切换中/英）
export function getPromptGeneratorSystem(lang: Lang): string {
  return lang === "en" ? PROMPT_GENERATOR_SYSTEM_EN : PROMPT_GENERATOR_SYSTEM_ZH;
}

// 能力包识别 system prompt 模板（按 UI 语言切换中/英，含 __UTILITY_REFERENCE__ / __ICON_LIST_30__ / __ICON_TOTAL__ 占位符）
// 调用方负责把白名单数据 replace 进去
export function getCapabilityGeneratorSystem(lang: Lang): string {
  return lang === "en" ? CAPABILITY_GENERATOR_SYSTEM_EN : CAPABILITY_GENERATOR_SYSTEM_ZH;
}
