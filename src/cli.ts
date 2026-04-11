#!/usr/bin/env bun
import { cac } from 'cac'
import consola from 'consola'
import { churn } from './commands/churn'
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

cli.help()
cli.version('0.2.0')

cli.parse()
if (!cli.args.length && !cli.matchedCommand) {
  cli.outputHelp()
}
