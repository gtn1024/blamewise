import { describe, expect, test } from 'bun:test'
import { parseGitLog } from '../src/git/log'

describe('parseGitLog', () => {
  test('parses single entry', () => {
    const raw = 'abc123|Alice|alice@ex.com|2026-04-10T12:00:00+08:00|init'

    const entries = parseGitLog(raw)

    expect(entries.length).toBe(1)
    expect(entries[0]).toEqual({
      sha: 'abc123',
      author: 'Alice',
      authorMail: 'alice@ex.com',
      date: '2026-04-10T12:00:00+08:00',
      subject: 'init',
    })
  })

  test('parses multiple entries', () => {
    const raw = [
      'sha1|Alice|alice@ex.com|2026-04-10T12:00:00+08:00|feat: add X',
      'sha2|Bob|bob@ex.com|2026-04-09T10:00:00+08:00|fix: fix Y',
    ].join('\n')

    const entries = parseGitLog(raw)
    expect(entries.length).toBe(2)
    expect(entries[0].subject).toBe('feat: add X')
    expect(entries[1].subject).toBe('fix: fix Y')
  })

  test('preserves pipe in subject', () => {
    const raw = 'sha1|Alice|alice@ex.com|2026-04-10T12:00:00+08:00|fix: handle A | B'

    const entries = parseGitLog(raw)
    expect(entries[0].subject).toBe('fix: handle A | B')
  })

  test('handles empty input', () => {
    const entries = parseGitLog('')
    expect(entries.length).toBe(0)
  })
})
