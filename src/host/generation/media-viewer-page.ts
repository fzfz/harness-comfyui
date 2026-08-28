export interface GenerationMediaViewerItem {
  readonly mediaId: string
  readonly mediaKind: 'image' | 'video'
  readonly filename: string
  readonly createdAt: number
  readonly contentUrl: string
  readonly viewerUrl: string
  readonly positivePrompt: string | null
}

export interface GenerationMediaViewerPageInput {
  readonly items: readonly GenerationMediaViewerItem[]
  readonly currentMediaId: string
}

function startupData(input: GenerationMediaViewerPageInput): string {
  return JSON.stringify(input).replaceAll('<', '\\u003c')
}

const VIEWER_STYLES = `:root {
  color-scheme: dark;
  --viewer-canvas: #111821;
  --viewer-surface: #1a2430;
  --viewer-text: #edf2f8;
  --viewer-muted: #9ba9ba;
  --viewer-action: #2855d9;
  --viewer-focus: #8fb3ff;
  --viewer-body-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Noto Sans CJK SC", sans-serif;
  --viewer-display-font: ui-rounded, "SF Pro Rounded", "PingFang SC", var(--viewer-body-font);
  --viewer-data-font: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}
* { box-sizing: border-box; }
html, body { min-height: 100%; }
body {
  margin: 0;
  color: var(--viewer-text);
  background: var(--viewer-canvas);
  font-family: var(--viewer-body-font);
}
button, video { font: inherit; }
button { -webkit-tap-highlight-color: transparent; }
button:focus-visible, video:focus-visible {
  outline: 3px solid var(--viewer-focus);
  outline-offset: 4px;
}
.visually-hidden {
  position: fixed;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.media-viewer {
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto minmax(360px, 1fr) auto;
  background:
    radial-gradient(circle at 50% 44%, rgba(40, 85, 217, 0.09), transparent 42%),
    var(--viewer-canvas);
}
.viewer-header {
  min-height: 66px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 12px clamp(20px, 4vw, 56px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.viewer-heading { display: flex; align-items: baseline; gap: 14px; }
.viewer-heading p,
.viewer-heading h1,
.current-media-meta strong,
.current-media-meta span { margin: 0; }
.viewer-heading p,
.current-media-meta strong,
.current-media-meta span {
  font-family: var(--viewer-data-font);
  font-size: 11px;
  letter-spacing: 0.08em;
}
.viewer-heading p,
.current-media-meta span { color: var(--viewer-muted); }
.viewer-heading h1 {
  font-family: var(--viewer-display-font);
  font-size: clamp(18px, 2vw, 24px);
  letter-spacing: -0.02em;
}
.current-media-meta {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 16px;
}
.current-media-meta strong { font-size: 14px; }
.current-media-meta span {
  max-width: min(58vw, 680px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.media-stage {
  min-height: 0;
  position: relative;
  display: grid;
  place-items: center;
  padding: 18px clamp(78px, 10vw, 136px);
}
.media-frame {
  width: min(78vw, 980px);
  height: min(56dvh, 660px);
  min-width: 0;
  min-height: 0;
  display: grid;
  place-items: center;
  filter: drop-shadow(0 24px 60px rgba(0, 0, 0, 0.32));
}
.media-content,
.media-content img,
.media-content video {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  max-height: 100%;
}
.media-content img,
.media-content video {
  display: block;
  object-fit: contain;
}
.media-error {
  max-width: 560px;
  margin: 0;
  padding: 18px 22px;
  color: #f7dfe2;
  background: rgba(128, 35, 48, 0.34);
  border: 1px solid rgba(255, 154, 166, 0.42);
  border-radius: 12px;
  line-height: 1.6;
}
.nav-button {
  position: absolute;
  top: 50%;
  align-self: center;
  transform: translateY(-50%);
  width: 104px;
  min-height: 88px;
  display: grid;
  place-items: center;
  gap: 7px;
  padding: 12px 8px;
  color: #f1f5fa;
  background: rgba(255, 255, 255, 0.08);
  border: 0;
  border-radius: 18px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(14px);
  cursor: pointer;
}
.nav-button:hover:not(:disabled) { background: rgba(40, 85, 217, 0.46); }
.nav-button:disabled { cursor: not-allowed; opacity: 0.28; }
.nav-newer { left: clamp(16px, 3vw, 44px); }
.nav-older { right: clamp(16px, 3vw, 44px); }
.nav-icon { font-size: 34px; font-weight: 300; line-height: 0.7; }
.nav-copy { font-size: 12px; line-height: 1.35; }
.nav-time { color: var(--viewer-muted); font: 10px var(--viewer-data-font); }
.prompt-panel {
  max-height: 27dvh;
  overflow-y: auto;
  padding: 18px clamp(24px, 8vw, 128px) 22px;
  color: #e7edf5;
  background: var(--viewer-surface);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.prompt-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
}
.prompt-heading h2,
.prompt-heading span,
.positive-prompt { margin: 0; }
.prompt-heading h2 { font: 600 14px var(--viewer-display-font); }
.prompt-heading span { color: var(--viewer-muted); font: 10px var(--viewer-data-font); }
.positive-prompt {
  font-size: clamp(13px, 1.3vw, 16px);
  line-height: 1.7;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.positive-prompt[data-state="missing"] { color: var(--viewer-muted); }
@media (max-width: 640px) {
  .media-viewer { grid-template-rows: auto minmax(330px, 58dvh) auto; }
  .viewer-header { align-items: flex-start; padding: 12px 16px; }
  .viewer-heading { display: grid; gap: 2px; }
  .viewer-heading p { display: none; }
  .current-media-meta { display: grid; justify-items: end; gap: 2px; }
  .current-media-meta span { max-width: 54vw; }
  .media-stage { padding: 12px 56px; }
  .media-frame { width: 100%; max-width: none; height: 100%; }
  .nav-button { width: 44px; min-height: 70px; border-radius: 13px; }
  .nav-newer { left: 6px; }
  .nav-older { right: 6px; }
  .nav-copy, .nav-time { display: none; }
  .prompt-panel { max-height: none; padding: 16px 18px 22px; }
}
@media (prefers-reduced-motion: reduce) {
  .nav-button { transition: none; }
}
@media (prefers-reduced-motion: no-preference) {
  .nav-button { transition: background-color 140ms ease, opacity 140ms ease; }
}`

