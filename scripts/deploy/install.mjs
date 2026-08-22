import { randomUUID } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { delimiter, isAbsolute, join, resolve } from 'node:path'

import { validateInstallation } from './contracts.mjs'
import { PROFILE_VALIDATOR_ENTRY, runProductPreflight } from './preflight.mjs'
import {
  RUNTIME_DEPENDENCY_POLICY,
  readPnpmPackageManagerVersion,
  runtimeInstallEnvironment,
  runtimeInstallNpmrc,
} from './runtime-contract.mjs'
import {
  ACTIVE_RELEASE_STATE_SCHEMA_VERSION,
  assertProcessStateOwnership,
  isExitedProcessIdentity,
  processIdentityMismatch,
  processStatePath,
  readActiveReleaseState,
  readProcessIdentity,
  readProcessState,
  sameProcessIdentity,
  writeActiveReleaseState,
} from './lifecycle.mjs'

const RUNTIME_FILES = Object.freeze([
  'deployment/runtime/package.json',
  'deployment/runtime/pnpm-lock.yaml',
  'deployment/runtime/pnpm-workspace.yaml',
])
const PROFILE_FILES = Object.freeze([
  'profiles/comfyui-workbench/package.json',
  'profiles/comfyui-workbench/cordis.patch.yml',
  'profiles/comfyui-workbench/pnpm-workspace.yaml',
  PROFILE_VALIDATOR_ENTRY,
])
const DEPLOYMENT_FILES = Object.freeze([
  'scripts/deploy/cli.mjs',
  'scripts/deploy/contracts.mjs',
  'scripts/deploy/install.mjs',
  'scripts/deploy/preflight.mjs',
  'scripts/deploy/runtime-contract.mjs',
  'scripts/profile/materialize.mjs',
])

function runExternal(command, args, options = {}) {
  return new Promise((resolveResult, reject) => {
    let child
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      reject(error)
      return
    }
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', (code, signal) => resolveResult({ code: code ?? 1, signal, stdout, stderr }))
  })
}

function assertSafeTarEntry(entry, seen) {
  if (entry.length === 0 || entry.includes('\0') || isAbsolute(entry) || /^[A-Za-z]:[\\/]/u.test(entry)) {
    throw new Error(`unsafe tar path: ${entry || '(empty)'}`)
  }
  if (entry !== 'package' && !entry.startsWith('package/')) throw new Error(`unsafe tar path outside package/: ${entry}`)
  const pathWithoutTrailingSlash = entry.endsWith('/') ? entry.slice(0, -1) : entry
  const segments = pathWithoutTrailingSlash.split('/')
  if (segments.some(segment => segment === '.' || segment === '..' || segment.length === 0)) {
    throw new Error(`unsafe tar path: ${entry}`)
  }
  if (seen.has(entry)) throw new Error(`tarball contains a duplicate entry: ${entry}`)
  seen.add(entry)
}

async function validateTarball(tarballPath) {
  const listing = await runExternal('tar', ['-tzf', tarballPath])
  if (listing.code !== 0) {
    throw new Error(`tarball cannot be listed: ${listing.stderr.trim() || `exit code ${listing.code}`}`)
  }
  const entries = new Set()
  for (const rawEntry of listing.stdout.split(/\r?\n/u)) {
    const entry = rawEntry.endsWith('\r') ? rawEntry.slice(0, -1) : rawEntry
    if (entry.length === 0) continue
    assertSafeTarEntry(entry, entries)
  }
  const verbose = await runExternal('tar', ['-tvzf', tarballPath])
  if (verbose.code !== 0) {
    throw new Error(`tarball metadata cannot be read: ${verbose.stderr.trim() || `exit code ${verbose.code}`}`)
  }
  for (const line of verbose.stdout.split(/\r?\n/u)) {
    const kind = line[0]
    if (kind === 'l') throw new Error('unsafe tar entry: symlink')
    if (kind === 'h') throw new Error('unsafe tar entry: hardlink')
    if (kind !== undefined && kind !== '' && !'-d'.includes(kind)) {
      throw new Error(`unsafe tar entry type: ${kind}`)
    }
  }
  if (!entries.has('package/package.json')) throw new Error('tarball must contain package/package.json')
  for (const required of [...RUNTIME_FILES, ...PROFILE_FILES, ...DEPLOYMENT_FILES]) {
    if (!entries.has(`package/${required}`)) throw new Error(`tarball must contain package/${required}`)
  }
  return [...entries]
}

