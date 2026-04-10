# blamewise

A CLI tool that helps new team members understand code ownership and change history using local git data. Zero cloud dependencies, fully private.

## Install

```bash
bun install
```

## Usage

### Who knows this file?

Rank authors by expertise on a file (lines owned + commit frequency + recency):

```bash
bun run src/cli.ts who-knows <path>
bun run src/cli.ts who-knows src/index.ts -n 5
```

### Why did this file change?

Show recent commits with reasons for changes:

```bash
bun run src/cli.ts why <path>
bun run src/cli.ts why src/index.ts -n 10
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `-n, --num` | 10 (who-knows) / 5 (why) | Number of results to show |

## Development

```bash
bun run src/cli.ts --help
bun test
```
