import React from 'react'
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
  inputDescription,
} from './experiment-workbench-fixtures.ts'
import type { ExperimentWorkbenchProps } from '../../src/client/workbench/experiment-contract.ts'
const { act, create } = (await vi.importActual('react-test-renderer')) as any
const mounts: any[] = []
afterEach(async () => {
  await act(() => {
    for (const renderer of mounts.splice(0)) renderer.unmount()
  })
  vi.unstubAllGlobals()
})
const environment = {
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
  details: vi.fn(),
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
      <ExperimentWorkbenchHost remote={api} catalog={catalog()} />,
    )
  })
  mounts.push(renderer)
  return renderer
}
describe('official experiment workbench adapter', () => {
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
    const open = vi.fn()
    let entry: any
    await act(() => {
      entry = create(<ExperimentWorkbenchEntry wide open={open} />)
    })
    mounts.push(entry)
    await act(() => entry.root.findByType('button').props.onClick())
    expect(open).toHaveBeenCalledOnce()
  })
  it('shows environment failures, retries loading and rejects failed mutations', async () => {
    const api = remote()
    vi.mocked(api.getEnvironment).mockResolvedValueOnce({
      ok: false,
      error: { code: 'OFFLINE', message: '工作区不可用' },
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
      error: { code: 'SAVE_FAILED' },
    })
    await expect(
      shell.onAction({ type: 'run', workspaceId: 'workspace-a' }),
    ).rejects.toThrow('SAVE_FAILED')
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
        <ExperimentWorkbenchHost remote={api} catalog={source} />,
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
