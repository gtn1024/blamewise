import type { ExplainResult } from './commands/explain'
import type { ActivityStats, StaleFile } from './commands/onboarding'
import type { ReviewResult } from './commands/review'
import type { FileChurnStats } from './scoring'
import Table from 'cli-table3'
import pc from 'picocolors'
import { formatRelative } from './format'

export function renderExplain(result: ExplainResult): string {
  const out: string[] = []
  const { filePath, created, lastChanged, status, totalCommits, currentLines, contributors, milestones } = result

  out.push('')
  out.push(pc.bold(` ${pc.cyan(filePath)}`))
  out.push('')

  // Creation
  out.push(` Created: ${pc.dim(created.date.slice(0, 10))} by ${pc.cyan(created.author)}`)
  out.push(`   ${pc.dim(`"${created.subject}"`)}`)
  out.push('')

  // Status
  const statusLabel
    = status === 'active'
      ? pc.green('Active')
      : status === 'stable'
        ? pc.yellow('Stable')
        : pc.dim('Stale')
  out.push(` Status: ${statusLabel} (last changed ${lastChanged.relative})`)
  out.push('')

  // Summary line
  const activeCount = contributors.filter(c => c.active).length
  out.push(
    pc.dim(` Commits: ${totalCommits}  |  Lines: ${currentLines}  |  Contributors: ${contributors.length} (${activeCount} active)`),
  )
  out.push('')

  // Key milestones
  if (milestones.length > 0) {
    out.push(pc.bold(' Key milestones:'))
    for (const m of milestones) {
      const statStr = `(+${m.added} -${m.removed})`
      const marker = m.isRefactor ? pc.yellow(' [refactor]') : ''
      out.push(`   ${pc.dim(m.date)}  ${pc.cyan(m.author.padEnd(10))} ${pc.dim(`"${m.subject}"`)}  ${pc.dim(statStr)}${marker}`)
    }
    out.push('')
  }

  // Contributors
  if (contributors.length > 0) {
    out.push(pc.bold(' Contributors:'))
    for (const c of contributors) {
      const activeLabel = c.active ? pc.green('active') : pc.dim('inactive')
      out.push(`   ${pc.cyan(c.name)} ${pc.dim(`<${c.email}>`)} — ${c.commits} commit${c.commits !== 1 ? 's' : ''} (${activeLabel})`)
    }
    out.push('')
  }

  return out.join('\n')
}

export function renderChurn(
  path: string,
  stats: FileChurnStats[],
): string {
  const out: string[] = []

  out.push('')
  out.push(
    pc.bold(` Churn analysis for ${pc.cyan(path)}`)
    + pc.dim(` (${stats.length} file${stats.length !== 1 ? 's' : ''})`),
  )
  out.push('')

  const table = new Table({
    head: ['File', 'Commits', 'Authors', 'Churn'].map(h => pc.dim(h)),
    colAligns: ['left', 'right', 'right', 'right'],
    style: { 'padding-left': 1, 'padding-right': 1, 'head': [], 'border': [] },
    chars: {
      'top': '',
      'top-mid': '',
      'top-left': '',
      'top-right': '',
      'bottom': '',
      'bottom-mid': '',
      'bottom-left': '',
      'bottom-right': '',
      'mid': '',
      'left-mid': '',
      'mid-mid': '',
      'right-mid': '',
      'left': ' ',
      'right': ' ',
      'middle': '  ',
    },
  })

  for (const s of stats) {
    const isHot = s.churnScore >= 0.7 && s.authorCount >= 3
    const file = isHot ? pc.yellow(s.filePath) : pc.cyan(s.filePath)
    const commits = String(s.commits)
    const authors = String(s.authorCount)
    const scoreVal = s.churnScore >= 0.7
      ? pc.red(String(s.churnScore))
      : s.churnScore >= 0.4
        ? pc.yellow(String(s.churnScore))
        : pc.green(String(s.churnScore))

    table.push([file, commits, authors, scoreVal])
  }

  out.push(table.toString())
  out.push('')
  return out.join('\n')
}

