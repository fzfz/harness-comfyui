import { mkdir, open, readFile, realpath, lstat, unlink } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseEnv } from 'node:util'

import { parseDesktopE2EConfig, parseDevelopmentEnvironmentLeaseRecord } from '../../../config/desktop-e2e-schema.mjs'

export async function loadDevelopmentEnvironmentOverrides({
  environmentFilePath,
  environmentNames,
  requiredEnvironmentNames,
  readEnvironmentFile = readFile,
}) {
  if (typeof environmentFilePath !== 'string' || !isAbsolute(environmentFilePath)) {
    throw new TypeError('environmentFilePath must be absolute')
  }
  validateEnvironmentNameList(environmentNames, 'environmentNames')
  validateEnvironmentNameList(requiredEnvironmentNames, 'requiredEnvironmentNames')
  if (requiredEnvironmentNames.some(name => !environmentNames.includes(name))) {
    throw new TypeError('requiredEnvironmentNames must be a subset of environmentNames')
  }

  let source
  try {
    source = await readEnvironmentFile(environmentFilePath, 'utf8')
  } catch {
    const error = new Error(`DEVELOPMENT_ENVIRONMENT_FILE_READ_FAILED: could not read ${environmentFilePath}`)
    error.code = 'DEVELOPMENT_ENVIRONMENT_FILE_READ_FAILED'
    throw error
  }
  if (typeof source !== 'string') {
    const error = new Error(`DEVELOPMENT_ENVIRONMENT_FILE_INVALID: ${environmentFilePath} did not produce UTF-8 text`)
    error.code = 'DEVELOPMENT_ENVIRONMENT_FILE_INVALID'
    throw error
  }

  let parsed
  try {
    parsed = parseEnv(source)
  } catch {
    const error = new Error(`DEVELOPMENT_ENVIRONMENT_FILE_INVALID: could not parse ${environmentFilePath}`)
    error.code = 'DEVELOPMENT_ENVIRONMENT_FILE_INVALID'
    throw error
  }

  const overrides = Object.fromEntries(environmentNames
    .filter(name => typeof parsed[name] === 'string' && parsed[name].trim() !== '')
    .map(name => [name, parsed[name]]))
  const missingNames = requiredEnvironmentNames.filter(name => !Object.hasOwn(overrides, name))
  if (missingNames.length > 0) {
    const error = new Error(`DEVELOPMENT_ENVIRONMENT_VARIABLE_MISSING: required variables are absent or empty in ${environmentFilePath}: ${missingNames.join(', ')}`)
    error.code = 'DEVELOPMENT_ENVIRONMENT_VARIABLE_MISSING'
    throw error
  }
  return overrides
}

export async function prepareDevelopmentEnvironment({ repositoryRoot, runId, config }) {
  const validatedConfig = parseDesktopE2EConfig(config)
  const mode = validatedConfig.modes.development
  const repository = await realpath(repositoryRoot)
  const environmentRoot = resolve(repository, mode.environmentRootRelativePath)
  assertContainedPath(repository, environmentRoot, 'development environment root')
  await assertNoSymlinkAncestors(repository, environmentRoot)
  const environmentExistsBefore = await pathExists(environmentRoot)
  await mkdir(environmentRoot, { recursive: true, mode: 0o700 })
  const directories = {
    ...Object.fromEntries(Object.entries(mode.directoryNames).map(([key, name]) => [key, join(environmentRoot, name)])),
  }
  directories.profile = join(directories.dshHome, validatedConfig.paths.profileRelativePath)

  for (const directory of Object.values(directories)) {
    await assertNoSymlinkAncestors(repository, directory)
    await mkdir(directory, { recursive: true, mode: 0o700 })
  }

  const leasePath = join(environmentRoot, mode.leaseFilename)
  const lease = parseDevelopmentEnvironmentLeaseRecord({
    schemaVersion: 1,
    runId,
    processId: process.pid,
    createdAt: new Date().toISOString(),
  })
  let handle
  try {
    handle = await open(leasePath, 'wx', 0o600)
  } catch (error) {
    if (error?.code === 'EEXIST') {
      const busy = new Error(`DEVELOPMENT_ENVIRONMENT_BUSY: persistent DSH home is held by another probe (${leasePath})`, { cause: error })
      busy.code = 'DEVELOPMENT_ENVIRONMENT_BUSY'
      throw busy
    }
    throw error
  }

  try {
    await handle.writeFile(`${JSON.stringify(lease, null, 2)}\n`, 'utf8')
    await handle.sync()
  } catch (error) {
    await handle.close().catch(() => undefined)
    await unlink(leasePath).catch(() => undefined)
    throw error
  }
  await handle.close()

  let released = false
  return {
    environmentRoot,
    directories,
    leasePath,
    environmentExistsBefore,
    initializationStatus: 'unverified',
    async release() {
      if (released) return false
      await releaseDevelopmentEnvironmentLease({ leasePath, runId })
      released = true
      return true
    },
  }
}

export async function inspectDevelopmentEnvironment({ repositoryRoot, config }) {
  const validatedConfig = parseDesktopE2EConfig(config)
  const repository = await realpath(repositoryRoot)
  const mode = validatedConfig.modes.development
  const environmentRoot = resolve(repository, mode.environmentRootRelativePath)
  assertContainedPath(repository, environmentRoot, 'development environment root')
  const directories = {
    environmentRoot,
    ...Object.fromEntries(Object.entries(mode.directoryNames).map(([key, name]) => [key, join(environmentRoot, name)])),
  }
  const environmentExists = await pathExists(environmentRoot)
  return { ...directories, environmentExists, initializationStatus: 'unverified' }
}

export async function releaseDevelopmentEnvironmentLease({ leasePath, runId }) {
  if (typeof leasePath !== 'string' || !isAbsolute(leasePath)) throw new TypeError('leasePath must be absolute')
  let lease
  try {
    lease = parseDevelopmentEnvironmentLeaseRecord(JSON.parse(await readFile(leasePath, 'utf8')))
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
  if (lease.runId !== runId) {
    const mismatch = new Error(`DEVELOPMENT_ENVIRONMENT_LEASE_MISMATCH: lease belongs to run ${lease.runId}`)
    mismatch.code = 'DEVELOPMENT_ENVIRONMENT_LEASE_MISMATCH'
    throw mismatch
  }
  await unlink(leasePath)
  return true
}

function validateEnvironmentNameList(names, label) {
  if (!Array.isArray(names) || names.some(name => typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name))
    || new Set(names).size !== names.length) {
    throw new TypeError(`${label} must contain unique environment variable names`)
  }
}

async function pathExists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function assertContainedPath(root, target, label) {
  const relativeTarget = relative(root, target)
  if (relativeTarget === '..' || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
    throw new TypeError(`${label} must remain inside the repository`)
  }
}

async function assertNoSymlinkAncestors(root, target) {
  assertContainedPath(root, target, 'development environment path')
  let current = root
  const relativeTarget = relative(root, target)
  for (const part of relativeTarget.split(sep).filter(Boolean)) {
    current = join(current, part)
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink()) throw new Error(`development environment path contains a symbolic link: ${current}`)
      if (!info.isDirectory()) throw new Error(`development environment path component is not a directory: ${current}`)
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }
  }
}
