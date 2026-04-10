#!/usr/bin/env bun
import { cac } from 'cac'
import consola from 'consola'
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

cli.help()
cli.version('0.1.0')

cli.parse()
if (!cli.args.length && !cli.matchedCommand) {
  cli.outputHelp()
}
