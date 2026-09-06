import { mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'

import repositorySkillCatalogFixture from '../fixtures/repository-skill-catalog.json' with { type: 'json' }

import {
  desktopWorktreeStatus,
  loadDesktopProductionContext,
  startDesktopWorktree,
  stopDesktopWorktree,
} from '../../scripts/desktop/worktree.mjs'
import { GenerationRuntime } from '../../src/host/generation/generation-runtime.ts'
import { loadTestDesktopContext } from '../support/desktop-context.mjs'

const active = []
const PRODUCT_PRESET_ID = 'harness-comfyui-cli-candidate'
const REPOSITORY_SKILL_CATALOG = Object.freeze(repositorySkillCatalogFixture)
const WORKSPACE_COMFYUI_GENERATE_DESCRIPTION = 'desktop-live-workspace-comfyui-generate-description'
const USER_SKILL_NAME = 'desktop-live-unique-user-skill'
const USER_SKILL_DESCRIPTION = 'desktop-live-unique-user-skill-description'

afterEach(async () => {
  for (const fixture of active.splice(0).reverse()) {
    await stopDesktopWorktree(fixture.context).catch(() => undefined)
    await fixture.start?.catch(() => undefined)
    await fixture.close?.().catch(() => undefined)
    await rm(fixture.context.runtimeRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    for (const path of fixture.cleanupPaths ?? []) {
      await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  }
})

async function startModelRequestCaptureServer() {
  let settleRequest
  const capturedRequest = new Promise((resolveRequest, rejectRequest) => {
    settleRequest = { resolve: resolveRequest, reject: rejectRequest }
  })
  const server = createHttpServer((request, response) => {
    if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions')) {
      response.writeHead(404)
      response.end()
      return
    }

    const chunks = []
    let byteLength = 0
    request.on('data', chunk => {
      byteLength += chunk.length
      if (byteLength > 1024 * 1024) {
        request.destroy(new Error('model request exceeded 1 MiB'))
        return
      }
      chunks.push(chunk)
    })
    request.once('error', error => settleRequest.reject(error))
    request.once('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        settleRequest.resolve({ path: request.url, body })
        const model = typeof body.model === 'string' ? body.model : 'desktop-prompt-capture-model'
        const responseChunks = [
          { id: 'desktop-prompt-capture', object: 'chat.completion.chunk', created: 1, model,
            choices: [{ index: 0, delta: { role: 'assistant', content: 'captured' }, finish_reason: null }] },
          { id: 'desktop-prompt-capture', object: 'chat.completion.chunk', created: 1, model,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
        ]
        response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
        response.end(`${responseChunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`)
      } catch (error) {
        settleRequest.reject(error)
        response.writeHead(400)
        response.end()
      }
    })
  })
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('model request capture server has no TCP port')

  return {
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    async request(timeoutMs = 10_000) {
      return Promise.race([
        capturedRequest,
        delay(timeoutMs).then(() => { throw new Error('timed out waiting for the model request') }),
      ])
    },
    close() {
      return new Promise((resolveClose, rejectClose) => {
        server.close(error => error ? rejectClose(error) : resolveClose())
        server.closeAllConnections?.()
      })
    },
  }
}

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
  const generationResponses = new Set()
  const completedGenerationResponses = []
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    if (message.method === 'Network.responseReceived' && new URL(message.params.response.url).pathname.endsWith('/harnessComfyuiGeneration/list')) {
      generationResponses.add(message.params.requestId)
    }
    if (message.method === 'Network.loadingFinished' && generationResponses.delete(message.params.requestId)) {
      completedGenerationResponses.push(message.params.requestId)
    }
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
  const waitForGenerationProjection = async (sessionId, runCount) => {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      const requestId = completedGenerationResponses.shift()
      if (requestId === undefined) {
        await delay(50)
        continue
      }
      const { body, base64Encoded } = await command('Network.getResponseBody', { requestId })
      expect(base64Encoded).toBe(false)
      const response = JSON.parse(body)
      if (response.result.ok && response.result.value.sessionId === sessionId && response.result.value.runs.length === runCount) {
        return response.result.value
      }
    }
    throw new Error(`Desktop did not receive a Generation projection with ${runCount} Runs for ${sessionId}`)
  }
  return { close: () => socket.close(), command, evaluate, waitForGenerationProjection }
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
    `document.querySelector('[role="dialog"]')?.textContent?.includes('ComfyUI') === true`,
    value => value === true,
  )
}

