import { createRequire } from 'node:module'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const React = await import('react')
  return {
    Button: ({ icon, children, ...props }: Record<string, unknown>) => React.createElement(
      'button', props,
      icon ? React.createElement('span', { 'data-button-icon': true }, icon as ReactNode) : children as ReactNode,
    ),
    IconChevronDownOutline14: () => React.createElement('i'),
    IconChevronLeftOutline14: () => React.createElement('i'),
    IconChevronRightOutline14: () => React.createElement('i'),
    IconCloseOutline16: () => React.createElement('i'),
    IconDownloadOutline16: () => React.createElement('i', { 'data-icon': 'download' }),
    Menu: ({ open, anchor, items, onSelect, onClose }: Record<string, unknown>) => React.createElement(
      'div',
      { 'data-menu-open': open, onBlur: onClose },
      anchor as ReactNode,
      open
        ? (items as Array<{ id: string; label: ReactNode }>).map(item => React.createElement(
          'button', { key: item.id, onClick: () => (onSelect as (id: string) => void)(item.id) }, item.label,
        ))
        : null,
    ),
    Pill: ({ children, ...props }: Record<string, unknown>) => React.createElement('span', props, children as ReactNode),
  }
})

import { WorkbenchController } from '../../src/client/workbench/controller.ts'
import { WorkbenchDetails } from '../../src/client/workbench/results-drawer.tsx'
import { RESULTS_COPY } from '../../src/client/workbench/results-contract.ts'
import type { GenerationProjection } from '../../src/generation/contract.ts'

const { act, create } = createRequire(import.meta.url)('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>
  create: (node: ReactNode) => {
    root: {
      findAllByType(type: string): Array<{ props: Record<string, unknown> }>
      findAllByProps(props: Record<string, unknown>): Array<{ props: Record<string, unknown> }>
      findByProps(props: Record<string, unknown>): { props: Record<string, unknown> }
    }
    toJSON(): unknown
    unmount(): void
  }
}

const projection: GenerationProjection = {
  sessionId: 'session-1',
  runs: [
    { runId: 'run_1', turn: 4, title: '运行一', instanceTitle: 'ComfyUI', templateTitle: 'Anima', status: 'remote_running', errorCode: null, createdAt: 1, updatedAt: 2 },
    { runId: 'run_2', turn: 3, title: '运行二', instanceTitle: 'ComfyUI', templateTitle: 'Anima', status: 'failed', errorCode: 'COMFYUI_REMOTE_ERROR', createdAt: 1, updatedAt: 2 },
  ],
  media: Array.from({ length: 6 }, (_, index) => ({
    mediaId: `media_${index + 1}`,
    runId: index < 3 ? 'run_1' : 'run_2',
    turn: index < 3 ? 4 : 3,
    outputIndex: index,
    mediaKind: index === 5 ? 'video' as const : 'image' as const,
    filename: index === 5 ? 'result.mp4' : `result-${index + 1}.webp`,
    mediaType: index === 5 ? 'video/mp4' : 'image/webp',
    byteSize: 100,
    createdAt: 1_700_000_000_000 + index,
  })),
  hasActiveRuns: true,
  refreshAfterMs: 1000,
}

const connectedSnapshot = Object.freeze({ projection, errorCode: null })

const generationStore = {
  subscribe: (_sessionId: string, _listener: () => void) => () => undefined,
  getSnapshot: (_sessionId: string) => connectedSnapshot,
  refreshSession: vi.fn(),
}

afterEach(() => vi.unstubAllGlobals())

function buttonByText(renderer: ReturnType<typeof create>, text: ReactNode) {
  return renderer.root.findAllByType('button').find(button => button.props.children === text)!
}

function renderDetails(workbench: WorkbenchController) {
  return create(createElement(WorkbenchDetails, {
    sessionId: 'session-1',
    useSession: ((selector: (snapshot: unknown) => unknown) => selector({
      running: false, runningCalls: [], turnEnds: new Map(),
    })) as never,
    workbench,
    generationStore: generationStore as never,
  }))
}

