import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GenerationPreparationAdapter } from '../../src/host/generation/generation-runtime.ts'
import {
  GenerationRuntime,
  type GenerationRequest,
  type GenerationRuntimeOptions,
  type GenerationTransport,
} from '../../src/host/generation/generation-runtime.ts'
import { PluginStorageError } from '../../src/host/plugin-storage-error.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

const generationRequest: GenerationRequest = {
  title: 'Initialization fixture',
  instanceId: '2',
  templateId: '34',
  model: null,
  parameters: { positive_prompt: 'preserve this saved run' },
  loras: [],
}

const mediaBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function createOptions(root: string, overrides: Partial<GenerationRuntimeOptions> = {}): GenerationRuntimeOptions {
  const preparer: GenerationPreparationAdapter = {
    async inspectRuntimeParameters() { throw new Error('unreachable') },
    async prepare() {
      return {
        instanceId: '2',
        instanceTitle: 'ComfyUI',
        templateTitle: 'Initialization fixture',
        sourceSnapshot: { template_id: '34' },
        actualWorkflow: { version: 0.4 },
        apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } },
        expectedOutputNodeIds: ['3'],
        connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      }
    },
  }
  const transport: GenerationTransport = {
    async submit(input) {
      if (!input.onRequestStart()) throw new Error('submission was not accepted')
      return { promptId: input.promptId }
    },
    async observe() {
      return {
        status: 'success',
        outputs: [{ nodeId: '3', outputIndex: 0, mediaKind: 'image', filename: 'saved.png', subfolder: '', type: 'output' }],
      }
    },
    async download() { return { bytes: mediaBytes, mediaType: 'image/png' } },
  }
  return {
    runRepositoryFile: join(root, 'data', 'runs.sqlite'),
    runDirectory: join(root, 'runs'),
    savedMediaDirectory: join(root, 'media'),
    preparer,
    transport,
    createRunId: () => `run_${randomUUID()}`,
    createPromptId: () => randomUUID(),
    createMediaId: () => `media_${randomUUID()}`,
    ...overrides,
  }
}

async function createSavedRun(root: string) {
  const options = createOptions(root)
  const runtime = new GenerationRuntime(options)
  const accepted = await runtime.acceptGeneration({
    workspaceId: 'workspace_initialization',
    sessionId: 'session_initialization',
    turn: 1,
    callId: 'call_initialization',
  }, generationRequest)
  for (let step = 0; step < 4; step += 1) await runtime.advance()
  const [media] = runtime.queryMedia({ workspaceId: 'workspace_initialization', sessionId: 'session_initialization' })
  if (media === undefined) throw new Error('The initialization fixture did not save media.')
  runtime.close()
  return { options, runId: accepted.runId, mediaId: media.mediaId }
}

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix))
  temporaryDirectories.push(root)
  return root
}

