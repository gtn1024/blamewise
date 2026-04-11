Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## Constraints

The npm package is built with `--target node` and installed via `npm i -g`, so it runs on Node.js. Do NOT use Bun-specific APIs (`Bun.file()`, `Bun.serve()`, `bun:*` imports, etc.) in `src/`. Test files (`*.test.ts`) can use Bun APIs freely.

## Commands

- Lint: `bunx eslint .`
- Test: `bun test`
- Build binary: `bun build --compile src/cli.ts --outfile dist/blamewise`
- Build npm: `bun build src/cli.ts --outfile dist/blamewise.js --target node`

## Testing

```ts
import { expect, test } from 'bun:test'

test('hello world', () => {
  expect(1).toBe(1)
})
```

## Release

Push a `v*` tag to trigger the release workflow. It runs lint+test, builds binaries (linux/darwin/windows, x64/arm64) and an npm package, then publishes to GitHub Releases and npm.
