export interface AuthorStats {
  name: string
  email: string
  lines: number
  commits: number
  lastActive: number // unix timestamp
  score: number
}

export function computeScores(
  blameByAuthor: Map<string, { name: string, lines: number, lastActive: number }>,
  commitCountByAuthor: Map<string, number>,
): AuthorStats[] {
  const emails = new Set([...blameByAuthor.keys(), ...commitCountByAuthor.keys()])
  const results: AuthorStats[] = []

  const rawScores: { email: string, name: string, lines: number, commits: number, lastActive: number }[] = []

  for (const email of emails) {
    const blame = blameByAuthor.get(email) ?? { name: email, lines: 0, lastActive: 0 }
    const commits = commitCountByAuthor.get(email) ?? 0
    rawScores.push({ email, name: blame.name, lines: blame.lines, commits, lastActive: blame.lastActive })
  }

  const maxLines = Math.max(...rawScores.map(r => r.lines), 1)
  const maxCommits = Math.max(...rawScores.map(r => r.commits), 1)
  const maxRecency = Math.max(...rawScores.map(r => r.lastActive), 1)

  for (const raw of rawScores) {
    const normLines = raw.lines / maxLines
    const normCommits = raw.commits / maxCommits
    const normRecency = maxRecency > 0 ? raw.lastActive / maxRecency : 0
    const score = 0.5 * normLines + 0.3 * normCommits + 0.2 * normRecency

    results.push({
      name: raw.name,
      email: raw.email,
      lines: raw.lines,
      commits: raw.commits,
      lastActive: raw.lastActive,
      score: Math.round(score * 100) / 100,
    })
  }

  return results.sort((a, b) => b.score - a.score)
}
