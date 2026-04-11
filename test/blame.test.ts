import { describe, expect, test } from 'bun:test'
import { parseBlamePorcelain } from '../src/git/blame'

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

describe('parseBlamePorcelain', () => {
  test('parses a single commit with one line', () => {
    const raw = [
      `${SHA_A} 1 1 1`,
      'author Alice',
      'author-mail <alice@example.com>',
      'author-time 1700000000',
      'author-tz +0000',
      'committer Alice',
      'committer-mail <alice@example.com>',
      'committer-time 1700000000',
      'committer-tz +0000',
      'summary init',
      'filename index.ts',
      '\tconsole.log(\'hello\');',
    ].join('\n')

    const { commits, lines } = parseBlamePorcelain(raw)

    expect(lines.length).toBe(1)
    expect(lines[0]!.sha).toBe(SHA_A)
    expect(lines[0]!.finalLine).toBe(1)

    expect(commits.size).toBe(1)
    const commit = commits.get(SHA_A)!
    expect(commit.author).toBe('Alice')
    expect(commit.authorMail).toBe('alice@example.com')
    expect(commit.authorTime).toBe(1700000000)
    expect(commit.summary).toBe('init')
  })

  test('parses multiple commits with repeated SHA', () => {
    const raw = [
      `${SHA_A} 1 1`,
      'author Alice',
      'author-mail <alice@ex.com>',
      'author-time 1700000000',
      'author-tz +0000',
      'summary first commit',
      'filename a.ts',
      '\tline1',
      `${SHA_A} 2 2`,
      '\tline2',
      `${SHA_B} 3 3`,
      'author Bob',
      'author-mail <bob@ex.com>',
      'author-time 1700001000',
      'author-tz +0000',
      'summary second commit',
      'filename a.ts',
      '\tline3',
    ].join('\n')

    const { commits, lines } = parseBlamePorcelain(raw)

    expect(lines.length).toBe(3)
    expect(commits.size).toBe(2)
    expect(commits.get(SHA_A)!.author).toBe('Alice')
    expect(commits.get(SHA_B)!.author).toBe('Bob')
  })

  test('strips angle brackets from author-mail', () => {
    const raw = [
      `${SHA_A} 1 1 1`,
      'author Alice',
      'author-mail <alice@example.com>',
      'author-time 1700000000',
      'author-tz +0000',
      'summary init',
      'filename index.ts',
      '\tcontent',
    ].join('\n')

    const { commits } = parseBlamePorcelain(raw)
    expect(commits.get(SHA_A)!.authorMail).toBe('alice@example.com')
  })

  test('handles empty input', () => {
    const { commits, lines } = parseBlamePorcelain('')
    expect(commits.size).toBe(0)
    expect(lines.length).toBe(0)
  })

  test('handles commit with pipe in summary', () => {
    const raw = [
      `${SHA_A} 1 1 1`,
      'author Alice',
      'author-mail <alice@ex.com>',
      'author-time 1700000000',
      'author-tz +0000',
      'summary fix: handle A | B case',
      'filename a.ts',
      '\tcode',
    ].join('\n')

    const { commits } = parseBlamePorcelain(raw)
    expect(commits.get(SHA_A)!.summary).toBe('fix: handle A | B case')
  })
})
