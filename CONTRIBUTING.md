# Contributing to 华胥说

[English](#english) · [简体中文](#简体中文)

---

## 简体中文

感谢你考虑贡献！华胥说是「LLM 输出 DSL，运行时确定性渲染」的可交互演示生成器，欢迎社区一起推进。

### 入门

```bash
git clone <你 fork 的 URL>
cd huaxushuo/client
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck    # 改动前后都跑一次
```

进编辑器后到顶栏「配置 → 模型」加一个 LLM 配置（Anthropic 或任何 OpenAI 兼容服务），即可开始联调。

### 在动手前

- 重大功能（新 layout / 新 block / 新 provider / 新发布形态）请先开 issue 讨论范围与必要性
- 小改（bug fix / 文档错字 / 体验微调 / i18n 翻译补充）直接 PR 即可
- 项目对「过度工程」很谨慎：不要为假设性需求设计抽象、不要在 bug fix 里塞重构。一次 PR 做一件事

### 开发规范

代码风格：

- 最大行宽 100 字符；缩进 2 空格；代码内禁用 emoji
- 文件 `kebab-case`、类 `PascalCase`、函数/变量 `camelCase`、常量 `UPPER_SNAKE_CASE`
- 不提交 `console.log`；所有改动跑 `pnpm typecheck` 通过
- 注释只在 WHY 不显而易见时加（隐藏约束、特殊变通、易踩坑），WHAT 由命名表达

i18n：

- 任何用户可见文案都加 i18n（`client/src/i18n/locales/zh-CN/*.json` + `en/*.json`）
- 命名空间：`common` / `home` / `editor` / `dialog` / `chat` / `error` / `prompt-meta`
- 翻译 key 用 `domain.subkey`，与代码使用点分一致

DSL 改动（影响 schema / renderer / prompts）：

- `shared/dsl/schema.ts` 每改一处 schema，**必须**：① 4 份示例 deck 跑 `safeParse` 通过 ② `prompts.ts` DSL 速览同步 ③ 编辑器 InlineBlockEditor 字段表单同步
- 视觉变体走 `shared/dsl/utilities.ts` 白名单，运行时按白名单过滤；不引入裸 Tailwind passthrough（失控风险）
- 新 block 加到 `BlockSchema` 后还要：renderer/blocks/ 加渲染、editor/panels/InlineBlockEditor 加字段、prompts.ts DSL 速览补描述

### Git 工作流

- 分支名：`feature/<功能描述>` 或 `fix/<问题描述>`（kebab-case）
- 提交信息：遵循约定式提交（[Conventional Commits](https://www.conventionalcommits.org)）：
  ```
  feat(home): 顶栏「配置」聚合下拉
  fix(validate): coerceDeck 截断恢复扫到最后一个完整 slide
  docs(prd): §3.1 补图库系统节
  refactor(agent): skill 注入位置改到 user msg 头部
  ```
- 一次 PR 只做一件事；标题写清动机；body 描述「为什么 / 改了什么 / 影响面 / 怎么验证」
- 合并前要求 typecheck + 至少 1 人审核通过

### 提 PR 时的清单

- [ ] `pnpm typecheck` 通过
- [ ] 涉及用户可见文案 → zh-CN + en 两份 i18n key 都加了
- [ ] 涉及 DSL → 4 份示例 deck 仍能 `safeParse` 通过
- [ ] 涉及 prompts → 改动后跑过至少一次端到端生成验证（描述用什么模型 + 什么 prompt 验证的）
- [ ] 涉及 UI → 浏览器实际测过（说明手测的关键场景）
- [ ] 不在 fix 里塞重构、不在重构里塞功能

### 项目导航

- [`docs/PRD.md`](docs/PRD.md) — 完整功能范围、关键约束、决策记录、未尽事项；改功能前先看对应章节
- [`SUMMARY.md`](SUMMARY.md) — 按时间倒序的功能演进，了解某段历史决策可以查
- [`docs/DSL.md`](docs/DSL.md) — DSL schema 说明
- 复杂改动：`~/.claude/plans/` 下保留了若干 plan 文件（i18n、prompt 体系优化、prompt size 可视化等），可参考

### 行为准则

请保持友善、专业、对事不对人。reviewer 关注代码而非作者；作者收到反馈不要个人化。所有 issue / PR / discussion 中骚扰、人身攻击、歧视言论都不被接受。

### 许可

提交贡献即同意你的代码以本仓库的 [MIT License](LICENSE) 发布。

---

## English

Thanks for considering a contribution! Huaxushuo is an interactive deck generator built on the principle "LLM emits DSL, runtime renders deterministically." Community contributions are welcome.

### Getting started

```bash
git clone <your fork URL>
cd huaxushuo/client
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck    # before and after every change
```

Once the editor opens, click **Config → Model** and add an LLM configuration (Anthropic or any OpenAI-compatible service) to start.

### Before you code

- Major features (new layout / new block / new provider / new publish format) — please open an issue first to discuss scope and necessity.
- Small fixes (bug fix / typo / UX nudge / i18n translation) — go straight to a PR.
- The project is allergic to over-engineering: don't design abstractions for hypothetical needs; don't sneak refactors into bug fixes. One PR, one thing.

### Coding conventions

Style:

- Max line width 100; 2-space indent; no emoji in code
- Files `kebab-case`, classes `PascalCase`, functions/variables `camelCase`, constants `UPPER_SNAKE_CASE`
- No committed `console.log`s; every change must pass `pnpm typecheck`
- Comments only when the WHY is non-obvious (hidden constraint, workaround, gotcha). The WHAT should be expressed by naming.

i18n:

- Every user-visible string goes through i18n (`client/src/i18n/locales/zh-CN/*.json` + `en/*.json`)
- Namespaces: `common` / `home` / `editor` / `dialog` / `chat` / `error` / `prompt-meta`
- Keys use dot-separated `domain.subkey` consistent with how they're called

DSL changes (touching schema / renderer / prompts):

- For every `shared/dsl/schema.ts` change you **must**: ① 4 example decks still pass `safeParse` ② `prompts.ts` DSL summary kept in sync ③ `InlineBlockEditor` field form kept in sync
- Visual variants go through the whitelist in `shared/dsl/utilities.ts`, filtered at runtime — no raw Tailwind passthrough (loss-of-control risk)
- A new block requires: addition to `BlockSchema` + a renderer in `renderer/blocks/` + a field form in `editor/panels/InlineBlockEditor` + a DSL summary entry in `prompts.ts`

### Git workflow

- Branch name: `feature/<short>` or `fix/<short>` (kebab-case)
- Commit messages: follow [Conventional Commits](https://www.conventionalcommits.org):
  ```
  feat(home): aggregate "Config" dropdown in top bar
  fix(validate): coerceDeck recovers up to last complete slide on truncation
  docs(prd): add §3.1 image-library section
  refactor(agent): move skill injection to user message head
  ```
- One PR, one thing. State motivation in the title. In the body, cover: why / what changed / blast radius / how you verified.
- Merge requires typecheck pass + at least 1 reviewer approval.

### PR checklist

- [ ] `pnpm typecheck` passes
- [ ] User-visible strings → both zh-CN and en i18n keys added
- [ ] DSL touched → 4 example decks still `safeParse`
- [ ] Prompts touched → ran at least one end-to-end generation; note which model + prompt you tested with
- [ ] UI touched → manual browser test; describe the key scenarios you walked through
- [ ] No refactor smuggled inside a fix; no feature smuggled inside a refactor

### Navigating the codebase

- [`docs/PRD.md`](docs/PRD.md) (Chinese) — full feature scope, constraints, decisions, open work. Read the relevant section before changing a feature.
- [`SUMMARY.md`](SUMMARY.md) (Chinese) — chronological feature evolution; useful for digging into the history of a decision.
- [`docs/DSL.md`](docs/DSL.md) (Chinese) — DSL schema reference.
- Complex changes: `~/.claude/plans/` (developer-local) holds plan files (i18n, prompt-system tuning, prompt-size visualization, etc.) that may serve as historical references.

### Code of conduct

Be kind, professional, and substantive. Reviewers focus on code, not authors; authors don't take feedback personally. Harassment, personal attacks, and discriminatory language are not accepted in issues, PRs, or discussions.

### Licensing

By submitting a contribution you agree your code is released under the repository's [MIT License](LICENSE).
