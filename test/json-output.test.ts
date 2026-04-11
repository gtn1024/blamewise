import type { ChurnResult } from '../src/commands/churn'
import type { OnboardingResult } from '../src/commands/onboarding'
import type { WhoKnowsResult } from '../src/commands/who-knows'
import type { WhyResult } from '../src/commands/why'
import { describe, expect, test } from 'bun:test'

function validateJsonRoundTrip(data: unknown) {
  const json = JSON.stringify(data)
  const parsed = JSON.parse(json)
  expect(parsed).toBeTruthy()
  return parsed
}

describe('WhoKnowsResult JSON serialization', () => {
  test('serializes complete result', () => {
    const result: WhoKnowsResult = {
      filePath: 'src/index.ts',
      totalLines: 100,
      authors: [
        { name: 'Alice', email: 'alice@ex.com', lines: 60, commits: 5, lastActive: 1712793600, score: 0.85 },
        { name: 'Bob', email: 'bob@ex.com', lines: 40, commits: 3, lastActive: 1712707200, score: 0.55 },
      ],
    }
    const parsed = validateJsonRoundTrip(result)
    expect(parsed.filePath).toBe('src/index.ts')
    expect(parsed.totalLines).toBe(100)
    expect(parsed.authors).toHaveLength(2)
    expect(parsed.authors[0].name).toBe('Alice')
    expect(parsed.authors[0].lastActive).toBe(1712793600)
  })

  test('serializes empty authors', () => {
    const result: WhoKnowsResult = {
      filePath: 'README.md',
      totalLines: 0,
      authors: [],
    }
    const parsed = validateJsonRoundTrip(result)
    expect(parsed.authors).toHaveLength(0)
  })
})

describe('WhyResult JSON serialization', () => {
  test('serializes commits', () => {
    const result: WhyResult = {
      filePath: 'src/cli.ts',
      commits: [
        { sha: 'abc123def456', author: 'Alice', authorMail: 'alice@ex.com', date: '2026-04-10T12:00:00+08:00', subject: 'feat: add json mode' },
      ],
    }
    const parsed = validateJsonRoundTrip(result)
    expect(parsed.commits).toHaveLength(1)
    expect(parsed.commits[0].sha).toBe('abc123def456')
    expect(parsed.commits[0].subject).toBe('feat: add json mode')
  })

  test('serializes empty commits', () => {
    const result: WhyResult = {
      filePath: 'nonexistent.ts',
      commits: [],
    }
    const parsed = validateJsonRoundTrip(result)
    expect(parsed.commits).toHaveLength(0)
  })
})

describe('ChurnResult JSON serialization', () => {
  test('serializes churn files', () => {
    const result: ChurnResult = {
      path: 'src/',
      files: [
        { filePath: 'src/index.ts', commits: 42, authorCount: 5, churnScore: 0.91 },
        { filePath: 'src/utils.ts', commits: 20, authorCount: 3, churnScore: 0.55 },
      ],
    }
    const parsed = validateJsonRoundTrip(result)
    expect(parsed.files).toHaveLength(2)
    expect(parsed.files[0].churnScore).toBe(0.91)
  })

  test('serializes empty files', () => {
    const result: ChurnResult = {
      path: 'empty/',
      files: [],
    }
    const parsed = validateJsonRoundTrip(result)
    expect(parsed.files).toHaveLength(0)
  })
})

describe('OnboardingResult JSON serialization', () => {
  test('serializes complete result', () => {
    const result: OnboardingResult = {
      projectName: 'my-project',
      moduleOwners: [
        { module: 'src/core', owner: 'alice@ex.com', score: 0.82 },
      ],
      highChurnFiles: [
        { filePath: 'src/index.ts', commits: 30, authorCount: 4, churnScore: 0.78 },
      ],
      staleFiles: [
        { filePath: 'src/legacy.ts', lastAuthor: 'bob@ex.com', lastDate: '2024-01-15' },
      ],
      activity: {
        commits30d: 50,
        commits60d: 120,
        contributors30d: 8,
        contributors60d: 12,
      },
      staleThreshold: '6 months ago',
    }
    const parsed = validateJsonRoundTrip(result)
    expect(parsed.projectName).toBe('my-project')
    expect(parsed.moduleOwners).toHaveLength(1)
    expect(parsed.highChurnFiles).toHaveLength(1)
    expect(parsed.staleFiles).toHaveLength(1)
    expect(parsed.activity.commits30d).toBe(50)
  })

  test('serializes empty collections', () => {
    const result: OnboardingResult = {
      projectName: 'empty-project',
      moduleOwners: [],
      highChurnFiles: [],
      staleFiles: [],
      activity: {
        commits30d: 0,
        commits60d: 0,
        contributors30d: 0,
        contributors60d: 0,
      },
      staleThreshold: '6 months ago',
    }
    const parsed = validateJsonRoundTrip(result)
    expect(parsed.moduleOwners).toHaveLength(0)
    expect(parsed.highChurnFiles).toHaveLength(0)
  })
})
