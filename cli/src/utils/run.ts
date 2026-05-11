import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "./log.js";

export function findProjectRoot(start = process.cwd()): string | null {
  let cur = start;
  while (true) {
    if (existsSync(join(cur, "package.json"))) return cur;
    const parent = join(cur, "..");
    if (parent === cur) return null;
    cur = parent;
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
