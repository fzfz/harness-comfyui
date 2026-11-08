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
  await host.remote.mutate({ ...scope, type: 'update-draft', field: 'instance_id', value: '8' }, signal())
  await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'comfyui-template', id: '6' } }, signal())
  const read = async () => {
    const projection = await host.remote.getProjection(scope, signal())
    return { projection, draft: projection.branches.find(branch => branch.branch_id === scope.branchId)!.draft }
  }
  return { ...host, scope, read, source, officialExport, randomSeed, fetchDefinitions }
}

it.each(['STRING', 'choice'] as const)('saves and replaces one reference-image path under the %s contract while preserving other inputs and branches', async valueType => {
  const { remote, scope, read, official, officialExport, randomSeed } = await fixture(false, valueType)
  const description = await remote.getInputDescription(scope, signal())
  expect(description?.parameters.filter(parameter => parameter.kind === 'reference_image')).toEqual([
    { parameter_id: 'reference_image_113', kind: 'reference_image', value_type: valueType === 'STRING' ? 'string' : 'choice', current_value: '参考素材/初始 图.png',
      ...(valueType === 'choice' ? { allowed_values: ['参考素材/初始 图.png', '参考素材/第一轮/角色 正面.png', '参考素材/第二轮/角色 侧面.png'] } : {}) },
    { parameter_id: 'reference_image_114', kind: 'reference_image', value_type: valueType === 'STRING' ? 'string' : 'choice', current_value: '参考素材/初始 图.png',
      ...(valueType === 'choice' ? { allowed_values: ['参考素材/初始 图.png', '参考素材/第一轮/角色 正面.png', '参考素材/第二轮/角色 侧面.png'] } : {}) },
  ])
  await remote.mutate({ ...scope, type: 'update-draft', field: 'positive_prompt', value: 'Keep the reference composition' }, signal())
  await remote.mutate({ ...scope, type: 'update-draft', field: 'negative_prompt', value: 'Keep this negative prompt' }, signal())
  await remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'steps_42', value: 31 }, signal())
  const sibling = await remote.mutate({ ...scope, type: 'create-branch', value: { name: 'Other reference', original_request: 'Keep its reference' } }, signal())
  const before = await read()
  const siblingBefore = before.projection.branches.find(branch => branch.branch_id === sibling.branchId)!
  await remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'reference_image_113', value: '参考素材/第一轮/角色 正面.png' }, signal())
  const first = await read()
  expect(first.draft).toEqual({ ...before.draft, generation_input: { ...before.draft.generation_input, parameters: { ...before.draft.generation_input.parameters, reference_image_113: '参考素材/第一轮/角色 正面.png' } } })
  await remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'reference_image_113', value: '参考素材/第二轮/角色 侧面.png' }, signal())
  const replaced = await read()
  expect(replaced.draft).toEqual({ ...before.draft, generation_input: { ...before.draft.generation_input, parameters: { ...before.draft.generation_input.parameters, reference_image_113: '参考素材/第二轮/角色 侧面.png' } } })
  expect(replaced.draft.generation_input.parameters.reference_image_114).toBe('参考素材/初始 图.png')
  expect(replaced.draft.generation_input.parameters).not.toHaveProperty('reference_image')
  expect(replaced.projection.branches.find(branch => branch.branch_id === sibling.branchId)).toEqual(siblingBefore)
  expect(replaced.projection.tasks).toEqual([])
  expect(replaced.projection.runs).toEqual([])
  expect(official.controller.create).not.toHaveBeenCalled()
  expect(officialExport).not.toHaveBeenCalled()
  expect(randomSeed).not.toHaveBeenCalled()
})

