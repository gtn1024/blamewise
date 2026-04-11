import { execFile } from 'node:child_process'
import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export class BlamewiseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BlamewiseError'
  }
}

export interface ResolvedTarget {
  /** Absolute git repo root */
  repoRoot: string
  /** Pathspec relative to repo root (for git -- <pathspec>) */
  pathspec: string
}

/**
 * Resolve a user-provided path to its git repo root and a relative pathspec.
 *
 * Examples:
 *   "src/cli.ts"                → { repoRoot: "/my/repo", pathspec: "src/cli.ts" }
 *   "/other/repo"               → { repoRoot: "/other/repo", pathspec: "." }
 *   "/other/repo/src/main.ts"   → { repoRoot: "/other/repo", pathspec: "src/main.ts" }
 */
export async function resolveTarget(inputPath: string): Promise<ResolvedTarget> {
  const absPath = isAbsolute(inputPath) ? inputPath : resolve(process.cwd(), inputPath)

  // Find the git repo root from the given path
  const repoRoot = await findGitRepo(absPath)

  // Validate the path is inside the repo (catches symlinks, traversal)
  validatePathInsideRepo(absPath, repoRoot)

  // Compute pathspec relative to repo root
  const pathspec = relative(repoRoot, safeRealpath(absPath)) || '.'

  return { repoRoot, pathspec }
}

async function findGitRepo(path: string): Promise<string> {
  // Verify the path exists
  let gitCwd: string
  try {
    const st = statSync(path)
    if (st.isFile()) {
      // git commands need a directory; use the file's parent
      gitCwd = resolve(path, '..')
    }
    else if (st.isDirectory()) {
      gitCwd = path
    }
    else {
      throw new BlamewiseError(`Not a file or directory: ${path}`)
    }
  }
  catch (e) {
    if (e instanceof BlamewiseError)
      throw e
    throw new BlamewiseError(`Path does not exist: ${path}`)
  }

  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: gitCwd })
    return stdout.trim()
  }
  catch {
    throw new BlamewiseError(
      `Not a git repository: ${path}\nMake sure the path is inside a git repository.`,
    )
  }
}

export function validatePathInsideRepo(targetPath: string, repoRoot: string): void {
  const resolvedRepo = safeRealpath(repoRoot)
  const resolved = safeRealpath(targetPath)

  const rel = relative(resolvedRepo, resolved)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new BlamewiseError(`Path escapes repository boundary: ${targetPath}`)
  }
}

export function sanitizeGitOption(value: string, name: string): void {
  if (value.startsWith('-')) {
    throw new BlamewiseError(`Invalid value for --${name}: "${value}". Value must not start with '-'.`)
  }
}

function safeRealpath(p: string): string {
  try {
    return realpathSync(p)
  }
  catch {
    return resolve(p)
  }
}
