import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const artifactDirectoryName = '.release/quality'

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`cannot read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function currentGitCommit(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  })
  if (result.error) throw new Error(`cannot read current git commit: ${result.error.message}`, { cause: result.error })
  if (result.status !== 0) {
    throw new Error(`cannot read current git commit (git status ${result.status}): ${(result.stderr ?? '').trim()}`)
  }
  const commit = result.stdout.trim()
  if (!/^[0-9a-f]{40}$/u.test(commit)) throw new Error(`git rev-parse HEAD returned an invalid commit: ${commit}`)
  return commit
}

function defaultRunPack({ root, destination }) {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const result = spawnSync(pnpm, ['pack', '--pack-destination', destination], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    stdio: 'inherit',
  })
  if (result.error) throw new Error(`package pack could not execute pnpm: ${result.error.message}`, { cause: result.error })
  if (result.status !== 0) throw new Error(`package pack failed with status ${result.status}`)
}

function parseArguments(argv) {
  let root = repositoryRoot
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument !== '--root') throw new Error(`unknown argument ${argument}`)
    if (root !== repositoryRoot) throw new Error('duplicate argument --root')
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error('--root requires a non-empty value')
    root = resolve(value)
    index += 1
  }
  return root
}

/**
 * Pack the current package exactly once and write the quality artifact manifest.
 * The build is intentionally not part of this function: the caller owns the
 * fixed build -> pack -> validate order.
 */
export function packPackage(root = repositoryRoot, options = {}) {
  const resolvedRoot = resolve(root)
  const manifestPath = join(resolvedRoot, 'package.json')
  const manifest = readJson(manifestPath)
  if (typeof manifest.name !== 'string' || manifest.name.length === 0) throw new Error('package.json name must be a non-empty string')
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) throw new Error('package.json version must be a non-empty string')

  const destination = resolve(resolvedRoot, artifactDirectoryName)
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(destination, { recursive: true })

  const runPack = options.runPack ?? defaultRunPack
  runPack({ root: resolvedRoot, destination, manifest })

  const tarballs = readdirSync(destination, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tgz'))
    .map((entry) => entry.name)
  if (tarballs.length !== 1) {
    throw new Error(`package pack must produce exactly one .tgz in ${destination}; found ${tarballs.length}`)
  }
  const tarballPath = resolve(destination, tarballs[0])
  const commit = (options.gitCommit ?? currentGitCommit)(resolvedRoot)
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/u.test(commit)) {
    throw new Error(`package pack requires an exact 40-character git commit; received ${String(commit)}`)
  }

  const artifact = {
    tarballPath,
    filename: basename(tarballPath),
    version: manifest.version,
    commit,
    byteLength: statSync(tarballPath).size,
    sha256: sha256(tarballPath),
  }
  writeFileSync(join(destination, 'artifact.json'), `${JSON.stringify(artifact, null, 2)}\n`)
  process.stdout.write(`package artifact: ${artifact.tarballPath} (${artifact.sha256})\n`)
  return artifact
}

export function main(argv = process.argv.slice(2)) {
  packPackage(parseArguments(argv))
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main()
  } catch (error) {
    process.stderr.write(`package:pack: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
