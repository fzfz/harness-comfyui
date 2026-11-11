import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExperimentBranchGraph } from '../../src/client/workbench/experiment-branch-graph.tsx'
import { makeBranch, makeRun, makeTask } from './experiment-workbench-fixtures.ts'

interface RenderNode {
  readonly props: Record<string, any>
  readonly children: readonly (RenderNode | string)[]
  findByProps(props: Record<string, unknown>): RenderNode
  findAllByProps(props: Record<string, unknown>): RenderNode[]
  findAllByType(type: string): RenderNode[]
}
const { act, create } = (await vi.importActual('react-test-renderer')) as {
  act: (callback: () => void) => Promise<void>
  create: (node: React.ReactElement) => {
    readonly root: RenderNode
    update(node: React.ReactElement): void
    unmount(): void
  }
}
const mounts: ReturnType<typeof create>[] = []
afterEach(async () => { await act(() => { for (const mount of mounts.splice(0)) mount.unmount() }) })
const text = (node: RenderNode | string): string => typeof node === 'string' ? node : node.children.map(text).join('')
const edges = (root: RenderNode) => root.findAllByType('path').map(path => text(path.findAllByType('title')[0]!))

describe('Branch graph visible Run ancestry', () => {
  it('preserves full branch and model names in hover hints and keeps its branch entry usable', async () => {
    const branch = makeBranch('root', null), onBranch = vi.fn()
    branch.name = '分支名称'.repeat(10)
    branch.draft.base_model_id = 'long-model'
    const modelName = '实验底模'.repeat(12)
    let renderer!: ReturnType<typeof create>
    await act(() => { renderer = create(<ExperimentBranchGraph branches={[branch]} tasks={[]} runs={[]} selectedRunId={null}
      baseModels={[{ id: 'long-model', label: modelName }]} onRun={vi.fn()} onBranch={onBranch} />) })
    mounts.push(renderer)
    const heading = renderer.root.findByProps({ className: 'branch-graph-heading row' })
    expect(heading.findAllByType('h3')[0]!.props.title).toBe(branch.name)
    expect(heading.findByProps({ className: 'pill' }).props.title).toBe(modelName)
    await act(() => { heading.findAllByType('button')[0]!.props.onClick() })
    expect(onBranch).toHaveBeenCalledWith('root')
  })

  it('preserves the complete source name and ID in the source hover hint', async () => {
    const parent = makeBranch('root', null)
    parent.name = '来源分支'.repeat(10)
    const artifactId = 'artifact_a1d0c99e-fbff-443e-b4c1-5d6521b09b6e'
    const child = { ...makeBranch('child', 'root'), source_run_id: null, source_experience_id: null, source_artifact_id: artifactId }
    let renderer!: ReturnType<typeof create>
    await act(() => { renderer = create(<ExperimentBranchGraph branches={[parent, child]} tasks={[]} runs={[]} selectedRunId={null}
      onRun={vi.fn()} onBranch={vi.fn()} />) })
    mounts.push(renderer)
    const childRow = renderer.root.findAllByProps({ className: 'branch-graph-node' })[1]!
    const source = childRow.findAllByType('p')[0]!
    expect(source.props.title).toBe(`来源：${parent.name} · 产物 ${artifactId}`)
    expect(text(source)).toContain('artifact_a1')
    expect(text(source)).not.toContain(artifactId)
  })

  it('places descendants after their actual source Runs and connects only displayed Run endpoints', async () => {
    const root = makeBranch('root', null)
    const warm = { ...makeBranch('warm', 'root'), source_run_id: 'root-r2', source_experience_id: null }
    const detail = { ...makeBranch('detail', 'warm'), source_run_id: 'warm-r2', source_experience_id: null }
    const input = { ...makeBranch('input', 'root'), source_run_id: null, source_experience_id: null }
    const artifact = { ...makeBranch('artifact', 'root'), source_run_id: null, source_artifact_id: 'artifact-1', source_experience_id: null }
    const external = { ...makeBranch('external', 'root'), source_run_id: 'external-run', source_experience_id: 'experience-1' }
    const empty = { ...makeBranch('empty', 'detail'), source_run_id: 'detail-r1', source_experience_id: null }
    const branches = [root, warm, detail, input, artifact, external, empty]
    for (const branch of branches) branch.name = branch.branch_id
    const tasks = branches.map(branch => makeTask(branch.branch_id + '-task', branch.branch_id))
    const runs = [
      makeRun('root-r1', 'root-task'), makeRun('root-r2', 'root-task'),
      makeRun('warm-r1', 'warm-task'), makeRun('warm-r2', 'warm-task'),
      makeRun('detail-r1', 'detail-task'), makeRun('input-r1', 'input-task'),
      makeRun('artifact-r1', 'artifact-task'), makeRun('external-r1', 'external-task'), makeRun('external-r2', 'external-task'),
    ]
    let renderer!: ReturnType<typeof create>
    await act(() => { renderer = create(<ExperimentBranchGraph branches={branches} tasks={tasks} runs={runs} selectedRunId="detail-r1" onRun={vi.fn()} onBranch={vi.fn()} />) })
    mounts.push(renderer)
    const graph = renderer.root
    expect(graph.findByProps({ 'aria-label': '查看运行 root-r2' }).props.style.left).toBe(188)
    expect(graph.findByProps({ 'aria-label': '查看运行 warm-r1' }).props.style.left).toBe(368)
    expect(graph.findByProps({ 'aria-label': '查看运行 warm-r2' }).props.style.left).toBe(548)
    expect(graph.findByProps({ 'aria-label': '查看运行 detail-r1' }).props.style.left).toBe(728)
    expect(edges(graph)).toEqual([
      'root-r1 → root-r2', 'root-r2 → warm-r1', 'warm-r1 → warm-r2', 'warm-r2 → detail-r1', 'external-r1 → external-r2',
    ])
    const rows = graph.findAllByProps({ className: 'branch-graph-node' })
    expect(rows).toHaveLength(7)
    const emptyRow = rows.find(row => text(row.findAllByType('h3')[0]!) === 'empty')!
    expect(text(emptyRow.findByProps({ className: 'branch-graph-runs' }))).toBe('暂无运行记录')
    expect(text(graph)).toContain('任务输入')
    expect(text(graph)).toContain('产物 artifact-1')
    expect(text(graph)).toContain('经验 experience-1 · 运行 external-run')
  })

  it('updates nodes, curves, thumbnails and selection when the displayed projection changes', async () => {
    const branches = [makeBranch('root', null), { ...makeBranch('warm', 'root'), source_run_id: 'root-r1', source_experience_id: null }]
    const tasks = [makeTask('root-task', 'root'), makeTask('warm-task', 'warm')]
    const onRun = vi.fn(), onBranch = vi.fn()
    const initial = [makeRun('root-r1', 'root-task'), makeRun('warm-r1', 'warm-task', 'remote_running')]
    const render = (runs: typeof initial, selectedRunId: string) => <ExperimentBranchGraph branches={branches} tasks={tasks} runs={runs} selectedRunId={selectedRunId} onRun={onRun} onBranch={onBranch} />
    let renderer!: ReturnType<typeof create>
    await act(() => { renderer = create(render(initial, 'root-r1')) })
    mounts.push(renderer)
    expect(edges(renderer.root)).toEqual(['root-r1 → warm-r1'])
    expect(renderer.root.findByProps({ 'aria-label': '查看运行 warm-r1' }).props.style.left).toBe(188)
    expect(text(renderer.root.findByProps({ 'aria-label': '查看运行 warm-r1' }))).toContain('生成中')
    branches[1]!.source_run_id = 'root-r2'
    const completed = makeRun('warm-r1', 'warm-task')
    completed.media[0]!.url = '/warm-result.png'
    await act(() => { renderer.update(render([initial[0]!, makeRun('root-r2', 'root-task'), completed], 'warm-r1')) })
    expect(edges(renderer.root)).toEqual(['root-r1 → root-r2', 'root-r2 → warm-r1'])
    const selected = renderer.root.findByProps({ 'aria-label': '查看运行 warm-r1' })
    expect(selected.props.style.left).toBe(368)
    expect(selected.props['aria-pressed']).toBe(true)
    expect(selected.findAllByType('img')[0]!.props.src).toBe('/warm-result.png')
    expect(renderer.root.findByProps({ 'aria-label': '查看运行 root-r1' }).props['aria-pressed']).toBe(false)
    await act(() => { selected.props.onClick() })
    expect(onRun).toHaveBeenCalledWith('warm-r1')
    const warmRow = renderer.root.findAllByProps({ className: 'branch-graph-node' })[1]!
    await act(() => { warmRow.findAllByType('button').find(button => text(button) === '进入分支')!.props.onClick() })
    expect(onBranch).toHaveBeenCalledWith('warm')
    await act(() => { renderer.update(render([completed], 'warm-r1')) })
    expect(edges(renderer.root)).toEqual([])
    expect(renderer.root.findAllByProps({ 'aria-label': '查看运行 root-r2' })).toHaveLength(0)
    expect(text(renderer.root)).toContain('从 root-r2 分出')
  })
})
