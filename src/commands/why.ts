import { consola } from 'consola'
import { parseGitLog } from '../git/log'
import { git } from '../git/run'
import { renderWhy } from '../render'

export async function why(filePath: string, options?: { num?: number }) {
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
    consola.log(`No commits found for ${filePath}`)
    return
  }

  const entries = parseGitLog(raw)
  consola.log(renderWhy(filePath, entries))
}
