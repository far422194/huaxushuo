import type { ProviderId, ProviderConfig } from "./types";

const STORAGE_KEY = "hxs.llm.settings";

// 模型能力：
// - general    全能：文本 + 图像（主流多模态模型 Claude / GPT-4o / Gemini 等的默认归类，能力齐全推理也强）
// - text-only  仅文本推理（DeepSeek-V3、纯文本模型；输入侧不支持图片）
// - multimodal 全模态理解：文本 + 图像 + 视频 + 音频（如 Qwen-Omni / Gemini 2.5 视频版等）
// 启用按能力分槽：每能力一个启用配置；不同能力可同时启用不同模型
export type Capability = "general" | "text-only" | "multimodal";

export const CAPABILITY_LABELS: Record<Capability, string> = {
  general: "全能型",
  "text-only": "强推理",
  multimodal: "全模态",
};

export const CAPABILITY_DESCRIPTIONS: Record<Capability, string> = {
  general: "文本 + 图像识别。主流多模态模型（Claude / GPT-4o / Gemini）",
  "text-only": "纯文本推理。无法识别图片（DeepSeek-V3、纯文本模型）",
  multimodal: "文本 + 图像 + 视频 + 音频统一理解（Qwen-Omni 等）",
};

export const ALL_CAPABILITIES: Capability[] = ["general", "text-only", "multimodal"];

// 路由场景：决定 getActiveConfig 默认按哪个优先级数组查找当前可用模型
export type RoutingScenario = "general" | "image-recognition";

export const ROUTING_SCENARIO_LABELS: Record<RoutingScenario, string> = {
  "general": "普通生成",
  "image-recognition": "图片识别",
};

// 各场景的内置默认优先级；用户未自定义时使用
export const DEFAULT_ROUTING: Record<RoutingScenario, Capability[]> = {
  "general": ["general", "text-only", "multimodal"],
  "image-recognition": ["multimodal", "general", "text-only"],
};

// 单条具名模型配置（带别名 + provider 类型 + capability + provider 字段）。字段平铺，
// getActiveConfig 时投影出纯 ProviderConfig 给 provider 用，避免 id/name/createdAt 等元数据污染上游
export interface ModelConfig {
  id: string;
  name: string;             // 用户起的别名（如「我的 Mimo」）
  provider: ProviderId;     // anthropic | openai-compat
  capability: Capability;   // 模型能力档位（影响图片识别等场景的自动路由）
  apiKey: string;
  model: string;
  baseURL?: string;
  maxOutputTokens?: number;
  // max_tokens 决策模式：
  // - "auto"（默认）: maxOutputTokens 作为"模型输出上限 cap",系统按场景在 cap 内自动选
  // - "fixed": maxOutputTokens 作为"每次都用的固定值",与场景无关
  maxTokensMode?: "auto" | "fixed";
  // 该模型是否走后端代理（用户在表单内"连接方式"段控件选择的快照）
  // 配合 LlmSettings.proxyUrl 全局代理 URL；为 false 时直连
  useProxy?: boolean;
  createdAt: number;
}

export interface LlmSettings {
  // 按能力分槽启用：每能力同时只能启用 1 个，不同能力可同时启用不同模型
  activeIds: Partial<Record<Capability, string>>;
  configs: ModelConfig[];
  // 用户自定义的路由优先级：每个场景一个 Capability 顺序数组（含全部 3 个能力）
  // 未配置时使用 DEFAULT_ROUTING；持久化在 localStorage
  routing?: Partial<Record<RoutingScenario, Capability[]>>;
  // 后端代理 URL（自部署的 llm-proxy-worker）；ModelConfig.useProxy=true 的模型走这里转发
  proxyUrl?: string;
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  "anthropic": "Anthropic",
  "openai-compat": "OpenAI 兼容",
};

