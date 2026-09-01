import { mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'

import {
  desktopWorktreeStatus,
  loadDesktopProductionContext,
  startDesktopWorktree,
  stopDesktopWorktree,
} from '../../scripts/desktop/worktree.mjs'
import { GenerationRuntime } from '../../src/host/generation/generation-runtime.ts'

const active = []

afterEach(async () => {
  for (const fixture of active.splice(0).reverse()) {
    await stopDesktopWorktree(fixture.context).catch(() => undefined)
    await fixture.start?.catch(() => undefined)
    await rm(fixture.context.runtimeRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

async function findFreePort() {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('cannot reserve a Desktop test port')
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
  return address.port
}

async function desktopMobilePortAvailable(port) {
  const server = createServer()
  try {
    await new Promise((resolveListen, reject) => {
      server.once('error', reject)
      server.listen(port, '0.0.0.0', resolveListen)
    })
    return true
  } catch (error) {
    if (error?.code === 'EADDRINUSE') return false
    throw error
  } finally {
    if (server.listening) {
      await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
    }
  }
}

async function assertDesktopMobilePortAvailable(port) {
  if (!await desktopMobilePortAvailable(port)) throw new Error(`Desktop mobile bridge port ${port} is occupied`)
}

async function waitForDesktopMobilePort(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!await desktopMobilePortAvailable(port)) return
    await delay(50)
  }
  throw new Error(`timed out waiting for Desktop mobile bridge port ${port}`)
}

async function waitForPath(path, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await readFile(path)
      return
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await delay(50)
  }
  throw new Error(`timed out waiting for ${path}`)
}

async function connectDesktopPage(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  let target
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        target = targets.find(candidate => candidate.type === 'page' && candidate.title === 'DeepSeek Harness')
        if (target?.webSocketDebuggerUrl) break
      }
    } catch {
      // Electron has not opened its remote-debugging listener yet.
    }
    await delay(100)
  }
  if (target?.webSocketDebuggerUrl === undefined) throw new Error('timed out waiting for the DSH Desktop page target')

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let commandId = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    const resolveCommand = pending.get(message.id)
    if (resolveCommand === undefined) return
    pending.delete(message.id)
    resolveCommand(message)
  })
  const command = (method, params = {}) => new Promise((resolveCommand, reject) => {
    const id = ++commandId
    pending.set(id, message => {
      if (message.error !== undefined) reject(new Error(message.error.message))
      else resolveCommand(message.result)
    })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails !== undefined) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    }
    return result.result.value
  }
  return { close: () => socket.close(), command, evaluate }
}

