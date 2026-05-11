import { cac } from "cac";
import pc from "picocolors";
import { init } from "./commands/init.js";
import { dev } from "./commands/dev.js";
import { build } from "./commands/build.js";
import { publish } from "./commands/publish.js";

const VERSION = "0.1.0";
const cli = cac("huaxushuo");

cli
  .command("init [name]", "初始化新的华胥说项目")
  .option("-t, --template <source>", "自定义模板 (格式: user/repo[#branch])")
  .option("-f, --force", "目录已存在时强制覆盖")
  .option("--no-install", "跳过自动 pnpm install")
  .action(async (name: string | undefined, options) => {
    await init(name, options);
  });

cli.command("dev", "在当前项目目录启动开发服务器").action(async () => {
  await dev();
});

cli.command("build", "构建当前项目").action(async () => {
  await build();
});

cli.command("publish", "查看部署提示(根据项目配置)").action(async () => {
  await publish();
});

cli.help();
cli.version(VERSION);

const parsed = cli.parse(process.argv);

if (!parsed.args[0] && !parsed.options.help && !parsed.options.version) {
  console.log(pc.bold(pc.cyan("华胥说 CLI")) + pc.dim(` v${VERSION}`));
  cli.outputHelp();
}
