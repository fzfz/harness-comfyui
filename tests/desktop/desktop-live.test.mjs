import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'

import repositorySkillCatalogFixture from '../fixtures/repository-skill-catalog.json' with { type: 'json' }
import productAgentConfig from '../../config/product-agent.json' with { type: 'json' }

import {
  desktopWorktreeStatus,
  startDesktopWorktree,
  stopDesktopWorktree,
} from '../../scripts/desktop/anywhere.mjs'
import { GenerationRuntime } from '../../src/host/generation/generation-runtime.ts'
import { createTestDesktopRequire, loadTestDesktopContext } from '../support/desktop-context.mjs'

const active = []
const PRODUCT_PRESET_ID = productAgentConfig.preset.id
const PROJECT_PRESET_IDS = [PRODUCT_PRESET_ID, ...productAgentConfig.preset.additionalManagedPresetIds]
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

function semanticDiscovery() {
  const search = {
    type: 'object',
    additionalProperties: false,
    required: ['mode'],
    description: 'Search branch for the base-model Catalog operation.',
    properties: {
      mode: { const: 'search', description: 'Catalog request branch discriminator for text search', example: 'search' },
      query: { type: 'string', minLength: 0, maxLength: 200, default: '', description: 'Base-model name text normalized before a literal LIKE search', example: 'watercolor' },
      page: { type: 'integer', minimum: 1, maximum: 100000, default: 1, description: 'One-based result page number', example: 1 },
      page_size: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'Maximum number of base-model items returned on one page', example: 20 },
    },
  }
  const resolveRequest = {
    type: 'object',
    additionalProperties: false,
    required: ['mode', 'id'],
    description: 'Resolve branch for one base-model Catalog record.',
    properties: {
      mode: { const: 'resolve', description: 'Catalog request branch discriminator for stable-ID resolution', example: 'resolve' },
      id: { type: 'string', minLength: 1, maxLength: 20, pattern: '^[1-9][0-9]{0,19}$', description: 'Decimal base-model record identifier', example: '123' },
    },
  }
  return {
    openapi: '3.1.0',
    paths: {
      '/internal/semantic/base-models': {
        post: {
          summary: 'Search or resolve base-model records',
          description: 'Search or resolve base-model records by base-model name.',
          operationId: 'querySemanticBaseModelsForSkill',
          'x-harness-tool-name': 'query_semantic_base_models',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CatalogBaseModelRequest' },
                examples: {
                  search: { value: { mode: 'search', query: 'watercolor', page: 1, page_size: 20 } },
                  resolve: { value: { mode: 'resolve', id: '123' } },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        CatalogBaseModelRequest: {
          type: 'object',
          oneOf: [
            { $ref: '#/components/schemas/CatalogBaseModelSearchRequest' },
            { $ref: '#/components/schemas/CatalogBaseModelResolveRequest' },
          ],
          description: 'Closed search-or-resolve request for the base-model Catalog operation.',
          example: { mode: 'search', query: 'watercolor', page: 1, page_size: 20 },
        },
        CatalogBaseModelSearchRequest: search,
        CatalogBaseModelResolveRequest: resolveRequest,
      },
    },
  }
}


async function startModelRequestCaptureServer() {
  let settleRequest
  const capturedRequest = new Promise((resolveRequest, rejectRequest) => {
    settleRequest = { resolve: resolveRequest, reject: rejectRequest }
  })
  const server = createHttpServer((request, response) => {
    if (request.method === 'GET' && request.url === '/internal/semantic') {
      response.writeHead(200, { 'content-type': 'application/json' })
      const discovery = semanticDiscovery()
      const operation = structuredClone(discovery.paths['/internal/semantic/base-models'].post)
      operation.operationId = 'querySemanticComfyuiTemplatesForSkill'
      operation['x-harness-tool-name'] = 'query_semantic_comfyui_templates'
      discovery.paths['/internal/semantic/comfyui-templates'] = { post: operation }
      operation.requestBody.content['application/json'].schema.$ref = '#/components/schemas/CatalogTemplateRequest'
      for (const suffix of ['Request', 'SearchRequest', 'ResolveRequest']) {
        discovery.components.schemas[`CatalogTemplate${suffix}`] = JSON.parse(JSON.stringify(discovery.components.schemas[`CatalogBaseModel${suffix}`]).replaceAll('CatalogBaseModel', 'CatalogTemplate'))
      }
      discovery.components.schemas.CatalogTemplateSearchRequest.properties.base_model_id = { type: 'string', minLength: 1, maxLength: 20, pattern: '^[1-9][0-9]{0,19}$', description: 'Base model identifier for catalog filtering', example: '123' }
      response.end(JSON.stringify(discovery))
      return
    }
    if (request.method === 'GET' && request.url?.startsWith('/catalog-image/')) {
      const dimensions = request.url.includes('wide') ? [3000, 500] : request.url.includes('small') ? [32, 32] : [500, 3000]
      response.writeHead(200, { 'content-type': 'image/svg+xml' })
      response.end(`<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions[0]}" height="${dimensions[1]}"><rect width="100%" height="100%" fill="#508080"/><circle cx="50%" cy="50%" r="15" fill="white"/></svg>`)
      return
    }
    if (request.method === 'POST' && request.url === '/internal/semantic/comfyui-templates') {
      const chunks = []
      request.on('data', chunk => chunks.push(chunk))
      request.on('end', () => {
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        const origin = `http://127.0.0.1:${server.address().port}`
        const record = id => ({ id, base_model_id: 123, model_id: null, lora_id: null, title: `Catalog template ${id}`, template_type: 'text_to_image', workflow_json: {}, cover_url: `${origin}/catalog-image/tall.svg`, sample_image_urls: [`${origin}/catalog-image/wide.svg`, `${origin}/catalog-image/small.svg`] })
        const resolving = input.mode === 'resolve'
        const all = Array.from({ length: 9 }, (_, index) => record(index + 1))
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ status: 'ok', message: null, results: resolving ? [{ ...record(Number(input.id)), template_type: 'text_to_image\n' + 'Long detail text '.repeat(200) }] : all.slice((input.page - 1) * input.page_size, input.page * input.page_size), page: resolving ? 1 : input.page, page_size: resolving ? 1 : input.page_size, total_count: resolving ? 1 : 9 }))
      })
      return
    }
    if (request.method === 'POST' && request.url === '/internal/semantic/base-models') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        status: 'ok', message: null, results: [{ id: '123', name: 'Desktop catalog fixture' }],
        page: 1, page_size: 20, total_count: 1,
      }))
      return
    }
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
        settleRequest.resolve({ path: request.url, headers: request.headers, body })
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

