import { deepStrictEqual } from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const runtimeDirectory = 'deployment/runtime'
export const frozenRuntimeDependencies = Object.freeze([
  '@deepseek-ai/dsh',
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
])

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag !== '--root') throw new Error(`unknown argument ${flag}`)
    if (values.has(flag)) throw new Error('duplicate argument --root')
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--') || value.length === 0) {
      throw new Error('--root requires a non-empty value')
    }
    values.set(flag, value)
    index += 1
  }
  return resolve(values.get('--root') ?? repositoryRoot)
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`could not read ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

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
  const lines = text.split(/\r?\n/u)
  let active = false
  let found = false
  const values = {}
  for (const [lineNumber, sourceLine] of lines.entries()) {
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
  return Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)))
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

function readWorkspaceText(workspaceRoot) {
  const path = resolve(workspaceRoot, 'pnpm-workspace.yaml')
  try {
    return { path, text: readFileSync(path, 'utf8') }
  } catch (error) {
    throw new Error(`could not read ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function readWorkspacePolicy(_root, workspaceRoot = _root) {
  const { path, text } = readWorkspaceText(workspaceRoot)
  return {
    strictDepBuilds: readTopLevelBoolean(text, 'strictDepBuilds', path),
    allowBuilds: readMapSection(text, 'allowBuilds', path),
    overrides: readMapSection(text, 'overrides', path),
  }
}