it('rejects a reference-image path outside the LoadImage choices, retains the last valid draft and saves its correction', async () => {
  const { remote, scope, read, official, officialExport } = await fixture(false, 'choice')
  await remote.mutate({ ...scope, type: 'update-draft', field: 'positive_prompt', value: 'Keep this composition' }, signal())
  await remote.mutate({ ...scope, type: 'update-draft', field: 'negative_prompt', value: 'Keep this negative prompt' }, signal())
  await remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'steps_42', value: 31 }, signal())
  await remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'reference_image_113', value: '参考素材/第一轮/角色 正面.png' }, signal())
  const before = (await read()).draft
  await expect(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'reference_image_113', value: '参考素材/未登记/角色 背面.png' }, signal())).rejects.toMatchObject({
    code: 'workbench/operation-failed',
    details: { code: 'GENERATION_PARAMETER_INVALID', issues: [{ path: 'generation_input.parameters.reference_image_113', message: 'Generation parameter "reference_image_113" for 113:LoadImage.image received "参考素材/未登记/角色 背面.png"; allowed values ["参考素材/初始 图.png","参考素材/第一轮/角色 正面.png","参考素材/第二轮/角色 侧面.png"].' }] },
  })
  expect((await read()).draft).toEqual(before)
  await remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'reference_image_113', value: '参考素材/第二轮/角色 侧面.png' }, signal())
  const corrected = await read()
  expect(corrected.draft).toEqual({ ...before, generation_input: { ...before.generation_input, parameters: { ...before.generation_input.parameters, reference_image_113: '参考素材/第二轮/角色 侧面.png' } } })
  expect(corrected.projection.tasks).toEqual([])
  expect(corrected.projection.runs).toEqual([])
  expect(official.controller.create).not.toHaveBeenCalled()
  expect(officialExport).not.toHaveBeenCalled()
})

it('rechecks the complete combination when different inspected IDs claim the same Workflow widget', async () => {
  const host = await fixture()
  const { remote, scope, source, read, fetchDefinitions, store } = host
  const workflow: UiWorkflow = { version: 0.4, nodes: [
    { id: 41, type: 'SharedValue', title: 'cfg steps', mode: 0, inputs: [{ name: 'value', type: 'FLOAT', link: null, widget: { name: 'value' } }], outputs: [{ name: 'value', type: 'FLOAT', links: [1] }], widgets_values: [20] },
    { id: 42, type: 'AliasGenerator', mode: 0, inputs: [{ name: 'steps', type: 'FLOAT', link: 1 }], outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [2] }], widgets_values: [] },
    { id: 52, type: 'SaveImage', mode: 0, inputs: [{ name: 'images', type: 'IMAGE', link: 2 }], outputs: [], widgets_values: [] },
  ], links: [[1, 41, 0, 42, 0, 'FLOAT'], [2, 42, 0, 52, 0, 'IMAGE']] }
  const definitions = {
    SharedValue: { input: { required: { value: ['FLOAT', { min: 0, max: 50 }] } }, input_order: { required: ['value'], optional: [] }, output: ['FLOAT'], output_node: false },
    AliasGenerator: { input: { required: { steps: ['FLOAT'] } }, input_order: { required: ['steps'], optional: [] }, output: ['IMAGE'], output_node: false },
    SaveImage: { input: { required: { images: ['IMAGE'] } }, input_order: { required: ['images'], optional: [] }, output_node: true },
  }
  fetchDefinitions.mockResolvedValue(new Response(JSON.stringify(definitions)))
  source.readTemplate.mockResolvedValue({ id: '7', title: 'Shared target', workflow })
  await remote.mutate({ ...scope, type: 'update-draft', field: 'instance_id', value: '9' }, signal())
  await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'comfyui-template', id: '7' } }, signal())
  const description = await remote.getInputDescription(scope, signal())
  expect(description?.parameters.map(parameter => parameter.parameter_id)).toEqual(['cfg', 'steps'])
  const before = (await read()).draft, partial = structuredClone(before)
  partial.generation_input.parameters = {}
  store.saveBranchDraft({ ...scope, expected: before, draft: partial })
  const firstGate = preflightGate(), secondGate = preflightGate()
  pauseTemplateReads(source, new Map([[3, firstGate], [6, secondGate]]))
  const first = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'cfg', value: 30 }, signal()))
  await firstGate.started
  const second = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'steps', value: 31 }, signal()))
  await secondGate.started
  try {
    firstGate.release(); expect((await first).status).toBe('fulfilled')
    secondGate.release()
    expect(await second).toMatchObject({ status: 'rejected', reason: { code: 'workbench/operation-failed', details: { code: 'GENERATION_PARAMETER_TARGET_AMBIGUOUS', issues: [{ path: 'generation_input.parameters.steps' }] } } })
    const saved = await read()
    expect(saved.draft.generation_input.parameters).toEqual({ cfg: 30 })
    expect(saved.projection.tasks).toEqual([]); expect(saved.projection.runs).toEqual([])
  } finally { firstGate.release(); secondGate.release(); await Promise.all([first, second]) }
})

