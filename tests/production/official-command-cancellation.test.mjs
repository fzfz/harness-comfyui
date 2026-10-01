import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import desktopE2EConfig from '../../config/desktop-e2e.json' with { type: 'json' }
import { parseDesktopE2EConfig } from '../../config/desktop-e2e-schema.mjs'
import {
  createCommandInvocationContext,
  publishCommandRunDescriptor,
  readCommandRunDescriptors,
  requestCommandCancellation,
  trackedStartProbe,
} from '../desktop/fixtures/official-command-cancellation.mjs'

const temporaryRoots = new Set()

afterEach(async () => {
  for (const root of temporaryRoots) await rm(root, { recursive: true, force: true })
  temporaryRoots.clear()
})

describe('official Desktop command cancellation', () => {
  it('requires the configured pending-start drain window to cover startup, stop, and kill timeouts', () => {
    const config = structuredClone(desktopE2EConfig)
    config.commandRunner.pendingStartDrainTimeoutMs = config.startup.startupTimeoutMs
      + config.startup.stopTimeoutMs + config.startup.killTimeoutMs - 1

    expect(() => parseDesktopE2EConfig(config)).toThrow(/must cover startup, stop and kill timeouts/u)
  })

  it('publishes a pending descriptor before calling startProbe and keeps it pending until startup settles', async () => {
    const root = await createRoot()
    const context = await createCommandInvocationContext({ repositoryRoot: root, config: desktopE2EConfig })
    const runId = '2b22050f-5c34-4e8f-bdf2-9d31f04a8c44'
    let settleStart
    let capturedOptions
    await withInvocationEnvironment(context, async () => {
      const start = trackedStartProbe({ runId, repositoryRoot: root, config: desktopE2EConfig, mode: 'development' }, {
        startProbe(options) {
          capturedOptions = options
          return new Promise(resolve => { settleStart = resolve })
        },
      })

      await waitUntil(async () => capturedOptions !== undefined
        && (await readCommandRunDescriptors({ invocationDirectory: context.directory, config: desktopE2EConfig })).length === 1)
      expect(capturedOptions).toMatchObject({ runId, repositoryRoot: root, config: desktopE2EConfig })
      expect(capturedOptions.signal).toBeInstanceOf(AbortSignal)
      expect((await readCommandRunDescriptors({ invocationDirectory: context.directory, config: desktopE2EConfig }))[0])
        .toMatchObject({ state: 'pending', runId, invocationId: context.invocationId })

      settleStart({ record: { runId }, recordPath: join(root, 'run.json') })
      await expect(start).resolves.toMatchObject({ record: { runId } })
      expect((await readCommandRunDescriptors({ invocationDirectory: context.directory, config: desktopE2EConfig }))[0])
        .toMatchObject({ state: 'settled', outcome: 'started' })
    })
  })

  it('keeps a partially written descriptor invisible until the complete JSON is published', async () => {
    const root = await createRoot()
    const context = await createCommandInvocationContext({ repositoryRoot: root, config: desktopE2EConfig })
    const runId = '44181238-7485-4e2e-8c34-7e618a0f529c'
    const runDirectory = join(root, desktopE2EConfig.paths.runRootRelativePath, runId)
    const evidenceDirectory = join(runDirectory, desktopE2EConfig.paths.directoryNames.evidence)
    const descriptor = {
      schemaVersion: 1,
      invocationId: context.invocationId,
      runId,
      repositoryRoot: root,
      config: desktopE2EConfig,
      state: 'pending',
      outcome: null,
      paths: {
        record: join(runDirectory, desktopE2EConfig.paths.runRecordFilename),
        preparationFailure: join(evidenceDirectory, desktopE2EConfig.paths.outputFilenames.preparationFailureEvidence),
        failure: join(evidenceDirectory, desktopE2EConfig.paths.outputFilenames.failureEvidence),
        cleanupFailure: join(evidenceDirectory, desktopE2EConfig.paths.outputFilenames.cleanupFailureEvidence),
        stopRequest: join(evidenceDirectory, desktopE2EConfig.paths.outputFilenames.stopRequestEvidence),
        stopResult: join(evidenceDirectory, desktopE2EConfig.paths.outputFilenames.stopResultEvidence),
      },
      startError: null,
      registeredAt: new Date().toISOString(),
      settledAt: null,
    }
    let partialPath

    await publishCommandRunDescriptor({ invocationDirectory: context.directory, config: desktopE2EConfig, descriptor }, {
      async writeTemporaryFile(path, contents, options) {
        partialPath = path
        expect(path).not.toMatch(/\.json$/u)
        const midpoint = Math.floor(contents.length / 2)
        await writeFile(path, contents.slice(0, midpoint), options)
        expect(await readCommandRunDescriptors({ invocationDirectory: context.directory, config: desktopE2EConfig })).toEqual([])
        await writeFile(path, contents.slice(midpoint), { encoding: 'utf8', flag: 'a' })
      },
    })

    expect(partialPath).toContain('.tmp')
    expect((await readCommandRunDescriptors({ invocationDirectory: context.directory, config: desktopE2EConfig }))[0])
      .toMatchObject({ invocationId: context.invocationId, runId, state: 'pending' })
  })

  it('rejects a duplicate run descriptor without replacing the first descriptor', async () => {
    const root = await createRoot()
    const context = await createCommandInvocationContext({ repositoryRoot: root, config: desktopE2EConfig })
    const runId = 'bc938088-13bc-4ea8-9b0c-f10935331fde'
    let starts = 0

    await withInvocationEnvironment(context, async () => {
      await trackedStartProbe({ runId, repositoryRoot: root, config: desktopE2EConfig, mode: 'development' }, {
        async startProbe() { starts += 1; return { record: { runId } } },
      })
      await expect(trackedStartProbe({ runId, repositoryRoot: root, config: desktopE2EConfig, mode: 'development' }, {
        async startProbe() { starts += 1; return { record: { runId } } },
      })).rejects.toMatchObject({ code: 'EEXIST' })
    })

    expect(starts).toBe(1)
    expect(await readCommandRunDescriptors({ invocationDirectory: context.directory, config: desktopE2EConfig }))
      .toMatchObject([{ invocationId: context.invocationId, runId, state: 'settled', outcome: 'started' }])
  })

  it('aborts a registered pending start and waits for its cleanup result before marking the descriptor settled', async () => {
    const root = await createRoot()
    const context = await createCommandInvocationContext({ repositoryRoot: root, config: desktopE2EConfig })
    const runId = '364d9cef-79f6-46ab-89a9-ae1857ddb3b2'
    let settleStart
    let capturedOptions
    await withInvocationEnvironment(context, async () => {
      const start = trackedStartProbe({ runId, repositoryRoot: root, config: desktopE2EConfig, mode: 'development' }, {
        startProbe(options) {
          capturedOptions = options
          return new Promise((resolve, reject) => {
            settleStart = () => reject(Object.assign(new Error('controlled start cleanup complete'), { name: 'AbortError' }))
          })
        },
      })

      await waitUntil(async () => capturedOptions !== undefined
        && (await readCommandRunDescriptors({ invocationDirectory: context.directory, config: desktopE2EConfig })).length === 1)
      await requestCommandCancellation({ invocationDirectory: context.directory, config: desktopE2EConfig, signal: 'SIGTERM' })
      await waitUntil(async () => capturedOptions?.signal?.aborted === true)
      expect((await readCommandRunDescriptors({ invocationDirectory: context.directory, config: desktopE2EConfig }))[0])
        .toMatchObject({ state: 'pending' })

      settleStart()
      await expect(start).rejects.toMatchObject({ name: 'AbortError' })
      expect((await readCommandRunDescriptors({ invocationDirectory: context.directory, config: desktopE2EConfig }))[0])
        .toMatchObject({ state: 'settled', outcome: 'cancelled' })
    })
  })

  it('rejects a late start after the command cancellation marker exists without preparing or spawning', async () => {
    const root = await createRoot()
    const context = await createCommandInvocationContext({ repositoryRoot: root, config: desktopE2EConfig })
    await requestCommandCancellation({ invocationDirectory: context.directory, config: desktopE2EConfig, signal: 'SIGINT' })
    const runId = '92e3586c-6efd-4b1d-a42d-62a70ed62923'
    let starts = 0

    await withInvocationEnvironment(context, async () => {
      await expect(trackedStartProbe({ runId, repositoryRoot: root, config: desktopE2EConfig, mode: 'development' }, {
        async startProbe() { starts += 1 },
      })).rejects.toMatchObject({ name: 'AbortError' })

      expect(starts).toBe(0)
      expect((await readCommandRunDescriptors({ invocationDirectory: context.directory, config: desktopE2EConfig }))[0])
        .toMatchObject({ state: 'settled', outcome: 'cancelled-before-start', runId })
    })
  })

  it('preserves the original startup error as the cause when descriptor settlement also fails', async () => {
    const root = await createRoot()
    const context = await createCommandInvocationContext({ repositoryRoot: root, config: desktopE2EConfig })
    const contextPath = join(context.directory, desktopE2EConfig.commandRunner.invocationFilename)
    const startError = new Error('controlled original startup failure')
    let receivedError

    await withInvocationEnvironment(context, async () => {
      try {
        await trackedStartProbe({ runId: '74de5720-809b-47ce-b6d8-7d1c80316f5d', repositoryRoot: root,
          config: desktopE2EConfig, mode: 'development' }, {
          async startProbe() {
            await rm(contextPath)
            throw startError
          },
        })
      } catch (error) {
        receivedError = error
      }
    })

    expect(receivedError).toBeInstanceOf(AggregateError)
    expect(receivedError.cause).toBe(startError)
    expect(receivedError.errors).toContain(startError)
  })

  it('records the exact temporary repository root from the supplied start options', async () => {
    const root = await createRoot()
    const context = await createCommandInvocationContext({ repositoryRoot: root, config: desktopE2EConfig })
    const otherRoot = await createRoot()
    let starts = 0

    await withInvocationEnvironment(context, async () => {
      await trackedStartProbe({
        runId: '896e563b-71ac-47bb-adb7-bdfab8204404',
        repositoryRoot: otherRoot,
        config: desktopE2EConfig,
        mode: 'development',
      }, { async startProbe() { starts += 1 } })
      expect((await readCommandRunDescriptors({ invocationDirectory: context.directory, config: desktopE2EConfig }))[0])
        .toMatchObject({ repositoryRoot: otherRoot })
    })

    expect(starts).toBe(1)
  })

  it('rejects a changed invocation context path before calling startProbe', async () => {
    const root = await createRoot()
    const context = await createCommandInvocationContext({ repositoryRoot: root, config: desktopE2EConfig })
    const contextPath = join(context.directory, desktopE2EConfig.commandRunner.invocationFilename)
    const stored = JSON.parse(await readFile(contextPath, 'utf8'))
    stored.repositoryRoot = await createRoot()
    await writeFile(contextPath, JSON.stringify(stored))
    let starts = 0

    await withInvocationEnvironment(context, async () => {
      await expect(trackedStartProbe({ runId: '64bc7de5-6194-46b5-8a9f-d1ae4007feae', repositoryRoot: root,
        config: desktopE2EConfig, mode: 'development' }, {
        async startProbe() { starts += 1 },
      })).rejects.toThrow(/invocation context directory/u)
    })
    expect(starts).toBe(0)
  })
})

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), 'official-command-cancellation-'))
  temporaryRoots.add(root)
  return root
}

async function withInvocationEnvironment(context, action) {
  const name = desktopE2EConfig.commandRunner.invocationDirectoryEnvironmentName
  const previous = process.env[name]
  process.env[name] = context.directory
  try {
    return await action()
  } finally {
    if (previous === undefined) delete process.env[name]
    else process.env[name] = previous
  }
}

async function waitUntil(predicate) {
  const deadline = Date.now() + 1000
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('condition did not become true within 1000ms')
}