async function connectDesktopBrowser(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  let webSocketDebuggerUrl
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) {
        const version = await response.json()
        if (typeof version.webSocketDebuggerUrl === 'string') {
          webSocketDebuggerUrl = version.webSocketDebuggerUrl
          break
        }
      }
    } catch {
      // Electron has not opened its browser debugging endpoint yet.
    }
    await delay(100)
  }
  if (webSocketDebuggerUrl === undefined) throw new Error('timed out waiting for the DSH Desktop browser target')

  const socket = new WebSocket(webSocketDebuggerUrl)
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let commandId = 0
  const pending = new Map()
  const events = []
  const waiters = new Set()
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    if (message.id !== undefined) {
      const resolveCommand = pending.get(message.id)
      if (resolveCommand === undefined) return
      pending.delete(message.id)
      resolveCommand(message)
      return
    }
    if (message.method !== 'Browser.downloadWillBegin' && message.method !== 'Browser.downloadProgress') return
    events.push(message)
    for (const waiter of [...waiters]) {
      if (waiter.accept(message)) waiter.resolve(message.params)
    }
  })
  const command = (method, params = {}) => new Promise((resolveCommand, reject) => {
    const id = ++commandId
    pending.set(id, message => {
      if (message.error !== undefined) reject(new Error(message.error.message))
      else resolveCommand(message.result)
    })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const waitForEvent = (method, accept, eventTimeoutMs = 60_000) => {
    const existing = events.find(message => message.method === method && accept(message.params))
    if (existing !== undefined) return Promise.resolve(existing.params)
    return new Promise((resolveEvent, reject) => {
      const waiter = {
        accept: message => message.method === method && accept(message.params),
        resolve(params) {
          clearTimeout(timer)
          waiters.delete(waiter)
          resolveEvent(params)
        },
      }
      const timer = setTimeout(() => {
        waiters.delete(waiter)
        const observed = events.filter(message => message.method === method).map(message => message.params)
        reject(new Error(`timed out waiting for ${method}; observed=${JSON.stringify(observed)}`))
      }, eventTimeoutMs)
      waiters.add(waiter)
    })
  }
  return { close: () => socket.close(), command, waitForEvent }
}

async function expectCompletedDownload(browser, expected) {
  const willBegin = await browser.waitForEvent(
    'Browser.downloadWillBegin',
    event => event.url === expected.url,
  )
  expect(willBegin.url).toBe(expected.url)
  expect(willBegin.suggestedFilename).toBe(expected.filename)
  const progress = await browser.waitForEvent(
    'Browser.downloadProgress',
    event => event.guid === willBegin.guid && (event.state === 'completed' || event.state === 'canceled'),
  )
  if (progress.state === 'canceled') {
    throw new Error(
      `Desktop download canceled: url=${willBegin.url} suggestedFilename=${willBegin.suggestedFilename} receivedBytes=${progress.receivedBytes}`,
    )
  }
  expect(progress.receivedBytes).toBe(expected.byteLength)
  const downloaded = await readFile(resolve(expected.downloadPath, expected.filename))
  expect(downloaded).toEqual(Buffer.from(expected.bytes))
  return { willBegin, progress }
}

async function desktopPageTargetCount(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  if (!response.ok) throw new Error(`Desktop debugger target list failed with ${response.status}`)
  return (await response.json()).filter(target => target.type === 'page').length
}

async function waitForValue(page, expression, accept, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  let value
  while (Date.now() < deadline) {
    try {
      value = await page.evaluate(expression)
    } catch {
      await delay(100)
      continue
    }
    if (accept(value)) return value
    await delay(100)
  }
  throw new Error(`timed out waiting for Desktop page state; last value was ${JSON.stringify(value)}`)
}

async function clickMainFrameElement(page, selector) {
  const point = await page.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!(element instanceof HTMLElement)) return null
    element.scrollIntoView({ block: 'center', inline: 'center' })
    const bounds = element.getBoundingClientRect()
    return {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    }
  })()`)
  if (point === null) throw new Error(`Desktop element is unavailable: ${selector}`)
  if (point.x < 0 || point.x > point.viewportWidth || point.y < 0 || point.y > point.viewportHeight) {
    throw new Error(`Desktop element is outside the viewport after scrolling: ${selector} at ${JSON.stringify(point)}`)
  }
  await page.command('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1,
  })
  await page.command('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1,
  })
}

async function openSettings(page) {
  await waitForValue(
    page,
    `(() => {
      const trigger = [...document.querySelectorAll('button[aria-haspopup="dialog"][aria-expanded]')]
        .find(node => !node.hasAttribute('aria-label') && /^(|设置|Settings)$/.test(node.textContent?.trim() ?? ''))
      if (!trigger) return false
      trigger.click()
      return true
    })()`,
    value => value === true,
  )
  await waitForValue(
    page,
    `document.querySelector('[role="dialog"]')?.textContent?.includes('图片读取') === true`,
    value => value === true,
  )
}

async function openComposerModelMenu(page) {
  await waitForValue(
    page,
    `(() => {
      const trigger = [...document.querySelectorAll('button[aria-haspopup="menu"]')]
        .find(node => node.getAttribute('aria-label')?.startsWith('选择模型'))
      if (!trigger) return false
      trigger.click()
      return true
    })()`,
    value => value === true,
  )
  await waitForValue(
    page,
    `(() => {
      const menu = document.querySelector('[role="menu"][aria-label="模型与推理等级"]')
      const model = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])]
        .find(node => node.querySelector('span')?.textContent?.trim() === '模型')
      if (!model) return false
      model.click()
      return true
    })()`,
    value => value === true,
  )
  await waitForValue(
    page,
    `document.querySelector('[role="menu"][aria-label="模型与推理等级"] [role="searchbox"]') !== null`,
    value => value === true,
  )
}

async function searchComposerModels(page, query) {
  await page.evaluate(`(() => {
    const input = document.querySelector('[role="menu"][aria-label="模型与推理等级"] [role="searchbox"]')
    if (!(input instanceof HTMLInputElement)) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, ${JSON.stringify(query)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  return waitForValue(
    page,
    `(() => {
      const menu = document.querySelector('[role="menu"][aria-label="模型与推理等级"]')
      const input = menu?.querySelector('[role="searchbox"]')
      if (!(input instanceof HTMLInputElement) || input.value !== ${JSON.stringify(query)}) return null
      return [...menu.querySelectorAll('[role="menuitemradio"]')].map(option => ({
        name: option.getAttribute('title'),
        openCodeGo: option.closest('[role="group"]')?.querySelector('[id$="-opencode-go"]') !== null,
      }))
    })()`,
    value => value !== null,
  )
}

async function seedSavedDesktopSession(context) {
  const fromDesktop = async name => import(pathToFileURL(
    resolve(context.desktopSource, 'node_modules', name, 'lib/index.js'),
  ).href)
  const [sessions, persistence, storage, storageJson, storageDomain, workspace] = await Promise.all([
    fromDesktop('@deepseek-ai/dsh-session'),
    fromDesktop('@deepseek-ai/dsh-session-persistence-jsonl'),
    fromDesktop('@deepseek-ai/dsh-storage'),
    fromDesktop('@deepseek-ai/dsh-storage-json'),
    fromDesktop('@deepseek-ai/dsh-storage-domain'),
    fromDesktop('@deepseek-ai/dsh-workspace'),
  ])
  const ctx = new Context()
  const fibers = []
  try {
    fibers.push(await ctx.plugin(sessions.default, {}))
    fibers.push(await ctx.plugin(persistence.default, {
      root: resolve(context.dshHome, 'sessions'),
      compression: 'zstd',
      writeBatchMaxDelayMs: 1,
    }))
    fibers.push(await ctx.plugin(storage.default, {}))
    fibers.push(await ctx.plugin(storageJson, { root: resolve(context.dshHome, 'storages') }))
    fibers.push(await ctx.plugin(storageDomain, { backend: 'json' }))
    fibers.push(await ctx.plugin(workspace.default, {}))

    const sessionId = 'session-desktop-media'
    const session = ctx.sessions.create(sessionId, {
      meta: {
        cwd: context.startupWorkspacePath,
        agentPreset: 'harness-comfyui-cli-candidate',
      },
    })
    session.append('session/title', {
      title: 'Desktop media session',
      messageSeqs: [],
      source: { kind: 'user' },
    })
    session.append('turn/start', { turn: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await ctx.sessions.flush(session)
    const ownedWorkspace = await ctx.workspaceRegistry.create(context.startupWorkspacePath)
    await ownedWorkspace.attachSession(session.id)
    return { sessionId, workspaceId: String(ownedWorkspace.id) }
  } finally {
    for (const fiber of fibers.reverse()) await fiber.dispose()
    await ctx.fiber.dispose()
  }
}

async function seedDesktopMedia(context, identity) {
  const olderGifBytes = Uint8Array.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
    0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
    0x44, 0x01, 0x00, 0x3b,
  ])
  const newerGifBytes = Uint8Array.from(olderGifBytes)
  newerGifBytes.set([0xff, 0x00, 0x00, 0x00, 0xff, 0x00], 13)
  const older = {
    runId: 'run_desktop_media_older', promptId: '0193f85c-86fb-4ad9-8d2b-28cf39e8b041',
    mediaId: 'media_desktop_older', filename: 'desktop-older.gif',
  }
  const newer = {
    runId: 'run_desktop_media_newer', promptId: '0193f85c-86fb-4ad9-8d2b-28cf39e8b042',
    mediaId: 'media_desktop_newer', filename: 'desktop-newer.gif',
  }
  const runIds = [older.runId, newer.runId]
  const promptIds = [older.promptId, newer.promptId]
  const mediaIds = [older.mediaId, newer.mediaId]
  let currentTime = 1_700_000_000_000
  const runtime = new GenerationRuntime({
    runRepositoryFile: resolve(context.runtimeRoot, 'data/runs.sqlite'),
    runDirectory: resolve(context.runtimeRoot, 'runs'),
    savedMediaDirectory: resolve(context.runtimeRoot, 'saved-media'),
    preparer: {
      async prepare() {
        return {
          instanceId: 'desktop-test-instance',
          instanceTitle: 'Desktop Test ComfyUI',
          templateTitle: 'Desktop Test Workflow',
          sourceSnapshot: { template_id: 'desktop-test-template' },
          actualWorkflow: { version: 0.4, marker: 'desktop media modal' },
          apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } },
          expectedOutputNodeIds: ['3'],
          connection: { url: 'http://127.0.0.1:9', origin: 'http://127.0.0.1:9', authorization: null },
        }
      },
    },
    transport: {
      async submit(input) {
        if (!input.onRequestStart()) throw new Error('Desktop test Generation submission was not accepted')
        return { promptId: input.promptId }
      },
      async observe(input) {
        return {
          status: 'success',
          outputs: [{
            nodeId: '3', outputIndex: 0, mediaKind: 'image',
            filename: input.promptId === newer.promptId ? newer.filename : older.filename,
            subfolder: '', type: 'output',
          }],
        }
      },
      async download(input) {
        return {
          bytes: input.output.filename === newer.filename ? newerGifBytes : olderGifBytes,
          mediaType: 'image/gif',
        }
      },
    },
    createRunId: () => runIds.shift(),
    createPromptId: () => promptIds.shift(),
    createMediaId: () => mediaIds.shift(),
    now: () => currentTime,
  })
  try {
    await runtime.acceptGeneration(
      { ...identity, turn: 1, callId: 'call_desktop_media_older' },
      {
        title: 'Desktop older media modal',
        instanceId: 'desktop-test-instance',
        templateId: 'desktop-test-template',
        model: null,
        parameters: { positive_prompt: 'desktop older media modal' },
        loras: [],
      },
    )
    for (let step = 0; step < 4; step += 1) await runtime.advance()
    currentTime += 1_000
    await runtime.acceptGeneration(
      { ...identity, turn: 1, callId: 'call_desktop_media_newer' },
      {
        title: 'Desktop newer media modal',
        instanceId: 'desktop-test-instance',
        templateId: 'desktop-test-template',
        model: null,
        parameters: { positive_prompt: 'desktop newer media modal' },
        loras: [],
      },
    )
    for (let step = 0; step < 4; step += 1) await runtime.advance()
  } finally {
    runtime.close()
  }
  return { newer, older, newerGifBytes, olderGifBytes }
}

