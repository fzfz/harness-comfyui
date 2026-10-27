import { describe, expect, it, vi } from 'vitest'
import { SettingsConflictError, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { createCliHandler } from '../../src/host/cli/route.ts'
import { startCliServer } from '../../src/host/cli/server.ts'
import { CLI_ROUTE_PATH } from '../../src/cli/contract.ts'
import type { ImageReaderDiagnostic } from '../../src/image-reader/diagnostics-schema.ts'
import { ImageReaderService } from '../../src/host/image-reader/image-reader-service.ts'
import { ImageReaderConfigurationService } from '../../src/host/image-reader/configuration-service.ts'
import { ImageReaderNativeSettings } from '../../src/host/image-reader/native-settings.ts'
import { imageReaderSettingsStore } from '../../src/host/image-reader/settings-registration.ts'
import { createImageReaderProfile, IMAGE_READER_PROFILE_ENTRY_ID } from '../../src/image-reader/settings.ts'
import type { ImageReaderCredentialRef } from '../../src/image-reader/credential-schema.ts'

const reference = 'DSH_HARNESS_COMFYUI_IMAGE_READER_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as ImageReaderCredentialRef

function fixture() {
  const profile = { ...createImageReaderProfile('custom', 'My vision'), connectionType: 'openai-compatible' as const,
    endpoint: 'http://127.0.0.1:8003/v1/chat/completions', model: 'vision-model', hasApiKey: true,
    defaultPrompt: 'User observation prompt', temperature: 0.6, maxTokens: 4096 }
  const documents: Record<string, any> = {
    [IMAGE_READER_PROFILE_ENTRY_ID]: { configuration: { activeProfileId: 'custom', profiles: [profile] }, credentialRefs: { custom: reference } },
    'llm-pi-ai': { providers: {} },
  }
  const settings = {
    describe: vi.fn(() => Object.entries(documents).map(([ns, value]) => ({ ns, value, user: value, revision: 0 }))),
    replace: vi.fn(async (ns: string, value: unknown) => { documents[ns] = value }),
    mutate: vi.fn(async (ns: string, ops: readonly any[]) => {
      for (const op of ops) {
        let node = documents[ns]
        for (const key of op.path.slice(0, -1)) node = node[key] ??= {}
        if (op.op === 'set') node[op.path.at(-1)] = op.value
        else delete node[op.path.at(-1)]
      }
    }),
  }
  const llm = {
    listProviders: vi.fn(() => Object.keys(documents['llm-pi-ai'].providers).map(id => ({ id, name: id }))),
    listModels: vi.fn(async () => []),
    listConfigurableProviders: vi.fn(() => Object.keys(documents['llm-pi-ai'].providers).map(provider => ({
      provider, displayName: provider, settingsNs: 'llm-pi-ai', settingsPath: ['providers', provider], declared: true,
    }))),
    prepareCall: vi.fn(async (config: any): Promise<any> => ({ config, inputModalities: ['text', 'image'],
      async *stream() { yield { type: 'text-delta', index: 0, text: documents['llm-pi-ai'].providers[config.provider]?.baseURL ?? config.provider } },
    })),
  }
  const base = imageReaderSettingsStore({ settings } as never)
  const stagedReference = 'DSH_HARNESS_COMFYUI_IMAGE_READER_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as ImageReaderCredentialRef
  const values = new Map([[reference, 'original-key']])
  const credentials = {
    createRef: vi.fn(() => stagedReference),
    describe: vi.fn(async (ref: ImageReaderCredentialRef) => ({ configured: values.has(ref), writable: true })),
    resolve: vi.fn(),
    set: vi.fn(async (ref: ImageReaderCredentialRef, value: string) => { values.set(ref, value) }),
    unset: vi.fn(async (ref: ImageReaderCredentialRef) => { values.delete(ref) }),
  }
  const native = new ImageReaderNativeSettings({ settings, llm, credentials } as never, base)
  const service = new ImageReaderConfigurationService(llm as never, native, credentials)
  const diagnostics: ImageReaderDiagnostic[] = []
  const reader = new ImageReaderService({
    onDiagnostic: (record: ImageReaderDiagnostic) => diagnostics.push(record),
    scope: { get: () => base.get(), prepare: (signal?: AbortSignal) => native.prepare(signal) },
    llm,
    attachments: { imageLimits: { maxImageBytes: 1024 }, saveImage: async () => ({ attachmentId: 'test-image' }) },
    prepareInput: async () => ({ data: new Uint8Array([1]), mediaType: 'image/png', name: 'image.png' }),
  } as never)
  return { service, native, reader, diagnostics, documents, settings, llm, credentials, profile, values, stagedReference }
}

describe('image reader native Provider settings', () => {
  it.each(['undeclared', 'unconfigured'] as const)('retains the original configuration when native authentication is %s', async state => {
    const { reader, documents, settings, values } = fixture()
    if (state === 'undeclared') {
      documents[IMAGE_READER_PROFILE_ENTRY_ID].credentialRefs = {}
      documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles[0].hasApiKey = false
    }
    else values.delete(reference)
    const original = structuredClone(documents)
    await expect(reader.inspect('/image.png')).rejects.toMatchObject({
      code: state === 'undeclared' ? 'IMAGE_READER_NATIVE_CREDENTIAL_REQUIRED' : 'IMAGE_READER_CREDENTIAL_REFERENCE_MISSING',
    })
    expect(documents).toEqual(original)
    expect(settings.mutate).not.toHaveBeenCalled()
    expect(settings.replace).not.toHaveBeenCalled()
  })

  it('preserves models added while credential readiness is being queried', async () => {
    const { native, reader, documents, credentials } = fixture()
    await reader.inspect('/image.png')
    const route = documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles[0].provider
    const concurrentModel = { id: 'concurrent-model', input: ['text'], compat: { supportsStore: false } }
    const current = native.get()
    credentials.describe.mockImplementationOnce(async () => {
      documents['llm-pi-ai'].providers[route].models.push(concurrentModel)
      return { configured: true, writable: true }
    })
    await native.replace({ ...current, configuration: { ...current.configuration,
      profiles: current.configuration.profiles.map(profile => ({ ...profile, defaultPrompt: 'Changed prompt' })) } })
    expect(documents['llm-pi-ai'].providers[route].models).toContainEqual(concurrentModel)
  })

  it('allocates a different route when another writer occupies the candidate during credential discovery', async () => {
    const { native, documents, credentials } = fixture()
    const occupiedRoute = 'harness-comfyui-image-reader-custom.1'
    const occupied = { api: 'openai-completions', baseURL: 'https://another.example/v1', models: [{ id: 'another-model' }] }
    const current = native.get()
    credentials.describe.mockImplementationOnce(async () => {
      documents['llm-pi-ai'].providers[occupiedRoute] = structuredClone(occupied)
      return { configured: true, writable: true }
    })
    await native.replace({ ...current, configuration: { ...current.configuration,
      profiles: current.configuration.profiles.map(profile => ({ ...profile, defaultPrompt: 'Changed prompt' })) } })
    expect(documents['llm-pi-ai'].providers[occupiedRoute]).toEqual(occupied)
    expect(documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles[0].provider).not.toBe(occupiedRoute)
  })

  it('retains the original configuration when credential discovery fails', async () => {
    const { reader, documents, settings, credentials } = fixture()
    const original = structuredClone(documents)
    credentials.describe.mockRejectedValueOnce(new Error('credential service unavailable'))
    await expect(reader.inspect('/image.png')).rejects.toMatchObject({ code: 'IMAGE_READER_CREDENTIAL_PROVIDER_READ_FAILED' })
    expect(documents).toEqual(original)
    expect(settings.mutate).not.toHaveBeenCalled()
  })

  it.each(['base-only', 'user'] as const)('restores the actual edited Provider fields after failed preflight from a %s configuration', async layer => {
    const { service, reader, documents, settings, llm, profile, values, stagedReference } = fixture()
    await reader.inspect('/image.png')
    const route = documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles[0].provider
    const originalProvider = structuredClone(documents['llm-pi-ai'].providers[route])
    const inherited = layer === 'base-only' ? structuredClone(documents['llm-pi-ai']) : { providers: {} }
    let user = layer === 'base-only' ? {} : structuredClone(documents['llm-pi-ai'])
    const describe = settings.describe.getMockImplementation()!
    settings.describe.mockImplementation(() => describe().map(descriptor => descriptor.ns === 'llm-pi-ai'
      ? { ...descriptor, base: inherited, user } : descriptor))
    const mutate = settings.mutate.getMockImplementation()!
    settings.mutate.mockImplementation(async (ns, ops) => {
      await mutate(ns, ops.map(op => {
        const inheritedValue = op.path.reduce((node: any, key: string) => node?.[key], inherited)
        return op.op === 'unset' && inheritedValue !== undefined ? { ...op, op: 'set', value: inheritedValue } : op
      }))
      if (ns === 'llm-pi-ai') user = JSON.stringify(documents[ns]) === JSON.stringify(inherited) ? {} : structuredClone(documents[ns])
    })
    llm.prepareCall.mockRejectedValueOnce(new Error('model not ready'))
    await expect(service.saveProfile({ operation: 'update', activateProfileId: 'custom',
      profile: { ...profile, endpoint: 'http://127.0.0.1:8004/v1/chat/completions' },
      credential: { action: 'replace', apiKey: 'staged-key' } }, new AbortController().signal)).rejects.toMatchObject({ code: 'IMAGE_READER_MODEL_UNAVAILABLE' })
    expect(documents['llm-pi-ai'].providers[route]).toEqual(originalProvider)
    expect(user).toEqual(layer === 'base-only' ? {} : { providers: { [route]: originalProvider } })
    expect(values.get(reference)).toBe('original-key')
    expect(values.has(stagedReference)).toBe(false)
    await expect(reader.inspect('/image.png')).resolves.toMatchObject({ observation: originalProvider.baseURL })
  })

  it('retains a newly created Provider changed by another writer and reports that cleanup needs inspection', async () => {
    const { service, reader, documents, llm, profile, values, stagedReference } = fixture()
    await reader.inspect('/image.png')
    const original = structuredClone(documents[IMAGE_READER_PROFILE_ENTRY_ID])
    llm.prepareCall.mockImplementationOnce(async config => {
      documents['llm-pi-ai'].providers[config.provider].headers = { 'X-Concurrent': 'retained' }
      throw new Error('model not ready')
    })
    await expect(service.saveProfile({ operation: 'create', activateProfileId: 'second',
      profile: { ...profile, id: 'second' }, credential: { action: 'replace', apiKey: 'staged-key' } },
    new AbortController().signal)).rejects.toMatchObject({
      code: 'IMAGE_READER_SETTINGS_SAVE_FAILED', message: expect.stringContaining('could not be restored'),
    })
    expect(documents[IMAGE_READER_PROFILE_ENTRY_ID]).toEqual(original)
    expect(documents['llm-pi-ai'].providers['harness-comfyui-image-reader-second.1']).toMatchObject({
      apiKeyEnv: stagedReference, headers: { 'X-Concurrent': 'retained' },
    })
    expect(values.get(stagedReference)).toBe('staged-key')
  })

  it('preserves the same endpoint committed by another writer when this save loses its Settings revision', async () => {
    const { service, reader, documents, settings, profile } = fixture()
    await reader.inspect('/image.png')
    const route = documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles[0].provider
    const originalSettings = structuredClone(documents[IMAGE_READER_PROFILE_ENTRY_ID])
    settings.mutate.mockClear()
    settings.mutate.mockImplementationOnce(async () => {
      documents['llm-pi-ai'].providers[route].baseURL = 'http://127.0.0.1:8004/v1'
      throw new SettingsConflictError('llm-pi-ai' as SettingsNamespace, 0, 1)
    })
    await expect(service.saveProfile({ operation: 'update', activateProfileId: 'custom',
      profile: { ...profile, name: 'Pending name', endpoint: 'http://127.0.0.1:8004/v1/chat/completions' },
      credential: { action: 'keep' },
    }, new AbortController().signal)).rejects.toMatchObject({ code: 'IMAGE_READER_CREDENTIAL_COMMIT_STATUS_UNKNOWN' })
    expect(documents['llm-pi-ai'].providers[route].baseURL).toBe('http://127.0.0.1:8004/v1')
    expect(documents[IMAGE_READER_PROFILE_ENTRY_ID]).toEqual(originalSettings)
    expect(settings.mutate).toHaveBeenCalledTimes(1)
  })

  it('restores edited Provider fields when native Settings rejects after applying its path operations', async () => {
    const { service, reader, documents, settings, profile, values, stagedReference } = fixture()
    await reader.inspect('/image.png')
    const original = structuredClone(documents['llm-pi-ai'])
    const mutate = settings.mutate.getMockImplementation()!
    settings.mutate.mockImplementationOnce(async (ns, ops) => {
      await mutate(ns, ops)
      throw new Error('Native Settings rejected after persistence')
    })
    await expect(service.saveProfile({ operation: 'update', activateProfileId: 'custom',
      profile: { ...profile, endpoint: 'http://127.0.0.1:8004/v1/chat/completions' },
      credential: { action: 'replace', apiKey: 'staged-key' } }, new AbortController().signal)).rejects.toMatchObject({ code: 'IMAGE_READER_SETTINGS_SAVE_FAILED' })
    expect(documents['llm-pi-ai']).toEqual(original)
    expect(values.get(reference)).toBe('original-key')
    expect(values.has(stagedReference)).toBe(false)
    await expect(reader.inspect('/image.png')).resolves.toMatchObject({ observation: 'http://127.0.0.1:8003/v1' })
  })

  it('retains native settings and both credentials when rollback loses its Settings revision', async () => {
    const { service, reader, documents, settings, llm, profile, values, stagedReference } = fixture()
    await reader.inspect('/image.png')
    const route = documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles[0].provider
    const mutate = settings.mutate.getMockImplementation()!
    settings.mutate.mockImplementationOnce(mutate).mockImplementationOnce(async () => {
      documents['llm-pi-ai'].providers[route].headers = { 'X-Concurrent': 'retained' }
      throw new Error('SETTINGS_CONFLICT')
    })
    llm.prepareCall.mockRejectedValueOnce(new Error('model not ready'))
    await expect(service.saveProfile({ operation: 'update', activateProfileId: 'custom',
      profile: { ...profile, name: 'Pending profile name', endpoint: 'http://127.0.0.1:8004/v1/chat/completions' },
      credential: { action: 'replace', apiKey: 'staged-key' } }, new AbortController().signal)).rejects.toMatchObject({
        code: 'IMAGE_READER_CREDENTIAL_COMMIT_STATUS_UNKNOWN',
        cause: expect.objectContaining({ code: 'IMAGE_READER_SETTINGS_SAVE_FAILED' }),
      })
    expect(documents['llm-pi-ai'].providers[route]).toMatchObject({
      baseURL: 'http://127.0.0.1:8004/v1', apiKeyEnv: stagedReference, headers: { 'X-Concurrent': 'retained' },
    })
    expect(values.get(reference)).toBe('original-key')
    expect(values.get(stagedReference)).toBe('staged-key')
  })

  it.each(['write-completion', 'preflight'] as const)('preserves a concurrent endpoint edit at %s while restoring the credential field written by a failed save', async timing => {
    const { service, reader, documents, settings, llm, profile, values, stagedReference } = fixture()
    await reader.inspect('/image.png')
    const route = documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles[0].provider
    const concurrentEdit = () => {
      documents['llm-pi-ai'].providers[route].baseURL = 'https://concurrent.example/v1'
      documents['llm-pi-ai'].providers[route].headers = { 'X-Other-Writer': 'retained' }
    }
    if (timing === 'write-completion') {
      const mutate = settings.mutate.getMockImplementation()!
      settings.mutate.mockImplementationOnce(async (ns, ops) => { await mutate(ns, ops); concurrentEdit() })
    }
    llm.prepareCall.mockImplementationOnce(async () => {
      if (timing === 'preflight') concurrentEdit()
      throw new Error('model not ready')
    })
    await expect(service.saveProfile({ operation: 'update', activateProfileId: 'custom',
      profile: { ...profile, endpoint: 'http://127.0.0.1:8004/v1/chat/completions' },
      credential: { action: 'replace', apiKey: 'staged-key' } }, new AbortController().signal)).rejects.toMatchObject({ code: 'IMAGE_READER_CREDENTIAL_COMMIT_STATUS_UNKNOWN' })
    expect(documents['llm-pi-ai'].providers[route]).toMatchObject({
      baseURL: 'https://concurrent.example/v1', apiKeyEnv: reference, headers: { 'X-Other-Writer': 'retained' },
    })
    expect(values.get(reference)).toBe('original-key')
    expect(values.get(stagedReference)).toBe('staged-key')
    await expect(reader.inspect('/image.png')).resolves.toMatchObject({ observation: 'https://concurrent.example/v1' })
  })

  it('maps first-use native model preparation errors to the image business error through the CLI endpoint', async () => {
    const { reader, llm, diagnostics } = fixture()
    llm.prepareCall.mockRejectedValueOnce(new Error('model not ready'))
    const server = await startCliServer(() => createCliHandler({
      capabilities: { authorize: () => ({ sessionId: 'session-1', turn: 1, callId: 'call-1', cwd: '/workspace' }) },
      runtime: {}, imageReader: reader, workspaceRegistry: {},
    } as never))
    try {
      const response = await fetch(`${server.origin}${CLI_ROUTE_PATH}`, { method: 'POST', headers: { Authorization: 'Bearer test-capability', 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'image.inspect', file_path: '/image.png' }) })
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ ok: false, error: { code: 'IMAGE_READER_MODEL_UNAVAILABLE' } })
      expect(diagnostics.map(record => record.stage)).toEqual(['preparing', 'failed'])
    } finally { await server.close() }
  })

  it('preserves caller cancellation during first-use native model preparation and records the cancelled diagnostic', async () => {
    const { reader, llm, diagnostics } = fixture()
    const controller = new AbortController()
    const reason = new DOMException('Caller cancelled preparation', 'AbortError')
    llm.prepareCall.mockImplementationOnce(async () => { controller.abort(reason); throw new Error('model not ready') })
    await expect(reader.inspect('/image.png', { signal: controller.signal })).rejects.toBe(reason)
    expect(diagnostics.map(record => record.stage)).toEqual(['preparing', 'cancelled'])
  })

  it('keeps a profile borrowing another image Provider as runtime and gives its custom connection an independent owner', async () => {
    const { service, reader, documents, profile, stagedReference } = fixture()
    await reader.inspect('/image.png')
    const routeA = documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles[0].provider
    documents['llm-pi-ai'].providers[routeA].displayName = 'Renamed by the native Provider editor'
    const providerA = structuredClone(documents['llm-pi-ai'].providers[routeA])
    const borrowed = { ...createImageReaderProfile('borrower'), connectionType: 'runtime' as const, provider: routeA, model: profile.model }
    await service.saveProfile({ operation: 'create', activateProfileId: 'borrower', profile: borrowed }, new AbortController().signal)
    expect((await service.configuration()).profiles).toEqual([
      expect.objectContaining({ id: profile.id, connectionType: 'openai-compatible', hasApiKey: true }),
      expect.objectContaining({ id: 'borrower', connectionType: 'runtime', provider: routeA, hasApiKey: false }),
    ])
    await service.saveProfile({ operation: 'update', activateProfileId: 'borrower', profile: { ...borrowed, defaultPrompt: 'Borrowed model prompt' } }, new AbortController().signal)
    await expect(reader.inspect('/image.png')).resolves.toMatchObject({ provider: routeA, observation: 'http://127.0.0.1:8003/v1' })
    await expect(service.saveProfile({ operation: 'update', activateProfileId: 'borrower', profile: {
      ...profile, id: 'borrower', endpoint: 'https://borrower.example/v1/chat/completions',
    }, credential: { action: 'clear' } }, new AbortController().signal)).rejects.toMatchObject({ code: 'IMAGE_READER_NATIVE_CREDENTIAL_REQUIRED' })
    expect(documents['llm-pi-ai'].providers[routeA]).toEqual(providerA)
    await service.saveProfile({ operation: 'update', activateProfileId: 'borrower', profile: {
      ...profile, id: 'borrower', endpoint: 'https://borrower.example/v1/chat/completions',
    }, credential: { action: 'replace', apiKey: 'borrower-key' } }, new AbortController().signal)
    const routeB = documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles.find((candidate: any) => candidate.id === 'borrower').provider
    expect(routeB).not.toBe(routeA)
    expect(documents['llm-pi-ai'].providers[routeB].apiKeyEnv).toBe(stagedReference)
    expect(documents['llm-pi-ai'].providers[routeA]).toEqual(providerA)
    await expect(reader.inspect('/image.png')).resolves.toMatchObject({ provider: routeB, observation: 'https://borrower.example/v1' })
    await service.activateProfile({ profileId: profile.id }, new AbortController().signal)
    await expect(reader.inspect('/image.png')).resolves.toMatchObject({ provider: routeA, observation: 'http://127.0.0.1:8003/v1' })
  })

  it('reports an unsupported edited endpoint at the public save boundary and retains the original profile', async () => {
    const { service, documents, profile } = fixture()
    const original = structuredClone(documents[IMAGE_READER_PROFILE_ENTRY_ID])
    await expect(service.saveProfile({ operation: 'update', activateProfileId: profile.id,
      profile: { ...profile, endpoint: 'https://vision.example/custom-completions' }, credential: { action: 'keep' },
    }, new AbortController().signal)).rejects.toMatchObject({ code: 'IMAGE_READER_ENDPOINT_NATIVE_MAPPING_UNSUPPORTED' })
    expect(documents[IMAGE_READER_PROFILE_ENTRY_ID]).toEqual(original)
  })

  it.each([
    'http://127.0.0.1:8003/v1/chat/completions?api-version=test',
    'http://127.0.0.1:8003/custom-completions',
  ])('shows an unsupported historical endpoint, reads the healthy profile, and permits correction: %s', async endpoint => {
    const { service, reader, documents, profile } = fixture()
    const broken = { ...profile, id: 'broken', name: 'Historical endpoint', endpoint, hasApiKey: false }
    documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles.push(broken)
    expect((await service.configuration()).profiles.find(candidate => candidate.id === 'broken')?.endpoint).toBe(endpoint)
    await expect(reader.inspect('/image.png')).resolves.toMatchObject({ observation: 'http://127.0.0.1:8003/v1' })
    expect(documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles.find((candidate: any) => candidate.id === 'broken').endpoint).toBe(endpoint)
    await service.activateProfile({ profileId: 'broken' }, new AbortController().signal)
    await service.saveProfile({ operation: 'update', activateProfileId: 'broken',
      profile: { ...broken, endpoint: 'https://repaired.example/v1/chat/completions' }, credential: { action: 'replace', apiKey: 'repaired-key' },
    }, new AbortController().signal)
    await expect(reader.inspect('/image.png')).resolves.toMatchObject({ observation: 'https://repaired.example/v1' })
    expect((await service.configuration()).profiles.find(candidate => candidate.id === 'broken')?.endpoint).toBe('https://repaired.example/v1/chat/completions')
  })

  it('can activate and edit a healthy system profile and delete an unsupported historical profile', async () => {
    const { service, reader, documents, profile, settings, values } = fixture()
    documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles[0].endpoint = 'https://historical.example/custom-completions'
    const healthy = { ...createImageReaderProfile('healthy'), connectionType: 'runtime' as const, provider: 'system-vision', model: 'healthy-model' }
    documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles.push(healthy)
    expect((await service.configuration()).profiles[0]?.endpoint).toBe('https://historical.example/custom-completions')
    await service.activateProfile({ profileId: 'healthy' }, new AbortController().signal)
    await service.saveProfile({ operation: 'update', activateProfileId: 'healthy', profile: { ...healthy, defaultPrompt: 'Healthy prompt' } }, new AbortController().signal)
    await expect(reader.inspect('/image.png')).resolves.toMatchObject({ provider: 'system-vision', observation: 'system-vision' })
    expect(values.get(reference)).toBe('original-key')
    await service.deleteProfile({ profileId: profile.id }, new AbortController().signal)
    expect((await service.configuration()).profiles.map(candidate => candidate.id)).toEqual(['healthy'])
    expect(settings.mutate).not.toHaveBeenCalled()
  })

  it('reserves distinct native routes for overlapping profile IDs and reads each configured endpoint', async () => {
    const { native, reader, service, documents, profile, values, stagedReference } = fixture()
    const occupied = { api: 'openai-completions', baseURL: 'https://occupied.example/v1', models: [{ id: 'other', input: ['text'] }] }
    documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1'] = occupied
    documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles.push({ ...profile, id: 'custom-2', name: 'Second vision' })
    documents[IMAGE_READER_PROFILE_ENTRY_ID].credentialRefs['custom-2'] = stagedReference
    values.set(stagedReference, 'second-key')
    const current = native.get()
    await native.replace({ ...current, configuration: { ...current.configuration, profiles: current.configuration.profiles.map(candidate => ({
      ...candidate, endpoint: candidate.id === 'custom' ? 'https://first.example/v1/chat/completions' : 'https://second.example/v1/chat/completions',
    })) } })
    await expect(reader.inspect('/image.png')).resolves.toMatchObject({ observation: 'https://first.example/v1' })
    await service.activateProfile({ profileId: 'custom-2' }, new AbortController().signal)
    await expect(reader.inspect('/image.png')).resolves.toMatchObject({ observation: 'https://second.example/v1' })
    const routes = documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles.map((candidate: any) => candidate.provider)
    expect(new Set(routes).size).toBe(2)
    expect(documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1']).toEqual(occupied)
  })

  it('preserves the residual native route and allocates a free owned route when rollback cannot remove an uncommitted migration', async () => {
    const { service, reader, documents, settings, llm } = fixture()
    const original = structuredClone(documents[IMAGE_READER_PROFILE_ENTRY_ID])
    const mutate = settings.mutate.getMockImplementation()!
    settings.mutate.mockImplementationOnce(mutate).mockRejectedValueOnce(new Error('rollback unavailable'))
    llm.prepareCall.mockRejectedValueOnce(new Error('model not ready'))
    await expect(reader.inspect('/image.png')).rejects.toMatchObject({ code: 'IMAGE_READER_SETTINGS_SAVE_FAILED' })
    expect(documents[IMAGE_READER_PROFILE_ENTRY_ID]).toEqual(original)
    expect(Object.keys(documents['llm-pi-ai'].providers)).toEqual(['harness-comfyui-image-reader-custom.1'])
    await reader.inspect('/image.png')
    await expect(service.configuration()).resolves.toMatchObject(original.configuration)
    expect(Object.keys(documents['llm-pi-ai'].providers)).toEqual(['harness-comfyui-image-reader-custom.1', 'harness-comfyui-image-reader-custom.2'])
  })

  it('retains both possible credentials when the image Settings commit cannot be observed', async () => {
    const { service, reader, documents, settings, profile, values, stagedReference } = fixture()
    await reader.inspect('/image.png')
    const describe = settings.describe.getMockImplementation()!
    settings.replace.mockImplementationOnce(async () => {
      settings.describe.mockImplementation(() => { throw new Error('observer unavailable') })
      throw new Error('commit status unknown')
    })
    await expect(service.saveProfile({ operation: 'update', activateProfileId: 'custom',
      profile: { ...profile, name: 'Unknown vision' }, credential: { action: 'replace', apiKey: 'possible-key' },
    }, new AbortController().signal)).rejects.toMatchObject({ code: 'IMAGE_READER_CREDENTIAL_COMMIT_STATUS_UNKNOWN' })
    expect(values.get(reference)).toBe('original-key')
    expect(values.get(stagedReference)).toBe('possible-key')
    expect(documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1'].apiKeyEnv).toBe(stagedReference)
    settings.describe.mockImplementation(describe)
  })

  it('retains the original configuration and credential when cancellation interrupts native preparation', async () => {
    const { native, documents, llm, credentials } = fixture()
    const original = structuredClone(documents[IMAGE_READER_PROFILE_ENTRY_ID])
    const controller = new AbortController()
    llm.prepareCall.mockImplementationOnce(async config => { controller.abort(); return { config, inputModalities: ['text', 'image'] } })
    await expect(native.prepare(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(documents[IMAGE_READER_PROFILE_ENTRY_ID]).toEqual(original)
    expect(documents['llm-pi-ai'].providers).toEqual({})
    expect(credentials.unset).not.toHaveBeenCalled()
  })

  it('removes an uncommitted custom Provider and its staged key so creating the same profile can be retried', async () => {
    const { service, reader, documents, settings, profile, values, stagedReference } = fixture()
    await reader.inspect('/image.png')
    settings.replace.mockRejectedValueOnce(new Error('precommit create failure'))
    const request = { operation: 'create' as const, activateProfileId: 'second', profile: { ...profile, id: 'second' },
      credential: { action: 'replace' as const, apiKey: 'second-secret' } }
    await expect(service.saveProfile(request, new AbortController().signal)).rejects.toThrow()
    expect(documents['llm-pi-ai'].providers['harness-comfyui-image-reader-second.1']).toBeUndefined()
    expect(values.has(stagedReference)).toBe(false)
    await expect(service.saveProfile(request, new AbortController().signal)).resolves.toMatchObject({ configuration: { activeProfileId: 'second' } })
    expect(Object.keys(documents['llm-pi-ai'].providers)).toEqual(['harness-comfyui-image-reader-custom.1', 'harness-comfyui-image-reader-second.1'])
  })

  it('keeps a borrowed native credential after the image configuration replaces its API Key', async () => {
    const { service, reader, documents, values, profile, credentials, stagedReference } = fixture()
    await reader.inspect('/image.png')
    const borrowed = 'NATIVE_SHARED_VISION_KEY' as ImageReaderCredentialRef
    values.set(borrowed, 'borrowed-secret')
    documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1'].apiKeyEnv = borrowed
    await service.saveProfile({ operation: 'update', activateProfileId: 'custom', profile,
      credential: { action: 'replace', apiKey: 'replacement-secret' },
    }, new AbortController().signal)
    expect(documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1'].apiKeyEnv).toBe(stagedReference)
    expect(values.get(borrowed)).toBe('borrowed-secret')
    expect(credentials.unset).not.toHaveBeenCalledWith(borrowed)
  })

  it('retains a committed native credential replacement when Settings rejects after persisting the image profile', async () => {
    const { service, reader, documents, settings, profile, values, stagedReference } = fixture()
    await reader.inspect('/image.png')
    settings.replace.mockImplementationOnce(async (ns, section) => { documents[ns] = section; throw new Error('postcommit failure') })
    await expect(service.saveProfile({ operation: 'update', activateProfileId: 'custom',
      profile: { ...profile, name: 'Committed vision' }, credential: { action: 'replace', apiKey: 'replacement-secret' },
    }, new AbortController().signal)).rejects.toMatchObject({ code: 'IMAGE_READER_CREDENTIAL_COMMITTED_WRITE_REJECTED' })
    expect(documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1'].apiKeyEnv).toBe(stagedReference)
    expect(values.get(stagedReference)).toBe('replacement-secret')
    expect((await service.configuration()).profiles[0]?.name).toBe('Committed vision')
  })

  it('restores the original native credential and clears a staged key after the image profile write fails', async () => {
    const { service, reader, documents, settings, profile, values, stagedReference } = fixture()
    await reader.inspect('/image.png')
    settings.replace.mockRejectedValueOnce(new Error('precommit failure'))
    await expect(service.saveProfile({ operation: 'update', activateProfileId: 'custom',
      profile: { ...profile, name: 'Uncommitted vision' }, credential: { action: 'replace', apiKey: 'staged-secret' },
    }, new AbortController().signal)).rejects.toMatchObject({ code: 'IMAGE_READER_SETTINGS_SAVE_FAILED' })
    expect(documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1'].apiKeyEnv).toBe(reference)
    expect(values.get(reference)).toBe('original-key')
    expect(values.has(stagedReference)).toBe(false)
  })

  it('reflects a native Provider credential edit and preserves the borrowed credential when the image profile is saved or deleted', async () => {
    const { service, reader, documents, credentials, values, profile } = fixture()
    await reader.inspect('/image.png')
    const borrowed = 'NATIVE_SHARED_VISION_KEY' as ImageReaderCredentialRef
    values.set(borrowed, 'borrowed-secret')
    documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1'].apiKeyEnv = borrowed
    expect((await service.configuration()).profiles[0]?.hasApiKey).toBe(true)
    await service.saveProfile({ operation: 'update', activateProfileId: 'custom',
      profile: { ...profile, defaultPrompt: 'Prompt with native credential' }, credential: { action: 'keep' },
    }, new AbortController().signal)
    await service.saveProfile({ operation: 'create', activateProfileId: 'system', profile: {
      ...createImageReaderProfile('system'), connectionType: 'runtime', provider: 'system', model: 'system-vision',
    } }, new AbortController().signal)
    await service.deleteProfile({ profileId: 'custom' }, new AbortController().signal)
    expect(documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1'].apiKeyEnv).toBe(borrowed)
    expect(values.get(borrowed)).toBe('borrowed-secret')
    expect(credentials.unset).not.toHaveBeenCalledWith(borrowed)
  })

  it('preserves native model compatibility and additional models while editing the image prompt', async () => {
    const { service, reader, documents, profile } = fixture()
    await reader.inspect('/image.png')
    const provider = documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1']
    provider.models[0].compat = { supportsDeveloperRole: false }
    provider.models.push({ id: 'additional-model', input: ['text'] })
    provider.headers = { 'X-Service': 'vision' }
    await service.saveProfile({ operation: 'update', activateProfileId: 'custom',
      profile: { ...profile, defaultPrompt: 'Edited prompt' }, credential: { action: 'keep' },
    }, new AbortController().signal)
    expect(documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1']).toMatchObject({
      models: [{ id: 'vision-model', input: ['text', 'image'], compat: { supportsDeveloperRole: false } }, { id: 'additional-model', input: ['text'] }],
      headers: { 'X-Service': 'vision' },
    })
  })

  it('saves a second custom model and API Key in native settings while preserving both profile prompts and the active selection', async () => {
    const { service, reader, documents, profile, credentials, stagedReference } = fixture()
    await service.saveProfile({ operation: 'create', activateProfileId: 'second', profile: {
      ...profile, id: 'second', name: 'Second vision', model: 'second-vision',
      endpoint: 'https://vision.example/proxy/v1/chat/completions', defaultPrompt: 'Second prompt', temperature: 0.8, maxTokens: 8192,
    }, credential: { action: 'replace', apiKey: 'second-private-key' } }, new AbortController().signal)
    await reader.inspect('/image.png')
    const configuration = await service.configuration()
    expect(configuration.activeProfileId).toBe('second')
    expect(configuration.profiles.map(candidate => [candidate.id, candidate.defaultPrompt])).toEqual([
      ['custom', 'User observation prompt'], ['second', 'Second prompt'],
    ])
    expect(documents['llm-pi-ai'].providers['harness-comfyui-image-reader-second.1']).toMatchObject({
      baseURL: 'https://vision.example/proxy/v1', apiKeyEnv: stagedReference, models: [{ id: 'second-vision', input: ['text', 'image'] }],
    })
    expect(credentials.set).toHaveBeenCalledWith(stagedReference, 'second-private-key')
    expect(JSON.stringify(documents)).not.toContain('second-private-key')
  })

  it('preserves an occupied native route and stores the selected suffix for subsequent edits', async () => {
    const { service, reader, documents, profile } = fixture()
    const occupied = { api: 'openai-completions', baseURL: 'https://other.example/v1', models: [{ id: 'other', input: ['text'] }] }
    documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1'] = occupied
    await reader.inspect('/image.png')
    expect(documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1']).toEqual(occupied)
    expect(documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles[0].provider).toBe('harness-comfyui-image-reader-custom.2')
    await service.saveProfile({ operation: 'update', activateProfileId: 'custom', profile: { ...profile, maxTokens: 6000 },
      credential: { action: 'keep' } }, new AbortController().signal)
    expect(Object.keys(documents['llm-pi-ai'].providers)).toEqual(['harness-comfyui-image-reader-custom.1', 'harness-comfyui-image-reader-custom.2'])
  })

  it('restores the native endpoint when an edited image profile fails before its Settings commit', async () => {
    const { service, reader, documents, settings, profile, credentials } = fixture()
    await reader.inspect('/image.png')
    const original = structuredClone(documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1'])
    settings.replace.mockRejectedValueOnce(new Error('image settings write failed'))
    await expect(service.saveProfile({ operation: 'update', activateProfileId: 'custom',
      profile: { ...profile, name: 'Edited vision', endpoint: 'http://127.0.0.1:8004/v1/chat/completions' }, credential: { action: 'keep' },
    }, new AbortController().signal)).rejects.toThrow()
    expect(documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1']).toEqual(original)
    expect(credentials.unset).not.toHaveBeenCalled()
  })

  it('retains the original configuration and credential when native model preparation fails, then retries the same route', async () => {
    const { service, reader, documents, llm, credentials } = fixture()
    const original = structuredClone(documents[IMAGE_READER_PROFILE_ENTRY_ID])
    llm.prepareCall.mockRejectedValueOnce(new Error('model not ready'))
    await expect(reader.inspect('/image.png')).rejects.toMatchObject({ code: 'IMAGE_READER_MODEL_UNAVAILABLE', cause: new Error('model not ready') })
    expect(documents[IMAGE_READER_PROFILE_ENTRY_ID]).toEqual(original)
    expect(credentials.unset).not.toHaveBeenCalled()
    await reader.inspect('/image.png')
    await expect(service.configuration()).resolves.toMatchObject(original.configuration)
    expect(Object.keys(documents['llm-pi-ai'].providers)).toEqual(['harness-comfyui-image-reader-custom.1'])
  })

  it.each([
    'http://127.0.0.1:8003/v1/chat/completions?api-version=test',
    'http://127.0.0.1:8003/v1/chat/completions#fragment',
    'http://127.0.0.1:8003/custom-completions',
    'http://127.0.0.1:8003/v1/chat/completions?',
    'http://127.0.0.1:8003/v1/chat/completions#',
    'http://127.0.0.1:8003/v1//chat/completions',
  ])('retains an unsupported complete endpoint for correction: %s', async endpoint => {
    const { service, reader, documents, settings } = fixture()
    documents[IMAGE_READER_PROFILE_ENTRY_ID].configuration.profiles[0].endpoint = endpoint
    const original = structuredClone(documents[IMAGE_READER_PROFILE_ENTRY_ID])
    await expect(reader.inspect('/image.png')).rejects.toThrow('/chat/completions')
    expect(documents[IMAGE_READER_PROFILE_ENTRY_ID]).toEqual(original)
    expect(settings.mutate).not.toHaveBeenCalled()
  })

  it('keeps a transferred credential when its image profile switches to a system model', async () => {
    const { service, reader, credentials, documents } = fixture()
    await reader.inspect('/image.png')
    credentials.describe.mockResolvedValue({ configured: true, writable: false })
    await service.saveProfile({ operation: 'update', activateProfileId: 'custom', profile: {
      ...createImageReaderProfile('custom', 'System vision'), connectionType: 'runtime', provider: 'system', model: 'system-vision',
    } }, new AbortController().signal)
    expect(documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1'].apiKeyEnv).toBe(reference)
    expect(credentials.unset).not.toHaveBeenCalled()
  })

  it('moves endpoint and credential ownership to the native Provider while retaining the settings view', async () => {
    const { service, reader, documents, profile, settings, credentials } = fixture()
    await reader.inspect('/image.png')
    const configuration = await service.configuration()
    expect(configuration).toEqual({ activeProfileId: 'custom', profiles: [profile] })
    expect(documents['llm-pi-ai'].providers['harness-comfyui-image-reader-custom.1']).toMatchObject({
      api: 'openai-completions', baseURL: 'http://127.0.0.1:8003/v1', apiKeyEnv: reference,
      models: [{ id: 'vision-model', input: ['text', 'image'] }],
    })
    expect(documents[IMAGE_READER_PROFILE_ENTRY_ID]).toEqual({
      configuration: { activeProfileId: 'custom', profiles: [{
        id: 'custom', name: 'My vision', provider: 'harness-comfyui-image-reader-custom.1', model: 'vision-model',
        defaultPrompt: 'User observation prompt', temperature: 0.6, maxTokens: 4096,
      }] }, credentialRefs: {},
    })
    expect(credentials.resolve).not.toHaveBeenCalled()
    expect(credentials.unset).not.toHaveBeenCalled()
    const writes = settings.mutate.mock.calls.length
    await reader.inspect('/image.png')
    expect(settings.mutate).toHaveBeenCalledTimes(writes)
  })
})
