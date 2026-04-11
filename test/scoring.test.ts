import { describe, expect, test } from 'bun:test'
import { computeScores } from '../src/scoring'

describe('computeScores', () => {
  test('ranks single author with score 1', () => {
    const blame = new Map([
      ['alice@ex.com', { name: 'Alice', lines: 100, lastActive: 1700000000 }],
    ])
    const commits = new Map([['alice@ex.com', 5]])

    const results = computeScores(blame, commits)

    expect(results.length).toBe(1)
    expect(results[0]!.score).toBe(1)
    expect(results[0]!.lines).toBe(100)
    expect(results[0]!.commits).toBe(5)
  })

  test('ranks by weighted score (lines > commits > recency)', () => {
    const now = Math.floor(Date.now() / 1000)

    const blame = new Map([
      ['alice@ex.com', { name: 'Alice', lines: 80, lastActive: now }], // many lines, recent
      ['bob@ex.com', { name: 'Bob', lines: 10, lastActive: now - 100000 }], // few lines, older
    ])
    const commits = new Map([
      ['alice@ex.com', 2],
      ['bob@ex.com', 10], // many commits but few lines
    ])

    const results = computeScores(blame, commits)

    // Alice wins because lines carry 0.5 weight vs 0.3 for commits
    expect(results[0]!.name).toBe('Alice')
    expect(results[1]!.name).toBe('Bob')
  })

  test('merges authors from blame and commit data', () => {
    const blame = new Map([
      ['alice@ex.com', { name: 'Alice', lines: 50, lastActive: 1700000000 }],
    ])
    const commits = new Map([
      ['alice@ex.com', 3],
      ['bob@ex.com', 7], // Bob only in commits, not in blame
    ])

    const results = computeScores(blame, commits)

    expect(results.length).toBe(2)
    const bob = results.find(r => r.email === 'bob@ex.com')
    expect(bob).toBeDefined()
    expect(bob!.lines).toBe(0)
    expect(bob!.commits).toBe(7)
  })

  test('returns sorted by score descending', () => {
    const blame = new Map([
      ['a@ex.com', { name: 'A', lines: 10, lastActive: 1700000000 }],
      ['b@ex.com', { name: 'B', lines: 50, lastActive: 1700001000 }],
      ['c@ex.com', { name: 'C', lines: 30, lastActive: 1700000500 }],
    ])
    const commits = new Map([
      ['a@ex.com', 1],
      ['b@ex.com', 1],
      ['c@ex.com', 1],
    ])

    const results = computeScores(blame, commits)

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score)
    }
  })

  test('handles empty inputs', () => {
    const results = computeScores(new Map(), new Map())
    expect(results.length).toBe(0)
  })
})
