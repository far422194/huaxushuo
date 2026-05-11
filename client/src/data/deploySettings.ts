// 一键直传 Cloudflare 配置：localStorage 存 Worker URL + 默认项目名
// 用户首次使用时填一次，之后保留

export interface DeploySettings {
  // 用户自部署的 Worker URL（如 https://hxs-deploy.xxx.workers.dev）
  workerUrl: string;
  // 默认 Pages 项目名（Worker 端也有 DEFAULT_PROJECT，可在请求 query 覆盖）
  projectName: string;
}

const STORAGE_KEY = "hxs.deploy_settings";

const DEFAULTS: DeploySettings = {
  workerUrl: "",
  projectName: "",
};

export function loadDeploySettings(): DeploySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      workerUrl: typeof parsed.workerUrl === "string" ? parsed.workerUrl : "",
      projectName: typeof parsed.projectName === "string" ? parsed.projectName : "",
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveDeploySettings(s: Partial<DeploySettings>): void {
  const current = loadDeploySettings();
  const next: DeploySettings = { ...current, ...s };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota
  }
}

export function isDeployConfigured(): boolean {
  const s = loadDeploySettings();
  return !!s.workerUrl.trim() && !!s.projectName.trim();
}
