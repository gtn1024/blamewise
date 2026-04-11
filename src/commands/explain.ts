import { git } from '../git/run'

export interface ExplainContributor {
  name: string
  email: string
  commits: number
  active: boolean
}

export interface ExplainMilestone {
  date: string
  author: string
  subject: string
  added: number
  removed: number
  isRefactor: boolean
}

export interface ExplainResult {
  filePath: string
  created: { date: string, author: string, email: string, subject: string }
  lastChanged: { date: string, author: string, email: string, subject: string, relative: string }
  status: 'active' | 'stable' | 'stale'
  totalCommits: number
  currentLines: number
  contributors: ExplainContributor[]
  milestones: ExplainMilestone[]
}

interface CommitWithStats {
  sha: string
  author: string
  authorMail: string
  date: string
  subject: string
  added: number
  removed: number
}

/**
 * Parse git log output that combines --format with --numstat.
 *
 * Output looks like:
 *   H|an|ae|aI|s        ← format line
 *   added\tremoved\tfile ← numstat line (one per file)
 *   (empty line)
 *   H|an|ae|aI|s        ← next commit
 *   ...
 */
function parseLogWithNumstat(raw: string): CommitWithStats[] {
  const results: CommitWithStats[] = []
  const lines = raw.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line || !line.includes('|')) {
      i++
      continue
    }

    const parts = line.split('|')
    if (parts.length < 5) {
      i++
      continue
    }

    const sha = parts[0] ?? ''
    const author = parts[1] ?? ''
    const authorMail = parts[2] ?? ''
    const date = parts[3] ?? ''
    const subject = parts.slice(4).join('|')

    // Sum numstat lines that follow (skip blank lines between format and numstat)
    let added = 0
    let removed = 0
    i++
    while (i < lines.length) {
      const statLine = lines[i]
      // Blank line — skip (separator between format and numstat)
      if (!statLine) {
        i++
        continue
      }
      // Hit next commit format line — stop
      if (statLine.includes('|'))
        break
      const statParts = statLine.split('\t')
      if (statParts.length >= 2) {
        added += Number.parseInt(statParts[0] ?? '0', 10) || 0
        removed += Number.parseInt(statParts[1] ?? '0', 10) || 0
      }
      i++
    }

    results.push({ sha, author, authorMail, date, subject, added, removed })
  }

  return results
}

export async function explain(filePath: string): Promise<ExplainResult> {
  // 1. Get all commits with diff stats
  const logRaw = await git(
    'log',
    '--format=%H|%an|%ae|%aI|%s',
    '--numstat',
    '--no-merges',
    '--',
    filePath,
  )

  if (!logRaw.trim()) {
    throw new Error(`No git history found for ${filePath}`)
  }

  const commits = parseLogWithNumstat(logRaw)
  if (commits.length === 0) {
    throw new Error(`No git history found for ${filePath}`)
  }

  // 2. File creation — reverse log to get oldest, use --diff-filter=A
  let created: ExplainResult['created']
  try {
    const creationRaw = await git(
      'log',
      '--diff-filter=A',
      '--format=%an|%ae|%aI|%s',
      '-1',
      '--follow',
      '--',
      filePath,
    )
    if (creationRaw.trim()) {
      const parts = creationRaw.trim().split('|')
      created = {
        author: parts[0] ?? '',
        email: parts[1] ?? '',
        date: parts[2] ?? '',
        subject: parts.slice(3).join('|'),
      }
    }
    else {
      const oldest = commits[commits.length - 1]!
      created = {
        author: oldest.author,
        email: oldest.authorMail,
        date: oldest.date,
        subject: oldest.subject,
      }
    }
  }
  catch {
    const oldest = commits[commits.length - 1]!
    created = {
      author: oldest.author,
      email: oldest.authorMail,
      date: oldest.date,
      subject: oldest.subject,
    }
  }

  // 3. Last changed (most recent commit)
  const latest = commits[0]!
  const lastDateObj = new Date(latest.date)
  const lastUnix = Math.floor(lastDateObj.getTime() / 1000)
  const now = Math.floor(Date.now() / 1000)
  const daysSinceLast = Math.floor((now - lastUnix) / 86400)

  // 4. Activity status
  let status: ExplainResult['status']
  if (daysSinceLast < 30) {
    status = 'active'
  }
  else if (daysSinceLast < 180) {
    status = 'stable'
  }
  else {
    status = 'stale'
  }

  // 5. Current line count
  let currentLines = 0
  try {
    const content = await git('show', `HEAD:${filePath}`)
    currentLines = content.split('\n').length
  }
  catch {
    // Binary file or similar — leave at 0
  }

  // 6. Contributors
  const contributorMap = new Map<string, { name: string, commits: number, lastActive: number }>()
  for (const c of commits) {
    const existing = contributorMap.get(c.authorMail)
    if (existing) {
      existing.commits++
      const cTime = Math.floor(new Date(c.date).getTime() / 1000)
      if (cTime > existing.lastActive) {
        existing.lastActive = cTime
      }
    }
    else {
      contributorMap.set(c.authorMail, {
        name: c.author,
        commits: 1,
        lastActive: Math.floor(new Date(c.date).getTime() / 1000),
      })
    }
  }

  const ninetyDaysAgo = now - 90 * 86400
  const contributors: ExplainContributor[] = [...contributorMap.entries()]
    .map(([email, data]) => ({
      name: data.name,
      email,
      commits: data.commits,
      active: data.lastActive >= ninetyDaysAgo,
    }))
    .sort((a, b) => b.commits - a.commits)

  // 7. Milestones — top 5 by total lines changed
  const milestones: ExplainMilestone[] = [...commits]
    .sort((a, b) => (b.added + b.removed) - (a.added + a.removed))
    .slice(0, 5)
    .map((c) => {
      const totalChanged = c.added + c.removed
      const isRefactor = currentLines > 0 && totalChanged / currentLines > 0.3
      return {
        date: c.date.slice(0, 10),
        author: c.author,
        subject: c.subject,
        added: c.added,
        removed: c.removed,
        isRefactor,
      }
    })

  return {
    filePath,
    created,
    lastChanged: {
      date: latest.date,
      author: latest.author,
      email: latest.authorMail,
      subject: latest.subject,
      relative: formatRelativeSimple(lastUnix),
    },
    status,
    totalCommits: commits.length,
    currentLines,
    contributors,
    milestones,
  }
}

function formatRelativeSimple(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - unixSeconds
  if (diff < 60)
    return 'just now'
  if (diff < 3600)
    return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400)
    return `${Math.floor(diff / 3600)} hours ago`
  if (diff < 172800)
    return 'yesterday'
  if (diff < 604800)
    return `${Math.floor(diff / 86400)} days ago`
  if (diff < 2592000)
    return `${Math.floor(diff / 604800)} weeks ago`
  if (diff < 31536000)
    return `${Math.floor(diff / 2592000)} months ago`
  return `${Math.floor(diff / 31536000)} years ago`
}
