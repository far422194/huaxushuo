// 华胥说 · LLM API 后端代理 Worker
// 浏览器（编辑器）→ 本 Worker（同源 CORS 友好）→ 真实 LLM 服务（Anthropic / OpenAI / Kimi / 智谱 / DashScope ...）
//
// 解决问题：境内多数 LLM 厂商虽然 OPTIONS preflight 已开 CORS，但实际使用时仍可能因
// token 余额、限流策略、上下文超限、模型名错等"非 CORS"原因失败，且不同厂商的稳定性差异很大；
// 同时部分场景（如百炼 Coding Plan 用的 coding.dashscope.aliyuncs.com 子域）确实未开 CORS。
//
// 协议约定：
//   客户端 SDK 把 baseURL 设成本 Worker URL，并在 default header 加 X-LLM-Target: <真实 baseURL>
//   Worker 收到 fetch 后：
//     1. 取出 X-LLM-Target，与请求的 path 拼成完整目标 URL
//     2. 透传 method / headers（剔除 Host / X-LLM-Target / CF-* 等）/ body
//     3. 透传响应（含流式 SSE）
//   不持有任何 token，token 由客户端 Authorization 头透传，Worker 不留存
//
// 安全：
//   - ALLOWED_ORIGIN 默认 *，生产建议改为编辑器域名
//   - ALLOWED_TARGETS 可选白名单（逗号分隔域名），未配置则不限制
//   - 不记录 body / token / 响应内容，仅 console.log 状态码与耗时（wrangler tail 实时查看）

interface Env {
  ALLOWED_ORIGIN?: string;
  ALLOWED_TARGETS?: string; // 逗号分隔，如 "api.anthropic.com,api.openai.com,api.moonshot.cn"
}

const HEADERS_TO_DROP = new Set([
  "host",
  "origin",
  "referer",
  "x-llm-target",
  "content-length", // fetch 自动重算
]);

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }

    // GET / 健康检查（让客户端 ProxyUrlEditor 测试连通性时确认是 hxs-llm-proxy）
    if (req.method === "GET" && new URL(req.url).pathname === "/") {
      return json(
        { ok: true, service: "hxs-llm-proxy", usage: "POST any LLM API request with X-LLM-Target header" },
        200,
        allowedOrigin,
      );
    }

    const target = req.headers.get("x-llm-target");
    if (!target) {
      return json({ error: "missing X-LLM-Target header" }, 400, allowedOrigin);
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(target);
    } catch {
      return json({ error: `invalid X-LLM-Target: ${target}` }, 400, allowedOrigin);
    }

    if (!isAllowedTarget(targetUrl.hostname, env.ALLOWED_TARGETS)) {
      return json({ error: `target host not in whitelist: ${targetUrl.hostname}` }, 403, allowedOrigin);
    }

    // 拼接最终目标 URL：把请求 path（除 worker 域名外）拼到 X-LLM-Target 上
    // 例：worker.dev/messages + X-LLM-Target=https://api.anthropic.com → https://api.anthropic.com/messages
    const reqUrl = new URL(req.url);
    const finalUrl = new URL(targetUrl.toString());
    finalUrl.pathname = joinPath(targetUrl.pathname, reqUrl.pathname);
    finalUrl.search = reqUrl.search;

    // 透传请求 headers（剔除控制类与 CF 注入的）
    const fwdHeaders = new Headers();
    req.headers.forEach((v, k) => {
      const lk = k.toLowerCase();
      if (HEADERS_TO_DROP.has(lk)) return;
      if (lk.startsWith("cf-")) return;
      if (lk.startsWith("x-real-")) return;
      if (lk.startsWith("x-forwarded-")) return;
      fwdHeaders.set(k, v);
    });

    const startedAt = Date.now();
    let upstream: Response;
    try {
      upstream = await fetch(finalUrl.toString(), {
        method: req.method,
        headers: fwdHeaders,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
        // @ts-expect-error - duplex 是 streaming body 必需的字段（CF Workers / undici 已支持但 d.ts 未补）
        duplex: "half",
        redirect: "follow",
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.log(`[proxy] FAIL ${req.method} ${finalUrl.host} ${Date.now() - startedAt}ms ${msg}`);
      return json({ error: `upstream fetch failed: ${msg}` }, 502, allowedOrigin);
    }

    console.log(`[proxy] ${upstream.status} ${req.method} ${finalUrl.host} ${Date.now() - startedAt}ms`);

    // 透传响应；保留 SSE / 流式 chunked
    const respHeaders = new Headers(upstream.headers);
    // 注入 CORS（覆盖 upstream 任何 ACAO，避免与本地编辑器域名冲突）
    respHeaders.set("Access-Control-Allow-Origin", allowedOrigin);
    respHeaders.set("Access-Control-Expose-Headers", "*");
    // 移除可能干扰的 hop-by-hop 头
    respHeaders.delete("transfer-encoding");

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    });
  },
};

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-LLM-Target, Anthropic-Version, Anthropic-Beta, anthropic-dangerous-direct-browser-access, x-api-key, x-stainless-arch, x-stainless-lang, x-stainless-os, x-stainless-package-version, x-stainless-runtime, x-stainless-runtime-version, x-stainless-retry-count, x-stainless-timeout, x-stainless-helper-method",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });
}

function isAllowedTarget(host: string, whitelist?: string): boolean {
  if (!whitelist || !whitelist.trim()) return true;
  const h = host.toLowerCase();
  const allowed = whitelist
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.some((a) => h === a || h.endsWith(`.${a}`));
}

// 拼路径：targetPath 可能是 "/v1" 或 ""，reqPath 类似 "/messages"
// 期望 "/v1/messages"；避免双斜杠也避免漏斜杠
function joinPath(targetPath: string, reqPath: string): string {
  const t = targetPath.replace(/\/+$/, "");
  const r = reqPath.startsWith("/") ? reqPath : `/${reqPath}`;
  return `${t}${r}` || "/";
}