export function renderWhoKnows(
  filePath: string,
  totalLines: number,
  stats: { name: string, email: string, lines: number, commits: number, lastActive: number, score: number }[],
): string {
  const out: string[] = []

  out.push('')
  out.push(
    pc.bold(` Top experts for ${pc.cyan(filePath)}`)
    + pc.dim(` (${totalLines} lines, ${stats.length} author${stats.length !== 1 ? 's' : ''})`),
  )
  out.push('')

  const table = new Table({
    head: ['Rank', 'Author', 'Email', 'Lines', 'Commits', 'Last Active', 'Score'].map(h => pc.dim(h)),
    colAligns: ['right', 'left', 'left', 'right', 'right', 'left', 'right'],
    style: { 'padding-left': 1, 'padding-right': 1, 'head': [], 'border': [] },
    chars: {
      'top': '',
      'top-mid': '',
      'top-left': '',
      'top-right': '',
      'bottom': '',
      'bottom-mid': '',
      'bottom-left': '',
      'bottom-right': '',
      'mid': '',
      'left-mid': '',
      'mid-mid': '',
      'right-mid': '',
      'left': ' ',
      'right': ' ',
      'middle': '  ',
    },
  })

  for (const [i, s] of stats.entries()) {
    const rank = pc.bold(` ${i + 1}.`)
    const author = pc.cyan(s.name)
    const lines = pc.green(String(s.lines))
    const commits = String(s.commits)
    const lastActive = pc.dim(formatRelative(s.lastActive))
    const scoreVal = s.score >= 0.7 ? pc.green(String(s.score)) : s.score >= 0.4 ? pc.yellow(String(s.score)) : pc.dim(String(s.score))

    table.push([rank, author, pc.dim(s.email), lines, commits, lastActive, scoreVal])
  }

  out.push(table.toString())
  out.push('')
  return out.join('\n')
}

export function renderOnboarding(
  projectName: string,
  moduleOwners: { module: string, owner: string, score: number }[],
  churnStats: FileChurnStats[],
  staleFiles: StaleFile[],
  activity: ActivityStats,
  staleLabel: string,
): string {
  const date = new Date().toISOString().slice(0, 10)
  const out: string[] = []

  out.push(`# Project Knowledge Map — ${projectName}`)
  out.push('')
  out.push(`> Generated by blamewise on ${date}`)
  out.push('')

  // Module Owners
  out.push('## Module Owners')
  out.push('')
  out.push('| Module | Primary Owner | Score |')
  out.push('|--------|--------------|-------|')
  for (const m of moduleOwners) {
    out.push(`| ${m.module}/ | ${m.owner} | ${m.score} |`)
  }
  out.push('')

  // High Churn Files
  out.push('## High Churn Files')
  out.push('')
  for (const f of churnStats) {
    out.push(`- \`${f.filePath}\` — ${f.commits} commits, ${f.authorCount} authors`)
  }
  out.push('')

  // Stale Files
  if (staleFiles.length > 0) {
    out.push(`## Stale Files (no changes in ${staleLabel})`)
    out.push('')
    for (const f of staleFiles) {
      out.push(`- \`${f.filePath}\` — last changed by ${f.lastAuthor} (${f.lastDate})`)
    }
    out.push('')
  }

  // Activity Trend
  out.push('## Activity Trend')
  out.push('')
  out.push(`- Commits (30d): ${activity.commits30d}  |  Commits (60d): ${activity.commits60d}`)
  out.push(`- Active contributors (30d): ${activity.contributors30d}  |  Active contributors (60d): ${activity.contributors60d}`)
  out.push('')

  return out.join('\n')
}

