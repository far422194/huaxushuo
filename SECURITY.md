# Security policy

[English](#english) · [简体中文](#简体中文)

---

## 简体中文

### 数据隐私模型

华胥说是**单机应用**：

- 所有敏感数据（LLM API key、Pexels API key、Cloudflare 部署 token、对话历史、deck 内容、表单提交记录、用户配置、风格 / Pattern / Skill 库）仅存浏览器 `localStorage`，**永远不会上传到本仓库维护者或任何第三方服务器**
- 浏览器直接调用：① 用户配置的 LLM 服务（按用户填的 baseURL）② Pexels API（如配置了 key）③ 用户自部署的 Cloudflare Worker（如配置了一键直传）—— 这些请求是用户与第三方服务的端到端关系，与本仓库维护者无关
- 仓库代码不带任何上报 / telemetry / 分析 hook

### 报告漏洞

如果你发现安全漏洞，请**不要直接开 public issue**。请通过以下任一方式私下报告：

1. **GitHub Private Vulnerability Reporting**（推荐）：进入仓库 Security 标签页 → Report a vulnerability
2. **邮件**：发送到 `<security@your-domain>`（占位符，仓库 owner 请替换为实际地址）

请在报告中包含：

- 漏洞类型（XSS / SSRF / 依赖项 CVE / 信息泄露 / 其他）
- 影响面（哪些数据可能被泄露 / 篡改 / 拒绝服务）
- 复现步骤（最小可复现样例）
- 建议修复方向（可选）

### 响应承诺

- **3 个工作日内**确认收到
- **14 天内**给出初步评估与修复时间表
- 漏洞修复发布后会在 [GitHub Advisories](https://github.com/your-org/huaxushuo/security/advisories) 公开披露

### 范围之外（Out of scope）

下列情形不视为本仓库的安全漏洞：

- 用户在自己机器上的 `localStorage` 被本机其他应用读取（这是浏览器 / 操作系统层职责）
- 用户主动把 deck zip 或 PDF 发给他人导致的内容外泄（用户自身处置数据的行为）
- 用户配置的第三方 LLM 服务、Pexels API、Cloudflare 等的安全问题（请向对应厂商报告）
- 用户自部署 Cloudflare Worker 的配置错误（如把 `ALLOWED_ORIGIN` 设为 `*` 但又把 token 暴露给了不可信来源）

### 安全加固建议（给用户）

- 不要在共享浏览器 / 公共电脑上配置 API key
- 自部署 Cloudflare Worker 时把 `ALLOWED_ORIGIN` 限定为你的编辑器域名（默认 `*` 仅适合个人本地用）
- Cloudflare API token 务必用最小权限（`Pages:Edit`），不要给 Account-level
- 定期清理浏览器 `localStorage` 中过期的对话历史与表单提交记录

---

## English

### Data privacy model

Huaxushuo is a **local-first** application:

- All sensitive data (LLM API keys, Pexels API key, Cloudflare deploy token, conversation history, deck content, form submissions, user config, style / pattern / skill library) lives in browser `localStorage` and is **never uploaded to this repository's maintainers or any third-party server**.
- The browser talks directly to: ① the LLM service you configured (per the baseURL you supplied) ② Pexels API (if you configured a key) ③ your self-hosted Cloudflare Worker (if you configured one-click upload) — these are end-to-end relationships between you and those third parties, not involving this repository's maintainers.
- The repository code carries no telemetry, analytics, or phone-home hooks.

### Reporting a vulnerability

If you discover a security vulnerability, **please do not open a public issue**. Report it privately via one of:

1. **GitHub Private Vulnerability Reporting** (preferred): repository Security tab → Report a vulnerability
2. **Email**: `<security@your-domain>` (placeholder; the repo owner should replace this)

Please include:

- Vulnerability type (XSS / SSRF / dependency CVE / information disclosure / other)
- Blast radius (what data could be leaked / tampered / DoS'd)
- Reproduction steps (minimal repro)
- Suggested fix direction (optional)

### Response commitment

- **Acknowledgement within 3 business days**
- **Initial assessment and remediation timeline within 14 days**
- Public disclosure via [GitHub Advisories](https://github.com/your-org/huaxushuo/security/advisories) after the fix ships

### Out of scope

The following are not considered vulnerabilities of this repository:

- A user's `localStorage` being read by another local app on their machine (browser / OS responsibility)
- Content leakage caused by a user voluntarily sending a deck zip or PDF to others (user's own data handling)
- Security issues in the third-party LLM services, Pexels API, Cloudflare, etc., that the user configured (report to those vendors)
- Misconfiguration of a self-hosted Cloudflare Worker (e.g. setting `ALLOWED_ORIGIN` to `*` while exposing the token to untrusted origins)

### Hardening recommendations (for users)

- Don't configure API keys on shared browsers / public computers
- When self-hosting the Cloudflare Worker, set `ALLOWED_ORIGIN` to your editor's domain (the default `*` is only for personal local use)
- Use minimum-privilege Cloudflare tokens (`Pages:Edit` only, never Account-level)
- Periodically clean up stale conversation history and form submissions from `localStorage`