const VIEWER_SCRIPT = `(() => {
  'use strict'
  const dataElement = document.getElementById('media-viewer-data')
  if (dataElement === null || dataElement.textContent === null) throw new Error('Media viewer startup data is missing.')
  const data = JSON.parse(dataElement.textContent)
  let currentIndex = data.items.findIndex(item => item.mediaId === data.currentMediaId)
  if (currentIndex < 0) throw new Error('Current media is not part of this Session.')

  const element = id => {
    const value = document.getElementById(id)
    if (value === null) throw new Error('Media viewer element is missing: ' + id)
    return value
  }
  const mediaPosition = element('media-position')
  const mediaTitle = element('media-title')
  const mediaTime = element('media-time')
  const mediaContent = element('media-content')
  const mediaError = element('media-error')
  const newerButton = element('nav-newer')
  const olderButton = element('nav-older')
  const newerLabel = element('newer-label')
  const olderLabel = element('older-label')
  const newerTime = element('newer-time')
  const olderTime = element('older-time')
  const promptState = element('prompt-state')
  const positivePrompt = element('positive-prompt')
  const announcement = element('media-announcement')
  const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium' })
  const shortTime = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

  const formattedTime = item => dateTime.format(new Date(item.createdAt))
  const formattedShortTime = item => shortTime.format(new Date(item.createdAt))

  function configureDirection(button, labelElement, timeElement, direction, item, itemIndex) {
    if (item === undefined) {
      const boundary = direction === '较新' ? '当前媒体已是本会话最新媒体' : '当前媒体已是本会话最早媒体'
      button.disabled = true
      button.setAttribute('aria-label', boundary)
      labelElement.textContent = direction === '较新' ? '已是本会话最新媒体' : '已是本会话最早媒体'
      timeElement.textContent = ''
      return
    }
    button.disabled = false
    button.setAttribute(
      'aria-label',
      '切换到' + direction + '的媒体，第 ' + (itemIndex + 1) + ' / ' + data.items.length
        + ' 项，文件名 ' + item.filename + '，生成时间 ' + formattedTime(item),
    )
    labelElement.textContent = direction
    timeElement.textContent = formattedShortTime(item)
  }

  function renderMedia(item) {
    const media = document.createElement(item.mediaKind === 'video' ? 'video' : 'img')
    media.src = item.contentUrl
    if (item.mediaKind === 'video') {
      media.controls = true
      media.preload = 'metadata'
      media.setAttribute('aria-label', item.filename + ' 视频')
    } else {
      media.alt = item.filename + ' 图片'
    }
    media.addEventListener('error', () => {
      mediaContent.hidden = true
      mediaError.hidden = false
    })
    mediaContent.hidden = false
    mediaError.hidden = true
    mediaContent.replaceChildren(media)
  }

  function render() {
    const item = data.items[currentIndex]
    mediaPosition.textContent = (currentIndex + 1) + ' / ' + data.items.length
    mediaTitle.textContent = item.filename
    mediaTime.textContent = formattedTime(item)
    renderMedia(item)
    if (item.positivePrompt === null) {
      promptState.textContent = '未保存'
      positivePrompt.dataset.state = 'missing'
      positivePrompt.textContent = '这项媒体的生成记录没有保存正面提示词。'
    } else {
      promptState.textContent = '生成时保存'
      positivePrompt.dataset.state = 'present'
      positivePrompt.textContent = item.positivePrompt
    }
    configureDirection(newerButton, newerLabel, newerTime, '较新', data.items[currentIndex - 1], currentIndex - 1)
    configureDirection(olderButton, olderLabel, olderTime, '较早', data.items[currentIndex + 1], currentIndex + 1)
  }

  function move(delta) {
    const targetIndex = currentIndex + delta
    if (targetIndex < 0 || targetIndex >= data.items.length) return
    currentIndex = targetIndex
    render()
    const item = data.items[currentIndex]
    history.replaceState(null, '', item.viewerUrl)
    announcement.textContent = '已切换到第 ' + (currentIndex + 1) + ' / ' + data.items.length
      + ' 项媒体：' + item.filename + '，生成时间 ' + formattedTime(item)
  }

  newerButton.addEventListener('click', () => move(-1))
  olderButton.addEventListener('click', () => move(1))
  window.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    move(event.key === 'ArrowLeft' ? -1 : 1)
  })
  render()
})()`

