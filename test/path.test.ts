import { execSync } from 'node:child_process'
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { BlamewiseError, resolveTarget, sanitizeGitOption } from '../src/utils/path'

const TMP = realpathSync(tmpdir())
const testRepo = resolve(TMP, `blamewise-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

beforeEach(() => {
  rmSync(testRepo, { recursive: true, force: true })
})

afterEach(() => {
  rmSync(testRepo, { recursive: true, force: true })
})

describe('resolveTarget', () => {
  test('resolves relative file path in current repo', async () => {
    const { repoRoot, pathspec } = await resolveTarget('src/cli.ts')
    expect(repoRoot).not.toContain('..')
    expect(pathspec).toBe('src/cli.ts')
  })

  test('resolves "." to repo root with pathspec "."', async () => {
    const { repoRoot, pathspec } = await resolveTarget('.')
    expect(repoRoot).not.toContain('..')
    expect(pathspec).toBe('.')
  })

  test('resolves absolute directory path to repo root', async () => {
    const repoDir = resolve(testRepo, 'my-repo')
    mkdirSync(repoDir, { recursive: true })
    writeFileSync(resolve(repoDir, 'hello.txt'), 'world')
    execSync('git init', { cwd: repoDir })
    execSync('git add -A && git commit -m init', { cwd: repoDir })

    const { repoRoot, pathspec } = await resolveTarget(repoDir)
    expect(repoRoot).toBe(repoDir)
    expect(pathspec).toBe('.')
  })

  test('resolves absolute file path inside a repo', async () => {
    const repoDir = resolve(testRepo, 'my-repo')
    mkdirSync(repoDir, { recursive: true })
    mkdirSync(resolve(repoDir, 'src'), { recursive: true })
    writeFileSync(resolve(repoDir, 'src', 'main.ts'), 'console.log(1)')
    execSync('git init', { cwd: repoDir })
    execSync('git add -A && git commit -m init', { cwd: repoDir })

    const { repoRoot, pathspec } = await resolveTarget(resolve(repoDir, 'src', 'main.ts'))
    expect(repoRoot).toBe(repoDir)
    expect(pathspec).toBe('src/main.ts')
  })

  test('throws on non-existent path', async () => {
    expect(resolveTarget('/nonexistent/path/to/nowhere')).rejects.toThrow(BlamewiseError)
  })

  test('throws on non-git directory', async () => {
    const dir = resolve(testRepo, 'not-a-repo')
    mkdirSync(dir, { recursive: true })
    expect(resolveTarget(dir)).rejects.toThrow(BlamewiseError)
  })

  test('throws on path traversal via symlink', async () => {
    const repoDir = resolve(testRepo, 'my-repo')
    mkdirSync(repoDir, { recursive: true })
    writeFileSync(resolve(repoDir, 'a.txt'), 'hello')
    execSync('git init', { cwd: repoDir })
    execSync('git add -A && git commit -m init', { cwd: repoDir })

    // Create a symlink inside the repo pointing outside
    const linkPath = resolve(repoDir, 'escape')
    try {
      execSync(`ln -s /etc "${linkPath}"`)
    }
    catch {
      // Skip on platforms where symlink creation fails
      return
    }

    expect(resolveTarget(resolve(linkPath, 'passwd'))).rejects.toThrow(BlamewiseError)
  })
})

describe('sanitizeGitOption', () => {
  test('allows "6 months ago"', () => {
    expect(() => sanitizeGitOption('6 months ago', 'since')).not.toThrow()
  })

  test('allows "2025-01-01"', () => {
    expect(() => sanitizeGitOption('2025-01-01', 'since')).not.toThrow()
  })

  test('allows "yesterday"', () => {
    expect(() => sanitizeGitOption('yesterday', 'since')).not.toThrow()
  })

  test('rejects "--evil"', () => {
    expect(() => sanitizeGitOption('--evil', 'since')).toThrow(BlamewiseError)
  })

  test('rejects "-n 10"', () => {
    expect(() => sanitizeGitOption('-n 10', 'since')).toThrow(BlamewiseError)
  })

  test('allows value containing dash in middle', () => {
    expect(() => sanitizeGitOption('2025-01-01', 'until')).not.toThrow()
  })
})
