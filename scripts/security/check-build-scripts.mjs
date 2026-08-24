import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

import { validateDependencyPolicy } from './check-manifest-lock.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function parseArguments(argv) {
  if (argv.length === 0) return repositoryRoot
  if (argv.length !== 2 || argv[0] !== '--root' || argv[1].length === 0) {
    throw new Error('usage: check-build-scripts [--root <repository>]')
  }
  return resolve(argv[1])
}

function rejectManifestBuildDecisions(root) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  const pnpm = manifest.pnpm
  if (pnpm === undefined) return
  if (pnpm === null || typeof pnpm !== 'object' || Array.isArray(pnpm)) {
    throw new Error('package.json.pnpm must be an object')
  }
  const fields = ['onlyBuiltDependencies', 'onlyBuiltDependenciesFile', 'neverBuiltDependencies', 'ignoredBuiltDependencies']
  const unexpected = fields.filter(field => Object.hasOwn(pnpm, field))
  if (unexpected.length > 0) throw new Error(`package.json contains build decisions outside pnpm-workspace.yaml: ${unexpected.join(', ')}`)
}

export function checkBuildScripts(root = repositoryRoot) {
  const resolvedRoot = resolve(root)
  const { policy } = validateDependencyPolicy(resolvedRoot)
  rejectManifestBuildDecisions(resolvedRoot)
  const command = process.env.PNPM_BIN ?? (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  const result = spawnSync(command, ['config', 'get', 'allowBuilds', '--json'], {
    cwd: resolvedRoot,
    env: { ...process.env },
    encoding: 'utf8',
    shell: false,
  })
  if (result.error !== undefined) throw new Error(`cannot execute pnpm policy query: ${String(result.error)}`)
  if (result.status !== 0) throw new Error(`pnpm policy query exited with code ${String(result.status)}`)
  let actual
  try {
    actual = JSON.parse(String(result.stdout ?? '').trim())
  } catch (error) {
    throw new Error(`pnpm policy query returned malformed JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isDeepStrictEqual(actual, policy.allowBuilds)) {
    throw new Error('pnpm allowBuilds projection differs from config/dependency-security-policy.json')
  }
  return { allowBuilds: actual }
}

export function main(argv = process.argv.slice(2)) {
  const root = parseArguments(argv)
  const result = checkBuildScripts(root)
  process.stdout.write(`reviewed build scripts: ${Object.keys(result.allowBuilds).join(', ')}\n`)
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
