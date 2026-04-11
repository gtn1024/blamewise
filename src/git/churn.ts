export interface FileChurnEntry {
  filePath: string
  commits: number
  authors: Set<string>
}

export function parseChurnLog(raw: string): FileChurnEntry[] {
  const fileMap = new Map<string, FileChurnEntry>()
  let currentAuthor = ''

  for (const line of raw.split('\n')) {
    if (line.startsWith('AUTHOR:')) {
      currentAuthor = line.slice(7)
    }
    else if (line === '') {
      continue
    }
    else {
      const existing = fileMap.get(line)
      if (existing) {
        existing.commits++
        existing.authors.add(currentAuthor)
      }
      else {
        fileMap.set(line, {
          filePath: line,
          commits: 1,
          authors: new Set([currentAuthor]),
        })
      }
    }
  }

  return [...fileMap.values()]
}
