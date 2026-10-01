import runtimeArtifacts from './runtime-artifacts.json' with { type: 'json' }

const forbiddenPathSegments = new Set([
  '.git',
  'node_modules',
  'tests',
  'coverage',
  'desktop-baseline.json',
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function collectArtifactOutputPaths(value, paths = []) {
  if (Array.isArray(value)) {
    for (const child of value) collectArtifactOutputPaths(child, paths)
    return paths
  }
  if (!isRecord(value)) return paths
  if (typeof value.outputEntryRelativePath === 'string') {
    paths.push(value.outputEntryRelativePath)
    return paths
  }
  for (const child of Object.values(value)) collectArtifactOutputPaths(child, paths)
  return paths
}

const buildArtifactRoots = [...new Set(collectArtifactOutputPaths(runtimeArtifacts)
  .map(path => path.split('/').slice(0, 2).join('/')))]

function isBuildArtifactPath(value) {
  return buildArtifactRoots.some(root => value === root || value.startsWith(`${root}/`))
}

export function validatePluginPackagePath(value, label = 'package path') {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty relative path`)
  }
  if (value.startsWith('/') || /^[A-Za-z]:/u.test(value) || value.includes('\\') || value.includes('\0')) {
    throw new TypeError(`${label} must use a repository-relative POSIX path: ${value}`)
  }
  const segments = value.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new TypeError(`${label} must not contain empty or traversing segments: ${value}`)
  }
  if (segments.some(segment => forbiddenPathSegments.has(segment))) {
    throw new TypeError(`${label} contains a forbidden path segment: ${value}`)
  }
  if (segments.some(segment => /^desktop-/u.test(segment)
    || /^web-(?:development|production)/u.test(segment)
    || /^\.env(?:\.|$)/u.test(segment)
    || /(?:secret|credential|private)/iu.test(segment))) {
    throw new TypeError(`${label} must not include host-local configuration or private data: ${value}`)
  }
  const allowedPath = value === 'cordis.patch.yml'
    || value.startsWith('config/')
    || value === 'agent-presets'
    || value.startsWith('agent-presets/')
    || value === '.agents/skills'
    || value.startsWith('.agents/skills/')
    || value.startsWith('scripts/source-client/')
    || ['scripts/cli/help.mjs', 'scripts/cli/help-schema.mjs'].includes(value)
    || value === 'src/config/schema.ts'
    || value.startsWith('src/config/data/')
    || isBuildArtifactPath(value)
  if (!allowedPath) {
    throw new TypeError(`${label} is outside the plugin resource roots: ${value}`)
  }
  return value
}

export const PluginPackageConfigSchema = Object.freeze({
  type: 'object',
  required: Object.freeze(['schemaVersion', 'packageName', 'files', 'artifacts']),
  additionalProperties: false,
  properties: Object.freeze({
    schemaVersion: Object.freeze({ const: 1 }),
    packageName: Object.freeze({ type: 'string', minLength: 1 }),
    files: Object.freeze({ type: 'array', uniqueItems: true, items: Object.freeze({ type: 'string' }) }),
    artifacts: Object.freeze({ type: 'array', uniqueItems: true, items: Object.freeze({ type: 'string' }) }),
  }),
})

export function parsePluginPackageConfig(value) {
  if (!isRecord(value)) throw new TypeError('Plugin package config must be an object')
  const allowed = new Set(PluginPackageConfigSchema.required)
  for (const property of Object.keys(value)) {
    if (!allowed.has(property)) throw new TypeError(`Plugin package config has unknown property ${property}`)
  }
  if (value.schemaVersion !== 1) throw new TypeError('Plugin package config schemaVersion must be 1')
  if (typeof value.packageName !== 'string' || value.packageName.length === 0) {
    throw new TypeError('Plugin package config packageName must be a non-empty string')
  }
  for (const field of ['files', 'artifacts']) {
    const paths = value[field]
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new TypeError(`Plugin package config ${field} must be a non-empty array`)
    }
    const seen = new Set()
    for (const item of paths) {
      validatePluginPackagePath(item, `Plugin package config ${field} item`)
      if (seen.has(item)) throw new TypeError(`Plugin package config ${field} contains duplicate path ${item}`)
      seen.add(item)
    }
  }
  for (const artifact of value.artifacts) {
    if (!isBuildArtifactPath(artifact)) {
      throw new TypeError(`Plugin package artifacts must name build outputs: ${artifact}`)
    }
  }
  if (value.files.some(isBuildArtifactPath)) {
    throw new TypeError('Plugin package config must list build artifacts separately from source resources')
  }
  return value
}
