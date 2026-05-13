import Anthropic from "@anthropic-ai/sdk";
import i18next from "i18next";
import type { Provider, GenerateRequest, AgentResult, ProgressEvent } from "../types";
import { processToolCall, buildUserMessage } from "../validate";
import { createSlideStreamParser } from "../streamParser";
import { createAnthropic } from "../clientFactory";
import { chooseMaxTokens } from "../maxTokens";

const MAX_ATTEMPTS = 2;

function isAbortError(err: any, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  const name = err?.name ?? "";
  if (name === "AbortError" || name === "APIUserAbortError") return true;
  if (err instanceof (Anthropic as any).APIUserAbortError) return true;
  return false;
}

function extractAnthropicDetail(err: any): string {
  const body = err?.error ?? err?.response?.data;
  if (!body) return "";
  if (typeof body === "string") return body;
  if (body.error?.message) return `${body.error.message}${body.error.type ? ` [type=${body.error.type}]` : ""}`;
  if (body.message) return body.message;
  try { return JSON.stringify(body).slice(0, 600); } catch { return ""; }
}

function formatAnthropicError(err: any): string {
  const name = err?.name ?? "";
  const msg = err?.message ?? String(err);
  const status = err?.status ?? err?.response?.status;
  const detail = extractAnthropicDetail(err);

  if (status === 401 || status === 403 || /unauthor|forbid|invalid.*key/i.test(msg)) {
    return i18next.t("error:anthropic.auth", { status: status ?? "401/403" });
  }
  if (status === 429 || /rate.?limit/i.test(msg)) {
    return i18next.t("error:anthropic.rateLimit");
  }
  if (status === 400) {
    return i18next.t("error:anthropic.badRequest", { detail: detail || msg });
  }
  if (name === "APIConnectionError" || /connection|fetch|network/i.test(msg)) {
    return i18next.t("error:anthropic.connection");
  }
  return i18next.t("error:anthropic.generic", {
    message: msg,
    statusSuffix: status ? ` (status ${status})` : "",
  });
}

export const anthropicProvider: Provider = {
  id: "anthropic",
  name: "Anthropic",

  async generate(req: GenerateRequest): Promise<AgentResult> {
    const { systemPrompt, tools, userMessage, currentDeck, contextDeck, config, onProgress, estimatedPages, signal, batchInfo } = req;

    if (signal?.aborted) return { cancelled: true };

    const client = createAnthropic(config);

    const anthropicTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as any,
    }));

    const messages: any[] = [
      { role: "user", content: buildUserMessage(userMessage, contextDeck ?? currentDeck) },
    ];

    let lastError: string | undefined;
    const estimate = estimatedPages ?? 5;
    const maxTokens = chooseMaxTokens({
      mode: config.maxTokensMode,
      override: config.maxOutputTokens,
      model: config.model,
      provider: "anthropic",
      estimate,
      batched: !!batchInfo,
    });

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (signal?.aborted) return { cancelled: true };
      onProgress?.({ kind: "connecting" });

      let resp: Anthropic.Message;
      try {
        if (attempt === 0 && onProgress) {
          // 首轮启用 streaming + 流式 slide 解析
          resp = await streamAndCollect(
            client,
            {
              model: config.model,
              max_tokens: maxTokens,
              system: [
                { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
              ] as any,
              tools: anthropicTools as any,
              tool_choice: { type: "any" } as any,  // 强制模型必须调用某个 tool（不允许只回 text）
              messages,
            },
            onProgress,
            estimate,
            signal
          );
        } else {
          resp = await client.messages.create(
            {
              model: config.model,
              max_tokens: maxTokens,
              system: [
                { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
              ] as any,
              tools: anthropicTools as any,
              tool_choice: { type: "any" } as any,  // 强制模型必须调用某个 tool（不允许只回 text）
              messages,
            },
            { signal }
          );
        }
      } catch (err: any) {
        if (isAbortError(err, signal)) return { cancelled: true };
        // 429 单独透传 rateLimited 标记给 agent 层做指数退避；与 formatAnthropicError L37 判定保持一致
        const status = err?.status ?? err?.response?.status;
        const msg = err?.message ?? String(err);
        const rateLimited = status === 429 || /rate.?limit/i.test(msg);
        return { error: formatAnthropicError(err), ...(rateLimited ? { rateLimited: true } : {}) };
      }

      if (signal?.aborted) return { cancelled: true };
      onProgress?.({ kind: "applying" });

      // 截断检测：被 max_tokens 截断时不进重试（重试结果一样会被截），直接给用户可操作的提示
      if (resp.stop_reason === "max_tokens") {
        const used = maxTokens;
        const isDefault = !config.maxOutputTokens || config.maxOutputTokens <= 0;
        return {
          error: isDefault
            ? i18next.t("error:agent.maxTokensDefault", { used })
            : i18next.t("error:agent.maxTokensCustom", { used }),
        };
      }

      const toolUse = resp.content.find((b: any) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        // 未调工具——回灌一条强约束消息让模型重试调工具，不直接报错
        const text = resp.content.find((b: any) => b.type === "text") as any;
        const snippet = text ? `（"${text.text.slice(0, 80)}…"）` : "";
        lastError = i18next.t("error:agent.modelOnlyText", { snippet });
        messages.push({ role: "assistant", content: resp.content });
        messages.push({
          role: "user",
          content: i18next.t("error:agent.noToolPushback"),
        });
        continue;
      }

      const outcome = processToolCall({
        toolName: toolUse.name,
        toolInput: toolUse.input,
        currentDeck,
      });

      if (outcome.deck) {
        const summaryText = resp.content.find((b: any) => b.type === "text") as any;
        return {
          deck: outcome.deck,
          source: outcome.source,
          summary: summaryText?.text || outcome.summary,
        };
      }

      lastError = outcome.error!;
      messages.push({ role: "assistant", content: resp.content });
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: i18next.t("error:agent.toolValidationFailed", { detail: lastError }),
            is_error: true,
          },
        ],
      });
    }

    return {
      error: i18next.t("error:agent.retryExhausted", {
        attempts: MAX_ATTEMPTS,
        detail: lastError,
      }),
    };
  },
};

