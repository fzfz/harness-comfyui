import { readFileSync } from 'node:fs'

const EXACT_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u

function decodeYamlScalar(value, label) {
  const scalar = value.trim()
  if (scalar === 'true') return true
  if (scalar === 'false') return false
  if (scalar.startsWith("'") && scalar.endsWith("'")) return scalar.slice(1, -1).replaceAll("''", "'")
  if (scalar.startsWith('"') && scalar.endsWith('"')) {
    try {
      return JSON.parse(scalar)
    } catch (error) {
      throw new Error(`${label} contains malformed quoted value: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (scalar.length === 0) throw new Error(`${label} must have a scalar value`)
  return scalar
}

function decodeYamlKey(value, label) {
  const key = value.trim()
  if (key.startsWith("'") && key.endsWith("'")) return key.slice(1, -1).replaceAll("''", "'")
  if (key.startsWith('"') && key.endsWith('"')) return decodeYamlScalar(key, label)
  if (key.length === 0 || key.includes(':')) throw new Error(`${label} contains an invalid map key`)
  return key
}

function readMapSection(text, sectionName, label) {
  let active = false
  let found = false
  const values = {}
  for (const [lineNumber, sourceLine] of text.split(/\r?\n/u).entries()) {
    const line = sourceLine.trimEnd()
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue
    const topLevel = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*$/u)
    if (topLevel !== null) {
      active = topLevel[1] === sectionName
      found ||= active
      continue
    }
    if (!active) continue
    if (!line.startsWith('  ') || line.startsWith('    ')) {
      throw new Error(`${label} ${sectionName} has malformed entry on line ${lineNumber + 1}`)
    }
    const entry = line.match(/^ {2}([^:]+):\s*(.+)$/u)
    if (entry === null) throw new Error(`${label} ${sectionName} has malformed entry on line ${lineNumber + 1}`)
    const key = decodeYamlKey(entry[1], `${label} ${sectionName}`)
    if (Object.hasOwn(values, key)) throw new Error(`${label} ${sectionName} contains duplicate key ${key}`)
    values[key] = decodeYamlScalar(entry[2], `${label} ${sectionName}.${key}`)
  }
  if (!found) throw new Error(`${label} is missing ${sectionName}`)
  if (Object.keys(values).length === 0) throw new Error(`${label}.${sectionName} must not be empty`)
  return Object.freeze(Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right))))
}

function readTopLevelBoolean(text, fieldName, label) {
  const pattern = new RegExp(`^${fieldName}:\\s*(\\S+)\\s*$`, 'u')
  let value
  for (const [lineNumber, sourceLine] of text.split(/\r?\n/u).entries()) {
    const match = sourceLine.trimEnd().match(pattern)
    if (match === null) continue
    if (value !== undefined) throw new Error(`${label} contains duplicate ${fieldName} on line ${lineNumber + 1}`)
    value = decodeYamlScalar(match[1], `${label}.${fieldName}`)
  }
  if (value === undefined) throw new Error(`${label} is missing ${fieldName}`)
  if (value !== true) throw new Error(`${label}.${fieldName} must be true`)
  return true
}

export function parseRuntimeWorkspacePolicy(text, label = 'deployment/runtime/pnpm-workspace.yaml') {
  return Object.freeze({
    strictDepBuilds: readTopLevelBoolean(text, 'strictDepBuilds', label),
    allowBuilds: readMapSection(text, 'allowBuilds', label),
    overrides: readMapSection(text, 'overrides', label),
  })
}

const runtimeWorkspaceUrl = new URL('../../deployment/runtime/pnpm-workspace.yaml', import.meta.url)
const RUNTIME_WORKSPACE_POLICY = parseRuntimeWorkspacePolicy(
  readFileSync(runtimeWorkspaceUrl, 'utf8'),
  runtimeWorkspaceUrl.pathname,
)

export const RUNTIME_DEPENDENCY_POLICY = Object.freeze({
  packages: Object.freeze([
    '@deepseek-ai/dsh',
    '@deepseek-ai/dsh-base',
    '@deepseek-ai/dsh-web-app',
  ]),
  install: Object.freeze({
    strictDepBuilds: RUNTIME_WORKSPACE_POLICY.strictDepBuilds,
    strictPeerDependencies: true,
  }),
  workspace: RUNTIME_WORKSPACE_POLICY,
})

export function readPnpmPackageManagerVersion(manifest, label = 'package.json') {
  const packageManager = manifest?.packageManager
  if (typeof packageManager !== 'string' || packageManager.length === 0) {
    throw new Error(`${label}.packageManager must be pnpm@<exact-version>`)
  }
  const match = /^pnpm@(.+)$/u.exec(packageManager)
  if (match === null || !EXACT_VERSION_PATTERN.test(match[1])) {
    throw new Error(`${label}.packageManager must be pnpm@<exact-version>`)
  }
  return match[1]
}

export function runtimeInstallNpmrc() {
  const { strictDepBuilds, strictPeerDependencies } = RUNTIME_DEPENDENCY_POLICY.install
  return `strict-dep-builds=${String(strictDepBuilds)}\nstrict-peer-dependencies=${String(strictPeerDependencies)}\n`
}

export function runtimeInstallEnvironment(environment) {
  const { strictDepBuilds, strictPeerDependencies } = RUNTIME_DEPENDENCY_POLICY.install
  const sanitized = { ...environment }
  for (const key of [
    'NPM_CONFIG_STRICT_DEP_BUILDS',
    'npm_config_strict_dep_builds',
    'NPM_CONFIG_STRICT_PEER_DEPENDENCIES',
    'npm_config_strict_peer_dependencies',
  ]) delete sanitized[key]
  return {
    ...sanitized,
    NPM_CONFIG_STRICT_DEP_BUILDS: String(strictDepBuilds),
    NPM_CONFIG_STRICT_PEER_DEPENDENCIES: String(strictPeerDependencies),
  }
}
