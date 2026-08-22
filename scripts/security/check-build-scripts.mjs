import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { deepStrictEqual } from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  dependencySecurityPolicyFile,
  readStrictDependencyBuilds,
  runtimeDirectory,
  validateDependencyClosure,
} from './check-manifest-lock.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

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
    throw new Error(`pnpm allowBuilds projection differs from ${dependencySecurityPolicyFile}; received ${actualKeys.join(', ')}`)
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
  const resolvedRoot = resolve(root)
  const runtimeRoot = resolve(resolvedRoot, runtimeDirectory)
  readStrictDependencyBuilds(resolvedRoot, resolvedRoot)
  readStrictDependencyBuilds(resolvedRoot, runtimeRoot)
  rejectManifestBuildDecisions(root)
  rejectManifestBuildDecisions(runtimeRoot)
  const closure = validateDependencyClosure(resolvedRoot)
  const expected = closure.dependencySecurityPolicy.allowBuilds
  const allowBuilds = validateAllowBuilds(readAllowBuildsFromPnpm(root), expected)
  return { allowBuilds, closure, rootWorkspace: closure.rootPolicy, runtimeWorkspace: closure.runtimePolicy }
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
