import OpenAI from "openai";
import type { Provider, GenerateRequest, AgentResult, ProgressEvent } from "../types";
import { processToolCall, buildUserMessage } from "../validate";
import { createSlideStreamParser } from "../streamParser";
import { createOpenAI } from "../clientFactory";
import { chooseMaxTokens } from "../maxTokens";

const MAX_ATTEMPTS = 2;

// 把 assistant 消息塞回 messages 数组前的兜底规范化：
// 1. role 必须是 "assistant"（流式累积可能没带，部分严格服务因此 400）
// 2. 含 tool_calls 时 content 必须是 null（不能是 ""，否则 mimo 等服务拒绝）
// 3. 不带 tool_calls 时不应出现 tool_calls 字段（避免空数组 [] 被严格服务拒绝）
function normalizeAssistantMessage(msg: any): any {
  if (!msg || typeof msg !== "object") return msg;
  const hasToolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
  const out: any = { ...msg, role: "assistant" };
  if (hasToolCalls) {
    if (out.content === "" || out.content === undefined) out.content = null;
  } else if ("tool_calls" in out) {
    delete out.tool_calls;
  }
  return out;
}

function isAbortError(err: any, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  const name = err?.name ?? "";
  if (name === "AbortError" || name === "APIUserAbortError") return true;
  if (err instanceof (OpenAI as any).APIUserAbortError) return true;
  return false;
}

// 把 OpenAI SDK 错误映射为更具体的中文提示。
// "Connection error." 这种泛泛的消息常因浏览器 CORS 被拒，给出可操作的下一步，避免用户卡在不知道改什么的状态。
// 从 SDK error 对象里提炼服务端的真实错误说明：err.error 可能是 string 或 { error?: { message }, message, code }
function extractServerDetail(err: any): string {
  const body = err?.error ?? err?.response?.data;
  if (!body) return "";
  if (typeof body === "string") return body;
  // OpenAI 标准: { error: { message, code, type } }
  if (body.error?.message) return `${body.error.message}${body.error.code ? ` [code=${body.error.code}]` : ""}`;
  // 部分国产兼容服务直接顶层 message/code
  if (body.message) return `${body.message}${body.code ? ` [code=${body.code}]` : ""}`;
  // 兜底序列化（截断防过长）
  try { return JSON.stringify(body).slice(0, 600); } catch { return ""; }
}

function formatOpenAIError(err: any, baseURL?: string): string {
  const name = err?.name ?? "";
  const msg = err?.message ?? String(err);
  const status = err?.status ?? err?.response?.status;
  const detail = extractServerDetail(err);
  const host = (() => {
    try { return baseURL ? new URL(baseURL).host : ""; } catch { return ""; }
  })();

  // 鉴权类（401/403）
  if (status === 401 || status === 403 || /unauthor|forbid|invalid.*key/i.test(msg)) {
    return `鉴权失败（${status ?? "401/403"}）：API Key 可能错误、过期，或没有此模型的调用权限。请到「大模型设置」检查 API Key。`;
  }

  // 限流（429）
  if (status === 429 || /rate.?limit/i.test(msg)) {
    return `限流（429）：请求频率或并发超过服务商限制，等几秒重试。`;
  }

  // 参数错误（400）
  if (status === 400) {
    // detail 优先（往往含 "Range of max_tokens" / "context length exceeded" / "Invalid model name" 等关键信息）
    const reason = detail || msg;
    return `请求参数错误（400）：${reason}\n常见原因：模型名拼错、max_tokens 超过该模型上限、上下文超过模型窗口、不支持 tool_calls。`;
  }

  // 连接错误：浏览器看不到具体响应，可能是 DNS / CORS / 服务故障
  // 实测 9 个内置预设服务（Anthropic / OpenAI / Gemini / DeepSeek / GLM / Qwen / Kimi / MiniMax / MiMo）当前均已开放 CORS
  // 所以默认不再断言「就是 CORS」，让用户先看 Network 面板的真实状态码
  if (name === "APIConnectionError" || /connection|fetch|network/i.test(msg)) {
    return `连接失败（无法到达 ${host || "服务"}）。\n\n打开 F12 → Network 标签找 chat/completions 请求，看真实状态：\n• \`net::ERR_NAME_NOT_RESOLVED\` → baseURL 域名错误或 DNS 污染（核对域名拼写）\n• \`CORS error\` / \`net::ERR_FAILED\` 且响应缺 \`Access-Control-Allow-Origin\` → 跨域被拒\n• 4xx / 5xx → 服务端在响应，看响应体里的 message 字段\n\n常见真实原因：\n1. baseURL 域名拼写错误（如把 api.moonshot.cn 写成 api.kimi.com）\n2. VPN / 代理 / 防火墙拦截\n3. 服务商临时故障或限流\n4. 浏览器扩展（如某些隐私插件）拦截了请求\n\n确认是 CORS 问题时，可自部署 Cloudflare Worker / Nginx 反代，把 baseURL 指向你的反代地址。`;
  }

  // 其他兜底
  return `OpenAI 兼容 API 调用失败：${msg}${status ? ` (status ${status})` : ""}`;
}

