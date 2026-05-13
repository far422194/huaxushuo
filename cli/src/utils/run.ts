import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "./log.js";

// 向上查找含 package.json 的目录 + 校验是华胥说项目
// 校验依据：① package.json name 为 huaxushuo（root）或 huaxushuo-client / @huaxushuo/cli 等命名空间
//           ② 或 workspaces / dependencies 含华胥说标识（兼容 monorepo 内 client 子目录）
//           ③ 或同目录下存在 client/ + shared/ + pnpm-workspace.yaml（项目骨架特征）
// 在任意 Node 项目里盲跑 huaxushuo dev / build 会执行别的 dev script，给用户带来惊吓
export function findProjectRoot(start = process.cwd()): string | null {
  let cur = start;
  while (true) {
    const pkgPath = join(cur, "package.json");
    if (existsSync(pkgPath) && isHuaxushuoProject(cur, pkgPath)) return cur;
    const parent = join(cur, "..");
    if (parent === cur) return null;
    cur = parent;
  }
}

function isHuaxushuoProject(dir: string, pkgPath: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const name: string = pkg.name ?? "";
    if (
      name === "huaxushuo" ||
      name === "huaxushuo-client" ||
      name.startsWith("@huaxushuo/")
    ) return true;
    // monorepo 根：含 client/ + shared/ 子目录是华胥说项目骨架特征
    if (existsSync(join(dir, "client")) && existsSync(join(dir, "shared"))) return true;
    return false;
  } catch {
    return false;
  }
}

export function runScript(script: string, cwd: string): Promise<number> {
  return new Promise((resolveP) => {
    const isWin = process.platform === "win32";
    const cmd = isWin ? "pnpm.cmd" : "pnpm";
    const child = spawn(cmd, ["run", script], {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => resolveP(code ?? 1));
    child.on("error", (err) => {
      log.error(`无法执行 pnpm: ${err.message}`);
      resolveP(1);
    });
  });
}

export function hasPnpm(): boolean {
  const isWin = process.platform === "win32";
  const cmd = isWin ? "pnpm.cmd" : "pnpm";
  const probe = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return probe.status === 0;
}

export function installDeps(cwd: string): Promise<number> {
  return new Promise((resolveP) => {
    const isWin = process.platform === "win32";
    const cmd = isWin ? "pnpm.cmd" : "pnpm";
    const child = spawn(cmd, ["install"], {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => resolveP(code ?? 1));
    child.on("error", () => resolveP(1));
  });
}
