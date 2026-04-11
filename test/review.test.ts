import type { AuthorStats } from '../src/scoring'
import { describe, expect, test } from 'bun:test'
import { aggregateReviewers } from '../src/commands/review'

function makeAuthor(overrides: Partial<AuthorStats> & { email: string }): AuthorStats {
  return {
    name: overrides.email.split('@')[0]!,
    lines: 10,
    commits: 2,
    lastActive: Math.floor(Date.now() / 1000),
    score: 0.5,
    ...overrides,
  }
}

describe('aggregateReviewers', () => {
  test('single file, single author gets score 1', () => {
    const now = Math.floor(Date.now() / 1000)
    const fileResults = [
      {
        filePath: 'src/a.ts',
        authors: [makeAuthor({ email: 'alice@ex.com', lines: 100, commits: 5, lastActive: now, score: 1 })],
      },
    ]

    const { reviewers, filteredCount } = aggregateReviewers(fileResults, 1, 0)

    expect(reviewers.length).toBe(1)
    expect(reviewers[0]!.score).toBe(1)
    expect(reviewers[0]!.filesExpertIn).toBe(1)
    expect(reviewers[0]!.totalLines).toBe(100)
    expect(filteredCount).toBe(0)
  })

  test('two files, same author dominates both', () => {
    const now = Math.floor(Date.now() / 1000)
    const fileResults = [
      {
        filePath: 'src/a.ts',
        authors: [makeAuthor({ email: 'alice@ex.com', lines: 80, commits: 8, lastActive: now, score: 0.9 })],
      },
      {
        filePath: 'src/b.ts',
        authors: [makeAuthor({ email: 'alice@ex.com', lines: 50, commits: 5, lastActive: now, score: 0.85 })],
      },
    ]

    const { reviewers } = aggregateReviewers(fileResults, 2, 0)

    expect(reviewers.length).toBe(1)
    expect(reviewers[0]!.filesExpertIn).toBe(2)
    expect(reviewers[0]!.totalLines).toBe(130)
    expect(reviewers[0]!.totalCommits).toBe(13)
  })

  test('two files, different authors ranked by aggregated score', () => {
    const now = Math.floor(Date.now() / 1000)
    const fileResults = [
      {
        filePath: 'src/a.ts',
        authors: [
          makeAuthor({ email: 'alice@ex.com', lines: 100, commits: 10, lastActive: now, score: 0.95 }),
          makeAuthor({ email: 'bob@ex.com', lines: 10, commits: 1, lastActive: now - 100000, score: 0.2 }),
        ],
      },
      {
        filePath: 'src/b.ts',
        authors: [
          makeAuthor({ email: 'bob@ex.com', lines: 80, commits: 8, lastActive: now, score: 0.9 }),
          makeAuthor({ email: 'alice@ex.com', lines: 5, commits: 1, lastActive: now - 50000, score: 0.15 }),
        ],
      },
    ]

    const { reviewers } = aggregateReviewers(fileResults, 2, 0)

    // Alice: 105 lines, 11 commits; Bob: 90 lines, 9 commits → Alice ranks higher
    expect(reviewers.length).toBe(2)
    expect(reviewers[0]!.email).toBe('alice@ex.com')
    expect(reviewers[0]!.score).toBeGreaterThanOrEqual(reviewers[1]!.score)
    expect(reviewers[0]!.filesExpertIn).toBe(2)
    expect(reviewers[1]!.filesExpertIn).toBe(2)
  })

  test('filters out inactive authors', () => {
    const now = Math.floor(Date.now() / 1000)
    const sixMonthsAgo = now - 6 * 30 * 86400
    const fileResults = [
      {
        filePath: 'src/a.ts',
        authors: [
          makeAuthor({ email: 'alice@ex.com', lines: 100, commits: 10, lastActive: now, score: 0.9 }),
          makeAuthor({ email: 'bob@ex.com', lines: 80, commits: 8, lastActive: sixMonthsAgo - 1, score: 0.7 }),
        ],
      },
    ]

    const { reviewers, filteredCount } = aggregateReviewers(fileResults, 1, sixMonthsAgo)

    expect(filteredCount).toBe(1)
    expect(reviewers.length).toBe(1)
    expect(reviewers[0]!.email).toBe('alice@ex.com')
  })

  test('handles empty input', () => {
    const { reviewers, filteredCount } = aggregateReviewers([], 0, 0)
    expect(reviewers.length).toBe(0)
    expect(filteredCount).toBe(0)
  })

  test('returns sorted by score descending', () => {
    const now = Math.floor(Date.now() / 1000)
    const fileResults = [
      {
        filePath: 'src/a.ts',
        authors: [
          makeAuthor({ email: 'a@ex.com', lines: 10, commits: 1, lastActive: now - 50000, score: 0.3 }),
          makeAuthor({ email: 'b@ex.com', lines: 50, commits: 5, lastActive: now, score: 0.8 }),
          makeAuthor({ email: 'c@ex.com', lines: 30, commits: 3, lastActive: now - 10000, score: 0.6 }),
        ],
      },
    ]

    const { reviewers } = aggregateReviewers(fileResults, 1, 0)

    for (let i = 1; i < reviewers.length; i++) {
      expect(reviewers[i - 1]!.score).toBeGreaterThanOrEqual(reviewers[i]!.score)
    }
  })

  test('counts filesExpertIn correctly across multiple files', () => {
    const now = Math.floor(Date.now() / 1000)
    const fileResults = [
      {
        filePath: 'src/a.ts',
        authors: [makeAuthor({ email: 'alice@ex.com', lines: 50, commits: 5, lastActive: now, score: 0.8 })],
      },
      {
        filePath: 'src/b.ts',
        authors: [makeAuthor({ email: 'alice@ex.com', lines: 40, commits: 4, lastActive: now, score: 0.7 })],
      },
      {
        filePath: 'src/c.ts',
        authors: [makeAuthor({ email: 'alice@ex.com', lines: 30, commits: 3, lastActive: now, score: 0.6 })],
      },
      {
        filePath: 'src/d.ts',
        authors: [makeAuthor({ email: 'bob@ex.com', lines: 60, commits: 6, lastActive: now, score: 0.9 })],
      },
    ]

    const { reviewers } = aggregateReviewers(fileResults, 4, 0)

    const alice = reviewers.find(r => r.email === 'alice@ex.com')!
    expect(alice.filesExpertIn).toBe(3)
    expect(alice.fileDetails.length).toBe(3)

    const bob = reviewers.find(r => r.email === 'bob@ex.com')!
    expect(bob.filesExpertIn).toBe(1)
    expect(bob.fileDetails.length).toBe(1)
  })

  test('all authors inactive returns empty reviewers', () => {
    const now = Math.floor(Date.now() / 1000)
    const longTimeAgo = now - 99999999
    const fileResults = [
      {
        filePath: 'src/a.ts',
        authors: [makeAuthor({ email: 'alice@ex.com', lines: 100, commits: 10, lastActive: longTimeAgo, score: 0.9 })],
      },
    ]

    const { reviewers, filteredCount } = aggregateReviewers(fileResults, 1, now - 1000)

    expect(filteredCount).toBe(1)
    expect(reviewers.length).toBe(0)
  })
})
