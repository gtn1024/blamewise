import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

let _cwd: string | undefined

export function setGitCwd(cwd: string | undefined): void {
  _cwd = cwd
}

export function getGitCwd(): string {
  return _cwd ?? process.cwd()
}

export async function git(...args: string[]): Promise<string> {
  const options: { cwd?: string } = {}
  if (_cwd)
    options.cwd = _cwd
  const { stdout } = await execFileAsync('git', args, options)
  return stdout
}

export async function gitLines(...args: string[]): Promise<string[]> {
  const text = await git(...args)
  return text.split('\n').filter(Boolean)
}
