import { runInNewContext } from 'node:vm'

import { describe, expect, it } from 'vitest'

import { GENERATION_MEDIA_VIEWER_CURRENT_MESSAGE_TYPE } from '../../src/generation/contract.ts'
import {
  renderGenerationMediaViewerPage,
  type GenerationMediaViewerItem,
} from '../../src/host/generation/media-viewer-page.ts'

const imageItem: GenerationMediaViewerItem = {
  mediaId: 'media_image',
  runId: 'run_image',
  mediaKind: 'image',
  filename: 'portrait.webp',
  createdAt: 1_725_000_000_000,
  contentUrl: '/api/harness-comfyui/media/media_image/content?session_id=session_1',
  viewerUrl: '/api/harness-comfyui/media/media_image/view?session_id=session_1',
  positivePrompt: '银发少女\n</script><script data-attack>globalThis.attacked = true</script>',
}

const videoItem: GenerationMediaViewerItem = {
  mediaId: 'media_video',
  runId: 'run_video',
  mediaKind: 'video',
  filename: 'motion.mp4',
  createdAt: 1_724_999_000_000,
  contentUrl: '/api/harness-comfyui/media/media_video/content?session_id=session_1',
  viewerUrl: '/api/harness-comfyui/media/media_video/view?session_id=session_1',
  positivePrompt: null,
}

interface FakeElement {
  readonly tagName: string
  textContent: string
  hidden: boolean
  disabled: boolean
  src: string
  alt: string
  controls: boolean
  preload: string
  naturalWidth: number
  naturalHeight: number
  videoWidth: number
  videoHeight: number
  readonly dataset: Record<string, string>
  readonly attributes: Map<string, string>
  readonly children: FakeElement[]
  readonly listeners: Map<string, (event: Record<string, unknown>) => void>
  setAttribute(name: string, value: string): void
  replaceChildren(...children: FakeElement[]): void
  addEventListener(name: string, listener: (event: Record<string, unknown>) => void): void
}

function fakeElement(tagName = 'div'): FakeElement {
  const element: FakeElement = {
    tagName: tagName.toUpperCase(),
    textContent: '',
    hidden: false,
    disabled: false,
    src: '',
    alt: '',
    controls: false,
    preload: '',
    naturalWidth: 0,
    naturalHeight: 0,
    videoWidth: 0,
    videoHeight: 0,
    dataset: {},
    attributes: new Map(),
    children: [],
    listeners: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value) },
    replaceChildren(...children) { this.children.splice(0, this.children.length, ...children) },
    addEventListener(name, listener) { this.listeners.set(name, listener) },
  }
  return element
}

function viewerData(html: string): unknown {
  const match = html.match(/<script id="media-viewer-data" type="application\/json">(?<data>[^<]*)<\/script>/u)
  if (match?.groups?.data === undefined) throw new Error('media viewer startup data is missing')
  return JSON.parse(match.groups.data) as unknown
}

function runViewer(html: string) {
  const data = viewerData(html)
  const ids = [
    'media-position', 'media-title', 'media-time', 'media-content', 'media-error',
    'nav-newer', 'nav-older', 'newer-label', 'older-label', 'newer-time', 'older-time',
    'run-id-copy', 'run-id', 'copy-state', 'media-dimensions',
    'prompt-state', 'positive-prompt', 'media-announcement',
  ] as const
  const elements = Object.fromEntries(ids.map(id => [id, fakeElement()])) as Record<(typeof ids)[number], FakeElement>
  const startup = fakeElement('script')
  startup.textContent = JSON.stringify(data)
  const windowListeners = new Map<string, (event: Record<string, unknown>) => void>()
  const replacedUrls: string[] = []
  const postedMessages: Array<{ readonly message: unknown; readonly targetOrigin: string }> = []
  const script = html.match(/<script>(?<script>[\s\S]*?)<\/script>/u)?.groups?.script
  if (script === undefined) throw new Error('media viewer browser script is missing')

  runInNewContext(script, {
    document: {
      getElementById(id: string) {
        if (id === 'media-viewer-data') return startup
        return elements[id as keyof typeof elements] ?? null
      },
      createElement(tagName: string) { return fakeElement(tagName) },
    },
    window: {
      location: { origin: 'http://127.0.0.1:4173' },
      parent: {
        postMessage(message: unknown, targetOrigin: string) { postedMessages.push({ message, targetOrigin }) },
      },
      addEventListener(name: string, listener: (event: Record<string, unknown>) => void) {
        windowListeners.set(name, listener)
      },
    },
    history: {
      replaceState(_state: unknown, _unused: string, url: string) { replacedUrls.push(url) },
    },
    navigator: {},
    Intl,
    Date,
    JSON,
    Error,
  })
  return { elements, windowListeners, replacedUrls, postedMessages }
}

