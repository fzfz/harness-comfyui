import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogItem, CatalogKind } from '../../src/catalog/contract.ts'
import type { CatalogApi } from '../../src/client/workbench/catalog-browser.tsx'
import type { ArtifactPayload } from '../../src/workbench/contract.ts'
import type { ExperimentWorkbenchProps } from '../../src/client/workbench/experiment-contract.ts'
import { ExperimentWorkbench } from '../../src/client/workbench/experiment-workbench.tsx'
import {
  fullProjection,
  functionEnvironment,
  treeProjection,
  inputDescription,
  makeRun,
  makeTask,
} from './experiment-workbench-fixtures.ts'
import type {
  Branch,
  TaskDraft,
  WorkbenchProjection,
} from '../../src/workbench/contract.ts'

import type { WorkbenchEnvironment, WorkbenchModelChangePreview } from '../../src/workbench-remote.ts'

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
    toJSON(): unknown
  }
}
const empty: WorkbenchProjection = {
  workspace_id: 'workspace-a',
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
  refreshAfterMs: 0,
}
const draft: TaskDraft = {
  prompt_input: { positive_prompt: '', negative_prompt: '' },
  generation_input: {
    title: '',
    instance_id: null,
    template_id: null,
    model: null,
    parameters: {},
    loras: [],
  },
  context_refs: [],
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
  execution: { mode: 'once', max_runs: 1 },
})
const mounts: { unmount(): void }[] = []
afterEach(async () => {
  await act(() => {
    for (const mount of mounts.splice(0)) mount.unmount()
  })
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const mount = async (
  data: WorkbenchProjection,
  options: Partial<Omit<ExperimentWorkbenchProps, 'remote'>> & { remote?: Partial<ExperimentWorkbenchProps['remote']> } = {},
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
  const onAction = vi.fn(),
    remote = {
      getProjection: vi.fn(async (scope: { workId?: string }) => ({
        ...data,
        work_id: scope.workId ?? data.work_id,
      })),
      getEnvironment: async () => functionEnvironment,
      getInputDescription: vi.fn(async () => inputDescription),
      previewModelChange: vi.fn(async (request: { modelId: string }) => ({ model: { id: request.modelId, label: 'ANIMA3' }, removed: [] })),
    }
  let renderer!: ReturnType<typeof create>
  await act(async () => {
    renderer = create(
      <ExperimentWorkbench
        workspaces={[
          { id: 'workspace-a', name: '画面实验', path: '/projects/art' },
        ]}
        workspaceId="workspace-a"
        onWorkspaceChange={vi.fn()}
        onAction={onAction}
        presets={[{ id: 'preset', name: '工作台预设' }]}
        instances={[{ id: '2', name: 'win3080' }]}
        baseModels={[{ id: '1', label: 'SDXL' }]}
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
        remote={{ ...remote, ...options.remote }}
      />,
      renderOptions,
    )
  })
  mounts.push(renderer)
  return { renderer, onAction, remote }
}

describe('experiment workbench instance selection', () => {
  it('renders registered names and persists two instance IDs through refresh and branch reopening without changing other inputs', async () => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture()
    const signal = new AbortController().signal
    try {
      host.catalog.queryComfyuiInstances.mockResolvedValue({
        status: 'ok', message: null, results: [{ id: '8', title: 'win3080' }, { id: '9', title: 'render-node' }], page: 1, page_size: 100, total_count: 2,
      })
      const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '实例选择', goal: '保留生成输入' } }, signal)
      const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
      const branch = host.store.getBranch(scope.branchId)
      const seeded = structuredClone(fullProjection().branches[0]!.draft)
      seeded.generation_input.instance_id = null
      host.store.saveBranchDraft({ ...scope, expected: branch.draft, draft: seeded })
      host.store.createBranch({ workId: scope.workId, parentBranchId: scope.branchId, name: '另一分支', originalRequest: '独立输入', draft: structuredClone(seeded) })
      const environment = await host.remote.getEnvironment({}, signal)
      const memory = new Map<string, string>()
      const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
      const options: NonNullable<Parameters<typeof mount>[1]> = {
        workspaceId: scope.workspaceId, workspaces: environment.workspaces, instances: environment.instances, storage,
        remote: {
          previewModelChange: request => host.remote.previewModelChange(request, signal), getEnvironment: request => host.remote.getEnvironment(request, signal),
          getInputDescription: request => host.remote.getInputDescription(request, signal),
          getProjection: request => host.remote.getProjection(request, signal),
        },
        onAction: request => host.remote.mutate(request, signal),
      }
      const data = await host.remote.getProjection(scope, signal)
      const { renderer } = await mount(data, options)
      expect(renderer.root.findByProps({ 'aria-label': 'ComfyUI 实例' }).findAllByType('option').map(node => [node.props.value, nodeText(node)])).toEqual([['', '请选择'], ['8', 'win3080'], ['9', 'render-node']])
      await change(renderer, 'ComfyUI 实例', '8')
      expect(host.store.getBranch(scope.branchId).draft).toEqual({ ...seeded, generation_input: { ...seeded.generation_input, instance_id: '8' } })
      await act(() => renderer.unmount())
      const reopened = await mount(data, options)
      expect(reopened.renderer.root.findByProps({ 'aria-label': 'ComfyUI 实例' }).props.value).toBe('8')
      await change(reopened.renderer, 'ComfyUI 实例', '9')
      await click(reopened.renderer, '切换分支 另一分支')
      await click(reopened.renderer, '切换分支 主分支')
      expect(reopened.renderer.root.findByProps({ 'aria-label': 'ComfyUI 实例' }).props.value).toBe('9')
      expect(host.store.getBranch(scope.branchId).draft).toEqual({ ...seeded, generation_input: { ...seeded.generation_input, instance_id: '9' } })
      await act(() => reopened.renderer.unmount())
    } finally { await host.dispose() }
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
    expect(renderer.root.findByProps({ role: 'dialog', 'aria-label': `${runId} · 图片 1` })).toBeDefined()
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

  it.each([
    { outcome: 'success', returnToSource: false },
    { outcome: 'failure', returnToSource: false },
    { outcome: 'success', returnToSource: true },
    { outcome: 'failure', returnToSource: true },
  ])('keeps user navigation after an earlier save: $outcome, return $returnToSource', async ({ outcome, returnToSource }) => {
    let finish!: (value: { workspaceId: string; workId: string; branchId: string }) => void
    let fail!: (error: Error) => void
    const onAction = vi.fn(() => new Promise<{ workspaceId: string; workId: string; branchId: string }>((resolve, reject) => { finish = resolve; fail = reject }))
    const onWorkspaceChange = vi.fn()
    const { renderer } = await mount(fullProjection(), {
      onAction, onWorkspaceChange,
      workspaces: [{ id: 'workspace-a', name: '画面实验', path: '/projects/art' }, { id: 'workspace-b', name: '人物实验', path: '/projects/characters' }],
      remote: { getProjection: async ({ workspaceId }) => workspaceId === 'workspace-a' ? fullProjection() : { ...empty, workspace_id: 'workspace-b' }, getEnvironment: async () => functionEnvironment,
      getInputDescription: async () => inputDescription },
    })
    await change(renderer, 'ComfyUI 实例', '2')
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'update-draft', workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root' }))
    await change(renderer, '切换工作区', 'workspace-b')
    if (returnToSource) {
      await change(renderer, '切换工作区', 'workspace-a')
      await click(renderer, '配置中心')
    }
    await act(async () => {
      if (outcome === 'success') finish({ workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root' })
      else fail(new Error('前一工作区保存失败'))
    })
    expect(renderer.root.findByProps({ 'aria-label': '切换工作区' }).props.value).toBe(returnToSource ? 'workspace-a' : 'workspace-b')
    expect(onWorkspaceChange).toHaveBeenCalledTimes(returnToSource ? 2 : 1)
    expect(onWorkspaceChange).toHaveBeenLastCalledWith(returnToSource ? 'workspace-a' : 'workspace-b')
    if (returnToSource) expect(renderer.root.findByProps({ 'aria-label': '运行结果' }).props.className).toBe('')
    expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(0)
  })

  it('shows the reference empty workspace and opens the work form', async () => {
    const { renderer } = await mount(empty)
    expect(
      renderer.root.findByProps({ 'aria-label': '切换工作区' }).props.value,
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
      expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe(selected.name)
      expect(renderer.root.findByProps({ 'aria-label': '原始需求' }).props.value).toBe(selected.original_request)
      const runs = data.runs.filter(run => run.workbench_task_id === `${selected.branch_id}-task`)
      const strip = renderer.root.findByProps({ className: 'run-strip' })
      expect(strip.findAllByType('button').map(node => node.props['aria-label'])).toEqual(runs.map(run => `查看运行 ${run.run_id}`))
      expect(renderer.root.findByProps({ 'aria-label': `查看运行 ${runs.at(-1)!.run_id}` }).props['aria-pressed']).toBe(true)
      expect(renderer.root.findAllByProps({ role: 'treeitem', 'aria-selected': true })).toHaveLength(1)
    }
    await click(renderer, '收起暖光')
    expect(renderer.root.findAllByProps({ 'aria-label': '切换分支 暖光细节' })).toHaveLength(0)
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe('暖光细节')
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

  it('opens results and reveals children when selecting a collapsed branch from resources', async () => {
    const { renderer } = await mount(treeProjection())
    await click(renderer, '收起暖光')
    await click(renderer, '资源')
    await click(renderer, '切换分支 暖光')
    expect(renderer.root.findByProps({ 'aria-label': '运行结果' }).props.className).toBe('active')
    expect(renderer.root.findByProps({ 'aria-label': '收起暖光' })).toBeDefined()
    expect(renderer.root.findByProps({ 'aria-label': '切换分支 暖光细节' })).toBeDefined()
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe('暖光')
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
      renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value,
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
  const button = renderer.root
    .findAllByType('button')
    .find(
      (node) => nodeText(node) === label || node.props['aria-label'] === label,
    )
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
  const input = renderer.root.findByProps({ 'aria-label': label })
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
      renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props.checked,
    ).toBe(true)
    await click(renderer, '编辑任务输入')
    await change(renderer, '查看运行输入', '', true)
    expect(
      renderer.root.findByProps({ 'aria-label': '正向提示词' }).props.value,
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
        'aria-label': 'r2 · 图片 1',
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

  it('forwards edited input, resource and execution values with the active branch identity', async () => {
    const { renderer, onAction } = await mount(fullProjection(), { catalog: makeCatalog() })
    await click(renderer, '切换分支 暖光探索')
    await change(renderer, '分支名称', '暖光复验')
    await blur(renderer, '分支名称', '暖光复验')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'update-branch',
        workspaceId: 'workspace-a',
        workId: 'work-a',
        branchId: 'child',
        field: 'name',
        value: '暖光复验',
      }),
    )
    for (const [label, value, field] of [
      ['原始需求', '保留窗框', 'original_request'],
      ['正向提示词', 'warm glass', 'positive_prompt'],
      ['负向提示词', 'noise', 'negative_prompt'],
      ['参考图路径', '/image.png', 'references'],
      ['采样步数', '30', 'steps'],
      ['引导强度', '4.5', 'cfg'],
      ['Seed', '123', 'seed'],
    ]) {
      await change(renderer, label!, value!)
      await blur(renderer, label!, value!)
      expect(onAction).toHaveBeenLastCalledWith(
        expect.objectContaining({
          field,
          value: ['steps', 'cfg', 'seed'].includes(field!)
            ? Number(value)
            : value,
        }),
      )
    }
    await change(renderer, 'ComfyUI 实例', '2')
    await change(renderer, '画面尺寸', '768 × 1024')
    await blur(renderer, '玻璃 LoRA 权重', '0.7')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'update-draft',
        field: 'lora-weight',
        id: '13',
        value: 0.7,
      }),
    )
    await click(renderer, '移除 玻璃 LoRA')
    await click(renderer, '移除 花房作品')
    await change(renderer, '本次执行预设', 'preset')
    await change(renderer, '持续实验', 'continuous')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'update-execution',
        field: 'mode',
        value: 'continuous',
      }),
    )
    await click(renderer, '运行任务')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'run',
        value: { preset_override: 'preset' },
      }),
    )
    for (const label of [
      '生成提示词',
      '改写提示词',
      '建议参数',
      '推荐资源',
      '自定义prompt',
      '自定义rewrite',
      '自定义parameters',
      '自定义resources',
      '自定义run',
    ]) {
      await click(renderer, label)
      expect(onAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'agent-action' }),
      )
    }
    for (const [label, kind] of [
      ['选择资源', 'model'],
      ['更换生成模型', 'model'],
      ['选择 Workflow 模板', 'comfyui-template'],
      ['添加 LoRA', 'lora'],
      ['添加参考上下文', 'character'],
    ]) {
      await click(renderer, label!)
      expect(
        renderer.root.findAllByProps({ 'aria-pressed': true }).length,
      ).toBeGreaterThan(0)
      expect(
        renderer.root.findByProps({ 'aria-label': '资源' }).props.className,
      ).toBe('active')
      await click(renderer, '返回结果')
    }
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

  it('shows real failures and running records and forwards retry, review and favorites', async () => {
    const data = fullProjection()
    data.tasks.push(makeTask('t4'))
    data.runs.push(makeRun('r4', 't4', 'running'))
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
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'evaluate' }),
    )
    await click(renderer, '查看运行 r2')
    await click(renderer, '移除收藏')
    await click(renderer, '查看运行记录')
    await click(renderer, '关闭面板')
    await click(renderer, '经验')
    await change(renderer, '搜索经验与收藏', '自然光')
    await click(renderer, 'r2 ↗')
    await click(renderer, '经验')
    await click(renderer, '复用经验')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'reuse', id: 'experience-a' }),
    )
    await click(renderer, '移除收藏')
    await click(renderer, '查看来源经验')
    expect(
      renderer.root.findByProps({ 'aria-label': '经验' }).props.className,
    ).toBe('active')
  })

  it('shows the prototype function locations and saved bindings when settings reopen', async () => {
    const data = fullProjection()
    data.functions.find(binding => binding.function_id === 'rewrite')!.requested_skill = null
    const { renderer, onAction } = await mount(data)
    const locations = {
      run: '任务输入', prompt: '原始需求', rewrite: '提示词',
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
        expect(row.findByProps({ 'aria-label': `${kind}的默认预设` }).props.value).toBe('preset')
        expect(nodeText(cells[3]!)).toBe('提供商 · 模型 · 高')
        expect(nodeText(cells[4]!)).toBe(kind === 'rewrite' ? 'Agent 自选' : 'comfyui-generate')
        expect(row.findByProps({ 'aria-label': `编辑${kind}` })).toBeDefined()
      }
      expect(nodeText(table.findByProps({ 'data-function': 'custom-prompt' }).findAllByType('td')[1]!)).toBe('原始需求')
      await click(renderer, '返回工作台')
    }
    expect(onAction).not.toHaveBeenCalled()
  })

  it('browses function settings and forwards function changes', async () => {
    const { renderer, onAction } = await mount(fullProjection())
    await click(renderer, '配置中心')
    await click(renderer, '添加功能')
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
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'function-remove', id: 'custom-prompt' }),
    )
    await click(renderer, '返回工作台')
  })

  it('runs continuous execution and controls only the active experiment', async () => {
    const data = fullProjection()
    data.branches[0]!.execution.mode = 'continuous'
    const { renderer, onAction } = await mount(data)
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

describe('experiment workbench forms and task results', () => {
  it.each([
    ['name', '分支名称'],
    ['original_request', '原始需求'],
  ] as const)('retains the original %s and typed text when another window saves during editing', async (field, label) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let available = { ...fullProjection(), refreshAfterMs: 100 }
    const originalValue = available.branches[0]![field]
    const onAction = vi.fn(async () => { throw new Error('分支内容已改变，请刷新后重新保存。') })
    const { renderer } = await mount(available, {
      remote: { getProjection: async () => structuredClone(available), getEnvironment: async () => functionEnvironment,
      getInputDescription: async () => inputDescription },
      onAction,
    })
    await change(renderer, label, '当前窗口填写的文字')
    available = { ...available, branches: available.branches.map(branch => branch.branch_id === 'root' ? { ...branch, [field]: '其他窗口保存的文字' } : branch) }
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(renderer.root.findByProps({ 'aria-label': label }).props.value).toBe('当前窗口填写的文字')
    await blur(renderer, label, '当前窗口填写的文字')
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'update-branch', field, value: '当前窗口填写的文字', expectedValue: originalValue }))
    expect(renderer.root.findByProps({ 'aria-label': label }).props.value).toBe('当前窗口填写的文字')
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toContain('分支内容已改变')
  })

  it('shows later saved branch values after its own edit is saved', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let available = { ...fullProjection(), refreshAfterMs: 100 }
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
      available = { ...available, branches: available.branches.map(branch => branch.branch_id === 'root' ? { ...branch, name: String(request.value) } : branch) }
    })
    const { renderer } = await mount(available, {
      remote: { getProjection: async () => structuredClone(available), getEnvironment: async () => functionEnvironment,
      getInputDescription: async () => inputDescription },
      onAction,
    })
    await change(renderer, '分支名称', '本窗口保存的名称')
    await blur(renderer, '分支名称', '本窗口保存的名称')
    available = { ...available, branches: available.branches.map(branch => branch.branch_id === 'root' ? { ...branch, name: '另一个窗口保存的名称' } : branch) }
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe('另一个窗口保存的名称')
    await change(renderer, '分支名称', '再次编辑')
    await blur(renderer, '分支名称', '再次编辑')
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ expectedValue: '另一个窗口保存的名称', value: '再次编辑' }))
  })

  it('keeps newer typing while a branch save completes and uses the saved value for the next save', async () => {
    let available = fullProjection()
    let finish!: () => void
    const response = new Promise<void>(resolve => { finish = resolve })
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
      if (onAction.mock.calls.length === 1) await response
      available = { ...available, branches: available.branches.map(branch => branch.branch_id === 'root' ? { ...branch, name: String(request.value) } : branch) }
    })
    const { renderer } = await mount(available, {
      remote: { getProjection: async () => structuredClone(available), getEnvironment: async () => functionEnvironment,
      getInputDescription: async () => inputDescription },
      onAction,
    })
    await change(renderer, '分支名称', '第一次编辑')
    await blur(renderer, '分支名称', '第一次编辑')
    await change(renderer, '分支名称', '继续填写的文字')
    await act(async () => { finish(); await response })
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe('继续填写的文字')
    await blur(renderer, '分支名称', '继续填写的文字')
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ expectedValue: '第一次编辑', value: '继续填写的文字' }))
  })

  it.each(['主分支', '继续填写的名称'])('saves the last blurred value %s after an earlier save finishes', async (lastValue) => {
    let available = fullProjection()
    let finish!: () => void
    const response = new Promise<void>(resolve => { finish = resolve })
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
      if (onAction.mock.calls.length === 1) await response
      available = { ...available, branches: available.branches.map(branch => branch.branch_id === 'root' ? { ...branch, name: String(request.value) } : branch) }
    })
    const { renderer } = await mount(available, {
      remote: { getProjection: async () => structuredClone(available), getEnvironment: async () => functionEnvironment,
      getInputDescription: async () => inputDescription },
      onAction,
    })
    await change(renderer, '分支名称', '第一次提交')
    await blur(renderer, '分支名称', '第一次提交')
    await change(renderer, '分支名称', '中间输入')
    await blur(renderer, '分支名称', '中间输入')
    await change(renderer, '分支名称', lastValue)
    await blur(renderer, '分支名称', lastValue)
    expect(onAction).toHaveBeenCalledTimes(1)
    await act(async () => { finish(); await response })
    expect(onAction).toHaveBeenCalledTimes(2)
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ value: lastValue, expectedValue: '第一次提交' }))
    expect(available.branches[0]!.name).toBe(lastValue)
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe(lastValue)
  })

  it.each(['前一分支提交', '新分支输入'])('retains the selected branch edit %s when an earlier save refresh completes', async (nextValue) => {
    let available = fullProjection()
    let finishRefresh!: (value: WorkbenchProjection) => void
    let deferRefresh = false
    const refreshed = new Promise<WorkbenchProjection>(resolve => { finishRefresh = resolve })
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
      available = { ...available, branches: available.branches.map(branch => branch.branch_id === request.branchId ? { ...branch, name: String(request.value) } : branch) }
      if (onAction.mock.calls.length === 1) deferRefresh = true
    })
    const { renderer } = await mount(available, {
      remote: { getProjection: async () => {
        if (deferRefresh) { deferRefresh = false; return refreshed }
        return structuredClone(available)
      }, getEnvironment: async () => functionEnvironment,
      getInputDescription: async () => inputDescription },
      onAction,
    })
    await change(renderer, '分支名称', '前一分支提交')
    await blur(renderer, '分支名称', '前一分支提交')
    const originalChildName = available.branches[1]!.name
    await act(() => renderer.root.findByProps({ 'aria-label': `切换分支 ${originalChildName}` }).props.onClick())
    await change(renderer, '分支名称', nextValue)
    await act(async () => { finishRefresh(structuredClone(available)); await refreshed })
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe(nextValue)
    await blur(renderer, '分支名称', nextValue)
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ branchId: available.branches[1]!.branch_id, value: nextValue, expectedValue: originalChildName }))
  })

  it('keeps the latest input and stops queued saves when the active save fails', async () => {
    const available = fullProjection()
    let finish!: () => void
    const response = new Promise<void>(resolve => { finish = resolve })
    const onAction = vi.fn(async () => { await response; throw new Error('连接中断，请重试。') })
    const { renderer } = await mount(available, { onAction })
    await change(renderer, '分支名称', '第一次提交')
    await blur(renderer, '分支名称', '第一次提交')
    await change(renderer, '分支名称', '后来输入')
    await blur(renderer, '分支名称', '后来输入')
    await act(async () => { finish(); await response })
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe('后来输入')
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toContain('连接中断')
    await blur(renderer, '分支名称', '后来输入')
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ value: '后来输入', expectedValue: available.branches[0]!.name }))
  })

  it('persists already blurred edits to their branch after selecting another branch', async () => {
    let available = fullProjection()
    let finish!: () => void
    const response = new Promise<void>(resolve => { finish = resolve })
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
      if (onAction.mock.calls.length === 1) await response
      available = { ...available, branches: available.branches.map(branch => branch.branch_id === request.branchId ? { ...branch, name: String(request.value) } : branch) }
    })
    const { renderer } = await mount(available, {
      remote: { getProjection: async () => structuredClone(available), getEnvironment: async () => functionEnvironment,
      getInputDescription: async () => inputDescription },
      onAction,
    })
    await change(renderer, '分支名称', '第一次提交')
    await blur(renderer, '分支名称', '第一次提交')
    await change(renderer, '分支名称', '最后提交')
    await blur(renderer, '分支名称', '最后提交')
    await act(() => renderer.root.findByProps({ 'aria-label': '切换分支 暖光探索' }).props.onClick())
    await change(renderer, '分支名称', '新分支输入')
    await act(async () => { finish(); await response })
    expect(available.branches[0]!.name).toBe('最后提交')
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ branchId: 'root', value: '最后提交', expectedValue: '第一次提交' }))
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe('新分支输入')
    await blur(renderer, '分支名称', '新分支输入')
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ branchId: 'child', value: '新分支输入', expectedValue: '暖光探索' }))
  })

  it('retains branch typing through a failed projection poll and retry', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const available = { ...fullProjection(), refreshAfterMs: 100 }
    let failProjection = false
    const { renderer, onAction } = await mount(available, {
      remote: { getProjection: async () => {
        if (failProjection) throw new Error('连接中断')
        return structuredClone(available)
      }, getEnvironment: async () => functionEnvironment,
      getInputDescription: async () => inputDescription },
    })
    await change(renderer, '分支名称', '尚未提交的名称')
    failProjection = true
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(nodeText(renderer.root)).toContain('工作台加载失败')
    failProjection = false
    await click(renderer, '重试')
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe('尚未提交的名称')
    await blur(renderer, '分支名称', '尚未提交的名称')
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ value: '尚未提交的名称', expectedValue: available.branches[0]!.name }))
  })

  it('finishes sequential branch saves without leaving the page selected during saving', async () => {
    let available = fullProjection()
    let finish!: () => void
    const response = new Promise<void>(resolve => { finish = resolve })
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
      if (onAction.mock.calls.length === 1) await response
      available = { ...available, branches: available.branches.map(branch => branch.branch_id === 'root' ? { ...branch, name: String(request.value) } : branch) }
      return { workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root' }
    })
    const { renderer } = await mount(available, {
      remote: { getProjection: async () => structuredClone(available), getEnvironment: async () => functionEnvironment,
      getInputDescription: async () => inputDescription },
      onAction,
    })
    await change(renderer, '分支名称', '第一次提交')
    await blur(renderer, '分支名称', '第一次提交')
    await click(renderer, '资源')
    await change(renderer, '分支名称', '资源页继续填写')
    await blur(renderer, '分支名称', '资源页继续填写')
    await act(async () => { finish(); await response })
    expect(available.branches[0]!.name).toBe('资源页继续填写')
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ value: '资源页继续填写', expectedValue: '第一次提交' }))
    expect(renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
  })

  it('keeps same-branch typing when visiting another workbench page', async () => {
    const { renderer } = await mount(fullProjection())
    await change(renderer, '分支名称', '尚未提交的名称')
    await click(renderer, '配置中心')
    await click(renderer, '返回工作台')
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe('尚未提交的名称')
  })

  it('releases an unchanged edit so subsequent remote values remain visible', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let available = { ...fullProjection(), refreshAfterMs: 100 }
    const originalValue = available.branches[0]!.name
    const onAction = vi.fn()
    const { renderer } = await mount(available, {
      remote: { getProjection: async () => structuredClone(available), getEnvironment: async () => functionEnvironment,
      getInputDescription: async () => inputDescription },
      onAction,
    })
    await change(renderer, '分支名称', '临时输入')
    await change(renderer, '分支名称', originalValue)
    await blur(renderer, '分支名称', originalValue)
    expect(onAction).not.toHaveBeenCalled()
    available = { ...available, branches: available.branches.map(branch => branch.branch_id === 'root' ? { ...branch, name: '其他窗口的新名称' } : branch) }
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe('其他窗口的新名称')
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
    expect(renderer.root.findByProps({ 'aria-label': '切换工作区' }).props.value).toBe('workspace-a')
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
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe('暖光子分支')
    expect(renderer.root.findByProps({ 'aria-label': '原始需求' }).props.value).toBe(parent.original_request)
    expect(renderer.root.findByProps({ 'aria-label': '正向提示词' }).props.value).toBe(parent.draft.prompt_input.positive_prompt)
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
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe('暖光探索')
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
      { type: 'resources', refs: [{ kind: 'work', id: '14' }] },
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
        context_refs: [],
      },
    ]
    data.artifacts = artifacts.map((artifact, i) => ({
      artifact_id: 'a' + i,
      task_id: 'question',
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
    for (const label of [
      '采用提示词',
      '采用参数',
      '采用资源',
      '填入评价',
      '填入经验',
      '采用建议输入',
    ]) {
      await click(renderer, label)
      expect(onAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'task-apply', taskId: 'question' }),
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
      context: { kind: 'work', id: String(100 + index), name: `作品 ${index + 1}` },
      label: `作品 ${index + 1}`,
    }))
    vi.mocked(catalog.search).mockImplementation((request, signal) => {
      if (request.kind !== 'work') return search(request, signal)
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
    await click(renderer, '作品')
    const assertPage = (page: string, labels: string[], disabled: boolean[]) => {
      expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain(page)
      expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(labels)
      expect(nodeText(renderer.root.findByProps({ className: 'row between catalog-results-head' }))).toContain('19 项')
      expect(renderer.root.findByProps({ className: 'catalog-pagination' }).findAllByType('button').map(button => button.props.disabled)).toEqual(disabled)
      expect(renderer.root.findAllByType('button').filter(button => nodeText(button) === '清除筛选')).toHaveLength(0)
      expect(nodeText(renderer.root.findByProps({ className: 'selected-resources' }))).toBe(selected)
    }
    assertPage('1 / 3', ['作品 1', '作品 2', '作品 3', '作品 4', '作品 5', '作品 6', '作品 7', '作品 8'], [true, false])
    await click(renderer, '下一页')
    assertPage('2 / 3', ['作品 9', '作品 10', '作品 11', '作品 12', '作品 13', '作品 14', '作品 15', '作品 16'], [false, false])
    await click(renderer, '下一页')
    assertPage('3 / 3', ['作品 17', '作品 18', '作品 19'], [false, true])
    await act(() => renderer.unmount())
    const reopened = await mount(data, { catalog, storage })
    expect(nodeText(reopened.renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('3 / 3')
    expect(reopened.renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['作品 17', '作品 18', '作品 19'])
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
    await click(renderer, '作品')
    await click(renderer, '下一页')
    await change(renderer, '搜索资源', 'none')
    await click(renderer, '下一页')
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 1')
    expect(renderer.root.findByProps({ className: 'catalog-pagination' }).findAllByType('button').map(button => button.props.disabled)).toEqual([true, true])
    expect(nodeText(renderer.root.findByProps({ className: 'row between catalog-results-head' }))).toContain('0 项')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['没有匹配的资源'])
    expect(renderer.root.findAllByType('button').filter(button => nodeText(button) === '清除筛选')).toHaveLength(1)
    await click(renderer, '清除筛选')
    expect(renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('')
    expect(catalog.search).toHaveBeenLastCalledWith({ kind: 'work', query: '', page: 1, baseModelId: null, modelId: null }, expect.any(AbortSignal))
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 3')
    expect(nodeText(renderer.root.findByProps({ className: 'row between catalog-results-head' }))).toContain('19 项')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['作品 1', '作品 2', '作品 3', '作品 4', '作品 5', '作品 6', '作品 7', '作品 8'])
    expect(nodeText(renderer.root.findByProps({ className: 'selected-resources' }))).toBe(selected)
    await act(() => renderer.unmount())
    const reopened = await mount(data, { catalog, storage })
    expect(nodeText(reopened.renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 3')
    expect(nodeText(reopened.renderer.root.findByProps({ className: 'row between catalog-results-head' }))).toContain('19 项')
    expect(reopened.renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('')
    expect(nodeText(reopened.renderer.root.findByProps({ className: 'selected-resources' }))).toBe(selected)
    await click(reopened.renderer, '生成模型')
    expect(reopened.renderer.root.findByProps({ 'aria-label': '筛选底模' }).props.value).toBe('')
    expect(reopened.renderer.root.findByProps({ 'aria-label': '筛选生成模型' }).props.value).toBe('')
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    expect(onAction).not.toHaveBeenCalled()
    expect(reopened.onAction).not.toHaveBeenCalled()
  })

  it('keeps text typed while an out-of-range response is being corrected', async () => {
    const catalog = paginatedCatalog()
    const search = vi.mocked(catalog.search).getMockImplementation()!
    let finish!: () => Promise<void>
    vi.mocked(catalog.search).mockImplementation((request, signal) => {
      if (request.kind === 'work' && request.query === 'light' && request.page === 2) {
        return new Promise(resolve => { finish = async () => resolve(await search(request, signal)) })
      }
      return search(request, signal)
    })
    const { renderer } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    await click(renderer, '作品')
    await change(renderer, '搜索资源', 'light')
    await click(renderer, '下一页')
    await change(renderer, '搜索资源', 'latest draft')
    await act(async () => finish())
    expect(renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('latest draft')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['作品 1', '作品 2', '作品 3', '作品 4'])
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
    await click(renderer, '作品')
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 3')
    await change(renderer, '搜索资源', 'light')
    await click(renderer, '下一页')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['作品 1', '作品 2', '作品 3', '作品 4'])
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 1')
    expect(renderer.root.findByProps({ className: 'catalog-pagination' }).findAllByType('button').map(button => button.props.disabled)).toEqual([true, true])
    expect(nodeText(renderer.root.findByProps({ className: 'row between catalog-results-head' }))).toContain('4 项')
    expect(renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('light')
    expect(nodeText(renderer.root.findByProps({ className: 'selected-resources' }))).toBe(selected)
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    expect(onAction).not.toHaveBeenCalled()
    await act(() => renderer.unmount())
    const reopened = await mount(data, { catalog, storage })
    expect(nodeText(reopened.renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 1')
    expect(reopened.renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['作品 1', '作品 2', '作品 3', '作品 4'])
    expect(reopened.renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('light')
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
    const { renderer } = await mount(first, options)
    await click(renderer, '资源')
    await change(renderer, '搜索资源', '  returned navigation draft  ')
    await click(renderer, '新建工作')
    await act(async () => renderer.root.findByProps({ role: 'dialog' }).findAllByType('form')[0]!.props.onSubmit({ preventDefault() {}, currentTarget: { name: '返回的工作', goal: '验证返回导航' } }))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'new-work', workspaceId: 'workspace-a' }))
    expect(renderer.root.findByProps({ 'aria-label': '切换工作' }).props.value).toBe('work-b')
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe('返回的主分支')
    expect(renderer.root.findByProps({ 'aria-label': '正向提示词' }).props.value).toBe('returned work prompt')
    await act(() => renderer.unmount())
    const reopened = await mount(first, options)
    await click(reopened.renderer, '资源')
    expect(reopened.renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('  returned navigation draft  ')
    expect(reopened.renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe('返回的主分支')
    expect(reopened.renderer.root.findByProps({ 'aria-label': '正向提示词' }).props.value).toBe('returned work prompt')
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
    const { renderer, onAction } = await mount(first, options)
    await click(renderer, '资源')
    await change(renderer, '搜索资源', '  navigation draft  ')
    if (navigation === 'work') await change(renderer, '切换工作', 'work-b')
    if (navigation === 'branch') await click(renderer, '切换分支 暖光')
    if (navigation === 'run') {
      await click(renderer, '查看运行记录')
      const card = renderer.root.findByProps({ 'aria-label': '运行记录' }).findAllByType('article').find(node => nodeText(node).includes('warm-r1'))!
      await act(() => card.findAllByType('button').find(button => nodeText(button) === '查看运行')!.props.onClick())
    }
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe(navigation === 'work' ? '另一个工作分支' : '暖光')
    expect(renderer.root.findByProps({ 'aria-label': '正向提示词' }).props.value).toBe(navigation === 'work' ? 'second work prompt' : navigation === 'run' ? 'selected run prompt' : 'warm prompt')
    await act(() => renderer.unmount())
    const reopened = await mount(first, options)
    await click(reopened.renderer, '资源')
    expect(reopened.renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('  navigation draft  ')
    expect(reopened.renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe(navigation === 'work' ? '另一个工作分支' : '暖光')
    expect(reopened.renderer.root.findByProps({ 'aria-label': '正向提示词' }).props.value).toBe(navigation === 'work' ? 'second work prompt' : navigation === 'run' ? 'selected run prompt' : 'warm prompt')
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
    const initial = await mount(first, options)
    await click(initial.renderer, '资源')
    await change(initial.renderer, '搜索资源', '  saved A  ')
    await act(async () => initial.renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    await change(initial.renderer, '搜索资源', '  reload draft  ')
    await act(() => initial.renderer.unmount())
    const reopened = await mount(first, options), renderer = reopened.renderer
    expect(renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('saved A')
    await change(renderer, '搜索资源', '  workspace A draft  ')
    await change(renderer, '切换工作区', 'workspace-b')
    await click(renderer, '资源')
    expect(renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('')
    await change(renderer, '搜索资源', '  saved B  ')
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    await change(renderer, '切换工作区', 'workspace-a')
    expect(renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('  workspace A draft  ')
    expect(catalog.search).toHaveBeenCalledWith(expect.objectContaining({ query: '  workspace A draft  ' }), expect.any(AbortSignal))
    await change(renderer, '切换工作区', 'workspace-b')
    expect(renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('saved B')
    expect([...first.branches, ...second.branches].map(branch => branch.draft)).toEqual(originalDrafts)
    expect(initial.onAction).not.toHaveBeenCalled()
    expect(reopened.onAction).not.toHaveBeenCalled()
  })

  it('retains the final submitted search and selection when an earlier response arrives late', async () => {
    const catalog = makeCatalog(), search = vi.mocked(catalog.search).getMockImplementation()!
    let finishFirst!: () => void
    let firstSignal!: AbortSignal
    vi.mocked(catalog.search).mockImplementation((request, signal) => {
      if (request.kind === 'work' && request.query === 'first') return new Promise(resolve => {
        firstSignal = signal
        finishFirst = () => resolve({ ...request, items: [{ ...catalogItems[2]!, label: '先发结果' }], totalCount: 1 })
      })
      if (request.kind === 'work' && request.query === 'last') return Promise.resolve({ ...request, items: [{ ...catalogItems[2]!, label: '最后结果' }], totalCount: 1 })
      return search(request, signal)
    })
    const data = fullProjection(), originalDrafts = structuredClone(data.branches.map(branch => branch.draft))
    const { renderer, onAction } = await mount(data, { catalog })
    const selected = nodeText(renderer.root.findByProps({ className: 'selected-resources' }))
    await click(renderer, '资源')
    await click(renderer, '作品')
    await change(renderer, '搜索资源', 'first')
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    await change(renderer, '搜索资源', 'last')
    expect(firstSignal.aborted).toBe(false)
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    expect(firstSignal.aborted).toBe(true)
    await act(async () => finishFirst())
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['最后结果'])
    expect(renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('last')
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
    await click(renderer, '作品')
    const calls = vi.mocked(catalog.search).mock.calls.length
    const saved = [...memory.entries()]
    await change(renderer, '搜索资源', '  glass  ')
    expect(vi.mocked(catalog.search).mock.calls).toHaveLength(calls)
    expect([...memory.entries()]).toEqual(saved)
    expect(renderer.root.findByProps({ className: 'catalog-search' }).findAllByType('button')[0]!.props.type).toBe('submit')
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    expect(catalog.search).toHaveBeenLastCalledWith({ kind: 'work', query: 'glass', page: 1, baseModelId: null, modelId: null }, expect.any(AbortSignal))
    expect(renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('glass')
    const submittedCalls = vi.mocked(catalog.search).mock.calls.length
    await change(renderer, '搜索资源', '')
    expect(vi.mocked(catalog.search).mock.calls).toHaveLength(submittedCalls)
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['花房作品'])
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    expect(catalog.search).toHaveBeenLastCalledWith({ kind: 'work', query: '', page: 1, baseModelId: null, modelId: null }, expect.any(AbortSignal))
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
    expect(renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe(query)
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
    expect(renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('  page draft  ')
    expect(catalog.search).toHaveBeenCalledWith(expect.objectContaining({ kind: 'model', query: '  page draft  ' }), expect.any(AbortSignal))
    await change(renderer, '搜索资源', '  direct entry draft  ')
    vi.mocked(catalog.search).mockClear()
    await click(renderer, '添加 LoRA')
    expect(renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('')
    expect(catalog.search).toHaveBeenCalledWith({ kind: 'lora', query: '', page: 1, baseModelId: '1', modelId: null }, expect.any(AbortSignal))
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
    await click(renderer, '作品')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['全部 花房作品'])
    expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(0)
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
      ['画师或画风', 'style', '110 柔光'], ['画师串', 'artist-string', '110 画师串'],
      ['Workflow 模板', 'comfyui-template', '110 文生图'],
    ] as const) {
      await click(renderer, label)
      expect(catalog.search).toHaveBeenCalledWith({ kind, query: '', page: 1, baseModelId: '1', modelId: '110' }, expect.any(AbortSignal))
      expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual([name])
      expect(nodeText(renderer.root.findByProps({ className: 'row between catalog-results-head' }))).toContain('1 项')
      expect(renderer.root.findByProps({ 'aria-label': '筛选生成模型' }).props.value).toBe('110')
    }
    expect(onAction).not.toHaveBeenCalled()
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    await act(() => renderer.unmount())
    const reopened = await mount(data, { catalog, storage })
    const current = reopened.renderer
    expect(current.root.findByProps({ 'aria-label': '筛选底模' }).props.value).toBe('1')
    expect(current.root.findByProps({ 'aria-label': '筛选生成模型' }).props.value).toBe('110')
    expect(current.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['110 文生图'])
    await change(current, '筛选底模', '2')
    expect(current.root.findByProps({ 'aria-label': '筛选生成模型' }).props.value).toBe('')
    expect(current.root.findByProps({ 'aria-label': '筛选生成模型' }).findAllByType('option').map(option => option.props.value)).toEqual(['', '201'])
    await change(current, '筛选生成模型', '201')
    await change(current, '搜索资源', 'none')
    await act(async () => current.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    expect(current.root.findAllByType('h3').map(nodeText)).toContain('没有匹配的资源')
    expect(current.root.findByProps({ 'aria-label': '筛选底模' }).props.value).toBe('2')
    expect(current.root.findByProps({ 'aria-label': '筛选生成模型' }).props.value).toBe('201')
    expect(current.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('none')
    await click(current, '清除筛选')
    expect(current.root.findByProps({ 'aria-label': '筛选底模' }).props.value).toBe('')
    expect(current.root.findByProps({ 'aria-label': '筛选生成模型' }).props.value).toBe('')
    expect(current.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('')
    expect(catalog.search).toHaveBeenCalledWith({ kind: 'comfyui-template', query: '', page: 1, baseModelId: null, modelId: null }, expect.any(AbortSignal))
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    expect(reopened.onAction).not.toHaveBeenCalled()
    await click(current, '作品')
    expect(catalog.search).toHaveBeenLastCalledWith({ kind: 'work', query: '', page: 1, baseModelId: null, modelId: null }, expect.any(AbortSignal))
  })

  it('ignores cancelled model-option and selected-model responses after newer filters', async () => {
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
    expect(pending.every(request => request.signal.aborted)).toBe(true)
    await act(async () => { for (const request of pending.splice(0)) await request.finish() })
    expect(renderer.root.findByProps({ 'aria-label': '筛选生成模型' }).findAllByType('option').map(option => option.props.value)).toEqual(['', '201'])
    delayOptions = false
    await change(renderer, '筛选底模', '1')
    await change(renderer, '筛选生成模型', '110')
    await change(renderer, '筛选生成模型', '101')
    expect(pending.every(request => request.signal.aborted)).toBe(true)
    await act(async () => { for (const request of pending.splice(0)) await request.finish() })
    expect(renderer.root.findByProps({ 'aria-label': '筛选生成模型' }).props.value).toBe('101')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual(['A 模型 101'])
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
      expect(renderer.root.findByProps({ 'aria-label': '筛选底模' }).props.value).toBe(baseModelId)
      expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual([name])
      expect(inspectorState()).toEqual(originalInspector)
      expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
      expect(onAction).not.toHaveBeenCalled()
    }
    await act(() => renderer.unmount())
    const reopened = await mount(data, { catalog, storage })
    expect(reopened.renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
    expect(reopened.renderer.root.findByProps({ 'aria-label': '筛选底模' }).props.value).toBe('2')
    expect(reopened.renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual([nameB])
    expect(catalog.search).toHaveBeenLastCalledWith({ kind, query: '', page: 1, baseModelId: '2', modelId: null }, expect.any(AbortSignal))
    expect(data.branches.map(branch => branch.draft)).toEqual(originalDrafts)
    expect(reopened.onAction).not.toHaveBeenCalled()
  })

  it('keeps base-model B results after the cancelled A request returns late', async () => {
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
    expect(signalA.aborted).toBe(true)
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual([nameB])
    await act(async () => finishA())
    expect(renderer.root.findByProps({ 'aria-label': '筛选底模' }).props.value).toBe('2')
    expect(renderer.root.findByProps({ className: 'catalog-grid' }).findAllByType('h3').map(nodeText)).toEqual([nameB])
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
      catalog: makeCatalog(), storage,
      workspaces: [{ id: 'workspace-a', name: '工作区 A', path: '/projects/a' }, { id: 'workspace-b', name: '工作区 B', path: '/projects/b' }],
      remote: { getProjection: async request => request.workspaceId === 'workspace-b' ? second : first, getEnvironment: async () => functionEnvironment, getInputDescription: async () => inputDescription },
    })
    await click(renderer, '资源')
    await click(renderer, '预览图片 模型')
    await click(renderer, '下一张图片')
    await change(renderer, '切换工作区', 'workspace-b')
    await click(renderer, '资源')
    await click(renderer, '作品')
    await click(renderer, '预览图片 花房作品')
    await click(renderer, '下一张图片')
    await change(renderer, '切换工作区', 'workspace-a')
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-gallery' }))).toContain('2 / 3')
    expect(renderer.root.findByProps({ className: 'catalog-gallery' }).findAllByType('h3').map(nodeText)).toEqual(['模型'])
    await change(renderer, '切换工作区', 'workspace-b')
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-gallery' }))).toContain('2 / 2')
    expect(renderer.root.findByProps({ className: 'catalog-gallery' }).findAllByType('h3').map(nodeText)).toEqual(['花房作品'])
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
    expect(renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('glass')
    expect(renderer.root.findByProps({ 'aria-label': '筛选底模' }).props.value).toBe('1')
    expect(renderer.root.findByProps({ 'aria-label': '筛选生成模型' }).props.value).toBe('11')
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
    expect(reopened.renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('glass')
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
      await host.remote.mutate({ ...scope, type: 'update-draft', field: 'lora-weight', id: '13', value: 0.35 }, signal)
      await host.remote.mutate({ ...scope, type: 'update-draft', field: 'lora-weight', id: '19', value: 0.8 }, signal)
      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'work', id: '14' } }, signal)
      const before = await host.remote.getProjection(scope, signal)
      const onAction = vi.fn((request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => host.remote.mutate(request, signal))
      const { renderer } = await mount(before, {
        workspaceId: scope.workspaceId,
        workspaces: [{ id: scope.workspaceId, name: '资源项目', path: '/workspace/project' }],
        remote: {
          getProjection: request => host.remote.getProjection(request, signal),
          getInputDescription: request => host.remote.getInputDescription(request, signal),
          previewModelChange: request => host.remote.previewModelChange(request, signal), getEnvironment: request => host.remote.getEnvironment(request, signal),
        },
        catalog: makeCatalog(), onAction,
      })
      await click(renderer, '资源')
      await click(renderer, 'LoRA')
      if (entry === 'details') await click(renderer, '查看详情 玻璃 LoRA')
      await click(renderer, '移除 玻璃 LoRA')
      const saved = (await host.remote.getProjection(scope, signal)).branches[0]!.draft
      expect(saved.generation_input.loras).toEqual([{ id: '19', file_name: 'rain.safetensors', weight: 0.8, trigger_words: ['rain'] }])
      expect(saved.base_model_id).toBe(before.branches[0]!.draft.base_model_id)
      expect(saved.generation_input.parameters).toEqual(before.branches[0]!.draft.generation_input.parameters)
      expect(saved.context_refs).toEqual(before.branches[0]!.draft.context_refs)
      expect(renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
      expect(renderer.root.findByProps({ 'aria-label': '选择 玻璃 LoRA' }).props['aria-pressed']).toBe(false)
      if (entry === 'details') expect(renderer.root.findByProps({ className: 'catalog-detail' })).toBeDefined()
      expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ ...scope, type: 'resource-remove', id: '13', value: 'lora' }))
      expect(renderer.root.findAllByProps({ className: 'picked-lora' })).toHaveLength(1)
      await click(renderer, '选择 玻璃 LoRA')
      expect(renderer.root.findByProps({ className: 'catalog-content' }).findByProps({ 'aria-label': '移除 玻璃 LoRA' }).props['aria-pressed']).toBe(true)
      expect(renderer.root.findAllByProps({ className: 'picked-lora' })).toHaveLength(2)
      expect((await host.remote.getProjection(scope, signal)).branches[0]!.draft.generation_input.loras).toEqual([
        { id: '19', file_name: 'rain.safetensors', weight: 0.8, trigger_words: ['rain'] },
        { id: '13', file_name: 'rain.safetensors', weight: 0.65, trigger_words: ['rain'] },
      ])
      await click(renderer, '移除 玻璃 LoRA')
      expect(renderer.root.findAllByProps({ className: 'picked-lora' })).toHaveLength(1)
      await click(renderer, '作品')
      if (entry === 'details') await click(renderer, '查看详情 花房作品')
      await click(renderer, '移除 花房作品')
      expect((await host.remote.getProjection(scope, signal)).branches[0]!.draft.context_refs).toEqual([])
      expect(renderer.root.findAllByProps({ className: 'context-item' })).toHaveLength(0)
      await click(renderer, '选择 花房作品')
      expect((await host.remote.getProjection(scope, signal)).branches[0]!.draft.context_refs).toEqual([{ kind: 'work', id: '14' }])
      expect(renderer.root.findAllByProps({ className: 'context-item' })).toHaveLength(1)
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
      expect(String(renderer.root.findByProps({ 'aria-label': '玻璃细节 权重' }).props.value)).toBe('0.35')
      expect(String(renderer.root.findByProps({ 'aria-label': '雨后光线 权重' }).props.value)).toBe('0.8')
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
    expect(String(renderer.root.findByProps({ 'aria-label': '玻璃细节 权重' }).props.value)).toBe('0.35')
    expect(String(renderer.root.findByProps({ 'aria-label': '雨后光线 权重' }).props.value)).toBe('0.8')
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
    const name = outcome === 'success' ? '雨后光线' : 'rain.safetensors'
    const summary = () => renderer.root.findByProps({ className: 'picked-lora' }).findAllByType('b').map(nodeText)
    expect(summary()).toEqual([name])
    expect(signalA.aborted).toBe(true)
    if (outcome === 'failure') expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('Catalog LoRA metadata returned HTTP 503.')
    await act(async () => finishA())
    expect(summary()).toEqual([name])
    expect(String(renderer.root.findByProps({ 'aria-label': `${name} 权重` }).props.value)).toBe('0.8')
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
      if (request.type === 'update-draft' && request.field === 'lora-weight')
        data.branches.find(branch => branch.branch_id === request.branchId)!.draft.generation_input.loras.find(item => item.id === request.id)!.weight = Number(request.value)
    })
    const { renderer } = await mount(data, { onAction, catalog: makeCatalog() })
    const shownWeight = () => {
      const input = renderer.root.findByProps({ 'aria-label': label })
      return String(input.props.value ?? input.props.defaultValue)
    }
    expect(shownWeight()).toBe('0.35')
    await click(renderer, '切换分支 暖光探索')
    expect(shownWeight()).toBe('0.8')
    await click(renderer, '切换分支 主分支')
    expect(shownWeight()).toBe('0.35')
    await click(renderer, '查看运行 r1')
    expect(shownWeight()).toBe('0.65')
    await click(renderer, '编辑任务输入')
    expect(shownWeight()).toBe('0.35')
    expect(onAction).not.toHaveBeenCalled()
    await change(renderer, label, '0.45')
    await blur(renderer, label, '0.45')
    expect(shownWeight()).toBe('0.45')
    expect(data.branches[0]!.draft).toEqual({ ...originalDrafts[0], generation_input: { ...originalDrafts[0]!.generation_input, loras: [{ ...originalDrafts[0]!.generation_input.loras[0]!, weight: 0.45 }] } })
    expect(data.branches[1]!.draft).toEqual(originalDrafts[1])
    expect(data.runs[0]).toEqual(originalRun)
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it.each(['failure', 'pending'] as const)('ends a removed LoRA editor before readding the same ID after a %s save', async mode => {
    const data = fullProjection(), label = '玻璃 LoRA 权重'
    data.runs = []
    const lora = { ...data.branches[0]!.draft.generation_input.loras[0]!, weight: 0.5 }
    data.branches[0]!.draft.generation_input.loras = [structuredClone(lora)]
    let releaseWrite!: () => void, wroteValue!: () => void
    const pendingWrite = new Promise<void>(resolve => { releaseWrite = resolve })
    const savedValue = new Promise<void>(resolve => { wroteValue = resolve })
    const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
      const input = data.branches[0]!.draft.generation_input
      if (request.type === 'resource-remove') input.loras = []
      if (request.type === 'resource-select') input.loras = [structuredClone(lora)]
      if (request.type === 'update-draft' && request.field === 'lora-weight') {
        if (mode === 'failure') throw Error('LoRA weight storage returned HTTP 503.')
        input.loras[0]!.weight = Number(request.value)
        wroteValue()
        await pendingWrite
      }
    })
    try {
      const { renderer } = await mount(data, { onAction, catalog: makeCatalog() })
      await change(renderer, label, '0.6')
      await blur(renderer, label, '0.6')
      if (mode === 'pending') {
        await savedValue
        await change(renderer, label, '0.7')
        await blur(renderer, label, '0.7')
      } else expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('LoRA weight storage returned HTTP 503.')
      await click(renderer, '移除 玻璃 LoRA')
      expect(renderer.root.findAllByProps({ className: 'picked-lora' })).toHaveLength(0)
      await click(renderer, '添加 LoRA')
      await click(renderer, '选择 玻璃 LoRA')
      await act(async () => releaseWrite())
      const input = renderer.root.findByProps({ 'aria-label': label })
      expect(String(input.props.value ?? input.props.defaultValue)).toBe('0.5')
      expect(data.branches[0]!.draft.generation_input.loras).toEqual([lora])
      expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'update-draft', field: 'lora-weight', value: 0.7 }))
    } finally { releaseWrite() }
  })

  it('saves a numeric weight across refresh and removes only the draft while preserving the accepted Run input', async () => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const { parseCliGenerationRequest, toGenerationRequest } = await import('../../src/cli/contract.ts')
    const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
    try {
      const created = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'LoRA 草稿', goal: '保留运行输入' } }, signal)
      const scope = { workspaceId: created.workspaceId, workId: created.workId!, branchId: created.branchId! }
      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      await host.remote.mutate({ ...scope, type: 'update-draft', field: 'instance_id', value: '8' }, signal)
      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal)
      await host.remote.mutate({ ...scope, type: 'update-draft', field: 'positive_prompt', value: 'rain on glass' }, signal)
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
        remote: { previewModelChange: request => host.remote.previewModelChange(request, signal), getEnvironment: request => host.remote.getEnvironment(request, signal), getInputDescription: request => host.remote.getInputDescription(request, signal), getProjection: request => host.remote.getProjection(request, signal) },
        onAction: request => host.remote.mutate(request, signal),
      }
      const { renderer } = await mount(await host.remote.getProjection(scope, signal), options)
      await click(renderer, '添加 LoRA')
      await click(renderer, '查看详情 玻璃 LoRA')
      const shownDetails = renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('dd').map(nodeText)
      expect(shownDetails).toContain('rain.safetensors')
      expect(shownDetails).toContain('rain')
      await click(renderer, '选择 玻璃 LoRA')
      expect(host.store.getBranch(scope.branchId).draft.generation_input.loras).toEqual([{ id: '13', file_name: 'rain.safetensors', weight: 0.65, trigger_words: ['rain'] }])
      await click(renderer, '运行任务')
      const task = (await host.remote.getProjection(scope, signal)).tasks[0]!
      const accepted = await host.runtime.acceptGenerations({ workspaceId: scope.workspaceId, sessionId: task.session_id!, turn: 1, callId: 'lora-history' }, [{ requestId: crypto.randomUUID(), request: toGenerationRequest(parseCliGenerationRequest(task.input.generation_input)) }], signal, task.task_id)
      const runId = accepted.items[0]!.runId
      await blur(renderer, '玻璃 LoRA 权重', '0.35')
      const saved = await host.remote.getProjection(scope, signal)
      expect(saved.branches[0]!.draft.generation_input.loras[0]!.weight).toBe(0.35)
      const fixedRun = saved.runs.find(run => run.run_id === runId)!
      expect(fixedRun.generation_input.loras[0]!.weight).toBe(0.65)
      await act(() => renderer.unmount())
      const reopened = await mount(saved, options)
      const weight = reopened.renderer.root.findByProps({ 'aria-label': '玻璃 LoRA 权重' })
      expect(String(weight.props.value ?? weight.props.defaultValue)).toBe('0.35')
      await click(reopened.renderer, '移除 玻璃 LoRA')
      const removed = await host.remote.getProjection(scope, signal)
      expect(removed.branches[0]!.draft).toEqual(before)
      expect(removed.runs.find(run => run.run_id === runId)).toEqual(fixedRun)
      expect(reopened.renderer.root.findAllByProps({ className: 'picked-lora' })).toHaveLength(0)
      await click(reopened.renderer, '运行结果')
      await click(reopened.renderer, `查看运行 ${runId}`)
      const historicalWeight = reopened.renderer.root.findByProps({ 'aria-label': '玻璃 LoRA 权重' })
      expect(String(historicalWeight.props.value ?? historicalWeight.props.defaultValue)).toBe('0.65')
      await click(reopened.renderer, '编辑任务输入')
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

  it('loads B defaults and actual parameter IDs while an A field save is still pending through the public Host', async () => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
    const descriptions = { '43': templateDescription('a', 24), '41': templateDescription('b', 48) }
    let holdA = false, releaseA!: (value: typeof inputDescription) => void, savingA!: () => void
    const pendingA = new Promise<typeof inputDescription>(resolve => { releaseA = resolve })
    const startedA = new Promise<void>(resolve => { savingA = resolve })
    host.inspect.mockImplementation(async (...args: unknown[]) => {
      const request = args[0] as { templateId: '43' | '41' }
      if (holdA && request.templateId === '43') { savingA(); return pendingA }
      return structuredClone(descriptions[request.templateId])
    })
    try {
      const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '模板参数', goal: '切换模板输入' } }, signal)
      const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      await host.remote.mutate({ ...scope, type: 'update-draft', field: 'instance_id', value: '8' }, signal)
      await host.remote.mutate({ ...scope, type: 'update-draft', field: 'positive_prompt', value: 'glass house' }, signal)
      await host.remote.mutate({ ...scope, type: 'update-draft', field: 'negative_prompt', value: 'blur' }, signal)
      const environment = await host.remote.getEnvironment({}, signal)
      const { renderer } = await mount(await host.remote.getProjection(scope, signal), {
        catalog: templateCatalog(), workspaceId: scope.workspaceId, workspaces: environment.workspaces,
        remote: { previewModelChange: request => host.remote.previewModelChange(request, signal), getEnvironment: request => host.remote.getEnvironment(request, signal), getInputDescription: request => host.remote.getInputDescription(request, signal), getProjection: request => host.remote.getProjection(request, signal) },
        onAction: request => host.remote.mutate(request, signal),
      })
      await click(renderer, '选择 Workflow 模板')
      await click(renderer, '选择 模板 A')
      expect(renderer.root.findByProps({ 'aria-label': '采样步数' }).props.value).toBe('24')
      await change(renderer, '引导强度', '7.5')
      await act(async () => renderer.root.findByProps({ 'aria-label': '引导强度' }).props.onBlur({ target: { value: '7.5' } }))
      expect(host.store.getBranch(scope.branchId).draft.generation_input.parameters.cfg_a).toBe(7.5)
      holdA = true
      await change(renderer, '采样步数', '37')
      await act(async () => renderer.root.findByProps({ 'aria-label': '采样步数' }).props.onBlur({ target: { value: '37' } }))
      await startedA
      await click(renderer, '选择 模板 B')
      const displayedB = renderer.root.findByProps({ 'aria-label': '采样步数' }).props.value
      await act(async () => releaseA(descriptions['43']))
      const saved = host.store.getBranch(scope.branchId).draft
      expect(saved.generation_input.template_id).toBe('41')
      expect(saved.generation_input.parameters).toEqual(Object.fromEntries(descriptions['41'].parameters.map(parameter => [parameter.parameter_id, parameter.current_value])))
      expect(saved.prompt_input).toEqual({ positive_prompt: 'glass house', negative_prompt: 'blur' })
      expect(templateSummary(renderer)).toEqual(['模板 B'])
      expect(displayedB).toBe('48')
      expect(renderer.root.findByProps({ 'aria-label': '采样步数' }).props.value).toBe('48')
      await change(renderer, '采样步数', '53')
      await act(async () => renderer.root.findByProps({ 'aria-label': '采样步数' }).props.onBlur({ target: { value: '53' } }))
      const editedB = host.store.getBranch(scope.branchId).draft
      expect(editedB.generation_input.parameters).toEqual({ ...saved.generation_input.parameters, steps_b: 53 })
      expect(editedB.prompt_input).toEqual(saved.prompt_input)
      holdA = false
      await click(renderer, '选择 模板 A')
      expect(host.store.getBranch(scope.branchId).draft.generation_input.parameters.steps_a).toBe(24)
      expect(renderer.root.findByProps({ 'aria-label': '采样步数' }).props.value).toBe('24')
      await act(() => renderer.unmount())
    } finally { releaseA(descriptions['43']); await host.dispose() }
  })

  it.each(['B', 'A'] as const)('does not send an A autosave queued behind a completed write after switching to %s', async target => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
    const a = templateDescription('a', 24), b = templateDescription('b', 48)
    host.inspect.mockImplementation(async (...args: unknown[]) => structuredClone((args[0] as { templateId: string }).templateId === '43' ? a : b))
    let releaseWrite!: () => void, wroteA!: () => void
    const delayedResponse = new Promise<void>(resolve => { releaseWrite = resolve })
    const savedA = new Promise<void>(resolve => { wroteA = resolve })
    try {
      const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '参数队列', goal: '切换模板后结束原参数保存' } }, signal)
      const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      await host.remote.mutate({ ...scope, type: 'update-draft', field: 'instance_id', value: '8' }, signal)
      const environment = await host.remote.getEnvironment({}, signal)
      const onAction = vi.fn(async (request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => {
        const result = await host.remote.mutate(request, signal)
        if (request.type === 'update-draft' && request.field === 'steps' && request.value === 31) { wroteA(); await delayedResponse }
        return result
      })
      const { renderer } = await mount(await host.remote.getProjection(scope, signal), {
        catalog: templateCatalog(), workspaceId: scope.workspaceId, workspaces: environment.workspaces, onAction,
        remote: { previewModelChange: request => host.remote.previewModelChange(request, signal), getEnvironment: request => host.remote.getEnvironment(request, signal), getInputDescription: request => host.remote.getInputDescription(request, signal), getProjection: request => host.remote.getProjection(request, signal) },
      })
      await click(renderer, '选择 Workflow 模板')
      await click(renderer, '选择 模板 A')
      await change(renderer, '采样步数', '31')
      await act(async () => renderer.root.findByProps({ 'aria-label': '采样步数' }).props.onBlur({ target: { value: '31' } }))
      await savedA
      expect(host.store.getBranch(scope.branchId).draft.generation_input.parameters.steps_a).toBe(31)
      await change(renderer, '采样步数', '32')
      await act(async () => renderer.root.findByProps({ 'aria-label': '采样步数' }).props.onBlur({ target: { value: '32' } }))
      await click(renderer, '选择 模板 B')
      if (target === 'A') await click(renderer, '选择 模板 A')
      await act(async () => releaseWrite())
      const expected = target === 'A' ? a : b
      expect(host.store.getBranch(scope.branchId).draft.generation_input.parameters).toEqual(Object.fromEntries(expected.parameters.map(parameter => [parameter.parameter_id, parameter.current_value])))
      expect(renderer.root.findByProps({ 'aria-label': '采样步数' }).props.value).toBe(target === 'A' ? '24' : '48')
      expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'update-draft', field: 'steps', value: 32 }))
      await act(() => renderer.unmount())
    } finally { releaseWrite(); await host.dispose() }
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
      await host.remote.mutate({ ...scope, type: 'update-draft', field: 'instance_id', value: '8' }, signal)
      await host.remote.mutate({ ...scope, type: 'update-draft', field: 'positive_prompt', value: 'shared prompt' }, signal)
      const environment = await host.remote.getEnvironment({}, signal)
      const onAction = vi.fn((request: Parameters<ExperimentWorkbenchProps['onAction']>[0]) => host.remote.mutate(request, signal))
      const options: NonNullable<Parameters<typeof mount>[1]> = {
        catalog: templateCatalog(), workspaceId: scope.workspaceId, workspaces: environment.workspaces, onAction,
        remote: {
          previewModelChange: request => host.remote.previewModelChange(request, signal), getEnvironment: request => host.remote.getEnvironment(request, signal), getProjection: request => host.remote.getProjection(request, signal),
          getInputDescription: async request => {
            const description = await host.remote.getInputDescription(request, signal)
            if (waitForB && host.store.getBranch(request.branchId).draft.generation_input.template_id === '41')
              return new Promise<typeof description>(resolve => { releaseB = () => resolve(description) })
            return description
          },
        },
      }
      const { renderer } = await mount(await host.remote.getProjection(scope, signal), options)
      await click(renderer, '选择 Workflow 模板')
      await click(renderer, '选择 模板 A')
      await click(renderer, '选择 模板 B')
      const labels = ['参考图路径', '采样步数', '引导强度', 'Seed', '画面尺寸']
      const disabledWhileLoading = labels.map(label => renderer.root.findByProps({ 'aria-label': label }).props.disabled)
      waitForB = false
      await act(async () => releaseB())
      const expectedParameters = Object.fromEntries(b.parameters.map(parameter => [parameter.parameter_id, parameter.current_value]))
      expect(host.store.getBranch(scope.branchId).draft.generation_input.parameters).toEqual(expectedParameters)
      expect(renderer.root.findByProps({ 'aria-label': 'Seed' }).props.value).toBe('0')
      expect(renderer.root.findByProps({ 'aria-label': 'Seed' }).props.disabled).not.toBe(true)
      for (const label of ['参考图路径', '采样步数', '引导强度', '画面尺寸']) {
        const input = renderer.root.findByProps({ 'aria-label': label })
        expect(input.props.value).toBe('')
        expect(input.props.disabled).toBe(true)
      }
      expect(disabledWhileLoading).toEqual(labels.map(() => true))
      expect(renderer.root.findByProps({ 'aria-label': '正向提示词' }).props.value).toBe('shared prompt')
      expect(onAction).toHaveBeenCalledTimes(2)
      await act(() => renderer.unmount())
      const reopened = await mount(await host.remote.getProjection(scope, signal), options)
      expect(reopened.renderer.root.findByProps({ 'aria-label': '采样步数' }).props.disabled).toBe(true)
      expect(reopened.renderer.root.findByProps({ 'aria-label': 'Seed' }).props.value).toBe('0')
      expect(host.store.getBranch(scope.branchId).draft.generation_input.parameters).toEqual(expectedParameters)
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
        remote: { previewModelChange: request => host.remote.previewModelChange(request, signal), getEnvironment: request => host.remote.getEnvironment(request, signal), getInputDescription: request => host.remote.getInputDescription(request, signal), getProjection: request => host.remote.getProjection(request, signal) },
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
      expect(host.store.getBranch(scope.branchId).draft.generation_input.template_id).toBe('41')
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
    expect(templateSummary(renderer)).toEqual([''])
    expect(data.branches[0]!.draft).toEqual(expectedDraft)
    expect(renderer.root.findByProps({ 'aria-label': '正向提示词' }).props.value).toBe(expectedDraft.prompt_input.positive_prompt)
    await act(async () => finishA())
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toBe(toast)
    expect(templateSummary(renderer)).toEqual([''])
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

