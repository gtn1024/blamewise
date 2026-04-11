import { writeFile } from 'node:fs/promises'
import { parseChurnLog } from '../git/churn'
import { git } from '../git/run'
import { renderOnboarding } from '../render'
import { computeChurnScores } from '../scoring'

export interface OnboardingOptions {
  output?: string
  since?: string
  staleThreshold?: string
}

interface ModuleOwner {
  module: string
  owner: string
  score: number
}

export interface StaleFile {
  filePath: string
  lastAuthor: string
  lastDate: string
}

export interface ActivityStats {
  commits30d: number
  commits60d: number
  contributors30d: number
  contributors60d: number
}

async function listSubdirs(dir: string): Promise<string[]> {
  const raw = await git('ls-tree', 'HEAD', '--', dir)
  return raw.split('\n').filter((l) => {
    if (!l)
      return false
    // git ls-tree output: <mode> <type> <hash>\t<name>
    // Only keep "tree" entries (directories)
    const parts = l.split('\t')
    const meta = parts[0]
    return meta?.startsWith('040000') && meta.includes('tree')
  }).map((l) => {
    const name = l.split('\t')[1]
    return dir === '.' ? name! : `${dir}/${name}`
  })
}

async function getModuleOwner(subdir: string): Promise<ModuleOwner | null> {
  // Use git log to get commit frequency and recency per author for the subdirectory
  let logRaw: string
  try {
    logRaw = await git('log', '--format=%ae|%at|%an', '--no-merges', '--', subdir)
  }
  catch {
    return null
  }

  if (!logRaw.trim())
    return null

  const authorStats = new Map<string, { name: string, commits: number, lastActive: number }>()
  for (const line of logRaw.split('\n').filter(Boolean)) {
    const [email, ts, name] = line.split('|')
    if (!email)
      continue
    const timestamp = Number.parseInt(ts ?? '0', 10)
    const existing = authorStats.get(email)
    if (existing) {
      existing.commits++
      if (timestamp > existing.lastActive)
        existing.lastActive = timestamp
    }
    else {
      authorStats.set(email, { name: name ?? email, commits: 1, lastActive: timestamp })
    }
  }

  if (authorStats.size === 0)
    return null

  // Simple scoring: normalize commits and recency
  const entries = [...authorStats.entries()]
  const maxCommits = Math.max(...entries.map(([, v]) => v.commits), 1)
  const maxRecency = Math.max(...entries.map(([, v]) => v.lastActive), 1)

  let bestEmail = ''
  let bestScore = -1

  for (const [email, stats] of entries) {
    const normCommits = stats.commits / maxCommits
    const normRecency = maxRecency > 0 ? stats.lastActive / maxRecency : 0
    const score = 0.7 * normCommits + 0.3 * normRecency
    if (score > bestScore) {
      bestScore = score
      bestEmail = email
    }
  }

  return {
    module: subdir,
    owner: bestEmail,
    score: Math.round(bestScore * 100) / 100,
  }
}

async function getStaleFiles(dir: string, threshold: string): Promise<StaleFile[]> {
  // Get full log to find when each file was last changed
  const fullArgs = [
    'log',
    '--format=AUTHOR:%ae%nDATE:%at',
    '--name-only',
    '--diff-filter=ACDMR',
    '--',
    dir,
  ]

  let fullRaw: string
  try {
    fullRaw = await git(...fullArgs)
  }
  catch {
    return []
  }

  const fileMap = new Map<string, { lastAuthor: string, lastDate: number }>()
  let currentAuthor = ''
  let currentDate = 0

  for (const line of fullRaw.split('\n')) {
    if (line.startsWith('AUTHOR:')) {
      currentAuthor = line.slice(7)
    }
    else if (line.startsWith('DATE:')) {
      currentDate = Number.parseInt(line.slice(5), 10)
    }
    else if (line) {
      const existing = fileMap.get(line)
      if (!existing || currentDate > existing.lastDate)
        fileMap.set(line, { lastAuthor: currentAuthor, lastDate: currentDate })
    }
  }

  // Filter stale files: last modified before the threshold
  const thresholdDate = await getThresholdTimestamp(threshold)
  const stale: StaleFile[] = []

  for (const [filePath, info] of fileMap) {
    if (info.lastDate > 0 && info.lastDate < thresholdDate) {
      stale.push({
        filePath,
        lastAuthor: info.lastAuthor,
        lastDate: new Date(info.lastDate * 1000).toISOString().slice(0, 10),
      })
    }
  }

  return stale.sort((a, b) => a.lastDate.localeCompare(b.lastDate))
}

async function getThresholdTimestamp(threshold: string): Promise<number> {
  // Use git to resolve the threshold date
  const raw = await git('log', '-1', `--before=${threshold}`, '--format=%at')
  if (!raw.trim())
    return Math.floor(Date.now() / 1000) - 6 * 30 * 86400 // fallback: 6 months ago
  return Number.parseInt(raw.trim(), 10)
}

async function getActivityStats(dir: string): Promise<ActivityStats> {
  async function countCommitsAndAuthors(period: string) {
    const args = ['log', '--format=%ae', `--since=${period}`, '--', dir]
    let raw: string
    try {
      raw = await git(...args)
    }
    catch {
      return { commits: 0, contributors: 0 }
    }
    const emails = raw.split('\n').filter(Boolean)
    return {
      commits: emails.length,
      contributors: new Set(emails).size,
    }
  }

  const [stats30d, stats60d] = await Promise.all([
    countCommitsAndAuthors('30 days ago'),
    countCommitsAndAuthors('60 days ago'),
  ])

  return {
    commits30d: stats30d.commits,
    commits60d: stats60d.commits,
    contributors30d: stats30d.contributors,
    contributors60d: stats60d.contributors,
  }
}

export async function onboarding(dir: string, options?: OnboardingOptions) {
  const outputPath = options?.output ?? 'ONBOARDING.md'
  const since = options?.since ?? '30 days ago'
  const staleThreshold = options?.staleThreshold ?? '6 months ago'

  // 1. Module Owners
  const subdirs = await listSubdirs(dir)
  const ownerResults = await Promise.all(subdirs.map(s => getModuleOwner(s)))
  const moduleOwners = ownerResults.filter((r): r is ModuleOwner => r !== null)

  // 2. High Churn Files
  const churnArgs: string[] = [
    'log',
    '--format=AUTHOR:%ae',
    '--name-only',
    '--diff-filter=ACDMR',
    `--since=${since}`,
    '--',
    dir,
  ]
  const churnRaw = await git(...churnArgs)
  const churnEntries = parseChurnLog(churnRaw)
  const churnStats = computeChurnScores(churnEntries).slice(0, 10)

  // 3. Stale Files
  const staleFiles = (await getStaleFiles(dir, staleThreshold)).slice(0, 10)

  // 4. Activity Trend
  const activity = await getActivityStats(dir)

  // 5. Generate Markdown
  const projectName = dir === '.' ? (process.cwd().split('/').pop() ?? 'project') : dir
  const markdown = renderOnboarding(projectName!, moduleOwners, churnStats, staleFiles, activity, staleThreshold)

  // 6. Write to file
  await writeFile(outputPath, markdown, 'utf-8')
}