async function waitForDesktopReady(context, startFailure, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const error = startFailure()
    if (error !== undefined) throw error
    const status = await desktopWorktreeStatus(context)
    if (status.status === 'ready') return status
    if (status.status === 'failed') throw new Error(`Desktop startup failed: ${JSON.stringify(status)}`)
    await delay(100)
  }
  throw new Error('timed out waiting for this Desktop run to become ready')
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
      if (message.error !== undefined) reject(new Error(`${method}: ${message.error.message}; params=${JSON.stringify(params)}`))
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
      if (message.error !== undefined) reject(new Error(`${method}: ${message.error.message}; params=${JSON.stringify(params)}`))
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
    15_000,
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
  throw new Error(`timed out waiting for Desktop page state: ${expression}; last value was ${JSON.stringify(value)}`)
}

async function clickMainFrameElement(page, selector) {
  const result = await page.command('Runtime.evaluate', {
    expression: `(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      if (!(element instanceof HTMLElement)) return false
      element.scrollIntoView({ block: 'center', inline: 'center' })
      if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        || element.matches(':disabled, [aria-disabled="true"]')) return false
      const bounds = element.getBoundingClientRect()
      const x = bounds.left + bounds.width / 2
      const y = bounds.top + bounds.height / 2
      if (bounds.width <= 0 || bounds.height <= 0 || x < 0 || x > innerWidth || y < 0 || y > innerHeight) return false
      const hit = document.elementFromPoint(x, y)
      if (hit !== element && !element.contains(hit)) return false
      element.click()
      return true
    })()`,
    returnByValue: true,
    userGesture: true,
  })
  if (result.exceptionDetails !== undefined || result.result.value !== true) {
    throw new Error(`Desktop element click failed: ${selector}`)
  }
}

