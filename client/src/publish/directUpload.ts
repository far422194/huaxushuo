// 一键直传 Cloudflare：浏览器 → 自部署 Worker → CF Pages
// 上下文：先用 publish/exportZip.ts 拿到 zip blob，再调本函数发给 Worker

import i18next from "i18next";

export interface DirectUploadInput {
  workerUrl: string;        // 用户自部署的 Worker URL
  projectName: string;      // CF Pages 项目名
  zipBlob: Blob;
  // 上传进度（0-1，部分浏览器/CORS 场景可能拿不到，UI 兜底显示 indeterminate）
  onProgress?: (loaded: number, total: number) => void;
}

export interface DirectUploadResult {
  ok: boolean;
  url?: string;             // 部署 URL（成功时）
  aliases?: string[];
  deploymentId?: string;
  fileCount?: number;
  error?: string;
}

export async function directUploadToCloudflare(
  input: DirectUploadInput,
): Promise<DirectUploadResult> {
  if (!input.workerUrl.trim()) {
    return { ok: false, error: i18next.t("error:upload.noWorkerUrl") };
  }
  if (!input.projectName.trim()) {
    return { ok: false, error: i18next.t("error:upload.noProjectName") };
  }

  // 用 XHR 而不是 fetch：fetch 没有 upload progress 事件，XHR 有
  return new Promise((resolve) => {
    try {
      const url = new URL(input.workerUrl);
      url.searchParams.set("project", input.projectName);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", url.toString());
      xhr.setRequestHeader("Content-Type", "application/zip");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && input.onProgress) {
          input.onProgress(e.loaded, e.total);
        }
      };

      xhr.onload = () => {
        // 非 2xx：Cloudflare 网关错误（502/503/504）常返回纯文本如 "error code: 502"，
        // 早期版本直接 JSON.parse 抛 "Unexpected token..."，对用户极不友好。
        // 在 JSON.parse 之前先按 HTTP status 分流，给可读的网关错误提示
        if (xhr.status < 200 || xhr.status >= 300) {
          const head = xhr.responseText.slice(0, 200).trim();
          resolve({
            ok: false,
            error: i18next.t("error:upload.httpError", {
              status: xhr.status,
              head: head || "(empty)",
            }),
          });
          return;
        }
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.ok) {
            resolve({
              ok: true,
              url: data.url,
              aliases: data.aliases,
              deploymentId: data.deploymentId,
              fileCount: data.fileCount,
            });
          } else {
            resolve({ ok: false, error: data.error || `HTTP ${xhr.status}` });
          }
        } catch (err: any) {
          resolve({
            ok: false,
            error: i18next.t("error:upload.parseFailed", {
              message: err?.message ?? String(err),
              head: xhr.responseText.slice(0, 200),
            }),
          });
        }
      };

      xhr.onerror = () => {
        resolve({
          ok: false,
          error: i18next.t("error:upload.networkOrCors"),
        });
      };

      xhr.ontimeout = () => {
        resolve({ ok: false, error: i18next.t("error:upload.timeout") });
      };

      xhr.send(input.zipBlob);
    } catch (err: any) {
      resolve({
        ok: false,
        error: i18next.t("error:upload.buildFailed", { message: err?.message ?? String(err) }),
      });
    }
  });
}