describe('experiment workbench generation model change confirmation', () => {
  const preview = {
    model: { id: '21', label: 'ANIMA3' },
    removed: [
      { kind: 'comfyui-template' as const, id: '12', label: 'SDXL 文生图' },
      { kind: 'lora' as const, id: '13', label: '柔光 LoRA' },
      { kind: 'lora' as const, id: '19', label: '线条 LoRA' },
      { kind: 'style' as const, id: '27', label: '透明水彩' },
      { kind: 'artist-string' as const, id: '28', label: '花园插画组合' },
    ],
  }
  const modelCatalog = (): CatalogApi => ({
    baseModels: vi.fn(async () => ({ items: [{ id: '1', label: 'SDXL' }] })),
    search: vi.fn(async request => ({
      ...request, totalCount: 1,
      items: [{ context: { kind: 'model' as const, id: '21', file_name: 'anima.safetensors' }, baseModelId: '1', modelId: null, label: 'ANIMA3', subtitle: '', coverUrl: null, sampleImageUrls: [] }],
    })),
    details: makeCatalog().details,
  })
  const openChoice = async (renderer: Awaited<ReturnType<typeof mount>>['renderer']) => {
    await click(renderer, '更换生成模型')
    await click(renderer, '选择 ANIMA3')
  }

  it('confirms only the previewed resource IDs once and stays on Catalog after saving', async () => {
    let finish!: () => void
    const onAction = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const { renderer } = await mount(fullProjection(), { catalog: modelCatalog(), onAction, remote: { previewModelChange: async () => preview } })
    await openChoice(renderer)
    const submit = renderer.root.findByProps({ role: 'dialog' }).findAllByType('form')[0]!.props.onSubmit
    await act(async () => { void submit({ preventDefault() {} }) })
    await act(async () => { void submit({ preventDefault() {} }) })
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith({
      type: 'resource-select', workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root', runId: 'r1', id: '21',
      value: { kind: 'model', id: '21', confirmedRemovals: [{ kind: 'comfyui-template', id: '12' }, { kind: 'lora', id: '13' }, { kind: 'lora', id: '19' }, { kind: 'style', id: '27' }, { kind: 'artist-string', id: '28' }] },
    })
    expect(renderer.root.findByProps({ role: 'dialog' }).findByProps({ type: 'submit' }).props.disabled).toBe(true)
    await act(async () => { finish() })
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toEqual([])
    expect(renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
  })

  it('persists confirmed incompatible resources through the actual Host and retains latest unrelated input', async () => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
    try {
      const selected = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '模型确认', goal: '保留兼容资源' } }, signal)
      const scope = { workspaceId: selected.workspaceId, workId: selected.workId!, branchId: selected.branchId! }
      const sourceDetails = host.catalog.details.getMockImplementation()!
      host.catalog.details.mockImplementation(async (ref, requestSignal) => {
        const details = await sourceDetails(ref, requestSignal)
        const item = ref as { kind: string; id: string }
        return { ...details, item: { ...details.item, modelId: ['comfyui-template', 'style', 'artist-string'].includes(item.kind) || item.kind === 'lora' && item.id === '3' ? '2' : null } }
      })
      for (const value of [{ kind: 'model', id: '2' }, { kind: 'comfyui-template', id: '5' }, { kind: 'lora', id: '3' }, { kind: 'lora', id: '4' }, { kind: 'style', id: '7' }, { kind: 'artist-string', id: '8' }, { kind: 'character', id: '9' }, { kind: 'prompt-term', id: '10' }]) {
        await host.remote.mutate({ ...scope, type: 'resource-select', value }, signal)
      }
      await host.remote.mutate({ ...scope, type: 'update-draft', field: 'instance_id', value: '8' }, signal)
      await host.remote.mutate({ ...scope, type: 'update-draft', field: 'positive_prompt', value: 'before preview' }, signal)
      const data = await host.remote.getProjection(scope, signal), before = structuredClone(data.branches[0]!.draft)
      host.catalog.resolveGenerationModel.mockImplementation(async id => ({ id, file_name: 'ANIMA3', base_model_id: '1' }))
      host.catalog.search.mockImplementation(async input => ({ kind: input.kind, query: input.query, page: input.page, totalCount: input.kind === 'lora' ? 1 : 0, items: input.kind === 'lora' ? [{ context: { kind: 'lora', id: '4', file_name: 'rain.safetensors' }, baseModelId: '1', modelId: null, label: 'rain.safetensors', subtitle: '', coverUrl: null, sampleImageUrls: [] }] : [] }))
      const details = host.catalog.details.getMockImplementation()!
      host.catalog.details.mockImplementation(async (ref, requestSignal) => {
        const result = await details(ref, requestSignal), kind = (ref as { kind: string }).kind
        return kind === 'style' || kind === 'artist-string'
          ? { ...result, item: { ...result.item, label: kind === 'style' ? '透明水彩' : '花园插画组合' } }
          : result
      })
      const onAction = vi.fn(request => host.remote.mutate(request, signal))
      const { renderer } = await mount(data, {
        catalog: modelCatalog(), workspaceId: scope.workspaceId, workspaces: [{ id: scope.workspaceId, name: '画面实验', path: '/workspace/project' }],
        remote: {
          previewModelChange: request => host.remote.previewModelChange(request, signal),
          getProjection: request => host.remote.getProjection(request, signal),
          getInputDescription: request => host.remote.getInputDescription(request, signal),
        },
        onAction,
      })
      await openChoice(renderer)
      expect(renderer.root.findByProps({ className: 'incompatible-resources' }).findAllByType('li').map(nodeText)).toEqual(['Rain templateWorkflow 模板', 'rain.safetensorsLoRA', '透明水彩画师或画风', '花园插画组合画师串'])
      await click(renderer, '取消')
      expect((await host.remote.getProjection(scope, signal)).branches[0]!.draft).toEqual(before)
      expect(onAction).not.toHaveBeenCalled()
      await openChoice(renderer)
      await host.remote.mutate({ ...scope, type: 'update-draft', field: 'positive_prompt', value: 'latest prompt' }, signal)
      await host.remote.mutate({ ...scope, type: 'update-draft', field: 'lora-weight', id: '4', value: 1.2 }, signal)
      await act(() => renderer.root.findByProps({ role: 'dialog' }).findAllByType('form')[0]!.props.onSubmit({ preventDefault() {} }))
      const after = await host.remote.getProjection(scope, signal)
      expect(after.branches[0]!.draft).toEqual({
        ...before,
        prompt_input: { ...before.prompt_input, positive_prompt: 'latest prompt' },
        generation_input: { ...before.generation_input, model: { id: '21', file_name: 'ANIMA3' }, template_id: null, parameters: {}, loras: [{ id: '4', file_name: 'rain.safetensors', weight: 1.2, trigger_words: ['rain'] }] },
        context_refs: [{ kind: 'character', id: '9' }, { kind: 'prompt-term', id: '10' }],
      })
      expect(after.functions).toEqual(data.functions)
      expect(after.tasks).toEqual(data.tasks)
      expect(after.runs).toEqual(data.runs)
      expect(onAction).toHaveBeenCalledTimes(1)
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toEqual([])
      expect(renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
    } finally { await host.dispose() }
  })

  it('keeps the confirmation open after a save failure and retries the same removal list', async () => {
    const onAction = vi.fn().mockRejectedValueOnce(new Error('草稿已更新，请重新选择生成模型。')).mockResolvedValueOnce(undefined)
    const { renderer } = await mount(fullProjection(), { catalog: modelCatalog(), onAction, remote: { previewModelChange: async () => preview } })
    await openChoice(renderer)
    const submit = () => renderer.root.findByProps({ role: 'dialog' }).findAllByType('form')[0]!.props.onSubmit({ preventDefault() {} })
    await act(submit)
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toBe('草稿已更新，请重新选择生成模型。')
    expect(renderer.root.findByProps({ role: 'dialog' }).findByProps({ type: 'submit' }).props.disabled).toBe(false)
    expect(renderer.root.findByProps({ className: 'incompatible-resources' }).findAllByType('li').map(nodeText)).toEqual(['SDXL 文生图Workflow 模板', '柔光 LoRALoRA', '线条 LoRALoRA', '透明水彩画师或画风', '花园插画组合画师串'])
    await act(submit)
    expect(onAction).toHaveBeenCalledTimes(2)
    expect(onAction.mock.calls[1]).toEqual(onAction.mock.calls[0])
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toEqual([])
    expect(renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
  })

  it('shows actionable preview errors without saving or opening a confirmation', async () => {
    const { renderer, onAction } = await mount(fullProjection(), { catalog: modelCatalog(), remote: {
      previewModelChange: async () => { throw new Error('模型读取失败，请重新选择生成模型。') },
    } })
    await openChoice(renderer)
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toEqual([])
    expect(nodeText(renderer.root.findByProps({ role: 'alert' }))).toBe('模型读取失败，请重新选择生成模型。')
    expect(onAction).not.toHaveBeenCalled()
  })

  it.each(['branch', 'work', 'workspace', 'page', 'detail', 'Escape', 'new-modal', 'unmount'] as const)('ignores a late preview after %s changes the selection', async destination => {
    const data = fullProjection()
    data.works.push({ ...data.works[0]!, work_id: 'work-b', name: '另一工作' })
    let finish!: (value: typeof preview) => void
    const { renderer, onAction } = await mount(data, { catalog: modelCatalog(), remote: {
      previewModelChange: () => new Promise(resolve => { finish = resolve }),
    } })
    await openChoice(renderer)
    if (destination === 'branch') await click(renderer, '切换分支 暖光探索')
    else if (destination === 'work') await change(renderer, '切换工作', 'work-b')
    else if (destination === 'workspace') await change(renderer, '切换工作区', 'workspace-b')
    else if (destination === 'page') await click(renderer, '任务')
    else if (destination === 'detail') await click(renderer, '查看详情 ANIMA3')
    else if (destination === 'Escape') await act(() => { document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' })) })
    else if (destination === 'new-modal') await click(renderer, '新建工作')
    else await act(() => renderer.unmount())
    await act(async () => { finish(preview) })
    if (destination !== 'unmount') expect(renderer.root.findAllByProps({ role: 'dialog', 'aria-labelledby': 'modal-title' })).toEqual([])
    expect(onAction).not.toHaveBeenCalled()
  })

  it('ignores a superseded no-removal preview while the current confirmation is open', async () => {
    let finish!: (value: WorkbenchModelChangePreview) => void
    const previewModelChange = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValueOnce(preview)
    const { renderer, onAction } = await mount(fullProjection(), { catalog: modelCatalog(), remote: { previewModelChange } })
    await openChoice(renderer)
    await openChoice(renderer)
    expect(renderer.root.findByProps({ id: 'modal-title' }).children).toEqual(['更换生成模型'])
    await act(async () => { finish({ model: preview.model, removed: [] }) })
    expect(renderer.root.findByProps({ id: 'modal-title' }).children).toEqual(['更换生成模型'])
    expect(onAction).not.toHaveBeenCalled()
  })

  it('ignores a late no-removal preview after leaving the Catalog page', async () => {
    let finish!: (value: WorkbenchModelChangePreview) => void
    const { renderer, onAction } = await mount(fullProjection(), { catalog: modelCatalog(), remote: { previewModelChange: () => new Promise(resolve => { finish = resolve }) } })
    await openChoice(renderer)
    await click(renderer, '任务')
    await act(async () => { finish({ model: preview.model, removed: [] }) })
    expect(onAction).not.toHaveBeenCalled()
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toEqual([])
    expect(renderer.root.findByProps({ 'aria-label': '任务' }).props.className).toBe('active')
  })

  it('keeps a reopened confirmation when an earlier cancelled submission completes', async () => {
    let finish!: () => void
    const onAction = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve })).mockResolvedValueOnce(undefined)
    const { renderer } = await mount(fullProjection(), { catalog: modelCatalog(), onAction, remote: { previewModelChange: async () => preview } })
    await openChoice(renderer)
    await act(async () => { void renderer.root.findByProps({ id: 'modal-form' }).props.onSubmit({ preventDefault() {} }) })
    await click(renderer, '取消')
    await openChoice(renderer)
    const reopened = renderer.root.findByProps({ id: 'modal-form' })
    await act(async () => { finish() })
    expect(renderer.root.findByProps({ id: 'modal-form' })).toBe(reopened)
    expect(reopened.findByProps({ type: 'submit' }).props.disabled).toBe(false)
    expect(renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
    await act(() => reopened.props.onSubmit({ preventDefault() {} }))
    expect(onAction).toHaveBeenCalledTimes(2)
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toEqual([])
  })

  it('applies the model immediately when the preview has no removals', async () => {
    const previewModelChange = vi.fn(async () => ({ model: preview.model, removed: [] }))
    const { renderer, onAction } = await mount(fullProjection(), { catalog: modelCatalog(), remote: { previewModelChange } })
    await openChoice(renderer)
    expect(previewModelChange).toHaveBeenCalledTimes(1)
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toEqual([])
    expect(onAction).toHaveBeenCalledWith({
      type: 'resource-select', workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root', runId: 'r1', id: '21',
      value: { kind: 'model', id: '21' },
    })
    expect(renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
  })

  it('previews the exact ordered removal list and keeps the draft unchanged on cancel, close and Escape', async () => {
    const data = fullProjection(), before = structuredClone(data)
    const previewModelChange = vi.fn(async () => preview)
    const { renderer, onAction } = await mount(data, { catalog: modelCatalog(), remote: { previewModelChange } })
    for (const dismissal of ['取消', '关闭对话框', 'Escape']) {
      await openChoice(renderer)
      expect(previewModelChange).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root', modelId: '21' })
      const modal = renderer.root.findByProps({ role: 'dialog', 'aria-labelledby': 'modal-title' })
      expect(modal.findAllByType('p').map(nodeText)).toEqual(['更换为 ANIMA3 后，将移除以下不兼容的资源：'])
      expect(modal.findByProps({ className: 'incompatible-resources' }).findAllByType('li').map(nodeText)).toEqual(['SDXL 文生图Workflow 模板', '柔光 LoRALoRA', '线条 LoRALoRA', '透明水彩画师或画风', '花园插画组合画师串'])
      expect(modal.findAllByType('input')).toEqual([])
      expect(onAction).not.toHaveBeenCalled()
      if (dismissal === 'Escape') await act(() => { document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' })) })
      else await click(renderer, dismissal)
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toEqual([])
      expect(data).toEqual(before)
      expect(onAction).not.toHaveBeenCalled()
    }
  })
})

describe('experiment workbench generation model selection', () => {
  it('persists a compatible model and its summary while preserving sibling inputs and the run Agent model', async () => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture()
    const signal = new AbortController().signal
    const records = [
      { id: '9', file_name: 'anima-preview3-base.safetensors', base_model_id: '1' },
      { id: '16', file_name: 'miaomiaoHarem_anima16.safetensors', base_model_id: '1' },
    ]
    const items: CatalogItem[] = records.map(record => ({
      context: { kind: 'model', id: record.id, file_name: record.file_name }, baseModelId: record.base_model_id, modelId: null,
      label: record.file_name, subtitle: '', coverUrl: null, sampleImageUrls: [],
    }))
    const catalog: CatalogApi = {
      baseModels: vi.fn(async () => ({ items: [{ id: '1', label: 'anima' }] })),
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
        context_refs: [{ kind: 'character' as const, id: '4' }],
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
        baseModels: [{ id: '1', label: 'anima' }],
        agentModelGroups: [{ id: run.agent_model.provider, name: '提供商 A', models: [{ id: run.agent_model.model, name: 'Agent 模型 A' }] }],
        remote: { previewModelChange: request => host.remote.previewModelChange(request, signal), getEnvironment: request => host.remote.getEnvironment(request, signal), getInputDescription: request => host.remote.getInputDescription(request, signal), getProjection: request => host.remote.getProjection(request, signal) },
        onAction: request => host.remote.mutate(request, signal),
      }
      const data = await host.remote.getProjection(scope, signal)
      const { renderer } = await mount(data, options)
      await click(renderer, '更换生成模型')
      await click(renderer, '选择 miaomiaoHarem_anima16.safetensors')
      expect(renderer.root.findByProps({ 'aria-label': '资源' }).props.className).toBe('active')
      const picked = renderer.root.findByProps({ className: 'selected-resources' }).findAllByProps({ className: 'picked-item' })[0]!
      expect(picked.findAllByType('b').map(nodeText)).toEqual([records[1]!.file_name])
      expect(picked.findAllByType('span').map(nodeText)).toEqual(['生成模型 · anima'])
      const expected = { ...before, draft: { ...seeded, generation_input: { ...seeded.generation_input, model: { id: '16', file_name: records[1]!.file_name } } } }
      expect(host.store.getBranch(scope.branchId)).toEqual(expected)
      expect(host.store.listFunctionBindings(scope.workspaceId)).toEqual(bindingsBefore)
      await click(renderer, '返回结果')
      expect(renderer.root.findByProps({ 'aria-label': '运行结果' }).props.className).toBe('active')
      await act(() => renderer.unmount())
      const reopened = await mount(data, options)
      const restored = reopened.renderer.root.findByProps({ className: 'selected-resources' }).findAllByProps({ className: 'picked-item' })[0]!
      expect(restored.findAllByType('b').map(nodeText)).toEqual([records[1]!.file_name])
      expect(restored.findAllByType('span').map(nodeText)).toEqual(['生成模型 · anima'])
      await click(reopened.renderer, '配置中心')
      await click(reopened.renderer, `编辑${run.name}`)
      expect(reopened.renderer.root.findByProps({ 'aria-label': 'Agent 提供商' }).props.value).toBe(run.agent_model.provider)
      expect(reopened.renderer.root.findByProps({ 'aria-label': 'Agent 模型' }).props.value).toBe(run.agent_model.model)
      expect(host.store.listFunctionBindings(scope.workspaceId)).toEqual(bindingsBefore)
      expect(host.store.getBranch(scope.branchId)).toEqual(expected)
      const projection = await host.remote.getProjection(scope, signal)
      expect(projection.tasks).toEqual([])
      expect(projection.runs).toEqual([])
      await act(() => reopened.renderer.unmount())
    } finally { await host.dispose() }
  })

  it('opens model replacement with the current branch base and clears the previous model filter', async () => {
    const { catalog } = modelFilterCatalog(), data = fullProjection()
    data.branches[0]!.draft.base_model_id = '1'
    const { renderer } = await mount(data, { catalog })
    await click(renderer, '资源')
    await change(renderer, '筛选底模', '2')
    await change(renderer, '筛选生成模型', '201')
    await click(renderer, '更换生成模型')
    expect(renderer.root.findByProps({ 'aria-label': '筛选底模' }).props.value).toBe('1')
    expect(renderer.root.findByProps({ 'aria-label': '筛选生成模型' }).props.value).toBe('')
    expect(catalog.search).toHaveBeenCalledWith({ kind: 'model', query: '', page: 1, baseModelId: '1', modelId: null }, expect.any(AbortSignal))
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
    let element = scrollElement(1400)
    const { renderer } = await mount(fullProjection(), { catalog }, { createNodeMock: node => node.props.className === 'catalog-content' ? element : null })
    await click(renderer, '资源')
    await click(renderer, '画师或画风')
    await click(renderer, '查看详情 柔光')
    element.scrollTop = 142
    await act(() => renderer.root.findByProps({ className: 'catalog-content' }).props.onScroll({ currentTarget: element }))
    await click(renderer, '任务')
    vi.mocked(catalog.baseModels).mockRejectedValueOnce(new Error('底模不可用'))
    element = scrollElement(1400)
    await click(renderer, '资源')
    expect(catalog.baseModels).toHaveBeenCalledTimes(2)
    expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(0)
    const detail = renderer.root.findByProps({ className: 'catalog-detail' })
    expect(detail.findAllByType('h2').map(nodeText)).toEqual(['柔光'])
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
    expect(reopened.renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('glass')
    expect(reopened.renderer.root.findByProps({ 'aria-label': '筛选底模' }).props.value).toBe('1')
    expect(reopened.renderer.root.findByProps({ 'aria-label': '筛选生成模型' }).props.value).toBe('11')
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
    expect(renderer.root.findByProps({ 'aria-label': '筛选底模' }).props.value).toBe('1')
    expect(renderer.root.findByProps({ 'aria-label': '筛选生成模型' }).props.value).toBe('')
    expect(renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('glass')
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
      expected: [['资源类型', '生成模型'], ['底模', 'anima'], ['文件名', 'model.safetensors'], ['文件格式', 'safetensors'], ['精度 / 量化', 'fp16'], ['说明', '模型说明']],
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
      expected: [['资源类型', 'LoRA'], ['底模', 'anima'], ['文件名', 'glass.safetensors'], ['文件格式', 'safetensors'], ['版本', 'v1'], ['说明', 'LoRA 说明'], ['触发词', 'glass、soft light'], ['建议权重', '0']],
    },
    {
      kind: 'comfyui-template' as const, category: 'Workflow 模板', id: '12', label: '文生图',
      fields: [
        { key: 'id', value: '12' }, { key: 'base_model_id', value: '1' }, { key: 'model_id', value: '11' },
        { key: 'lora_id', value: null }, { key: 'title', value: '文生图' }, { key: 'template_type', value: 'text_to_image' },
      ],
      expected: [['资源类型', 'Workflow 模板'], ['底模', 'anima'], ['模板类型', '文生图']],
    },
    {
      kind: 'style' as const, category: '画师或画风', id: '16', label: '柔光',
      fields: [
        { key: 'id', value: '16' }, { key: 'base_model_id', value: '1' }, { key: 'name', value: '柔光' },
        { key: 'aliases_json', value: [] }, { key: 'prompt_text', value: 'soft light' }, { key: 'style_description', value: '画风说明' },
      ],
      expected: [['资源类型', '画师或画风'], ['底模', 'anima'], ['说明', '画风说明'], ['提示词', 'soft light']],
    },
    {
      kind: 'artist-string' as const, category: '画师串', id: '18', label: '画师串',
      fields: [
        { key: 'id', value: '18' }, { key: 'base_model_id', value: '1' }, { key: 'title', value: '画师串' },
        { key: 'description', value: '组合说明' }, { key: 'artist_string', value: 'artist1, artist2' }, { key: 'style_ids', value: ['16'] },
      ],
      expected: [['资源类型', '画师串'], ['底模', 'anima'], ['说明', '组合说明'], ['提示词', 'artist1, artist2']],
    },
    {
      kind: 'prompt-term' as const, category: '提示词条目', id: '17', label: 'glass',
      fields: [
        { key: 'id', value: '17' }, { key: 'canonical_tag', value: 'glass' }, { key: 'aliases_json', value: [] },
        { key: 'category', value: 0 }, { key: 'post_count', value: 0 },
      ],
      expected: [['资源类型', '提示词条目'], ['提示词', 'glass']],
    },
  ])('shows the prototype detail rows for $kind from the Catalog values', async ({ kind, category, id, label, fields, expected }) => {
    const catalog = makeCatalog()
    vi.mocked(catalog.baseModels).mockResolvedValue({ items: [{ id: '1', label: 'anima' }] })
    vi.mocked(catalog.details).mockResolvedValue({ kind, id, item: { ...catalogItems.find(item => item.context.kind === kind)!, baseModelId: kind === 'prompt-term' ? null : '1' }, fields })
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
    expect(renderer.root.findAllByType('dd').map(nodeText)).toEqual(['LoRA', '', '', '0'])
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
      '作品',
      '角色',
      '画师或画风',
      '提示词条目',
      '画师串',
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
      getEnvironment: async () => functionEnvironment,
      getInputDescription: vi.fn(async () => inputDescription),
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
      renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value,
    ).toBe('主分支')
  })

  it('renders graph ancestry, Run and artifact sources and each branch own run states', async () => {
    const data = treeProjection()
    data.branches.find(branch => branch.branch_id === 'detail')!.source_run_id = null
    data.branches.find(branch => branch.branch_id === 'detail')!.source_artifact_id = 'artifact-detail'
    data.branches.find(branch => branch.branch_id === 'cool')!.source_run_id = null
    data.runs = data.runs.filter(run => run.workbench_task_id !== 'cool-task')
    data.runs.find(run => run.run_id === 'warm-r1')!.status = 'failed'
    data.runs.find(run => run.run_id === 'warm-r2')!.status = 'running'
    const { renderer, onAction } = await mount(data)
    await click(renderer, '收起主分支')
    await click(renderer, '查看分支图')
    const graph = renderer.root.findByProps({ className: 'branch-graph' })
    expect(graph.findAllByType('ul').map(list => list.findAllByType('h3').map(nodeText))).toEqual([
      ['主分支', '暖光', '暖光细节', '冷光'], ['暖光', '暖光细节', '冷光'], ['暖光细节'],
    ])
    const cards = graph.findAllByProps({ className: 'branch-graph-node' })
    expect(cards.map(card => nodeText(card.findAllByType('p')[0]!))).toEqual([
      '主分支', '来源：主分支 · root-r1', '来源：暖光 · artifact-detail', '来源：主分支 · 任务输入',
    ])
    expect(cards[2]!.findAllByType('p')[0]!.props.title).toBe('artifact-detail')
    expect(cards.map(card => card.findByProps({ className: 'branch-graph-runs' }).findAllByType('button').map(nodeText))).toEqual([
      ['root-r1 · 成功'], ['warm-r1 · 运行失败', 'warm-r2 · 运行中'],
      ['detail-r1 · 成功', 'detail-r2 · 成功', 'detail-r3 · 成功', 'detail-r4 · 成功'], [],
    ])
    expect(nodeText(cards[3]!.findByProps({ className: 'branch-graph-runs' }))).toBe('暂无运行记录')
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
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe('暖光细节')
    expect(renderer.root.findByProps({ 'aria-label': '原始需求' }).props.value).toBe('比较暖光细节的表现。')
    expect(renderer.root.findByProps({ 'aria-label': '正向提示词' }).props.value).toBe('detail prompt')
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
    expect(renderer.root.findByProps({ role: 'dialog', 'aria-label': 'root-r1 · 图片 1' })).toBeDefined()
    await click(renderer, '关闭原图')
    expect(renderer.root.findAllByProps({ className: 'compare-grid' })).toHaveLength(1)
  })

  it.each(['root-r1', 'warm-r1'])('leaves comparison when opening %s from the branch graph', async runId => {
    const { renderer } = await mount(treeProjection())
    await click(renderer, '比较运行')
    expect(renderer.root.findAllByProps({ className: 'compare-grid' })).toHaveLength(1)
    await click(renderer, '查看分支图')
    await click(renderer, `${runId} · 成功`)
    expect(renderer.root.findAllByProps({ className: 'compare-grid' })).toHaveLength(0)
    expect(renderer.root.findByProps({ 'aria-label': `查看运行 ${runId}` }).props['aria-pressed']).toBe(true)
    expect(renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props.checked).toBe(true)
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
    expect(renderer.root.findByProps({ 'aria-label': '分支名称' }).props.value).toBe('暖光')
    expect(nodeText(renderer.root.findByProps({ role: 'treeitem', 'aria-selected': true }))).toContain('暖光')
    expect(onAction).not.toHaveBeenCalled()
  })

  it('returns to a favorite run and navigates a run from the branch graph', async () => {
    const { renderer, onAction } = await mount(fullProjection())
    await click(renderer, '收藏')
    await click(renderer, '查看运行')
    expect(
      renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props.checked,
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
      expect.objectContaining({ type: 'favorite', id: 'r2', value: 'run' }),
    )
    await click(renderer, '查看分支图')
    const runs = renderer.root.findAllByProps({
      className: 'branch-graph-runs',
    })
    await act(() => runs[0]!.findAllByType('button')[0]!.props.onClick())
    expect(
      renderer.root.findByProps({ 'aria-label': '查看运行输入' }).props.checked,
    ).toBe(true)
  })
})

