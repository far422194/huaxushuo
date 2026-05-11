// 华胥说 · Cloudflare Pages 一键直传中转 Worker
// 浏览器 → 本 Worker（同源 CORS 友好）→ Cloudflare Pages Direct Upload API
//
// 浏览器 POST 一个 zip blob 过来；Worker 解压 → 走 Pages Direct Upload 多步流程：
//   1. 拿一次性 jwt
//   2. 计算每个文件 hash（CF 用的 BLAKE3 / 实际是 SHA-256 + 自定义截断）
//   3. assets/check 询问哪些 hash 还没有
//   4. assets/upload 上传缺失的资源
//   5. 创建 manifest（path → hash 映射）
//   6. 创建 deployment 拿到部署 URL
//
// 凭证（CF_API_TOKEN）由 Worker 持有，浏览器看不到 → 安全
// 仅需 Pages:Edit 权限

import JSZip from "jszip";

interface Env {
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string; // 通过 wrangler secret 注入
  DEFAULT_PROJECT: string;
  ALLOWED_ORIGIN: string;
}

interface FileEntry {
  path: string;       // 相对路径（如 "index.html"、"assets/foo.js"）
  bytes: Uint8Array;  // 文件内容
  hash: string;       // 32 字符十六进制（CF 要求 BLAKE3-base16 截 32 char；下方实际用 sha-256 兼容）
  contentType: string;
}

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(allowedOrigin),
      });
    }

    if (req.method !== "POST") {
      return json({ error: "仅支持 POST 上传 zip" }, 405, allowedOrigin);
    }

    // 校验配置
    if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
      return json(
        {
          error:
            "Worker 未正确配置：请在 wrangler.toml [vars] 设 CF_ACCOUNT_ID，并 `wrangler secret put CF_API_TOKEN` 写入 API Token",
        },
        500,
        allowedOrigin,
      );
    }

    try {
      // 解析 multipart 或直接 zip body
      const url = new URL(req.url);
      const projectFromQuery = url.searchParams.get("project");
      const project = projectFromQuery || env.DEFAULT_PROJECT;
      if (!project) {
        return json(
          { error: "未指定 Pages 项目名：请在请求 query string 加 ?project=xxx 或在 Worker vars 设 DEFAULT_PROJECT" },
          400,
          allowedOrigin,
        );
      }

      const contentType = req.headers.get("content-type") || "";
      let zipBytes: ArrayBuffer;
      if (contentType.includes("multipart/form-data")) {
        const form = await req.formData();
        const file = form.get("zip");
        // workers-types 没有 File 全局；用 ducktyping 检查 arrayBuffer 方法
        if (!file || typeof (file as any).arrayBuffer !== "function") {
          return json({ error: "缺少 zip 字段（multipart 表单）" }, 400, allowedOrigin);
        }
        zipBytes = await (file as any).arrayBuffer();
      } else {
        // 浏览器直接 POST zip blob
        zipBytes = await req.arrayBuffer();
      }
      if (!zipBytes.byteLength) {
        return json({ error: "上传的 zip 为空" }, 400, allowedOrigin);
      }

      // 解压
      const files = await unzipAndHash(zipBytes);
      if (files.length === 0) {
        return json({ error: "zip 内无有效文件" }, 400, allowedOrigin);
      }

      // 走 Cloudflare Pages Direct Upload 流程
      const result = await deployToPages(env.CF_ACCOUNT_ID, env.CF_API_TOKEN, project, files);

      return json(
        {
          ok: true,
          project,
          deploymentId: result.deploymentId,
          url: result.url,
          aliases: result.aliases,
          fileCount: files.length,
        },
        200,
        allowedOrigin,
      );
    } catch (err: any) {
      const msg = err?.message || String(err);
      return json({ error: `部署失败：${msg}` }, 500, allowedOrigin);
    }
  },
};

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

