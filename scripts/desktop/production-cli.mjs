#!/usr/bin/env node

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  parseArguments,
  runDesktopCommandMain,
  runDesktopLifecycleCommand,
} from './cli.mjs'
import { loadDesktopProductionContext } from './worktree.mjs'

export { parseArguments }

export async function runDesktopProductionCommand(command, options = {}) {
  return runDesktopLifecycleCommand(command, {
    ...options,
    loadContext: options.loadContext ?? loadDesktopProductionContext,
  })
}

export async function main(argv = process.argv.slice(2)) {
  return runDesktopCommandMain(argv, runDesktopProductionCommand)
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
      process.stderr.write(`desktop production: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    },
  )
}
