#!/usr/bin/env node

import help from '../../config/web-cli-help.json' with { type: 'json' }
import { presentationArguments, renderHelp, helpHint, nextSteps } from '../cli/help.mjs'

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { prepareDesktopDevelopmentCheckout } from '../desktop/development-checkout.mjs'
import { SOURCE_PRODUCTION_COMMANDS } from '../production/commands.mjs'

export function helpText() { return renderHelp(help, ['--help']) }

export function parseArguments(argv) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === '--help')) return { command: 'help' }
  if (argv.length !== 1) throw new Error('Web Host commands do not accept arguments')
  const [command] = argv
  if (!SOURCE_PRODUCTION_COMMANDS.includes(command)) throw new Error(`unknown Web Host command: ${command}`)
  return { command }
}

export async function runWebHostCommand(command, options = {}) {
  if (command === 'start' || command === 'restart') {
    await (options.prepareCheckout ?? prepareDesktopDevelopmentCheckout)(options.checkoutOptions)
  }
  const runSourceProductionCommand = options.runSourceProductionCommand
    ?? (await import('../production/cli.mjs')).runSourceProductionCommand
  const runtime = options.runtime ?? await import('./runtime.mjs')
  return runSourceProductionCommand(command, {
    ...options,
    loadContext: options.loadContext ?? runtime.loadSourceWorktreeContext,
    loadSavedContext: options.loadSavedContext ?? runtime.loadSavedSourceWorktreeContext,
    prepareRuntime: options.prepareRuntime ?? runtime.prepareSourceWorktreeRuntime,
    releaseContext: options.releaseContext ?? runtime.releaseSourceWorktreeContext,
    startOptions: options.startOptions ?? runtime.sourceWorktreeStartOptions,
    commandPrefix: 'web',
  })
}

export async function main(argv = process.argv.slice(2)) {
  const { args, quiet } = presentationArguments(argv)
  const output = renderHelp(help, args)
  if (output !== undefined) { process.stdout.write(output); return 0 }
  let command
  try { ({ command } = parseArguments(args)) } catch (error) { throw new Error(`${error.message}. ${helpHint(help, args)}`) }
  if (command === 'help') {
    process.stdout.write(helpText())
    return 0
  }
  const result = await runWebHostCommand(command)
  if (command !== 'logs') process.stdout.write(`${JSON.stringify(result.evidence)}\n`)
  nextSteps(help, command, quiet && !result.failed, { status: result.evidence.status })
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
      process.stderr.write(`Web Host: ${error instanceof Error ? error.message : String(error)} ${helpHint(help, process.argv.slice(2))}\n`)
      process.exitCode = 1
    },
  )
}