describe('Generation media viewer page', () => {
  it('rejects a current media ID outside the supplied Session sequence', () => {
    expect(() => renderGenerationMediaViewerPage({
      items: [imageItem],
      currentMediaId: 'media_other_session',
    })).toThrow('Current media is not part of the supplied Session sequence')
  })

  it('renders scheme A with minimal escaped startup data for the current image', () => {
    const html = renderGenerationMediaViewerPage({ items: [imageItem], currentMediaId: imageItem.mediaId })

    expect(viewerData(html)).toEqual({ items: [imageItem], currentMediaId: imageItem.mediaId })
    expect(html).not.toContain('<script data-attack>')
    expect(html).not.toContain('.innerHTML')
    expect(html).toContain('id="media-stage"')
    expect(html).not.toContain('id="run-id-copy"')
    expect(html).not.toContain('navigator.clipboard')
    expect(html).toContain('id="media-dimensions"')
    expect(html).toContain('id="positive-prompt"')
    expect(html).toContain('aria-live="polite"')
  })

  it('posts the current media identity and shows intrinsic image and video dimensions', () => {
    const html = renderGenerationMediaViewerPage({
      items: [imageItem, videoItem],
      currentMediaId: imageItem.mediaId,
    })
    const { elements, postedMessages } = runViewer(html)

    expect(postedMessages).toEqual([{
      message: {
        type: GENERATION_MEDIA_VIEWER_CURRENT_MESSAGE_TYPE,
        mediaId: imageItem.mediaId,
        runId: imageItem.runId,
      },
      targetOrigin: 'http://127.0.0.1:4173',
    }])
    expect(elements['media-dimensions'].textContent).toBe('读取中')

    const image = elements['media-content'].children[0]!
    image.naturalWidth = 832
    image.naturalHeight = 1216
    image.listeners.get('load')?.({})
    expect(elements['media-dimensions'].textContent).toBe('832 × 1216 px')

    elements['nav-older'].listeners.get('click')?.({})
    expect(postedMessages[1]).toEqual({
      message: {
        type: GENERATION_MEDIA_VIEWER_CURRENT_MESSAGE_TYPE,
        mediaId: videoItem.mediaId,
        runId: videoItem.runId,
      },
      targetOrigin: 'http://127.0.0.1:4173',
    })
    expect(elements['media-dimensions'].textContent).toBe('读取中')

    const video = elements['media-content'].children[0]!
    video.videoWidth = 1920
    video.videoHeight = 1080
    video.listeners.get('loadedmetadata')?.({})
    expect(elements['media-dimensions'].textContent).toBe('1920 × 1080 px')

    image.naturalWidth = 2048
    image.naturalHeight = 2048
    image.listeners.get('load')?.({})
    expect(elements['media-dimensions'].textContent).toBe('1920 × 1080 px')
  })

  it('shows explicit media dimension failure states', () => {
    const html = renderGenerationMediaViewerPage({ items: [imageItem], currentMediaId: imageItem.mediaId })
    const { elements } = runViewer(html)

    const image = elements['media-content'].children[0]!
    image.listeners.get('load')?.({})
    expect(elements['media-dimensions'].textContent).toBe('尺寸不可用')
    image.listeners.get('error')?.({})
    expect(elements['media-dimensions'].textContent).toBe('尺寸不可用')
  })

  it('keeps complete media, centered controls and a separately scrolling prompt on desktop and narrow screens', () => {
    const html = renderGenerationMediaViewerPage({ items: [imageItem], currentMediaId: imageItem.mediaId })
    const styles = html.match(/<style>(?<styles>[\s\S]*?)<\/style>/u)?.groups?.styles ?? ''

    expect(styles).toContain('object-fit: contain;')
    expect(styles).toContain('align-self: center;')
    expect(styles).toContain('overflow-y: auto;')
    expect(styles).toContain('@media (max-width: 640px)')
    expect(styles).toContain('grid-template-rows: max-content minmax(330px, 58dvh) auto;')
    expect(styles).not.toContain('.prompt-panel { max-height: none;')
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(styles).toContain(':focus-visible')
  })

  it('preserves and renders a long positive prompt without truncation', () => {
    const longPrompt = Array.from(
      { length: 128 },
      (_, index) => `第 ${index + 1} 行：cinematic portrait, intricate details, balanced composition`,
    ).join('\n')
    const longPromptItem = { ...imageItem, positivePrompt: longPrompt }
    const html = renderGenerationMediaViewerPage({ items: [longPromptItem], currentMediaId: longPromptItem.mediaId })
    const data = viewerData(html) as { readonly items: readonly GenerationMediaViewerItem[] }
    const { elements } = runViewer(html)

    expect(data.items[0]?.positivePrompt).toBe(longPrompt)
    expect(elements['positive-prompt'].textContent).toBe(longPrompt)
    expect(elements['positive-prompt'].textContent).toHaveLength(longPrompt.length)
    expect(elements['positive-prompt'].textContent.startsWith('第 1 行：')).toBe(true)
    expect(elements['positive-prompt'].textContent.endsWith('balanced composition')).toBe(true)
  })

  it('switches image and video media through buttons and bare arrow keys without wrapping', () => {
    const html = renderGenerationMediaViewerPage({
      items: [imageItem, videoItem],
      currentMediaId: imageItem.mediaId,
    })
    const { elements, windowListeners, replacedUrls } = runViewer(html)

    expect(elements['media-content'].children[0]).toMatchObject({
      tagName: 'IMG', src: imageItem.contentUrl, alt: `${imageItem.filename} 图片`,
    })
    expect(elements['nav-newer'].disabled).toBe(true)
    expect(elements['nav-older'].disabled).toBe(false)
    expect(elements['positive-prompt'].textContent).toBe(imageItem.positivePrompt)

    elements['nav-older'].listeners.get('click')?.({})
    expect(elements['media-content'].children[0]).toMatchObject({
      tagName: 'VIDEO', src: videoItem.contentUrl, controls: true, preload: 'metadata',
    })
    expect(elements['positive-prompt'].dataset.state).toBe('missing')
    expect(elements['nav-older'].disabled).toBe(true)
    expect(elements['nav-older'].attributes.get('aria-label')).toBe('当前媒体已是本会话最早媒体')
    expect(elements['nav-newer'].attributes.get('aria-label'))
      .toContain(`切换到较新的媒体，第 1 / 2 项，文件名 ${imageItem.filename}`)
    expect(elements['media-announcement'].textContent).toContain(videoItem.filename)
    expect(replacedUrls).toEqual([videoItem.viewerUrl])

    elements['nav-newer'].listeners.get('click')?.({})
    expect(elements['media-content'].children[0]?.tagName).toBe('IMG')
    expect(replacedUrls).toEqual([videoItem.viewerUrl, imageItem.viewerUrl])

    let rightPrevented = false
    windowListeners.get('keydown')?.({
      key: 'ArrowRight', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
      preventDefault() { rightPrevented = true },
    })
    expect(rightPrevented).toBe(true)
    expect(elements['media-content'].children[0]?.tagName).toBe('VIDEO')
    expect(replacedUrls).toEqual([videoItem.viewerUrl, imageItem.viewerUrl, videoItem.viewerUrl])

    elements['media-content'].children[0]?.listeners.get('error')?.({})
    expect(elements['media-content'].hidden).toBe(true)
    expect(elements['media-error'].hidden).toBe(false)

    elements['nav-older'].listeners.get('click')?.({})
    expect(replacedUrls).toEqual([videoItem.viewerUrl, imageItem.viewerUrl, videoItem.viewerUrl])

    let prevented = false
    windowListeners.get('keydown')?.({
      key: 'ArrowLeft', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
      preventDefault() { prevented = true },
    })
    expect(prevented).toBe(true)
    expect(elements['media-content'].children[0]?.tagName).toBe('IMG')
    expect(replacedUrls).toEqual([videoItem.viewerUrl, imageItem.viewerUrl, videoItem.viewerUrl, imageItem.viewerUrl])

    for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const) {
      windowListeners.get('keydown')?.({
        key: 'ArrowRight', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
        [modifier]: true,
        preventDefault() { throw new Error('modified direction key must not be handled') },
      })
    }
    expect(replacedUrls).toEqual([videoItem.viewerUrl, imageItem.viewerUrl, videoItem.viewerUrl, imageItem.viewerUrl])
  })

  it('ignores a late load error from media that is no longer current', () => {
    const html = renderGenerationMediaViewerPage({
      items: [imageItem, videoItem],
      currentMediaId: imageItem.mediaId,
    })
    const { elements } = runViewer(html)
    const previousMedia = elements['media-content'].children[0]!

    elements['nav-older'].listeners.get('click')?.({})
    const currentMedia = elements['media-content'].children[0]!
    previousMedia.listeners.get('error')?.({})

    expect(elements['media-content'].children[0]).toBe(currentMedia)
    expect(elements['media-content'].hidden).toBe(false)
    expect(elements['media-error'].hidden).toBe(true)

    currentMedia.listeners.get('error')?.({})
    expect(elements['media-content'].hidden).toBe(true)
    expect(elements['media-error'].hidden).toBe(false)
  })

  it('opens a refreshed viewer on the media identified by the current viewer URL', () => {
    const html = renderGenerationMediaViewerPage({
      items: [imageItem, videoItem],
      currentMediaId: videoItem.mediaId,
    })
    const { elements, replacedUrls } = runViewer(html)

    expect(elements['media-position'].textContent).toBe('2 / 2')
    expect(elements['media-content'].children[0]).toMatchObject({
      tagName: 'VIDEO', src: videoItem.contentUrl, controls: true,
    })
    expect(elements['nav-newer'].disabled).toBe(false)
    expect(elements['nav-older'].disabled).toBe(true)
    expect(replacedUrls).toEqual([])
  })

  it('disables both directions for a Session containing one media item', () => {
    const html = renderGenerationMediaViewerPage({ items: [imageItem], currentMediaId: imageItem.mediaId })
    const { elements, replacedUrls } = runViewer(html)

    expect(elements['nav-newer'].disabled).toBe(true)
    expect(elements['nav-older'].disabled).toBe(true)
    elements['nav-newer'].listeners.get('click')?.({})
    elements['nav-older'].listeners.get('click')?.({})
    expect(replacedUrls).toEqual([])
  })
})
