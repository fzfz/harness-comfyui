#!/usr/bin/env node

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { runSourceProductionCommand } from '../production/cli.mjs'
import { SOURCE_PRODUCTION_COMMANDS } from '../production/runtime.mjs'
import { loadSavedSourceWorktreeContext, loadSourceWorktreeContext } from './runtime.mjs'

export function helpText() {
  return [
    'Usage: pnpm worktree:<command>',
    '',
    'Commands:',
    '  start    Start the current linked worktree with the development profile',
    '  stop     Stop the managed linked-worktree process',
    '  restart  Restart the managed linked-worktree process',
    '  status   Show managed linked-worktree process status',
    '  health   Check managed linked-worktree process health',
    '  logs     Read managed linked-worktree process logs',
    '',
  ].join('\n')
}

export function parseArguments(argv) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === '--help')) return { command: 'help' }
  if (argv.length !== 1) throw new Error('source worktree commands do not accept arguments')
  const [command] = argv
  if (!SOURCE_PRODUCTION_COMMANDS.includes(command)) throw new Error(`unknown source worktree command: ${command}`)
  return { command }
}

export async function runSourceWorktreeCommand(command, options = {}) {
  return runSourceProductionCommand(command, {
    ...options,
    loadContext: options.loadContext ?? loadSourceWorktreeContext,
    loadSavedContext: options.loadSavedContext ?? loadSavedSourceWorktreeContext,
    commandPrefix: 'worktree',
  })
}

export async function main(argv = process.argv.slice(2)) {
  const { command } = parseArguments(argv)
  if (command === 'help') {
    process.stdout.write(helpText())
    return 0
  }
  const result = await runSourceWorktreeCommand(command)
  if (command !== 'logs') process.stdout.write(`${JSON.stringify(result.evidence)}\n`)
  return result.failed ? 1 : 0
}

function isMainModule() {
  if (process.argv[1] === undefined) return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMainModule()) {
  main().then(
    status => { process.exitCode = status },
    error => {
      process.stderr.write(`source worktree: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    },
  )
}