describe('experiment workbench Catalog resource compatibility controls', () => {
  it.each(['card', 'details'] as const)('prioritizes incompatible selected resources and permits model switching from the %s', async entry => {
    const data = fullProjection(), catalog = makeCatalog()
    data.runs = []
    const lora: CatalogItem = { ...catalogItems[1]!, baseModelId: '2', modelId: null }
    const model: CatalogItem = { ...catalogItems[0]!, baseModelId: '2', context: { ...catalogItems[0]!.context, id: '21' }, label: '其他底模模型' }
    const details = vi.mocked(catalog.details).getMockImplementation()!
    vi.mocked(catalog.search).mockImplementation(async request => ({ ...request, items: request.kind === 'lora' ? [lora] : request.kind === 'model' ? [model] : [], totalCount: 1 }))
    vi.mocked(catalog.details).mockImplementation(async (request, signal) => request.kind === 'lora' || request.kind === 'model' ? { ...request, item: request.kind === 'lora' ? lora : model, fields: [] } : details(request, signal))
    const { renderer, onAction } = await mount(data, { catalog })
    await click(renderer, '添加 LoRA')
    if (entry === 'details') await click(renderer, '查看详情 玻璃 LoRA')
    const panel = () => renderer.root.findByProps({ className: 'catalog-content' })
    expect(panel().findByProps({ 'aria-label': '需更换生成模型 玻璃 LoRA' }).props.disabled).toBe(true)
    expect(panel().findByProps({ 'aria-label': '需更换生成模型 玻璃 LoRA' }).props['aria-pressed']).toBe(true)
    await click(renderer, '更换生成模型')
    if (entry === 'details') await click(renderer, '查看详情 其他底模模型')
    expect(panel().findByProps({ 'aria-label': '选择 其他底模模型' }).props.disabled).toBe(false)
    await click(renderer, '选择 其他底模模型')
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'resource-select', id: '21', value: { kind: 'model', id: '21' } }))
  })

  it('keeps a base-bound template unavailable for an empty draft while its details stay readable', async () => {
    const data = fullProjection(), catalog = makeCatalog()
    data.runs = []
    data.branches[0]!.draft = structuredClone(draft)
    const template: CatalogItem = { ...catalogItems[7]!, baseModelId: '1', modelId: null }
    const details = vi.mocked(catalog.details).getMockImplementation()!
    vi.mocked(catalog.search).mockImplementation(async request => ({ ...request, items: request.kind === 'comfyui-template' ? [template] : [], totalCount: 1 }))
    vi.mocked(catalog.details).mockImplementation(async (request, signal) => request.kind === 'comfyui-template' ? { ...request, item: template, fields: [] } : details(request, signal))
    const { renderer, onAction } = await mount(data, { catalog })
    await click(renderer, '选择 Workflow 模板')
    const panel = () => renderer.root.findByProps({ className: 'catalog-content' })
    expect(panel().findByProps({ 'aria-label': '需更换生成模型 文生图' }).props.disabled).toBe(true)
    await click(renderer, '查看详情 文生图')
    expect(panel().findAllByType('h2').map(nodeText)).toEqual(['文生图'])
    expect(panel().findByProps({ 'aria-label': '需更换生成模型 文生图' }).props.disabled).toBe(true)
    expect(onAction).not.toHaveBeenCalled()
  })

  it.each(['card', 'details'] as const)('uses current input compatibility in the %s selection button while leaving resource details available', async entry => {
    const data = fullProjection(), catalog = makeCatalog()
    data.runs = []
    data.branches[0]!.draft.generation_input.loras = []
    const item: CatalogItem = { ...catalogItems[1]!, baseModelId: '1', modelId: '21', label: '指定模型 LoRA' }
    vi.mocked(catalog.search).mockImplementation(async request => ({ ...request, items: request.kind === 'lora' ? [item] : [], totalCount: request.kind === 'lora' ? 1 : 0 }))
    const details = vi.mocked(catalog.details).getMockImplementation()!
    vi.mocked(catalog.details).mockImplementation(async (request, signal) => request.kind === 'lora' ? { ...request, item, fields: [] } : details(request, signal))
    const { renderer, onAction } = await mount(data, { catalog })
    await click(renderer, '添加 LoRA')
    if (entry === 'details') await click(renderer, '查看详情 指定模型 LoRA')
    const panel = renderer.root.findByProps({ className: entry === 'card' ? 'catalog-card ' : 'catalog-detail' })
    const button = panel.findByProps({ 'aria-label': '需更换生成模型 指定模型 LoRA' })
    expect(nodeText(button)).toBe('需更换生成模型')
    expect(button.props.disabled).toBe(true)
    expect(button.props['aria-pressed']).toBe(false)
    if (entry === 'card') await click(renderer, '查看详情 指定模型 LoRA')
    expect(renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('h2').map(nodeText)).toEqual(['指定模型 LoRA'])
    expect(onAction).not.toHaveBeenCalled()
  })
})

