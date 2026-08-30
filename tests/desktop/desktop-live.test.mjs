import { mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'

import {
  desktopWorktreeStatus,
  loadDesktopWorktreeContext,
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
  const gifBytes = Uint8Array.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
    0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
    0x44, 0x01, 0x00, 0x3b,
  ])
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
      async observe() {
        return {
          status: 'success',
          outputs: [{
            nodeId: '3', outputIndex: 0, mediaKind: 'image', filename: 'desktop-modal.gif', subfolder: '', type: 'output',
          }],
        }
      },
      async download() {
        return { bytes: gifBytes, mediaType: 'image/gif' }
      },
    },
    createRunId: () => 'run_desktop_media',
    createPromptId: () => '0193f85c-86fb-4ad9-8d2b-28cf39e8b042',
    createMediaId: () => 'media_desktop_modal',
  })
  try {
    await runtime.acceptGeneration(
      { ...identity, turn: 1, callId: 'call_desktop_media' },
      {
        title: 'Desktop media modal',
        instanceId: 'desktop-test-instance',
        templateId: 'desktop-test-template',
        model: null,
        parameters: { positive_prompt: 'desktop media modal' },
        loras: [],
      },
    )
    for (let step = 0; step < 4; step += 1) await runtime.advance()
  } finally {
    runtime.close()
  }
}

describe('live DSH Desktop integration', () => {
  it('loads the project environment, workspace, Preset, and selectable image-reader Provider through Desktop', async () => {
    const base = await loadDesktopWorktreeContext({ desktopSourceRoot: process.cwd() })
    expect(await desktopWorktreeStatus(base)).toEqual({ status: 'stopped' })
    let mobileBridgePort = await findFreePort()
    while (mobileBridgePort === 43128) mobileBridgePort = await findFreePort()
    await assertDesktopMobilePortAvailable(mobileBridgePort)

    const repositoryLockfile = resolve(base.repositoryRoot, 'pnpm-lock.yaml')
    const repositoryLockfileBefore = await readFile(repositoryLockfile, 'utf8')
    await mkdir(resolve(base.repositoryRoot, '.local'), { recursive: true })
    const runtimeRoot = await mkdtemp(resolve(base.repositoryRoot, '.local/desktop-live-'))
    const runtimeHome = resolve(runtimeRoot, 'home')
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
      environmentFilePath,
      startupWorkspacePath,
      mobileBridgePort,
    }
    const identity = await seedSavedDesktopSession(context)
    await seedDesktopMedia(context, identity)
    const fixture = { context, start: undefined }
    active.push(fixture)
    const debuggingPort = await findFreePort()
    fixture.start = startDesktopWorktree(context, { remoteDebuggingPort: debuggingPort })
    await waitForPath(context.pidFile)
    await waitForDesktopMobilePort(mobileBridgePort)
    await assertDesktopMobilePortAvailable(43128)
    expect(await readFile(repositoryLockfile, 'utf8')).toBe(repositoryLockfileBefore)

    const page = await connectDesktopPage(debuggingPort)
    try {
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

      await page.evaluate(`([...document.querySelectorAll('button')]
        .find(node => node.textContent?.trim() === '设置')?.click(), true)`)
      await waitForValue(
        page,
        `document.querySelector('[role="dialog"]')?.textContent?.includes('图片读取') === true`,
        value => value === true,
      )
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
          options: expect.arrayContaining(['qwen3.7-plus']),
        }),
        alerts: 0,
      }))

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
      await page.evaluate(`([...document.querySelectorAll('button')]
        .find(node => node.textContent?.trim() === '设置')?.click(), true)`)
      await waitForValue(
        page,
        `document.querySelector('[role="dialog"]')?.textContent?.includes('图片读取') === true`,
        value => value === true,
      )
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
          return labelId && document.getElementById(labelId)?.textContent?.trim() === '设置'
        })
        const close = [...(dialog?.querySelectorAll('button') ?? [])]
          .find(button => button.textContent?.trim() === '关闭')
        close?.click()
        return close !== undefined
      })()`)
      await waitForValue(
        page,
        `[...document.querySelectorAll('[role="dialog"]')].every(candidate => {
          const labelId = candidate.getAttribute('aria-labelledby')
          return !labelId || document.getElementById(labelId)?.textContent?.trim() !== '设置'
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
          return drawer === null ? null : { media: drawer.textContent?.includes('1 个媒体') === true }
        })()`,
        value => value?.media === true,
      )
      await page.evaluate(`([...document.querySelectorAll('[role="tab"]')]
        .find(node => node.textContent?.trim() === '本会话媒体')?.click(), true)`)
      await waitForValue(
        page,
        `document.querySelectorAll('.harness-comfyui-media-viewer-button').length`,
        value => value === 1,
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
            body: frame.contentDocument?.body?.innerText ?? ''
          } : null
        })()`,
        value => value?.loaded === true,
      )
      expect(viewer).toMatchObject({
        modal: 'true',
        title: '媒体查看器：desktop-modal.gif',
        url: expect.stringContaining('/api/harness-comfyui/media/media_desktop_modal/view?session_id=session-desktop-media'),
      })
      expect(viewer.body).toContain('desktop-modal.gif')
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
      page.close()
    }
  })
})
