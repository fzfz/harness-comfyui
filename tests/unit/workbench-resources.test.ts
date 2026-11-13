import { contracts } from '#contracts'
import { describe, expect, it, vi } from 'vitest'
import { CATALOG_KIND_DEFINITIONS } from '../../src/catalog/contract.ts'
import { CATALOG_PRESENTATION, type CatalogDetails } from '../../src/catalog/details-schema.ts'
import { createWorkbenchInputAdapter } from '../../src/host/workbench/input-adapter.ts'



const draft = () => contracts.parse('taskDraft', 'input', { prompt_input: { positive_prompt: 'rain', negative_prompt: null }, generation_input: { title: 'scene', instance_id: null, template_id: null, model: null, loras: [], parameters: {} }, parameter_mapping: null, base_model_id: null })

describe('workbench resource selection contract', () => {
  it('accepts all catalog categories in recommendations and preserves same-id distinct categories', () => {
    const refs = CATALOG_KIND_DEFINITIONS.map(({ kind }) => ({ kind, id: '1' }))
    expect(contracts.parse('taskArtifact', 'input', { type: 'resources', refs })).toEqual({ type: 'resources', refs })
    expect(draft().prompt_resource_refs).toEqual([])
    expect(contracts.parse('taskDraft', 'input', { ...draft(), prompt_resource_refs: [{ kind: 'style', id: '1' }, { kind: 'artist-string', id: '1' }] }).prompt_resource_refs).toHaveLength(2)
    expect(() => contracts.parse('taskDraft', 'input', { ...draft(), prompt_resource_refs: [{ kind: 'model', id: '1' }] })).toThrow()
    expect(() => contracts.parse('taskDraft', 'input', { ...draft(), prompt_resource_refs: [{ kind: 'style', id: '1' }, { kind: 'style', id: '1' }] })).toThrow()
  })

  it('resolves draft resources into independent source-field snapshots with selected LoRA weight', async () => {
    const details = vi.fn(async ({ kind, id }: { kind: 'style' | 'artist-string' | 'lora'; id: string }) => ({ kind, id,
      item: { label: `${kind} ${id}` },
      fields: Object.entries({ id, name: 'Soft ink', prompt_text: '@ink', artist_string: '@line', description: 'source description', usage: 'source usage', trigger_words_json: ['glass'], file_name: 'glass.safetensors', base_model_id: '5', title: 'Line artists', style_ids: [1] }).map(([key, value]) => ({ key, value })),
    } as unknown as CatalogDetails))
    const adapter = createWorkbenchInputAdapter({ runtime: { inspectTemplateRuntimeParameters: vi.fn(), validateGenerationRequest: vi.fn() }, catalog: { details, resolveGenerationModel: vi.fn(), resolveLora: vi.fn(), resolveTemplate: vi.fn() } })
    const selected = { ...draft(), prompt_resource_refs: [{ kind: 'style' as const, id: '1' }, { kind: 'artist-string' as const, id: '1' }], generation_input: { ...draft().generation_input, loras: [{ id: '1', file_name: 'glass.safetensors', weight: 0.35, trigger_words: [] }] } }
    const snapshots = await adapter.resolveSelectedResources(selected)
    expect(snapshots.map(({ kind, id, name }) => ({ kind, id, name }))).toEqual([{ kind: 'lora', id: '1', name: 'lora 1' }, { kind: 'style', id: '1', name: 'style 1' }, { kind: 'artist-string', id: '1', name: 'artist-string 1' }])
    expect(snapshots[0]).toMatchObject({ selected_weight: 0.35, fields: { trigger_words_json: ['glass'], usage: 'source usage' } })
    expect(snapshots[1]!.fields).toEqual({ base_model_id: '5', name: 'Soft ink', prompt_text: '@ink', style_description: null, aliases_json: null })
    expect(snapshots[2]!.fields.artist_string).toBe('@line')
    const { instructions: _instructions, ...input } = selected
    const saved = contracts.parse('taskInput', 'output', { ...input, requirements: { original_request: 'scene', instructions: '' }, requested_skill: null, max_runs: 0, selected_resources: snapshots })
    expect(saved.selected_resources).toEqual(snapshots)
    expect(Object.keys(snapshots[0]!.fields)).toEqual(CATALOG_PRESENTATION.kinds.lora.prompt_fields)
    selected.generation_input.loras[0]!.weight = 0.9
    expect(snapshots[0]!.selected_weight).toBe(0.35)
  })

  it('merges multi-category references without replacing existing LoRA weights', async () => {
    const adapter = createWorkbenchInputAdapter({ runtime: { inspectTemplateRuntimeParameters: vi.fn(), validateGenerationRequest: vi.fn() }, catalog: { details: vi.fn(), resolveGenerationModel: vi.fn(), resolveLora: vi.fn(async id => ({ id, base_model_id: '2', model_id: '3', file_name: 'glass.safetensors', description: '', usage: '', trigger_words: ['glass'], weight: 0.8 })), resolveTemplate: vi.fn() } })
    const current = { ...draft(), prompt_resource_refs: [{ kind: 'style' as const, id: '1' }], generation_input: { ...draft().generation_input, loras: [{ id: '1', file_name: 'glass.safetensors', weight: 0.35, trigger_words: [] }] } }
    const result = await adapter.resolveResourceRefs([{ kind: 'lora', id: '1' }, { kind: 'style', id: '1' }, { kind: 'artist-string', id: '1' }], current)
    expect(result.prompt_resource_refs).toEqual([{ kind: 'style', id: '1' }, { kind: 'artist-string', id: '1' }])
    expect(result.generation_input.loras).toEqual([{ id: '1', file_name: 'glass.safetensors', weight: 0.35, trigger_words: ['glass'] }])
  })

  it('identifies an unavailable selected LoRA by its saved filename', async () => {
    const details = vi.fn(async () => { throw new Error('record missing') })
    const adapter = createWorkbenchInputAdapter({ runtime: { inspectTemplateRuntimeParameters: vi.fn(), validateGenerationRequest: vi.fn() }, catalog: { details, resolveGenerationModel: vi.fn(), resolveLora: vi.fn(), resolveTemplate: vi.fn() } })
    const current = draft()
    current.generation_input.loras = [{ id: '9', file_name: 'selected-glass.safetensors', weight: 0.4, trigger_words: [] }]
    await expect(adapter.resolveSelectedResources(current)).rejects.toMatchObject({
      code: 'WORKBENCH_RESOURCE_UNAVAILABLE',
      issues: [{ path: 'prompt_resource_refs', message: 'LoRA“selected-glass.safetensors”读取失败：record missing。请重试；若仍然失败，请移除或重新选择此资源。' }],
    })
    expect(current.generation_input.loras).toEqual([{ id: '9', file_name: 'selected-glass.safetensors', weight: 0.4, trigger_words: [] }])
  })

  it('reports a missing selected category and preserves cancellation', async () => {
    const details = vi.fn(async () => { throw new Error('record missing') })
    const adapter = createWorkbenchInputAdapter({ runtime: { inspectTemplateRuntimeParameters: vi.fn(), validateGenerationRequest: vi.fn() }, catalog: { details, resolveGenerationModel: vi.fn(), resolveLora: vi.fn(), resolveTemplate: vi.fn() } })
    const current = { ...draft(), prompt_resource_refs: [{ kind: 'style' as const, id: '9' }] }
    await expect(adapter.resolveSelectedResources(current)).rejects.toMatchObject({ code: 'WORKBENCH_RESOURCE_UNAVAILABLE', issues: [{ path: 'prompt_resource_refs', message: '画师或画风“9”读取失败：record missing。请重试；若仍然失败，请移除或重新选择此资源。' }] })
    const controller = new AbortController()
    controller.abort()
    await expect(adapter.resolveSelectedResources(current, controller.signal)).rejects.toHaveProperty('name', 'AbortError')
    expect(details).toHaveBeenCalledTimes(1)
  })
})
