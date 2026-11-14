import { afterEach, describe, expect, it, vi } from 'vitest'
import { contracts } from '#contracts'
import { renderRequestTemplate } from '../../src/workbench/request-template.ts'
import { WorkbenchTranslations } from '../../src/host/workbench/translation-service.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { FunctionBinding } from '../../src/workbench/contract.ts'
import type { TranslationRequest } from '../../src/workbench/translation.ts'
import { DatabaseSync } from 'node:sqlite'
import { GenerationRuntime } from '../../src/host/generation/generation-runtime.ts'
import { WorkbenchStore } from '../../src/host/storage/workbench-store.ts'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-translation-'))
  const database = new DatabaseSync(':memory:')
  new GenerationRuntime({ database, runRepositoryFile: join(directory, 'runs.sqlite'), runDirectory: join(directory, 'runs'), savedMediaDirectory: join(directory, 'media'), preparer: { inspectRuntimeParameters: async () => ({ parameters: [], size_candidates: [] }), validateInput: async () => {}, prepare: async () => { throw new Error('No generation requested') } } })
  const store = new WorkbenchStore({ database, artifactDirectory: directory })
  cleanups.push(() => { database.close(); rmSync(directory, { recursive: true, force: true }) })
  const { work, branch } = store.createWork({ workspaceId: 'workspace', name: 'Translation', goal: 'Prompt' })
  const scope = { workspace_id: 'workspace', work_id: work.work_id, branch_id: branch.branch_id, field: 'positive_prompt' as const }
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
  return { ports, store, scope, events, translations: new WorkbenchTranslations(ports) }
}
function completed(requestId: string, text: string, reason: unknown = { kind: 'completed' }) {
  return [
    { type: 'turn/start', seq: 0, data: { turn: 2 } },
    { type: 'user/message', seq: 1, data: { source: { kind: 'user', rpcId: requestId } } },
    { type: 'assistant/message', seq: 2, data: { turn: 2, message: { content: [{ type: 'text', text }] } } },
    { type: 'turn/end', seq: 3, data: { turn: 2, reason } },
  ] as SessionEvent[]
}
describe('translation execution requirements', () => {
  it('fails an abandoned session association without dispatching another translation', async () => {
    const f = setup()
    f.store.saveTranslation({ ...f.scope, request_id: 'orphan', source_text: 'rain', session_id: 'prepared-session', harness_turn: null, start_seq: -1, created_at: 1, finished_at: null, status: 'running' })
    await f.translations.recover()
    expect(f.translations.get('orphan')).toMatchObject({ status: 'failed', error: expect.any(String) })
    expect(f.ports.controller.prompt).not.toHaveBeenCalled()
    expect(f.ports.controller.create).not.toHaveBeenCalled()
  })
  it('preserves a local translation while its prompt acceptance is pending', async () => {
    const f = setup()
    let entered!: () => void, release!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const suspended = new Promise<void>(resolve => { release = resolve })
    f.ports.controller.prompt.mockImplementationOnce(async () => { entered(); await suspended; return { accepted: true } })
    const dispatch = f.translations.start({ ...f.scope, request_id: 'local', source_text: 'rain' })
    await started
    await f.translations.recover()
    expect(f.translations.get('local').status).toBe('running')
    release()
    await dispatch
  })

  it('validates the source-text placeholder and preserves prompt syntax when rendering', () => {
    expect(contracts.parse('requestTemplateProblem', 'input', { template: '请翻译：{{source_text}}', kind: 'translate' })).toBe('')
    expect(contracts.parse('requestTemplateProblem', 'input', { template: '任务：{{task_id}}', kind: 'translate' })).not.toBe('')
    expect(renderRequestTemplate('请翻译：\n{{source_text}}', '(light:1.2)\n<lora:portrait:0.7> $&', 'translate')).toBe('请翻译：\n(light:1.2)\n<lora:portrait:0.7> $&')
  })
  it('reads persisted translation state without consuming session events', async () => {
    const f = setup()
    await f.translations.start({ ...f.scope, request_id: 'read-only', source_text: 'text' })
    f.events.set('session-1', completed('read-only', '译文'))
    f.ports.events.mockClear()
    expect(f.translations.get('read-only')).toEqual({ request_id: 'read-only', status: 'running' })
    expect(f.ports.events).not.toHaveBeenCalled()
  })
  it('keeps simultaneous translations with their own source and matching session turn', async () => {
    const f = setup()
    await f.translations.start({ ...f.scope, request_id: 'positive', source_text: '(light:1.2)' })
    await f.translations.start({ ...f.scope, field: 'negative_prompt', request_id: 'negative', source_text: 'blur' })
    f.events.set('session-2', completed('unrelated', 'other turn'))
    await f.translations.handleSessionEvents('session-2')
    expect(f.translations.get('negative').status).toBe('running')
    f.events.set('session-2', completed('negative', '模糊'))
    await f.translations.handleSessionEvents('session-2')
    expect(f.translations.get('negative')).toEqual({ request_id: 'negative', status: 'succeeded', text: '模糊' })
    expect(f.translations.get('positive')).toEqual({ request_id: 'positive', status: 'running' })
    expect(f.store.getTranslation('negative')).toMatchObject({ ...f.scope, field: 'negative_prompt', source_text: 'blur', harness_turn: 2 })
  })
  it('recovers completed translations from session history without dispatching another prompt', async () => {
    const f = setup()
    const request: TranslationRequest = { ...f.scope, request_id: 'recover', source_text: 'rain' }
    await f.translations.start(request)
    f.translations.dispose()
    f.events.set('session-1', completed('recover', '雨'))
    const restored = new WorkbenchTranslations(f.ports)
    await restored.recover()
    await restored.recover()
    expect(restored.get('recover')).toEqual({ request_id: 'recover', status: 'succeeded', text: '雨' })
    await restored.start(request)
    expect(f.ports.controller.prompt).toHaveBeenCalledTimes(1)
    expect(f.ports.controller.create).toHaveBeenCalledTimes(1)
  })
  it('preserves explicit cancellation when session creation completes later', async () => {
    const f = setup()
    let completeCreate!: (value: { sessionId: string }) => void
    f.ports.controller.create.mockImplementationOnce(() => new Promise(resolve => { completeCreate = resolve }))
    const pending = f.translations.start({ ...f.scope, request_id: 'cancelled', source_text: 'blur' })
    expect(f.translations.cancel('cancelled').status).toBe('failed')
    completeCreate({ sessionId: 'late-session' })
    expect((await pending).status).toBe('failed')
    expect(f.ports.controller.cancel).toHaveBeenCalledWith({ sessionId: 'late-session' })
    expect(f.ports.controller.prompt).not.toHaveBeenCalled()
    expect(f.store.getTranslation('cancelled')).toMatchObject({ status: 'failed' })
  })
  it('records the matching turn error even when the Agent returned partial text', async () => {
    const f = setup()
    await f.translations.start({ ...f.scope, request_id: 'failed', source_text: 'blur' })
    f.events.set('session-1', completed('failed', 'partial', { kind: 'error', error: { message: 'provider disconnected' } }))
    await f.translations.handleSessionEvents('session-1')
    expect(f.translations.get('failed')).toEqual({ request_id: 'failed', status: 'failed', error: 'provider disconnected' })
  })
})
