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

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `-n, --num` | 10 (who-knows) / 5 (why) | Number of results to show |

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
