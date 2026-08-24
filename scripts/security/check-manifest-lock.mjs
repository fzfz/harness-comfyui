import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const dependencySecurityPolicyFile = 'config/dependency-security-policy.json'
const exactVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u

function parseArguments(argv) {
  if (argv.length === 0) return repositoryRoot
  if (argv.length !== 2 || argv[0] !== '--root' || argv[1].length === 0) {
    throw new Error('usage: check-manifest-lock [--root <repository>]')
  }
  return resolve(argv[1])
}

function readJson(path, name) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`cannot read ${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sortedRecord(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
}

export function readDependencySecurityPolicy(root = repositoryRoot) {
  const policy = readJson(resolve(root, dependencySecurityPolicyFile), dependencySecurityPolicyFile)
  if (!isRecord(policy)) throw new Error(`${dependencySecurityPolicyFile} must be an object`)
  const keys = Object.keys(policy).sort()
  if (JSON.stringify(keys) !== JSON.stringify(['allowBuilds', 'overrides', 'strictDepBuilds'])) {
    throw new Error(`${dependencySecurityPolicyFile} must contain exactly strictDepBuilds, allowBuilds, and overrides`)
  }
  if (policy.strictDepBuilds !== true) throw new Error(`${dependencySecurityPolicyFile}.strictDepBuilds must be true`)
  if (!isRecord(policy.allowBuilds) || Object.keys(policy.allowBuilds).length === 0) {
    throw new Error(`${dependencySecurityPolicyFile}.allowBuilds must be a non-empty object`)
  }
  for (const [identity, decision] of Object.entries(policy.allowBuilds)) {
    const separator = identity.lastIndexOf('@')
    if (separator <= 0 || !exactVersion.test(identity.slice(separator + 1)) || decision !== true) {
      throw new Error(`${dependencySecurityPolicyFile}.allowBuilds.${identity} must be an exact package identity with value true`)
    }
  }
  if (!isRecord(policy.overrides) || Object.keys(policy.overrides).length === 0) {
    throw new Error(`${dependencySecurityPolicyFile}.overrides must be a non-empty object`)
  }
  for (const [selector, version] of Object.entries(policy.overrides)) {
    if (selector.length === 0 || typeof version !== 'string' || !exactVersion.test(version)) {
      throw new Error(`${dependencySecurityPolicyFile}.overrides.${selector} must resolve to an exact version`)
    }
  }
  return {
    strictDepBuilds: true,
    allowBuilds: sortedRecord(policy.allowBuilds),
    overrides: sortedRecord(policy.overrides),
  }
}

function yamlScalar(value) {
  if (typeof value === 'boolean') return String(value)
  return `'${value.replaceAll("'", "''")}'`
}

export function renderWorkspacePolicy(policy) {
  const section = (name, values) => [
    `${name}:`,
    ...Object.entries(values).map(([key, value]) => `  ${yamlScalar(key)}: ${yamlScalar(value)}`),
  ].join('\n')
  return [
    'packages:',
    '  - .',
    '',
    'verifyDepsBeforeRun: false',
    '',
    `strictDepBuilds: ${String(policy.strictDepBuilds)}`,
    '',
    section('allowBuilds', policy.allowBuilds),
    '',
    section('overrides', policy.overrides),
    '',
  ].join('\n')
}

function validateManifestVersions(manifest) {
  if (typeof manifest.packageManager !== 'string' || !/^pnpm@(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(manifest.packageManager)) {
    throw new Error('package.json.packageManager must use an exact pnpm version')
  }
  const observed = new Map()
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const dependencies = manifest[field]
    if (!isRecord(dependencies)) throw new Error(`package.json.${field} must be an object`)
    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof version !== 'string' || !exactVersion.test(version)) {
        throw new Error(`package.json.${field}.${name} must use an exact version`)
      }
      const previous = observed.get(name)
      if (previous !== undefined && previous !== version) {
        throw new Error(`package.json dependency ${name} has conflicting versions`)
      }
      observed.set(name, version)
    }
  }
}

function validateNpmrc(root) {
  const text = readFileSync(resolve(root, '.npmrc'), 'utf8')
  if (!/^strict-dep-builds=true$/mu.test(text)) throw new Error('.npmrc must set strict-dep-builds=true')
}

export function validateDependencyPolicy(root = repositoryRoot) {
  const resolvedRoot = resolve(root)
  const manifest = readJson(resolve(resolvedRoot, 'package.json'), 'package.json')
  if (!isRecord(manifest)) throw new Error('package.json must be an object')
  validateManifestVersions(manifest)
  validateNpmrc(resolvedRoot)
  const policy = readDependencySecurityPolicy(resolvedRoot)
  const workspacePath = resolve(resolvedRoot, 'pnpm-workspace.yaml')
  if (readFileSync(workspacePath, 'utf8') !== renderWorkspacePolicy(policy)) {
    throw new Error(`pnpm-workspace.yaml must be the exact projection of ${dependencySecurityPolicyFile}`)
  }
  return { manifest, policy }
}

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function checkManifestLock(root = repositoryRoot) {
  const resolvedRoot = resolve(root)
  const policy = validateDependencyPolicy(resolvedRoot)
  const lockfilePath = resolve(resolvedRoot, 'pnpm-lock.yaml')
  const before = digest(lockfilePath)
  const command = process.env.PNPM_BIN ?? (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  const result = spawnSync(command, [
    'install', '--lockfile-only', '--ignore-scripts', '--frozen-lockfile', '--offline', '--reporter=append-only',
  ], {
    cwd: resolvedRoot,
    env: { ...process.env, CI: 'true' },
    encoding: 'utf8',
    shell: false,
  })
  if (result.error !== undefined) throw new Error(`cannot execute pnpm: ${String(result.error)}`)
  if (result.status !== 0) {
    throw new Error(`package.json and pnpm-lock.yaml differ (pnpm status ${String(result.status)})\n${String(result.stdout ?? '')}${String(result.stderr ?? '')}`)
  }
  if (before !== digest(lockfilePath)) throw new Error('frozen lockfile check changed pnpm-lock.yaml')
  return { ...policy, lockfilePath }
}

export function main(argv = process.argv.slice(2)) {
  const root = parseArguments(argv)
  checkManifestLock(root)
  process.stdout.write(`package.json, pnpm-lock.yaml, and pnpm-workspace.yaml are consistent: ${root}\n`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main()
  } catch (error) {
    process.stderr.write(`check:manifest-lock: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
