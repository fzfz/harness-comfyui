import React from 'react'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogItem, CatalogKind } from '../../src/catalog/contract.ts'
import type { CatalogApi } from '../../src/client/workbench/catalog-browser.tsx'
import type { ArtifactPayload } from '../../src/workbench/contract.ts'
import type { ExperimentWorkbenchProps } from '../../src/client/workbench/experiment-contract.ts'
import { ExperimentWorkbench } from '../../src/client/workbench/experiment-workbench.tsx'
import { WORKBENCH_FUNCTIONS } from '../../src/workbench/functions.ts'
import {
  fullProjection,
  createConnectionState,
  functionEnvironment,
  treeProjection,
  inputDescription,
  runInputDescription,
  runInputDefaults,
  makeRun,
  makeTask,
} from './experiment-workbench-fixtures.ts'
import type {
  Branch,
  TaskDraft,
  TaskRequestDraft,
  WorkbenchProjection,
} from '../../src/workbench/contract.ts'

import type { WorkbenchEnvironment } from '../../src/workbench-remote.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { DEFAULT_PROMPT_REQUEST_PARTS } from '../../src/workbench/request-template.ts'
import type { PromptReply, PromptTurn } from '../../src/workbench/prompt-edit.ts'
import approvedInstructions from '../../docs/plans/experiment-workbench-iteration-20261109.instructions.json' with { type: 'json' }

interface RenderNode {
  readonly props: Record<string, any>
  readonly children: readonly (RenderNode | string)[]
  findByProps(props: Record<string, unknown>): RenderNode
  findAllByType(type: string): RenderNode[]
  findAllByProps(props: Record<string, unknown>): RenderNode[]
}
const { act, create } = (await vi.importActual('react-test-renderer')) as {
  act: (callback: () => void | Promise<void>) => Promise<void>
  create: (node: React.ReactElement, options?: { createNodeMock: (element: { props: Record<string, unknown> }) => unknown }) => {
    readonly root: RenderNode
    unmount(): void
    update(node: React.ReactElement): void
    toJSON(): unknown
  }
}
const empty: WorkbenchProjection = {
  workspace_id: 'workspace-a',
  reference_destinations: [],
  total_branch_count: 0,
  work_id: null,
  works: [],
  branches: [],
  tasks: [],
  artifacts: [],
  runs: [],
  experiments: [],
  experiences: [],
  favorites: [],
  functions: [],
}
const draft: TaskDraft = {
  prompt_resource_refs: [],
  parameter_mapping: null,
  prompt_input: { positive_prompt: '', negative_prompt: '' },
  generation_input: {
    title: '',
    instance_id: null,
    template_id: null,
    model: null,
    parameters: {},
    loras: [],
  },
  reference_task_ids: [], reference_run_ids: [], reference_experiences: [], image_refs: [], workflow_image_bindings: [], instructions: '',
  base_model_id: null,
}
const branch = (id: string, parent: string | null): Branch => ({
  branch_id: id,
  work_id: 'work-a',
  parent_branch_id: parent,
  name: id === 'root' ? '主分支' : '暖光探索',
  original_request: '玻璃花房',
  source_run_id: null,
  source_artifact_id: null,
  source_experience_id: null,
  draft,
  editing_draft: null,
  execution: { mode: 'once', max_runs: 1 },
})
const deliverySources = new Set<() => Promise<void>>()
const deliverChanges = async () => { await act(async () => { for (const deliver of deliverySources) await deliver() }) }
const mounts: { unmount(): void }[] = []
afterEach(async () => {
  await act(() => {
    for (const mount of mounts.splice(0)) mount.unmount()
  })
  deliverySources.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const mount = async (
  data: WorkbenchProjection,
  options: Partial<Omit<ExperimentWorkbenchProps, 'remote'>> & { remote?: Partial<ExperimentWorkbenchProps['remote']>; startEditing?: boolean } = {},
  renderOptions?: Parameters<typeof create>[1],
) => {
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }))
  vi.stubGlobal(
    'FormData',
    class {
      constructor(private readonly values: Record<string, string>) {}
      get(key: string) {
        return this.values[key] ?? null
      }
    },
  )
  const taskDrafts = new Map<string, TaskRequestDraft>()
  const deliveryListeners = new Set<(update: import('../../src/workbench-remote.ts').WorkbenchUpdate) => void>()
  let deliverySequence = 0
  const publish = (projection = data, promptTurns: PromptTurn[] = []) => {
    const update: import('../../src/workbench-remote.ts').WorkbenchUpdate = { kind: 'change', sequence: ++deliverySequence, projection, promptTurns, translations: [] }
    for (const listener of deliveryListeners) listener(update)
  }
  const onAction = vi.fn(),
    remote = {
      publish,
      subscribe: async function* (_request: import('../../src/workbench-remote.ts').WorkbenchSubscription, signal: AbortSignal) {
        const queue: import('../../src/workbench-remote.ts').WorkbenchUpdate[] = []
        let wake: (() => void) | undefined
        const listener = (update: import('../../src/workbench-remote.ts').WorkbenchUpdate) => { queue.push(update); wake?.() }
        deliveryListeners.add(listener)
        signal.addEventListener('abort', () => wake?.(), { once: true })
        try {
          yield { kind: 'snapshot' as const, sequence: deliverySequence, projection: data, promptTurns: [], translations: [] }
          while (!signal.aborted) {
            if (!queue.length) await new Promise<void>(resolve => { wake = resolve })
            while (!signal.aborted && queue.length) yield queue.shift()!
          }
        } finally { deliveryListeners.delete(listener) }
      },
      getRunInput: vi.fn(async (request: { runId: string }) => {
        const run = data.runs.find(run => run.run_id === request.runId)!
        const task = data.tasks.find(task => task.task_id === run.workbench_task_id)!
        return { run_id: run.run_id, branch_id: task.branch_id, submitted_input: run.generation_input, effective_input: run.generation_input, image_uploads: [], parameter_mapping: task.input.parameter_mapping, base_model_id: task.input.base_model_id, generation_input: structuredClone(run.generation_input),
          image_refs: structuredClone(task.input.image_refs), workflow_image_bindings: structuredClone(task.input.workflow_image_bindings), input_description: runInputDescription(run.generation_input.parameters),
          prompt_input: { positive_prompt: String(run.generation_input.parameters.positive_1 ?? ''), negative_prompt: String(run.generation_input.parameters.negative_1 ?? '') } }
      }),
      getProjection: vi.fn(async (scope: { workId?: string }) => ({
        ...data,
        work_id: scope.workId ?? data.work_id,
      })),
      getTaskDraft: vi.fn(async (request: { branchId: string; functionId: string }) => taskDrafts.get(`${request.branchId}:${request.functionId}`) ?? null),
      saveTaskDraft: vi.fn(async (request: { branchId: string; functionId: string; draft: TaskRequestDraft }) => {
        taskDrafts.set(`${request.branchId}:${request.functionId}`, structuredClone(request.draft))
        return request.draft
      }),
      getEnvironment: async () => functionEnvironment,
      promptPreview: vi.fn(async (request: import('../../src/workbench/prompt-edit.ts').PromptStartRequest) => ({ ...request.input, base_model_name: 'SDXL', reference_context: {} })),
      promptStart: vi.fn(async (_request: import('../../src/workbench/prompt-edit.ts').PromptStartRequest): Promise<import('../../src/workbench/prompt-edit.ts').PromptTurn> => { throw new Error('prompt fixture not configured') }),
      promptGet: vi.fn(async (_request: import('../../src/workbench/prompt-edit.ts').PromptLookupRequest): Promise<import('../../src/workbench/prompt-edit.ts').PromptTurn> => { throw new Error('prompt fixture not configured') }),
      promptList: vi.fn(async () => []),
      promptCancel: vi.fn(async (_request: import('../../src/workbench/prompt-edit.ts').PromptLookupRequest): Promise<import('../../src/workbench/prompt-edit.ts').PromptTurn> => { throw new Error('prompt fixture not configured') }),
      promptSaveCandidate: vi.fn(async (_request: import('../../src/workbench/prompt-edit.ts').PromptAdoptRequest): Promise<PromptTurn> => { throw new Error('prompt fixture not configured') }),
      promptAdopt: vi.fn(async (_request: import('../../src/workbench/prompt-edit.ts').PromptAdoptRequest): Promise<import('../../src/workbench/prompt-edit.ts').PromptTurn> => { throw new Error('prompt fixture not configured') }),
      queryRecords: vi.fn(async () => []),
      resolveImages: vi.fn(async () => ({ images: [] })),
      importImages: vi.fn(async () => ({ images: [] })),
      translateStart: vi.fn(async (request: { request_id: string }) => ({ request_id: request.request_id, status: 'running' as const })),
      translateGet: vi.fn(async (request: { request_id: string }) => ({ request_id: request.request_id, status: 'succeeded' as const, text: '译文' })),
      translateCancel: vi.fn(async () => undefined),
      getInputDescription: vi.fn(async (_request: import('../../src/workbench-remote.ts').WorkbenchInputDescriptionRequest) => inputDescription),
    }
  const deliver = async () => {
    try { publish(await (options.remote?.getProjection ?? remote.getProjection)({ workspaceId: options.workspaceId ?? data.workspace_id, ...(data.work_id ? { workId: data.work_id } : {}) })) } catch {}
  }
  deliverySources.add(deliver)
  let renderer!: ReturnType<typeof create>
  await act(async () => {
    renderer = create(
      <ExperimentWorkbench
        connectionState={createConnectionState().source}
        workspaces={[
          { id: 'workspace-a', name: '画面实验', path: '/projects/art' },
        ]}
        workspaceId="workspace-a"
        onWorkspaceChange={vi.fn()}
        presets={[{ id: 'preset', name: '工作台预设' }]}
        instances={[{ id: '2', name: 'win3080' }]}
        baseModels={[{ id: '1', label: 'SDXL' }]}
        routableProviders={['provider']}
        agentModelGroups={[
          {
            id: 'provider',
            name: '提供商',
            models: [
              {
                id: 'model',
                name: '模型',
                reasoning: { efforts: [{ id: 'high', name: '高' }] },
              },
            ],
          },
        ]}
        {...options}
        onAction={async request => {
          const result = await (options.onAction ?? onAction)(request)
          if (result !== undefined) { publish(await (options.remote?.getProjection ?? remote.getProjection)({ workspaceId: request.workspaceId, ...(result?.workId ? { workId: result.workId } : {}) })); return result }
          const target = data.branches.find(item => item.branch_id === request.branchId)
          if (target && request.type === 'edit-draft') {
            target.editing_draft = structuredClone((request.value as unknown as { draft: TaskDraft | null }).draft)
            return { workspaceId: request.workspaceId, workId: request.workId, branchId: request.branchId, editingDraft: target.editing_draft }
          }
          if (target && request.type === 'save-draft') {
            const input = request.value as unknown as { draft: TaskDraft; name?: string; originalRequest?: string }
            target.draft = structuredClone(input.draft)
            target.editing_draft = null
            if (input.name !== undefined) target.name = input.name
            if (input.originalRequest !== undefined) target.original_request = input.originalRequest
          }
          publish()
          return result
        }}
        remote={{ ...remote, ...options.remote }}
      />,
      renderOptions,
    )
  })
  mounts.push(renderer)
  if (options.startEditing !== false) {
    const edit = renderer.root.findAllByType('button').find(item => item.children.join('') === '编辑参数')
    if (edit) await act(async () => edit.props.onClick())
  }
  return { renderer, onAction, remote }
}

const mountReady: typeof mount = (data, options, renderOptions) => mount(data, { ...options, startEditing: false }, renderOptions)

function readField(root: RenderNode, label: string): unknown {
  const field = root.findAllByProps({ 'aria-label': label }).find(item => 'value' in item.props)
  if (field) return field.props.value
  if (label === '分支名称') return nodeText(root.findByProps({ className: 'config-head' }).findAllByType('h2')[0]!)
  const prompt = root.findAllByProps({ 'aria-label': label }).find(item => String(item.props.className).includes('input-readout'))
  if (prompt) return nodeText(prompt.children[1] as RenderNode)
  const facts = root.findAllByType('dt').find(item => nodeText(item) === label)
  if (facts) return nodeText((facts as RenderNode & { parent: RenderNode }).parent.findAllByType('dd')[0]!)
  throw new Error('Missing displayed field: ' + label)
}

async function saveHostInput(host: Awaited<ReturnType<typeof import('../support/workbench-host.ts').createWorkbenchHostFixture>>, scope: { workspaceId: string; workId?: string; branchId?: string }) {
  const projection = await host.remote.getProjection(scope, new AbortController().signal)
  const branch = projection.branches.find(item => item.branch_id === scope.branchId)
  if (branch?.editing_draft) await host.remote.mutate({ ...scope, type: 'save-draft', value: { expected: branch.draft, expectedEditingDraft: branch.editing_draft, draft: branch.editing_draft } }, new AbortController().signal)
}

function promptRemote(host: Awaited<ReturnType<typeof import('../support/workbench-host.ts').createWorkbenchHostFixture>>, signal: AbortSignal) {
  return {
    subscribe: (request: import('../../src/workbench-remote.ts').WorkbenchSubscription, streamSignal: AbortSignal) => host.remote.subscribe(request, streamSignal),
    promptSaveCandidate: (request: import('../../src/workbench/prompt-edit.ts').PromptAdoptRequest) => host.remote.promptSaveCandidate(request, signal),
    promptPreview: (request: import('../../src/workbench/prompt-edit.ts').PromptStartRequest) => host.remote.promptPreview(request, signal),
    promptStart: (request: import('../../src/workbench/prompt-edit.ts').PromptStartRequest) => host.remote.promptStart(request, signal),
    promptGet: (request: import('../../src/workbench/prompt-edit.ts').PromptLookupRequest) => host.remote.promptGet(request, signal),
    promptList: (request: import('../../src/workbench/prompt-edit.ts').PromptListRequest) => host.remote.promptList(request, signal),
    promptCancel: (request: import('../../src/workbench/prompt-edit.ts').PromptLookupRequest) => host.remote.promptCancel(request, signal),
    promptAdopt: (request: import('../../src/workbench/prompt-edit.ts').PromptAdoptRequest) => host.remote.promptAdopt(request, signal),
  }
}
function completePrompt(host: Awaited<ReturnType<typeof import('../support/workbench-host.ts').createWorkbenchHostFixture>>, turn: PromptTurn, result: PromptReply) {
  const events = host.official.events.get(turn.session_id) ?? [], seq = events.length, index = turn.turn_index
  events.push(...[
    { type: 'turn/start', seq, data: { turn: index } },
    { type: 'user/message', seq: seq + 1, data: { id: turn.request_id, role: 'user', source: { kind: 'user', rpcId: turn.request_id }, content: [{ type: 'text', text: turn.request_text }] } },
    { type: 'assistant/message', seq: seq + 2, data: { turn: index, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: JSON.stringify(result) }] } } },
    { type: 'turn/end', seq: seq + 3, data: { turn: index, reason: { kind: 'completed' } } },
  ] as unknown as SessionEvent[])
  host.official.events.set(turn.session_id, events)
  host.official.agents.get(turn.session_id)!.status = 'idle'
  host.ctx.emit('session/event', { id: turn.session_id } as import('@deepseek-ai/dsh-session').Session, events.at(-1)!)
}

it.each(['建议参数', '推荐资源'])('shows the current preparation references read-only inside the %s dialog and preserves it when inspecting a source', async label => {
  const data = fullProjection(), run = data.runs[0]!, task = data.tasks[0]!, experience = data.experiences[0]!
  data.branches[0]!.draft.reference_run_ids = [run.run_id]
  data.branches[0]!.draft.reference_task_ids = [task.task_id]
  data.branches[0]!.draft.reference_experiences = [{ experience_id: experience.experience_id, title: experience.title, conditions: experience.conditions, note: experience.note, provenance: experience.provenance }]
  const records = [{ type: 'run' as const, id: run.run_id, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'root', task_id: task.task_id, title: run.title, run }, { type: 'task' as const, id: task.task_id, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'root', task_id: task.task_id, title: task.title, task }]
  const { renderer, onAction } = await mount(data, { catalog: makeCatalog(), remote: { queryRecords: async request => records.filter(record => record.type === request.type) } })
  await click(renderer, label)
  await change(renderer, '任务要求', '查看来源后保留本次要求')
  const dialog = renderer.root.findByProps({ 'aria-labelledby': 'modal-title', role: 'dialog' })
  const references = dialog.findByProps({ 'aria-label': '参考来源' })
  expect(nodeText(references)).toContain('直接参考运行')
  expect(nodeText(references)).toContain(run.run_id)
  expect(nodeText(references)).toContain(experience.title)
  expect(nodeText(references)).toContain(task.title)
  expect(references.findAllByType('button').map(nodeText)).not.toEqual(expect.arrayContaining(['移除引用']))
  expect(references.findAllByType('button').map(nodeText)).not.toContain('引用运行')
  await act(async () => references.findAllByType('button').find(button => nodeText(button) === '查看来源')!.props.onClick())
  expect(renderer.root.findByProps({ 'aria-label': '参考内容', role: 'dialog' })).toBeDefined()
  await click(renderer, '关闭参考内容')
  expect(readField(renderer.root, '任务要求')).toBe('查看来源后保留本次要求')
  expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'agent-action' }))
})

it.each([true, false])('shows only the saved review in a source Run dialog: saved=%s', async saved => {
  const data = fullProjection(), run = data.runs[0]!
  data.branches[0]!.draft.reference_run_ids = [run.run_id]
  run.review = saved ? { verdict: 'met', observation: '已保存观察', conclusion: '已保存的评价结论', source_artifact_id: null } : null
  run.review_draft!.conclusion = '尚未保存的评价草稿'
  const { renderer } = await mountReady(data, { remote: { queryRecords: async request => request.type === 'run' ? [{ type: 'run', id: run.run_id, title: run.title, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'root', task_id: run.workbench_task_id, run }] : [] } })
  await click(renderer, '查看来源')
  const dialog = renderer.root.findByProps({ 'role': 'dialog', 'aria-label': '参考内容' })
  if (saved) expect(nodeText(dialog.findByProps({ 'aria-label': '评价' }))).toBe('评价已保存的评价结论')
  else expect(dialog.findAllByProps({ 'aria-label': '评价' })).toHaveLength(0)
  expect(nodeText(dialog)).not.toContain('尚未保存的评价草稿')
})

it('shares historical parameter labels, exclusions and size rendering between the inspector and the source dialog', async () => {
  const data = fullProjection(), run = data.runs[0]!
  data.branches[0]!.draft.reference_run_ids = [run.run_id]
  run.generation_input.parameters = { ...run.generation_input.parameters, extra_runtime_field: 0.75, workflow_image_99: 'staged/image.png' }
  const savedDescription = runInputDescription(run.generation_input.parameters)
  const description = { ...savedDescription, parameters: [...savedDescription.parameters.map(parameter => parameter.kind === 'seed' ? { ...parameter, current_value: 987654321 } : parameter), { parameter_id: 'extra_runtime_field', kind: 'denoise' as const, value_type: 'number' as const, current_value: 0.75 }, { parameter_id: 'workflow_image_99', kind: 'reference_image' as const, value_type: 'string' as const, current_value: 'staged/image.png', image_cardinality: 'one' as const }] }
  const { renderer } = await mountReady(data, { remote: {
    queryRecords: async request => request.type === 'run' ? [{ type: 'run', id: run.run_id, title: run.title, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'root', task_id: run.workbench_task_id, run }] : [],
    getRunInput: async () => ({ ...runInputDefaults(run.generation_input), run_id: run.run_id, branch_id: 'root', generation_input: run.generation_input, image_refs: [], workflow_image_bindings: [], input_description: description, prompt_input: { positive_prompt: 'glass house', negative_prompt: 'blur' } }),
  } })
  await click(renderer, '查看运行输入')
  const values = (panel: RenderNode) => panel.findAllByType('div').filter(node => node.findAllByType('dt').length === 1 && node.findAllByType('dd').length === 1).map(node => [nodeText(node.findAllByType('dt')[0]!), nodeText(node.findAllByType('dd')[0]!)])
  await vi.waitFor(() => expect(nodeText(renderer.root.findByProps({ className: 'input-facts numeric-facts' }))).toContain('987654321'))
  const expected = values(renderer.root.findByProps({ className: 'input-facts numeric-facts' }))
  expect(expected).toEqual(expect.arrayContaining([['采样步数', String(run.generation_input.parameters.steps_1)], ['引导强度', '5'], ['画面尺寸', '1024 × 768'], ['降噪强度', '0.75'], ['Seed', '987654321']]))
  await click(renderer, '准备运行')
  await click(renderer, '查看来源')
  await vi.waitFor(() => expect(renderer.root.findByProps({ role: 'dialog', 'aria-label': '参考内容' }).findAllByProps({ className: 'input-facts numeric-facts' })).toHaveLength(1))
  const actual = values(renderer.root.findByProps({ role: 'dialog', 'aria-label': '参考内容' }).findByProps({ className: 'input-facts numeric-facts' }))
  expect(actual).toEqual(expected)
  expect(actual.map(([name]) => name)).not.toEqual(expect.arrayContaining(['positive_1', 'negative_1', 'workflow_image_99', 'width_1', 'height_1']))
})

it('places translation first in the prototype settings order while retaining all other function rows', async () => {
  const data = fullProjection(), binding = data.functions.find(item => item.builtin)!
  data.functions = WORKBENCH_FUNCTIONS.map(descriptor => ({ ...binding, function_id: descriptor.kind, kind: descriptor.kind, name: descriptor.name, request_template: descriptor.default_request_template }))
  const original = structuredClone(data.functions)
  const { renderer } = await mountReady(data)
  await click(renderer, '配置中心')
  expect(renderer.root.findByProps({ className: 'settings-table' }).findAllByType('tr').slice(1).map(row => row.props['data-function'])).toEqual(['translate', 'run', 'prompt', 'parameters', 'resources', 'review', 'compare', 'diagnose', 'experience', 'experiment'])
  expect(data.functions).toEqual(original)
})

it('fixes the translation Skill to none despite a nonempty environment Skill catalog', async () => {
  const data = fullProjection(), descriptor = WORKBENCH_FUNCTIONS.find(item => item.kind === 'translate')!
  data.functions.push({ ...data.functions[0]!, function_id: 'translate', builtin: true, kind: 'translate', name: descriptor.name, preset_id: 'harness-comfyui-translation', requested_skill: 'comfyui-generate', request_template: descriptor.default_request_template })
  const environment = { ...functionEnvironment, presets: [...functionEnvironment.presets, { id: 'harness-comfyui-translation', name: '翻译预设' }] }
  const { renderer, onAction } = await mountReady(data, { remote: { getEnvironment: async () => environment } })
  await click(renderer, '配置中心')
  expect(nodeText(renderer.root.findByProps({ 'data-function': 'translate' }).findAllByType('td')[4]!)).toBe('无')
  await click(renderer, '编辑翻译提示词')
  const skill = renderer.root.findByProps({ 'aria-label': '指定 Skill' })
  expect(skill.props.disabled).toBe(true)
  expect(skill.props.value).toBe('')
  expect(skill.findAllByType('option').map(option => [option.props.value, nodeText(option)])).toEqual([['', '无']])
  await change(renderer, '指定 Skill', 'comfyui-generate')
  await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
  expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'function-edit', id: 'translate', value: expect.objectContaining({ requested_skill: null }) }))
})

it.each(['经验', '收藏'])('keeps the %s library experience choice on its own prototype row before its model label', async page => {
  const data = fullProjection(), experience = data.experiences[0]!
  const { renderer } = await mountReady(data)
  await click(renderer, page)
  const card = renderer.root.findByProps({ 'data-experience': experience.experience_id })
  const label = card.findAllByType('label')[0]!
  expect(label.props.className).toBe('row reference-choice')
  expect(nodeText(label)).toBe(`选择经验 ${experience.experience_id}`)
  expect(label.findAllByProps({ className: 'eyebrow' })).toHaveLength(0)
  expect(card.findAllByProps({ className: 'eyebrow' })).toHaveLength(1)
  await act(async () => label.findAllByType('input')[0]!.props.onChange({ target: { checked: true } }))
  expect(renderer.root.findAllByType('button').map(nodeText)).toContain('添加所选引用（1）')
})

it('distinguishes unresolved and explicitly empty prompts in the saved input summary', async () => {
  const data = fullProjection()
  data.branches[0]!.draft.prompt_input = { positive_prompt: null, negative_prompt: '' }
  const { renderer } = await mountReady(data)
  expect(readField(renderer.root, '正向提示词')).toBe('未解析')
  expect(readField(renderer.root, '负向提示词')).toBe('未填写')
})

it('shortens a long Run ID in the inspector tab and retains the full ID as its title', async () => {
  const data = fullProjection()
  const id = 'run_bcc3ae38-228a-41d7-b5a9-a8cad3e75cee'
  data.runs[0]!.run_id = id
  const { renderer } = await mountReady(data)
  const tab = renderer.root.findByProps({ 'aria-label': '查看运行输入' })
  expect(nodeText(tab)).toBe('查看运行 · run_bcc3ae38…')
  expect(tab.props.title).toBe(id)
})

it('does not show an Agent running tag for succeeded tasks whose execution state is still running', async () => {
  const data = fullProjection()
  data.tasks = data.tasks.map(task => ({ ...task, status: 'succeeded', execution_state: 'running' }))
  const { renderer } = await mountReady(data)
  expect(nodeText(renderer.root.findByProps({ className: 'branch-list' }))).not.toContain('Agent 执行中')
})

it.each([false, true])('saves the current template and Agent prompt before creating a parameter task; save conflict=%s', async conflict => {
  const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
  const host = await createWorkbenchHostFixture()
  const signal = new AbortController().signal
  try {
    const root = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '当前准备输入', goal: '保留窗框' } }, signal)
    for (const id of ['prompt', 'parameters']) await host.remote.mutate({ ...root, type: 'function-preset', id, value: 'preset-a' }, signal)
    await host.remote.mutate({ ...root, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
    await setHostField(host, { ...root, field: 'instance_id', value: '8' }, signal)
    const accepted = await host.remote.mutate({ ...root, type: 'agent-action', id: 'prompt' }, signal)
    const source = (await host.remote.getProjection(root, signal)).tasks.find(task => task.task_id === accepted.taskId)!
    const promptTurn = (await host.remote.promptList({ workspace_id: root.workspaceId, task_id: source.task_id }, signal))[0]!
    completePrompt(host, promptTurn, { type: 'prompt', positive_prompt: 'Agent 当前正向词', negative_prompt: 'Agent 当前负向词' })
    await vi.waitFor(() => expect(host.store.getBranch(root.branchId!).draft.prompt_input.positive_prompt).toBe('Agent 当前正向词'))
    await host.remote.mutate({ ...root, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal)
    const environment = await host.remote.getEnvironment({ workspaceId: root.workspaceId }, signal)
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
      if (conflict && request.type === 'save-draft') {
        const branch = (await host.remote.getProjection(root, signal)).branches[0]!
        const draft = { ...branch.editing_draft!, instructions: '另一个窗口的输入' }
        await host.remote.mutate({ ...root, type: 'edit-draft', value: { expected: branch.editing_draft, draft } }, signal)
      }
      return host.remote.mutate(request, signal)
    })
    const { renderer } = await mount(await host.remote.getProjection(root, signal), { workspaceId: root.workspaceId, workspaces: environment.workspaces, presets: environment.presets,
      instances: environment.instances, agentModelGroups: environment.models.groups, routableProviders: environment.models.routableProviders, catalog: makeCatalog(), onAction,
      remote: { subscribe: (request, streamSignal) => host.remote.subscribe(request, streamSignal), getProjection: scope => host.remote.getProjection(scope, signal), getInputDescription: request => host.remote.getInputDescription(request, signal),
        getEnvironment: request => host.remote.getEnvironment(request, signal), getTaskDraft: request => host.remote.getTaskDraft(request, signal), saveTaskDraft: request => host.remote.saveTaskDraft(request, signal) } })
    await click(renderer, '建议参数')
    expect(readField(renderer.root, '任务 Workflow 模板')).toBe('5')
    await change(renderer, '任务要求', '给出采样参数')
    await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
    const after = await host.remote.getProjection(root, signal)
    if (conflict) {
      expect(after.tasks.filter(task => task.kind === 'parameters')).toHaveLength(0)
      expect(onAction.mock.calls.filter(([request]) => request.type === 'agent-action')).toHaveLength(0)
      expect(nodeText(renderer.root.findByProps({ id: 'task-error' }))).toContain('编辑')
    } else {
      const created = after.tasks.find(task => task.kind === 'parameters')!
      expect(created.input.generation_input.template_id).toBe('5')
      expect(created.input.prompt_input).toEqual({ positive_prompt: 'Agent 当前正向词', negative_prompt: 'Agent 当前负向词' })
      expect(onAction.mock.calls.findIndex(([request]) => request.type === 'save-draft')).toBeLessThan(onAction.mock.calls.findIndex(([request]) => request.type === 'agent-action'))
      expect(after.branches[0]!.draft.generation_input.template_id).toBe('5')
      expect(after.branches[0]!.draft.prompt_input).toEqual(created.input.prompt_input)
    }
  } finally { await host.dispose() }
})

it.each([false, true])('adds a historical Run without writing its ID as a task reference and creates a real Host task; retained task payload=%s', async retainedTask => {
  const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
  const { toGenerationRequest, parseCliGenerationRequest } = await import('../../src/cli/contract.ts')
  const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
  try {
    const source = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '引用来源', goal: '已有运行' } }, signal)
    await host.remote.mutate({ ...source, type: 'function-preset', id: 'run', value: 'preset-a' }, signal)
    for (const value of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }]) await host.remote.mutate({ ...source, type: 'resource-select', value }, signal)
    await setHostField(host, { ...source, field: 'instance_id', value: '8' }, signal)
    const accepted = await host.remote.mutate({ ...source, type: 'run' }, signal)
    const sourceTask = (await host.remote.getProjection(source, signal)).tasks.find(task => task.task_id === accepted.taskId)!
    const generated = await host.runtime.acceptGenerations({ workspaceId: source.workspaceId, sessionId: sourceTask.session_id!, turn: 1, callId: 'embedded-run-reference' }, [{ requestId: crypto.randomUUID(), request: toGenerationRequest(parseCliGenerationRequest(sourceTask.input.generation_input)) }], signal, sourceTask.task_id)
    const runId = generated.items[0]!.runId
    for (let phase = 0; phase < 4; phase++) await host.runtime.advance()
    const target = await host.remote.mutate({ type: 'new-work', workspaceId: source.workspaceId, value: { name: '引用目标', goal: '参考已有运行' } }, signal)
    await host.remote.mutate({ ...target, type: 'function-preset', id: 'parameters', value: 'preset-a' }, signal)
    const environment = await host.remote.getEnvironment({ workspaceId: target.workspaceId }, signal)
    const { renderer } = await mount(await host.remote.getProjection(target, signal), { storage: { getItem: () => JSON.stringify({ workId: target.workId, branchId: target.branchId }), setItem: vi.fn() }, workspaceId: target.workspaceId, workspaces: environment.workspaces, presets: environment.presets, instances: environment.instances, agentModelGroups: environment.models.groups, routableProviders: environment.models.routableProviders,
      onAction: request => host.remote.mutate(request, signal), remote: { subscribe: (request, streamSignal) => host.remote.subscribe(request, streamSignal), getInputDescription: request => host.remote.getInputDescription(request, signal), getRunInput: request => host.remote.getRunInput(request, signal), getProjection: request => host.remote.getProjection(request, signal), queryRecords: async request => { const records = await host.remote.queryRecords(request, signal); return retainedTask && request.type === 'run' ? records.map(record => ({ ...record, task: sourceTask })) : records }, getTaskDraft: request => host.remote.getTaskDraft(request, signal), saveTaskDraft: request => host.remote.saveTaskDraft(request, signal) } })
    expect(readField(renderer.root, '原始需求')).toBe('参考已有运行')
    await click(renderer, retainedTask ? '引用运行' : '引用任务')
    const embedded = renderer.root.findAllByProps({ className: 'reference-option' }).find(option => option.findAllByProps({ title: runId }).length > 0 && !nodeText(option).includes('添加任务引用'))!
    await act(async () => embedded.findAllByType('button').find(button => nodeText(button) === '添加引用')!.props.onClick())
    await click(renderer, '保存参数')
    await vi.waitFor(async () => expect((await host.remote.getProjection(target, signal)).branches.find(branch => branch.branch_id === target.branchId)!.draft.reference_run_ids, renderer.root.findAllByProps({ className: 'toast' }).map(nodeText).join(' ')).toEqual([runId]))
    const saved = (await host.remote.getProjection(target, signal)).branches.find(branch => branch.branch_id === target.branchId)!
    expect(saved.draft.reference_task_ids).toEqual([])
    await click(renderer, '建议参数')
    await change(renderer, '任务 ComfyUI 实例', '8')
    await change(renderer, '任务 Workflow 模板', '5')
    await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
    const created = (await host.remote.getProjection(target, signal)).tasks.find(task => task.kind === 'parameters')!
    expect(created.input.reference_run_ids).toEqual([runId])
    expect(created.input.reference_task_ids).toEqual([])
  } finally { await host.dispose() }
})

it('restores historical image input into root image fields while keeping generation input at the base boundary', async () => {
  const data = fullProjection(), run = data.runs[0]!
  data.branches[0]!.draft.reference_run_ids = ['older-reference']
  const image = { image_ref_id: 'history-image', source: { kind: 'uploaded_file' as const, file_id: 'history-file' }, purpose: 'agent' as const, reference_requirement: '参考窗框' }
  const submitted = { ...run.generation_input, image_refs: [image], workflow_image_bindings: [] }
  const { renderer, onAction } = await mount(data, { remote: {
    queryRecords: async () => [{ type: 'run', id: run.run_id, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'root', task_id: run.workbench_task_id, title: run.title, run }],
    getRunInput: async () => ({ ...runInputDefaults(submitted), run_id: run.run_id, branch_id: 'root', generation_input: submitted, image_refs: [image], workflow_image_bindings: [], input_description: inputDescription, prompt_input: { positive_prompt: '历史正向词', negative_prompt: '' } }),
  } })
  await click(renderer, '引用运行')
  await click(renderer, '使用此运行输入')
  await click(renderer, '保存参数')
  const saved = [...onAction.mock.calls].reverse().find(([request]) => request.type === 'save-draft')![0].value as unknown as { draft: TaskDraft }
  expect(saved.draft.generation_input).not.toHaveProperty('image_refs')
  expect(saved.draft.generation_input).not.toHaveProperty('workflow_image_bindings')
  expect(saved.draft.image_refs).toEqual([image])
  expect(saved.draft.workflow_image_bindings).toEqual([])
  expect(saved.draft.reference_run_ids).toEqual([run.run_id, 'older-reference'])
  expect(saved.draft.prompt_input.positive_prompt).toBe('历史正向词')
})

it('shows submitted input and a pending effective input separately when image preparation failed', async () => {
  const data = fullProjection(), run = data.runs[0]!, input = data.tasks[0]!.input
  run.status = 'failed'
  const { renderer } = await mount(data, { startEditing: false, remote: { getRunInput: async () => ({
    run_id: run.run_id, branch_id: 'root', submitted_input: run.generation_input, effective_input: null, generation_input: run.generation_input,
    image_uploads: [], parameter_mapping: input.parameter_mapping, base_model_id: input.base_model_id, image_refs: [], workflow_image_bindings: [],
    input_description: inputDescription, prompt_input: input.prompt_input,
  }) } })
  await click(renderer, '查看运行输入')
  const summaries = renderer.root.findAllByType('summary').map(nodeText)
  expect(summaries).toContain('提交输入')
  expect(summaries).toContain('实际输入')
  expect(JSON.stringify(renderer.toJSON())).toContain('实际输入尚未准备完成。')
})

it('updates the saved editing baseline after a save completes while another branch is open', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const data = fullProjection()
  const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
    if (request.type !== 'save-draft') return
    if (onAction.mock.calls.filter(([request]) => request.type === 'save-draft').length === 1) await gate
    data.branches.find(item => item.branch_id === request.branchId)!.draft = structuredClone((request.value as unknown as { draft: TaskDraft }).draft)
  })
  const { renderer } = await mount(data, { onAction })
  await change(renderer, '正向提示词', 'saved before browsing')
  await click(renderer, '保存参数')
  await click(renderer, '切换分支 暖光探索')
  await act(async () => { release(); await gate })
  await click(renderer, '切换分支 主分支')
  await click(renderer, '编辑参数')
  await change(renderer, '正向提示词', 'second save')
  await click(renderer, '保存参数')
  expect(onAction.mock.calls.filter(([request]) => request.type === 'save-draft')[1]?.[0]).toMatchObject({ value: { expected: { prompt_input: { positive_prompt: 'saved before browsing' } } } })
})

async function setHostField(host: Awaited<ReturnType<typeof import('../support/workbench-host.ts').createWorkbenchHostFixture>>, request: { workspaceId: string; workId?: string; branchId?: string; field: string; value: unknown; id?: string; expectedValue?: string }, signal: AbortSignal) {
  const projection = await host.remote.getProjection(request, signal)
  const branch = projection.branches.find(item => item.branch_id === request.branchId)!
  const draft = structuredClone(branch.editing_draft ?? branch.draft)
  const metadata: Record<string, unknown> = {}
  if (request.field === 'name') Object.assign(metadata, { name: request.value, expectedName: branch.name })
  else if (request.field === 'original_request') Object.assign(metadata, { originalRequest: request.value, expectedOriginalRequest: branch.original_request })
  else if (request.field === 'positive_prompt' || request.field === 'negative_prompt') draft.prompt_input[request.field] = request.value as string
  else if (request.field === 'instance_id') draft.generation_input.instance_id = request.value as string
  else if (request.field === 'parameter') draft.generation_input.parameters[request.id!] = request.value as import('../../src/workbench/contract.ts').JsonValue
  else if (request.field === 'lora-weight') draft.generation_input.loras.find(item => item.id === request.id)!.weight = request.value as number
  else throw new Error('Unsupported fixture field: ' + request.field)
  return host.remote.mutate({ workspaceId: request.workspaceId, workId: request.workId, branchId: request.branchId, type: 'save-draft', value: { expected: branch.draft, expectedEditingDraft: branch.editing_draft, draft, ...metadata } }, signal)
}

describe('experiment workbench saved preparation contract', () => {
  it('cancels prompt, name and requirement edits without writing the saved preparation', async () => {
    const { renderer, onAction } = await mount(fullProjection())
    await change(renderer, '正向提示词', 'unfinished')
    await change(renderer, '分支名称', '未保存名称')
    await change(renderer, '原始需求', '未保存需求')
    await click(renderer, '取消')
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'save-draft' }))
    await click(renderer, '编辑参数')
    expect(readField(renderer.root, '正向提示词')).toBe('glass house')
    expect(readField(renderer.root, '分支名称')).toBe('主分支')
  })

  it('keeps the editing baseline while another window changes the saved preparation', async () => {
    vi.useFakeTimers()
    let data = { ...fullProjection() }
    const original = structuredClone(data.branches[0]!.draft)
    const { renderer, onAction } = await mount(data, { remote: { getProjection: async () => data } })
    await change(renderer, '正向提示词', 'local glass')
    data = { ...data, branches: data.branches.map(item => item.branch_id === 'root' ? { ...item, draft: { ...item.draft, prompt_input: { ...item.draft.prompt_input, positive_prompt: 'remote glass' } } } : item) }
    await deliverChanges()
    expect(readField(renderer.root, '正向提示词')).toBe('local glass')
    await click(renderer, '保存参数')
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'save-draft', value: expect.objectContaining({ expected: data.branches[0]!.draft, draft: expect.objectContaining({ prompt_input: expect.objectContaining({ positive_prompt: 'local glass' }) }) }) }))
  })

  it('retains edits and permits retry after saving fails', async () => {
    let failed = false
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => { if (request.type === 'save-draft' && !failed) { failed = true; throw new Error('保存失败，请重试。') } })
    const { renderer } = await mount(fullProjection(), { onAction })
    await change(renderer, '正向提示词', 'retained text')
    await click(renderer, '保存参数')
    expect(readField(renderer.root, '正向提示词')).toBe('retained text')
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toBe('保存失败，请重试。')
    await click(renderer, '保存参数')
    expect(onAction.mock.calls.filter(([request]) => request.type === 'save-draft')).toHaveLength(2)
  })

  it('accepts one save while retaining newer typing for the next save', async () => {
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    const data = fullProjection()
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
      if (request.type !== 'save-draft') return
      if (onAction.mock.calls.filter(([request]) => request.type === 'save-draft').length === 1) await pending
      data.branches[0]!.draft = structuredClone((request.value as unknown as { draft: TaskDraft }).draft)
    })
    const { renderer } = await mount(data, { onAction })
    await change(renderer, '正向提示词', 'first saved text')
    const save = renderer.root.findAllByType('button').find(item => nodeText(item) === '保存参数')!
    await act(async () => { save.props.onClick(); save.props.onClick() })
    expect(onAction.mock.calls.filter(([request]) => request.type === 'save-draft')).toHaveLength(1)
    await change(renderer, '正向提示词', 'newer unsaved text')
    await act(async () => { release(); await pending })
    expect(readField(renderer.root, '正向提示词')).toBe('newer unsaved text')
    await click(renderer, '保存参数')
    expect(onAction.mock.calls.filter(([request]) => request.type === 'save-draft')[1]?.[0]).toMatchObject({ value: { expected: { prompt_input: { positive_prompt: 'first saved text' } }, draft: { prompt_input: { positive_prompt: 'newer unsaved text' } } } })
  })

  it('adds multiple source experiences without replacing the current prompt', async () => {
    const data = fullProjection(), experience = data.experiences[0]!
    const records = ['source-a', 'source-b'].map(id => ({ type: 'experience' as const, id, workspace_id: 'other-workspace', work_id: 'other-work', branch_id: null, task_id: null, title: id, experience: { ...experience, experience_id: id, title: id } }))
    const { renderer, onAction } = await mount(data, { remote: { queryRecords: async () => records } })
    await change(renderer, '正向提示词', 'keep local prompt')
    await click(renderer, '引用经验')
    for (const id of ['source-a', 'source-b']) await change(renderer, `选择经验 ${id}`, '', true)
    await click(renderer, '添加所选引用（2）')
    expect(readField(renderer.root, '正向提示词')).toBe('keep local prompt')
    await click(renderer, '保存参数')
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'save-draft', value: expect.objectContaining({ draft: expect.objectContaining({
      reference_run_ids: [], reference_experiences: records.map(record => expect.objectContaining({ experience_id: record.id, provenance: experience.provenance })),
    }) }) }))
  })

  it('preserves the originating branch while browsing a source and returning', async () => {
    const data = fullProjection(), source = { branch_id: null,  type: 'run' as const, id: 'external-run', workspace_id: 'other-workspace', work_id: 'other-work', task_id: 'external-task', title: '来源运行', run: { ...data.runs[0]!, run_id: 'external-run' } }
    const { renderer, onAction } = await mount(data, { remote: { queryRecords: async () => [source] } })
    await change(renderer, '正向提示词', 'unfinished local prompt')
    await click(renderer, '引用运行')
    await click(renderer, '添加引用')
    await click(renderer, '查看来源')
    expect(renderer.root.findByProps({ role: 'dialog', 'aria-label': '参考内容' })).toBeDefined()
    await click(renderer, '关闭参考内容')
    expect(readField(renderer.root, '正向提示词')).toBe('unfinished local prompt')
    expect(readField(renderer.root, '分支名称')).toBe('主分支')
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'save-draft' }))
  })
})

it('shows the global experience library and reference controls in an empty workspace', async () => {
  const data = { ...fullProjection(), work_id: null, works: [], branches: [], tasks: [], runs: [] }
  const { renderer } = await mount(data)
  const button = renderer.root.findAllByType('button').find(item => item.props['aria-label'] === '经验')!
  await act(async () => button.props.onClick())
  expect(JSON.stringify(renderer.toJSON())).toContain('自然光经验')
  expect(renderer.root.findAllByProps({ 'aria-label': '选择经验 experience-a' })).toHaveLength(1)
})

it('saves preparation only on Save and preserves unfinished text while inspecting a Run', async () => {
  const { renderer, onAction } = await mount(fullProjection(), { startEditing: false })
  expect(renderer.root.findAllByProps({ 'aria-label': '正向提示词' }).filter(item => item.props.onChange)).toHaveLength(0)
  const button = (label: string) => renderer.root.findAllByType('button').find(item => nodeText(item) === label)!
  await act(async () => button('编辑参数').props.onClick())
  const input = renderer.root.findByProps({ 'aria-label': '正向提示词' })
  await act(async () => input.props.onChange({ target: { value: 'unfinished glass' } }))
  expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'save-draft' }))
  await act(async () => button('查看运行 · r1').props.onClick())
  await act(async () => button('准备运行').props.onClick())
  expect(readField(renderer.root, '正向提示词')).toBe('unfinished glass')
  await act(async () => button('保存参数').props.onClick())
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'save-draft', value: expect.objectContaining({ draft: expect.objectContaining({ prompt_input: expect.objectContaining({ positive_prompt: 'unfinished glass' }) }) }) }))
})

describe('preparation and library operation boundaries', () => {
  it.each([true, false])('adds selected favorite experiences and runs to preparation with record cache=%s', async cached => {
    const data = fullProjection(), experience = data.experiences[0]!, run = data.runs[1]!
    const records = [
      { type: 'experience' as const, id: experience.experience_id, title: experience.title, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'child', task_id: null, experience },
      { type: 'run' as const, id: run.run_id, title: run.title, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'child', task_id: run.workbench_task_id, run },
    ]
    const { renderer, onAction } = await mount(data, { remote: { queryRecords: async () => cached ? records : [] } })
    await click(renderer, '收藏')
    for (const label of ['选择经验 ' + experience.experience_id, '选择运行 ' + run.run_id]) {
      await change(renderer, label, '', true)
      await change(renderer, label, '', false)
      await change(renderer, label, '', true)
    }
    await click(renderer, '添加所选引用（2）')
    expect(data.branches[0]!.editing_draft).toMatchObject({
      reference_run_ids: [run.run_id], reference_experiences: [{ experience_id: experience.experience_id, note: experience.note }],
    })
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'save-draft' }))
    expect(nodeText(renderer.root)).toContain('添加所选引用（0）')
  })

  it('keeps library selections while choosing a destination in another workspace', async () => {
    const a = fullProjection(), b = fullProjection(), onWorkspaceChange = vi.fn()
    b.workspace_id = 'workspace-b'; b.work_id = 'work-b'
    b.works = [{ ...b.works[0]!, workspace_id: 'workspace-b', work_id: 'work-b', name: '跨区目标' }]
    b.branches = [{ ...b.branches[0]!, work_id: 'work-b', branch_id: 'root-b', draft: { ...b.branches[0]!.draft, prompt_input: { positive_prompt: '目标提示词', negative_prompt: '' } } }]
    b.tasks = []; b.runs = []
    const destinations = [{ workspace_id: 'workspace-b', work_id: 'work-b', branch_id: 'root-b', work_name: '跨区目标', branch_name: '主分支' }]
    a.reference_destinations = destinations; b.reference_destinations = destinations
    const experience = a.experiences[0]!, writes: Parameters<ExperimentWorkbenchProps['onAction']>[0][] = []
    const { renderer } = await mount(a, {
      workspaces: [{ id: 'workspace-a', name: 'A', path: '/a' }, { id: 'workspace-b', name: 'B', path: '/b' }], onWorkspaceChange,
      remote: { getProjection: async scope => scope.workspaceId === 'workspace-b' ? b : a },
      onAction: async request => {
        writes.push(request)
        const target = request.workspaceId === 'workspace-b' ? b.branches[0]! : a.branches[0]!
        if (request.type === 'edit-draft') {
          target.editing_draft = structuredClone((request.value as unknown as { draft: TaskDraft }).draft)
          return { workspaceId: request.workspaceId, workId: request.workId, branchId: request.branchId, editingDraft: target.editing_draft }
        }
      },
    })
    await click(renderer, '经验')
    await change(renderer, '选择经验 ' + experience.experience_id, '', true)
    await change(renderer, '引用目标分支', 'root-b')
    expect(onWorkspaceChange).toHaveBeenCalledWith('workspace-b')
    await click(renderer, '添加所选引用（1）')
    expect(writes.at(-1)).toMatchObject({ workspaceId: 'workspace-b', workId: 'work-b', branchId: 'root-b', type: 'edit-draft' })
    expect(b.branches[0]!.editing_draft!.prompt_input.positive_prompt).toBe('目标提示词')
    expect(b.branches[0]!.editing_draft!.reference_experiences[0]!.experience_id).toBe(experience.experience_id)
    expect(a.branches[0]!.draft.reference_experiences).toEqual([])
  })

  it('keeps the empty workspace library usable and returns through its empty-state actions', async () => {
    const { renderer } = await mountReady(structuredClone(empty))
    await click(renderer, '新建工作')
    expect(nodeText(renderer.root.findByProps({ role: 'dialog' }))).toContain('创建工作')
    await click(renderer, '取消')
    await click(renderer, '收藏')
    await click(renderer, '查看经验')
    await click(renderer, '查看结果')
    expect(nodeText(renderer.root)).toContain('新建工作')
    await click(renderer, '经验')
    await click(renderer, '新建工作')
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1)
  })

  it('reports failed library and reference loads while preserving the current preparation', async () => {
    const data = fullProjection(); data.branches[0]!.draft.reference_task_ids = ['missing-task']
    const { renderer } = await mount(data, { remote: { queryRecords: async () => { throw new Error('来源连接失败，请重试。') } } })
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('来源连接失败')
    await click(renderer, '经验')
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('来源连接失败')
    expect(data.branches[0]!.draft.reference_task_ids).toEqual(['missing-task'])
  })

  it('retains editable preparation when cancellation fails', async () => {
    const data = fullProjection()
    const { renderer } = await mount(data, { onAction: async request => {
      if (request.type === 'edit-draft' && (request.value as unknown as { draft: TaskDraft | null }).draft === null) throw new Error('取消失败，请重试。')
    } })
    await change(renderer, '正向提示词', '仍需保留的输入')
    await click(renderer, '取消')
    expect(readField(renderer.root, '正向提示词')).toBe('仍需保留的输入')
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('取消失败')
  })
})

describe('preparation image and translation integration', () => {
  it('imports local image bytes and merges the same file into both image purposes', async () => {
    const data = fullProjection(), image: import('../../src/workbench/contract.ts').ImageRef = {
      image_ref_id: 'local-image', source: { kind: 'uploaded_file', file_id: 'stored-file' }, purpose: 'workflow', reference_requirement: '',
    }
    const importImages = vi.fn(async () => ({ images: [image] }))
    const resolveImages = vi.fn(async () => ({ images: [{ image_ref_id: image.image_ref_id, file_path: '/input/reference.png', name: 'reference.png', url: '/input/reference.png' }] }))
    const { renderer } = await mount(data, { remote: { importImages, resolveImages } })
    const file = { name: 'reference.png', type: 'image/png', arrayBuffer: async () => Uint8Array.from([1, 2, 255]).buffer }
    for (const purpose of ['workflow', 'agent']) {
      const field = renderer.root.findByProps({ id: 'local-image-files-' + purpose })
      await act(async () => { field.props.onChange({ target: { files: [file], value: 'reference.png' } }) })
    }
    expect(importImages).toHaveBeenNthCalledWith(1, { files: [{ name: 'reference.png', media_type: 'image/png', bytes: [1, 2, 255] }] })
    expect(data.branches[0]!.editing_draft!.image_refs).toEqual([{ ...image, purpose: 'both' }])
    expect(renderer.root.findAllByProps({ alt: 'reference.png' }).length).toBeGreaterThan(0)
    expect(resolveImages).toHaveBeenCalledWith({ image_refs: [{ ...image, purpose: 'both' }] })
  })

  it('selects a Run image for each purpose and keeps the media identity unique', async () => {
    const data = fullProjection(), run = data.runs[0]!, media = run.media[0]!
    const { renderer } = await mount(data, { remote: { queryRecords: async () => [{ type: 'run', id: run.run_id, title: run.title, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'root', task_id: run.workbench_task_id, run }] } })
    for (const purpose of ['workflow', 'agent']) {
      const section = renderer.root.findByProps({ 'data-image-section': purpose })
      await act(async () => section.findAllByType('button').find(button => nodeText(button) === '从运行记录选择')!.props.onClick())
      await change(renderer, '选择图片 ' + media.filename, '', true)
      await click(renderer, '添加已选图片（1）')
    }
    expect(data.branches[0]!.editing_draft!.image_refs).toMatchObject([{ source: { kind: 'run_media', run_id: run.run_id, media_id: media.media_id }, purpose: 'both' }])
    expect(data.branches[0]!.editing_draft!.image_refs).toHaveLength(1)
    expect(renderer.root.findAllByProps({ alt: media.filename }).length).toBeGreaterThan(0)
  })

  it('shows an image resolution failure without changing saved image references', async () => {
    const data = fullProjection(), image: import('../../src/workbench/contract.ts').ImageRef = { image_ref_id: 'image', source: { kind: 'run_media', run_id: 'r1', media_id: data.runs[0]!.media[0]!.media_id }, purpose: 'agent', reference_requirement: '保留窗框' }
    data.branches[0]!.draft.image_refs = [image]
    const { renderer } = await mountReady(data, { remote: { resolveImages: async () => { throw new Error('图片暂时无法读取，请重试。') } } })
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('图片暂时无法读取')
    expect(data.branches[0]!.draft.image_refs).toEqual([image])
  })

  it.each(['matching', 'other-branch'] as const)('opens stored translation history after clearing and reopening the page: %s', async scope => {
    const data = fullProjection()
    const record: import('../../src/workbench/translation.ts').TranslationRecord = { request_id: 'historical-translation', workspace_id: data.workspace_id, work_id: data.work_id!, branch_id: scope === 'matching' ? data.branches[0]!.branch_id : 'other-branch',
      field: 'positive_prompt', source_text: 'previous source', text: '已保存的历史译文', status: 'succeeded', session_id: 'translation-session', harness_turn: 1, start_seq: 0, created_at: 1, finished_at: 2 }
    const subscribe: ExperimentWorkbenchProps['remote']['subscribe'] = async function* (_request, signal) {
      yield { kind: 'snapshot', sequence: 0, projection: data, promptTurns: [], translations: [record] }
      if (!signal.aborted) await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
    }
    const first = await mountReady(data, { remote: { subscribe } })
    await click(first.renderer, '编辑参数')
    await change(first.renderer, '正向提示词', '')
    await click(first.renderer, '保存参数')
    expect(data.branches[0]!.draft.prompt_input.positive_prompt).toBe('')
    await act(() => first.renderer.unmount())
    const reopened = await mountReady(data, { remote: { subscribe } })
    const prompt = reopened.renderer.root.findAllByProps({ 'aria-label': '正向提示词' }).find(item => item.props.className === 'input-readout prompt-readout')!
    const trigger = prompt.findAllByType('button')[0]!
    expect(trigger.props.disabled).toBe(scope !== 'matching')
    if (scope === 'matching') {
      await act(() => trigger.props.onClick())
      const dialog = reopened.renderer.root.findByProps({ role: 'dialog' })
      expect(nodeText(dialog)).toContain('previous source')
      expect(nodeText(dialog)).toContain('已保存的历史译文')
    }
    expect(reopened.remote.translateStart).not.toHaveBeenCalled()
  })

  it.each([false, true])('opens prompt translation from preparation or historical inputs and restores focus: history=%s', async history => {
    const data = fullProjection(), focus = vi.fn()
    data.branches[0]!.draft.prompt_input = { positive_prompt: 'glass house', negative_prompt: 'blur' }
    const trigger = { focus }, hostFocus = vi.fn()
    const root = { activeElement: trigger }
    const { renderer, remote, onAction } = await mountReady(data, {}, { createNodeMock: () => ({ getRootNode: () => root }) })
    if (history) await click(renderer, '查看运行 · r1')
    Object.defineProperty(document, 'activeElement', { value: { focus: hostFocus, shadowRoot: root }, configurable: true })
    const prompt = renderer.root.findAllByProps({ 'aria-label': '正向提示词' }).find(item => item.props.className === 'input-readout prompt-readout')!
    await act(async () => prompt.findAllByType('button')[0]!.props.onClick())
    expect(remote.translateStart).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: 'workspace-a', source_text: history ? String(data.runs[0]!.generation_input.parameters.positive_1) : 'glass house' }))
    await click(renderer, '关闭翻译')
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(hostFocus).not.toHaveBeenCalled()
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'save-draft' }))
    expect(data.branches[0]!.draft.prompt_input.positive_prompt).toBe('glass house')
  })
})

describe('reference source and removal operations', () => {
  const sourceFixture = () => {
    const data = fullProjection(), task = data.tasks[0]!, run = data.runs[0]!, experience = data.experiences[0]!
    experience.provenance = { created_by_task_id: task.task_id, evidence: [{ run_id: run.run_id, generation_task_id: task.task_id, role: 'supporting_evidence' }] }
    data.branches[0]!.draft.reference_run_ids = [run.run_id]
    data.branches[0]!.draft.reference_task_ids = [task.task_id]
    data.branches[0]!.draft.reference_experiences = [{ experience_id: experience.experience_id, title: experience.title, conditions: experience.conditions, note: experience.note, provenance: experience.provenance }]
    const artifacts: WorkbenchProjection['artifacts'] = [
      { artifact_id: 'source-prompt', task_id: task.task_id, type: 'prompt', artifact: { type: 'prompt', positive_prompt: '来源产物', negative_prompt: '' }, source_files: [], session_id: 'source-session', turn: 1, call_id: 'source-call', skill_refs: [], disposition: 'recorded', applied_target: null, created_at: 1 },
      { artifact_id: 'source-question', task_id: task.task_id, type: 'question', artifact: { type: 'question', question: '来源问题', options: [] }, source_files: [], session_id: 'source-session', turn: 1, call_id: 'source-call', skill_refs: [], disposition: 'recorded', applied_target: null, created_at: 1 },
    ]
    const records: import('../../src/workbench/contract.ts').WorkbenchRecord[] = [
      { type: 'run', id: run.run_id, title: run.title, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'root', task_id: task.task_id, run },
      { type: 'task', id: task.task_id, title: task.title, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'root', task_id: task.task_id, task, runs: [run], artifacts },
      { type: 'experience', id: experience.experience_id, title: experience.title, workspace_id: 'workspace-a', work_id: 'work-a', branch_id: 'root', task_id: task.task_id, experience },
    ]
    return { data, task, run, experience, records, remote: { queryRecords: async (request: { type: string }) => records.filter(record => record.type === request.type || request.type === 'favorite') } }
  }

  it('inspects task artifacts, embedded Runs and experience evidence without leaving preparation', async () => {
    const { data, remote, experience, task, run } = sourceFixture()
    const { renderer, onAction } = await mount(data, { remote })
    await click(renderer, '查看产物')
    let dialog = renderer.root.findByProps({ role: 'dialog', 'aria-label': '参考内容' })
    expect(nodeText(dialog)).toContain('source-prompt')
    expect(nodeText(dialog)).not.toContain('source-question')
    await click(renderer, '查看运行 ' + run.run_id)
    expect(nodeText(renderer.root.findByProps({ role: 'dialog', 'aria-label': '参考内容' }))).toContain('来源运行 ' + run.run_id)
    await click(renderer, '取消')
    const experienceCard = () => renderer.root.findByProps({ 'data-reference-experience': experience.experience_id })
    await act(async () => experienceCard().findAllByType('button').find(button => nodeText(button) === '查看来源')!.props.onClick())
    expect(nodeText(renderer.root.findByProps({ role: 'dialog', 'aria-label': '参考内容' }))).toContain(experience.note)
    await click(renderer, '查看来源 ' + run.run_id)
    await click(renderer, '关闭参考内容')
    await act(async () => experienceCard().findAllByProps({ 'aria-label': task.task_id })[0]!.props.onClick())
    expect(nodeText(renderer.root.findByProps({ role: 'dialog', 'aria-label': '参考内容' }))).toContain('source-prompt')
    await click(renderer, '关闭参考内容')
    await act(async () => experienceCard().findAllByProps({ 'aria-label': run.run_id })[0]!.props.onClick())
    expect(nodeText(renderer.root.findByProps({ role: 'dialog', 'aria-label': '参考内容' }))).toContain('来源运行')
    await click(renderer, '关闭参考内容')
    for (let index = 0; index < 3; index++) {
      const references = renderer.root.findByProps({ 'aria-label': '参考来源' })
      await act(async () => references.findAllByType('button').find(button => nodeText(button) === '移除引用')!.props.onClick())
    }
    expect(data.branches[0]!.editing_draft).toMatchObject({ reference_run_ids: [], reference_task_ids: [], reference_experiences: [] })
    expect(data.branches[0]!.draft.reference_run_ids).toEqual([run.run_id])
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'save-draft' }))
  })

  it('adds task references through their own record kind and closes unused pickers', async () => {
    const { data, remote, task } = sourceFixture()
    data.branches[0]!.draft.reference_task_ids = []
    const { renderer } = await mount(data, { remote })
    await click(renderer, '引用收藏')
    await click(renderer, '取消')
    await click(renderer, '引用任务')
    await click(renderer, '添加任务引用')
    expect(data.branches[0]!.editing_draft!.reference_task_ids).toEqual([task.task_id])
    expect(data.branches[0]!.editing_draft!.reference_run_ids).toEqual(['r1'])
  })

  it('uses library provenance to inspect a task or locate an uncached evidence Run', async () => {
    const { data, remote, task, run } = sourceFixture()
    data.branches[0]!.draft.reference_run_ids = []; data.branches[0]!.draft.reference_task_ids = []; data.branches[0]!.draft.reference_experiences = []
    const queryRecords = vi.fn(remote.queryRecords)
    const { renderer } = await mountReady(data, { remote: { queryRecords } })
    await click(renderer, '经验')
    await click(renderer, task.task_id)
    expect(nodeText(renderer.root.findByProps({ role: 'dialog', 'aria-label': '参考内容' }))).toContain('source-prompt')
    await click(renderer, '关闭参考内容')
    await click(renderer, run.run_id)
    expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed']).toBe(true)
    expect(nodeText(renderer.root.findByProps({ className: 'stage-caption' }))).toContain(run.run_id)
  })

  it('restores a viewed Run into preparation through the inspector footer', async () => {
    const data = fullProjection()
    const { renderer, remote } = await mountReady(data)
    await click(renderer, '查看运行 · r1')
    await click(renderer, '用于下次运行')
    expect(remote.getRunInput).toHaveBeenCalledWith(expect.objectContaining({ runId: 'r1' }))
    expect(data.branches[0]!.editing_draft!.reference_run_ids[0]).toBe('r1')
    expect(data.branches[0]!.editing_draft!.instructions).toBe('')
    expect(readField(renderer.root, '正向提示词')).toBe(String(data.runs[0]!.generation_input.parameters.positive_1))
    expect(renderer.root.findAllByType('button').some(button => nodeText(button) === '保存参数')).toBe(true)
  })

  it('previews a source Run image by its resolved name and translates its prompt', async () => {
    const { data, records, remote, run } = sourceFixture()
    const image: import('../../src/workbench/contract.ts').ImageRef = { image_ref_id: 'source-image', source: { kind: 'uploaded_file', file_id: 'file' }, purpose: 'both', reference_requirement: '来源图片要求' }
    const sourceInput = { ...runInputDefaults(run.generation_input), run_id: run.run_id, branch_id: 'root', generation_input: run.generation_input, submitted_input: run.generation_input, effective_input: run.generation_input, input_description: runInputDescription(run.generation_input.parameters), prompt_input: { positive_prompt: 'source prompt', negative_prompt: 'source negative' }, image_refs: [image], workflow_image_bindings: [], image_uploads: [], parameter_mapping: null, base_model_id: null }
    const translateStart = vi.fn(async (request: { request_id: string }) => ({ request_id: request.request_id, status: 'succeeded' as const, text: '来源译文' }))
    const focus = vi.fn(), hostFocus = vi.fn(), root = { activeElement: { focus } }
    const { renderer } = await mountReady(data, { remote: { ...remote, getRunInput: async () => sourceInput, translateStart,
      resolveImages: async () => ({ images: [{ image_ref_id: image.image_ref_id, name: 'source.png', file_path: '/source.png', url: '/source.png' }] }),
    } }, { createNodeMock: () => ({ getRootNode: () => root }) })
    Object.defineProperty(document, 'activeElement', { value: { focus: hostFocus, shadowRoot: root }, configurable: true })
    const references = renderer.root.findByProps({ 'aria-label': '参考来源' })
    await act(async () => references.findAllByType('button').find(button => nodeText(button) === '查看来源')!.props.onClick())
    await click(renderer, '预览 source.png')
    expect(renderer.root.findByProps({ className: 'original-image' }).findAllByType('img')[0]!.props.src).toBe('/source.png')
    await click(renderer, '关闭对话框')
    const source = renderer.root.findByProps({ role: 'dialog', 'aria-label': '参考内容' })
    await act(async () => source.findAllByType('button').find(button => nodeText(button) === '翻译')!.props.onClick())
    expect(translateStart).toHaveBeenCalledWith(expect.objectContaining({ source_text: 'source prompt' }))
    await click(renderer, '关闭翻译')
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(hostFocus).not.toHaveBeenCalled()
    expect(renderer.root.findByProps({ role: 'dialog', 'aria-label': '参考内容' })).toBeDefined()
    expect(records[0]!.run).toBe(run)
  })

  it('opens model selection from the resources header and removes a prepared LoRA locally', async () => {
    const data = fullProjection(), lora = data.branches[0]!.draft.generation_input.loras[0]!
    const { renderer, onAction } = await mount(data)
    await click(renderer, '移除 ' + lora.file_name)
    expect(data.branches[0]!.editing_draft!.generation_input.loras).toEqual([])
    expect(data.branches[0]!.draft.generation_input.loras).toEqual([lora])
    await click(renderer, '选择资源')
    expect(nodeText(renderer.root)).toContain('生成模型')
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'save-draft' }))
  })
})

describe('global library external sources and work creation', () => {
  it('resolves a nonlocal favorite Run from library records before navigating to its source', async () => {
    const data = fullProjection(), external = data.runs[1]!
    data.runs = data.runs.filter(run => run.run_id !== external.run_id)
    const record = { type: 'run' as const, id: external.run_id, title: external.title, workspace_id: 'workspace-a', work_id: 'work-b', branch_id: 'external-branch', task_id: external.workbench_task_id, run: external }
    const destination = { ...fullProjection(), work_id: 'work-b', branches: [{ ...data.branches[1]!, branch_id: 'external-branch', work_id: 'work-b', parent_branch_id: null }], tasks: [{ ...data.tasks[1]!, work_id: 'work-b', branch_id: 'external-branch' }], runs: [external] }
    const { renderer } = await mountReady({ ...data, branches: [...data.branches, ...destination.branches], tasks: [...data.tasks.filter(task => task.task_id !== external.workbench_task_id), ...destination.tasks], runs: [...data.runs, external] }, { remote: { queryRecords: async () => [record], getProjection: async scope => scope.workId === 'work-b' ? destination : data, getRunInput: async () => ({
      ...runInputDefaults(external.generation_input), run_id: external.run_id, branch_id: 'external-branch', generation_input: external.generation_input,
      input_description: runInputDescription(external.generation_input.parameters), prompt_input: { positive_prompt: 'external', negative_prompt: '' }, image_refs: [], workflow_image_bindings: [],
    }) } })
    await click(renderer, '收藏')
    expect(nodeText(renderer.root)).toContain('收藏的运行')
    await click(renderer, '查看运行')
    expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed']).toBe(true)
    expect(readField(renderer.root, '分支名称')).toBe('暖光探索')
  })

  it('queries an uncached evidence Run before navigating across workspaces', async () => {
    const data = fullProjection(), external = structuredClone(data.runs[1]!), experience = data.experiences[0]!
    external.run_id = 'remote-evidence'
    experience.provenance = { created_by_task_id: null, evidence: [{ run_id: external.run_id, generation_task_id: external.workbench_task_id, role: 'supporting_evidence' }] }
    const remoteProjection = { ...data, workspace_id: 'workspace-b', work_id: 'work-b', works: [{ ...data.works[0]!, workspace_id: 'workspace-b', work_id: 'work-b' }], branches: [{ ...data.branches[1]!, work_id: 'work-b' }], runs: [external] }
    const onWorkspaceChange = vi.fn(), queryRecords = vi.fn(async (request: { type: string }) => request.type === 'run' ? [
      { type: 'run' as const, id: external.run_id, title: external.title, workspace_id: 'workspace-b', work_id: 'work-b', branch_id: 'child', task_id: external.workbench_task_id, run: external },
    ] : [])
    const { renderer } = await mountReady(data, { onWorkspaceChange, remote: { queryRecords,
      getProjection: async scope => scope.workspaceId === 'workspace-b' ? remoteProjection : data,
      getRunInput: async () => ({ ...runInputDefaults(external.generation_input), run_id: external.run_id, branch_id: 'child', generation_input: external.generation_input, input_description: runInputDescription(external.generation_input.parameters), prompt_input: { positive_prompt: 'external', negative_prompt: '' }, image_refs: [], workflow_image_bindings: [] }),
    } })
    await click(renderer, '经验')
    await click(renderer, external.run_id)
    expect(queryRecords).toHaveBeenCalledWith({ type: 'run' })
    expect(onWorkspaceChange).toHaveBeenCalledWith('workspace-b')
    expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed']).toBe(true)
  })

  it('opens work creation through the main empty-state and library destination actions', async () => {
    const { renderer } = await mountReady(structuredClone(empty))
    const center = renderer.root.findAllByType('main')[0]!
    await act(async () => center.findAllByType('button').find(button => nodeText(button) === '新建工作')!.props.onClick())
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1)
    await click(renderer, '取消')
    await click(renderer, '经验')
    const library = renderer.root.findByProps({ className: 'library-reference-tools' })
    await act(async () => library.findAllByType('button').find(button => nodeText(button) === '新建工作')!.props.onClick())
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1)
  })
})

describe('experiment workbench connection tips', () => {
  it('warns on unload only while branch edits remain unpersisted and releases its listener', async () => {
    const browser = new EventTarget()
    vi.stubGlobal('window', browser)
    const remove = vi.spyOn(browser, 'removeEventListener')
    const { renderer } = await mountReady(fullProjection())
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true })
      Object.defineProperty(event, 'returnValue', { value: '', writable: true })
      browser.dispatchEvent(event)
      return event
    }
    expect(unload().defaultPrevented).toBe(false)
    await click(renderer, '编辑参数')
    await change(renderer, '原始需求', '尚未保存的需求')
    const warning = unload()
    expect(warning.defaultPrevented).toBe(true)
    expect(Object.getOwnPropertyDescriptor(warning, 'returnValue')?.value).toBe('编辑内容尚未保存，请保存后离开。')
    await click(renderer, '保存参数')
    expect(unload().defaultPrevented).toBe(false)
    await act(() => renderer.unmount())
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })
  it('reconnects a failed business subscription from the visible connection action', async () => {
    const data = fullProjection(), recovered = { ...data, branches: data.branches.map(branch => branch.branch_id === 'root' ? { ...branch, name: '重连后的分支' } : branch) }
    let recoveredConnection = false, fail!: () => void
    const failure = new Promise<void>(resolve => { fail = resolve })
    const subscribe = vi.fn<ExperimentWorkbenchProps['remote']['subscribe']>(async function* (_request, signal) {
      yield { kind: 'snapshot', sequence: 0, projection: recoveredConnection ? recovered : data, promptTurns: [], translations: [] }
      if (!recoveredConnection) { await failure; throw new Error('业务订阅已断开') }
      if (!signal.aborted) await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
    })
    const { renderer } = await mountReady(data, { remote: { subscribe } })
    await act(() => fail())
    await vi.waitFor(() => expect(renderer.root.findAllByType('button').some(button => nodeText(button) === '重新连接工作台')).toBe(true))
    const previous = subscribe.mock.calls.length
    recoveredConnection = true
    await click(renderer, '重新连接工作台')
    await vi.waitFor(() => expect(readField(renderer.root, '分支名称')).toBe('重连后的分支'))
    expect(subscribe).toHaveBeenCalledTimes(previous + 1)
    expect(renderer.root.findAllByType('button').some(button => nodeText(button) === '重新连接工作台')).toBe(false)
  })
  it('uses the official connection source once per outage while connecting and disconnected repeats preserve the toast timeout', async () => {
    vi.useFakeTimers()
    const connection = createConnectionState()
    const { renderer } = await mount(fullProjection(), { connectionState: connection.source })
    const toasts = () => renderer.root.findAllByProps({ className: 'toast' }).map(nodeText)
    expect(toasts()).toEqual([])
    await act(() => connection.set('connecting'))
    expect(toasts()).toEqual(['连接已断开'])
    await act(async () => {
      connection.set('disconnected')
      await vi.advanceTimersByTimeAsync(5999)
      connection.set('connecting')
    })
    expect(toasts()).toEqual(['连接已断开'])
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(toasts()).toEqual([])
    await act(() => connection.set('disconnected'))
    expect(toasts()).toEqual([])
    await act(() => connection.set('connected'))
    expect(toasts()).toEqual(['已重新连接'])
    expect(renderer.root.findByProps({ className: 'toast' }).findAllByType('button')).toHaveLength(0)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
      connection.set('connected')
    })
    expect(toasts()).toEqual([])
    await act(() => connection.set('disconnected'))
    expect(toasts()).toEqual(['连接已断开'])
    expect(readField(renderer.root, '分支名称')).toBe('主分支')
  })

  it('keeps initial failure and explicit retry while the first established connection creates no recovery notice', async () => {
    vi.useFakeTimers()
    const connection = createConnectionState('connecting')
    const data = fullProjection(), failure = new Error('Initial read failed')
    const getProjection = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(data)
    const { renderer } = await mount(data, { connectionState: connection.source, remote: { getProjection } })
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toBe(failure.message)
    await act(async () => {
      connection.set('disconnected')
      await vi.advanceTimersByTimeAsync(60000)
      connection.set('connecting')
      connection.set('connected')
    })
    expect(getProjection).toHaveBeenCalledTimes(1)
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
    await click(renderer, '重试')
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
  })

  it.each([
    new RemoteError('gateway/internal', 'SQLITE_BUSY: database is locked', {}),
    new RemoteError('workbench/operation-failed', 'Work unavailable', { code: 'not_found', issues: [] }),
    new RemoteError('gateway/cancelled', 'Query cancelled', {}),
    new DOMException('Query aborted', 'AbortError'),
  ])('keeps a $name projection rejection outside connection notices while the official source stays connected', async failure => {
    vi.useFakeTimers()
    const data = { ...fullProjection() }, connection = createConnectionState()
    const getProjection = vi.fn().mockResolvedValueOnce(data).mockRejectedValueOnce(failure).mockResolvedValue(data)
    const { renderer } = await mount(data, { connectionState: connection.source, remote: { getProjection } })
    await deliverChanges()
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
    await deliverChanges()
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
    expect(readField(renderer.root, '分支名称')).toBe('主分支')
  })

  it('ignores hidden connection churn and releases the official subscription on unmount', async () => {
    const connection = createConnectionState()
    const { renderer } = await mount(fullProjection(), { connectionState: connection.source })
    expect(connection.subscriberCount).toBe(1)
    await act(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      connection.set('connecting')
      connection.set('disconnected')
      connection.set('connected')
      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
    await act(() => renderer.unmount())
    expect(connection.subscriberCount).toBe(0)
    await act(() => connection.set('disconnected'))
  })

  it('retains recovery after a visible disconnection when props visibility returns from false to true', async () => {
    vi.useFakeTimers()
    const connection = createConnectionState()
    const { renderer } = await mount(fullProjection(), { connectionState: connection.source })
    const props = renderer.root.props as unknown as ExperimentWorkbenchProps
    const toasts = () => renderer.root.findAllByProps({ className: 'toast' }).map(nodeText)
    await act(() => connection.set('disconnected'))
    expect(toasts()).toEqual(['连接已断开'])
    await act(() => renderer.update(<ExperimentWorkbench {...props} visible={false} />))
    expect(toasts()).toEqual([])
    await act(() => connection.set('connected'))
    expect(toasts()).toEqual([])
    await act(() => renderer.update(<ExperimentWorkbench {...props} visible />))
    expect(toasts()).toEqual(['已重新连接'])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5999)
      connection.set('connected')
    })
    expect(toasts()).toEqual(['已重新连接'])
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(toasts()).toEqual([])
  })

  it('retains an ongoing hidden disconnection when props visibility returns from false to true', async () => {
    vi.useFakeTimers()
    const connection = createConnectionState()
    const { renderer } = await mount(fullProjection(), { connectionState: connection.source })
    const props = renderer.root.props as unknown as ExperimentWorkbenchProps
    const toasts = () => renderer.root.findAllByProps({ className: 'toast' }).map(nodeText)
    await act(() => renderer.update(<ExperimentWorkbench {...props} visible={false} />))
    await act(() => { connection.set('connecting'); connection.set('disconnected') })
    expect(toasts()).toEqual([])
    await act(() => renderer.update(<ExperimentWorkbench {...props} visible />))
    expect(toasts()).toEqual(['连接已断开'])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5999)
      connection.set('connecting')
      connection.set('disconnected')
    })
    expect(toasts()).toEqual(['连接已断开'])
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(toasts()).toEqual([])
  })

  it('keeps prop-hidden connection churn silent and replaces the official subscription without retaining the earlier source', async () => {
    const first = createConnectionState(), next = createConnectionState()
    const { renderer } = await mount(fullProjection(), { connectionState: first.source })
    const props = renderer.root.props as unknown as ExperimentWorkbenchProps
    await act(() => renderer.update(<ExperimentWorkbench {...props} visible={false} />))
    await act(() => { first.set('disconnected'); first.set('connected') })
    await act(() => renderer.update(<ExperimentWorkbench {...props} visible />))
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
    await act(() => renderer.update(<ExperimentWorkbench {...props} connectionState={next.source} />))
    expect(first.subscriberCount).toBe(0)
    expect(next.subscriberCount).toBe(1)
    await act(() => first.set('disconnected'))
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
    await act(() => next.set('connecting'))
    expect(renderer.root.findAllByProps({ className: 'toast' }).map(nodeText)).toEqual(['连接已断开'])
  })

  it('keeps a visible outage observation through hiding and shows recovery when visibility returns', async () => {
    vi.useFakeTimers()
    const connection = createConnectionState()
    const { renderer } = await mount(fullProjection(), { connectionState: connection.source })
    await act(() => connection.set('disconnected'))
    expect(renderer.root.findAllByProps({ className: 'toast' }).map(nodeText)).toEqual(['连接已断开'])
    await act(async () => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      connection.set('connecting')
      connection.set('connected')
      await vi.advanceTimersByTimeAsync(6000)
    })
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
    await act(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(renderer.root.findAllByProps({ className: 'toast' }).map(nodeText)).toEqual(['已重新连接'])
  })

  it('queues official connection tips beside task notices while an action error retains priority', async () => {
    vi.useFakeTimers()
    const connection = createConnectionState()
    const running = { ...makeTask('connection-notice-task', 'child', 'prompt'), status: 'running' as const }
    let data: WorkbenchProjection = { ...fullProjection(), tasks: [running] }
    const failure = new Error('Action failed')
    const { renderer } = await mountReady(data, { connectionState: connection.source,
      remote: { getProjection: async () => structuredClone(data) }, onAction: vi.fn().mockRejectedValue(failure) })
    const toasts = () => renderer.root.findAllByProps({ className: 'toast' }).map(nodeText)
    data = { ...data, tasks: [{ ...running, status: 'succeeded' }] }
    await deliverChanges()
    const taskNotice = toasts()[0]
    expect(renderer.root.findByProps({ className: 'toast' }).findAllByType('button')).toHaveLength(1)
    await act(() => { connection.set('disconnected'); connection.set('connected') })
    expect(toasts()).toEqual([taskNotice])
    await click(renderer, '运行任务')
    expect(toasts()).toEqual([failure.message])
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(toasts()).toEqual([taskNotice])
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(toasts()).toEqual(['连接已断开'])
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(toasts()).toEqual(['已重新连接'])
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(toasts()).toEqual([])
  })
})


describe('experiment workbench parameter template choices', () => {
  it('lists all template pages across bases and exclusive models and submits the selected template', async () => {
    const data = fullProjection(), catalog = makeCatalog()
    data.branches[0]!.draft.generation_input.template_id = null
    const templates: CatalogItem[] = [
      { ...catalogItems[7]!, context: { kind: 'comfyui-template', id: '22', title: '其他底模模板' }, baseModelId: '2', modelId: null, label: '其他底模模板' },
      { ...catalogItems[7]!, context: { kind: 'comfyui-template', id: '23', title: '专属模型模板' }, baseModelId: '1', modelId: '21', label: '专属模型模板' },
      { ...catalogItems[7]!, context: { kind: 'comfyui-template', id: '24', title: '第二页模板' }, baseModelId: '3', modelId: '31', label: '第二页模板' },
    ]
    vi.mocked(catalog.search).mockImplementation(async request => ({
      ...request, items: request.kind === 'comfyui-template' ? request.page === 1 ? templates.slice(0, 2) : templates.slice(2) : [],
      totalCount: request.kind === 'comfyui-template' ? 9 : 0,
    }))
    const { renderer, onAction } = await mount(data, { catalog })
    await click(renderer, '资源')
    await click(renderer, '建议参数')
    const selector = renderer.root.findByProps({ 'aria-label': '任务 Workflow 模板' })
    expect(selector.findAllByType('option').map(nodeText)).toEqual(['请选择', '其他底模模板', '专属模型模板', '第二页模板'])
    expect(catalog.search).toHaveBeenCalledWith({ kind: 'comfyui-template', query: '', page: 2, baseModelId: null, modelId: null }, expect.any(AbortSignal))
    await change(renderer, '任务要求', '测试模板组合')
    await change(renderer, '任务 ComfyUI 实例', '2')
    await change(renderer, '任务 Workflow 模板', '23')
    await act(() => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
    expect(onAction).toHaveBeenLastCalledWith({
      type: 'agent-action', requestId: expect.any(String), id: 'parameters', workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root',
      value: { draft: { instructions: '测试模板组合', resources: { instance_id: '2', template_id: '23' } } },
    })
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toEqual([])
  })
})

describe('experiment workbench task request drafts', () => {
  it('submits the clicked request while a pending save completes and preserves subsequent edits', async () => {
    let finishSave!: () => void
    let saved: TaskRequestDraft | null = null
    const remote = {
      getTaskDraft: vi.fn(async () => saved),
      saveTaskDraft: vi.fn().mockImplementationOnce((request: { draft: TaskRequestDraft }) => new Promise(resolve => {
        finishSave = () => { saved = structuredClone(request.draft); resolve(request.draft) }
      })).mockImplementation(async (request: { draft: TaskRequestDraft }) => { saved = structuredClone(request.draft); return request.draft }),
    }
    const { renderer, onAction } = await mount(fullProjection(), { remote })
    await click(renderer, '建议参数')
    await change(renderer, '任务要求', '点击时的要求')
    let pending: Promise<void> | undefined
    await act(async () => { pending = renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }) })
    await change(renderer, '任务要求', '下一份要求')
    await act(async () => { finishSave(); await pending })
    expect(onAction.mock.calls.filter(([request]) => request.type === 'agent-action').map(([request]) => request)).toEqual([{ type: 'agent-action', requestId: expect.any(String), id: 'parameters', workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root', value: { draft: { instructions: '点击时的要求', resources: {} } } }])
    await click(renderer, '建议参数')
    expect(readField(renderer.root, '任务要求')).toBe('下一份要求')
  })

  it('uses the current branch request when reopening without a saved draft', async () => {
    const data = fullProjection()
    const { renderer } = await mount(data)
    await click(renderer, '建议参数')
    expect(readField(renderer.root, '任务要求')).toBe('玻璃花房')
    await click(renderer, '取消')
    data.branches[0]!.original_request = '调整后的原始需求'
    await click(renderer, '切换分支 暖光探索')
    await click(renderer, '切换分支 主分支')
    await click(renderer, '建议参数')
    expect(readField(renderer.root, '任务要求')).toBe('调整后的原始需求')
  })

  it('keeps parameter instructions when template loading fails and loads choices after reopening', async () => {
    const catalog = makeCatalog()
    vi.mocked(catalog.search).mockRejectedValueOnce(new Error('模板目录读取失败，请重试。'))
    const { renderer, onAction } = await mount(fullProjection(), { catalog })
    await click(renderer, '建议参数')
    expect(nodeText(renderer.root.findByProps({ id: 'task-error' }))).toBe('模板目录读取失败，请重试。')
    await change(renderer, '任务要求', '目录恢复后继续填写')
    await click(renderer, '取消')
    await click(renderer, '建议参数')
    expect(readField(renderer.root, '任务要求')).toBe('目录恢复后继续填写')
    expect(nodeText(renderer.root.findByProps({ id: 'task-error' }))).toBe('')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '任务 Workflow 模板' }))).toContain('文生图')
    expect(onAction).not.toHaveBeenCalled()
  })

  it('retries saving the unchanged request before submitting after a failed save', async () => {
    const remote = {
      getTaskDraft: vi.fn(async () => null),
      saveTaskDraft: vi.fn().mockRejectedValueOnce(new Error('草稿保存失败，请重试。')).mockImplementation(async request => request.draft),
    }
    const { renderer, onAction } = await mount(fullProjection(), { remote })
    await click(renderer, '建议参数')
    await change(renderer, '任务要求', '重试时保留原文')
    expect(nodeText(renderer.root.findByProps({ id: 'task-error' }))).toBe('草稿保存失败，请重试。')
    await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
    expect(remote.saveTaskDraft).toHaveBeenCalledTimes(2)
    expect(remote.saveTaskDraft.mock.calls[1]![0]).toEqual(remote.saveTaskDraft.mock.calls[0]![0])
    expect(onAction.mock.calls.filter(([request]) => request.type === 'agent-action').map(([request]) => request)).toEqual([{ type: 'agent-action', requestId: expect.any(String), id: 'parameters', workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root', value: { draft: { instructions: '重试时保留原文', resources: {} } } }])
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
  })

  it('closes the task request with Escape and keeps its edited text when reopened', async () => {
    const { renderer, onAction } = await mount(fullProjection())
    await click(renderer, '建议参数')
    await change(renderer, '任务要求', '键盘关闭后保留')
    await act(async () => { document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' })) })
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    await click(renderer, '建议参数')
    expect(readField(renderer.root, '任务要求')).toBe('键盘关闭后保留')
    expect(onAction).not.toHaveBeenCalled()
  })

  it('preserves an explicitly empty request and recovers from load and save failures without dispatching stale text', async () => {
    const remote = {
      getTaskDraft: vi.fn().mockRejectedValueOnce(new Error('草稿读取失败，请重新打开弹窗。')).mockResolvedValue({ instructions: '', resources: {} }),
      saveTaskDraft: vi.fn().mockRejectedValueOnce(new Error('草稿保存失败，请重试。')).mockRejectedValueOnce(new Error('草稿保存失败，请重试。')).mockImplementation(async request => request.draft),
    }
    const { renderer, onAction } = await mount(fullProjection(), { remote })
    await click(renderer, '建议参数')
    expect(nodeText(renderer.root.findByProps({ id: 'task-error' }))).toBe('草稿读取失败，请重新打开弹窗。')
    expect(renderer.root.findByProps({ 'aria-label': '任务要求' }).props.disabled).toBe(true)
    await click(renderer, '取消')
    await click(renderer, '建议参数')
    expect(readField(renderer.root, '任务要求')).toBe('')
    await change(renderer, '任务要求', '第一次输入')
    await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
    expect(nodeText(renderer.root.findByProps({ id: 'task-error' }))).toBe('草稿保存失败，请重试。')
    expect(onAction).not.toHaveBeenCalled()
    await click(renderer, '取消')
    await click(renderer, '建议参数')
    expect(readField(renderer.root, '任务要求')).toBe('第一次输入')
    await change(renderer, '任务要求', '  修正后的要求  ')
    await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
    expect(onAction.mock.calls.filter(([request]) => request.type === 'agent-action').map(([request]) => request)).toEqual([{ type: 'agent-action', requestId: expect.any(String), id: 'parameters', workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root', value: { draft: { instructions: '  修正后的要求  ', resources: {} } } }])
  })

  it('keeps pending edits scoped to their branch and preserves a reopened dialog when the prior request finishes', async () => {
    let finishSave!: (value: TaskRequestDraft) => void
    let finishTask!: (value: { workspaceId: string; taskId: string }) => void
    const remote = {
      getTaskDraft: vi.fn(async () => null),
      saveTaskDraft: vi.fn().mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve })).mockImplementation(async request => request.draft),
    }
    const onAction = vi.fn((request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => request.type === 'agent-action' ? new Promise<{ workspaceId: string; taskId: string }>(resolve => { finishTask = resolve }) : undefined)
    const { renderer } = await mount(fullProjection(), { remote, onAction })
    await click(renderer, '建议参数')
    await change(renderer, '任务要求', '保存中的要求')
    await click(renderer, '取消')
    await click(renderer, '建议参数')
    expect(readField(renderer.root, '任务要求')).toBe('保存中的要求')
    await change(renderer, '任务要求', '最后的要求')
    let pending: Promise<void> | undefined
    await act(async () => { pending = renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }) })
    expect(onAction).not.toHaveBeenCalled()
    await act(async () => { finishSave({ instructions: '保存中的要求', resources: {} }) })
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'root', value: { draft: { instructions: '最后的要求', resources: {} } } }))
    await click(renderer, '取消')
    await click(renderer, '切换分支 暖光探索')
    await click(renderer, '建议参数')
    await change(renderer, '任务要求', '另一分支的要求')
    await act(async () => { finishTask({ workspaceId: 'workspace-a', taskId: 'pending-task' }); await pending })
    expect(readField(renderer.root, '任务要求')).toBe('另一分支的要求')
    expect(remote.saveTaskDraft).toHaveBeenLastCalledWith(expect.objectContaining({ branchId: 'child', draft: { instructions: '另一分支的要求', resources: {} } }))
    expect(nodeText(renderer.root)).not.toContain('pending-task')
  })

  it('keeps each function request after cancel, branch changes and a new page mount without starting a task', async () => {
    const data = fullProjection()
    const drafts = new Map<string, TaskRequestDraft>()
    const key = (request: { branchId?: string; functionId: string }) => `${request.branchId}:${request.functionId}`
    const remote = {
      getTaskDraft: vi.fn(async (request: { branchId?: string; functionId: string }) => structuredClone(drafts.get(key(request)) ?? null)),
      saveTaskDraft: vi.fn(async (request: { branchId?: string; functionId: string; draft: TaskRequestDraft }) => {
        drafts.set(key(request), structuredClone(request.draft))
        return request.draft
      }),
    }
    const { renderer, onAction } = await mount(data, { remote, catalog: makeCatalog() })
    for (const [label, functionId] of [['建议参数', 'parameters'], ['推荐资源', 'resources']]) {
      await click(renderer, label!)
      expect(readField(renderer.root, '任务要求')).toBe('玻璃花房')
      await change(renderer, '任务要求', `  ${label}\n保留原文  `)
      await click(renderer, '取消')
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
      expect(drafts.get(`root:${functionId}`)?.instructions).toBe(`  ${label}\n保留原文  `)
      expect(onAction).not.toHaveBeenCalled()
    }
    await click(renderer, '切换分支 暖光探索')
    await click(renderer, '建议参数')
    await change(renderer, '任务要求', '另一分支的要求')
    await click(renderer, '关闭对话框')
    await click(renderer, '切换分支 主分支')
    await click(renderer, '建议参数')
    expect(readField(renderer.root, '任务要求')).toBe('  建议参数\n保留原文  ')
    await act(async () => renderer.unmount())
    const next = await mount(data, { remote, catalog: makeCatalog() })
    for (const label of ['建议参数', '推荐资源']) {
      await click(next.renderer, label)
      expect(readField(next.renderer.root, '任务要求')).toBe(`  ${label}\n保留原文  `)
      await click(next.renderer, '取消')
    }
    expect(next.onAction).not.toHaveBeenCalled()
    expect(drafts.get('child:parameters')?.instructions).toBe('另一分支的要求')
  })
  it('keeps a parameter request inside its modal while correcting resources and retrying a failed submission', async () => {
    const data = fullProjection()
    data.branches[0]!.draft.generation_input.template_id = null
    let saved: TaskRequestDraft | null = null
    const remote = {
      getTaskDraft: vi.fn(async () => saved),
      saveTaskDraft: vi.fn(async (request: { draft: TaskRequestDraft }) => { saved = structuredClone(request.draft); return request.draft }),
    }
    const onAction = vi.fn().mockRejectedValueOnce(new Error('Agent 暂时不可用')).mockResolvedValue({ workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root', taskId: 'request-32' })
    const { renderer } = await mount(data, { remote, catalog: makeCatalog(), onAction })
    await click(renderer, '资源')
    await click(renderer, '建议参数')
    expect(readField(renderer.root, '任务 Workflow 模板')).toBe('')
    await change(renderer, '任务要求', '保留我的参数要求')
    const submit = () => act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
    await submit()
    expect(nodeText(renderer.root.findByProps({ id: 'task-error' }))).toBe('请在此处选择 ComfyUI 实例与 Workflow 模板。')
    expect(onAction).not.toHaveBeenCalled()
    expect(readField(renderer.root, '任务要求')).toBe('保留我的参数要求')
    await change(renderer, '任务 ComfyUI 实例', '2')
    await change(renderer, '任务 Workflow 模板', '12')
    await click(renderer, '取消')
    expect(data.branches[0]!.draft.generation_input.template_id).toBeNull()
    await click(renderer, '建议参数')
    expect(readField(renderer.root, '任务 Workflow 模板')).toBe('12')
    await submit()
    expect(nodeText(renderer.root.findByProps({ id: 'task-error' }))).toBe('Agent 暂时不可用')
    expect(readField(renderer.root, '任务要求')).toBe('保留我的参数要求')
    await submit()
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    expect(onAction).toHaveBeenLastCalledWith({ type: 'agent-action', requestId: expect.any(String), id: 'parameters', workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root', value: { draft: { instructions: '保留我的参数要求', resources: { instance_id: '2', template_id: '12' } } } })
    expect(nodeText(renderer.root)).toContain('request-32')
    expect(renderer.root.findAllByType('button').find(button => nodeText(button) === '资源')?.props.className).toContain('active')
  })
})




describe('experiment workbench shell', () => {
  it('fits full backend IDs into the reference cards while preserving action identities', async () => {
    const data = fullProjection()
    const runId = 'run_4ca2c6af-c5d4-4689-add2-5621f73ff615'
    const taskId = 'a1d0c99e-fbff-443e-b4c1-5d6521b09b6e'
    data.tasks[0]!.task_id = taskId
    data.branches[1]!.source_run_id = runId
    data.runs = [makeRun(runId, taskId)]
    const { renderer, onAction } = await mount(data)
    const card = renderer.root.findByProps({ 'aria-label': `查看运行 ${runId}` })
    expect(nodeText(card.findByProps({ title: runId }))).toBe('run_4ca2c6af…')
    expect(nodeText(card.findByProps({ title: taskId }))).toBe('a1d0c99e-fbf…')
    await click(renderer, '收藏运行')
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'favorite', id: runId }))
    const source = renderer.root.findByProps({ 'aria-label': '切换分支 暖光探索' })
    expect(nodeText(source.findByProps({ title: runId }))).toContain('run_4ca2c6af…')
    await act(() => renderer.root.findByProps({ 'aria-label': `查看原图 ${runId}` }).props.onClick())
    expect(nodeText(renderer.root.findByProps({ role: 'dialog', 'aria-labelledby': 'image-title' }).findByProps({ id: 'image-title' }))).toBe(`${runId} · 图片 1`)
  })

  it('shows each Run creation time in the reference 24-hour format', async () => {
    const data = fullProjection()
    data.runs = [
      { ...makeRun('r1', 't1'), created_at: new Date(2026, 10, 7, 20, 35).getTime() },
      { ...makeRun('r4', 't1'), created_at: new Date(2026, 10, 7, 20, 40).getTime() },
    ]
    const { renderer } = await mount(data)
    const first = renderer.root.findByProps({ 'aria-label': '查看运行 r1' })
    const second = renderer.root.findByProps({ 'aria-label': '查看运行 r4' })
    expect(first.findAllByType('small').map(nodeText)).toContain('20:35')
    expect(second.findAllByType('small').map(nodeText)).toContain('20:40')
  })



  it('shows the reference empty workspace and opens the work form', async () => {
    const { renderer } = await mount(empty)
    expect(
      readField(renderer.root, '切换工作区'),
    ).toBe('workspace-a')
    const create = renderer.root
      .findAllByType('button')
      .find((button) => button.children.includes('新建工作'))!
    await act(() => create.props.onClick())
    expect(
      renderer.root.findByProps({ role: 'dialog', 'aria-label': '新建工作' }),
    ).toBeDefined()
    expect(
      renderer.root.findByProps({ 'aria-label': '工作名称' }),
    ).toBeDefined()
    expect(renderer.root.findByProps({ 'aria-label': '总目标' })).toBeDefined()
  })

  it('renders three branch levels with their own run counts and keeps selection when folding a subtree', async () => {
    const data = treeProjection()
    const { renderer, onAction } = await mount(data)
    expect(renderer.root.findAllByProps({ role: 'treeitem' }).map(node => node.props['aria-level'])).toEqual([1, 2, 3, 2])
    for (const [name, count] of [['主分支', 1], ['暖光', 2], ['冷光', 3], ['暖光细节', 4]] as const)
      expect(nodeText(renderer.root.findByProps({ 'aria-label': `切换分支 ${name}` }))).toContain(` · ${count} 次运行`)
    for (const selected of data.branches) {
      await click(renderer, `切换分支 ${selected.name}`)
      expect(readField(renderer.root, '分支名称')).toBe(selected.name)
      expect(readField(renderer.root, '原始需求')).toBe(selected.original_request)
      const runs = data.runs.filter(run => run.workbench_task_id === `${selected.branch_id}-task`)
      const strip = renderer.root.findByProps({ className: 'run-strip' })
      expect(strip.findAllByType('button').map(node => node.props['aria-label'])).toEqual(runs.map(run => `查看运行 ${run.run_id}`))
      expect(renderer.root.findByProps({ 'aria-label': `查看运行 ${runs.at(-1)!.run_id}` }).props['aria-pressed']).toBe(true)
      expect(renderer.root.findAllByProps({ role: 'treeitem', 'aria-selected': true })).toHaveLength(1)
    }
    await click(renderer, '收起暖光')
    expect(renderer.root.findAllByProps({ 'aria-label': '切换分支 暖光细节' })).toHaveLength(0)
    expect(readField(renderer.root, '分支名称')).toBe('暖光细节')
    await click(renderer, '展开暖光')
    expect(renderer.root.findAllByProps({ role: 'treeitem', 'aria-selected': true })[0]!.props['aria-level']).toBe(3)
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '切换分支 暖光细节' }))).toContain(' · 4 次运行')
    expect(onAction).not.toHaveBeenCalled()
  })

  it('opens all branch levels after resolving the selected work query', async () => {
    const data = treeProjection()
    const { renderer } = await mount(data, {
      remote: {
        getProjection: async scope => scope.workId ? data : {
          ...data, work_id: null, branches: [], tasks: [], runs: [],
        },
        getEnvironment: async () => functionEnvironment,
      getInputDescription: async () => inputDescription,
      },
    })
    expect(renderer.root.findAllByProps({ role: 'treeitem' }).map(node => node.props['aria-level'])).toEqual([1, 2, 3, 2])
  })

  it('keeps the branch tree across tabs and switches branches from resources', async () => {
    const { renderer } = await mount(treeProjection(), { catalog: makeCatalog() })
    await click(renderer, '收起暖光')
    for (const page of ['资源', '任务', '经验', '收藏', '运行结果', '资源']) {
      await click(renderer, page)
      expect(renderer.root.findByProps({ 'aria-label': page }).props.className).toBe('active')
      const tree = renderer.root.findByProps({ role: 'tree', 'aria-label': '当前工作分支树' })
      expect(tree.findByProps({ 'aria-label': '切换分支 暖光' })).toBeDefined()
      expect(tree.findAllByProps({ role: 'treeitem' })).toHaveLength(3)
      expect(renderer.root.findByProps({ 'aria-label': '展开暖光' })).toBeDefined()
    }
    expect(renderer.root.findAllByProps({ 'aria-label': '切换分支' })).toHaveLength(0)
    await click(renderer, '切换分支 暖光')
    expect(renderer.root.findByProps({ 'aria-label': '运行结果' }).props.className).toBe('active')
    expect(renderer.root.findByProps({ 'aria-label': '收起暖光' })).toBeDefined()
    expect(renderer.root.findByProps({ 'aria-label': '切换分支 暖光细节' })).toBeDefined()
    expect(readField(renderer.root, '分支名称')).toBe('暖光')
    expect(renderer.root.findByProps({ 'aria-label': '查看运行 warm-r2' }).props['aria-pressed']).toBe(true)
  })

  it('retains folded subtrees when switching away from a work and back', async () => {
    const first = treeProjection()
    const second = {
      ...first, work_id: 'work-b',
      branches: [{ ...first.branches[0]!, branch_id: 'other-root', work_id: 'work-b', name: '另一个主分支' }],
      tasks: [], runs: [], experiences: [], favorites: [],
    }
    const { renderer } = await mount(first, {
      remote: {
        getProjection: async ({ workId }) => workId === 'work-b' ? second : first,
        getEnvironment: async () => functionEnvironment,
      getInputDescription: async () => inputDescription,
      },
    })
    await click(renderer, '收起暖光')
    await change(renderer, '切换工作', 'work-b')
    await change(renderer, '切换工作', 'work-a')
    expect(renderer.root.findByProps({ 'aria-label': '收起主分支' })).toBeDefined()
    expect(renderer.root.findByProps({ 'aria-label': '展开暖光' })).toBeDefined()
    expect(renderer.root.findAllByProps({ 'aria-label': '切换分支 暖光细节' })).toHaveLength(0)
    await click(renderer, '展开暖光')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '切换分支 暖光细节' }))).toContain(' · 4 次运行')
  })

  it('browses the recursive tree and every page tab using one workspace projection', async () => {
    const data = {
      ...empty,
      work_id: 'work-a',
      works: [
        {
          work_id: 'work-a',
          workspace_id: 'workspace-a',
          name: '雨后玻璃花房',
          goal: '探索雨后的光线',
        },
      ],
      branches: [branch('root', null), branch('child', 'root')],
    }
    const { renderer, remote } = await mount(data)
    await act(() =>
      renderer.root
        .findByProps({ 'aria-label': '切换分支 暖光探索' })
        .props.onClick(),
    )
    expect(
      readField(renderer.root, '分支名称'),
    ).toBe('暖光探索')
    for (const page of ['资源', '任务', '经验', '收藏', '运行结果']) {
      await act(() =>
        renderer.root.findByProps({ 'aria-label': page }).props.onClick(),
      )
      expect(
        renderer.root.findByProps({ 'aria-label': page }).props.className,
      ).toBe('active')
    }
    await act(() =>
      renderer.root.findByProps({ 'aria-label': '收起主分支' }).props.onClick(),
    )
    expect(
      renderer.root
        .findAllByType('button')
        .some((button) => button.props['aria-label'] === '切换分支 暖光探索'),
    ).toBe(false)
    expect(remote.getProjection).toHaveBeenCalledTimes(1)
    expect(remote.getProjection).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
    })
  })
})

const nodeText = (node: RenderNode): string =>
  node.children
    .map((child) => (typeof child === 'string' ? child : nodeText(child)))
    .join('')
const click = async (renderer: ReturnType<typeof create>, label: string) => {
  const dialog = renderer.root.findAllByProps({ role: 'dialog' }).at(-1)
  const root = dialog?.findAllByType('button').some(node => nodeText(node) === label || node.props['aria-label'] === label) ? dialog : renderer.root
  const button = root
    .findAllByType('button')
    .find(
      (node) => nodeText(node) === label || node.props['aria-label'] === label,
    )
  if (!button && ['生成提示词', '对比提示词', '建议参数', '推荐资源'].includes(label)) {
    const edit = renderer.root.findAllByType('button').find(item => nodeText(item) === '编辑参数')
    if (edit) { await act(async () => edit.props.onClick()); return click(renderer, label) }
  }
  if (!button) throw Error('Missing button: ' + label)
  await act(async () => {
    button.props.onClick()
  })
}
const change = async (
  renderer: ReturnType<typeof create>,
  label: string,
  value: string,
  checked?: boolean,
) => {
  const dialog = renderer.root.findAllByProps({ role: 'dialog' }).at(-1)
  const input = dialog?.findAllByProps({ 'aria-label': label })[0] ?? renderer.root.findByProps({ 'aria-label': label })
  if (label === '查看运行输入') { if (input.props['aria-pressed'] !== checked) await act(async () => input.props.onClick()); return }
  await act(async () => input.props.onChange({ target: { value, checked } }))
}
const blur = async (
  renderer: ReturnType<typeof create>,
  label: string,
  value: string,
) => {
  await act(async () =>
    renderer.root
      .findByProps({ 'aria-label': label })
      .props.onBlur({ target: { value } }),
  )
}

describe('experiment workbench public interactions', () => {
  it('opens run history, historical inputs, comparison and the branch graph without changing business records', async () => {
    const { renderer, onAction } = await mount(fullProjection())
    await click(renderer, '查看运行记录')
    expect(
      renderer.root.findByProps({ role: 'dialog', 'aria-label': '运行记录' }),
    ).toBeDefined()
    await click(renderer, '查看运行')
    expect(
      renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed'],
    ).toBe(true)
    await click(renderer, '准备运行')
    await change(renderer, '查看运行输入', '', true)
    expect(
      readField(renderer.root, '正向提示词'),
    ).toBe('glass house')
    await change(renderer, '查看运行输入', '', false)
    await click(renderer, '查看运行 r2')
    await click(renderer, '比较运行')
    expect(
      renderer.root.findAllByProps({ className: 'compare-grid' }),
    ).toHaveLength(1)
    await click(renderer, '比较运行 r3')
    await click(renderer, '结束比较')
    await click(renderer, '查看原图 r2')
    expect(
      renderer.root.findByProps({
        role: 'dialog',
        'aria-labelledby': 'image-title',
      }),
    ).toBeDefined()
    await click(renderer, '关闭原图')
    await click(renderer, '查看分支图')
    await click(renderer, '进入分支')
    expect(
      renderer.root.findByProps({ 'aria-label': '运行结果' }).props.className,
    ).toBe('active')
    expect(onAction).not.toHaveBeenCalled()
  })

  it('saves edited requirements, prompts and typed parameters together for the active branch', async () => {
    const { renderer, onAction } = await mount(fullProjection())
    await click(renderer, '切换分支 暖光探索')
    await click(renderer, '编辑参数')
    await change(renderer, '分支名称', '暖光复验')
    await change(renderer, '原始需求', '保留窗框')
    await change(renderer, '正向提示词', 'warm glass')
    await change(renderer, '负向提示词', 'noise')
    await change(renderer, '采样步数', '30')
    await change(renderer, '引导强度', '4.5')
    await change(renderer, 'Seed', '123')
    expect(onAction.mock.calls.filter(([request]) => request.type === 'save-draft')).toHaveLength(0)
    await click(renderer, '保存参数')
    expect(onAction.mock.calls.filter(([request]) => request.type === 'save-draft')).toHaveLength(1)
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'save-draft', workspaceId: 'workspace-a', workId: 'work-a', branchId: 'child',
      value: expect.objectContaining({ name: '暖光复验', originalRequest: '保留窗框', draft: expect.objectContaining({
        prompt_input: { positive_prompt: 'warm glass', negative_prompt: 'noise' },
        generation_input: expect.objectContaining({ parameters: expect.objectContaining({ steps_1: 30, cfg_1: 4.5, seed_1: 123 }) }),
      }) }),
    }))
  })

  it('keeps the selected page and dismisses the reference error tip after six seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const onAction = vi.fn(async () => {
      throw new Error('保存失败：连接中断')
    })
    const { renderer } = await mount(fullProjection(), { onAction })
    await click(renderer, '切换分支 暖光探索')
    await click(renderer, '查看运行 r2')
    await click(renderer, '收藏')
    await click(renderer, '移除收藏')
    expect(
      renderer.root.findByProps({ 'aria-label': '收藏' }).props.className,
    ).toBe('active')
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toContain(
      '连接中断',
    )
    expect(renderer.root.findByProps({ role: 'alert' }).findAllByType('button')).toHaveLength(0)
    await act(() => { vi.advanceTimersByTime(5999) })
    expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(1)
    await act(() => { vi.advanceTimersByTime(1) })
    expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(0)
  })

  it('shows real failures and running records, opens review and forwards retry and favorites', async () => {
    const data = fullProjection()
    data.tasks.push(makeTask('t4'))
    data.runs.push(makeRun('r4', 't4', 'remote_running'))
    const { renderer, onAction } = await mount(data)
    await click(renderer, '切换分支 暖光探索')
    expect(
      renderer.root.findAllByProps({ className: 'empty running-stage' }),
    ).toHaveLength(1)
    await click(renderer, '查看运行 r3')
    await click(renderer, '重试任务')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'retry', runId: 'r3' }),
    )
    await click(renderer, '诊断失败')
    await click(renderer, '自定义diagnose')
    await click(renderer, '记录评价与经验')
    expect(renderer.root.findByProps({ role: 'dialog' }).props.className).toContain('evaluation-modal')
    await click(renderer, '取消')
    await click(renderer, '查看运行 r2')
    await click(renderer, '移除收藏')
    await click(renderer, '查看运行记录')
    await click(renderer, '关闭面板')
    await click(renderer, '经验')
    await change(renderer, '搜索经验与收藏', '自然光')
    await click(renderer, 'r2')
    expect(renderer.root.findByProps({ 'aria-label': '运行结果' }).props.className).toBe('active')
    await click(renderer, '经验')
    await click(renderer, '添加引用')
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'edit-draft', value: expect.objectContaining({ draft: expect.objectContaining({ reference_experiences: [expect.objectContaining({ experience_id: 'experience-a' })] }) }) }))
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'reuse' }))
  })

  it('shows the prototype function locations and saved bindings when settings reopen', async () => {
    const data = fullProjection()
    data.functions.find(binding => binding.function_id === 'parameters')!.requested_skill = null
    const { renderer, onAction } = await mount(data)
    const locations = {
      run: '任务输入', prompt: '原始需求、提示词对比弹窗',
      parameters: '生成参数', resources: '资源', review: '评价与经验',
      compare: '结果比较', diagnose: '失败结果', experience: '评价与经验',
      experiment: '任务输入',
    }
    for (let visit = 0; visit < 2; visit++) {
      await click(renderer, '配置中心')
      const table = renderer.root.findByProps({ className: 'settings-table' })
      expect(table.findAllByType('th').map(nodeText)).toEqual([
        '功能', '功能位置', '默认 Agent 预设', 'Agent 模型', '指定 Skill', '配置',
      ])
      for (const [kind, location] of Object.entries(locations)) {
        const row = table.findByProps({ 'data-function': kind })
        const cells = row.findAllByType('td')
        expect(nodeText(cells[1]!)).toBe(location)
        expect(readField(row, `${kind}的默认预设`)).toBe('preset')
        expect(nodeText(cells[3]!)).toBe('提供商 · 模型 · 高')
        expect(nodeText(cells[4]!)).toBe(kind === 'parameters' ? 'Agent 自选' : 'comfyui-generate')
        expect(row.findByProps({ 'aria-label': `编辑${kind}` })).toBeDefined()
      }
      expect(nodeText(table.findByProps({ 'data-function': 'custom-prompt' }).findAllByType('td')[1]!)).toBe('原始需求、提示词对比弹窗')
      await click(renderer, '返回工作台')
    }
    expect(onAction).not.toHaveBeenCalled()
  })

  it('browses function settings and forwards function changes', async () => {
    const { renderer, onAction } = await mount(fullProjection())
    await click(renderer, '配置中心')
    await click(renderer, '添加功能')
    await click(renderer, '取消')
    await change(renderer, 'prompt的默认预设', 'preset')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'function-preset',
        id: 'prompt',
        value: 'preset',
      }),
    )
    await click(renderer, '编辑prompt')
    expect(renderer.root.findByProps({ role: 'dialog' })).toBeTruthy()
    await click(renderer, '取消')
    await click(renderer, '移除自定义prompt')
    await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'function-remove', id: 'custom-prompt' }),
    )
    await click(renderer, '返回工作台')
  })

  it('runs continuous execution and controls only the active experiment', async () => {
    const data = fullProjection()
    data.branches[0]!.execution.mode = 'continuous'
    const { renderer, onAction } = await mountReady(data)
    await change(renderer, '最多运行次数', '5')
    await click(renderer, '开始实验')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'experiment' }),
    )
    data.experiments.push({
      task_id: 't1',
      control_state: 'running',
      end_reason: null,
      submitted_count: 1,
      max_runs: 3,
    })
    await deliverChanges()
    await click(renderer, '查看分支图')
    await click(renderer, '返回结果')
    await click(renderer, '暂停实验')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'pause-experiment', taskId: 't1' }),
    )
    data.experiments[0]!.control_state = 'paused'
    await click(renderer, '结束实验')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'stop-experiment' }),
    )
    await click(renderer, '继续实验')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'resume-experiment' }),
    )
  })
})

describe('experiment workbench task list states', () => {
  it('refreshes an idle Agent task from waiting generation to completion on the task page', async () => {
    vi.useFakeTimers()
    const data = fullProjection()
    data.tasks = [{ ...makeTask('render'), status: 'waiting_generation', execution_state: 'idle' }]
    data.runs = [makeRun('render-run', 'render', 'remote_running')]
    let current = data
    const { renderer } = await mount(data, {
      remote: { getProjection: async () => structuredClone(current) },
    })
    await click(renderer, '任务')
    const card = () => renderer.root.findAllByProps({ className: 'agent-task-card' })[0]!
    expect(nodeText(card().findByProps({ className: 'pill amber' }))).toBe('等待生成')
    await deliverChanges()
    expect(nodeText(card().findByProps({ className: 'pill amber' }))).toBe('等待生成')
    current = { ...data, tasks: [{ ...data.tasks[0]!, status: 'succeeded' }], runs: [{ ...data.runs[0]!, status: 'succeeded' }] }
    await deliverChanges()
    expect(nodeText(card().findByProps({ className: 'pill ' }))).toBe('已完成')
    expect(renderer.root.findByProps({ 'aria-label': '任务' }).props.className).toBe('active')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '任务' }))).toBe('任务1')
    expect(card().props['data-task']).toBe('render')
  })

  it('shows an empty task page for another work and restores the first work list', async () => {
    const first = fullProjection()
    const second = {
      ...first, work_id: 'work-b',
      branches: [{ ...first.branches[0]!, branch_id: 'second-root', work_id: 'work-b' }],
      tasks: [], runs: [], artifacts: [], experiences: [], favorites: [],
    }
    const { renderer } = await mount(first, {
      remote: { getProjection: async ({ workId }) => workId === 'work-b' ? second : first },
    })
    await click(renderer, '任务')
    expect(renderer.root.findAllByProps({ className: 'agent-task-card' })).toHaveLength(3)
    await change(renderer, '切换工作', 'work-b')
    await click(renderer, '任务')
    expect(renderer.root.findAllByProps({ className: 'agent-task-card' })).toHaveLength(0)
    expect(nodeText(renderer.root.findByProps({ className: 'empty' }))).toBe('暂无任务生成提示词')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '任务' }))).toBe('任务0')
    await click(renderer, '返回结果')
    expect(renderer.root.findByProps({ 'aria-label': '运行结果' }).props.className).toBe('active')
    await change(renderer, '切换工作', 'work-a')
    await click(renderer, '任务')
    expect(renderer.root.findAllByProps({ className: 'agent-task-card' })).toHaveLength(3)
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '任务' }))).toBe('任务3')
  })

  it('shows every task status, title and branch with a matching task count', async () => {
    const data = fullProjection()
    const states = [
      ['pending', '待执行'],
      ['running', 'Agent 执行中'],
      ['waiting_input', '等待输入'],
      ['waiting_generation', '等待生成'],
      ['needs_attention', '待处理'],
      ['paused', '已暂停'],
      ['succeeded', '已完成'],
      ['failed', '失败'],
      ['interrupted', '已中断'],
    ] as const
    data.tasks = states.map(([status], index) => ({
      ...makeTask(status, index % 2 ? 'child' : 'root', 'prompt'),
      status,
    }))
    data.runs = []
    const { renderer, remote } = await mount(data)
    await click(renderer, '任务')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '任务' }))).toBe('任务9')
    const cards = renderer.root.findAllByProps({ className: 'agent-task-card' })
    expect(cards.map(card => card.props['data-task'])).toEqual([
      'interrupted', 'failed', 'succeeded', 'paused', 'needs_attention',
      'waiting_generation', 'waiting_input', 'running', 'pending',
    ])
    for (const [index, [status, label]] of states.entries()) {
      const card = cards.find(card => card.props['data-task'] === status)!
      expect(nodeText(card.findAllByType('h2')[0]!)).toBe('任务 ' + status)
      expect(nodeText(card.findByProps({
        className: status === 'succeeded' ? 'pill ' : status === 'failed' ? 'pill red' : 'pill amber',
      }))).toBe(label)
      const branchButton = card.findByProps({ className: 'task-meta' }).findAllByType('button')[0]!
      expect(nodeText(branchButton)).toBe(index % 2 ? '暖光探索' : '主分支')
    }
    const childButton = cards.find(card => card.props['data-task'] === 'running')!
      .findByProps({ className: 'task-meta' }).findAllByType('button')[0]!
    await act(async () => { childButton.props.onClick() })
    expect(renderer.root.findByProps({ 'aria-label': '运行结果' }).props.className).toBe('active')
    expect(readField(renderer.root, '分支名称')).toBe('暖光探索')
    await click(renderer, '任务')
    expect(renderer.root.findAllByProps({ className: 'agent-task-card' })).toHaveLength(9)
    expect(remote.getProjection.mock.calls.every(([scope]) => !('branchId' in scope))).toBe(true)
  })
})

describe('experiment workbench forms and task results', () => {


















  it('keeps same-branch typing when visiting another workbench page', async () => {
    const { renderer } = await mount(fullProjection())
    await change(renderer, '分支名称', '尚未提交的名称')
    await click(renderer, '配置中心')
    await click(renderer, '返回工作台')
    expect(readField(renderer.root, '分支名称')).toBe('尚未提交的名称')
  })



  it.each([9, 11])('matches the reference workspace dialog controls and cycles focus within root node type %s', async (nodeType) => {
    const { renderer } = await mount(empty)
    await click(renderer, '添加工作区')
    const dialog = renderer.root.findByProps({ role: 'dialog' })
    const close = dialog.findByProps({ 'aria-label': '关闭对话框' })
    expect(nodeText(close)).toBe('×')
    expect(close.props.autoFocus).toBe(true)
    const cancel = dialog.findAllByType('button').find(button => nodeText(button) === '取消')!
    expect(cancel.props.className).toBe('btn quiet')
    const first = { offsetParent: {}, focus: vi.fn() }, last = { offsetParent: {}, focus: vi.fn() }
    const root = nodeType === 9 ? Object.assign(document, { activeElement: last }) : { nodeType, activeElement: last }
    const preventDefault = vi.fn(), currentTarget = { querySelectorAll: () => [first, last], getRootNode: () => root }
    await act(() => dialog.props.onKeyDown({ key: 'Tab', shiftKey: false, currentTarget, preventDefault }))
    expect(first.focus).toHaveBeenCalledOnce()
    root.activeElement = first
    await act(() => dialog.props.onKeyDown({ key: 'Tab', shiftKey: true, currentTarget, preventDefault }))
    expect(last.focus).toHaveBeenCalledOnce()
    expect(preventDefault).toHaveBeenCalledTimes(2)
  })

  it('keeps workspace inputs mounted during submission and failure, then closes after success', async () => {
    let rejectSubmission!: (error: Error) => void
    const submit = vi.fn(() => new Promise<{ workspaceId: string }>((_, reject) => {
      rejectSubmission = reject
    }))
    const { renderer } = await mount(empty, { onAction: submit })
    await click(renderer, '添加工作区')
    const form = renderer.root.findByProps({ role: 'dialog' }).findAllByType('form')[0]!
    const nameInput = form.findByProps({ name: 'name' })
    const pathInput = form.findByProps({ name: 'path' })
    const values = { name: '场景设计', path: '/projects/scenes' }
    let pending: Promise<void> | undefined
    await act(async () => {
      pending = form.props.onSubmit({ preventDefault() {}, currentTarget: values })
    })
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1)
    expect(form.findByProps({ type: 'submit' }).props.disabled).toBe(true)
    expect(nameInput.props.readOnly).toBe(true)
    expect(pathInput.props.readOnly).toBe(true)
    await act(async () => {
      void form.props.onSubmit({ preventDefault() {}, currentTarget: values })
    })
    expect(submit).toHaveBeenCalledOnce()
    await act(async () => {
      rejectSubmission(new Error('项目目录不存在，请修改路径。'))
      await pending
    })
    expect(renderer.root.findByProps({ name: 'name' })).toBe(nameInput)
    expect(renderer.root.findByProps({ name: 'path' })).toBe(pathInput)
    expect(nameInput.props.readOnly).toBe(false)
    expect(pathInput.props.readOnly).toBe(false)
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toContain('项目目录不存在，请修改路径。')
    submit.mockResolvedValueOnce({ workspaceId: 'workspace-scenes' })
    await act(async () => {
      await form.props.onSubmit({ preventDefault() {}, currentTarget: values })
    })
    expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'new-workspace', value: values }))
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
  })

  it('keeps a reopened workspace form when its previous request finishes', async () => {
    let finish!: (value: { workspaceId: string }) => void
    const onWorkspaceChange = vi.fn()
    const { renderer } = await mount(empty, {
      onWorkspaceChange,
      onAction: vi.fn(() => new Promise<{ workspaceId: string }>(resolve => { finish = resolve })),
    })
    await click(renderer, '添加工作区')
    const firstForm = renderer.root.findByProps({ role: 'dialog' }).findAllByType('form')[0]!
    let pending: Promise<void> | undefined
    await act(async () => {
      pending = firstForm.props.onSubmit({ preventDefault() {}, currentTarget: { name: '前次提交', path: '/projects/first' } })
    })
    await click(renderer, '取消')
    await click(renderer, '添加工作区')
    const nextName = renderer.root.findByProps({ name: 'name' })
    const nextPath = renderer.root.findByProps({ name: 'path' })
    expect(renderer.root.findByProps({ type: 'submit' }).props.disabled).toBe(false)
    await act(async () => { finish({ workspaceId: 'workspace-created' }); await pending })
    expect(renderer.root.findByProps({ name: 'name' })).toBe(nextName)
    expect(renderer.root.findByProps({ name: 'path' })).toBe(nextPath)
    expect(onWorkspaceChange).not.toHaveBeenCalled()
    expect(readField(renderer.root, '切换工作区')).toBe('workspace-a')
  })

  it('opens the workbench after adding the current workspace from configuration', async () => {
    const { renderer } = await mount(fullProjection(), {
      onAction: vi.fn(async () => ({ workspaceId: 'workspace-a' })),
    })
    await click(renderer, '配置中心')
    await click(renderer, '添加工作区')
    const form = renderer.root.findByProps({ role: 'dialog' }).findAllByType('form')[0]!
    await act(async () => {
      await form.props.onSubmit({ preventDefault() {}, currentTarget: { name: '重复目录', path: '/projects/art' } })
    })
    expect(renderer.root.findByProps({ 'aria-label': '运行结果' }).props.className).toBe('active')
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
  })

  it('numbers the suggested child name across every work and workspace', async () => {
    const data = { ...fullProjection(), total_branch_count: 4, tasks: [], runs: [] }
    data.branches = [data.branches[0]!]
    const { renderer } = await mount(data)
    await click(renderer, '创建子分支')
    expect(renderer.root.findByProps({ name: 'name' }).props.defaultValue).toBe('探索 5')
  })

  it('reveals a child created from a collapsed parent without a Run and displays its inherited input', async () => {
    const data = fullProjection()
    data.tasks = []
    data.runs = []
    const parent = data.branches[0]!
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
      const value = request.value as { name: string; original_request: string }
      data.branches.push({
        ...structuredClone(parent), branch_id: 'created-child', parent_branch_id: parent.branch_id,
        ...value, source_run_id: null, source_artifact_id: null, source_experience_id: null,
      })
      return { workspaceId: data.workspace_id, workId: parent.work_id, branchId: 'created-child' }
    })
    const { renderer } = await mount(data, { onAction })
    await click(renderer, '收起主分支')
    await click(renderer, '创建子分支')
    const dialog = renderer.root.findByProps({ role: 'dialog' })
    expect(nodeText(dialog)).toContain('主分支 · 任务输入')
    expect(dialog.findByProps({ name: 'name' }).props).toMatchObject({ required: true, maxLength: 40 })
    expect(dialog.findByProps({ name: 'goal' }).props).toMatchObject({ required: true, defaultValue: parent.original_request })
    await act(async () => dialog.findAllByType('form')[0]!.props.onSubmit({
      preventDefault() {}, currentTarget: { name: '暖光子分支', goal: parent.original_request },
    }))
    expect(onAction).toHaveBeenCalledWith({
      type: 'create-branch', workspaceId: data.workspace_id, workId: parent.work_id, branchId: parent.branch_id,
      value: { name: '暖光子分支', original_request: parent.original_request },
    })
    expect(renderer.root.findByProps({ 'aria-label': '切换分支 暖光子分支' })).toBeDefined()
    expect(renderer.root.findByProps({ role: 'treeitem', 'aria-selected': true }).props['aria-level']).toBe(2)
    expect(renderer.root.findByProps({ 'aria-label': '收起主分支' })).toBeDefined()
    expect(readField(renderer.root, '分支名称')).toBe('暖光子分支')
    expect(readField(renderer.root, '原始需求')).toBe(parent.original_request)
    expect(readField(renderer.root, '正向提示词')).toBe(parent.draft.prompt_input.positive_prompt)
    expect(renderer.root.findByProps({ className: 'run-strip' }).findAllByType('button')).toHaveLength(0)
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
  })

  it.each(['submission', 'refresh'])('keeps a later branch selection while child creation awaits %s', async stage => {
    const data = fullProjection()
    data.tasks = []
    data.runs = []
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    let submitted = false
    const onAction = vi.fn(async () => {
      if (stage === 'submission') await pending
      data.branches.push({ ...structuredClone(data.branches[0]!), branch_id: 'created-child', parent_branch_id: 'root', name: '新建子分支' })
      submitted = true
      return { workspaceId: data.workspace_id, workId: 'work-a', branchId: 'created-child' }
    })
    const { renderer } = await mount(data, {
      onAction,
      remote: {
        getProjection: async () => {
          if (stage === 'refresh' && submitted) await pending
          return structuredClone(data)
        },
        getEnvironment: async () => functionEnvironment,
      getInputDescription: async () => inputDescription,
      },
    })
    await click(renderer, '创建子分支')
    let submission: Promise<void> | undefined
    await act(async () => {
      submission = renderer.root.findByProps({ role: 'dialog' }).findAllByType('form')[0]!.props.onSubmit({
        preventDefault() {}, currentTarget: { name: '新建子分支', goal: '玻璃花房' },
      })
    })
    await click(renderer, '切换分支 暖光探索')
    await act(async () => { finish(); await submission })
    expect(readField(renderer.root, '分支名称')).toBe('暖光探索')
    expect(nodeText(renderer.root.findByProps({ role: 'treeitem', 'aria-selected': true }))).toContain('暖光探索')
  })

  it('submits workspace, work and child branch forms and supports cancellation', async () => {
    const { renderer, onAction } = await mount(fullProjection())
    for (const [entry, type, values] of [
      ['添加工作区', 'new-workspace', { name: '画面项目', path: '/art' }],
      ['新建工作', 'new-work', { name: '花房', goal: '自然光' }],
      ['从此运行创建分支', 'create-branch', { name: '复验', goal: '保留窗框' }],
    ] as const) {
      await click(renderer, entry)
      const form = renderer.root
        .findByProps({ role: 'dialog' })
        .findAllByType('form')[0]!
      await act(async () =>
        form.props.onSubmit({ preventDefault() {}, currentTarget: values }),
      )
      expect(onAction).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type,
          value:
            type === 'create-branch'
              ? { name: '复验', original_request: '保留窗框' }
              : values,
        }),
      )
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    }
    await click(renderer, '新建工作')
    await click(renderer, '取消')
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    await click(renderer, '添加工作区')
    await click(renderer, '关闭对话框')
    await change(renderer, '切换工作', 'work-b')
    await change(renderer, '切换工作区', 'workspace-a')
    const scroll = renderer.root.findByProps({ className: 'branch-list' })
    await act(() =>
      scroll.props.onScroll({
        currentTarget: { scrollTop: 30, scrollLeft: 0 },
      }),
    )
  })

  it('renders task artifacts and submits replies, adoption, interruption and continuation', async () => {
    const data = fullProjection()
    const task = makeTask('question')
    task.status = 'waiting_input'
    task.input.requested_skill = 'comfyui-generate'
    data.tasks.push(
      task,
      { ...makeTask('running'), status: 'running' },
      { ...makeTask('interrupted'), status: 'interrupted' },
    )
    const artifacts: ArtifactPayload[] = [
      { type: 'question', question: '希望使用哪种光线？', options: ['自然光'] },
      { type: 'prompt', positive_prompt: 'new glass', negative_prompt: '' },
      { type: 'parameters', parameters: { cfg: 4 } },
      { type: 'resources', refs: [{ kind: 'lora', id: '13' }] },
      {
        type: 'review',
        observation: '高光自然',
        conclusion: '符合目标',
        run_ids: ['r2'],
      },
      {
        type: 'experience',
        title: '自然光',
        conditions: '花房',
        note: '降低引导强度',
        base_model_id: '1',
        model_id: '11',
        run_ids: ['r2'],
      },
      {
        type: 'generation_input',
        generation_input: data.branches[0]!.draft.generation_input,
        image_refs: [], workflow_image_bindings: [],
      },
    ]
    data.tasks.push(...artifacts.slice(1).map((artifact, index) => makeTask('artifact-' + (index + 1), 'child',
      artifact.type === 'generation_input' || artifact.type === 'question' ? 'run' : artifact.type === 'iteration_plan' ? 'experiment' : artifact.type)))
    data.artifacts = artifacts.map((artifact, i) => ({
      artifact_id: 'a' + i,
      task_id: i === 0 ? 'question' : 'artifact-' + i,
      type: artifact.type,
      artifact,
      source_files: [],
      session_id: 'session-question',
      turn: 1,
      call_id: 'call',
      skill_refs: [],
      disposition: 'candidate',
      applied_target: null,
      created_at: 1000,
    }))
    const { renderer, onAction } = await mount(data)
    await click(renderer, '任务')
    await act(async () =>
      renderer.root.findByProps({ className: 'task-answer' }).props.onSubmit({
        preventDefault() {},
        currentTarget: { answer: '自然光' },
      }),
    )
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'task-answer',
        taskId: 'question',
        id: 'a0',
        value: '自然光',
      }),
    )
    for (const [index, label] of ['采用提示词', '采用参数', '采用资源', '填入评价', '填入经验'].entries()) {
      await click(renderer, label)
      expect(onAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'task-apply', taskId: 'artifact-' + (index + 1) }),
      )
    }
    await click(renderer, '中断任务')
    await click(renderer, '继续任务')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'task-resume', taskId: 'interrupted' }),
    )
    await click(renderer, '查看运行 r2')
    await click(renderer, '任务')
    await click(renderer, '暖光探索')
    expect(
      renderer.root.findByProps({ 'aria-label': '运行结果' }).props.className,
    ).toBe('active')
  })
})

const catalogItems: readonly CatalogItem[] = [
  {
    baseModelId: '1',
    modelId: null,
    context: { kind: 'model', id: '11', file_name: 'model.safetensors' },
    label: '模型',
    subtitle: '生成模型',
    coverUrl: '/cover.png',
    sampleImageUrls: ['/one.png', '/two.png'],
  },
  {
    baseModelId: null,
    modelId: null,
    context: { kind: 'lora', id: '13', file_name: 'glass.safetensors' },
    label: '玻璃 LoRA',
    subtitle: '玻璃细节',
    coverUrl: null,
    sampleImageUrls: [],
  },
  {
    baseModelId: null,
    modelId: null,
    context: { kind: 'work', id: '14', name: '花房作品' },
    label: '花房作品',
    subtitle: '玻璃建筑',
    coverUrl: '/cover.png',
    sampleImageUrls: ['/one.png'],
  },
  {
    baseModelId: null,
    modelId: null,
    context: {
      kind: 'character',
      id: '15',
      work_name: '作品',
      character_name: '角色',
      prompt_text: 'portrait',
    },
    label: '角色',
    subtitle: '参考角色',
    coverUrl: null,
    sampleImageUrls: [],
  },
  {
    baseModelId: null,
    modelId: null,
    context: {
      kind: 'style',
      id: '16',
      name: '柔光',
      prompt_text: 'soft light',
    },
    label: '柔光',
    subtitle: '画风',
    coverUrl: null,
    sampleImageUrls: [],
  },
  {
    baseModelId: null,
    modelId: null,
    context: { kind: 'prompt-term', id: '17', tag: 'glass' },
    label: 'glass',
    subtitle: '提示词',
    coverUrl: null,
    sampleImageUrls: [],
  },
  {
    baseModelId: null,
    modelId: null,
    context: {
      kind: 'artist-string',
      id: '18',
      title: '画师串',
      prompt_text: 'artist',
    },
    label: '画师串',
    subtitle: '组合',
    coverUrl: null,
    sampleImageUrls: [],
  },
  {
    baseModelId: null,
    modelId: null,
    context: { kind: 'comfyui-template', id: '12', title: '文生图' },
    label: '文生图',
    subtitle: 'Workflow',
    coverUrl: null,
    sampleImageUrls: [],
  },
]
const makeCatalog = (): CatalogApi => ({
  baseModels: vi.fn(async () => ({ items: [{ id: '1', label: 'SDXL' }] })),
  search: vi.fn(async (request) => ({
    ...request,
    items:
      request.query === 'none'
        ? []
        : catalogItems.filter((item) => item.context.kind === request.kind),
    totalCount: request.query === 'none' ? 0 : request.kind === 'model' && request.query === '' && request.modelId === null ? 1 : 50,
  })),
  details: vi.fn(async (request) => ({
    ...request,
    item: { ...catalogItems.find(item => item.context.kind === request.kind)!, context: { ...catalogItems.find(item => item.context.kind === request.kind)!.context, id: request.id } },
    fields: [
      { key: 'file_name', value: 'model.safetensors' },
      { key: 'description', value: ['玻璃', '自然光'] },
    ],
  })),
})


function modelFilterCatalog() {
  const modelsA: CatalogItem[] = Array.from({ length: 10 }, (_, index) => ({
    ...catalogItems[0]!, baseModelId: '1', context: { kind: 'model', id: String(101 + index), file_name: `a-${101 + index}.safetensors` }, label: `A 模型 ${101 + index}`,
  }))
  const modelsB: CatalogItem[] = [{ ...catalogItems[0]!, baseModelId: '2', context: { kind: 'model', id: '201', file_name: 'b-201.safetensors' }, label: 'B 模型 201' }]
  const catalog = makeCatalog()
  vi.mocked(catalog.baseModels).mockResolvedValue({ items: [{ id: '1', label: '底模 A' }, { id: '2', label: '底模 B' }] })
  vi.mocked(catalog.search).mockImplementation(async request => {
    const models = request.baseModelId === '1' ? modelsA : request.baseModelId === '2' ? modelsB : [...modelsA, ...modelsB]
    if (request.kind === 'model') {
      const matches = request.modelId ? models.filter(item => item.context.id === request.modelId) : models
      const items = request.query === 'none' ? [] : matches
      return { ...request, items: items.slice((request.page - 1) * 8, request.page * 8), totalCount: items.length }
    }
    const source = catalogItems.find(item => item.context.kind === request.kind)!
    const items = request.query === 'none' ? [] : [{ ...source, baseModelId: request.baseModelId, label: `${request.modelId || '全部'} ${source.label}` }]
    return { ...request, items, totalCount: items.length }
  })
  return { catalog, modelsA, modelsB }
}

describe('experiment workbench Catalog pagination', () => {
  const paginatedCatalog = () => {
    const catalog = makeCatalog()
    const search = vi.mocked(catalog.search).getMockImplementation()!
    const items: CatalogItem[] = Array.from({ length: 19 }, (_, index) => ({
      ...catalogItems[2]!,
      context: { kind: 'lora', id: String(100 + index), file_name: `lora-${index + 1}.safetensors` },
      label: `LoRA ${index + 1}`,
    }))
    vi.mocked(catalog.search).mockImplementation((request, signal) => {
      if (request.kind !== 'lora') return search(request, signal)
      const matches = request.query === 'light' ? items.slice(0, 4) : request.query === 'none' ? [] : items
      return Promise.resolve({ ...request, items: matches.slice((request.page - 1) * 8, request.page * 8), totalCount: matches.length })
    })
    return catalog
  }

  it('visits every page in Catalog order and retains the last page after reopening', async () => {
    const catalog = paginatedCatalog()
    const data = fullProjection(), originalDrafts = structuredClone(data.branches.map(branch => branch.draft))
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const { renderer, onAction } = await mount(data, { catalog, storage })
    const selected = nodeText(renderer.root.findByProps({ className: 'selected-resources' }))
    await click(renderer, '资源')
    await click(renderer, 'LoRA')
    const assertPage = (page: string, labels: string[], disabled: boolean[]) => {
      expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain(page)
      expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(labels)
      expect(nodeText(renderer.root.findByProps({ className: 'row between catalog-results-head' }))).toContain('19 项')
      expect(renderer.root.findByProps({ className: 'catalog-pagination' }).findAllByType('button').map(button => button.props.disabled)).toEqual(disabled)
      expect(renderer.root.findAllByType('button').filter(button => nodeText(button) === '清除筛选')).toHaveLength(0)
      expect(nodeText(renderer.root.findByProps({ className: 'selected-resources' }))).toBe(selected)
    }
    assertPage('1 / 3', ['LoRA 1', 'LoRA 2', 'LoRA 3', 'LoRA 4', 'LoRA 5', 'LoRA 6', 'LoRA 7', 'LoRA 8'], [true, false])
    await click(renderer, '下一页')
    assertPage('2 / 3', ['LoRA 9', 'LoRA 10', 'LoRA 11', 'LoRA 12', 'LoRA 13', 'LoRA 14', 'LoRA 15', 'LoRA 16'], [false, false])
    await click(renderer, '下一页')
    assertPage('3 / 3', ['LoRA 17', 'LoRA 18', 'LoRA 19'], [false, true])
    await act(() => renderer.unmount())
    const reopened = await mount(data, { catalog, storage })
    expect(nodeText(reopened.renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('3 / 3')
    expect(reopened.renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['LoRA 17', 'LoRA 18', 'LoRA 19'])
    await click(reopened.renderer, '上一页')
    expect(nodeText(reopened.renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('2 / 3')
    await click(reopened.renderer, '上一页')
    expect(nodeText(reopened.renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 3')
    expect(reopened.renderer.root.findByProps({ className: 'catalog-pagination' }).findAllByType('button').map(button => button.props.disabled)).toEqual([true, false])
    expect(nodeText(reopened.renderer.root.findByProps({ className: 'selected-resources' }))).toBe(selected)
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    expect(onAction).not.toHaveBeenCalled()
    expect(reopened.onAction).not.toHaveBeenCalled()
  })

  it.each(['base', 'model', 'search'] as const)('returns to the first page after changing %s', async transition => {
    const { catalog } = modelFilterCatalog()
    const { renderer, onAction } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    await click(renderer, '下一页')
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('2 / 2')
    if (transition === 'base') await change(renderer, '筛选底模', '1')
    if (transition === 'model') await change(renderer, '筛选生成模型', '110')
    if (transition === 'search') {
      await change(renderer, '搜索资源', 'none')
      await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    }
    expect(catalog.search).toHaveBeenCalledWith({
      kind: 'model', query: transition === 'search' ? 'none' : '', page: 1,
      baseModelId: transition === 'base' ? '1' : null, modelId: transition === 'model' ? '110' : null,
    }, expect.any(AbortSignal))
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain(transition === 'base' ? '1 / 2' : '1 / 1')
    expect(renderer.root.findByProps({ className: 'catalog-pagination' }).findAllByType('button')[0]!.props.disabled).toBe(true)
    expect(onAction).not.toHaveBeenCalled()
  })

  it('resets an empty page to the complete first page and retains the selected resources after reopening', async () => {
    const catalog = paginatedCatalog()
    const data = fullProjection(), originalDrafts = structuredClone(data.branches.map(branch => branch.draft))
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const { renderer, onAction } = await mount(data, { catalog, storage })
    const selected = nodeText(renderer.root.findByProps({ className: 'selected-resources' }))
    await click(renderer, '资源')
    await change(renderer, '筛选底模', '1')
    await change(renderer, '筛选生成模型', '11')
    await click(renderer, 'LoRA')
    await click(renderer, '下一页')
    await change(renderer, '搜索资源', 'none')
    await click(renderer, '下一页')
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 1')
    expect(renderer.root.findByProps({ className: 'catalog-pagination' }).findAllByType('button').map(button => button.props.disabled)).toEqual([true, true])
    expect(nodeText(renderer.root.findByProps({ className: 'row between catalog-results-head' }))).toContain('0 项')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['没有匹配的资源'])
    expect(renderer.root.findAllByType('button').filter(button => nodeText(button) === '清除筛选')).toHaveLength(1)
    await click(renderer, '清除筛选')
    expect(readField(renderer.root, '搜索资源')).toBe('')
    expect(catalog.search).toHaveBeenLastCalledWith({ kind: 'lora', query: '', page: 1, baseModelId: null, modelId: null }, expect.any(AbortSignal))
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 3')
    expect(nodeText(renderer.root.findByProps({ className: 'row between catalog-results-head' }))).toContain('19 项')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['LoRA 1', 'LoRA 2', 'LoRA 3', 'LoRA 4', 'LoRA 5', 'LoRA 6', 'LoRA 7', 'LoRA 8'])
    expect(nodeText(renderer.root.findByProps({ className: 'selected-resources' }))).toBe(selected)
    await act(() => renderer.unmount())
    const reopened = await mount(data, { catalog, storage })
    expect(nodeText(reopened.renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 3')
    expect(nodeText(reopened.renderer.root.findByProps({ className: 'row between catalog-results-head' }))).toContain('19 项')
    expect(readField(reopened.renderer.root, '搜索资源')).toBe('')
    expect(nodeText(reopened.renderer.root.findByProps({ className: 'selected-resources' }))).toBe(selected)
    await click(reopened.renderer, '生成模型')
    expect(readField(reopened.renderer.root, '筛选底模')).toBe('')
    expect(readField(reopened.renderer.root, '筛选生成模型')).toBe('')
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    expect(onAction).not.toHaveBeenCalled()
    expect(reopened.onAction).not.toHaveBeenCalled()
  })

  it('keeps text typed while an out-of-range response is being corrected', async () => {
    const catalog = paginatedCatalog()
    const search = vi.mocked(catalog.search).getMockImplementation()!
    let finish!: () => Promise<void>
    vi.mocked(catalog.search).mockImplementation((request, signal) => {
      if (request.kind === 'lora' && request.query === 'light' && request.page === 2) {
        return new Promise(resolve => { finish = async () => resolve(await search(request, signal)) })
      }
      return search(request, signal)
    })
    const { renderer } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    await click(renderer, 'LoRA')
    await change(renderer, '搜索资源', 'light')
    await click(renderer, '下一页')
    await change(renderer, '搜索资源', 'latest draft')
    await act(async () => finish())
    expect(readField(renderer.root, '搜索资源')).toBe('latest draft')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['LoRA 1', 'LoRA 2', 'LoRA 3', 'LoRA 4'])
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 1')
  })

  it('contracts a page-changing pending search and restores its results after reopening', async () => {
    const catalog = paginatedCatalog()
    const data = fullProjection(), originalDrafts = structuredClone(data.branches.map(branch => branch.draft))
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const { renderer, onAction } = await mount(data, { catalog, storage })
    const selected = nodeText(renderer.root.findByProps({ className: 'selected-resources' }))
    await click(renderer, '资源')
    await click(renderer, 'LoRA')
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 3')
    await change(renderer, '搜索资源', 'light')
    await click(renderer, '下一页')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['LoRA 1', 'LoRA 2', 'LoRA 3', 'LoRA 4'])
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 1')
    expect(renderer.root.findByProps({ className: 'catalog-pagination' }).findAllByType('button').map(button => button.props.disabled)).toEqual([true, true])
    expect(nodeText(renderer.root.findByProps({ className: 'row between catalog-results-head' }))).toContain('4 项')
    expect(readField(renderer.root, '搜索资源')).toBe('light')
    expect(nodeText(renderer.root.findByProps({ className: 'selected-resources' }))).toBe(selected)
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    expect(onAction).not.toHaveBeenCalled()
    await act(() => renderer.unmount())
    const reopened = await mount(data, { catalog, storage })
    expect(nodeText(reopened.renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 1')
    expect(reopened.renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['LoRA 1', 'LoRA 2', 'LoRA 3', 'LoRA 4'])
    expect(readField(reopened.renderer.root, '搜索资源')).toBe('light')
  })
})

describe('experiment workbench Catalog search transitions', () => {
  it('saves pending text when a same-workspace action returns a new work and branch', async () => {
    const first = fullProjection()
    const second: WorkbenchProjection = {
      ...first, work_id: 'work-b', total_branch_count: 1,
      branches: [{ ...first.branches[0]!, branch_id: 'returned-root', work_id: 'work-b', name: '返回的主分支', draft: { ...first.branches[0]!.draft, prompt_input: { positive_prompt: 'returned work prompt', negative_prompt: '' } } }],
      tasks: [], runs: [], artifacts: [], experiments: [], experiences: [], favorites: [],
    }
    const originalDrafts = structuredClone([...first.branches, ...second.branches].map(branch => branch.draft))
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const onAction = vi.fn(async () => ({ workspaceId: 'workspace-a', workId: 'work-b', branchId: 'returned-root' }))
    const options: NonNullable<Parameters<typeof mount>[1]> = {
      catalog: makeCatalog(), storage, onAction,
      remote: {
        getProjection: async request => request.workId === 'work-b' ? second : first,
        getEnvironment: async () => functionEnvironment,
        getInputDescription: async () => inputDescription,
      },
    }
    const { renderer } = await mount({ ...first, branches: [...first.branches, ...second.branches] }, options)
    await click(renderer, '资源')
    await change(renderer, '搜索资源', '  returned navigation draft  ')
    await click(renderer, '新建工作')
    await act(async () => renderer.root.findByProps({ role: 'dialog' }).findAllByType('form')[0]!.props.onSubmit({ preventDefault() {}, currentTarget: { name: '返回的工作', goal: '验证返回导航' } }))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'new-work', workspaceId: 'workspace-a' }))
    expect(readField(renderer.root, '切换工作')).toBe('work-b')
    expect(readField(renderer.root, '分支名称')).toBe('返回的主分支')
    expect(readField(renderer.root, '正向提示词')).toBe('returned work prompt')
    await act(() => renderer.unmount())
    const reopened = await mount({ ...first, branches: [...first.branches, ...second.branches] }, options)
    await click(reopened.renderer, '资源')
    expect(readField(reopened.renderer.root, '搜索资源')).toBe('  returned navigation draft  ')
    expect(readField(reopened.renderer.root, '分支名称')).toBe('返回的主分支')
    expect(readField(reopened.renderer.root, '正向提示词')).toBe('returned work prompt')
    expect([...first.branches, ...second.branches].map(branch => branch.draft)).toEqual(originalDrafts)
  })

  it.each(['work', 'branch', 'run'] as const)('saves the pending query before %s navigation and reloads the correct target inputs', async navigation => {
    const first = treeProjection()
    first.runs.find(run => run.run_id === 'warm-r1')!.generation_input.parameters.positive_1 = 'selected run prompt'
    const second: WorkbenchProjection = {
      ...first, work_id: 'work-b', total_branch_count: 1,
      branches: [{ ...first.branches[0]!, branch_id: 'root-b', work_id: 'work-b', name: '另一个工作分支', draft: { ...first.branches[0]!.draft, prompt_input: { positive_prompt: 'second work prompt', negative_prompt: '' } } }],
      tasks: [], runs: [], artifacts: [], experiments: [], experiences: [], favorites: [],
    }
    const originalDrafts = structuredClone([...first.branches, ...second.branches].map(branch => branch.draft))
    const { catalog } = modelFilterCatalog()
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const options: NonNullable<Parameters<typeof mount>[1]> = {
      catalog, storage,
      remote: {
        getProjection: async request => request.workId === 'work-b' ? second : first,
        getEnvironment: async () => functionEnvironment,
        getInputDescription: async () => inputDescription,
      },
    }
    const { renderer, onAction } = await mount({ ...first, branches: [...first.branches, ...second.branches] }, options)
    await click(renderer, '资源')
    await change(renderer, '搜索资源', '  navigation draft  ')
    if (navigation === 'work') await change(renderer, '切换工作', 'work-b')
    if (navigation === 'branch') await click(renderer, '切换分支 暖光')
    if (navigation === 'run') {
      await click(renderer, '查看运行记录')
      const card = renderer.root.findByProps({ 'aria-label': '运行记录' }).findAllByType('article').find(node => nodeText(node).includes('warm-r1'))!
      await act(() => card.findAllByType('button').find(button => nodeText(button) === '查看运行')!.props.onClick())
    }
    expect(readField(renderer.root, '分支名称')).toBe(navigation === 'work' ? '另一个工作分支' : '暖光')
    expect(readField(renderer.root, '正向提示词')).toBe(navigation === 'work' ? 'second work prompt' : navigation === 'run' ? 'selected run prompt' : 'warm prompt')
    await act(() => renderer.unmount())
    const reopened = await mount({ ...first, branches: [...first.branches, ...second.branches] }, options)
    await click(reopened.renderer, '资源')
    expect(readField(reopened.renderer.root, '搜索资源')).toBe('  navigation draft  ')
    expect(readField(reopened.renderer.root, '分支名称')).toBe(navigation === 'work' ? '另一个工作分支' : '暖光')
    expect(readField(reopened.renderer.root, '正向提示词')).toBe(navigation === 'work' ? 'second work prompt' : navigation === 'run' ? 'selected run prompt' : 'warm prompt')
    expect([...first.branches, ...second.branches].map(branch => branch.draft)).toEqual(originalDrafts)
    expect(onAction).not.toHaveBeenCalled()
    expect(reopened.onAction).not.toHaveBeenCalled()
  })

  it('discards unsaved typing on reload and restores each workspace query after navigation', async () => {
    const first = fullProjection()
    const second: WorkbenchProjection = {
      ...first, workspace_id: 'workspace-b', work_id: 'work-b', total_branch_count: 1,
      works: [{ ...first.works[0]!, workspace_id: 'workspace-b', work_id: 'work-b' }],
      branches: [{ ...first.branches[0]!, branch_id: 'root-b', work_id: 'work-b' }],
      tasks: [], runs: [], artifacts: [], experiments: [], experiences: [], favorites: [], functions: [],
    }
    const originalDrafts = structuredClone([...first.branches, ...second.branches].map(branch => branch.draft))
    const catalog = makeCatalog()
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const options: NonNullable<Parameters<typeof mount>[1]> = {
      catalog, storage,
      workspaces: [{ id: 'workspace-a', name: '工作区 A', path: '/projects/a' }, { id: 'workspace-b', name: '工作区 B', path: '/projects/b' }],
      remote: {
        getProjection: async request => request.workspaceId === 'workspace-b' ? second : first,
        getEnvironment: async () => functionEnvironment,
        getInputDescription: async () => inputDescription,
      },
    }
    const initial = await mount({ ...first, branches: [...first.branches, ...second.branches] }, options)
    await click(initial.renderer, '资源')
    await change(initial.renderer, '搜索资源', '  saved A  ')
    await act(async () => initial.renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    await change(initial.renderer, '搜索资源', '  reload draft  ')
    await act(() => initial.renderer.unmount())
    const reopened = await mount({ ...first, branches: [...first.branches, ...second.branches] }, options), renderer = reopened.renderer
    expect(readField(renderer.root, '搜索资源')).toBe('saved A')
    await change(renderer, '搜索资源', '  workspace A draft  ')
    await change(renderer, '切换工作区', 'workspace-b')
    await click(renderer, '资源')
    expect(readField(renderer.root, '搜索资源')).toBe('')
    await change(renderer, '搜索资源', '  saved B  ')
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    await change(renderer, '切换工作区', 'workspace-a')
    expect(readField(renderer.root, '搜索资源')).toBe('  workspace A draft  ')
    expect(catalog.search).toHaveBeenCalledWith(expect.objectContaining({ query: '  workspace A draft  ' }), expect.any(AbortSignal))
    await change(renderer, '切换工作区', 'workspace-b')
    expect(readField(renderer.root, '搜索资源')).toBe('saved B')
    expect([...first.branches, ...second.branches].map(branch => branch.draft)).toEqual(originalDrafts)
    expect(initial.onAction).not.toHaveBeenCalled()
    expect(reopened.onAction).not.toHaveBeenCalled()
  })

  it('retains the final submitted search and selection when an earlier response arrives late', async () => {
    const catalog = makeCatalog(), search = vi.mocked(catalog.search).getMockImplementation()!
    let finishFirst!: () => void
    let firstSignal!: AbortSignal
    vi.mocked(catalog.search).mockImplementation((request, signal) => {
      if (request.kind === 'lora' && request.query === 'first') return new Promise(resolve => {
        firstSignal = signal
        finishFirst = () => resolve({ ...request, items: [{ ...catalogItems[2]!, label: '先发结果' }], totalCount: 1 })
      })
      if (request.kind === 'lora' && request.query === 'last') return Promise.resolve({ ...request, items: [{ ...catalogItems[2]!, label: '最后结果' }], totalCount: 1 })
      return search(request, signal)
    })
    const data = fullProjection(), originalDrafts = structuredClone(data.branches.map(branch => branch.draft))
    const { renderer, onAction } = await mount(data, { catalog })
    const selected = nodeText(renderer.root.findByProps({ className: 'selected-resources' }))
    await click(renderer, '资源')
    await click(renderer, 'LoRA')
    await change(renderer, '搜索资源', 'first')
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    await change(renderer, '搜索资源', 'last')
    expect(firstSignal.aborted).toBe(false)
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    expect(firstSignal.aborted).toBe(false)
    await act(async () => finishFirst())
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['最后结果'])
    expect(readField(renderer.root, '搜索资源')).toBe('last')
    expect(nodeText(renderer.root.findByProps({ className: 'selected-resources' }))).toBe(selected)
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    expect(onAction).not.toHaveBeenCalled()
  })

  it('stages text without querying or saving, trims form submission and restores all records on empty submission', async () => {
    const catalog = makeCatalog()
    const data = fullProjection()
    const originalDrafts = structuredClone(data.branches.map(branch => branch.draft))
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const { renderer, onAction } = await mount(data, { catalog, storage })
    await click(renderer, '资源')
    await click(renderer, 'LoRA')
    const calls = vi.mocked(catalog.search).mock.calls.length
    const saved = [...memory.entries()]
    await change(renderer, '搜索资源', '  glass  ')
    expect(vi.mocked(catalog.search).mock.calls).toHaveLength(calls)
    expect([...memory.entries()]).toEqual(saved)
    expect(renderer.root.findByProps({ className: 'catalog-search' }).findAllByType('button')[0]!.props.type).toBe('submit')
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    expect(catalog.search).toHaveBeenLastCalledWith({ kind: 'lora', query: 'glass', page: 1, baseModelId: null, modelId: null }, expect.any(AbortSignal))
    expect(readField(renderer.root, '搜索资源')).toBe('glass')
    const submittedCalls = vi.mocked(catalog.search).mock.calls.length
    await change(renderer, '搜索资源', '')
    expect(vi.mocked(catalog.search).mock.calls).toHaveLength(submittedCalls)
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['玻璃 LoRA'])
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    expect(vi.mocked(catalog.search).mock.calls).toHaveLength(submittedCalls)
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['玻璃 LoRA'])
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    expect(onAction).not.toHaveBeenCalled()
  })

  it.each(['base', 'model', 'page', 'category'] as const)('applies the current input draft when changing %s', async transition => {
    const { catalog } = modelFilterCatalog()
    const { renderer, onAction } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    await change(renderer, '筛选底模', '1')
    await change(renderer, '搜索资源', '  pending  ')
    if (transition === 'base') await change(renderer, '筛选底模', '2')
    if (transition === 'model') await change(renderer, '筛选生成模型', '101')
    if (transition === 'page') await click(renderer, '下一页')
    if (transition === 'category') await click(renderer, 'LoRA')
    const query = transition === 'category' ? '' : '  pending  '
    expect(readField(renderer.root, '搜索资源')).toBe(query)
    expect(catalog.search).toHaveBeenCalledWith({
      kind: transition === 'category' ? 'lora' : 'model', query,
      page: transition === 'page' ? 2 : 1, baseModelId: transition === 'base' ? '2' : '1', modelId: transition === 'model' ? '101' : null,
    }, expect.any(AbortSignal))
    expect(onAction).not.toHaveBeenCalled()
  })

  it('retains the input draft through page navigation and clears it from the direct LoRA entry', async () => {
    const { catalog } = modelFilterCatalog()
    const { renderer } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    await change(renderer, '搜索资源', '  page draft  ')
    await click(renderer, '任务')
    await click(renderer, '资源')
    expect(readField(renderer.root, '搜索资源')).toBe('  page draft  ')
    expect(catalog.search).toHaveBeenCalledWith(expect.objectContaining({ kind: 'model', query: '  page draft  ' }), expect.any(AbortSignal))
    await change(renderer, '搜索资源', '  direct entry draft  ')
    vi.mocked(catalog.search).mockClear()
    await click(renderer, '添加 LoRA')
    expect(readField(renderer.root, '搜索资源')).toBe('')
    expect(catalog.search).toHaveBeenCalledWith({ kind: 'lora', query: '', page: 1, baseModelId: null, modelId: null }, expect.any(AbortSignal))
    expect(nodeText(renderer.root.findByProps({ className: 'row between catalog-results-head' }))).toContain('LoRA')
  })
})

describe('experiment workbench generation-model filtering', () => {
  it('keeps independent work results visible when model options fail and retries scoped options', async () => {
    const { catalog } = modelFilterCatalog()
    const search = vi.mocked(catalog.search).getMockImplementation()!
    let failModels = true
    vi.mocked(catalog.search).mockImplementation((request, signal) => {
      if (failModels && request.kind === 'model' && request.modelId === null && request.query === '') return Promise.reject(new Error('模型名册不可用'))
      return search(request, signal)
    })
    const { renderer } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    await click(renderer, 'LoRA')
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toContain('模型名册不可用')
    failModels = false
    await click(renderer, '重试')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['全部 玻璃 LoRA'])
    expect(renderer.root.findByProps({ 'aria-label': '筛选生成模型' }).findAllByType('option')).toHaveLength(12)
  })

  it('filters every scoped category through Catalog and preserves Branch inputs across reopening and clearing', async () => {
    const { catalog } = modelFilterCatalog()
    const data = fullProjection()
    const originalDrafts = structuredClone(data.branches.map(branch => branch.draft))
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const mounted = await mount(data, { catalog, storage })
    const { renderer, onAction } = mounted
    await click(renderer, '资源')
    await change(renderer, '筛选底模', '1')
    await click(renderer, '下一页')
    await change(renderer, '筛选生成模型', '110')
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 1')
    for (const [label, kind, name] of [
      ['生成模型', 'model', 'A 模型 110'], ['LoRA', 'lora', '110 玻璃 LoRA'],
      ['Workflow 模板', 'comfyui-template', '110 文生图'],
    ] as const) {
      await click(renderer, label)
      expect(catalog.search).toHaveBeenCalledWith({ kind, query: '', page: 1, baseModelId: '1', modelId: '110' }, expect.any(AbortSignal))
      expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual([name])
      expect(nodeText(renderer.root.findByProps({ className: 'row between catalog-results-head' }))).toContain('1 项')
      expect(readField(renderer.root, '筛选生成模型')).toBe('110')
    }
    expect(onAction).not.toHaveBeenCalled()
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    await act(() => renderer.unmount())
    const reopened = await mount(data, { catalog, storage })
    const current = reopened.renderer
    expect(readField(current.root, '筛选底模')).toBe('1')
    expect(readField(current.root, '筛选生成模型')).toBe('110')
    expect(current.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['110 文生图'])
    await change(current, '筛选底模', '2')
    expect(readField(current.root, '筛选生成模型')).toBe('')
    expect(current.root.findByProps({ 'aria-label': '筛选生成模型' }).findAllByType('option').map(option => option.props.value)).toEqual(['', '201'])
    await change(current, '筛选生成模型', '201')
    await change(current, '搜索资源', 'none')
    await act(async () => current.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    expect(current.root.findAllByType('h3').map(nodeText)).toContain('没有匹配的资源')
    expect(readField(current.root, '筛选底模')).toBe('2')
    expect(readField(current.root, '筛选生成模型')).toBe('201')
    expect(readField(current.root, '搜索资源')).toBe('none')
    await click(current, '清除筛选')
    expect(readField(current.root, '筛选底模')).toBe('')
    expect(readField(current.root, '筛选生成模型')).toBe('')
    expect(readField(current.root, '搜索资源')).toBe('')
    expect(catalog.search).toHaveBeenCalledWith({ kind: 'comfyui-template', query: '', page: 1, baseModelId: null, modelId: null }, expect.any(AbortSignal))
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    expect(reopened.onAction).not.toHaveBeenCalled()
    await click(current, 'LoRA')
    expect(catalog.search).toHaveBeenLastCalledWith({ kind: 'lora', query: '', page: 1, baseModelId: null, modelId: null }, expect.any(AbortSignal))
  })

  it('cancels stale model options and caches delayed resource pages after newer filters', async () => {
    const { catalog } = modelFilterCatalog()
    const search = vi.mocked(catalog.search).getMockImplementation()!
    let delayOptions = true
    const pending: { signal: AbortSignal; finish: () => Promise<void> }[] = []
    vi.mocked(catalog.search).mockImplementation((request, signal) => {
      if (delayOptions && request.baseModelId === '1' && request.kind === 'model' && request.modelId === null || request.modelId === '110') {
        return new Promise(resolve => pending.push({ signal, finish: async () => resolve(await search(request, signal)) }))
      }
      return search(request, signal)
    })
    const { renderer } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    await change(renderer, '筛选底模', '1')
    await change(renderer, '筛选底模', '2')
    expect(pending).toHaveLength(2)
    expect(pending.filter(request => request.signal.aborted)).toHaveLength(1)
    await act(async () => { for (const request of pending.splice(0)) await request.finish() })
    expect(renderer.root.findByProps({ 'aria-label': '筛选生成模型' }).findAllByType('option').map(option => option.props.value)).toEqual(['', '201'])
    delayOptions = false
    await change(renderer, '筛选底模', '1')
    await change(renderer, '筛选生成模型', '110')
    await change(renderer, '筛选生成模型', '101')
    expect(pending.every(request => !request.signal.aborted)).toBe(true)
    await act(async () => { for (const request of pending.splice(0)) await request.finish() })
    expect(readField(renderer.root, '筛选生成模型')).toBe('101')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['A 模型 101'])
    await change(renderer, '筛选生成模型', '110')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['A 模型 110'])
    expect(vi.mocked(catalog.search).mock.calls.filter(([request]) => request.modelId === '110')).toHaveLength(1)
  })

  it('retries a failed model-directory page and exposes the complete options', async () => {
    const { catalog } = modelFilterCatalog()
    const search = vi.mocked(catalog.search).getMockImplementation()!
    let fail = true
    vi.mocked(catalog.search).mockImplementation((request, signal) => {
      if (fail && request.kind === 'model' && request.baseModelId === '1' && request.modelId === null && request.page === 2) {
        fail = false
        return Promise.reject(new Error('模型名册不可用'))
      }
      return search(request, signal)
    })
    const { renderer } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    await click(renderer, 'LoRA')
    await change(renderer, '筛选底模', '1')
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toContain('模型名册不可用')
    expect(renderer.root.findByProps({ 'aria-label': '筛选生成模型' }).findAllByType('option').map(option => option.props.value)).toEqual([''])
    await click(renderer, '重试')
    expect(renderer.root.findByProps({ 'aria-label': '筛选生成模型' }).findAllByType('option').map(option => option.props.value)).toEqual(['', '101', '102', '103', '104', '105', '106', '107', '108', '109', '110'])
  })

  it('loads the complete model options independently of resource category, search and page', async () => {
    const { catalog } = modelFilterCatalog()
    const { renderer } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    await click(renderer, 'LoRA')
    await change(renderer, '筛选底模', '1')
    const optionIds = () => renderer.root.findByProps({ 'aria-label': '筛选生成模型' }).findAllByType('option').map(option => option.props.value)
    expect(optionIds()).toEqual(['', '101', '102', '103', '104', '105', '106', '107', '108', '109', '110'])
    await change(renderer, '搜索资源', 'none')
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    expect(optionIds()).toEqual(['', '101', '102', '103', '104', '105', '106', '107', '108', '109', '110'])
    await click(renderer, 'Workflow 模板')
    expect(optionIds()).toEqual(['', '101', '102', '103', '104', '105', '106', '107', '108', '109', '110'])
    await click(renderer, '生成模型')
    await click(renderer, '下一页')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['A 模型 109', 'A 模型 110'])
    expect(optionIds()).toEqual(['', '101', '102', '103', '104', '105', '106', '107', '108', '109', '110'])
  })
})

describe.each([
  { kind: 'model', label: '生成模型', nameA: 'A 模型', nameB: 'B 模型' },
  { kind: 'lora', label: 'LoRA', nameA: 'A LoRA', nameB: 'B LoRA' },
  { kind: 'comfyui-template', label: 'Workflow 模板', nameA: 'A 模板', nameB: 'B 模板' },
] as const)('experiment workbench $kind base-model filter', ({ kind, label, nameA, nameB }) => {
  const source = catalogItems.find(item => item.context.kind === kind)!
  const itemA: CatalogItem = { ...source, baseModelId: '1', context: { ...source.context, id: '101' }, label: nameA }
  const itemB: CatalogItem = { ...source, baseModelId: '2', context: { ...source.context, id: '201' }, label: nameB }
  const createCatalog = () => {
    const catalog = makeCatalog()
    vi.mocked(catalog.baseModels).mockResolvedValue({ items: [{ id: '1', label: '底模 A' }, { id: '2', label: '底模 B' }] })
    return catalog
  }

  it('queries both base models and restores the filter while preserving the Branch draft', async () => {
    const data = fullProjection()
    const originalDrafts = structuredClone(data.branches.map(branch => branch.draft))
    const catalog = createCatalog()
    vi.mocked(catalog.search).mockImplementation(async request => ({
      ...request,
      items: request.baseModelId === '1' ? [itemA] : request.baseModelId === '2' ? [itemB] : [],
      totalCount: request.baseModelId ? 1 : 0,
    }))
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const { renderer, onAction } = await mount(data, { catalog, storage })
    const inspectorState = () => {
      const inspector = renderer.root.findByProps({ className: 'inspector' })
      return {
        text: nodeText(inspector),
        fields: ['input', 'textarea', 'select'].flatMap(type => inspector.findAllByType(type).map(field => ({
          label: field.props['aria-label'], value: field.props.value, defaultValue: field.props.defaultValue, checked: field.props.checked,
        }))),
      }
    }
    const originalInspector = inspectorState()
    await click(renderer, '资源')
    await click(renderer, label)
    for (const [baseModelId, name] of [['1', nameA], ['2', nameB]] as const) {
      await change(renderer, '筛选底模', baseModelId)
      expect(catalog.search).toHaveBeenLastCalledWith({ kind, query: '', page: 1, baseModelId, modelId: null }, expect.any(AbortSignal))
      expect(readField(renderer.root, '筛选底模')).toBe(baseModelId)
      expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual([name])
      expect(inspectorState()).toEqual(originalInspector)
      expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
      expect(onAction).not.toHaveBeenCalled()
    }
    await act(() => renderer.unmount())
    const reopened = await mount(data, { catalog, storage })
    expect(reopened.renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
    expect(readField(reopened.renderer.root, '筛选底模')).toBe('2')
    expect(reopened.renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual([nameB])
    expect(catalog.search).toHaveBeenLastCalledWith({ kind, query: '', page: 1, baseModelId: '2', modelId: null }, expect.any(AbortSignal))
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    expect(reopened.onAction).not.toHaveBeenCalled()
  })

  it('keeps base-model B visible while a late A response fills the A cache', async () => {
    const catalog = createCatalog()
    let finishA!: () => void
    let signalA!: AbortSignal
    vi.mocked(catalog.search).mockImplementation((request, signal) => {
      if (request.baseModelId === '1') return new Promise(resolve => {
        signalA = signal
        finishA = () => resolve({ ...request, items: [itemA], totalCount: 1 })
      })
      return Promise.resolve({ ...request, items: request.baseModelId === '2' ? [itemB] : [], totalCount: request.baseModelId === '2' ? 1 : 0 })
    })
    const data = fullProjection()
    const originalDrafts = structuredClone(data.branches.map(branch => branch.draft))
    const { renderer, onAction } = await mount(data, { catalog })
    await click(renderer, '资源')
    await click(renderer, label)
    await change(renderer, '筛选底模', '1')
    await change(renderer, '筛选底模', '2')
    expect(signalA.aborted).toBe(false)
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual([nameB])
    await act(async () => finishA())
    expect(readField(renderer.root, '筛选底模')).toBe('2')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual([nameB])
    await change(renderer, '筛选底模', '1')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual([nameA])
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    expect(onAction).not.toHaveBeenCalled()
  })
})


describe('experiment workbench Catalog image availability', () => {
  it.each([
    { coverUrl: null, expected: ['/sample-1.png', '/sample-2.png'] },
    { coverUrl: '/cover.png', expected: ['/cover.png', '/sample-1.png', '/sample-2.png'] },
  ])('previews all available images from the card and details with cover $coverUrl', async ({ coverUrl, expected }) => {
    const catalog = makeCatalog()
    const item = { ...catalogItems[0]!, coverUrl, sampleImageUrls: ['/sample-1.png', '/sample-2.png'] }
    vi.mocked(catalog.search).mockImplementation(async request => ({ ...request, items: [item], totalCount: 1 }))
    const loadDetails = vi.mocked(catalog.details).getMockImplementation()!
    vi.mocked(catalog.details).mockImplementation(async (request, signal) => ({ ...await loadDetails(request, signal), item }))
    const { renderer } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    const preview = renderer.root.findByProps({ 'aria-label': '预览图片 模型' })
    expect(preview.findAllByType('img')[0]!.props.src).toBe(expected[0])
    for (const entry of ['card', 'details']) {
      if (entry === 'details') await click(renderer, '查看详情 模型')
      await click(renderer, '预览图片 模型')
      for (const url of expected) {
        const gallery = renderer.root.findByProps({ className: 'catalog-gallery' })
        expect(gallery.findAllByType('img')[0]!.props.src).toBe(url)
        if (url !== expected.at(-1)) await click(renderer, '下一张图片')
      }
      expect(renderer.root.findByProps({ 'aria-label': '下一张图片' }).props.disabled).toBe(true)
      for (const url of expected.slice(0, -1).reverse()) {
        await click(renderer, '上一张图片')
        expect(renderer.root.findByProps({ className: 'catalog-gallery' }).findAllByType('img')[0]!.props.src).toBe(url)
      }
      expect(renderer.root.findByProps({ 'aria-label': '上一张图片' }).props.disabled).toBe(true)
      await click(renderer, entry === 'card' ? '返回资源列表' : '返回详情')
    }
  })
})


describe('experiment workbench Catalog gallery restoration', () => {
  it('restores each workspace gallery and image through the workspace control', async () => {
    const first = fullProjection()
    const second: WorkbenchProjection = {
      ...first, workspace_id: 'workspace-b', work_id: 'work-b', total_branch_count: 1,
      works: [{ ...first.works[0]!, workspace_id: 'workspace-b', work_id: 'work-b' }],
      branches: [{ ...first.branches[0]!, branch_id: 'root-b', work_id: 'work-b' }],
      tasks: [], runs: [], artifacts: [], experiments: [], experiences: [], favorites: [], functions: [],
    }
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const { renderer } = await mount(first, {
      catalog: (() => { const catalog = makeCatalog(); const load = vi.mocked(catalog.details).getMockImplementation()!, search = vi.mocked(catalog.search).getMockImplementation()!; vi.mocked(catalog.search).mockImplementation(async (request, signal) => request.kind === 'lora' ? { ...request, items: [{ ...catalogItems[1]!, coverUrl: '/glass.png', sampleImageUrls: ['/glass-detail.png'] }], totalCount: 1 } : search(request, signal)); vi.mocked(catalog.details).mockImplementation(async (request, signal) => ({ ...await load(request, signal), item: request.kind === 'lora' ? { ...catalogItems[1]!, coverUrl: '/glass.png', sampleImageUrls: ['/glass-detail.png'] } : (await load(request, signal)).item })); return catalog })(), storage,
      workspaces: [{ id: 'workspace-a', name: '工作区 A', path: '/projects/a' }, { id: 'workspace-b', name: '工作区 B', path: '/projects/b' }],
      remote: { getProjection: async request => request.workspaceId === 'workspace-b' ? second : first, getEnvironment: async () => functionEnvironment, getInputDescription: async () => inputDescription },
    })
    await click(renderer, '资源')
    await click(renderer, '预览图片 模型')
    await click(renderer, '下一张图片')
    await change(renderer, '切换工作区', 'workspace-b')
    await click(renderer, '资源')
    await click(renderer, 'LoRA')
    await click(renderer, '预览图片 玻璃 LoRA')
    await click(renderer, '下一张图片')
    await change(renderer, '切换工作区', 'workspace-a')
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-gallery' }))).toContain('2 / 3')
    expect(renderer.root.findByProps({ className: 'catalog-gallery' }).findAllByType('h3').map(nodeText)).toEqual(['模型'])
    await change(renderer, '切换工作区', 'workspace-b')
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-gallery' }))).toContain('2 / 2')
    expect(renderer.root.findByProps({ className: 'catalog-gallery' }).findAllByType('h3').map(nodeText)).toEqual(['玻璃 LoRA'])
  })

  it('retries a restored gallery source and cancels it when the category changes', async () => {
    const catalog = makeCatalog(), load = vi.mocked(catalog.details).getMockImplementation()!
    const { renderer } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    await click(renderer, '预览图片 模型')
    await click(renderer, '下一张图片')
    await click(renderer, '任务')
    vi.mocked(catalog.details).mockRejectedValueOnce(new Error('详情不可用'))
    await click(renderer, '资源')
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toContain('详情不可用')
    const baseCalls = vi.mocked(catalog.baseModels).mock.calls.length
    const searchCalls = vi.mocked(catalog.search).mock.calls.length
    await click(renderer, '重试')
    expect(catalog.baseModels).toHaveBeenCalledTimes(baseCalls)
    expect(catalog.search).toHaveBeenCalledTimes(searchCalls)
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-gallery' }))).toContain('2 / 3')
    await click(renderer, '任务')
    let finish!: () => Promise<void>, signal!: AbortSignal
    vi.mocked(catalog.details).mockImplementationOnce((request, currentSignal) => {
      signal = currentSignal
      return new Promise(resolve => { finish = async () => resolve(await load(request, currentSignal)) })
    })
    await click(renderer, '资源')
    await click(renderer, 'LoRA')
    expect(signal.aborted).toBe(true)
    await act(async () => finish())
    expect(renderer.root.findAllByProps({ className: 'catalog-gallery' })).toHaveLength(0)
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['玻璃 LoRA'])
  })

  it.each([0, 1])('reconciles a restored gallery after its source changes to %s images', async (count) => {
    const catalog = makeCatalog(), load = vi.mocked(catalog.details).getMockImplementation()!
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const { renderer } = await mount(fullProjection(), { catalog, storage })
    await click(renderer, '资源')
    await click(renderer, '预览图片 模型')
    await click(renderer, '下一张图片')
    await click(renderer, '下一张图片')
    await act(() => renderer.unmount())
    vi.mocked(catalog.details).mockImplementation(async (request, signal) => {
      const details = await load(request, signal)
      return { ...details, item: { ...details.item, coverUrl: count ? '/single.png' : null, sampleImageUrls: [] } }
    })
    const reopened = await mount(fullProjection(), { catalog, storage })
    const saved = JSON.parse(memory.get('harness-comfyui:experiment-workbench:workspace-a')!)
    expect(saved.catalogGallery).toEqual(count ? { kind: 'model', id: '11', index: 0 } : null)
    if (count) {
      expect(nodeText(reopened.renderer.root.findByProps({ className: 'catalog-gallery' }))).toContain('1 / 1')
      expect(reopened.renderer.root.findByProps({ 'aria-label': '上一张图片' }).props.disabled).toBe(true)
      expect(reopened.renderer.root.findByProps({ 'aria-label': '下一张图片' }).props.disabled).toBe(true)
    } else {
      expect(reopened.renderer.root.findAllByProps({ className: 'catalog-gallery' })).toHaveLength(0)
      expect(reopened.renderer.root.findAllByProps({ className: 'catalog-list-panel' })).toHaveLength(1)
    }
  })

  it.each([
    { coverUrl: '/single.png', sampleImageUrls: [] },
    { coverUrl: null, sampleImageUrls: ['/single.png'] },
  ])('shows one image and disables both arrows with cover $coverUrl', async ({ coverUrl, sampleImageUrls }) => {
    const catalog = makeCatalog()
    const item = { ...catalogItems[0]!, coverUrl, sampleImageUrls }
    const search = vi.mocked(catalog.search).getMockImplementation()!, details = vi.mocked(catalog.details).getMockImplementation()!
    vi.mocked(catalog.search).mockImplementation(async (request, signal) => ({ ...await search(request, signal), items: [item], totalCount: 1 }))
    vi.mocked(catalog.details).mockImplementation(async (request, signal) => ({ ...await details(request, signal), item }))
    const { renderer } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    for (const entry of ['card', 'details']) {
      if (entry === 'details') await click(renderer, '查看详情 模型')
      await click(renderer, '预览图片 模型')
      const gallery = renderer.root.findByProps({ className: 'catalog-gallery' })
      expect(gallery.findAllByType('h3').map(nodeText)).toEqual(['模型'])
      expect(nodeText(gallery)).toContain('1 / 1')
      expect(gallery.findAllByType('img')[0]!.props.src).toBe('/single.png')
      expect(renderer.root.findByProps({ 'aria-label': '上一张图片' }).props.disabled).toBe(true)
      expect(renderer.root.findByProps({ 'aria-label': '下一张图片' }).props.disabled).toBe(true)
      await click(renderer, entry === 'details' ? '返回详情' : '返回资源列表')
    }
  })

  it.each(['card', 'details'] as const)('returns from the %s gallery with the saved filters, page and source scroll, then resets scroll on refresh', async (entry) => {
    const catalog = makeCatalog(), data = fullProjection()
    const originalDrafts = structuredClone(data.branches.map(branch => branch.draft))
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const scrollElement = (height: number) => {
      let top = 0
      return {
        clientHeight: 400, scrollHeight: height, scrollLeft: 0, dataset: {},
        get scrollTop() { return top },
        set scrollTop(value: number) { top = Math.max(0, Math.min(value, height - 400)) },
      }
    }
    let element = scrollElement(897)
    const nodeMock = { createNodeMock: (node: { props: Record<string, unknown> }) => node.props.className === 'catalog-content' ? element : null }
    const { renderer, onAction } = await mount(data, { catalog, storage }, nodeMock)
    await click(renderer, '资源')
    await change(renderer, '筛选底模', '1')
    await change(renderer, '筛选生成模型', '11')
    await change(renderer, '搜索资源', 'glass')
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    await click(renderer, '下一页')
    element.scrollTop = 410
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    if (entry === 'details') {
      element = scrollElement(542)
      await click(renderer, '查看详情 模型')
      element.scrollTop = 71
      await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    }
    element = scrollElement(400)
    await click(renderer, '预览图片 模型')
    await click(renderer, '下一张图片')
    expect(element.scrollTop).toBe(0)
    expect(element.scrollHeight - element.clientHeight).toBe(0)
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    const saved = JSON.parse(memory.get('harness-comfyui:experiment-workbench:workspace-a')!)
    const galleryKey = Object.keys(saved.scrollPositions).find(key => key.includes(':gallery:'))!
    expect(galleryKey.endsWith(entry === 'details' ? 'gallery:model:11:model:11' : 'gallery:model:11:list')).toBe(true)
    element = scrollElement(entry === 'details' ? 542 : 897)
    await click(renderer, entry === 'details' ? '返回详情' : '返回资源列表')
    expect(element.scrollTop).toBe(entry === 'details' ? 71 : 410)
    if (entry === 'details') {
      element = scrollElement(897)
      await click(renderer, '返回资源列表')
      expect(element.scrollTop).toBe(410)
    }
    expect(readField(renderer.root, '搜索资源')).toBe('glass')
    expect(readField(renderer.root, '筛选底模')).toBe('1')
    expect(readField(renderer.root, '筛选生成模型')).toBe('11')
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('2 / 7')
    if (entry === 'details') await click(renderer, '查看详情 模型')
    await click(renderer, '预览图片 模型')
    await click(renderer, '下一张图片')
    await act(() => renderer.unmount())
    element = scrollElement(400)
    const reopened = await mount(data, { catalog, storage }, nodeMock)
    expect(nodeText(reopened.renderer.root.findByProps({ className: 'catalog-gallery' }))).toContain('2 / 3')
    element = scrollElement(entry === 'details' ? 542 : 897)
    await click(reopened.renderer, entry === 'details' ? '返回详情' : '返回资源列表')
    expect(element.scrollTop).toBe(0)
    if (entry === 'details') {
      element = scrollElement(897)
      await click(reopened.renderer, '返回资源列表')
      expect(element.scrollTop).toBe(0)
    }
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    expect(onAction).not.toHaveBeenCalled()
    expect(reopened.onAction).not.toHaveBeenCalled()
  })

  it.each(['card', 'details'] as const)('keeps the %s gallery image across pages and refresh while retaining its return source', async (entry) => {
    const catalog = makeCatalog()
    const data = fullProjection(), originalDrafts = structuredClone(data.branches.map(branch => branch.draft))
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const { renderer, onAction } = await mount(data, { catalog, storage })
    await click(renderer, '资源')
    await change(renderer, '搜索资源', 'glass')
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    if (entry === 'details') await click(renderer, '查看详情 模型')
    await click(renderer, '预览图片 模型')
    await click(renderer, '下一张图片')
    const gallery = renderer.root.findByProps({ className: 'catalog-gallery' })
    const image = gallery.findAllByType('img')[0]!.props.src
    expect(nodeText(gallery)).toContain('2 / 3')
    await act(() => { document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' })) })
    expect(renderer.root.findAllByProps({ className: 'catalog-gallery' })).toHaveLength(1)
    await click(renderer, '任务')
    await click(renderer, '资源')
    expect(renderer.root.findByProps({ className: 'catalog-gallery' }).findAllByType('img')[0]!.props.src).toBe(image)
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-gallery' }))).toContain('2 / 3')
    await act(() => renderer.unmount())
    const reopened = await mount(data, { catalog, storage })
    const restored = reopened.renderer.root.findByProps({ className: 'catalog-gallery' })
    expect(restored.findAllByType('img')[0]!.props.src).toBe(image)
    expect(nodeText(restored)).toContain('2 / 3')
    const saved = JSON.parse(memory.get('harness-comfyui:experiment-workbench:workspace-a')!)
    expect(saved.catalogGallery).toEqual({ kind: 'model', id: '11', index: 1 })
    expect(saved.catalogDetail).toEqual(entry === 'details' ? { kind: 'model', id: '11' } : null)
    await click(reopened.renderer, entry === 'details' ? '返回详情' : '返回资源列表')
    await click(reopened.renderer, '预览图片 模型')
    expect(nodeText(reopened.renderer.root.findByProps({ className: 'catalog-gallery' }))).toContain('1 / 3')
    expect(reopened.renderer.root.findByProps({ className: 'catalog-gallery' }).findAllByType('img')[0]!.props.src).toBe('/cover.png')
    await click(reopened.renderer, entry === 'details' ? '返回详情' : '返回资源列表')
    if (entry === 'details') {
      expect(reopened.renderer.root.findAllByProps({ className: 'catalog-detail' })).toHaveLength(1)
      await click(reopened.renderer, '返回资源列表')
    }
    expect(readField(reopened.renderer.root, '搜索资源')).toBe('glass')
    expect(reopened.renderer.root.findByProps({ 'aria-label': '已选择 模型' }).props.disabled).toBe(true)
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    expect(onAction).not.toHaveBeenCalled()
    expect(reopened.onAction).not.toHaveBeenCalled()
  })
})

describe('experiment workbench Catalog removal persistence', () => {
  it.each(['card', 'details'] as const)('toggles LoRA and context from the %s while preserving another LoRA weight', async entry => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture()
    const signal = new AbortController().signal
    try {
      const created = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '资源选择', goal: '验证目录选择' } }, signal)
      const scope = { workspaceId: created.workspaceId, workId: created.workId!, branchId: created.branchId! }
      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'lora', id: '13' } }, signal)
      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'lora', id: '19' } }, signal)
      await setHostField(host, { ...scope, field: 'lora-weight', id: '13', value: 0.35 }, signal)
      await setHostField(host, { ...scope, field: 'lora-weight', id: '19', value: 0.8 }, signal)
      const before = await host.remote.getProjection(scope, signal)
      const onAction = vi.fn((request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => host.remote.mutate(request, signal))
      const { renderer } = await mount(before, {
        workspaceId: scope.workspaceId,
        workspaces: [{ id: scope.workspaceId, name: '资源项目', path: '/workspace/project' }],
        remote: {
          subscribe: (request, streamSignal) => host.remote.subscribe(request, streamSignal),
          getProjection: request => host.remote.getProjection(request, signal),
          getInputDescription: request => host.remote.getInputDescription(request, signal), getRunInput: request => host.remote.getRunInput(request, signal), queryRecords: request => host.remote.queryRecords(request, signal),
          getEnvironment: request => host.remote.getEnvironment(request, signal),
        },
        catalog: makeCatalog(), onAction,
      })
      await click(renderer, '资源')
      await click(renderer, 'LoRA')
      if (entry === 'details') await click(renderer, '查看详情 玻璃 LoRA')
      await click(renderer, '移除 玻璃 LoRA')
      const saved = (await host.remote.getProjection(scope, signal)).branches[0]!.editing_draft!
      expect(saved.generation_input.loras).toEqual([{ id: '19', file_name: 'rain.safetensors', weight: 0.8, trigger_words: ['rain'] }])
      expect(saved.base_model_id).toBe(before.branches[0]!.draft.base_model_id)
      expect(saved.generation_input.parameters).toEqual(before.branches[0]!.draft.generation_input.parameters)
      expect(renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
      expect(renderer.root.findByProps({ 'aria-label': '选择 玻璃 LoRA' }).props['aria-pressed']).toBe(false)
      if (entry === 'details') expect(renderer.root.findByProps({ className: 'catalog-detail' })).toBeDefined()
      expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ ...scope, type: 'resource-remove', id: '13', value: 'lora' }))
      expect(renderer.root.findAllByProps({ className: 'picked-lora' })).toHaveLength(1)
      await click(renderer, '选择 玻璃 LoRA')
      expect(renderer.root.findByProps({ className: 'catalog-content' }).findByProps({ 'aria-label': '移除 玻璃 LoRA' }).props['aria-pressed']).toBe(true)
      expect(renderer.root.findAllByProps({ className: 'picked-lora' })).toHaveLength(2)
      expect((await host.remote.getProjection(scope, signal)).branches[0]!.editing_draft!.generation_input.loras).toEqual([
        { id: '19', file_name: 'rain.safetensors', weight: 0.8, trigger_words: ['rain'] },
        { id: '13', file_name: 'rain.safetensors', weight: 0.65, trigger_words: ['rain'] },
      ])
      await click(renderer, '移除 玻璃 LoRA')
      expect(renderer.root.findAllByProps({ className: 'picked-lora' })).toHaveLength(1)
      expect(renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
      await act(() => renderer.unmount())
    } finally { await host.dispose() }
  })
})

describe('experiment workbench LoRA draft persistence', () => {
  it.each(['loading', 'failure'] as const)('identifies two LoRAs by their saved files during a %s Catalog read', async state => {
    const data = fullProjection(), catalog = makeCatalog()
    data.runs = []
    data.branches[0]!.draft.generation_input.loras = [
      { id: '13', file_name: 'glass.safetensors', weight: 0.35, trigger_words: ['glass'] },
      { id: '19', file_name: 'rain.safetensors', weight: 0.8, trigger_words: ['rain'] },
    ]
    const before = structuredClone(data.branches[0]!.draft), details = vi.mocked(catalog.details).getMockImplementation()!
    const finish: Record<string, () => Promise<void>> = {}
    vi.mocked(catalog.details).mockImplementation((request, signal) => {
      if (request.kind !== 'lora') return details(request, signal)
      if (state === 'failure') return Promise.reject(Error('Catalog LoRA metadata returned HTTP 503.'))
      return new Promise(resolve => {
        finish[request.id] = async () => {
          const result = await details(request, signal)
          resolve({ ...result, item: { ...result.item, label: request.id === '13' ? '玻璃细节' : '雨后光线' } })
        }
      })
    })
    const { renderer, onAction } = await mount(data, { catalog })
    const shownNames = () => renderer.root.findAllByProps({ className: 'picked-lora' }).map(row => row.findAllByType('b').map(nodeText))
    expect(shownNames()).toEqual([['glass.safetensors'], ['rain.safetensors']])
    for (const item of before.generation_input.loras) {
      const weight = renderer.root.findByProps({ 'aria-label': `${item.file_name} 权重` })
      expect(String(weight.props.value)).toBe(String(item.weight))
      expect(weight.props.disabled).not.toBe(true)
      expect(renderer.root.findByProps({ 'aria-label': `移除 ${item.file_name}` }).props.disabled).not.toBe(true)
    }
    if (state === 'failure') expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('Catalog LoRA metadata returned HTTP 503.')
    else {
      await act(async () => finish['19']!())
      expect(shownNames()).toEqual([['glass.safetensors'], ['雨后光线']])
      await act(async () => finish['13']!())
      expect(shownNames()).toEqual([['玻璃细节'], ['雨后光线']])
      expect(String(readField(renderer.root, '玻璃细节 权重'))).toBe('0.35')
      expect(String(readField(renderer.root, '雨后光线 权重'))).toBe('0.8')
    }
    expect(data.branches[0]!.draft).toEqual(before)
    expect(onAction).not.toHaveBeenCalled()
  })

  it('shows Catalog LoRA names separately from stored files and preserves each weight', async () => {
    const data = fullProjection(), catalog = makeCatalog()
    data.runs = []
    data.branches[0]!.draft.generation_input.loras = [
      { id: '13', file_name: 'glass.safetensors', weight: 0.35, trigger_words: ['glass trigger'] },
      { id: '19', file_name: 'rain.safetensors', weight: 0.8, trigger_words: ['rain trigger'] },
    ]
    const before = structuredClone(data.branches[0]!.draft), details = vi.mocked(catalog.details).getMockImplementation()!
    vi.mocked(catalog.details).mockImplementation(async (request, signal) => {
      const result = await details(request, signal)
      if (request.kind !== 'lora') return result
      const item = data.branches[0]!.draft.generation_input.loras.find(item => item.id === request.id)!
      return { ...result, item: { ...result.item, context: { kind: 'lora', id: item.id, file_name: item.file_name }, label: item.id === '13' ? '玻璃细节' : '雨后光线' } }
    })
    const { renderer, onAction } = await mount(data, { catalog })
    const rows = renderer.root.findAllByProps({ className: 'picked-lora' })
    expect(rows.map(row => row.findAllByType('b').map(nodeText))).toEqual([['玻璃细节'], ['雨后光线']])
    expect(String(readField(renderer.root, '玻璃细节 权重'))).toBe('0.35')
    expect(String(readField(renderer.root, '雨后光线 权重'))).toBe('0.8')
    expect(renderer.root.findByProps({ 'aria-label': '移除 玻璃细节' }).props.disabled).not.toBe(true)
    expect(nodeText(rows[0]!)).not.toContain('glass.safetensors')
    expect(nodeText(rows[0]!)).not.toContain('glass trigger')
    expect(data.branches[0]!.draft).toEqual(before)
    expect(onAction).not.toHaveBeenCalled()
  })

  it.each(['success', 'failure'] as const)('keeps the current LoRA identity when an old name arrives after a %s read', async outcome => {
    const data = fullProjection(), catalog = makeCatalog()
    data.runs = []
    data.branches[0]!.draft.generation_input.loras = [{ id: '13', file_name: 'glass.safetensors', weight: 0.35, trigger_words: ['glass'] }]
    data.branches[1]!.draft.generation_input.loras = [{ id: '19', file_name: 'rain.safetensors', weight: 0.8, trigger_words: ['rain'] }]
    const drafts = data.branches.map(branch => structuredClone(branch.draft)), details = vi.mocked(catalog.details).getMockImplementation()!
    let finishA!: () => Promise<void>, signalA!: AbortSignal
    vi.mocked(catalog.details).mockImplementation((request, signal) => {
      if (request.kind !== 'lora') return details(request, signal)
      if (request.id === '13') return new Promise(resolve => {
        signalA = signal
        finishA = async () => { const result = await details(request, signal); resolve({ ...result, item: { ...result.item, label: '玻璃细节' } }) }
      })
      if (outcome === 'failure') return Promise.reject(Error('Catalog LoRA metadata returned HTTP 503.'))
      return details(request, signal).then(result => ({ ...result, item: { ...result.item, label: '雨后光线' } }))
    })
    const { renderer, onAction } = await mount(data, { catalog })
    await click(renderer, '切换分支 暖光探索')
    await click(renderer, '编辑参数')
    const name = outcome === 'success' ? '雨后光线' : 'rain.safetensors'
    const summary = () => renderer.root.findByProps({ className: 'picked-lora' }).findAllByType('b').map(nodeText)
    expect(summary()).toEqual([name])
    expect(signalA.aborted).toBe(true)
    if (outcome === 'failure') expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('Catalog LoRA metadata returned HTTP 503.')
    await act(async () => finishA())
    expect(summary()).toEqual([name])
    expect(String(readField(renderer.root, `${name} 权重`))).toBe('0.8')
    expect(data.branches.map(branch => branch.draft)).toEqual(drafts)
    expect(onAction).not.toHaveBeenCalled()
  })

  it('shows the selected Branch or fixed Run weight and saves an edit only to its Branch', async () => {
    const data = fullProjection(), label = '玻璃 LoRA 权重'
    data.branches[0]!.draft.generation_input.loras[0]!.weight = 0.35
    data.branches[1]!.draft.generation_input.loras[0]!.weight = 0.8
    data.runs[0]!.generation_input.loras[0]!.weight = 0.65
    const originalDrafts = data.branches.map(branch => structuredClone(branch.draft))
    const originalRun = structuredClone(data.runs[0])
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
      if (request.type === 'save-draft')
        data.branches.find(branch => branch.branch_id === request.branchId)!.draft = structuredClone((request.value as unknown as { draft: TaskDraft }).draft)
    })
    const { renderer } = await mount(data, { onAction, catalog: makeCatalog() })
    const shownWeight = () => {
      const input = renderer.root.findAllByProps({ 'aria-label': label })[0]
      return input ? String(input.props.value ?? input.props.defaultValue) : String(readField(renderer.root, 'LoRA')).split(' · ').at(-1)
    }
    expect(shownWeight()).toBe('0.35')
    await click(renderer, '切换分支 暖光探索')
    expect(shownWeight()).toBe('0.8')
    await click(renderer, '切换分支 主分支')
    expect(shownWeight()).toBe('0.35')
    await click(renderer, '查看运行 r1')
    expect(shownWeight()).toBe('0.65')
    await click(renderer, '准备运行')
    expect(shownWeight()).toBe('0.35')
    expect(onAction).not.toHaveBeenCalled()
    await change(renderer, label, '0.45')
    await blur(renderer, label, '0.45')
    expect(shownWeight()).toBe('0.45')
    await click(renderer, '保存参数')
    expect(data.branches[0]!.draft).toEqual({ ...originalDrafts[0], generation_input: { ...originalDrafts[0]!.generation_input, loras: [{ ...originalDrafts[0]!.generation_input.loras[0]!, weight: 0.45 }] } })
    expect(data.branches[1]!.draft).toEqual(originalDrafts[1])
    expect(data.runs[0]).toEqual(originalRun)
    expect(onAction.mock.calls.filter(([request]) => request.type === 'save-draft')).toHaveLength(1)
  })



  it('saves a numeric weight across refresh and removes only the draft while preserving the accepted Run input', async () => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const { parseCliGenerationRequest, toGenerationRequest } = await import('../../src/cli/contract.ts')
    const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
    try {
      const created = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'LoRA 草稿', goal: '保留运行输入' } }, signal)
      const scope = { workspaceId: created.workspaceId, workId: created.workId!, branchId: created.branchId! }
      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      await setHostField(host, { ...scope, field: 'instance_id', value: '8' }, signal)
      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal)
      await setHostField(host, { ...scope, field: 'positive_prompt', value: 'rain on glass' }, signal)
      const before = host.store.getBranch(scope.branchId).draft
      const environment = await host.remote.getEnvironment({}, signal), catalog = makeCatalog()
      const details = vi.mocked(catalog.details).getMockImplementation()!
      vi.mocked(catalog.details).mockImplementation(async (request, readSignal) => request.kind === 'lora' ? {
        ...await details(request, readSignal), fields: [{ key: 'file_name', value: 'rain.safetensors' }, { key: 'trigger_words_json', value: ['rain'] }, { key: 'weight', value: 0.65 }],
      } : details(request, readSignal))
      const memory = new Map<string, string>()
      const options: NonNullable<Parameters<typeof mount>[1]> = {
        workspaceId: scope.workspaceId, workspaces: environment.workspaces, catalog,
        storage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value) } },
        remote: { subscribe: (request, streamSignal) => host.remote.subscribe(request, streamSignal), getEnvironment: request => host.remote.getEnvironment(request, signal), getInputDescription: request => host.remote.getInputDescription(request, signal), getRunInput: request => host.remote.getRunInput(request, signal), queryRecords: request => host.remote.queryRecords(request, signal), getProjection: request => host.remote.getProjection(request, signal) },
        onAction: request => host.remote.mutate(request, signal),
      }
      const { renderer } = await mount(await host.remote.getProjection(scope, signal), options)
      await click(renderer, '添加 LoRA')
      await click(renderer, '查看详情 玻璃 LoRA')
      const shownDetails = renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('dd').map(nodeText)
      expect(shownDetails).toContain('rain.safetensors')
      expect(shownDetails).toContain('rain')
      await click(renderer, '选择 玻璃 LoRA')
      expect(host.store.getBranch(scope.branchId).editing_draft!.generation_input.loras).toEqual([{ id: '13', file_name: 'rain.safetensors', weight: 0.65, trigger_words: ['rain'] }])
      await click(renderer, '保存参数')
      await click(renderer, '运行任务')
      const task = (await host.remote.getProjection(scope, signal)).tasks[0]!
      const accepted = await host.runtime.acceptGenerations({ workspaceId: scope.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'lora-history' }, [{ requestId: crypto.randomUUID(), request: toGenerationRequest(parseCliGenerationRequest(task.input.generation_input)) }], signal, task.task_id)
      const runId = accepted.items[0]!.runId
      await click(renderer, '编辑参数')
      await blur(renderer, '玻璃 LoRA 权重', '0.35')
      await click(renderer, '保存参数')
      const saved = await host.remote.getProjection(scope, signal)
      expect(saved.branches[0]!.draft.generation_input.loras[0]!.weight).toBe(0.35)
      const fixedRun = saved.runs.find(run => run.run_id === runId)!
      expect(fixedRun.generation_input.loras[0]!.weight).toBe(0.65)
      await act(() => renderer.unmount())
      const reopened = await mount(saved, options)
      const weight = reopened.renderer.root.findByProps({ 'aria-label': '玻璃 LoRA 权重' })
      expect(String(weight.props.value ?? weight.props.defaultValue)).toBe('0.35')
      await click(reopened.renderer, '移除 玻璃 LoRA')
      await click(reopened.renderer, '保存参数')
      const removed = await host.remote.getProjection(scope, signal)
      expect(removed.branches[0]!.draft).toEqual(before)
      expect(removed.runs.find(run => run.run_id === runId)).toEqual(fixedRun)
      expect(reopened.renderer.root.findAllByProps({ className: 'picked-lora' })).toHaveLength(0)
      await click(reopened.renderer, '运行结果')
      await click(reopened.renderer, `查看运行 ${runId}`)
      expect(String(readField(reopened.renderer.root, 'LoRA'))).toContain(' · 0.65')
      await click(reopened.renderer, '准备运行')
      expect(reopened.renderer.root.findAllByProps({ className: 'picked-lora' })).toHaveLength(0)
      expect(host.store.getBranch(scope.branchId).draft).toEqual(before)
      await act(() => reopened.renderer.unmount())
    } finally { await host.dispose() }
  })
})

describe('experiment workbench selected template names', () => {
  const items: CatalogItem[] = [
    { baseModelId: '1', modelId: null, context: { kind: 'comfyui-template', id: '43', title: '模板 A' }, label: '模板 A', subtitle: '', coverUrl: null, sampleImageUrls: [] },
    { baseModelId: '1', modelId: null, context: { kind: 'comfyui-template', id: '41', title: '模板 B' }, label: '模板 B', subtitle: '', coverUrl: null, sampleImageUrls: [] },
  ]
  const templateCatalog = () => {
    const catalog = makeCatalog(), search = vi.mocked(catalog.search).getMockImplementation()!, details = vi.mocked(catalog.details).getMockImplementation()!
    vi.mocked(catalog.search).mockImplementation(async (request, signal) => request.kind === 'comfyui-template' ? { ...request, items, totalCount: items.length } : search(request, signal))
    vi.mocked(catalog.details).mockImplementation(async (request, signal) => ({
      ...await details(request, signal), item: items.find(item => item.context.id === request.id) ?? catalogItems.find(item => item.context.kind === request.kind)!,
    }))
    return catalog
  }
  const templateSummary = (renderer: { root: RenderNode }) =>
    renderer.root.findByProps({ className: 'selected-resources' }).findAllByProps({ className: 'picked-item' })[1]!.findAllByType('b').map(nodeText)

  const templateDescription = (id: string, steps: number): typeof inputDescription => ({
    parameters: inputDescription.parameters.map(parameter => ({
      ...parameter, parameter_id: `${parameter.kind}_${id}`,
      current_value: parameter.kind === 'steps' ? steps : parameter.current_value,
    })),
    size_candidates: [{
      candidate_id: `size_${id}`, representation: 'width_height',
      width: { parameter_id: `width_${id}`, kind: 'width', value_type: 'integer', current_value: 1024, minimum: 256, maximum: 2048 },
      height: { parameter_id: `height_${id}`, kind: 'height', value_type: 'integer', current_value: 768, minimum: 256, maximum: 2048 },
    }],
  })





  it('disables pending and undeclared B controls without retaining A parameters through the public Host', async () => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
    const a = templateDescription('a', 24), baseB = templateDescription('b', 48)
    const b = { ...baseB, parameters: baseB.parameters.filter(parameter => ['positive_prompt', 'negative_prompt', 'seed'].includes(parameter.kind)), size_candidates: [] }
    host.inspect.mockImplementation(async (...args: unknown[]) => structuredClone((args[0] as { templateId: string }).templateId === '43' ? a : b))
    let releaseB = () => {}, waitForB = true
    try {
      const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '模板字段', goal: '切换可用参数' } }, signal)
      const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      await setHostField(host, { ...scope, field: 'instance_id', value: '8' }, signal)
      await setHostField(host, { ...scope, field: 'positive_prompt', value: 'shared prompt' }, signal)
      const environment = await host.remote.getEnvironment({}, signal)
      const onAction = vi.fn((request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => host.remote.mutate(request, signal))
      const options: NonNullable<Parameters<typeof mount>[1]> = {
        catalog: templateCatalog(), workspaceId: scope.workspaceId, workspaces: environment.workspaces, onAction,
        remote: {
          subscribe: (request, streamSignal) => host.remote.subscribe(request, streamSignal),
          getEnvironment: request => host.remote.getEnvironment(request, signal), getProjection: request => host.remote.getProjection(request, signal),
          getInputDescription: async request => {
            const description = await host.remote.getInputDescription(request, signal)
            if (waitForB && host.store.getBranch(request.branchId).editing_draft?.generation_input.template_id === '41')
              return new Promise<typeof description>(resolve => { releaseB = () => resolve(description) })
            return description
          },
        },
      }
      const { renderer } = await mount(await host.remote.getProjection(scope, signal), options)
      await click(renderer, '选择 Workflow 模板')
      await click(renderer, '选择 模板 A')
      await click(renderer, '选择 模板 B')
      const labels = ['采样步数', '引导强度', 'Seed', '画面尺寸']
      const disabledWhileLoading = labels.map(label => renderer.root.findByProps({ 'aria-label': label }).props.disabled)
      waitForB = false
      await act(async () => releaseB())
      const expectedParameters = Object.fromEntries(b.parameters.map(parameter => [parameter.parameter_id, parameter.current_value]))
      expect(host.store.getBranch(scope.branchId).editing_draft!.generation_input.parameters).toEqual(expectedParameters)
      expect(readField(renderer.root, 'Seed')).toBe('0')
      expect(renderer.root.findByProps({ 'aria-label': 'Seed' }).props.disabled).not.toBe(true)
      for (const label of ['采样步数', '引导强度', '画面尺寸']) {
        const input = renderer.root.findByProps({ 'aria-label': label })
        expect(input.props.value).toBe('')
        expect(input.props.disabled).toBe(true)
      }
      expect(disabledWhileLoading).toEqual(labels.map(() => true))
      expect(readField(renderer.root, '正向提示词')).toBe('shared prompt')
      expect(onAction).toHaveBeenCalledTimes(2)
      await act(() => renderer.unmount())
      const reopened = await mount(await host.remote.getProjection(scope, signal), options)
      expect(reopened.renderer.root.findByProps({ 'aria-label': '采样步数' }).props.disabled).toBe(true)
      expect(readField(reopened.renderer.root, 'Seed')).toBe('0')
      expect(host.store.getBranch(scope.branchId).editing_draft!.generation_input.parameters).toEqual(expectedParameters)
      await act(() => reopened.renderer.unmount())
    } finally { releaseB(); await host.dispose() }
  })

  it('shows selected A and B Catalog names and restores B after refresh through the public Host', async () => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
    try {
      const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '模板名称', goal: '读取目录名称' } }, signal)
      const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      const environment = await host.remote.getEnvironment({}, signal)
      const catalog = templateCatalog(), memory = new Map<string, string>()
      const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
      const options: NonNullable<Parameters<typeof mount>[1]> = {
        catalog, storage, workspaceId: scope.workspaceId, workspaces: environment.workspaces,
        remote: { subscribe: (request, streamSignal) => host.remote.subscribe(request, streamSignal), getEnvironment: request => host.remote.getEnvironment(request, signal), getInputDescription: request => host.remote.getInputDescription(request, signal), getRunInput: request => host.remote.getRunInput(request, signal), queryRecords: request => host.remote.queryRecords(request, signal), getProjection: request => host.remote.getProjection(request, signal) },
        onAction: request => host.remote.mutate(request, signal),
      }
      const data = await host.remote.getProjection(scope, signal)
      const { renderer } = await mount(data, options)
      expect(templateSummary(renderer)).toEqual(['未选择'])
      await click(renderer, '选择 Workflow 模板')
      await click(renderer, '选择 模板 A')
      expect(templateSummary(renderer)).toEqual(['模板 A'])
      await click(renderer, '选择 模板 B')
      expect(templateSummary(renderer)).toEqual(['模板 B'])
      expect(renderer.root.findAllByProps({ className: 'catalog-detail' })).toHaveLength(0)
      expect(host.store.getBranch(scope.branchId).editing_draft!.generation_input.template_id).toBe('41')
      await act(() => renderer.unmount())
      const reopened = await mount(data, options)
      expect(templateSummary(reopened.renderer)).toEqual(['模板 B'])
      expect(catalog.details).toHaveBeenCalledWith({ kind: 'comfyui-template', id: '41' }, expect.any(AbortSignal))
      await act(() => reopened.renderer.unmount())
    } finally { await host.dispose() }
  })

  it('shows a Catalog failure toast while preserving the selected template and draft after an old label returns late', async () => {
    const catalog = templateCatalog(), details = vi.mocked(catalog.details).getMockImplementation()!
    let finishA!: () => Promise<void>, failB!: (reason: Error) => void
    vi.mocked(catalog.details).mockImplementation((request, signal) => request.id === '43'
      ? new Promise(resolve => { finishA = async () => resolve(await details(request, signal)) })
      : request.id === '41' ? new Promise((_resolve, reject) => { failB = reject }) : details(request, signal))
    const data = fullProjection()
    data.runs = []
    data.branches[0]!.draft.generation_input.template_id = '43'
    const expectedDraft = structuredClone(data.branches[0]!.draft)
    expectedDraft.generation_input.template_id = '41'
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
      if (request.type === 'resource-select') data.branches[0]!.draft.generation_input.template_id = (request.value as { id: string }).id
    })
    const { renderer } = await mount(data, { catalog, onAction })
    await click(renderer, '选择 Workflow 模板')
    await click(renderer, '选择 模板 B')
    await act(async () => failB(new Error('Catalog template metadata returned HTTP 503.')))
    const toast = nodeText(renderer.root.findByProps({ className: 'toast' }))
    expect(toast).toContain('Catalog template metadata returned HTTP 503.')
    expect(templateSummary(renderer)).toEqual(['41'])
    expect(data.branches[0]!.draft).toEqual(expectedDraft)
    expect(readField(renderer.root, '正向提示词')).toBe(expectedDraft.prompt_input.positive_prompt)
    await act(async () => finishA())
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toBe(toast)
    expect(templateSummary(renderer)).toEqual(['41'])
    expect(data.branches[0]!.draft).toEqual(expectedDraft)
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('cancels an old selected-template label request and keeps B after A returns late', async () => {
    const catalog = templateCatalog(), details = vi.mocked(catalog.details).getMockImplementation()!
    let finishA!: () => Promise<void>, signalA!: AbortSignal
    vi.mocked(catalog.details).mockImplementation((request, signal) => request.id === '43'
      ? new Promise(resolve => { signalA = signal; finishA = async () => resolve(await details(request, signal)) })
      : details(request, signal))
    const data = fullProjection()
    data.runs = []
    data.branches[0]!.draft.generation_input.template_id = '43'
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
      if (request.type === 'resource-select') data.branches[0]!.draft.generation_input.template_id = (request.value as { id: string }).id
    })
    const { renderer } = await mount(data, { catalog, onAction })
    await click(renderer, '选择 Workflow 模板')
    await click(renderer, '选择 模板 B')
    expect(templateSummary(renderer)).toEqual(['模板 B'])
    expect(signalA.aborted).toBe(true)
    await act(async () => finishA())
    expect(templateSummary(renderer)).toEqual(['模板 B'])
  })
})

describe('experiment workbench direct generation model selection', () => {
  it('selects another model immediately and keeps the resource directory open without a removal dialog', async () => {
    const data = fullProjection(), before = structuredClone(data.branches[0]!.draft)
    const catalog = makeCatalog()
    const model: CatalogItem = { ...catalogItems[0]!, context: { kind: 'model', id: '21', file_name: 'anima.safetensors' }, baseModelId: '2', label: 'ANIMA3' }
    vi.mocked(catalog.search).mockImplementation(async request => ({
      ...request, items: request.kind === 'model' ? [model] : [], totalCount: request.kind === 'model' ? 1 : 0,
    }))
    const { renderer, onAction } = await mount(data, { catalog })
    await click(renderer, '更换生成模型')
    await click(renderer, '选择 ANIMA3')
    expect(onAction).toHaveBeenCalledExactlyOnceWith({
      type: 'resource-select', workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root', id: '21',
      value: { kind: 'model', id: '21' },
    })
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toEqual([])
    expect(renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
    expect(data.branches[0]!.draft).toEqual(before)
  })
})

describe('experiment workbench generation model selection', () => {
  it('persists a cross-base model and its summary while retaining templates, parameters, LoRAs, context and the run Agent model', async () => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture()
    const signal = new AbortController().signal
    const records = [
      { id: '9', file_name: 'anima-preview3-base.safetensors', base_model_id: '1' },
      { id: '16', file_name: 'miaomiaoHarem_anima16.safetensors', base_model_id: '2' },
    ]
    const items: CatalogItem[] = records.map(record => ({
      context: { kind: 'model', id: record.id, file_name: record.file_name }, baseModelId: record.base_model_id, modelId: null,
      label: record.file_name, subtitle: '', coverUrl: null, sampleImageUrls: [],
    }))
    const catalog: CatalogApi = {
      baseModels: vi.fn(async () => ({ items: [{ id: '1', label: 'anima' }, { id: '2', label: 'SDXL' }] })),
      search: vi.fn(async request => {
        const matches = request.kind === 'model' ? items.filter(item => (!request.baseModelId || item.baseModelId === request.baseModelId) && (!request.modelId || item.context.id === request.modelId)) : []
        return { ...request, items: matches, totalCount: matches.length }
      }),
      details: makeCatalog().details,
    }
    try {
      host.catalog.resolveGenerationModel.mockImplementation(async id => {
        const record = records.find(record => record.id === id)
        if (!record) throw new Error('Model record is unavailable.')
        return record
      })
      const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '模型选择', goal: '保留其他输入' } }, signal)
      const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
      const branch = host.store.getBranch(scope.branchId)
      const seeded = {
        ...branch.draft, base_model_id: '1', prompt_input: { positive_prompt: 'rain on glass', negative_prompt: 'blur' },
        generation_input: { ...branch.draft.generation_input, title: '原输入', instance_id: '8', template_id: '5', model: { id: '9', file_name: records[0]!.file_name },
          parameters: { width: 768, height: 1024, seed: 42, steps: 30, cfg: 3, reference: '/reference.png' },
          loras: [{ id: '3', file_name: 'rain.safetensors', weight: 0.35, trigger_words: ['rain'] }] },
        reference_task_ids: [], reference_run_ids: [], reference_experiences: [], image_refs: [], workflow_image_bindings: [], instructions: '',
      }
      host.store.saveBranchDraft({ ...scope, expected: branch.draft, draft: seeded })
      const before = host.store.getBranch(scope.branchId)
      const bindingsBefore = structuredClone(host.store.listFunctionBindings(scope.workspaceId))
      const run = bindingsBefore.find(binding => binding.kind === 'run')!
      const environment = await host.remote.getEnvironment({}, signal)
      const memory = new Map<string, string>()
      const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
      const options: NonNullable<Parameters<typeof mount>[1]> = {
        catalog, storage, workspaceId: scope.workspaceId, workspaces: environment.workspaces, instances: environment.instances, presets: environment.presets,
        baseModels: [{ id: '1', label: 'anima' }, { id: '2', label: 'SDXL' }],
        agentModelGroups: [{ id: run.agent_model.provider, name: '提供商 A', models: [{ id: run.agent_model.model, name: 'Agent 模型 A' }] }],
        remote: { subscribe: (request, streamSignal) => host.remote.subscribe(request, streamSignal), getEnvironment: request => host.remote.getEnvironment(request, signal), getInputDescription: request => host.remote.getInputDescription(request, signal), getRunInput: request => host.remote.getRunInput(request, signal), queryRecords: request => host.remote.queryRecords(request, signal), getProjection: request => host.remote.getProjection(request, signal) },
        onAction: request => host.remote.mutate(request, signal),
      }
      const data = await host.remote.getProjection(scope, signal)
      const { renderer } = await mount(data, options)
      await click(renderer, '更换生成模型')
      await change(renderer, '筛选底模', '')
      await click(renderer, '选择 miaomiaoHarem_anima16.safetensors')
      expect(renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
      const picked = renderer.root.findByProps({ className: 'selected-resources' }).findAllByProps({ className: 'picked-item' })[0]!
      expect(picked.findAllByType('b').map(nodeText)).toEqual([records[1]!.file_name])
      expect(picked.findAllByType('span').map(nodeText)).toEqual(['生成模型 · SDXL'])
      const expected = { ...before, editing_draft: { ...seeded, base_model_id: '2', generation_input: { ...seeded.generation_input, model: { id: '16', file_name: records[1]!.file_name } } } }
      expect(host.store.getBranch(scope.branchId)).toEqual(expected)
      expect(host.store.listFunctionBindings(scope.workspaceId)).toEqual(bindingsBefore)
      await click(renderer, '返回结果')
      expect(renderer.root.findByProps({ 'aria-label': '运行结果' }).props.className).toBe('active')
      await act(() => renderer.unmount())
      const reopened = await mount(data, options)
      const restored = reopened.renderer.root.findByProps({ className: 'selected-resources' }).findAllByProps({ className: 'picked-item' })[0]!
      expect(restored.findAllByType('b').map(nodeText)).toEqual([records[1]!.file_name])
      expect(restored.findAllByType('span').map(nodeText)).toEqual(['生成模型 · SDXL'])
      await click(reopened.renderer, '配置中心')
      await click(reopened.renderer, `编辑${run.name}`)
      expect(readField(reopened.renderer.root, 'Agent 提供商')).toBe(run.agent_model.provider)
      expect(readField(reopened.renderer.root, 'Agent 模型')).toBe(run.agent_model.model)
      expect(host.store.listFunctionBindings(scope.workspaceId)).toEqual(bindingsBefore)
      expect(host.store.getBranch(scope.branchId)).toEqual(expected)
      const projection = await host.remote.getProjection(scope, signal)
      expect(projection.tasks).toEqual([])
      expect(projection.runs).toEqual([])
      await act(() => reopened.renderer.unmount())
    } finally { await host.dispose() }
  })

  it('opens model replacement with all base models and clears the previous model filter', async () => {
    const { catalog } = modelFilterCatalog(), data = fullProjection()
    data.branches[0]!.draft.base_model_id = '1'
    const { renderer } = await mount(data, { catalog })
    await click(renderer, '资源')
    await change(renderer, '筛选底模', '2')
    await change(renderer, '筛选生成模型', '201')
    await click(renderer, '更换生成模型')
    expect(readField(renderer.root, '筛选底模')).toBe('')
    expect(readField(renderer.root, '筛选生成模型')).toBe('')
    expect(catalog.search).toHaveBeenCalledWith({ kind: 'model', query: '', page: 1, baseModelId: null, modelId: null }, expect.any(AbortSignal))
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 2')
  })
})

describe('experiment workbench resource cards', () => {
  it('shows the selected model and opens the cover gallery separately from details', async () => {
    const { renderer } = await mount(fullProjection(), { catalog: makeCatalog() })
    await click(renderer, '资源')
    const card = renderer.root.findAllByType('article').find(node => node.props.className === 'catalog-card chosen')!
    expect(card.findAllByType('small').map(nodeText)).toContain('SDXL')
    expect(card.findByProps({ className: 'pill' }).children.map(String).join('')).toContain('已选')
    expect(card.findByProps({ title: '模型' })).toBeDefined()
    const buttons = card.findAllByType('button')
    expect(buttons.slice(1).map(nodeText)).toEqual(['已选择', '查看详情'])
    expect(buttons[1]!.props).toMatchObject({ 'aria-label': '已选择 模型', 'aria-pressed': true, disabled: true })
    await click(renderer, '预览图片 模型')
    expect(renderer.root.findByProps({ className: 'catalog-gallery' })).toBeDefined()
    expect(renderer.root.findAllByType('img').some(node => node.props.src === '/cover.png')).toBe(true)
    await click(renderer, '返回资源列表')
    await click(renderer, '查看详情 模型')
    expect(renderer.root.findByProps({ className: 'catalog-detail' })).toBeDefined()
    await click(renderer, '返回资源列表')
    await click(renderer, 'LoRA')
    const loraCard = renderer.root.findAllByType('article').find(node => node.props.className === 'catalog-card chosen')!
    expect(loraCard.findByProps({ className: 'catalog-cover no-cover' })).toBeDefined()
    expect(loraCard.findAllByType('button').map(nodeText)).toEqual(['移除', '查看详情'])
  })
})

describe('experiment workbench Catalog delayed scroll restoration', () => {
  const scrollElement = (initialHeight: number) => {
    let height = initialHeight, top = 0
    const element = {
      clientHeight: 400,
      get scrollHeight() { return height },
      get scrollTop() { return top },
      set scrollTop(value: number) { top = Math.max(0, Math.min(value, height - element.clientHeight)) },
      setContentHeight(value: number) {
        height = value
        element.scrollTop = top
      },
      scrollLeft: 0,
      dataset: {},
    }
    return element
  }

  it('restores a saved list after its delayed query creates the scroll range', async () => {
    const { catalog } = modelFilterCatalog(), search = vi.mocked(catalog.search).getMockImplementation()!
    let pending = false, finish!: () => Promise<void>
    vi.mocked(catalog.search).mockImplementation((request, signal) => {
      if (pending && request.query === 'A') return new Promise(resolve => { finish = async () => resolve(await search(request, signal)) })
      return search(request, signal)
    })
    const data = fullProjection(), memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    let element = scrollElement(1400)
    const nodeMock = { createNodeMock: (node: { props: Record<string, unknown> }) => node.props.className === 'catalog-content' ? element : null }
    const { renderer } = await mount(data, { catalog, storage }, nodeMock)
    await click(renderer, '资源')
    await change(renderer, '筛选底模', '1')
    await change(renderer, '搜索资源', 'A')
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    element.scrollTop = 142
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    await act(() => renderer.unmount())
    pending = true
    element = scrollElement(400)
    const reopened = await mount(data, { catalog, storage }, nodeMock)
    await act(() => reopened.renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    element.setContentHeight(1400)
    await act(async () => finish())
    expect(reopened.renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3')).toHaveLength(8)
    expect(element.scrollTop).toBe(142)
  })

  it.each(['base-models', 'model-options'])('retains list scroll through a failed %s source and retry', async (source) => {
    const catalog = makeCatalog(), search = vi.mocked(catalog.search).getMockImplementation()!
    let modelsFail = false
    vi.mocked(catalog.search).mockImplementation((request, signal) => {
      if (modelsFail && request.kind === 'model') return Promise.reject(new Error('模型选项不可用'))
      return search(request, signal)
    })
    let element = scrollElement(1400)
    const { renderer } = await mount(fullProjection(), { catalog }, { createNodeMock: node => node.props.className === 'catalog-content' ? element : null })
    await click(renderer, '资源')
    await click(renderer, 'LoRA')
    element.scrollTop = 142
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    await click(renderer, '任务')
    if (source === 'base-models') vi.mocked(catalog.baseModels).mockRejectedValueOnce(new Error('底模不可用'))
    else modelsFail = true
    element = scrollElement(400)
    await click(renderer, '资源')
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toContain(source === 'base-models' ? '底模不可用' : '模型选项不可用')
    const errorWasRestored = 'restored' in element.dataset
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    modelsFail = false
    element.setContentHeight(1400)
    await click(renderer, '重试')
    expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(0)
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3')).toHaveLength(1)
    expect(element.scrollTop).toBe(142)
    expect(errorWasRestored).toBe(false)
  })

  it('waits for the base-model row before restoring the detail scroll range', async () => {
    const catalog = makeCatalog(), loadBases = vi.mocked(catalog.baseModels).getMockImplementation()!
    let pending = false, finish!: () => Promise<void>
    vi.mocked(catalog.baseModels).mockImplementation(async signal => {
      const result = await loadBases(signal)
      return pending ? new Promise(resolve => { finish = async () => resolve(result) }) : result
    })
    let element = scrollElement(563)
    const { renderer } = await mount(fullProjection(), { catalog }, { createNodeMock: node => node.props.className === 'catalog-content' ? element : null })
    await click(renderer, '资源')
    await click(renderer, '查看详情 模型')
    element.scrollTop = 142
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    await click(renderer, '任务')
    pending = true
    element = scrollElement(520)
    await click(renderer, '资源')
    expect(renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('dt').map(nodeText)).not.toContain('底模')
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    element.setContentHeight(563)
    await act(async () => finish())
    expect(renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('dd').map(nodeText)).toContain('SDXL')
    expect(element.scrollTop).toBe(142)
  })

  it('reports a failed detail base-model source and restores saved scroll after retrying that source', async () => {
    const catalog = makeCatalog()
    let element = scrollElement(1400)
    const { renderer } = await mount(fullProjection(), { catalog }, { createNodeMock: node => node.props.className === 'catalog-content' ? element : null })
    await click(renderer, '资源')
    await click(renderer, '查看详情 模型')
    element.scrollTop = 142
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    await click(renderer, '任务')
    vi.mocked(catalog.baseModels).mockRejectedValueOnce(new Error('底模不可用'))
    element = scrollElement(400)
    await click(renderer, '资源')
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toContain('底模不可用')
    expect(element.dataset).not.toHaveProperty('restored')
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    const detailCalls = vi.mocked(catalog.details).mock.calls.length
    const baseCalls = vi.mocked(catalog.baseModels).mock.calls.length
    let finish!: (value: { items: { id: string; label: string }[] }) => void
    vi.mocked(catalog.baseModels).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await click(renderer, '重试')
    expect(catalog.baseModels).toHaveBeenCalledTimes(baseCalls + 1)
    expect(catalog.details).toHaveBeenCalledTimes(detailCalls)
    expect(element.dataset).not.toHaveProperty('restored')
    expect(element.scrollTop).toBe(0)
    element.setContentHeight(1400)
    await act(async () => finish({ items: [{ id: '1', label: 'SDXL' }] }))
    expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(0)
    expect(renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('dd').map(nodeText)).toContain('SDXL')
    expect(element.scrollTop).toBe(142)
  })

  it('keeps a detail without a base-model dependency ready when the base source fails', async () => {
    const catalog = makeCatalog()
    const details = vi.mocked(catalog.details).getMockImplementation()!
    vi.mocked(catalog.details).mockImplementation(async (request, signal) => { const value = await details(request, signal); return { ...value, item: { ...value.item, baseModelId: null } } })
    let element = scrollElement(1400)
    const { renderer } = await mount(fullProjection(), { catalog }, { createNodeMock: node => node.props.className === 'catalog-content' ? element : null })
    await click(renderer, '资源')
    await click(renderer, 'LoRA')
    await click(renderer, '查看详情 玻璃 LoRA')
    element.scrollTop = 142
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    await click(renderer, '任务')
    vi.mocked(catalog.baseModels).mockRejectedValueOnce(new Error('底模不可用'))
    element = scrollElement(1400)
    await click(renderer, '资源')
    expect(catalog.baseModels).toHaveBeenCalledTimes(2)
    expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(0)
    const detail = renderer.root.findByProps({ className: 'catalog-detail' })
    expect(detail.findAllByType('h2').map(nodeText)).toEqual(['玻璃 LoRA'])
    expect(detail.findAllByType('dt').map(nodeText)).not.toContain('底模')
    expect(detail.findAllByType('dt').map(nodeText)).toContain('资源类型')
    expect(element.scrollTop).toBe(142)
  })

  it('restores a detail only after its delayed fields create the scroll range', async () => {
    const catalog = makeCatalog(), load = vi.mocked(catalog.details).getMockImplementation()!
    let pending = false, finish!: () => Promise<void>
    vi.mocked(catalog.details).mockImplementation(async (request, signal) => {
      const result = { ...await load(request, signal), fields: [{ key: 'description', value: '详情正文。'.repeat(200) }] }
      return pending ? new Promise(resolve => { finish = async () => resolve(result) }) : result
    })
    let element = scrollElement(1400)
    const { renderer } = await mount(fullProjection(), { catalog }, { createNodeMock: node => node.props.className === 'catalog-content' ? element : null })
    await click(renderer, '资源')
    await click(renderer, '查看详情 模型')
    element.scrollTop = 142
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    await click(renderer, '任务')
    pending = true
    element = scrollElement(400)
    await click(renderer, '资源')
    expect(element.scrollTop).toBe(0)
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    element.setContentHeight(1400)
    await act(async () => finish())
    expect(renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('dd').map(nodeText)).toContain('详情正文。'.repeat(200))
    expect(element.scrollTop).toBe(142)
  })
})

describe('experiment workbench Catalog detail navigation', () => {
  it('keeps a restored list at its saved scroll position when no detail was opened', async () => {
    const { catalog } = modelFilterCatalog(), data = fullProjection()
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const element = { scrollTop: 0, scrollLeft: 0, dataset: {} }
    const { renderer } = await mount(data, { catalog, storage }, { createNodeMock: node => node.props.className === 'catalog-content' ? element : null })
    await click(renderer, '资源')
    element.scrollTop = 360
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    await act(() => renderer.unmount())
    const freshElement = { scrollTop: 0, scrollLeft: 0, dataset: {} }
    const reopened = await mount(data, { catalog, storage }, { createNodeMock: node => node.props.className === 'catalog-content' ? freshElement : null })
    expect(reopened.renderer.root.findAllByProps({ className: 'catalog-list-panel' })).toHaveLength(1)
    expect(freshElement.scrollTop).toBe(360)
  })

  it('restores the selected detail after leaving resources and reopening the workspace', async () => {
    const catalog = makeCatalog(), data = fullProjection()
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const element = { scrollTop: 0, scrollLeft: 0, dataset: {} }
    const { renderer, onAction } = await mount(data, { catalog, storage }, { createNodeMock: node => node.props.className === 'catalog-content' ? element : null })
    await click(renderer, '资源')
    await click(renderer, 'LoRA')
    await change(renderer, '筛选底模', '1')
    await change(renderer, '筛选生成模型', '11')
    await change(renderer, '搜索资源', 'glass')
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    await click(renderer, '下一页')
    element.scrollTop = 407
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    await click(renderer, '查看详情 玻璃 LoRA')
    element.scrollTop = 142
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    await click(renderer, '任务')
    await click(renderer, '资源')
    expect(renderer.root.findAllByProps({ className: 'catalog-detail' })).toHaveLength(1)
    expect(renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('h2').map(nodeText)).toEqual(['玻璃 LoRA'])
    expect(element.scrollTop).toBe(142)
    await act(() => renderer.unmount())
    const freshElement = { scrollTop: 0, scrollLeft: 0, dataset: {} }
    const reopened = await mount(data, { catalog, storage }, { createNodeMock: node => node.props.className === 'catalog-content' ? freshElement : null })
    expect(freshElement.scrollTop).toBe(0)
    expect(reopened.renderer.root.findAllByProps({ className: 'catalog-detail' })).toHaveLength(1)
    expect(reopened.renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('h2').map(nodeText)).toEqual(['玻璃 LoRA'])
    await click(reopened.renderer, '返回资源列表')
    expect(freshElement.scrollTop).toBe(0)
    expect(readField(reopened.renderer.root, '搜索资源')).toBe('glass')
    expect(readField(reopened.renderer.root, '筛选底模')).toBe('1')
    expect(readField(reopened.renderer.root, '筛选生成模型')).toBe('11')
    expect(nodeText(reopened.renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('2 / 7')
    expect(onAction).not.toHaveBeenCalled()
    expect(reopened.onAction).not.toHaveBeenCalled()
  })

  it('cancels details on return and keeps the next resource visible after a late response', async () => {
    const catalog = makeCatalog()
    const load = vi.mocked(catalog.details).getMockImplementation()!
    let finish!: () => Promise<void>, signal!: AbortSignal
    vi.mocked(catalog.details).mockImplementation((request, currentSignal) => {
      if (request.kind === 'model') {
        signal = currentSignal
        return new Promise(resolve => { finish = async () => resolve(await load(request, currentSignal)) })
      }
      return load(request, currentSignal)
    })
    const { renderer } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    await click(renderer, '查看详情 模型')
    await click(renderer, '返回资源列表')
    expect(signal.aborted).toBe(true)
    await click(renderer, 'LoRA')
    await click(renderer, '查看详情 玻璃 LoRA')
    await act(async () => finish())
    expect(renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('h2').map(nodeText)).toEqual(['玻璃 LoRA'])
    await click(renderer, '返回资源列表')
    await click(renderer, '查看详情 玻璃 LoRA')
    expect(renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('h2').map(nodeText)).toEqual(['玻璃 LoRA'])
  })

  it('restores list scrolling after the detail panel scrolls while retaining the current query and page', async () => {
    const { catalog } = modelFilterCatalog()
    const data = fullProjection(), originalDrafts = structuredClone(data.branches.map(branch => branch.draft))
    const element = { scrollTop: 0, scrollLeft: 0, dataset: {} }
    const { renderer, onAction } = await mount(data, { catalog }, {
      createNodeMock: node => node.props.className === 'catalog-content' ? element : null,
    })
    const selected = nodeText(renderer.root.findByProps({ className: 'selected-resources' }))
    await click(renderer, '资源')
    await change(renderer, '筛选底模', '1')
    await change(renderer, '搜索资源', 'glass')
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    await click(renderer, '下一页')
    const labels = renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)
    element.scrollTop = 360
    element.scrollLeft = 12
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    await click(renderer, '查看详情 A 模型 110')
    expect(catalog.details).toHaveBeenLastCalledWith({ kind: 'model', id: '110' }, expect.any(AbortSignal))
    element.scrollTop = 0
    element.scrollLeft = 0
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    await click(renderer, '返回资源列表')
    expect({ top: element.scrollTop, left: element.scrollLeft }).toEqual({ top: 360, left: 12 })
    expect(readField(renderer.root, '筛选底模')).toBe('1')
    expect(readField(renderer.root, '筛选生成模型')).toBe('')
    expect(readField(renderer.root, '搜索资源')).toBe('glass')
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('2 / 2')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(labels)
    expect(nodeText(renderer.root.findByProps({ className: 'selected-resources' }))).toBe(selected)
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    expect(onAction).not.toHaveBeenCalled()
  })
})

describe('experiment workbench Catalog detail values', () => {
  it.each([
{
      kind: 'model' as const, category: '生成模型', id: '11', label: '模型',
      fields: [
        { key: 'id', value: '11' }, { key: 'base_model_id', value: '1' },
        { key: 'file_name', value: 'model.safetensors' }, { key: 'file_format', value: 'safetensors' },
        { key: 'precision_or_quantization', value: 'fp16' }, { key: 'author', value: '作者' },
        { key: 'version', value: null }, { key: 'description', value: '模型说明' },
        { key: 'usage', value: '模型用法' }, { key: 'skill_name', value: '生成 Skill' },
      ],
      expected: [['资源类型', '生成模型'], ['底模', 'anima'], ['文件名', 'model.safetensors'], ['文件格式', 'safetensors'], ['精度 / 量化', 'fp16'], ['说明', '模型说明'], ['记录 ID', '11'], ['基础模型 ID', '1'], ['作者', '作者'], ['使用方法', '模型用法'], ['Skill 名称', '生成 Skill']],
    },
{
      kind: 'lora' as const, category: 'LoRA', id: '13', label: '玻璃 LoRA',
      fields: [
        { key: 'id', value: '13' }, { key: 'base_model_id', value: '1' }, { key: 'model_id', value: '11' },
        { key: 'file_name', value: 'glass.safetensors' }, { key: 'file_format', value: 'safetensors' },
        { key: 'precision_or_quantization', value: null }, { key: 'author', value: '作者' },
        { key: 'version', value: 'v1' }, { key: 'description', value: 'LoRA 说明' },
        { key: 'usage', value: 'LoRA 用法' }, { key: 'trigger_words_json', value: ['glass', 'soft light'] }, { key: 'weight', value: 0 },
      ],
      expected: [['资源类型', 'LoRA'], ['底模', 'anima'], ['文件名', 'glass.safetensors'], ['文件格式', 'safetensors'], ['版本', 'v1'], ['说明', 'LoRA 说明'], ['触发词', 'glass、soft light'], ['建议权重', '0'], ['记录 ID', '13'], ['基础模型 ID', '1'], ['生成模型 ID', '11'], ['作者', '作者'], ['使用方法', 'LoRA 用法']],
    },
{
      kind: 'comfyui-template' as const, category: 'Workflow 模板', id: '12', label: '文生图',
      fields: [
        { key: 'id', value: '12' }, { key: 'base_model_id', value: '1' }, { key: 'model_id', value: '11' },
        { key: 'lora_id', value: null }, { key: 'title', value: '文生图' }, { key: 'template_type', value: 'text_to_image' },
      ],
      expected: [['资源类型', 'Workflow 模板'], ['底模', 'anima'], ['模板类型', '文生图'], ['记录 ID', '12'], ['基础模型 ID', '1'], ['生成模型 ID', '11'], ['标题', '文生图']],
    }
])('shows the prototype detail rows for $kind from the Catalog values', async ({ kind, category, id, label, fields, expected }) => {
    const catalog = makeCatalog()
    vi.mocked(catalog.baseModels).mockResolvedValue({ items: [{ id: '1', label: 'anima' }] })
    vi.mocked(catalog.details).mockResolvedValue({ kind, id, item: { ...catalogItems.find(item => item.context.kind === kind)!, baseModelId: '1' }, fields })
    const { renderer, onAction } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    await click(renderer, category)
    await click(renderer, `查看详情 ${label}`)
    expect(catalog.details).toHaveBeenLastCalledWith({ kind, id }, expect.any(AbortSignal))
    expect(renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('h2').map(nodeText)).toEqual([label])
    expect(renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('button').find(button => nodeText(button) === '返回资源列表')!.findAllByType('svg')).toHaveLength(1)
    expect(renderer.root.findAllByType('dt').map(nodeText).map((label, index) => [label, renderer.root.findAllByType('dd').map(nodeText)[index]])).toEqual(expected)
    expect(onAction).not.toHaveBeenCalled()
  })

  it('preserves empty fields and zero while omitting null fields in resource details', async () => {
    const catalog = makeCatalog()
    vi.mocked(catalog.details).mockResolvedValue({
      kind: 'lora', id: '13', item: catalogItems[1]!,
      fields: [
        { key: 'id', value: '13' },
        { key: 'base_model_id', value: null },
        { key: 'model_id', value: null },
        { key: 'file_name', value: '' },
        { key: 'file_format', value: null },
        { key: 'precision_or_quantization', value: null },
        { key: 'author', value: null },
        { key: 'version', value: null },
        { key: 'description', value: null },
        { key: 'usage', value: null },
        { key: 'trigger_words_json', value: [] },
        { key: 'weight', value: 0 },
      ],
    })
    const { renderer } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    await click(renderer, 'LoRA')
    await click(renderer, '查看详情')
    expect(renderer.root.findAllByType('dd').map(nodeText)).toEqual(['LoRA', '', '', '0', '13'])
  })
})

describe('experiment workbench shared catalog', () => {
  it('uses Catalog query, filters, pagination, details and media navigation without creating another backend', async () => {
    const catalog = makeCatalog()
    const { renderer, onAction } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    expect(catalog.search).toHaveBeenLastCalledWith(
      { kind: 'model', query: '', page: 1, baseModelId: null, modelId: null },
      expect.any(AbortSignal),
    )
    await change(renderer, '筛选底模', '1')
    await change(renderer, '筛选生成模型', '11')
    await change(renderer, '搜索资源', 'glass')
    await act(async () =>
      renderer.root
        .findByProps({ className: 'catalog-search' })
        .props.onSubmit({ preventDefault() {} }),
    )
    expect(catalog.search).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: 'glass', baseModelId: '1' }),
      expect.any(AbortSignal),
    )
    await click(renderer, '下一页')
    await click(renderer, '上一页')
    await click(renderer, '查看详情 模型')
    expect(catalog.details).toHaveBeenLastCalledWith(
      { kind: 'model', id: '11' },
      expect.any(AbortSignal),
    )
    expect(renderer.root.findByProps({ 'aria-label': '已选择 模型' }).props.disabled).toBe(true)
    await click(renderer, '预览图片 模型')
    await click(renderer, '下一张图片')
    await click(renderer, '上一张图片')
    await click(renderer, '返回详情')
    await click(renderer, '返回资源列表')
    await click(renderer, '查看详情')
    await click(renderer, '返回资源列表')
    await click(renderer, 'LoRA')
    await click(renderer, '移除 玻璃 LoRA')
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'resource-remove', id: '13', value: 'lora' }))
    for (const label of [
      'LoRA',
      'Workflow 模板',
    ]) {
      await click(renderer, label)
      expect(catalog.search).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: '', page: 1 }),
        expect.any(AbortSignal),
      )
    }
    await change(renderer, '搜索资源', 'none')
    await act(async () =>
      renderer.root
        .findByProps({ className: 'catalog-search' })
        .props.onSubmit({ preventDefault() {} }),
    )
    await click(renderer, '清除筛选')
    expect(catalog.search).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: '', baseModelId: null }),
      expect.any(AbortSignal),
    )
  })

  it('reports Catalog list and detail failures and retries each request', async () => {
    const catalog = makeCatalog()
    vi.mocked(catalog.baseModels).mockRejectedValueOnce(new Error('底模不可用'))
    vi.mocked(catalog.search).mockRejectedValueOnce(new Error('资源服务不可用'))
    const { renderer } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toContain(
      '不可用',
    )
    await click(renderer, '重试')
    vi.mocked(catalog.details).mockRejectedValueOnce(new Error('详情不可用'))
    await click(renderer, '查看详情')
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toContain(
      '详情不可用',
    )
    await click(renderer, '重试')
    expect(renderer.root.findAllByType('dd').map(nodeText)).toContain(
      'model.safetensors',
    )
  })
})

describe('experiment workbench overlay and loading lifecycle', () => {
  it('closes the sheet from its backdrop, keeps the form open until Escape and refreshes after visibility returns', async () => {
    const { renderer, remote } = await mount(fullProjection())
    await click(renderer, '查看运行记录')
    const backdrop = renderer.root.findByProps({ className: 'sheet-backdrop' })
    await act(() => backdrop.props.onClick({ target: {}, currentTarget: {} }))
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1)
    const target = {}
    await act(() => backdrop.props.onClick({ target, currentTarget: target }))
    await click(renderer, '新建工作')
    const modal = renderer.root.findByProps({ className: 'modal-backdrop' })
    expect(modal.props.onClick).toBeUndefined()
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1)
    await act(() => {
      document.dispatchEvent(
        Object.assign(new Event('keydown'), { key: 'Escape' }),
      )
    })
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    await act(() => {
      Object.defineProperty(document, 'hidden', {
        value: true,
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await act(async () => {
      Object.defineProperty(document, 'hidden', {
        value: false,
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(remote.getProjection.mock.calls.length).toBeGreaterThan(1)
  })

  it('shows a projection failure and retries the current workspace', async () => {
    const remote = {
      subscribe: async function* (_request: unknown, signal: AbortSignal) { await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true })) },
      getEnvironment: async () => functionEnvironment,
      promptPreview: vi.fn(async (request: import('../../src/workbench/prompt-edit.ts').PromptStartRequest) => ({ ...request.input, base_model_name: 'SDXL', reference_context: {} })),
      promptStart: vi.fn(async (_request: import('../../src/workbench/prompt-edit.ts').PromptStartRequest): Promise<import('../../src/workbench/prompt-edit.ts').PromptTurn> => { throw new Error('prompt fixture not configured') }),
      promptGet: vi.fn(async (_request: import('../../src/workbench/prompt-edit.ts').PromptLookupRequest): Promise<import('../../src/workbench/prompt-edit.ts').PromptTurn> => { throw new Error('prompt fixture not configured') }),
      promptList: vi.fn(async () => []),
      promptCancel: vi.fn(async (_request: import('../../src/workbench/prompt-edit.ts').PromptLookupRequest): Promise<import('../../src/workbench/prompt-edit.ts').PromptTurn> => { throw new Error('prompt fixture not configured') }),
      promptSaveCandidate: vi.fn(async (_request: import('../../src/workbench/prompt-edit.ts').PromptAdoptRequest): Promise<PromptTurn> => { throw new Error('prompt fixture not configured') }),
      promptAdopt: vi.fn(async (_request: import('../../src/workbench/prompt-edit.ts').PromptAdoptRequest): Promise<import('../../src/workbench/prompt-edit.ts').PromptTurn> => { throw new Error('prompt fixture not configured') }),
      queryRecords: vi.fn(async () => []),
      resolveImages: vi.fn(async () => ({ images: [] })),
      importImages: vi.fn(async () => ({ images: [] })),
      translateStart: vi.fn(async (request: { request_id: string }) => ({ request_id: request.request_id, status: 'running' as const })),
      translateGet: vi.fn(async (request: { request_id: string }) => ({ request_id: request.request_id, status: 'succeeded' as const, text: '译文' })),
      translateCancel: vi.fn(async () => undefined),
      getInputDescription: vi.fn(async (_request: import('../../src/workbench-remote.ts').WorkbenchInputDescriptionRequest) => inputDescription),
      getProjection: vi
        .fn()
        .mockRejectedValueOnce(new Error('读取失败'))
        .mockResolvedValue(fullProjection()),
    }
    const { renderer } = await mount(fullProjection(), { remote })
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toBe(
      '读取失败',
    )
    await click(renderer, '重试')
    expect(
      readField(renderer.root, '分支名称'),
    ).toBe('主分支')
  })

  it('renders horizontal Run ancestry with thumbnails and each Branch source', async () => {
    const data = treeProjection()
    for (const branch of data.branches) branch.source_experience_id = null
    data.branches.find(branch => branch.branch_id === 'detail')!.source_run_id = null
    data.branches.find(branch => branch.branch_id === 'detail')!.source_artifact_id = 'artifact-detail'
    data.branches.find(branch => branch.branch_id === 'cool')!.source_run_id = null
    data.runs = data.runs.filter(run => run.workbench_task_id !== 'cool-task')
    data.runs.find(run => run.run_id === 'warm-r1')!.status = 'failed'
    data.runs.find(run => run.run_id === 'warm-r2')!.status = 'remote_running'
    const { renderer, onAction } = await mount(data)
    await click(renderer, '收起主分支')
    await click(renderer, '查看分支图')
    const graph = renderer.root.findByProps({ className: 'branch-graph' })
    const cards = graph.findAllByProps({ className: 'branch-graph-node' })
    expect(cards.map(card => nodeText(card.findAllByType('h3')[0]!))).toEqual(['主分支', '暖光', '暖光细节', '冷光'])
    expect(cards.map(card => nodeText(card.findAllByType('p')[0]!))).toEqual([
      '基准起点', '从 root-r1 分出', '来源：暖光 · 产物 artifact-detail', '来源：主分支 · 任务输入',
    ])
    expect(cards[2]!.findAllByType('p')[0]!.props.title).toBe('来源：暖光 · 产物 artifact-detail')
    const runGroups = cards.map(card => card.findByProps({ className: 'branch-graph-runs' }))
    expect(runGroups.map(group => group.findAllByType('button').map(node => node.props['aria-label']))).toEqual([
      ['查看运行 root-r1'], ['查看运行 warm-r1', '查看运行 warm-r2'],
      ['查看运行 detail-r1', '查看运行 detail-r2', '查看运行 detail-r3', '查看运行 detail-r4'], [],
    ])
    expect(nodeText(runGroups[3]!)).toBe('暂无运行记录')
    const rootRun = runGroups[0]!.findAllByType('button')[0]!
    expect(rootRun.props['aria-pressed']).toBe(true)
    expect(rootRun.findAllByType('img')[0]!.props.src).toBe('/image.png')
    expect(runGroups[1]!.findAllByType('button')[0]!.findAllByType('img')).toHaveLength(0)
    expect(nodeText(runGroups[1]!)).toContain('运行失败')
    expect(nodeText(runGroups[1]!)).toContain('生成中')
    expect(cards.map(card => card.props.style.top)).toEqual([0, 158, 316, 474])
    expect(runGroups.map(group => group.findAllByType('button').map(node => node.props.style.left))).toEqual([
      [8], [188, 368], [368, 548, 728, 908], [],
    ])
    expect(graph.findAllByType('path').map(edge => nodeText(edge.findAllByType('title')[0]!))).toEqual([
      'root-r1 → warm-r1', 'warm-r1 → warm-r2', 'detail-r1 → detail-r2', 'detail-r2 → detail-r3', 'detail-r3 → detail-r4',
    ])
    expect(onAction).not.toHaveBeenCalled()
  })

  it.each([true, false])('enters a graph grandchild and shows its own input and Runs (hasRuns=%s)', async hasRuns => {
    const data = treeProjection()
    if (!hasRuns) data.runs = data.runs.filter(run => run.workbench_task_id !== 'detail-task')
    const { renderer, onAction } = await mount(data)
    await click(renderer, '收起暖光')
    await click(renderer, '收起主分支')
    await click(renderer, '查看分支图')
    const card = renderer.root.findAllByProps({ className: 'branch-graph-node' })
      .find(item => nodeText(item.findAllByType('h3')[0]!) === '暖光细节')!
    await act(() => card.findAllByType('button').find(button => nodeText(button) === '进入分支')!.props.onClick())
    expect(renderer.root.findAllByProps({ className: 'branch-graph' })).toHaveLength(0)
    expect(renderer.root.findByProps({ 'aria-label': '运行结果' }).props.className).toBe('active')
    const selected = renderer.root.findByProps({ role: 'treeitem', 'aria-selected': true })
    expect(selected.props['aria-level']).toBe(3)
    expect(nodeText(selected)).toContain('暖光细节')
    expect(renderer.root.findByProps({ 'aria-label': '收起主分支' })).toBeDefined()
    expect(renderer.root.findByProps({ 'aria-label': '收起暖光' })).toBeDefined()
    expect(readField(renderer.root, '分支名称')).toBe('暖光细节')
    expect(readField(renderer.root, '原始需求')).toBe('比较暖光细节的表现。')
    expect(readField(renderer.root, '正向提示词')).toBe('detail prompt')
    const runs = renderer.root.findByProps({ className: 'run-strip' }).findAllByType('button')
    expect(runs.map(button => button.props['aria-label'])).toEqual(hasRuns
      ? ['查看运行 detail-r1', '查看运行 detail-r2', '查看运行 detail-r3', '查看运行 detail-r4'] : [])
    if (hasRuns) expect(runs.at(-1)!.props['aria-pressed']).toBe(true)
    expect(onAction).not.toHaveBeenCalled()
  })

  it('ends comparison when opening the graph and returning to results', async () => {
    const { renderer } = await mount(treeProjection())
    await click(renderer, '比较运行')
    await click(renderer, '查看分支图')
    await click(renderer, '返回结果')
    expect(renderer.root.findAllByProps({ className: 'compare-grid' })).toHaveLength(0)
    expect(renderer.root.findByProps({ 'aria-label': '查看运行 root-r1' }).props['aria-pressed']).toBe(true)
  })

  it('keeps comparison when previewing and closing its selected Run image', async () => {
    const { renderer } = await mount(treeProjection())
    await click(renderer, '比较运行')
    await click(renderer, '查看原图 root-r1')
    expect(nodeText(renderer.root.findByProps({ role: 'dialog', 'aria-labelledby': 'image-title' }).findByProps({ id: 'image-title' }))).toBe('root-r1 · 图片 1')
    await click(renderer, '关闭原图')
    expect(renderer.root.findAllByProps({ className: 'compare-grid' })).toHaveLength(1)
  })

  it.each(['root-r1', 'warm-r1'])('leaves comparison when opening %s from the branch graph', async runId => {
    const { renderer } = await mount(treeProjection())
    await click(renderer, '比较运行')
    expect(renderer.root.findAllByProps({ className: 'compare-grid' })).toHaveLength(1)
    await click(renderer, '查看分支图')
    await click(renderer, `查看运行 ${runId}`)
    expect(renderer.root.findAllByProps({ className: 'compare-grid' })).toHaveLength(0)
    expect(renderer.root.findByProps({ 'aria-label': `查看运行 ${runId}` }).props['aria-pressed']).toBe(true)
    expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed']).toBe(true)
  })

  it('returns from the graph to the same selected failure and branch', async () => {
    const data = treeProjection()
    data.runs.find(run => run.run_id === 'warm-r1')!.status = 'failed'
    const { renderer, onAction } = await mount(data)
    await click(renderer, '切换分支 暖光')
    await click(renderer, '查看运行 warm-r1')
    await click(renderer, '查看分支图')
    await click(renderer, '返回结果')
    expect(renderer.root.findByProps({ 'aria-label': '查看运行 warm-r1' }).props['aria-pressed']).toBe(true)
    expect(readField(renderer.root, '分支名称')).toBe('暖光')
    expect(nodeText(renderer.root.findByProps({ role: 'treeitem', 'aria-selected': true }))).toContain('暖光')
    expect(onAction).not.toHaveBeenCalled()
  })

  it('returns to a favorite run and navigates a run from the branch graph', async () => {
    const { renderer, onAction } = await mount(fullProjection())
    await click(renderer, '收藏')
    await click(renderer, '查看运行')
    expect(
      renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed'],
    ).toBe(true)
    await click(renderer, '收藏')
    const cards = renderer.root.findAllByProps({ className: 'experience-card' })
    const favoriteRun = cards.find((card) =>
      nodeText(card).includes('运行 r2'),
    )!
    await act(async () =>
      favoriteRun
        .findAllByType('button')
        .find((button) => nodeText(button) === '移除收藏')!
        .props.onClick(),
    )
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'favorite', id: 'r2', value: { targetType: 'run', favorite: false } }),
    )
    await click(renderer, '查看分支图')
    const runs = renderer.root.findAllByProps({
      className: 'branch-graph-runs',
    })
    await act(() => runs[0]!.findAllByType('button')[0]!.props.onClick())
    expect(
      renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed'],
    ).toBe(true)
  })
})

describe('experiment workbench complete resource selection', () => {
  it('shows every Catalog category, preserves same-ID selections and displays each prompt resource group', async () => {
    const data = fullProjection(), catalog = makeCatalog()
    data.runs = []
    data.branches[0]!.draft.prompt_resource_refs = [
      { kind: 'style', id: '16' }, { kind: 'style', id: '26' },
      { kind: 'artist-string', id: '16' }, { kind: 'artist-string', id: '28' },
      { kind: 'work', id: '14' }, { kind: 'character', id: '15' }, { kind: 'prompt-term', id: '17' },
    ]
    const { renderer, onAction } = await mount(data, { catalog })
    await click(renderer, '资源')
    const kinds = renderer.root.findByProps({ 'aria-label': '资源类型' })
    expect(kinds.findAllByType('button').map(button => button.props['data-resource-kind'])).toEqual(
      expect.arrayContaining(['model', 'comfyui-template', 'lora', 'work', 'character', 'style', 'prompt-term', 'artist-string']))
    const style = kinds.findAllByType('button').find(button => button.props['data-resource-kind'] === 'style')!
    expect(nodeText(style)).toContain('2')
    await act(() => style.props.onClick())
    expect(renderer.root.findByProps({ className: 'catalog-content' }).findByProps({ 'aria-label': '移除 柔光' }).props['aria-pressed']).toBe(true)
    const resources = renderer.root.findByProps({ 'aria-label': '已选资源' })
    expect(resources.findAllByProps({ 'data-resource-group': 'style' })).toHaveLength(1)
    expect(nodeText(resources.findByProps({ 'data-resource-group': 'style' }))).toContain('柔光')
    expect(resources.findAllByProps({ 'data-resource-group': 'artist-string' })).toHaveLength(1)
    await act(() => resources.findByProps({ 'data-resource-group': 'style' }).findAllByType('button').find(button => button.props['aria-label'] === '移除 柔光')!.props.onClick())
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'edit-draft' }))
    expect(data.branches[0]!.draft.prompt_resource_refs).toHaveLength(7)
    expect(data.branches[0]!.editing_draft!.prompt_resource_refs).toEqual([
      { kind: 'style', id: '26' }, { kind: 'artist-string', id: '16' }, { kind: 'artist-string', id: '28' },
      { kind: 'work', id: '14' }, { kind: 'character', id: '15' }, { kind: 'prompt-term', id: '17' },
    ])
  })

  it('opens selected execution and prompt resources from editable and saved inputs', async () => {
    const data = fullProjection(), catalog = makeCatalog()
    data.runs = []
    data.branches[0]!.draft.prompt_resource_refs = [{ kind: 'style', id: '16' }]
    const original = structuredClone(data.branches[0]!.draft)
    const { renderer, onAction } = await mount(data, { catalog })
    const resources = () => renderer.root.findByProps({ 'aria-label': '已选资源' })
    const open = async (name: string) => {
      await act(() => resources().findByProps({ 'aria-label': `查看详情 ${name}` }).props.onClick())
    }
    for (const [name, kind, id] of [
      ['model.safetensors', 'model', '11'], ['文生图', 'comfyui-template', '12'], ['玻璃 LoRA', 'lora', '13'],
    ]) {
      await open(name!)
      expect(catalog.details).toHaveBeenLastCalledWith({ kind, id }, expect.any(AbortSignal))
      expect(renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('h2').map(nodeText)).toHaveLength(1)
    }
    await act(() => resources().findByProps({ 'aria-label': '添加 画师或画风' }).props.onClick())
    expect(renderer.root.findByProps({ 'data-resource-kind': 'style' }).props['aria-pressed']).toBe(true)
    expect(renderer.root.findAllByProps({ className: 'catalog-detail' })).toHaveLength(0)
    await open('柔光')
    expect(catalog.details).toHaveBeenLastCalledWith({ kind: 'style', id: '16' }, expect.any(AbortSignal))
    await click(renderer, '保存参数')
    expect(resources().findAllByType('button').map(button => button.props['aria-label'])).toEqual(['查看详情 柔光'])
    await click(renderer, '运行结果')
    await open('柔光')
    expect(renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('h2').map(nodeText)).toEqual(['柔光'])
    expect(data.branches[0]!.draft).toEqual(original)
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'resource-select' }))
  })

  it('keeps the active category when a previous Catalog response arrives late', async () => {
    const data = fullProjection(), catalog = makeCatalog()
    data.branches[0]!.draft.prompt_resource_refs = [{ kind: 'style', id: '16' }, { kind: 'artist-string', id: '18' }]
    const search = vi.mocked(catalog.search).getMockImplementation()!
    let finish!: () => Promise<void>, previousSignal!: AbortSignal
    vi.mocked(catalog.search).mockImplementation((request, signal) => request.kind === 'style'
      ? new Promise(resolve => { previousSignal = signal; finish = async () => resolve(await search(request, signal)) })
      : search(request, signal))
    const { renderer } = await mount(data, { catalog })
    await click(renderer, '资源')
    await click(renderer, '画师或画风')
    await click(renderer, '画师串')
    const labels = () => renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)
    expect(labels()).toEqual(['画师串'])
    expect(previousSignal.aborted).toBe(false)
    await act(async () => finish())
    expect(labels()).toEqual(['画师串'])
    expect(renderer.root.findByProps({ className: 'catalog-content' }).findByProps({ 'aria-label': '移除 画师串' }).props['aria-pressed']).toBe(true)
    await click(renderer, '画师或画风')
    expect(labels()).toEqual(['柔光'])
    expect(vi.mocked(catalog.search).mock.calls.filter(([request]) => request.kind === 'style')).toHaveLength(1)
  })

  it('displays fixed historical resource content without querying current Catalog details', async () => {
    const data = fullProjection(), run = data.runs[0]!, catalog = makeCatalog()
    data.branches[0]!.draft.prompt_resource_refs = [{ kind: 'style', id: '26' }]
    const snapshots = [{ kind: 'style' as const, id: '16', name: '当次画风', fields: { prompt_text: 'recorded brushwork' } }]
    const { renderer } = await mount(data, { catalog, remote: {
      getRunInput: async () => ({ ...runInputDefaults(run.generation_input), run_id: run.run_id, branch_id: 'root', generation_input: run.generation_input,
        image_refs: [], workflow_image_bindings: [], input_description: runInputDescription(run.generation_input.parameters),
        prompt_input: { positive_prompt: 'recorded prompt', negative_prompt: '' }, selected_resources: snapshots }),
    } })
    vi.mocked(catalog.details).mockClear()
    await click(renderer, '查看运行输入')
    const resources = renderer.root.findByProps({ 'aria-label': '已选资源' })
    expect(nodeText(resources)).toContain('当次画风')
    expect(nodeText(resources)).toContain('recorded brushwork')
    expect(resources.findAllByType('button')).toHaveLength(0)
    expect(catalog.details).not.toHaveBeenCalledWith({ kind: 'style', id: '16' }, expect.any(AbortSignal))
    expect(data.branches[0]!.draft.prompt_resource_refs).toEqual([{ kind: 'style', id: '26' }])
  })

  it('shows original prompt resource text and expandable source fields in details', async () => {
    const catalog = makeCatalog()
    vi.mocked(catalog.details).mockImplementation(async request => ({
      ...request, item: catalogItems.find(item => item.context.kind === request.kind)!,
      fields: request.kind === 'style' ? [
        { key: 'id', value: '16' }, { key: 'name', value: '柔光' }, { key: 'aliases_json', value: ['soft'] },
        { key: 'prompt_text', value: 'artist, soft light' }, { key: 'style_description', value: '薄涂的透明光影' },
      ] : [],
      extra_fields: { source_notes: { examples: ['original note'] } },
    }))
    const { renderer } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    await click(renderer, '画师或画风')
    await click(renderer, '查看详情 柔光')
    const detail = renderer.root.findByProps({ className: 'catalog-detail' })
    expect(nodeText(detail)).toContain('artist, soft light')
    expect(nodeText(detail)).toContain('薄涂的透明光影')
    expect(nodeText(detail)).toContain('soft')
    expect(detail.findAllByType('summary').map(nodeText)).toContain('其他字段')
    expect(nodeText(detail)).toContain('source_notes')
    expect(nodeText(detail)).toContain('original note')
  })

  it('opens selected resource categories with all base models', async () => {
    const catalog = makeCatalog()
    const { renderer } = await mount(fullProjection(), { catalog })
    await click(renderer, '添加 LoRA')
    expect(renderer.root.findByProps({ 'aria-label': '筛选底模' }).props.value).toBe('')
    expect(catalog.search).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'lora', baseModelId: null }), expect.any(AbortSignal))
  })
})

describe('experiment workbench free Catalog resource selection', () => {
  const choices = [
    ['lora', '添加 LoRA', 1],
    ['comfyui-template', '选择 Workflow 模板', 7],

  ] as const

  it.each(choices)('selects a cross-base and model-specific %s from cards and details', async (kind, entry, index) => {
    for (const mode of ['card', 'details'] as const) {
      for (const scope of [{ baseModelId: '2', modelId: null }, { baseModelId: '1', modelId: '21' }]) {
        const data = fullProjection(), catalog = makeCatalog()
        data.runs = []
        data.branches[0]!.draft.generation_input.loras = []
        data.branches[0]!.draft.generation_input.template_id = null
        const item: CatalogItem = { ...catalogItems[index]!, ...scope }
        vi.mocked(catalog.search).mockImplementation(async request => ({
          ...request, items: request.kind === kind ? [item] : [], totalCount: request.kind === kind ? 1 : 0,
        }))
        const details = vi.mocked(catalog.details).getMockImplementation()!
        vi.mocked(catalog.details).mockImplementation(async (request, signal) =>
          request.kind === kind ? { ...request, item, fields: [] } : details(request, signal))
        const { renderer, onAction } = await mount(data, { catalog })
        if (kind === 'lora' || kind === 'comfyui-template') await click(renderer, entry)
        else { await click(renderer, '资源'); await click(renderer, entry) }
        if (mode === 'details') await click(renderer, `查看详情 ${item.label}`)
        const button = renderer.root.findByProps({ className: 'catalog-content' }).findByProps({ 'aria-label': `选择 ${item.label}` })
        expect(button.props.disabled).toBe(false)
        expect(button.props['aria-pressed']).toBe(false)
        await act(() => button.props.onClick())
        expect(onAction).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
          type: 'resource-select', id: item.context.id, value: { kind: item.context.kind, id: item.context.id },
        }))
      }
    }
  })

  it.each(['card', 'details'] as const)('removes a selected cross-base LoRA from the %s', async entry => {
    const data = fullProjection(), catalog = makeCatalog()
    data.runs = []
    const item: CatalogItem = { ...catalogItems[1]!, baseModelId: '2', modelId: '21' }
    vi.mocked(catalog.search).mockImplementation(async request => ({ ...request, items: request.kind === 'lora' ? [item] : [], totalCount: request.kind === 'lora' ? 1 : 0 }))
    const details = vi.mocked(catalog.details).getMockImplementation()!
    vi.mocked(catalog.details).mockImplementation(async (request, signal) => request.kind === 'lora' ? { ...request, item, fields: [] } : details(request, signal))
    const { renderer, onAction } = await mount(data, { catalog })
    await click(renderer, '添加 LoRA')
    if (entry === 'details') await click(renderer, '查看详情 玻璃 LoRA')
    const button = renderer.root.findByProps({ className: 'catalog-content' }).findByProps({ 'aria-label': '移除 玻璃 LoRA' })
    expect(button.props.disabled).toBe(false)
    expect(button.props['aria-pressed']).toBe(true)
    await act(() => button.props.onClick())
    expect(onAction).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'resource-remove', id: '13', value: 'lora' }))
  })

  it('selects a base-bound template before a generation model is chosen', async () => {
    const data = fullProjection(), catalog = makeCatalog()
    data.runs = []
    data.branches[0]!.draft = structuredClone(draft)
    const item: CatalogItem = { ...catalogItems[7]!, baseModelId: '1', modelId: '21' }
    vi.mocked(catalog.search).mockImplementation(async request => ({ ...request, items: request.kind === 'comfyui-template' ? [item] : [], totalCount: request.kind === 'comfyui-template' ? 1 : 0 }))
    const { renderer, onAction } = await mount(data, { catalog })
    await click(renderer, '选择 Workflow 模板')
    const button = renderer.root.findByProps({ 'aria-label': '选择 文生图' })
    expect(button.props.disabled).toBe(false)
    await act(() => button.props.onClick())
    expect(onAction).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'resource-select', id: '12', value: { kind: item.context.kind, id: item.context.id } }))
  })
})



describe('experiment workbench template-defined input values', () => {
  it('uses the branch template IDs and reads historical Run prompts from actual Run parameters', async () => {
    const data = fullProjection()
    data.branches[0]!.draft.generation_input.parameters.steps_1 = 36
    data.runs[0]!.generation_input.parameters = {
      positive_1: 'run specific light',
      negative_1: 'actual negative',
      seed_1: 912,
      steps_1: 44,
      cfg_1: 3,
      width_1: 1280,
      height_1: 768,
    }
    const { renderer, remote } = await mount(data)
    expect(
      readField(renderer.root, '采样步数'),
    ).toBe('36')
    await change(renderer, '正向提示词', 'unsaved draft edit')
    await change(renderer, '查看运行输入', '', true)
    expect(
      readField(renderer.root, '正向提示词'),
    ).toBe('run specific light')
    expect(
      readField(renderer.root, '负向提示词'),
    ).toBe('actual negative')
    expect(
      readField(renderer.root, '采样步数'),
    ).toBe('44')
    expect(
      readField(renderer.root, 'Seed'),
    ).toBe('912')
    expect(readField(renderer.root, '画面尺寸')).toBe('1280 × 768')
    expect(remote.getInputDescription).toHaveBeenCalledTimes(1)
  })
})

describe('experiment workbench input inspection lifecycle', () => {
  it('submits the selected size with actual candidate parameter IDs', async () => {
    const { renderer, onAction } = await mount(fullProjection())
    const select = renderer.root.findByProps({ 'aria-label': '画面尺寸' })
    const portrait = select
      .findAllByType('option')
      .find((option) => nodeText(option) === '768 × 1024')!
    await change(renderer, '画面尺寸', portrait.props.value)
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'edit-draft',
        value: expect.objectContaining({ draft: expect.objectContaining({ generation_input: expect.objectContaining({ parameters: expect.objectContaining({ width_1: 768, height_1: 1024 }) }) }) }),
      }),
    )
  })

  it('reports inspection failures without showing guessed parameter values', async () => {
    const data = fullProjection()
    const remote = {
      getProjection: vi.fn(async () => data),
      getEnvironment: async () => functionEnvironment,
      getInputDescription: vi.fn(async () => {
        throw new Error('模板字段不可用')
      }),
    }
    const { renderer } = await mount(data, { remote })
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toContain(
      '模板字段不可用',
    )
    expect(
      readField(renderer.root, '采样步数'),
    ).toBe('')
    expect(
      readField(renderer.root, '画面尺寸'),
    ).toBe('')
  })

  it('keeps the selected branch values when a previous template inspection finishes later', async () => {
    const data = fullProjection()
    data.runs = []
    data.branches[1]!.draft.generation_input.template_id = '99'
    data.branches[1]!.draft.generation_input.parameters = { steps_99: 70 }
    let release!: (value: typeof inputDescription) => void
    const later = new Promise<typeof inputDescription>((resolve) => {
      release = resolve
    })
    const second = {
      ...inputDescription,
      parameters: inputDescription.parameters.map((parameter) =>
        parameter.kind === 'steps'
          ? { ...parameter, parameter_id: 'steps_99' }
          : parameter,
      ),
    }
    const remote = {
      getProjection: vi.fn(async () => data),
      getEnvironment: async () => functionEnvironment,
      getInputDescription: vi.fn(async (scope: { branchId: string }) =>
        scope.branchId === 'root' ? later : second,
      ),
    }
    const { renderer } = await mount(data, { remote })
    await click(renderer, '切换分支 暖光探索')
    expect(
      readField(renderer.root, '采样步数'),
    ).toBe('70')
    await act(async () => {
      release(inputDescription)
      await Promise.resolve()
    })
    expect(
      readField(renderer.root, '采样步数'),
    ).toBe('70')
  })
})

describe('experiment workbench comparison evidence', () => {
  it('sends both selected Run IDs to builtin and custom comparison functions', async () => {
    const { renderer, onAction } = await mount(fullProjection())
    await click(renderer, '切换分支 暖光探索')
    await click(renderer, '查看运行 r2')
    await click(renderer, '比较运行')
    await click(renderer, '比较运行 r1')
    await click(renderer, '比较结果')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'agent-action',
        id: 'compare',
        referenceRunIds: ['r2', 'r1'],
      }),
    )
    await click(renderer, '自定义compare')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'agent-action',
        id: 'custom-compare',
        referenceRunIds: ['r2', 'r1'],
      }),
    )
  })
})

describe('experiment workbench function defaults', () => {
  it('saves each function preset and preserves the literal requirements after reopening and projection reload', async () => {
    const data = fullProjection()
    const template = '  绘图要求 {{requirements_block}}。\n\n\t保留 {branch_id}、${session_id} 与原始标点。  \n'
    const onAction = vi.fn(async (request) => {
      if (request.type === 'function-edit') Object.assign(data.functions.find(item => item.function_id === request.id)!, request.value)
      if (request.type === 'function-preset') data.functions.find(item => item.function_id === request.id)!.preset_id = request.value
      return { workspaceId: 'workspace-a', workId: 'work-a', branchId: 'child' }
    })
    const { renderer } = await mount(data, { onAction, presets: functionEnvironment.presets })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    expect(onAction).not.toHaveBeenCalled()
    expect(renderer.root.findByProps({ 'aria-label': '功能名称' }).props.readOnly).toBe(true)
    expect(renderer.root.findByProps({ 'aria-label': '任务类型' }).props.disabled).toBe(true)
    await change(renderer, 'Agent 预设', 'preset-other')
    await change(renderer, '执行要求', template)
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'function-edit', id: 'prompt',
      value: expect.objectContaining({ preset_id: 'preset-other', request_template: template }),
    }))
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    expect(renderer.root.findByProps({ className: 'settings-page' })).toBeTruthy()
    expect(data.functions.find(item => item.function_id === 'run')!.preset_id).toBe('preset')
    await change(renderer, 'run的默认预设', 'preset-other')
    expect(renderer.root.findByProps({ className: 'settings-page' })).toBeTruthy()
    await click(renderer, '编辑run')
    await change(renderer, 'Agent 预设', 'preset')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(data.functions.find(item => item.function_id === 'run')!.preset_id).toBe('preset')
    expect(data.functions.find(item => item.function_id === 'prompt')!.preset_id).toBe('preset-other')
    await click(renderer, '编辑prompt')
    expect(readField(renderer.root, 'Agent 预设')).toBe('preset-other')
    expect(readField(renderer.root, '执行要求')).toBe(template)
    await click(renderer, '取消')
    await click(renderer, '编辑run')
    expect(readField(renderer.root, 'Agent 预设')).toBe('preset')
    expect(readField(renderer.root, '执行要求')).toBe('{{task_id}}')
    const refreshed = await mount(structuredClone(data))
    await click(refreshed.renderer, '配置中心')
    await click(refreshed.renderer, '编辑prompt')
    expect(readField(refreshed.renderer.root, '执行要求')).toBe(template)
  })
})

describe('experiment workbench function editor lifecycle', () => {
  it('retains failed edits and leaves stored values unchanged when cancelled, closed or escaped', async () => {
    const data = fullProjection()
    const onAction = vi.fn(async () => { throw Error('保存失败，请重试。') })
    const { renderer } = await mount(data, { onAction })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    await change(renderer, 'Agent 预设', 'preset-other')
    await change(renderer, '执行要求', '保留输入 {{requirements_block}}')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(readField(renderer.root, 'Agent 预设')).toBe('preset-other')
    expect(readField(renderer.root, '执行要求')).toBe('保留输入 {{requirements_block}}')
    expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toBe('保存失败，请重试。')
    await click(renderer, '取消')
    await click(renderer, '编辑prompt')
    expect(readField(renderer.root, '执行要求')).toBe('{{requirements_block}}')
    await change(renderer, '执行要求', '关闭后丢弃 {{requirements_block}}')
    await click(renderer, '关闭对话框')
    await click(renderer, '编辑prompt')
    expect(readField(renderer.root, '执行要求')).toBe('{{requirements_block}}')
    await change(renderer, '执行要求', 'Escape 后丢弃 {{requirements_block}}')
    await act(() => { document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' })) })
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    expect(onAction).toHaveBeenCalledOnce()
    expect(data.functions.find(item => item.function_id === 'prompt')!.preset_id).toBe('preset')
  })

  it('loads the selected preset skills and saves every visible edited field', async () => {
    const data = fullProjection()
    const getEnvironment = vi.fn(async ({ presetId }) => ({
      ...functionEnvironment,
      skills: presetId === 'preset-other' ? [{ name: 'prompt-skill', description: '提示词' }] : functionEnvironment.skills,
      models: {
        ...functionEnvironment.models,
        groups: [...functionEnvironment.models.groups, { id: 'provider-other', name: '其他提供商', models: [{ id: 'fast', name: '快速模型' }] }],
        routableProviders: ['provider', 'provider-other'],
      },
    }))
    const { renderer, onAction } = await mount(data, { remote: { getEnvironment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '编辑自定义prompt')
    await change(renderer, '功能名称', '自定义绘图')
    await change(renderer, '任务类型', 'run')
    await change(renderer, 'Agent 预设', 'preset-other')
    expect(getEnvironment).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', presetId: 'preset-other' })
    expect(readField(renderer.root, '指定 Skill')).toBe('')
    await change(renderer, '指定 Skill', 'prompt-skill')
    await change(renderer, 'Agent 提供商', 'provider-other')
    expect(readField(renderer.root, 'Agent 模型')).toBe('fast')
    expect(renderer.root.findByProps({ 'aria-label': '推理等级' }).props.disabled).toBe(true)
    await change(renderer, '执行要求', '执行任务 {{task_id}}')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'function-edit', id: 'custom-prompt',
      value: expect.objectContaining({ name: '自定义绘图', kind: 'run', preset_id: 'preset-other', agent_model: { provider: 'provider-other', model: 'fast' }, requested_skill: 'prompt-skill', request_template: '执行任务 {{task_id}}' }),
    }))
  })

  it('keeps the environment failure visible and blocks saving until the preset environment loads', async () => {
    const data = fullProjection()
    const getEnvironment = vi.fn(async ({ presetId }) => {
      if (presetId === 'preset-other') throw Error('Skill 目录读取失败，请重试。')
      return functionEnvironment
    })
    const { renderer, onAction } = await mount(data, { remote: { getEnvironment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    await change(renderer, 'Agent 预设', 'preset-other')
    await change(renderer, '执行要求', '读取失败后保留 {{requirements_block}}')
    const save = renderer.root.findAllByType('button').find(node => nodeText(node) === '保存功能')!
    expect(save.props.disabled).toBe(true)
    expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toBe('Skill 目录读取失败，请重试。')
    expect(onAction).not.toHaveBeenCalled()
    await change(renderer, 'Agent 预设', 'preset')
    expect(readField(renderer.root, '执行要求')).toBe('读取失败后保留 {{requirements_block}}')
    expect(renderer.root.findAllByType('button').find(node => nodeText(node) === '保存功能')!.props.disabled).toBe(false)
  })
})

describe('experiment workbench function Skill choices', () => {
  it('saves a named Skill and Agent choice independently and restores both after reopening and projection reload', async () => {
    const data = fullProjection()
    const getEnvironment = vi.fn(async ({ presetId }: { presetId?: string }): Promise<WorkbenchEnvironment> => ({
      ...functionEnvironment,
      skills: presetId === 'preset'
        ? [...functionEnvironment.skills, { name: 'prompt-skill', description: '提示词编写' }]
        : presetId === 'preset-other' ? [{ name: 'run-skill', description: '生成执行' }] : [],
    }))
    const remote = { getEnvironment, getProjection: async () => structuredClone(data), getInputDescription: async () => inputDescription }
    const onAction = vi.fn(async request => { Object.assign(data.functions.find(item => item.function_id === request.id)!, structuredClone(request.value)) })
    const { renderer } = await mount(data, { remote, onAction })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    expect(renderer.root.findByProps({ 'aria-label': '指定 Skill' }).findAllByType('option').map(option => option.props.value)).toEqual(['', 'comfyui-generate', 'prompt-skill'])
    await change(renderer, '指定 Skill', 'prompt-skill')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    await click(renderer, '编辑run')
    await change(renderer, 'Agent 预设', 'preset-other')
    expect(getEnvironment).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', presetId: 'preset-other' })
    expect(renderer.root.findByProps({ 'aria-label': '指定 Skill' }).findAllByType('option').map(option => option.props.value)).toEqual(['', 'run-skill'])
    await change(renderer, '指定 Skill', 'run-skill')
    await change(renderer, '指定 Skill', '')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(onAction.mock.calls.map(([request]) => [request.id, request.value.preset_id, request.value.requested_skill])).toStrictEqual([
      ['prompt', 'preset', 'prompt-skill'],
      ['run', 'preset-other', null],
    ])
    const verifySavedChoices = async (view: typeof renderer) => {
      for (const [functionId, presetId, skill] of [['prompt', 'preset', 'prompt-skill'], ['run', 'preset-other', '']] as const) {
        await click(view, '编辑' + functionId)
        expect(readField(view.root, 'Agent 预设')).toBe(presetId)
        expect(readField(view.root, '指定 Skill')).toBe(skill)
        await click(view, '取消')
      }
    }
    await verifySavedChoices(renderer)
    const refreshed = await mount(structuredClone(data), { remote, onAction })
    await click(refreshed.renderer, '配置中心')
    await verifySavedChoices(refreshed.renderer)
  })
})

describe('experiment workbench agent model choices', () => {
  it('saves separate function models across reopening and projection reload and distinguishes identical model ids from different providers', async () => {
    const data = fullProjection()
    const environment: WorkbenchEnvironment = {
      ...functionEnvironment,
      models: {
        ...functionEnvironment.models,
        groups: [
          { id: 'provider', name: '提供商', models: [{ id: 'model', name: '模型', reasoning: { efforts: [{ id: 'medium', name: '中' }, { id: 'high', name: '高' }], defaultEffort: 'high' } }] },
          { id: 'provider-other', name: '其他提供商', models: [
            { id: 'model', name: '同编号模型', reasoning: { efforts: [{ id: 'xhigh', name: '极高' }] } },
            { id: 'other-only', name: '备用模型' },
          ] },
        ],
        routableProviders: ['provider', 'provider-other'],
      },
    }
    const remote = { getEnvironment: async () => environment, getProjection: async () => structuredClone(data), getInputDescription: async () => inputDescription }
    const onAction = vi.fn(async request => { Object.assign(data.functions.find(item => item.function_id === request.id)!, structuredClone(request.value)) })
    const { renderer } = await mount(data, { remote, onAction })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    await change(renderer, '推理等级', 'medium')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    await click(renderer, '编辑run')
    await change(renderer, 'Agent 提供商', 'provider-other')
    const model = renderer.root.findByProps({ 'aria-label': 'Agent 模型' })
    expect(model.props.value).toBe('model')
    expect(model.findAllByType('option').map(option => [option.props.value, nodeText(option)])).toEqual([['model', '同编号模型'], ['other-only', '备用模型']])
    const effort = renderer.root.findByProps({ 'aria-label': '推理等级' })
    expect(effort.props.value).toBe('xhigh')
    expect(effort.findAllByType('option').map(option => option.props.value)).toEqual(['xhigh'])
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(onAction.mock.calls.map(([request]) => [request.id, request.value.agent_model])).toEqual([
      ['prompt', { provider: 'provider', model: 'model', reasoningEffort: 'medium' }],
      ['run', { provider: 'provider-other', model: 'model', reasoningEffort: 'xhigh' }],
    ])
    const verifySavedChoices = async (view: typeof renderer) => {
      for (const [functionId, provider, reasoningEffort] of [['prompt', 'provider', 'medium'], ['run', 'provider-other', 'xhigh']] as const) {
        await click(view, '编辑' + functionId)
        expect(readField(view.root, 'Agent 提供商')).toBe(provider)
        expect(readField(view.root, 'Agent 模型')).toBe('model')
        expect(readField(view.root, '推理等级')).toBe(reasoningEffort)
        await click(view, '取消')
      }
    }
    await verifySavedChoices(renderer)
    const refreshed = await mount(structuredClone(data), { remote, onAction })
    await click(refreshed.renderer, '配置中心')
    await verifySavedChoices(refreshed.renderer)
  })

  it('keeps a shared reasoning level and otherwise uses the model default or first level before clearing it for a model without reasoning', async () => {
    const data = fullProjection()
    const environment: WorkbenchEnvironment = {
      ...functionEnvironment,
      models: {
        ...functionEnvironment.models,
        groups: [{
          id: 'provider', name: '提供商', models: [
            ...functionEnvironment.models.groups[0].models,
            { id: 'shared', name: '共同等级模型', reasoning: { efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }], defaultEffort: 'low' } },
            { id: 'default', name: '默认等级模型', reasoning: { efforts: [{ id: 'low', name: '低' }, { id: 'medium', name: '中' }], defaultEffort: 'medium' } },
            { id: 'first', name: '首个等级模型', reasoning: { efforts: [{ id: 'minimal', name: '最小' }, { id: 'low', name: '低' }] } },
            { id: 'fast', name: '快速模型' },
          ],
        }],
      },
    }
    const { renderer, onAction } = await mount(data, { remote: { getEnvironment: async () => environment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    await change(renderer, 'Agent 模型', 'shared')
    expect(readField(renderer.root, '推理等级')).toBe('high')
    await change(renderer, 'Agent 模型', 'default')
    expect(readField(renderer.root, '推理等级')).toBe('medium')
    await change(renderer, 'Agent 模型', 'first')
    expect(readField(renderer.root, '推理等级')).toBe('minimal')
    await change(renderer, 'Agent 模型', 'fast')
    const effort = renderer.root.findByProps({ 'aria-label': '推理等级' })
    expect(effort.props.disabled).toBe(true)
    expect(effort.props.value).toBe('')
    expect(effort.findAllByType('option').map(option => option.props.value)).toEqual([''])
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'function-edit', id: 'prompt' }))
    expect(onAction.mock.lastCall![0].value.agent_model).toStrictEqual({ provider: 'provider', model: 'fast' })
  })
})

describe('experiment workbench function editor controls', () => {
  it('selects a model and reasoning level, restores requirements and saves the selected values', async () => {
    const data = fullProjection()
    const environment = {
      ...functionEnvironment,
      models: {
        ...functionEnvironment.models,
        groups: [{
          id: 'provider', name: '提供商', models: [
            ...functionEnvironment.models.groups[0].models,
            { id: 'fast', name: '快速模型' },
            { id: 'deep', name: '深度模型', reasoning: { efforts: [{ id: 'medium', name: '中' }, { id: 'high', name: '高' }], defaultEffort: 'medium' } },
          ],
        }],
      },
    }
    const { renderer, onAction } = await mount(data, { remote: { getEnvironment: async () => environment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '编辑自定义prompt')
    await change(renderer, 'Agent 模型', 'fast')
    expect(renderer.root.findByProps({ 'aria-label': '推理等级' }).props.disabled).toBe(true)
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '推理等级' }))).toBe('该模型未提供推理等级')
    await change(renderer, 'Agent 模型', 'deep')
    expect(readField(renderer.root, '推理等级')).toBe('medium')
    await change(renderer, '推理等级', 'high')
    await change(renderer, '执行要求', '当前要求 {{requirements_block}}')
    await click(renderer, '恢复默认要求')
    const restored = readField(renderer.root, '执行要求')
    expect(restored).toBe(WORKBENCH_FUNCTIONS.find(item => item.kind === 'prompt')!.default_request_template)
    await change(renderer, '任务类型', 'parameters')
    const parameterTemplate = readField(renderer.root, '执行要求')
    expect(parameterTemplate).toBe(approvedInstructions.functions.find(item => item.kind === 'parameters')!.requestTemplate)
    await change(renderer, '执行要求', '调整参数 {{task_id}}')
    await click(renderer, '恢复默认要求')
    expect(readField(renderer.root, '执行要求')).toBe(parameterTemplate)
    expect(nodeText(renderer.root.findByProps({ id: 'function-location' }))).toBe('生成参数')
    expect(nodeText(renderer.root.findByProps({ id: 'function-result' }))).toBe('生成参数')
    await change(renderer, '指定 Skill', '')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'function-edit', id: 'custom-prompt',
      value: expect.objectContaining({ kind: 'parameters', agent_model: { provider: 'provider', model: 'deep', reasoningEffort: 'high' }, requested_skill: null, request_template: parameterTemplate }),
    }))
  })

  it('explains invalid requirements and enables saving after restoring the default', async () => {
    const { renderer, onAction } = await mount(fullProjection())
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    const samples = [
      ['', '请填写本功能的执行要求。'],
      ['  读取任务。\n\n\t保留这一行。  \n', '请在执行要求中保留 {{requirements_block}}、{{prompt_edit_block}}、{{references_block}}。'],
      ['  读取 {{requirements_block}}。\n\n保留 {{branch_id}} 与尾部。  \n', '本功能支持的变量为 {{requirements_block}}、{{prompt_edit_block}}、{{references_block}}。请将其他变量改为具体文字。'],
      ['读取 {{requirements_block}} {{', '变量格式不完整，请使用 {{requirements_block}}、{{prompt_edit_block}}、{{references_block}}。'],
    ]
    for (const [value, message] of samples) {
      await change(renderer, '执行要求', value)
      expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toBe(message)
      expect(renderer.root.findAllByType('button').find(node => nodeText(node) === '保存功能')!.props.disabled).toBe(true)
      await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
      expect(readField(renderer.root, '执行要求')).toBe(value)
    }
    expect(onAction).not.toHaveBeenCalled()
    await click(renderer, '恢复默认要求')
    expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toBe('')
    expect(renderer.root.findAllByType('button').find(node => nodeText(node) === '保存功能')!.props.disabled).toBe(false)
    await click(renderer, '取消')
    await click(renderer, '编辑prompt')
    expect(readField(renderer.root, '执行要求')).toBe('{{requirements_block}}')
    expect(onAction).not.toHaveBeenCalled()
  })

  it.each([
    [{ provider: 'removed', model: 'model' }, '请选择可用的 Agent 提供商。'],
    [{ provider: 'provider', model: 'removed' }, '请选择该提供商下的 Agent 模型。'],
    [{ provider: 'provider', model: 'model', reasoningEffort: 'removed' }, '请选择该模型支持的推理等级。'],
    [{ provider: 'provider', model: 'fast', reasoningEffort: 'high' }, '该模型未提供推理等级，请重新选择模型。'],
  ])('preserves other edits and saves after repairing an unavailable model selection: %j', async (agent_model, message) => {
    const data = fullProjection()
    data.functions.find(item => item.function_id === 'prompt')!.agent_model = agent_model
    const environment = {
      ...functionEnvironment,
      models: { ...functionEnvironment.models, groups: [{ ...functionEnvironment.models.groups[0], models: [...functionEnvironment.models.groups[0].models, { id: 'fast', name: '快速模型' }] }] },
    }
    const { renderer, onAction } = await mount(data, { remote: { getEnvironment: async () => environment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toBe(message)
    expect(renderer.root.findAllByType('button').find(node => nodeText(node) === '保存功能')!.props.disabled).toBe(true)
    await change(renderer, 'Agent 预设', 'preset-other')
    await change(renderer, '指定 Skill', '')
    await change(renderer, '执行要求', '修复模型后保留 {{requirements_block}}')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(onAction).not.toHaveBeenCalled()
    await change(renderer, 'Agent 提供商', 'provider')
    expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toBe('')
    expect(renderer.root.findAllByType('button').find(node => nodeText(node) === '保存功能')!.props.disabled).toBe(false)
    expect(readField(renderer.root, 'Agent 预设')).toBe('preset-other')
    expect(readField(renderer.root, '指定 Skill')).toBe('')
    expect(readField(renderer.root, '执行要求')).toBe('修复模型后保留 {{requirements_block}}')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(onAction).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      type: 'function-edit', id: 'prompt',
      value: expect.objectContaining({
        preset_id: 'preset-other', requested_skill: null, request_template: '修复模型后保留 {{requirements_block}}',
        agent_model: { provider: 'provider', model: 'model', reasoningEffort: 'high' },
      }),
    }))
  })

  it.each([9, 11])('keeps function dialog focus within root node type %s and closes with Escape', async (nodeType) => {
    const data = fullProjection()
    const getEnvironment = vi.fn(async () => functionEnvironment)
    const { renderer } = await mount(data, { remote: { getEnvironment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    const dialog = renderer.root.findByProps({ role: 'dialog' })
    const first = { offsetParent: {}, focus: vi.fn() }
    const hidden = { offsetParent: null, focus: vi.fn() }
    const last = { offsetParent: {}, focus: vi.fn() }
    const root = nodeType === 9 ? Object.assign(document, { activeElement: last }) : { nodeType, activeElement: last }
    const currentTarget = { querySelectorAll: () => [first, hidden, last], getRootNode: () => root }
    const preventDefault = vi.fn()
    await act(() => dialog.props.onKeyDown({ key: 'Tab', shiftKey: false, currentTarget, preventDefault }))
    expect(first.focus).toHaveBeenCalledOnce()
    root.activeElement = first
    await act(() => dialog.props.onKeyDown({ key: 'Tab', shiftKey: true, currentTarget, preventDefault }))
    expect(last.focus).toHaveBeenCalledOnce()
    expect(preventDefault).toHaveBeenCalledTimes(2)
    await act(() => dialog.props.onKeyDown({ key: 'Tab', shiftKey: false, currentTarget, preventDefault }))
    expect(preventDefault).toHaveBeenCalledTimes(2)
    await act(() => dialog.props.onKeyDown({ key: 'Enter', currentTarget, preventDefault }))
    expect(hidden.focus).not.toHaveBeenCalled()
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1)
    const beforeClose = getEnvironment.mock.calls.length
    await act(() => {
      dialog.props.onKeyDown({ key: 'Escape', currentTarget, preventDefault })
      document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }))
    })
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    expect(getEnvironment).toHaveBeenCalledTimes(beforeClose + 1)
  })

  it('shows the function save error when an inline preset selection fails', async () => {
    const onAction = vi.fn(async () => { throw Error('配置保存失败，请重试。') })
    const { renderer } = await mount(fullProjection(), { onAction })
    await click(renderer, '配置中心')
    await change(renderer, 'prompt的默认预设', 'preset-other')
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toBe('配置保存失败，请重试。')
    expect(renderer.root.findByProps({ className: 'settings-page' })).toBeTruthy()
  })
})

describe('experiment workbench current function directory', () => {
  it('reloads the official preset roster on entry and marks missing or broken function presets', async () => {
    const data = fullProjection()
    data.functions.find(item => item.function_id === 'run')!.preset_id = 'preset-other'
    let environment: WorkbenchEnvironment = functionEnvironment
    const getEnvironment = vi.fn(async () => environment)
    const { renderer } = await mount(data, { presets: functionEnvironment.presets, remote: { getEnvironment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    expect(getEnvironment).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a' })
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }))).toContain('工作台预设')
    await click(renderer, '返回工作台')
    environment = { ...functionEnvironment, presets: [{ id: 'preset-other', name: '绘图预设', broken: '配置不可用' }, { id: 'preset-added', name: '新增预设' }] }
    await click(renderer, '配置中心')
    const prompt = renderer.root.findByProps({ 'data-function': 'prompt' })
    const run = renderer.root.findByProps({ 'data-function': 'run' })
    expect(nodeText(prompt.findByProps({ className: 'binding-problem' }))).toBe('该功能的 Agent 预设已不可用，请编辑功能并重新选择预设。')
    expect(nodeText(run.findByProps({ className: 'binding-problem' }))).toBe('该功能的 Agent 预设已不可用，请编辑功能并重新选择预设。')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }))).toBe('预设不可用新增预设')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'run的默认预设' }))).toBe('预设不可用新增预设')
  })
})

describe('experiment workbench function directory lifecycle', () => {
  it('refreshes after cancelling and saving an editor without replacing its edited requirements', async () => {
    const data = fullProjection()
    let environment: WorkbenchEnvironment = functionEnvironment
    const getEnvironment = vi.fn(async () => environment)
    const onAction = vi.fn(async (request) => {
      Object.assign(data.functions.find(item => item.function_id === request.id)!, request.value)
      environment = { ...functionEnvironment, presets: [{ id: 'preset-other', name: '绘图预设' }, { id: 'saved-preset', name: '保存后新增预设' }] }
    })
    const { renderer } = await mount(data, { onAction, remote: { getEnvironment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    await change(renderer, '执行要求', '取消前编辑 {{requirements_block}}')
    environment = { ...functionEnvironment, presets: [...functionEnvironment.presets, { id: 'added-preset', name: '关闭前新增预设' }] }
    expect(readField(renderer.root, '执行要求')).toBe('取消前编辑 {{requirements_block}}')
    await click(renderer, '取消')
    expect(getEnvironment).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a' })
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }))).toContain('关闭前新增预设')
    expect(data.functions.find(item => item.function_id === 'prompt')!.request_template).toBe('{{requirements_block}}')
    await click(renderer, '编辑prompt')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }))).toContain('关闭前新增预设')
    await change(renderer, '执行要求', '保存时保留 {{requirements_block}}')
    await change(renderer, 'Agent 预设', 'preset-other')
    expect(readField(renderer.root, '执行要求')).toBe('保存时保留 {{requirements_block}}')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    expect(getEnvironment).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a' })
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }))).toBe('绘图预设保存后新增预设')
    expect(data.functions.find(item => item.function_id === 'prompt')!.request_template).toBe('保存时保留 {{requirements_block}}')
  })

  it('uses the latest selected preset directory when earlier table and editor requests arrive later', async () => {
    const data = fullProjection()
    let finishTable!: (value: WorkbenchEnvironment) => void
    let finishEditor!: (value: WorkbenchEnvironment) => void
    const latest: WorkbenchEnvironment = {
      ...functionEnvironment,
      presets: [...functionEnvironment.presets, { id: 'latest-preset', name: '当前目录预设' }],
      skills: [{ name: 'latest-skill', description: '当前目录 Skill' }],
    }
    const getEnvironment = vi.fn(({ presetId }: { presetId?: string }) => {
      if (!presetId) return new Promise<WorkbenchEnvironment>(resolve => { finishTable = resolve })
      if (presetId === 'preset') return new Promise<WorkbenchEnvironment>(resolve => { finishEditor = resolve })
      return Promise.resolve(latest)
    })
    const { renderer } = await mount(data, { remote: { getEnvironment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    await change(renderer, '执行要求', '等待目录期间保留 {{requirements_block}}')
    await change(renderer, 'Agent 预设', 'preset-other')
    await act(async () => { finishTable({ ...functionEnvironment, presets: [] }); finishEditor(functionEnvironment) })
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }))).toContain('当前目录预设')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }))).toContain('当前目录预设')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '指定 Skill' }))).toBe('Agent 自选latest-skill')
    expect(readField(renderer.root, '执行要求')).toBe('等待目录期间保留 {{requirements_block}}')
  })

  it('discards an editor directory response that arrives after closing the editor', async () => {
    const data = fullProjection()
    let finishEditor!: (value: WorkbenchEnvironment) => void
    const current: WorkbenchEnvironment = { ...functionEnvironment, presets: [...functionEnvironment.presets, { id: 'current-preset', name: '关闭后的名册' }] }
    const getEnvironment = vi.fn(({ presetId }: { presetId?: string }) => presetId
      ? new Promise<WorkbenchEnvironment>(resolve => { finishEditor = resolve })
      : Promise.resolve(current))
    const { renderer } = await mount(data, { remote: { getEnvironment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    await click(renderer, '关闭对话框')
    await act(async () => finishEditor({ ...functionEnvironment, presets: [] }))
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }))).toContain('关闭后的名册')
  })

  it('ignores a directory response from a configuration page that has been left', async () => {
    const data = fullProjection()
    let finishOldPage!: (value: WorkbenchEnvironment) => void
    const current: WorkbenchEnvironment = { ...functionEnvironment, presets: [...functionEnvironment.presets, { id: 'returned-preset', name: '重新进入后的名册' }] }
    const getEnvironment = vi.fn()
      .mockImplementationOnce(() => new Promise<WorkbenchEnvironment>(resolve => { finishOldPage = resolve }))
      .mockResolvedValue(current)
    const { renderer } = await mount(data, { remote: { getEnvironment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '返回工作台')
    await click(renderer, '配置中心')
    await act(async () => finishOldPage({ ...functionEnvironment, presets: [] }))
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }))).toContain('重新进入后的名册')
  })

  it('shows a current directory failure and ignores a failure from a page that has been left', async () => {
    const data = fullProjection()
    let failOldPage!: (error: Error) => void
    const getEnvironment = vi.fn()
      .mockRejectedValueOnce(new Error('官方预设名册读取失败，请重新进入配置中心。'))
      .mockImplementationOnce(() => new Promise<WorkbenchEnvironment>((_resolve, reject) => { failOldPage = reject }))
      .mockResolvedValue(functionEnvironment)
    const { renderer } = await mount(data, { remote: { getEnvironment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toBe('官方预设名册读取失败，请重新进入配置中心。')
    await click(renderer, '返回工作台')
    await click(renderer, '配置中心')
    await click(renderer, '返回工作台')
    await click(renderer, '配置中心')
    await act(async () => failOldPage(new Error('已离开的页面读取失败。')))
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toBe('官方预设名册读取失败，请重新进入配置中心。')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }))).toContain('工作台预设')
  })
})

describe('experiment workbench function names', () => {
  it.each(['  prompt  ', '   ', ''])('keeps all editor input and shows the prototype toast for invalid name %j', async name => {
    const { renderer, onAction } = await mount(fullProjection())
    await click(renderer, '配置中心')
    await click(renderer, '编辑自定义prompt')
    await change(renderer, '功能名称', name)
    await change(renderer, 'Agent 预设', 'preset-other')
    await change(renderer, '执行要求', '保留其余输入 {{requirements_block}}')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(onAction).not.toHaveBeenCalled()
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toBe('请填写与已有功能不同的名称。')
    expect(renderer.root.findByProps({ role: 'dialog' }).findAllByProps({ className: 'toast' })).toHaveLength(0)
    expect(readField(renderer.root, '功能名称')).toBe(name)
    expect(readField(renderer.root, 'Agent 预设')).toBe('preset-other')
    expect(readField(renderer.root, '执行要求')).toBe('保留其余输入 {{requirements_block}}')
    await change(renderer, '功能名称', '  自定义prompt  ')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'function-edit', value: expect.objectContaining({ name: '自定义prompt', preset_id: 'preset-other', request_template: '保留其余输入 {{requirements_block}}' }) }))
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
  })
})

describe('experiment workbench function name toast lifecycle', () => {
  it('dismisses the name toast after 6000 ms and restarts its timeout for the same failed name', async () => {
    vi.useFakeTimers()
    const { renderer } = await mount(fullProjection())
    await click(renderer, '配置中心')
    await click(renderer, '编辑自定义prompt')
    await change(renderer, '功能名称', 'prompt')
    const submit = () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} })
    await act(submit)
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toBe('请填写与已有功能不同的名称。')
    await act(() => { vi.advanceTimersByTime(4000) })
    await act(submit)
    await act(() => { vi.advanceTimersByTime(5999) })
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toBe('请填写与已有功能不同的名称。')
    await act(() => { vi.advanceTimersByTime(1) })
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
    expect(readField(renderer.root, '功能名称')).toBe('prompt')
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1)
  })
})

describe('experiment workbench global function toast', () => {
  it('keeps the name toast after cancelling and returning to the workbench until its 6000 ms timeout', async () => {
    vi.useFakeTimers()
    const { renderer } = await mount(fullProjection())
    await click(renderer, '配置中心')
    await click(renderer, '编辑自定义prompt')
    await change(renderer, '功能名称', 'prompt')
    await act(() => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    await click(renderer, '取消')
    await click(renderer, '返回工作台')
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(1)
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toBe('请填写与已有功能不同的名称。')
    await act(() => { vi.advanceTimersByTime(5999) })
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(1)
    await act(() => { vi.advanceTimersByTime(1) })
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
  })
})

describe('experiment workbench function preset write order', () => {
  it('persists consecutive preset selections in user order even when the later request is ready first', async () => {
    const data = fullProjection()
    const environment = { ...functionEnvironment, presets: [...functionEnvironment.presets, { id: 'preset-last', name: '最后选择预设' }] }
    let finishFirst!: () => void
    let finishLast!: () => void
    const first = new Promise<void>(resolve => { finishFirst = resolve })
    const last = new Promise<void>(resolve => { finishLast = resolve })
    const writes: string[] = []
    const onAction = vi.fn(async request => {
      await (request.value === 'preset-other' ? first : last)
      data.functions.find(item => item.function_id === request.id)!.preset_id = request.value
      writes.push(request.value)
    })
    const { renderer } = await mount(data, { onAction, remote: { getEnvironment: async () => environment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await change(renderer, 'prompt的默认预设', 'preset-other')
    await change(renderer, 'prompt的默认预设', 'preset-last')
    const selectedWhileSaving = readField(renderer.root, 'prompt的默认预设')
    await act(async () => finishLast())
    await act(async () => finishFirst())
    expect(writes).toEqual(['preset-other', 'preset-last'])
    expect(selectedWhileSaving).toBe('preset-last')
    expect(data.functions.find(item => item.function_id === 'prompt')!.preset_id).toBe('preset-last')
    expect(readField(renderer.root, 'prompt的默认预设')).toBe('preset-last')
  })
})

describe('experiment workbench function write lifecycle', () => {
  it('continues the next preset save after a failure and lets another function save independently', async () => {
    const data = fullProjection()
    const environment = { ...functionEnvironment, presets: [...functionEnvironment.presets, { id: 'preset-last', name: '最后选择预设' }] }
    let failFirst!: (error: Error) => void
    const blocked = new Promise<void>((_resolve, reject) => { failFirst = reject })
    let first = true
    const starts: string[] = []
    const writes: string[] = []
    const onAction = vi.fn(async request => {
      starts.push(request.id + ':' + request.value)
      if (request.id === 'prompt' && first) { first = false; await blocked }
      data.functions.find(item => item.function_id === request.id)!.preset_id = request.value
      writes.push(request.id + ':' + request.value)
    })
    const { renderer } = await mount(data, { onAction, remote: { getEnvironment: async () => environment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await change(renderer, 'prompt的默认预设', 'preset-other')
    await change(renderer, 'prompt的默认预设', 'preset-last')
    await change(renderer, 'run的默认预设', 'preset-other')
    expect(starts).toEqual(['prompt:preset-other', 'run:preset-other'])
    expect(writes).toEqual(['run:preset-other'])
    expect(readField(renderer.root, 'prompt的默认预设')).toBe('preset-last')
    await act(async () => failFirst(new Error('首个预设保存失败，请重试。')))
    expect(writes).toEqual(['run:preset-other', 'prompt:preset-last'])
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toBe('首个预设保存失败，请重试。')
    await change(renderer, 'prompt的默认预设', 'preset-other')
    expect(writes).toEqual(['run:preset-other', 'prompt:preset-last', 'prompt:preset-other'])
    expect(data.functions.find(item => item.function_id === 'prompt')!.preset_id).toBe('preset-other')
  })

  it('keeps pending selection across page changes and saves a following editor submission in its original work scope', async () => {
    const data = fullProjection()
    data.works.push({ ...data.works[0]!, work_id: 'work-b', name: '另一个工作' })
    data.branches.push({ ...data.branches[0]!, work_id: 'work-b', branch_id: 'branch-b' })
    const environment = { ...functionEnvironment, presets: [...functionEnvironment.presets, { id: 'preset-last', name: '最后选择预设' }] }
    let finishFirst!: () => void
    const blocked = new Promise<void>(resolve => { finishFirst = resolve })
    const onAction = vi.fn(async request => {
      const binding = data.functions.find(item => item.function_id === request.id)!
      if (request.type === 'function-preset') { await blocked; binding.preset_id = request.value }
      else Object.assign(binding, request.value)
    })
    const { renderer } = await mount(data, { onAction, remote: {
      getEnvironment: async () => environment,
      getProjection: async scope => ({ ...data, work_id: scope.workId ?? data.work_id, branches: data.branches.filter(branch => branch.work_id === (scope.workId ?? data.work_id)) }),
      getInputDescription: async () => inputDescription,
    } })
    await click(renderer, '配置中心')
    await change(renderer, 'prompt的默认预设', 'preset-other')
    await click(renderer, '返回工作台')
    await click(renderer, '配置中心')
    expect(readField(renderer.root, 'prompt的默认预设')).toBe('preset-other')
    await click(renderer, '编辑prompt')
    expect(readField(renderer.root, 'Agent 预设')).toBe('preset-other')
    await change(renderer, 'Agent 预设', 'preset-last')
    await change(renderer, '执行要求', '排队期间保留 {{requirements_block}}')
    let saving!: Promise<void>
    await act(() => { saving = renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }) })
    expect(onAction).toHaveBeenCalledOnce()
    await click(renderer, '取消')
    await click(renderer, '返回工作台')
    await change(renderer, '切换工作', 'work-b')
    await act(async () => { finishFirst(); await saving })
    expect(onAction.mock.calls[1]![0]).toMatchObject({ type: 'function-edit', id: 'prompt', workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root' })
    expect(data.functions.find(item => item.function_id === 'prompt')).toMatchObject({ preset_id: 'preset-last', request_template: '排队期间保留 {{requirements_block}}' })
    expect(readField(renderer.root, '切换工作')).toBe('work-b')
  })

  it('keeps a following inline selection after a pending full editor save completes', async () => {
    const data = fullProjection()
    const environment = { ...functionEnvironment, presets: [...functionEnvironment.presets, { id: 'preset-last', name: '最后选择预设' }] }
    let finishEditor!: () => void
    const blocked = new Promise<void>(resolve => { finishEditor = resolve })
    const writes: string[] = []
    const onAction = vi.fn(async request => {
      const binding = data.functions.find(item => item.function_id === request.id)!
      if (request.type === 'function-edit') { await blocked; Object.assign(binding, request.value); writes.push('editor') }
      else { binding.preset_id = request.value; writes.push('inline') }
    })
    const { renderer } = await mount(data, { onAction, remote: { getEnvironment: async () => environment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    await change(renderer, 'Agent 预设', 'preset-other')
    await change(renderer, '执行要求', '先保存的完整配置 {{requirements_block}}')
    let saving!: Promise<void>
    await act(() => { saving = renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }) })
    await click(renderer, '取消')
    await change(renderer, 'prompt的默认预设', 'preset-last')
    expect(onAction).toHaveBeenCalledOnce()
    expect(readField(renderer.root, 'prompt的默认预设')).toBe('preset-last')
    await click(renderer, '编辑prompt')
    expect(readField(renderer.root, '执行要求')).toBe('先保存的完整配置 {{requirements_block}}')
    expect(readField(renderer.root, 'Agent 预设')).toBe('preset-last')
    await click(renderer, '取消')
    await act(async () => { finishEditor(); await saving })
    expect(writes).toEqual(['editor', 'inline'])
    expect(data.functions.find(item => item.function_id === 'prompt')).toMatchObject({ preset_id: 'preset-last', request_template: '先保存的完整配置 {{requirements_block}}' })
    expect(readField(renderer.root, 'prompt的默认预设')).toBe('preset-last')
  })
})

describe('experiment workbench complete pending function input', () => {
  it.each([false, true])('reopens the last submitted requirements before a second model edit so both changes persist (first save fails=%s)', async failFirst => {
    const data = fullProjection()
    const environment = { ...functionEnvironment, models: { ...functionEnvironment.models, groups: [{ ...functionEnvironment.models.groups[0], models: [...functionEnvironment.models.groups[0].models, { id: 'fast', name: '快速模型' }] }] } }
    let finishFirst!: () => void
    const first = new Promise<void>((resolve, reject) => { finishFirst = () => failFirst ? reject(new Error('首次保存失败。')) : resolve() })
    let saves = 0
    const onAction = vi.fn(async request => {
      if (++saves === 1) await first
      Object.assign(data.functions.find(item => item.function_id === request.id)!, request.value)
    })
    const { renderer } = await mount(data, { onAction, remote: { getEnvironment: async () => environment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    await change(renderer, '执行要求', 'first saved {{requirements_block}}')
    let savingFirst!: Promise<void>
    await act(() => { savingFirst = renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }) })
    await click(renderer, '取消')
    await click(renderer, '编辑prompt')
    const reopenedRequirements = readField(renderer.root, '执行要求')
    await change(renderer, 'Agent 模型', 'fast')
    let savingSecond!: Promise<void>
    await act(() => { savingSecond = renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }) })
    await act(async () => { finishFirst(); await savingFirst; await savingSecond })
    expect(data.functions.find(item => item.function_id === 'prompt')).toMatchObject({ request_template: 'first saved {{requirements_block}}', agent_model: { provider: 'provider', model: 'fast' } })
    expect(reopenedRequirements).toBe('first saved {{requirements_block}}')
    expect(onAction).toHaveBeenCalledTimes(2)
  })
})

describe('experiment workbench pending function binding display', () => {
  it('uses every submitted field in the list and the reopened editor before the first write completes', async () => {
    const data = fullProjection()
    const environment = {
      ...functionEnvironment,
      skills: [...functionEnvironment.skills, { name: 'parameter-skill', description: '建议参数' }],
      models: { ...functionEnvironment.models, groups: [{ ...functionEnvironment.models.groups[0], models: [...functionEnvironment.models.groups[0].models, { id: 'fast', name: '快速模型' }] }] },
    }
    let finishFirst!: () => void
    const first = new Promise<void>(resolve => { finishFirst = resolve })
    let saves = 0
    const onAction = vi.fn(async request => {
      if (++saves === 1) await first
      Object.assign(data.functions.find(item => item.function_id === request.id)!, request.value)
    })
    const { renderer } = await mount(data, { onAction, remote: { getEnvironment: async () => environment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '编辑自定义prompt')
    await change(renderer, '功能名称', '已提交功能')
    await change(renderer, '任务类型', 'parameters')
    await change(renderer, 'Agent 预设', 'preset-other')
    await change(renderer, 'Agent 模型', 'fast')
    await change(renderer, '指定 Skill', 'parameter-skill')
    await change(renderer, '执行要求', '完整提交 {{task_id}}')
    let savingFirst!: Promise<void>
    await act(() => { savingFirst = renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }) })
    await click(renderer, '取消')
    await click(renderer, '返回工作台')
    await click(renderer, '配置中心')
    const row = renderer.root.findByProps({ 'data-function': 'custom-prompt' })
    expect(nodeText(row.findAllByType('strong')[0]!)).toBe('已提交功能')
    expect(nodeText(row)).toContain('生成参数')
    expect(nodeText(row)).toContain('快速模型')
    expect(nodeText(row)).toContain('parameter-skill')
    expect(readField(row, '已提交功能的默认预设')).toBe('preset-other')
    await click(renderer, '编辑已提交功能')
    for (const [label, value] of [
      ['功能名称', '已提交功能'], ['任务类型', 'parameters'], ['Agent 预设', 'preset-other'],
      ['Agent 模型', 'fast'], ['指定 Skill', 'parameter-skill'], ['执行要求', '完整提交 {{task_id}}'],
    ]) expect(readField(renderer.root, label)).toBe(value)
    await change(renderer, 'Agent 模型', 'model')
    let savingSecond!: Promise<void>
    await act(() => { savingSecond = renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }) })
    await act(async () => { finishFirst(); await savingFirst; await savingSecond })
    expect(data.functions.find(item => item.function_id === 'custom-prompt')).toMatchObject({
      name: '已提交功能', kind: 'parameters', preset_id: 'preset-other',
      agent_model: { provider: 'provider', model: 'model', reasoningEffort: 'high' },
      requested_skill: 'parameter-skill', request_template: '完整提交 {{task_id}}',
    })
  })
})

describe('experiment workbench delayed function save errors', () => {
  it.each(['open', 'closed', 'left-settings'])('shows one save error in the surviving UI when the editor is %s', async view => {
    let rejectSave!: (error: Error) => void
    const onAction = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectSave = reject }))
    const { renderer } = await mount(fullProjection(), { onAction })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    await change(renderer, '执行要求', '失败时保留 {{requirements_block}}')
    await change(renderer, 'Agent 预设', 'preset-other')
    let saving!: Promise<void>
    await act(() => { saving = renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }) })
    if (view !== 'open') await click(renderer, '关闭对话框')
    if (view === 'left-settings') await click(renderer, '返回工作台')
    await act(async () => { rejectSave(new Error('功能保存失败，请重试。')); await saving })
    if (view === 'open') {
      expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
      expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toBe('功能保存失败，请重试。')
      expect(readField(renderer.root, '执行要求')).toBe('失败时保留 {{requirements_block}}')
      expect(readField(renderer.root, 'Agent 预设')).toBe('preset-other')
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1)
    } else {
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
      expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(1)
      expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toBe('功能保存失败，请重试。')
    }
  })
})

describe('experiment workbench unavailable preset editor', () => {
  it.each(['missing', 'broken'])('retains the stored %s preset until an explicit available selection is saved', async state => {
    const data = fullProjection()
    const storedId = state === 'missing' ? 'removed-preset' : 'broken-preset'
    const binding = data.functions.find(item => item.function_id === 'prompt')!
    Object.assign(binding, { preset_id: storedId, requested_skill: 'comfyui-generate', request_template: '保留原有执行要求 {{requirements_block}}' })
    const original = structuredClone(binding)
    const environment: WorkbenchEnvironment = {
      ...functionEnvironment,
      presets: [{ id: 'broken-preset', name: '损坏预设', broken: 'Missing component' }, ...functionEnvironment.presets],
    }
    const getEnvironment = vi.fn(async ({ presetId }: { presetId?: string }) => ({
      ...environment, skills: presetId === 'preset' ? functionEnvironment.skills : [],
    }))
    const onAction = vi.fn(async request => { Object.assign(data.functions.find(item => item.function_id === request.id)!, request.value) })
    const { renderer } = await mount(data, { onAction, remote: { getEnvironment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    expect(readField(renderer.root, 'prompt的默认预设')).toBe(storedId)
    await click(renderer, '编辑prompt')
    expect(readField(renderer.root, 'Agent 预设')).toBe(storedId)
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }).findAllByType('option').map(option => option.props.value)).toEqual([storedId, 'preset', 'preset-other'])
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '指定 Skill' }))).toBe('无')
    expect(readField(renderer.root, '指定 Skill')).toBe('')
    expect(readField(renderer.root, '执行要求')).toBe(original.request_template)
    expect(readField(renderer.root, 'Agent 提供商')).toBe(original.agent_model.provider)
    expect(readField(renderer.root, 'Agent 模型')).toBe(original.agent_model.model)
    expect(readField(renderer.root, '推理等级')).toBe(original.agent_model.reasoningEffort)
    expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toContain('预设已不可用')
    expect(renderer.root.findAllByType('button').find(node => nodeText(node) === '保存功能')!.props.disabled).toBe(true)
    expect(getEnvironment.mock.calls.filter(([request]) => request.presetId === 'preset')).toHaveLength(0)
    await click(renderer, '取消')
    expect(onAction).not.toHaveBeenCalled()
    expect(binding).toEqual(original)
    expect(readField(renderer.root, 'prompt的默认预设')).toBe(storedId)
    await click(renderer, '编辑prompt')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(binding).toEqual(original)
    await change(renderer, 'Agent 预设', 'preset')
    await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
    expect(binding).toMatchObject({ ...original, preset_id: 'preset', requested_skill: null })
    await click(renderer, '编辑prompt')
    expect(getEnvironment).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', presetId: 'preset' })
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '指定 Skill' }))).toBe('Agent 自选comfyui-generate')
    expect(readField(renderer.root, '指定 Skill')).toBe('')
  })
})

describe('experiment workbench unavailable preset choices', () => {
  it.each(['empty', 'all-broken'])('retains the unavailable preset and blocks saving when the available roster is %s', async state => {
    const data = fullProjection()
    const binding = data.functions.find(item => item.function_id === 'prompt')!
    binding.preset_id = 'removed-preset'
    const original = structuredClone(binding)
    const environment: WorkbenchEnvironment = {
      ...functionEnvironment, skills: [], presets: state === 'empty' ? [] : [{ id: 'broken-preset', name: '损坏预设', broken: 'Missing component' }],
    }
    const { renderer, onAction } = await mount(data, { remote: { getEnvironment: async () => environment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    expect(readField(renderer.root, 'Agent 预设')).toBe('removed-preset')
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }).findAllByType('option')).toHaveLength(1)
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '指定 Skill' }))).toBe('无')
    expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toContain('预设已不可用')
    expect(renderer.root.findAllByType('button').find(node => nodeText(node) === '保存功能')!.props.disabled).toBe(true)
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(onAction).not.toHaveBeenCalled()
    await click(renderer, '取消')
    expect(binding).toEqual(original)
  })

  it('loads a replacement preset Skill directory only after the user explicitly changes the selected preset', async () => {
    const data = fullProjection()
    const binding = data.functions.find(item => item.function_id === 'prompt')!
    binding.preset_id = 'removed-preset'
    binding.request_template = '手工切换后保留 {{requirements_block}}'
    const getEnvironment = vi.fn(async ({ presetId }: { presetId?: string }) => ({
      ...functionEnvironment,
      skills: presetId === 'preset' ? functionEnvironment.skills : presetId === 'preset-other' ? [{ name: 'other-skill', description: '其他预设 Skill' }] : [],
    }))
    const { renderer } = await mount(data, { remote: { getEnvironment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    expect(readField(renderer.root, 'Agent 预设')).toBe('removed-preset')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '指定 Skill' }))).toBe('无')
    expect(getEnvironment.mock.calls.filter(([request]) => request.presetId === 'preset')).toHaveLength(0)
    await change(renderer, 'Agent 预设', 'preset-other')
    expect(getEnvironment).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', presetId: 'preset-other' })
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '指定 Skill' }))).toBe('Agent 自选other-skill')
    await change(renderer, '指定 Skill', 'other-skill')
    await change(renderer, 'Agent 预设', 'preset')
    expect(getEnvironment).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', presetId: 'preset' })
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '指定 Skill' }))).toBe('Agent 自选comfyui-generate')
    expect(readField(renderer.root, '指定 Skill')).toBe('')
    expect(readField(renderer.root, '执行要求')).toBe('手工切换后保留 {{requirements_block}}')
  })
})


describe('experiment workbench task notifications', () => {
  it('keeps the submitted request on its page and opens its exact task card only from the toast', async () => {
    let data = fullProjection()
    data.functions.find(binding => binding.function_id === 'parameters')!.name = '建议参数'
    const accepted = { ...makeTask('accepted-task', 'child', 'parameters'), title: '建议参数', status: 'running' as const }
    const onAction = vi.fn(async () => {
      data = { ...data, tasks: [...data.tasks, accepted] }
      return { workspaceId: 'workspace-a', workId: 'work-a', branchId: 'child', taskId: accepted.task_id }
    })
    const target = { scrollIntoView: vi.fn(), focus: vi.fn() }
    const { renderer } = await mount(data, {
      onAction,
      remote: { getProjection: async () => structuredClone(data) },
    }, { createNodeMock: element => element.props['data-task'] === accepted.task_id ? target : null })
    await click(renderer, '资源')
    await click(renderer, '建议参数')
    await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
    expect(renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
    expect(readField(renderer.root, '分支名称')).toBe('主分支')
    const toast = renderer.root.findByProps({ className: 'toast' })
    expect(nodeText(toast)).toContain('建议参数任务已提交 · accepted-task')
    expect(target.scrollIntoView).not.toHaveBeenCalled()
    await click(renderer, '查看任务')
    expect(renderer.root.findByProps({ 'aria-label': '任务' }).props.className).toBe('active')
    expect(readField(renderer.root, '分支名称')).toBe('暖光探索')
    expect(target.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'start' })
    expect(target.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
  })
})


describe('experiment workbench task status notifications', () => {
  it.each([
    ['succeeded', '已完成'],
    ['waiting_input', '需要补充输入'],
    ['conflict', '的结果待采用'],
  ] as const)('announces %s on the current page with the Task ID and preserves scrolling', async (outcome, label) => {
    vi.useFakeTimers()
    const task = { ...makeTask('observed-task', 'child', 'parameters'), title: '光线生成', status: 'running' as const }
    task.output_contract.apply_mode = 'automatic'
    let data: WorkbenchProjection = { ...fullProjection(), tasks: [task] }
    const inspector = { scrollTop: 172, scrollLeft: 0, dataset: {} }
    const target = { scrollIntoView: vi.fn(), focus: vi.fn() }
    const { renderer } = await mount(data, { remote: { getProjection: async () => structuredClone(data) } }, {
      createNodeMock: element => element.props.className === 'inspector-body' ? inspector : element.props['data-task'] === task.task_id ? target : null,
    })
    await click(renderer, '资源')
    await act(() => renderer.root.findByProps({ className: 'inspector-body' }).props.onScroll({ currentTarget: inspector }))
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
    data = { ...data, tasks: [{ ...task, status: outcome === 'conflict' ? 'succeeded' : outcome }] }
    if (outcome === 'conflict') data.artifacts = [{
      artifact_id: 'conflicting-prompt', task_id: task.task_id, type: 'prompt',
      artifact: { type: 'prompt', positive_prompt: '候选光线', negative_prompt: '' },
      source_files: [], session_id: task.session_id!, turn: 1, call_id: 'publish', skill_refs: [],
      disposition: 'candidate', applied_target: null, created_at: 2000,
    }]
    await deliverChanges()
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain(`光线生成${label} · observed-task`)
    expect(renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
    expect(readField(renderer.root, '分支名称')).toBe('主分支')
    expect(inspector.scrollTop).toBe(172)
    expect(target.scrollIntoView).not.toHaveBeenCalled()
    await click(renderer, '查看任务')
    expect(target.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'start' })
    expect(renderer.root.findByProps({ 'aria-label': '任务' }).props.className).toBe('active')
    if (outcome === 'conflict') {
      const card = renderer.root.findByProps({ className: 'agent-task-card' })
      expect(nodeText(card.findByProps({ className: 'task-conflict' }))).toBe('任务输入已改变，请核对产物后采用。')
    }
  })
})


describe('experiment workbench task controls preserve navigation', () => {
  it('interrupts an Agent with an in-flight Run and retains its original task card and results', async () => {
    const task = { ...makeTask('in-flight-task', 'child'), status: 'waiting_generation' as const, execution_state: 'running' as const }
    let data: WorkbenchProjection = { ...fullProjection(), tasks: [task], runs: [makeRun('in-flight-run', task.task_id, 'remote_running')] }
    const onAction = vi.fn(async () => {
      data = { ...data, tasks: [{ ...task, status: 'interrupted', execution_state: 'interrupted' }] }
      return { workspaceId: 'workspace-a', workId: 'work-a', branchId: 'child' }
    })
    const { renderer } = await mount(data, { onAction, remote: { getProjection: async () => structuredClone(data) } })
    await click(renderer, '任务')
    await click(renderer, '中断任务')
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'task-interrupt', taskId: task.task_id }))
    expect(renderer.root.findByProps({ 'aria-label': '任务' }).props.className).toBe('active')
    const card = renderer.root.findByProps({ className: 'agent-task-card' })
    expect(nodeText(card)).toContain('已中断')
    expect(nodeText(card)).toContain('继续任务')
    expect(nodeText(card)).toContain('查看运行 in-flight-run')
    expect(data.runs[0]!.status).toBe('remote_running')
  })

  it('continues the original interrupted task without leaving the task page', async () => {
    const task = { ...makeTask('resume-task', 'child', 'parameters'), status: 'interrupted' as const }
    let data: WorkbenchProjection = { ...fullProjection(), tasks: [task] }
    const onAction = vi.fn(async () => {
      data = { ...data, tasks: [{ ...task, status: 'running' }] }
      return { workspaceId: 'workspace-a', workId: 'work-a', branchId: 'child' }
    })
    const { renderer } = await mount(data, { onAction, remote: { getProjection: async () => structuredClone(data) } })
    await click(renderer, '任务')
    await click(renderer, '继续任务')
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'task-resume', taskId: task.task_id }))
    expect(renderer.root.findByProps({ 'aria-label': '任务' }).props.className).toBe('active')
    expect(renderer.root.findByProps({ className: 'agent-task-card' }).props['data-task']).toBe(task.task_id)
    expect(nodeText(renderer.root.findByProps({ className: 'agent-task-card' }))).toContain('Agent 执行中')
  })
})


describe('experiment workbench all task submission receipts', () => {
  it.each(['run', 'experiment', 'retry', 'diagnose'] as const)('links the %s receipt to its accepted Task without changing the current page', async kind => {
    let data = fullProjection()
    const functionKind = kind === 'retry' ? 'run' : kind
    data.functions.find(binding => binding.function_id === functionKind)!.name = '当前功能'
    if (kind === 'experiment') data.branches[0]!.execution.mode = 'continuous'
    if (kind === 'retry' || kind === 'diagnose') data.runs[0]!.status = 'failed'
    const accepted = { ...makeTask('accepted-' + kind, 'root', functionKind), status: 'running' as const }
    const onAction = vi.fn(async () => {
      data = { ...data, tasks: [...data.tasks, accepted] }
      return { workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root', taskId: accepted.task_id }
    })
    const { renderer } = await mountReady(data, { onAction, remote: { getProjection: async () => structuredClone(data) } })
    if (kind === 'run' || kind === 'experiment') await click(renderer, '资源')
    await click(renderer, { run: '运行任务', experiment: '开始实验', retry: '重试任务', diagnose: '诊断失败' }[kind])
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain(`当前功能任务已提交 · ${accepted.task_id}`)
    expect(renderer.root.findByProps({ 'aria-label': kind === 'run' || kind === 'experiment' ? '资源' : '运行结果' }).props.className).toBe('active')
    expect(renderer.root.findAllByProps({ className: 'agent-task-card' })).toHaveLength(0)
    await click(renderer, '查看任务')
    expect(renderer.root.findAllByProps({ className: 'agent-task-card' }).map(card => card.props['data-task'])).toContain(accepted.task_id)
  })
})


describe('experiment workbench task notification lifecycle', () => {
  it('ignores historical completions and lets an unchanged task notification expire during polling', async () => {
    vi.useFakeTimers()
    const task = { ...makeTask('lifecycle-task', 'root', 'parameters'), title: '光线生成', status: 'running' as const }
    let data: WorkbenchProjection = { ...fullProjection(), tasks: [makeTask('historical-task'), task] }
    const { renderer } = await mount(data, { remote: { getProjection: async () => structuredClone(data) } })
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
    data = { ...data, tasks: [data.tasks[0]!, { ...task, status: 'succeeded' }] }
    await deliverChanges()
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('光线生成已完成 · lifecycle-task')
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
  })
})


describe('experiment workbench recorded task details', () => {
  it('shows the fixed task input, delivered request, actual model and accepted artifact independently from the current draft', async () => {
    const data = fullProjection()
    const task = makeTask('recorded-task', 'root', 'parameters')
    task.input.prompt_input.positive_prompt = '任务接纳时的提示词'
    task.request_text = '实际投递文本 recorded-task'
    task.selected_model = { provider: 'actual-provider', model: 'actual-model', reasoningEffort: 'high' }
    task.binding_snapshot = { ...task.binding_snapshot, preset_id: 'recorded-preset', agentModel: { provider: 'requested-provider', model: 'requested-model', reasoningEffort: 'medium' } }
    data.functions = data.functions.map(binding => binding.function_id === 'parameters'
      ? { ...binding, preset_id: 'later-preset', agent_model: { provider: 'later-provider', model: 'later-model', reasoningEffort: 'low' } } : binding)
    task.input.reference_run_ids = ['recorded-evidence']
    data.runs = [makeRun('recorded-evidence', task.task_id)]
    data.tasks = [task]
    data.branches[0]!.draft.prompt_input.positive_prompt = '用户后来修改的提示词'
    data.artifacts = [{
      artifact_id: 'recorded-prompt', task_id: task.task_id, type: 'prompt',
      artifact: { type: 'prompt', positive_prompt: '产物提示词', negative_prompt: '产物负向词' },
      source_files: [], session_id: task.session_id!, turn: 2, call_id: 'publish-call', skill_refs: [],
      disposition: 'applied', applied_target: null, created_at: 2000,
    }]
    const { renderer } = await mount(data)
    await click(renderer, '任务')
    const details = renderer.root.findByProps({ className: 'task-input' })
    expect(nodeText(details)).toContain('实际投递文本 recorded-task')
    expect(JSON.parse(nodeText(details.findByProps({ 'aria-label': '任务输入 JSON' }))).prompt_input.positive_prompt).toBe('任务接纳时的提示词')
    expect(JSON.parse(nodeText(details.findByProps({ 'aria-label': 'Agent 调用配置 JSON' })))).toEqual({
      create: { workspaceId: 'workspace-a', sessionId: 'session-recorded-task', agentPreset: 'recorded-preset' },
      selectModel: { sessionId: 'session-recorded-task', provider: 'requested-provider', model: 'requested-model', reasoningEffort: 'medium' },
      selectModelResult: { selected: { provider: 'actual-provider', model: 'actual-model', reasoningEffort: 'high' } },
    })
    expect(JSON.parse(nodeText(details.findByProps({ 'aria-label': '产物 JSON' })))).toEqual([data.artifacts[0]!.artifact])
    expect(nodeText(details)).not.toContain('用户后来修改的提示词')
    expect(nodeText(details)).toContain('参考运行recorded-evidence')
    await click(renderer, 'recorded-evidence')
    expect(renderer.root.findByProps({ 'aria-label': '运行结果' }).props.className).toBe('active')
    expect(renderer.root.findByProps({ 'aria-label': '查看运行 recorded-evidence' }).props['aria-pressed']).toBe(true)
  })
})


describe('experiment workbench continuous task control ownership', () => {
  it('keeps experiment controls in the inspector instead of duplicating task card controls', async () => {
    const data = fullProjection()
    data.tasks = [
      { ...makeTask('running-experiment', 'root', 'experiment'), status: 'running', execution_state: 'running' },
      { ...makeTask('interrupted-experiment', 'root', 'experiment'), status: 'interrupted', execution_state: 'interrupted' },
    ]
    const { renderer } = await mount(data)
    await click(renderer, '任务')
    for (const card of renderer.root.findAllByProps({ className: 'agent-task-card' })) {
      expect(card.findAllByType('button').map(nodeText)).not.toContain('中断任务')
      expect(card.findAllByType('button').map(nodeText)).not.toContain('继续任务')
    }
  })
})


describe('experiment workbench task reply isolation', () => {
  it('replies to the displayed question on its original task while preserving the other question and task page', async () => {
    let data: WorkbenchProjection = { ...fullProjection(), tasks: [
      { ...makeTask('first-question', 'root', 'parameters'), status: 'waiting_input' },
      { ...makeTask('second-question', 'child', 'parameters'), status: 'waiting_input' },
    ] }
    data.artifacts = data.tasks.map((task, index) => ({
      artifact_id: 'question-' + index, task_id: task.task_id, type: 'question',
      artifact: { type: 'question', question: index ? '保留哪个场景？' : '希望使用哪种光线？', options: [] },
      source_files: [], session_id: task.session_id!, turn: 1, call_id: 'ask', skill_refs: [],
      disposition: 'waiting_input', applied_target: null, created_at: 2000,
    }))
    const onAction = vi.fn(async () => {
      data = { ...data, tasks: data.tasks.map(task => task.task_id === 'first-question'
        ? { ...task, status: 'running', answers: [{ question_artifact_id: 'question-0', answer: '自然光' }] } : task) }
      return { workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root' }
    })
    const { renderer } = await mount(data, { onAction, remote: { getProjection: async () => structuredClone(data) } })
    await click(renderer, '任务')
    const original = renderer.root.findAllByProps({ className: 'agent-task-card' }).find(card => card.props['data-task'] === 'first-question')!
    await act(async () => original.findByProps({ className: 'task-answer' }).props.onSubmit({ preventDefault() {}, currentTarget: { answer: '自然光' } }))
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'task-answer', taskId: 'first-question', id: 'question-0', value: '自然光' }))
    expect(renderer.root.findByProps({ 'aria-label': '任务' }).props.className).toBe('active')
    const cards = renderer.root.findAllByProps({ className: 'agent-task-card' })
    expect(nodeText(cards.find(card => card.props['data-task'] === 'first-question')!)).toContain('Agent 执行中')
    expect(nodeText(cards.find(card => card.props['data-task'] === 'second-question')!.findByProps({ className: 'task-answer' }))).toContain('保留哪个场景？')
  })
})

describe('experiment workbench task notification workspace scope', () => {
  it('clears the task toast on a workspace switch and preserves the target workspace work selection', async () => {
    let data = fullProjection()
    const onAction = vi.fn(async () => ({ workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root', taskId: 'workspace-a-task' }))
    const second = { ...empty, workspace_id: 'workspace-b', work_id: 'only-work',
      works: [{ work_id: 'only-work', workspace_id: 'workspace-b', name: '第二工作区工作', goal: '' }],
      branches: [{ ...data.branches[0]!, branch_id: 'second-root', work_id: 'only-work' }],
    }
    const { renderer } = await mount(data, {
      onAction,
      workspaces: [{ id: 'workspace-a', name: '工作区 A', path: '/projects/a' }, { id: 'workspace-b', name: '工作区 B', path: '/projects/b' }],
      remote: { getProjection: async scope => structuredClone(scope.workspaceId === 'workspace-b' ? second : data) },
    })
    await click(renderer, '建议参数')
    await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('workspace-a-task')
    await change(renderer, '切换工作区', 'workspace-b')
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
    expect(readField(renderer.root, '切换工作')).toBe('only-work')
    await click(renderer, '任务')
    expect(renderer.root.findAllByProps({ className: 'agent-task-card' })).toHaveLength(0)
    expect(readField(renderer.root, '切换工作')).toBe('only-work')
  })
})


describe('experiment workbench task review conflict', () => {
  it('shows the prototype evaluation draft guidance for a candidate review artifact', async () => {
    const data = fullProjection()
    const task = makeTask('review-conflict', 'root', 'review')
    task.output_contract.apply_mode = 'automatic'
    task.apply_target = { kind: 'run_review', id: 'r1', expected: {} }
    data.tasks = [task]
    data.artifacts = [{
      artifact_id: 'candidate-review', task_id: task.task_id, type: 'review',
      artifact: { type: 'review', observation: '花房有自然光', conclusion: '保留当前光线', run_ids: ['r1'] },
      source_files: [], session_id: task.session_id!, turn: 1, call_id: 'review', skill_refs: [],
      disposition: 'candidate', applied_target: null, created_at: 2000,
    }]
    const { renderer } = await mount(data)
    await click(renderer, '任务')
    expect(nodeText(renderer.root.findByProps({ className: 'agent-task-card' }).findByProps({ className: 'task-conflict' })))
      .toBe('评价与经验草稿已修改，请核对产物后填入。')
  })
})


describe('experiment workbench parallel task notification delivery', () => {
  it('shows same-poll completion and question notices for six seconds each and opens each exact task', async () => {
    vi.useFakeTimers()
    const first = { ...makeTask('parallel-complete', 'child', 'prompt'), title: '光线生成', status: 'running' as const }
    const second = { ...makeTask('parallel-question', 'root', 'prompt'), title: '场景改写', status: 'running' as const }
    let data: WorkbenchProjection = { ...fullProjection(), tasks: [first, second] }
    const targets = new Map([first, second].map(task => [task.task_id, { focus: vi.fn(), scrollIntoView: vi.fn() }]))
    const { renderer } = await mount(data, { remote: { getProjection: async () => structuredClone(data) } }, {
      createNodeMock: element => targets.get(String(element.props['data-task'])) ?? null,
    })
    await click(renderer, '资源')
    data = { ...data, tasks: [{ ...first, status: 'succeeded' }, { ...second, status: 'waiting_input' }] }
    await deliverChanges()
    const toast = () => nodeText(renderer.root.findByProps({ className: 'toast' }))
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(1)
    expect(toast()).toContain('光线生成已完成 · parallel-complete')
    expect(renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
    await act(async () => { await vi.advanceTimersByTimeAsync(5999) })
    expect(toast()).toContain('parallel-complete')
    await click(renderer, '查看任务')
    expect(targets.get(first.task_id)!.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'start' })
    expect(readField(renderer.root, '分支名称')).toBe('暖光探索')
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(1)
    expect(toast()).toContain('场景改写需要补充输入 · parallel-question')
    expect(targets.get(second.task_id)!.scrollIntoView).not.toHaveBeenCalled()
    await click(renderer, '查看任务')
    expect(targets.get(second.task_id)!.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'start' })
    expect(readField(renderer.root, '分支名称')).toBe('主分支')
    await act(async () => { await vi.advanceTimersByTimeAsync(5999) })
    expect(toast()).toContain('parallel-question')
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
  })
})


describe('experiment workbench task notifications with action errors', () => {
  it('shows an action error immediately and then delivers both pending task notices', async () => {
    vi.useFakeTimers()
    const first = { ...makeTask('error-queue-first', 'child', 'prompt'), title: '光线生成', status: 'running' as const }
    const second = { ...makeTask('error-queue-second', 'root', 'prompt'), title: '场景改写', status: 'running' as const }
    let data: WorkbenchProjection = { ...fullProjection(), tasks: [first, second] }
    const { renderer } = await mountReady(data, {
      remote: { getProjection: async () => structuredClone(data) },
      onAction: vi.fn().mockRejectedValue(new Error('当前实例暂不可用，请重试。')),
    })
    data = { ...data, tasks: [{ ...first, status: 'succeeded' }, { ...second, status: 'waiting_input' }] }
    await deliverChanges()
    const toast = () => nodeText(renderer.root.findByProps({ className: 'toast' }))
    expect(toast()).toContain('error-queue-first')
    await click(renderer, '运行任务')
    expect(toast()).toBe('当前实例暂不可用，请重试。')
    await act(async () => { await vi.advanceTimersByTimeAsync(5999) })
    expect(toast()).toBe('当前实例暂不可用，请重试。')
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(toast()).toContain('光线生成已完成 · error-queue-first')
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(toast()).toContain('场景改写需要补充输入 · error-queue-second')
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
  })
})


describe('experiment workbench task notification retention during forms', () => {
  it.each(['branch', 'model'] as const)('preserves both queued Task notices after the %s action', async operation => {
    vi.useFakeTimers()
    const first = { ...makeTask('form-queue-first', 'child', 'prompt'), title: '光线生成', status: 'running' as const }
    const second = { ...makeTask('form-queue-second', 'root', 'prompt'), title: '场景改写', status: 'running' as const }
    let data: WorkbenchProjection = { ...fullProjection(), tasks: [first, second] }
    const catalog = makeCatalog()
    vi.mocked(catalog.search).mockImplementation(async request => ({ ...request, totalCount: 1, items: [
      { ...catalogItems[0]!, context: { kind: 'model', id: '21', file_name: 'anima.safetensors' }, label: 'ANIMA3' },
    ] }))
    const targets = new Map([first, second].map(task => [task.task_id, { focus: vi.fn(), scrollIntoView: vi.fn() }]))
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
      if (request.type === 'create-branch') {
        data = { ...data, branches: [...data.branches, { ...data.branches[0]!, branch_id: 'created-branch', parent_branch_id: 'root', name: '追加分支' }] }
        return { workspaceId: 'workspace-a', workId: 'work-a', branchId: 'created-branch' }
      }
      return { workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root' }
    })
    const { renderer } = await mount(data, {
      catalog, onAction,
      remote: {
        getProjection: async () => structuredClone(data),
      },
    }, { createNodeMock: element => targets.get(String(element.props['data-task'])) ?? null })
    data = { ...data, tasks: [{ ...first, status: 'succeeded' }, { ...second, status: 'waiting_input' }] }
    await deliverChanges()
    const toast = () => nodeText(renderer.root.findByProps({ className: 'toast' }))
    expect(toast()).toContain('光线生成已完成 · form-queue-first')
    if (operation === 'model') {
      await click(renderer, '更换生成模型')
      await click(renderer, '选择 ANIMA3')
    } else {
      await click(renderer, '创建子分支')
      const form = renderer.root.findByProps({ role: 'dialog' }).findAllByType('form')[0]!
      await act(async () => form.props.onSubmit({ preventDefault() {}, currentTarget: { name: '追加分支', goal: '保留窗框' } }))
    }
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: operation === 'model' ? 'resource-select' : 'create-branch' }))
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    expect(toast()).toContain('光线生成已完成 · form-queue-first')
    await click(renderer, '查看任务')
    expect(targets.get(first.task_id)!.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'start' })
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(toast()).toContain('场景改写需要补充输入 · form-queue-second')
    await click(renderer, '查看任务')
    expect(targets.get(second.task_id)!.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'start' })
  })
})


describe('experiment workbench missing recorded session setup', () => {
  it.each([null, 'recorded-session'])('marks missing session setup or actual model selection as unrecorded for session %s', async sessionId => {
    const data = fullProjection()
    const task = { ...makeTask('incomplete-session-setup', 'root', 'prompt'), session_id: sessionId, selected_model: null }
    data.tasks = [task]
    const { renderer } = await mount(data)
    await click(renderer, '任务')
    const setup = JSON.parse(nodeText(renderer.root.findByProps({ 'aria-label': 'Agent 调用配置 JSON' })))
    expect(setup.selectModelResult).toBe('未记录')
    if (sessionId === null) {
      expect(setup.create).toBe('未记录')
      expect(setup.selectModel).toBe('未记录')
    } else {
      expect(setup.create).toEqual({ workspaceId: 'workspace-a', sessionId: 'recorded-session', agentPreset: 'preset' })
      expect(setup.selectModel).toEqual({ sessionId: 'recorded-session', provider: 'provider', model: 'model', reasoningEffort: 'high' })
    }
  })
})


describe('experiment workbench completed task controls', () => {
  it('keeps a succeeded task complete while its Agent session still reports running', async () => {
    const data = fullProjection()
    data.tasks = [{ ...makeTask('published-task', 'root', 'prompt'), status: 'succeeded', execution_state: 'running' }]
    const { renderer, onAction } = await mount(data)
    await click(renderer, '任务')
    const card = renderer.root.findByProps({ className: 'agent-task-card' })
    expect(nodeText(card.findByProps({ className: 'pill ' }))).toBe('已完成')
    expect(card.findAllByType('button').map(nodeText)).not.toContain('中断任务')
    expect(onAction).not.toHaveBeenCalled()
  })
})


describe('experiment workbench follow-up question notification', () => {
  it('notifies a new question on a previously answered task and replies to the new question', async () => {
    vi.useFakeTimers()
    const task = { ...makeTask('follow-up-task', 'root', 'prompt'), title: '光线生成', status: 'running' as const,
      answers: [{ question_artifact_id: 'answered-question', answer: '自然光' }] }
    let data: WorkbenchProjection = { ...fullProjection(), tasks: [task], artifacts: [{
      artifact_id: 'answered-question', task_id: task.task_id, type: 'question',
      artifact: { type: 'question', question: '希望使用哪种光线？', options: [] },
      source_files: [], session_id: task.session_id!, turn: 1, call_id: 'first-question', skill_refs: [],
      disposition: 'waiting_input', applied_target: null, created_at: 2000,
    }] }
    const target = { focus: vi.fn(), scrollIntoView: vi.fn() }
    const onAction = vi.fn(async () => {
      data = { ...data, tasks: [{ ...task, answers: [...task.answers, { question_artifact_id: 'new-question', answer: '保留玻璃花房' }] }] }
      return { workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root' }
    })
    const { renderer } = await mount(data, { onAction, remote: { getProjection: async () => structuredClone(data) } }, {
      createNodeMock: element => element.props['data-task'] === task.task_id ? target : null,
    })
    data = { ...data, tasks: [{ ...task, status: 'waiting_input' }], artifacts: [...data.artifacts, {
      ...data.artifacts[0]!, artifact_id: 'new-question',
      artifact: { type: 'question', question: '保留哪个场景？', options: [] }, call_id: 'follow-up-question', created_at: 3000,
    }] }
    await deliverChanges()
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('光线生成需要补充输入 · follow-up-task')
    await click(renderer, '查看任务')
    expect(target.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'start' })
    const form = renderer.root.findByProps({ className: 'task-answer' })
    expect(nodeText(form.findAllByType('span')[0]!)).toBe('保留哪个场景？')
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
    await act(async () => form.props.onSubmit({ preventDefault() {}, currentTarget: { answer: '保留玻璃花房' } }))
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'task-answer', taskId: 'follow-up-task', id: 'new-question', value: '保留玻璃花房',
    }))
    expect(renderer.root.findByProps({ 'aria-label': '任务' }).props.className).toBe('active')
    expect(nodeText(renderer.root.findByProps({ className: 'agent-task-card' }))).toContain('Agent 执行中')
  })
})


describe('experiment workbench displayed artifact adoption', () => {
  it('adopts the original Task target snapshot and opens that branch input after preserving the task page', async () => {
    let data = fullProjection()
    const task = makeTask('adoption-task', 'child', 'prompt')
    data.tasks = [task]
    data.branches[0]!.draft.prompt_input.positive_prompt = '当前分支手工文本'
    data.branches[1]!.draft.prompt_input.positive_prompt = '目标分支手工文本'
    const expected = structuredClone(data.branches[1]!.draft)
    task.apply_target.expected = { 'prompt_input.positive_prompt': '任务创建时文本' }
    data.artifacts = [{
      artifact_id: 'adoption-prompt', task_id: task.task_id, type: 'prompt',
      artifact: { type: 'prompt', positive_prompt: 'Agent 候选文本', negative_prompt: '候选负向文本' },
      source_files: [], session_id: task.session_id!, turn: 1, call_id: 'publish', skill_refs: [],
      disposition: 'candidate', applied_target: null, created_at: 2000,
    }]
    const onAction = vi.fn(async () => {
      data = { ...data, branches: data.branches.map(branch => branch.branch_id === 'child'
        ? { ...branch, draft: { ...branch.draft, prompt_input: { positive_prompt: 'Agent 候选文本', negative_prompt: '候选负向文本' } } } : branch),
        artifacts: data.artifacts.map(artifact => ({ ...artifact, disposition: 'applied' as const })) }
      return { workspaceId: 'workspace-a', workId: 'work-a', branchId: 'child' }
    })
    const { renderer } = await mount(data, { onAction, remote: { getProjection: async () => structuredClone(data) } })
    await click(renderer, '任务')
    await click(renderer, '采用提示词')
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'task-apply', taskId: 'adoption-task', branchId: 'child', id: 'adoption-prompt', value: expected,
    }))
    expect(renderer.root.findByProps({ 'aria-label': '任务' }).props.className).toBe('active')
    await click(renderer, '查看任务输入')
    expect(readField(renderer.root, '分支名称')).toBe('暖光探索')
    expect(readField(renderer.root, '正向提示词')).toBe('Agent 候选文本')
    expect(readField(renderer.root, '负向提示词')).toBe('候选负向文本')
  })
})


describe('experiment workbench current task artifact', () => {
  it('renders only the latest non-question result with parameter IDs and one shared action row', async () => {
    const data = fullProjection(), task = makeTask('latest-artifact', 'root', 'parameters')
    data.tasks = [task]
    const base = { task_id: task.task_id, source_files: [], session_id: task.session_id!, turn: 1, skill_refs: [], applied_target: null }
    data.artifacts = [
      { ...base, artifact_id: 'earlier-prompt', type: 'prompt', artifact: { type: 'prompt', positive_prompt: '先前结果', negative_prompt: '' }, call_id: 'old', disposition: 'applied', created_at: 1000 },
      { ...base, artifact_id: 'latest-parameters', type: 'parameters', artifact: { type: 'parameters', parameters: { steps_71: 35, denoise_82: 0.6, enabled_91: false } }, call_id: 'new', disposition: 'candidate', created_at: 2000 },
      { ...base, artifact_id: 'latest-question', type: 'question', artifact: { type: 'question', question: '还需要补充吗？', options: [] }, call_id: 'question', disposition: 'waiting_input', created_at: 3000 },
    ]
    const { renderer, onAction } = await mount(data)
    await click(renderer, '任务')
    const card = renderer.root.findByProps({ className: 'agent-task-card' })
    const outputs = card.findAllByProps({ className: 'task-output' })
    expect(outputs).toHaveLength(1)
    expect(outputs[0]!.findAllByType('h3').map(nodeText)).toEqual(['参数建议'])
    expect(outputs[0]!.findAllByType('dt').map(nodeText)).toEqual(['steps_71', 'denoise_82', 'enabled_91'])
    expect(outputs[0]!.findAllByType('dd').map(nodeText)).toEqual(['35', '0.6', 'false'])
    const actions = card.findByProps({ className: 'row task-actions' })
    expect(actions.findAllByType('button').map(nodeText)).toEqual(['采用参数', '从产物创建分支'])
    expect(JSON.parse(nodeText(card.findByProps({ 'aria-label': '产物 JSON' })))).toHaveLength(3)
    await click(renderer, '采用参数')
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'latest-parameters', value: data.branches[0]!.draft }))
  })
})


describe('experiment workbench artifact adoption through Remote', () => {
  it.each(['current', 'stale'] as const)('applies a %s displayed snapshot through the actual Remote and shows the target input', async version => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
    try {
      const root = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '候选采用', goal: '保留玻璃花房' } }, signal)
      const otherWork = await host.remote.mutate({ type: 'new-work', workspaceId: root.workspaceId, value: { name: '其他工作', goal: '验证工作隔离' } }, signal)
      const child = await host.remote.mutate({ ...root, type: 'create-branch', value: { name: '来源分支', original_request: '保留玻璃花房' } }, signal)
      await host.remote.mutate({ ...child, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      await setHostField(host, { ...child, field: 'positive_prompt', value: '任务创建时文本' }, signal)
      const accepted = await host.remote.mutate({ ...child, type: 'agent-action', id: 'prompt' }, signal)
      const workScope = { workspaceId: root.workspaceId, workId: root.workId }
      const before = await host.remote.getProjection(workScope, signal), task = before.tasks.find(task => task.task_id === accepted.taskId)!
      await setHostField(host, { ...child, field: 'positive_prompt', value: '第一次手工文本' }, signal)
      const turn = (await host.remote.promptList({ workspace_id: root.workspaceId, task_id: task.task_id }, signal))[0]!
      completePrompt(host, turn, { type: 'prompt', positive_prompt: 'Agent 候选文本', negative_prompt: '候选负向文本' })
      await vi.waitFor(() => expect(host.store.listArtifacts(task.task_id).some(artifact => artifact.disposition === 'candidate')).toBe(true))
      const published = host.store.listArtifacts(task.task_id).find(artifact => artifact.type === 'prompt')!
      expect(published.disposition).toBe('candidate')
      const shown = await host.remote.getProjection(workScope, signal)
      let frozen = true
      const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
        frozen = false
        return host.remote.mutate(request, signal)
      })
      const { renderer } = await mount(shown, {
        workspaceId: root.workspaceId, workspaces: [{ id: root.workspaceId, name: '测试工作区', path: '/workspace/project' }],
        onAction,
        remote: { getProjection: async scope => frozen ? structuredClone(shown) : host.remote.getProjection(scope, signal),
          getInputDescription: scope => host.remote.getInputDescription(scope, signal), getRunInput: request => host.remote.getRunInput(request, signal) },
      })
      await click(renderer, '任务')
      if (version === 'stale') await setHostField(host, { ...child, field: 'positive_prompt', value: '第二窗口手工文本' }, signal)
      await click(renderer, '采用提示词')
      expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
        type: 'task-apply', branchId: child.branchId, id: published.artifact_id,
        value: expect.objectContaining({ prompt_input: { positive_prompt: '第一次手工文本', negative_prompt: '' } }),
      }))
      expect(renderer.root.findByProps({ 'aria-label': '任务' }).props.className).toBe('active')
      if (version === 'current') await click(renderer, '查看任务输入')
      else {
        expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('目标内容已改变')
        await change(renderer, '切换工作', otherWork.workId!)
        await change(renderer, '切换工作', root.workId!)
        await click(renderer, '切换分支 来源分支')
      }
      await deliverChanges()
      expect(readField(renderer.root, '分支名称')).toBe('来源分支')
      expect(readField(renderer.root, '正向提示词')).toBe(version === 'current' ? 'Agent 候选文本' : '第二窗口手工文本')
      expect(readField(renderer.root, '负向提示词')).toBe(version === 'current' ? '候选负向文本' : '未填写')
      await act(() => renderer.unmount())
    } finally { await host.dispose() }
  })
})


describe('experiment workbench recommended resource details', () => {
  it('shows actual candidate names and opens the matching Catalog detail without changing current resources', async () => {
    const data = fullProjection(), task = makeTask('resource-candidate', 'child', 'resources'), catalog = makeCatalog()
    data.tasks = [task]
    data.artifacts = [{ artifact_id: 'resource-proposal', task_id: task.task_id, type: 'resources',
      artifact: { type: 'resources', refs: [{ kind: 'lora', id: '13' }], reason: '用于玻璃细节' },
      source_files: [], session_id: task.session_id!, turn: 1, call_id: 'resources', skill_refs: [], disposition: 'candidate', applied_target: null, created_at: 1000 }]
    const original = structuredClone(data.branches[0]!.draft)
    const { renderer, onAction } = await mount(data, { catalog })
    await click(renderer, '任务')
    const output = renderer.root.findByProps({ className: 'agent-task-card' }).findByProps({ className: 'task-output' })
    expect(output.findAllByType('b').map(nodeText)).toEqual(['玻璃 LoRA'])
    expect(output.findAllByType('button').map(nodeText)).toEqual(['查看详情'])
    await act(async () => output.findAllByType('button')[0]!.props.onClick())
    expect(renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
    expect(renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('h2').map(nodeText)).toEqual(['玻璃 LoRA'])
    expect(catalog.details).toHaveBeenCalledWith({ kind: 'lora', id: '13' }, expect.any(AbortSignal))
    expect(onAction).not.toHaveBeenCalled()
    expect(data.branches[0]!.draft).toEqual(original)
    await click(renderer, '任务')
    expect(renderer.root.findByProps({ className: 'agent-task-card' }).props['data-task']).toBe('resource-candidate')
  })
})


describe('experiment workbench generation artifact presentation', () => {
  it('retains generation input in task detail JSON without adding a result preview or adoption control', async () => {
    const data = fullProjection(), task = makeTask('generation-artifact', 'root')
    data.tasks = [task]
    data.runs = []
    data.artifacts = [{ artifact_id: 'generation-proposal', task_id: task.task_id, type: 'generation_input',
      artifact: { type: 'generation_input', generation_input: data.branches[0]!.draft.generation_input, image_refs: [], workflow_image_bindings: [] },
      source_files: [], session_id: task.session_id!, turn: 1, call_id: 'generation', skill_refs: [], disposition: 'candidate', applied_target: null, created_at: 1000 }]
    const { renderer } = await mount(data)
    await click(renderer, '任务')
    const card = renderer.root.findByProps({ className: 'agent-task-card' })
    expect(card.findAllByProps({ className: 'task-output' })).toHaveLength(0)
    expect(card.findByProps({ className: 'row task-actions' }).findAllByType('button').map(nodeText)).toEqual(['从产物创建分支'])
    expect(JSON.parse(nodeText(card.findByProps({ 'aria-label': '产物 JSON' })))).toEqual([data.artifacts[0]!.artifact])
  })
})


describe('experiment workbench Agent result delivery through Remote', () => {
  it.each(['parameters'] as const)('submits %s from its visible dialog and displays the actual published result', async kind => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
    try {
      const root = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Agent 结果', goal: '玻璃花房' } }, signal)
      const workScope = { workspaceId: root.workspaceId, workId: root.workId! }
      await host.remote.mutate({ workspaceId: root.workspaceId, type: 'function-preset', id: kind, value: 'preset-a' }, signal)
      const other = await host.remote.mutate({ type: 'new-work', workspaceId: root.workspaceId, value: { name: '刷新来源', goal: '验证结果刷新' } }, signal)
      await host.remote.mutate({ ...root, type: 'resource-select', id: '2', value: { kind: 'model', id: '2' } }, signal)

      await setHostField(host, { ...root, field: 'positive_prompt', value: '保留的正向词' }, signal)
      const child = await host.remote.mutate({ ...root, type: 'create-branch', value: { name: '另一分支', original_request: '独立场景' } }, signal)
      await setHostField(host, { ...child, field: 'positive_prompt', value: '另一分支原文' }, signal)
      const environment = await host.remote.getEnvironment({ workspaceId: root.workspaceId }, signal)
      const onAction = vi.fn((request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => host.remote.mutate(request, signal))
      const { renderer } = await mount(await host.remote.getProjection(workScope, signal), {
        workspaceId: root.workspaceId, workspaces: environment.workspaces, presets: environment.presets, instances: environment.instances,
        agentModelGroups: environment.models.groups, routableProviders: environment.models.routableProviders,
        baseModels: [{ id: '1', label: 'SDXL' }], catalog: { ...makeCatalog(), search: host.catalog.search, details: host.catalog.details }, onAction,
        remote: { subscribe: (request, streamSignal) => host.remote.subscribe(request, streamSignal), getProjection: request => host.remote.getProjection(request, signal), getInputDescription: request => host.remote.getInputDescription(request, signal), getRunInput: request => host.remote.getRunInput(request, signal), queryRecords: request => host.remote.queryRecords(request, signal),
          getTaskDraft: request => host.remote.getTaskDraft(request, signal), saveTaskDraft: request => host.remote.saveTaskDraft(request, signal) },
      })
      await click(renderer, { prompt: '生成提示词', rewrite: '改写提示词', parameters: '建议参数' }[kind])
      expect(renderer.root.findAllByProps({ className: 'toast' }).map(nodeText)).toEqual([])
      const instructions = '  保留窗框\n调整自然光  '
      await change(renderer, '任务要求', instructions)
      if (kind === 'parameters') {
        await change(renderer, '任务 ComfyUI 实例', '8')
        await change(renderer, '任务 Workflow 模板', '5')
      }
      await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'agent-action', id: kind, branchId: root.branchId }))
      const accepted = await host.remote.getProjection(workScope, signal), task = accepted.tasks[0]!
      expect(task.input.requirements.instructions).toBe('保留窗框\n调整自然光')
      const acceptedDraft = accepted.branches.find(branch => branch.branch_id === root.branchId)!.draft
      const artifact: ArtifactPayload = kind === 'parameters'
        ? { type: 'parameters', parameters: { steps: 35 } }
        : { type: 'prompt', positive_prompt: '  Agent 正向词\n保留换行  ', negative_prompt: 'Agent 负向词' }
      await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact },
        { workspaceId: root.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'result-' + kind })
      await change(renderer, '切换工作', other.workId!)
      await change(renderer, '切换工作', root.workId!)

      if (kind === 'parameters') {
        expect(readField(renderer.root, '采样步数')).toBe('35')
        expect(readField(renderer.root, '正向提示词')).toBe('保留的正向词')
      } else {
        expect(readField(renderer.root, '正向提示词')).toBe('  Agent 正向词\n保留换行  ')
        expect(readField(renderer.root, '负向提示词')).toBe('Agent 负向词')
      }
      const after = await host.remote.getProjection(workScope, signal), resultBranch = after.branches.find(branch => branch.branch_id === root.branchId)!, resultDraft = resultBranch.editing_draft ?? resultBranch.draft
      expect(after.runs).toHaveLength(0)
      expect(resultDraft.generation_input).toEqual(kind === 'parameters'
        ? { ...acceptedDraft.generation_input, parameters: { ...acceptedDraft.generation_input.parameters, steps: 35 } } : acceptedDraft.generation_input)
      await act(() => renderer.unmount())
    } finally { await host.dispose() }
  })
})


describe('prompt editing through the visible workbench', () => {
  it('offers a changed candidate after adoption while retaining the previously adopted text and original Agent result', async () => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
    try {
      const root = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '再次编辑候选', goal: '保留采用记录' } }, signal)
      await host.remote.mutate({ ...root, type: 'function-preset', id: 'prompt', value: 'preset-a' }, signal)
      await host.remote.mutate({ ...root, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      const branch = host.store.getBranch(root.branchId!)
      const turn = await host.remote.promptStart({ workspace_id: root.workspaceId, work_id: root.workId!, branch_id: root.branchId!, function_id: 'prompt', request_id: 'edit-adopted-candidate', intent: 'rewrite',
        draft: branch.editing_draft ?? branch.draft,
        input: { original_request: branch.original_request, base_model_id: (branch.editing_draft ?? branch.draft).base_model_id ?? '1', positive_prompt: 'previous portrait', negative_prompt: '', change_request: 'add side light' } }, signal)
      completePrompt(host, turn, { type: 'prompt', positive_prompt: 'first Agent result', negative_prompt: 'blur' })
      await vi.waitFor(() => expect(host.store.getPromptTurn(turn.request_id)?.status).toBe('succeeded'))
      const environment = await host.remote.getEnvironment({ workspaceId: root.workspaceId }, signal)
      const { renderer } = await mount(await host.remote.getProjection(root, signal), { workspaceId: root.workspaceId, workspaces: environment.workspaces, presets: environment.presets,
        agentModelGroups: environment.models.groups, routableProviders: environment.models.routableProviders,
        onAction: request => host.remote.mutate(request, signal),
        remote: { ...promptRemote(host, signal), getProjection: request => host.remote.getProjection(request, signal), getInputDescription: request => host.remote.getInputDescription(request, signal) } })
      await click(renderer, '查看待采用结果')
      await click(renderer, '采用生成结果')
      await vi.waitFor(() => expect(readField(renderer.root, '正向提示词')).toBe('first Agent result'))
      const first = await host.remote.promptGet({ workspace_id: root.workspaceId, request_id: turn.request_id }, signal)
      expect(first.adopted?.positive_prompt).toBe('first Agent result')
      await vi.waitFor(() => expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0))
      await click(renderer, '对比提示词')
      const adoption = () => renderer.root.findAllByType('button').find(button => nodeText(button) === '采用生成结果')!
      expect(adoption().props.disabled).toBe(true)
      await change(renderer, '生成的正向提示词', 'edited after adoption')
      await vi.waitFor(() => expect(adoption().props.disabled).toBe(false))
      const edited = await host.remote.promptGet({ workspace_id: root.workspaceId, request_id: turn.request_id }, signal)
      expect(edited).toMatchObject({ candidate: { positive_prompt: 'edited after adoption' }, adopted: first.adopted, applied_at: first.applied_at, result: { positive_prompt: 'first Agent result' } })
      expect(nodeText(renderer.root)).toContain('待采用结果已保存')
      await click(renderer, '采用生成结果')
      await vi.waitFor(() => expect(readField(renderer.root, '正向提示词')).toBe('edited after adoption'))
      await click(renderer, '保存参数')
      expect(host.store.getBranch(root.branchId!).draft.prompt_input.positive_prompt).toBe('edited after adoption')
      expect(host.store.getBranch(root.branchId!).editing_draft).toBeNull()
      const recorded = await host.remote.promptGet({ workspace_id: root.workspaceId, request_id: turn.request_id }, signal)
      expect(recorded.result?.positive_prompt).toBe('first Agent result')
      expect(recorded.adopted?.positive_prompt).toBe('edited after adoption')
    } finally { await host.dispose() }
  })

  it('shows a saved default result without offering it for adoption again', async () => {
    const data = fullProjection(), task = makeTask('saved-prompt-task', 'root', 'prompt')
    data.tasks.push(task)
    const turn: PromptTurn = { request_id: 'saved-prompt-request', task_id: task.task_id, turn_index: 1, function_id: 'prompt', kind: 'prompt', intent: 'generate', candidate: null,
      session_id: 'prompt-session', harness_turn: 1, preset_id: 'preset', agent_model: task.binding_snapshot.agentModel,
      input: { original_request: 'portrait', base_model_id: '1', base_model_name: 'SDXL', positive_prompt: '', negative_prompt: '', change_request: '', reference_context: {} },
      request_template: '', request_parts: DEFAULT_PROMPT_REQUEST_PARTS, request_text: 'portrait', status: 'succeeded', error: null,
      result: { type: 'prompt', positive_prompt: 'full saved positive', negative_prompt: 'full saved negative' }, artifact_id: 'saved-artifact', adopted: null, applied_at: null, created_at: 1, finished_at: 2, start_seq: 0 }
    data.branches[0]!.draft = { ...data.branches[0]!.draft, prompt_edit_task_id: task.task_id, prompt_input: { positive_prompt: 'full saved positive', negative_prompt: 'full saved negative' } }
    const subscribe: ExperimentWorkbenchProps['remote']['subscribe'] = async function* (_request, signal) {
      yield { kind: 'snapshot', sequence: 0, projection: data, promptTurns: [turn], translations: [] }
      if (!signal.aborted) await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
    }
    const { renderer, remote } = await mountReady(data, { remote: { subscribe, promptList: async () => [turn] } })
    expect(nodeText(renderer.root.findByProps({ id: 'preparation-state' }))).toBe('已保存的参数')
    await click(renderer, '对比提示词')
    expect(nodeText(renderer.root)).not.toContain('待采用结果已保存')
    expect(readField(renderer.root, '生成的正向提示词')).toBe('full saved positive')
    expect(readField(renderer.root, '生成的负向提示词')).toBe('full saved negative')
    expect(renderer.root.findAllByType('button').find(button => nodeText(button) === '采用生成结果')!.props.disabled).toBe(true)
    expect(remote.promptAdopt).not.toHaveBeenCalled()
  })
  it('shows a failed configuration preview without losing editable requirements', async () => {
    const { renderer } = await mount(fullProjection(), { remote: { promptPreview: async () => { throw new Error('引用资料读取失败，请重新打开功能编辑窗口。') } } })
    await click(renderer, '配置中心'); await click(renderer, '编辑prompt')
    expect(nodeText(renderer.root.findByProps({ className: 'request-preview' }))).toContain('引用资料读取失败，请重新打开功能编辑窗口。')
    expect(readField(renderer.root, '执行要求')).toBe('{{requirements_block}}')
    await click(renderer, '取消')
  })

  it('saves block and reference-purpose edits and sends the exact request displayed in the configuration preview', async () => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
    try {
      const root = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '模板预览', goal: '保留 {{references_block}} 原文' } }, signal)
      await host.remote.mutate({ ...root, type: 'function-preset', id: 'prompt', value: 'preset-a' }, signal)
      await host.remote.mutate({ ...root, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      const environment = await host.remote.getEnvironment({ workspaceId: root.workspaceId }, signal)
      const { renderer } = await mount(await host.remote.getProjection(root, signal), {
        workspaceId: root.workspaceId, workspaces: environment.workspaces, presets: environment.presets,
        agentModelGroups: environment.models.groups, routableProviders: environment.models.routableProviders,
        onAction: request => host.remote.mutate(request, signal),
        remote: { ...promptRemote(host, signal),
          getProjection: request => host.remote.getProjection(request, signal), getEnvironment: request => host.remote.getEnvironment(request, signal),
          getInputDescription: request => host.remote.getInputDescription(request, signal),
        },
      })
      await click(renderer, '配置中心')
      await click(renderer, '编辑生成提示词')
      await change(renderer, '执行要求', '提示词请求\n{{requirements_block}}\n{{prompt_edit_block}}\n{{references_block}}')
      await change(renderer, '底模与原始需求', '底模：{{base_model_name}}\n目标：{{original_request}}')
      await change(renderer, '指定 Skill', 'prompt-builder')
      await change(renderer, '指定 Skill用途', '采用指定的提示词写法。')
      await vi.waitFor(() => expect(renderer.root.findByProps({ className: 'request-preview' }).findAllByType('pre')).toHaveLength(1))
      const preview = nodeText(renderer.root.findByProps({ className: 'request-preview' }).findAllByType('pre')[0]!)
      expect(preview).toContain('采用指定的提示词写法。')
      expect(preview).toContain('保留 {{references_block}} 原文')
      await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      await click(renderer, '编辑生成提示词')
      expect(readField(renderer.root, '底模与原始需求')).toBe('底模：{{base_model_name}}\n目标：{{original_request}}')
      expect(readField(renderer.root, '指定 Skill用途')).toBe('采用指定的提示词写法。')
      await click(renderer, '取消')
      const branch = host.store.getBranch(root.branchId!)
      const sent = await host.remote.promptStart({ workspace_id: root.workspaceId, work_id: root.workId!, branch_id: root.branchId!, function_id: 'prompt', request_id: 'preview-actual', intent: 'generate', draft: branch.editing_draft ?? branch.draft,
        input: { original_request: branch.original_request, base_model_id: '1', positive_prompt: '', negative_prompt: '', change_request: '' } }, signal)
      expect(sent.request_text).toBe(preview)
    } finally { await host.dispose() }
  })

  it('uses unsaved input, keeps three requests in one session and records manually adopted text after close and refresh', async () => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
    try {
      const root = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '提示词编辑', goal: '保存前的需求' } }, signal)
      await host.remote.mutate({ ...root, type: 'function-preset', id: 'prompt', value: 'preset-a' }, signal)
      await host.remote.mutate({ ...root, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      const environment = await host.remote.getEnvironment({ workspaceId: root.workspaceId }, signal)
      const options = { workspaceId: root.workspaceId, workspaces: environment.workspaces, presets: environment.presets,
        agentModelGroups: environment.models.groups, routableProviders: environment.models.routableProviders,
        storage: { getItem: () => JSON.stringify({ workId: root.workId, branchId: root.branchId }), setItem: vi.fn() },
        onAction: (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => host.remote.mutate(request, signal),
        remote: { ...promptRemote(host, signal),
          getProjection: (request: import('../../src/client/workbench/experiment-contract.ts').ExperimentScope) => host.remote.getProjection(request, signal),
          getInputDescription: (request: import('../../src/workbench-remote.ts').WorkbenchInputDescriptionRequest) => host.remote.getInputDescription(request, signal),
        },
      }
      const { renderer } = await mount(await host.remote.getProjection(root, signal), options)
      await change(renderer, '原始需求', '尚未保存的侧光肖像')
      await click(renderer, '生成提示词')
      const first = (await host.remote.getProjection(root, signal)).tasks.find(task => task.kind === 'prompt')!
      const firstTurn = (await host.remote.promptList({ workspace_id: root.workspaceId, task_id: first.task_id }, signal))[0]!
      expect(firstTurn.input.original_request).toBe('尚未保存的侧光肖像')
      expect(host.store.getBranch(root.branchId!).original_request).toBe('保存前的需求')
      completePrompt(host, firstTurn, { type: 'prompt', positive_prompt: 'portrait, side lighting', negative_prompt: 'blur' })
      await vi.waitFor(() => expect(readField(renderer.root, '正向提示词')).toBe('portrait, side lighting'), { timeout: 3000 })
      const inputBefore = host.store.getBranch(root.branchId!).editing_draft!.generation_input
      await click(renderer, '对比提示词')
      await change(renderer, '改动意见', '增加雨景')
      await click(renderer, '改写提示词')
      await click(renderer, '关闭')
      const second = (await host.remote.promptList({ workspace_id: root.workspaceId, task_id: first.task_id }, signal))[1]!
      expect(second).toMatchObject({ session_id: firstTurn.session_id, input: { positive_prompt: 'portrait, side lighting', change_request: '增加雨景' } })
      completePrompt(host, second, { type: 'prompt', positive_prompt: 'portrait, rain', negative_prompt: 'blur' })
      await vi.waitFor(() => expect(renderer.root.findAllByType('button').some(button => nodeText(button) === '对比提示词')).toBe(true))
      await click(renderer, '对比提示词')
      await vi.waitFor(() => expect(readField(renderer.root, '生成的正向提示词')).toBe('portrait, rain'), { timeout: 3000 })
      await change(renderer, '生成的正向提示词', 'portrait, rain, manual detail')
      await change(renderer, '改动意见', '保留手改并增加反射')
      await click(renderer, '关闭')
      await click(renderer, '对比提示词')
      expect(readField(renderer.root, '改动意见')).toBe('保留手改并增加反射')
      expect(readField(renderer.root, '生成的正向提示词')).toBe('portrait, rain, manual detail')
      await click(renderer, '改写提示词')
      const third = (await host.remote.promptList({ workspace_id: root.workspaceId, task_id: first.task_id }, signal))[2]!
      expect(third).toMatchObject({ session_id: firstTurn.session_id, input: { positive_prompt: 'portrait, rain, manual detail', change_request: '保留手改并增加反射' } })
      completePrompt(host, third, { type: 'prompt', positive_prompt: 'portrait, reflections', negative_prompt: 'fog' })
      await vi.waitFor(() => expect(readField(renderer.root, '生成的正向提示词')).toBe('portrait, reflections'), { timeout: 3000 })
      await change(renderer, '生成的正向提示词', 'portrait, reflections, adopted edit')
      await click(renderer, '采用生成结果')
      expect(readField(renderer.root, '正向提示词')).toBe('portrait, reflections, adopted edit')
      expect(host.store.getBranch(root.branchId!).editing_draft!.generation_input).toEqual(inputBefore)
      const saved = await host.remote.promptList({ workspace_id: root.workspaceId, task_id: first.task_id }, signal)
      expect(saved[2]).toMatchObject({ result: { positive_prompt: 'portrait, reflections' }, adopted: { positive_prompt: 'portrait, reflections, adopted edit' } })
      await click(renderer, '任务')
      await vi.waitFor(() => expect(nodeText(renderer.root.findByProps({ className: 'prompt-task-turns' }))).toContain('实际采用内容'), { timeout: 3000 })
      expect(renderer.root.findAllByProps({ className: 'agent-task-card' })).toHaveLength(1)
      await click(renderer, '编辑提示词')
      expect(readField(renderer.root, '生成的正向提示词')).toBe('portrait, reflections, adopted edit')
      await click(renderer, '关闭')
      await act(() => renderer.unmount())
      const refreshed = await mount(await host.remote.getProjection(root, signal), options)
      await click(refreshed.renderer, '对比提示词')
      await vi.waitFor(() => expect(readField(refreshed.renderer.root, '生成的正向提示词')).toBe('portrait, reflections, adopted edit'))
      await click(refreshed.renderer, '关闭')
    } finally { await host.dispose() }
  })

  it('blocks generation without a base model and shows a comparison instead of replacing in-flight manual edits', async () => {
    const data = fullProjection()
    data.branches[0]!.draft.prompt_input = { positive_prompt: '', negative_prompt: '' }
    data.branches[0]!.draft.base_model_id = null
    let finish!: (value: PromptTurn) => void
    const start = vi.fn((request: import('../../src/workbench/prompt-edit.ts').PromptStartRequest) => new Promise<PromptTurn>(resolve => {
      finish = resolve
    }))
    const { renderer, remote } = await mount(data, { remote: { promptStart: start } })
    await click(renderer, '生成提示词')
    expect(start).not.toHaveBeenCalled()
    expect(nodeText(renderer.root)).toContain('请先选择底模。')
    expect(renderer.root.findByProps({ 'aria-label': '图像底模' }).props.disabled).toBe(false)
    await change(renderer, '图像底模', '1')
    expect(renderer.root.findByProps({ 'aria-label': '图像底模' }).props.disabled).toBe(true)
    await click(renderer, '生成提示词')
    await change(renderer, '正向提示词', '途中手工输入')
    const request = start.mock.calls[0]![0]
    const completed: PromptTurn = { request_id: request.request_id, task_id: 'manual-task', turn_index: 1, function_id: 'prompt', kind: 'prompt', intent: 'rewrite', candidate: null, session_id: 'session', harness_turn: 1,
      preset_id: 'preset', agent_model: data.functions[0]!.agent_model, input: { ...request.input, base_model_name: 'SDXL', reference_context: {} },
      request_template: '', request_parts: { block_templates: { requirements_block: '', prompt_edit_block: '', references_block: '' }, reference_descriptions: { requested_skill: '', experiences: '', task_artifacts: '', run_ids: '', images: '', selected_resources: '' } },
      request_text: '', status: 'succeeded', error: null, result: { type: 'prompt', positive_prompt: 'Agent result', negative_prompt: '' }, artifact_id: 'artifact', adopted: null, applied_at: null, created_at: 1, finished_at: 2, start_seq: 0,
    }
    await act(() => { finish(completed); data.tasks.push(makeTask('manual-task', 'root', 'prompt')); remote.publish(data, [completed]) })
    await click(renderer, '对比提示词')
    expect(readField(renderer.root, '正向提示词')).toBe('途中手工输入')
    expect(readField(renderer.root, '生成的正向提示词')).toBe('Agent result')
    await click(renderer, '关闭')
  })
})

describe('experiment workbench current artifact conflict state', () => {
  it('shows the latest applied result without carrying an earlier candidate conflict into the card', async () => {
    const data = fullProjection(), task = makeTask('updated-result', 'root', 'prompt')
    task.output_contract.apply_mode = 'automatic'
    data.tasks = [task]
    const base = { task_id: task.task_id, type: 'prompt' as const, source_files: [], session_id: task.session_id!, turn: 1, skill_refs: [], applied_target: null }
    data.artifacts = [
      { ...base, artifact_id: 'old-candidate', artifact: { type: 'prompt', positive_prompt: '先前候选', negative_prompt: '' }, call_id: 'old', disposition: 'candidate', created_at: 1000 },
      { ...base, artifact_id: 'current-applied', artifact: { type: 'prompt', positive_prompt: '当前结果', negative_prompt: '' }, call_id: 'current', disposition: 'applied', created_at: 2000 },
    ]
    const { renderer } = await mount(data)
    await click(renderer, '任务')
    const card = renderer.root.findByProps({ className: 'agent-task-card' })
    expect(card.findAllByProps({ className: 'task-conflict' })).toHaveLength(0)
    expect(nodeText(card.findByProps({ className: 'task-output' }))).toContain('当前结果')
    expect(card.findByProps({ className: 'row task-actions' }).findAllByType('button').map(nodeText)).toEqual(['从产物创建分支', '查看任务输入'])
  })
})


describe('experiment workbench resource adoption through Remote', () => {
  it.each([true, false])('adopts a compatible=%s resource through its task and preserves the current selection', async compatible => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
    try {
      const root = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '资源候选', goal: '玻璃细节' } }, signal)
      const scope = { workspaceId: root.workspaceId, workId: root.workId! }
      await host.remote.mutate({ ...root, type: 'resource-select', id: '2', value: { kind: 'model', id: '2' } }, signal)
      await host.remote.mutate({ ...root, type: 'resource-select', id: '3', value: { kind: 'lora', id: '3' } }, signal)
      await saveHostInput(host, root)
      const accepted = await host.remote.mutate({ ...root, type: 'agent-action', id: 'resources' }, signal)
      const task = (await host.remote.getProjection(scope, signal)).tasks.find(task => task.task_id === accepted.taskId)!
      await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact: { type: 'resources', refs: [{ kind: 'lora', id: '4' }], reason: '保留玻璃细节' } },
        { workspaceId: root.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'resource-candidate' })
      const details = host.catalog.details.getMockImplementation()!
      host.catalog.details.mockImplementation(async (request, requestSignal) => {
        const result = await details(request, requestSignal)
        return request.kind === 'lora' && request.id === '4'
          ? { ...result, item: { ...result.item, label: '候选 LoRA', baseModelId: compatible ? '1' : '2' } } : result
      })
      const onAction = vi.fn((request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => host.remote.mutate(request, signal))
      const { renderer } = await mount(await host.remote.getProjection(scope, signal), {
        workspaceId: root.workspaceId, workspaces: [{ id: root.workspaceId, name: '测试工作区', path: '/workspace/project' }],
        catalog: { ...makeCatalog(), details: host.catalog.details }, onAction,
        remote: { subscribe: (request, streamSignal) => host.remote.subscribe(request, streamSignal), getProjection: request => host.remote.getProjection(request, signal), getInputDescription: request => host.remote.getInputDescription(request, signal), getRunInput: request => host.remote.getRunInput(request, signal) },
      })
      const picked = () => renderer.root.findAllByProps({ className: 'picked-lora' })
      expect(picked()).toHaveLength(1)
      await click(renderer, '任务')
      expect(renderer.root.findByProps({ className: 'task-output' }).findAllByType('b').map(nodeText)).toEqual(['候选 LoRA'])
      expect(picked()).toHaveLength(1)
      await click(renderer, '采用资源')
      expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'task-apply', taskId: task.task_id }))
      expect(renderer.root.findByProps({ 'aria-label': '任务' }).props.className).toBe('active')
      await click(renderer, '运行结果')
      expect(picked()).toHaveLength(2)
      expect(picked().map(nodeText).join('')).toContain('候选 LoRA')
      expect(picked().map(nodeText).join('')).toContain('rain.safetensors')
      await act(() => renderer.unmount())
    } finally { await host.dispose() }
  })
})


describe('experiment workbench artifact branch through Remote', () => {
  it.each(['prompt', 'parameters'] as const)('creates a %s candidate branch from its original Task while another branch is selected', async kind => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
    try {
      const source = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '候选分支', goal: '接纳时需求' } }, signal)
      const scope = { workspaceId: source.workspaceId, workId: source.workId! }
      await host.remote.mutate({ ...source, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      if (kind === 'parameters') {
        await setHostField(host, { ...source, field: 'instance_id', value: '8' }, signal)
        await host.remote.mutate({ ...source, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal)
      }
      await setHostField(host, { ...source, field: 'positive_prompt', value: '接纳时提示词' }, signal)
      const accepted = await host.remote.mutate({ ...source, type: 'agent-action', id: kind }, signal)
      const task = (await host.remote.getProjection(scope, signal)).tasks.find(task => task.task_id === accepted.taskId)!
      await setHostField(host, { ...source, field: 'positive_prompt', value: '父分支手工文本' }, signal)
      if (kind === 'parameters') {
        await setHostField(host, { ...source, field: 'parameter', id: 'steps', value: 35 }, signal)
        await setHostField(host, { ...source, field: 'parameter', id: 'seed', value: 99 }, signal)
      } else await setHostField(host, { ...source, field: 'instance_id', value: '9' }, signal)
      const selected = await host.remote.mutate({ ...source, type: 'create-branch', value: { name: '其他分支', original_request: '其他需求' } }, signal)
      await setHostField(host, { ...selected, field: 'positive_prompt', value: '另一分支手工文本' }, signal)
      const artifact: ArtifactPayload = kind === 'prompt'
        ? { type: 'prompt', positive_prompt: '候选分支提示词', negative_prompt: '候选负向词' }
        : { type: 'parameters', parameters: { steps: 28 } }
      const published = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact },
        { workspaceId: source.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'branch-candidate' })
      const onAction = vi.fn((request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => host.remote.mutate(request, signal))
      const { renderer } = await mount(await host.remote.getProjection(scope, signal), {
        workspaceId: source.workspaceId, workspaces: [{ id: source.workspaceId, name: '测试工作区', path: '/workspace/project' }], onAction,
        remote: { subscribe: (request, streamSignal) => host.remote.subscribe(request, streamSignal), getProjection: request => host.remote.getProjection(request, signal), getInputDescription: request => host.remote.getInputDescription(request, signal), getRunInput: request => host.remote.getRunInput(request, signal) },
      })
      await click(renderer, '切换分支 其他分支')
      await click(renderer, '任务')
      await click(renderer, '从产物创建分支')
      const name = '主分支 · ' + task.title
      expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'task-branch', taskId: task.task_id, branchId: source.branchId, id: published.artifact_id, value: { name } }))
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
      expect(renderer.root.findByProps({ 'aria-label': '运行结果' }).props.className).toBe('active')
      expect(readField(renderer.root, '分支名称')).toBe(name)
      expect(readField(renderer.root, '正向提示词')).toBe(kind === 'prompt' ? '候选分支提示词' : '接纳时提示词')
      if (kind === 'parameters') {
        expect(readField(renderer.root, '采样步数')).toBe('28')
        expect(readField(renderer.root, 'Seed')).toBe('17')
      } else expect(readField(renderer.root, 'ComfyUI 实例')).toBe('')
      const projection = await host.remote.getProjection(scope, signal), created = projection.branches.find(branch => branch.name === name)!
      expect(created).toMatchObject({ parent_branch_id: source.branchId, source_artifact_id: published.artifact_id, original_request: '接纳时需求' })
      expect(renderer.root.findAllByProps({ title: published.artifact_id }).length).toBeGreaterThan(0)
      expect(renderer.root.findAllByProps({ className: 'run-card' })).toHaveLength(0)
      await click(renderer, '切换分支 主分支')
      expect(readField(renderer.root, '正向提示词')).toBe('父分支手工文本')
      await click(renderer, '切换分支 其他分支')
      expect(readField(renderer.root, '正向提示词')).toBe('另一分支手工文本')
      await click(renderer, '任务')
      expect(JSON.parse(nodeText(renderer.root.findByProps({ 'aria-label': '产物 JSON' })))).toEqual([artifact])
      await act(() => renderer.unmount())
    } finally { await host.dispose() }
  })
})


describe('experiment workbench artifact branch eligibility', () => {
  it.each(['generation', 'review-candidate', 'review-only', 'resources', 'experiment'] as const)('matches the prototype branch eligibility for %s', async variant => {
    const data = fullProjection(), task = makeTask('eligible-artifact', 'root', variant === 'experiment' ? 'experiment' : variant.startsWith('review') ? 'review' : 'run')
    data.tasks = [task]
    const candidate = { generation_input: data.branches[0]!.draft.generation_input, image_refs: [], workflow_image_bindings: [] }
    const artifact: ArtifactPayload = variant === 'generation' ? { type: 'generation_input', ...candidate }
      : variant === 'resources' ? { type: 'resources', refs: [{ kind: 'lora', id: '13' }], reason: '保留依据' }
        : variant === 'experiment' ? { type: 'prompt', positive_prompt: '实验结果', negative_prompt: '' }
          : { type: 'review', observation: '光线清晰', conclusion: '保留构图', run_ids: [], ...(variant === 'review-candidate' ? { candidate } : {}) }
    const base = { task_id: task.task_id, source_files: [], session_id: task.session_id!, turn: 1, skill_refs: [], applied_target: null }
    data.artifacts = [
      { ...base, artifact_id: 'earlier-eligible', type: 'prompt', artifact: { type: 'prompt', positive_prompt: '先前产物', negative_prompt: '' }, call_id: 'earlier', disposition: 'candidate', created_at: 1000 },
      { ...base, artifact_id: 'latest-eligible', type: artifact.type, artifact, call_id: 'latest', disposition: 'candidate', created_at: 2000 },
    ]
    const { renderer, onAction } = await mount(data)
    await click(renderer, '任务')
    const card = renderer.root.findByProps({ className: 'agent-task-card' }), controls = card.findByProps({ className: 'row task-actions' }).findAllByType('button').map(nodeText)
    const allowed = variant === 'generation' || variant === 'review-candidate'
    expect(controls.includes('从产物创建分支')).toBe(allowed)
    if (variant === 'review-candidate') {
      const details = card.findByProps({ className: 'task-output' }).findAllByType('details')[0]!
      expect(details.findAllByType('summary').map(nodeText)).toEqual(['查看建议输入'])
      expect(JSON.parse(nodeText(details.findAllByType('pre')[0]!))).toEqual(candidate)
    }
    expect(JSON.parse(nodeText(card.findByProps({ 'aria-label': '产物 JSON' })))).toHaveLength(2)
    if (allowed) {
      await click(renderer, '从产物创建分支')
      expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
        type: 'task-branch', taskId: task.task_id, branchId: 'root', id: 'latest-eligible', value: { name: '主分支 · 任务 eligible-artifact' },
      }))
    }
  })
})


describe('experiment workbench long artifact branch name', () => {
  it('preserves the complete prototype automatic name when a forty-character parent creates an artifact branch', async () => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
    try {
      const source = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '长名称来源', goal: '保留完整自动名称' } }, signal)
      const scope = { workspaceId: source.workspaceId, workId: source.workId! }, parentName = '长父分支'.repeat(10)
      await setHostField(host, { ...source, field: 'name', value: parentName, expectedValue: '主分支' }, signal)
      await host.remote.mutate({ ...source, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      await setHostField(host, { ...source, field: 'positive_prompt', value: '固定输入' }, signal)
      const accepted = await host.remote.mutate({ ...source, type: 'agent-action', id: 'prompt' }, signal)
      const task = (await host.remote.getProjection(scope, signal)).tasks.find(task => task.task_id === accepted.taskId)!
      await setHostField(host, { ...source, field: 'positive_prompt', value: '父分支手工输入' }, signal)
      const published = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id,
        artifact: { type: 'prompt', positive_prompt: '长名称候选输入', negative_prompt: '候选负向词' } },
        { workspaceId: source.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'long-name-candidate' })
      const onAction = vi.fn((request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => host.remote.mutate(request, signal))
      const { renderer } = await mount(await host.remote.getProjection(scope, signal), {
        workspaceId: source.workspaceId, workspaces: [{ id: source.workspaceId, name: '测试工作区', path: '/workspace/project' }], onAction,
        remote: { subscribe: (request, streamSignal) => host.remote.subscribe(request, streamSignal), getProjection: request => host.remote.getProjection(request, signal), getInputDescription: request => host.remote.getInputDescription(request, signal), getRunInput: request => host.remote.getRunInput(request, signal) },
      })
      await click(renderer, '任务')
      await click(renderer, '从产物创建分支')
      const expectedName = parentName + ' · ' + task.title
      expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'task-branch', branchId: source.branchId, id: published.artifact_id, value: { name: expectedName } }))
      expect(renderer.root.findAllByProps({ className: 'toast' }).map(nodeText)).toEqual([])
      expect(renderer.root.findByProps({ 'aria-label': '运行结果' }).props.className).toBe('active')
      expect(readField(renderer.root, '分支名称')).toBe(expectedName)
      expect(readField(renderer.root, '正向提示词')).toBe('长名称候选输入')
      expect(readField(renderer.root, '负向提示词')).toBe('候选负向词')
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
      await change(renderer, '正向提示词', '长名分支后续编辑')
      expect(readField(renderer.root, '分支名称')).toBe(expectedName)
      const projection = await host.remote.getProjection(scope, signal), created = projection.branches.find(branch => branch.name === expectedName)!
      expect(created).toMatchObject({ parent_branch_id: source.branchId, source_artifact_id: published.artifact_id,
        editing_draft: { prompt_input: { positive_prompt: '长名分支后续编辑', negative_prompt: '候选负向词' } } })
      expect(projection.branches.find(branch => branch.branch_id === source.branchId)!.draft.prompt_input.positive_prompt).toBe('父分支手工输入')
      await act(() => renderer.unmount())
    } finally { await host.dispose() }
  })
})


describe('experiment workbench independent comparison preview', () => {
  it.each(['close', 'escape'] as const)('previews the comparison Run without changing the primary Run and returns with %s', async close => {
    const data = treeProjection()
    const { renderer } = await mount(data)
    await click(renderer, '比较运行')
    await click(renderer, '比较运行 warm-r1')
    const headings = () => renderer.root.findByProps({ className: 'compare-grid' }).findAllByType('h3').map(nodeText)
    expect(headings()).toEqual(['warm-r1 · 暖光', 'root-r1 · 主分支'])
    await click(renderer, '查看原图 warm-r1')
    const dialog = renderer.root.findByProps({ role: 'dialog', 'aria-labelledby': 'image-title' })
    expect(nodeText(dialog.findByProps({ id: dialog.props['aria-labelledby'] }))).toBe('warm-r1 · 图片 1')
    expect(dialog.findAllByType('img')[0]!.props.src).toBe(data.runs.find(run => run.run_id === 'warm-r1')!.media[0]!.url)
    expect(readField(renderer.root, '分支名称')).toBe('主分支')
    expect(headings()).toEqual(['warm-r1 · 暖光', 'root-r1 · 主分支'])
    if (close === 'close') await click(renderer, '关闭原图')
    else await act(async () => { document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' })) })
    expect(headings()).toEqual(['warm-r1 · 暖光', 'root-r1 · 主分支'])
    await click(renderer, '结束比较')
    expect(renderer.root.findByProps({ 'aria-label': '查看运行 root-r1' }).props['aria-pressed']).toBe(true)
  })
})


describe('experiment workbench Run actions through Remote', () => {
  type Host = Awaited<ReturnType<typeof import('../support/workbench-host.ts').createWorkbenchHostFixture>>
  const signal = new AbortController().signal
  const liveOptions = async (host: Host, workspaceId: string) => {
    const environment = await host.remote.getEnvironment({ workspaceId }, signal)
    return {
      workspaceId, workspaces: environment.workspaces, presets: environment.presets, instances: environment.instances,
      agentModelGroups: environment.models.groups, routableProviders: environment.models.routableProviders,
      catalog: { ...makeCatalog(), details: host.catalog.details },
      onAction: vi.fn((request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => host.remote.mutate(request, signal)),
      remote: { subscribe: (request, streamSignal) => host.remote.subscribe(request, streamSignal), getProjection: request => host.remote.getProjection(request, signal),
        getInputDescription: request => host.remote.getInputDescription(request, signal), getRunInput: request => host.remote.getRunInput(request, signal) },
    } satisfies NonNullable<Parameters<typeof mount>[1]>
  }
  const acceptTask = async (host: Host, workspaceId: string, task: WorkbenchProjection['tasks'][number]) => {
    const { toGenerationRequest, parseCliGenerationRequest } = await import('../../src/cli/contract.ts')
    const result = await host.runtime.acceptGenerations({ workspaceId, sessionId: task.session_id!, turn: 1, callId: 'visible-run' },
      [{ requestId: crypto.randomUUID(), request: toGenerationRequest(parseCliGenerationRequest(task.input.generation_input)) }], signal, task.task_id)
    return result.items[0]!.runId
  }

  it('keeps missing-input text and creates two independent Tasks and Runs from repeated visible submissions', async () => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture()
    try {
      const scope = await host.remote.mutate({ workspaceId: 'workspace_1', type: 'new-work', value: { name: '独立运行', goal: '固定每次输入' } }, signal)
      await host.remote.mutate({ workspaceId: scope.workspaceId, type: 'function-preset', id: 'run', value: 'preset-a' }, signal)
      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal)
      await setHostField(host, { ...scope, field: 'positive_prompt', value: '保留缺参时的提示词' }, signal)
      const options = await liveOptions(host, scope.workspaceId)
      const { renderer } = await mountReady(await host.remote.getProjection(scope, signal), options)
      await click(renderer, '运行任务')
      expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('实例')
      expect(readField(renderer.root, '正向提示词')).toBe('保留缺参时的提示词')
      expect((await host.remote.getProjection(scope, signal)).tasks).toHaveLength(0)
      await click(renderer, '编辑参数')
      await change(renderer, 'ComfyUI 实例', '8')
      await click(renderer, '保存参数')
      const ids: string[] = []
      for (let index = 0; index < 2; index++) {
        expect(renderer.root.findAllByType('button').find(node => nodeText(node) === '运行任务')!.props.disabled).toBe(false)
        await click(renderer, '运行任务')
        const tasks = (await host.remote.getProjection(scope, signal)).tasks
        const task = tasks.at(-1)!
        ids.push(await acceptTask(host, scope.workspaceId, task))
        await host.runtime.advance()
        await click(renderer, '查看运行记录')
        await click(renderer, '关闭面板')
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 800)) })
        expect(renderer.root.findAllByType('button').some(node => node.props['aria-label'] === '查看运行 ' + ids[index])).toBe(true)
      }
      expect(new Set(ids).size).toBe(2)
      const after = await host.remote.getProjection(scope, signal)
      expect(after.tasks).toHaveLength(2)
      expect(after.runs.map(run => run.run_id)).toEqual(ids)
      expect(after.runs.map(run => run.generation_input)).toEqual([after.tasks[0]!.input.generation_input, after.tasks[1]!.input.generation_input])
    } finally { await host.dispose() }
  })

  it('forks an unmapped Run and maps only each prompt slot explicitly edited through the existing inputs', async () => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture()
    try {
      const root = await host.remote.mutate({ workspaceId: 'workspace_1', type: 'new-work', value: { name: '未知映射来源', goal: '保留每个原始参数' } }, signal)
      await host.remote.mutate({ workspaceId: root.workspaceId, type: 'function-preset', id: 'run', value: 'preset-a' }, signal)
      for (const [field, value] of [['instance_id', '8'], ['positive_prompt', '原始正向'], ['negative_prompt', '原始负向']] as const)
        await setHostField(host, { ...root, field, value }, signal)
      for (const value of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }])
        await host.remote.mutate({ ...root, type: 'resource-select', value }, signal)
      await saveHostInput(host, root)
      const receipt = await host.remote.mutate({ ...root, type: 'run' }, signal)
      const sourceTask = (await host.remote.getProjection(root, signal)).tasks.find(task => task.task_id === receipt.taskId)!
      const runId = await acceptTask(host, root.workspaceId, sourceTask)
      const raw = structuredClone(sourceTask.input.generation_input)
      const options = await liveOptions(host, root.workspaceId)
      const { renderer } = await mount(await host.remote.getProjection(root, signal), options)
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '从此运行创建分支')
      await act(async () => renderer.root.findByProps({ role: 'dialog' }).findAllByType('form')[0]!.props.onSubmit({
        preventDefault() {}, currentTarget: { name: '未解析输入分支', goal: '逐槽填写' },
      }))
      const getCreated = async () => (await host.remote.getProjection(root, signal)).branches.find(branch => branch.name === '未解析输入分支')!
      const created = await getCreated()
      expect(created.draft.prompt_input).toEqual({ positive_prompt: null, negative_prompt: null })
      expect(created.draft.generation_input).toEqual(raw)
      for (const label of ['正向提示词', '负向提示词']) {
        const input = renderer.root.findByProps({ 'aria-label': label })
        expect(input.props.value).toBe('')
        expect(input.props.placeholder).toBe('未解析')
        expect(input.props.value).toBe('')
      }
      expect((await getCreated()).draft.prompt_input).toEqual({ positive_prompt: null, negative_prompt: null })
      await change(renderer, '正向提示词', '明确填写的正向')
      expect((await getCreated()).editing_draft!.prompt_input).toEqual({ positive_prompt: '明确填写的正向', negative_prompt: null })
      await click(renderer, '保存参数')
      await click(renderer, '运行任务')
      expect(options.onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'run', branchId: created.branch_id }))
      expect(await options.onAction.mock.results.at(-1)!.value).toMatchObject({ branchId: created.branch_id })
      const first = (await host.remote.getProjection({ workspaceId: root.workspaceId, workId: root.workId }, signal)).tasks.filter(task => task.branch_id === created.branch_id).at(-1)!
      expect(first, renderer.root.findAllByProps({ className: 'toast' }).map(nodeText).join(' / ')).toBeDefined()
      expect(first.input.generation_input).toEqual({ ...raw, parameters: { ...raw.parameters, positive: '明确填写的正向' } })
      await click(renderer, '编辑参数')
      await change(renderer, '负向提示词', '')
      expect(renderer.root.findByProps({ 'aria-label': '负向提示词' }).props.placeholder).toBeUndefined()
      await click(renderer, '保存参数')
      await click(renderer, '运行任务')
      const second = (await host.remote.getProjection({ workspaceId: root.workspaceId, workId: root.workId }, signal)).tasks.filter(task => task.branch_id === created.branch_id).at(-1)!
      expect(second.task_id).not.toBe(first.task_id)
      expect(second.input.generation_input).toEqual({ ...raw, parameters: { ...raw.parameters, positive: '明确填写的正向', negative: '' } })
      expect((await host.remote.getProjection(root, signal)).runs.find(run => run.run_id === runId)!.generation_input).toEqual(raw)
    } finally { await host.dispose() }
  })

  it('retries the failed Run from its visible action and derives a grandchild without changing the parent draft', async () => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture({
      inspectRuntimeParameters: async () => inputDescription, validateInput: async () => {},
      prepare: async () => ({ instanceId: '8', instanceTitle: '保存的实例', templateTitle: '保存的模板', inputDescription,
        sourceSnapshot: {}, actualWorkflow: {}, apiWorkflow: {}, expectedOutputNodeIds: [],
        connection: { origin: 'http://comfy.fixture.test', url: 'http://comfy.fixture.test', authorization: null } }),
    })
    try {
      const root = await host.remote.mutate({ workspaceId: 'workspace_1', type: 'new-work', value: { name: '来源运行', goal: '保留失败来源' } }, signal)
      await host.remote.mutate({ workspaceId: root.workspaceId, type: 'function-preset', id: 'run', value: 'preset-a' }, signal)
      for (const [field, value] of [['instance_id', '8'], ['positive_prompt', '来源 Run 的固定提示词']] as const)
        await setHostField(host, { ...root, field, value }, signal)
      for (const value of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }])
        await host.remote.mutate({ ...root, type: 'resource-select', value }, signal)
      await saveHostInput(host, root)
      const child = await host.remote.mutate({ ...root, type: 'create-branch', value: { name: '来源子分支', original_request: '子分支要求' } }, signal)
      const receipt = await host.remote.mutate({ ...child, type: 'run' }, signal)
      const task = (await host.remote.getProjection(child, signal)).tasks.find(task => task.task_id === receipt.taskId)!
      const runId = await acceptTask(host, child.workspaceId, task)
      await host.runtime.advance()
      await host.runtime.advance()
      await setHostField(host, { ...child, field: 'positive_prompt', value: '父分支后来的手工修改' }, signal)
      const options = await liveOptions(host, child.workspaceId)
      const { renderer } = await mount(await host.remote.getProjection(child, signal), options)
      await click(renderer, '切换分支 来源子分支')
      await click(renderer, '查看运行 ' + runId)
      const failure = (await host.remote.getProjection(child, signal)).runs.find(run => run.run_id === runId)!.error!.message
      expect(nodeText(renderer.root.findByProps({ className: 'error-stage' }))).toContain(failure)
      await click(renderer, '重试任务')
      await act(async () => { await options.onAction.mock.results.at(-1)!.value })
      const retry = (await host.remote.getProjection(child, signal)).tasks.find(task => task.retry_of_run_id === runId)!
      expect(retry, renderer.root.findAllByProps({ className: 'toast' }).map(nodeText).join(' / ')).toBeDefined()
      expect(retry.input.generation_input).toEqual(task.input.generation_input)
      const retryId = await acceptTask(host, child.workspaceId, retry)
      await host.runtime.advance()
      await host.runtime.advance()
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 800)) })
      expect(nodeText(renderer.root.findByProps({ 'aria-label': '查看运行 ' + retryId }))).toContain('重试来源 ' + runId)
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '从此运行创建分支')
      await act(async () => renderer.root.findByProps({ role: 'dialog' }).findAllByType('form')[0]!.props.onSubmit({
        preventDefault() {}, currentTarget: { name: '运行孙分支', goal: '独立探索要求' },
      }))
      expect(readField(renderer.root, '分支名称')).toBe('运行孙分支')
      expect(readField(renderer.root, '正向提示词')).toBe('来源 Run 的固定提示词')
      expect(nodeText(renderer.root.findByProps({ className: 'canvas' }))).toContain('当前分支暂无运行记录')
      const after = await host.remote.getProjection(child, signal), created = after.branches.find(branch => branch.name === '运行孙分支')!
      expect(created).toMatchObject({ parent_branch_id: child.branchId, source_run_id: runId, original_request: '独立探索要求', draft: { generation_input: task.input.generation_input } })
      expect(after.branches.find(branch => branch.branch_id === child.branchId)!.draft.prompt_input.positive_prompt).toBe('父分支后来的手工修改')
      expect(after.runs.find(run => run.run_id === runId)!.status).toBe('failed')
      await click(renderer, '查看分支图')
      const graph = renderer.root.findByProps({ className: 'branch-graph' })
      expect(nodeText(graph.findAllByType('p').find(source => source.props.title === `从 ${runId} 分出`)!)).toMatch(/^从 .+ 分出$/)
      expect(graph.findAllByProps({ title: runId })).not.toHaveLength(0)
      await act(async () => { graph.findAllByProps({ className: 'branch-graph-node' }).find(node => nodeText(node).includes('运行孙分支'))!.findAllByType('button').find(node => nodeText(node) === '进入分支')!.props.onClick() })
      expect(readField(renderer.root, '分支名称')).toBe('运行孙分支')
    } finally { await host.dispose() }
  })
})

describe('experiment workbench mixed Run browsing', () => {
  it('keeps all eight cards and their own media, state, task, initiator and retry provenance while scrolling', async () => {
    const data = fullProjection()
    data.tasks = Array.from({ length: 8 }, (_, index) => ({ ...makeTask('mixed-task-' + index, 'root'), binding_snapshot: { ...makeTask('source').binding_snapshot, preset_id: index % 2 ? 'preset-other' : 'preset' } }))
    data.runs = data.tasks.map((task, index) => ({ ...makeRun('mixed-run-' + index, task.task_id, index === 2 ? 'failed' : index === 5 ? 'remote_running' : 'succeeded'),
      initiator: index % 2 ? 'agent' as const : 'human' as const, retry_of_run_id: index === 7 ? 'mixed-run-2' : null,
      error: index === 2 ? { code: 'MEDIA_DOWNLOAD_FAILED', message: '第三次运行媒体下载失败' } : null }))
    const { renderer, onAction } = await mount(data, { presets: functionEnvironment.presets })
    const strip = renderer.root.findByProps({ className: 'run-cards' })
    expect(strip.findAllByType('button').map(node => node.props['aria-label'])).toEqual(data.runs.map(run => '查看运行 ' + run.run_id))
    await act(() => strip.props.onScroll({ currentTarget: { scrollTop: 0, scrollLeft: 900 } }))
    for (let index = 0; index < data.runs.length; index++) {
      const run = data.runs[index]!
      await click(renderer, '查看运行 ' + run.run_id)
      const card = renderer.root.findByProps({ 'aria-label': '查看运行 ' + run.run_id })
      expect(card.props['aria-pressed']).toBe(true)
      expect(nodeText(card)).toContain(run.workbench_task_id)
      expect(nodeText(card)).toContain(index % 2 ? 'Agent' : '人工')
      expect(nodeText(card)).toContain(index % 2 ? '绘图预设' : '工作台预设')
      const canvas = renderer.root.findByProps({ className: 'canvas' })
      if (run.status === 'succeeded') expect(canvas.findAllByType('img')[0]!.props.src).toBe(run.media[0]!.url)
      else expect(nodeText(canvas)).toContain(run.error?.message ?? '生成中')
    }
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '查看运行 mixed-run-7' }))).toContain('重试来源 mixed-run-2')
    await act(() => strip.props.onScroll({ currentTarget: { scrollTop: 0, scrollLeft: 0 } }))
    expect(onAction).not.toHaveBeenCalled()
  })
})

describe('experiment workbench Run history time', () => {
  it('shows each work-wide Run time and locates the exact record across branches', async () => {
    const data = treeProjection()
    data.runs.forEach((run, index) => { run.created_at = new Date(2026, 10, 9, 14, index).getTime() })
    const { renderer } = await mount(data)
    await click(renderer, '查看运行记录')
    const rows = renderer.root.findByProps({ className: 'sheet-body' }).findAllByProps({ className: 'run-row' })
    expect(rows.map(row => nodeText(row.findAllByType('h3')[0]!))).toEqual(data.runs.slice().reverse().map(run => run.run_id + ' · ' + data.branches.find(branch => branch.branch_id === data.tasks.find(task => task.task_id === run.workbench_task_id)!.branch_id)!.name))
    expect(rows.map(row => nodeText(row.findByProps({ className: 'detail-line' })))).toEqual(data.runs.slice().reverse().map(run => new Date(run.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })))
    await act(async () => { rows[0]!.findAllByType('button').find(node => nodeText(node) === '查看运行')!.props.onClick() })
    expect(renderer.root.findByProps({ 'aria-label': '查看运行 ' + data.runs.at(-1)!.run_id }).props['aria-pressed']).toBe(true)
    expect(renderer.root.findAllByProps({ className: 'sheet' })).toHaveLength(0)
  })
})

describe('experiment workbench comparison details', () => {
  it('defaults to the last alternative and shows each saved prompt, guidance and non-success state', async () => {
    const data = treeProjection(), last = data.runs.at(-1)!
    last.status = 'failed'
    last.error = { code: 'MEDIA_DOWNLOAD_FAILED', message: '此 Run 的媒体下载失败' }
    const { renderer } = await mount(data)
    await click(renderer, '比较运行')
    const cells = renderer.root.findByProps({ className: 'compare-grid' }).findAllByProps({ className: 'compare-cell' })
    expect(nodeText(cells[0]!.findAllByType('h3')[0]!)).toContain(last.run_id)
    expect(nodeText(cells[0]!)).toContain('此 Run 的媒体下载失败')
    expect(nodeText(cells[0]!.findByProps({ className: 'compare-run-state failed' }))).toContain('运行失败')
    expect(nodeText(cells[1]!)).toContain('引导强度 5')
    expect(nodeText(cells[1]!.findAllByType('p').at(-1)!)).toBe('glass house')
  })
})

describe('experiment workbench execution availability', () => {
  it('uses the actual provider route for builtin and custom execution without losing the Branch draft', async () => {
    const data = fullProjection()
    data.functions.push({ ...data.functions.find(item => item.kind === 'run')!, function_id: 'custom-run', builtin: false, name: '自定义运行' })
    data.branches[0]!.draft.prompt_input.positive_prompt = '保持已填内容'
    const { renderer, onAction } = await mountReady(data, { routableProviders: [] })
    expect(renderer.root.findAllByType('button').find(node => nodeText(node) === '运行任务')!.props.disabled).toBe(true)
    expect(renderer.root.findAllByType('button').find(node => nodeText(node) === '自定义运行')!.props.disabled).toBe(true)
    expect(nodeText(renderer.root.findByProps({ className: 'binding-problem' }))).toContain('提供商当前无法执行任务')
    expect(readField(renderer.root, '正向提示词')).toBe('保持已填内容')
    expect(onAction).not.toHaveBeenCalled()
  })
})

describe('experiment workbench detailed Run phases', () => {
  it('shows each persisted phase and treats unknown submission as awaiting verification without retrying', async () => {
    vi.useFakeTimers()
    let data: WorkbenchProjection = { ...fullProjection(), tasks: [makeTask('phase-task', 'root')], runs: [makeRun('phase-run', 'phase-task', 'created')] }
    const { renderer, onAction } = await mount(data, { remote: { getProjection: async () => structuredClone(data) } })
    for (const [status, label] of [
      ['created', '准备中'], ['prepared', '准备完成'], ['submitting', '提交中'], ['remote_pending', '排队中'],
      ['remote_running', '生成中'], ['downloading', '下载中'], ['cancelling', '取消中'], ['submission_unknown', '提交状态待核对'],
    ] as const) {
      data = { ...data, runs: [{ ...data.runs[0]!, status: status!, error: status === 'submission_unknown' ? { code: 'UNKNOWN', message: '提交结果尚未确认，请核对实例。' } : null }] }
      await deliverChanges()
      expect(nodeText(renderer.root.findByProps({ className: 'stage-caption' }))).toContain(label)
      expect(nodeText(renderer.root.findByProps({ className: 'canvas' }))).toContain(label)
    }
    expect(nodeText(renderer.root.findByProps({ className: 'canvas' }))).toContain('提交结果尚未确认，请核对实例。')
    expect(renderer.root.findAllByType('button').map(nodeText)).not.toContain('重试任务')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '查看运行记录' }))).toBe('运行记录')
    expect(onAction).not.toHaveBeenCalled()
  })
})


describe('experiment workbench fixed historical Run input', () => {
  it('shows the saved prompts and image references while retaining the current preparation', async () => {
    const data = fullProjection(), run = data.runs[0]!, task = data.tasks[0]!
    data.branches[0]!.draft.prompt_input.positive_prompt = '当前草稿'
    const fixed = { ...runInputDefaults(run.generation_input), run_id: run.run_id, branch_id: 'root', generation_input: run.generation_input,
      image_refs: [{ image_ref_id: 'saved-reference', source: { kind: 'uploaded_file' as const, file_id: 'saved-file' }, purpose: 'agent' as const, reference_requirement: '历史窗框要求' }], workflow_image_bindings: [],
      input_description: inputDescription, prompt_input: { positive_prompt: '保存的历史提示词', negative_prompt: '保存的历史负向词' } }
    const { renderer, onAction } = await mount(data, { remote: { getRunInput: async () => fixed } })
    await click(renderer, '查看运行输入')
    expect(readField(renderer.root, '正向提示词')).toBe('保存的历史提示词')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'Agent 参考图片' }))).toContain('历史窗框要求')
    await click(renderer, '准备运行')
    expect(readField(renderer.root, '正向提示词')).toBe('当前草稿')
    expect(onAction).not.toHaveBeenCalled()
    expect(task.input.prompt_input.positive_prompt).not.toBe('当前草稿')
  })
})


describe('experiment workbench compiled historical parameter values', () => {
  it('uses saved compiled values in the caption, comparison and inspector while preserving the original request', async () => {
    const data = fullProjection(), target = data.runs[0]!, request = structuredClone(target.generation_input)
    target.generation_input.parameters.seed_1 = -1
    request.parameters.seed_1 = -1
    target.generation_input.parameters.steps_1 = 15
    request.parameters.steps_1 = 15
    const saved = { ...inputDescription, parameters: inputDescription.parameters.map(parameter => ({
      ...parameter, current_value: parameter.kind === 'seed' ? 38521047 : parameter.kind === 'steps' ? 34 : parameter.current_value,
    })) }
    const getRunInput = vi.fn(async (scope: { runId: string }) => ({ ...runInputDefaults(data.runs.find(run => run.run_id === scope.runId)!.generation_input),  run_id: scope.runId, branch_id: 'root',
      generation_input: data.runs.find(run => run.run_id === scope.runId)!.generation_input, image_refs: [], workflow_image_bindings: [],
      input_description: scope.runId === target.run_id ? saved : inputDescription,
      prompt_input: { positive_prompt: '固定正向词', negative_prompt: '' } }))
    const { renderer, onAction } = await mount(data, { remote: { getRunInput } })
    expect(nodeText(renderer.root.findByProps({ className: 'stage-caption' }))).toContain('Seed 38521047 · 34 步')
    await change(renderer, '查看运行输入', '', true)
    expect(readField(renderer.root, 'Seed')).toBe('38521047')
    expect(readField(renderer.root, '采样步数')).toBe('34')
    await click(renderer, '比较运行')
    const primary = renderer.root.findByProps({ className: 'compare-grid' }).findAllByProps({ className: 'compare-cell' }).find(cell => nodeText(cell.findAllByType('h3')[0]!).startsWith(target.run_id))!
    expect(nodeText(primary)).toContain('Seed 38521047')
    expect(target.generation_input).toEqual(request)
    expect(onAction).not.toHaveBeenCalled()
  })
})

describe('experiment workbench independently unresolved prompts', () => {
  it('keeps unknown slots distinct from a known empty string and saves only an explicitly edited slot', async () => {
    let data = fullProjection()
    data.branches[0]!.draft.prompt_input = { positive_prompt: null, negative_prompt: null }
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
      if (request.type === 'save-draft') data = { ...data, branches: data.branches.map(branch => branch.branch_id === request.branchId
        ? { ...branch, editing_draft: null, draft: (request.value as unknown as { draft: TaskDraft }).draft } : branch) }
    })
    const { renderer } = await mount(data, { onAction, remote: { getProjection: async () => data } })
    const positive = () => renderer.root.findByProps({ 'aria-label': '正向提示词' })
    const negative = () => renderer.root.findByProps({ 'aria-label': '负向提示词' })
    expect(positive().props.value).toBe('')
    expect(positive().props.placeholder).toBe('未解析')
    expect(negative().props.placeholder).toBe('未解析')
    expect(onAction).not.toHaveBeenCalled()
    await change(renderer, '正向提示词', '')
    expect(onAction.mock.calls.filter(([request]) => request.type === 'save-draft')).toHaveLength(0)
    await click(renderer, '保存参数')
    expect(onAction.mock.calls.filter(([request]) => request.type === 'save-draft')).toHaveLength(1)
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'save-draft', value: expect.objectContaining({ draft: expect.objectContaining({ prompt_input: { positive_prompt: '', negative_prompt: null } }) }) }))
    await click(renderer, '编辑参数')
    expect(data.branches[0]!.draft.prompt_input).toEqual({ positive_prompt: '', negative_prompt: null })
    expect(positive().props.placeholder).toBeUndefined()
    expect(negative().props.placeholder).toBe('未解析')
    await change(renderer, '负向提示词', '明确填写的负向词')
    expect(readField(renderer.root, '负向提示词')).toBe('明确填写的负向词')
    expect(data.branches[0]!.draft.prompt_input).toEqual({ positive_prompt: '', negative_prompt: null })
    await click(renderer, '保存参数')
    expect(data.branches[0]!.draft.prompt_input).toEqual({ positive_prompt: '', negative_prompt: '明确填写的负向词' })
  })
})

describe('experiment workbench restored historical input', () => {
  it('opens a saved historical view without requesting the current Branch template description', async () => {
    const data = fullProjection(), getInputDescription = vi.fn(async () => { throw Error('当前模板已经删除') })
    const storage = { getItem: (key: string) => key.endsWith(':workspace-a') ? JSON.stringify({ workId: 'work-a', branchId: 'root', selectedRunId: 'r1', inspectRun: true }) : null, setItem: vi.fn() }
    const { renderer } = await mount(data, { storage, remote: { getInputDescription } })
    expect(readField(renderer.root, '正向提示词')).toBe('glass house')
    expect(getInputDescription).not.toHaveBeenCalled()
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
    await click(renderer, '准备运行')
    expect(getInputDescription).toHaveBeenCalledTimes(1)
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('当前模板已经删除')
  })
})

describe('experiment workbench historical read errors', () => {
  it.each([new Error('历史输入读取失败，请稍后重试。'), '历史输入读取失败，请稍后重试。'])('keeps the draft readable and retries a failed historical read after selecting another Run: %s', async failure => {
    const data = fullProjection(), run = data.runs[0]!
    const fixed = { ...runInputDefaults(run.generation_input),  run_id: run.run_id, branch_id: 'root', generation_input: run.generation_input,
      reference_task_ids: [], reference_run_ids: [], reference_experiences: [], image_refs: [], workflow_image_bindings: [], instructions: '', input_description: inputDescription, prompt_input: { positive_prompt: '恢复后的固定提示词', negative_prompt: '' } }
    const getRunInput = vi.fn(async (request: { runId: string }) => ({ ...fixed, run_id: request.runId })).mockRejectedValueOnce(failure)
    const { renderer } = await mount(data, { remote: { getRunInput } })
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('历史输入读取失败')
    expect(readField(renderer.root, '正向提示词')).toBe('glass house')
    await click(renderer, '切换分支 暖光探索')
    await click(renderer, '查看运行 r2')
    await click(renderer, '切换分支 主分支')
    await click(renderer, '查看运行 r1')
    expect(readField(renderer.root, '正向提示词')).toBe('恢复后的固定提示词')
    expect(getRunInput.mock.calls.filter(([request]) => request.runId === 'r1')).toHaveLength(2)
  })

  it('ignores a late historical response while inspecting another Run and reuses it only for its own ID', async () => {
    const data = fullProjection()
    let resolve!: (value: import('../../src/workbench/contract.ts').WorkbenchRunInput) => void
    const first = new Promise<import('../../src/workbench/contract.ts').WorkbenchRunInput>(finish => { resolve = finish })
    const fixed = (runId: string) => ({ ...runInputDefaults(data.runs.find(run => run.run_id === runId)!.generation_input),  run_id: runId, branch_id: runId === 'r1' ? 'root' : 'child',
      generation_input: data.runs.find(run => run.run_id === runId)!.generation_input, image_refs: [], workflow_image_bindings: [], input_description: inputDescription,
      prompt_input: { positive_prompt: runId + ' 固定提示词', negative_prompt: '' } })
    const getRunInput = vi.fn(async (request: { runId: string }) => request.runId === 'r1' ? first : fixed(request.runId))
    const { renderer } = await mount(data, { remote: { getRunInput } })
    await click(renderer, '切换分支 暖光探索')
    await click(renderer, '查看运行 r2')
    expect(readField(renderer.root, '正向提示词')).toBe('r2 固定提示词')
    await act(async () => { resolve(fixed('r1')) })
    expect(readField(renderer.root, '正向提示词')).toBe('r2 固定提示词')
    await click(renderer, '切换分支 主分支')
    await click(renderer, '查看运行 r1')
    expect(readField(renderer.root, '正向提示词')).toBe('r1 固定提示词')
    expect(getRunInput.mock.calls.filter(([request]) => request.runId === 'r1')).toHaveLength(1)
  })
})

describe('experiment workbench preparing historical Run input', () => {
  it('shows raw saved parameters when description is absent and reloads after preparation updates the Run', async () => {
    vi.useFakeTimers()
    let data: WorkbenchProjection = { ...fullProjection(), runs: [makeRun('preparing-history', 't1', 'created')] }
    data.runs[0]!.generation_input.parameters = { raw_parameter_77: '保存的参数', positive_1: '固定正向' }
    let prepared = false
    const getRunInput = vi.fn(async () => ({ ...runInputDefaults(data.runs[0]!.generation_input),  run_id: 'preparing-history', branch_id: 'root', generation_input: data.runs[0]!.generation_input,
      reference_task_ids: [], reference_run_ids: [], reference_experiences: [], image_refs: [], workflow_image_bindings: [], instructions: '', input_description: prepared ? inputDescription : null,
      prompt_input: prepared ? { positive_prompt: '固定正向', negative_prompt: '' } : { positive_prompt: null, negative_prompt: null } }))
    const { renderer } = await mount(data, { remote: { getRunInput, getProjection: async () => structuredClone(data) } })
    await change(renderer, '查看运行输入', '', true)
    expect(readField(renderer.root, 'raw_parameter_77')).toBe('保存的参数')
    expect(readField(renderer.root, 'Workflow 模板')).toBe('12')
    expect(readField(renderer.root, '正向提示词')).toBe('未解析')
    expect(getRunInput).toHaveBeenCalledTimes(1)
    expect(nodeText(renderer.root.findByProps({ className: 'stage-caption' }))).toContain('Seed 未记录 · 未记录 步')
    await click(renderer, '查看运行记录')
    expect(nodeText(renderer.root.findByProps({ className: 'sheet-body' }))).toContain('Seed 未记录')
    await click(renderer, '关闭面板')
    prepared = true
    data = { ...data, runs: [{ ...data.runs[0]!, status: 'prepared', updated_at: 2000 }] }
    await deliverChanges()
    expect(getRunInput).toHaveBeenCalledTimes(2)
    expect(readField(renderer.root, '正向提示词')).toBe('固定正向')
  })
})


describe('experiment workbench experiment round presentation', () => {
  it('keeps long review content and the complete Run list inside the focusable result area', async () => {
    const data = fullProjection()
    const run = data.runs[0]!
    run.review_artifact_id = 'long-review'
    const observation = Array.from({ length: 100 }, (_, index) => `观察段落 ${index + 1}：玻璃窗框连续，光线自然。`).join('\n')
    const changes = Array.from({ length: 100 }, (_, index) => `计划改动 ${index + 1}：保留构图并调整光线。`)
    const artifacts: ArtifactPayload[] = [
      { type: 'review', observation, conclusion: '保留完整评价结论', run_ids: [run.run_id] },
      { type: 'iteration_plan', source_run_id: run.run_id, changes, reason: '保留完整修改原因', expected_result: '保留完整预期效果' },
    ]
    data.artifacts = artifacts.map((artifact, index) => ({
      artifact_id: index === 0 ? 'long-review' : 'long-plan', task_id: run.workbench_task_id, type: artifact.type, artifact,
      source_files: [], session_id: 'session-t1', turn: 1, call_id: `long-${index}`, skill_refs: [],
      disposition: 'recorded', applied_target: null, created_at: 1000,
    }))
    const { renderer } = await mountReady(data)
    await click(renderer, '查看运行 ' + run.run_id)
    const result = renderer.root.findByProps({ 'aria-label': '运行结果内容' })
    expect(result.props.tabIndex).toBe(0)
    const review = result.findByProps({ role: 'region', 'aria-label': 'Agent 评价正文' })
    const plan = result.findByProps({ role: 'region', 'aria-label': '下一轮计划正文' })
    expect(nodeText(review)).toContain('观察段落 100：玻璃窗框连续，光线自然。')
    expect(nodeText(review)).toContain('保留完整评价结论')
    expect(nodeText(plan)).toContain('计划改动 100：保留构图并调整光线。')
    expect(nodeText(plan)).toContain('保留完整预期效果')
    const runList = result.findByProps({ 'aria-label': '当前分支的运行' })
    expect(runList.findAllByType('button').some(item => item.props['aria-label'] === '查看运行 ' + run.run_id)).toBe(true)
    for (const page of ['资源', '任务', '经验']) {
      await click(renderer, page)
      expect(renderer.root.findAllByProps({ 'aria-label': '运行结果内容' })).toHaveLength(0)
      expect(renderer.root.findAllByType('main')[0]!.props.className).toBe('center')
    }
  })

  it.each(['succeeded', 'failed'] as const)('switches Agent reviews and adopted plans with the selected Run while keeping manual review separate (%s)', async status => {
    const data = fullProjection(), experiment = makeTask('experiment', 'root', 'experiment')
    const generation = makeTask('generation', 'root'), reviewTask = makeTask('evaluation', 'root', 'review')
    generation.parent_experiment_task_id = experiment.task_id
    reviewTask.parent_experiment_task_id = experiment.task_id
    const first = makeRun('first-round', experiment.task_id, status), second = makeRun('second-round', experiment.task_id)
    first.iteration_index = 1
    first.execution_task_id = generation.task_id
    first.review_artifact_id = 'review-first'
    second.iteration_index = 2
    second.execution_task_id = generation.task_id
    second.candidate_artifact_id = 'input-second'
    second.review_artifact_id = 'review-second'
    data.tasks = [experiment, generation, reviewTask]
    data.runs = [first, second]
    data.experiments = [{ task_id: experiment.task_id, control_state: 'running', end_reason: null, submitted_count: 2, max_runs: 3 }]
    const stored = (id: string, taskId: string, artifact: ArtifactPayload): WorkbenchProjection['artifacts'][number] => ({
      artifact_id: id, task_id: taskId, type: artifact.type, artifact, source_files: [], session_id: 'session-' + taskId,
      turn: 1, call_id: id, skill_refs: [], disposition: 'recorded', applied_target: null, created_at: 1000,
    })
    data.artifacts = [
      stored('review-first', reviewTask.task_id, { type: 'review', observation: '窗框断开', conclusion: '需要保留结构', run_ids: [first.run_id] }),
      stored('plan-first', experiment.task_id, { type: 'iteration_plan', source_run_id: first.run_id, changes: ['降低引导强度'], reason: '保留窗框结构', expected_result: '窗框连续' }),
      stored('input-second', experiment.task_id, { type: 'generation_input', generation_input: second.generation_input, plan_artifact_id: 'plan-first' }),
      stored('review-second', reviewTask.task_id, { type: 'review', observation: '窗框连续', conclusion: '已达到目标', run_ids: [second.run_id] }),
    ]
    vi.useFakeTimers()
    const getProjection = vi.fn(async () => structuredClone(data))
    const { renderer } = await mountReady(data, { remote: { getProjection } })
    await click(renderer, '查看运行 ' + first.run_id)
    const disclosure = (label: string) => renderer.root.findAllByType('details').find(item => item.props['aria-label'] === label)!
    expect(disclosure('Agent 评价')?.props.open).toBe(false)
    expect(disclosure('下一轮计划')?.props.open).toBe(false)
    expect(nodeText(disclosure('Agent 评价').findAllByType('summary')[0]!)).toBe('Agent 评价展开')
    const reviewBody = renderer.root.findByProps({ role: 'region', 'aria-label': 'Agent 评价正文' })
    expect(reviewBody.props.tabIndex).toBe(0)
    expect(renderer.root.findByProps({ role: 'region', 'aria-label': '下一轮计划正文' }).props.tabIndex).toBe(0)
    await act(() => disclosure('Agent 评价').props.onToggle({ currentTarget: { open: true } }))
    expect(disclosure('Agent 评价').props.open).toBe(true)
    expect(disclosure('下一轮计划').props.open).toBe(false)
    expect(nodeText(disclosure('Agent 评价').findAllByType('summary')[0]!)).toBe('Agent 评价收起')
    await act(() => disclosure('下一轮计划').props.onToggle({ currentTarget: { open: true } }))
    await act(() => disclosure('Agent 评价').props.onToggle({ currentTarget: { open: false } }))
    expect(disclosure('Agent 评价').props.open).toBe(false)
    expect(disclosure('下一轮计划').props.open).toBe(true)
    await act(() => disclosure('Agent 评价').props.onToggle({ currentTarget: { open: true } }))
    await deliverChanges()
    expect(getProjection).toHaveBeenCalledTimes(2)
    expect(disclosure('Agent 评价').props.open).toBe(true)
    expect(disclosure('下一轮计划').props.open).toBe(true)
    const firstReview = nodeText(renderer.root.findByProps({ 'aria-label': 'Agent 评价' }))
    expect(firstReview).toContain('初次运行')
    expect(firstReview).toContain(status === 'failed' ? '运行失败记录' : '图片观察')
    expect(firstReview).toContain('窗框断开')
    expect(firstReview).toContain('需要保留结构')
    const plan = renderer.root.findByProps({ 'aria-label': '下一轮计划' })
    expect(nodeText(plan)).toContain('降低引导强度')
    expect(nodeText(plan)).toContain('保留窗框结构')
    expect(nodeText(plan)).toContain('窗框连续')
    expect(nodeText(renderer.root.findByProps({ className: 'saved-review' }))).toContain('人工评价')
    expect(nodeText(renderer.root.findByProps({ className: 'saved-review' }))).toContain('光线自然')
    await click(renderer, '查看下一轮结果')
    expect(disclosure('Agent 评价').props.open).toBe(false)
    const secondReview = nodeText(renderer.root.findByProps({ 'aria-label': 'Agent 评价' }))
    expect(secondReview).toContain('降低引导强度')
    expect(secondReview).toContain('已达到目标')
    expect(secondReview).not.toContain('窗框断开')
    expect(renderer.root.findAllByProps({ 'aria-label': '下一轮计划' })).toHaveLength(0)
    await act(() => disclosure('Agent 评价').props.onToggle({ currentTarget: { open: true } }))
    await act(() => disclosure('Agent 评价').props.onToggle({ currentTarget: { open: false } }))
    await click(renderer, '查看运行 ' + first.run_id)
    expect(disclosure('Agent 评价').props.open).toBe(true)
    expect(disclosure('下一轮计划').props.open).toBe(true)
  })

  it.each(['running', 'waiting_input'] as const)('shows the active function executor and nests functional tasks inside their experiment (%s)', async status => {
    const data = fullProjection(), experiment = makeTask('experiment', 'root', 'experiment')
    const child = makeTask('evaluation', 'root', 'review'), independent = makeTask('independent', 'root', 'prompt')
    child.parent_experiment_task_id = experiment.task_id
    child.status = status
    child.binding_snapshot.name = '图片评价'
    child.binding_snapshot.preset_id = 'preset-other'
    child.execution_state = 'running'
    child.updated_at = 2000
    data.tasks = [experiment, child, independent]
    const result = makeRun('child-run', experiment.task_id)
    result.execution_task_id = child.task_id
    result.iteration_index = 1
    data.runs = [result]
    data.experiments = [{ task_id: experiment.task_id, control_state: 'running', end_reason: null, submitted_count: 0, max_runs: 3 }]
    const { renderer } = await mountReady(data, { presets: [{ id: 'preset', name: '工作台预设' }, { id: 'preset-other', name: '评价预设' }] })
    const progress = nodeText(renderer.root.findByProps({ className: 'taskbox' }))
    expect(progress).toContain('当前功能：图片评价')
    expect(progress).toContain('执行预设：评价预设')
    expect(progress).toContain(status === 'running' ? 'Agent 执行中' : '等待输入')
    await click(renderer, '查看运行 ' + result.run_id)
    expect(nodeText(renderer.root.findByProps({ className: 'stage-caption' }))).toContain('执行预设：评价预设')
    await click(renderer, '任务')
    const parent = renderer.root.findByProps({ 'data-task': experiment.task_id })
    expect(parent.findAllByProps({ 'data-task': child.task_id })).toHaveLength(1)
    expect(nodeText(parent.findByProps({ 'data-task': child.task_id }))).toContain('查看运行 ' + result.run_id)
    expect(parent.findAllByProps({ 'data-task': independent.task_id })).toHaveLength(0)
    expect(nodeText(parent)).toContain('图片评价')
    expect(nodeText(parent)).toContain('评价预设')
    expect(nodeText(parent)).toContain('提供商 · 模型 · 高')
    expect(renderer.root.findAllByProps({ 'data-task': child.task_id })).toHaveLength(1)
    expect(renderer.root.findAllByProps({ 'data-task': independent.task_id })).toHaveLength(1)
  })

  it('shows the latest active function of the selected experiment when switching branches', async () => {
    const data = fullProjection()
    const rootExperiment = makeTask('root-experiment', 'root', 'experiment')
    const rootExecution = makeTask('root-execution', 'root', 'run')
    rootExecution.parent_experiment_task_id = rootExperiment.task_id
    rootExecution.status = 'running'
    rootExecution.binding_snapshot.name = '运行任务'
    rootExecution.updated_at = 9000
    const childExperiment = makeTask('child-experiment', 'child', 'experiment')
    const earlier = makeTask('earlier-evaluation', 'child', 'review')
    earlier.parent_experiment_task_id = childExperiment.task_id
    earlier.status = 'running'
    earlier.binding_snapshot.name = '图片评价'
    earlier.updated_at = 1000
    const latest = makeTask('latest-resources', 'child', 'resources')
    latest.parent_experiment_task_id = childExperiment.task_id
    latest.status = 'waiting_input'
    latest.binding_snapshot.name = '推荐资源'
    latest.binding_snapshot.preset_id = 'preset-other'
    latest.updated_at = 2000
    const completed = makeTask('completed-prompt', 'child', 'prompt')
    completed.parent_experiment_task_id = childExperiment.task_id
    completed.binding_snapshot.name = '生成提示词'
    completed.updated_at = 10000
    data.tasks = [rootExperiment, rootExecution, childExperiment, earlier, latest, completed]
    data.runs = []
    data.experiments = [rootExperiment, childExperiment].map(task => ({
      task_id: task.task_id, control_state: 'running' as const, end_reason: null, submitted_count: 0, max_runs: 3,
    }))
    const { renderer } = await mountReady(data, {
      presets: [{ id: 'preset', name: '工作台预设' }, { id: 'preset-other', name: '资源预设' }],
    })
    const progress = () => nodeText(renderer.root.findByProps({ className: 'taskbox' }))
    expect(progress()).toContain('当前功能：运行任务')
    await click(renderer, '切换分支 暖光探索')
    expect(progress()).toContain('当前功能：推荐资源')
    expect(progress()).toContain('执行预设：资源预设')
    expect(progress()).toContain('等待输入')
    expect(progress()).not.toContain('当前功能：图片评价')
    expect(progress()).not.toContain('当前功能：生成提示词')
    await click(renderer, '切换分支 主分支')
    expect(progress()).toContain('当前功能：运行任务')
    expect(progress()).toContain('执行预设：工作台预设')
    expect(progress()).toContain('Agent 执行中')
  })

  it('opens a completed experience subtask in the existing review dialog and saves only on human confirmation', async () => {
    const data = fullProjection(), experiment = makeTask('experiment', 'root', 'experiment')
    const child = makeTask('experience-child', 'root', 'experience'), result = makeRun('experience-run', experiment.task_id)
    child.parent_experiment_task_id = experiment.task_id
    result.review_draft!.title = ''
    result.review_draft!.conditions = ''
    result.review_draft!.note = ''
    data.tasks = [experiment, child]
    data.runs = [result]
    data.artifacts = [{
      artifact_id: 'experience-artifact', task_id: child.task_id, type: 'experience',
      artifact: { type: 'experience', title: '窗框经验', conditions: '玻璃建筑', note: '降低引导强度', base_model_id: '1', model_id: '11', run_ids: [result.run_id] },
      source_files: [], session_id: child.session_id!, turn: 1, call_id: 'experience', skill_refs: [], disposition: 'recorded', applied_target: null, created_at: 1000,
    }]
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
      if (request.type === 'update-review-draft') result.review_draft = structuredClone((request.value as unknown as { draft: NonNullable<typeof result.review_draft> }).draft)
    })
    const { renderer } = await mountReady(data, { onAction })
    await click(renderer, '任务')
    const childCard = renderer.root.findByProps({ 'data-task': child.task_id })
    const open = childCard.findAllByType('button').find(button => nodeText(button) === '查看评价与经验')!
    expect(open).toBeDefined()
    await act(async () => open.props.onClick())
    expect(readField(renderer.root, '经验标题')).toBe('窗框经验')
    expect(readField(renderer.root, '适用条件')).toBe('玻璃建筑')
    expect(readField(renderer.root, '经验结论')).toBe('降低引导强度')
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'evaluate' }))
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'task-apply' }))
    await change(renderer, '经验结论', '人工确认的窗框结论')
    await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'evaluate', runId: result.run_id, value: expect.objectContaining({
        saveExperience: true,
        draft: expect.objectContaining({ title: '窗框经验', conditions: '玻璃建筑', note: '人工确认的窗框结论', experience_artifact_id: 'experience-artifact' }),
      }),
    }))
  })
})

describe('experiment workbench Run review through Remote', () => {
  const signal = new AbortController().signal
  type Host = Awaited<ReturnType<typeof import('../support/workbench-host.ts').createWorkbenchHostFixture>>
  type PrepareDescription = (request: import('../../src/generation/submission-contract.ts').GenerationRequest) => import('../../src/generation/inspection-contract.ts').WorkflowRuntimeParameterInspection
  const setup = async (successful = false, observeFailure?: () => boolean, describeInput?: PrepareDescription) => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture(successful ? {
      inspectRuntimeParameters: async () => inputDescription,
      validateInput: async () => {},
      prepare: async request => ({ instanceId: request.instanceId!, instanceTitle: 'Node', templateTitle: 'Template', sourceSnapshot: {}, inputDescription: describeInput?.(request) ?? runInputDescription(request.parameters),
        actualWorkflow: {}, apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } }, expectedOutputNodeIds: ['3'],
        connection: { origin: 'http://comfy.test', url: 'http://comfy.test', authorization: null } }),
    } : undefined, successful ? {
      submit: async input => { input.onRequestStart(); return { promptId: input.promptId } },
      observe: async () => observeFailure?.() ? { status: 'error', outputs: [], error: { code: 'COMFYUI_EXECUTION_ERROR', message: '本轮受控生成失败。' } }
        : { status: 'success', outputs: [{ nodeId: '3', outputIndex: 0, mediaKind: 'image', filename: 'frame.png', subfolder: '', type: 'output' }] },
      download: async () => ({ bytes: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]), mediaType: 'image/png' }),
    } : undefined)
    const root = await host.remote.mutate({ workspaceId: 'workspace_1', type: 'new-work', value: { name: '运行评价', goal: '保留窗框' } }, signal)
    for (const id of ['run', 'review', 'diagnose', 'compare', 'experience'])
      await host.remote.mutate({ workspaceId: root.workspaceId, type: 'function-preset', id, value: 'preset-a' }, signal)
    await setHostField(host, { ...root, field: 'instance_id', value: '8' }, signal)
    for (const value of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }])
      await host.remote.mutate({ ...root, type: 'resource-select', value }, signal)
    const createRun = async (finish = true, scope = root) => {
      await saveHostInput(host, scope)
      const receipt = await host.remote.mutate({ ...scope, type: 'run' }, signal)
      const task = (await host.remote.getProjection(scope, signal)).tasks.find(item => item.task_id === receipt.taskId)!
      const { toGenerationRequest, parseCliGenerationRequest } = await import('../../src/cli/contract.ts')
      const accepted = await host.runtime.acceptGenerations({ workspaceId: root.workspaceId, sessionId: task.session_id!, turn: 1, callId: crypto.randomUUID() },
        [{ requestId: crypto.randomUUID(), request: toGenerationRequest(parseCliGenerationRequest(task.input.generation_input)) }], signal, task.task_id)
      if (finish) {
        for (let phase = 0; phase < 4; phase++) await host.runtime.advance()
        host.official.agents.get(task.session_id!)!.status = 'idle'
      }
      return accepted.items[0]!.runId
    }
    const runId = await createRun()
    const environment = await host.remote.getEnvironment({ workspaceId: root.workspaceId }, signal)
    const options = {
      workspaceId: root.workspaceId, workspaces: environment.workspaces, presets: environment.presets,
      instances: environment.instances, agentModelGroups: environment.models.groups,
      routableProviders: environment.models.routableProviders,
      onAction: vi.fn((request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => host.remote.mutate(request, signal)),
      remote: { subscribe: (request, streamSignal) => host.remote.subscribe(request, streamSignal), getProjection: request => host.remote.getProjection(request, signal),
        getRunInput: request => host.remote.getRunInput(request, signal), queryRecords: request => host.remote.queryRecords(request, signal),
        getInputDescription: request => host.remote.getInputDescription(request, signal) },
    } satisfies NonNullable<Parameters<typeof mount>[1]>
    return { host, root, runId, createRun, options }
  }

  const startExperiment = async (maxRuns = 3, observeFailure?: () => boolean, describeInput?: PrepareDescription) => {
    const state = await setup(true, observeFailure, describeInput)
    const { host, root } = state
    await host.remote.mutate({ workspaceId: root.workspaceId, type: 'function-preset', id: 'experiment', value: 'preset-a' }, signal)
    await host.remote.mutate({ ...root, type: 'update-execution', field: 'max_runs', value: maxRuns }, signal)
    const receipt = await host.remote.mutate({ ...root, type: 'experiment' }, signal)
    const task = (await host.remote.getProjection(root, signal)).tasks.find(item => item.task_id === receipt.taskId)!
    const publish = (artifact: ArtifactPayload) => host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact },
      { workspaceId: root.workspaceId, sessionId: task.session_id!, turn: 1, callId: crypto.randomUUID() })
    const accept = async (input = task.input.generation_input) => {
      const { toGenerationRequest, parseCliGenerationRequest } = await import('../../src/cli/contract.ts')
      const accepted = await host.runtime.acceptGenerations({ workspaceId: root.workspaceId, sessionId: task.session_id!, turn: 1, callId: crypto.randomUUID() },
        [{ requestId: crypto.randomUUID(), request: toGenerationRequest(parseCliGenerationRequest(input)) }], signal, task.task_id)
      return accepted.items[0]!.runId
    }
    const finish = async () => { for (let phase = 0; phase < 4; phase++) await host.runtime.advance() }
    return { ...state, task, publish, accept, finish }
  }

  it.each(['prompt-first', 'review-first'] as const)('delivers parallel prompt and review Tasks to their fixed targets after browsing elsewhere: %s', async order => {
    const { host, root, runId, options } = await setup(true)
    try {
      await host.remote.mutate({ workspaceId: root.workspaceId, type: 'function-preset', id: 'prompt', value: 'preset-a' }, signal)
      const baseline = (await host.remote.getProjection(root, signal)).runs.find(run => run.run_id === runId)!.review_draft!
      await host.remote.mutate({ ...root, runId, type: 'evaluate', value: { expected: baseline,
        draft: { ...baseline, conclusion: '保留人工保存评价' }, saveExperience: false } }, signal)
      const promptBranch = await host.remote.mutate({ ...root, type: 'create-branch', value: { name: '提示词目标', original_request: '提示词目标需求' } }, signal)
      await host.remote.mutate({ ...promptBranch, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      await setHostField(host, { ...promptBranch, field: 'positive_prompt', value: '本轮改写原文' }, signal)
      const browsing = await host.remote.mutate({ ...root, type: 'create-branch', value: { name: '当前浏览分支', original_request: '当前浏览需求' } }, signal)
      await setHostField(host, { ...browsing, field: 'positive_prompt', value: '浏览分支原文' }, signal)
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), { ...options, remote: { ...options.remote, ...promptRemote(host, signal),
        getTaskDraft: request => host.remote.getTaskDraft(request, signal),
        saveTaskDraft: request => host.remote.saveTaskDraft(request, signal) } })
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '记录评价与经验')
      await click(renderer, '分析结果')
      await vi.waitFor(async () => expect((await host.remote.getProjection(root, signal)).tasks.some(task => task.kind === 'review')).toBe(true))
      await click(renderer, '取消')
      await click(renderer, '切换分支 提示词目标')
      await click(renderer, '对比提示词')
      await change(renderer, '改动意见', '独立提示词任务')
      await click(renderer, '改写提示词')
      await click(renderer, '关闭')
      await click(renderer, '切换分支 当前浏览分支')
      const accepted = await host.remote.getProjection({ workspaceId: root.workspaceId, workId: root.workId }, signal)
      const review = accepted.tasks.find(task => task.kind === 'review')!
      const prompt = accepted.tasks.find(task => task.kind === 'prompt')!
      expect(review.apply_target).toMatchObject({ kind: 'run_review', id: runId })
      expect(prompt.apply_target).toMatchObject({ kind: 'branch', id: promptBranch.branchId })
      const publications = {
        prompt: { task: prompt, artifact: { type: 'prompt', positive_prompt: '固定分支的新提示词', negative_prompt: '固定分支的新负向词' } as ArtifactPayload },
        review: { task: review, artifact: { type: 'review', observation: '固定运行的观察', conclusion: '固定运行的新评价', run_ids: [runId] } as ArtifactPayload },
      }
      for (const kind of order === 'prompt-first' ? ['prompt', 'review'] as const : ['review', 'prompt'] as const) {
        const publication = publications[kind]
        if (kind === 'prompt') {
          const turn = (await host.remote.promptList({ workspace_id: root.workspaceId, task_id: prompt.task_id }, signal))[0]!
          completePrompt(host, turn, publication.artifact as PromptReply)
        } else await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: publication.task.task_id, artifact: publication.artifact },
          { workspaceId: root.workspaceId, sessionId: publication.task.session_id!, turn: 1, callId: crypto.randomUUID() })
      }
      expect(readField(renderer.root, '正向提示词')).toBe('浏览分支原文')
      expect(nodeText(renderer.root.findByProps({ className: 'config-head' }))).toContain('当前浏览分支')
      await click(renderer, '切换分支 提示词目标')
      await click(renderer, '对比提示词')
      await vi.waitFor(() => expect(readField(renderer.root, '生成的正向提示词')).toBe('固定分支的新提示词'), { timeout: 3000 })
      await click(renderer, '采用生成结果')
      expect(readField(renderer.root, '正向提示词')).toBe('固定分支的新提示词')
      await click(renderer, '切换分支 主分支')
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '记录评价与经验')
      await vi.waitFor(() => expect(readField(renderer.root, '观察')).toBe('固定运行的观察'), { timeout: 3000 })
      expect(readField(renderer.root, '评价结论')).toBe('固定运行的新评价')
      const after = await host.remote.getProjection(root, signal)
      expect(after.runs.find(run => run.run_id === runId)!.review!.conclusion).toBe('保留人工保存评价')
      expect(after.branches.find(branch => branch.branch_id === browsing.branchId)!.draft.prompt_input.positive_prompt).toBe('浏览分支原文')
    } finally { await host.dispose() }
  })

  it('keeps the selected real Run and input mounted across disconnection and refreshes after recovery', async () => {
    const { host, root, runId, options } = await setup(true)
    try {
      const connection = createConnectionState()
      let disconnected = false
      const getProjection = vi.fn(async (request: { workspaceId: string; workId?: string }) => {
        if (disconnected) throw new Error('Controlled connection interrupted')
        return host.remote.getProjection(request, signal)
      })
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), { ...options, connectionState: connection.source, remote: { ...options.remote, getProjection } })
      await click(renderer, '查看运行 ' + runId)
      await vi.waitFor(() => expect(readField(renderer.root, 'Seed')).toBe('0'))
      const before = getProjection.mock.calls.length
      disconnected = true
      await act(() => connection.set('disconnected'))
      expect(getProjection.mock.calls.length).toBe(before)
      expect(nodeText(renderer.root.findByProps({ className: 'stage-caption' }))).toContain(runId.slice(0, 12))
      expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed']).toBe(true)
      expect(readField(renderer.root, 'Seed')).toBe('0')
      await host.remote.mutate({ ...root, type: 'favorite', id: runId, value: { targetType: 'run', favorite: true } }, signal)
      disconnected = false
      await act(() => connection.set('connected'))
      await vi.waitFor(() => expect(renderer.root.findAllByType('button').map(nodeText)).toContain('移除收藏'), { timeout: 3000 })
      expect(nodeText(renderer.root.findByProps({ className: 'stage-caption' }))).toContain(runId.slice(0, 12))
      expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed']).toBe(true)
    } finally { await host.dispose() }
  })

  it('opens three real experiment rounds with their own inputs, linked automatic reviews and saved manual review', async () => {
    const { host, root, task, options, accept, finish, publish } = await startExperiment(4)
    try {
      const first = await accept()
      await finish()
      let projection = await host.remote.getProjection(root, signal)
      const baseline = projection.runs.find(item => item.run_id === first)!.review_draft!
      await host.remote.mutate({ ...root, runId: first, type: 'evaluate', value: { expected: baseline,
        draft: { ...baseline, observation: '人工观察', conclusion: '人工保存结论' }, saveExperience: false } }, signal)
      await publish({ type: 'review', observation: '首轮玻璃边缘', conclusion: '首轮自动结论', run_ids: [first] })
      const secondInput = { ...task.input.generation_input, parameters: { ...task.input.generation_input.parameters, seed_1: 42 } }
      await publish({ type: 'generation_input', generation_input: secondInput, image_refs: [], workflow_image_bindings: [] })
      const second = await accept(secondInput)
      await finish()
      await publish({ type: 'review', observation: '第二轮边缘改善', conclusion: '第二轮自动结论', run_ids: [second] })
      const thirdInput = { ...secondInput, parameters: { ...secondInput.parameters, seed_1: 73 } }
      await publish({ type: 'generation_input', generation_input: thirdInput, image_refs: [], workflow_image_bindings: [] })
      const third = await accept(thirdInput)
      projection = await host.remote.getProjection(root, signal)
      const { renderer } = await mountReady(projection, options)
      const status = () => renderer.root.findByProps({ className: 'taskbox' })
      expect(nodeText(status())).toContain('已提交 3 次 · 还可提交 1 次')
      expect(nodeText(status())).toContain('2 / 4')
      expect(nodeText(status())).toContain(third + ' 正在运行')
      const steps = status().findAllByProps({ className: 'agent-step' })
      expect(steps).toHaveLength(3)
      for (const [index, runId] of [first, second, third].entries()) {
        await act(async () => status().findAllByProps({ className: 'agent-step' })[index]!.findAllByType('button')[0]!.props.onClick())
        expect(nodeText(renderer.root.findByProps({ className: 'stage-caption' }))).toContain(runId.slice(0, 12))
        await vi.waitFor(() => expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed']).toBe(true))
        if (index < 2) await vi.waitFor(() => expect(readField(renderer.root, 'Seed')).toBe(index === 0 ? '0' : '42'))
      }
      await click(renderer, '任务')
      const card = renderer.root.findAllByProps({ className: 'agent-task-card' }).find(item => item.props['data-task'] === task.task_id)!
      expect(nodeText(card.findByProps({ className: 'task-progress' }))).toBe('已完成 2 / 4 次')
      const rounds = card.findAllByProps({ className: 'row task-round' })
      expect(rounds).toHaveLength(3)
      expect(rounds.map(round => nodeText(round.findAllByType('span').at(-1)!))).toEqual(['首轮自动结论', '第二轮自动结论', ''])
      await act(async () => rounds[0]!.findAllByType('button')[0]!.props.onClick())
      await click(renderer, '记录评价与经验')
      expect(readField(renderer.root, '评价结论')).toBe('人工保存结论')
      await click(renderer, '取消')
      expect((await host.remote.getProjection(root, signal)).runs.find(item => item.run_id === first)!.review!.conclusion).toBe('人工保存结论')
    } finally { await host.dispose() }
  })

  it('reads each experiment Run with its saved template description after the next round changes resources and parameter fields', async () => {
    const describeInput: PrepareDescription = request => request.templateId === '6' ? {
      parameters: [
        { parameter_id: 'caption_2', kind: 'positive_prompt', value_type: 'string', current_value: request.parameters.caption_2! },
        { parameter_id: 'negative_2', kind: 'negative_prompt', value_type: 'string', current_value: '' },
        { parameter_id: 'seed_2', kind: 'seed', value_type: 'integer', current_value: request.parameters.seed_2! },
        { parameter_id: 'steps_2', kind: 'steps', value_type: 'integer', current_value: request.parameters.steps_2! },
        { parameter_id: 'sampler_2', kind: 'sampler_name', value_type: 'string', current_value: request.parameters.sampler_2! },
        { parameter_id: 'reference_2', kind: 'reference_image', value_type: 'string', current_value: request.parameters.reference_2! },
      ], size_candidates: [],
    } : runInputDescription(request.parameters)
    const { host, root, task, options, accept, finish, publish } = await startExperiment(3, undefined, describeInput)
    try {
      const first = await accept()
      await finish()
      await publish({ type: 'review', observation: '首轮窗框需要改善', conclusion: '下一轮更换模板和资源', run_ids: [first] })
      const next = { ...task.input.generation_input, instance_id: '9', template_id: '6',
        model: { id: '4', file_name: 'paint.safetensors' }, loras: [{ id: '6', file_name: 'rain.safetensors', weight: 0.9, trigger_words: ['rain'] }],
        parameters: { caption_2: '第二模板的窗框', negative_2: '', seed_2: 123, steps_2: 13, sampler_2: 'euler', reference_2: '/images/round2.png' } }
      await publish({ type: 'generation_input', generation_input: next, image_refs: [], workflow_image_bindings: [] })
      const second = await accept(next)
      await finish()
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), options)
      const steps = () => renderer.root.findByProps({ className: 'taskbox' }).findAllByProps({ className: 'agent-step' })
      await act(async () => steps()[1]!.findAllByType('button')[0]!.props.onClick())
      await vi.waitFor(() => expect(readField(renderer.root, 'Seed')).toBe('123'))
      expect(readField(renderer.root, '采样步数')).toBe('13')
      expect(readField(renderer.root, '采样器')).toBe('euler')
      expect(readField(renderer.root, '正向提示词')).toBe('第二模板的窗框')
      expect(renderer.root.findAllByProps({ className: 'image-inputs' })).toHaveLength(2)
      expect(await host.remote.getRunInput({ workspaceId: root.workspaceId, workId: root.workId!, runId: second }, signal)).toMatchObject({ generation_input: next, image_refs: [], workflow_image_bindings: [] })
      await act(async () => steps()[0]!.findAllByType('button')[0]!.props.onClick())
      await vi.waitFor(() => expect(readField(renderer.root, 'Seed')).toBe('0'))
      expect(readField(renderer.root, '采样步数')).toBe('20')
      expect(await host.remote.getRunInput({ workspaceId: root.workspaceId, workId: root.workId!, runId: first }, signal)).toMatchObject({ generation_input: task.input.generation_input })
    } finally { await host.dispose() }
  })

  it('waits for the final automatic review before retaining a completed two-Run budget with a failed round', async () => {
    let fail = false
    const { host, root, task, options, accept, finish, publish } = await startExperiment(2, () => fail)
    try {
      const first = await accept()
      await finish()
      await publish({ type: 'review', observation: '成功轮次', conclusion: '保留窗框', run_ids: [first] })
      const candidate = { ...task.input.generation_input, parameters: { ...task.input.generation_input.parameters, seed_1: 99 } }
      await publish({ type: 'generation_input', generation_input: candidate, image_refs: [], workflow_image_bindings: [] })
      const second = await accept(candidate)
      fail = true
      await finish()
      const before = await host.remote.getProjection(root, signal)
      expect(before.experiments[0]).toMatchObject({ control_state: 'running', submitted_count: 2 })
      const { renderer } = await mountReady(before, options)
      expect(nodeText(renderer.root.findByProps({ className: 'taskbox' }))).toContain('实验运行中')
      expect(nodeText(renderer.root.findByProps({ className: 'taskbox' }))).toContain('已提交 2 次 · 还可提交 0 次')
      await publish({ type: 'review', observation: '第二轮生成失败', conclusion: '本轮仍占用次数', run_ids: [second] })
      await vi.waitFor(() => expect(nodeText(renderer.root.findByProps({ className: 'taskbox' }))).toContain('实验已完成'), { timeout: 3000 })
      expect(nodeText(renderer.root.findByProps({ className: 'taskbox' }))).toContain('2 / 2')
      expect(renderer.root.findAllByType('button').map(nodeText)).not.toContain('暂停实验')
      const steps = renderer.root.findByProps({ className: 'taskbox' }).findAllByProps({ className: 'agent-step' })
      await act(async () => steps[1]!.findAllByType('button')[0]!.props.onClick())
      await vi.waitFor(() => expect(readField(renderer.root, 'Seed')).toBe('99'))
      expect(nodeText(renderer.root)).toContain('本轮受控生成失败。')
      const after = await host.remote.getProjection(root, signal)
      expect(after.experiments[0]).toMatchObject({ control_state: 'completed', end_reason: 'budget_used', submitted_count: 2 })
      expect(after.runs.filter(run => run.workbench_task_id === task.task_id).map(run => run.status)).toEqual(['succeeded', 'failed'])
      const { renderer: reopened } = await mountReady(after, options)
      expect(nodeText(reopened.root.findByProps({ className: 'taskbox' }))).toContain('实验已完成')
      expect(reopened.root.findByProps({ className: 'taskbox' }).findAllByProps({ className: 'agent-step' })).toHaveLength(2)
    } finally { await host.dispose() }
  })

  it('keeps accepted Runs updating while paused and adds one new round on the original Task after continuing', async () => {
    const { host, root, task, options, accept, finish, publish } = await startExperiment()
    try {
      const first = await accept()
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), options)
      await click(renderer, '暂停实验')
      await vi.waitFor(() => expect(renderer.root.findAllByType('button').map(nodeText)).toContain('继续实验'))
      await finish()
      await publish({ type: 'review', observation: '暂停期间完成', conclusion: '首轮已保存', run_ids: [first] })
      await vi.waitFor(() => expect(nodeText(renderer.root.findByProps({ className: 'taskbox' }))).toContain('1 / 3'), { timeout: 3000 })
      expect(nodeText(renderer.root.findByProps({ className: 'taskbox' }))).toContain('已暂停')
      const paused = await host.remote.getProjection(root, signal)
      expect(paused.runs.find(run => run.run_id === first)!.status).toBe('succeeded')
      const { renderer: reopened } = await mountReady(paused, options)
      expect(nodeText(reopened.root.findByProps({ className: 'taskbox' }))).toContain('已暂停')
      const candidate = { ...task.input.generation_input, parameters: { ...task.input.generation_input.parameters, seed_1: 17 } }
      await publish({ type: 'generation_input', generation_input: candidate, image_refs: [], workflow_image_bindings: [] })
      await click(renderer, '继续实验')
      await vi.waitFor(() => expect(renderer.root.findAllByType('button').map(nodeText)).toContain('暂停实验'))
      const second = await accept(candidate)
      await vi.waitFor(() => expect(renderer.root.findByProps({ className: 'taskbox' }).findAllByProps({ className: 'agent-step' })).toHaveLength(2), { timeout: 3000 })
      const after = await host.remote.getProjection(root, signal)
      expect(after.experiments[0]).toMatchObject({ task_id: task.task_id, control_state: 'running', submitted_count: 2 })
      expect(after.tasks.find(item => item.task_id === task.task_id)!.session_id).toBe(task.session_id)
      expect(after.runs.filter(run => run.workbench_task_id === task.task_id).map(run => run.run_id)).toEqual([first, second])
    } finally { await host.dispose() }
  })

  it('keeps the same paused experiment and selected input after continue dispatch fails, then retries it', async () => {
    const { host, root, runId, task, options } = await startExperiment()
    try {
      await host.remote.mutate({ ...root, type: 'pause-experiment', taskId: task.task_id }, signal)
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), options)
      await click(renderer, '查看运行 ' + runId)
      await vi.waitFor(() => expect(readField(renderer.root, 'Seed')).toBe('0'))
      host.official.controller.prompt.mockRejectedValueOnce(new Error('Controlled resume dispatch failed'))
      await click(renderer, '任务')
      await click(renderer, '准备运行')
      await click(renderer, '继续实验')
      await click(renderer, '查看运行输入')
      await vi.waitFor(() => expect(renderer.root.findAllByProps({ className: 'toast' }).map(nodeText).join(' ')).toContain('Controlled resume dispatch failed'))
      expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props.title).toBe(runId)
      expect(nodeText(renderer.root.findByProps({ className: 'taskbox' }))).toContain('已暂停')
      expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed']).toBe(true)
      await click(renderer, '准备运行')
      await click(renderer, '继续实验')
      await click(renderer, '查看运行输入')
      await vi.waitFor(() => expect(nodeText(renderer.root.findByProps({ className: 'taskbox' }))).toContain('实验运行中'))
      const after = await host.remote.getProjection(root, signal)
      expect(after.experiments[0]!.task_id).toBe(task.task_id)
      expect(after.tasks.find(item => item.task_id === task.task_id)!.session_id).toBe(task.session_id)
    } finally { await host.dispose() }
  })

  it('keeps an ended experiment visible while its accepted Run finishes and another Task continues', async () => {
    const { host, root, options, task, accept, finish } = await startExperiment()
    try {
      const runId = await accept()
      await host.remote.mutate({ workspaceId: root.workspaceId, type: 'function-preset', id: 'prompt', value: 'preset-a' }, signal)
      const other = await host.remote.mutate({ ...root, type: 'create-branch', value: { name: '并行提示词', original_request: '另一个任务目标' } }, signal)
      const concurrent = await host.remote.mutate({ ...other, type: 'agent-action', id: 'prompt' }, signal)
      const scope = { workspaceId: root.workspaceId, workId: root.workId }
      const { renderer } = await mountReady(await host.remote.getProjection(scope, signal), options)
      await click(renderer, '切换分支 主分支')
      await click(renderer, '任务')
      await click(renderer, '结束实验')
      await vi.waitFor(async () => expect((await host.remote.getProjection(root, signal)).experiments[0]!.control_state).toBe('ended'))
      await vi.waitFor(() => expect(nodeText(renderer.root.findByProps({ className: 'taskbox' }))).toContain('实验已结束'))
      expect(renderer.root.findByProps({ 'aria-label': '任务' }).props.className).toBe('active')
      expect(renderer.root.findAllByType('button').map(nodeText)).not.toContain('暂停实验')
      await finish()
      await vi.waitFor(() => expect(nodeText(renderer.root.findAllByProps({ className: 'agent-task-card' }).find(card => card.props['data-task'] === task.task_id)!)).toContain(runId.slice(0, 12)), { timeout: 3000 })
      const projection = await host.remote.getProjection(scope, signal)
      expect(projection.experiments.find(item => item.task_id === task.task_id)!.control_state).toBe('ended')
      expect(projection.runs.find(item => item.run_id === runId)!.status).toBe('succeeded')
      expect(projection.tasks.find(item => item.task_id === concurrent.taskId)!.execution_state).toBe('running')
      expect(nodeText(renderer.root.findByProps({ className: 'taskbox' }))).toContain('已提交 1 次 · 还可提交 2 次')
    } finally { await host.dispose() }
  })

  it('preserves the browsed Run and fixed input while pausing and continuing the same real experiment', async () => {
    const { host, root, runId, options } = await setup(true)
    try {
      await host.remote.mutate({ workspaceId: root.workspaceId, type: 'function-preset', id: 'experiment', value: 'preset-a' }, signal)
      await host.remote.mutate({ ...root, type: 'update-execution', field: 'max_runs', value: 3 }, signal)
      const receipt = await host.remote.mutate({ ...root, type: 'experiment' }, signal)
      const task = (await host.remote.getProjection(root, signal)).tasks.find(item => item.task_id === receipt.taskId)!
      const { toGenerationRequest, parseCliGenerationRequest } = await import('../../src/cli/contract.ts')
      await host.runtime.acceptGenerations({ workspaceId: root.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'active-experiment' },
        [{ requestId: crypto.randomUUID(), request: toGenerationRequest(parseCliGenerationRequest(task.input.generation_input)) }], signal, task.task_id)
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), options)
      await click(renderer, '查看运行 ' + runId)
      await vi.waitFor(() => expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed']).toBe(true))
      await click(renderer, '任务')
      await click(renderer, '准备运行')
      await click(renderer, '暂停实验')
      await click(renderer, '查看运行输入')
      await vi.waitFor(async () => expect((await host.remote.getProjection(root, signal)).experiments[0]!.control_state).toBe('paused'))
      expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props.title).toBe(runId)
      expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed']).toBe(true)
      await click(renderer, '任务')
      await click(renderer, '准备运行')
      await click(renderer, '继续实验')
      await click(renderer, '查看运行输入')
      await vi.waitFor(async () => expect((await host.remote.getProjection(root, signal)).experiments[0]!.control_state).toBe('running'))
      expect(renderer.root.findByProps({ 'aria-label': '任务' }).props.className).toBe('active')
      expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed']).toBe(true)
      const after = await host.remote.getProjection(root, signal)
      expect(after.experiments).toHaveLength(1)
      expect(after.experiments[0]!.task_id).toBe(task.task_id)
      expect(after.tasks.find(item => item.task_id === task.task_id)!.session_id).toBe(task.session_id)
    } finally { await host.dispose() }
  })

  it.each(['missing', 'broken'] as const)('keeps the unavailable %s default preset until the user selects an available one', async state => {
    const { host, root, options } = await setup(true)
    try {
      const defaults = await host.remote.getEnvironment({ workspaceId: root.workspaceId }, signal)
      host.official.listPresets.mockResolvedValue([{ id: 'preset-a', name: 'Available first preset' },
        ...(state === 'broken' ? [{ id: defaults.defaultPresetId, name: 'Broken default', broken: 'Missing component' }] : [])])
      const environment = await host.remote.getEnvironment({ workspaceId: root.workspaceId }, signal)
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), { ...options, presets: environment.presets,
        remote: { ...options.remote, getEnvironment: request => host.remote.getEnvironment(request, signal) } })
      await click(renderer, '配置中心')
      await click(renderer, '添加功能')
      await change(renderer, '功能名称', '等待选择预设')
      const preset = renderer.root.findByProps({ 'aria-label': 'Agent 预设' })
      expect(preset.props.value).toBe(defaults.defaultPresetId)
      expect(nodeText(preset)).toContain('预设不可用')
      expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toContain('预设')
      expect(renderer.root.findAllByType('button').find(button => nodeText(button) === '保存功能')!.props.disabled).toBe(true)
      await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      expect(options.onAction.mock.calls.filter(([request]) => request.type === 'function-add')).toEqual([])
      await change(renderer, 'Agent 预设', 'preset-a')
      await vi.waitFor(() => expect(renderer.root.findAllByType('button').find(button => nodeText(button) === '保存功能')!.props.disabled).toBe(false))
      await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      await vi.waitFor(() => expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0))
      expect((await host.remote.getProjection(root, signal)).functions.find(item => item.name === '等待选择预设')!.preset_id).toBe('preset-a')
    } finally { await host.dispose() }
  })

  it('keeps add and remove failures editable and leaves a reopened dialog intact after late receipts', async () => {
    const { host, root, options } = await setup(true)
    let releaseAdd!: () => void, releaseRemove!: () => void
    const addGate = new Promise<void>(resolve => { releaseAdd = resolve })
    const removeGate = new Promise<void>(resolve => { releaseRemove = resolve })
    let addMode: 'fail' | 'delay' = 'fail', removeMode: 'fail' | 'delay' = 'fail'
    const pending: Promise<unknown>[] = []
    try {
      const defaults = await host.remote.getEnvironment({ workspaceId: root.workspaceId }, signal)
      host.official.listPresets.mockResolvedValue([{ id: defaults.defaultPresetId, name: '默认工作台预设' }, { id: 'preset-a', name: 'Preset A' }])
      const environment = await host.remote.getEnvironment({ workspaceId: root.workspaceId }, signal)
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), { ...options, presets: environment.presets,
        onAction: async request => {
          if (request.type === 'function-add') {
            if (addMode === 'fail') throw new Error('功能保存失败：连接已中断，请重试。')
            await addGate
          }
          if (request.type === 'function-remove') {
            if (removeMode === 'fail') throw new Error('功能移除失败：连接已中断，请重试。')
            await removeGate
          }
          return options.onAction(request)
        },
        remote: { ...options.remote, getEnvironment: request => host.remote.getEnvironment(request, signal) } })
      await click(renderer, '配置中心')
      await click(renderer, '添加功能')
      await change(renderer, '功能名称', '延迟创建的功能')
      await change(renderer, '执行要求', '保留要求 {{requirements_block}}')
      await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      expect(readField(renderer.root, '功能名称')).toBe('延迟创建的功能')
      expect(readField(renderer.root, '执行要求')).toBe('保留要求 {{requirements_block}}')
      expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toContain('功能保存失败：连接已中断，请重试。')
      addMode = 'delay'
      await act(() => {
        const submit = renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit
        pending.push(submit({ preventDefault() {} }), submit({ preventDefault() {} }))
      })
      await click(renderer, '取消')
      await click(renderer, '添加功能')
      await change(renderer, '功能名称', '后开的新增窗口')
      await act(async () => { releaseAdd(); await Promise.all(pending) })
      expect(readField(renderer.root, '功能名称')).toBe('后开的新增窗口')
      expect((await host.remote.getProjection(root, signal)).functions.filter(item => item.name === '延迟创建的功能')).toHaveLength(1)
      await click(renderer, '取消')
      await click(renderer, '移除延迟创建的功能')
      const escape = new Event('keydown')
      Object.defineProperty(escape, 'key', { value: 'Escape' })
      await act(() => { document.dispatchEvent(escape) })
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
      await click(renderer, '移除延迟创建的功能')
      await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      expect(nodeText(renderer.root.findByProps({ role: 'dialog' }))).toContain('功能移除失败：连接已中断，请重试。')
      removeMode = 'delay'
      await act(() => {
        const submit = renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit
        pending.push(submit({ preventDefault() {} }), submit({ preventDefault() {} }))
      })
      await click(renderer, '取消')
      await click(renderer, '添加功能')
      await change(renderer, '功能名称', '移除回执后的新窗口')
      await act(async () => { releaseRemove(); await Promise.all(pending) })
      expect(readField(renderer.root, '功能名称')).toBe('移除回执后的新窗口')
      expect((await host.remote.getProjection(root, signal)).functions.some(item => item.name === '延迟创建的功能')).toBe(false)
      await click(renderer, '取消')
    } finally {
      await act(async () => { releaseAdd(); releaseRemove(); await Promise.allSettled(pending) })
      await host.dispose()
    }
  })

  it.each(['run', 'parameters', 'resources', 'review', 'compare', 'diagnose', 'experience', 'experiment'] as const)(
    'creates %s through the shared editor and invokes the configured kind at its real UI entry', async kind => {
      const { host, root, runId, createRun, options } = await setup(kind !== 'diagnose')
      try {
        const defaults = await host.remote.getEnvironment({ workspaceId: root.workspaceId }, signal)
        host.official.listPresets.mockResolvedValue([{ id: 'preset-a', name: 'First preset' }, { id: defaults.defaultPresetId, name: '默认工作台预设' }])
        const environment = await host.remote.getEnvironment({ workspaceId: root.workspaceId }, signal)
        const otherRunId = kind === 'compare' ? await createRun() : null
        const { renderer } = await mountReady(await host.remote.getProjection(root, signal), { ...options, presets: environment.presets,
          remote: { ...options.remote, getEnvironment: request => host.remote.getEnvironment(request, signal),
            getTaskDraft: request => host.remote.getTaskDraft(request, signal), saveTaskDraft: request => host.remote.saveTaskDraft(request, signal) } })
        const name = '独立功能 ' + kind
        await click(renderer, '配置中心')
        await click(renderer, '添加功能')
        await change(renderer, '功能名称', name)
        await change(renderer, '任务类型', kind)
        await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
        await vi.waitFor(() => expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0))
        const added = (await host.remote.getProjection(root, signal)).functions.find(item => item.name === name)!
        await click(renderer, '返回工作台')
        if (kind === 'review' || kind === 'experience') {
          await click(renderer, '记录评价与经验')
          const sections = renderer.root.findAllByProps({ className: 'evaluation-section' })
          expect(nodeText(sections[kind === 'review' ? 0 : 1]!)).toContain(name)
        } else if (kind === 'compare') {
          await click(renderer, '查看运行 ' + runId)
          await click(renderer, '比较运行')
          await click(renderer, '比较运行 ' + otherRunId)
        } else if (kind === 'experiment') {
          await change(renderer, '持续实验', 'continuous')
          await vi.waitFor(() => expect(renderer.root.findAllByType('button').some(button => nodeText(button) === name)).toBe(true))
          await change(renderer, '最多运行次数', '2')
        }
        if (['parameters', 'resources'].includes(kind)) await click(renderer, '编辑参数')
        await click(renderer, name)
        if (['parameters', 'resources'].includes(kind)) {
          expect(nodeText(renderer.root.findByProps({ role: 'dialog' }))).toContain(name)
          await change(renderer, '任务要求', '按独立配置执行')
          await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
        }
        await vi.waitFor(async () => expect((await host.remote.getProjection(root, signal)).tasks.some(item => item.function_id === added.function_id)).toBe(true))
        const task = (await host.remote.getProjection(root, signal)).tasks.find(item => item.function_id === added.function_id)!
        expect(task).toMatchObject({ kind, binding_snapshot: { name, kind, preset_id: environment.defaultPresetId } })
        if (kind === 'compare') expect(task.input.reference_run_ids).toEqual([runId, otherRunId])
        if (kind === 'run') expect(renderer.root.findAllByProps({ 'aria-label': '本次执行预设' })).toHaveLength(0)
        if (kind === 'experiment') {
          await vi.waitFor(() => expect(nodeText(renderer.root.findByProps({ className: 'taskbox' }))).toContain('执行预设：默认工作台预设'))
          await click(renderer, '结束实验')
          expect(renderer.root.findAllByProps({ 'aria-label': '本次执行预设' })).toHaveLength(0)
        }
      } finally { await host.dispose() }
    })

  it('shows the accepted experiment snapshot and its first Run without reading later Branch edits', async () => {
    const { host, root, options } = await setup(true)
    try {
      await host.remote.mutate({ workspaceId: root.workspaceId, type: 'function-preset', id: 'experiment', value: 'preset-a' }, signal)
      await setHostField(host, { ...root, field: 'positive_prompt', value: '启动时的玻璃花房' }, signal)
      await setHostField(host, { ...root, field: 'parameter', id: 'seed_1', value: 123 }, signal)
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), options)
      await change(renderer, '持续实验', 'continuous')
      await vi.waitFor(() => expect(renderer.root.findByProps({ 'aria-label': '最多运行次数' })).toBeDefined())
      await change(renderer, '最多运行次数', '3')
      await vi.waitFor(() => expect(readField(renderer.root, '最多运行次数')).toBe(3))
      await click(renderer, '开始实验')
      await vi.waitFor(() => expect(renderer.root.findByProps({ className: 'taskbox' })).toBeDefined())
      const task = (await host.remote.getProjection(root, signal)).tasks.find(item => item.kind === 'experiment')!
      const box = () => renderer.root.findByProps({ className: 'taskbox' })
      expect(nodeText(box().findAllByType('h3')[0]!)).toBe(task.title)
      expect(nodeText(box())).toContain('保留窗框')
      expect(nodeText(box())).toContain('执行预设：Preset A')
      expect(nodeText(box())).toContain('Agent 模型：Provider A · Model A')
      expect(nodeText(box())).toContain('已提交 0 次 · 还可提交 3 次')
      expect(readField(renderer.root, '正向提示词')).toBe('启动时的玻璃花房')
      expect(renderer.root.findAllByType('button').map(nodeText)).toContain('暂停实验')
      expect(renderer.root.findAllByType('button').map(nodeText)).toContain('结束实验')
      await setHostField(host, { ...root, field: 'original_request', value: '启动后的需求修改', expectedValue: '保留窗框' }, signal)
      await setHostField(host, { ...root, field: 'positive_prompt', value: '启动后的分支修改' }, signal)
      await setHostField(host, { ...root, field: 'parameter', id: 'seed_1', value: 999 }, signal)
      const { toGenerationRequest, parseCliGenerationRequest } = await import('../../src/cli/contract.ts')
      const accepted = await host.runtime.acceptGenerations({ workspaceId: root.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'experiment-first' },
        [{ requestId: crypto.randomUUID(), request: toGenerationRequest(parseCliGenerationRequest(task.input.generation_input)) }], signal, task.task_id)
      const runId = accepted.items[0]!.runId
      await vi.waitFor(() => expect(nodeText(box())).toContain(runId + ' 正在运行'), { timeout: 3000 })
      expect(readField(renderer.root, 'seed_1')).toBe('123')
      expect(readField(renderer.root, '原始需求')).toBe('保留窗框')
      for (let phase = 0; phase < 4; phase++) await host.runtime.advance()
      await vi.waitFor(() => expect(nodeText(box())).toContain('已提交 1 次 · 还可提交 2 次'), { timeout: 3000 })
      expect(readField(renderer.root, '正向提示词')).toBe('启动时的玻璃花房')
      await click(renderer, '查看本轮结果')
      await vi.waitFor(() => expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed']).toBe(true))
      await vi.waitFor(() => expect(readField(renderer.root, 'Seed')).toBe('123'), { timeout: 3000 })
      expect(nodeText(renderer.root.findByProps({ className: 'stage-caption' }))).toContain(runId.slice(0, 12))
      expect((await host.remote.getProjection(root, signal)).experiments).toHaveLength(1)
      expect((await host.remote.getProjection(root, signal)).tasks.filter(item => item.kind === 'experiment')).toHaveLength(1)
    } finally { await host.dispose() }
  })

  it('moves an edited custom entry and confirms removal while keeping its real Task, Run and artifact snapshots', async () => {
    const { host, root, options } = await setup(true)
    try {
      const initial = await host.remote.getProjection(root, signal)
      const source = initial.functions.find(item => item.function_id === 'run')!
      const { kind, preset_id, agent_model, requested_skill, request_template } = source
      await host.remote.mutate({ ...root, type: 'function-add', value: { name: '独立运行', kind, preset_id, agent_model, requested_skill, request_template } }, signal)
      const added = (await host.remote.getProjection(root, signal)).functions.find(item => item.name === '独立运行')!
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), { ...options,
        remote: { ...options.remote, getEnvironment: request => host.remote.getEnvironment(request, signal),
          getTaskDraft: request => host.remote.getTaskDraft(request, signal), saveTaskDraft: request => host.remote.saveTaskDraft(request, signal) } })
      await click(renderer, '独立运行')
      await vi.waitFor(async () => expect((await host.remote.getProjection(root, signal)).tasks.some(item => item.function_id === added.function_id)).toBe(true))
      const originalTask = (await host.remote.getProjection(root, signal)).tasks.find(item => item.function_id === added.function_id)!
      const { toGenerationRequest, parseCliGenerationRequest } = await import('../../src/cli/contract.ts')
      const accepted = await host.runtime.acceptGenerations({ workspaceId: root.workspaceId, sessionId: originalTask.session_id!, turn: 1, callId: 'custom-run' },
        [{ requestId: crypto.randomUUID(), request: toGenerationRequest(parseCliGenerationRequest(originalTask.input.generation_input)) }], signal, originalTask.task_id)
      for (let phase = 0; phase < 4; phase++) await host.runtime.advance()
      host.official.agents.get(originalTask.session_id!)!.status = 'idle'
      await click(renderer, '配置中心')
      await click(renderer, '编辑独立运行')
      await change(renderer, '功能名称', '独立资源')
      await change(renderer, '任务类型', 'resources')
      expect(nodeText(renderer.root.findByProps({ id: 'function-location' }))).toBe('资源')
      const defaultResources = readField(renderer.root, '执行要求')
      expect(defaultResources).toBe(WORKBENCH_FUNCTIONS.find(item => item.kind === 'resources')!.default_request_template)
      await change(renderer, '执行要求', '自定义执行要求 {{task_id}}')
      await change(renderer, '任务类型', 'parameters')
      expect(readField(renderer.root, '执行要求')).toBe('自定义执行要求 {{task_id}}')
      await change(renderer, '任务类型', 'resources')
      await click(renderer, '恢复默认要求')
      expect(readField(renderer.root, '执行要求')).toBe(defaultResources)
      await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      await click(renderer, '返回工作台')
      expect(renderer.root.findAllByType('button').filter(button => nodeText(button) === '独立运行')).toHaveLength(0)
      await click(renderer, '编辑参数')
      await click(renderer, '独立资源')
      await change(renderer, '任务要求', '历史产物要求')
      await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      const changedTask = (await host.remote.getProjection(root, signal)).tasks.find(item => item.function_id === added.function_id && item.kind === 'resources')!
      await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: changedTask.task_id, artifact: { type: 'resources', refs: [{ kind: 'lora', id: '3' }], reason: '保留的历史产物' } },
        { workspaceId: root.workspaceId, sessionId: changedTask.session_id!, turn: 1, callId: 'custom-artifact' })
      host.official.agents.get(changedTask.session_id!)!.status = 'idle'
      await click(renderer, '配置中心')
      await click(renderer, '移除独立资源')
      expect(nodeText(renderer.root.findByProps({ role: 'dialog' }))).toContain('已创建的任务和运行记录继续保留')
      expect((await host.remote.getProjection(root, signal)).functions.some(item => item.function_id === added.function_id)).toBe(true)
      await click(renderer, '取消')
      expect(renderer.root.findByProps({ 'data-function': added.function_id })).toBeDefined()
      await click(renderer, '移除独立资源')
      await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      await vi.waitFor(() => expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0))
      expect((await host.remote.getProjection(root, signal)).functions.some(item => item.function_id === added.function_id)).toBe(false)
      await click(renderer, '返回工作台')
      expect(renderer.root.findAllByType('button').filter(button => nodeText(button) === '独立资源')).toHaveLength(0)
      await click(renderer, '任务')
      const cards = renderer.root.findAllByProps({ className: 'agent-task-card' })
      expect(nodeText(cards.find(card => card.props['data-task'] === originalTask.task_id)!)).toContain('独立运行')
      expect(nodeText(cards.find(card => card.props['data-task'] === changedTask.task_id)!)).toContain('保留的历史产物')
      const after = await host.remote.getProjection(root, signal)
      expect(after.tasks.find(item => item.task_id === originalTask.task_id)!.binding_snapshot).toEqual(originalTask.binding_snapshot)
      expect(after.tasks.find(item => item.task_id === changedTask.task_id)!.binding_snapshot).toEqual(changedTask.binding_snapshot)
      expect(after.runs.find(item => item.run_id === accepted.items[0]!.runId)!.media).toHaveLength(1)
    } finally { await host.dispose() }
  })

  it('creates a configured custom function only after saving the shared editor and invokes its actual entry', async () => {
    const { host, root, options } = await setup(true)
    try {
      const initialEnvironment = await host.remote.getEnvironment({ workspaceId: root.workspaceId }, signal)
      host.official.listPresets.mockResolvedValue([{ id: 'preset-a', name: 'First preset' }, { id: initialEnvironment.defaultPresetId, name: '默认工作台预设' }])
      const environment = await host.remote.getEnvironment({ workspaceId: root.workspaceId }, signal)
      const before = await host.remote.getProjection(root, signal)
      const { renderer } = await mountReady(before, { ...options, presets: environment.presets,
        remote: { ...options.remote, getEnvironment: request => host.remote.getEnvironment(request, signal),
          getTaskDraft: request => host.remote.getTaskDraft(request, signal), saveTaskDraft: request => host.remote.saveTaskDraft(request, signal) } })
      await click(renderer, '配置中心')
      await click(renderer, '添加功能')
      expect(nodeText(renderer.root.findByProps({ role: 'dialog' }))).toContain('添加功能')
      expect(readField(renderer.root, '功能名称')).toBe('')
      expect(readField(renderer.root, '任务类型')).toBe('prompt')
      await vi.waitFor(() => expect(readField(renderer.root, 'Agent 预设')).toBe(environment.defaultPresetId))
      expect(readField(renderer.root, 'Agent 提供商')).toBe(environment.models.default.provider)
      expect(readField(renderer.root, 'Agent 模型')).toBe(environment.models.default.model)
      expect(options.onAction.mock.calls.filter(([request]) => request.type === 'function-add')).toEqual([])
      await click(renderer, '取消')
      expect((await host.remote.getProjection(root, signal)).functions).toHaveLength(before.functions.length)
      await click(renderer, '添加功能')
      const escape = new Event('keydown')
      Object.defineProperty(escape, 'key', { value: 'Escape' })
      await act(() => { document.dispatchEvent(escape) })
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
      await click(renderer, '添加功能')
      await change(renderer, '功能名称', '额外资源')
      await change(renderer, '任务类型', 'resources')
      await change(renderer, '指定 Skill', 'prompt-builder')
      await change(renderer, '执行要求', '执行独立改写 {{task_id}}')
      await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      await vi.waitFor(() => expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0))
      const added = (await host.remote.getProjection(root, signal)).functions.find(item => item.name === '额外资源')!
      expect(added).toMatchObject({ builtin: false, kind: 'resources', preset_id: environment.defaultPresetId,
        agent_model: environment.models.default, requested_skill: 'prompt-builder', request_template: '执行独立改写 {{task_id}}' })
      expect(options.onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'function-add', value: {
        name: '额外资源', kind: 'resources', preset_id: environment.defaultPresetId, agent_model: environment.models.default,
        requested_skill: 'prompt-builder', request_template: '执行独立改写 {{task_id}}',
      } }))
      await click(renderer, '返回工作台')
      await click(renderer, '编辑参数')
      await click(renderer, '额外资源')
      await change(renderer, '任务要求', '保留窗框')
      await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      const task = (await host.remote.getProjection(root, signal)).tasks.find(item => item.function_id === added.function_id)!
      expect(task).toMatchObject({ kind: 'resources', binding_snapshot: { name: '额外资源', preset_id: environment.defaultPresetId, requested_skill: 'prompt-builder' } })
    } finally { await host.dispose() }
  })







  it('adds a searched source experience to the current preparation and preserves its library query through Remote', async () => {
    const { host, root, runId, createRun, options } = await setup(true)
    try {
      const otherRunId = await createRun()
      for (const [id, title] of [[runId, '第一次窗框经验'], [otherRunId, '第二次窗框经验']] as const) {
        const baseline = (await host.remote.getProjection(root, signal)).runs.find(item => item.run_id === id)!.review_draft!
        await host.remote.mutate({ ...root, runId: id, type: 'evaluate', value: { expected: baseline,
          draft: { ...baseline, title, conditions: '玻璃建筑', note: '分别描述材质' }, saveExperience: true } }, signal)
      }
      const initial = await host.remote.getProjection(root, signal), source = initial.experiences.at(-1)!
      const savedPrompt = initial.branches.find(item => item.branch_id === root.branchId)!.draft.prompt_input
      const { renderer } = await mountReady(initial, options)
      await click(renderer, '经验')
      await change(renderer, '搜索经验与收藏', source.title)
      const sourceCard = renderer.root.findByProps({ 'data-experience': source.experience_id })
      await act(async () => sourceCard.findAllByType('button').find(button => nodeText(button) === '添加引用')!.props.onClick())
      const prepared = (await host.remote.getProjection(root, signal)).branches.find(item => item.branch_id === root.branchId)!
      expect(prepared.editing_draft!.reference_experiences).toEqual([expect.objectContaining({ experience_id: source.experience_id, provenance: source.provenance })])
      expect(prepared.editing_draft!.prompt_input).toEqual(savedPrompt)
      expect(readField(renderer.root, '搜索经验与收藏')).toBe(source.title)
      expect(renderer.root.findAllByProps({ className: 'experience-card' }).filter(card => !card.props.hidden).map(card => card.props['data-experience'])).toEqual([source.experience_id])
    } finally { await host.dispose() }
  })



  it('opens same-Work cross-Branch evidence at its fixed Run input and original Task through Remote', async () => {
    const { host, root, runId, createRun, options } = await setup(true)
    try {
      const child = await host.remote.mutate({ ...root, type: 'create-branch', value: { name: '另一证据分支', original_request: '独立证据要求' } }, signal)
      await setHostField(host, { ...child, field: 'positive_prompt', value: '当次固定的证据输入' }, signal)
      const childRunId = await createRun(true, child)
      await setHostField(host, { ...child, field: 'positive_prompt', value: '分支当前已修改的输入' }, signal)
      const baseline = (await host.remote.getProjection(root, signal)).runs.find(item => item.run_id === runId)!.review_draft!
      await host.remote.mutate({ ...root, runId, type: 'evaluate', value: { expected: baseline,
        draft: { ...baseline, title: '跨分支经验', conditions: '玻璃建筑', note: '比较两次结果', evidence_run_ids: [runId, childRunId] }, saveExperience: true } }, signal)
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), options)
      await click(renderer, '经验')
      expect(nodeText(renderer.root.findByProps({ className: 'experience-provenance' }))).toContain('支持证据')
      expect(renderer.root.findByProps({ className: 'experience-provenance' }).findAllByType('button').map(button => button.props['aria-label'])).toEqual(expect.arrayContaining([runId, childRunId]))
      for (const [id, name, prompt] of [[childRunId, '另一证据分支', '当次固定的证据输入'], [runId, '主分支', '']] as const) {
        await click(renderer, id)
        await vi.waitFor(() => expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed']).toBe(true))
        expect(readField(renderer.root, '分支名称')).toBe(name)
        await vi.waitFor(() => expect(readField(renderer.root, '正向提示词')).toBe(prompt || '未填写'))
        expect(nodeText(renderer.root.findByProps({ className: 'stage-caption' }))).toContain(id.slice(0, 12))
        await click(renderer, '经验')
      }
      await click(renderer, childRunId)
      await vi.waitFor(() => expect(readField(renderer.root, '正向提示词')).toBe('当次固定的证据输入'))
      await click(renderer, '任务')
      const taskId = (await host.remote.getProjection(child, signal)).runs.find(item => item.run_id === childRunId)!.workbench_task_id
      const taskCard = renderer.root.findAllByProps({ className: 'agent-task-card' }).find(card => card.findAllByProps({ title: taskId }).length > 0)!
      expect(nodeText(taskCard)).toContain('独立证据要求')
      expect(nodeText(taskCard)).toContain(childRunId.slice(0, 12))
    } finally { await host.dispose() }
  })





  it('searches both favorite groups by displayed names after independent Run model details arrive', async () => {
    const { host, root, runId, options } = await setup(true)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    try {
      const baseline = (await host.remote.getProjection(root, signal)).runs[0]!.review_draft!
      await host.remote.mutate({ ...root, runId, type: 'evaluate', value: { expected: baseline,
        draft: { ...baseline, title: '窗框经验', conditions: '玻璃建筑', note: '分别描述材质' }, saveExperience: true } }, signal)
      const experience = (await host.remote.getProjection(root, signal)).experiences[0]!
      for (const [targetType, id] of [['run', runId], ['experience', experience.experience_id]] as const)
        await host.remote.mutate({ ...root, type: 'favorite', id, value: { targetType, favorite: true } }, signal)
      const catalog: CatalogApi = { ...makeCatalog(), details: vi.fn(async request => {
        await gate
        return { ...request, item: { context: { kind: 'model', id: request.id, file_name: 'paint.safetensors' },
          baseModelId: '2', modelId: null, label: 'paint.safetensors', subtitle: '', coverUrl: null, sampleImageUrls: [] }, fields: [] }
      }) }
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), { ...options, catalog,
        baseModels: [{ id: '1', label: 'SDXL' }, { id: '2', label: 'ANIMA' }] })
      await click(renderer, '收藏')
      const cards = () => renderer.root.findAllByProps({ className: 'experience-card' })
      expect(cards()).toHaveLength(2)
      expect(nodeText(renderer.root)).toContain('收藏的运行')
      expect(nodeText(cards()[1]!)).toContain('paint.safetensors')
      await change(renderer, '搜索经验与收藏', ' anima ')
      expect(cards()[0]!.props.hidden).toBe(true)
      expect(cards()[1]!.props.hidden).toBe(true)
      await act(async () => { release(); await gate })
      await vi.waitFor(() => expect(nodeText(cards()[1]!)).toContain('ANIMA'))
      expect(cards()[1]!.props.hidden).toBe(false)
      await change(renderer, '搜索经验与收藏', ' sDxL ')
      expect(cards()[0]!.props.hidden).toBe(false)
      expect(cards()[1]!.props.hidden).toBe(true)
      await change(renderer, '搜索经验与收藏', '运行评价')
      expect(cards()[0]!.props.hidden).toBe(true)
      expect(cards()[1]!.props.hidden).toBe(false)
      await click(renderer, '查看运行')
      expect(nodeText(renderer.root.findByProps({ className: 'stage-caption' }))).toContain(runId.slice(0, 12))
      await vi.waitFor(() => expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props['aria-pressed']).toBe(true))
      expect(catalog.details).toHaveBeenCalledWith({ kind: 'model', id: '2' }, expect.any(AbortSignal))
    } finally { release(); await host.dispose() }
  })

  it('saves and updates one experience and searches its visible model while favorites preserve the query through Remote', async () => {
    const { host, root, runId, createRun, options } = await setup(true)
    try {
      const unsavedRunId = await createRun()
      const baseline = (await host.remote.getProjection(root, signal)).runs.find(item => item.run_id === unsavedRunId)!.review_draft!
      await host.remote.mutate({ ...root, runId: unsavedRunId, type: 'update-review-draft',
        value: { expected: baseline, draft: { ...baseline, title: '尚未保存的经验', conditions: '候选条件', note: '候选结论' } } }, signal)
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), options)
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '记录评价与经验')
      await change(renderer, '经验标题', '窗框经验')
      await change(renderer, '适用条件', '玻璃建筑')
      await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      expect(nodeText(renderer.root.findByProps({ id: 'evaluation-error' }))).toContain('经验标题、适用条件和经验结论')
      await change(renderer, '经验结论', '分别描述窗框与玻璃')
      await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      await vi.waitFor(() => expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0))
      const experienceId = (await host.remote.getProjection(root, signal)).experiences[0]!.experience_id
      await click(renderer, '记录评价与经验')
      await change(renderer, '经验结论', '窗框与玻璃分别描述，保持连续边缘')
      await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      await vi.waitFor(() => expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0))
      await click(renderer, '经验')
      const cards = () => renderer.root.findAllByProps({ className: 'experience-card' })
      expect(cards()).toHaveLength(1)
      expect(nodeText(cards()[0]!)).not.toContain('尚未保存的经验')
      expect(nodeText(cards()[0]!)).toContain('窗框与玻璃分别描述，保持连续边缘')
      for (const query of ['窗框经验', '玻璃建筑', '连续边缘', ' sDxL ']) {
        await change(renderer, '搜索经验与收藏', query)
        expect(cards()[0]!.props.hidden).toBe(false)
      }
      await click(renderer, '添加收藏')
      expect(renderer.root.findByProps({ 'aria-label': '经验' }).props.className).toBe('active')
      expect(readField(renderer.root, '搜索经验与收藏')).toBe(' sDxL ')
      await vi.waitFor(() => expect(nodeText(cards()[0]!)).toContain('移除收藏'))
      await change(renderer, '搜索经验与收藏', '无匹配的关键词')
      expect(cards()).toHaveLength(1)
      expect(cards()[0]!.props.hidden).toBe(true)
      expect(nodeText(renderer.root)).not.toContain('尚未保存经验')
      await click(renderer, '收藏')
      await change(renderer, '搜索经验与收藏', '窗框经验')
      await click(renderer, '移除收藏')
      expect(renderer.root.findByProps({ 'aria-label': '收藏' }).props.className).toBe('active')
      expect(readField(renderer.root, '搜索经验与收藏')).toBe('窗框经验')
      const projection = await host.remote.getProjection(root, signal)
      expect(projection.experiences).toHaveLength(1)
      expect(projection.experiences[0]!.experience_id).toBe(experienceId)
      expect(projection.favorites).toEqual([])
    } finally { await host.dispose() }
  })

  it('preserves the selected successful Run while adding and removing its favorite through Remote', async () => {
    const { host, root, runId, createRun, options } = await setup(true)
    try {
      await createRun()
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), options)
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '收藏运行')
      await vi.waitFor(async () => {
        expect((await host.remote.getProjection(root, signal)).favorites).toEqual([{ target_type: 'run', target_id: runId }])
      })
      expect(nodeText(renderer.root.findByProps({ className: 'stage-caption' }))).toContain(runId.slice(0, 12))
      expect(renderer.root.findAllByType('button').some(button => nodeText(button) === '移除收藏')).toBe(true)
      await click(renderer, '移除收藏')
      await vi.waitFor(async () => { expect((await host.remote.getProjection(root, signal)).favorites).toEqual([]) })
      expect(nodeText(renderer.root.findByProps({ className: 'stage-caption' }))).toContain(runId.slice(0, 12))
      expect(renderer.root.findAllByType('button').some(button => nodeText(button) === '收藏运行')).toBe(true)
      expect((await host.remote.getProjection(root, signal)).runs.find(item => item.run_id === runId)?.media).toHaveLength(1)
    } finally { await host.dispose() }
  })

  it('keeps diagnosis and comparison on the result page and opens the fixed review from the completed Task', async () => {
    for (const kind of ['diagnose', 'compare'] as const) {
      const { host, root, runId, createRun, options } = await setup(kind === 'compare')
      try {
        const otherRun = await createRun()
        const { renderer } = await mountReady(await host.remote.getProjection(root, signal), options)
        await click(renderer, '查看运行 ' + runId)
        if (kind === 'compare') {
          await click(renderer, '比较运行')
          await click(renderer, '比较运行 ' + otherRun)
        }
        await click(renderer, kind === 'compare' ? '比较结果' : '诊断失败')
        await act(async () => { await options.onAction.mock.results.at(-1)!.value })
        expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
        expect(renderer.root.findAllByProps({ className: 'agent-task-card' })).toHaveLength(0)
        const accepted = await host.remote.getProjection(root, signal), task = accepted.tasks.find(item => item.kind === kind)!
        expect(task, kind + ': ' + renderer.root.findAllByProps({ className: 'toast' }).map(nodeText).join(' / ')).toBeDefined()
        expect(task.input.evaluation_input!.run_id).toBe(runId)
        expect(task.input.reference_run_ids).toEqual(kind === 'compare' ? [runId, otherRun] : [runId])
        await click(renderer, '记录评价与经验')
        const count = accepted.runs.length
        await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id,
          artifact: { type: 'review', observation: kind === 'compare' ? '两次窗框差异' : '实例连接失败', conclusion: '固定运行的处理结论', run_ids: task.input.reference_run_ids } },
          { workspaceId: root.workspaceId, sessionId: task.session_id!, turn: 1, callId: kind })
        await vi.waitFor(() => expect(readField(renderer.root, '评价结论')).toBe('固定运行的处理结论'), { timeout: 3000 })
        await click(renderer, '取消')
        if (kind === 'compare') await click(renderer, '结束比较')
        await click(renderer, '查看运行 ' + otherRun)
        await click(renderer, '任务')
        const card = renderer.root.findAllByProps({ className: 'agent-task-card' }).find(item => item.props['data-task'] === task.task_id)!
        if (kind === 'diagnose') expect(card.findByProps({ className: 'task-output' }).findAllByType('h3').map(nodeText)).toContain('运行错误')
        expect(JSON.parse(nodeText(card.findByProps({ 'aria-label': '任务输入 JSON' }))).reference_run_ids).toEqual(task.input.reference_run_ids)
        await click(renderer, '查看评价与经验')
        expect(nodeText(renderer.root.findByProps({ className: 'evaluation-form-body' }))).toContain(runId)
        expect(readField(renderer.root, '评价结论')).toBe('固定运行的处理结论')
        expect((await host.remote.getProjection(root, signal)).runs).toHaveLength(count)
      } finally { await host.dispose() }
    }
  })

  it.each([new Error('Review request failed'), 'Review request failed'])('keeps the result visible when a diagnosis request fails: %s', async failure => {
    const { host, root, runId, options } = await setup()
    try {
      const before = await host.remote.getProjection(root, signal)
      const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
        if (request.type === 'agent-action') throw failure
        return options.onAction(request)
      })
      const { renderer } = await mountReady(before, { ...options, onAction })
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '诊断失败')
      await vi.waitFor(() => expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('Review request failed'))
      expect(renderer.root.findByProps({ className: 'stage-caption' }).findByProps({ title: runId })).toBeDefined()
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
      expect(renderer.root.findAllByProps({ className: 'agent-task-card' })).toHaveLength(0)
      expect((await host.remote.getProjection(root, signal)).tasks).toHaveLength(before.tasks.length)
    } finally { await host.dispose() }
  })

  it('keeps the review entry disabled for an unfinished Run', async () => {
    const { host, root, createRun, options } = await setup()
    try {
      const unfinished = await createRun(false)
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), options)
      await click(renderer, '查看运行 ' + unfinished)
      const button = renderer.root.findAllByType('button').find(item => nodeText(item) === '记录评价与经验')!
      expect(button.props.disabled).toBe(true)
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    } finally { await host.dispose() }
  })

  it('isolates delayed draft writes and a delayed save receipt between two Run dialogs', async () => {
    const { host, root, runId, createRun, options } = await setup()
    try {
      const otherRun = await createRun()
      let releaseDraft!: () => void
      const draftGate = new Promise<void>(resolve => { releaseDraft = resolve })
      let releaseSave!: () => void
      const saveGate = new Promise<void>(resolve => { releaseSave = resolve })
      const mutate = options.onAction
      const delayed = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
        if (request.runId === runId && request.type === 'update-review-draft') await draftGate
        if (request.runId === runId && request.type === 'evaluate') await saveGate
        return mutate(request)
      })
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), { ...options, onAction: delayed })
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '记录评价与经验')
      await change(renderer, '观察', 'A 的迟到草稿')
      await change(renderer, '评价结论', 'A 的第二字段')
      await click(renderer, '取消')
      await click(renderer, '查看运行 ' + otherRun)
      await click(renderer, '记录评价与经验')
      await change(renderer, '观察', 'B 的独立草稿')
      await act(async () => { releaseDraft() })
      await vi.waitFor(async () => expect((await host.remote.getProjection(root, signal)).runs.find(item => item.run_id === runId)!.review_draft)
        .toMatchObject({ observation: 'A 的迟到草稿', conclusion: 'A 的第二字段' }))
      expect(readField(renderer.root, '观察')).toBe('B 的独立草稿')
      await click(renderer, '取消')
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '记录评价与经验')
      await act(async () => { renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }) })
      await click(renderer, '取消')
      await click(renderer, '查看运行 ' + otherRun)
      await click(renderer, '记录评价与经验')
      await act(async () => { releaseSave() })
      await vi.waitFor(async () => expect((await host.remote.getProjection(root, signal)).runs.find(item => item.run_id === runId)!.review?.observation).toBe('A 的迟到草稿'))
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1)
      expect(readField(renderer.root, '观察')).toBe('B 的独立草稿')
    } finally { await host.dispose() }
  })

  it('keeps manual edits and fills the original Run after separately adopting the review generation candidate', async () => {
    const { host, root, runId, options } = await setup()
    try {
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), options)
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '记录评价与经验')
      await click(renderer, '分析结果')
      const task = (await host.remote.getProjection(root, signal)).tasks.find(item => item.kind === 'review')!
      await change(renderer, '观察', '分析期间的手工观察')
      const published = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id,
        artifact: { type: 'review', observation: '候选观察', conclusion: '候选结论', run_ids: [runId],
          candidate: { generation_input: { ...task.input.generation_input, parameters: { ...task.input.generation_input.parameters, positive: '独立采用的窗框输入' } }, image_refs: task.input.image_refs, workflow_image_bindings: task.input.workflow_image_bindings } } },
        { workspaceId: root.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'manual-conflict' })
      expect(published.disposition).toBe('candidate')
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 850)) })
      expect(readField(renderer.root, '观察')).toBe('分析期间的手工观察')
      await click(renderer, '取消')
      await click(renderer, '任务')
      await click(renderer, '采用建议输入')
      const generationApplied = await host.remote.getProjection(root, signal)
      expect(generationApplied.branches.find(item => item.branch_id === root.branchId)!.editing_draft!.prompt_input.positive_prompt).toBe('独立采用的窗框输入')
      expect(generationApplied.runs.find(item => item.run_id === runId)!.review_draft!.observation).toBe('分析期间的手工观察')
      expect(renderer.root.findAllByType('button').map(nodeText)).toContain('填入评价')
      await click(renderer, '填入评价')
      await click(renderer, '查看评价与经验')
      expect((await host.remote.getProjection(root, signal)).branches.find(item => item.branch_id === root.branchId)!.editing_draft!.prompt_input.positive_prompt).toBe('独立采用的窗框输入')
      expect(readField(renderer.root, '观察')).toBe('候选观察')
      expect((await host.remote.getProjection(root, signal)).runs.find(item => item.run_id === runId)!.review).toBeNull()
    } finally { await host.dispose() }
  })

  it('preserves all queued fields after a draft write fails and saves the complete edit on retry', async () => {
    const { host, root, runId, options } = await setup()
    try {
      let rejectWrite!: () => void
      const gate = new Promise<void>((_resolve, reject) => { rejectWrite = () => reject(new Error('草稿保存失败：连接已中断，请重试。')) })
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), { ...options,
        onAction: async request => {
          if (request.type === 'update-review-draft') await gate
          return options.onAction(request)
        } })
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '记录评价与经验')
      await change(renderer, '观察', '连接失败前的观察')
      await change(renderer, '评价结论', '连接失败期间排队的结论')
      await act(async () => { rejectWrite() })
      await vi.waitFor(() => expect(nodeText(renderer.root.findByProps({ id: 'evaluation-error' }))).toContain('草稿保存失败'))
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 850)) })
      expect(readField(renderer.root, '观察')).toBe('连接失败前的观察')
      expect(readField(renderer.root, '评价结论')).toBe('连接失败期间排队的结论')
      expect((await host.remote.getProjection(root, signal)).runs.find(item => item.run_id === runId)!.review_draft!.observation).toBe('')
      await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      await vi.waitFor(() => expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0))
      expect((await host.remote.getProjection(root, signal)).runs.find(item => item.run_id === runId)!.review).toMatchObject({
        observation: '连接失败前的观察', conclusion: '连接失败期间排队的结论',
      })
    } finally { await host.dispose() }
  })

  it('merges an observed server draft after conflict while preserving local text and an explicitly cleared field', async () => {
    const { host, root, runId, options } = await setup()
    try {
      const initial = await host.remote.getProjection(root, signal)
      let deliverLatest = false
      const connection = createConnectionState()
      const { renderer } = await mountReady(initial, { ...options, connectionState: connection.source, remote: { ...options.remote,
        subscribe: async function* (request, streamSignal) { for await (const update of options.remote.subscribe(request, streamSignal)) yield { ...update, projection: deliverLatest ? update.projection : structuredClone(initial) } },
        getProjection: request => deliverLatest ? host.remote.getProjection(request, signal) : Promise.resolve(structuredClone(initial)),
      } })
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '记录评价与经验')
      const baseline = initial.runs.find(item => item.run_id === runId)!.review_draft!
      await host.remote.mutate({ ...root, runId, type: 'update-review-draft',
        value: { expected: baseline, draft: { ...baseline, observation: '服务器最新观察', verdict: 'needs-work', conditions: '服务器补充的适用条件' } } }, signal)
      await change(renderer, '观察', '随后主动清空的临时输入')
      await change(renderer, '观察', '')
      await change(renderer, '评价结论', '冲突后需要保留的人工结论')
      await vi.waitFor(() => expect(nodeText(renderer.root.findByProps({ id: 'evaluation-error' }))).toContain('评价草稿已改变'))
      const writesBeforeRefresh = options.onAction.mock.calls.length
      deliverLatest = true
      await act(() => { connection.set('disconnected'); connection.set('connected') })
      await vi.waitFor(() => expect(readField(renderer.root, '适用条件')).toBe('服务器补充的适用条件'), { timeout: 3000 })
      expect(readField(renderer.root, '目标达成情况')).toBe('needs-work')
      expect(readField(renderer.root, '观察')).toBe('')
      expect(readField(renderer.root, '评价结论')).toBe('冲突后需要保留的人工结论')
      expect(options.onAction.mock.calls).toHaveLength(writesBeforeRefresh)
      expect((await host.remote.getProjection(root, signal)).runs.find(item => item.run_id === runId)!.review_draft!.observation).toBe('服务器最新观察')
      await click(renderer, '取消')
      await click(renderer, '记录评价与经验')
      expect(readField(renderer.root, '观察')).toBe('')
      expect(readField(renderer.root, '评价结论')).toBe('冲突后需要保留的人工结论')
      await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      await vi.waitFor(() => expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0))
      const saved = (await host.remote.getProjection(root, signal)).runs.find(item => item.run_id === runId)!
      expect(saved.review).toMatchObject({ observation: '', conclusion: '冲突后需要保留的人工结论', verdict: 'needs-work' })
      expect(saved.review_draft!.conditions).toBe('服务器补充的适用条件')
    } finally { await host.dispose() }
  })

  it('validates the visible review and optional experience fields and preserves a failed save', async () => {
    const { host, root, runId, options } = await setup()
    try {
      let fail = false
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), { ...options,
        onAction: async request => {
          if (fail && request.type === 'evaluate') throw new Error('评价保存失败：连接已中断，请重试。')
          return options.onAction(request)
        } })
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '记录评价与经验')
      const submit = async () => act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
      await submit()
      expect(nodeText(renderer.root.findByProps({ id: 'evaluation-error' }))).toBe('请填写观察或评价结论。')
      await change(renderer, '经验标题', '只有标题')
      await submit()
      expect(nodeText(renderer.root.findByProps({ id: 'evaluation-error' }))).toBe('请填写经验标题、适用条件和经验结论。')
      await change(renderer, '经验标题', '')
      await change(renderer, '观察', '失败后保留的文本')
      fail = true
      await submit()
      await vi.waitFor(() => expect(nodeText(renderer.root.findByProps({ id: 'evaluation-error' }))).toContain('连接已中断'))
      expect(readField(renderer.root, '观察')).toBe('失败后保留的文本')
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1)
      fail = false
      await submit()
      await vi.waitFor(() => expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0))
      await click(renderer, '记录评价与经验')
      expect(nodeText(renderer.root.findByProps({ id: 'evaluation-error' }))).toBe('')
    } finally { await host.dispose() }
  })

  it('adopts the displayed review generation candidate into its original Branch independently of review filling', async () => {
    const { host, root, runId, options } = await setup()
    try {
      const other = await host.remote.mutate({ ...root, type: 'create-branch', value: { name: '其他分支', original_request: '独立画面' } }, signal)
      await setHostField(host, { ...other, field: 'positive_prompt', value: '其他分支的输入' }, signal)
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), options)
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '记录评价与经验')
      await click(renderer, '分析结果')
      const before = await host.remote.getProjection(root, signal), task = before.tasks.find(item => item.kind === 'review')!
      const fixedInput = structuredClone(before.runs.find(item => item.run_id === runId)!.generation_input)
      const candidate = { generation_input: { ...task.input.generation_input, parameters: { ...task.input.generation_input.parameters, positive: '候选窗框输入' } }, image_refs: task.input.image_refs, workflow_image_bindings: task.input.workflow_image_bindings }
      const published = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id,
        artifact: { type: 'review', observation: '候选观察', conclusion: '候选结论', run_ids: [runId], candidate } },
        { workspaceId: root.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'review-candidate' })
      await vi.waitFor(() => expect(readField(renderer.root, '观察')).toBe('候选观察'), { timeout: 3000 })
      expect((await host.remote.getProjection(root, signal)).branches[0]!.draft.prompt_input.positive_prompt).toBe('')
      await click(renderer, '取消')
      await click(renderer, '切换分支 其他分支')
      await click(renderer, '任务')
      expect(renderer.root.findAllByType('summary').map(nodeText)).toContain('查看建议输入')
      const stale = renderer.root.findAllByType('button').find(item => nodeText(item) === '采用建议输入')!.props.onClick
      await setHostField(host, { ...root, field: 'positive_prompt', value: '其他窗口修改了来源分支' }, signal)
      await act(async () => { stale(); await options.onAction.mock.results.at(-1)!.value.catch(() => {}) })
      expect((await host.remote.getProjection(root, signal)).branches.find(item => item.branch_id === root.branchId)!.draft.prompt_input.positive_prompt).toBe('其他窗口修改了来源分支')
      expect(renderer.root.findAllByProps({ className: 'toast' }).map(nodeText).join(' ')).toContain('目标内容已改变')
      await click(renderer, '运行结果')
      await click(renderer, '任务')
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 850)) })
      const refreshed = (await host.remote.getProjection(root, signal)).branches.find(item => item.branch_id === root.branchId)!.draft
      await click(renderer, '采用建议输入')
      expect(options.onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'task-generation-apply', id: published.artifact_id,
        branchId: root.branchId, value: refreshed }))
      const after = await host.remote.getProjection(root, signal)
      expect(after.branches.find(item => item.branch_id === root.branchId)!.editing_draft!.prompt_input.positive_prompt).toBe('候选窗框输入')
      expect(after.branches.find(item => item.branch_id === other.branchId)!.draft.prompt_input.positive_prompt).toBe('其他分支的输入')
      expect(after.runs.find(item => item.run_id === runId)!.generation_input).toEqual(fixedInput)
      expect(renderer.root.findAllByProps({ className: 'agent-task-card' }).length).toBeGreaterThan(0)
      await click(renderer, '查看评价与经验')
      expect(readField(renderer.root, '观察')).toBe('候选观察')
      expect(nodeText(renderer.root.findByProps({ className: 'evaluation-form-body' }))).toContain(runId)
    } finally { await host.dispose() }
  })

  it.each(['review', 'experience'] as const)('captures current editing in %s and fills only the Run draft', async kind => {
    const { host, root, runId, options } = await setup()
    try {
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), options)
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '记录评价与经验')
      await change(renderer, '观察', '点击时的人工观察')
      await change(renderer, '评价结论', '点击时的人工结论')
      await click(renderer, kind === 'review' ? '分析结果' : '整理经验')
      const projection = await host.remote.getProjection(root, signal), task = projection.tasks.find(item => item.kind === kind)!
      expect(task.input.evaluation_input).toMatchObject({ run_id: runId, observation: '点击时的人工观察', conclusion: '点击时的人工结论' })
      expect(task.input.reference_run_ids).toEqual([runId])
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1)
      expect(renderer.root.findAllByProps({ className: 'toast' }).map(nodeText).join(' ')).toContain('任务已提交')
      const remoteApi = renderer.root.props.remote
      await act(() => renderer.update(<ExperimentWorkbench {...options} connectionState={renderer.root.props.connectionState} remote={remoteApi}
        onWorkspaceChange={vi.fn()} onAction={request => options.onAction(request)} />))
      const artifact: ArtifactPayload = kind === 'review'
        ? { type: 'review', observation: 'Agent 观察', conclusion: 'Agent 结论', run_ids: [runId] }
        : { type: 'experience', title: '窗框经验', conditions: '玻璃建筑', note: '保留窗框连续性', run_ids: [runId], base_model_id: '1', model_id: '2' }
      const delivered = await host.ctx.harnessComfyuiWorkbench.service.publish({ taskId: task.task_id, artifact },
        { workspaceId: root.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'review-' + kind })
      await vi.waitFor(() => expect(readField(renderer.root, kind === 'review' ? '观察' : '经验标题'))
        .toBe(kind === 'review' ? 'Agent 观察' : '窗框经验'), { timeout: 3000 })
      const after = await host.remote.getProjection(root, signal)
      expect(after.runs.find(item => item.run_id === runId)!.review).toBeNull()
      expect(after.experiences).toHaveLength(0)
      if (kind === 'experience') {
        expect(readField(renderer.root, '观察')).toBe('点击时的人工观察')
        await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
        await vi.waitFor(() => expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0))
        const saved = await host.remote.getProjection(root, signal)
        expect(saved.experiences).toHaveLength(1)
        expect(saved.experiences[0]).toMatchObject({ title: '窗框经验', source_run_id: runId,
          source_artifact_id: delivered.artifact_id, evidence_run_ids: [runId] })
        await click(renderer, '记录评价与经验')
        await change(renderer, '经验结论', '人工确认的经验结论')
        await act(async () => renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }))
        await vi.waitFor(() => expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0))
        const updated = await host.remote.getProjection(root, signal)
        expect(updated.experiences).toHaveLength(1)
        expect(updated.experiences[0]!.note).toBe('人工确认的经验结论')
      }
    } finally { await host.dispose() }
  })

  it.each(['观察', '评价结论'])('saves only %s through the visible form and keeps the selected Run', async label => {
    const { host, root, runId, options } = await setup()
    try {
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), options)
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '记录评价与经验')
      await change(renderer, label, '人工确认的内容')
      await act(async () => { renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }) })
      await vi.waitFor(async () => {
        expect((await host.remote.getProjection(root, signal)).runs.find(item => item.run_id === runId)!.review).toMatchObject({
          [label === '观察' ? 'observation' : 'conclusion']: '人工确认的内容',
        })
      })
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
      expect(nodeText(renderer.root.findByProps({ className: 'stage-caption' }))).toContain(runId.slice(0, 12))
      expect(nodeText(renderer.root.findByProps({ className: 'saved-review' }))).toContain('人工确认的内容')
      await click(renderer, '查看运行记录')
      const historyRow = renderer.root.findByProps({ 'aria-label': '运行记录' }).findAllByType('article')
        .find(item => item.findAllByProps({ title: runId }).length > 0)!
      const reviewParagraphs = historyRow.findAllByType('p').map(nodeText).filter(text => text.startsWith('评价：'))
      expect(reviewParagraphs).toEqual(label === '观察' ? [] : ['评价：人工确认的内容'])
      expect(historyRow.findAllByType('p').map(nodeText).filter(text => text.startsWith('观察：'))).toEqual([])
      await click(renderer, '查看运行')
      expect(nodeText(renderer.root.findByProps({ className: 'saved-review' }))).toContain('人工确认的内容')
      await click(renderer, '记录评价与经验')
      expect(readField(renderer.root, label)).toBe('人工确认的内容')
      expect((await host.remote.getProjection(root, signal)).experiences).toHaveLength(0)
      expect(options.onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'evaluate', runId,
        value: expect.objectContaining({ saveExperience: false }) }))
    } finally { await host.dispose() }
  })

  it('retains the complete editable Run draft after close and remount without saving a review', async () => {
    const { host, root, runId, options } = await setup()
    try {
      const { renderer } = await mountReady(await host.remote.getProjection(root, signal), options)
      await click(renderer, '查看运行 ' + runId)
      await click(renderer, '记录评价与经验')
      expect(renderer.root.findByProps({ role: 'dialog' }).props.className).toContain('evaluation-modal')
      for (const [label, value] of [['目标达成情况', 'needs-work'], ['观察', '窗框局部断开'], ['评价结论', '保留构图并修改窗框'], ['经验标题', '玻璃窗框'], ['适用条件', '玻璃建筑'], ['经验结论', '单独描述窗框连续性']])
        await change(renderer, label, value)
      await click(renderer, '取消')
      await click(renderer, '记录评价与经验')
      expect(readField(renderer.root, '观察')).toBe('窗框局部断开')
      await click(renderer, '关闭对话框')
      await click(renderer, '记录评价与经验')
      const escape = new Event('keydown')
      Object.defineProperty(escape, 'key', { value: 'Escape' })
      await act(() => { document.dispatchEvent(escape) })
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
      await act(() => renderer.unmount())
      const projection = await host.remote.getProjection(root, signal)
      expect(projection.runs.find(item => item.run_id === runId)).toMatchObject({
        review: null, review_draft: { verdict: 'needs-work', observation: '窗框局部断开', conclusion: '保留构图并修改窗框',
          title: '玻璃窗框', conditions: '玻璃建筑', note: '单独描述窗框连续性' },
      })
      const remounted = await mountReady(projection, options)
      await click(remounted.renderer, '查看运行 ' + runId)
      await click(remounted.renderer, '记录评价与经验')
      expect(readField(remounted.renderer.root, '经验结论')).toBe('单独描述窗框连续性')
    } finally { await host.dispose() }
  })
})