describe('native Generation result drawer', () => {
  it('shows real Run projections and one Workflow download icon on every visible media card', () => {
    const workbench = new WorkbenchController({ openDetails: vi.fn(), closeDetails: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => { renderer = renderDetails(workbench) })
    expect(renderer!.root.findAllByType('button').filter(button => button.props.className === 'harness-comfyui-run-card')).toHaveLength(2)
    expect(JSON.stringify(renderer!.toJSON())).toContain('COMFYUI_REMOTE_ERROR')
    expect(JSON.stringify(renderer!.toJSON())).toContain('ComfyUI 执行 Workflow 时失败。检查 ComfyUI 任务日志和 Workflow。')
    act(() => { (buttonByText(renderer!, RESULTS_COPY.sessionTab).props.onClick as () => void)() })
    expect(renderer!.root.findAllByProps({ className: 'harness-comfyui-media-card' })).toHaveLength(4)
    expect(renderer!.root.findAllByProps({ 'data-icon': 'download' })).toHaveLength(4)
    expect(renderer!.root.findByProps({ 'aria-label': '下载 result-1.webp 所属 Workflow' }).props.title)
      .toBe(RESULTS_COPY.downloadWorkflow)
    const anchor = { href: '', download: 'unset', click: vi.fn(), remove: vi.fn() }
    const append = vi.fn()
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { append } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"workflow":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:workflow'), revokeObjectURL: vi.fn() })
    return act(async () => {
      await (renderer!.root.findByProps({ 'aria-label': '下载 result-1.webp 所属 Workflow' }).props.onClick as () => Promise<void>)()
      expect(anchor.href).toBe('blob:workflow')
      expect(anchor.download).toBe('comfyui-run-run_1-workflow.json')
      expect(append).toHaveBeenCalledWith(anchor)
      expect(anchor.click).toHaveBeenCalledOnce()
      expect(anchor.remove).toHaveBeenCalledOnce()
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:workflow')
      renderer!.unmount()
    })
  })

  it('keeps a media card visible and shows catalog copy when its preview or Workflow is missing', async () => {
    const workbench = new WorkbenchController({ openDetails: vi.fn(), closeDetails: vi.fn() })
    let renderer: ReturnType<typeof create>
    await act(async () => { renderer = renderDetails(workbench) })
    await act(async () => { (buttonByText(renderer!, RESULTS_COPY.sessionTab).props.onClick as () => void)() })

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"code":"GENERATION_MEDIA_NOT_FOUND"}', {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })))
    await act(async () => {
      (renderer!.root.findAllByType('img')[0]!.props.onError as () => void)()
    })
    expect(JSON.stringify(renderer!.toJSON())).toContain('GENERATION_MEDIA_NOT_FOUND')
    expect(JSON.stringify(renderer!.toJSON())).toContain('请求的媒体记录不存在。刷新会话媒体列表。')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"code":"GENERATION_ARTIFACT_NOT_READY"}', {
      status: 409,
      headers: { 'content-type': 'application/json' },
    })))
    await act(async () => {
      await (renderer!.root.findByProps({ 'aria-label': '下载 result-1.webp 所属 Workflow' }).props.onClick as () => Promise<void>)()
    })
    expect(JSON.stringify(renderer!.toJSON())).toContain('GENERATION_ARTIFACT_NOT_READY')
    expect(JSON.stringify(renderer!.toJSON())).toContain('该运行尚未生成所需文件。等待运行准备完成。')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"code":"GENERATION_ARTIFACT_NOT_FOUND"}', {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })))
    await act(async () => {
      await (renderer!.root.findByProps({ 'aria-label': '下载 result-1.webp 所属 Workflow' }).props.onClick as () => Promise<void>)()
    })
    expect(JSON.stringify(renderer!.toJSON())).toContain('GENERATION_ARTIFACT_NOT_FOUND')
    expect(JSON.stringify(renderer!.toJSON())).toContain('请求的运行文件不存在。刷新会话媒体列表。')
    expect(renderer!.root.findAllByProps({ className: 'harness-comfyui-media-card' })).toHaveLength(4)
    await act(async () => renderer!.unmount())
  })

  it('changes the selected Run and closes through the Harness layout service', () => {
    const layout = { openDetails: vi.fn(), closeDetails: vi.fn() }
    const workbench = new WorkbenchController(layout)
    let renderer: ReturnType<typeof create>
    act(() => { renderer = renderDetails(workbench) })
    const runCards = renderer!.root.findAllByType('button').filter(button => button.props.className === 'harness-comfyui-run-card')
    expect(runCards[0]!.props['aria-pressed']).toBe(false)
    act(() => { (runCards[1]!.props.onClick as () => void)() })
    expect(renderer!.root.findAllByType('button').filter(button => button.props.className === 'harness-comfyui-run-card')[1]!.props['aria-pressed']).toBe(true)
    act(() => { (renderer!.root.findByProps({ 'aria-label': RESULTS_COPY.close }).props.onClick as () => void)() })
    expect(layout.closeDetails).toHaveBeenCalledOnce()
    act(() => renderer!.unmount())
  })

  it('filters real media by turn and kind and keeps independent pagination', async () => {
    const workbench = new WorkbenchController({ openDetails: vi.fn(), closeDetails: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => { renderer = renderDetails(workbench) })
    act(() => { (buttonByText(renderer!, RESULTS_COPY.sessionTab).props.onClick as () => void)() })
    const next = renderer!.root.findByProps({ 'aria-label': RESULTS_COPY.nextPage })
    act(() => { (next.props.onClick as () => void)() })
    expect(renderer!.root.findAllByProps({ className: 'harness-comfyui-media-card' })).toHaveLength(2)
    act(() => {
      (renderer!.root.findByProps({ 'aria-label': RESULTS_COPY.previousPage }).props.onClick as () => void)()
    })
    expect(renderer!.root.findAllByProps({ className: 'harness-comfyui-media-card' })).toHaveLength(4)

    let anchors = renderer!.root.findAllByType('button').filter(button => button.props['aria-haspopup'] === 'menu')
    act(() => { (anchors[1]!.props.onClick as () => void)() })
    act(() => { (renderer!.root.findAllByProps({ 'data-menu-open': true })[0]!.props.onBlur as () => void)() })
    act(() => { (anchors[1]!.props.onClick as () => void)() })
    act(() => { (buttonByText(renderer!, RESULTS_COPY.video).props.onClick as () => void)() })
    expect(renderer!.root.findAllByType('video')).toHaveLength(1)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"code":"GENERATION_MEDIA_NOT_FOUND"}', {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })))
    await act(async () => {
      (renderer!.root.findAllByType('video')[0]!.props.onError as () => void)()
    })

    anchors = renderer!.root.findAllByType('button').filter(button => button.props['aria-haspopup'] === 'menu')
    act(() => { (anchors[0]!.props.onClick as () => void)() })
    const openMenus = renderer!.root.findAllByProps({ 'data-menu-open': true })
    act(() => { (openMenus[0]!.props.onBlur as () => void)() })
    act(() => { (anchors[0]!.props.onClick as () => void)() })
    act(() => { (buttonByText(renderer!, '第 4 轮').props.onClick as () => void)() })
    expect(JSON.stringify(renderer!.toJSON())).toContain(RESULTS_COPY.noMedia)
    act(() => { (buttonByText(renderer!, RESULTS_COPY.currentTab).props.onClick as () => void)() })
    act(() => renderer!.unmount())
  })
})
