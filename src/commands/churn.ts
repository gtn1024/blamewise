import { consola } from 'consola'
import { parseChurnLog } from '../git/churn'
import { git } from '../git/run'
import { renderChurn } from '../render'
import { computeChurnScores } from '../scoring'

export async function churn(filePath: string, options?: {
  num?: number
  since?: string
  until?: string
}) {
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
    consola.log(`No commits found for ${filePath}`)
    return
  }

  const entries = parseChurnLog(raw)
  const stats = computeChurnScores(entries).slice(0, num)
  consola.log(renderChurn(filePath, stats))
}
