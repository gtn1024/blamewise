#!/usr/bin/env bun
import { isAbsolute, resolve } from 'node:path'
import { cac } from 'cac'
import consola from 'consola'
import { version } from '../package.json'
import { churn } from './commands/churn'
import { onboarding } from './commands/onboarding'
import { whoKnows } from './commands/who-knows'
import { why } from './commands/why'
import { setGitCwd } from './git/run'
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

cli.command('who-knows <path>', 'Rank authors by expertise on a file').option('-n, --num <number>', 'Number of authors to show', { default: 10 }).action(async (path: string, options: { num?: string }) => {
  try {
    const { repoRoot, pathspec } = await resolveTarget(path)
    setGitCwd(repoRoot)
    await whoKnows(pathspec, { num: Number.parseInt(String(options.num ?? '10'), 10) })
  }
  catch (e: any) {
    handleCommandError(e)
  }
})

cli.command('why <path>', 'Show recent commits with reasons for changes').option('-n, --num <number>', 'Number of commits to show', { default: 5 }).action(async (path: string, options: { num?: string }) => {
  try {
    const { repoRoot, pathspec } = await resolveTarget(path)
    setGitCwd(repoRoot)
    await why(pathspec, { num: Number.parseInt(String(options.num ?? '5'), 10) })
  }
  catch (e: any) {
    handleCommandError(e)
  }
})

cli.command('churn <path>', 'Show files with highest change frequency')
  .option('--since <date>', 'Start date (e.g. "6 months ago")')
  .option('--until <date>', 'End date')
  .option('-n, --num <number>', 'Number of files to show', { default: 20 })
  .action(async (path: string, options: { num?: string, since?: string, until?: string }) => {
    try {
      const { repoRoot, pathspec } = await resolveTarget(path)
      setGitCwd(repoRoot)
      if (options.since)
        sanitizeGitOption(options.since, 'since')
      if (options.until)
        sanitizeGitOption(options.until, 'until')
      await churn(pathspec, {
        num: Number.parseInt(String(options.num ?? '20'), 10),
        since: options.since,
        until: options.until,
      })
    }
    catch (e: any) {
      handleCommandError(e)
    }
  })

cli.command('onboarding <path>', 'Generate a project knowledge map for onboarding')
  .option('--output <file>', 'Output file path', { default: 'ONBOARDING.md' })
  .option('--since <date>', 'Date filter for churn/activity (e.g. "30 days ago")')
  .option('--stale-threshold <duration>', 'Stale file threshold (e.g. "6 months ago")', { default: '6 months ago' })
  .action(async (path: string, options: { output?: string, since?: string, staleThreshold?: string }) => {
    try {
      const { repoRoot, pathspec } = await resolveTarget(path)
      setGitCwd(repoRoot)
      if (options.since)
        sanitizeGitOption(options.since, 'since')
      sanitizeGitOption(options.staleThreshold ?? '6 months ago', 'stale-threshold')
      // Resolve output path relative to repo root
      const outputRaw = options.output ?? 'ONBOARDING.md'
      const outputPath = isAbsolute(outputRaw) ? outputRaw : resolve(repoRoot, outputRaw)
      await onboarding(pathspec, {
        output: outputPath,
        since: options.since,
        staleThreshold: options.staleThreshold,
      })
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