async function ensureAbsent(path, description) {
  try {
    await lstat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  throw new Error(`${description} already exists: ${path}`)
}

async function resolveExecutable(command) {
  const candidates = isAbsolute(command)
    ? [resolve(command)]
    : (process.env.PATH ?? '').split(delimiter).filter(Boolean).flatMap(directory => [
        join(directory, command),
        ...(process.platform === 'win32' ? [join(directory, `${command}.cmd`), join(directory, `${command}.exe`)] : []),
      ])
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK)
      return candidate
    } catch {
      // Continue through PATH candidates.
    }
  }
  throw new Error(`cannot find executable ${command}`)
}

async function readPackageManifest(packageRoot) {
  let manifest
  try {
    manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  } catch (error) {
    throw new Error(`release package.json is malformed: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (manifest?.name !== 'harness-comfyui') throw new Error('release package.json.name must be harness-comfyui')
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) throw new Error('release package.json.version must be a non-empty string')
  return manifest
}

async function validateRuntimeManifest(packageRoot, rootManifest, expectedPackageManagerVersion) {
  let runtimeManifest
  try {
    runtimeManifest = JSON.parse(await readFile(join(packageRoot, 'deployment/runtime/package.json'), 'utf8'))
  } catch (error) {
    throw new Error(`runtime package.json is malformed: ${error instanceof Error ? error.message : String(error)}`)
  }
  const actualPackageManagerVersion = readPnpmPackageManagerVersion(runtimeManifest, 'runtime package.json')
  if (actualPackageManagerVersion !== expectedPackageManagerVersion) {
    throw new Error(`runtime package.json.packageManager must match preflight pnpm@${expectedPackageManagerVersion}`)
  }
  const actualNames = Object.keys(runtimeManifest?.dependencies ?? {}).sort()
  const expectedNames = [...RUNTIME_DEPENDENCY_POLICY.packages].sort()
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error('runtime package.json must contain exactly the three product runtime dependencies')
  }
  for (const name of RUNTIME_DEPENDENCY_POLICY.packages) {
    if (runtimeManifest.dependencies[name] !== rootManifest.devDependencies?.[name]) {
      throw new Error(`runtime dependency ${name} does not match the packed root manifest`)
    }
  }
}

async function copyRuntimeFiles(packageRoot, runtimeRoot) {
  await mkdir(runtimeRoot, { recursive: true })
  for (const relativePath of RUNTIME_FILES) {
    await copyFile(join(packageRoot, relativePath), join(runtimeRoot, relativePath.slice('deployment/runtime/'.length)))
  }
  await writeFile(join(runtimeRoot, '.npmrc'), runtimeInstallNpmrc(), 'utf8')
}

async function runPnpmInstall(runtimeRoot, pnpmExecutable) {
  const result = await runExternal(pnpmExecutable, ['install', '--frozen-lockfile', '--prod'], {
    cwd: runtimeRoot,
    env: runtimeInstallEnvironment({ ...process.env, COREPACK_ENABLE_PROJECT_SPEC: '0' }),
  })
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim()
    throw new Error(`runtime pnpm install failed${detail ? `: ${detail}` : ` with exit code ${result.code}`}`)
  }
}

async function assertDshExecutable(path) {
  try {
    const stats = await lstat(path)
    if (!stats.isFile() && !stats.isSymbolicLink()) throw new Error('not a file')
    await access(path, fsConstants.X_OK)
  } catch (error) {
    throw new Error(`release-local dsh executable is unavailable at ${path}: ${error.message}`)
  }
}

async function materializeProfile(releaseRoot, installation, pnpmExecutable, packageSpec) {
  const packageRoot = join(releaseRoot, 'package')
  const dshHome = join(releaseRoot, 'dsh-home')
  const dshExecutable = join(releaseRoot, 'harness-runtime/node_modules/.bin/dsh')
  const materializeScript = join(packageRoot, 'scripts/profile/materialize.mjs')
  await assertDshExecutable(dshExecutable)
  const result = await runExternal(process.execPath, [
    materializeScript,
    '--configuration', installation.configurationProfile,
    '--dsh-home', dshHome,
    '--package-spec', packageSpec,
    '--dsh-executable', dshExecutable,
    '--pnpm-executable', pnpmExecutable,
  ], { cwd: packageRoot, env: { ...process.env, DSH_HOME: dshHome } })
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim()
    throw new Error(`profile materialize failed${detail ? `: ${detail}` : ` with exit code ${result.code}`}`)
  }
}

async function assertNoActiveRelease(statePath) {
  try {
    await lstat(statePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  throw new Error('installation already has an active release; use upgrade (an active release already exists)')
}

async function stageReleaseFromPreflight(preflight, artifactPath, pnpmExecutable) {
  const { installation, artifact } = preflight
  const root = installation.root
  const releaseRoot = resolve(root, 'releases', artifact.version)
  await validateTarball(artifactPath)
  await ensureAbsent(releaseRoot, `release ${artifact.version}`)
  const releasesRoot = resolve(root, 'releases')
  await mkdir(releasesRoot, { recursive: true })
  const stagingRoot = await mkdtemp(join(releasesRoot, `.${artifact.version}.incoming-`))
  try {
    const extractedPackageRoot = join(stagingRoot, 'package')
    const extraction = await runExternal('tar', ['-xzf', artifactPath, '-C', stagingRoot])
    if (extraction.code !== 0) {
      throw new Error(`tarball extraction failed: ${extraction.stderr.trim() || `exit code ${extraction.code}`}`)
    }
    const packedManifest = await readPackageManifest(extractedPackageRoot)
    if (packedManifest.version !== artifact.version) throw new Error('artifact package version changed during install')
    await validateRuntimeManifest(extractedPackageRoot, packedManifest, preflight.runtime.pnpm)
    const runtimeRoot = join(stagingRoot, 'harness-runtime')
    await copyRuntimeFiles(extractedPackageRoot, runtimeRoot)
    await runPnpmInstall(runtimeRoot, pnpmExecutable)
    await rename(stagingRoot, releaseRoot)
    await materializeProfile(releaseRoot, installation, pnpmExecutable, resolve(artifactPath))
    return { releaseRoot, artifact, installation }
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true })
    await rm(releaseRoot, { recursive: true, force: true })
    throw error
  }
}

async function hasVerifiedRunningHost(installation) {
  const active = await readActiveReleaseState(installation.root, installation.installationId)
  if (active === undefined) return false
  const state = await readProcessState(processStatePath(installation.root))
  if (state === null) return false
  assertProcessStateOwnership(state, installation, active.activeVersion)
  const identity = await readProcessIdentity(state.pid)
  if (identity === null) return false
  if (isExitedProcessIdentity(state.processIdentity, identity)) return false
  if (!sameProcessIdentity(state.processIdentity, identity)) {
    throw new Error(processIdentityMismatch(state, identity))
  }
  return true
}

export async function stageProductRelease(input, artifactPath) {
  const installation = validateInstallation(input)
  const allowKnownPortUse = await hasVerifiedRunningHost(installation)
  const preflight = await runProductPreflight(installation, artifactPath, { allowKnownPortUse })
  const pnpmExecutable = await resolveExecutable(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  const staged = await stageReleaseFromPreflight(preflight, artifactPath, pnpmExecutable)
  return { ...staged, preflight }
}

async function writeStableBin(root, parserReleaseRoot, installationId) {
  const binDirectory = join(root, 'bin')
  const stablePath = join(binDirectory, 'harness-comfyui')
  await mkdir(binDirectory, { recursive: true })
  const source = `#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const root = ${JSON.stringify(root)}
let releaseCliPath
try {
  const lifecycle = await import(${JSON.stringify(pathToFileURL(join(parserReleaseRoot, 'package/scripts/deploy/lifecycle.mjs')).href)})
  const state = await lifecycle.readActiveReleaseState(root, ${JSON.stringify(installationId)})
  if (state === undefined) throw new Error('active release state does not exist')
  releaseCliPath = join(state.releasePath, 'package/scripts/deploy/cli.mjs')
} catch (error) {
  process.stderr.write('harness-comfyui: active release dispatch failed: ' + error.message + '\\n')
}
if (releaseCliPath === undefined) {
  process.exitCode = 1
} else {
  const child = spawn(process.execPath, [releaseCliPath, ...process.argv.slice(2)], { stdio: 'inherit', shell: false })
  const signalExitCodes = { SIGINT: 130, SIGTERM: 143 }
  let spawnFailed = false
  const forwardSignal = signal => {
    if (child.exitCode !== null || child.signalCode !== null) return
    try {
      child.kill(signal)
    } catch (error) {
      process.stderr.write('harness-comfyui: ' + error.message + '\\n')
      process.exitCode = 1
    }
  }
  process.on('SIGINT', () => forwardSignal('SIGINT'))
  process.on('SIGTERM', () => forwardSignal('SIGTERM'))
  child.once('error', error => {
    spawnFailed = true
    process.stderr.write('harness-comfyui: ' + error.message + '\\n')
    process.exitCode = 1
  })
  child.once('close', (code, signal) => {
    process.removeAllListeners('SIGINT')
    process.removeAllListeners('SIGTERM')
    process.exitCode = spawnFailed ? 1 : (code ?? (signal ? signalExitCodes[signal] ?? 1 : 0))
  })
}
`
  const temporaryPath = `${stablePath}.${randomUUID()}.next`
  try {
    await writeFile(temporaryPath, source, { encoding: 'utf8', mode: 0o755, flag: 'wx' })
    await chmod(temporaryPath, 0o755)
    await rename(temporaryPath, stablePath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
  return stablePath
}

export async function runProductInstall(input, artifactPath) {
  const preflight = await runProductPreflight(input, artifactPath)
  const { installation, artifact } = preflight
  const root = installation.root
  const releaseRoot = resolve(root, 'releases', artifact.version)
  const statePath = resolve(root, 'state/active-release.json')
  const pnpmExecutable = await resolveExecutable(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')

  await assertNoActiveRelease(statePath)
  await stageReleaseFromPreflight(preflight, artifactPath, pnpmExecutable)
  let releaseCreated = false
  let stateCommitted = false
  let stableBinPath
  try {
    releaseCreated = true
    const state = {
      schemaVersion: ACTIVE_RELEASE_STATE_SCHEMA_VERSION,
      installationId: installation.installationId,
      activeVersion: artifact.version,
      previousRelease: null,
      releasePath: releaseRoot,
    }
    stableBinPath = await writeStableBin(root, releaseRoot, installation.installationId)
    await writeActiveReleaseState(root, state)
    stateCommitted = true
    return {
      stage: 'install',
      status: 'passed',
      installation,
      artifact,
      runtime: { node: process.versions.node, pnpm: preflight.runtime.pnpm },
      release: { version: artifact.version, path: releaseRoot, previousRelease: null },
    }
  } catch (error) {
    if (stableBinPath !== undefined && !stateCommitted) {
      await rm(stableBinPath, { force: true })
    }
    if (releaseCreated && !stateCommitted) {
      await rm(releaseRoot, { recursive: true, force: true })
    }
    throw error
  }
}