async function closeSettings(page) {
  const closed = await page.evaluate(`(() => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find(candidate => {
      const labelId = candidate.getAttribute('aria-labelledby')
      return labelId && /^(设置|Settings)$/.test(document.getElementById(labelId)?.textContent?.trim() ?? '')
    })
    const close = [...(dialog?.querySelectorAll('button') ?? [])]
      .find(button => /^(关闭|Close)$/.test(button.textContent?.trim() ?? ''))
    close?.click()
    return close !== undefined
  })()`)
  if (!closed) throw new Error('Settings close button is unavailable.')
  await waitForValue(
    page,
    `(() => [...document.querySelectorAll('[role="dialog"]')].every(candidate => {
      const labelId = candidate.getAttribute('aria-labelledby')
      return !labelId || !/^(设置|Settings)$/.test(document.getElementById(labelId)?.textContent?.trim() ?? '')
    }))()`,
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

async function verifyCustomProviderReasoning(page, context, providers) {
  await waitForValue(page, `(() => {
    const session = [...document.querySelectorAll('[role="treeitem"]')]
      .find(node => node.textContent?.includes('Desktop media session'))
    session?.click()
    return !!session
  })()`, value => value === true)
  await waitForValue(page, `[...document.querySelectorAll('[role="treeitem"]')]
    .some(node => node.textContent?.includes('Desktop media session') && node.getAttribute('aria-selected') === 'true')`,
  value => value === true)
  await openSettings(page)
  expect(await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="dialog"] button')]
      .find(node => node.textContent?.trim() === '模型')
    button?.click()
    return !!button
  })()`)).toBe(true)
  for (const provider of Object.values(providers)) {
    await waitForValue(page, `(() => {
      const button = [...document.querySelectorAll('button')].find(node =>
        node.getAttribute('aria-label')?.startsWith('编辑 ')
        && node.getAttribute('aria-label').includes(${JSON.stringify(provider.displayName)}))
      button?.click()
      return !!button
    })()`, value => value === true)
    await waitForValue(page, `(() => {
      const summary = [...document.querySelectorAll('summary')].find(node => node.textContent?.trim() === '自定义设置')
      if (!summary) return false
      if (!summary.parentElement.open) summary.click()
      return true
    })()`, value => value === true)
    for (const [index, model] of provider.models.entries()) {
      if (!model.reasoning) continue
      const label = `推理等级 ${index + 1}`
      await page.evaluate(`(document.querySelector('button[aria-label="模型设置 ${index + 1}"]')?.click(), true)`)
      expect(await waitForValue(page, `document.querySelector('input[aria-label=${JSON.stringify(label)}]')?.value`,
        value => value !== undefined)).toBe('low, medium, high, max')
      await page.evaluate(`(() => {
        const input = document.querySelector('input[aria-label=${JSON.stringify(label)}]')
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'low,medium,high,max')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })()`)
    }
    await page.evaluate(`([...document.querySelectorAll('.dshProviderEditorStickyFooter button')]
      .find(node => node.textContent?.trim() === '保存')?.click(), true)`)
    await waitForValue(page, `document.querySelector('.dshProviderEditorStickyFooter') === null`, value => value === true)
  }
  await closeSettings(page)
  expect(await page.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="新建会话"]')
    button?.click()
    return !!button
  })()`)).toBe(true)
  await waitForValue(page, `(() => {
    const selected = [...document.querySelectorAll('[role="treeitem"][aria-selected="true"]')]
    return selected.some(node => node.textContent?.includes('新会话'))
      && selected.every(node => !node.textContent?.includes('Desktop media session'))
  })()`, value => value === true)
  const { parse } = createRequire(resolve(context.desktopSource, 'package.json'))('yaml')
  const persisted = parse(await readFile(resolve(context.dshHome, 'settings.yaml'), 'utf8'))['llm-pi-ai'].providers
  for (const [route, provider] of Object.entries(providers)) {
    for (const model of provider.models) {
      const actual = persisted[route].models.find(candidate => candidate.id === model.id)
      if (!model.reasoning) {
        expect(actual).toEqual(model)
        continue
      }
      const { reasoning, ...unchanged } = model
      expect(actual).toEqual({
        ...unchanged,
        reasoningEfforts: Object.fromEntries(reasoning.efforts.map(level => [level.id, level.id])),
      })
      await openComposerModelMenu(page)
      await searchComposerModels(page, model.name)
      await page.evaluate(`(() => {
        const option = [...document.querySelectorAll('[role="menuitemradio"]')].find(node =>
          node.title === ${JSON.stringify(model.name)} && node.closest('[role="group"]')
            ?.querySelector('[id$="-${route}"]'))
        if (!option) throw new Error('The custom provider model is missing from the composer')
        option.click()
      })()`)
      await waitForValue(page, `document.querySelector('[role="menu"][aria-label="模型与推理等级"]') === null`, value => value === true)
      await page.evaluate(`([...document.querySelectorAll('button[aria-haspopup="menu"]')]
        .find(node => node.getAttribute('aria-label')?.startsWith('选择模型'))?.click(), true)`)
      await waitForValue(page, `(() => {
        const option = [...document.querySelectorAll('[role="menuitem"]')]
          .find(node => node.querySelector('span')?.textContent?.trim() === '推理等级')
        option?.click()
        return !!option
      })()`, value => value === true)
      const levels = await waitForValue(page, `[...document.querySelectorAll('[role="menuitemradio"]')].map(node => node.textContent.trim())`, value => value.length === 5)
      expect(levels).toEqual(['Default', 'Low', 'Medium', 'High', 'Max'])
      if (route === 'cliproxy' && model.id === 'gpt-5.6-luna') {
        const screenshot = await page.command('Page.captureScreenshot', { format: 'png' })
        await writeFile(resolve(context.repositoryRoot, '.local/custom-provider-reasoning.png'), Buffer.from(screenshot.data, 'base64'))
      }
      await page.evaluate(`([...document.querySelectorAll('[role="menuitemradio"]')]
        .find(node => node.textContent?.trim() === 'Max')?.click(), true)`)
      await waitForValue(page, `([...document.querySelectorAll('button[aria-haspopup="menu"]')]
        .find(node => node.getAttribute('aria-label')?.startsWith('选择模型'))?.getAttribute('aria-label') ?? '').includes('推理等级 Max')`, value => value === true)
    }
  }
}

async function setImageReaderField(page, label, value) {
  const changed = await page.evaluate(`(() => {
    const section = document.querySelector('.harness-comfyui-image-reader-settings')
    const field = [...(section?.querySelectorAll('label') ?? [])]
      .find(candidate => candidate.querySelector(':scope > span')?.textContent?.trim() === ${JSON.stringify(label)})
    const control = field?.querySelector('input:not([type="radio"]), textarea, select')
    if (!(control instanceof HTMLInputElement)
      && !(control instanceof HTMLTextAreaElement)
      && !(control instanceof HTMLSelectElement)) return false
    const prototype = control instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLSelectElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    setter?.call(control, ${JSON.stringify(value)})
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    return true
  })()`)
  if (!changed) throw new Error(`Image reader field is unavailable: ${label}`)
}

async function clickImageReaderButton(page, label) {
  const clicked = await page.evaluate(`(() => {
    const section = document.querySelector('.harness-comfyui-image-reader-settings')
    const button = [...(section?.querySelectorAll('button') ?? [])]
      .find(candidate => {
        const text = candidate.textContent?.trim() ?? ''
        if (text === ${JSON.stringify(label)}) return true
        if (${JSON.stringify(label)} === '保存当前配置') return text.startsWith('保存配置“')
        if (${JSON.stringify(label)} === '保存当前修改并切换') return text.startsWith('保存配置“') && text.includes('并切换到配置')
        if (${JSON.stringify(label)} === '放弃当前修改并切换') return text.startsWith('放弃配置“') && text.includes('并切换到配置')
        if (${JSON.stringify(label)} === '继续编辑当前配置') return text.startsWith('继续编辑配置“')
        return false
      })
    button?.click()
    return button !== undefined
  })()`)
  if (!clicked) throw new Error(`Image reader button is unavailable: ${label}`)
}

async function selectImageReaderConnection(page, label) {
  const selected = await page.evaluate(`(() => {
    const section = document.querySelector('.harness-comfyui-image-reader-settings')
    const option = [...(section?.querySelectorAll('label') ?? [])]
      .find(candidate => candidate.textContent?.includes(${JSON.stringify(label)}))
    const input = option?.querySelector('input[type="radio"]')
    input?.click()
    return input !== undefined
  })()`)
  if (!selected) throw new Error(`Image reader connection is unavailable: ${label}`)
}

