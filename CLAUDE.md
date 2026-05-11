# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 开发规范

### 代码规范

- 最大行宽：100 字符
- 缩进使用 2 个空格
- 代码库中禁止使用表情符号
- 始终在部署前测试代码
- 优先考虑模块化代码而非巨文件
- 切勿提交 console.logs

### 命名规范

- **文件**：短横线命名法（kebab-case），例：user-controller.js
- **类**：大驼峰命名法（PascalCase），例：UserService
- **函数 / 变量**：小驼峰命名法（camelCase），例：getUserById
- **常量**：大写下划线命名法（UPPER_SNAKE_CASE），例：API_BASE_URL
- **数据库表**：下划线命名法（snake_case），例：user_accounts

### Git 工作流

- 分支命名：`feature/功能描述` 或 `fix/问题描述`
- 提交信息：遵循约定式提交规范
- 合并前必须提交拉取请求（PR）
- 所有 CI/CD 检查必须通过
- 至少需要 1 人审核通过

### 接口规范

- 仅使用 RESTful 接口
- 请求与响应格式为 JSON
- 正确使用 HTTP 状态码
- 接口版本化：`/api/v1/`
- 为所有接口编写文档并附带示例

### 数据库

- 架构变更使用迁移脚本管理
- 严禁硬编码数据库凭证
- 使用连接池
- 开发环境开启查询日志
- 需定期备份数据

### 部署

- 基于 Docker 部署
- 部署失败自动回滚
- 数据库迁移在部署前执行

## 常用命令

| 命令              | 用途               |
| :---------------- | :----------------- |
| `npm run dev`     | 启动开发服务器     |
| `npm test`        | 运行测试套件       |
| `npm run lint`    | 检查代码风格       |
| `npm run build`   | 生产环境构建       |
| `npm run migrate` | 执行数据库迁移脚本 |

## 开发构建命令

> 当前处于文档阶段，暂无构建命令。项目初始化后在此补充。

## 工作流约定

- 功能实现参考 `docs/PRD.md` 对应模块章节
- 设计决策历史查看 `SUMMARY.md`
- 功能新增/变更，一定支持多语言版本（接入i18n）
