import { lstat, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

const PRODUCT_AGENT_CONFIG_RELATIVE_PATH = 'config/product-agent.json'
const ENVIRONMENT_OVERRIDES_RELATIVE_PATH = 'config/environment-overrides.json'
const REPOSITORY_SKILLS_ENVIRONMENT_VARIABLE = 'HARNESS_COMFYUI_SKILL_DIR'

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

function requirePresetId(value, name) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]*$/u.test(value)) {
    throw new TypeError(`${name} must contain only lowercase letters, numbers, and hyphens`)
  }
  return value
}

function requireContainedRelativePath(value, name, root) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0') || isAbsolute(value)) {
    throw new TypeError(`${name} must be a non-empty relative path`)
  }
  const path = resolve(root, value)
  const fromRoot = relative(root, path)
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new TypeError(`${name} must identify a path inside its root`)
  }
  return path
}

function requireSharedFilename(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]*\.mjs$/u.test(value)) {
    throw new TypeError('product Agent configuration.preset.sharedFiles must contain .mjs basenames')
  }
  return value
}

async function readJson(path, name) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path)))
  } catch (error) {
    throw new Error(`cannot read ${name} ${path}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}

function parsePreset(value, repositoryRoot) {
  const preset = requireRecord(value, 'product Agent configuration.preset')
  assertExactKeys(
    preset,
    ['id', 'sourceRootRelativePath', 'installRootRelativePath', 'retiredManagedPresetIds', 'sharedFiles'],
    'product Agent configuration.preset',
  )
  const presetId = requirePresetId(preset.id, 'product Agent configuration.preset.id')
  if (!Array.isArray(preset.retiredManagedPresetIds)) {
    throw new TypeError('product Agent configuration.preset.retiredManagedPresetIds must be an array')
  }
  const retiredPresetIds = preset.retiredManagedPresetIds.map((entry, index) => requirePresetId(
    entry,
    `product Agent configuration.preset.retiredManagedPresetIds[${index}]`,
  ))
  if (new Set(retiredPresetIds).size !== retiredPresetIds.length) {
    throw new TypeError('product Agent configuration.preset.retiredManagedPresetIds must be unique')
  }
  if (retiredPresetIds.includes(presetId)) {
    throw new TypeError('product Agent configuration.preset.id must not be retired')
  }
  if (!Array.isArray(preset.sharedFiles) || preset.sharedFiles.length === 0) {
    throw new TypeError('product Agent configuration.preset.sharedFiles must be a non-empty array')
  }
  const sharedFiles = preset.sharedFiles.map(requireSharedFilename)
  if (new Set(sharedFiles).size !== sharedFiles.length) {
    throw new TypeError('product Agent configuration.preset.sharedFiles must be unique')
  }
  requireContainedRelativePath(
    preset.installRootRelativePath,
    'product Agent configuration.preset.installRootRelativePath',
    repositoryRoot,
  )
  return {
    presetId,
    retiredPresetIds,
    sourceRoot: requireContainedRelativePath(
      preset.sourceRootRelativePath,
      'product Agent configuration.preset.sourceRootRelativePath',
      repositoryRoot,
    ),
    installRootRelativePath: preset.installRootRelativePath,
    sharedFiles,
  }
}

async function validateRepositorySkillsRoot(path, repositoryRoot) {
  let stats
  try {
    stats = await lstat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Repository Skills root does not exist: ${path}`, { cause: error })
    }
    throw new Error(`cannot inspect Repository Skills root ${path}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
  if (stats.isSymbolicLink()) throw new Error(`Repository Skills root must not be a symbolic link: ${path}`)
  if (!stats.isDirectory()) throw new Error(`Repository Skills root must be a directory: ${path}`)
  const [resolvedRoot, resolvedSkillsRoot] = await Promise.all([realpath(repositoryRoot), realpath(path)])
  const fromRoot = relative(resolvedRoot, resolvedSkillsRoot)
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`Repository Skills root must stay inside the current checkout: ${path}`)
  }
}

async function validateEnvironmentDeclaration(repositoryRoot, environmentVariable) {
  const path = resolve(repositoryRoot, ENVIRONMENT_OVERRIDES_RELATIVE_PATH)
  const overrides = requireRecord(
    await readJson(path, 'environment override map'),
    'environment override map',
  )
  const declaration = requireRecord(
    overrides[environmentVariable],
    `environment override map.${environmentVariable}`,
  )
  assertExactKeys(
    declaration,
    ['passThrough', 'valueType'],
    `environment override map.${environmentVariable}`,
  )
  if (declaration.passThrough !== true || declaration.valueType !== 'string') {
    throw new TypeError(
      `environment override map.${environmentVariable} must be a string pass-through declaration`,
    )
  }
}

export async function loadProductAgentConfiguration(repositoryRoot) {
  const root = resolve(repositoryRoot)
  const path = resolve(root, PRODUCT_AGENT_CONFIG_RELATIVE_PATH)
  const config = requireRecord(
    await readJson(path, 'product Agent configuration'),
    'product Agent configuration',
  )
  assertExactKeys(config, ['schemaVersion', 'preset', 'skills'], 'product Agent configuration')
  if (config.schemaVersion !== 2) throw new TypeError('product Agent configuration.schemaVersion must be 2')
  const skills = requireRecord(config.skills, 'product Agent configuration.skills')
  assertExactKeys(
    skills,
    ['sourceRootRelativePath', 'environmentVariable'],
    'product Agent configuration.skills',
  )
  const repositorySkillsRoot = requireContainedRelativePath(
    skills.sourceRootRelativePath,
    'product Agent configuration.skills.sourceRootRelativePath',
    root,
  )
  if (skills.environmentVariable !== REPOSITORY_SKILLS_ENVIRONMENT_VARIABLE) {
    throw new TypeError(
      `product Agent configuration.skills.environmentVariable must be ${REPOSITORY_SKILLS_ENVIRONMENT_VARIABLE}`,
    )
  }
  await validateRepositorySkillsRoot(repositorySkillsRoot, root)
  await validateEnvironmentDeclaration(root, skills.environmentVariable)
  return {
    preset: parsePreset(config.preset, root),
    repositorySkillsRoot,
    repositorySkillsEnvironmentVariable: skills.environmentVariable,
  }
}