async function selectImageReaderProfile(page, profileId) {
  const selected = await page.evaluate(`(() => {
    const section = document.querySelector('.harness-comfyui-image-reader-settings')
    const field = [...(section?.querySelectorAll('label') ?? [])]
      .find(candidate => candidate.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
    const select = field?.querySelector('select')
    if (!(select instanceof HTMLSelectElement)) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    setter?.call(select, ${JSON.stringify(profileId)})
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  if (!selected) throw new Error(`Image reader profile is unavailable: ${profileId}`)
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
    const switchSessionId = 'session-desktop-switch'
    const switchSession = ctx.sessions.create(switchSessionId, {
      meta: {
        cwd: context.startupWorkspacePath,
        agentPreset: 'harness-comfyui-cli-candidate',
      },
    })
    switchSession.append('session/title', {
      title: 'Desktop session switch target',
      messageSeqs: [],
      source: { kind: 'user' },
    })
    switchSession.append('turn/start', { turn: 1 })
    switchSession.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await ctx.sessions.flush(switchSession)
    const deleteSessionId = 'session-desktop-delete'
    const deleteSessionTitle = 'Desktop deletion target'
    const deleteSession = ctx.sessions.create(deleteSessionId, {
      meta: {
        cwd: context.startupWorkspacePath,
        agentPreset: 'harness-comfyui-cli-candidate',
      },
    })
    deleteSession.append('session/title', {
      title: deleteSessionTitle,
      messageSeqs: [],
      source: { kind: 'user' },
    })
    deleteSession.append('turn/start', { turn: 1 })
    deleteSession.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await ctx.sessions.flush(deleteSession)
    const ownedWorkspace = await ctx.workspaceRegistry.create(context.startupWorkspacePath)
    await ownedWorkspace.attachSession(session.id)
    await ownedWorkspace.attachSession(switchSession.id)
    await ownedWorkspace.attachSession(deleteSession.id)
    return {
      sessionId,
      switchSessionId,
      deleteSessionId,
      deleteSessionTitle,
      workspaceId: String(ownedWorkspace.id),
    }
  } finally {
    for (const fiber of fibers.reverse()) await fiber.dispose()
    await ctx.fiber.dispose()
  }
}

async function seedDesktopMedia(context, identity, runRepositoryFile) {
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
    runRepositoryFile,
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

// Capture the plugin's normal Context without replacing its components or services.
async function captureProjectClientContext(page) {
  await waitForValue(page,
    'document.readyState === "complete" && document.body.innerText.includes("ComfyUI工作台预设")',
    value => value === true)
  await page.command('Page.enable')
  const { identifier } = await page.command('Page.addScriptToEvaluateOnNewDocument', { source: `
    let loader
    Object.defineProperty(window, '__ModuleLoader__', {
      configurable: true,
      get: () => loader,
      set: value => {
        loader = value
        const wrap = load => definition => {
          if (definition.id !== 'harness-comfyui') return load.call(loader, definition)
          const factory = definition.factory
          return load.call(loader, { ...definition, factory: require => {
            const plugin = factory(require)
            return { ...plugin, apply: ctx => {
              window.__runPanelTestContext = ctx
              return plugin.apply(ctx)
            } }
          } })
        }
        let load = wrap(loader.load)
        Object.defineProperty(loader, 'load', {
          configurable: true,
          get: () => load,
          set: value => { load = wrap(value) },
        })
      },
    })
  ` })
  await page.command('Page.reload')
  await waitForValue(page, 'window.__runPanelTestContext !== undefined', value => value === true, 10_000)
  return identifier
}

async function verifyKimiPptDisabled(page, sessionId) {
  const state = await page.evaluate(`(async () => {
    const ctx = window.__runPanelTestContext
    const slotNames = [
      'conversation.hero.modeActions',
      'conversation.input.accessory',
      'conversation.composer.dock'
    ]
    const hostState = await new Promise((resolve, reject) => {
      ctx.inject(['remote.skills', 'remote.pluginInventory'], async injected => {
        try {
          resolve({
            skills: await injected.remote.skills.list({ sessionId: ${JSON.stringify(sessionId)} }),
            inventory: await injected.remote.pluginInventory.list()
          })
        } catch (error) {
          reject(error)
        }
      })
    })
    return {
      slots: Object.fromEntries(slotNames.map(name => [
        name,
        ctx.slots.entries(name).map(entry => entry.options.id ?? entry.options.key ?? null)
      ])),
      pptButtons: [...document.querySelectorAll('button')]
        .filter(button => button.textContent?.trim() === 'PPT').length,
      skills: hostState.skills,
      inventory: hostState.inventory
    }
  })()`)

  expect(Object.keys(state.slots)).toEqual([
    'conversation.hero.modeActions',
    'conversation.input.accessory',
    'conversation.composer.dock',
  ])
  for (const contributionIds of Object.values(state.slots)) {
    expect(contributionIds).not.toContain('kimi-ppt')
  }
  expect(state.pptButtons).toBe(0)
  expect(state.skills.ok).toBe(true)
  expect(state.skills.value.skills.map(skill => skill.name)).not.toContain('kimi-ppt')
  expect(state.inventory.ok).toBe(true)
  expect(state.inventory.value.entries.filter(entry =>
    entry.entryId === 'experimental-kimi-ppt-standard-adapter'
      || entry.moduleName === '@deepseek-ai/dsh-experimental-kimi-ppt-standard-adapter'
  )).toEqual([
    expect.objectContaining({
      entryId: 'include:experimental-kimi-ppt-standard-adapter',
      moduleName: '@deepseek-ai/dsh-experimental-kimi-ppt-standard-adapter',
      enabled: false,
    }),
  ])
  expect(state.inventory.value.entries.filter(entry => entry.moduleName === 'dsh-kimi-ppt')).toEqual([])
}

async function verifyPresetScopedRepositorySkills(page, workspaceId) {
  const expectedRepositorySkills = structuredClone(REPOSITORY_SKILL_CATALOG)
  const state = await page.evaluate(`new Promise((resolve, reject) => {
    window.__runPanelTestContext.inject(
      ['remote.agentPresets', 'remote.session', 'remote.skills'],
      async injected => {
        try {
          const roster = await injected.remote.agentPresets.list()
          if (!roster.ok) {
            resolve({ roster })
            return
          }
          const productPresetId = ${JSON.stringify(PRODUCT_PRESET_ID)}
          const cases = [
            { key: 'implicit-default', sessionId: 'session-skills-implicit-default' },
            ...roster.value.presets
              .filter(preset => preset.id !== productPresetId)
              .map(preset => ({
                key: preset.id,
                sessionId: 'session-skills-' + preset.id.replace(/[^a-z0-9-]/gu, '-'),
                agentPreset: preset.id
              })),
            {
              key: productPresetId,
              sessionId: 'session-skills-product',
              agentPreset: productPresetId
            }
          ]
          const sessions = []
          for (const entry of cases) {
            const request = {
              workspaceId: ${JSON.stringify(workspaceId)},
              sessionId: entry.sessionId,
              ...(entry.agentPreset === undefined ? {} : { agentPreset: entry.agentPreset })
            }
            const created = await injected.remote.session.create(request)
            const skills = created.ok
              ? await injected.remote.skills.list({ sessionId: entry.sessionId })
              : null
            sessions.push({ ...entry, created, skills })
          }
          resolve({ roster, sessions })
        } catch (error) {
          reject(error)
        }
      }
    )
  })`)

  expect(state.roster).toEqual(expect.objectContaining({ ok: true }))
  const presetIds = state.roster.value.presets.map(preset => preset.id)
  expect(presetIds).toContain('standard')
  expect(presetIds).toContain(PRODUCT_PRESET_ID)
  expect(state.roster.value.presets.find(preset => preset.isDefault)?.id).toBe(PRODUCT_PRESET_ID)
  const sessions = new Map(state.sessions.map(session => [session.key, session]))
  for (const session of state.sessions) {
    expect(session.created).toEqual(expect.objectContaining({ ok: true }))
    expect(session.skills).toEqual(expect.objectContaining({ ok: true }))
  }
  expect(sessions.get('implicit-default').created.value.agentPreset).toBe(PRODUCT_PRESET_ID)
  expect(sessions.get(PRODUCT_PRESET_ID).created.value.agentPreset).toBe(PRODUCT_PRESET_ID)

  const expectedProductSkills = [...expectedRepositorySkills]
    .sort((left, right) => left.name.localeCompare(right.name))
  const productSkills = sessions.get(PRODUCT_PRESET_ID).skills.value.skills
    .map(({ name, description }) => ({ name, description }))
    .sort((left, right) => left.name.localeCompare(right.name))
  expect(productSkills).toEqual(expectedProductSkills)
  expect(productSkills).not.toContainEqual({ name: USER_SKILL_NAME, description: USER_SKILL_DESCRIPTION })
  expect(productSkills).not.toContainEqual({
    name: 'comfyui-generate',
    description: WORKSPACE_COMFYUI_GENERATE_DESCRIPTION,
  })

  for (const [key, session] of sessions) {
    if (key === PRODUCT_PRESET_ID || key === 'implicit-default') continue
    const visible = session.skills.value.skills.map(({ name, description }) => ({ name, description }))
    for (const repositorySkill of expectedRepositorySkills) expect(visible).not.toContainEqual(repositorySkill)
  }

  const standardSkills = sessions.get('standard').skills.value.skills
    .map(({ name, description }) => ({ name, description }))
  expect(standardSkills).toContainEqual({ name: USER_SKILL_NAME, description: USER_SKILL_DESCRIPTION })
  expect(standardSkills).toContainEqual({
    name: 'comfyui-generate',
    description: WORKSPACE_COMFYUI_GENERATE_DESCRIPTION,
  })
  const implicitSkills = sessions.get('implicit-default').skills.value.skills
    .map(({ name, description }) => ({ name, description }))
    .sort((left, right) => left.name.localeCompare(right.name))
  expect(implicitSkills).toEqual(expectedProductSkills)
}

async function verifyKimiPptHostRequestDisabled(page, capture, workspaceId) {
  const sessionId = 'session-desktop-prompt-capture'
  const remoteResults = await page.evaluate(`new Promise((resolve, reject) => {
    window.__runPanelTestContext.inject(['remote.session'], async injected => {
      try {
        const created = await injected.remote.session.create({
          workspaceId: ${JSON.stringify(workspaceId)},
          sessionId: ${JSON.stringify(sessionId)},
          agentPreset: 'harness-comfyui-cli-candidate'
        })
        const selected = created.ok ? await injected.remote.session.selectModel({
          sessionId: ${JSON.stringify(sessionId)},
          provider: 'desktop-prompt-capture',
          model: 'desktop-prompt-capture-model'
        }) : null
        const prompted = selected?.ok ? await injected.remote.session.prompt({
          requestId: 'desktop-prompt-capture-request',
          sessionId: ${JSON.stringify(sessionId)},
          mode: 'queue',
          content: [{ type: 'text', text: 'Return one word.' }],
          clientTimeZone: 'Asia/Shanghai'
        }) : null
        resolve({ created, selected, prompted })
      } catch (error) {
        reject(error)
      }
    })
  })`)

  expect(remoteResults.created).toEqual(expect.objectContaining({ ok: true }))
  expect(remoteResults.selected).toEqual(expect.objectContaining({ ok: true }))
  expect(remoteResults.prompted).toEqual(expect.objectContaining({ ok: true }))

  const request = await capture.request()
  expect(request.path).toBe('/v1/chat/completions')
  expect(request.body.model).toBe('desktop-prompt-capture-model')
  const systemPrompt = (request.body.messages ?? [])
    .filter(message => message.role === 'system')
    .map(message => typeof message.content === 'string' ? message.content : JSON.stringify(message.content))
    .join('\n')
  const toolNames = (request.body.tools ?? []).map(tool => tool.function?.name ?? tool.name ?? '')

  expect(systemPrompt).not.toMatch(/kimi-ppt|Kimi-compatible PPT|PPT composer|pptd_/iu)
  expect(toolNames.filter(name => /^ppt(?:d)?_/u.test(name))).toEqual([])
}

async function openSessionDeleteDialog(page, title) {
  const opened = await page.evaluate(`(() => {
    const row = [...document.querySelectorAll('[role="treeitem"]')]
      .find(node => node.textContent?.includes(${JSON.stringify(title)}))
    if (!(row instanceof HTMLElement)) return false
    const bounds = row.getBoundingClientRect()
    row.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2
    }))
    return true
  })()`)
  if (!opened) throw new Error(`Session row is unavailable: ${title}`)
  await waitForValue(
    page,
    `(() => {
      const action = [...document.querySelectorAll('[role="menuitem"]')]
        .find(node => node.textContent?.trim() === '删除会话')
      action?.click()
      return action !== undefined
    })()`,
    value => value === true,
  )
  await waitForValue(
    page,
    `[...document.querySelectorAll('[role="dialog"]')]
      .some(dialog => dialog.textContent?.includes(${JSON.stringify(title)})
        && dialog.textContent?.includes('删除会话'))`,
    value => value === true,
  )
}

async function confirmOpenSessionDelete(page, title) {
  await waitForValue(
    page,
    `(() => {
      const dialog = [...document.querySelectorAll('[role="dialog"]')]
        .find(candidate => candidate.textContent?.includes(${JSON.stringify(title)})
          && candidate.textContent?.includes('删除会话'))
      const action = [...(dialog?.querySelectorAll('button') ?? [])]
        .find(button => button.textContent?.trim() === '删除会话')
      if (!action || action.disabled) return false
      action.click()
      return true
    })()`,
    value => value === true,
  )
}

async function verifySessionDeletion(page, identity) {
  await page.evaluate(`new Promise((resolve, reject) => {
    window.__runPanelTestContext.inject(['connection'], injected => {
      try {
        const rpc = injected.connection.rpc
        window.__sessionDeleteRpc = rpc
        window.__sessionDeleteOriginalCall = rpc.call
        rpc.call = async (prefix, endpoint, payload, signal) => endpoint === 'session/delete'
          ? {
              ok: false,
              error: {
                code: 'session/delete-rejected',
                message: 'Desktop deletion rejection',
                details: {}
              }
            }
          : window.__sessionDeleteOriginalCall.call(rpc, prefix, endpoint, payload, signal)
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  })`)
  await openSessionDeleteDialog(page, identity.deleteSessionTitle)
  await confirmOpenSessionDelete(page, identity.deleteSessionTitle)
  const rejected = await waitForValue(
    page,
    `(() => {
      const dialog = [...document.querySelectorAll('[role="dialog"]')]
        .find(candidate => candidate.textContent?.includes(${JSON.stringify(identity.deleteSessionTitle)})
          && candidate.textContent?.includes('删除会话'))
      return {
        error: dialog?.querySelector('[role="alert"]')?.textContent?.trim() ?? '',
        targetPresent: [...document.querySelectorAll('[role="treeitem"]')]
          .some(node => node.textContent?.includes(${JSON.stringify(identity.deleteSessionTitle)}))
      }
    })()`,
    value => value.error.includes('Desktop deletion rejection') && value.targetPresent === true,
    5_000,
  )
  expect(rejected).toEqual({
    error: 'session delete failed: session/delete-rejected: Desktop deletion rejection',
    targetPresent: true,
  })

  await page.evaluate(`(() => {
    const rpc = window.__sessionDeleteRpc
    rpc.call = window.__sessionDeleteOriginalCall
    delete window.__sessionDeleteRpc
    delete window.__sessionDeleteOriginalCall
  })()`)
  await confirmOpenSessionDelete(page, identity.deleteSessionTitle)
  await waitForValue(
    page,
    `(() => ({
      targetPresent: [...document.querySelectorAll('[role="treeitem"]')]
        .some(node => node.textContent?.includes(${JSON.stringify(identity.deleteSessionTitle)})),
      keptPresent: [...document.querySelectorAll('[role="treeitem"]')]
        .some(node => node.textContent?.includes('Desktop media session')),
      dialogOpen: [...document.querySelectorAll('[role="dialog"]')]
        .some(candidate => candidate.textContent?.includes(${JSON.stringify(identity.deleteSessionTitle)})),
      error: [...document.querySelectorAll('[role="dialog"]')]
        .find(candidate => candidate.textContent?.includes(${JSON.stringify(identity.deleteSessionTitle)}))
        ?.querySelector('[role="alert"]')?.textContent?.trim() ?? ''
    }))()`,
    value => value.targetPresent === false && value.keptPresent === true && value.dialogOpen === false,
    10_000,
  )
}

function publishSavedDesktopRun(context, stagedRunRepository, runId) {
  const database = new DatabaseSync(resolve(context.runtimeRoot, 'data/runs.sqlite'))
  try {
    database.prepare('ATTACH DATABASE ? AS fixture').run(stagedRunRepository)
    database.exec('BEGIN IMMEDIATE')
    database.prepare('INSERT INTO generation_runs SELECT * FROM fixture.generation_runs WHERE run_id = ?').run(runId)
    database.prepare('INSERT INTO generation_media SELECT * FROM fixture.generation_media WHERE run_id = ?').run(runId)
    database.exec('COMMIT')
  } finally {
    database.close()
  }
}

async function verifyRunDiscovery(page, context, identity, stagedRunRepository, mediaFixture) {
  const sessionId = JSON.stringify(identity.sessionId)
  await page.command('Network.enable')
  await page.evaluate(`(() => {
    const ctx = window.__runPanelTestContext
    window.__runPanelSession = ctx.sessions.sessionOf(ctx.sessions.resolveAgentScope(${sessionId}))
    ctx.sessions.handleSessionStatus(${sessionId}, true)
  })()`)
  try {
    await page.waitForGenerationProjection(identity.sessionId, 0)
    await page.evaluate('void (window.__runningSessionSnapshot = window.__runPanelSession.getSnapshot())')
    const counts = `(() => {
    const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.sessionId}"]')
    return drawer === null ? null : {
      runs: drawer.querySelectorAll('.harness-comfyui-run-card').length,
      summary: drawer.querySelector('header small')?.textContent,
    }
  })()`
    expect(await page.evaluate(counts)).toEqual({ runs: 0, summary: '0 个运行 · 0 个媒体' })
    publishSavedDesktopRun(context, stagedRunRepository, mediaFixture.older.runId)
    expect((await page.waitForGenerationProjection(identity.sessionId, 1)).hasActiveRuns).toBe(false)
    await waitForValue(page, counts, value => value?.runs === 1 && value.summary === '1 个运行 · 1 个媒体')
    publishSavedDesktopRun(context, stagedRunRepository, mediaFixture.newer.runId)
    await waitForValue(page, counts, value => value?.runs === 2 && value.summary === '2 个运行 · 2 个媒体')
    expect(await page.evaluate('window.__runningSessionSnapshot === window.__runPanelSession.getSnapshot()')).toBe(true)
    expect(await page.evaluate('window.__runningSessionSnapshot.running')).toBe(true)
  } finally {
    await page.command('Network.disable')
    await page.evaluate(`window.__runPanelTestContext.sessions.handleSessionStatus(${sessionId}, false)`)
  }
}

describe('live DSH Desktop production integration', () => {
  it('verifies disabled Kimi/PPT, Session deletion, project state, models, Providers and media actions', async () => {
    const developmentContext = await loadTestDesktopContext()
    const base = {
      ...await loadDesktopProductionContext(),
      desktopSource: developmentContext.desktopSource,
    }
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
    const startupWorkspacePath = await mkdtemp(join(tmpdir(), 'harness-desktop-skill-workspace-'))
    const context = {
      ...base,
      runtimeRoot,
      runtimeHome,
      dshHome: resolve(runtimeHome, relative(base.runtimeHome, base.dshHome)),
      pidFile: resolve(runtimeRoot, 'desktop.pid'),
      mobileBridgeStateFile: resolve(runtimeRoot, 'state/mobile-bridge.json'),
      harnessLog: resolve(runtimeHome, relative(base.runtimeHome, base.harnessLog)),
      legacyDshHome,
      environmentFilePath,
      startupWorkspacePath,
      mobileBridgePort,
      desktopBuildOutput: resolve(runtimeRoot, 'desktop-out'),
      agentsHome: resolve(runtimeRoot, 'controlled-user-agents'),
    }
    const promptCapture = await startModelRequestCaptureServer()
    const fixture = {
      context,
      start: undefined,
      close: promptCapture.close,
      cleanupPaths: [startupWorkspacePath],
    }
    active.push(fixture)
    await writeFile(
      environmentFilePath,
      `OPENCODE_GO_API_KEY=desktop-live-test\nDESKTOP_PROMPT_CAPTURE_API_KEY=desktop-capture-test\nCOMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT=${mobileBridgePort}\n`,
      'utf8',
    )
    await mkdir(resolve(startupWorkspacePath, '.agents/skills/comfyui-generate'), { recursive: true })
    await writeFile(resolve(startupWorkspacePath, '.agents/skills/comfyui-generate/SKILL.md'), `---
name: comfyui-generate
description: ${WORKSPACE_COMFYUI_GENERATE_DESCRIPTION}
---

# Desktop live workspace fixture
`, 'utf8')
    await mkdir(resolve(context.agentsHome, 'skills', USER_SKILL_NAME), { recursive: true })
    await writeFile(resolve(context.agentsHome, 'skills', USER_SKILL_NAME, 'SKILL.md'), `---
name: ${USER_SKILL_NAME}
description: ${USER_SKILL_DESCRIPTION}
---

# Desktop live user fixture
`, 'utf8')
    const identity = await seedSavedDesktopSession({ ...context, dshHome: legacyDshHome })
    const customProviders = {
      ...JSON.parse(await readFile(new URL('../fixtures/custom-provider-reasoning.json', import.meta.url), 'utf8')),
      'desktop-prompt-capture': {
        displayName: 'Desktop Prompt Capture',
        api: 'openai-completions',
        apiKeyEnv: 'DESKTOP_PROMPT_CAPTURE_API_KEY',
        baseURL: promptCapture.baseURL,
        models: [{
          id: 'desktop-prompt-capture-model',
          name: 'Desktop Prompt Capture Model',
          contextWindow: 16_384,
          maxTokens: 1_024,
        }],
      },
    }
    await mkdir(context.dshHome, { recursive: true })
    await writeFile(resolve(context.dshHome, 'settings.yaml'), JSON.stringify({ 'llm-pi-ai': { providers: customProviders } }))
    const stagedRunRepository = resolve(runtimeRoot, 'staged-runs.sqlite')
    const mediaFixture = await seedDesktopMedia(context, identity, stagedRunRepository)
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
    let contextCaptureScript
    try {
      contextCaptureScript = await captureProjectClientContext(page)
      await verifyPresetScopedRepositorySkills(page, identity.workspaceId)
      await verifyKimiPptDisabled(page, identity.sessionId)
      await verifyKimiPptHostRequestDisabled(page, promptCapture, identity.workspaceId)
      await verifySessionDeletion(page, identity)
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
      await page.evaluate(`(() => {
        const notice = [...document.querySelectorAll('[role="dialog"]')]
          .find(dialog => dialog.textContent?.includes('内测声明'))
        const proceed = [...(notice?.querySelectorAll('button') ?? [])]
          .find(button => button.textContent?.trim() === '继续')
        proceed?.click()
      })()`)
      await waitForValue(page, `[...document.querySelectorAll('[role="dialog"]')]
        .every(dialog => !dialog.textContent?.includes('内测声明'))`, value => value === true)
      expect(resolve(context.dshHome, await readlink(resolve(context.dshHome, '.env')))).toBe(environmentFilePath)
      const profileManifest = JSON.parse(await readFile(resolve(context.dshHome, 'profiles/web/package.json'), 'utf8'))
      expect(profileManifest.dependencies['harness-comfyui'])
        .toBe(JSON.parse(await readFile(resolve(base.repositoryRoot, 'package.json'), 'utf8')).version)
      expect(await readlink(resolve(context.dshHome, 'profiles/web/node_modules/harness-comfyui')))
        .toContain(resolve(context.dshHome, 'profiles/.generations/live'))
      expect(await readFile(context.harnessLog, 'utf8')).not.toContain('migration failed')

      await openComposerModelMenu(page)
      for (const model of [
        { id: 'qwen3.8-flash', name: 'Qwen3.8 Flash' },
        { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash (2x usage)' },
        { id: 'hy4-preview', name: 'Hy4 preview' },
        { id: 'grok-4.6', name: 'Grok 4.6' },
      ]) {
        expect(await searchComposerModels(page, model.id)).toEqual([{ name: model.name, openCodeGo: true }])
      }
      expect(await searchComposerModels(page, 'ox-alpha-free')).toEqual([])
      expect(await searchComposerModels(page, 'grok-4.5')).toEqual([])
      await page.evaluate(`(document.querySelector('[role="menu"][aria-label="模型与推理等级"] [role="searchbox"]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true)`)
      await waitForValue(
        page,
        `document.querySelector('[role="menu"][aria-label="模型与推理等级"] [role="searchbox"]') === null`,
        value => value === true,
      )
      await page.evaluate(`(document.querySelector('[role="menu"][aria-label="模型与推理等级"]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true)`)
      await waitForValue(
        page,
        `document.querySelector('[role="menu"][aria-label="模型与推理等级"]') === null`,
        value => value === true,
      )

      await verifyCustomProviderReasoning(page, context, customProviders)

      await openSettings(page)
      await page.evaluate(`([...document.querySelectorAll('button')]
        .find(node => node.textContent?.trim() === 'ComfyUI')?.click(), true)`)

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
            'grok-4.6',
          ]),
        }),
        alerts: 0,
      }))
      expect(catalog.model.options).not.toContain('ox-alpha-free')
      expect(catalog.model.options).not.toContain('hy4-preview')

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
      await clickImageReaderButton(page, '保存当前配置')
      await waitForValue(
        page,
        `(() => {
          const text = document.body.innerText
          return text.includes('IMAGE_READER_MODEL_REQUIRED')
            && !text.includes('IMAGE_READER_SETTINGS_INVALID')
        })()`,
        value => value === true,
      )
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
      await clickImageReaderButton(page, '保存当前配置')
      await waitForValue(
        page,
        `document.body.innerText.includes('已保存并生效。')`,
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
        .find(node => node.textContent?.trim() === 'ComfyUI')?.click(), true)`)
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

      const firstProfile = await page.evaluate(`(() => {
        const select = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
          ?.querySelector('select')
        return select instanceof HTMLSelectElement
          ? { id: select.value, name: select.selectedOptions[0]?.textContent?.trim() ?? '' }
          : null
      })()`)
      expect(firstProfile).toEqual(expect.objectContaining({ id: expect.any(String), name: expect.any(String) }))

      await clickImageReaderButton(page, '新建配置')
      await selectImageReaderConnection(page, 'OpenAI 兼容接口')
      await waitForValue(
        page,
        `document.querySelector('.harness-comfyui-image-reader-settings input[type="url"]') !== null`,
        value => value === true,
      )
      await setImageReaderField(page, '配置名称', 'Desktop OpenAI 视觉')
      await setImageReaderField(page, 'Chat Completions 地址', 'http://127.0.0.1:11434/v1/chat/completions')
      await setImageReaderField(page, '模型 ID', 'desktop-qwen-vl')
      await setImageReaderField(page, 'API Key（可选）', 'desktop-write-only-key')
      await setImageReaderField(page, '读图提示词', 'Desktop 已保存的默认读图提示词')
      await setImageReaderField(page, '温度', '0.65')
      await setImageReaderField(page, '最大输出 Token 数', '4096')
      await clickImageReaderButton(page, '保存当前配置')
      const openAiProfile = await waitForValue(
        page,
        `(() => {
          const select = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
            .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          return select instanceof HTMLSelectElement && document.body.innerText.includes('配置“Desktop OpenAI 视觉”已保存并生效。')
            ? { id: select.value, options: [...select.options].map(option => option.value) }
            : null
        })()`,
        value => value?.options.length === 2 && value.id !== firstProfile.id,
      )

      await setImageReaderField(page, '配置名称', '')
      await setImageReaderField(page, 'Chat Completions 地址', '')
      await setImageReaderField(page, '模型 ID', '')
      await setImageReaderField(page, '读图提示词', '')
      await setImageReaderField(page, '温度', '')
      await setImageReaderField(page, '最大输出 Token 数', '')
      await selectImageReaderProfile(page, firstProfile.id)
      await waitForValue(
        page,
        `document.body.innerText.includes('请选择保存修改、放弃修改或继续编辑。')`,
        value => value === true,
      )
      await clickImageReaderButton(page, '放弃当前修改并切换')
      await waitForValue(
        page,
        `(() => {
          const labels = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          const profile = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          const provider = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '系统 Provider')
            ?.querySelector('select')
          const model = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '视觉模型')
            ?.querySelector('select')
          return profile?.value === ${JSON.stringify(firstProfile.id)}
            && provider?.value === 'deepseek-official'
            && model?.value === ${JSON.stringify(selectedModel)}
        })()`,
        value => value === true,
      )

      await selectImageReaderProfile(page, openAiProfile.id)
      await waitForValue(
        page,
        `(() => {
          const select = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
            .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          return select instanceof HTMLSelectElement
            && select.value === ${JSON.stringify(openAiProfile.id)}
            && document.body.innerText.includes('配置“Desktop OpenAI 视觉”已生效。下一次图片读取将使用该配置。')
        })()`,
        value => value === true,
      )
      await closeSettings(page)
      await openSettings(page)
      await page.evaluate(`([...document.querySelectorAll('button')]
        .find(node => node.textContent?.trim() === 'ComfyUI')?.click(), true)`)
      const restoredOpenAi = await waitForValue(
        page,
        `(() => {
          const labels = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          const valueFor = text => labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === text)
            ?.querySelector('input, textarea')?.value
          const credential = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === 'API Key（可选）')
          const password = credential?.querySelector('input')
          return valueFor('配置名称') === 'Desktop OpenAI 视觉' ? {
            endpoint: valueFor('Chat Completions 地址'),
            model: valueFor('模型 ID'),
            prompt: valueFor('读图提示词'),
            temperature: valueFor('温度'),
            maxTokens: valueFor('最大输出 Token 数'),
            apiKey: password?.value,
            credentialText: credential?.textContent ?? ''
          } : null
        })()`,
        value => value !== null,
      )
      expect(restoredOpenAi).toEqual({
        endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
        model: 'desktop-qwen-vl',
        prompt: 'Desktop 已保存的默认读图提示词',
        temperature: '0.65',
        maxTokens: '4096',
        apiKey: '',
        credentialText: expect.stringContaining('这份配置已经保存 API Key；留空不会修改。'),
      })

      await setImageReaderField(page, '配置名称', 'Desktop OpenAI 视觉继续编辑草稿')
      await selectImageReaderProfile(page, firstProfile.id)
      await waitForValue(
        page,
        `document.body.innerText.includes('请选择保存修改、放弃修改或继续编辑。')`,
        value => value === true,
      )
      await clickImageReaderButton(page, '继续编辑当前配置')
      await waitForValue(
        page,
        `(() => {
          const name = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
            .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '配置名称')
            ?.querySelector('input')
          return name?.value === 'Desktop OpenAI 视觉继续编辑草稿'
            && !document.body.innerText.includes('请选择保存修改、放弃修改或继续编辑。')
        })()`,
        value => value === true,
      )

      await selectImageReaderProfile(page, firstProfile.id)
      await waitForValue(
        page,
        `document.body.innerText.includes('请选择保存修改、放弃修改或继续编辑。')`,
        value => value === true,
      )
      await clickImageReaderButton(page, '放弃当前修改并切换')
      await waitForValue(
        page,
        `(() => {
          const profile = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
            .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          return profile?.value === ${JSON.stringify(firstProfile.id)}
        })()`,
        value => value === true,
      )

      await selectImageReaderProfile(page, openAiProfile.id)
      await waitForValue(
        page,
        `(() => {
          const profile = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
            .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          return profile?.value === ${JSON.stringify(openAiProfile.id)}
        })()`,
        value => value === true,
      )
      await setImageReaderField(page, '读图提示词', 'Desktop 保存并切换后的读图提示词')
      await selectImageReaderProfile(page, firstProfile.id)
      await waitForValue(
        page,
        `document.body.innerText.includes('请选择保存修改、放弃修改或继续编辑。')`,
        value => value === true,
      )
      await clickImageReaderButton(page, '保存当前修改并切换')
      await waitForValue(
        page,
        `(() => {
          const profile = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
            .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          return profile?.value === ${JSON.stringify(firstProfile.id)}
        })()`,
        value => value === true,
      )
      await selectImageReaderProfile(page, openAiProfile.id)
      await waitForValue(
        page,
        `(() => {
          const labels = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          const profile = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          const prompt = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '读图提示词')
            ?.querySelector('textarea')
          return profile?.value === ${JSON.stringify(openAiProfile.id)}
            && prompt?.value === 'Desktop 保存并切换后的读图提示词'
        })()`,
        value => value === true,
      )

      await clickImageReaderButton(page, '复制配置')
      const copiedProfile = await waitForValue(
        page,
        `(() => {
          const labels = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          const profile = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          const name = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '配置名称')
            ?.querySelector('input')
          const credential = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === 'API Key（可选）')
          const password = credential?.querySelector('input')
          return profile instanceof HTMLSelectElement && profile.options.length === 2 && name?.value.endsWith(' 副本') ? {
            activeId: profile.value,
            name: name.value,
            placeholder: password?.getAttribute('placeholder') ?? ''
          } : null
        })()`,
        value => value !== null,
      )
      expect(copiedProfile).toEqual({
        activeId: openAiProfile.id,
        name: 'Desktop OpenAI 视觉 副本',
        placeholder: '本地免鉴权接口可以留空',
      })
      await closeSettings(page)
      await openSettings(page)
      await page.evaluate(`([...document.querySelectorAll('button')]
        .find(node => node.textContent?.trim() === 'ComfyUI')?.click(), true)`)
      await waitForValue(
        page,
        `(() => {
          const labels = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          const select = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          const name = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '配置名称')
            ?.querySelector('input')
          return select instanceof HTMLSelectElement
            && select.value === ${JSON.stringify(openAiProfile.id)}
            && select.options.length === 2
            && name?.value === 'Desktop OpenAI 视觉'
        })()`,
        value => value === true,
      )

      await clickImageReaderButton(page, '删除配置')
      await waitForValue(
        page,
        `(() => {
          const select = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
            .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          return select instanceof HTMLSelectElement && select.value === ${JSON.stringify(firstProfile.id)}
            && select.options.length === 1
        })()`,
        value => value === true,
      )

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
      await verifyRunDiscovery(page, context, identity, stagedRunRepository, mediaFixture)
      await waitForValue(
        page,
        `(() => {
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.sessionId}"]')
          const tabs = [...(drawer?.querySelectorAll('button[role="tab"]') ?? [])]
          const panels = [...(drawer?.querySelectorAll('[role="tabpanel"]') ?? [])]
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '关闭结果列')
          return drawer === null ? null : {
            detailsCollapsed: drawer.closest('[data-details-collapsed="true"]') !== null,
            media: drawer.textContent?.includes('2 个媒体') === true,
            tabs: tabs.map(tab => tab.textContent?.trim()),
            selected: tabs.map(tab => tab.getAttribute('aria-selected')),
            hidden: panels.map(panel => panel.hidden),
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.detailsCollapsed === false
          && value?.media === true
          && JSON.stringify(value?.tabs) === JSON.stringify(['本会话媒体', '运行状态'])
          && JSON.stringify(value?.selected) === JSON.stringify(['true', 'false'])
          && JSON.stringify(value?.hidden) === JSON.stringify([true, false])
          && value?.toggle === '关闭结果列',
      )
      await page.evaluate(`([...document.querySelectorAll('.harness-comfyui-dock-actions button')]
        .find(node => node.textContent?.trim() === '关闭结果列')?.click(), true)`)
      await waitForValue(
        page,
        `(() => {
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.sessionId}"]')
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '打开结果列')
          return {
            drawerExists: drawer !== null,
            detailsCollapsed: drawer !== null && drawer.closest('[data-details-collapsed="true"]') !== null,
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.drawerExists === true
          && value?.detailsCollapsed === true
          && value?.toggle === '打开结果列',
      )
      await page.evaluate('window.__runPanelTestContext.layout.openDetails()')
      await waitForValue(
        page,
        `(() => {
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.sessionId}"]')
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '关闭结果列')
          return {
            drawerExists: drawer !== null,
            detailsCollapsed: drawer !== null && drawer.closest('[data-details-collapsed="true"]') !== null,
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.drawerExists === true
          && value?.detailsCollapsed === false
          && value?.toggle === '关闭结果列',
      )
      await page.evaluate(`([...document.querySelectorAll('.harness-comfyui-dock-actions button')]
        .find(node => node.textContent?.trim() === '关闭结果列')?.click(), true)`)
      await waitForValue(
        page,
        `(() => {
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.sessionId}"]')
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '打开结果列')
          return {
            drawerExists: drawer !== null,
            detailsCollapsed: drawer !== null && drawer.closest('[data-details-collapsed="true"]') !== null,
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.drawerExists === true
          && value?.detailsCollapsed === true
          && value?.toggle === '打开结果列',
      )
      await page.evaluate(`([...document.querySelectorAll('.harness-comfyui-dock-actions button')]
        .find(node => node.textContent?.trim() === '打开结果列')?.click(), true)`)
      await waitForValue(
        page,
        `(() => {
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.sessionId}"]')
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '关闭结果列')
          return {
            drawerExists: drawer !== null,
            detailsCollapsed: drawer !== null && drawer.closest('[data-details-collapsed="true"]') !== null,
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.drawerExists === true
          && value?.detailsCollapsed === false
          && value?.toggle === '关闭结果列',
      )
      await page.evaluate(`(() => {
        const session = [...document.querySelectorAll('[role="treeitem"]')]
          .find(node => node.textContent?.includes('Desktop session switch target'))
        session?.click()
        return session !== undefined
      })()`)
      await waitForValue(
        page,
        `(() => {
          const selected = [...document.querySelectorAll('[role="treeitem"]')]
            .some(node => node.textContent?.includes('Desktop session switch target') && node.getAttribute('aria-selected') === 'true')
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.switchSessionId}"]')
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '打开结果列')
          return {
            selected,
            drawerExists: drawer !== null,
            detailsCollapsed: drawer !== null && drawer.closest('[data-details-collapsed="true"]') !== null,
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.selected === true
          && value?.drawerExists === true
          && value?.detailsCollapsed === true
          && value?.toggle === '打开结果列',
      )
      await page.evaluate(`([...document.querySelectorAll('.harness-comfyui-dock-actions button')]
        .find(node => node.textContent?.trim() === '打开结果列')?.click(), true)`)
      await waitForValue(
        page,
        `(() => {
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.switchSessionId}"]')
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '关闭结果列')
          return {
            drawerExists: drawer !== null,
            detailsCollapsed: drawer !== null && drawer.closest('[data-details-collapsed="true"]') !== null,
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.drawerExists === true
          && value?.detailsCollapsed === false
          && value?.toggle === '关闭结果列',
      )
      await page.evaluate(`(() => {
        const session = [...document.querySelectorAll('[role="treeitem"]')]
          .find(node => node.textContent?.includes('Desktop media session'))
        session?.click()
        return session !== undefined
      })()`)
      await waitForValue(
        page,
        `(() => {
          const selected = [...document.querySelectorAll('[role="treeitem"]')]
            .some(node => node.textContent?.includes('Desktop media session') && node.getAttribute('aria-selected') === 'true')
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.sessionId}"]')
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '打开结果列')
          return {
            selected,
            drawerExists: drawer !== null,
            detailsCollapsed: drawer !== null && drawer.closest('[data-details-collapsed="true"]') !== null,
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.selected === true
          && value?.drawerExists === true
          && value?.detailsCollapsed === true
          && value?.toggle === '打开结果列',
      )
      await page.evaluate(`([...document.querySelectorAll('.harness-comfyui-dock-actions button')]
        .find(node => node.textContent?.trim() === '打开结果列')?.click(), true)`)
      await waitForValue(
        page,
        `(() => {
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.sessionId}"]')
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '关闭结果列')
          return {
            drawerExists: drawer !== null,
            detailsCollapsed: drawer !== null && drawer.closest('[data-details-collapsed="true"]') !== null,
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.drawerExists === true
          && value?.detailsCollapsed === false
          && value?.toggle === '关闭结果列',
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
      if (contextCaptureScript !== undefined) {
        await page.command('Page.removeScriptToEvaluateOnNewDocument', { identifier: contextCaptureScript })
      }
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