// 用 streaming 拿响应：监听 contentBlockStart 拿工具名 → 发 tool 事件；
// inputJson delta 喂给 parser 提取完整 slide → 发 slide 事件；
// 同时保留旧的「按 layout 计数」page 兜底（patch 模式或 parser 未启用时显示进度）
async function streamAndCollect(
  client: Anthropic,
  args: any,
  onProgress: (e: ProgressEvent) => void,
  estimate: number,
  signal?: AbortSignal
): Promise<Anthropic.Message> {
  const stream = client.messages.stream(args, { signal });
  const parser = createSlideStreamParser();
  let partial = "";
  let thinkingChars = 0;       // 累计 extended thinking 输出字数（thinking_delta 流式事件）
  let lastReportedSlide = -1;
  let thinkingSent = false;

  const ensureThinking = () => {
    if (!thinkingSent) {
      thinkingSent = true;
      onProgress({ kind: "thinking" });
    }
  };

  stream.on("text", ensureThinking);

  let lastReceivingAt = 0;
  const RECEIVING_THROTTLE_MS = 100;

  // 监听 streamEvent：
  //   message_start → 模型已开始响应，立即从 connecting 切到 thinking（工具调用模式下不会触发 text 事件）
  //   content_block_start → tool_use 块的 name 在这里第一次可见
  //   content_block_delta + thinking_delta → extended thinking 推理内容流式输出（10 页 deck 可达 80s+）
  //     此阶段没有 tool/inputJson 事件，UI 文案恒为「模型已开始响应，等待数据…」让用户误以为卡死。
  //     累计 thinking 字数并 throttle 发 receiving 事件，UI 显示「接收数据中… N KB」给出活跃感。
  stream.on("streamEvent", (event) => {
    if (event.type === "message_start") {
      ensureThinking();
    } else if (event.type === "content_block_start") {
      ensureThinking();
      const cb = (event as any).content_block;
      if (cb?.type === "tool_use" && typeof cb.name === "string") {
        parser.setToolName(cb.name);
        if (cb.name === "create_deck" || cb.name === "patch_deck") {
          onProgress({ kind: "tool", name: cb.name });
        }
      }
    } else if (event.type === "content_block_delta") {
      const delta = (event as any).delta;
      if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
        thinkingChars += delta.thinking.length;
        const now = Date.now();
        if (now - lastReceivingAt >= RECEIVING_THROTTLE_MS) {
          lastReceivingAt = now;
          // 发 reasoning 事件（区别于 receiving）：UI 显示「推理中… N KB」
          // 切到 tool_use 阶段后 inputJson handler 接管，发 receiving 事件「生成中… N KB」
          onProgress({ kind: "reasoning", bytes: thinkingChars });
        }
      }
    }
  });

  stream.on("inputJson", (delta: string) => {
    ensureThinking();
    partial += delta;
    // throttle 发字节级接收指示
    const now = Date.now();
    if (now - lastReceivingAt >= RECEIVING_THROTTLE_MS) {
      lastReceivingAt = now;
      onProgress({ kind: "receiving", bytes: partial.length });
    }
    // 流式 slide 解析（仅 create_deck 启用）
    const newSlides = parser.feed(delta);
    for (const slide of newSlides) {
      const idx = parser.getEmittedCount() - newSlides.length + newSlides.indexOf(slide);
      onProgress({
        kind: "slide",
        index: idx,
        slide,
        total: Math.max(estimate, parser.getEmittedCount()),
      });
    }
    // 兜底进度：layout 计数（无论 create / patch 模式都启用）
    // 即使 parser 因 slide JSON 格式漂移导致 slide 事件不发，page 事件仍能让 UI 感知「已输出 N 页」
    // ChatPanel/Home 的 SlideGridProgress generated 取 max(streamingSlideCount, current) 双源驱动
    const matches = partial.match(/"layout"\s*:/g);
    const count = matches ? matches.length : 0;
    if (count > 0 && count - 1 !== lastReportedSlide) {
      lastReportedSlide = count - 1;
      onProgress({ kind: "page", current: count, estimate: Math.max(estimate, count) });
    }
  });

  return await stream.finalMessage();
}
