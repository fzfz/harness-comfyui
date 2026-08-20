import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

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

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function runFrozenLockfileCheck(root) {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const result = spawnSync(command, [
    'install',
    '--lockfile-only',
    '--ignore-scripts',
    '--frozen-lockfile',
    '--offline',
    '--reporter=append-only',
  ], {
    cwd: root,
    env: { ...process.env, CI: 'true' },
    encoding: 'utf8',
    shell: false,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.error !== undefined) {
    throw new Error(`manifest/lockfile check could not execute pnpm: ${String(result.error)}`)
  }
  if (result.status !== 0) {
    throw new Error(`manifest/lockfile drift or invalid lockfile (pnpm status ${result.status})\n${output}`)
  }
  return output
}

export function checkManifestLock(root = repositoryRoot) {
  const manifestPath = resolve(root, 'package.json')
  const lockfilePath = resolve(root, 'pnpm-lock.yaml')
  const before = digest(lockfilePath)
  const output = runFrozenLockfileCheck(root)
  const after = digest(lockfilePath)
  if (before !== after) {
    throw new Error('manifest/lockfile check changed pnpm-lock.yaml')
  }
  // Reading the manifest at the gate makes a missing or malformed manifest fail before a pass is reported.
  JSON.parse(readFileSync(manifestPath, 'utf8'))
  return { output, manifestPath, lockfilePath }
}

export function main(argv = process.argv.slice(2)) {
  const root = parseArguments(argv)
  checkManifestLock(root)
  process.stdout.write(`manifest and lockfile are consistent: ${root}\n`)
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