async function openSettings(page) {
  await waitForValue(
    page,
    `(() => {
      if ([...document.querySelectorAll('[role="dialog"]')]
        .some(dialog => dialog.textContent?.includes('ComfyUI'))) return true
      const trigger = [...document.querySelectorAll('button[aria-haspopup="dialog"][aria-expanded]')]
        .find(node => /^(设置|Settings)$/.test(node.getAttribute('aria-label') ?? ''))
      if (trigger) { trigger.click(); return true }
      const account = [...document.querySelectorAll('button[aria-haspopup="menu"][aria-expanded]')]
        .find(node => /^(账号菜单|Account menu)$/.test(node.getAttribute('aria-label') ?? ''))
      account?.click()
      return account !== undefined
    })()`,
    value => value === true,
  )
  await waitForValue(
    page,
    `(() => {
      if ([...document.querySelectorAll('[role="dialog"]')]
        .some(dialog => dialog.textContent?.includes('ComfyUI'))) return true
      const action = [...document.querySelectorAll('[role="menuitem"]')]
        .find(node => [...node.children].some(child =>
          child.tagName === 'SPAN' && /^(设置|Settings)$/.test(child.textContent?.trim() ?? '')))
      action?.click()
      return action !== undefined
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
    `document.querySelector('[role="menu"][aria-label="模型与推理等级"] [role="menuitemradio"]') !== null`,
    value => value === true,
  )
}

async function composerModelsNamed(page, name) {
  return page.evaluate(`(() => {
    const menu = document.querySelector('[role="menu"][aria-label="模型与推理等级"]')
    return [...menu.querySelectorAll('[role="menuitemradio"]')]
      .filter(option => option.getAttribute('title') === ${JSON.stringify(name)})
      .map(option => ({
        name: option.getAttribute('title'),
        openCodeGo: option.closest('[role="group"]')?.querySelector('[id$="-opencode-go"]') !== null,
      }))
  })()`)
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
    for (let attempt = 0; attempt < 2; attempt++) {
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
      expect(await page.evaluate(`(() => {
        const button = document.querySelector('button[aria-label="模型选项 ${index + 1}"]')
        button?.click()
        return !!button
      })()`)).toBe(true)
      expect(await waitForValue(page, `document.querySelector('input[aria-label=${JSON.stringify(label)}]')?.value`,
        value => value !== undefined, 3_000)).toBe('low, medium, high, max')
      await page.evaluate(`(() => {
        const input = document.querySelector('input[aria-label=${JSON.stringify(label)}]')
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'low,medium,high,max')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })()`)
    }
    const saveState = await page.evaluate(`(() => {
      const footer = document.querySelector('.dshProviderEditorStickyFooter')
      const button = [...(footer?.querySelectorAll('button') ?? [])]
        .find(node => node.textContent?.trim() === '保存')
      if (button && !button.disabled) button.click()
      return { found: !!button, disabled: button?.disabled,
        errors: [...document.querySelectorAll('[role="dialog"] p')].map(node => node.textContent?.trim()).filter(Boolean) }
    })()`)
    expect(saveState, `Provider ${provider.displayName} save state`).toEqual(expect.objectContaining({ found: true, disabled: false }))
    const outcome = await waitForValue(page, `(() => {
      const footer = document.querySelector('.dshProviderEditorStickyFooter')
      return { closed: footer === null,
        feedback: [...(footer?.parentElement?.querySelectorAll('p') ?? [])]
          .map(node => node.textContent?.trim()).filter(Boolean) }
    })()`, value => value.closed === true || value.feedback.some(message => message.includes('请关闭后重新打开')), 3_000)
    if (outcome.closed) break
    expect(attempt, `Provider ${provider.displayName} settings conflict after reopening`).toBe(0)
    expect(await page.evaluate(`(() => {
      const footer = document.querySelector('.dshProviderEditorStickyFooter')
      const cancel = [...(footer?.querySelectorAll('button') ?? [])]
        .find(node => node.textContent?.trim() === '取消')
      cancel?.click()
      return !!cancel
    })()`)).toBe(true)
    await waitForValue(page, `document.querySelector('.dshProviderEditorStickyFooter') === null`, value => value === true)
    }
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
  const yaml = createTestDesktopRequire(context)('js-yaml')
  const profileSchema = yaml.DEFAULT_SCHEMA.extend([new yaml.Type('tag:yaml.org,2002:js', {
    kind: 'scalar', construct: expression => expression,
  })])
  const profilePatch = yaml.load(await readFile(resolve(context.dshHome, 'profiles', context.baseline.profile.name, 'cordis.patch.yml'), 'utf8'), {
    schema: profileSchema,
  })
  const persisted = profilePatch.find(entry => entry.id === 'llm-pi-ai').config.providers
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
      await composerModelsNamed(page, model.name)
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
      await waitForValue(page, `document.querySelector('[role="menu"][aria-label="模型与推理等级"]') === null`, value => value === true)
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
    createTestDesktopRequire(context).resolve(name),
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

    const createSavedSession = async (id, title) => {
      const sessionId = sessions.SessionId(id)
      const createdAt = Date.now()
      const handle = await ctx.sessionPersistence.create({
        version: sessions.SESSION_FORMAT_VERSION,
        id: sessionId,
        createdAt,
        cwd: context.startupWorkspacePath,
        isSeeded: false,
        delegationDepth: 0,
        agentPreset: 'harness-comfyui-cli-candidate',
      })
      try {
        await handle.append([
          {
            type: 'session/title',
            seq: 0,
            time: createdAt,
            data: { title, messageSeqs: [], source: { kind: 'user' } },
          },
          { type: 'turn/start', seq: 1, time: createdAt + 1, data: { turn: 1 } },
          {
            type: 'turn/end',
            seq: 2,
            time: createdAt + 2,
            data: { turn: 1, reason: { kind: 'completed' } },
          },
        ])
        await handle.flush()
      } finally {
        await handle.close()
      }
      return sessionId
    }

    const sessionId = await createSavedSession('session-desktop-media', 'Desktop media session')
    const switchSessionId = await createSavedSession('session-desktop-switch', 'Desktop session switch target')
    const deleteSessionTitle = 'Desktop deletion target'
    const deleteSessionId = await createSavedSession('session-desktop-delete', deleteSessionTitle)
    const ownedWorkspace = await ctx.workspaceRegistry.create(context.startupWorkspacePath)
    await ownedWorkspace.attachSession(sessionId)
    await ownedWorkspace.attachSession(switchSessionId)
    await ownedWorkspace.attachSession(deleteSessionId)
    return {
      sessionId: String(sessionId),
      switchSessionId: String(switchSessionId),
      deleteSessionId: String(deleteSessionId),
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

async function verifyContextDialog(page, context) {
  const viewport = await page.evaluate(`({ width: window.innerWidth, height: window.innerHeight, deviceScaleFactor: window.devicePixelRatio, mobile: false })`)
  await page.evaluate(`([...document.querySelectorAll('.harness-comfyui-dock-actions button')].find(b => b.textContent.trim() === '插入上下文').click(), true)`)
  await waitForValue(page, `document.querySelectorAll('.harness-comfyui-catalog-card').length`, count => count === 8)
  const cards = await page.evaluate(`(() => {
    const grid = document.querySelector('.harness-comfyui-catalog-items')
    const img = grid.querySelector('img')
    return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, fit: getComputedStyle(img).objectFit, base: document.querySelector('.harness-comfyui-base-model-row button').textContent.trim() }
  })()`)
  expect(cards).toEqual({ columns: 2, fit: 'contain', base: '全部底模' })
  await page.evaluate(`(document.querySelector('.harness-comfyui-catalog-modal-content').scrollTop = 200, true)`)
  const listScroll = await page.evaluate(`document.querySelector('.harness-comfyui-catalog-modal-content').scrollTop`)
  expect(listScroll).toBeGreaterThan(0)
  await page.evaluate(`(document.querySelector('.harness-comfyui-card-select').click(), document.querySelector('[aria-label="详情 Catalog template 1"]').click(), true)`)
  await waitForValue(page, `document.querySelector('.harness-comfyui-catalog-detail dl')?.textContent`, text => text?.includes('Catalog template 1'))
  expect(await page.evaluate(`document.querySelector('.harness-comfyui-catalog-detail').textContent.includes('workflow_json')`)).toBe(false)
  await page.evaluate(`(document.querySelector('.harness-comfyui-catalog-detail').scrollTop = 100, true)`)
  const detailScroll = await page.evaluate(`document.querySelector('.harness-comfyui-catalog-detail').scrollTop`)
  expect(detailScroll).toBeGreaterThan(0)
  expect(await page.evaluate(`document.querySelector('.harness-comfyui-detail-modal-content').scrollTop`)).toBe(0)
  await page.evaluate(`(document.querySelector('.harness-comfyui-detail-preview').click(), true)`)
  await page.command('Emulation.setDeviceMetricsOverride', { width: 700, height: 500, deviceScaleFactor: 1, mobile: false })
  for (const imageIndex of [0, 1, 2]) {
    await waitForValue(page, `(() => { const image = document.querySelector('.harness-comfyui-gallery-current img'); return !!image?.complete && image.naturalWidth > 0 })()`, ready => ready === true)
    expect(await page.evaluate(`(() => {
      const image = document.querySelector('.harness-comfyui-gallery-current img')
      const stage = image.parentElement
      const a = image.getBoundingClientRect(), b = stage.getBoundingClientRect()
      return getComputedStyle(image).objectFit === 'contain' && a.width <= b.width && a.height <= b.height && stage.scrollWidth === stage.clientWidth && stage.scrollHeight === stage.clientHeight
    })()`)).toBe(true)
    if (imageIndex < 2) await page.evaluate(`(document.querySelector('[aria-label="下一张图片"]').click(), true)`)
  }
  const screenshot = await page.command('Page.captureScreenshot', { format: 'png' })
  await writeFile(resolve(context.repositoryRoot, '.local/context-dialog-gallery.png'), Buffer.from(screenshot.data, 'base64'))
  await page.command('Emulation.setDeviceMetricsOverride', viewport)
  await waitForValue(page, `window.innerWidth`, width => width === viewport.width)
  await page.evaluate(`(document.querySelector('[role="dialog"] button[aria-label="返回详情"]').click(), true)`)
  await waitForValue(page, `document.querySelector('[role="dialog"]')?.getAttribute('aria-label')`, title => title === '详情：Catalog template 1')
  expect(await page.evaluate(`document.querySelector('.harness-comfyui-catalog-detail').scrollTop`)).toBe(detailScroll)
  await page.evaluate(`([...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === '返回资源列表').click(), true)`)
  await waitForValue(page, `document.activeElement?.getAttribute('aria-label')`, label => label === '详情 Catalog template 1')
  expect(await page.evaluate(`document.querySelector('.harness-comfyui-catalog-modal-content').scrollTop`)).toBe(listScroll)
  expect(await page.evaluate(`document.querySelector('.harness-comfyui-card-select').getAttribute('aria-pressed')`)).toBe('true')
  await page.evaluate(`([...document.querySelectorAll('.harness-comfyui-catalog-pagination button')].find(b => b.textContent.trim() === '下一页').click(), true)`)
  await waitForValue(page, `document.querySelectorAll('.harness-comfyui-catalog-card').length`, count => count === 1)
  await page.evaluate(`([...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === '取消').click(), true)`)
  await waitForValue(page, `document.querySelector('.harness-comfyui-catalog-modal') === null`, closed => closed === true)
}

async function verifyKimiPptDisabled(page, sessionId) {
  const state = await page.evaluate(`(async () => {
    const ctx = window.__runPanelTestContext
    const slotNames = [
      'conversation.hero.modeActions',
      'conversation.input.accessory',
      'conversation.composer.dock'
    ]
    const hostState = { skills: await ctx.get('remote.skills').list({ sessionId: ${JSON.stringify(sessionId)} }) }
    return {
      slots: Object.fromEntries(slotNames.map(name => [
        name,
        ctx.slots.entries(name).map(entry => entry.options.id ?? entry.options.key ?? null)
      ])),
      pptButtons: [...document.querySelectorAll('button')]
        .filter(button => button.textContent?.trim() === 'PPT').length,
      skills: hostState.skills
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

}

async function verifyPresetScopedRepositorySkills(page, workspaceId) {
  const expectedRepositorySkills = structuredClone(REPOSITORY_SKILL_CATALOG)
  const state = await page.evaluate(`new Promise((resolve, reject) => {
    window.__runPanelTestContext.inject(
      ['remote.agentPresets', 'remote.session', 'remote.skills', 'remote.commands'],
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
            const commands = created.ok
              ? await injected.remote.commands.list(entry.sessionId)
              : null
            const goal = commands?.ok && commands.value.some(command => command.name === 'goal')
              ? await injected.remote.commands.execute(entry.sessionId, '/goal', [])
              : null
            sessions.push({ ...entry, created, skills, commands, goal })
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
  for (const presetId of PROJECT_PRESET_IDS) expect(presetIds).toContain(presetId)
  expect(state.roster.value.presets.find(preset => preset.isDefault)?.id).toBe(PRODUCT_PRESET_ID)
  const sessions = new Map(state.sessions.map(session => [session.key, session]))
  for (const session of state.sessions) {
    expect(session.created).toEqual(expect.objectContaining({ ok: true }))
    expect(session.skills).toEqual(expect.objectContaining({ ok: true }))
  }
  const iterationSession = sessions.get('harness-comfyui-iteration')
  expect(iterationSession.commands).toEqual(expect.objectContaining({ ok: true }))
  expect(iterationSession.commands.value).toContainEqual(expect.objectContaining({ name: 'goal' }))
  expect(iterationSession.goal).toEqual(expect.objectContaining({
    ok: true,
    value: expect.objectContaining({
      result: expect.objectContaining({ kind: 'success', text: expect.stringContaining('No goal is currently set.') }),
    }),
  }))
  expect(sessions.get('implicit-default').created.value.agentPreset).toBe(PRODUCT_PRESET_ID)
  expect(sessions.get(PRODUCT_PRESET_ID).created.value.agentPreset).toBe(PRODUCT_PRESET_ID)

  const expectedProductSkills = [...expectedRepositorySkills]
    .sort((left, right) => left.name.localeCompare(right.name))
  for (const presetId of PROJECT_PRESET_IDS) {
    expect(sessions.get(presetId).created.value.agentPreset).toBe(presetId)
    const productSkills = sessions.get(presetId).skills.value.skills
      .map(({ name, description }) => ({ name, description }))
      .sort((left, right) => left.name.localeCompare(right.name))
    expect(productSkills).toEqual(expectedProductSkills)
    expect(productSkills).not.toContainEqual({ name: USER_SKILL_NAME, description: USER_SKILL_DESCRIPTION })
    expect(productSkills).not.toContainEqual({
      name: 'comfyui-generate',
      description: WORKSPACE_COMFYUI_GENERATE_DESCRIPTION,
    })
  }

  for (const [key, session] of sessions) {
    if (PROJECT_PRESET_IDS.includes(key) || key === 'implicit-default') continue
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
  expect.soft(request.headers['x-deepseek-harness-session-id'], 'model request must carry its real Session ID').toBe(sessionId)
  const systemPrompt = (request.body.messages ?? [])
    .filter(message => message.role === 'system')
    .map(message => typeof message.content === 'string' ? message.content : JSON.stringify(message.content))
    .join('\n')
  const toolNames = (request.body.tools ?? []).map(tool => tool.function?.name ?? tool.name ?? '')

  expect(systemPrompt).not.toMatch(/kimi-ppt|Kimi-compatible PPT|PPT composer|pptd_/iu)
  expect(toolNames.filter(name => /^ppt(?:d)?_/u.test(name))).toEqual([])
}

async function openSessionDeleteDialog(page, title) {
  await waitForValue(page, `(() => {
    const row = [...document.querySelectorAll('[role="treeitem"]')]
      .find(node => node.textContent?.includes(${JSON.stringify(title)}))
    if (!(row instanceof HTMLElement)) return false
    const actions = [...row.querySelectorAll('button')]
      .find(button => button.getAttribute('aria-label')?.includes(${JSON.stringify(title)}))
    actions?.click()
    return actions !== undefined
  })()`, value => value === true)

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
  await page.evaluate(`new Promise((resolve, reject) => {
    window.__runPanelTestContext.inject(['connection'], injected => {
      try {
        const rpc = injected.connection.rpc
        const original = rpc.call
        window.__generationProjectionResponses = []
        window.__restoreGenerationObserver = () => { rpc.call = original }
        rpc.call = async function (...args) {
          const response = await original.apply(this, args)
          if (args[1] === 'harnessComfyuiGeneration/list') window.__generationProjectionResponses.push(response)
          return response
        }
        resolve()
      } catch (error) { reject(error) }
    })
  })`)
  const waitForProjection = runCount => waitForValue(page, `
    window.__generationProjectionResponses.find(response => response.ok
      && response.value.sessionId === ${sessionId}
      && response.value.runs.length === ${runCount})?.value`, value => value !== undefined, 10_000)
  await page.evaluate(`(() => {
    const ctx = window.__runPanelTestContext
    const binding = ctx.sessions.binding(${sessionId})
    if (!binding) throw new Error('Selected Desktop session has no active binding')
    window.__runPanelSession = binding.session
    ctx.sessions.handleSessionStatus(${sessionId}, true)
  })()`)
  try {
    await waitForProjection(0)
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
    expect((await waitForProjection(1)).hasActiveRuns).toBe(false)
    await waitForValue(page, counts, value => value?.runs === 1 && value.summary === '1 个运行 · 1 个媒体')
    publishSavedDesktopRun(context, stagedRunRepository, mediaFixture.newer.runId)
    await waitForValue(page, counts, value => value?.runs === 2 && value.summary === '2 个运行 · 2 个媒体')
    expect(await page.evaluate('window.__runningSessionSnapshot === window.__runPanelSession.getSnapshot()')).toBe(true)
    expect(await page.evaluate('window.__runningSessionSnapshot.running')).toBe(true)
  } finally {
    await page.evaluate('window.__restoreGenerationObserver()')
    await page.evaluate(`window.__runPanelTestContext.sessions.handleSessionStatus(${sessionId}, false)`)
  }
}

describe('live DSH Desktop production integration', () => {
  it('verifies disabled Kimi/PPT, Session deletion, project state, models, Providers and media actions', async () => {
    const developmentContext = await loadTestDesktopContext()
    const base = {
      ...developmentContext,
    }
    const repositoryLockfile = resolve(base.repositoryRoot, 'pnpm-lock.yaml')
    const repositoryLockfileBefore = await readFile(repositoryLockfile, 'utf8')
    await mkdir(resolve(base.repositoryRoot, '.local'), { recursive: true })
    const runtimeRoot = await mkdtemp(resolve(base.repositoryRoot, '.local/desktop-live-'))
    const downloadPath = resolve(runtimeRoot, 'downloads')
    await mkdir(downloadPath)
    const runtimeHome = resolve(runtimeRoot, 'home')
    const environmentFilePath = resolve(runtimeRoot, 'desktop.env')
    const startupWorkspacePath = await mkdtemp(join(tmpdir(), 'harness-desktop-skill-workspace-'))
    const context = {
      ...base,
      runtimeRoot,
      runtimeHome,
      dshHome: resolve(runtimeHome, relative(base.runtimeHome, base.dshHome)),
      pidFile: resolve(runtimeRoot, 'desktop.pid'),
      userData: resolve(runtimeRoot, 'user-data'),
      stateFile: resolve(runtimeRoot, 'state/desktop.json'),
      logFile: resolve(runtimeRoot, 'anywhere.log'),
      lifecycleEvidenceFile: resolve(runtimeRoot, 'user-data/lifecycle-events/startup.jsonl'),
      managedPluginDirectory: resolve(runtimeRoot, 'managed-plugins', base.baseline.profile.pluginPackageName),
      environmentFilePath,
      startupWorkspacePath,
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
      `OPENCODE_GO_API_KEY=desktop-live-test\nDESKTOP_PROMPT_CAPTURE_API_KEY=desktop-capture-test\n`,
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
    const identity = await seedSavedDesktopSession(context)
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
    await writeFile(resolve(context.dshHome, 'settings.yaml'), JSON.stringify({
      'llm-pi-ai': { providers: customProviders },
      'harness-comfyui-source': { configuration: { url: 'http://127.0.0.1', port: Number(new URL(promptCapture.baseURL).port) } },
    }))
    const stagedRunRepository = resolve(runtimeRoot, 'staged-runs.sqlite')
    const mediaFixture = await seedDesktopMedia(context, identity, stagedRunRepository)
    const debuggingPort = await findFreePort()
    let startupError
    fixture.start = startDesktopWorktree(context, {
      remoteDebuggingPort: debuggingPort,
      spawnDesktop(executable, args, options) {
        const downloadHelper = resolve(base.repositoryRoot, 'tests/support/electron-downloads.cjs')
        const hook = `require(${JSON.stringify(downloadHelper)}).installElectronTestDownloads(require('electron'), ${JSON.stringify(downloadPath)});\n`
        writeFileSync(args[0], hook + readFileSync(args[0], 'utf8'))
        return spawn(executable, args, options)
      },
    })
      .catch(error => { startupError = error })
    await waitForDesktopReady(context, () => startupError)
    expect(await readFile(repositoryLockfile, 'utf8')).toBe(repositoryLockfileBefore)

    const page = await connectDesktopPage(debuggingPort)
    let browser = null
    let downloadBehaviorEnabled = false
    let deviceMetricsOverridden = false
    let contextCaptureScript
    try {
      contextCaptureScript = await captureProjectClientContext(page)
      await page.evaluate(`(() => {
        const notice = [...document.querySelectorAll('[role="dialog"]')]
          .find(dialog => dialog.textContent?.includes('内测声明'))
        const proceed = [...(notice?.querySelectorAll('button') ?? [])]
          .find(button => button.textContent?.trim() === '继续')
        proceed?.click()
      })()`)
      await waitForValue(page, `[...document.querySelectorAll('[role="dialog"]')]
        .every(dialog => !dialog.textContent?.includes('内测声明'))`, value => value === true)
      await page.evaluate(`(async () => {
        const remote = window.__runPanelTestContext.get('remote.session')
        for (const [id, title] of ${JSON.stringify([
          [identity.sessionId, 'Desktop media session'],
          [identity.switchSessionId, 'Desktop session switch target'],
          [identity.deleteSessionId, identity.deleteSessionTitle],
        ])}) {
          const renamed = await remote.rename({ sessionId: id, title })
          if (!renamed.ok) throw new Error(JSON.stringify(renamed))
        }
      })()`)
      await verifyPresetScopedRepositorySkills(page, identity.workspaceId)
      await verifyKimiPptDisabled(page, identity.sessionId)
      await verifyKimiPptHostRequestDisabled(page, promptCapture, identity.workspaceId)
      const catalogRemote = await page.evaluate("window.__runPanelTestContext.get('remote.harnessComfyuiCatalog').baseModels()")
      expect(catalogRemote).toEqual({ ok: true, value: { ok: true, value: { items: [{ id: '123', label: 'Desktop catalog fixture' }] } } })
      const imageModels = await page.evaluate("window.__runPanelTestContext.get('remote.harnessComfyuiImageReader').models()")
      expect(imageModels.ok).toBe(true)
      expect(imageModels.value.groups.length).toBeGreaterThan(0)
      const deletionAvailable = await page.evaluate("typeof window.__runPanelTestContext.get('remote.session').delete === 'function'")
      expect.soft(deletionAvailable, 'Desktop must provide Session deletion').toBe(true)
      if (deletionAvailable) await verifySessionDeletion(page, identity)
      const deletionReads = await page.evaluate(`(async () => {
        const remote = window.__runPanelTestContext.get('remote.session')
        const read = sessionId => remote.page({ address: { kind: 'session', sessionId }, throughSeq: -1 })
        return {
          deleted: await read(${JSON.stringify(identity.deleteSessionId)}),
          kept: await read(${JSON.stringify(identity.sessionId)}),
        }
      })()`)
      expect.soft(deletionReads.deleted.ok, 'deleted Session must no longer be readable').toBe(false)
      expect(deletionReads.kept.ok, 'unrelated Session must remain readable').toBe(true)
      browser = await connectDesktopBrowser(debuggingPort)
      await browser.command('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath,
        eventsEnabled: true,
      })
      downloadBehaviorEnabled = true
      await waitForValue(page, 'window.innerWidth', value => value >= 680)
      const desktopViewport = await page.evaluate(`({ width: window.innerWidth, height: window.innerHeight, deviceScaleFactor: window.devicePixelRatio, mobile: false })`)
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
      const profileManifest = JSON.parse(await readFile(resolve(context.dshHome, 'profiles', context.baseline.profile.name, 'package.json'), 'utf8'))
      expect(profileManifest.dependencies['harness-comfyui']).toMatch(/^link:/u)
      expect(profileManifest.dsh.profile.bundles).toContain('harness-comfyui')
      const installedPlugin = resolve(context.dshHome, 'profiles', context.baseline.profile.name, 'node_modules/harness-comfyui')
      expect(await readlink(installedPlugin)).toBe(context.managedPluginDirectory)
      expect(JSON.parse(await readFile(resolve(installedPlugin, 'package.json'), 'utf8')).version)
        .toBe(JSON.parse(await readFile(resolve(base.repositoryRoot, 'package.json'), 'utf8')).version)


      await openComposerModelMenu(page)
      for (const model of [
        { id: 'qwen3.8-flash', name: 'Qwen3.8 Flash' },
        { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash (2x usage)' },
        { id: 'hy4-preview', name: 'Hy4 preview' },
        { id: 'grok-4.6', name: 'Grok 4.6' },
      ]) {
        expect.soft(await composerModelsNamed(page, model.name)).toEqual([{ name: model.name, openCodeGo: true }])
      }
      await page.evaluate(`(() => {
        const menu = document.querySelector('[role="menu"][aria-label="模型与推理等级"]')
        const trigger = [...document.querySelectorAll('button[aria-haspopup="menu"]')]
          .find(button => button.getAttribute('aria-controls') === menu?.id)
        trigger?.click()
      })()`)
      await waitForValue(
        page,
        `document.querySelector('[role="menu"][aria-label="模型与推理等级"]') === null`,
        value => value === true,
      )

      try {
        await verifyCustomProviderReasoning(page, context, customProviders)
      } catch (error) {
        expect.soft(error, 'custom Provider reasoning settings must preserve the supported levels').toBeUndefined()
        await page.command('Page.reload')
        await waitForValue(page, 'window.__runPanelTestContext !== undefined', value => value === true)
      }

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
      expect.soft(catalog).toEqual(expect.objectContaining({
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
      expect.soft(catalog.model.options).not.toContain('ox-alpha-free')
      expect.soft(catalog.model.options).not.toContain('hy4-preview')

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
      const switchedSurface = await waitForValue(page, `(() => {
        const section = document.querySelector('.harness-comfyui-image-reader-settings')
        if (!section) return 'unmounted'
        const profile = [...section.querySelectorAll('label')]
          .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
          ?.querySelector('select')
        return profile?.value === ${JSON.stringify(firstProfile.id)} ? 'active' : null
      })()`, value => value !== null)
      if (switchedSurface === 'active') await delay(300)
      if (switchedSurface === 'unmounted'
        || await page.evaluate(`document.querySelector('.harness-comfyui-image-reader-settings') === null`)) {
        await openSettings(page)
        await page.evaluate(`([...document.querySelectorAll('button')]
          .find(node => node.textContent?.trim() === 'ComfyUI')?.click(), true)`)
      }
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
          return { profile: profile?.value, provider: provider?.value, model: model?.value,
            feedback: [...document.querySelectorAll('.harness-comfyui-image-reader-settings [role="alert"]')]
              .map(node => node.textContent?.trim()).filter(Boolean) }
        })()`,
        value => value.profile === firstProfile.id
          && value.provider === 'deepseek-official' && value.model === selectedModel,
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
      await page.evaluate(`window.__runPanelTestContext.sidebarRight.openTab('guide')`)
      await waitForValue(page, `document.querySelector('[data-sidebar-right-guide]') !== null`, value => value === true)
      await page.evaluate(`(document.querySelector('.harness-comfyui-sidebar-entry')?.click(), true)`)
      await waitForValue(page, `!!document.querySelector('.harness-comfyui-dock-actions')`, value => value === true)
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
            tabVisible: drawer.getAttribute('data-tab-visible') === 'true',
            media: drawer.textContent?.includes('2 个媒体') === true,
            tabs: tabs.map(tab => tab.textContent?.trim()),
            selected: tabs.map(tab => tab.getAttribute('aria-selected')),
            hidden: panels.map(panel => panel.hidden),
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.tabVisible === true
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
            nativeGuideVisible: (() => {
              const guide = document.querySelector('[data-sidebar-right-guide]')
              const panel = guide?.closest('[data-sidebar-right-panel]')
              return !!guide && panel?.hasAttribute('data-sidebar-right-open') === true
                && panel.getAttribute('aria-hidden') !== 'true'
                && guide.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
            })(),
            tabVisible: drawer?.getAttribute('data-tab-visible') === 'true',
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.drawerExists === false
          && value?.nativeGuideVisible === true
          && value?.tabVisible === false
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
            tabVisible: drawer?.getAttribute('data-tab-visible') === 'true',
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.drawerExists === true
          && value?.tabVisible === true
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
            tabVisible: drawer?.getAttribute('data-tab-visible') === 'true',
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.drawerExists === false
          && value?.tabVisible === false
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
            tabVisible: drawer?.getAttribute('data-tab-visible') === 'true',
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.drawerExists === true
          && value?.tabVisible === true
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
            tabVisible: drawer?.getAttribute('data-tab-visible') === 'true',
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.selected === true
          && value?.drawerExists === false
          && value?.tabVisible === false
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
            tabVisible: drawer?.getAttribute('data-tab-visible') === 'true',
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.drawerExists === true
          && value?.tabVisible === true
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
            .find(button => button.textContent?.trim() === '关闭结果列')
          return {
            selected,
            drawerExists: drawer !== null,
            tabVisible: drawer?.getAttribute('data-tab-visible') === 'true',
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.selected === true
          && value?.drawerExists === true
          && value?.tabVisible === true
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
      await expect.soft(expectCompletedDownload(browser, {
        url: new URL(
          `/api/harness-comfyui/media/${mediaFixture.newer.mediaId}/download?session_id=${identity.sessionId}`,
          desktopOrigin,
        ).href,
        filename: mediaFixture.newer.filename,
        bytes: mediaFixture.newerGifBytes,
        byteLength: mediaFixture.newerGifBytes.length,
        downloadPath,
      })).resolves.toMatchObject({ progress: { state: 'completed' } })

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
      await expect.soft(expectCompletedDownload(browser, {
        url: new URL(
          `/api/harness-comfyui/media/${mediaFixture.older.mediaId}/download?session_id=${identity.sessionId}`,
          desktopOrigin,
        ).href,
        filename: mediaFixture.older.filename,
        bytes: mediaFixture.olderGifBytes,
        byteLength: mediaFixture.olderGifBytes.length,
        downloadPath,
      })).resolves.toMatchObject({ progress: { state: 'completed' } })
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
      await page.command('Emulation.setDeviceMetricsOverride', desktopViewport)
      await waitForValue(page, 'window.innerWidth', width => width === desktopViewport.width)
      await verifyContextDialog(page, context)
    } catch (error) {
      const pageState = await page.evaluate(`({
        text: document.body.innerText,
        dialogs: [...document.querySelectorAll('[role="dialog"]')].map(node => node.getAttribute('aria-label')),
      })`).catch(() => null)
      await writeFile(resolve(base.repositoryRoot, '.local/desktop-live-failure.json'),
        JSON.stringify({ error: String(error), pageState }, null, 2))
      throw error
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