it.each(['positive_prompt', 'negative_prompt'] as const)('preserves a %s edit saved during parameter validation', async field => {
  const { remote, scope, read, source } = await fixture()
  const paused = preflightGate()
  pauseTemplateReads(source, new Map([[3, paused]]))
  const saving = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'steps_42', value: 31 }, signal()))
  await paused.started
  try {
    await remote.mutate({ ...scope, type: 'update-draft', field, value: 'Keep this concurrent prompt' }, signal())
    paused.release()
    expect((await saving).status).toBe('fulfilled')
    const saved = await read()
    expect(saved.draft.prompt_input[field]).toBe('Keep this concurrent prompt')
    expect(saved.draft.generation_input.parameters.steps_42).toBe(31)
  } finally { paused.release(); await saving }
})

it('revalidates three independent overlapping parameters until their complete combination can be saved', async () => {
  const { remote, scope, read, source } = await fixture()
  const firstGate = preflightGate(), secondGate = preflightGate(), thirdGate = preflightGate(), secondValidation = preflightGate()
  pauseTemplateReads(source, new Map([[3, firstGate], [6, secondGate], [9, thirdGate], [11, secondValidation]]))
  const first = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'steps_42', value: 31 }, signal()))
  await firstGate.started
  const second = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'cfg_42', value: 8.5 }, signal()))
  await secondGate.started
  const third = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'sampler_name_42', value: 'ddim' }, signal()))
  await thirdGate.started
  try {
    firstGate.release(); expect((await first).status).toBe('fulfilled')
    secondGate.release(); await secondValidation.started
    thirdGate.release(); expect((await third).status).toBe('fulfilled')
    secondValidation.release(); expect((await second).status).toBe('fulfilled')
    const saved = await read()
    expect(saved.draft.generation_input.parameters).toMatchObject({ steps_42: 31, cfg_42: 8.5, sampler_name_42: 'ddim' })
    expect(saved.projection.tasks).toEqual([]); expect(saved.projection.runs).toEqual([])
  } finally { for (const gate of [firstGate, secondGate, thirdGate, secondValidation]) gate.release(); await Promise.all([first, second, third]) }
})

it('rejects a second overlapping edit of the same parameter without replacing the saved value', async () => {
  const { remote, scope, read, source } = await fixture()
  const firstGate = preflightGate(), secondGate = preflightGate()
  pauseTemplateReads(source, new Map([[3, firstGate], [6, secondGate]]))
  const first = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'steps_42', value: 31 }, signal()))
  await firstGate.started
  const second = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'steps_42', value: 32 }, signal()))
  await secondGate.started
  try {
    firstGate.release(); expect((await first).status).toBe('fulfilled')
    secondGate.release()
    expect(await second).toMatchObject({ status: 'rejected', reason: { code: 'workbench/operation-failed', details: { code: 'WORKBENCH_EDIT_CONFLICT' } } })
    expect((await read()).draft.generation_input.parameters.steps_42).toBe(31)
  } finally { firstGate.release(); secondGate.release(); await Promise.all([first, second]) }
})

