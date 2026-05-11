import { existsSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { intro, outro, text, confirm, isCancel, cancel, spinner } from "@clack/prompts";
import tiged from "tiged";
import pc from "picocolors";
import { log } from "../utils/log.js";
import { hasPnpm, installDeps } from "../utils/run.js";

const TEMPLATE_REPO = "far422194/huaxushuo";
const TEMPLATE_BRANCH = "main";

export interface InitOptions {
  template?: string;
  force?: boolean;
  install?: boolean;
}

export async function init(rawName: string | undefined, options: InitOptions = {}) {
  intro(pc.bold(pc.cyan("华胥说")) + pc.dim(" · 创建新项目"));

  let projectName = rawName?.trim();
  if (!projectName) {
    const answer = await text({
      message: "项目名称",
      placeholder: "huaxushuo",
      defaultValue: "huaxushuo",
      validate: (v) => (v && /^[a-z0-9-_]+$/i.test(v) ? undefined : "只允许字母/数字/-/_"),
    });
    if (isCancel(answer)) {
      cancel("已取消");
      process.exit(0);
    }
    projectName = (answer as string) || "huaxushuo";
  }

  const targetDir = resolve(process.cwd(), projectName);

  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    if (!options.force) {
      const overwrite = await confirm({
        message: `目录 ${pc.yellow(projectName)} 已存在且非空,继续会覆盖?`,
        initialValue: false,
      });
      if (isCancel(overwrite) || !overwrite) {
        cancel("已取消");
        process.exit(0);
      }
    }
  }

  const source = options.template || `${TEMPLATE_REPO}#${TEMPLATE_BRANCH}`;
  const s = spinner();
  s.start(`从 ${pc.cyan(source)} 克隆模板`);

  try {
    const emitter = tiged(source, {
      cache: false,
      force: true,
      verbose: false,
    });
    await emitter.clone(targetDir);
    s.stop("模板克隆完成");
  } catch (err) {
    s.stop(pc.red("克隆失败"));
    log.error(`无法克隆 ${source}`);
    if (err instanceof Error) {
      log.step(err.message);
    }
    process.exit(1);
  }

  await rewriteProjectName(targetDir, projectName);

  const installed = await maybeInstall(targetDir, options);

  outro(pc.green("项目已创建!"));

  log.info("下一步:");
  log.step(pc.cyan(`cd ${projectName}`));
  if (!installed) {
    log.step(pc.cyan("pnpm install"));
  }
  log.step(pc.cyan("pnpm dev") + pc.dim("    # 启动编辑器"));
  console.log("");
}

async function maybeInstall(targetDir: string, options: InitOptions): Promise<boolean> {
  if (options.install === false) return false;

  if (!hasPnpm()) {
    log.warn("未检测到 pnpm,跳过自动安装。可执行: " + pc.cyan("npm i -g pnpm"));
    return false;
  }

  console.log("");
  log.info("安装依赖中 (pnpm install)...");
  const code = await installDeps(targetDir);
  if (code !== 0) {
    log.warn("自动安装失败,请进入项目目录手动执行 pnpm install");
    return false;
  }
  log.success("依赖安装完成");
  return true;
}

async function rewriteProjectName(dir: string, name: string) {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return;
  try {
    const raw = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw);
    pkg.name = name;
    pkg.version = "0.0.0";
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  } catch {
    // 模板里的 package.json 不存在或不合法,跳过
  }
}
