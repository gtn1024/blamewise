import { describe, expect, test } from 'bun:test'
import { formatRelative } from '../src/format'

describe('formatRelative', () => {
  test('returns \'unknown\' for timestamp 0', () => {
    expect(formatRelative(0)).toBe('unknown')
  })

  test('returns \'just now\' for very recent timestamps', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(formatRelative(now)).toBe('just now')
    expect(formatRelative(now - 30)).toBe('just now')
  })

  test('returns minutes ago', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(formatRelative(now - 120)).toBe('2 min ago')
  })

  test('returns hours ago', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(formatRelative(now - 7200)).toBe('2 hours ago')
  })

  test('returns days ago', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(formatRelative(now - 259200)).toBe('3 days ago')
  })

  test('returns years ago for old timestamps', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(formatRelative(now - 63072000)).toBe('2 years ago')
  })
})
