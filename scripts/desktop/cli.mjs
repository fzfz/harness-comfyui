#!/usr/bin/env node

import help from '../../config/desktop-cli-help.json' with { type: 'json' }
import { presentationArguments, renderHelp, helpHint, nextSteps } from '../cli/help.mjs'

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { prepareDesktopDevelopmentCheckout } from './development-checkout.mjs'
import { prepareDesktopDevelopmentSettings } from './development-settings.mjs'
import {
  desktopWorktreeStatus,
  loadDesktopWorktreeContext,
  readDesktopWorktreeLogs,
  startDesktopWorktree,
  stopDesktopWorktree,
} from './anywhere.mjs'

const COMMANDS = Object.freeze(['start', 'stop', 'restart', 'status', 'logs'])

export function parseArguments(argv) {
  if (argv.length === 1 && COMMANDS.includes(argv[0])) return { command: argv[0] }
  throw new Error('Desktop command must be one of: start, stop, restart, status, logs')
}

export async function runDesktopLifecycleCommand(command, options = {}) {
  const context = options.loadedContext
    ?? await (options.loadContext ?? loadDesktopWorktreeContext)(options.contextOptions)
  if (command === 'status') return desktopWorktreeStatus(context, options)
  if (command === 'stop') return stopDesktopWorktree(context, options)
  if (command === 'logs') return { status: 'logs', output: await readDesktopWorktreeLogs(context) }
  if (command === 'restart') await stopDesktopWorktree(context, options)
  return startDesktopWorktree(context, options)
}

export async function runDesktopDevelopmentCommand(command, options = {}) {
  if (command === 'start' || command === 'restart') {
    const checkout = await (options.prepareCheckout ?? prepareDesktopDevelopmentCheckout)(options.contextOptions)
    const context = await (options.loadContext ?? loadDesktopWorktreeContext)(options.contextOptions)
    const preparedSettings = await (
      options.prepareDevelopmentSettings ?? prepareDesktopDevelopmentSettings
    )({ checkout, context })
    return runDesktopLifecycleCommand(command, {
      ...options,
      loadedContext: context,
      prepareDesktopSettings: preparedSettings.materialize,
    })
  }
  return runDesktopLifecycleCommand(command, options)
}

export async function runDesktopCommandMain(argv, runCommand, definition = help) {
  const { args, quiet } = presentationArguments(argv)
  const output = renderHelp(definition, args)
  if (output !== undefined) { process.stdout.write(output); return 0 }
  let command
  try { ({ command } = parseArguments(args)) } catch (error) { throw new Error(`${error.message}. ${helpHint(definition, args)}`) }
  let result
  try { result = await runCommand(command) } catch (error) { throw new Error(`${error.message}. ${helpHint(definition, args)}`) }
  if (result.status === 'logs') process.stdout.write(result.output)
  else process.stdout.write(`${JSON.stringify(result)}\n`)
  nextSteps(definition, command, quiet && result.status !== 'failed', { status: result.status })
  return result.status === 'failed' ? 1 : 0
}

export async function main(argv = process.argv.slice(2)) {
  return runDesktopCommandMain(argv, runDesktopDevelopmentCommand)
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
      process.stderr.write(`desktop development: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    },
  )
}