describe('experiment workbench selected context summaries', () => {
  it('shows the Catalog name and type for all context kinds and opens their details with the reference filter behavior', async () => {
    const data = fullProjection(), catalog = makeCatalog()
    data.runs = []
    const contexts = catalogItems.filter(item => ['work', 'character', 'style', 'prompt-term', 'artist-string'].includes(item.context.kind))
    data.branches[0]!.draft.context_refs = contexts.map(item => ({ kind: item.context.kind, id: item.context.id })) as TaskDraft['context_refs']
    const { renderer, onAction } = await mount(data, { catalog })
    const summaries = () => renderer.root.findByProps({ 'aria-label': '参考上下文' }).findAllByProps({ className: 'context-item' })
    expect(summaries().map(node => node.findAllByType('button').map(nodeText))).toEqual([
      ['花房作品', '×'], ['角色', '×'], ['柔光', '×'], ['glass', '×'], ['画师串', '×'],
    ])
    expect(summaries().map(node => node.findAllByType('small').map(nodeText))).toEqual([
      ['作品'], ['角色'], ['画师或画风'], ['提示词条目'], ['画师串'],
    ])
    await click(renderer, '资源')
    await change(renderer, '筛选底模', '1')
    await change(renderer, '筛选生成模型', '11')
    await click(renderer, '作品')
    await change(renderer, '搜索资源', 'glass')
    await act(async () => renderer.root.findByProps({ className: 'catalog-search' }).props.onSubmit({ preventDefault() {} }))
    await click(renderer, '下一页')
    await click(renderer, '返回结果')
    await click(renderer, '花房作品')
    expect(renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('h2').map(nodeText)).toEqual(['花房作品'])
    await click(renderer, '返回资源列表')
    expect(renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('glass')
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('2 / 7')
    await act(async () => summaries()[1]!.findAllByType('button')[0]!.props.onClick())
    expect(renderer.root.findByProps({ className: 'catalog-detail' }).findAllByType('h2').map(nodeText)).toEqual(['角色'])
    expect(renderer.root.findByProps({ className: 'catalog-kinds' }).findAllByProps({ 'aria-pressed': true }).map(nodeText)).toEqual(['角色'])
    await click(renderer, '返回资源列表')
    expect(renderer.root.findByProps({ 'aria-label': '搜索资源' }).props.value).toBe('')
    expect(nodeText(renderer.root.findByProps({ className: 'catalog-pagination' }))).toContain('1 / 7')
    await click(renderer, 'LoRA')
    expect(renderer.root.findByProps({ 'aria-label': '筛选底模' }).props.value).toBe('1')
    expect(renderer.root.findByProps({ 'aria-label': '筛选生成模型' }).props.value).toBe('11')
    expect(onAction).not.toHaveBeenCalled()
  })
  it.each(['work', 'character', 'style', 'prompt-term', 'artist-string'] as const)('removes only the %s context with a shared ID and persists card and detail reselection through the public Host', async kind => {
    const { createWorkbenchHostFixture } = await import('../support/workbench-host.ts')
    const host = await createWorkbenchHostFixture(), signal = new AbortController().signal
    try {
      const created = await host.remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: '参考上下文', goal: '保留资源身份' } }, signal)
      const scope = { workspaceId: created.workspaceId, workId: created.workId!, branchId: created.branchId! }
      await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal)
      const contexts = catalogItems.filter(item => ['work', 'character', 'style', 'prompt-term', 'artist-string'].includes(item.context.kind))
        .map(item => ({ ...item, context: { ...item.context, id: '14' } })) as CatalogItem[]
      for (const item of contexts) await host.remote.mutate({ ...scope, type: 'resource-select', value: { kind: item.context.kind, id: item.context.id } }, signal)
      const original = (await host.remote.getProjection(scope, signal)).branches[0]!.draft
      const item = contexts.find(item => item.context.kind === kind)!
      const catalog = makeCatalog(), search = vi.mocked(catalog.search).getMockImplementation()!, details = vi.mocked(catalog.details).getMockImplementation()!
      vi.mocked(catalog.search).mockImplementation(async (request, currentSignal) => {
        const matching = contexts.filter(item => item.context.kind === request.kind)
        return matching.length ? { ...request, items: matching, totalCount: matching.length } : search(request, currentSignal)
      })
      vi.mocked(catalog.details).mockImplementation(async (request, currentSignal) => {
        const matching = contexts.find(item => item.context.kind === request.kind && item.context.id === request.id)
        return matching ? { ...request, item: matching, fields: [] } : details(request, currentSignal)
      })
      const memory = new Map<string, string>()
      const options: NonNullable<Parameters<typeof mount>[1]> = {
        catalog, workspaceId: scope.workspaceId, workspaces: [{ id: scope.workspaceId, name: '参考资源', path: '/workspace/project' }],
        storage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value) } },
        remote: {
          getProjection: request => host.remote.getProjection(request, signal),
          getInputDescription: request => host.remote.getInputDescription(request, signal),
          previewModelChange: request => host.remote.previewModelChange(request, signal), getEnvironment: request => host.remote.getEnvironment(request, signal),
        },
        onAction: request => host.remote.mutate(request, signal),
      }
      const data = await host.remote.getProjection(scope, signal)
      const { renderer } = await mount(data, options)
      const summary = () => renderer.root.findByProps({ 'aria-label': '参考上下文' })
      await click(renderer, `移除 ${item.label}`)
      const remaining = original.context_refs.filter(ref => ref.kind !== kind)
      const saved = (await host.remote.getProjection(scope, signal)).branches[0]!.draft
      expect(saved).toEqual({ ...original, context_refs: remaining })
      expect(summary().findAllByProps({ className: 'context-item' })).toHaveLength(4)
      await click(renderer, '添加参考上下文')
      await act(async () => renderer.root.findByProps({ className: 'catalog-kinds' }).findAllByType('button').find(button => nodeText(button) === ({ work: '作品', character: '角色', style: '画师或画风', 'prompt-term': '提示词条目', 'artist-string': '画师串' })[kind])!.props.onClick())
      await click(renderer, `选择 ${item.label}`)
      expect(renderer.root.findByProps({ className: 'catalog-content' }).findByProps({ 'aria-label': `移除 ${item.label}` }).props['aria-pressed']).toBe(true)
      await act(async () => renderer.root.findByProps({ className: 'catalog-content' }).findByProps({ 'aria-label': `移除 ${item.label}` }).props.onClick())
      expect((await host.remote.getProjection(scope, signal)).branches[0]!.draft.context_refs).toEqual(remaining)
      await click(renderer, `查看详情 ${item.label}`)
      await click(renderer, `选择 ${item.label}`)
      await act(async () => renderer.root.findByProps({ className: 'catalog-detail' }).findByProps({ 'aria-label': `移除 ${item.label}` }).props.onClick())
      expect((await host.remote.getProjection(scope, signal)).branches[0]!.draft.context_refs).toEqual(remaining)
      await click(renderer, `选择 ${item.label}`)
      expect((await host.remote.getProjection(scope, signal)).branches[0]!.draft).toEqual({ ...original, context_refs: [...remaining, { kind, id: '14' }] })
      await act(() => renderer.unmount())
      const reopened = await mount(data, options)
      expect(reopened.renderer.root.findByProps({ className: 'catalog-detail' }).findByProps({ 'aria-label': `移除 ${item.label}` }).props['aria-pressed']).toBe(true)
      expect(reopened.renderer.root.findByProps({ 'aria-label': '参考上下文' }).findAllByProps({ className: 'context-item' })).toHaveLength(5)
      expect(nodeText(reopened.renderer.root.findByProps({ 'aria-label': '参考上下文' }))).toContain(item.label)
      await act(() => reopened.renderer.unmount())
    } finally { await host.dispose() }
  })

  it('aborts removed context reads and keeps a same-ID replacement name after a late response', async () => {
    const data = fullProjection(), catalog = makeCatalog(), details = vi.mocked(catalog.details).getMockImplementation()!
    data.runs = []
    data.branches[0]!.draft.context_refs = [{ kind: 'work', id: 'same-id' }]
    let finish!: () => Promise<void>, pendingSignal!: AbortSignal
    vi.mocked(catalog.details).mockImplementation((request, signal) => request.kind === 'work'
      ? new Promise(resolve => { pendingSignal = signal; finish = async () => resolve(await details(request, signal)) })
      : details(request, signal))
    const onAction = vi.fn(async () => { data.branches[0]!.draft.context_refs = [{ kind: 'style', id: 'same-id' }] })
    const { renderer } = await mount(data, { catalog, onAction })
    await click(renderer, '移除 same-id')
    expect(pendingSignal.aborted).toBe(true)
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '参考上下文' }))).toContain('柔光')
    await act(async () => finish())
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '参考上下文' }))).toContain('柔光')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '参考上下文' }))).not.toContain('花房作品')
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'resource-remove', id: 'same-id', value: 'work' }))
  })

  it('reports a context read error through the existing toast and locks context mutations while inspecting a Run', async () => {
    const data = fullProjection(), catalog = makeCatalog(), details = vi.mocked(catalog.details).getMockImplementation()!
    data.branches[0]!.draft.context_refs = [{ kind: 'work', id: '14' }]
    vi.mocked(catalog.details).mockImplementation((request, signal) => request.kind === 'work' ? Promise.reject(new Error('作品读取失败，请重试。')) : details(request, signal))
    const { renderer, onAction } = await mount(data, { catalog })
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toContain('作品读取失败，请重试。')
    await click(renderer, '查看运行 r1')
    const buttons = renderer.root.findByProps({ 'aria-label': '参考上下文' }).findAllByProps({ className: 'context-item' })[0]!.findAllByType('button')
    expect(buttons.every(button => !button.props.disabled)).toBe(true)
    await click(renderer, '移除 14')
    expect(onAction).not.toHaveBeenCalled()
    await act(async () => buttons[0]!.props.onClick())
    expect(renderer.root.findAllByProps({ className: 'catalog-detail' })).toHaveLength(1)
    expect(onAction).not.toHaveBeenCalled()
  })
})

