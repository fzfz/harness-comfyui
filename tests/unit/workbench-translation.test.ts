import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkbenchTranslations } from '../../src/host/workbench/translation-service.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { FunctionBinding } from '../../src/workbench/contract.ts'
import type { TranslationScope } from '../../src/workbench/translation.ts'
import { DatabaseSync } from 'node:sqlite'
import { GenerationRuntime } from '../../src/host/generation/generation-runtime.ts'
import { WorkbenchStore } from '../../src/host/storage/workbench-store.ts'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-translation-'))
  const database = new DatabaseSync(':memory:')
  new GenerationRuntime({ database, runRepositoryFile: join(directory, 'runs.sqlite'), runDirectory: join(directory, 'runs'), savedMediaDirectory: join(directory, 'media'), preparer: { inspectRuntimeParameters: async () => ({ parameters: [], size_candidates: [] }), validateInput: async () => {}, prepare: async () => { throw new Error('No generation requested') } } })
  const store = new WorkbenchStore({ database, artifactDirectory: directory })
  cleanups.push(() => { database.close(); rmSync(directory, { recursive: true, force: true }) })
  const { work, branch } = store.createWork({ workspaceId: 'workspace', name: 'Translation', goal: 'Prompt' })
  const scope = { workspace_id: 'workspace', work_id: work.work_id, branch_id: branch.branch_id, target: 'before' as const, field: 'positive_prompt' as const }
  const events = new Map<string, SessionEvent[]>()
  let count = 0
  const ports = {
    store,
    binding: () => ({ kind: 'translate', preset_id: 'harness-comfyui-translation', agent_model: { provider: 'lan-gpt', model: 'gpt-6-luna', reasoningEffort: 'off' }, request_template: '翻译：{{source_text}}' }) as FunctionBinding,
    controller: {
      create: vi.fn(async () => ({ sessionId: `session-${++count}` })),
      selectModel: vi.fn(async (request: { provider: string; model: string; reasoningEffort?: string }) => ({ selected: request })),
      prompt: vi.fn(async () => ({ accepted: true as const })),
      cancel: vi.fn(() => ({ accepted: true as const })),
    },
    events: vi.fn((id: string) => events.get(id) ?? []),
  }
  const translations = new WorkbenchTranslations(ports)
  cleanups.push(() => translations.dispose())
  return { ports, store, scope, events, translations }
}
function completed(requestId: string, text: string, reason: unknown = { kind: 'completed' }) {
  return [
    { type: 'turn/start', seq: 0, data: { turn: 2 } },
    { type: 'user/message', seq: 1, data: { source: { kind: 'user', rpcId: requestId } } },
    { type: 'assistant/message', seq: 2, data: { turn: 2, message: { content: [{ type: 'text', text }] } } },
    { type: 'turn/end', seq: 3, data: { turn: 2, reason } },
  ] as SessionEvent[]
}
describe('latest translation streams', () => {
  it('stops dispatch when the session fails while model selection is pending', async () => {
    const f = setup()
    let release!: () => void
    const selecting = new Promise<void>(resolve => { release = resolve })
    f.ports.controller.selectModel.mockImplementationOnce(async request => { await selecting; return { selected: request } })
    const stream = f.translations.translate({ ...f.scope, request_id: 'failed-selection', source_text: 'rain' })
    await stream.next()
    await vi.waitFor(() => expect(f.ports.controller.selectModel).toHaveBeenCalled())
    f.translations.failSession('session-1', new Error('Session failed'))
    expect((await stream.next()).value).toEqual({ request_id: 'failed-selection', status: 'failed', error: 'Session failed' })
    await stream.next()
    release()
    await f.translations.handleSessionEvents('session-1')
    expect(f.ports.controller.prompt).not.toHaveBeenCalled()
  })
  it.each([
    { text: '', reason: { kind: 'completed' } },
    { text: '雪', reason: { kind: 'cancelled' } },
    { text: '雪', reason: { kind: 'error', error: { message: 'Provider unavailable' } } },
  ])('retains the saved success after failure and supports retry: $reason.kind $text', async ({ text, reason }) => {
    const f = setup()
    f.store.saveTranslationLatest({ ...f.scope, source_text: 'rain', text: '雨' })
    const request = { ...f.scope, request_id: 'retry', source_text: 'snow' }
    const failed = f.translations.translate(request)
    await failed.next()
    await vi.waitFor(() => expect(f.ports.controller.prompt).toHaveBeenCalledTimes(1))
    f.events.set('session-1', completed('retry', text, reason))
    await f.translations.handleSessionEvents('session-1')
    expect((await failed.next()).value).toMatchObject({ request_id: 'retry', status: 'failed', error: expect.any(String) })
    await failed.next()
    expect(f.store.getTranslationLatest(f.scope)).toMatchObject({ source_text: 'rain', text: '雨' })
    const retried = f.translations.translate(request)
    await retried.next()
    await vi.waitFor(() => expect(f.ports.controller.prompt).toHaveBeenCalledTimes(2))
    f.events.set('session-2', completed('retry', '雪'))
    await f.translations.handleSessionEvents('session-2')
    expect((await retried.next()).value).toEqual({ request_id: 'retry', status: 'succeeded', text: '雪' })
    await retried.next()
    expect(f.store.getTranslationLatest(f.scope)).toMatchObject({ source_text: 'snow', text: '雪' })
  })

  it('keeps all targets and prompt fields independent during simultaneous translation', async () => {
    const f = setup()
    const scopes: TranslationScope[] = ['before', 'result', 'draft'].flatMap(target => ['positive_prompt', 'negative_prompt'].map(field => ({ ...f.scope, target, field } as TranslationScope)))
    const streams = scopes.map((scope, index) => f.translations.translate({ ...scope, request_id: `scope-${index}`, source_text: `source-${index}` }))
    await Promise.all(streams.map(stream => stream.next()))
    await vi.waitFor(() => expect(f.ports.controller.prompt).toHaveBeenCalledTimes(6))
    for (let index = 5; index >= 0; index--) {
      const sessionId = `session-${index + 1}`
      f.events.set(sessionId, completed(`scope-${index}`, `译文-${index}`))
      await f.translations.handleSessionEvents(sessionId)
      expect((await streams[index]!.next()).value).toMatchObject({ request_id: `scope-${index}`, status: 'succeeded', text: `译文-${index}` })
      await streams[index]!.next()
    }
    expect(scopes.map(scope => f.store.getTranslationLatest(scope)?.text)).toEqual(['译文-0', '译文-1', '译文-2', '译文-3', '译文-4', '译文-5'])
  })

  it('cancels a session created after its caller has already closed the stream', async () => {
    const f = setup()
    let release!: (session: { sessionId: string }) => void
    f.ports.controller.create.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const cancellation = new AbortController()
    const stream = f.translations.translate({ ...f.scope, request_id: 'creating', source_text: 'snow' }, cancellation.signal)
    await stream.next()
    const pending = stream.next()
    cancellation.abort()
    expect(await pending).toMatchObject({ done: true })
    release({ sessionId: 'late-session' })
    await vi.waitFor(() => expect(f.ports.controller.cancel).toHaveBeenCalledWith({ sessionId: 'late-session' }))
    expect(f.ports.controller.prompt).not.toHaveBeenCalled()
    expect(f.store.getTranslationLatest(f.scope)).toBeNull()
  })

  it('rejects empty sources, mismatched scope and duplicate active request IDs', async () => {
    const f = setup()
    await expect(f.translations.translate({ ...f.scope, request_id: 'empty', source_text: '  ' }).next()).rejects.toMatchObject({ code: 'WORKBENCH_TRANSLATION_EMPTY' })
    await expect(f.translations.translate({ ...f.scope, workspace_id: 'other', request_id: 'scope', source_text: 'rain' }).next()).rejects.toBeDefined()
    await expect(f.translations.translate({ ...f.scope, request_id: 'aborted', source_text: 'rain' }, AbortSignal.abort()).next()).rejects.toMatchObject({ name: 'AbortError' })
    const active = f.translations.translate({ ...f.scope, request_id: 'active', source_text: 'rain' })
    await active.next()
    await expect(f.translations.translate({ ...f.scope, request_id: 'active', source_text: 'snow' }).next()).rejects.toMatchObject({ code: 'WORKBENCH_TRANSLATION_CONFLICT' })
    await active.return(undefined)
  })

  it('stops pending sessions when the service is disposed or the consumer throws', async () => {
    const f = setup()
    const stream = f.translations.translate({ ...f.scope, request_id: 'consumer-error', source_text: 'rain' })
    await stream.next()
    await vi.waitFor(() => expect(f.ports.controller.prompt).toHaveBeenCalled())
    const failure = new Error('Display closed after failure')
    await expect(stream.throw(failure)).rejects.toBe(failure)
    expect(f.ports.controller.cancel).toHaveBeenCalledWith({ sessionId: 'session-1' })
    const active = f.translations.translate({ ...f.scope, request_id: 'dispose', source_text: 'snow' })
    await active.next()
    await vi.waitFor(() => expect(f.ports.controller.prompt).toHaveBeenCalledTimes(2))
    f.translations.dispose()
    expect((await active.next()).value).toMatchObject({ status: 'failed' })
    await active.next()
    expect(f.ports.controller.cancel).toHaveBeenCalledWith({ sessionId: 'session-2' })
  })

  it('cancels a stream while its next result is pending and keeps the last successful translation', async () => {
    const f = setup()
    f.store.saveTranslationLatest({ ...f.scope, source_text: 'rain', text: '雨' })
    const stream = f.translations.translate({ ...f.scope, request_id: 'closed', source_text: 'snow' })
    await stream.next()
    await vi.waitFor(() => expect(f.ports.controller.prompt).toHaveBeenCalled())
    const pending = stream.next()
    const closed = stream.return(undefined)
    await vi.waitFor(() => expect(f.ports.controller.cancel).toHaveBeenCalledWith({ sessionId: 'session-1' }))
    expect(await pending).toMatchObject({ done: true })
    expect(await closed).toMatchObject({ done: true })
    f.events.set('session-1', completed('closed', '雪'))
    await f.translations.handleSessionEvents('session-1')
    expect(f.store.getTranslationLatest(f.scope)).toMatchObject({ source_text: 'rain', text: '雨' })
  })
  it.each(['translated', 'cached'] as const)('keeps a newer %s source when an earlier reply arrives late', async mode => {
    const f = setup()
    const old = f.translations.translate({ ...f.scope, request_id: 'old', source_text: 'rain' })
    await old.next()
    await vi.waitFor(() => expect(f.ports.controller.prompt).toHaveBeenCalledTimes(1))
    if (mode === 'cached') f.store.saveTranslationLatest({ ...f.scope, source_text: 'snow', text: '雪' })
    const next = f.translations.translate({ ...f.scope, request_id: 'new', source_text: 'snow' })
    const first = await next.next()
    if (mode === 'translated') {
      expect(first.value).toMatchObject({ status: 'running' })
      await vi.waitFor(() => expect(f.ports.controller.prompt).toHaveBeenCalledTimes(2))
      f.events.set('session-2', completed('new', '雪'))
      await f.translations.handleSessionEvents('session-2')
      expect((await next.next()).value).toMatchObject({ request_id: 'new', status: 'succeeded', text: '雪' })
    } else expect(first.value).toMatchObject({ request_id: 'new', status: 'succeeded', text: '雪' })
    await next.next()
    f.events.set('session-1', completed('old', '雨'))
    await f.translations.handleSessionEvents('session-1')
    expect((await old.next()).value).toMatchObject({ request_id: 'old', status: 'succeeded', text: '雨' })
    await old.next()
    expect(f.store.getTranslationLatest(f.scope)).toMatchObject({ source_text: 'snow', text: '雪' })
  })
  it('streams a fresh translation and replaces the previously saved source', async () => {
    const f = setup()
    f.store.saveTranslationLatest({ ...f.scope, source_text: 'rain', text: '雨' })
    const stream = f.translations.translate({ ...f.scope, request_id: 'fresh', source_text: 'snow' })
    expect(await stream.next()).toEqual({ done: false, value: { request_id: 'fresh', status: 'running' } })
    await vi.waitFor(() => expect(f.ports.controller.prompt).toHaveBeenCalled())
    f.events.set('session-1', completed('fresh', '雪'))
    await f.translations.handleSessionEvents('session-1')
    expect(await stream.next()).toEqual({ done: false, value: { request_id: 'fresh', status: 'succeeded', text: '雪' } })
    expect(await stream.next()).toMatchObject({ done: true })
    expect(f.store.getTranslationLatest(f.scope)).toEqual({ ...f.scope, source_text: 'snow', text: '雪' })
  })
  it('returns an exact cached source without opening a translation session', async () => {
    const f = setup()
    f.store.saveTranslationLatest({ ...f.scope, source_text: 'rain', text: '雨' })
    const results = []
    for await (const result of f.translations.translate({ ...f.scope, request_id: 'cached', source_text: 'rain' })) results.push(result)
    expect(results).toEqual([{ request_id: 'cached', status: 'succeeded', text: '雨' }])
    expect(f.ports.controller.create).not.toHaveBeenCalled()
  })
})