export const openaiCompatProvider: Provider = {
  id: "openai-compat",
  name: "OpenAI 兼容",

  async generate(req: GenerateRequest): Promise<AgentResult> {
    const { systemPrompt, tools, userMessage, currentDeck, contextDeck, config, onProgress, estimatedPages, signal, batchInfo } = req;

    if (signal?.aborted) return { cancelled: true };

    const client = createOpenAI(config);

    const openaiTools = tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as any,
      },
    }));

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildUserMessage(userMessage, contextDeck ?? currentDeck) },
    ];

    let lastError: string | undefined;
    const estimate = estimatedPages ?? 5;
    // 当前 max_tokens：400 错误时自动减半重试（处理国产服务给的 "Param Incorrect" 实际是 max_tokens 超限的情况）
    let currentMaxTokens = chooseMaxTokens({
      mode: config.maxTokensMode,
      override: config.maxOutputTokens,
      model: config.model,
      provider: "openai-compat",
      estimate,
      batched: !!batchInfo,
    });
    let max400Retries = 2;  // 最多减半 2 次：8000 → 4000 → 2000

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (signal?.aborted) return { cancelled: true };
      onProgress?.({ kind: "connecting" });

      let choice: any;
      try {
        if (attempt === 0 && onProgress) {
          choice = await streamAndCollect(
            client,
            {
              model: config.model,
              messages,
              tools: openaiTools,
              tool_choice: "auto" as const,  // 国产兼容服务多不支持 "required"，用 auto + 未调工具自动重试兜底
              max_tokens: currentMaxTokens,
            },
            onProgress,
            estimate,
            signal
          );
        } else {
          const resp = await client.chat.completions.create(
            {
              model: config.model,
              messages,
              tools: openaiTools,
              tool_choice: "auto",
              max_tokens: currentMaxTokens,
            },
            { signal }
          );
          choice = resp.choices?.[0];
        }
      } catch (err: any) {
        if (isAbortError(err, signal)) return { cancelled: true };
        const status = err?.status ?? err?.response?.status;
        // 400 自动降 max_tokens 重试：很多国产服务返回的 "Param Incorrect" 实际是 max_tokens 超过该模型上限
        if (status === 400 && max400Retries > 0 && currentMaxTokens > 1500) {
          max400Retries--;
          const reduced = Math.floor(currentMaxTokens / 2);
          currentMaxTokens = reduced;
          onProgress?.({ kind: "connecting" });  // 提示重新建立连接
          attempt--;  // 不消耗 attempt 配额（这次是 API 错误而非校验失败）
          continue;
        }
        // 400 但已无法再降时，把请求规模信息附在错误后供用户排查
        if (status === 400) {
          const sysLen = systemPrompt.length;
          // messages 所有 content 的总字符数：含 system + user + 多轮重试累积的 assistant/tool/user-retry
          // 旧版只算末条 user，重试场景下会显示成 60 字符，掩盖真实规模
          const totalUserLen = messages.reduce((sum, m) => {
            const c = m?.content;
            if (typeof c === "string") return sum + c.length;
            if (Array.isArray(c)) return sum + c.reduce((s: number, b: any) => s + (typeof b?.text === "string" ? b.text.length : 0), 0);
            return sum;
          }, 0) - sysLen; // 减去 system 部分（也在 messages 里）只看 user/assistant/tool 累积
          const turnsHint = messages.length > 2 ? `（${messages.length} 条消息累积，含重试）` : "";
          const tokenHint = currentMaxTokens >= 32000
            ? `\n注：max_tokens=${currentMaxTokens} 偏高会挤压输入可用空间，建议改为 16000-32000`
            : "";
          const sizeHint = `\n\n[请求规模] system=${sysLen} 字符（约 ${Math.ceil(sysLen / 2.5)} token），user/assistant/tool=${totalUserLen} 字符${turnsHint}，max_tokens=${currentMaxTokens}（已尝试降到此值仍 400）。${tokenHint}\n建议：调小「最大输出 tokens」、或换一个上下文窗口更大的模型。`;
          return { error: formatOpenAIError(err, config.baseURL) + sizeHint };
        }
        return { error: formatOpenAIError(err, config.baseURL) };
      }

      if (signal?.aborted) return { cancelled: true };
      onProgress?.({ kind: "applying" });

      // 截断检测：finish_reason=length 表示输出被 max_tokens 上限截断，给用户可操作的提示
      if (choice?.finish_reason === "length") {
        const used = currentMaxTokens;
        const isDefault = !config.maxOutputTokens || config.maxOutputTokens <= 0;
        return {
          error: isDefault
            ? `输出超过默认上限被截断（当前 ${used}，已是默认 ceiling）。\n\n必须做以下之一：\n1. 在「大模型设置 → 最大输出 tokens」填写具体值（按所用服务：Kimi K2 / Qwen3 填 16000；GLM-4.5 / Gemini 2.5 / gpt-4o 填 16000-32000；DeepSeek 已是上限 8192 无法再调）\n2. 减少要求的页数 / 内容密度\n3. 用 DeepSeek 时大 deck 只能分批生成`
            : `输出被你设置的 max_tokens=${used} 截断。请进一步调高「最大输出 tokens」（如果所用模型支持），或减少页数。`,
        };
      }

      const toolCalls = choice?.message?.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        // 未调工具——回灌一条强约束消息让模型重试调工具，不直接报错
        const text = choice?.message?.content ?? "";
        lastError = `模型只回了文字未调用工具${text ? `（"${text.slice(0, 80)}…"）` : ""}`;
        messages.push(normalizeAssistantMessage(choice.message));
        messages.push({
          role: "user",
          content:
            "你刚才只输出了文字。请**直接调用 create_deck 或 patch_deck 工具**输出 deck.json，不要返回任何纯文字解释。",
        });
        continue;
      }

      const tc = toolCalls[0];
      if (!tc || tc.type !== "function") {
        return { error: "未识别的 tool_call 类型" };
      }

      let toolInput: any;
      try {
        toolInput = JSON.parse(tc.function.arguments || "{}");
      } catch (err: any) {
        lastError = `tool arguments JSON 解析失败：${err?.message ?? String(err)}`;
        messages.push(normalizeAssistantMessage(choice.message));
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: lastError,
        });
        continue;
      }

      const outcome = processToolCall({
        toolName: tc.function.name,
        toolInput,
        currentDeck,
      });

      if (outcome.deck) {
        return {
          deck: outcome.deck,
          source: outcome.source,
          summary: choice.message.content || outcome.summary,
        };
      }

      lastError = outcome.error!;
      messages.push(choice.message);
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: `工具调用结果未通过校验：\n${lastError}\n请按 JSON Schema 与约束修正后重新调用工具。`,
      });
    }

    return { error: `重试 ${MAX_ATTEMPTS} 次后仍失败：${lastError}` };
  },
};