describe('experiment workbench resource references', () => {
  it('provides navigation from empty experience and favorite lists', async () => {
    const data = fullProjection()
    data.experiences = []
    data.favorites = []
    const { renderer } = await mount(data)
    await click(renderer, '经验')
    await click(renderer, '查看结果')
    expect(
      renderer.root.findByProps({ 'aria-label': '运行结果' }).props.className,
    ).toBe('active')
    await click(renderer, '收藏')
    await click(renderer, '查看经验')
    expect(
      renderer.root.findByProps({ 'aria-label': '经验' }).props.className,
    ).toBe('active')
  })

  it('uses custom bindings and follows the selected context and experience controls', async () => {
    const data = fullProjection()
    data.functions = data.functions.filter((item) => !item.builtin)
    const { renderer, onAction } = await mount(data)
    await click(renderer, '切换分支 暖光探索')
    await click(renderer, '14')
    expect(
      renderer.root.findByProps({ 'aria-label': '资源' }).props.className,
    ).toBe('active')
    await click(renderer, '经验')
    await click(renderer, '移除收藏')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'favorite',
        id: 'experience-a',
        value: 'experience',
      }),
    )
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
      renderer.root.findByProps({ 'aria-label': '采样步数' }).props.value,
    ).toBe('36')
    await change(renderer, '正向提示词', 'unsaved draft edit')
    await change(renderer, '查看运行输入', '', true)
    expect(
      renderer.root.findByProps({ 'aria-label': '正向提示词' }).props.value,
    ).toBe('run specific light')
    expect(
      renderer.root.findByProps({ 'aria-label': '负向提示词' }).props.value,
    ).toBe('actual negative')
    expect(
      renderer.root.findByProps({ 'aria-label': '采样步数' }).props.value,
    ).toBe('44')
    expect(
      renderer.root.findByProps({ 'aria-label': 'Seed' }).props.value,
    ).toBe('912')
    const size = renderer.root.findByProps({ 'aria-label': '画面尺寸' })
    expect(
      size
        .findAllByType('option')
        .find((option) => option.props.value === size.props.value)?.children,
    ).toEqual(['1280 × 768'])
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
        type: 'update-draft',
        field: 'size',
        value: {
          candidate_id: 'size_1',
          parameters: { width_1: 768, height_1: 1024 },
        },
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
      renderer.root.findByProps({ 'aria-label': '采样步数' }).props.value,
    ).toBe('')
    expect(
      renderer.root.findByProps({ 'aria-label': '画面尺寸' }).props.value,
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
      renderer.root.findByProps({ 'aria-label': '采样步数' }).props.value,
    ).toBe('70')
    await act(async () => {
      release(inputDescription)
      await Promise.resolve()
    })
    expect(
      renderer.root.findByProps({ 'aria-label': '采样步数' }).props.value,
    ).toBe('70')
  })
})