export function readStrictDependencyBuilds(root, workspaceRoot = root) {
  const rootPath = resolve(root, '.npmrc')
  let rootContent
  try {
    rootContent = readFileSync(rootPath, 'utf8')
  } catch (error) {
    throw new Error(`could not read ${rootPath}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const parseStrictValue = (content, path) => {
    const values = new Map()
    for (const [lineNumber, sourceLine] of content.split(/\r?\n/u).entries()) {
      const line = sourceLine.trim()
      if (line.length === 0 || line.startsWith('#') || line.startsWith(';')) continue
      const separator = line.indexOf('=')
      if (separator <= 0) throw new Error(`${path} has malformed line ${lineNumber + 1}`)
      const key = line.slice(0, separator).trim()
      const value = line.slice(separator + 1).trim()
      if (values.has(key)) throw new Error(`${path} contains duplicate setting ${key}`)
      values.set(key, value)
    }
    return values.get('strict-dep-builds')
  }
  const rootValue = parseStrictValue(rootContent, rootPath)
  if (rootValue !== 'true') throw new Error(`${rootPath} must set strict-dep-builds=true`)

  const workspacePath = resolve(workspaceRoot, '.npmrc')
  if (workspaceRoot !== root && existsSync(workspacePath)) {
    const workspaceContent = readFileSync(workspacePath, 'utf8')
    const workspaceValue = parseStrictValue(workspaceContent, workspacePath)
    if (workspaceValue !== undefined && workspaceValue !== rootValue) {
      throw new Error(`${workspacePath} strict-dep-builds differs from ${rootPath}`)
    }
  }
  return rootValue === 'true'
}

function readImporter(lockText, packageName, label) {
  const lines = lockText.split(/\r?\n/u)
  const importerStart = lines.findIndex(line => line === 'importers:')
  if (importerStart < 0) throw new Error(`${label} is missing importers`)
  const importerIndex = lines.findIndex((line, index) => index > importerStart && line === '  .:')
  if (importerIndex < 0) throw new Error(`${label} is missing importers . entry`)
  const keyPattern = /^ {6}(.+):\s*$/u
  const key = lines.findIndex((line, index) => {
    if (index <= importerIndex) return false
    const match = line.match(keyPattern)
    return match !== null && decodeYamlKey(match[1], label) === packageName
  })
  if (key < 0) throw new Error(`${label} importer . is missing ${packageName}`)
  const result = {}
  for (let index = key + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim().length === 0) continue
    if (!line.startsWith('        ')) break
    const match = line.match(/^        (specifier|version):\s*(.+)$/u)
    if (match !== null) result[match[1]] = decodeYamlScalar(match[2], `${label} ${packageName}.${match[1]}`)
  }
  if (result.specifier === undefined || result.version === undefined) {
    throw new Error(`${label} importer . entry for ${packageName} is missing specifier or version`)
  }
  return result
}

function assertLockPackage(lockText, packageName, version, label) {
  const key = `'${packageName}@${version}':`
  if (!lockText.split(/\r?\n/u).some(line => line.startsWith(`  ${key}`))) {
    throw new Error(`${label} is missing package resolution ${packageName}@${version}`)
  }
}

export function assertLockfileResolves(lockPath, expectedVersions) {
  let lockText
  try {
    lockText = readFileSync(lockPath, 'utf8')
  } catch (error) {
    throw new Error(`could not read ${lockPath}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!/^lockfileVersion:\s*['"]9\.0['"]\s*$/mu.test(lockText)) {
    throw new Error(`${lockPath} must use lockfileVersion 9.0`)
  }
  const label = `lockfile ${lockPath}`
  const overrides = readMapSection(lockText, 'overrides', label)
  for (const [packageName, version] of Object.entries(expectedVersions)) {
    const importer = readImporter(lockText, packageName, label)
    if (importer.specifier !== version) throw new Error(`${label} ${packageName} specifier must be ${version}`)
    const resolvedVersion = String(importer.version).replace(/\([^)]*\)$/u, '')
    if (resolvedVersion !== version) throw new Error(`${label} ${packageName} must resolve to ${version}`)
    assertLockPackage(lockText, packageName, version, label)
  }
  return { overrides, text: lockText }
}

function readRootVersions(rootManifest, label) {
  const versions = {}
  for (const packageName of frozenRuntimeDependencies) {
    const version = rootManifest.devDependencies?.[packageName]
    if (typeof version !== 'string' || version.length === 0 || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
      throw new Error(`${label}.devDependencies.${packageName} must be an exact version`)
    }
    for (const field of ['dependencies', 'peerDependencies']) {
      const duplicate = rootManifest[field]?.[packageName]
      if (duplicate !== undefined && duplicate !== version) {
        throw new Error(`${label}.${field}.${packageName} differs from devDependencies.${packageName}`)
      }
    }
    versions[packageName] = version
  }
  return versions
}

function assertRuntimeManifest(runtimeManifest, rootVersions) {
  const dependencies = runtimeManifest.dependencies
  if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
    throw new Error('deployment/runtime/package.json.dependencies must be an object')
  }
  const actualNames = Object.keys(dependencies).sort()
  const expectedNames = [...frozenRuntimeDependencies].sort()
  if (actualNames.length !== expectedNames.length || actualNames.some((name, index) => name !== expectedNames[index])) {
    throw new Error('deployment/runtime/package.json dependencies must contain exactly the frozen runtime packages')
  }
  for (const packageName of frozenRuntimeDependencies) {
    if (dependencies[packageName] !== rootVersions[packageName]) {
      throw new Error(`deployment/runtime/package.json.dependencies.${packageName} must match root package.json.devDependencies`)
    }
  }
  if (runtimeManifest.devDependencies !== undefined || runtimeManifest.peerDependencies !== undefined) {
    throw new Error('deployment/runtime/package.json must not provide a second runtime version source')
  }
}

function workspaceRoots(root) {
  return [
    { name: 'root', path: root, lockfile: resolve(root, 'pnpm-lock.yaml') },
    { name: 'runtime', path: resolve(root, runtimeDirectory), lockfile: resolve(root, runtimeDirectory, 'pnpm-lock.yaml') },
  ]
}