// streaming：累积 tool_call arguments delta，喂给 parser 提取完整 slide。
// 同时拼装最终 choice 对象返回，与非流式分支兼容。
async function streamAndCollect(
  client: OpenAI,
  args: any,
  onProgress: (e: ProgressEvent) => void,
  estimate: number,
  signal?: AbortSignal
): Promise<any> {
  const stream: any = await client.chat.completions.create(
    { ...args, stream: true },
    { signal }
  );

  const parser = createSlideStreamParser();
  const argsByIndex: Record<number, string> = {};
  const toolCalls: Record<number, { id: string; type: "function"; function: { name: string; arguments: string } }> = {};
  let content = "";
  let lastReportedSlide = -1;
  let thinkingSent = false;
  let toolNameSent = false;
  let finishReason: string | null = null;

  const ensureThinking = () => {
    if (!thinkingSent) {
      thinkingSent = true;
      onProgress({ kind: "thinking" });
    }
  };

  let lastReceivingAt = 0;
  const RECEIVING_THROTTLE_MS = 100;
  let receivedBytes = 0;       // tool_calls.arguments 累计（deck 输出体积）
  let reasoningBytes = 0;      // reasoning_content / content / thinking 累计（推理体积，区别于 deck 输出）

  for await (const chunk of stream) {
    if (signal?.aborted) break;
    // 收到任意 chunk 即认为模型已开始响应，立即从 connecting 切到 thinking
    ensureThinking();
    const choice0 = chunk.choices?.[0];
    if (choice0?.finish_reason) finishReason = choice0.finish_reason;
    const delta = choice0?.delta;
    if (!delta) continue;

    if (typeof delta.content === "string" && delta.content.length > 0) {
      content += delta.content;
    }

    // 推理阶段流式可见：模型输出 reasoning_content（DeepSeek-R1 / GLM-4 thinking / Gemini thinking）
    // 或 content（先文字说明再 tool_calls）期间累积到 reasoningBytes，发 reasoning 事件。
    // 与 tool_calls.arguments 累计的 receivedBytes 分开，UI 能区分「推理中… N KB」vs「生成中… N KB」
    // 让用户判断：推理 200KB+ 可能模型 reasoning 失控，可考虑取消重换非 thinking 模型
    const reasoningChunk =
      (delta as any).reasoning_content ?? (delta as any).reasoning ?? (delta as any).thinking ?? "";
    const reasoningStr = typeof reasoningChunk === "string" ? reasoningChunk : "";
    const contentStr = typeof delta.content === "string" ? delta.content : "";
    if (reasoningStr.length > 0 || contentStr.length > 0) {
      reasoningBytes += reasoningStr.length + contentStr.length;
      const now = Date.now();
      if (now - lastReceivingAt >= RECEIVING_THROTTLE_MS) {
        lastReceivingAt = now;
        onProgress({ kind: "reasoning", bytes: reasoningBytes });
      }
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolCalls[idx]) {
          toolCalls[idx] = {
            id: tc.id ?? "",
            type: "function",
            function: { name: "", arguments: "" },
          };
        }
        if (tc.id) toolCalls[idx].id = tc.id;
        if (tc.function?.name) {
          toolCalls[idx].function.name = tc.function.name;
          if (idx === 0 && !toolNameSent) {
            toolNameSent = true;
            parser.setToolName(tc.function.name);
            if (tc.function.name === "create_deck" || tc.function.name === "patch_deck") {
              onProgress({ kind: "tool", name: tc.function.name });
            }
          }
        }
        if (tc.function?.arguments) {
          toolCalls[idx].function.arguments += tc.function.arguments;
          argsByIndex[idx] = (argsByIndex[idx] ?? "") + tc.function.arguments;

          if (idx === 0) {
            receivedBytes += tc.function.arguments.length;
            const now = Date.now();
            if (now - lastReceivingAt >= RECEIVING_THROTTLE_MS) {
              lastReceivingAt = now;
              onProgress({ kind: "receiving", bytes: receivedBytes });
            }
            const newSlides = parser.feed(tc.function.arguments);
            for (const slide of newSlides) {
              const sIdx = parser.getEmittedCount() - newSlides.length + newSlides.indexOf(slide);
              onProgress({
                kind: "slide",
                index: sIdx,
                slide,
                total: Math.max(estimate, parser.getEmittedCount()),
              });
            }
            // 兜底进度：layout 计数（任何模式都启用，作为 parser 失败的备援）
            // SlideGridProgress generated 取 max(streamingSlideCount, current) 双源驱动
            {
              const partial = argsByIndex[0]!;
              const matches = partial.match(/"layout"\s*:/g);
              const count = matches ? matches.length : 0;
              if (count > 0 && count - 1 !== lastReportedSlide) {
                lastReportedSlide = count - 1;
                onProgress({
                  kind: "page",
                  current: count,
                  estimate: Math.max(estimate, count),
                });
              }
            }
          }
        }
      }
    }
  }

  // 严格按 OpenAI ChatCompletionMessage 形态返回：role + content + tool_calls 缺一不可。
  // 缺 role 时部分严格服务（mimo 等）在重试请求里把这条消息塞回 messages 时直接 400 "Param Incorrect"。
  // 非流式分支 client.chat.completions.create 返回的 choice.message 自带 role，流式累积的需要这里手动补
  const collectedToolCalls = Object.values(toolCalls);
  return {
    finish_reason: finishReason,
    message: {
      role: "assistant" as const,
      content: collectedToolCalls.length > 0 && content === "" ? null : content,
      ...(collectedToolCalls.length > 0 ? { tool_calls: collectedToolCalls } : {}),
    },
  };
}