describe('experiment workbench comparison evidence', () => {
  it('sends both selected Run IDs to builtin and custom comparison functions', async () => {
    const { renderer, onAction } = await mount(fullProjection())
    await click(renderer, '切换分支 暖光探索')
    await click(renderer, '查看运行 r2')
    await click(renderer, '比较运行')
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
    const template = '  绘图要求 {{task_id}}。\n\n\t保留 {branch_id}、${session_id} 与原始标点。  \n'
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
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }).props.value).toBe('preset-other')
    expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe(template)
    await click(renderer, '取消')
    await click(renderer, '编辑run')
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }).props.value).toBe('preset')
    expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe('{{task_id}}')
    const refreshed = await mount(structuredClone(data))
    await click(refreshed.renderer, '配置中心')
    await click(refreshed.renderer, '编辑prompt')
    expect(refreshed.renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe(template)
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
    await change(renderer, '执行要求', '保留输入 {{task_id}}')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }).props.value).toBe('preset-other')
    expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe('保留输入 {{task_id}}')
    expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toBe('保存失败，请重试。')
    await click(renderer, '取消')
    await click(renderer, '编辑prompt')
    expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe('{{task_id}}')
    await change(renderer, '执行要求', '关闭后丢弃 {{task_id}}')
    await click(renderer, '关闭对话框')
    await click(renderer, '编辑prompt')
    expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe('{{task_id}}')
    await change(renderer, '执行要求', 'Escape 后丢弃 {{task_id}}')
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
      },
    }))
    const { renderer, onAction } = await mount(data, { remote: { getEnvironment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '编辑自定义prompt')
    await change(renderer, '功能名称', '自定义绘图')
    await change(renderer, '任务类型', 'run')
    await change(renderer, 'Agent 预设', 'preset-other')
    expect(getEnvironment).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', presetId: 'preset-other' })
    expect(renderer.root.findByProps({ 'aria-label': '指定 Skill' }).props.value).toBe('')
    await change(renderer, '指定 Skill', 'prompt-skill')
    await change(renderer, 'Agent 提供商', 'provider-other')
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 模型' }).props.value).toBe('fast')
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
    await change(renderer, '执行要求', '读取失败后保留 {{task_id}}')
    const save = renderer.root.findAllByType('button').find(node => nodeText(node) === '保存功能')!
    expect(save.props.disabled).toBe(true)
    expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toBe('Skill 目录读取失败，请重试。')
    expect(onAction).not.toHaveBeenCalled()
    await change(renderer, 'Agent 预设', 'preset')
    expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe('读取失败后保留 {{task_id}}')
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
        expect(view.root.findByProps({ 'aria-label': 'Agent 预设' }).props.value).toBe(presetId)
        expect(view.root.findByProps({ 'aria-label': '指定 Skill' }).props.value).toBe(skill)
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
        expect(view.root.findByProps({ 'aria-label': 'Agent 提供商' }).props.value).toBe(provider)
        expect(view.root.findByProps({ 'aria-label': 'Agent 模型' }).props.value).toBe('model')
        expect(view.root.findByProps({ 'aria-label': '推理等级' }).props.value).toBe(reasoningEffort)
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
    expect(renderer.root.findByProps({ 'aria-label': '推理等级' }).props.value).toBe('high')
    await change(renderer, 'Agent 模型', 'default')
    expect(renderer.root.findByProps({ 'aria-label': '推理等级' }).props.value).toBe('medium')
    await change(renderer, 'Agent 模型', 'first')
    expect(renderer.root.findByProps({ 'aria-label': '推理等级' }).props.value).toBe('minimal')
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
    expect(renderer.root.findByProps({ 'aria-label': '推理等级' }).props.value).toBe('medium')
    await change(renderer, '推理等级', 'high')
    await change(renderer, '执行要求', '当前要求 {{task_id}}')
    await click(renderer, '恢复默认要求')
    const restored = renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value
    expect(restored).toBe(`工作台任务 ID：{{task_id}}

先读取 workbench task get --help，再按上述 Task ID 读取本次输入。

根据 requested_skill 读取指定 Skill；为空时按所选预设的 Skill 目录选择。

根据 requirements 和 prompt_input 编写提示词，结合 base_model_id、generation_input.model 与 context_refs 读取所需素材。

读取适用的 Prompt Builder Skill，保留 Skill 原生产物。

通过 workbench task publish 提交 type 为 prompt 的产物。

提交产物前读取 workbench task publish --help，使用声明的输入格式，并填写同一个 Task ID。缺少必需输入时提交 type 为 question 的产物。`)
    await change(renderer, '任务类型', 'parameters')
    const parameterTemplate = renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value
    expect(parameterTemplate).toBe(`工作台任务 ID：{{task_id}}

先读取 workbench task get --help，再按上述 Task ID 读取本次输入。

根据 requested_skill 读取指定 Skill；为空时按所选预设的 Skill 目录选择。

根据 requirements 中的画面目标与调整要求，查询 generation_input 所用实例和模板的参数描述。

按 value_type、可用范围及尺寸候选决定参数值，只提交 output_contract.parameter_ids 中的参数。

通过 workbench task publish 提交 type 为 parameters 的产物。

提交产物前读取 workbench task publish --help，使用声明的输入格式，并填写同一个 Task ID。缺少必需输入时提交 type 为 question 的产物。`)
    await change(renderer, '执行要求', '调整参数 {{task_id}}')
    await click(renderer, '恢复默认要求')
    expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe(parameterTemplate)
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
      ['  读取任务。\n\n\t保留这一行。  \n', '请在执行要求中保留 {{task_id}}，用于定位工作台任务。'],
      ['  读取 {{task_id}}。\n\n保留 {{branch_id}} 与尾部。  \n', '请将其他定位符替换为具体执行要求，并保留 {{task_id}}。'],
      ['读取 {{task_id}} {{', 'Task ID 定位符格式不完整，请使用 {{task_id}}。'],
    ]
    for (const [value, message] of samples) {
      await change(renderer, '执行要求', value)
      expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toBe(message)
      expect(renderer.root.findAllByType('button').find(node => nodeText(node) === '保存功能')!.props.disabled).toBe(true)
      await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
      expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe(value)
    }
    expect(onAction).not.toHaveBeenCalled()
    await click(renderer, '恢复默认要求')
    expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toBe('')
    expect(renderer.root.findAllByType('button').find(node => nodeText(node) === '保存功能')!.props.disabled).toBe(false)
    await click(renderer, '取消')
    await click(renderer, '编辑prompt')
    expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe('{{task_id}}')
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
    await change(renderer, '执行要求', '修复模型后保留 {{task_id}}')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(onAction).not.toHaveBeenCalled()
    await change(renderer, 'Agent 提供商', 'provider')
    expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toBe('')
    expect(renderer.root.findAllByType('button').find(node => nodeText(node) === '保存功能')!.props.disabled).toBe(false)
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }).props.value).toBe('preset-other')
    expect(renderer.root.findByProps({ 'aria-label': '指定 Skill' }).props.value).toBe('')
    expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe('修复模型后保留 {{task_id}}')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(onAction).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      type: 'function-edit', id: 'prompt',
      value: expect.objectContaining({
        preset_id: 'preset-other', requested_skill: null, request_template: '修复模型后保留 {{task_id}}',
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
    expect(nodeText(prompt.findByProps({ className: 'binding-problem' }))).toBe('该功能的 Agent 预设已不可用，请到配置中心重新选择。')
    expect(nodeText(run.findByProps({ className: 'binding-problem' }))).toBe('该功能的 Agent 预设已不可用，请到配置中心重新选择。')
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
    await change(renderer, '执行要求', '取消前编辑 {{task_id}}')
    environment = { ...functionEnvironment, presets: [...functionEnvironment.presets, { id: 'added-preset', name: '关闭前新增预设' }] }
    expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe('取消前编辑 {{task_id}}')
    await click(renderer, '取消')
    expect(getEnvironment).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a' })
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }))).toContain('关闭前新增预设')
    expect(data.functions.find(item => item.function_id === 'prompt')!.request_template).toBe('{{task_id}}')
    await click(renderer, '编辑prompt')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }))).toContain('关闭前新增预设')
    await change(renderer, '执行要求', '保存时保留 {{task_id}}')
    await change(renderer, 'Agent 预设', 'preset-other')
    expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe('保存时保留 {{task_id}}')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    expect(getEnvironment).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a' })
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }))).toBe('绘图预设保存后新增预设')
    expect(data.functions.find(item => item.function_id === 'prompt')!.request_template).toBe('保存时保留 {{task_id}}')
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
    await change(renderer, '执行要求', '等待目录期间保留 {{task_id}}')
    await change(renderer, 'Agent 预设', 'preset-other')
    await act(async () => { finishTable({ ...functionEnvironment, presets: [] }); finishEditor(functionEnvironment) })
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }))).toContain('当前目录预设')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }))).toContain('当前目录预设')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '指定 Skill' }))).toBe('Agent 自选latest-skill')
    expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe('等待目录期间保留 {{task_id}}')
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
    await change(renderer, '执行要求', '保留其余输入 {{task_id}}')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(onAction).not.toHaveBeenCalled()
    expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toBe('请填写与已有功能不同的名称。')
    expect(renderer.root.findByProps({ role: 'dialog' }).findAllByProps({ className: 'toast' })).toHaveLength(0)
    expect(renderer.root.findByProps({ 'aria-label': '功能名称' }).props.value).toBe(name)
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }).props.value).toBe('preset-other')
    expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe('保留其余输入 {{task_id}}')
    await change(renderer, '功能名称', '  自定义prompt  ')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'function-edit', value: expect.objectContaining({ name: '自定义prompt', preset_id: 'preset-other', request_template: '保留其余输入 {{task_id}}' }) }))
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
    expect(renderer.root.findByProps({ 'aria-label': '功能名称' }).props.value).toBe('prompt')
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
    const selectedWhileSaving = renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }).props.value
    await act(async () => finishLast())
    await act(async () => finishFirst())
    expect(writes).toEqual(['preset-other', 'preset-last'])
    expect(selectedWhileSaving).toBe('preset-last')
    expect(data.functions.find(item => item.function_id === 'prompt')!.preset_id).toBe('preset-last')
    expect(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }).props.value).toBe('preset-last')
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
    expect(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }).props.value).toBe('preset-last')
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
    expect(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }).props.value).toBe('preset-other')
    await click(renderer, '编辑prompt')
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }).props.value).toBe('preset-other')
    await change(renderer, 'Agent 预设', 'preset-last')
    await change(renderer, '执行要求', '排队期间保留 {{task_id}}')
    let saving!: Promise<void>
    await act(() => { saving = renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }) })
    expect(onAction).toHaveBeenCalledOnce()
    await click(renderer, '取消')
    await click(renderer, '返回工作台')
    await change(renderer, '切换工作', 'work-b')
    await act(async () => { finishFirst(); await saving })
    expect(onAction.mock.calls[1]![0]).toMatchObject({ type: 'function-edit', id: 'prompt', workspaceId: 'workspace-a', workId: 'work-a', branchId: 'root' })
    expect(data.functions.find(item => item.function_id === 'prompt')).toMatchObject({ preset_id: 'preset-last', request_template: '排队期间保留 {{task_id}}' })
    expect(renderer.root.findByProps({ 'aria-label': '切换工作' }).props.value).toBe('work-b')
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
    await change(renderer, '执行要求', '先保存的完整配置 {{task_id}}')
    let saving!: Promise<void>
    await act(() => { saving = renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }) })
    await click(renderer, '取消')
    await change(renderer, 'prompt的默认预设', 'preset-last')
    expect(onAction).toHaveBeenCalledOnce()
    expect(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }).props.value).toBe('preset-last')
    await click(renderer, '编辑prompt')
    expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe('先保存的完整配置 {{task_id}}')
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }).props.value).toBe('preset-last')
    await click(renderer, '取消')
    await act(async () => { finishEditor(); await saving })
    expect(writes).toEqual(['editor', 'inline'])
    expect(data.functions.find(item => item.function_id === 'prompt')).toMatchObject({ preset_id: 'preset-last', request_template: '先保存的完整配置 {{task_id}}' })
    expect(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }).props.value).toBe('preset-last')
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
    await change(renderer, '执行要求', 'first saved {{task_id}}')
    let savingFirst!: Promise<void>
    await act(() => { savingFirst = renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }) })
    await click(renderer, '取消')
    await click(renderer, '编辑prompt')
    const reopenedRequirements = renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value
    await change(renderer, 'Agent 模型', 'fast')
    let savingSecond!: Promise<void>
    await act(() => { savingSecond = renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }) })
    await act(async () => { finishFirst(); await savingFirst; await savingSecond })
    expect(data.functions.find(item => item.function_id === 'prompt')).toMatchObject({ request_template: 'first saved {{task_id}}', agent_model: { provider: 'provider', model: 'fast' } })
    expect(reopenedRequirements).toBe('first saved {{task_id}}')
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
    expect(row.findByProps({ 'aria-label': '已提交功能的默认预设' }).props.value).toBe('preset-other')
    await click(renderer, '编辑已提交功能')
    for (const [label, value] of [
      ['功能名称', '已提交功能'], ['任务类型', 'parameters'], ['Agent 预设', 'preset-other'],
      ['Agent 模型', 'fast'], ['指定 Skill', 'parameter-skill'], ['执行要求', '完整提交 {{task_id}}'],
    ]) expect(renderer.root.findByProps({ 'aria-label': label }).props.value).toBe(value)
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
    await change(renderer, '执行要求', '失败时保留 {{task_id}}')
    await change(renderer, 'Agent 预设', 'preset-other')
    let saving!: Promise<void>
    await act(() => { saving = renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }) })
    if (view !== 'open') await click(renderer, '关闭对话框')
    if (view === 'left-settings') await click(renderer, '返回工作台')
    await act(async () => { rejectSave(new Error('功能保存失败，请重试。')); await saving })
    if (view === 'open') {
      expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(0)
      expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toBe('功能保存失败，请重试。')
      expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe('失败时保留 {{task_id}}')
      expect(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }).props.value).toBe('preset-other')
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1)
    } else {
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
      expect(renderer.root.findAllByProps({ className: 'toast' })).toHaveLength(1)
      expect(nodeText(renderer.root.findByProps({ className: 'toast' }))).toBe('功能保存失败，请重试。')
    }
  })
})

