import Schema from '@deepseek-ai/schemastery'

const nonEmptyString = Schema.string().pattern(/\S+/u).required()
const safeRelativePath = Schema.string().pattern(/^[^/\\\0][^\\\0]*$/u).required()
const runtimeArtifactKey = Schema.union([
  Schema.const('frontendCompilerWorker'),
  Schema.const('managedCli'),
]).required()

const sourceClientSchema = Schema.object({
  label: nonEmptyString,
  relativePath: safeRelativePath,
})

const runtimeArtifactSchema = Schema.object({
  label: nonEmptyString,
  artifactKey: runtimeArtifactKey,
})

const requiredFilePath = Schema.string().pattern(/\S+/u).required()

export const PluginRuntimeResourcesSchema = Schema.object({
  schemaVersion: Schema.const(1).required(),
  sourceClients: Schema.object({
    semanticQueryClient: sourceClientSchema.required(),
    sourceReadClient: sourceClientSchema.required(),
  }).required(),
  runtimeArtifacts: Schema.object({
    frontendCompilerWorker: runtimeArtifactSchema.required(),
    managedCli: runtimeArtifactSchema.required(),
  }).required(),
  requiredFiles: Schema.array(requiredFilePath).min(1).required(),
  failureDetailsTemplate: nonEmptyString,
})

export interface PluginRuntimeResourcesConfiguration {
  readonly schemaVersion: 1
  readonly sourceClients: {
    readonly semanticQueryClient: { readonly label: string; readonly relativePath: string }
    readonly sourceReadClient: { readonly label: string; readonly relativePath: string }
  }
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
      'schemaVersion', 'sourceClients', 'runtimeArtifacts', 'requiredFiles', 'failureDetailsTemplate',
    ], 'Plugin runtime resources config')
    const sourceClients = exactRecord(root.sourceClients, ['semanticQueryClient', 'sourceReadClient'],
      'Plugin runtime resources config.sourceClients')
    const semanticQueryClient = exactRecord(sourceClients.semanticQueryClient, ['label', 'relativePath'],
      'Plugin runtime resources config.sourceClients.semanticQueryClient')
    const sourceReadClient = exactRecord(sourceClients.sourceReadClient, ['label', 'relativePath'],
      'Plugin runtime resources config.sourceClients.sourceReadClient')
    const runtimeArtifacts = exactRecord(root.runtimeArtifacts, ['frontendCompilerWorker', 'managedCli'],
      'Plugin runtime resources config.runtimeArtifacts')
    const frontendCompilerWorker = exactRecord(runtimeArtifacts.frontendCompilerWorker, ['label', 'artifactKey'],
      'Plugin runtime resources config.runtimeArtifacts.frontendCompilerWorker')
    const managedCli = exactRecord(runtimeArtifacts.managedCli, ['label', 'artifactKey'],
      'Plugin runtime resources config.runtimeArtifacts.managedCli')
    const parsed = Schema.resolve({
      ...root,
      sourceClients: { semanticQueryClient, sourceReadClient },
      runtimeArtifacts: { frontendCompilerWorker, managedCli },
    }, PluginRuntimeResourcesSchema, {}, true)[0] as PluginRuntimeResourcesConfiguration

    validateRelativePath(parsed.sourceClients.semanticQueryClient.relativePath,
      'Plugin runtime resources config.sourceClients.semanticQueryClient.relativePath')
    validateRelativePath(parsed.sourceClients.sourceReadClient.relativePath,
      'Plugin runtime resources config.sourceClients.sourceReadClient.relativePath')
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
    if (!parsed.sourceClients.semanticQueryClient.relativePath.startsWith('scripts/source-client/')) {
      throw new TypeError('Plugin runtime semantic query client must be inside scripts/source-client/.')
    }
    if (!parsed.sourceClients.sourceReadClient.relativePath.startsWith('scripts/source-client/')) {
      throw new TypeError('Plugin runtime Source reader client must be inside scripts/source-client/.')
    }
    if (parsed.sourceClients.semanticQueryClient.relativePath === parsed.sourceClients.sourceReadClient.relativePath) {
      throw new TypeError('Plugin runtime Source client paths must be distinct.')
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
