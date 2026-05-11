import { loadSettings, type ModelConfig } from "./settings";
import { createAnthropic, createOpenAI } from "./clientFactory";

// 测试模型连通性：发最小 ping 请求（max_tokens=32，user="ping"），不带 tools
// 返回延迟与可读错误，让用户在保存前/启用前知道配置是否可用
export interface TestResult {
  ok: boolean;
  latencyMs: number;
  error?: string;     // 失败时的可读错误（含 CORS / 401 / 400 等具体类型）
  preview?: string;   // 成功时模型回复的前 60 字（让用户确认确实联通到了 LLM）
}

const TEST_MESSAGE = "Reply with the single word: pong";
const TEST_MAX_TOKENS = 32;

export async function testConnection(config: ModelConfig): Promise<TestResult> {
  const startedAt = Date.now();
  try {
    const text = config.provider === "anthropic"
      ? await pingAnthropic(config)
      : await pingOpenAICompat(config);
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      preview: text.slice(0, 60),
    };
  } catch (err: any) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: formatError(err, config),
    };
  }
}

async function pingAnthropic(config: ModelConfig): Promise<string> {
  const proxyUrl = loadSettings().proxyUrl;
  const client = createAnthropic({ ...config, proxyUrl });
  const resp = await client.messages.create({
    model: config.model,
    max_tokens: TEST_MAX_TOKENS,
    messages: [{ role: "user", content: TEST_MESSAGE }],
  });
  const block = resp.content.find((b: any) => b.type === "text") as any;
  return block?.text ?? "(无文字响应)";
}

async function pingOpenAICompat(config: ModelConfig): Promise<string> {
  const proxyUrl = loadSettings().proxyUrl;
  const client = createOpenAI({ ...config, proxyUrl });
  const resp = await client.chat.completions.create({
    model: config.model,
    max_tokens: TEST_MAX_TOKENS,
    messages: [{ role: "user", content: TEST_MESSAGE }],
  });
  return resp.choices?.[0]?.message?.content ?? "(无文字响应)";
}

function formatError(err: any, config: ModelConfig): string {
  const name = err?.name ?? "";
  const msg = err?.message ?? String(err);
  const status = err?.status ?? err?.response?.status;
  const host = (() => {
    try { return config.baseURL ? new URL(config.baseURL).host : ""; } catch { return ""; }
  })();

  if (status === 401 || status === 403 || /unauthor|forbid|invalid.*key/i.test(msg)) {
    return `鉴权失败（${status ?? "401/403"}）：API Key 错误或无此模型权限`;
  }
  if (status === 429 || /rate.?limit/i.test(msg)) {
    return "限流（429）：等几秒再试";
  }
  if (status === 400) {
    return `参数错误（400）：${msg.slice(0, 80)}`;
  }
  if (status === 404 || /model.*not.*found|invalid.*model/i.test(msg)) {
    return `模型不存在：检查模型名 \`${config.model}\` 是否拼写正确`;
  }
  if (name === "APIConnectionError" || /connection|fetch|network/i.test(msg)) {
    return host
      ? `连接失败（无法到达 ${host}），多半是浏览器跨域被拒`
      : "连接失败：可能是网络或 CORS 问题";
  }
  return msg.length > 100 ? msg.slice(0, 100) + "…" : msg;
}