it.each(['group-first', 'single-first'])('rejects overlapping size group and member updates in %s order', async order => {
  const { remote, scope, read, source } = await fixture(true)
  const groupGate = preflightGate(), singleGate = preflightGate()
  pauseTemplateReads(source, new Map([[3, groupGate], [6, singleGate]]))
  const group = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'size', value: { candidate_id: 'width_height:width_42:height_42', parameters: { width_42: 1024, height_42: 1536 } } }, signal()))
  await groupGate.started
  const single = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'height_42', value: 1152 }, signal()))
  await singleGate.started
  try {
    if (order === 'group-first') { groupGate.release(); expect((await group).status).toBe('fulfilled'); singleGate.release() }
    else { singleGate.release(); expect((await single).status).toBe('fulfilled'); groupGate.release() }
    expect(order === 'group-first' ? await single : await group).toMatchObject({ status: 'rejected', reason: { details: { code: 'WORKBENCH_EDIT_CONFLICT' } } })
    expect((await read()).draft.generation_input.parameters).toMatchObject(order === 'group-first' ? { width_42: 1024, height_42: 1536 } : { width_42: 512, height_42: 1152 })
  } finally { groupGate.release(); singleGate.release(); await Promise.all([group, single]) }
})

it.each(['instance', 'template', 'model', 'lora'])('rejects parameter updates validated before the generation %s changes', async resource => {
  const { remote, scope, read, source } = await fixture()
  const paused = preflightGate()
  pauseTemplateReads(source, new Map([[3, paused]]))
  const saving = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'steps_42', value: 31 }, signal()))
  await paused.started
  try {
    if (resource === 'instance') await remote.mutate({ ...scope, type: 'update-draft', field: 'instance_id', value: '9' }, signal())
    else await remote.mutate({ ...scope, type: 'resource-select', value: { kind: resource === 'template' ? 'comfyui-template' : resource, id: resource === 'template' ? '7' : resource === 'model' ? '2' : '3' } }, signal())
    const changed = (await read()).draft
    paused.release()
    expect(await saving).toMatchObject({ status: 'rejected', reason: { details: { code: 'WORKBENCH_EDIT_CONFLICT' } } })
    expect((await read()).draft).toEqual(changed)
  } finally { paused.release(); await saving }
})

it('cancels a request waiting in parameter preflight and keeps its draft unchanged', async () => {
  const { remote, scope, read, source } = await fixture()
  const before = (await read()).draft, paused = preflightGate(), controller = new AbortController()
  const reason = new DOMException('Parameter edit cancelled', 'AbortError')
  pauseTemplateReads(source, new Map([[3, paused]]))
  const saving = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'steps_42', value: 31 }, controller.signal))
  await paused.started
  try {
    controller.abort(reason)
    await vi.waitFor(() => expect(paused.signal?.aborted).toBe(true), { timeout: 100 })
    expect(await saving).toEqual({ status: 'rejected', reason })
    expect((await read()).draft).toEqual(before)
  } finally { paused.release(); await saving }
})

it('exits the parameter validation loop on cancellation after another parameter has been saved', async () => {
  const { remote, scope, read, source } = await fixture()
  const firstGate = preflightGate(), secondGate = preflightGate(), revalidation = preflightGate(), controller = new AbortController()
  pauseTemplateReads(source, new Map([[3, firstGate], [6, secondGate], [8, revalidation]]))
  const first = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'steps_42', value: 31 }, signal()))
  await firstGate.started
  const second = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'cfg_42', value: 8.5 }, controller.signal))
  await secondGate.started
  try {
    firstGate.release(); expect((await first).status).toBe('fulfilled')
    secondGate.release(); await revalidation.started
    controller.abort()
    await vi.waitFor(() => expect(revalidation.signal?.aborted).toBe(true), { timeout: 100 })
    expect(await second).toMatchObject({ status: 'rejected', reason: { name: 'AbortError' } })
    expect((await read()).draft.generation_input.parameters).toMatchObject({ steps_42: 31, cfg_42: 7.5 })
  } finally { firstGate.release(); secondGate.release(); revalidation.release(); await Promise.all([first, second]) }
})

