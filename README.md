# blamewise

[中文](./README-zh.md) | English

A CLI tool that helps new team members understand code ownership and change history using local git data. Zero cloud dependencies, fully private.

## Install

**npm:**

```bash
npm install -g blamewise
```

**Binary:**

Download the binary for your platform from [GitHub Releases](https://github.com/gtn1024/blamewise/releases).

## Usage

### Who knows this file?

Rank authors by expertise on a file (lines owned + commit frequency + recency):

```bash
blamewise who-knows <path>
blamewise who-knows src/index.ts -n 5
```

### Why did this file change?

Show recent commits with reasons for changes:

```bash
blamewise why <path>
blamewise why src/index.ts -n 10
```

### Which files change the most?

Identify files with the highest change frequency (commit count + author diversity):

```bash
blamewise churn <path>
blamewise churn src/ --since "6 months ago" -n 10
```

### Generate an onboarding report

Create a Markdown knowledge map for a project — module owners, high-churn files, stale files, and activity trends:

```bash
blamewise onboarding <path>
blamewise onboarding . --output report.md --since "3 months ago"
```

### JSON output

All commands support `--json` for machine-readable output:

```bash
blamewise who-knows src/index.ts --json
blamewise churn src/ --json | jq '.files[] | select(.churnScore > 0.7)'
```

`<path>` can be a relative path, an absolute path, or even a path into a different git repository — blamewise automatically detects the repo root.

```bash
blamewise who-knows src/index.ts -n 5
blamewise who-knows /other/repo/src/main.ts
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `-n, --num` | 10 (who-knows) / 5 (why) / 20 (churn) | Number of results to show |
| `--since <date>` | — | Start date for churn/onboarding (e.g. "6 months ago", "2025-01-01") |
| `--until <date>` | — | End date for churn |
| `--output <file>` | ONBOARDING.md | Output file path for onboarding |
| `--stale-threshold <duration>` | 6 months ago | Stale file threshold for onboarding |
| `--json` | — | Output as JSON (all commands) |

## Development

```bash
git clone https://github.com/gtn1024/blamewise.git
cd blamewise
bun install
bun test
bun run src/cli.ts --help
```

## License

[MIT](./LICENSE)
