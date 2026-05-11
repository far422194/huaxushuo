import type { Provider, ProviderId } from "../types";
import { anthropicProvider } from "./anthropic";
import { openaiCompatProvider } from "./openai";

export const PROVIDERS: Record<ProviderId, Provider> = {
  "anthropic": anthropicProvider,
  "openai-compat": openaiCompatProvider,
};

export function getProvider(id: ProviderId): Provider {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`未知 provider：${id}`);
  return p;
}
