import { EventEmitter } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import { access, chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  NodeWorkerComfyFrontend,
  type FrontendCompilerWorkerProcess,
} from '../../src/host/generation/comfy-frontend-worker-client.ts'
import type { UiWorkflow } from '../../src/host/generation/source-preparer.ts'

class FakeWritable extends EventEmitter {
  readonly end = vi.fn<(contents: string) => void>()
}

class FakeReadable extends EventEmitter {}

class FakeWorkerProcess extends EventEmitter implements FrontendCompilerWorkerProcess {
  readonly stdin = new FakeWritable()
  readonly stdout = new FakeReadable()
  readonly stderr = new FakeReadable()
  readonly kill = vi.fn(() => true)
}

const workerPath = '/workspace/.local/source-host/comfy-frontend-worker.js'
const browserExecutablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const preReadiness = Object.freeze({
  devToolsPortMs: 10_000,
  targetCreateMs: 10_000,
  webSocketConnectMs: 10_000,
  domainEnableMs: 10_000,
  navigationMs: 10_000,
  infrastructureAttempts: 2 as const,
})

function workflow(): UiWorkflow {
  return { version: 0.4, nodes: [{ id: 1, type: 'PromptNode' }], links: [] }
}

function input(signal?: AbortSignal) {
  return {
    workflow: workflow(),
    connection: {
      url: 'http://192.168.110.122:8188/',
      origin: 'http://192.168.110.122:8188',
      authorization: null,
    },
    ...(signal === undefined ? {} : { signal }),
  }
}

function fixture() {
  const child = new FakeWorkerProcess()
  const spawnImplementation = vi.fn(() => child)
  const reportDiagnostic = vi.fn()
  const frontend = new NodeWorkerComfyFrontend({
    nodeExecutable: 'node',
    workerModulePath: workerPath,
    browserExecutablePath,
    timeoutMs: 120_000,
    preReadiness,
    spawnImplementation,
    reportDiagnostic,
  })
  return { child, spawnImplementation, reportDiagnostic, frontend }
}

async function waitForFile(path: string): Promise<string> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    try {
      return await readFile(path, 'utf8')
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 25))
  }
  throw new Error(`Timed out waiting for fixture file ${path}.`)
}

