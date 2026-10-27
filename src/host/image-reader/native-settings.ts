import { isDeepStrictEqual } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type { PreparedLlmCall } from '@deepseek-ai/dsh-llm'
import { SettingsConflictError, type SettingsPathOp } from '@deepseek-ai/dsh-settings'
import runtime from '../../../config/image-reader-runtime.json' with { type: 'json' }
import { IMAGE_READER_PROFILE_ENTRY_ID, decodeStoredImageReaderConfiguration, type ImageReaderProfile, type ImageReaderSettingsSection } from '../../image-reader/settings.ts'
import { credentialRef, isCredentialRefName } from '@deepseek-ai/dsh-credentials'
import type { ImageReaderCredentialRef } from '../../image-reader/credential-schema.ts'
import type { ImageReaderSettingsStore } from './settings-registration.ts'
import { ImageReaderError, isAbortError } from './errors.ts'

type Provider = Record<string, unknown>

interface ProviderWrite {
  ns: string
  path: readonly string[]
  previous: Provider | undefined
  user: Provider | undefined
  fields: Array<{ key: string; written: unknown; layer: 'user' | 'value' }>
  written: Provider
}

function record(value: unknown): Provider | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Provider : undefined
}

function member(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((node, key) => record(node)?.[key], value)
}

function ownedRouteStem(profileId: string): string {
  return `${runtime.providerRoutePrefix}${profileId}${runtime.providerRouteSeparator}`
}

function ownsRoute(profileId: string, route: string): boolean {
  const stem = ownedRouteStem(profileId)
  return route.startsWith(stem) && /^[1-9][0-9]*$/u.test(route.slice(stem.length))
}

function baseURL(endpoint: string): string {
  let url: URL
  try { url = new URL(endpoint) } catch (cause) {
    throw new ImageReaderError('IMAGE_READER_ENDPOINT_NATIVE_MAPPING_UNSUPPORTED',
      'The endpoint must be a complete HTTP or HTTPS URL ending in /chat/completions.', { cause })
  }
  const prefix = url.pathname.slice(0, -'/chat/completions'.length)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || endpoint.includes('?') || endpoint.includes('#') || !url.pathname.endsWith('/chat/completions')
    || prefix.endsWith('/')) {
    throw new ImageReaderError('IMAGE_READER_ENDPOINT_NATIVE_MAPPING_UNSUPPORTED',
      'Use an endpoint shaped as https://host/chat/completions or https://host/prefix/chat/completions. The native Provider mapping does not support query parameters, fragments, URL credentials or repeated slashes before chat/completions.')
  }
  url.pathname = prefix
  return url.toString().replace(/\/$/, '')
}

