import { constants as fsConstants } from 'node:fs'
import { access, lstat, readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadSavedSourceManagedContext, loadSourceProductionContext } from '../production/runtime.mjs'

const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DEFINITION_KEYS = Object.freeze([
  'schemaVersion',
  'runtimeId',
  'runtimeRelativeRoot',
  'sourceProductionDefinitionRelativePath',
  'dshProfile',
  'userEnvironmentFilePath',
  'startupWorkspacePath',
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireRecord(value, name) {
  if (!isRecord(value)) throw new TypeError(`${name} must be an object`)
  return value
}

function assertExactKeys(value, keys, name) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${name} must contain exactly ${expected.join(', ')}`)
  }
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0')) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value
}

function requireRelativePath(value, name, root) {
  const path = requireString(value, name)
  if (isAbsolute(path)) throw new TypeError(`${name} must be relative to the source repository`)
  const resolved = resolve(root, path)
  const fromRoot = relative(root, resolved)
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new TypeError(`${name} must identify a path inside the source repository`)
  }
  return resolved
}

function requireAbsolutePath(value, name) {
  const path = requireString(value, name)
  if (!isAbsolute(path)) throw new TypeError(`${name} must be an absolute path`)
  return resolve(path)
}

function requireProfileName(value) {
  const profile = requireString(value, 'source worktree definition.dshProfile')
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(profile)) {
    throw new TypeError('source worktree definition.dshProfile must contain only lowercase letters, numbers, and hyphens')
  }
  return profile
}

async function readJson(path, name) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path))
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`cannot read ${name} ${path}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}

async function assertLinkedWorktree(repositoryRoot) {
  const gitMetadataPath = resolve(repositoryRoot, '.git')
  let metadata
  try {
    metadata = await lstat(gitMetadataPath)
  } catch (error) {
    throw new Error(
      `source repository must be an independent linked git worktree: ${gitMetadataPath} is unavailable`,
      { cause: error },
    )
  }
  if (!metadata.isFile()) {
    throw new Error(
      `source repository must be an independent linked git worktree: ${gitMetadataPath} must be a file`,
    )
  }
}

async function assertReadableFile(path, name) {
  try {
    const stats = await stat(path)
    if (!stats.isFile()) throw new Error(`${path} is not a regular file`)
    await access(path, fsConstants.R_OK)
  } catch (error) {
    throw new Error(`${name} is unavailable at ${path}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}

async function assertReadableDirectory(path, name) {
  try {
    const stats = await stat(path)
    if (!stats.isDirectory()) throw new Error(`${path} is not a directory`)
    await access(path, fsConstants.R_OK | fsConstants.X_OK)
  } catch (error) {
    throw new Error(`${name} is unavailable at ${path}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}

export function parseSourceWorktreeDefinition(value, repositoryRoot = defaultRepositoryRoot) {
  const root = resolve(repositoryRoot)
  const definition = requireRecord(value, 'source worktree definition')
  assertExactKeys(definition, DEFINITION_KEYS, 'source worktree definition')
  if (definition.schemaVersion !== 1) throw new TypeError('source worktree definition.schemaVersion must be 1')
  return {
    schemaVersion: 1,
    runtimeId: requireString(definition.runtimeId, 'source worktree definition.runtimeId'),
    runtimeRoot: requireRelativePath(
      definition.runtimeRelativeRoot,
      'source worktree definition.runtimeRelativeRoot',
      root,
    ),
    sourceProductionDefinitionPath: requireRelativePath(
      definition.sourceProductionDefinitionRelativePath,
      'source worktree definition.sourceProductionDefinitionRelativePath',
      root,
    ),
    dshProfile: requireProfileName(definition.dshProfile),
    userEnvironmentFilePath: requireAbsolutePath(
      definition.userEnvironmentFilePath,
      'source worktree definition.userEnvironmentFilePath',
    ),
    startupWorkspacePath: requireAbsolutePath(
      definition.startupWorkspacePath,
      'source worktree definition.startupWorkspacePath',
    ),
  }
}

export async function loadSourceWorktreeContext(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot)
  const definitionPath = resolve(
    options.definitionPath ?? resolve(repositoryRoot, 'config/worktree-development.json'),
  )
  const worktreeDefinition = parseSourceWorktreeDefinition(
    await readJson(definitionPath, 'source worktree definition'),
    repositoryRoot,
  )
  await assertLinkedWorktree(repositoryRoot)
  await assertReadableFile(
    worktreeDefinition.userEnvironmentFilePath,
    'worktree development user environment file',
  )
  await assertReadableDirectory(
    worktreeDefinition.startupWorkspacePath,
    'worktree development startup workspace',
  )
  const context = await loadSourceProductionContext({
    repositoryRoot,
    definitionPath: worktreeDefinition.sourceProductionDefinitionPath,
    managedStatePath: resolve(worktreeDefinition.runtimeRoot, 'state/source-managed.json'),
    environment: options.environment,
    runtimeOverride: {
      runtimeId: worktreeDefinition.runtimeId,
      runtimeRoot: worktreeDefinition.runtimeRoot,
    },
    dshProfile: worktreeDefinition.dshProfile,
    userEnvironmentFilePath: worktreeDefinition.userEnvironmentFilePath,
    startupWorkspacePath: worktreeDefinition.startupWorkspacePath,
  })
  return {
    ...context,
    worktreeDefinitionPath: definitionPath,
    worktreeDefinition,
    configReadOrder: [definitionPath, ...context.configReadOrder],
  }
}

export async function loadSavedSourceWorktreeContext(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot)
  const definitionPath = resolve(
    options.definitionPath ?? resolve(repositoryRoot, 'config/worktree-development.json'),
  )
  const worktreeDefinition = parseSourceWorktreeDefinition(
    await readJson(definitionPath, 'source worktree definition'),
    repositoryRoot,
  )
  await assertLinkedWorktree(repositoryRoot)
  return loadSavedSourceManagedContext({
    repositoryRoot,
    definitionPath: worktreeDefinition.sourceProductionDefinitionPath,
    managedStatePath: resolve(worktreeDefinition.runtimeRoot, 'state/source-managed.json'),
  })
}
