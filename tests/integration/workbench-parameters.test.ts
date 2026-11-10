import { saveFixtureDraft } from '../support/workbench-draft.ts'
import { afterEach, expect, it, vi } from 'vitest'
import { ComfyWorkflowCompiler } from '../../src/host/generation/workflow-compiler.ts'
import { SourceGenerationPreparer, type UiWorkflow } from '../../src/host/generation/source-preparer.ts'
import { createWorkbenchHostFixture } from '../support/workbench-host.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const signal = () => new AbortController().signal

async function fixture(withSizes = false, referenceImageType?: 'STRING' | 'choice') {
  const nodeIds = [41, 42]
  const referenceNodeIds = referenceImageType ? [113, 114] : []
  const imageChoices = ['参考素材/初始 图.png', '参考素材/第一轮/角色 正面.png', '参考素材/第二轮/角色 侧面.png']
  const workflow: UiWorkflow = { version: 0.4, nodes: [
    ...nodeIds.map(id => ({
      id, type: 'ParameterGenerator', mode: 0,
      inputs: [
        ['width', 'INT'], ['height', 'INT'], ['steps', 'INT'], ['cfg', 'FLOAT'],
        ['sampler_name', 'COMBO'], ['scheduler', 'BOOLEAN'], ['denoise', 'STRING'],
      ].map(([name, type]) => ({ name, type, link: null, widget: { name } })),
      outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [id] }],
      widgets_values: [512, 768, 20, 7.5, 'euler', true, 'template note'],
    })),
    ...referenceNodeIds.flatMap(id => [
      { id, type: 'LoadImage', mode: 0, inputs: [{ name: 'image', type: referenceImageType === 'STRING' ? 'STRING' : 'COMBO', link: null, widget: { name: 'image' } }], outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [id] }], widgets_values: ['参考素材/初始 图.png'] },
      { id: id + 10, type: 'SaveImage', mode: 0, inputs: [{ name: 'images', type: 'IMAGE', link: id }], outputs: [], widgets_values: [] },
    ]),
    ...(withSizes ? [
      { id: 50, type: 'MergeImages', mode: 0, inputs: [{ name: 'first', type: 'IMAGE', link: 41 }, { name: 'second', type: 'IMAGE', link: 42 }], outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [50] }], widgets_values: [] },
      { id: 60, type: 'SaveImage', mode: 0, inputs: [{ name: 'images', type: 'IMAGE', link: 50 }], outputs: [], widgets_values: [] },
    ] : nodeIds.map(id => ({ id: id + 10, type: 'SaveImage', mode: 0, inputs: [{ name: 'images', type: 'IMAGE', link: id }], outputs: [], widgets_values: [] }))),
  ], links: [
    ...(withSizes ? [[41, 41, 0, 50, 0, 'IMAGE'], [42, 42, 0, 50, 1, 'IMAGE'], [50, 50, 0, 60, 0, 'IMAGE']] : nodeIds.map(id => [id, id, 0, id + 10, 0, 'IMAGE'])),
    ...referenceNodeIds.map(id => [id, id, 0, id + 10, 0, 'IMAGE']),
  ] }
  const definitions = {
    ParameterGenerator: {
      input: { required: {
        width: ['INT', { min: 64, max: 2048 }], height: ['INT', { min: 64, max: 2048 }],
        steps: ['INT', { min: 1, max: 50 }], cfg: ['FLOAT', { min: 0, max: 20 }],
        sampler_name: [['euler', 'ddim'], {}], scheduler: ['BOOLEAN', {}], denoise: ['STRING', {}],
      } },
      input_order: { required: ['width', 'height', 'steps', 'cfg', 'sampler_name', 'scheduler', 'denoise'], optional: [] },
      output: ['IMAGE'], output_node: false,
    },
    LoadImage: {
      input: { required: { image: [referenceImageType === 'choice' ? imageChoices : 'STRING', {}] } },
      input_order: { required: ['image'], optional: [] }, output: ['IMAGE'], output_node: false,
    },
    MergeImages: { input: { required: { first: ['IMAGE'], second: ['IMAGE'] } }, input_order: { required: ['first', 'second'], optional: [] }, output: ['IMAGE'], output_node: false },
    SaveImage: { input: { required: { images: ['IMAGE'] } }, input_order: { required: ['images'], optional: [] }, output_node: true },
  }
  const officialExport = vi.fn(async () => { throw new Error('Parameter edits must not export a Workflow') })
  const randomSeed = vi.fn(() => 123)
  const fetchDefinitions = vi.fn(async () => new Response(JSON.stringify(definitions)))
  const compiler = new ComfyWorkflowCompiler({ fetchImplementation: fetchDefinitions, officialApiWorkflowCompiler: { compile: officialExport }, createRandomSeed: randomSeed })
  const source = {
    readTemplate: vi.fn(async (id: string, _signal?: AbortSignal) => ({ id, title: 'Parameters', workflow })),
    readInstance: vi.fn(async (id: string) => ({ id, title: 'Instance', url: 'http://comfy.test', credentialType: 'none' as const, authorization: null })),
  }
  const preparer = new SourceGenerationPreparer({ defaultInstanceId: '8', source, compiler })
  const host = await createWorkbenchHostFixture(preparer)
  cleanups.push(host.dispose)
  const template = await host.catalog.details({ kind: 'comfyui-template', id: '6' }, signal())
  host.catalog.details.mockResolvedValue({ ...template, item: { ...template.item, baseModelId: null } })
  const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Parameters', goal: 'Configure a template' } }, signal())
  const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
  await saveFixtureDraft(host.remote, { ...scope }, draft => { draft.generation_input.instance_id = '8' }, signal())
  await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'comfyui-template', id: '6' } }, signal())
  await saveFixtureDraft(host.remote, { ...scope }, () => {}, signal())
  const read = async () => {
    const projection = await host.remote.getProjection(scope, signal())
    return { projection, draft: projection.branches.find(branch => branch.branch_id === scope.branchId)!.draft }
  }
  return { ...host, scope, read, source, officialExport, randomSeed, fetchDefinitions }
}