describe('GenerationRuntime database initialization', () => {
  it('reports SQLite open failure without altering an occupied database directory', () => {
    const root = temporaryRoot('harness-comfyui-sqlite-open-failure-')
    const options = createOptions(root)
    mkdirSync(options.runRepositoryFile, { recursive: true })
    const marker = join(options.runRepositoryFile, 'existing-file')
    writeFileSync(marker, 'preserve this data')
    expect(() => new GenerationRuntime(options)).toThrowError(expect.objectContaining({
      code: 'PLUGIN_DATA_DIRECTORY_UNAVAILABLE', path: options.runRepositoryFile,
      cause: expect.objectContaining({ code: 'ERR_SQLITE_ERROR' }),
    }))
    expect(readFileSync(marker, 'utf8')).toBe('preserve this data')
  })

  it('preserves initialization and close errors when cleanup also fails', () => {
    const root = temporaryRoot('harness-comfyui-sqlite-close-failure-')
    const options = createOptions(root)
    mkdirSync(join(root, 'data'), { recursive: true })
    writeFileSync(options.runRepositoryFile, 'not a SQLite database')
    const closeError = new Error('database close failed')
    let openedDatabase: DatabaseSync | undefined
    const closeSpy = vi.spyOn(DatabaseSync.prototype, 'close').mockImplementation(function (this: DatabaseSync) {
      openedDatabase = this
      throw closeError
    })
    let initializationError: unknown
    try {
      new GenerationRuntime(options)
    } catch (error) {
      initializationError = error
    } finally {
      closeSpy.mockRestore()
      openedDatabase?.close()
    }
    expect(initializationError).toBeInstanceOf(PluginStorageError)
    expect(initializationError).toMatchObject({
      code: 'PLUGIN_DATA_DIRECTORY_UNAVAILABLE', path: options.runRepositoryFile,
      databaseCloseError: closeError,
    })
    expect(readFileSync(options.runRepositoryFile, 'utf8')).toBe('not a SQLite database')
  })

  it.each([Object.freeze(new Error('frozen initialization failure')), 'non-Error initialization failure'])(
    'retains both errors when the original initialization failure cannot carry close details: %s', originalError => {
      const root = temporaryRoot('harness-comfyui-sqlite-aggregate-close-failure-')
      const options = createOptions(root, { now: () => { throw originalError } })
      const closeError = new Error('database close failed')
      let openedDatabase: DatabaseSync | undefined
      const closeSpy = vi.spyOn(DatabaseSync.prototype, 'close').mockImplementation(function (this: DatabaseSync) {
        openedDatabase = this
        throw closeError
      })
      let initializationError: unknown
      try { new GenerationRuntime(options) } catch (error) { initializationError = error } finally {
        closeSpy.mockRestore()
        openedDatabase?.close()
      }
      expect(initializationError).toBeInstanceOf(AggregateError)
      expect((initializationError as AggregateError).errors).toEqual([originalError, closeError])
      expect((initializationError as AggregateError).cause).toBe(originalError)
    },
  )

  it.each(['-wal', '-shm'])('reports an unusable SQLite %s path and preserves saved Runs and media', async sidecar => {
    const root = temporaryRoot('harness-comfyui-sqlite-sidecar-')
    const fixture = await createSavedRun(root)
    const sidecarPath = `${fixture.options.runRepositoryFile}${sidecar}`
    mkdirSync(sidecarPath)
    const closeSpy = vi.spyOn(DatabaseSync.prototype, 'close')
    let closeCount = 0

    let initializationError: unknown
    try {
      new GenerationRuntime(fixture.options)
    } catch (error) {
      initializationError = error
    } finally {
      closeCount = closeSpy.mock.calls.length
      closeSpy.mockRestore()
    }

    expect(initializationError).toBeInstanceOf(PluginStorageError)
    expect(initializationError).toMatchObject({
      code: 'PLUGIN_DATA_DIRECTORY_UNAVAILABLE',
      path: fixture.options.runRepositoryFile,
      cause: { code: 'ERR_SQLITE_ERROR' },
    })
    expect((initializationError as Error).message).toContain(fixture.options.runRepositoryFile)
    expect((initializationError as Error & { cause: Error }).cause.message).not.toBe('')
    expect(closeCount).toBe(1)

    rmSync(sidecarPath, { recursive: true, force: true })
    const restarted = new GenerationRuntime(fixture.options)
    expect(restarted.queryRuns({ workspaceId: 'workspace_initialization', sessionId: 'session_initialization' }))
      .toMatchObject([{ runId: fixture.runId, status: 'succeeded' }])
    expect(restarted.queryMedia({ workspaceId: 'workspace_initialization', sessionId: 'session_initialization' }))
      .toMatchObject([{ mediaId: fixture.mediaId, runId: fixture.runId }])
    expect(readFileSync(restarted.mediaContentPath(fixture.mediaId))).toEqual(Buffer.from(mediaBytes))
    restarted.close()
  })

  it('closes the opened SQLite handle and reports the cause when the database is corrupt', () => {
    const root = temporaryRoot('harness-comfyui-sqlite-corrupt-')
    const options = createOptions(root)
    mkdirSync(join(root, 'data'), { recursive: true })
    writeFileSync(options.runRepositoryFile, 'not a SQLite database')
    const closeSpy = vi.spyOn(DatabaseSync.prototype, 'close')
    let closeCount = 0

    let initializationError: unknown
    try {
      new GenerationRuntime(options)
    } catch (error) {
      initializationError = error
    } finally {
      closeCount = closeSpy.mock.calls.length
      closeSpy.mockRestore()
    }

    expect(initializationError).toBeInstanceOf(PluginStorageError)
    expect(initializationError).toMatchObject({
      path: options.runRepositoryFile,
      cause: { code: 'ERR_SQLITE_ERROR', message: 'file is not a database' },
    })
    expect(closeCount).toBe(1)
    expect(readFileSync(options.runRepositoryFile, 'utf8')).toBe('not a SQLite database')
  })

  it('validates runtime configuration before opening the database', () => {
    const root = temporaryRoot('harness-comfyui-sqlite-invalid-options-')
    const options = createOptions(root, { missingObservationMs: -1 })
    const closeSpy = vi.spyOn(DatabaseSync.prototype, 'close')

    try {
      expect(() => new GenerationRuntime(options)).toThrow('missingObservationMs is invalid')
      expect(existsSync(join(root, 'data'))).toBe(false)
      expect(closeSpy).not.toHaveBeenCalled()
    } finally {
      closeSpy.mockRestore()
    }
  })

  it('preserves non-SQLite initialization errors while closing the opened handle', () => {
    const root = temporaryRoot('harness-comfyui-sqlite-business-error-')
    const originalError = new Error('runtime clock failed')
    const options = createOptions(root, { now: () => { throw originalError } })
    const closeSpy = vi.spyOn(DatabaseSync.prototype, 'close')
    let closeCount = 0

    let initializationError: unknown
    try {
      new GenerationRuntime(options)
    } catch (error) {
      initializationError = error
    } finally {
      closeCount = closeSpy.mock.calls.length
      closeSpy.mockRestore()
    }

    expect(initializationError).toBe(originalError)
    expect(initializationError).not.toBeInstanceOf(PluginStorageError)
    expect(closeCount).toBe(1)
  })
})
