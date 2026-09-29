import { readFileSync } from 'node:fs'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const React = await import('react')
  return {
    Button: ({ icon, children, ...props }: Record<string, unknown>) => {
      const content: ReactNode[] = []
      if (icon !== undefined) content.push(React.createElement('span', { 'data-button-icon': true }, icon as ReactNode))
      if (children !== undefined) content.push(children as ReactNode)
      return React.createElement('button', props, ...content)
    },
    IconChevronDownOutlineRegular: () => React.createElement('i'),
    IconChevronLeftOutlineRegular: () => React.createElement('i'),
    IconChevronRightOutlineRegular: () => React.createElement('i'),
    IconCloseOutlineRegular: () => React.createElement('i'),
    IconDownloadOutlineRegular: () => React.createElement('i', { 'data-icon': 'download' }),
    Modal: ({ open, onClose, title, closeLabel, children, footer }: Record<string, unknown>) => (
      open
        ? React.createElement(
          'div',
          { role: 'dialog', 'aria-label': title },
          children as ReactNode,
          React.createElement('footer', null, footer as ReactNode),
          React.createElement('button', { 'aria-label': closeLabel, onClick: onClose }),
        )
        : null
    ),
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

import { GenerationProjectionStore } from '../../src/client/workbench/generation-store.ts'
import { WorkbenchController } from '../../src/client/workbench/controller.ts'
import { WorkbenchDetails } from '../../src/client/workbench/results-drawer.tsx'
import { GENERATION_ERROR_COPY, RESULTS_COPY } from '../../src/client/workbench/results-contract.ts'
import {
  GENERATION_MEDIA_VIEWER_CURRENT_MESSAGE_TYPE,
  generationMediaContentUrl,
  generationMediaDownloadUrl,
  generationMediaViewerUrl,
  type GenerationProjection,
} from '../../src/generation/contract.ts'

const { act, create } = await vi.importActual('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>
  create: (node: ReactNode, options?: { readonly createNodeMock?: (element: { readonly type?: unknown }) => unknown }) => {
    root: {
      findAllByType(type: string): Array<{ props: Record<string, unknown> }>
      findAllByProps(props: Record<string, unknown>): Array<{ props: Record<string, unknown> }>
      findByProps(props: Record<string, unknown>): { props: Record<string, unknown> }
    }
    toJSON(): unknown
    update(node: ReactNode): void
    unmount(): void
  }
}

const iframeContentWindow = Object.freeze({ frame: 'session-media-viewer' })
let messageEnvironment: {
  readonly dispatch: (event: Record<string, unknown>) => void
  readonly addEventListener: ReturnType<typeof vi.fn>
  readonly removeEventListener: ReturnType<typeof vi.fn>
} | null = null

function installMessageWindow() {
  if (messageEnvironment !== null) return messageEnvironment
  const listeners = new Set<(event: Record<string, unknown>) => void>()
  const addEventListener = vi.fn((name: string, listener: (event: Record<string, unknown>) => void) => {
    if (name === 'message') listeners.add(listener)
  })
  const removeEventListener = vi.fn((name: string, listener: (event: Record<string, unknown>) => void) => {
    if (name === 'message') listeners.delete(listener)
  })
  vi.stubGlobal('window', {
    location: { origin: 'http://127.0.0.1:4173' },
    addEventListener,
    removeEventListener,
  })
  messageEnvironment = {
    addEventListener,
    removeEventListener,
    dispatch(event) { for (const listener of listeners) listener(event) },
  }
  return messageEnvironment
}

const projection: GenerationProjection = {
  sessionId: 'session-1',
  runs: [
    { runId: 'run_1', turn: 4, title: '运行一', instanceTitle: 'ComfyUI', templateTitle: 'Anima', status: 'remote_running', errorCode: null, errorMessage: null, createdAt: 1, updatedAt: 2 },
    { runId: 'run_2', turn: 3, title: '运行二', instanceTitle: 'ComfyUI', templateTitle: 'Anima', status: 'failed', errorCode: 'COMFYUI_REMOTE_ERROR', errorMessage: 'ComfyUI node 12 rejected positive_prompt because its model input is missing.', createdAt: 1, updatedAt: 2 },
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
  setSessionRunning: vi.fn(),
}

afterEach(() => {
  messageEnvironment = null
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function buttonByText(renderer: ReturnType<typeof create>, text: ReactNode) {
  return renderer.root.findAllByType('button').find(button => button.props.children === text)!
}

function deferredVoid() {
  let resolve!: () => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function useTabInfo(close = vi.fn(), visible = true) {
  return () => ({
    sidebar: { expanded: true, fullscreen: false },
    panel: { id: 'pane-1' },
    tab: {
      id: 'result-tab-1',
      visible,
      actions: { close },
    },
  })
}

function renderDetails(workbench: WorkbenchController, close = vi.fn()) {
  installMessageWindow()
  return create(createElement(WorkbenchDetails, {
    sessionId: 'session-1',
    useSession: ((selector: (snapshot: unknown) => unknown) => selector({
      running: false,
    })) as never,
    useTabInfo: useTabInfo(close) as never,
    workbench,
    generationStore: generationStore as never,
  }), {
    createNodeMock: element => element.type === 'iframe' ? { contentWindow: iframeContentWindow } : {},
  })
}

describe('native Generation result drawer', () => {
  it('shows Runs created later without a change to the running Session snapshot', async () => {
    vi.useFakeTimers()
    installMessageWindow()
    const sessionSnapshot = Object.freeze({ running: true })
    let latest: GenerationProjection = { ...projection, runs: [], media: [], hasActiveRuns: false }
    const store = new GenerationProjectionStore({ list: async () => latest }, 1000)
    const workbench = new WorkbenchController({ openTab() {} })
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(WorkbenchDetails, {
        sessionId: 'session-1',
        useSession: selector => selector(sessionSnapshot),
        useTabInfo: useTabInfo() as never,
        workbench,
        generationStore: store,
      }))
    })
    try {
      expect(JSON.stringify(renderer.toJSON())).toContain('暂无运行')
      latest = projection
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(JSON.stringify(renderer.toJSON())).toContain('run_1')
      expect(JSON.stringify(renderer.toJSON())).toContain('run_2')
    } finally {
      await act(() => renderer.unmount())
      store.dispose()
    }
  })

  it('updates polling on Session running changes and isolates a replacement Session', async () => {
    vi.useFakeTimers()
    installMessageWindow()
    let sessionSnapshot = { running: false }
    const list = vi.fn(async (sessionId: string): Promise<GenerationProjection> => ({
      ...projection,
      sessionId,
      runs: [{ ...projection.runs[0]!, runId: `run_${sessionId}`, status: 'succeeded' }],
      media: [],
      hasActiveRuns: false,
    }))
    const store = new GenerationProjectionStore({ list }, 1000)
    const workbench = new WorkbenchController({ openTab() {} })
    const useSession = <Selected,>(selector: (snapshot: typeof sessionSnapshot) => Selected) => selector(sessionSnapshot)
    const details = (sessionId: string) => createElement(WorkbenchDetails, {
      sessionId, useSession, useTabInfo: useTabInfo() as never, workbench, generationStore: store,
    })
    let renderer!: ReturnType<typeof create>
    await act(async () => { renderer = create(details('session-1')) })
    try {
      expect(list).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
      sessionSnapshot = { running: true }
      await act(async () => { renderer.update(details('session-1')) })
      expect(list).toHaveBeenCalledTimes(2)
      expect(vi.getTimerCount()).toBe(1)
      sessionSnapshot = { running: true }
      await act(async () => { renderer.update(details('session-1')) })
      expect(list).toHaveBeenCalledTimes(2)

      await act(async () => { renderer.update(details('session-2')) })
      expect(JSON.stringify(renderer.toJSON())).toContain('run_session-2')
      expect(JSON.stringify(renderer.toJSON())).not.toContain('run_session-1')
      expect(vi.getTimerCount()).toBe(1)
      list.mockClear()
      await act(async () => { await vi.advanceTimersByTimeAsync(projection.refreshAfterMs) })
      expect(list).toHaveBeenCalledExactlyOnceWith('session-2', expect.any(AbortSignal))

      sessionSnapshot = { running: false }
      await act(async () => { renderer.update(details('session-2')) })
      expect(list).toHaveBeenCalledTimes(2)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      await act(() => renderer.unmount())
      store.dispose()
    }
  })

  it('gives executable Workflow guidance for generation parameter target errors', () => {
    expect(GENERATION_ERROR_COPY.GENERATION_PARAMETER_TARGET_AMBIGUOUS).toMatchObject({
      reason: '显式运行参数键在当前 UI Workflow 中匹配到多个可执行输入。',
      next_step: '检查错误详情中的运行参数键和候选 ComfyUI 节点输入；修改 UI Workflow 使目标唯一，或在运行参数键后添加目标节点编号后缀（例如 seed_31）后重试。',
    })
    expect(GENERATION_ERROR_COPY.GENERATION_PARAMETER_TARGET_NOT_FOUND).toMatchObject({
      reason: '显式运行参数键在当前 UI Workflow 和目标实例节点定义中没有匹配的可执行输入。',
      next_step: '检查错误详情中的运行参数键；确认 UI Workflow 包含对应的活动可执行输入，或把运行参数键改为指向现有目标节点编号的后缀形式（例如 seed_31）后重试。',
    })
    expect(JSON.stringify([
      GENERATION_ERROR_COPY.GENERATION_PARAMETER_TARGET_AMBIGUOUS,
      GENERATION_ERROR_COPY.GENERATION_PARAMETER_TARGET_NOT_FOUND,
    ])).not.toMatch(/binding|模板参数|参数 ID/u)
  })

  it('exposes separate catalog entries for local invalid, local unsupported, and remote rejected contracts', () => {
    expect(GENERATION_ERROR_COPY).toHaveProperty('GENERATION_PARAMETER_INVALID')
    expect(GENERATION_ERROR_COPY).toHaveProperty('GENERATION_PARAMETER_CONTRACT_UNSUPPORTED')
    expect(GENERATION_ERROR_COPY).toHaveProperty('COMFYUI_PROMPT_REJECTED')
    expect(GENERATION_ERROR_COPY.GENERATION_PARAMETER_INVALID)
      .not.toBe(GENERATION_ERROR_COPY.GENERATION_PARAMETER_CONTRACT_UNSUPPORTED)
    expect(GENERATION_ERROR_COPY.COMFYUI_PROMPT_REJECTED)
      .not.toBe(GENERATION_ERROR_COPY.GENERATION_PARAMETER_INVALID)
    expect(GENERATION_ERROR_COPY.COMFYUI_PROMPT_REJECTED)
      .not.toBe(GENERATION_ERROR_COPY.GENERATION_PARAMETER_CONTRACT_UNSUPPORTED)
  })

  it('uses the native right-sidebar surface without a blank Session overlay', () => {
    const styles = readFileSync(new URL('../../src/client/styles.css', import.meta.url), 'utf8')
    expect(styles).toContain('[data-plugin="harness-comfyui-sidebar-right"] {')
    expect(styles).not.toContain('harness-comfyui-results-overlay')
  })

  it('fits image and video previews inside the media container without cropping', () => {
    const styles = readFileSync(new URL('../../src/client/styles.css', import.meta.url), 'utf8')
    const mediaRule = styles.match(/\.harness-comfyui-media-preview img,\s*\.harness-comfyui-media-preview video\s*\{(?<body>[^}]*)\}/u)

    expect(mediaRule?.groups?.body).toContain('width: 100%;')
    expect(mediaRule?.groups?.body).toContain('height: 100%;')
    expect(mediaRule?.groups?.body).toContain('object-fit: contain;')
    expect(mediaRule?.groups?.body).not.toContain('object-fit: cover;')
  })

  it('gives the application media viewer a viewport-sized modal surface', () => {
    const styles = readFileSync(new URL('../../src/client/styles.css', import.meta.url), 'utf8')
    const modalRule = styles.match(/\.harness-comfyui-media-viewer-modal\s*\{(?<body>[^}]*)\}/u)
    const contentRule = styles.match(/\.harness-comfyui-media-viewer-content\s*\{(?<body>[^}]*)\}/u)
    const rowRule = styles.match(/\.harness-comfyui-media-viewer-run-id-row\s*\{(?<body>[^}]*)\}/u)
    const valueRule = styles.match(/\.harness-comfyui-media-viewer-run-id-value\s*\{(?<body>[^}]*)\}/u)
    const frameRule = styles.match(/\.harness-comfyui-media-viewer-frame\s*\{(?<body>[^}]*)\}/u)
    const footerRule = styles.match(/\.harness-comfyui-media-viewer-footer-actions\s*\{(?<body>[^}]*)\}/u)

    expect(modalRule?.groups?.body).toContain('width: min(1180px, calc(100vw - 48px));')
    expect(contentRule?.groups?.body).toContain('min-width: 0;')
    expect(rowRule?.groups?.body).toContain('grid-template-columns: auto minmax(0, 1fr) auto;')
    expect(valueRule?.groups?.body).toContain('overflow-wrap: anywhere;')
    expect(valueRule?.groups?.body).toContain('user-select: text;')
    expect(frameRule?.groups?.body).toContain('width: 100%;')
    expect(frameRule?.groups?.body).toContain('height: min(68vh, 720px);')
    expect(frameRule?.groups?.body).toContain('border: 0;')
    expect(footerRule?.groups?.body).toContain('display: flex;')
    expect(footerRule?.groups?.body).toContain('flex-wrap: wrap;')
    expect(footerRule?.groups?.body).toContain('gap: 8px;')
    expect(styles).toContain('.harness-comfyui-media-viewer-copy-button:focus-visible')
    expect(styles).toContain('@media (max-width: 680px)')
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) auto;')
  })

  it('orders “本会话媒体” before “运行状态”, defaults to “本会话媒体”, switches to “运行状态” and back, and resets to “本会话媒体” when the native result tab is recreated', () => {
    const workbench = new WorkbenchController({ openTab: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => { renderer = renderDetails(workbench) })

    const tabs = renderer!.root.findAllByType('button').filter(button => button.props.role === 'tab')
    const panels = renderer!.root.findAllByProps({ role: 'tabpanel' })
    expect(tabs.map(tab => tab.props.children)).toEqual([
      RESULTS_COPY.sessionTab,
      RESULTS_COPY.currentTab,
    ])
    expect(tabs.map(tab => tab.props['aria-selected'])).toEqual([true, false])
    expect(panels.map(panel => panel.props.hidden)).toEqual([true, false])

    act(() => { (tabs[1]!.props.onClick as () => void)() })
    expect(renderer!.root.findAllByType('button')
      .filter(button => button.props.role === 'tab')
      .map(tab => tab.props['aria-selected']))
      .toEqual([false, true])
    expect(renderer!.root.findAllByProps({ role: 'tabpanel' }).map(panel => panel.props.hidden))
      .toEqual([false, true])

    act(() => {
      ;(renderer!.root.findAllByType('button')
        .filter(button => button.props.role === 'tab')[0]!.props.onClick as () => void)()
    })
    expect(renderer!.root.findAllByType('button')
      .filter(button => button.props.role === 'tab')
      .map(tab => tab.props['aria-selected']))
      .toEqual([true, false])
    expect(renderer!.root.findAllByProps({ role: 'tabpanel' }).map(panel => panel.props.hidden))
      .toEqual([true, false])

    act(() => {
      ;(renderer!.root.findAllByType('button')
        .filter(button => button.props.role === 'tab')[1]!.props.onClick as () => void)()
    })
    expect(renderer!.root.findAllByType('button')
      .filter(button => button.props.role === 'tab')
      .map(tab => tab.props['aria-selected']))
      .toEqual([false, true])
    expect(renderer!.root.findAllByProps({ role: 'tabpanel' }).map(panel => panel.props.hidden))
      .toEqual([false, true])

    act(() => renderer!.unmount())
    act(() => { renderer = renderDetails(workbench) })
    expect(renderer!.root.findAllByType('button')
      .filter(button => button.props.role === 'tab')
      .map(tab => tab.props['aria-selected']))
      .toEqual([true, false])
    act(() => renderer!.unmount())
  })

  it('renders a blank Session in the same native result tab and closes its owned tab', () => {
    const close = vi.fn()
    const workbench = new WorkbenchController({ openTab: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(WorkbenchDetails, {
        sessionId: 'session-blank',
        useSession: (selector: (state: { running: boolean }) => unknown) => selector({ running: false }),
        useTabInfo: useTabInfo(close) as never,
        workbench,
        generationStore: generationStore as never,
      } as never))
    })

    expect(renderer!.root.findAllByProps({
      className: 'harness-comfyui-results-drawer',
    })).toHaveLength(1)
    expect(renderer!.root.findByProps({ 'data-plugin': 'harness-comfyui-sidebar-right' }).props['data-session-id'])
      .toBe('session-blank')

    act(() => {
      ;(renderer!.root.findByProps({ 'aria-label': RESULTS_COPY.close }).props.onClick as () => void)()
    })
    expect(close).toHaveBeenCalledOnce()
    act(() => renderer!.unmount())
  })

  it('shows real Run projections and one Workflow download icon on every visible media card', () => {
    const workbench = new WorkbenchController({ openTab: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => { renderer = renderDetails(workbench) })
    expect(renderer!.root.findAllByType('button').filter(button => button.props.className === 'harness-comfyui-run-card')).toHaveLength(2)
    expect(JSON.stringify(renderer!.toJSON())).toContain('COMFYUI_REMOTE_ERROR')
    expect(JSON.stringify(renderer!.toJSON())).toContain('错误详情')
    act(() => { (buttonByText(renderer!, RESULTS_COPY.sessionTab).props.onClick as () => void)() })
    expect(renderer!.root.findAllByProps({ className: 'harness-comfyui-media-card' })).toHaveLength(4)
    expect(renderer!.root.findAllByProps({ 'data-icon': 'download' })).toHaveLength(4)
    const mediaViewerButtons = renderer!.root.findAllByType('button')
      .filter(button => button.props.className === 'harness-comfyui-media-viewer-button')
    expect(mediaViewerButtons).toHaveLength(4)
    expect(mediaViewerButtons[0]!.props).toMatchObject({
      'aria-label': `${RESULTS_COPY.openMediaViewer}：result-1.webp`,
    })
    expect(mediaViewerButtons[0]!.props).not.toHaveProperty('target')
    act(() => { (mediaViewerButtons[0]!.props.onClick as () => void)() })
    renderer!.root.findByProps({
      role: 'dialog',
      'aria-label': `${RESULTS_COPY.mediaViewer}：result-1.webp`,
    })
    expect(renderer!.root.findAllByType('iframe')[0]!.props).toMatchObject({
      src: generationMediaViewerUrl('media_1', 'session-1'),
      title: `${RESULTS_COPY.mediaViewer}：result-1.webp`,
    })
    expect(renderer!.root.findAllByType('iframe')[0]!.props).not.toHaveProperty('allow')
    expect(renderer!.root.findByProps({ className: 'harness-comfyui-media-viewer-run-id-value' }).props.children)
      .toBe('run_1')
    expect(renderer!.root.findAllByType('code').some(node => (
      node.props.className === 'harness-comfyui-media-viewer-run-id-value'
    ))).toBe(true)
    expect(renderer!.root.findByProps({ className: 'harness-comfyui-media-viewer-copy-button' }).props.type)
      .toBe('button')
    act(() => {
      ;(renderer!.root.findByProps({ 'aria-label': RESULTS_COPY.closeMediaViewer }).props.onClick as () => void)()
    })
    expect(renderer!.root.findAllByProps({
      role: 'dialog',
      'aria-label': `${RESULTS_COPY.mediaViewer}：result-1.webp`,
    })).toHaveLength(0)
    expect(renderer!.root.findAllByType('img')[0]!.props.src)
      .toBe(generationMediaContentUrl('media_1', 'session-1'))
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

  it('downloads the image or video currently displayed by the Session Media Viewer', () => {
    const environment = installMessageWindow()
    const anchors: Array<{ href: string; download: string; click: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }> = []
    const append = vi.fn()
    const fetchMock = vi.fn()
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
        anchors.push(anchor)
        return anchor
      }),
      body: { append },
    })
    vi.stubGlobal('fetch', fetchMock)
    const workbench = new WorkbenchController({ openTab: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => { renderer = renderDetails(workbench) })
    act(() => { (buttonByText(renderer!, RESULTS_COPY.sessionTab).props.onClick as () => void)() })
    const open = renderer!.root.findAllByType('button')
      .find(button => button.props.className === 'harness-comfyui-media-viewer-button')!
    act(() => { (open.props.onClick as () => void)() })

    const initialDownload = renderer!.root.findByProps({ 'aria-label': '下载当前原文件：result-1.webp' })
    expect(JSON.stringify(initialDownload.props.children)).toContain('下载原文件')
    expect(initialDownload.props.variant).toBe('outline')
    act(() => { (initialDownload.props.onClick as () => void)() })
    act(() => { (initialDownload.props.onClick as () => void)() })
    expect(anchors).toHaveLength(2)
    for (const anchor of anchors) {
      expect(anchor.href).toBe(generationMediaDownloadUrl('media_1', 'session-1'))
      expect(anchor.download).toBe('result-1.webp')
      expect(anchor.click).toHaveBeenCalledOnce()
      expect(anchor.remove).toHaveBeenCalledOnce()
      expect(append).toHaveBeenCalledWith(anchor)
    }
    expect(fetchMock).not.toHaveBeenCalled()

    act(() => environment.dispatch({
      origin: 'http://127.0.0.1:4173',
      source: iframeContentWindow,
      data: { type: GENERATION_MEDIA_VIEWER_CURRENT_MESSAGE_TYPE, mediaId: 'media_6', runId: 'run_2' },
    }))
    const videoDownload = renderer!.root.findByProps({ 'aria-label': '下载当前原文件：result.mp4' })
    act(() => { (videoDownload.props.onClick as () => void)() })
    expect(anchors[2]).toMatchObject({
      href: generationMediaDownloadUrl('media_6', 'session-1'),
      download: 'result.mp4',
    })
    expect(anchors[2]!.click).toHaveBeenCalledOnce()
    expect(anchors[2]!.remove).toHaveBeenCalledOnce()

    act(() => {
      (renderer!.root.findByProps({ 'aria-label': RESULTS_COPY.closeMediaViewer }).props.onClick as () => void)()
    })
    expect(renderer!.root.findAllByProps({ 'aria-label': '下载当前原文件：result.mp4' })).toHaveLength(0)
    act(() => renderer!.unmount())
  })

  it('removes the temporary original-media download anchor when the native click throws', () => {
    installMessageWindow()
    const clickError = new Error('native download click failed')
    const anchor = { href: '', download: '', click: vi.fn(() => { throw clickError }), remove: vi.fn() }
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { append: vi.fn() } })
    const workbench = new WorkbenchController({ openTab: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => { renderer = renderDetails(workbench) })
    act(() => { (buttonByText(renderer!, RESULTS_COPY.sessionTab).props.onClick as () => void)() })
    const open = renderer!.root.findAllByType('button')
      .find(button => button.props.className === 'harness-comfyui-media-viewer-button')!
    act(() => { (open.props.onClick as () => void)() })

    expect(() => {
      act(() => {
        (renderer!.root.findByProps({ 'aria-label': '下载当前原文件：result-1.webp' }).props.onClick as () => void)()
      })
    }).toThrow(clickError)
    expect(anchor.remove).toHaveBeenCalledOnce()
    act(() => renderer!.unmount())
  })

  it('accepts current-media messages only from the open Session Media Viewer iframe', () => {
    const environment = installMessageWindow()
    const workbench = new WorkbenchController({ openTab: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => { renderer = renderDetails(workbench) })
    act(() => { (buttonByText(renderer!, RESULTS_COPY.sessionTab).props.onClick as () => void)() })
    const open = renderer!.root.findAllByType('button')
      .find(button => button.props.className === 'harness-comfyui-media-viewer-button')!
    act(() => { (open.props.onClick as () => void)() })

    const message = {
      type: GENERATION_MEDIA_VIEWER_CURRENT_MESSAGE_TYPE,
      mediaId: 'media_4',
      runId: 'run_2',
    }
    act(() => environment.dispatch({ origin: 'https://example.com', source: iframeContentWindow, data: message }))
    act(() => environment.dispatch({ origin: 'http://127.0.0.1:4173', source: {}, data: message }))
    act(() => environment.dispatch({
      origin: 'http://127.0.0.1:4173', source: iframeContentWindow,
      data: { ...message, unexpected: true },
    }))
    act(() => environment.dispatch({
      origin: 'http://127.0.0.1:4173', source: iframeContentWindow,
      data: { ...message, mediaId: 'media_unknown' },
    }))
    act(() => environment.dispatch({
      origin: 'http://127.0.0.1:4173', source: iframeContentWindow,
      data: { ...message, runId: 'run_mismatch' },
    }))
    expect(renderer!.root.findByProps({ className: 'harness-comfyui-media-viewer-run-id-value' }).props.children)
      .toBe('run_1')

    act(() => environment.dispatch({ origin: 'http://127.0.0.1:4173', source: iframeContentWindow, data: message }))
    expect(renderer!.root.findByProps({ className: 'harness-comfyui-media-viewer-run-id-value' }).props.children)
      .toBe('run_2')
    expect(renderer!.root.findByProps({ className: 'harness-comfyui-media-viewer-copy-button' }).props.children)
      .toBe(RESULTS_COPY.copyRunId)
    act(() => renderer!.unmount())
  })

  it('copies the complete current Run ID from the main frame', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const workbench = new WorkbenchController({ openTab: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => { renderer = renderDetails(workbench) })
    act(() => { (buttonByText(renderer!, RESULTS_COPY.sessionTab).props.onClick as () => void)() })
    const open = renderer!.root.findAllByType('button')
      .find(button => button.props.className === 'harness-comfyui-media-viewer-button')!
    act(() => { (open.props.onClick as () => void)() })

    await act(async () => {
      await (renderer!.root.findByProps({
        className: 'harness-comfyui-media-viewer-copy-button',
      }).props.onClick as () => Promise<void>)()
    })

    expect(writeText).toHaveBeenCalledWith('run_1')
    expect(renderer!.root.findByProps({ className: 'harness-comfyui-media-viewer-copy-button' }).props.children)
      .toBe(RESULTS_COPY.runIdCopied)
    expect(renderer!.root.findByProps({
      className: 'harness-comfyui-media-viewer-copy-announcement',
    }).props.children).toBe(`${RESULTS_COPY.runIdCopiedAnnouncementPrefix}run_1`)
    act(() => renderer!.unmount())
  })

  it('asks the user to select the displayed Run ID when Clipboard API is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    const workbench = new WorkbenchController({ openTab: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => { renderer = renderDetails(workbench) })
    act(() => { (buttonByText(renderer!, RESULTS_COPY.sessionTab).props.onClick as () => void)() })
    const open = renderer!.root.findAllByType('button')
      .find(button => button.props.className === 'harness-comfyui-media-viewer-button')!
    act(() => { (open.props.onClick as () => void)() })

    await act(async () => {
      await (renderer!.root.findByProps({
        className: 'harness-comfyui-media-viewer-copy-button',
      }).props.onClick as () => Promise<void>)()
    })

    expect(renderer!.root.findByProps({ className: 'harness-comfyui-media-viewer-copy-button' }).props.children)
      .toBe(RESULTS_COPY.runIdCopyFailed)
    expect(renderer!.root.findByProps({
      className: 'harness-comfyui-media-viewer-copy-announcement',
    }).props.children).toBe(RESULTS_COPY.runIdCopyApiUnavailable)
    act(() => renderer!.unmount())
  })

  it('asks the user to retry or select the Run ID when clipboard permission is denied', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: async () => { throw new Error('permission denied') } } })
    const workbench = new WorkbenchController({ openTab: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => { renderer = renderDetails(workbench) })
    act(() => { (buttonByText(renderer!, RESULTS_COPY.sessionTab).props.onClick as () => void)() })
    const open = renderer!.root.findAllByType('button')
      .find(button => button.props.className === 'harness-comfyui-media-viewer-button')!
    act(() => { (open.props.onClick as () => void)() })

    await act(async () => {
      await (renderer!.root.findByProps({
        className: 'harness-comfyui-media-viewer-copy-button',
      }).props.onClick as () => Promise<void>)()
    })

    expect(renderer!.root.findByProps({ className: 'harness-comfyui-media-viewer-copy-button' }).props.children)
      .toBe(RESULTS_COPY.runIdCopyFailed)
    expect(renderer!.root.findByProps({
      className: 'harness-comfyui-media-viewer-copy-announcement',
    }).props.children).toBe(RESULTS_COPY.runIdCopyPermissionDenied)
    act(() => renderer!.unmount())
  })

  it('ignores a completed copy after the iframe navigates to another Run ID', async () => {
    const write = deferredVoid()
    vi.stubGlobal('navigator', { clipboard: { writeText: () => write.promise } })
    const environment = installMessageWindow()
    const workbench = new WorkbenchController({ openTab: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => { renderer = renderDetails(workbench) })
    act(() => { (buttonByText(renderer!, RESULTS_COPY.sessionTab).props.onClick as () => void)() })
    const open = renderer!.root.findAllByType('button')
      .find(button => button.props.className === 'harness-comfyui-media-viewer-button')!
    act(() => { (open.props.onClick as () => void)() })
    let copyPromise!: Promise<void>
    act(() => {
      copyPromise = (renderer!.root.findByProps({
        className: 'harness-comfyui-media-viewer-copy-button',
      }).props.onClick as () => Promise<void>)()
    })
    act(() => environment.dispatch({
      origin: 'http://127.0.0.1:4173',
      source: iframeContentWindow,
      data: { type: GENERATION_MEDIA_VIEWER_CURRENT_MESSAGE_TYPE, mediaId: 'media_4', runId: 'run_2' },
    }))
    await act(async () => {
      write.resolve()
      await copyPromise
    })

    expect(renderer!.root.findByProps({ className: 'harness-comfyui-media-viewer-run-id-value' }).props.children)
      .toBe('run_2')
    expect(renderer!.root.findByProps({ className: 'harness-comfyui-media-viewer-copy-button' }).props.children)
      .toBe(RESULTS_COPY.copyRunId)
    expect(renderer!.root.findByProps({
      className: 'harness-comfyui-media-viewer-copy-announcement',
    }).props.children).toBe('')
    act(() => renderer!.unmount())
  })

  for (const completion of ['resolve', 'reject'] as const) {
    it(`ignores an old ${completion} after the media Modal closes and reopens`, async () => {
      const write = deferredVoid()
      vi.stubGlobal('navigator', { clipboard: { writeText: () => write.promise } })
      const workbench = new WorkbenchController({ openTab: vi.fn() })
      let renderer: ReturnType<typeof create>
      act(() => { renderer = renderDetails(workbench) })
      act(() => { (buttonByText(renderer!, RESULTS_COPY.sessionTab).props.onClick as () => void)() })
      const open = renderer!.root.findAllByType('button')
        .find(button => button.props.className === 'harness-comfyui-media-viewer-button')!
      act(() => { (open.props.onClick as () => void)() })
      let copyPromise!: Promise<void>
      act(() => {
        copyPromise = (renderer!.root.findByProps({
          className: 'harness-comfyui-media-viewer-copy-button',
        }).props.onClick as () => Promise<void>)()
      })
      act(() => {
        (renderer!.root.findByProps({ 'aria-label': RESULTS_COPY.closeMediaViewer }).props.onClick as () => void)()
      })
      act(() => { (open.props.onClick as () => void)() })

      await act(async () => {
        if (completion === 'resolve') write.resolve()
        else write.reject(new Error('old modal clipboard rejection'))
        await copyPromise
      })

      expect(renderer!.root.findByProps({ className: 'harness-comfyui-media-viewer-run-id-value' }).props.children)
        .toBe('run_1')
      expect(renderer!.root.findByProps({ className: 'harness-comfyui-media-viewer-copy-button' }).props.children)
        .toBe(RESULTS_COPY.copyRunId)
      expect(renderer!.root.findByProps({
        className: 'harness-comfyui-media-viewer-copy-announcement',
      }).props.children).toBe('')
      act(() => renderer!.unmount())
    })
  }

  it('removes the current-media message listener when the Modal closes and when the gallery unmounts', () => {
    const environment = installMessageWindow()
    const workbench = new WorkbenchController({ openTab: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => { renderer = renderDetails(workbench) })
    act(() => { (buttonByText(renderer!, RESULTS_COPY.sessionTab).props.onClick as () => void)() })
    const open = renderer!.root.findAllByType('button')
      .find(button => button.props.className === 'harness-comfyui-media-viewer-button')!
    act(() => { (open.props.onClick as () => void)() })
    expect(environment.addEventListener).toHaveBeenCalledTimes(1)
    act(() => {
      (renderer!.root.findByProps({ 'aria-label': RESULTS_COPY.closeMediaViewer }).props.onClick as () => void)()
    })
    expect(environment.removeEventListener).toHaveBeenCalledTimes(1)
    act(() => { (open.props.onClick as () => void)() })
    expect(environment.addEventListener).toHaveBeenCalledTimes(2)
    act(() => renderer!.unmount())
    expect(environment.removeEventListener).toHaveBeenCalledTimes(2)
  })

  it('opens the complete Run error in a native error-details dialog', () => {
    const workbench = new WorkbenchController({ openTab: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => { renderer = renderDetails(workbench) })

    act(() => { (buttonByText(renderer!, '错误详情').props.onClick as () => void)() })
    renderer!.root.findByProps({ role: 'dialog', 'aria-label': '错误详情' })
    const rendered = JSON.stringify(renderer!.toJSON())
    expect(rendered).toContain('运行 ID')
    expect(rendered).toContain('错误码')
    expect(rendered).toContain('run_2')
    expect(rendered).toContain('COMFYUI_REMOTE_ERROR')
    expect(rendered).toContain('ComfyUI node 12 rejected positive_prompt because its model input is missing.')

    act(() => { (buttonByText(renderer!, '关闭').props.onClick as () => void)() })
    expect(renderer!.root.findAllByProps({ role: 'dialog', 'aria-label': '错误详情' })).toHaveLength(0)
    act(() => { (buttonByText(renderer!, '错误详情').props.onClick as () => void)() })
    act(() => {
      ;(renderer!.root.findByProps({ 'aria-label': '关闭错误详情' }).props.onClick as () => void)()
    })
    expect(renderer!.root.findAllByProps({ role: 'dialog', 'aria-label': '错误详情' })).toHaveLength(0)
    act(() => renderer!.unmount())
  })

  it('keeps a media card visible and shows catalog copy when its preview or Workflow is missing', async () => {
    const workbench = new WorkbenchController({ openTab: vi.fn() })
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

  it('changes the selected Run and closes through the owned native tab action', () => {
    const close = vi.fn()
    const workbench = new WorkbenchController({ openTab: vi.fn() })
    let renderer: ReturnType<typeof create>
    act(() => { renderer = renderDetails(workbench, close) })
    const runCards = renderer!.root.findAllByType('button').filter(button => button.props.className === 'harness-comfyui-run-card')
    expect(runCards[0]!.props['aria-pressed']).toBe(false)
    act(() => { (runCards[1]!.props.onClick as () => void)() })
    expect(renderer!.root.findAllByType('button').filter(button => button.props.className === 'harness-comfyui-run-card')[1]!.props['aria-pressed']).toBe(true)
    act(() => { (renderer!.root.findByProps({ 'aria-label': RESULTS_COPY.close }).props.onClick as () => void)() })
    expect(close).toHaveBeenCalledOnce()
    act(() => renderer!.unmount())
  })

  it('filters real media by turn and kind and keeps independent pagination', async () => {
    const workbench = new WorkbenchController({ openTab: vi.fn() })
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
    const videoViewerButton = renderer!.root.findByProps({
      'aria-label': `${RESULTS_COPY.openMediaViewer}：result.mp4`,
    })
    expect(videoViewerButton.props).not.toHaveProperty('target')
    act(() => { (videoViewerButton.props.onClick as () => void)() })
    expect(renderer!.root.findAllByType('iframe')[0]!.props.src)
      .toBe(generationMediaViewerUrl('media_6', 'session-1'))
    act(() => {
      ;(buttonByText(renderer!, RESULTS_COPY.closeMediaViewer).props.onClick as () => void)()
    })
    expect(renderer!.root.findAllByType('iframe')).toHaveLength(0)
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
