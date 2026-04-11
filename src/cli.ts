#!/usr/bin/env bun
import { cac } from 'cac'
import consola from 'consola'
import { version } from '../package.json'
import { churn } from './commands/churn'
import { onboarding } from './commands/onboarding'
import { whoKnows } from './commands/who-knows'
import { why } from './commands/why'

const cli = cac('blamewise')

cli.command('who-knows <path>', 'Rank authors by expertise on a file').option('-n, --num <number>', 'Number of authors to show', { default: 10 }).action(async (path: string, options: { num?: string }) => {
  try {
    await whoKnows(path, { num: Number.parseInt(String(options.num ?? '10'), 10) })
  }
  catch (e: any) {
    consola.error(e)
    process.exit(1)
  }
})

cli.command('why <path>', 'Show recent commits with reasons for changes').option('-n, --num <number>', 'Number of commits to show', { default: 5 }).action(async (path: string, options: { num?: string }) => {
  try {
    await why(path, { num: Number.parseInt(String(options.num ?? '5'), 10) })
  }
  catch (e: any) {
    consola.error(e)
    process.exit(1)
  }
})

cli.command('churn <path>', 'Show files with highest change frequency')
  .option('--since <date>', 'Start date (e.g. "6 months ago")')
  .option('--until <date>', 'End date')
  .option('-n, --num <number>', 'Number of files to show', { default: 20 })
  .action(async (path: string, options: { num?: string, since?: string, until?: string }) => {
    try {
      await churn(path, {
        num: Number.parseInt(String(options.num ?? '20'), 10),
        since: options.since,
        until: options.until,
      })
    }
    catch (e: any) {
      consola.error(e)
      process.exit(1)
    }
  })

cli.command('onboarding <path>', 'Generate a project knowledge map for onboarding')
  .option('--output <file>', 'Output file path', { default: 'ONBOARDING.md' })
  .option('--since <date>', 'Date filter for churn/activity (e.g. "30 days ago")')
  .option('--stale-threshold <duration>', 'Stale file threshold (e.g. "6 months ago")', { default: '6 months ago' })
  .action(async (path: string, options: { output?: string, since?: string, staleThreshold?: string }) => {
    try {
      await onboarding(path, {
        output: options.output,
        since: options.since,
        staleThreshold: options.staleThreshold,
      })
    }
    catch (e: any) {
      consola.error(e)
      process.exit(1)
    }
  })

cli.help()
cli.version(version)

cli.parse()
if (!cli.args.length && !cli.matchedCommand) {
  cli.outputHelp()
}
