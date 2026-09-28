import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createImageReaderProfile } from '../../src/image-reader/settings.ts'
import { ImageReaderService } from '../../src/host/image-reader/image-reader-service.ts'
import { createTestDesktopRequire, loadTestDesktopContext } from '../support/desktop-context.mjs'

const temporaryDirectories = []

afterEach(async () => {
  vi.unstubAllEnvs()
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

async function candidateModules() {
  const context = await loadTestDesktopContext()
  const requireFromDesktop = createTestDesktopRequire(context)
  const fromDesktop = name => import(pathToFileURL(requireFromDesktop.resolve(name)).href)
  const [llm, deepseekAdapter, piAdapter, sessions] = await Promise.all([
    fromDesktop('@deepseek-ai/dsh-llm'),
    fromDesktop('@deepseek-ai/dsh-llm-deepseek-api-key'),
    fromDesktop('@deepseek-ai/dsh-llm-pi-ai'),
    fromDesktop('@deepseek-ai/dsh-session'),
  ])
  return { llm, deepseekAdapter, piAdapter, sessions }
}

function sseResponse(response, endpoint) {
  const completionChunks = [
    {
      id: 'session-identity-capture',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'identity-test-model',
      choices: [{ index: 0, delta: { role: 'assistant', content: 'captured' }, finish_reason: null }],
    },
    {
      id: 'session-identity-capture',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'identity-test-model',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    },
  ]
  const messageChunks = [
    { type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'captured' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
    { type: 'message_stop' },
  ]
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
  if (endpoint === '/v1/messages') {
    response.end(messageChunks.map(chunk => `event: ${chunk.type}\ndata: ${JSON.stringify(chunk)}\n\n`).join(''))
    return
  }
  response.end(`${completionChunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`)
}

async function requestCaptureServer() {
  const chatRequests = []
  const waiters = []
  const server = createServer((request, response) => {
    const body = []
    request.on('data', chunk => body.push(chunk))
    request.on('end', () => {
      if (request.url === '/v1/files' && request.method === 'POST') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          id: 'file_session_identity',
          object: 'file',
          bytes: 4,
          created_at: 1,
          filename: 'session-identity.png',
          purpose: 'user_data',
          expires_at: 3601,
        }))
        return
      }
      if ((request.url === '/v1/chat/completions' || request.url === '/v1/messages') && request.method === 'POST') {
        chatRequests.push({ headers: request.headers, body: Buffer.concat(body).toString('utf8') })
        waiters.splice(0).forEach(resolveWaiter => resolveWaiter())
        sseResponse(response, request.url)
        return
      }
      response.writeHead(404)
      response.end()
    })
  })
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('request capture server has no TCP port')
  return {
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    chatRequests,
    async waitForRequestCount(count) {
      while (chatRequests.length < count) {
        await Promise.race([
          new Promise(resolveWaiter => waiters.push(resolveWaiter)),
          new Promise((_, rejectWaiter) => setTimeout(
            () => rejectWaiter(new Error(`timed out waiting for ${count} model requests`)),
            5_000,
          )),
        ])
      }
    },
    async close() {
      await new Promise((resolveClose, rejectClose) => {
        server.close(error => error ? rejectClose(error) : resolveClose())
        server.closeAllConnections?.()
      })
    },
  }
}

async function consume(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
}

