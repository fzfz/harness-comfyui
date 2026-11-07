import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogItem, CatalogKind } from '../../src/catalog/contract.ts'
import type { CatalogApi } from '../../src/client/workbench/native-surfaces.tsx'
import type { ArtifactPayload } from '../../src/workbench/contract.ts'
import type { ExperimentWorkbenchProps } from '../../src/client/workbench/experiment-contract.ts'
import { ExperimentWorkbench } from '../../src/client/workbench/experiment-workbench.tsx'
import {
  fullProjection,
  inputDescription,
  makeRun,
  makeTask,
} from './experiment-workbench-fixtures.ts'
import type {
  Branch,
  TaskDraft,
  WorkbenchProjection,
} from '../../src/workbench/contract.ts'

interface RenderNode {
  readonly props: Record<string, any>
  readonly children: readonly (RenderNode | string)[]
  findByProps(props: Record<string, unknown>): RenderNode
  findAllByType(type: string): RenderNode[]
  findAllByProps(props: Record<string, unknown>): RenderNode[]
}
const { act, create } = (await vi.importActual('react-test-renderer')) as {
  act: (callback: () => void | Promise<void>) => Promise<void>
  create: (node: React.ReactElement) => {
    readonly root: RenderNode
    unmount(): void
    toJSON(): unknown
  }
}
const empty: WorkbenchProjection = {
  workspace_id: 'workspace-a',
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
  options: Partial<ExperimentWorkbenchProps> = {},
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
      getInputDescription: vi.fn(async () => inputDescription),
    }
  let renderer!: ReturnType<typeof create>
  await act(async () => {
    renderer = create(
      <ExperimentWorkbench
        remote={remote}
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
      />,
    )
  })
  mounts.push(renderer)
  return { renderer, onAction, remote }
}

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
    const { renderer, onAction } = await mount(fullProjection())
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
    await blur(renderer, 'glass.safetensors 权重', '0.7')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'update-draft',
        field: 'lora-weight',
        id: '13',
        value: 0.7,
      }),
    )
    await click(renderer, '移除 glass.safetensors')
    await click(renderer, '移除 14')
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
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'function-edit', id: 'prompt' }),
    )
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
  it('matches the reference workspace dialog controls and cycles keyboard focus within the dialog', async () => {
    const { renderer } = await mount(empty)
    await click(renderer, '添加工作区')
    const dialog = renderer.root.findByProps({ role: 'dialog' })
    const close = dialog.findByProps({ 'aria-label': '关闭对话框' })
    expect(nodeText(close)).toBe('×')
    expect(close.props.autoFocus).toBe(true)
    const cancel = dialog.findAllByType('button').find(button => nodeText(button) === '取消')!
    expect(cancel.props.className).toBe('btn quiet')
    const first = { offsetParent: {}, focus: vi.fn() }, last = { offsetParent: {}, focus: vi.fn() }
    const preventDefault = vi.fn(), currentTarget = { querySelectorAll: () => [first, last] }
    Object.defineProperty(document, 'activeElement', { configurable: true, value: last })
    await act(() => dialog.props.onKeyDown({ key: 'Tab', shiftKey: false, currentTarget, preventDefault }))
    expect(first.focus).toHaveBeenCalledOnce()
    Object.defineProperty(document, 'activeElement', { configurable: true, value: first })
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
    context: { kind: 'model', id: '11', file_name: 'model.safetensors' },
    label: '模型',
    subtitle: '生成模型',
    coverUrl: '/cover.png',
    sampleImageUrls: ['/one.png', '/two.png'],
  },
  {
    context: { kind: 'lora', id: '13', file_name: 'glass.safetensors' },
    label: '玻璃 LoRA',
    subtitle: '玻璃细节',
    coverUrl: null,
    sampleImageUrls: [],
  },
  {
    context: { kind: 'work', id: '14', name: '花房作品' },
    label: '花房作品',
    subtitle: '玻璃建筑',
    coverUrl: '/cover.png',
    sampleImageUrls: ['/one.png'],
  },
  {
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
    context: { kind: 'prompt-term', id: '17', tag: 'glass' },
    label: 'glass',
    subtitle: '提示词',
    coverUrl: null,
    sampleImageUrls: [],
  },
  {
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
    totalCount: request.query === 'none' ? 0 : 50,
  })),
  details: vi.fn(async (request) => ({
    ...request,
    fields: [
      { key: 'file_name', value: 'model.safetensors' },
      { key: 'description', value: ['玻璃', '自然光'] },
    ],
  })),
})

describe('experiment workbench shared catalog', () => {
  it('uses Catalog query, filters, pagination, details and media navigation without creating another backend', async () => {
    const catalog = makeCatalog()
    const { renderer, onAction } = await mount(fullProjection(), { catalog })
    await click(renderer, '资源')
    expect(catalog.search).toHaveBeenLastCalledWith(
      { kind: 'model', query: '', page: 1, baseModelId: null },
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
    await click(renderer, '查看 模型')
    expect(catalog.details).toHaveBeenLastCalledWith(
      { kind: 'model', id: '11' },
      expect.any(AbortSignal),
    )
    await click(renderer, '已选择')
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'resource-select', id: '11' }),
    )
    await click(renderer, '预览图片 模型')
    await click(renderer, '下一张图片')
    await click(renderer, '上一张图片')
    await click(renderer, '返回详情')
    await click(renderer, '返回资源列表')
    await click(renderer, '查看详情')
    await click(renderer, '返回资源列表')
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
