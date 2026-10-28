import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GenerationRuntime, type GenerationRequest } from '../../src/host/generation/generation-runtime.ts'

const roots: string[] = []
const runtimes: GenerationRuntime[] = []
const identity = { workspaceId: 'workspace_batch', sessionId: 'session_batch', turn: 1, callId: 'call_batch' }

afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function request(prompt = 'first prompt'): GenerationRequest {
  return { title: 'Batch fixture', instanceId: null, templateId: '34', model: null, parameters: { positive_prompt: prompt }, loras: [] }
}

describe('GenerationRuntime persisted state lookup', () => {
  it.each([
    'created', 'prepared', 'submitting', 'submission_unknown', 'remote_pending', 'remote_running',
    'downloading', 'succeeded', 'failed', 'cancelling', 'cancelled',
  ])('returns %s and its execution error independently of lookup availability', async status => {
    const { runtime, root } = createRuntime()
    const requestId = randomUUID()
    const accepted = await runtime.acceptGenerations(identity, [{ requestId, request: request() }])
    const runId = accepted.items[0]!.runId
    const database = new DatabaseSync(join(root, 'runs.sqlite'))
    database.prepare(`
      UPDATE generation_runs SET status = ?, revision = 7, updated_at = 1234, instance_id = '2',
        prompt_id = 'prompt_fixture', error_code = 'OBSERVATION_FIXTURE', error_message = 'Observation failed.',
        request_json = 'corrupt historical request' WHERE run_id = ?
    `).run(status, runId)
    database.close()

    const result = await runtime.readGenerationRunMedia({ workspaceId: identity.workspaceId, runIds: [runId, 'run_missing'] })

    expect(result.runs).toEqual([{
      run_id: runId, request_id: requestId, lookup_status: 'available', title: 'Batch fixture', status,
      revision: 7, updated_at: 1234, instance_id: '2', prompt_id: 'prompt_fixture',
      run_error: { code: 'OBSERVATION_FIXTURE', message: 'Observation failed.' }, images: [],
    }, {
      run_id: 'run_missing', lookup_status: 'error', error: expect.objectContaining({ code: 'GENERATION_RUN_NOT_FOUND' }),
    }])
    const detailed = await runtime.readGenerationRunMedia({ workspaceId: identity.workspaceId, runIds: [runId], includeParameters: true })
    expect(detailed.runs[0]).toMatchObject({ lookup_status: 'error', error: { code: 'GENERATION_REQUEST_INVALID' } })
  })
})

describe('GenerationRuntime lightweight media lookup', () => {
  it('returns durable state without loading parameters unless requested', async () => {
    const { runtime } = createRuntime()
    const requestId = randomUUID()
    const accepted = await runtime.acceptGenerations(identity, [{ requestId, request: request() }])
    const runId = accepted.items[0]!.runId

    const lightweight = await runtime.readGenerationRunMedia({ workspaceId: identity.workspaceId, runIds: [runId] })

    expect(lightweight.runs).toEqual([{
      run_id: runId, request_id: requestId, lookup_status: 'available', title: 'Batch fixture',
      status: 'created', revision: 0, updated_at: expect.any(Number), instance_id: null, prompt_id: null, run_error: null, images: [],
    }])
    const detailed = await runtime.readGenerationRunMedia({ workspaceId: identity.workspaceId, runIds: [runId], includeParameters: true })
    expect(detailed.runs[0]).toMatchObject({ parameters: { positive_prompt: 'first prompt' } })
  })
})

function createRuntime(root = mkdtempSync(join(tmpdir(), 'generation-batch-'))) {
  if (!roots.includes(root)) roots.push(root)
  const prepare = vi.fn(async (_request: GenerationRequest) => ({
    instanceId: '2', instanceTitle: 'ComfyUI', templateTitle: 'Template',
    sourceSnapshot: {}, actualWorkflow: {}, apiWorkflow: {}, expectedOutputNodeIds: ['10'],
    connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
  }))
  const runtime = new GenerationRuntime({
    runRepositoryFile: join(root, 'runs.sqlite'), runDirectory: join(root, 'runs'), savedMediaDirectory: join(root, 'media'),
    preparer: { prepare, inspectRuntimeParameters: async () => ({ parameters: [], size_candidates: [] }) },
  })
  runtimes.push(runtime)
  return { runtime, prepare, root }
}

