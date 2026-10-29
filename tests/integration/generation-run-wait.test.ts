import { describe, expect, it, vi } from 'vitest'
import type { JobHooks, JobSpec } from '@deepseek-ai/dsh-jobs'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { GenerationRuntime } from '../../src/host/generation/generation-runtime.ts'
import { GenerationRunWaitService } from '../../src/host/generation/run-wait-service.ts'
import { createCliHandler } from '../../src/host/cli/route.ts'
import { startCliServer } from '../../src/host/cli/server.ts'
import { CliShellCapabilityStore } from '../../src/host/cli/shell-capability.ts'
import { CLI_ROUTE_PATH } from '../../src/cli/contract.ts'

function execution(index = 1): ToolExecution {
  const callId = `shell-${index}`
  return {
    token: Symbol(callId), callId, rootCallId: `root-${index}`, name: 'bash', arguments: {},
    agent: { session: { id: 'session-parent', header: { cwd: '/workspace' }, snapshotEvents: () => [
      { type: 'tool/call', data: { callId, name: 'bash', turn: 1 } },
    ] } },
  } as never
}

function post(origin: string, capability: string, signal?: AbortSignal) {
  return fetch(origin + CLI_ROUTE_PATH, {
    method: 'POST', headers: { authorization: `Bearer ${capability}`, 'content-type': 'application/json' },
    body: JSON.stringify({ command: 'generation.wait', run_ids: ['run_1'] }), signal,
  })
}

describe('managed Run observation registration lifetime', () => {
  it('recovers one observation after a lost response and revoked foreground capability', async () => {
    let hooks!: JobHooks
    let capabilities!: CliShellCapabilityStore
    let disconnect = () => {}
    let status = 'remote_running'
    const original = execution()
    const start = vi.fn((spec: JobSpec) => {
      hooks = spec.run({ id: 'generation-wait-1', append() {}, updateProgress() {} } as never)
      capabilities.revoke(original)
      disconnect()
      return 'generation-wait-1' as never
    })
    const runtime = { readGenerationRunMedia: async () => ({ runs: [
      { run_id: 'run_1', lookup_status: 'available', status },
    ] }) } as unknown as GenerationRuntime
    const runWait = new GenerationRunWaitService({ runtime, jobs: { start }, pollIntervalMs: 1 })
    const server = await startCliServer(origin => {
      capabilities = new CliShellCapabilityStore({ cliPath: '/plugin/cli.mjs', nodeExecutable: process.execPath, apiUrl: origin + CLI_ROUTE_PATH })
      const handler = createCliHandler({ capabilities, runtime, runWait,
        imageReader: { inspect: vi.fn() }, workspaceRegistry: { resolveByPath: async () => ({ id: 'workspace-1', sessionIds: [] }) },
      })
      return (request, response) => {
        disconnect = () => response.destroy()
        return handler(request, response)
      }
    })
    try {
      const first = capabilities.environment(original).DSH_HARNESS_COMFYUI_CLI_CAPABILITY!
      await expect(post(server.origin, first)).rejects.toThrow()
      expect(capabilities.authorize(first)).toBeUndefined()
      expect(start).toHaveBeenCalledTimes(1)
      expect(start.mock.calls[0]![0]).toMatchObject({ owner: 'session-parent', toolCall: { callId: 'shell-1', rootCallId: 'root-1' } })
      const retry = capabilities.environment(execution(2)).DSH_HARNESS_COMFYUI_CLI_CAPABILITY!
      const response = await post(server.origin, retry)
      expect(await response.json()).toEqual({ ok: true, data: { job_id: 'generation-wait-1', run_ids: ['run_1'] } })
      expect(start).toHaveBeenCalledTimes(1)
      status = 'succeeded'
      expect(await hooks.done).toEqual({ status: 'completed', result: '{"runs":[{"run_id":"run_1","status":"succeeded"}]}' })
    } finally { capabilities.clear(); await Promise.all([runWait.close(), server.close()]) }
  })

  it('creates no Job when the connection closes before Run access validation completes', async () => {
    let release!: (value: unknown) => void
    let reading!: () => void
    let closed!: () => void
    const startedReading = new Promise<void>(resolve => { reading = resolve })
    const responseClosed = new Promise<void>(resolve => { closed = resolve })
    const start = vi.fn()
    const runtime = { readGenerationRunMedia: async () => {
      reading()
      return new Promise(resolve => { release = resolve })
    } } as unknown as GenerationRuntime
    const runWait = new GenerationRunWaitService({ runtime, jobs: { start }, pollIntervalMs: 1 })
    const server = await startCliServer(() => {
      const handler = createCliHandler({
        capabilities: { authorize: () => ({ sessionId: 'session-parent', turn: 1, callId: 'shell-1', rootCallId: 'root-1', cwd: '/workspace' }) },
        runtime, runWait, imageReader: { inspect: vi.fn() }, workspaceRegistry: { resolveByPath: async () => ({ id: 'workspace-1', sessionIds: [] }) },
      })
      return (request, response) => {
        response.once('close', closed)
        return handler(request, response)
      }
    })
    try {
      const controller = new AbortController()
      const request = post(server.origin, 'capability', controller.signal).catch(error => error)
      await startedReading
      controller.abort()
      await request
      await responseClosed
      release({ runs: [{ run_id: 'run_1', lookup_status: 'available', status: 'remote_running' }] })
    } finally { await Promise.all([runWait.close(), server.close()]) }
    expect(start).not.toHaveBeenCalled()
  })
})