// 服务预设：表单态点击预设按钮快速填入 baseURL + model + capability + maxOutputTokens 推荐值
// maxOutputTokens 取「合理默认」而非「官方极限」：足以覆盖 30+ 页大 deck，避免顶满官方上限带来的延迟/费用波动
export interface PresetService {
  id: string;
  label: string;
  provider: ProviderId;
  capability: Capability;   // 默认能力档位，用户可在表单里改
  baseURL: string;
  model: string;
  maxOutputTokens?: number;
  hint?: string;
  // 浏览器是否能直连该服务（基于实际使用稳定性 + 是否需要特殊鉴权 + 用户实测）
  // true: 出现在「Web 直连」连接方式的预设网格中
  // false: 仅在「后端代理」连接方式下可见（强制走 Worker 反代）
  webDirect: boolean;
}

export const PRESETS: PresetService[] = [
  // Web 直连白名单（webDirect: true）—— OpenAI / Anthropic / Gemini / Qwen / MiMo 用户实测可用
  { id: "anthropic", label: "Anthropic Claude", provider: "anthropic", capability: "general", baseURL: "", model: "claude-sonnet-4-6", maxOutputTokens: 32000, webDirect: true },
  { id: "openai", label: "OpenAI GPT", provider: "openai-compat", capability: "general", baseURL: "https://api.openai.com/v1", model: "gpt-5.5-pro", maxOutputTokens: 16384, webDirect: true },
  { id: "gemini", label: "Google Gemini", provider: "openai-compat", capability: "general", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3-flash-preview", maxOutputTokens: 32000, webDirect: true },
  { id: "qwen", label: "阿里巴巴 Qwen", provider: "openai-compat", capability: "general", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen3.6-plus", maxOutputTokens: 8192, webDirect: true },
  { id: "xiaomi-mimo", label: "小米 MiMo", provider: "openai-compat", capability: "multimodal", baseURL: "https://api.xiaomimimo.com/v1", model: "mimo-v2.5-pro", maxOutputTokens: 32000, webDirect: true },
  // 仅后端代理可见（webDirect: false）—— CORS 实测开放但稳定性/鉴权/限流偶发问题，强制走 Worker 反代
  { id: "deepseek", label: "DeepSeek", provider: "openai-compat", capability: "text-only", baseURL: "https://api.deepseek.com", model: "deepseek-v4-flash", maxOutputTokens: 8192, webDirect: false },
  { id: "zhipu", label: "智谱 GLM", provider: "openai-compat", capability: "general", baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "glm-5.1", maxOutputTokens: 8192, webDirect: false },
  { id: "moonshot", label: "月之暗面 Kimi", provider: "openai-compat", capability: "text-only", baseURL: "https://api.moonshot.cn/v1", model: "kimi-k2.6", maxOutputTokens: 8192, webDirect: false },
  { id: "minimax", label: "MiniMax", provider: "openai-compat", capability: "text-only", baseURL: "https://api.minimax.chat/v1", model: "minimax-m2.7", maxOutputTokens: 8192, webDirect: false },
];

export const DEFAULT_SETTINGS: LlmSettings = {
  activeIds: {},
  configs: [],
};

function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 12);
}

// 旧格式 v1：{ provider: ProviderId, configs: { anthropic?: ProviderConfig, "openai-compat"?: ProviderConfig } }
// 旧格式 v2：{ activeId?: string, configs: ModelConfig[] }（无 capability，无分槽启用）
// 新格式 v3：{ activeIds: Partial<Record<Capability, string>>, configs: ModelConfig[] }（含 capability + 按能力分槽）
function isLegacyV1(parsed: any): boolean {
  return parsed && typeof parsed === "object"
    && typeof parsed.provider === "string"
    && parsed.configs && typeof parsed.configs === "object" && !Array.isArray(parsed.configs);
}

