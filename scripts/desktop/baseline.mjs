import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SHA_PATTERN = /^[0-9a-f]{40}$/u
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u

function record(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new Error(`${label} must contain exactly ${sortedExpected.join(', ')}`)
  }
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error(`${label} must be a non-empty string without NUL`)
  }
  return value
}

function relativePath(value, label) {
  const path = nonEmptyString(value, label)
  if (isAbsolute(path) || path.split(/[\\/]/u).includes('..')) {
    throw new Error(`${label} must stay inside its configured root`)
  }
  return path
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`)
  return value
}

export function parseDesktopBaseline(value) {
  const baseline = record(value, 'Desktop baseline')
  exactKeys(baseline, ['entrypoints', 'packages', 'profile', 'schemaVersion', 'source', 'startup'], 'Desktop baseline')
  if (baseline.schemaVersion !== 1) throw new Error('Desktop baseline schemaVersion must be 1')

  const source = record(baseline.source, 'Desktop baseline source')
  exactKeys(source, ['commit', 'relativePath', 'repository', 'stableWorkspace'], 'Desktop baseline source')
  const repository = nonEmptyString(source.repository, 'Desktop baseline source.repository')
  const commit = nonEmptyString(source.commit, 'Desktop baseline source.commit')
  if (!SHA_PATTERN.test(commit)) throw new Error('Desktop baseline source.commit must be a lowercase full commit SHA')

  const packages = record(baseline.packages, 'Desktop baseline packages')
  exactKeys(packages, ['desktop', 'electron', 'harness'], 'Desktop baseline packages')
  const parsedPackages = {}
  for (const key of ['desktop', 'harness', 'electron']) {
    const definition = record(packages[key], `Desktop baseline packages.${key}`)
    exactKeys(definition, ['name', 'version'], `Desktop baseline packages.${key}`)
    const name = nonEmptyString(definition.name, `Desktop baseline packages.${key}.name`)
    if (!PACKAGE_NAME_PATTERN.test(name)) throw new Error(`Desktop baseline packages.${key}.name is invalid`)
    parsedPackages[key] = Object.freeze({
      name,
      version: nonEmptyString(definition.version, `Desktop baseline packages.${key}.version`),
    })
  }

  const profile = record(baseline.profile, 'Desktop baseline profile')
  exactKeys(profile, [
    'name',
    'pluginPackageName',
    'setupRevision',
    'setupStateFilename',
    'setupStateRootDirectory',
    'setupStateVersion',
  ], 'Desktop baseline profile')
  const startup = record(baseline.startup, 'Desktop baseline startup')
  exactKeys(startup, [
    'host', 'mode', 'networkExposure', 'openBrowser', 'readyTimeoutMs', 'stopTimeoutMs',
  ], 'Desktop baseline startup')
  if (startup.host !== '127.0.0.1') throw new Error('Desktop baseline startup.host must be 127.0.0.1')
  if (startup.mode !== 'compatibility') throw new Error('Desktop baseline startup.mode must be compatibility')
  if (startup.networkExposure !== 'loopback') {
    throw new Error('Desktop baseline startup.networkExposure must be loopback')
  }
  if (startup.openBrowser !== false) throw new Error('Desktop baseline startup.openBrowser must be false')

  const entrypoints = record(baseline.entrypoints, 'Desktop baseline entrypoints')
  exactKeys(entrypoints, ['desktopMain'], 'Desktop baseline entrypoints')
  return Object.freeze({
    schemaVersion: 1,
    source: Object.freeze({
      repository,
      commit,
      relativePath: relativePath(source.relativePath, 'Desktop baseline source.relativePath'),
      stableWorkspace: relativePath(source.stableWorkspace, 'Desktop baseline source.stableWorkspace'),
    }),
    packages: Object.freeze(parsedPackages),
    profile: Object.freeze({
      name: nonEmptyString(profile.name, 'Desktop baseline profile.name'),
      pluginPackageName: nonEmptyString(profile.pluginPackageName, 'Desktop baseline profile.pluginPackageName'),
      setupStateVersion: positiveInteger(profile.setupStateVersion, 'Desktop baseline profile.setupStateVersion'),
      setupRevision: positiveInteger(profile.setupRevision, 'Desktop baseline profile.setupRevision'),
      setupStateRootDirectory: relativePath(
        profile.setupStateRootDirectory,
        'Desktop baseline profile.setupStateRootDirectory',
      ),
      setupStateFilename: relativePath(profile.setupStateFilename, 'Desktop baseline profile.setupStateFilename'),
    }),
    startup: Object.freeze({
      host: startup.host,
      mode: startup.mode,
      networkExposure: startup.networkExposure,
      openBrowser: startup.openBrowser,
      readyTimeoutMs: positiveInteger(startup.readyTimeoutMs, 'Desktop baseline startup.readyTimeoutMs'),
      stopTimeoutMs: positiveInteger(startup.stopTimeoutMs, 'Desktop baseline startup.stopTimeoutMs'),
    }),
    entrypoints: Object.freeze({
      desktopMain: relativePath(entrypoints.desktopMain, 'Desktop baseline entrypoints.desktopMain'),
    }),
  })
}

async function readPackageManifest(requireFromDesktop, packageName) {
  const path = requireFromDesktop.resolve(`${packageName}/package.json`)
  return { path, manifest: JSON.parse(await readFile(path, 'utf8')) }
}

function requirePackageIdentity(manifest, expected, path) {
  if (manifest.name !== expected.name || manifest.version !== expected.version) {
    throw new Error(
      `Desktop baseline package mismatch at ${path}: expected ${expected.name}@${expected.version}, got ${String(manifest.name)}@${String(manifest.version)}`,
    )
  }
}

export async function validateDesktopBaseline(baseline, options = {}) {
  const desktopRepository = resolve(options.desktopRepository)
  const desktopWorkspace = resolve(desktopRepository, baseline.source.stableWorkspace)
  const git = options.spawnSync ?? spawnSync
  const revision = git('git', ['-C', desktopRepository, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  if (revision.error !== undefined) throw revision.error
  if (revision.status !== 0 || revision.stdout.trim() !== baseline.source.commit) {
    throw new Error(`Desktop source must be checked out at ${baseline.source.commit}: ${desktopRepository}`)
  }
  const remote = git('git', ['-C', desktopRepository, 'remote', 'get-url', 'origin'], { encoding: 'utf8' })
  if (remote.error !== undefined) throw remote.error
  if (remote.status !== 0 || remote.stdout.trim() !== baseline.source.repository) {
    throw new Error(`Desktop source origin must be ${baseline.source.repository}: ${desktopRepository}`)
  }

  const desktopManifestPath = resolve(desktopWorkspace, 'package.json')
  const desktopManifest = JSON.parse(await readFile(desktopManifestPath, 'utf8'))
  requirePackageIdentity(desktopManifest, baseline.packages.desktop, desktopManifestPath)
  const requireFromDesktop = createRequire(desktopManifestPath)
  const harness = await readPackageManifest(requireFromDesktop, baseline.packages.harness.name)
  const electron = await readPackageManifest(requireFromDesktop, baseline.packages.electron.name)
  requirePackageIdentity(harness.manifest, baseline.packages.harness, harness.path)
  requirePackageIdentity(electron.manifest, baseline.packages.electron, electron.path)
  const desktopMain = resolve(desktopWorkspace, baseline.entrypoints.desktopMain)
  await readFile(desktopMain)
  return Object.freeze({
    ...baseline,
    desktopRepository,
    desktopWorkspace,
    desktopManifestPath,
    desktopMain,
    harnessManifestPath: harness.path,
    electronManifestPath: electron.path,
  })
}

export async function loadDesktopBaseline(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot)
  const definitionPath = resolve(options.definitionPath ?? resolve(repositoryRoot, 'config/desktop-baseline.json'))
  const baseline = parseDesktopBaseline(JSON.parse(await readFile(definitionPath, 'utf8')))
  const sourceRoot = resolve(options.desktopSourceRoot ?? repositoryRoot)
  return validateDesktopBaseline(baseline, {
    ...options,
    desktopRepository: options.desktopRepository ?? resolve(sourceRoot, baseline.source.relativePath),
  })
}
