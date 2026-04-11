import { parseGitLog } from '../git/log'
import { git } from '../git/run'

export interface WhyResult {
  filePath: string
  commits: ReturnType<typeof parseGitLog>
}

export async function why(filePath: string, options?: { num?: number }): Promise<WhyResult> {
  const num = options?.num ?? 5

  const raw = await git(
    'log',
    `--format=%H|%an|%ae|%aI|%s`,
    '--no-merges',
    `-${num}`,
    '--',
    filePath,
  )

  if (!raw.trim()) {
    return { filePath, commits: [] }
  }

  const commits = parseGitLog(raw)
  return { filePath, commits }
}
