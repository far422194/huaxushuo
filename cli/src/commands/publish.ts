import { existsSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { findProjectRoot } from "../utils/run.js";
import { log } from "../utils/log.js";

export async function publish() {
  const root = findProjectRoot();
  if (!root) {
    log.error("当前目录不是华胥说项目(找不到 package.json)");
    process.exit(1);
  }

  const hasNetlify = existsSync(join(root, "netlify.toml"));
  const hasVercel = existsSync(join(root, "vercel.json"));
  const distExists = existsSync(join(root, "client", "dist")) || existsSync(join(root, "dist"));

  if (!distExists) {
    log.warn("尚未构建,先执行 " + pc.cyan("huaxushuo build"));
  }

  if (hasNetlify) {
    log.info("检测到 " + pc.cyan("netlify.toml") + ",请使用 Netlify CLI 发布:");
    log.step(pc.cyan("npx netlify deploy --prod --dir client/dist"));
    return;
  }
  if (hasVercel) {
    log.info("检测到 " + pc.cyan("vercel.json") + ",请使用 Vercel CLI 发布:");
    log.step(pc.cyan("npx vercel --prod"));
    return;
  }

  log.info("未检测到部署配置。可选发布方式:");
  log.step(
    "Netlify Drop(零配置,把 " +
      pc.cyan("client/dist/") +
      " 拖到 " +
      pc.cyan("https://app.netlify.com/drop") +
      ")"
  );
  log.step("GitHub Pages: 把 client/dist/ 内容推到 gh-pages 分支");
  log.step("任何静态托管(Vercel / Cloudflare Pages / 自托管 nginx)");
}
