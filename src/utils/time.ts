import { git } from '../git/run'

export async function getThresholdTimestamp(threshold: string): Promise<number> {
  const raw = await git('log', '-1', `--before=${threshold}`, '--format=%at')
  if (!raw.trim())
    return Math.floor(Date.now() / 1000) - 6 * 30 * 86400 // fallback: 6 months ago
  return Number.parseInt(raw.trim(), 10)
}
