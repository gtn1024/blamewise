# blamewise

> 追代码知其主，看变更明其因。

中文 | [English](./README.md)

一个帮助新团队成员理解代码归属和变更历史的 CLI 工具，基于本地 git 数据，零云端依赖，完全私有。

## 安装

**npm：**

```bash
npm install -g blamewise
```

**二进制文件：**

从 [GitHub Releases](https://github.com/gtn1024/blamewise/releases) 下载对应平台的二进制文件。

## 使用

### 谁最了解这个文件？

按文件专业度对作者排序（代码行数 + 提交频率 + 时效性）：

```bash
blamewise who-knows <path>
blamewise who-knows src/index.ts -n 5
```

### 这个文件为什么改了？

查看最近的提交及变更原因：

```bash
blamewise why <path>
blamewise why src/index.ts -n 10
```

### 解释这个文件

从 git 历史中总结一个文件——创建时间、活跃状态、关键里程碑和贡献者：

```bash
blamewise explain <path>
blamewise explain src/index.ts
```

### 哪些文件改动最频繁？

按变更频率和作者多样性找出热点文件：

```bash
blamewise churn <path>
blamewise churn src/ --since "6 months ago" -n 10
```

### 谁应该 review 这些代码？

为一个或多个文件推荐最佳代码审查人：

```bash
blamewise review <file> [files...]
blamewise review src/auth/middleware.ts
blamewise review $(git diff --name-only main...) -n 5
blamewise review src/cli.ts src/render.ts --inactive-threshold "3 months ago"
```

### 生成项目入职报告

生成 Markdown 格式的项目知识地图——模块负责人、高频变更文件、过时文件和活动趋势：

```bash
blamewise onboarding <path>
blamewise onboarding . --output report.md --since "3 months ago"
```

### 生成项目配置清单

扫描项目并生成入职配置清单，包含前置条件、安装步骤、开发命令和常用任务：

```bash
blamewise setup <path>
blamewise setup . --output checklist.md
```

**检测来源：**

| 数据 | 来源 |
|------|------|
| Node.js 版本 | `.nvmrc`、`.node-version`、`package.json` engines |
| 包管理器 | `bun.lockb` / `bun.lock` / `pnpm-lock.yaml` / `yarn.lock` / `package-lock.json` |
| Docker 服务 | `docker-compose.yml` / `docker-compose.yaml` |
| 必需的环境变量 | `.env.example` / `.env.sample` / `.env.template` |
| 脚本（dev、build、test、lint、format、migrate） | `package.json` scripts |
| 贡献指南 | `CONTRIBUTING.md` |

### JSON 输出

所有命令均支持 `--json` 以输出机器可读的 JSON 格式：

```bash
blamewise who-knows src/index.ts --json
blamewise explain src/index.ts --json
blamewise churn src/ --json | jq '.files[] | select(.churnScore > 0.7)'
```

`<path>` 可以是相对路径、绝对路径，甚至可以是其他 git 仓库中的路径——blamewise 会自动检测仓库根目录。

```bash
blamewise who-knows src/index.ts -n 5
blamewise who-knows /other/repo/src/main.ts
```

### 选项

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-n, --num` | 10 (who-knows/review) / 5 (why) / 20 (churn) | 显示结果数量 |
| `--since <date>` | — | 起始日期，如 "6 months ago"、"2025-01-01" |
| `--until <date>` | — | 截止日期 |
| `--inactive-threshold <duration>` | 6 months ago | 过滤不活跃作者（review 命令） |
| `--output <file>` | ONBOARDING.md (onboarding) / SETUP.md (setup) | 输出文件路径 |
| `--stale-threshold <duration>` | 6 months ago | onboarding 过时文件阈值 |
| `--json` | — | 以 JSON 格式输出（所有命令均支持） |

## 本地开发

```bash
git clone https://github.com/gtn1024/blamewise.git
cd blamewise
bun install
bun test
bun run src/cli.ts --help
```

## 许可证

[MIT](./LICENSE)