it('cancels parameter preflight when the Workbench plugin stops and keeps the draft unchanged', async () => {
  const host = await fixture()
  const { remote, scope, read, source } = host
  const before = (await read()).draft, paused = preflightGate()
  pauseTemplateReads(source, new Map([[3, paused]]))
  const saving = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'steps_42', value: 31 }, signal()))
  await paused.started
  try {
    await host.fiber.dispose()
    await vi.waitFor(() => expect(paused.signal?.aborted).toBe(true), { timeout: 100 })
    expect(await saving).toMatchObject({ status: 'rejected', reason: { name: 'AbortError' } })
    expect(host.store.getBranch(scope.branchId).draft).toEqual(before)
  } finally { paused.release(); await saving }
})

function preflightGate() {
  let release!: () => void, enter!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { enter = resolve })
  return { release, enter, waiting, started, signal: undefined as AbortSignal | undefined }
}
function pauseTemplateReads(source: Awaited<ReturnType<typeof fixture>>['source'], pauses: ReadonlyMap<number, ReturnType<typeof preflightGate>>) {
  const read = source.readTemplate.getMockImplementation()!
  let count = 0
  source.readTemplate.mockImplementation(async (id, signal) => {
    const gate = pauses.get(++count)
    if (gate) {
      gate.signal = signal
      gate.enter()
      await new Promise<void>((resolve, reject) => {
        const abort = () => { cleanup(); reject(signal?.reason) }
        const cleanup = () => signal?.removeEventListener('abort', abort)
        if (signal?.aborted) return abort()
        signal?.addEventListener('abort', abort, { once: true })
        void gate.waiting.then(() => { cleanup(); resolve() })
      })
    }
    return read(id, signal)
  })
}
function settled(operation: Promise<unknown>): Promise<PromiseSettledResult<unknown>> {
  return operation.then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }))
}

it.each(['first-request-first', 'second-request-first'])('preserves two different parameters with overlapping validation in %s order', async order => {
  const { remote, scope, read, source } = await fixture()
  const firstGate = preflightGate(), secondGate = preflightGate()
  pauseTemplateReads(source, new Map([[3, firstGate], [6, secondGate]]))
  const first = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'steps_42', value: 31 }, signal()))
  await firstGate.started
  const second = settled(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'cfg_42', value: 8.5 }, signal()))
  await secondGate.started
  try {
    if (order === 'first-request-first') { firstGate.release(); expect((await first).status).toBe('fulfilled'); secondGate.release() }
    else { secondGate.release(); expect((await second).status).toBe('fulfilled'); firstGate.release() }
    expect((await first).status).toBe('fulfilled')
    expect((await second).status).toBe('fulfilled')
    const saved = await read()
    expect(saved.draft.generation_input.parameters).toMatchObject({ steps_42: 31, cfg_42: 8.5 })
    expect(saved.projection.tasks).toEqual([])
    expect(saved.projection.runs).toEqual([])
  } finally { firstGate.release(); secondGate.release(); await Promise.all([first, second]) }
})

it('rejects an in-flight parameter save after a template replacement and preserves the replacement defaults', async () => {
  const { remote, scope, read, source } = await fixture()
  const readTemplate = source.readTemplate.getMockImplementation()!
  let entered!: () => void, release!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const waiting = new Promise<void>(resolve => { release = resolve })
  source.readTemplate.mockImplementationOnce(async id => { entered(); await waiting; return readTemplate(id) })
  const saving = expect(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'steps_42', value: 31 }, signal())).rejects.toMatchObject({
    code: 'workbench/operation-failed', details: { code: 'WORKBENCH_EDIT_CONFLICT', issues: [{ path: 'expected' }] },
  })
  await started
  try {
    await remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'comfyui-template', id: '7' } }, signal())
    const replacement = (await read()).draft
    expect(replacement.generation_input.template_id).toBe('7')
    expect(replacement.generation_input.parameters).toMatchObject({ steps_41: 20, steps_42: 20 })
    release()
    await saving
    expect((await read()).draft).toEqual(replacement)
  } finally { release() }
})

