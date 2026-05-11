# 华胥说 · Cloudflare Pages 一键直传 Worker

让浏览器**不暴露 API Token** 也能直传 zip 到 Cloudflare Pages。

```
浏览器（编辑器） → 本 Worker（你自己部署，同源 CORS 友好）→ Cloudflare Pages API
```

Worker 持有 `CF_API_TOKEN`（仅 Pages:Edit 权限，最小化），浏览器看不到，安全。

---

## 一次性部署（5 分钟）

### 1. 准备 Cloudflare 资源

- 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)
- 拿 **Account ID**（控制台右下角，32 位十六进制）
- 创建 **Pages 项目**（侧栏 Pages → Create project → Direct Upload → 项目名如 `my-deck`）
- 创建 **API Token**：My Profile → API Tokens → Create Token → Custom Token → Permissions = `Account · Cloudflare Pages · Edit`，Account Resources = 你的账号 → 创建后**复制 token，只会显示一次**

### 2. 编辑 wrangler.toml

```toml
[vars]
CF_ACCOUNT_ID = "你的 32 位 Account ID"
DEFAULT_PROJECT = "my-deck"  # Pages 项目名
ALLOWED_ORIGIN = "*"  # 生产建议改为编辑器域名，如 "https://your-app.com"
```

### 3. 安装 + 部署

```bash
cd server/cf-deploy-worker
pnpm install   # 或 npm install

# 写入 API Token 到 secret（不会进 wrangler.toml 文件）
npx wrangler secret put CF_API_TOKEN
# 粘贴你的 API Token 后回车

# 部署
npx wrangler deploy
```

部署成功后会拿到 Worker URL，形如：
```
https://hxs-deploy.your-subdomain.workers.dev
```

把这个 URL 填到编辑器的「发布」对话框「一键直传」配置里。

---

## 使用流程

1. 打开编辑器 → 发布 → 切换到「一键直传」标签
2. 首次填 Worker URL（即上面部署的 URL）+ 项目名（默认用 wrangler.toml 里的 DEFAULT_PROJECT）
3. 点「一键直传 Cloudflare Pages」
4. 浏览器把 zip POST 到 Worker → Worker 走 Cloudflare Pages 多步上传 → 返回部署 URL
5. 完成后显示部署 URL 可点击访问

---

## API 协议（Worker 接受）

```
POST /  (Worker 根路径)
?project=my-deck   (可选 query 覆盖 DEFAULT_PROJECT)
Content-Type: application/zip 或 multipart/form-data
Body: zip blob 或 multipart 含 zip 字段
```

成功响应：
```json
{
  "ok": true,
  "project": "my-deck",
  "deploymentId": "...",
  "url": "https://abc123.my-deck.pages.dev",
  "aliases": ["https://main.my-deck.pages.dev"],
  "fileCount": 4
}
```

失败响应：
```json
{ "error": "..." }
```

---

## 安全注意

- API Token 用 `wrangler secret` 管理，**绝不要写到 wrangler.toml 提交到 git**
- Token 权限设为 `Pages:Edit` 最小化（不要给 Account-level Admin）
- ALLOWED_ORIGIN 生产环境改为你的编辑器域名（不要用 `*`），防止他人把你的 Worker 当公共上传服务用
- 想要更严格：在 Worker 加入访问密钥（HTTP Header `X-Deploy-Key`）+ 客户端配套发送

---

## 故障排查

- **`assets/check-missing 失败`**：检查 API Token 是否含 Pages:Edit；项目名是否正确
- **`assets/upload 失败`**：可能 zip 内单文件 >25MB（Pages 上传单文件限制）；或文件总数 >5000
- **CORS 错误**：检查 `ALLOWED_ORIGIN` 是否含编辑器域名
- **`wrangler deploy` 失败**：先 `npx wrangler login`