describe('NodeWorkerComfyFrontend', () => {
  it('runs the compiler in the standard Node worker and returns its workflow', async () => {
    const { child, spawnImplementation, reportDiagnostic, frontend } = fixture()
    const promise = frontend.exportWorkflow(input())

    expect(spawnImplementation).toHaveBeenCalledWith('node', [workerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    })
    const request = JSON.parse(String(child.stdin.end.mock.calls[0]?.[0])) as Record<string, any>
    expect(request).toEqual({
      version: 1,
      browser: { browserExecutablePath, timeoutMs: 120_000, preReadiness },
      input: {
        workflow: workflow(),
        connection: {
          url: 'http://192.168.110.122:8188/',
          origin: 'http://192.168.110.122:8188',
          authorization: null,
        },
      },
    })

    child.stdout.emit('data', '{"type":"diagnostic","diagnostic":{"attempt":1,"status":"succeeded"}}\n')
    child.stdout.emit('data', '{"type":"result","ok":true,"workflow":{"1":{"class_type":"PromptNode","inputs":{}}}}\n')
    child.emit('close', 0, null)

    await expect(promise).resolves.toEqual({ '1': { class_type: 'PromptNode', inputs: {} } })
    expect(reportDiagnostic).toHaveBeenCalledWith({ attempt: 1, status: 'succeeded' })
  })

  it('preserves a structured frontend error returned by the worker', async () => {
    const { child, frontend } = fixture()
    const promise = frontend.exportWorkflow(input())

    child.stdout.emit('data', '{"type":"result","ok":false,"error":{"code":"COMFYUI_FRONTEND_NAVIGATION_FAILED","message":"Page.navigate exceeded 10000ms.","stage":"navigation","operation":"Page.navigate"}}\n')
    child.emit('close', 0, null)

    await expect(promise).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_NAVIGATION_FAILED',
      message: 'Page.navigate exceeded 10000ms.',
      stage: 'navigation',
      operation: 'Page.navigate',
    })
  })

  it('reports worker startup and protocol failures without exposing unbounded stderr', async () => {
    const startup = fixture()
    const startupPromise = startup.frontend.exportWorkflow(input())
    startup.child.emit('error', new Error('spawn ENOENT'))
    await expect(startupPromise).rejects.toMatchObject({ code: 'COMFYUI_FRONTEND_WORKER_FAILED' })

    const protocol = fixture()
    const protocolPromise = protocol.frontend.exportWorkflow(input())
    protocol.child.stderr.emit('data', `worker failed ${'x'.repeat(70_000)}`)
    protocol.child.stdout.emit('data', '{"type":"unknown"}\n')
    protocol.child.emit('close', 1, null)
    const error = await protocolPromise.catch(value => value) as Error & { code?: string }
    expect(error.code).toBe('COMFYUI_FRONTEND_WORKER_FAILED')
    expect(Buffer.byteLength(error.message, 'utf8')).toBeLessThanOrEqual(65_700)

    const exited = fixture()
    const exitedPromise = exited.frontend.exportWorkflow(input())
    exited.child.stderr.emit('data', 'worker stderr details')
    exited.child.emit('close', 1, null)
    await expect(exitedPromise).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_WORKER_FAILED',
      message: expect.stringContaining('worker stderr details'),
    })
  })

  it('terminates only its worker and preserves caller cancellation', async () => {
    const controller = new AbortController()
    const { child, frontend } = fixture()
    const promise = frontend.exportWorkflow(input(controller.signal))

    controller.abort()

    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM')
    child.emit('close', 0, null)
    await expect(promise).rejects.toMatchObject({ code: 'COMFYUI_REQUEST_CANCELED' })
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM')
  })

  it('terminates the worker when cancellation races with worker startup', async () => {
    const controller = new AbortController()
    const child = new FakeWorkerProcess()
    const frontend = new NodeWorkerComfyFrontend({
      nodeExecutable: 'node',
      workerModulePath: workerPath,
      browserExecutablePath,
      timeoutMs: 120_000,
      preReadiness,
      spawnImplementation: () => {
        controller.abort()
        return child
      },
    })

    const promise = frontend.exportWorkflow(input(controller.signal))
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM')
    expect(child.stdin.end).not.toHaveBeenCalled()
    child.emit('close', 0, null)
    await expect(promise).rejects.toMatchObject({ code: 'COMFYUI_REQUEST_CANCELED' })
  })

  it('forces only an unresponsive worker to exit after the cancellation grace period', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      const child = new FakeWorkerProcess()
      const frontend = new NodeWorkerComfyFrontend({
        nodeExecutable: 'node',
        workerModulePath: workerPath,
        browserExecutablePath,
        timeoutMs: 120_000,
        preReadiness,
        cancellationGraceMs: 250,
        spawnImplementation: () => child,
      })
      const promise = frontend.exportWorkflow(input(controller.signal))

      controller.abort()
      await vi.advanceTimersByTimeAsync(250)

      expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM')
      expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL')
      child.emit('close', null, 'SIGKILL')
      await expect(promise).rejects.toMatchObject({ code: 'COMFYUI_REQUEST_CANCELED' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('forces an unresponsive worker to exit when sending its request throws', async () => {
    vi.useFakeTimers()
    try {
      const child = new FakeWorkerProcess()
      child.stdin.end.mockImplementation(() => {
        throw new Error('stdin closed')
      })
      const frontend = new NodeWorkerComfyFrontend({
        nodeExecutable: 'node',
        workerModulePath: workerPath,
        browserExecutablePath,
        timeoutMs: 120_000,
        preReadiness,
        cancellationGraceMs: 250,
        spawnImplementation: () => child,
      })
      const promise = frontend.exportWorkflow(input())

      expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM')
      await vi.advanceTimersByTimeAsync(250)
      expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL')

      child.emit('close', null, 'SIGKILL')
      await expect(promise).rejects.toMatchObject({
        code: 'COMFYUI_FRONTEND_WORKER_FAILED',
        message: 'Harness Host could not send the official frontend compiler request.',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('converts an asynchronous worker stdin error into a structured failure', async () => {
    const child = new FakeWorkerProcess()
    const frontend = new NodeWorkerComfyFrontend({
      nodeExecutable: 'node',
      workerModulePath: workerPath,
      browserExecutablePath,
      timeoutMs: 120_000,
      preReadiness,
      spawnImplementation: () => child,
    })
    const promise = frontend.exportWorkflow(input())

    child.stdin.emit('error', new Error('write EPIPE'))
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM')
    child.emit('close', 1, null)

    await expect(promise).rejects.toMatchObject({
      code: 'COMFYUI_FRONTEND_WORKER_FAILED',
      message: 'Harness Host could not send the official frontend compiler request.',
    })
  })

  it('force-kills an unresponsive worker process group without signaling an unrelated process', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'harness-comfyui-worker-force-cancel-'))
    const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => undefined, 1000)'], { stdio: 'ignore' })
    const controller = new AbortController()
    let workerProcess: ChildProcess | undefined
    const frontend = new NodeWorkerComfyFrontend({
      nodeExecutable: process.execPath,
      workerModulePath: resolve('tests/fixtures/unresponsive-worker-with-stubborn-chrome.mjs'),
      browserExecutablePath,
      timeoutMs: 120_000,
      preReadiness,
      cancellationGraceMs: 100,
      spawnImplementation: (executable, arguments_, options) => {
        workerProcess = spawn(executable, [...arguments_, 'worker', temporaryRoot], options)
        return workerProcess as FrontendCompilerWorkerProcess
      },
    })
    const promise = frontend.exportWorkflow(input(controller.signal))

    try {
      const workerPid = Number(await waitForFile(join(temporaryRoot, 'worker.pid')))
      const fakeChromePid = Number(await waitForFile(join(temporaryRoot, 'fake-chrome.pid')))

      controller.abort()
      await expect(promise).rejects.toMatchObject({ code: 'COMFYUI_REQUEST_CANCELED' })

      expect(workerProcess?.signalCode).toBe('SIGKILL')
      await vi.waitFor(() => {
        expect(() => process.kill(workerPid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }))
        expect(() => process.kill(fakeChromePid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }))
      })
      expect(() => process.kill(unrelated.pid!, 0)).not.toThrow()
    } finally {
      controller.abort()
      await promise.catch(() => undefined)
      unrelated.kill('SIGTERM')
      await new Promise<void>(resolveClose => unrelated.once('close', () => resolveClose()))
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  }, 15_000)

  it('cooperatively cancels a real worker, its fake Chrome descendant, and the temporary profile', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'harness-comfyui-worker-cancel-'))
    const fakeBrowser = join(temporaryRoot, 'fake-chrome.mjs')
    const fixtureSource = await readFile(resolve('tests/fixtures/fake-chrome-until-sigterm.mjs'), 'utf8')
    await writeFile(fakeBrowser, fixtureSource)
    await chmod(fakeBrowser, 0o755)
    const controller = new AbortController()
    let workerProcess: ChildProcess | undefined
    const frontend = new NodeWorkerComfyFrontend({
      nodeExecutable: process.execPath,
      workerModulePath: resolve('src/host/generation/comfy-frontend-worker.ts'),
      browserExecutablePath: fakeBrowser,
      timeoutMs: 120_000,
      preReadiness,
      cancellationGraceMs: 5_000,
      spawnImplementation: (executable, arguments_, options) => {
        workerProcess = spawn(executable, arguments_, options)
        return workerProcess as FrontendCompilerWorkerProcess
      },
    })
    const promise = frontend.exportWorkflow(input(controller.signal))

    try {
      const fakeBrowserPid = Number(await waitForFile(join(temporaryRoot, 'fake-chrome.pid')))
      const profilePath = await waitForFile(join(temporaryRoot, 'fake-chrome.profile'))

      controller.abort()
      await expect(promise).rejects.toMatchObject({ code: 'COMFYUI_REQUEST_CANCELED' })

      expect(await readFile(join(temporaryRoot, 'fake-chrome.closed'), 'utf8')).toBe('SIGTERM')
      expect(workerProcess?.signalCode).toBeNull()
      expect(workerProcess?.exitCode).toBe(0)
      expect(() => process.kill(fakeBrowserPid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }))
      await expect(access(profilePath)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      controller.abort()
      await promise.catch(() => undefined)
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  }, 15_000)
})