describe('experiment workbench unavailable preset editor', () => {
  it.each(['missing', 'broken'])('matches the prototype when the stored preset is %s and only changes storage on save', async state => {
    const data = fullProjection()
    const storedId = state === 'missing' ? 'removed-preset' : 'broken-preset'
    const binding = data.functions.find(item => item.function_id === 'prompt')!
    Object.assign(binding, { preset_id: storedId, requested_skill: 'comfyui-generate', request_template: '保留原有执行要求 {{task_id}}' })
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
    expect(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }).props.value).toBe(storedId)
    await click(renderer, '编辑prompt')
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }).props.value).toBe('preset')
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }).findAllByType('option').map(option => option.props.value)).toEqual(['preset', 'preset-other'])
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '指定 Skill' }))).toBe('Agent 自选')
    expect(renderer.root.findByProps({ 'aria-label': '指定 Skill' }).props.value).toBe('')
    expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe(original.request_template)
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 提供商' }).props.value).toBe(original.agent_model.provider)
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 模型' }).props.value).toBe(original.agent_model.model)
    expect(renderer.root.findByProps({ 'aria-label': '推理等级' }).props.value).toBe(original.agent_model.reasoningEffort)
    expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toBe('')
    expect(renderer.root.findAllByType('button').find(node => nodeText(node) === '保存功能')!.props.disabled).toBe(false)
    expect(getEnvironment.mock.calls.filter(([request]) => request.presetId === 'preset')).toHaveLength(0)
    await click(renderer, '取消')
    expect(onAction).not.toHaveBeenCalled()
    expect(binding).toEqual(original)
    expect(renderer.root.findByProps({ 'aria-label': 'prompt的默认预设' }).props.value).toBe(storedId)
    await click(renderer, '编辑prompt')
    await act(async () => renderer.root.findAllByType('form').find(node => node.props.id === 'modal-form')!.props.onSubmit({ preventDefault() {} }))
    expect(binding).toEqual({ ...original, preset_id: 'preset', requested_skill: null })
    await click(renderer, '编辑prompt')
    expect(getEnvironment).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', presetId: 'preset' })
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '指定 Skill' }))).toBe('Agent 自选comfyui-generate')
    expect(renderer.root.findByProps({ 'aria-label': '指定 Skill' }).props.value).toBe('')
  })
})

