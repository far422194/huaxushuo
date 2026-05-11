import { findProjectRoot, runScript } from "../utils/run.js";
import { log } from "../utils/log.js";

export async function dev() {
  const root = findProjectRoot();
  if (!root) {
    log.error("当前目录不是华胥说项目(找不到 package.json)");
    log.info("先用 `huaxushuo init <name>` 创建项目,再 `cd` 进去");
    process.exit(1);
  }
  const code = await runScript("dev", root);
  process.exit(code);
}
