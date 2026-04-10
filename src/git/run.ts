import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function git(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args)
  return stdout
}

export async function gitLines(...args: string[]): Promise<string[]> {
  const text = await git(...args)
  return text.split('\n').filter(Boolean)
}