function migrateLegacyV1(old: any): LlmSettings {
  const configs: ModelConfig[] = [];
  let activeId: string | undefined;
  for (const provider of ["anthropic", "openai-compat"] as ProviderId[]) {
    const cfg = old.configs?.[provider];
    if (!cfg || !cfg.apiKey || !cfg.model) continue;
    const id = genId();
    configs.push({
      id,
      name: `${PROVIDER_LABELS[provider]} · ${cfg.model}`,
      provider,
      capability: "general",
      apiKey: cfg.apiKey,
      model: cfg.model,
      baseURL: cfg.baseURL,
      maxOutputTokens: cfg.maxOutputTokens,
      createdAt: Date.now(),
    });
    if (provider === old.provider && !activeId) activeId = id;
  }
  return { activeIds: activeId ? { general: activeId } : {}, configs };
}

// 旧 activeId → activeIds.general；旧 ModelConfig 缺 capability 默认 general
function migrateLegacyV2(parsed: any): LlmSettings {
  const configs: ModelConfig[] = (parsed.configs as any[])
    .filter((c) => c && typeof c.id === "string")
    .map((c) => ({
      ...c,
      capability: ALL_CAPABILITIES.includes(c.capability) ? c.capability : ("general" as Capability),
    }));
  const activeIds: Partial<Record<Capability, string>> = {};
  if (typeof parsed.activeId === "string" && configs.some((c) => c.id === parsed.activeId)) {
    const cap = configs.find((c) => c.id === parsed.activeId)!.capability;
    activeIds[cap] = parsed.activeId;
  }
  return { activeIds, configs };
}

// 校验单个场景的优先级数组：必须是 3 个不重复的 Capability，否则视为无效（回退默认）
function isValidPriority(arr: any): arr is Capability[] {
  if (!Array.isArray(arr) || arr.length !== ALL_CAPABILITIES.length) return false;
  const set = new Set<string>();
  for (const c of arr) {
    if (!ALL_CAPABILITIES.includes(c)) return false;
    set.add(c);
  }
  return set.size === ALL_CAPABILITIES.length;
}

function sanitizeRouting(raw: any): Partial<Record<RoutingScenario, Capability[]>> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Partial<Record<RoutingScenario, Capability[]>> = {};
  for (const sc of ["general", "image-recognition"] as RoutingScenario[]) {
    if (isValidPriority(raw[sc])) out[sc] = raw[sc];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// 老数据无 useProxy 字段时按 baseURL 反推：匹配 PRESET 取 !webDirect 作为初值，不匹配默认 false（直连）
// 设计意图：老数据多数是直连场景（之前没有代理功能）；webDirect=false 的预设保守标 useProxy=true 让用户后续看到提示再切换
function inferUseProxyFromBaseURL(baseURL?: string): boolean {
  if (!baseURL) return false;
  const matched = PRESETS.find((p) => p.baseURL && p.baseURL === baseURL);
  if (!matched) return false;
  return !matched.webDirect;
}

export function loadSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { activeIds: {}, configs: [] };
    const parsed = JSON.parse(raw);

    // v1 → v3
    if (isLegacyV1(parsed)) {
      const migrated = migrateLegacyV1(parsed);
      saveSettings(migrated);
      return migrated;
    }

    // v2 / v3：统一走 v2 兼容路径（v3 数据 activeId 不存在，活躍槽不会丢）
    if (parsed && Array.isArray(parsed.configs)) {
      // v3 已经有 activeIds 直接用；否则按 v2 推导
      if (parsed.activeIds && typeof parsed.activeIds === "object" && !("activeId" in parsed)) {
        return {
          activeIds: parsed.activeIds as Partial<Record<Capability, string>>,
          configs: (parsed.configs as any[])
            .filter((c) => c && typeof c.id === "string")
            .map((c) => ({
              ...c,
              capability: ALL_CAPABILITIES.includes(c.capability) ? c.capability : ("general" as Capability),
              // 老数据无 useProxy：按 baseURL 反推 PRESET 的 webDirect；匹配不到默认 false（直连）
              useProxy: typeof c.useProxy === "boolean" ? c.useProxy : inferUseProxyFromBaseURL(c.baseURL),
              // 老数据无 maxTokensMode → 默认 "auto"（享受智能分配）；用户已填的固定值仍作为 cap
              maxTokensMode: c.maxTokensMode === "fixed" ? "fixed" : "auto",
            })),
          routing: sanitizeRouting(parsed.routing),
          proxyUrl: typeof parsed.proxyUrl === "string" ? parsed.proxyUrl : undefined,
        };
      }
      const migrated = migrateLegacyV2(parsed);
      saveSettings(migrated);
      return migrated;
    }
  } catch {
    // 解析失败兜底
  }
  return { activeIds: {}, configs: [] };
}