export function renderWhy(
  filePath: string,
  entries: { sha: string, author: string, authorMail: string, date: string, subject: string }[],
): string {
  const out: string[] = []

  out.push('')
  out.push(pc.bold(` Recent changes to ${pc.cyan(filePath)}`))
  out.push('')

  for (const [i, e] of entries.entries()) {
    const short = e.sha.slice(0, 7)
    const dateObj = new Date(e.date)
    const rel = formatRelative(Math.floor(dateObj.getTime() / 1000))

    out.push(` ${pc.dim(`[${i + 1}]`)} ${pc.bold(e.subject)}`)
    out.push(`     ${pc.dim('Author:')} ${pc.cyan(e.author)} ${pc.dim(`<${e.authorMail}>`)}`)
    out.push(`     ${pc.dim('Date:')}   ${e.date.slice(0, 10)} ${pc.dim(`(${rel})`)}`)
    out.push(`     ${pc.dim('SHA:')}    ${pc.dim(short)}`)
    out.push('')
  }

  return out.join('\n')
}

const MINIMAL_TABLE_CHARS = {
  'top': '',
  'top-mid': '',
  'top-left': '',
  'top-right': '',
  'bottom': '',
  'bottom-mid': '',
  'bottom-left': '',
  'bottom-right': '',
  'mid': '',
  'left-mid': '',
  'mid-mid': '',
  'right-mid': '',
  'left': ' ',
  'right': ' ',
  'middle': '  ',
}

export function renderReview(result: ReviewResult): string {
  const out: string[] = []
  const { files, totalFiles, skippedFiles, reviewers, inactiveThreshold, filteredCount } = result

  out.push('')
  if (totalFiles === 1) {
    out.push(pc.bold(` Recommended reviewers for ${pc.cyan(files[0]!)}`))
  }
  else {
    out.push(pc.bold(` Recommended reviewers for ${pc.cyan(`${totalFiles} file${totalFiles !== 1 ? 's' : ''}`)}`))
  }
  out.push('')

  if (reviewers.length === 0) {
    out.push(pc.dim('  No reviewers found.'))
    out.push('')
    return out.join('\n')
  }

  const table = new Table({
    head: ['Rank', 'Reviewer', 'Email', 'Files', 'Lines', 'Commits', 'Last Active', 'Score'].map(h => pc.dim(h)),
    colAligns: ['right', 'left', 'left', 'right', 'right', 'right', 'left', 'right'],
    style: { 'padding-left': 1, 'padding-right': 1, 'head': [], 'border': [] },
    chars: MINIMAL_TABLE_CHARS,
  })

  for (const [i, r] of reviewers.entries()) {
    const rank = pc.bold(` ${i + 1}.`)
    const reviewer = pc.cyan(r.name)
    const filesCol = totalFiles > 1 ? pc.bold(`${r.filesExpertIn}/${totalFiles}`) : '-'
    const lines = pc.green(String(r.totalLines))
    const commits = String(r.totalCommits)
    const lastActive = pc.dim(formatRelative(r.lastActive))
    const scoreVal = r.score >= 0.7
      ? pc.green(String(r.score))
      : r.score >= 0.4
        ? pc.yellow(String(r.score))
        : pc.dim(String(r.score))

    table.push([rank, reviewer, pc.dim(r.email), filesCol, lines, commits, lastActive, scoreVal])
  }

  out.push(table.toString())

  // File details breakdown
  if (totalFiles > 1) {
    out.push('')
    out.push(pc.dim(' File details:'))
    for (const r of reviewers) {
      const details = r.fileDetails
        .map(d => `${d.filePath} (${d.score})`)
        .join(', ')
      out.push(`   ${pc.cyan(r.name)}: ${pc.dim(details)}`)
    }
  }

  // Warnings
  if (skippedFiles.length > 0) {
    out.push('')
    out.push(pc.dim(` Skipped ${skippedFiles.length} file${skippedFiles.length !== 1 ? 's' : ''} with no git history: ${skippedFiles.join(', ')}`))
  }
  if (filteredCount > 0) {
    out.push(pc.dim(` Filtered out ${filteredCount} inactive author${filteredCount !== 1 ? 's' : ''} (no activity in ${inactiveThreshold})`))
  }

  out.push('')
  return out.join('\n')
}
