import { randomUUID } from 'node:crypto'
import { link, lstat, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve, relative, sep } from 'node:path'

import desktopE2EConfig from '../../../config/desktop-e2e.json' with { type: 'json' }
import {
  parseDesktopE2ECommandCancellationRequest,
  parseDesktopE2ECommandCancellationResult,
  parseDesktopE2ECommandInvocationContext,
  parseDesktopE2ECommandRunDescriptor,
  parseDesktopE2EConfig,
} from '../../../config/desktop-e2e-schema.mjs'
import { startProbe as defaultStartProbe } from './official-desktop-probe.mjs'

export async function createCommandInvocationContext({
  repositoryRoot,
  config: configValue,
  invocationId = randomUUID(),
  runnerPid = process.pid,
  runnerCwd = repositoryRoot,
  now = () => new Date(),
} = {}) {
  const config = parseDesktopE2EConfig(configValue)
  const repository = absolutePath(repositoryRoot, 'command runner repositoryRoot')
  const cwd = absolutePath(runnerCwd, 'command runner runnerCwd')
  if (!Number.isSafeInteger(runnerPid) || runnerPid < 1) throw new TypeError('command runner runnerPid must be a positive integer')
  const context = parseDesktopE2ECommandInvocationContext({
    schemaVersion: 1,
    invocationId,
    repositoryRoot: repository,
    runnerPid,
    runnerCwd: cwd,
    createdAt: now().toISOString(),
  })
  const root = resolve(repository, config.commandRunner.invocationsRelativePath)
  assertInside(repository, root, 'command runner invocation root')
  await mkdir(root, { recursive: true, mode: 0o700 })
  const directory = join(root, invocationId)
  await mkdir(directory, { mode: 0o700 })
  const descriptorsDirectory = join(directory, config.commandRunner.descriptorDirectoryName)
  await mkdir(descriptorsDirectory, { mode: 0o700 })
  await writeFile(join(directory, config.commandRunner.invocationFilename), `${JSON.stringify(context, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx', mode: 0o600,
  })
  return { ...context, config, directory, descriptorsDirectory }
}

export async function trackedStartProbe(options, { startProbe = defaultStartProbe } = {}) {
  const configuredEnvironmentName = options?.config?.commandRunner?.invocationDirectoryEnvironmentName
    ?? desktopE2EConfig.commandRunner.invocationDirectoryEnvironmentName
  const invocationDirectory = process.env[configuredEnvironmentName]
  if (invocationDirectory === undefined || invocationDirectory === '') return startProbe(options)
  if (typeof startProbe !== 'function') throw new TypeError('trackedStartProbe requires a startProbe function')
  if (!options || options.config === undefined || options.repositoryRoot === undefined) {
    throw new TypeError('command invocation context requires explicit startProbe config and repositoryRoot')
  }

  const config = parseDesktopE2EConfig(options.config)
  if (config.commandRunner.invocationDirectoryEnvironmentName !== configuredEnvironmentName) {
    throw new TypeError('command invocation context environment name does not match the supplied Desktop E2E config')
  }
  const repositoryRoot = absolutePath(options.repositoryRoot, 'tracked start repositoryRoot')
  const runId = options.runId ?? randomUUID()
  const context = await readCommandInvocationContext({ invocationDirectory, config })
  const descriptor = await registerCommandRunDescriptor({
    invocationDirectory,
    config,
    invocationId: context.invocationId,
    runId,
    repositoryRoot,
    registeredAt: new Date().toISOString(),
  })

  const controller = new AbortController()
  let callerAbortHandler
  const callerSignal = options.signal
  if (callerSignal?.aborted) controller.abort(callerSignal.reason ?? abortError('Desktop test command start was cancelled'))
  else if (callerSignal !== undefined) {
    callerAbortHandler = () => controller.abort(callerSignal.reason ?? abortError('Desktop test command start was cancelled'))
    callerSignal.addEventListener('abort', callerAbortHandler, { once: true })
  }

  let monitoring = true
  let monitorError = null
  const monitorPromise = monitorCancellationRequest({
    invocationDirectory,
    config,
    invocationId: context.invocationId,
    controller,
    isMonitoring: () => monitoring,
    onError(error) {
      monitorError = error
      if (!controller.signal.aborted) controller.abort(error)
    },
  })

  let result
  let startError = null
  let outcome = 'failed'
  let started = false
  let primaryError = null
  try {
    await applyCancellationRequest({ invocationDirectory, config, invocationId: context.invocationId, controller })
    if (controller.signal.aborted) throw abortError('Desktop test command was cancelled before Desktop startup')
    started = true
    result = await startProbe({ ...options, runId, signal: controller.signal })
    outcome = 'started'
  } catch (error) {
    primaryError = error
    if (controller.signal.aborted || error?.name === 'AbortError') {
      outcome = started ? 'cancelled' : 'cancelled-before-start'
      startError = started ? safeStartError(error) : null
    } else {
      outcome = 'failed'
      startError = safeStartError(error)
    }
    if (error instanceof Error) throw error
    throw new Error(String(error))
  } finally {
    monitoring = false
    if (callerAbortHandler !== undefined) callerSignal.removeEventListener('abort', callerAbortHandler)
    await monitorPromise
    const settledAt = new Date().toISOString()
    const finalDescriptor = {
      ...descriptor,
      state: 'settled',
      outcome,
      startError: outcome === 'failed' || outcome === 'cancelled' ? startError : null,
      settledAt,
    }
    try {
      await updateCommandRunDescriptor({ invocationDirectory, config, descriptor: finalDescriptor })
    } catch (descriptorError) {
      if (primaryError !== null) {
        throw new AggregateError([primaryError, descriptorError],
          'Desktop startup failed and its settlement descriptor could not be published', { cause: primaryError })
      }
      throw descriptorError
    }
    if (monitorError !== null && outcome === 'started') throw monitorError
  }
  return result
}

export async function publishCommandRunDescriptor({
  invocationDirectory,
  config: configValue,
  descriptor: descriptorValue,
} = {}, { writeTemporaryFile = writeFile } = {}) {
  const config = parseDesktopE2EConfig(configValue)
  const descriptor = parseDesktopE2ECommandRunDescriptor(descriptorValue)
  const context = await readCommandInvocationContext({ invocationDirectory, config })
  if (descriptor.invocationId !== context.invocationId) {
    throw new TypeError('command run descriptor belongs to another invocation')
  }
  const target = commandRunDescriptorPath(invocationDirectory, descriptor.runId, config)
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    await writeTemporaryFile(temporary, `${JSON.stringify(descriptor, null, 2)}\n`, {
      encoding: 'utf8', flag: 'wx', mode: 0o600,
    })
    await link(temporary, target)
    await unlink(temporary)
  } catch (error) {
    const cleanupError = await rm(temporary, { force: true }).then(() => null, cause => cause)
    if (cleanupError !== null) {
      throw new AggregateError([error, cleanupError], 'command descriptor publication and temporary file cleanup both failed', {
        cause: error,
      })
    }
    throw error
  }
  return descriptor
}

export async function readCommandRunDescriptors({ invocationDirectory, config: configValue } = {}) {
  const config = parseDesktopE2EConfig(configValue)
  const context = await readCommandInvocationContext({ invocationDirectory, config })
  const descriptorsDirectory = join(resolve(invocationDirectory), config.commandRunner.descriptorDirectoryName)
  let names
  try {
    names = await readdir(descriptorsDirectory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const descriptors = []
  for (const entry of names) {
    if (!entry.name.endsWith('.json')) continue
    if (!entry.isFile()) throw new TypeError(`command run descriptor is not a regular file: ${entry.name}`)
    const descriptor = parseDesktopE2ECommandRunDescriptor(JSON.parse(await readFile(join(descriptorsDirectory, entry.name), 'utf8')))
    if (descriptor.invocationId !== context.invocationId) {
      throw new TypeError(`command run descriptor ${entry.name} belongs to another invocation`)
    }
    if (entry.name !== `${descriptor.runId}.json`) {
      throw new TypeError(`command run descriptor filename does not match run ${descriptor.runId}`)
    }
    descriptors.push(descriptor)
  }
  return descriptors.sort((left, right) => left.registeredAt.localeCompare(right.registeredAt) || left.runId.localeCompare(right.runId))
}

export async function requestCommandCancellation({
  invocationDirectory,
  config: configValue,
  signal,
  now = () => new Date(),
} = {}) {
  const config = parseDesktopE2EConfig(configValue)
  const context = await readCommandInvocationContext({ invocationDirectory, config })
  const requestPath = join(resolve(invocationDirectory), config.commandRunner.cancellationFilename)
  try {
    const current = parseDesktopE2ECommandCancellationRequest(JSON.parse(await readFile(requestPath, 'utf8')))
    if (current.invocationId !== context.invocationId) throw new TypeError('cancellation request belongs to another invocation')
    return current
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const request = parseDesktopE2ECommandCancellationRequest({
    schemaVersion: 1,
    invocationId: context.invocationId,
    signal,
    requestedAt: now().toISOString(),
  })
  try {
    await writeNewAtomicJson(requestPath, request)
    return request
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    const existing = parseDesktopE2ECommandCancellationRequest(JSON.parse(await readFile(requestPath, 'utf8')))
    if (existing.invocationId !== context.invocationId) throw new TypeError('cancellation request belongs to another invocation')
    return existing
  }
}

export async function readCommandCancellationRequest({ invocationDirectory, config: configValue } = {}) {
  const config = parseDesktopE2EConfig(configValue)
  const context = await readCommandInvocationContext({ invocationDirectory, config })
  try {
    const request = parseDesktopE2ECommandCancellationRequest(JSON.parse(await readFile(
      join(resolve(invocationDirectory), config.commandRunner.cancellationFilename), 'utf8',
    )))
    if (request.invocationId !== context.invocationId) throw new TypeError('cancellation request belongs to another invocation')
    return request
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

export async function writeCommandCancellationResult({
  invocationDirectory,
  config: configValue,
  result: resultValue,
} = {}) {
  const config = parseDesktopE2EConfig(configValue)
  const context = await readCommandInvocationContext({ invocationDirectory, config })
  const result = parseDesktopE2ECommandCancellationResult(resultValue)
  if (result.invocationId !== context.invocationId || result.runnerPid !== context.runnerPid || result.runnerCwd !== context.runnerCwd) {
    throw new TypeError('command cancellation result does not match its invocation identity')
  }
  const path = join(resolve(invocationDirectory), config.commandRunner.resultFilename)
  await writeAtomicJson(path, result)
  return { result, path }
}

async function registerCommandRunDescriptor({
  invocationDirectory,
  config,
  invocationId,
  runId,
  repositoryRoot,
  registeredAt,
}) {
  const paths = commandRunPaths(repositoryRoot, runId, config)
  const descriptor = parseDesktopE2ECommandRunDescriptor({
    schemaVersion: 1,
    invocationId,
    runId,
    repositoryRoot,
    config,
    state: 'pending',
    outcome: null,
    paths,
    startError: null,
    registeredAt,
    settledAt: null,
  })
  return publishCommandRunDescriptor({ invocationDirectory, config, descriptor })
}

async function updateCommandRunDescriptor({ invocationDirectory, config, descriptor }) {
  const parsed = parseDesktopE2ECommandRunDescriptor(descriptor)
  const context = await readCommandInvocationContext({ invocationDirectory, config })
  if (parsed.invocationId !== context.invocationId) throw new TypeError('command run descriptor belongs to another invocation')
  await writeAtomicJson(commandRunDescriptorPath(invocationDirectory, parsed.runId, config), parsed)
}

function commandRunDescriptorPath(invocationDirectory, runId, config) {
  return join(resolve(invocationDirectory), config.commandRunner.descriptorDirectoryName, `${runId}.json`)
}

function commandRunPaths(repositoryRoot, runId, config) {
  const runDirectory = resolve(repositoryRoot, config.paths.runRootRelativePath, runId)
  const evidenceDirectory = join(runDirectory, config.paths.directoryNames.evidence)
  return {
    record: join(runDirectory, config.paths.runRecordFilename),
    preparationFailure: join(evidenceDirectory, config.paths.outputFilenames.preparationFailureEvidence),
    failure: join(evidenceDirectory, config.paths.outputFilenames.failureEvidence),
    cleanupFailure: join(evidenceDirectory, config.paths.outputFilenames.cleanupFailureEvidence),
    stopRequest: join(evidenceDirectory, config.paths.outputFilenames.stopRequestEvidence),
    stopResult: join(evidenceDirectory, config.paths.outputFilenames.stopResultEvidence),
  }
}

async function readCommandInvocationContext({ invocationDirectory, config }) {
  const directory = absolutePath(invocationDirectory, 'command invocation directory')
  const path = join(directory, config.commandRunner.invocationFilename)
  await assertRegularFile(path, 'command invocation context')
  const context = parseDesktopE2ECommandInvocationContext(JSON.parse(await readFile(path, 'utf8')))
  const expectedDirectory = resolve(context.repositoryRoot, config.commandRunner.invocationsRelativePath, context.invocationId)
  if (directory !== expectedDirectory) throw new TypeError('command invocation context directory does not match its recorded identity')
  return context
}

async function applyCancellationRequest({ invocationDirectory, config, invocationId, controller }) {
  const request = await readCommandCancellationRequest({ invocationDirectory, config })
  if (request === null) return
  if (request.invocationId !== invocationId) throw new TypeError('command cancellation request belongs to another invocation')
  if (!controller.signal.aborted) controller.abort(abortError(`Desktop test command received ${request.signal}`))
}

async function monitorCancellationRequest({
  invocationDirectory,
  config,
  invocationId,
  controller,
  isMonitoring,
  onError,
}) {
  while (isMonitoring()) {
    try {
      await applyCancellationRequest({ invocationDirectory, config, invocationId, controller })
      if (controller.signal.aborted) return
    } catch (error) {
      onError(error)
      return
    }
    await delay(config.startup.pollIntervalMs)
  }
}

async function assertRegularFile(path, label) {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink()) throw new TypeError(`${label} must be a regular file: ${path}`)
}

async function writeAtomicJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temporary, path)
  } catch (error) {
    const cleanupError = await rm(temporary, { force: true }).then(() => null, cause => cause)
    if (cleanupError !== null) throw new AggregateError([error, cleanupError], 'command cancellation evidence write and temporary file cleanup both failed')
    throw error
  }
}

async function writeNewAtomicJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await link(temporary, path)
    await unlink(temporary)
  } catch (error) {
    const cleanupError = await rm(temporary, { force: true }).then(() => null, cause => cause)
    if (cleanupError !== null) throw new AggregateError([error, cleanupError], 'command descriptor publication and temporary file cleanup both failed')
    throw error
  }
}

function absolutePath(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || !isAbsolute(value)) throw new TypeError(`${label} must be an absolute path`)
  return resolve(value)
}

function assertInside(root, target, label) {
  const relativeTarget = relative(root, target)
  if (relativeTarget === '..' || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
    throw new TypeError(`${label} must remain inside the runner repository`)
  }
}

function safeStartError(error) {
  const name = /^[A-Za-z][A-Za-z0-9]*$/u.test(error?.name ?? '') ? error.name : 'Error'
  const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/u.test(error.code) ? error.code : null
  return { name, code }
}

function abortError(message) {
  return Object.assign(new Error(message), { name: 'AbortError' })
}

function delay(timeoutMs) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, timeoutMs))
}