export function saveSettings(s: LlmSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export function clearSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export interface ActiveConfig {
  provider: ProviderId;
  config: ProviderConfig;
}

// 拿当前激活的 provider + 配置；按 capability 优先级查找第一个有效的；缺 apiKey/model 跳过
// 入参支持：
//   - undefined：默认 "general" 场景
//   - 场景名（"general" | "image-recognition"）：用 settings.routing 自定义顺序，未配置则回退 DEFAULT_ROUTING
//   - Capability[] 数组：直接用该顺序（旧调用方兼容）
export function getActiveConfig(input?: RoutingScenario | Capability[]): ActiveConfig | null {
  const cfg = getActiveModelConfig(input);
  if (!cfg) return null;
  const settings = loadSettings();
  return {
    provider: cfg.provider,
    config: {
      apiKey: cfg.apiKey,
      model: cfg.model,
      baseURL: cfg.baseURL,
      maxOutputTokens: cfg.maxOutputTokens,
      maxTokensMode: cfg.maxTokensMode ?? "auto",
      useProxy: cfg.useProxy,
      proxyUrl: settings.proxyUrl,
    },
  };
}

// 全局后端代理 URL 的读 / 写
export function getProxyUrl(): string | undefined {
  return loadSettings().proxyUrl;
}

export function setProxyUrl(url: string | undefined): void {
  const s = loadSettings();
  const trimmed = url?.trim();
  if (trimmed) s.proxyUrl = trimmed.replace(/\/+$/, "");
  else delete s.proxyUrl;
  saveSettings(s);
}

export function getRoutingPriority(scenario: RoutingScenario): Capability[] {
  const s = loadSettings();
  const custom = s.routing?.[scenario];
  if (custom && isValidPriority(custom)) return custom;
  return DEFAULT_ROUTING[scenario];
}

export function setRoutingPriority(scenario: RoutingScenario, order: Capability[]): void {
  if (!isValidPriority(order)) return;
  const s = loadSettings();
  s.routing = { ...(s.routing ?? {}), [scenario]: order };
  saveSettings(s);
}

export function resetRoutingPriority(scenario: RoutingScenario): void {
  const s = loadSettings();
  if (!s.routing) return;
  const next = { ...s.routing };
  delete next[scenario];
  s.routing = Object.keys(next).length > 0 ? next : undefined;
  saveSettings(s);
}

// 给 UI 用：拿完整 ModelConfig（含 id/name/createdAt），用于显示别名徽章
export function getActiveModelConfig(input?: RoutingScenario | Capability[]): ModelConfig | null {
  const order: Capability[] = Array.isArray(input)
    ? input
    : input
      ? getRoutingPriority(input)
      : getRoutingPriority("general");
  const s = loadSettings();
  for (const cap of order) {
    const id = s.activeIds[cap];
    if (!id) continue;
    const cfg = s.configs.find((c) => c.id === id);
    if (cfg && cfg.apiKey && cfg.model) return cfg;
  }
  return null;
}

// 拿指定能力槽的当前启用 config（UI 显示「已启用为 X 能力」用）
export function getActiveModelConfigForCapability(cap: Capability): ModelConfig | null {
  const s = loadSettings();
  const id = s.activeIds[cap];
  if (!id) return null;
  return s.configs.find((c) => c.id === id) ?? null;
}

export function hasValidConfig(): boolean {
  return !!getActiveConfig();
}

// CRUD
export function addModelConfig(input: Omit<ModelConfig, "id" | "createdAt">): ModelConfig {
  const s = loadSettings();
  const config: ModelConfig = { ...input, id: genId(), createdAt: Date.now() };
  s.configs.push(config);
  // 该 capability 槽尚未启用任何模型 → 自动启用本配置；已启用的不覆盖（避免用户新建调试配置时把工作模型挤掉）
  if (!s.activeIds[config.capability]) {
    s.activeIds = { ...s.activeIds, [config.capability]: config.id };
  }
  saveSettings(s);
  return config;
}

export function updateModelConfig(
  id: string,
  patch: Partial<Omit<ModelConfig, "id" | "createdAt">>
): void {
  const s = loadSettings();
  const old = s.configs.find((c) => c.id === id);
  if (!old) return;
  const next = { ...old, ...patch };
  s.configs = s.configs.map((c) => (c.id === id ? next : c));
  // capability 改了：把它从旧槽撤下、转入新槽（如果旧槽指向它的话）；新槽没人启用则自动启用
  if (patch.capability && patch.capability !== old.capability) {
    const newActive: Partial<Record<Capability, string>> = { ...s.activeIds };
    if (newActive[old.capability] === id) delete newActive[old.capability];
    if (!newActive[next.capability]) newActive[next.capability] = id;
    s.activeIds = newActive;
  }
  saveSettings(s);
}

export function deleteModelConfig(id: string): void {
  const s = loadSettings();
  const cfg = s.configs.find((c) => c.id === id);
  s.configs = s.configs.filter((c) => c.id !== id);
  if (cfg) {
    const next: Partial<Record<Capability, string>> = { ...s.activeIds };
    if (next[cfg.capability] === id) delete next[cfg.capability];
    s.activeIds = next;
  }
  saveSettings(s);
}

// 启用：按该 config 的 capability 写入对应槽（同槽内之前的启用项被替换；其他槽不动）
export function setActiveModelConfig(id: string): void {
  const s = loadSettings();
  const cfg = s.configs.find((c) => c.id === id);
  if (!cfg) return;
  s.activeIds = { ...s.activeIds, [cfg.capability]: id };
  saveSettings(s);
}

// 停用：当且仅当该 config 当前正占用对应能力槽时，把它从槽里撤下（其他槽不动）
export function deactivateModelConfig(id: string): void {
  const s = loadSettings();
  const cfg = s.configs.find((c) => c.id === id);
  if (!cfg) return;
  if (s.activeIds[cfg.capability] !== id) return;
  const next: Partial<Record<Capability, string>> = { ...s.activeIds };
  delete next[cfg.capability];
  s.activeIds = next;
  saveSettings(s);
}

// 一键复制：基于现有 config 生成新条目；name 自动加「(副本)」后缀；新 id；自动启用规则同 add（仅当对应槽空时启用）
export function cloneModelConfig(id: string): ModelConfig | null {
  const s = loadSettings();
  const src = s.configs.find((c) => c.id === id);
  if (!src) return null;
  const baseName = src.name.replace(/\s*\(副本(?:\s*\d+)?\)\s*$/, "");
  // 已存在多个副本时递增编号，避免重名
  const existingNames = new Set(s.configs.map((c) => c.name));
  let suffix = 0;
  let name = `${baseName} (副本)`;
  while (existingNames.has(name)) {
    suffix += 1;
    name = `${baseName} (副本 ${suffix})`;
  }
  const cloned: ModelConfig = {
    ...src,
    id: genId(),
    name,
    createdAt: Date.now(),
  };
  s.configs.push(cloned);
  if (!s.activeIds[cloned.capability]) {
    s.activeIds = { ...s.activeIds, [cloned.capability]: cloned.id };
  }
  saveSettings(s);
  return cloned;
}
