import { describe, expect, test } from 'bun:test'
import { parseChurnLog } from '../src/git/churn'
import { computeChurnScores } from '../src/scoring'

describe('parseChurnLog', () => {
  test('parses single commit with single file', () => {
    const raw = [
      'AUTHOR:alice@ex.com',
      '',
      'src/render.ts',
    ].join('\n')

    const entries = parseChurnLog(raw)

    expect(entries.length).toBe(1)
    expect(entries[0]!.filePath).toBe('src/render.ts')
    expect(entries[0]!.commits).toBe(1)
    expect(entries[0]!.authors.size).toBe(1)
    expect(entries[0]!.authors.has('alice@ex.com')).toBe(true)
  })

  test('parses single commit with multiple files', () => {
    const raw = [
      'AUTHOR:alice@ex.com',
      '',
      'src/git/blame.ts',
      'src/git/log.ts',
    ].join('\n')

    const entries = parseChurnLog(raw)

    expect(entries.length).toBe(2)
    expect(entries[0]!.commits).toBe(1)
    expect(entries[1]!.commits).toBe(1)
    expect(entries[0]!.authors.has('alice@ex.com')).toBe(true)
    expect(entries[1]!.authors.has('alice@ex.com')).toBe(true)
  })

  test('aggregates multiple commits touching the same file', () => {
    const raw = [
      'AUTHOR:alice@ex.com',
      '',
      'src/render.ts',
      'AUTHOR:bob@ex.com',
      '',
      'src/render.ts',
    ].join('\n')

    const entries = parseChurnLog(raw)

    expect(entries.length).toBe(1)
    expect(entries[0]!.commits).toBe(2)
    expect(entries[0]!.authors.size).toBe(2)
    expect(entries[0]!.authors.has('alice@ex.com')).toBe(true)
    expect(entries[0]!.authors.has('bob@ex.com')).toBe(true)
  })

  test('parses multiple commits with different files', () => {
    const raw = [
      'AUTHOR:alice@ex.com',
      '',
      'src/a.ts',
      'AUTHOR:bob@ex.com',
      '',
      'src/b.ts',
    ].join('\n')

    const entries = parseChurnLog(raw)

    expect(entries.length).toBe(2)
    expect(entries[0]!.filePath).toBe('src/a.ts')
    expect(entries[1]!.filePath).toBe('src/b.ts')
  })

  test('handles empty input', () => {
    const entries = parseChurnLog('')
    expect(entries.length).toBe(0)
  })

  test('handles extra blank lines', () => {
    const raw = [
      '',
      'AUTHOR:alice@ex.com',
      '',
      '',
      'src/render.ts',
      '',
    ].join('\n')

    const entries = parseChurnLog(raw)

    expect(entries.length).toBe(1)
    expect(entries[0]!.filePath).toBe('src/render.ts')
  })

  test('preserves file paths with spaces', () => {
    const raw = [
      'AUTHOR:alice@ex.com',
      '',
      'src/my file.ts',
    ].join('\n')

    const entries = parseChurnLog(raw)

    expect(entries[0]!.filePath).toBe('src/my file.ts')
  })
})

describe('computeChurnScores', () => {
  test('single file gets score 1', () => {
    const entries = [
      { filePath: 'src/a.ts', commits: 5, authors: new Set(['alice@ex.com']) },
    ]

    const results = computeChurnScores(entries)

    expect(results.length).toBe(1)
    expect(results[0]!.churnScore).toBe(1)
    expect(results[0]!.authorCount).toBe(1)
  })

  test('ranks by weighted formula (commits > authors)', () => {
    const entries = [
      { filePath: 'a.ts', commits: 10, authors: new Set(['alice@ex.com']) },
      { filePath: 'b.ts', commits: 3, authors: new Set(['a@ex.com', 'b@ex.com', 'c@ex.com']) },
    ]

    const results = computeChurnScores(entries)

    // a.ts: normCommits=1.0, normAuthors=0.33 → 0.6*1.0 + 0.4*0.33 = 0.73
    // b.ts: normCommits=0.3, normAuthors=1.0 → 0.6*0.3 + 0.4*1.0 = 0.58
    expect(results[0]!.filePath).toBe('a.ts')
    expect(results[0]!.churnScore).toBeGreaterThan(results[1]!.churnScore)
  })

  test('returns sorted descending by churnScore', () => {
    const entries = [
      { filePath: 'low.ts', commits: 1, authors: new Set(['a@ex.com']) },
      { filePath: 'high.ts', commits: 20, authors: new Set(['a@ex.com', 'b@ex.com', 'c@ex.com']) },
      { filePath: 'mid.ts', commits: 5, authors: new Set(['a@ex.com', 'b@ex.com']) },
    ]

    const results = computeChurnScores(entries)

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.churnScore).toBeGreaterThanOrEqual(results[i]!.churnScore)
    }
  })

  test('handles empty input', () => {
    const results = computeChurnScores([])
    expect(results.length).toBe(0)
  })

  test('authorCount matches authors set size', () => {
    const entries = [
      { filePath: 'a.ts', commits: 5, authors: new Set(['x@ex.com', 'y@ex.com', 'z@ex.com']) },
    ]

    const results = computeChurnScores(entries)

    expect(results[0]!.authorCount).toBe(3)
  })
})
