import { parseBlamePorcelain } from '../git/blame'
import { git } from '../git/run'
import { renderWhoKnows } from '../render'
import { computeScores } from '../scoring'

export async function whoKnows(filePath: string, options?: { num?: number }) {
  const num = options?.num ?? 10

  const raw = await git('blame', '--porcelain', '--', filePath)
  const { commits, lines } = parseBlamePorcelain(raw)

  // Aggregate blame by author email
  const byAuthor = new Map<string, { name: string, lines: number, lastActive: number }>()
  for (const line of lines) {
    const commit = commits.get(line.sha)
    if (!commit)
      continue
    const existing = byAuthor.get(commit.authorMail)
    if (existing) {
      existing.lines++
      if (commit.authorTime > existing.lastActive) {
        existing.lastActive = commit.authorTime
      }
    }
    else {
      byAuthor.set(commit.authorMail, {
        name: commit.author,
        lines: 1,
        lastActive: commit.authorTime,
      })
    }
  }

  // Commit frequency from git log
  const commitCounts = new Map<string, number>()
  try {
    const logRaw = await git('log', '--format=%ae', '--no-merges', '--', filePath)
    for (const email of logRaw.split('\n').filter(Boolean)) {
      commitCounts.set(email, (commitCounts.get(email) ?? 0) + 1)
    }
  }
  catch {
    // If git log fails, just use blame data
  }

  const stats = computeScores(byAuthor, commitCounts).slice(0, num)
  console.log(renderWhoKnows(filePath, lines.length, stats))
}