function endpoint(provider: Provider): string {
  if (typeof provider.baseURL !== 'string') throw new TypeError('The native image Provider has no baseURL.')
  const url = new URL(provider.baseURL)
  if (url.search || url.hash) throw new TypeError('The native image Provider baseURL contains query parameters or fragments.')
  url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`
  return url.toString()
}

export class ImageReaderNativeSettings implements ImageReaderSettingsStore {
  constructor(
    private readonly ctx: Pick<Context, 'settings' | 'llm' | 'credentials'>,
    readonly runtime: ImageReaderSettingsStore,
  ) {}

  private directory() { return this.ctx.llm.listConfigurableProviders() }

  private provider(route: string, layer: 'value' | 'user' = 'value'): Provider | undefined {
    const entry = this.directory().find(candidate => candidate.provider === route)
    if (entry === undefined) return undefined
    const descriptor = this.ctx.settings.describe().find(candidate => candidate.ns === entry.settingsNs)
    return record(member(descriptor?.[layer], entry.settingsPath))
  }

  credentialIsReferenced(reference: ImageReaderCredentialRef): boolean {
    return this.directory().some(entry => this.provider(entry.provider)?.apiKeyEnv === reference)
  }

  private project(section: ImageReaderSettingsSection): ImageReaderSettingsSection {
    const credentialRefs: Record<string, ImageReaderCredentialRef> = { ...section.credentialRefs }
    const profiles = section.configuration.profiles.map(profile => {
      if (!ownsRoute(profile.id, profile.provider)) return profile
      const provider = this.provider(profile.provider)
      if (provider === undefined || provider.api !== 'openai-completions') return profile
      const reference = provider.apiKeyEnv
      if (typeof reference === 'string' && isCredentialRefName(reference)) credentialRefs[profile.id] = credentialRef(reference)
      return Object.freeze({ ...profile, connectionType: 'openai-compatible' as const, provider: '',
        endpoint: endpoint(provider), hasApiKey: credentialRefs[profile.id] !== undefined })
    })
    return Object.freeze({ configuration: Object.freeze({ ...section.configuration, profiles: Object.freeze(profiles) }),
      credentialRefs: Object.freeze(credentialRefs) })
  }

  get(): ImageReaderSettingsSection { return this.project(this.runtime.get()) }

  readPersistedUserOverride(): ReturnType<ImageReaderSettingsStore['readPersistedUserOverride']> {
    const observed = this.runtime.readPersistedUserOverride()
    if (observed.kind === 'unreadable' || observed.value === undefined) return observed
    const value = record(observed.value)
    const configuration = decodeStoredImageReaderConfiguration(value?.configuration)
    if (configuration === undefined) return observed
    try {
      return { kind: 'readable', value: this.project({ configuration,
        credentialRefs: (record(value?.credentialRefs) ?? {}) as Record<string, ImageReaderCredentialRef> }) }
    } catch { return { kind: 'unreadable' } }
  }

  async prepare(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    const section = this.runtime.get()
    const profile = section.configuration.profiles.find(candidate => candidate.id === section.configuration.activeProfileId)
    if (profile?.connectionType === 'openai-compatible') {
      await this.persist(section, signal, new Set([profile.id]))
    }
  }

  private selectRoute(profile: ImageReaderProfile, reserved: ReadonlySet<string>): string {
    const persisted = this.runtime.get().configuration.profiles.find(candidate => candidate.id === profile.id)
    if (persisted !== undefined && ownsRoute(profile.id, persisted.provider) && !reserved.has(persisted.provider)) return persisted.provider
    const stem = ownedRouteStem(profile.id)
    const occupied = new Set([...this.directory().map(entry => entry.provider), ...this.ctx.llm.listProviders().map(entry => entry.id)])
    for (let index = 1; ; index++) {
      const route = `${stem}${index}`
      if (!reserved.has(route) && !occupied.has(route)) return route
    }
  }

  private async saveProvider(route: string, value: Provider, writes: ProviderWrite[], signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    const entry = this.directory().find(candidate => candidate.provider === route)
    const ns = entry?.settingsNs ?? runtime.providerSettingsNamespace
    const path = entry?.settingsPath ?? ['providers', route]
    const descriptor = this.ctx.settings.describe().find(candidate => candidate.ns === ns)
    if (descriptor === undefined) throw new ImageReaderError('IMAGE_READER_SETTINGS_SAVE_FAILED',
      `The native Provider settings "${ns}" are unavailable. Enable the llm-pi-ai plugin and retry.`)
    const previous = record(member(descriptor.value, path))
    const changes: SettingsPathOp[] = []
    for (const [key, field] of Object.entries(value)) {
      if (isDeepStrictEqual(previous?.[key], field)) continue
      changes.push({ op: 'set', path: [...path, key], value: field })
    }
    if (value.apiKeyEnv === undefined && previous?.apiKeyEnv !== undefined) changes.push({ op: 'unset', path: [...path, 'apiKeyEnv'] })
    if (changes.length > 0) {
      const write: ProviderWrite = {
        ns, path, previous: previous === undefined ? undefined : structuredClone(previous),
        user: structuredClone(record(member(descriptor.user, path))),
        fields: changes.map(change => ({ key: change.path.at(-1)!, layer: change.op === 'set' ? 'user' : 'value',
          written: structuredClone(change.op === 'set' ? change.value : member(descriptor.base, change.path)) })),
        written: structuredClone(value),
      }
      try {
        await this.ctx.settings.mutate(ns, previous === undefined ? [{ op: 'set', path, value }] : changes, descriptor.revision)
      } catch (cause) {
        if (!(cause instanceof SettingsConflictError)) writes.push(write)
        throw cause
      }
      writes.push(write)
    }
    signal?.throwIfAborted()
  }

  async replace(section: ImageReaderSettingsSection, expectedRevision?: number, signal?: AbortSignal): Promise<void> {
    return this.persist(section, signal, undefined, expectedRevision)
  }

  private async persist(section: ImageReaderSettingsSection, signal?: AbortSignal, migrateProfileIds?: ReadonlySet<string>, expectedRevision?: number): Promise<void> {
    signal?.throwIfAborted()
    const revision = expectedRevision ?? this.ctx.settings.describe().find(descriptor => descriptor.ns === IMAGE_READER_PROFILE_ENTRY_ID)?.revision
    const original = this.runtime.get()
    const originalView = this.project(original)
    const reserved = new Set<string>()
    const candidates = section.configuration.profiles.map(profile => {
      const previous = original.configuration.profiles.find(candidate => candidate.id === profile.id)
      const previousView = originalView.configuration.profiles.find(candidate => candidate.id === profile.id)
      const migrate = migrateProfileIds?.has(profile.id) ?? (!isDeepStrictEqual(profile, previousView)
        || section.credentialRefs[profile.id] !== originalView.credentialRefs[profile.id])
      if (!migrate) return { profile: previous ?? profile }
      if (profile.connectionType === 'runtime') return { profile }
      const reference = section.credentialRefs[profile.id]
      const value: Provider = { api: 'openai-completions', baseURL: baseURL(profile.endpoint),
        displayName: `ComfyUI 图片读取 · ${profile.id}`, models: [{ id: profile.model, input: ['text', 'image'] }],
        ...(reference === undefined ? {} : { apiKeyEnv: reference }) }
      return { profile, value }
    })
    const writes: ProviderWrite[] = []
    const profiles: ImageReaderProfile[] = []
    const credentialRefs: Record<string, ImageReaderCredentialRef> = {}
    let target: ImageReaderSettingsSection | undefined
    try {
      for (const candidate of candidates) {
        const { profile } = candidate
        if (candidate.value === undefined) {
          profiles.push(profile)
          const reference = section.credentialRefs[profile.id]
          if (profile.connectionType === 'openai-compatible' && reference !== undefined) credentialRefs[profile.id] = reference
          continue
        }
        const reference = section.credentialRefs[profile.id]
        if (reference === undefined) throw new ImageReaderError('IMAGE_READER_NATIVE_CREDENTIAL_REQUIRED',
          'The native custom Provider requires an API Key. Save the service API Key in image reader settings and retry.')
        let configured: boolean
        try {
          configured = (await this.ctx.credentials.describe(reference)).configured
        } catch (cause) {
          throw new ImageReaderError('IMAGE_READER_CREDENTIAL_PROVIDER_READ_FAILED', 'The official credential service could not inspect the image reader credential.', { cause })
        }
        if (!configured) throw new ImageReaderError('IMAGE_READER_CREDENTIAL_REFERENCE_MISSING',
          'The image reader credential is not configured. Save the service API Key in image reader settings and retry.')
        const route = this.selectRoute(profile, reserved)
        reserved.add(route)
        const saved = this.provider(route)
        if (Array.isArray(saved?.models)) {
          const models = saved.models.map(model => record(model)?.id === profile.model
            ? { ...record(model), id: profile.model, input: ['text', 'image'] }
            : model)
          if (!models.some(model => record(model)?.id === profile.model)) models.push({ id: profile.model, input: ['text', 'image'] })
          candidate.value.models = models
        }
        await this.saveProvider(route, candidate.value, writes, signal)
        let prepared: PreparedLlmCall
        try {
          prepared = await this.ctx.llm.prepareCall({ provider: route, model: profile.model,
            temperature: profile.temperature, maxTokens: profile.maxTokens }, signal)
        } catch (cause) {
          if (isAbortError(cause, signal)) {
            throw signal?.reason instanceof Error ? signal.reason
              : cause instanceof DOMException ? cause : new DOMException('Image inspection was cancelled.', 'AbortError')
          }
          throw new ImageReaderError('IMAGE_READER_MODEL_UNAVAILABLE', 'The configured visual model is unavailable.', { cause })
        }
        if (prepared.inputModalities?.includes('image') !== true) throw new ImageReaderError('IMAGE_READER_MODEL_IMAGE_UNSUPPORTED',
          'The configured native Provider model does not declare image input capability.')
        profiles.push(Object.freeze({ ...profile, connectionType: 'runtime', provider: route, endpoint: '', hasApiKey: false }))
      }
      signal?.throwIfAborted()
      target = { configuration: { ...section.configuration, profiles }, credentialRefs }
      await this.runtime.replace(target, revision, signal)
    } catch (cause) {
      let restorePrevious = target === undefined
      if (target !== undefined) {
        try {
          const observed = this.runtime.get()
          restorePrevious = !isDeepStrictEqual(observed, target) && isDeepStrictEqual(observed, original)
        } catch {}
      }
      if (restorePrevious) {
        for (const write of writes.reverse()) {
          try {
            const descriptor = this.ctx.settings.describe().find(candidate => candidate.ns === write.ns)
            if (descriptor === undefined) throw new Error(`Native Provider settings "${write.ns}" are unavailable during restoration.`)
            const current = record(member(descriptor.value, write.path))
            if (current === undefined) continue
            const currentUser = record(member(descriptor.user, write.path))
            if (write.previous === undefined && !isDeepStrictEqual(currentUser, write.written)) {
              throw new Error('The newly created native Provider changed before its failed save could be restored.')
            }
            const restore: SettingsPathOp[] = write.previous === undefined
              ? [{ op: 'unset', path: write.path }]
              : write.fields.filter(field => isDeepStrictEqual((field.layer === 'user' ? currentUser : current)?.[field.key], field.written)).map(({ key }) =>
                write.user !== undefined && Object.hasOwn(write.user, key)
                  ? { op: 'set', path: [...write.path, key], value: write.user[key] }
                  : { op: 'unset', path: [...write.path, key] })
            if (restore.length > 0) await this.ctx.settings.mutate(write.ns, restore, descriptor.revision)
          } catch (cleanup) {
            throw new ImageReaderError('IMAGE_READER_SETTINGS_SAVE_FAILED',
              'The image profile could not be saved and its native Provider settings could not be restored. Inspect the native Provider settings before retrying.',
              { cause: { primary: cause, cleanup } })
          }
        }
      }
      throw cause
    }
  }
}
