import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { deepStrictEqual } from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const policyFile = 'config/dependency-security-policy.json'
const expectedDecisionCount = 5

const buildDecisionFields = [
  'onlyBuiltDependencies',
  'onlyBuiltDependenciesFile',
  'neverBuiltDependencies',
  'ignoredBuiltDependencies',
]

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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readSecurityPolicy(root) {
  const policy = readJson(resolve(root, policyFile), policyFile)
  if (!isPlainObject(policy)) throw new Error(`${policyFile} must contain an object`)
  if (!isPlainObject(policy.allowBuilds)) throw new Error(`${policyFile} is missing object allowBuilds`)
  const entries = Object.entries(policy.allowBuilds)
  if (entries.length !== expectedDecisionCount) {
    throw new Error(`${policyFile} must contain exactly ${expectedDecisionCount} allowBuilds decisions`)
  }
  for (const [packageIdentity, decision] of entries) {
    const versionSeparator = packageIdentity.lastIndexOf('@')
    const packageVersion = versionSeparator > 0 ? packageIdentity.slice(versionSeparator + 1) : ''
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(packageVersion)) {
      throw new Error(`${policyFile} contains an unclassified or non-exact package identity: ${packageIdentity}`)
    }
    if (decision !== true || typeof decision !== 'boolean') {
      throw new Error(`${policyFile} allowBuilds decision for ${packageIdentity} must be boolean true`)
    }
  }
  return policy.allowBuilds
}

function readStrictDependencyBuilds(root) {
  const path = resolve(root, '.npmrc')
  let content
  try {
    content = readFileSync(path, 'utf8')
  } catch (error) {
    throw new Error(`could not read .npmrc: ${error instanceof Error ? error.message : String(error)}`)
  }
  const values = new Map()
  for (const [lineNumber, sourceLine] of content.split(/\r?\n/u).entries()) {
    const line = sourceLine.trim()
    if (line.length === 0 || line.startsWith('#') || line.startsWith(';')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) throw new Error(`malformed .npmrc line ${lineNumber + 1}`)
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (values.has(key)) throw new Error(`duplicate .npmrc setting ${key}`)
    values.set(key, value)
  }
  if (values.get('strict-dep-builds') !== 'true') {
    throw new Error('.npmrc must set strict-dep-builds=true')
  }
}

function readAllowBuildsFromPnpm(root) {
  const command = process.env.PNPM_BIN ?? (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  const result = spawnSync(command, ['config', 'get', 'allowBuilds', '--json'], {
    cwd: root,
    env: { ...process.env },
    encoding: 'utf8',
    shell: false,
  })
  if (result.error !== undefined) {
    throw new Error(`could not execute pnpm policy query: ${String(result.error)}`)
  }
  if (result.status !== 0) {
    throw new Error(`pnpm policy query exited with code ${String(result.status)}\n${String(result.stderr ?? '')}`)
  }
  const output = String(result.stdout ?? '').trim()
  if (output.length === 0) throw new Error('pnpm policy query returned missing allowBuilds JSON')
  try {
    return JSON.parse(output)
  } catch (error) {
    throw new Error(`pnpm policy query returned malformed JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function validateAllowBuilds(actual, expected) {
  if (!isPlainObject(actual)) {
    throw new Error('pnpm policy query returned a non-object allowBuilds decision')
  }
  const actualKeys = Object.keys(actual).sort()
  const expectedKeys = Object.keys(expected).sort()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error(`pnpm allowBuilds projection differs from ${policyFile}; received ${actualKeys.join(', ')}`)
  }
  for (const [packageIdentity, decision] of Object.entries(actual)) {
    if (typeof decision !== 'boolean') {
      throw new Error(`allowBuilds decision for ${packageIdentity} must be boolean; placeholders are not classified decisions`)
    }
    if (decision !== true || expected[packageIdentity] !== true) {
      throw new Error(`allowBuilds decision for ${packageIdentity} must be true for the exact reviewed version`)
    }
  }
  try {
    deepStrictEqual(actual, expected)
  } catch {
    throw new Error('allowBuilds differs from the exact reviewed version decisions')
  }
  return actual
}

function rejectManifestBuildDecisions(root) {
  const manifest = readJson(resolve(root, 'package.json'), 'package.json')
  const pnpm = manifest?.pnpm
  if (pnpm === null || typeof pnpm !== 'object' || Array.isArray(pnpm)) {
    if (pnpm !== undefined) throw new Error('package.json pnpm policy must be an object')
    return
  }
  const unexpected = buildDecisionFields.filter(field => Object.hasOwn(pnpm, field))
  if (unexpected.length > 0) {
    throw new Error(`package.json contains unclassified build decisions: ${unexpected.join(', ')}`)
  }
}

export function checkBuildScripts(root = repositoryRoot) {
  readStrictDependencyBuilds(root)
  rejectManifestBuildDecisions(root)
  const expected = readSecurityPolicy(root)
  const allowBuilds = validateAllowBuilds(readAllowBuildsFromPnpm(root), expected)
  return { allowBuilds }
}

export function main(argv = process.argv.slice(2)) {
  const root = parseArguments(argv)
  const result = checkBuildScripts(root)
  process.stdout.write(`five exact allowBuilds decisions: ${Object.keys(result.allowBuilds).join(', ')}\n`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main()
  } catch (error) {
    process.stderr.write(`security:build-scripts: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