describe('GenerationRuntime durable request identity', () => {
  it('reuses a normalized request across Tool Calls and accepts an explicit redo', async () => {
    const { runtime } = createRuntime()
    const requestId = randomUUID()
    const first = await runtime.acceptGenerations(identity, [{ requestId, request: request() }])
    const replay = await runtime.acceptGenerations({ ...identity, callId: 'call_retry', turn: 2 }, [{
      requestId: requestId.toUpperCase(),
      request: { ...request(), parameters: { positive_prompt: 'first prompt' } },
    }])
    const redo = await runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request: request() }])

    expect(replay.items).toEqual([{ requestId, runId: first.items[0]!.runId, acceptance: 'reused' }])
    expect(redo.items[0]!.runId).not.toBe(first.items[0]!.runId)
    expect(runtime.queryRuns(identity)).toHaveLength(2)
    expect(runtime.queryRuns(identity).find(run => run.runId === first.items[0]!.runId)).toMatchObject({ callId: 'call_batch', turn: 1, requestId })
  })

  it('rolls back earlier inserts when a later request conflicts', async () => {
    const { runtime } = createRuntime()
    const requestId = randomUUID()
    const original = await runtime.acceptGenerations(identity, [{ requestId, request: request() }])
    await expect(runtime.acceptGenerations(identity, [
      { requestId: randomUUID(), request: request('new') },
      { requestId, request: request('conflict') },
    ])).rejects.toMatchObject({ code: 'RUN_REQUEST_CONFLICT' })
    expect(runtime.queryRuns(identity).map(run => run.runId)).toEqual([original.items[0]!.runId])
  })

  it.each([1, 11, 20])('accepts %s requests in input order', async count => {
    const { runtime } = createRuntime()
    const items = Array.from({ length: count }, (_, index) => ({ requestId: randomUUID(), request: request(String(index)) }))
    const accepted = await runtime.acceptGenerations(identity, items)
    expect(accepted.items.map(item => item.requestId)).toEqual(items.map(item => item.requestId))
    expect(runtime.queryRuns(identity)).toHaveLength(count)
  })

  it.each([0, 21])('rejects %s requests before persisting any Run', async count => {
    const { runtime } = createRuntime()
    await expect(runtime.acceptGenerations(identity, Array.from({ length: count }, () => ({ requestId: randomUUID(), request: request() }))))
      .rejects.toMatchObject({ code: 'GENERATION_SUBMISSION_INVALID' })
    expect(runtime.queryRuns(identity)).toEqual([])
  })

  it('rejects duplicate, invalid, and malformed requests as a whole batch', async () => {
    const { runtime } = createRuntime()
    const requestId = randomUUID()
    const batches = [
      [{ requestId, request: request() }, { requestId: requestId.toUpperCase(), request: request() }],
      [{ requestId, request: request() }, { requestId: 'not-a-uuid', request: request() }],
      [{ requestId, request: request() }, { requestId: randomUUID(), request: { ...request(), parameters: [] } as never }],
    ]
    for (const items of batches) {
      await expect(runtime.acceptGenerations(identity, items)).rejects.toBeInstanceOf(Error)
      expect(runtime.queryRuns(identity)).toEqual([])
    }
  })

  it('scopes request identity to Workspace and Session', async () => {
    const { runtime } = createRuntime()
    const items = [{ requestId: randomUUID(), request: request() }]
    const first = await runtime.acceptGenerations(identity, items)
    const otherSession = await runtime.acceptGenerations({ ...identity, sessionId: 'session_other' }, items)
    const otherWorkspace = await runtime.acceptGenerations({ ...identity, workspaceId: 'workspace_other' }, items)
    expect(new Set([first, otherSession, otherWorkspace].map(result => result.items[0]!.runId)).size).toBe(3)
  })

  it('reuses one persisted Run for concurrent callers and after restart', async () => {
    const { runtime, root } = createRuntime()
    const second = createRuntime(root).runtime
    const items = [{ requestId: randomUUID(), request: request() }]
    const results = await Promise.all([
      runtime.acceptGenerations(identity, items),
      second.acceptGenerations({ ...identity, callId: 'call_concurrent' }, items),
    ])
    expect(results.map(result => result.items[0]!.acceptance).sort()).toEqual(['accepted', 'reused'])
    expect(results[0]!.items[0]!.runId).toBe(results[1]!.items[0]!.runId)
    const restarted = createRuntime(root).runtime
    await expect(restarted.acceptGenerations({ ...identity, callId: 'call_restart' }, items)).resolves.toEqual({
      items: [{ requestId: items[0]!.requestId, runId: results[0]!.items[0]!.runId, acceptance: 'reused' }],
    })
    expect(restarted.queryRuns(identity)).toHaveLength(1)
  })

  it('keeps accepted Runs after caller cancellation and rejects an already cancelled submission', async () => {
    const { runtime, prepare } = createRuntime()
    const controller = new AbortController()
    const items = [{ requestId: randomUUID(), request: request() }]
    const accepted = await runtime.acceptGenerations(identity, items, controller.signal)
    controller.abort()
    expect(prepare).not.toHaveBeenCalled()
    await expect(runtime.acceptGenerations(identity, [{ requestId: randomUUID(), request: request() }], controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' })
    await runtime.advance()
    expect(runtime.queryRuns(identity)).toMatchObject([{ runId: accepted.items[0]!.runId, status: 'prepared' }])
  })

  it('persists preparation failure, continues sibling requests, and reuses the failed Run', async () => {
    const { runtime, prepare } = createRuntime()
    const successfulPreparation = await prepare(request())
    prepare.mockClear()
    prepare.mockImplementation(async input => {
      if (input.parameters.positive_prompt === 'broken') throw new Error('template is invalid')
      return successfulPreparation
    })
    const items = [{ requestId: randomUUID(), request: request('broken') }, { requestId: randomUUID(), request: request('valid') }]
    const accepted = await runtime.acceptGenerations(identity, items)
    await runtime.advance()
    const runs = await runtime.readGenerationRunMedia({ workspaceId: identity.workspaceId, runIds: accepted.items.map(item => item.runId) })
    expect(runs.runs).toMatchObject([
      { status: 'failed', run_error: { code: 'GENERATION_PREPARATION_FAILED', message: 'template is invalid' } },
      { status: 'prepared', run_error: null },
    ])
    await expect(runtime.acceptGenerations({ ...identity, callId: 'call_failed_retry' }, items)).resolves.toEqual({
      items: accepted.items.map(item => ({ ...item, acceptance: 'reused' })),
    })
    expect(prepare).toHaveBeenCalledTimes(2)
  })
})

describe('GenerationRuntime batch acceptance', () => {
  it('accepts independent requests from one Tool Call before preparing them', async () => {
    const { runtime, prepare } = createRuntime()
    const items = [{ requestId: randomUUID(), request: request() }, { requestId: randomUUID(), request: request('second prompt') }]

    const accepted = await runtime.acceptGenerations(identity, items)

    expect(accepted.items).toEqual(items.map((item, index) => ({ requestId: item.requestId, runId: expect.any(String), acceptance: 'accepted' })))
    expect(new Set(accepted.items.map(item => item.runId)).size).toBe(2)
    expect(runtime.queryRuns(identity).map(run => run.status)).toEqual(['created', 'created'])
    expect(prepare).not.toHaveBeenCalled()
    await runtime.advance()
    expect(runtime.queryRuns(identity).map(run => run.status)).toEqual(['prepared', 'prepared'])
    expect(prepare).toHaveBeenCalledTimes(2)
  })
})