it('preserves the JSON types of numeric, choice, boolean and text parameter values', async () => {
  const { remote, scope, read } = await fixture()
  for (const [id, value] of [['steps_41', 50], ['cfg_42', 12.25], ['sampler_name_42', 'ddim'], ['scheduler_42', false], ['denoise_42', '']] as const) {
    await remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id, value }, signal())
  }
  expect((await read()).draft.generation_input.parameters).toMatchObject({
    steps_41: 50, steps_42: 20, cfg_42: 12.25, sampler_name_42: 'ddim', scheduler_42: false, denoise_42: '',
  })
})

it.each([
  ['steps_42', 1.5, 31], ['steps_42', 0, 1], ['steps_42', 51, 50], ['steps_42', '31', 31],
  ['cfg_42', -0.1, 0], ['cfg_42', 20.1, 20], ['cfg_42', '2.5', 2.5],
  ['sampler_name_42', 'missing', 'ddim'], ['sampler_name_42', 4, 'euler'],
  ['scheduler_42', 'false', false], ['scheduler_42', 0, false], ['denoise_42', 10, ''],
] as const)('reports the full parameter path for %s=%j, preserves the draft and saves its correction', async (id, value, correction) => {
  const { remote, scope, read, officialExport } = await fixture()
  await remote.mutate({ ...scope, type: 'update-draft', field: 'positive_prompt', value: 'Keep the glass structure' }, signal())
  const before = (await read()).draft
  await expect(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id, value }, signal())).rejects.toMatchObject({
    code: 'workbench/operation-failed', details: { code: 'GENERATION_PARAMETER_INVALID', issues: [{ path: `generation_input.parameters.${id}`, message: expect.any(String) }] },
  })
  expect((await read()).draft).toEqual(before)
  await remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id, value: correction }, signal())
  const saved = await read()
  expect(saved.draft.generation_input.parameters[id]).toBe(correction)
  expect(saved.draft.prompt_input.positive_prompt).toBe('Keep the glass structure')
  expect(saved.projection.tasks).toEqual([])
  expect(saved.projection.runs).toEqual([])
  expect(officialExport).not.toHaveBeenCalled()
})

it.each(['steps', 'steps_404', 'custom.field'])('rejects an unknown or shortened parameter ID %s before changing the draft', async id => {
  const { remote, scope, read } = await fixture()
  const before = (await read()).draft
  await expect(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id, value: 31 }, signal())).rejects.toMatchObject({
    code: 'workbench/operation-failed', details: { code: 'WORKBENCH_PARAMETER_NOT_ALLOWED', issues: [{ path: `generation_input.parameters.${id}` }] },
  })
  expect((await read()).draft).toEqual(before)
})

