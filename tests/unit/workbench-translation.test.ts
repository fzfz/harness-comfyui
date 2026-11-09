import { describe, expect, it, vi } from 'vitest'
import { renderRequestTemplate, requestTemplateProblem } from '../../src/workbench/request-template.ts'
import { WorkbenchTranslations } from '../../src/host/workbench/translation-service.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { FunctionBinding } from '../../src/workbench/contract.ts'

describe('translation execution requirements', () => {
  it('validates the source-text placeholder and preserves prompt syntax when rendering', () => {
    const template = '请翻译：\n{{source_text}}'
    expect(requestTemplateProblem(template, 'translate')).toBe('')
    expect(requestTemplateProblem('任务：{{task_id}}', 'translate')).not.toBe('')
    expect(renderRequestTemplate(template, '(light:1.2)\n<lora:portrait:0.7> $&', 'translate'))
      .toBe('请翻译：\n(light:1.2)\n<lora:portrait:0.7> $&')
  })
})

it('keeps simultaneous translations with their own request, model and final response', async () => {
  const events = new Map<string, SessionEvent[]>()
  const sent: string[] = []
  let count = 0
  const translations = new WorkbenchTranslations({
    binding: () => ({ kind: 'translate', preset_id: 'harness-comfyui-translation', agent_model: { provider: 'lan-gpt', model: 'gpt-6-luna', reasoningEffort: 'off' }, request_template: '翻译：{{source_text}}' }) as FunctionBinding,
    controller: {
      create: async () => ({ sessionId: `session-${++count}` }),
      selectModel: async request => ({ selected: request }),
      prompt: async request => { sent.push(request.content[0].text); return { accepted: true } },
      cancel: () => ({ accepted: true }),
    },
    events: id => events.get(id) ?? [],
  })
  await translations.start({ request_id: 'positive', workspace_id: 'workspace', source_text: '(light:1.2)' })
  await translations.start({ request_id: 'negative', workspace_id: 'workspace', source_text: 'blur' })
  events.set('session-2', [
    { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: '模糊' }] } } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ] as SessionEvent[])
  expect(translations.get('negative')).toEqual({ request_id: 'negative', status: 'succeeded', text: '模糊' })
  expect(translations.get('positive')).toEqual({ request_id: 'positive', status: 'running' })
  expect(sent).toEqual(['翻译：(light:1.2)', '翻译：blur'])
})

it('cancels a session created after its dialog was closed and never sends the prompt', async () => {
  let completeCreate!: (value: { sessionId: string }) => void
  const prompt = vi.fn()
  const cancel = vi.fn(() => ({ accepted: true as const }))
  const translations = new WorkbenchTranslations({
    binding: () => ({ kind: 'translate', preset_id: 'harness-comfyui-translation', agent_model: { provider: 'lan-gpt', model: 'gpt-6-luna', reasoningEffort: 'off' }, request_template: '{{source_text}}' }) as FunctionBinding,
    controller: {
      create: () => new Promise(resolve => { completeCreate = resolve }),
      selectModel: async request => ({ selected: request }),
      prompt,
      cancel,
    },
    events: () => [],
  })
  const pending = translations.start({ request_id: 'closed', workspace_id: 'workspace', source_text: 'blur' })
  expect(translations.cancel('closed').status).toBe('failed')
  completeCreate({ sessionId: 'late-session' })
  expect((await pending).status).toBe('failed')
  expect(cancel).toHaveBeenCalledWith({ sessionId: 'late-session' })
  expect(prompt).not.toHaveBeenCalled()
  expect(() => translations.get('closed')).toThrow()
})

it('reports an incomplete turn as failed even when it contains an assistant response', async () => {
  const translations = new WorkbenchTranslations({
    binding: () => ({ kind: 'translate', preset_id: 'harness-comfyui-translation', agent_model: { provider: 'lan-gpt', model: 'gpt-6-luna', reasoningEffort: 'off' }, request_template: '{{source_text}}' }) as FunctionBinding,
    controller: {
      create: async () => ({ sessionId: 'failed-session' }),
      selectModel: async request => ({ selected: request }),
      prompt: async () => ({ accepted: true }),
      cancel: () => ({ accepted: true }),
    },
    events: () => [
      { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: 'partial' }] } } },
      { type: 'turn/end', data: { turn: 1, reason: { kind: 'error', error: { message: 'provider disconnected' } } } },
    ] as SessionEvent[],
  })
  await translations.start({ request_id: 'failed', workspace_id: 'workspace', source_text: 'blur' })
  expect(translations.get('failed')).toEqual({ request_id: 'failed', status: 'failed', error: 'provider disconnected' })
})
