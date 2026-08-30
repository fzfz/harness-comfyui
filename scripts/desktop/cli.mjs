#!/usr/bin/env node

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { prepareDesktopDevelopmentCheckout } from './development-checkout.mjs'
import {
  desktopWorktreeStatus,
  loadDesktopWorktreeContext,
  readDesktopWorktreeLogs,
  startDesktopWorktree,
  stopDesktopWorktree,
} from './worktree.mjs'

const COMMANDS = Object.freeze(['start', 'stop', 'restart', 'status', 'logs'])

export function parseArguments(argv) {
  if (argv.length === 1 && COMMANDS.includes(argv[0])) return { command: argv[0] }
  throw new Error('Desktop command must be one of: start, stop, restart, status, logs')
}

export async function runDesktopLifecycleCommand(command, options = {}) {
  const context = await (options.loadContext ?? loadDesktopWorktreeContext)(options.contextOptions)
  if (command === 'status') return desktopWorktreeStatus(context, options)
  if (command === 'stop') return stopDesktopWorktree(context, options)
  if (command === 'logs') return { status: 'logs', output: await readDesktopWorktreeLogs(context) }
  if (command === 'restart') await stopDesktopWorktree(context, options)
  return startDesktopWorktree(context, options)
}

export async function runDesktopDevelopmentCommand(command, options = {}) {
  if (command === 'start' || command === 'restart') {
    await (options.prepareCheckout ?? prepareDesktopDevelopmentCheckout)(options.contextOptions)
  }
  return runDesktopLifecycleCommand(command, options)
}

export async function runDesktopCommandMain(argv, runCommand) {
  const { command } = parseArguments(argv)
  const result = await runCommand(command)
  if (result.status === 'logs') process.stdout.write(result.output)
  else process.stdout.write(`${JSON.stringify(result)}\n`)
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
