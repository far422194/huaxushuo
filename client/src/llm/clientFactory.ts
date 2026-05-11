// 统一的 SDK 客户端工厂：把"是否走代理"决策从 14 处零散调用点收口到一处
//
// 走代理时：baseURL 改成代理 URL，原 baseURL 通过 X-LLM-Target header 发给 Worker；
// Worker 透传时取 X-LLM-Target，把请求 path 拼到目标 baseURL 上转发。
//
// 不走代理时：与原 SDK 直连行为完全一致（保持向后兼容）。
//
// useProxy=true 但 proxyUrl 缺失（用户切了代理但没填全局 URL）→ fallback 直连 + console.warn
// 避免调用完全无响应；UI 层会引导用户去 ListView 填 proxyUrl

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { loadSettings } from "./settings";

interface ClientCfg {
  apiKey: string;
  baseURL?: string;
  // 由 ProviderConfig 透传或直接传入；都为空时回退读 settings 全局
  useProxy?: boolean;
  proxyUrl?: string;
}

const ANTHROPIC_DEFAULT_BASE = "https://api.anthropic.com";
const OPENAI_DEFAULT_BASE = "https://api.openai.com/v1";

// 解析最终代理 URL：cfg.proxyUrl > settings.proxyUrl > undefined
// useProxy=false 时直接返回 undefined（不走代理）
function resolveProxy(cfg: ClientCfg): string | undefined {
  if (!cfg.useProxy) return undefined;
  const url = cfg.proxyUrl ?? loadSettings().proxyUrl;
  const trimmed = url?.replace(/\/+$/, "");
  if (!trimmed) {
    console.warn("[clientFactory] useProxy=true 但 proxyUrl 未配置，fallback 直连。请在「大模型配置」顶部设置全局代理 URL");
    return undefined;
  }
  return trimmed;
}

export function createAnthropic(cfg: ClientCfg): Anthropic {
  const proxy = resolveProxy(cfg);
  if (proxy) {
    return new Anthropic({
      apiKey: cfg.apiKey,
      baseURL: proxy,
      defaultHeaders: { "X-LLM-Target": cfg.baseURL || ANTHROPIC_DEFAULT_BASE },
      dangerouslyAllowBrowser: true,
    });
  }
  return new Anthropic({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL || undefined,
    dangerouslyAllowBrowser: true,
  });
}

export function createOpenAI(cfg: ClientCfg): OpenAI {
  const proxy = resolveProxy(cfg);
  if (proxy) {
    return new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: proxy,
      defaultHeaders: { "X-LLM-Target": cfg.baseURL || OPENAI_DEFAULT_BASE },
      dangerouslyAllowBrowser: true,
    });
  }
  return new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL || undefined,
    dangerouslyAllowBrowser: true,
  });
}
