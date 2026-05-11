# 华胥说 · LLM API 后端代理 Worker

> 浏览器调用 LLM API 时的可选反代层。解决 CORS 限制与稳定性问题（境内 LLM 厂商虽然 OPTIONS 多已开放，但实际请求中仍可能因 token 余额、限流策略、上下文超限、模型名错等"非 CORS"原因失败，且不同厂商表现差异大）。
>
> 同时支持百炼 Coding Plan 等明确不开 CORS 的子域服务。

## 工作原理

```
浏览器（编辑器）
   │  Authorization: Bearer <user-key>
   │  X-LLM-Target: https://api.moonshot.cn/v1
   ▼
Cloudflare Worker（本项目）
   │  剥离 X-LLM-Target，把请求 path 拼到目标 baseURL 上
   │  原 method / headers / body / stream 透传
   ▼
真实 LLM 服务（Anthropic / OpenAI 兼容厂商 / 百炼 Coding Plan ...）
```

- Worker 不持有任何 API key，token 由客户端 Authorization 头透传，Worker 不留存
- 流式响应（SSE）原样回写，对 deck 边生边渲无影响
- CORS 由 Worker 注入响应头解决

## 部署（5 分钟）

```bash
cd server/llm-proxy-worker
pnpm install            # 安装 wrangler

# 编辑 wrangler.toml：
#   - ALLOWED_ORIGIN 改为编辑器域名（默认 * 任意来源）
#   - ALLOWED_TARGETS（强烈推荐）填白名单避免被滥用

npx wrangler login      # 浏览器登录 Cloudflare
npx wrangler deploy     # 部署
```

部署成功后会得到 URL，例如：

```
https://hxs-llm-proxy.<你的子域>.workers.dev
```

## 在编辑器中启用

1. 打开「配置 → 模型」
2. 顶部「后端代理」展开 → 填上 Worker URL（不带尾斜杠） → 「测试连通」 → 自动保存
3. 新建 / 编辑模型配置时，「连接方式」段控件选「后端代理」即可

## 安全建议

### 1. 限制目标白名单（推荐）

避免被人当成通用 HTTP 代理消耗你的 CF 配额：

```toml
[vars]
ALLOWED_TARGETS = "api.anthropic.com,api.openai.com,api.moonshot.cn,open.bigmodel.cn,dashscope.aliyuncs.com,coding.dashscope.aliyuncs.com,api.deepseek.com,generativelanguage.googleapis.com,api.minimax.chat,api.xiaomimimo.com,api.hunyuan.cloud.tencent.com"
```

### 2. 限制来源（推荐）

```toml
[vars]
ALLOWED_ORIGIN = "https://your-editor-domain.com"
```

### 3. 配额

CF Workers 免费计划：100K 请求/天 + 10ms CPU/请求，对单人使用充裕。

## 大陆用户提示

`*.workers.dev` 子域在大陆部分 ISP（电信偶发、移动较多）会有 DNS 污染或 TCP 重置，访问不稳定。

**解决方案**（任选一种）：
- **绑自定义域名**（推荐 · 免费）：CF 控制台 → Workers & Pages → 你的 Worker → Settings → Triggers → Custom Domains → 添加你已经在 CF 托管的域名（如 `proxy.example.com`）。绑定后访问稳定。
- **改用国内云函数**：阿里云函数计算 / 腾讯云函数 / 华为云函数都支持 Node 环境，把 `worker.ts` 改写成 Express handler 即可（核心透传逻辑可复用）。

## 调试

```bash
npx wrangler tail       # 实时日志：[proxy] 200 POST api.deepseek.com 312ms
npx wrangler dev        # 本地起 Worker，用 http://localhost:8787 测试
```

## 协议细节

客户端 SDK（@anthropic-ai/sdk、openai-node）通过 `defaultHeaders` 注入 `X-LLM-Target`，Worker 收到后：

1. 解析 X-LLM-Target 为 URL（缺失或非法 URL → 400）
2. 校验 hostname 是否在 ALLOWED_TARGETS 内（不在 → 403）
3. 把请求 path 拼到 X-LLM-Target 后转发：
   - `https://worker.dev/messages` + `X-LLM-Target: https://api.anthropic.com`
   - → `https://api.anthropic.com/messages`
4. 透传 method / body / 与代理无关的 headers（剔除 Host / Origin / X-LLM-Target / CF-* / X-Forwarded-* / X-Real-*）
5. 透传响应 body（含 SSE）+ 注入 CORS 头

## 相关文件

- 客户端 SDK 工厂：`client/src/llm/clientFactory.ts`
- 客户端配置 UI：`client/src/editor/ProviderSettingsDialog.tsx`（FormView 连接方式段控件 + ListView ProxyUrlEditor）
