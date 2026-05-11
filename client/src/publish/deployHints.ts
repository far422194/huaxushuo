import type { Deck } from "@shared/dsl";

export interface DeployTarget {
  id: string;
  label: string;
  command: string;
  hint: string;
  docsUrl: string;
}

export function getDeployTargets(): DeployTarget[] {
  return [
    {
      id: "cloudflare",
      label: "Cloudflare Pages",
      command: "npx wrangler pages deploy . --project-name=my-deck",
      hint: "解压 zip 后在目录内运行；首次会引导登录 Cloudflare",
      docsUrl: "https://developers.cloudflare.com/pages/get-started/direct-upload/",
    },
    {
      id: "vercel",
      label: "Vercel",
      command: "npx vercel --prod",
      hint: "解压 zip 后在目录内运行；首次会引导登录 Vercel",
      docsUrl: "https://vercel.com/docs/cli",
    },
    {
      id: "netlify",
      label: "Netlify Drop（拖拽）",
      command: "（无需命令）",
      hint: "把解压后的整个文件夹拖到 https://app.netlify.com/drop 即可",
      docsUrl: "https://app.netlify.com/drop",
    },
    {
      id: "surge",
      label: "Surge.sh",
      command: "npx surge .",
      hint: "解压 zip 后在目录内运行；首次需注册免费账号",
      docsUrl: "https://surge.sh/help/getting-started-with-surge",
    },
  ];
}

export function generateReadme(deck: Deck): string {
  const targets = getDeployTargets();
  const title = deck.meta.title || "演示";
  const lines = [
    `# ${title}`,
    "",
    "由「华胥说」生成的可交互演示站点。",
    "",
    "## 本地预览",
    "",
    "解压后，用任意静态服务器打开本目录即可：",
    "",
    "```bash",
    "npx serve .",
    "# 或者",
    "python3 -m http.server 8000",
    "```",
    "",
    "## 一键部署到公网",
    "",
    "在解压后的目录内，选一个平台运行对应命令拿到公网链接：",
    "",
  ];
  for (const t of targets) {
    lines.push(`### ${t.label}`, "", "```bash", t.command, "```", "", t.hint, "", `文档：${t.docsUrl}`, "");
  }
  lines.push(
    "## 修改内容",
    "",
    "本站点是单页静态产物，所有数据（含每页内容、主题、交互动作）打包在 `index.html` 中的 `<script id=\"deck-data\">` 节点里。",
    "如需修改，请回到「华胥说」编辑器调整 deck，然后重新发布。",
    ""
  );
  return lines.join("\n");
}