describe('experiment workbench unavailable preset choices', () => {
  it.each(['empty', 'all-broken'])('keeps an empty preset select and blocks saving when the available roster is %s', async state => {
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
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }).props.value).toBe('')
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }).findAllByType('option')).toHaveLength(0)
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '指定 Skill' }))).toBe('Agent 自选')
    expect(nodeText(renderer.root.findByProps({ id: 'template-error' }))).toBe('')
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
    binding.request_template = '手工切换后保留 {{task_id}}'
    const getEnvironment = vi.fn(async ({ presetId }: { presetId?: string }) => ({
      ...functionEnvironment,
      skills: presetId === 'preset' ? functionEnvironment.skills : presetId === 'preset-other' ? [{ name: 'other-skill', description: '其他预设 Skill' }] : [],
    }))
    const { renderer } = await mount(data, { remote: { getEnvironment, getProjection: async () => data, getInputDescription: async () => inputDescription } })
    await click(renderer, '配置中心')
    await click(renderer, '编辑prompt')
    expect(renderer.root.findByProps({ 'aria-label': 'Agent 预设' }).props.value).toBe('preset')
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '指定 Skill' }))).toBe('Agent 自选')
    expect(getEnvironment.mock.calls.filter(([request]) => request.presetId === 'preset')).toHaveLength(0)
    await change(renderer, 'Agent 预设', 'preset-other')
    expect(getEnvironment).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', presetId: 'preset-other' })
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '指定 Skill' }))).toBe('Agent 自选other-skill')
    await change(renderer, '指定 Skill', 'other-skill')
    await change(renderer, 'Agent 预设', 'preset')
    expect(getEnvironment).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', presetId: 'preset' })
    expect(nodeText(renderer.root.findByProps({ 'aria-label': '指定 Skill' }))).toBe('Agent 自选comfyui-generate')
    expect(renderer.root.findByProps({ 'aria-label': '指定 Skill' }).props.value).toBe('')
    expect(renderer.root.findByProps({ 'aria-label': '执行要求' }).props.value).toBe('手工切换后保留 {{task_id}}')
  })
})
