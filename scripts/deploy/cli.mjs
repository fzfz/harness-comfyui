#!/usr/bin/env node

import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readJson, runProductPreflight } from './preflight.mjs'

export const COMMANDS = Object.freeze([
  'install', 'preflight', 'start', 'stop', 'restart',
  'status', 'health', 'logs', 'upgrade', 'rollback',
])

export function helpText() {
  return [
    'Usage: harness-comfyui <command> [options]',
    '',
    'Commands:',
    '  install    Install a release artifact',
    '  preflight  Validate an installation and release artifact',
    '  start      Start the active release',
    '  stop       Stop the active release',
    '  restart    Restart the active release',
    '  status     Show installation status',
    '  health     Check installation health',
    '  logs       Read installation logs',
    '  upgrade    Install and activate a newer release',
    '  rollback   Restore the previous release',
    '',
  ].join('\n')
}

function requireAbsoluteArgument(value, flag) {
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
    throw new Error(`${flag} requires an absolute path`)
  }
  if (!isAbsolute(value)) throw new Error(`${flag} must be an absolute path`)
  return resolve(value)
}

export function parsePreflightArguments(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument !== '--installation' && argument !== '--artifact') {
      throw new Error(`unknown option: ${argument}`)
    }
    if (Object.hasOwn(options, argument.slice(2))) throw new Error(`duplicate option: ${argument}`)
    options[argument.slice(2)] = requireAbsoluteArgument(argv[index + 1], argument)
    index += 1
  }
  if (!options.installation || !options.artifact) {
    throw new Error('usage: harness-comfyui preflight --installation <absolute-json> --artifact <absolute-tarball>')
  }
  return options
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === '--help')) {
    process.stdout.write(helpText())
    return 0
  }

  const [command, ...commandArguments] = argv
  if (!COMMANDS.includes(command)) throw new Error(`unknown command: ${command}`)
  if (command !== 'preflight') {
    throw new Error(`command ${command} is not implemented in this slice`)
  }

  const options = parsePreflightArguments(commandArguments)
  const installation = await readJson(options.installation)
  const evidence = await runProductPreflight(installation, options.artifact)
  process.stdout.write(`${JSON.stringify(evidence)}\n`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    status => { process.exitCode = status },
    error => {
      process.stderr.write(`harness-comfyui: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    },
  )
}
