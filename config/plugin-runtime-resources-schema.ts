import Schema from '@deepseek-ai/schemastery'

const nonEmptyString = Schema.string().pattern(/\S+/u).required()
const runtimeArtifactKey = Schema.union([
  Schema.const('frontendCompilerWorker'),
  Schema.const('managedCli'),
]).required()

const runtimeArtifactSchema = Schema.object({
  label: nonEmptyString,
  artifactKey: runtimeArtifactKey,
})

const requiredFilePath = Schema.string().pattern(/\S+/u).required()

export const PluginRuntimeResourcesSchema = Schema.object({
  schemaVersion: Schema.const(1).required(),
  runtimeArtifacts: Schema.object({
    frontendCompilerWorker: runtimeArtifactSchema.required(),
    managedCli: runtimeArtifactSchema.required(),
  }).required(),
  requiredFiles: Schema.array(requiredFilePath).min(1).required(),
  failureDetailsTemplate: nonEmptyString,
})

export interface PluginRuntimeResourcesConfiguration {
  readonly schemaVersion: 1
  readonly runtimeArtifacts: {
    readonly frontendCompilerWorker: { readonly label: string; readonly artifactKey: 'frontendCompilerWorker' }
    readonly managedCli: { readonly label: string; readonly artifactKey: 'managedCli' }
  }
  readonly requiredFiles: readonly string[]
  readonly failureDetailsTemplate: string
}

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  const record = value as Record<string, unknown>
  const allowed = new Set(keys)
  const missing = keys.filter(key => !Object.hasOwn(record, key))
  const unexpected = Object.keys(record).filter(key => !allowed.has(key))
  if (missing.length > 0 || unexpected.length > 0) {
    throw new TypeError(`${label} must contain exactly ${keys.join(', ')}${
      missing.length > 0 ? `; missing ${missing.join(', ')}` : ''
    }${unexpected.length > 0 ? `; unexpected ${unexpected.join(', ')}` : ''}`)
  }
  return record
}

function validateRelativePath(value: string, label: string): void {
  if (value.startsWith('/') || /^[A-Za-z]:/u.test(value) || value.includes('\\') || value.includes('\0')) {
    throw new TypeError(`${label} must be a relative POSIX path: ${value}`)
  }
  const segments = value.split('/')
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new TypeError(`${label} must not contain empty or traversing path segments: ${value}`)
  }
}

export function parsePluginRuntimeResources(value: unknown): PluginRuntimeResourcesConfiguration {
  try {
    const root = exactRecord(value, [
      'schemaVersion', 'runtimeArtifacts', 'requiredFiles', 'failureDetailsTemplate',
    ], 'Plugin runtime resources config')
    const runtimeArtifacts = exactRecord(root.runtimeArtifacts, ['frontendCompilerWorker', 'managedCli'],
      'Plugin runtime resources config.runtimeArtifacts')
    const frontendCompilerWorker = exactRecord(runtimeArtifacts.frontendCompilerWorker, ['label', 'artifactKey'],
      'Plugin runtime resources config.runtimeArtifacts.frontendCompilerWorker')
    const managedCli = exactRecord(runtimeArtifacts.managedCli, ['label', 'artifactKey'],
      'Plugin runtime resources config.runtimeArtifacts.managedCli')
    const parsed = Schema.resolve({
      ...root,
      runtimeArtifacts: { frontendCompilerWorker, managedCli },
    }, PluginRuntimeResourcesSchema, {}, true)[0] as PluginRuntimeResourcesConfiguration

    const seenRequiredFiles = new Set<string>()
    for (const [index, path] of parsed.requiredFiles.entries()) {
      validateRelativePath(path, `Plugin runtime resources config.requiredFiles[${index}]`)
      if (!path.startsWith('agent-presets/')
        && !/^\.agents\/skills\/[^/]+\/(?:SKILL\.md|references\/.+|scripts\/.+)$/u.test(path)) {
        throw new TypeError(`Plugin runtime required file must be inside agent-presets/ or a Skill runtime directory: ${path}`)
      }
      if (seenRequiredFiles.has(path)) {
        throw new TypeError(`Plugin runtime required file paths must be distinct: ${path}`)
      }
      seenRequiredFiles.add(path)
    }
    if (parsed.runtimeArtifacts.frontendCompilerWorker.artifactKey !== 'frontendCompilerWorker'
      || parsed.runtimeArtifacts.managedCli.artifactKey !== 'managedCli') {
      throw new TypeError('Plugin runtime artifact references must match their resource keys.')
    }
    const placeholders = [...parsed.failureDetailsTemplate.matchAll(/\{[^{}]+\}/gu)].map(match => match[0])
    if (placeholders.length !== 1 || placeholders[0] !== '{resources}') {
      throw new TypeError('Plugin runtime failure detail template must contain exactly one {resources} placeholder.')
    }
    return parsed
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new TypeError(`Plugin runtime resources config validation failed: ${message}`)
  }
}
