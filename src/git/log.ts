export interface LogEntry {
  sha: string
  author: string
  authorMail: string
  date: string
  subject: string
}

export function parseGitLog(raw: string): LogEntry[] {
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|')
      return {
        sha: parts[0],
        author: parts[1],
        authorMail: parts[2],
        date: parts[3],
        subject: parts.slice(4).join('|'),
      }
    })
}
