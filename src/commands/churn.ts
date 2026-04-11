import type { FileChurnStats } from '../scoring'
import { parseChurnLog } from '../git/churn'
import { git } from '../git/run'
import { computeChurnScores } from '../scoring'

export interface ChurnResult {
  path: string
  files: FileChurnStats[]
}

export async function churn(filePath: string, options?: {
  num?: number
  since?: string
  until?: string
}): Promise<ChurnResult> {
  const num = options?.num ?? 20

  const args: string[] = [
    'log',
    '--format=AUTHOR:%ae',
    '--name-only',
    '--diff-filter=ACDMR',
  ]

  if (options?.since) {
    args.push(`--since=${options.since}`)
  }
  if (options?.until) {
    args.push(`--until=${options.until}`)
  }

  args.push('--', filePath)

  const raw = await git(...args)

  if (!raw.trim()) {
    return { path: filePath, files: [] }
  }

  const entries = parseChurnLog(raw)
  const files = computeChurnScores(entries).slice(0, num)
  return { path: filePath, files }
}