function runFrozenLockfileCheck(root) {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const outputs = []
  for (const workspace of workspaceRoots(root)) {
    const before = digest(workspace.lockfile)
    const result = spawnSync(command, [
      'install',
      '--lockfile-only',
      '--ignore-scripts',
      '--frozen-lockfile',
      '--offline',
      '--reporter=append-only',
    ], {
      cwd: workspace.path,
      env: { ...process.env, CI: 'true' },
      encoding: 'utf8',
      shell: false,
    })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    if (result.error !== undefined) {
      throw new Error(`${workspace.name} manifest/lockfile check could not execute pnpm: ${String(result.error)}`)
    }
    if (result.status !== 0) {
      throw new Error(`${workspace.name} manifest/lockfile drift or invalid lockfile (pnpm status ${result.status})\n${output}`)
    }
    if (before !== digest(workspace.lockfile)) {
      throw new Error(`${workspace.name} manifest/lockfile check changed ${workspace.lockfile}`)
    }
    outputs.push(`${workspace.name}: ${output}`)
  }
  return outputs.join('')
}

export function validateDependencyClosure(root = repositoryRoot) {
  const resolvedRoot = resolve(root)
  const rootManifestPath = resolve(resolvedRoot, 'package.json')
  const runtimeManifestPath = resolve(resolvedRoot, runtimeDirectory, 'package.json')
  const rootManifest = readJson(rootManifestPath, 'package.json')
  const rootVersions = readRootVersions(rootManifest, 'package.json')
  const runtimeManifest = readJson(runtimeManifestPath, 'deployment/runtime/package.json')
  assertRuntimeManifest(runtimeManifest, rootVersions)

  const rootPolicy = readWorkspacePolicy(resolvedRoot)
  const runtimePolicy = readWorkspacePolicy(resolvedRoot, resolve(resolvedRoot, runtimeDirectory))
  try {
    if (rootPolicy.strictDepBuilds !== true || runtimePolicy.strictDepBuilds !== true) {
      throw new Error('strictDepBuilds must be true')
    }
    deepStrictEqual(runtimePolicy.strictDepBuilds, rootPolicy.strictDepBuilds)
    deepStrictEqual(runtimePolicy.allowBuilds, rootPolicy.allowBuilds)
    deepStrictEqual(runtimePolicy.overrides, rootPolicy.overrides)
  } catch {
    throw new Error('root and runtime workspace strictDepBuilds/allowBuilds/overrides must be identical and strictDepBuilds must be true')
  }
  readStrictDependencyBuilds(resolvedRoot, resolvedRoot)
  readStrictDependencyBuilds(resolvedRoot, resolve(resolvedRoot, runtimeDirectory))

  const rootLock = assertLockfileResolves(resolve(resolvedRoot, 'pnpm-lock.yaml'), rootVersions)
  const runtimeLock = assertLockfileResolves(resolve(resolvedRoot, runtimeDirectory, 'pnpm-lock.yaml'), rootVersions)
  try {
    deepStrictEqual(runtimeLock.overrides, rootPolicy.overrides)
    deepStrictEqual(rootLock.overrides, rootPolicy.overrides)
  } catch {
    throw new Error('root and runtime lockfile overrides must match the workspace override policy')
  }
  return { rootVersions, rootPolicy, runtimePolicy, rootLock, runtimeLock }
}

export function checkManifestLock(root = repositoryRoot) {
  const resolvedRoot = resolve(root)
  const closure = validateDependencyClosure(resolvedRoot)
  const output = runFrozenLockfileCheck(resolvedRoot)
  return {
    output,
    manifestPath: resolve(resolvedRoot, 'package.json'),
    lockfilePath: resolve(resolvedRoot, 'pnpm-lock.yaml'),
    runtimeManifestPath: resolve(resolvedRoot, runtimeDirectory, 'package.json'),
    runtimeLockfilePath: resolve(resolvedRoot, runtimeDirectory, 'pnpm-lock.yaml'),
    ...closure,
  }
}

export function main(argv = process.argv.slice(2)) {
  const root = parseArguments(argv)
  checkManifestLock(root)
  process.stdout.write(`manifest and lockfile are consistent across root and runtime workspaces: ${root}\n`)
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
