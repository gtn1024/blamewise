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

### Explain this file

Summarize a file's history — when it was created, activity status, key milestones, and contributors:

```bash
blamewise explain <path>
blamewise explain src/index.ts
```

### Which files change the most?

Identify files with the highest change frequency (commit count + author diversity):

```bash
blamewise churn <path>
blamewise churn src/ --since "6 months ago" -n 10
```

### Who should review this code?

Recommend the best reviewers for a file or set of changed files:

```bash
blamewise review <file> [files...]
blamewise review src/auth/middleware.ts
blamewise review $(git diff --name-only main...) -n 5
blamewise review src/cli.ts src/render.ts --inactive-threshold "3 months ago"
```

### Generate an onboarding report

Create a Markdown knowledge map for a project — module owners, high-churn files, stale files, and activity trends:

```bash
blamewise onboarding <path>
blamewise onboarding . --output report.md --since "3 months ago"
```

### Generate a setup checklist

Scan a project and generate an onboarding checklist with prerequisites, installation steps, dev commands, and common tasks:

```bash
blamewise setup <path>
blamewise setup . --output checklist.md
```

**Detected from:**

| Data | Sources |
|------|---------|
| Node.js version | `.nvmrc`, `.node-version`, `package.json` engines |
| Package manager | `bun.lockb` / `bun.lock` / `pnpm-lock.yaml` / `yarn.lock` / `package-lock.json` |
| Docker services | `docker-compose.yml` / `docker-compose.yaml` |
| Required env vars | `.env.example` / `.env.sample` / `.env.template` |
| Scripts (dev, build, test, lint, format, migrate) | `package.json` scripts |
| Contributing guide | `CONTRIBUTING.md` |

### JSON output

All commands support `--json` for machine-readable output:

```bash
blamewise who-knows src/index.ts --json
blamewise explain src/index.ts --json
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
| `-n, --num` | 10 (who-knows/review) / 5 (why) / 20 (churn) | Number of results to show |
| `--since <date>` | — | Start date for churn/onboarding (e.g. "6 months ago", "2025-01-01") |
| `--until <date>` | — | End date for churn |
| `--inactive-threshold <duration>` | 6 months ago | Filter out authors inactive since (review command) |
| `--output <file>` | ONBOARDING.md (onboarding) / SETUP.md (setup) | Output file path |
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
