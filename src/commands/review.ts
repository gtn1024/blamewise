import type { AuthorStats } from '../scoring'
import { getThresholdTimestamp } from '../utils/time'
import { whoKnows } from './who-knows'

export interface ReviewerFileDetail {
  filePath: string
  score: number
  lines: number
  commits: number
}

export interface Reviewer {
  name: string
  email: string
  score: number
  totalLines: number
  totalCommits: number
  lastActive: number
  filesExpertIn: number
  fileDetails: ReviewerFileDetail[]
}

export interface ReviewResult {
  files: string[]
  totalFiles: number
  skippedFiles: string[]
  inactiveThreshold: string
  filteredCount: number
  reviewers: Reviewer[]
}

export function aggregateReviewers(
  fileResults: { filePath: string, authors: AuthorStats[] }[],
  totalFiles: number,
  inactiveThresholdTimestamp: number,
): { reviewers: Reviewer[], filteredCount: number } {
  if (fileResults.length === 0)
    return { reviewers: [], filteredCount: 0 }

  // Merge authors by email across files
  const authorMap = new Map<string, {
    name: string
    totalLines: number
    totalCommits: number
    lastActive: number
    filesExpertIn: number
    fileDetails: ReviewerFileDetail[]
  }>()

  for (const { filePath, authors } of fileResults) {
    for (const author of authors) {
      const existing = authorMap.get(author.email)
      const detail: ReviewerFileDetail = {
        filePath,
        score: author.score,
        lines: author.lines,
        commits: author.commits,
      }

      if (existing) {
        existing.totalLines += author.lines
        existing.totalCommits += author.commits
        if (author.lastActive > existing.lastActive)
          existing.lastActive = author.lastActive
        if (author.score > 0)
          existing.filesExpertIn++
        existing.fileDetails.push(detail)
      }
      else {
        authorMap.set(author.email, {
          name: author.name,
          totalLines: author.lines,
          totalCommits: author.commits,
          lastActive: author.lastActive,
          filesExpertIn: author.score > 0 ? 1 : 0,
          fileDetails: [detail],
        })
      }
    }
  }

  // Filter inactive authors
  const activeEntries = [...authorMap.entries()].filter(
    ([, v]) => v.lastActive >= inactiveThresholdTimestamp,
  )
  const filteredCount = authorMap.size - activeEntries.length

  if (activeEntries.length === 0)
    return { reviewers: [], filteredCount }

  // Normalize and compute aggregated scores (same formula as computeScores)
  const maxLines = Math.max(...activeEntries.map(([, v]) => v.totalLines), 1)
  const maxCommits = Math.max(...activeEntries.map(([, v]) => v.totalCommits), 1)
  const maxRecency = Math.max(...activeEntries.map(([, v]) => v.lastActive), 1)

  const reviewers: Reviewer[] = activeEntries.map(([email, v]) => {
    const normLines = v.totalLines / maxLines
    const normCommits = v.totalCommits / maxCommits
    const normRecency = maxRecency > 0 ? v.lastActive / maxRecency : 0
    const score = 0.5 * normLines + 0.3 * normCommits + 0.2 * normRecency

    return {
      name: v.name,
      email,
      score: Math.round(score * 100) / 100,
      totalLines: v.totalLines,
      totalCommits: v.totalCommits,
      lastActive: v.lastActive,
      filesExpertIn: v.filesExpertIn,
      fileDetails: v.fileDetails,
    }
  })

  reviewers.sort((a, b) => b.score - a.score)
  return { reviewers, filteredCount }
}

export async function review(
  files: string[],
  options?: {
    num?: number
    inactiveThreshold?: string
  },
): Promise<ReviewResult> {
  const num = options?.num ?? 10
  const inactiveThreshold = options?.inactiveThreshold ?? '6 months ago'

  // Resolve inactive threshold timestamp
  const thresholdTimestamp = await getThresholdTimestamp(inactiveThreshold)

  // Process all files in parallel, resilient to single-file failures
  const settled = await Promise.allSettled(
    files.map(filePath => whoKnows(filePath)),
  )

  const fileResults: { filePath: string, authors: AuthorStats[] }[] = []
  const skippedFiles: string[] = []

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]!
    if (result.status === 'fulfilled') {
      fileResults.push({
        filePath: files[i]!,
        authors: result.value.authors,
      })
    }
    else {
      skippedFiles.push(files[i]!)
    }
  }

  const { reviewers, filteredCount } = aggregateReviewers(
    fileResults,
    files.length,
    thresholdTimestamp,
  )

  return {
    files,
    totalFiles: files.length,
    skippedFiles,
    inactiveThreshold,
    filteredCount,
    reviewers: reviewers.slice(0, num),
  }
}