describe('candidate Stable model request Session identity', () => {
  it.each([
    {
      adapterName: 'dsh-llm-deepseek',
      provider: 'deepseek-official',
      plugin: 'deepseekAdapter',
      configuration: baseURL => ({
        apiKeyEnv: 'SESSION_IDENTITY_TEST_API_KEY',
        baseURL,
        reasoningEffort: 'off',
        models: [
          { id: 'identity-test-model', inputModalities: ['text'] },
          { id: 'identity-test-vision', inputModalities: ['text', 'image'] },
        ],
      }),
    },
    {
      adapterName: 'dsh-llm-pi-ai OpenCode Go custom-provider path',
      provider: 'opencode-go',
      plugin: 'piAdapter',
      configuration: baseURL => ({
        providers: {
          'opencode-go': {
            apiKeyEnv: 'SESSION_IDENTITY_TEST_API_KEY',
            displayName: 'OpenCode Go identity capture',
            api: 'openai-completions',
            baseURL,
            models: [
              {
                id: 'identity-test-model',
                name: 'Identity test model',
                contextWindow: 65_536,
                maxTokens: 4_096,
                input: ['text'],
              },
              {
                id: 'identity-test-vision',
                name: 'Identity test vision model',
                contextWindow: 65_536,
                maxTokens: 4_096,
                input: ['text', 'image'],
              },
            ],
          },
        },
      }),
    },
  ])('$adapterName sends ordinary, child, and image-reading Session IDs', async scenario => {
    const root = await mkdtemp(resolve(tmpdir(), 'session-request-identity-'))
    temporaryDirectories.push(root)
    vi.stubEnv('DSH_HOME', resolve(root, 'dsh-home'))
    vi.stubEnv('SESSION_IDENTITY_TEST_API_KEY', 'local-capture-key')
    const capture = await requestCaptureServer()
    const modules = await candidateModules()
    const { llm, sessions } = modules
    const ctx = new Context()
    const attachment = {
      attachmentId: `sha256:${'1'.repeat(64)}`,
      mediaType: 'image/png',
      bytes: 4,
      width: 1,
      height: 1,
      name: 'session-identity.png',
    }
    ctx.provide('attachments', {
      imageLimits: {
        maxImageBytes: 1024,
        maxImagesPerMessage: 1,
        maxMessageImageBytes: 1024,
        maxImagePixels: 1_000_000,
        maxImageDimension: 4096,
        mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
      },
      saveImage: vi.fn(async () => attachment),
      imageHostPath: vi.fn(() => undefined),
      readImageRequest: vi.fn(async ref => ({
        variantId: `sha256:${'2'.repeat(64)}`,
        attachment: ref,
        data: new Uint8Array([137, 80, 78, 71]),
        mediaType: 'image/png',
        bytes: 4,
        width: 1,
        height: 1,
        depth: 'uchar',
        space: 'srgb',
        hasAlpha: false,
      })),
    })
    const fibers = []
    try {
      fibers.push(await ctx.plugin(llm.default, {}))
      fibers.push(await ctx.plugin(sessions.default, {}))
      fibers.push(await ctx.plugin(modules[scenario.plugin], scenario.configuration(capture.baseURL)))

      const ordinary = ctx.sessions.create('session_identity_ordinary')
      const child = ctx.sessions.fork(ordinary, undefined, 'session_identity_child')
      const createMessage = text => llm.createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'plugin', plugin: 'session-identity-test' },
      })
      for (const session of [ordinary, child]) {
        const prepared = await ctx.llm.prepareCall({
          provider: scenario.provider,
          model: 'identity-test-model',
          maxTokens: 32,
        })
        await consume(prepared.stream({
          ...prepared.config,
          messages: [createMessage(String(session.id))],
          sessionId: session.id,
        }))
      }

      const imageSession = ctx.sessions.create('session_identity_image_reader')
      const imageReader = new ImageReaderService({
        scope: {
          get: () => ({
            configuration: {
              activeProfileId: 'runtime',
              profiles: [{
                ...createImageReaderProfile('runtime'),
                provider: scenario.provider,
                model: 'identity-test-vision',
              }],
            },
            credentials: {},
          }),
        },
        attachments: ctx.attachments,
        llm: ctx.llm,
        prepareInput: async () => ({
          data: new Uint8Array([137, 80, 78, 71]),
          mediaType: 'image/png',
          name: 'session-identity.png',
        }),
      })
      await expect(imageReader.inspect('/virtual/session-identity.png', {
        sessionId: String(imageSession.id),
      })).resolves.toMatchObject({ observation: 'captured' })

      await capture.waitForRequestCount(3)
      expect(capture.chatRequests.map(request => request.headers['x-deepseek-harness-session-id']))
        .toEqual([String(ordinary.id), String(child.id), String(imageSession.id)])
    } finally {
      for (const fiber of fibers.reverse()) await fiber.dispose()
      await ctx.fiber.dispose()
      await capture.close()
    }
  })
})
