#!/usr/bin/env bun
import { isAbsolute, resolve } from 'node:path'
import { cac } from 'cac'
import consola from 'consola'
import { version } from '../package.json'
import { churn } from './commands/churn'
import { onboarding } from './commands/onboarding'
import { whoKnows } from './commands/who-knows'
import { why } from './commands/why'
import { formatRelative } from './format'
import { setGitCwd } from './git/run'
import { renderChurn, renderOnboarding, renderWhoKnows, renderWhy } from './render'
import { BlamewiseError, resolveTarget, sanitizeGitOption } from './utils/path'

const cli = cac('blamewise')

function handleCommandError(e: unknown): never {
  if (e instanceof BlamewiseError) {
    consola.error(e.message)
    process.exit(2)
  }
  consola.error(e)
  process.exit(1)
}

function outputJson(data: unknown): void {
  const json = JSON.stringify(data, (_, v) => {
    // Convert Set to Array for JSON serialization
    if (v instanceof Set)
      return [...v]
    // Convert Map to Object for JSON serialization
    if (v instanceof Map)
      return Object.fromEntries(v)
    return v
  }, 2)
  console.log(json)
}

cli.command('who-knows <path>', 'Rank authors by expertise on a file').option('-n, --num <number>', 'Number of authors to show', { default: 10 }).option('--json', 'Output as JSON').action(async (path: string, options: { num?: string, json?: boolean }) => {
  try {
    const { repoRoot, pathspec } = await resolveTarget(path)
    setGitCwd(repoRoot)
    const result = await whoKnows(pathspec, { num: Number.parseInt(String(options.num ?? '10'), 10) })
    if (options.json) {
      outputJson({
        ...result,
        authors: result.authors.map(a => ({
          ...a,
          lastActiveRelative: formatRelative(a.lastActive),
        })),
      })
    }
    else {
      consola.log(renderWhoKnows(result.filePath, result.totalLines, result.authors))
    }
  }
  catch (e: any) {
    handleCommandError(e)
  }
})

cli.command('why <path>', 'Show recent commits with reasons for changes').option('-n, --num <number>', 'Number of commits to show', { default: 5 }).option('--json', 'Output as JSON').action(async (path: string, options: { num?: string, json?: boolean }) => {
  try {
    const { repoRoot, pathspec } = await resolveTarget(path)
    setGitCwd(repoRoot)
    const result = await why(pathspec, { num: Number.parseInt(String(options.num ?? '5'), 10) })
    if (options.json) {
      outputJson(result)
    }
    else {
      if (result.commits.length === 0) {
        consola.log(`No commits found for ${result.filePath}`)
      }
      else {
        consola.log(renderWhy(result.filePath, result.commits))
      }
    }
  }
  catch (e: any) {
    handleCommandError(e)
  }
})

cli.command('churn <path>', 'Show files with highest change frequency')
  .option('--since <date>', 'Start date (e.g. "6 months ago")')
  .option('--until <date>', 'End date')
  .option('-n, --num <number>', 'Number of files to show', { default: 20 })
  .option('--json', 'Output as JSON')
  .action(async (path: string, options: { num?: string, since?: string, until?: string, json?: boolean }) => {
    try {
      const { repoRoot, pathspec } = await resolveTarget(path)
      setGitCwd(repoRoot)
      if (options.since)
        sanitizeGitOption(options.since, 'since')
      if (options.until)
        sanitizeGitOption(options.until, 'until')
      const result = await churn(pathspec, {
        num: Number.parseInt(String(options.num ?? '20'), 10),
        since: options.since,
        until: options.until,
      })
      if (options.json) {
        outputJson(result)
      }
      else {
        if (result.files.length === 0) {
          consola.log(`No commits found for ${result.path}`)
        }
        else {
          consola.log(renderChurn(result.path, result.files))
        }
      }
    }
    catch (e: any) {
      handleCommandError(e)
    }
  })

cli.command('onboarding <path>', 'Generate a project knowledge map for onboarding')
  .option('--output <file>', 'Output file path', { default: 'ONBOARDING.md' })
  .option('--since <date>', 'Date filter for churn/activity (e.g. "30 days ago")')
  .option('--stale-threshold <duration>', 'Stale file threshold (e.g. "6 months ago")', { default: '6 months ago' })
  .option('--json', 'Output as JSON')
  .action(async (path: string, options: { output?: string, since?: string, staleThreshold?: string, json?: boolean }) => {
    try {
      const { repoRoot, pathspec } = await resolveTarget(path)
      setGitCwd(repoRoot)
      if (options.since)
        sanitizeGitOption(options.since, 'since')
      sanitizeGitOption(options.staleThreshold ?? '6 months ago', 'stale-threshold')
      const result = await onboarding(pathspec, {
        since: options.since,
        staleThreshold: options.staleThreshold,
      })
      if (options.json) {
        outputJson(result)
      }
      else {
        const outputRaw = options.output ?? 'ONBOARDING.md'
        const outputPath = isAbsolute(outputRaw) ? outputRaw : resolve(repoRoot, outputRaw)
        const { writeFile } = await import('node:fs/promises')
        const markdown = renderOnboarding(
          result.projectName,
          result.moduleOwners,
          result.highChurnFiles,
          result.staleFiles,
          result.activity,
          result.staleThreshold,
        )
        await writeFile(outputPath, markdown, 'utf-8')
      }
    }
    catch (e: any) {
      handleCommandError(e)
    }
  })

cli.help()
cli.version(version)

cli.parse()
if (!cli.args.length && !cli.matchedCommand) {
  cli.outputHelp()
}