export function renderGenerationMediaViewerPage(input: GenerationMediaViewerPageInput): string {
  if (!input.items.some(item => item.mediaId === input.currentMediaId)) {
    throw new TypeError('Current media is not part of the supplied Session sequence.')
  }
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>本会话媒体</title>
  <style>${VIEWER_STYLES}</style>
</head>
<body>
  <main id="media-viewer" class="media-viewer">
    <header class="viewer-header">
      <div class="viewer-heading"><p>SESSION MEDIA</p><h1>本会话媒体</h1></div>
      <div class="current-media-meta">
        <strong id="media-position"></strong>
        <span><time id="media-time"></time> · <span id="media-title"></span></span>
      </div>
    </header>
    <section id="media-stage" class="media-stage" aria-label="当前媒体">
      <button id="nav-newer" class="nav-button nav-newer" type="button">
        <span class="nav-icon" aria-hidden="true">‹</span><strong id="newer-label" class="nav-copy"></strong><time id="newer-time" class="nav-time"></time>
      </button>
      <div class="media-frame">
        <div id="media-content" class="media-content"></div>
        <p id="media-error" class="media-error" hidden>媒体文件不存在。请返回会话并刷新本会话媒体列表。</p>
      </div>
      <button id="nav-older" class="nav-button nav-older" type="button">
        <span class="nav-icon" aria-hidden="true">›</span><strong id="older-label" class="nav-copy"></strong><time id="older-time" class="nav-time"></time>
      </button>
    </section>
    <section class="prompt-panel" aria-labelledby="positive-prompt-title">
      <div class="prompt-heading"><h2 id="positive-prompt-title">正面提示词</h2><span id="prompt-state"></span></div>
      <p id="positive-prompt" class="positive-prompt"></p>
    </section>
    <p id="media-announcement" class="visually-hidden" aria-live="polite"></p>
  </main>
  <script id="media-viewer-data" type="application/json">${startupData(input)}</script>
  <script>${VIEWER_SCRIPT}</script>
</body>
</html>`
}