it.each([
  ['steps_42', 31], ['cfg_42', 8.5], ['sampler_name_42', 'ddim'], ['scheduler_42', false], ['denoise_42', 'custom note'],
] as const)('saves a complete draft with %s preserving its JSON value type', async (id, value) => {
  const { remote, scope, read, officialExport, randomSeed } = await fixture()
  const before = await read()
  await saveFixtureDraft(remote, scope, draft => { draft.generation_input.parameters[id] = value; draft.prompt_input.positive_prompt = 'Glass structure' }, signal())
  const after = await read()
  expect(after.draft.generation_input.parameters[id]).toEqual(value)
  expect(after.draft.prompt_input.positive_prompt).toBe('Glass structure')
  expect(after.projection.tasks).toEqual([])
  expect(after.projection.runs).toEqual([])
  expect(after.projection.branches[0]?.editing_draft).toBeNull()
  expect(officialExport).not.toHaveBeenCalled()
  expect(randomSeed).not.toHaveBeenCalled()
  expect(after.draft.generation_input.parameters.width_42).toBe(before.draft.generation_input.parameters.width_42)
})

it.each([
  ['steps_42', 1.5], ['steps_42', 0], ['steps_42', 51], ['steps_42', '31'],
  ['cfg_42', -0.1], ['cfg_42', 20.1], ['cfg_42', '2.5'],
  ['sampler_name_42', 'missing'], ['sampler_name_42', 4], ['scheduler_42', 'false'], ['scheduler_42', 0], ['denoise_42', 10],
] as const)('rejects %s=%j and preserves the complete saved input', async (id, value) => {
  const { remote, scope, read } = await fixture()
  const before = await read()
  await expect(saveFixtureDraft(remote, scope, draft => { draft.generation_input.parameters[id] = value }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT', issues: [{ path: `generation_input.parameters.${id}` }] } })
  expect(await read()).toEqual(before)
})

it('rejects an unknown parameter ID using the selected template description', async () => {
  const { remote, scope, read } = await fixture()
  const before = await read()
  await expect(saveFixtureDraft(remote, scope, draft => { draft.generation_input.parameters.steps = 31 }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_PARAMETER_NOT_ALLOWED', issues: [{ path: 'generation_input.parameters.steps' }] } })
  expect(await read()).toEqual(before)
})

it('saves both size fields atomically and retains the last valid complete input after an invalid correction', async () => {
  const { remote, scope, read } = await fixture(true)
  await saveFixtureDraft(remote, scope, draft => { Object.assign(draft.generation_input.parameters, { width_42: 1024, height_42: 1536 }) }, signal())
  const before = await read()
  expect(before.draft.generation_input.parameters).toMatchObject({ width_42: 1024, height_42: 1536 })
  await expect(saveFixtureDraft(remote, scope, draft => { Object.assign(draft.generation_input.parameters, { width_42: 32, height_42: 768 }) }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT' } })
  expect(await read()).toEqual(before)
})

it.each(['STRING', 'choice'] as const)('saves an imported image binding before upload under the %s template contract', async kind => {
  const { remote, scope, read, officialExport } = await fixture(false, kind)
  await saveFixtureDraft(remote, scope, draft => {
    draft.image_refs = [{ image_ref_id: 'image-a', source: { kind: 'uploaded_file', file_id: 'file-a' }, purpose: 'both', reference_requirement: 'Keep the framing' }]
    draft.workflow_image_bindings = [{ parameter_id: 'reference_image_113', image_ref_ids: ['image-a'] }]
  }, signal())
  const before = await read()
  expect(before.draft.workflow_image_bindings).toEqual([{ parameter_id: 'reference_image_113', image_ref_ids: ['image-a'] }])
  await expect(saveFixtureDraft(remote, scope, draft => {
    draft.image_refs.push({ image_ref_id: 'image-b', source: { kind: 'uploaded_file', file_id: 'file-b' }, purpose: 'workflow', reference_requirement: '' })
    draft.workflow_image_bindings[0]!.image_ref_ids.push('image-b')
  }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_INVALID_INPUT' } })
  expect(await read()).toEqual(before)
  expect(officialExport).not.toHaveBeenCalled()
})

it('rejects a stale complete save after another save changes the parameters', async () => {
  const { remote, scope, read } = await fixture()
  const before = await read(), expected = before.draft
  await saveFixtureDraft(remote, scope, draft => { draft.generation_input.parameters.steps_42 = 31 }, signal())
  const stale = structuredClone(expected)
  stale.generation_input.parameters.cfg_42 = 8.5
  await expect(remote.mutate({ ...scope, type: 'save-draft', value: { expected, expectedEditingDraft: null, draft: stale } }, signal())).rejects.toMatchObject({ details: { code: 'WORKBENCH_EDIT_CONFLICT' } })
  expect((await read()).draft.generation_input.parameters).toMatchObject({ steps_42: 31, cfg_42: 7.5 })
})

it('rejects a save that completed template validation after a concurrent save', async () => {
  const { remote, scope, read, source } = await fixture()
  let release!: () => void, started!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve }), entered = new Promise<void>(resolve => { started = resolve })
  const original = source.readTemplate.getMockImplementation()!
  source.readTemplate.mockImplementationOnce(async (...args) => { started(); await waiting; return original(...args) })
  const first = saveFixtureDraft(remote, scope, draft => { draft.generation_input.parameters.steps_42 = 31 }, signal()).then(value => ({ value }), error => ({ error }))
  await entered
  await saveFixtureDraft(remote, scope, draft => { draft.generation_input.parameters.cfg_42 = 8.5 }, signal())
  release()
  expect(await first).toMatchObject({ error: { details: { code: 'WORKBENCH_EDIT_CONFLICT' } } })
  expect((await read()).draft.generation_input.parameters).toMatchObject({ steps_42: 20, cfg_42: 8.5 })
})

it('cancels a complete save before reading or changing the selected input', async () => {
  const { remote, scope, read } = await fixture(), before = await read()
  const controller = new AbortController()
  controller.abort()
  await expect(saveFixtureDraft(remote, scope, draft => { draft.generation_input.parameters.steps_42 = 31 }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(await read()).toEqual(before)
})

it('keeps parameter-task template overrides in its fixed input and editing draft until the user saves', async () => {
  const { remote, scope, read } = await fixture()
  const before = await read()
  const receipt = await remote.mutate({ ...scope, type: 'agent-action', id: 'parameters', value: { draft: { instructions: 'Tune steps', resources: { instance_id: '9', template_id: '5' } } } }, signal())
  const after = await read(), task = after.projection.tasks.find(task => task.task_id === receipt.taskId)!
  expect(task.input.generation_input).toMatchObject({ instance_id: '9', template_id: '5' })
  expect(after.draft).toEqual(before.draft)
  expect(after.projection.branches[0]?.editing_draft?.generation_input).toMatchObject({ instance_id: '9', template_id: '5' })
})
