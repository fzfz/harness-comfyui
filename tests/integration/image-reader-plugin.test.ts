import { createTestCredentialProvider } from '../support/credential-provider.ts'
import { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import imageReaderRuntime from '../../config/image-reader-runtime.json' with { type: 'json' }
import * as imageReader from '../../src/host/image-reader/plugin.ts'
import { ImageReaderRemoteService } from '../../src/host/image-reader/image-reader-host.ts'
import { createImageReaderProfile, IMAGE_READER_PROFILE_ENTRY_ID, type ImageReaderSettingsSection } from '../../src/image-reader/settings.ts'

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
  const providers: Record<string, any> = {}
  const ctx = new Context()
  const credentials = createTestCredentialProvider()
  if (connectionType === 'openai-compatible') {
    const reference = credentialRef('DSH_HARNESS_COMFYUI_IMAGE_READER_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    await credentials.set(reference, 'configured-service-key')
    settings = { ...settings, credentialRefs: { vision: reference },
      configuration: { ...settings.configuration, profiles: settings.configuration.profiles.map(profile => ({ ...profile, hasApiKey: true })) } }
  }
  ctx.provide('credentials' as never, credentials as never)
  cleanup.push(() => ctx.fiber.dispose())
  ctx.provide('systemPrompt', { tools: vi.fn() } as never)
  await ctx.plugin(ToolRuntime)
  const stream = vi.fn(async function*(_request: any) { yield { type: 'text-delta', index: 0, text: '红色' }; yield { type: 'finish', reason: { kind: 'stop' } } })
  ctx.provide('attachments', {
    imageLimits: { maxImageBytes: 1_000_000, maxImagesPerMessage: 1, maxMessageImageBytes: 1_000_000, maxImagePixels: 1_000_000, maxImageDimension: 4096, mediaTypes: ['image/png'] },
    saveImage: async () => ({ attachmentId: 'test-image', mediaType: 'image/png', bytes: 100, width: 10, height: 10 }),
  } as never)
  ctx.provide('llm', {
    listProviders: () => [], listModels: async () => [],
    listConfigurableProviders: () => Object.keys(providers).map(provider => ({ provider, settingsNs: 'llm-pi-ai', settingsPath: ['providers', provider] })),
    prepareCall: async (config: unknown) => ({ config, inputModalities: ['text', 'image'], stream }),
  } as never)
  ctx.provide('settings', {
    describe: () => [{ ns: IMAGE_READER_PROFILE_ENTRY_ID, value: settings, user: settings, revision: 0 },
      { ns: 'llm-pi-ai', value: { providers }, user: { providers }, revision: 0 }],
    mutate: async (ns: string, ops: readonly any[]) => {
      if (ns !== 'llm-pi-ai') throw new Error(`Unexpected native Settings entry: ${ns}`)
      for (const op of ops) {
        let node: any = { providers }
        for (const key of op.path.slice(0, -1)) node = node[key] ??= {}
        if (op.op === 'set') node[op.path.at(-1)] = op.value
        else delete node[op.path.at(-1)]
      }
    },
    replace: async (ns: string, value: ImageReaderSettingsSection) => {
      if (ns !== IMAGE_READER_PROFILE_ENTRY_ID) throw new Error(`Unexpected Settings entry: ${ns}`)
      settings = value
    },
  } as never)
  const fiber = ctx.plugin(imageReader, config)
  await fiber
  return { ctx, fiber, file, stream, providers, settings: () => settings }
}

describe('independent image reader plugin', () => {
  it.each(['remote-caller', 'plugin'] as const)('cancels a public profile save during native preflight on %s cancellation', async cause => {
    const f = await fixture('openai-compatible', 'http://127.0.0.1:8003/v1/chat/completions')
    const profile = { ...(await f.ctx.imageReader.configuration()).profiles[0]!, connectionType: 'openai-compatible' as const }
    await f.ctx.imageReader.saveProfile({ operation: 'update', activateProfileId: profile.id, profile,
      credential: { action: 'replace', apiKey: 'original-key' } }, new AbortController().signal)
    const originalSettings = structuredClone(f.settings())
    const originalProviders = structuredClone(f.providers)
    const originalReference = f.providers['harness-comfyui-image-reader-vision.1'].apiKeyEnv
    const started = deferred()
    const controller = new AbortController()
    let receivedSignal: AbortSignal | undefined
    f.ctx.llm.prepareCall = async (_config, signal) => {
      receivedSignal = signal
      started.resolve()
      if (signal === undefined) throw new Error('Profile save requires its cancellation signal')
      await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
      throw new Error('Unexpected preparation completion')
    }
    const service = cause === 'remote-caller' ? new ImageReaderRemoteService(f.ctx, f.ctx.imageReader) : f.ctx.imageReader
    const result = service.saveProfile({ operation: 'update', activateProfileId: profile.id,
      profile: { ...profile, endpoint: 'http://127.0.0.1:8004/v1/chat/completions' },
      credential: { action: 'replace', apiKey: 'staged-key' } }, controller.signal)
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await started.promise
    const stagedReference = f.providers['harness-comfyui-image-reader-vision.1'].apiKeyEnv
    if (cause === 'remote-caller') controller.abort()
    else await f.fiber.dispose()
    await assertion
    expect(receivedSignal).toBeInstanceOf(AbortSignal)
    expect(receivedSignal?.aborted).toBe(true)
    expect(f.settings()).toEqual(originalSettings)
    expect(f.providers).toEqual(originalProviders)
    expect((await f.ctx.credentials.resolve(originalReference))?.value).toBe('original-key')
    expect(await f.ctx.credentials.resolve(stagedReference)).toBeUndefined()
  })

  it('cancels active image inspection migration when the image reader plugin is disposed', async () => {
    const f = await fixture('openai-compatible', 'http://127.0.0.1:8003/v1/chat/completions')
    const started = deferred()
    f.ctx.llm.prepareCall = async (_config, signal) => {
      started.resolve()
      if (signal === undefined) throw new Error('Migration requires the plugin lifecycle signal')
      await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
      throw new Error('Unexpected preparation completion')
    }
    const result = f.ctx.imageReader.inspect(f.file)
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await started.promise
    await f.fiber.dispose()
    await assertion
    expect(f.providers).toEqual({})
  })

  it('reads through DSH LLM with the documented Host services', async () => {
    const f = await fixture()
    expect(f.ctx.tools.schemas()).toEqual([])
    expect(await f.ctx.imageReader.inspect(f.file, { sessionId: 'real-session' })).toMatchObject({ observation: '红色', provider: 'test' })
    expect(f.stream.mock.calls[0]![0]).toMatchObject({ sessionId: 'real-session' })
    const records = f.ctx.logger.buffer.filter(entry => entry.name === 'harness-comfyui-image-reader')
    expect(records.map(entry => entry.args[0])).toEqual(Array(4).fill(imageReaderRuntime.diagnosticLogFormat))
    expect(records.map(entry => JSON.parse(entry.args[1]).stage)).toEqual(['preparing', 'input_prepared', 'request_sent', 'completed'])
    for (const name of ['harnessComfyuiCore', 'workspaceRegistry', 'webServer']) expect(f.ctx.get(name)).toBeUndefined()
    await expect(f.ctx.imageReader.inspect('/missing/image.png')).rejects.toMatchObject({ code: 'IMAGE_READER_FILE_INVALID' })
  })
  it('migrates a custom endpoint and reads through the native LLM and attachment services', async () => {
    const f = await fixture('openai-compatible', 'http://127.0.0.1:8003/v1/chat/completions')
    expect(await f.ctx.imageReader.inspect(f.file)).toMatchObject({ observation: '红色', provider: 'harness-comfyui-image-reader-vision.1' })
    expect(f.providers['harness-comfyui-image-reader-vision.1']).toMatchObject({ api: 'openai-completions', baseURL: 'http://127.0.0.1:8003/v1' })
    expect(f.stream).toHaveBeenCalledOnce()
    expect(f.stream.mock.calls[0]![0].messages[0].content).toEqual([
      { type: 'text', text: '观察颜色' },
      { type: 'image', attachment: expect.objectContaining({ attachmentId: 'test-image' }) },
    ])
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
  it.each(['caller', 'plugin'] as const)('cancels active inspection on %s disposal and releases the service', async cause => {
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
    expect(f.ctx.tools.schemas()).toEqual([])
    expect(f.ctx.get('imageReader')).toBeUndefined()
    await expect(service.inspect(f.file)).rejects.toMatchObject({ name: 'AbortError' })
  })
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
