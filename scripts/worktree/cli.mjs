#!/usr/bin/env node

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { prepareDevelopmentCheckout } from '../desktop/development-checkout.mjs'
import { SOURCE_PRODUCTION_COMMANDS } from '../production/commands.mjs'

export function helpText() {
  return [
    'Usage: pnpm web:<command>',
    '',
    'Commands:',
    '  start    Start the Web Host in the current linked worktree',
    '  stop     Stop the managed Web Host process',
    '  restart  Restart the managed Web Host process',
    '  status   Show managed Web Host process status',
    '  health   Check managed Web Host process health',
    '  logs     Read managed Web Host process logs',
    '',
  ].join('\n')
}

export function parseArguments(argv) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === '--help')) return { command: 'help' }
  if (argv.length !== 1) throw new Error('Web Host commands do not accept arguments')
  const [command] = argv
  if (!SOURCE_PRODUCTION_COMMANDS.includes(command)) throw new Error(`unknown Web Host command: ${command}`)
  return { command }
}

export async function runWebHostCommand(command, options = {}) {
  if (command === 'start' || command === 'restart') {
    await (options.prepareCheckout ?? prepareDevelopmentCheckout)(options.checkoutOptions)
  }
  const runSourceProductionCommand = options.runSourceProductionCommand
    ?? (await import('../production/cli.mjs')).runSourceProductionCommand
  const runtime = options.runtime ?? await import('./runtime.mjs')
  return runSourceProductionCommand(command, {
    ...options,
    loadContext: options.loadContext ?? runtime.loadSourceWorktreeContext,
    loadSavedContext: options.loadSavedContext ?? runtime.loadSavedSourceWorktreeContext,
    prepareRuntime: options.prepareRuntime ?? runtime.prepareSourceWorktreeRuntime,
    commandPrefix: 'web',
  })
}

export async function main(argv = process.argv.slice(2)) {
  const { command } = parseArguments(argv)
  if (command === 'help') {
    process.stdout.write(helpText())
    return 0
  }
  const result = await runWebHostCommand(command)
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
      process.stderr.write(`Web Host: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    },
  )
}
