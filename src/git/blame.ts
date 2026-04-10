export interface BlameCommit {
  sha: string
  author: string
  authorMail: string
  authorTime: number
  summary: string
}

export interface BlameLine {
  finalLine: number
  sha: string
}

export interface BlameResult {
  commits: Map<string, BlameCommit>
  lines: BlameLine[]
}

const SHA_RE = /^[0-9a-f]{40}/

export function parseBlamePorcelain(raw: string): BlameResult {
  const commits = new Map<string, BlameCommit>()
  const lines: BlameLine[] = []

  let currentSha = ''
  let collecting = false
  let partial: Partial<BlameCommit> = {}

  const commitLines = raw.split('\n')

  for (const line of commitLines) {
    if (line.startsWith('\t')) {
      // End of header block — content line
      if (collecting && currentSha && !commits.has(currentSha)) {
        commits.set(currentSha, partial as BlameCommit)
      }
      collecting = false
      partial = {}
      continue
    }

    if (SHA_RE.test(line)) {
      const parts = line.split(' ')
      currentSha = parts[0]
      const finalLine = Number.parseInt(parts[2], 10)
      lines.push({ sha: currentSha, finalLine })

      if (!commits.has(currentSha)) {
        collecting = true
        partial = { sha: currentSha }
      }
      continue
    }

    if (!collecting)
      continue

    if (line.startsWith('author-mail ')) {
      partial.authorMail = line.slice('author-mail '.length).replace(/[<>]/g, '')
    }
    else if (line.startsWith('author ')) {
      partial.author = line.slice('author '.length)
    }
    else if (line.startsWith('author-time ')) {
      partial.authorTime = Number.parseInt(line.slice('author-time '.length), 10)
    }
    else if (line.startsWith('summary ')) {
      partial.summary = line.slice('summary '.length)
    }
  }

  return { commits, lines }
}
