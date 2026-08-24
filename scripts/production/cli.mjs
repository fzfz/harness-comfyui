#!/usr/bin/env node

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { runSourceHealth } from './health.mjs'
import { runSourceLogs } from './logs.mjs'
import { beginSourceOperation, finishSourceOperation, processStatePath, readProcessState } from './process.mjs'
import { runSourceStart } from './start.mjs'
import { runSourceStatus } from './status.mjs'
import { runSourceStop } from './stop.mjs'
import {
  SOURCE_PRODUCTION_COMMANDS,
  clearSourceManagedState,
  loadSavedSourceManagedContext,
  loadSourceManagedContext,
  loadSourceProductionContext,
  loadSourceRuntimeTarget,
  prepareSourceRuntime,
} from './runtime.mjs'

export function helpText() {
  return [
    'Usage: pnpm prod:<command>',
    '',
    'Commands:',
    '  start    Start the current source with the production profile',
    '  stop     Stop the managed source process',
    '  restart  Restart the managed source process',
    '  status   Show managed source process status',
    '  health   Check managed source process health',
    '  logs     Read managed source process logs',
    '',
  ].join('\n')
}

export function parseArguments(argv) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === '--help')) return { command: 'help' }
  if (argv.length !== 1) throw new Error('source production commands do not accept arguments')
  const [command] = argv
  if (!SOURCE_PRODUCTION_COMMANDS.includes(command)) throw new Error(`unknown source production command: ${command}`)
  return { command }
}

async function runOperation(context, command, activeVersion, action) {
  const operation = await beginSourceOperation(context.runtime, command, activeVersion)
  try {
    const evidence = await action(operation)
    const failed = evidence?.status === 'failed'
    await finishSourceOperation(
      operation,
      context.runtime,
      failed ? 'failed' : 'passed',
      evidence?.activeVersion ?? activeVersion,
    )
    return { evidence, failed }
  } catch (error) {
    await finishSourceOperation(operation, context.runtime, 'failed', activeVersion)
    throw error
  }
}

async function loadStatusTarget(context) {
  const state = await readProcessState(processStatePath(context.runtime.runtimeRoot))
  if (state === null) return { activeVersion: context.activeVersion }
  return loadSourceRuntimeTarget(context, { validateRuntime: state !== null })
}

async function loadNonValidatingTarget(context) {
  const state = await readProcessState(processStatePath(context.runtime.runtimeRoot))
  if (state === null) return { activeVersion: context.activeVersion }
  return loadSourceRuntimeTarget(context, { validateRuntime: false })
}

export async function runSourceProductionCommand(command, options = {}) {
  let currentContext
  let managedContext
  const loadCurrentContext = async () => {
    currentContext ??= await (options.loadContext ?? loadSourceProductionContext)(options.contextOptions)
    return currentContext
  }
  if (options.loadContext === undefined) {
    managedContext = await loadSavedSourceManagedContext(options.contextOptions)
  } else {
    const loadedContext = await loadCurrentContext()
    managedContext = await loadSourceManagedContext(loadedContext)
    if (!managedContext.managedStatePresent) managedContext = undefined
  }
  if (command === 'start') {
    if (managedContext !== undefined) {
      throw new Error('a source production process is already registered; run pnpm prod:stop or pnpm prod:restart')
    }
    const context = await loadCurrentContext()
    try {
      const runtimeTarget = await prepareSourceRuntime(context)
      return await runOperation(context, command, runtimeTarget.activeVersion, operation => (
        runSourceStart(context.runtime, runtimeTarget, operation)
      ))
    } finally {
      await clearSourceManagedState(context)
    }
  }
  if (command === 'stop') {
    const context = managedContext ?? await loadCurrentContext()
    const runtimeTarget = await loadNonValidatingTarget(context)
    const result = await runOperation(context, command, runtimeTarget.activeVersion, () => (
      runSourceStop(context.runtime, runtimeTarget)
    ))
    if (result.evidence.status === 'stopped') await clearSourceManagedState(context)
    return result
  }
  if (command === 'restart') {
    const context = await loadCurrentContext()
    const previousContext = managedContext ?? context
    const previousTarget = await loadNonValidatingTarget(previousContext)
    let previousStopped = false
    try {
      return await runOperation(context, command, context.activeVersion, async operation => {
        await runSourceStop(previousContext.runtime, previousTarget)
        previousStopped = true
        await clearSourceManagedState(previousContext)
        const runtimeTarget = await prepareSourceRuntime(context)
        const evidence = await runSourceStart(context.runtime, runtimeTarget, operation)
        return { ...evidence, stage: 'restart' }
      })
    } finally {
      if (previousStopped) await clearSourceManagedState(context)
    }
  }
  if (command === 'status') {
    const context = managedContext ?? await loadCurrentContext()
    const runtimeTarget = await loadStatusTarget(context)
    const result = await runOperation(context, command, runtimeTarget.activeVersion, () => (
      runSourceStatus(context.runtime, runtimeTarget)
    ))
    if (result.evidence.status === 'stopped') await clearSourceManagedState(context)
    return result
  }
  if (command === 'health') {
    const context = managedContext ?? await loadCurrentContext()
    let runtimeTarget
    let runtimeResolutionError
    try {
      runtimeTarget = await loadSourceRuntimeTarget(context)
    } catch (error) {
      runtimeResolutionError = error
    }
    const activeVersion = runtimeTarget?.activeVersion ?? context.activeVersion
    return runOperation(context, command, activeVersion, () => (
      runSourceHealth(context.runtime, runtimeTarget, runtimeResolutionError)
    ))
  }
  const context = managedContext ?? await loadCurrentContext()
  const runtimeTarget = await loadNonValidatingTarget(context)
  return runOperation(context, command, runtimeTarget.activeVersion, () => (
    runSourceLogs(context.runtime, {
      source: context.definition.logs.source,
      lines: context.definition.logs.lines,
      follow: false,
    })
  ))
}

export async function main(argv = process.argv.slice(2)) {
  const { command } = parseArguments(argv)
  if (command === 'help') {
    process.stdout.write(helpText())
    return 0
  }
  const result = await runSourceProductionCommand(command)
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
      process.stderr.write(`source production: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    },
  )
}
