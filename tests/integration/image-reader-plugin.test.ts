import { createTestCredentialProvider } from '../support/credential-provider.ts'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import imageReaderRuntime from '../../config/image-reader-runtime.json' with { type: 'json' }
import * as imageReader from '../../src/host/image-reader/plugin.ts'
import { createImageReaderProfile, IMAGE_READER_PROFILE_ENTRY_ID, type ImageReaderSettingsSection } from '../../src/image-reader/settings.ts'
import { startCliServer } from '../../src/host/cli/server.ts'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })
async function fixture(connectionType: 'runtime' | 'openai-compatible' = 'runtime', endpoint = '', config: Parameters<typeof imageReader.Config>[0] = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'independent-reader-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const file = join(directory, 'image.png')
  await writeFile(file, await sharp({ create: { width: 10, height: 10, channels: 3, background: 'red' } }).png().toBuffer())
  let settings: ImageReaderSettingsSection = {
    configuration: { activeProfileId: 'vision', profiles: [{ ...createImageReaderProfile('vision'), connectionType, endpoint, provider: connectionType === 'runtime' ? 'test' : '', model: 'vision', defaultPrompt: '观察颜色' }] }, credentialRefs: {},
  }
  const ctx = new Context()
  ctx.provide('credentials' as never, createTestCredentialProvider() as never)
  const unregister = vi.fn()
  const register = vi.fn(() => unregister)
  const stream = vi.fn(async function*(_request: any) { yield { type: 'text-delta', index: 0, text: '红色' }; yield { type: 'finish', reason: { kind: 'stop' } } })
  ctx.provide('tools', { register } as never)
  ctx.provide('attachments', {
    imageLimits: { maxImageBytes: 1_000_000, maxImagesPerMessage: 1, maxMessageImageBytes: 1_000_000, maxImagePixels: 1_000_000, maxImageDimension: 4096, mediaTypes: ['image/png'] },
    saveImage: async () => ({ attachmentId: 'test-image', mediaType: 'image/png', bytes: 100, width: 10, height: 10 }),
  } as never)
  ctx.provide('llm', {
    listProviders: () => [], listModels: async () => [],
    prepareCall: async (config: unknown) => ({ config, inputModalities: ['text', 'image'], stream }),
  } as never)
  ctx.provide('settings', {
    describe: () => [{ ns: IMAGE_READER_PROFILE_ENTRY_ID, value: settings, user: settings }],
    replace: async (ns: string, value: ImageReaderSettingsSection) => {
      if (ns !== IMAGE_READER_PROFILE_ENTRY_ID) throw new Error(`Unexpected Settings entry: ${ns}`)
      settings = value
    },
  } as never)
  const fiber = ctx.plugin(imageReader, config)
  await fiber
  cleanup.push(() => fiber.dispose())
  return { ctx, fiber, file, stream, register, unregister, settings: () => settings }
}

describe('independent image reader plugin', () => {
  it('reads through DSH LLM with the documented Host services', async () => {
    const f = await fixture()
    expect(f.register).toHaveBeenCalledOnce()
    expect(await f.ctx.imageReader.inspect(f.file, { sessionId: 'real-session' })).toMatchObject({ observation: '红色', provider: 'test' })
    expect(f.stream.mock.calls[0]![0]).toMatchObject({ sessionId: 'real-session' })
    const records = f.ctx.logger.buffer.filter(entry => entry.name === 'harness-comfyui-image-reader')
    expect(records.map(entry => entry.args[0])).toEqual(Array(4).fill(imageReaderRuntime.diagnosticLogFormat))
    expect(records.map(entry => JSON.parse(entry.args[1]).stage)).toEqual(['preparing', 'input_prepared', 'request_sent', 'completed'])
    for (const name of ['harnessComfyuiCore', 'workspaceRegistry', 'webServer']) expect(f.ctx.get(name)).toBeUndefined()
    await expect(f.ctx.imageReader.inspect('/missing/image.png')).rejects.toMatchObject({ code: 'IMAGE_READER_FILE_INVALID' })
  })
  it('reads through an independent OpenAI-compatible HTTP provider', async () => {
    let payload: any
    const provider = await startCliServer(() => async (request, response) => {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      payload = JSON.parse(Buffer.concat(chunks).toString())
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ choices: [{ message: { content: '红色方块' } }] }))
    })
    cleanup.push(() => provider.close())
    const f = await fixture('openai-compatible', `${provider.origin}/v1/chat/completions`)
    expect(await f.ctx.imageReader.inspect(f.file)).toMatchObject({ observation: '红色方块' })
    expect(payload.messages[0].content[0].text).toBe('观察颜色')
    expect(payload.messages[0].content[1].image_url.url).toMatch(/^data:image\/png;base64,/)
    expect(f.stream).not.toHaveBeenCalled()
  })
  it('owns configuration mutations and model catalog without a Remote', async () => {
    const f = await fixture()
    const signal = new AbortController().signal
    await expect(f.ctx.imageReader.models(signal)).resolves.toEqual({ groups: [], failures: [] })
    const profile = { ...createImageReaderProfile('second'), connectionType: 'runtime' as const, provider: 'test', model: 'other' }
    await f.ctx.imageReader.saveProfile({ operation: 'create', profile, activateProfileId: 'second' }, signal)
    expect(f.settings().configuration.activeProfileId).toBe('second')
    await f.ctx.imageReader.activateProfile({ profileId: 'vision' }, signal)
    await f.ctx.imageReader.deleteProfile({ profileId: 'second' }, signal)
    expect(f.settings().configuration.profiles.map(profile => profile.id)).toEqual(['vision'])
    await expect(f.ctx.imageReader.deleteProfile({ profileId: 'vision' }, signal)).rejects.toMatchObject({ code: 'IMAGE_READER_LAST_PROFILE_DELETE_FORBIDDEN' })
  })
  it('bounds disposal when a model catalog provider ignores cancellation', async () => {
    const f = await fixture('runtime', '', { shutdownTimeoutMs: 1 })
    const started = deferred()
    const release = deferred()
    f.ctx.llm.listProviders = () => [{ id: 'blocked', name: 'blocked' }] as never
    f.ctx.llm.listModels = async () => { started.resolve(); await release.promise; return [] }
    const result = f.ctx.imageReader.models(new AbortController().signal)
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await started.promise
    const logged = vi.spyOn(f.fiber.ctx.logger, 'error').mockImplementation(() => undefined)
    try {
      await f.fiber.dispose()
      expect(logged).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('shutdownTimeoutMs') }))
    }
    finally { release.resolve(); await assertion; logged.mockRestore() }
  })
  it.each(['caller', 'plugin'] as const)('cancels active inspection on %s disposal and releases the Tool', async cause => {
    const f = await fixture()
    const started = deferred()
    const controller = new AbortController()
    f.stream.mockImplementation(async function*(request: any): AsyncGenerator<any> {
      started.resolve()
      await new Promise<void>((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }))
    })
    const service = f.ctx.imageReader
    const result = service.inspect(f.file, { signal: controller.signal })
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await started.promise
    if (cause === 'caller') controller.abort()
    else await f.fiber.dispose()
    await assertion
    if (cause === 'caller') await f.fiber.dispose()
    expect(f.unregister).toHaveBeenCalledOnce()
    expect(f.ctx.get('imageReader')).toBeUndefined()
    await expect(service.inspect(f.file)).rejects.toMatchObject({ name: 'AbortError' })
  })
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
