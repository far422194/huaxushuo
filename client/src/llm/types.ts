import type { Deck, Slide } from "@shared/dsl";

export type ProviderId = "anthropic" | "openai-compat";
export type ToolName = "create_deck" | "patch_deck";

// 与 provider 解耦的工具定义（标准 JSON Schema parameters）
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// 单个 provider 的配置
export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  // 单次响应最大输出 tokens。配合 maxTokensMode 共同决定实际 max_tokens：
  // - auto（默认）：此值作为"模型输出上限 cap",系统在 cap 内按 estimate / 是否分批 自动选
  // - fixed：此值作为"每次都用的固定值",与场景无关（保持旧行为）
  // 未填时按 model name 推断厂商默认上限（见 maxTokens.ts inferModelOutputCap）
  maxOutputTokens?: number;
  maxTokensMode?: "auto" | "fixed";
  // 是否走后端代理（解决境内 LLM 厂商不开放 CORS 的限制）；为 true 且 proxyUrl 有值时由 clientFactory
  // 重写 baseURL=proxyUrl + 注入 X-LLM-Target 头让 Worker 知道真实目标
  useProxy?: boolean;
  // 当前激活的全局代理 URL（由 LlmSettings.proxyUrl 投影来）
  proxyUrl?: string;
}

// 分批模式下注入到每个进度事件，UI 据此显示「(批 X/Y)」前缀与全局进度条
export interface BatchInfo {
  current: number;     // 当前批次序号（1-based）
  total: number;       // 总批次数
  pageOffset: number;  // 此批开始前已生成的页数（用于全局进度公式）
  pageCount: number;   // 本批包含的页数（用于按批动态选 max_tokens）
  totalPages: number;  // 全部批次的总页数（= sum of 各 chunk.length）；UI 据此修正 estimate
  // 本批所处阶段的真实并发数：首批=1（同步建 baseline）；续接=min(MAX_CONCURRENT_BATCHES, totalBatches-1)
  // UI 用这个字段渲染"X 路并行"前缀，避免静态推导与实际请求数不符
  concurrency?: number;
}

// 单次 LLM 调用的 prompt 分段大小（字符数）
// agent 在调用 provider.generate 前发一次此事件，让 UI 实时显示本次 prompt 体积 + 分段
export interface PromptSegments {
  base: number;       // BASE_SYSTEM_PROMPT + CREATIVE_ADDONS + 输出语言 + 画幅约束（buildSystemPrompt 整体输出）
  skill: number;      // skill addon（注入到 user message 头部）
  style: number;      // 用户选中的 style instruction 段
  aspect: number;     // 末尾追加的 buildFixedAspectConstraint
  pages: number;      // explicit pages 约束
  userRaw: number;    // 用户原 message（不含 skill addon）
  skillName?: string; // 命中的 skill 名（用于 tooltip 显示）
}

// 流式生成进度事件
export type ProgressEvent = { batch?: BatchInfo } & (
  | { kind: "connecting" }
  | { kind: "thinking" }
  | { kind: "tool"; name: ToolName }                                  // 工具名一确认就发，agent 据此启动流式承载
  | { kind: "reasoning"; bytes: number }                              // 模型推理流（thinking_delta / reasoning_content），区别于 deck 输出
  | { kind: "receiving"; bytes: number }                              // 字节级接收指示（tool_calls.arguments / inputJson 流式，throttle 发出）
  | { kind: "page"; current: number; estimate: number }               // 兜底进度（按 layout 计数）
  | { kind: "slide"; index: number; slide: Slide; total: number }     // 单页流式落地（已通过 SlideSchema 单页校验）
  | { kind: "applying" }                                              // 收到完整结果，正在应用 patch / 校验
  | { kind: "prompt"; systemChars: number; userChars: number; segments: PromptSegments; maxTokens?: number }  // 本次/本批 prompt 体积 + 实际 max_tokens（智能/固定模式决策结果），UI 显示 chip + tooltip
);

export interface GenerateRequest {
  systemPrompt: string;
  tools: ToolDefinition[];
  userMessage: string;
  currentDeck?: Deck;
  // 仅用于拼装用户消息上下文（可传瘦身版）；未设则用 currentDeck
  contextDeck?: Deck;
  config: ProviderConfig;
  onProgress?: (e: ProgressEvent) => void;
  estimatedPages?: number;     // 用于进度比例
  signal?: AbortSignal;        // 中止信号
  // 在分批生成模式下由 agent 注入，让 max_tokens 决策可识别"每批小目标"场景
  batchInfo?: BatchInfo;
}

export interface AgentResult {
  deck?: Deck;
  summary?: string;
  source?: "create" | "patch";
  error?: string;
  // 部分成功（分批中途失败但已生成部分页）时设置；deck 同时存在
  warning?: string;
  cancelled?: boolean;         // 用户主动取消时为 true，可与 deck 同时存在（保留已生成部分）
  appliedToStore?: boolean;    // agent 已通过 commitStreamingDeck/cancelStreamingDeck 写入 store，UI 不要再 loadDeck
  // 429 限流标记：provider 识别到 status=429 / "rate limit" 时透传此字段；
  // agent 据此走指数退避重试，而不是走 runaway 兜底（错误地减半 max_tokens）
  rateLimited?: boolean;
}

export interface Provider {
  id: ProviderId;
  name: string;
  generate(req: GenerateRequest): Promise<AgentResult>;
}

// 给 provider 内部用的：解析 tool call 后调它处理
export interface ProcessedToolCall {
  result: AgentResult;
  // 当 result.error 非空时，是否进入回灌重试
  retryable: boolean;
}
