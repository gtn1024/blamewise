# blamewise

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

### 哪些文件改动最频繁？

按变更频率和作者多样性找出热点文件：

```bash
blamewise churn <path>
blamewise churn src/ --since "6 months ago" -n 10
```

### 选项

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-n, --num` | 10 (who-knows) / 5 (why) / 20 (churn) | 显示结果数量 |
| `--since <date>` | — | 起始日期，如 "6 months ago"、"2025-01-01" |
| `--until <date>` | — | 截止日期 |

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