describe('live DSH Desktop production integration', () => {
  it('loads the project environment, workspace, Preset, and corrected OpenCode Go model catalog through preview', async () => {
    const base = await loadDesktopProductionContext({ desktopSourceRoot: process.cwd() })
    expect(await desktopWorktreeStatus(base)).toEqual({ status: 'stopped' })
    const defaultProductionPortWasAvailable = await desktopMobilePortAvailable(43127)
    let mobileBridgePort = await findFreePort()
    while (mobileBridgePort === 43127) mobileBridgePort = await findFreePort()
    await assertDesktopMobilePortAvailable(mobileBridgePort)

    const repositoryLockfile = resolve(base.repositoryRoot, 'pnpm-lock.yaml')
    const repositoryLockfileBefore = await readFile(repositoryLockfile, 'utf8')
    await mkdir(resolve(base.repositoryRoot, '.local'), { recursive: true })
    const runtimeRoot = await mkdtemp(resolve(base.repositoryRoot, '.local/desktop-live-'))
    const runtimeHome = resolve(runtimeRoot, 'home')
    const legacyDshHome = resolve(runtimeRoot, 'legacy-production-dsh-home')
    const environmentFilePath = resolve(runtimeRoot, 'desktop.env')
    const startupWorkspacePath = resolve(runtimeRoot, 'workspace')
    await writeFile(
      environmentFilePath,
      `OPENCODE_GO_API_KEY=desktop-live-test\nCOMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT=${mobileBridgePort}\n`,
      'utf8',
    )
    await mkdir(startupWorkspacePath)
    const context = {
      ...base,
      runtimeRoot,
      runtimeHome,
      dshHome: resolve(runtimeHome, relative(base.runtimeHome, base.dshHome)),
      pidFile: resolve(runtimeRoot, 'desktop.pid'),
      harnessLog: resolve(runtimeHome, relative(base.runtimeHome, base.harnessLog)),
      legacyDshHome,
      environmentFilePath,
      startupWorkspacePath,
      mobileBridgePort,
    }
    const identity = await seedSavedDesktopSession({ ...context, dshHome: legacyDshHome })
    const mediaFixture = await seedDesktopMedia(context, identity)
    const fixture = { context, start: undefined }
    active.push(fixture)
    const debuggingPort = await findFreePort()
    fixture.start = startDesktopWorktree(context, { remoteDebuggingPort: debuggingPort })
    await waitForPath(context.pidFile)
    await waitForDesktopMobilePort(mobileBridgePort)
    expect(await desktopMobilePortAvailable(43127)).toBe(defaultProductionPortWasAvailable)
    expect(await readFile(repositoryLockfile, 'utf8')).toBe(repositoryLockfileBefore)

    const page = await connectDesktopPage(debuggingPort)
    const downloadPath = resolve(context.runtimeRoot, 'downloads')
    let browser = null
    let downloadBehaviorEnabled = false
    let deviceMetricsOverridden = false
    try {
      await mkdir(downloadPath)
      browser = await connectDesktopBrowser(debuggingPort)
      await browser.command('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath,
        eventsEnabled: true,
      })
      downloadBehaviorEnabled = true
      await waitForValue(page, 'window.innerWidth', value => value >= 680)
      const desktopOrigin = await page.evaluate('window.location.origin')
      const initial = await waitForValue(
        page,
        `(() => ({
          ready: document.readyState === 'complete',
          preset: document.body.innerText.includes('ComfyUI工作台预设'),
          workspaceChooser: [...document.querySelectorAll('[role="dialog"]')]
            .some(dialog => /选择工作区目录|Select Workspace Directory/i.test(dialog.textContent ?? ''))
        }))()`,
        value => value.ready && value.preset,
      )
      expect(initial.workspaceChooser).toBe(false)
      expect(resolve(context.dshHome, await readlink(resolve(context.dshHome, '.env')))).toBe(environmentFilePath)
      const profileManifest = JSON.parse(await readFile(resolve(context.dshHome, 'profiles/web/package.json'), 'utf8'))
      expect(profileManifest.dependencies['harness-comfyui']).toMatch(/^link:\.\.\/.generations\/live\//u)
      expect(await readlink(resolve(context.dshHome, 'profiles/web/node_modules/harness-comfyui')))
        .toContain(resolve(context.dshHome, 'profiles/.generations/live'))
      expect(await readFile(context.harnessLog, 'utf8')).not.toContain('migration failed')

      await openComposerModelMenu(page)
      for (const model of [
        { id: 'qwen3.8-flash', name: 'Qwen3.8 Flash' },
        { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash (2x usage)' },
        { id: 'hy4-preview', name: 'Hy4 preview' },
        { id: 'grok-4.5', name: 'Grok 4.5' },
        { id: 'grok-4.6', name: 'Grok 4.6' },
      ]) {
        expect(await searchComposerModels(page, model.id)).toEqual([{ name: model.name, openCodeGo: true }])
      }
      expect(await searchComposerModels(page, 'ox-alpha-free')).toEqual([])
      await page.evaluate(`(document.querySelector('[role="menu"][aria-label="模型与推理等级"] [role="searchbox"]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true)`)

      await openSettings(page)
      await page.evaluate(`([...document.querySelectorAll('button')]
        .find(node => node.textContent?.trim() === '图片读取')?.click(), true)`)

      const catalog = await waitForValue(
        page,
        `(() => {
          const labels = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          const selectFor = text => labels.find(label => label.querySelector('span')?.textContent?.trim() === text)?.querySelector('select')
          const provider = selectFor('系统 Provider')
          const model = selectFor('视觉模型')
          return provider && model ? {
            provider: { value: provider.value, disabled: provider.disabled, options: [...provider.options].map(option => option.value) },
            model: { value: model.value, disabled: model.disabled, options: [...model.options].map(option => option.value) },
            alerts: [...document.querySelectorAll('.harness-comfyui-image-reader-settings [role="alert"]')].length
          } : null
        })()`,
        value => value !== null && value.provider.options.length > 1,
      )
      expect(catalog).toEqual(expect.objectContaining({
        provider: expect.objectContaining({
          value: 'opencode-go',
          disabled: false,
          options: expect.arrayContaining(['deepseek-official', 'opencode-go']),
        }),
        model: expect.objectContaining({
          value: 'qwen3.7-plus',
          disabled: false,
          options: expect.arrayContaining([
            'qwen3.7-plus',
            'qwen3.8-flash',
            'glm-5.3-flash',
            'grok-4.5',
            'grok-4.6',
          ]),
        }),
        alerts: 0,
      }))
      expect(catalog.model.options).not.toContain('ox-alpha-free')

      await page.evaluate(`(() => {
        const label = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          .find(candidate => candidate.querySelector('span')?.textContent?.trim() === '系统 Provider')
        const select = label?.querySelector('select')
        if (!select) return null
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
        setter?.call(select, 'deepseek-official')
        select.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      })()`)
      const selectedModel = await waitForValue(
        page,
        `(() => {
          const label = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
            .find(candidate => candidate.querySelector('span')?.textContent?.trim() === '视觉模型')
          const select = label?.querySelector('select')
          if (!select || select.disabled) return null
          const value = [...select.options].map(option => option.value).find(value => value.length > 0)
          if (!value) return null
          const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
          setter?.call(select, value)
          select.dispatchEvent(new Event('change', { bubbles: true }))
          return value
        })()`,
        value => typeof value === 'string' && value.length > 0,
      )
      await page.evaluate(`([...document.querySelectorAll('button')]
        .find(node => node.textContent?.trim() === '保存全部配置')?.click(), true)`)
      await waitForValue(
        page,
        `document.body.innerText.includes('图片读取配置已保存，当前配置已经生效。')`,
        value => value === true,
      )

      await page.evaluate('location.reload(), true')
      await delay(300)
      await waitForValue(
        page,
        `document.readyState === 'complete' && document.body.innerText.includes('ComfyUI工作台预设')`,
        value => value === true,
      )
      await openSettings(page)
      await page.evaluate(`([...document.querySelectorAll('button')]
        .find(node => node.textContent?.trim() === '图片读取')?.click(), true)`)
      const persisted = await waitForValue(
        page,
        `(() => {
          const labels = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          const selectFor = text => labels.find(label => label.querySelector('span')?.textContent?.trim() === text)?.querySelector('select')
          const provider = selectFor('系统 Provider')
          const model = selectFor('视觉模型')
          return provider && model ? { provider: provider.value, model: model.value } : null
        })()`,
        value => value?.provider === 'deepseek-official' && value?.model === selectedModel,
      )
      expect(persisted).toEqual({ provider: 'deepseek-official', model: selectedModel })

      await page.evaluate(`(() => {
        const dialog = [...document.querySelectorAll('[role="dialog"]')].find(candidate => {
          const labelId = candidate.getAttribute('aria-labelledby')
          return labelId && /^(设置|Settings)$/.test(document.getElementById(labelId)?.textContent?.trim() ?? '')
        })
        const close = [...(dialog?.querySelectorAll('button') ?? [])]
          .find(button => /^(关闭|Close)$/.test(button.textContent?.trim() ?? ''))
        close?.click()
        return close !== undefined
      })()`)
      await waitForValue(
        page,
        `[...document.querySelectorAll('[role="dialog"]')].every(candidate => {
          const labelId = candidate.getAttribute('aria-labelledby')
          return !labelId || !/^(设置|Settings)$/.test(document.getElementById(labelId)?.textContent?.trim() ?? '')
        })`,
        value => value === true,
      )
      await waitForValue(
        page,
        `[...document.querySelectorAll('[role="treeitem"]')]
          .some(node => node.textContent?.includes('Desktop media session'))`,
        value => value === true,
      )
      await page.evaluate(`(() => {
        const session = [...document.querySelectorAll('[role="treeitem"]')]
          .find(node => node.textContent?.includes('Desktop media session'))
        session?.click()
        return session !== undefined
      })()`)
      await waitForValue(
        page,
        `[...document.querySelectorAll('[role="treeitem"]')]
          .some(node => node.textContent?.includes('Desktop media session') && node.getAttribute('aria-selected') === 'true')`,
        value => value === true,
      )
      await page.evaluate(`(document.querySelector('.harness-comfyui-sidebar-entry')?.click(), true)`)
      await waitForValue(
        page,
        `(() => {
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.sessionId}"]')
          return drawer === null ? null : { media: drawer.textContent?.includes('2 个媒体') === true }
        })()`,
        value => value?.media === true,
      )
      await page.evaluate(`([...document.querySelectorAll('[role="tab"]')]
        .find(node => node.textContent?.trim() === '本会话媒体')?.click(), true)`)
      await waitForValue(
        page,
        `document.querySelectorAll('.harness-comfyui-media-viewer-button').length`,
        value => value === 2,
      )
      const pageTargetsBefore = await desktopPageTargetCount(debuggingPort)
      await page.evaluate(`(document.querySelector('.harness-comfyui-media-viewer-button')?.click(), true)`)
      const viewer = await waitForValue(
        page,
        `(() => {
          const dialog = document.querySelector('[role="dialog"].harness-comfyui-media-viewer-modal')
          const frame = dialog?.querySelector('.harness-comfyui-media-viewer-frame')
          return dialog && frame ? {
            modal: dialog.getAttribute('aria-modal'),
            title: frame.title,
            url: frame.getAttribute('src'),
            loaded: frame.contentDocument?.querySelector('.media-viewer') !== null,
            runId: dialog.querySelector('.harness-comfyui-media-viewer-run-id-value')?.textContent ?? '',
            downloadButton: dialog.querySelector('button[aria-label^="下载当前原文件："]')?.textContent?.trim() ?? '',
            body: frame.contentDocument?.body?.innerText ?? ''
          } : null
        })()`,
        value => value?.loaded === true,
      )
      expect(viewer).toMatchObject({
        modal: 'true',
        title: `媒体查看器：${mediaFixture.newer.filename}`,
        url: expect.stringContaining(`/api/harness-comfyui/media/${mediaFixture.newer.mediaId}/view?session_id=session-desktop-media`),
        runId: mediaFixture.newer.runId,
        downloadButton: '下载原文件',
      })
      expect(viewer.body).toContain(mediaFixture.newer.filename)

      await clickMainFrameElement(
        page,
        `button[aria-label=${JSON.stringify(`下载当前原文件：${mediaFixture.newer.filename}`)}]`,
      )
      const newerDownload = await expectCompletedDownload(browser, {
        url: new URL(
          `/api/harness-comfyui/media/${mediaFixture.newer.mediaId}/download?session_id=${identity.sessionId}`,
          desktopOrigin,
        ).href,
        filename: mediaFixture.newer.filename,
        bytes: mediaFixture.newerGifBytes,
        byteLength: mediaFixture.newerGifBytes.length,
        downloadPath,
      })
      expect(newerDownload.progress.state).toBe('completed')

      await clickMainFrameElement(page, '.harness-comfyui-media-viewer-copy-button')
      const newerCopy = await waitForValue(
        page,
        `(() => {
          const dialog = document.querySelector('[role="dialog"].harness-comfyui-media-viewer-modal')
          return dialog ? {
            runId: dialog.querySelector('.harness-comfyui-media-viewer-run-id-value')?.textContent ?? '',
            button: dialog.querySelector('.harness-comfyui-media-viewer-copy-button')?.textContent ?? '',
            announcement: dialog.querySelector('.harness-comfyui-media-viewer-copy-announcement')?.textContent ?? ''
          } : null
        })()`,
        value => value?.button === '已复制',
      )
      expect(newerCopy).toEqual({
        runId: mediaFixture.newer.runId,
        button: '已复制',
        announcement: `已复制完整 Run ID：${mediaFixture.newer.runId}`,
      })

      await page.evaluate(`(() => {
        const frame = document.querySelector('.harness-comfyui-media-viewer-frame')
        const button = frame?.contentDocument?.querySelector('#nav-older')
        button?.click()
        return button !== null && button !== undefined
      })()`)
      await waitForValue(
        page,
        `document.querySelector('.harness-comfyui-media-viewer-run-id-value')?.textContent ?? ''`,
        value => value === mediaFixture.older.runId,
      )
      await clickMainFrameElement(
        page,
        `button[aria-label=${JSON.stringify(`下载当前原文件：${mediaFixture.older.filename}`)}]`,
      )
      const olderDownload = await expectCompletedDownload(browser, {
        url: new URL(
          `/api/harness-comfyui/media/${mediaFixture.older.mediaId}/download?session_id=${identity.sessionId}`,
          desktopOrigin,
        ).href,
        filename: mediaFixture.older.filename,
        bytes: mediaFixture.olderGifBytes,
        byteLength: mediaFixture.olderGifBytes.length,
        downloadPath,
      })
      expect(olderDownload.progress.state).toBe('completed')
      await clickMainFrameElement(page, '.harness-comfyui-media-viewer-copy-button')
      const olderCopy = await waitForValue(
        page,
        `(() => {
          const dialog = document.querySelector('[role="dialog"].harness-comfyui-media-viewer-modal')
          return dialog ? {
            runId: dialog.querySelector('.harness-comfyui-media-viewer-run-id-value')?.textContent ?? '',
            button: dialog.querySelector('.harness-comfyui-media-viewer-copy-button')?.textContent ?? '',
            announcement: dialog.querySelector('.harness-comfyui-media-viewer-copy-announcement')?.textContent ?? ''
          } : null
        })()`,
        value => value?.button === '已复制',
      )
      expect(olderCopy).toEqual({
        runId: mediaFixture.older.runId,
        button: '已复制',
        announcement: `已复制完整 Run ID：${mediaFixture.older.runId}`,
      })

      const geometryExpression = `(() => {
        const row = document.querySelector('.harness-comfyui-media-viewer-run-id-row')
        const frame = document.querySelector('.harness-comfyui-media-viewer-frame')
        const footer = document.querySelector('.harness-comfyui-media-viewer-footer-actions')
        const dialog = document.querySelector('[role="dialog"].harness-comfyui-media-viewer-modal')
        if (!(row instanceof HTMLElement) || !(frame instanceof HTMLIFrameElement)
          || !(footer instanceof HTMLElement) || !(dialog instanceof HTMLElement)) return null
        const rowBounds = row.getBoundingClientRect()
        const frameBounds = frame.getBoundingClientRect()
        const footerBounds = footer.getBoundingClientRect()
        return {
          viewportWidth: window.innerWidth,
          rowScrollWidth: row.scrollWidth,
          rowClientWidth: row.clientWidth,
          footerScrollWidth: footer.scrollWidth,
          footerClientWidth: footer.clientWidth,
          dialogScrollWidth: dialog.scrollWidth,
          dialogClientWidth: dialog.clientWidth,
          rowOverlapsFrame: rowBounds.bottom > frameBounds.top,
          footerOverlapsFrame: frameBounds.bottom > footerBounds.top
        }
      })()`
      const desktopGeometry = await waitForValue(
        page,
        geometryExpression,
        value => value?.viewportWidth >= 680,
      )
      expect(desktopGeometry.rowScrollWidth).toBeLessThanOrEqual(desktopGeometry.rowClientWidth)
      expect(desktopGeometry.footerScrollWidth).toBeLessThanOrEqual(desktopGeometry.footerClientWidth)
      expect(desktopGeometry.dialogScrollWidth).toBeLessThanOrEqual(desktopGeometry.dialogClientWidth)
      expect(desktopGeometry.rowOverlapsFrame).toBe(false)
      expect(desktopGeometry.footerOverlapsFrame).toBe(false)

      await page.command('Emulation.setDeviceMetricsOverride', {
        width: 600, height: 800, deviceScaleFactor: 1, mobile: false,
      })
      deviceMetricsOverridden = true
      const narrowGeometry = await waitForValue(
        page,
        geometryExpression,
        value => value?.viewportWidth < 680,
      )
      expect(narrowGeometry.rowScrollWidth).toBeLessThanOrEqual(narrowGeometry.rowClientWidth)
      expect(narrowGeometry.footerScrollWidth).toBeLessThanOrEqual(narrowGeometry.footerClientWidth)
      expect(narrowGeometry.dialogScrollWidth).toBeLessThanOrEqual(narrowGeometry.dialogClientWidth)
      expect(narrowGeometry.rowOverlapsFrame).toBe(false)
      expect(narrowGeometry.footerOverlapsFrame).toBe(false)
      await delay(300)
      expect(await desktopPageTargetCount(debuggingPort)).toBe(pageTargetsBefore)
      await page.evaluate(`([...document.querySelectorAll('button')]
        .find(node => node.getAttribute('aria-label') === '关闭媒体查看器')?.click(), true)`)
      await waitForValue(
        page,
        `document.querySelector('[role="dialog"].harness-comfyui-media-viewer-modal') === null`,
        value => value === true,
      )
    } finally {
      if (deviceMetricsOverridden) await page.command('Emulation.clearDeviceMetricsOverride').catch(() => undefined)
      if (browser !== null && downloadBehaviorEnabled) {
        await browser.command('Browser.setDownloadBehavior', { behavior: 'default' }).catch(() => undefined)
      }
      browser?.close()
      await rm(downloadPath, { recursive: true, force: true })
      page.close()
    }
  })
})
