#!/usr/bin/env node

import { realpathSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateInstallation } from './contracts.mjs'
import { runProductInstall } from './install.mjs'
import { beginProductOperation, finishProductOperation } from './lifecycle.mjs'
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

function parseArtifactArguments(argv, command) {
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
    throw new Error(`usage: harness-comfyui ${command} --installation <absolute-json> --artifact <absolute-tarball>`)
  }
  return options
}

export function parsePreflightArguments(argv) {
  return parseArtifactArguments(argv, 'preflight')
}

export function parseInstallArguments(argv) {
  return parseArtifactArguments(argv, 'install')
}

export function parseLifecycleArguments(argv, command) {
  const options = { json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--json') {
      if (options.json) throw new Error('duplicate option: --json')
      options.json = true
      continue
    }
    if (argument !== '--installation') throw new Error(`unknown option: ${argument}`)
    if (options.installation) throw new Error('duplicate option: --installation')
    options.installation = requireAbsoluteArgument(argv[index + 1], argument)
    index += 1
  }
  if (!options.installation || (command === 'health' && !options.json)) {
    throw new Error(`usage: harness-comfyui ${command}${command === 'status' || command === 'health' ? ' --json' : ''} --installation <absolute-json>`)
  }
  return options
}

export function parseLogsArguments(argv) {
  const options = { follow: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--follow') {
      if (options.follow) throw new Error('duplicate option: --follow')
      options.follow = true
      continue
    }
    if (argument !== '--installation' && argument !== '--source' && argument !== '--lines') {
      throw new Error(`unknown option: ${argument}`)
    }
    const key = argument.slice(2)
    if (Object.hasOwn(options, key)) throw new Error(`duplicate option: ${argument}`)
    const value = argv[index + 1]
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      throw new Error(`${argument} requires a value`)
    }
    if (argument === '--installation') options.installation = requireAbsoluteArgument(value, argument)
    else if (argument === '--source') {
      if (!['stdout', 'stderr', 'operations', 'all'].includes(value)) {
        throw new Error('--source must be stdout, stderr, operations, or all')
      }
      options.source = value
    } else {
      if (!/^[1-9]\d*$/u.test(value)) throw new Error('--lines must be a positive integer')
      const lines = Number(value)
      if (!Number.isSafeInteger(lines) || lines <= 0) throw new Error('--lines must be a positive integer')
      options.lines = lines
    }
    index += 1
  }
  if (!options.installation || !options.source || options.lines === undefined) {
    throw new Error('usage: harness-comfyui logs --installation <absolute-json> --source <stdout|stderr|operations|all> --lines <positive-integer> [--follow]')
  }
  return options
}

async function runLifecycleCommand(command, installation, commandOptions = undefined, operation = undefined) {
  if (command === 'start') {
    const module = await import('./start.mjs')
    return module.runProductStart(installation, operation)
  }
  if (command === 'stop') {
    const module = await import('./stop.mjs')
    return module.runProductStop(installation)
  }
  if (command === 'restart') {
    const module = await import('./restart.mjs')
    return module.runProductRestart(installation, operation)
  }
  if (command === 'health') {
    const module = await import('./health.mjs')
    return module.runProductHealth(installation)
  }
  if (command === 'logs') {
    const module = await import('./logs.mjs')
    return module.runProductLogs(installation, commandOptions)
  }
  if (command === 'upgrade') {
    const module = await import('./upgrade.mjs')
    return module.runProductUpgrade(installation, commandOptions.artifact, operation)
  }
  const module = await import('./status.mjs')
  return module.runProductStatus(installation)
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === '--help')) {
    process.stdout.write(helpText())
    return 0
  }

  const [command, ...commandArguments] = argv
  if (!COMMANDS.includes(command)) throw new Error(`unknown command: ${command}`)
  if (command !== 'preflight' && command !== 'install' && command !== 'upgrade') {
    if (command !== 'start' && command !== 'stop' && command !== 'restart' && command !== 'status' && command !== 'health' && command !== 'logs') {
      throw new Error(`command ${command} is not implemented in this slice`)
    }
  }

  const options = command === 'preflight' || command === 'install' || command === 'upgrade'
    ? parseArtifactArguments(commandArguments, command)
    : command === 'logs'
      ? parseLogsArguments(commandArguments)
      : parseLifecycleArguments(commandArguments, command)
  const installation = await readJson(options.installation)
  const validatedInstallation = validateInstallation(installation)
  const operation = await beginProductOperation(validatedInstallation, command)
  let terminalRecorded = false
  try {
    let evidence
    if (command === 'preflight') evidence = await runProductPreflight(validatedInstallation, options.artifact)
    else if (command === 'install') evidence = await runProductInstall(validatedInstallation, options.artifact)
    else evidence = await runLifecycleCommand(command, validatedInstallation, options, operation)
    const failed = evidence?.status === 'failed' || (command === 'health' && evidence?.status !== 'passed')
    await finishProductOperation(operation, validatedInstallation, failed ? 'failed' : 'passed')
    terminalRecorded = true
    if (command !== 'logs') process.stdout.write(`${JSON.stringify(evidence)}\n`)
    return failed ? 1 : 0
  } catch (error) {
    if (!terminalRecorded) await finishProductOperation(operation, validatedInstallation, 'failed')
    throw error
  }
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
      process.stderr.write(`harness-comfyui: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    },
  )
}