it('validates a complete size candidate with the real compiler and saves both fields atomically', async () => {
  const { remote, scope, read, officialExport } = await fixture(true)
  const candidateId = 'width_height:width_42:height_42'
  const description = await remote.getInputDescription(scope, signal())
  expect(description?.size_candidates).toEqual(expect.arrayContaining([expect.objectContaining({ candidate_id: candidateId })]))
  await remote.mutate({ ...scope, type: 'update-draft', field: 'size', value: { candidate_id: candidateId, parameters: { width_42: 1024, height_42: 1536 } } }, signal())
  const before = (await read()).draft
  expect(before.generation_input.parameters).toMatchObject({ width_42: 1024, height_42: 1536 })
  for (const [value, path, code] of [
    [{ candidate_id: 'missing', parameters: { width_42: 1024, height_42: 1024 } }, 'value.candidate_id', 'WORKBENCH_INVALID_INPUT'],
    [{ candidate_id: candidateId, parameters: { width_42: 1024 } }, 'value.parameters', 'WORKBENCH_INVALID_INPUT'],
    [{ candidate_id: candidateId, parameters: { width_42: 1024, height_42: 1024, steps: 30 } }, 'value.parameters', 'WORKBENCH_INVALID_INPUT'],
    [{ candidate_id: candidateId, parameters: { width_42: 32, height_42: 1024 } }, 'generation_input.parameters.width_42', 'GENERATION_PARAMETER_INVALID'],
    [{ candidate_id: candidateId, parameters: { width_42: 1024, height_42: '1024' } }, 'generation_input.parameters.height_42', 'GENERATION_PARAMETER_INVALID'],
  ] as const) {
    await expect(remote.mutate({ ...scope, type: 'update-draft', field: 'size', value }, signal())).rejects.toMatchObject({
      code: 'workbench/operation-failed', details: { code, issues: [{ path }] },
    })
    expect((await read()).draft).toEqual(before)
  }
  await remote.mutate({ ...scope, type: 'update-draft', field: 'size', value: { candidate_id: candidateId, parameters: { width_42: 2048, height_42: 64 } } }, signal())
  const saved = await read()
  expect(saved.draft.generation_input.parameters).toMatchObject({ width_42: 2048, height_42: 64 })
  expect(saved.projection.tasks).toEqual([])
  expect(saved.projection.runs).toEqual([])
  expect(officialExport).not.toHaveBeenCalled()
})

it('saves a single size descriptor by its complete ID, retains the other dimension and rejects an invalid correction', async () => {
  const { remote, scope, read } = await fixture(true)
  await remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'width_42', value: 1024 }, signal())
  expect((await read()).draft.generation_input.parameters).toMatchObject({ width_41: 512, height_41: 768, width_42: 1024, height_42: 768 })
  await remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'height_42', value: 1536 }, signal())
  const before = (await read()).draft
  expect(before.generation_input.parameters).toMatchObject({ width_41: 512, height_41: 768, width_42: 1024, height_42: 1536 })
  await expect(remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'width_42', value: 32 }, signal())).rejects.toMatchObject({
    code: 'workbench/operation-failed', details: { code: 'GENERATION_PARAMETER_INVALID', issues: [{ path: 'generation_input.parameters.width_42' }] },
  })
  const saved = await read()
  expect(saved.draft).toEqual(before)
  expect(saved.projection.tasks).toEqual([])
  expect(saved.projection.runs).toEqual([])
})

it('saves one inspected parameter by its complete node-suffixed ID and reads it back without creating a Task or Run', async () => {
  const { remote, scope, read, official, officialExport, randomSeed } = await fixture()
  const description = await remote.getInputDescription(scope, signal())
  expect(description?.parameters).toEqual(expect.arrayContaining([
    { parameter_id: 'steps_41', kind: 'steps', value_type: 'integer', current_value: 20, minimum: 1, maximum: 50 },
    { parameter_id: 'steps_42', kind: 'steps', value_type: 'integer', current_value: 20, minimum: 1, maximum: 50 },
  ]))
  await remote.mutate({ ...scope, type: 'update-draft', field: 'positive_prompt', value: 'Keep this manual prompt' }, signal())
  await remote.mutate({ ...scope, type: 'update-draft', field: 'parameter', id: 'steps_42', value: 31 }, signal())
  const { projection, draft } = await read()
  expect(draft.generation_input.parameters).toMatchObject({ steps_41: 20, steps_42: 31 })
  expect(draft.generation_input.parameters).not.toHaveProperty('steps')
  expect(draft.prompt_input.positive_prompt).toBe('Keep this manual prompt')
  expect(projection.tasks).toEqual([])
  expect(projection.runs).toEqual([])
  expect(official.controller.create).not.toHaveBeenCalled()
  expect(officialExport).not.toHaveBeenCalled()
  expect(randomSeed).not.toHaveBeenCalled()
})
