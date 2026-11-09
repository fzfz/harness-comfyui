import React from 'react'
import type { MainPanelId, PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { createPortal } from 'react-dom'
vi.mock('react-dom', () => ({
  createPortal: vi.fn((children: React.ReactNode, _container: ShadowRoot) => children),
}))
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, ...props }: any) =>
    React.createElement('button', props, children),
  IconSparkleRegular: () => null,
}))
import {
  ExperimentWorkbenchHost,
  ExperimentWorkbenchEntry,
  type ExperimentHostRemote,
} from '../../src/client/workbench/experiment-host.tsx'
import { ExperimentWorkbench } from '../../src/client/workbench/experiment-workbench.tsx'
import {
  fullProjection,
  createConnectionState,
  inputDescription,
  runInputDescription,
} from './experiment-workbench-fixtures.ts'
import type { CatalogApi } from '../../src/client/workbench/catalog-browser.tsx'
import type { ExperimentWorkbenchProps } from '../../src/client/workbench/experiment-contract.ts'
const { act, create } = (await vi.importActual('react-test-renderer')) as any
const mounts: any[] = []
const boundaries: { root: ShadowRoot; attachShadow: ReturnType<typeof vi.fn> }[] = []
const createNodeMock = (element: { props: Record<string, unknown> }) => {
  if (!('data-experiment-workbench-root' in element.props)) return null
  const root = { mode: 'open' } as ShadowRoot
  const host = { shadowRoot: null, attachShadow: vi.fn(() => root) }
  boundaries.push({ root, attachShadow: host.attachShadow })
  return host
}
afterEach(async () => {
  await act(() => {
    for (const renderer of mounts.splice(0)) renderer.unmount()
  })
  vi.unstubAllGlobals()
  boundaries.length = 0
  vi.mocked(createPortal).mockClear()
})
const environment = {
  defaultPresetId: 'preset',
  workspaces: [{ id: 'workspace-a', name: '画面项目', path: '/art' }],
  presets: [{ id: 'preset', name: '工作台预设' }],
  models: {
    default: { provider: 'p', model: 'm' },
    groups: [],
    failures: [],
    routableProviders: [],
  },
  skills: [],
  instances: [{ id: '2', name: 'win3080' }],
}
const remote = (): ExperimentHostRemote => ({
  getRunInput: vi.fn(async request => {
    const data = fullProjection(), run = data.runs.find(run => run.run_id === request.runId)!, task = data.tasks.find(task => task.task_id === run.workbench_task_id)!
    return { ok: true as const, value: { run_id: run.run_id, branch_id: task.branch_id, generation_input: run.generation_input,
      context_refs: task.input.context_refs, input_description: runInputDescription(run.generation_input.parameters),
      prompt_input: { positive_prompt: String(run.generation_input.parameters.positive_1 ?? ''), negative_prompt: String(run.generation_input.parameters.negative_1 ?? '') } } }
  }),
  getTaskDraft: vi.fn(async () => ({ ok: true as const, value: null })),
  saveTaskDraft: vi.fn(async request => ({ ok: true as const, value: request.draft })),
  getInputDescription: vi.fn(async () => ({
    ok: true as const,
    value: inputDescription,
  })),
  getEnvironment: vi.fn(async () => ({
    ok: true as const,
    value: environment,
  })),
  getProjection: vi.fn(async () => ({
    ok: true as const,
    value: fullProjection(),
  })),
  mutate: vi.fn(async () => ({
    ok: true as const,
    value: { workspaceId: 'workspace-a', workId: 'work-a', branchId: 'child' },
  })),
})
const catalog = () => ({
  baseModels: vi.fn(async () => ({ items: [{ id: '1', label: 'SDXL' }] })),
  search: vi.fn(),
  details: vi.fn<CatalogApi['details']>(async request => ({
    ...request, item: { modelId: null, context: request.kind === 'lora' ? { kind: 'lora', id: request.id, file_name: 'glass.safetensors' } : { kind: 'comfyui-template', id: request.id, title: '文生图' }, baseModelId: '1', label: request.kind === 'lora' ? '玻璃 LoRA' : '文生图', subtitle: '', coverUrl: null, sampleImageUrls: [] }, fields: [],
  })),
})
const mount = async (api: ExperimentHostRemote) => {
  vi.stubGlobal('document', new EventTarget())
  vi.stubGlobal('localStorage', {
    getItem: () => 'deleted-workspace',
    setItem: vi.fn(),
  })
  let renderer: any
  await act(async () => {
    renderer = create(
      <ExperimentWorkbenchHost remote={api} catalog={catalog()} connectionState={createConnectionState().source} />,
      { createNodeMock },
    )
  })
  mounts.push(renderer)
  return renderer
}
describe('official experiment workbench adapter', () => {
  it('passes the official connection source through the Host to visible workbench tips', async () => {
    vi.stubGlobal('document', new EventTarget())
    vi.stubGlobal('localStorage', { getItem: () => 'workspace-a', setItem: vi.fn() })
    const connection = createConnectionState(), api = remote()
    let renderer: any
    await act(() => {
      renderer = create(<ExperimentWorkbenchHost remote={api} catalog={catalog()} connectionState={connection.source} />, { createNodeMock })
    })
    mounts.push(renderer)
    expect(renderer.root.findByType(ExperimentWorkbench).props.connectionState).toBe(connection.source)
    expect(connection.subscriberCount).toBe(1)
    expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
    await act(() => connection.set('disconnected'))
    expect(renderer.root.findByProps({ className: 'toast' }).findByType('span').children).toEqual(['连接已断开'])
    await act(() => renderer.unmount())
    expect(connection.subscriberCount).toBe(0)
  })

  it.each([true, false])('toggles the workbench and follows the host panel selection with wide=%s', async wide => {
    let selectOtherPanel!: () => void
    const selectedPanels: (string | null)[] = []
    function HostPanel() {
      const [panel, setPanel] = React.useState<MainPanelId | null>(null)
      selectOtherPanel = () => setPanel('plugins' as MainPanelId)
      const props: React.ComponentProps<typeof ExperimentWorkbenchEntry> = {
        wide,
        usePanelInfo: <T,>(select: (info: PanelInfo) => T) => select({ activePanelId: panel }),
        selectPanel: id => { selectedPanels.push(id); setPanel(id) },
      }
      return <ExperimentWorkbenchEntry {...props} />
    }
    let renderer: any
    await act(() => { renderer = create(<HostPanel />) })
    mounts.push(renderer)
    const button = () => renderer.root.findByProps({ 'aria-label': '实验工作台' })
    expect(button().props['aria-pressed']).toBe(false)
    await act(() => button().props.onClick())
    expect(button().props['aria-pressed']).toBe(true)
    await act(() => button().props.onClick())
    expect(button().props['aria-pressed']).toBe(false)
    await act(() => button().props.onClick())
    await act(() => selectOtherPanel())
    expect(button().props['aria-pressed']).toBe(false)
    await act(() => button().props.onClick())
    expect(button().props['aria-pressed']).toBe(true)
    expect(selectedPanels).toEqual(['harness-comfyui-experiment', null, 'harness-comfyui-experiment', 'harness-comfyui-experiment'])
  })

  it('forwards task draft scope and payload and preserves Remote failures and accepted task identity', async () => {
    const api = remote(), renderer = await mount(api)
    const shell: ExperimentWorkbenchProps = renderer.root.findByType(ExperimentWorkbench).props
    const scope = { workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root', functionId: 'parameters' }
    const draft = { instructions: '保留构图', resources: { instance_id: '2', template_id: null } }
    vi.mocked(api.getTaskDraft).mockResolvedValueOnce({ ok: true, value: draft })
    await expect(shell.remote.getTaskDraft(scope)).resolves.toEqual(draft)
    expect(api.getTaskDraft).toHaveBeenCalledExactlyOnceWith(scope)
    await expect(shell.remote.saveTaskDraft({ ...scope, draft })).resolves.toEqual(draft)
    expect(api.saveTaskDraft).toHaveBeenCalledExactlyOnceWith({ ...scope, draft })
    const failure = new RemoteError('workbench/operation-failed', '草稿保存失败，请重试。', { code: 'WORKBENCH_INVALID_INPUT', issues: [] })
    vi.mocked(api.saveTaskDraft).mockResolvedValueOnce({ ok: false, error: failure })
    await expect(shell.remote.saveTaskDraft({ ...scope, draft })).rejects.toBe(failure)
    vi.mocked(api.getTaskDraft).mockResolvedValueOnce({ ok: false, error: failure })
    await expect(shell.remote.getTaskDraft(scope)).rejects.toBe(failure)
    vi.mocked(api.mutate).mockResolvedValueOnce({ ok: true, value: { workspaceId: 'workspace-a', taskId: 'accepted-task' } })
    await expect(shell.onAction({ type: 'agent-action', workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root', id: 'parameters', value: { draft } })).resolves.toEqual({ workspaceId: 'workspace-a', taskId: 'accepted-task' })
  })

  it('preserves the official parameter failure and its complete field path', async () => {
    const api = remote(), renderer = await mount(api)
    const shell: ExperimentWorkbenchProps = renderer.root.findByType(ExperimentWorkbench).props
    const failure = new RemoteError('workbench/operation-failed', '采样步数超过模板允许的范围。', {
      code: 'WORKBENCH_INVALID_INPUT',
      issues: [{ path: 'generation_input.parameters.steps_42', message: '最大值为 100。' }],
    })
    vi.mocked(api.mutate).mockResolvedValueOnce({ ok: false, error: failure })
    await expect(shell.onAction({ type: 'update-draft', workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root',
      field: 'parameter', id: 'steps_42', value: 101 })).rejects.toBe(failure)
  })

  it('forwards generation model selection through the ordinary resource mutation', async () => {
    const api = remote(), renderer = await mount(api)
    const request = { type: 'resource-select' as const, workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root', id: '21', value: { kind: 'model', id: '21' } }
    const shell: ExperimentWorkbenchProps = renderer.root.findByType(ExperimentWorkbench).props
    await expect(shell.onAction(request)).resolves.toEqual({ workspaceId: 'workspace-a', workId: 'work-a', branchId: 'child' })
    expect(api.mutate).toHaveBeenCalledExactlyOnceWith(request)
    const failure = new RemoteError('workbench/operation-failed', '模型读取失败，请重新选择生成模型。', { code: 'WORKBENCH_INVALID_INPUT', issues: [] })
    vi.mocked(api.mutate).mockResolvedValueOnce({ ok: false, error: failure })
    await expect(shell.onAction(request)).rejects.toBe(failure)
  })

  it('keeps one open style boundary and portal target across updates, then unmounts its content', async () => {
    const api = remote(), renderer = await mount(api)
    expect(boundaries).toHaveLength(1)
    const boundary = boundaries[0]!
    expect(boundary.attachShadow).toHaveBeenCalledExactlyOnceWith({ mode: 'open' })
    expect(renderer.root.findAllByProps({ 'data-experiment-workbench-root': '' })).toHaveLength(1)
    const style = renderer.root.findByType('style')
    const scrollbarSelectors = String(style.props.children).match(/[^{}]+(?=\{[^{}]*\})/g)!
      .filter(selector => selector.includes('::-webkit-scrollbar'))
    expect(scrollbarSelectors.length).toBeGreaterThan(0)
    expect(scrollbarSelectors.every(selector => selector.split(',').every(part => part.includes('.run-cards')))).toBe(true)
    await act(async () => {
      await renderer.root.findByType(ExperimentWorkbench).props.onAction({
        type: 'new-workspace', workspaceId: 'workspace-a', value: { name: '画面项目', path: '/art' },
      })
    })
    expect(boundary.attachShadow).toHaveBeenCalledOnce()
    expect(renderer.root.findAllByType('style')).toHaveLength(1)
    expect(vi.mocked(createPortal).mock.calls.length).toBeGreaterThan(1)
    expect(vi.mocked(createPortal).mock.calls.every(([, target]) => target === boundary.root)).toBe(true)
    await act(() => renderer.unmount())
    mounts.splice(mounts.indexOf(renderer), 1)
    expect(renderer.toJSON()).toBeNull()
  })

  it('refreshes the workspace list after creation and leaves navigation to the active form', async () => {
    const api = remote(), renderer = await mount(api)
    vi.mocked(api.mutate).mockResolvedValueOnce({ ok: true, value: { workspaceId: 'workspace-b' } })
    vi.mocked(api.getEnvironment).mockResolvedValue({ ok: true, value: { ...environment, workspaces: [...environment.workspaces, { id: 'workspace-b', name: '新工作区', path: '/new-workspace' }] } })
    await act(async () => {
      await renderer.root.findByType(ExperimentWorkbench).props.onAction({
        type: 'new-workspace', workspaceId: 'workspace-a', value: { name: '新工作区', path: '/new-workspace' },
      })
    })
    const shell = renderer.root.findByType(ExperimentWorkbench).props
    expect(shell.workspaceId).toBe('workspace-a')
    expect(shell.workspaces).toHaveLength(2)
  })

  it('preserves the unselected workspace when an initial empty environment gains a workspace', async () => {
    const api = remote()
    vi.mocked(api.getEnvironment).mockResolvedValue({ ok: true, value: { ...environment, workspaces: [] } })
    const renderer = await mount(api)
    expect(renderer.root.findByType(ExperimentWorkbench).props.workspaceId).toBeNull()
    vi.mocked(api.getEnvironment).mockResolvedValue({ ok: true, value: environment })
    await act(async () => {
      await renderer.root.findByType(ExperimentWorkbench).props.onAction({
        type: 'new-workspace', workspaceId: '', value: { name: '画面项目', path: '/art' },
      })
    })
    expect(renderer.root.findByType(ExperimentWorkbench).props.workspaceId).toBeNull()
    expect(renderer.root.findByType(ExperimentWorkbench).props.workspaces).toHaveLength(1)
  })

  it('keeps the reopened form when a cancelled submission succeeds but environment refresh fails', async () => {
    const api = remote(), renderer = await mount(api)
    vi.stubGlobal('FormData', class { get(key: string) { return key === 'name' ? '首个工作区' : '/first' } })
    let finish!: (value: Awaited<ReturnType<ExperimentHostRemote['mutate']>>) => void
    vi.mocked(api.mutate).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const open = () => renderer.root.findAllByType('button').find((button: any) => button.children.includes('添加工作区')).props.onClick()
    await act(open)
    let pending: Promise<void> | undefined
    await act(async () => {
      pending = renderer.root.findByProps({ role: 'dialog' }).findByType('form').props.onSubmit({ preventDefault() {}, currentTarget: {} })
    })
    await act(() => renderer.root.findByProps({ 'aria-label': '关闭对话框' }).props.onClick())
    await act(open)
    const nextName = renderer.root.findByProps({ name: 'name' })
    const nextPath = renderer.root.findByProps({ name: 'path' })
    vi.mocked(api.getEnvironment).mockRejectedValue(new Error('工作区列表加载失败，请刷新页面重试。'))
    await act(async () => {
      finish({ ok: true, value: { workspaceId: 'workspace-created' } })
      await pending
    })
    expect(renderer.root.findByProps({ name: 'name' })).toBe(nextName)
    expect(renderer.root.findByProps({ name: 'path' })).toBe(nextPath)
    expect(renderer.root.findByProps({ role: 'alert' }).findByType('span').children).toEqual(['工作区列表加载失败，请刷新页面重试。'])
  })

  it('resolves an existing official workspace and returns mutation selection to the shell', async () => {
    const api = remote(),
      renderer = await mount(api)
    const shell = (): ExperimentWorkbenchProps =>
      renderer.root.findByType(ExperimentWorkbench).props
    expect(shell().workspaceId).toBe('workspace-a')
    expect(api.getProjection).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
    })
    await act(async () => {
      shell().onWorkspaceChange('workspace-a')
    })
    let result: unknown
    await act(async () => {
      result = await shell().onAction({
        type: 'new-work',
        workspaceId: 'workspace-a',
        value: { name: '花房', goal: '自然光' },
      })
    })
    expect(result).toEqual({
      workspaceId: 'workspace-a',
      workId: 'work-a',
      branchId: 'child',
    })
    expect(localStorage.setItem).toHaveBeenLastCalledWith(
      'harness-comfyui:experiment-workspace',
      'workspace-a',
    )
    const selectPanel = vi.fn()
    let entry: any
    await act(() => {
      entry = create(<ExperimentWorkbenchEntry wide usePanelInfo={<T,>(selector: (info: PanelInfo) => T) => selector({ activePanelId: null })} selectPanel={selectPanel} />)
    })
    mounts.push(entry)
    await act(() => entry.root.findByType('button').props.onClick())
    expect(selectPanel).toHaveBeenCalledWith('harness-comfyui-experiment')
  })
  it('shows environment failures, retries loading and rejects failed mutations', async () => {
    const api = remote()
    vi.mocked(api.getEnvironment).mockResolvedValueOnce({
      ok: false,
      error: new RemoteError('workbench/operation-failed', '工作区不可用', { code: 'WORKBENCH_SCOPE_MISMATCH', issues: [] }),
    })
    const renderer = await mount(api)
    expect(
      renderer.root.findByProps({ role: 'alert' }).findByType('p').children,
    ).toEqual(['工作区不可用'])
    await act(async () => renderer.root.findByType('button').props.onClick())
    const shell: ExperimentWorkbenchProps =
      renderer.root.findByType(ExperimentWorkbench).props
    vi.mocked(api.mutate).mockResolvedValueOnce({
      ok: false,
      error: new RemoteError('workbench/operation-failed', '保存失败，请重试。', { code: 'WORKBENCH_INVALID_INPUT', issues: [] }),
    })
    await expect(
      shell.onAction({ type: 'run', workspaceId: 'workspace-a' }),
    ).rejects.toThrow('保存失败，请重试。')
  })
  it('keeps an empty official environment usable when catalog metadata fails', async () => {
    const api = remote()
    vi.mocked(api.getEnvironment).mockResolvedValue({
      ok: true,
      value: { ...environment, workspaces: [] },
    })
    const source = catalog()
    source.baseModels.mockRejectedValue(new Error('catalog offline'))
    vi.stubGlobal('document', new EventTarget())
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('denied')
      },
      setItem() {
        throw new Error('denied')
      },
    })
    let renderer: any
    await act(async () => {
      renderer = create(
        <ExperimentWorkbenchHost remote={api} catalog={source} connectionState={createConnectionState().source} />,
        { createNodeMock },
      )
    })
    mounts.push(renderer)
    expect(
      renderer.root.findByType(ExperimentWorkbench).props.workspaceId,
    ).toBeNull()
    await act(() =>
      renderer.root
        .findByType(ExperimentWorkbench)
        .props.onWorkspaceChange('workspace-a'),
    )
    expect(renderer.root.findByType(ExperimentWorkbench).props).toBeDefined()
  })
})

describe('official function environment adapter', () => {
  it('unwraps the selected preset environment and preserves actionable remote errors', async () => {
    const api = remote(), renderer = await mount(api)
    const shell = renderer.root.findByType(ExperimentWorkbench).props as ExperimentWorkbenchProps
    await expect(shell.remote.getEnvironment({ workspaceId: 'workspace-a', presetId: 'preset' })).resolves.toEqual(environment)
    expect(api.getEnvironment).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', presetId: 'preset' })
    vi.mocked(api.getEnvironment).mockResolvedValueOnce({ ok: false, error: new RemoteError('workbench/operation-failed', 'Skill 目录读取失败，请重试。', { code: 'WORKBENCH_INVALID_INPUT', issues: [] }) })
    await expect(shell.remote.getEnvironment({ workspaceId: 'workspace-a', presetId: 'preset' })).rejects.toThrow('Skill 目录读取失败，请重试。')
  })
})
