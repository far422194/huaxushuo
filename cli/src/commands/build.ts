import { findProjectRoot, runScript } from "../utils/run.js";
import { log } from "../utils/log.js";

export async function build() {
  const root = findProjectRoot();
  if (!root) {
    log.error("当前目录不是华胥说项目(找不到 package.json)");
    process.exit(1);
  }
  const code = await runScript("build", root);
  process.exit(code);
}