// 解压 zip 并计算每个文件 hash（Pages 要求 32 字符十六进制）
async function unzipAndHash(zipBuffer: ArrayBuffer): Promise<FileEntry[]> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const files: FileEntry[] = [];
  const entries = Object.entries(zip.files);
  for (const [path, entry] of entries) {
    if (entry.dir) continue;
    // 部分平台下 README.md 等放在解压后顶部目录里（zip 的 path 本就是相对的）
    // CF Pages 要求路径不带前导 `/`
    const cleanPath = path.replace(/^\/+/, "");
    if (!cleanPath) continue;
    const bytes = await entry.async("uint8array");
    const hash = await computePageHash(bytes, cleanPath);
    files.push({
      path: cleanPath,
      bytes,
      hash,
      contentType: detectContentType(cleanPath),
    });
  }
  return files;
}

// CF Pages 文件 hash：BLAKE3-base16 截 32 字符（CF 内部）；社区已知 sha-256 截 32 也能通过校验
// 实测以 path 作 salt 的 sha-256 截前 32 字符兼容 Pages Direct Upload
async function computePageHash(bytes: Uint8Array, path: string): Promise<string> {
  const salt = new TextEncoder().encode(path + ":");
  const combined = new Uint8Array(salt.length + bytes.length);
  combined.set(salt, 0);
  combined.set(bytes, salt.length);
  const digest = await crypto.subtle.digest("SHA-256", combined);
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function detectContentType(path: string): string {
  const ext = (path.split(".").pop() || "").toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

interface DeployResult {
  deploymentId: string;
  url: string;
  aliases: string[];
}

async function deployToPages(
  accountId: string,
  token: string,
  project: string,
  files: FileEntry[],
): Promise<DeployResult> {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 1. 拿 jwt（用于 assets/check 与 assets/upload 鉴权）
  const jwtResp = await fetch(
    `${CF_API_BASE}/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}/upload-token`,
    { method: "GET", headers },
  );
  const jwtData = await jwtResp.json<{ success: boolean; result?: { jwt: string }; errors?: any[] }>();
  if (!jwtData.success || !jwtData.result?.jwt) {
    throw new Error(`获取 upload-token 失败：${JSON.stringify(jwtData.errors ?? jwtData)}`);
  }
  const jwt = jwtData.result.jwt;

  // 2. assets/check：询问哪些 hash 还需要上传
  const allHashes = files.map((f) => f.hash);
  const checkResp = await fetch(
    `https://api.cloudflare.com/client/v4/pages/assets/check-missing`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hashes: allHashes }),
    },
  );
  const checkData = await checkResp.json<{ success: boolean; result?: string[]; errors?: any[] }>();
  if (!checkData.success) {
    throw new Error(`assets/check-missing 失败：${JSON.stringify(checkData.errors ?? checkData)}`);
  }
  const missingHashes = new Set(checkData.result ?? allHashes);

  // 3. assets/upload：批量上传缺失资源（最多每批 5000 文件 / 100 MB）
  const toUpload = files.filter((f) => missingHashes.has(f.hash));
  if (toUpload.length > 0) {
    // 简化处理：单批上传（适合演示场景，单 deck zip 通常 <5MB / 几个文件）
    const payload = toUpload.map((f) => ({
      base64: true,
      key: f.hash,
      metadata: { contentType: f.contentType },
      value: bytesToBase64(f.bytes),
    }));
    const uploadResp = await fetch(`https://api.cloudflare.com/client/v4/pages/assets/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const uploadData = await uploadResp.json<{ success: boolean; errors?: any[] }>();
    if (!uploadData.success) {
      throw new Error(`assets/upload 失败：${JSON.stringify(uploadData.errors ?? uploadData)}`);
    }
  }

  // 4. 创建 deployment：multipart 表单含 manifest（path → hash）
  const manifest: Record<string, string> = {};
  for (const f of files) manifest[`/${f.path}`] = f.hash;

  const form = new FormData();
  form.append("manifest", JSON.stringify(manifest));

  const deployResp = await fetch(
    `${CF_API_BASE}/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}/deployments`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
  );
  const deployData = await deployResp.json<{
    success: boolean;
    result?: { id: string; url: string; aliases?: string[] };
    errors?: any[];
  }>();
  if (!deployData.success || !deployData.result) {
    throw new Error(`创建 deployment 失败：${JSON.stringify(deployData.errors ?? deployData)}`);
  }
  return {
    deploymentId: deployData.result.id,
    url: deployData.result.url,
    aliases: deployData.result.aliases ?? [],
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
