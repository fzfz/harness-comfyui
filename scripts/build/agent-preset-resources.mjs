import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import { parseProductAgentConfiguration } from '../../config/product-agent-schema.mjs'

const requireFromModule = createRequire(import.meta.url)
const yaml = requireFromModule('js-yaml')
const includeModuleUrl = pathToFileURL(requireFromModule.resolve('@deepseek-ai/cordis-plugin-include')).href
const registryModuleUrl = pathToFileURL(requireFromModule.resolve('@deepseek-ai/dsh-agent-preset-registry')).href
const [include, registry] = await Promise.all([import(includeModuleUrl), import(registryModuleUrl)])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function resolveContainedSourceRoot(repositoryRoot, value) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0') || isAbsolute(value)) {
    throw new TypeError('preset.sourceRootRelativePath must be a non-empty relative path')
  }
  const sourceRoot = resolve(repositoryRoot, value)
  const fromRepository = relative(repositoryRoot, sourceRoot)
  if (fromRepository === '' || fromRepository === '..' || fromRepository.startsWith(`..${sep}`) || isAbsolute(fromRepository)) {
    throw new TypeError('preset.sourceRootRelativePath must identify a path inside repositoryRoot')
  }
  return sourceRoot
}

async function loadProductPresetConfiguration(repositoryRoot) {
  const configPath = resolve(repositoryRoot, 'config/product-agent.json')
  let source
  try {
    source = await readFile(configPath, 'utf8')
  } catch (error) {
    throw new Error(`product Agent configuration is unavailable at ${configPath}`, { cause: error })
  }

  let sourceConfiguration
  try {
    sourceConfiguration = JSON.parse(source)
  } catch (error) {
    throw new Error(`product Agent configuration is invalid JSON at ${configPath}`, { cause: error })
  }
  const configuration = parseProductAgentConfiguration(sourceConfiguration)
  const presetIds = [configuration.preset.id, ...configuration.preset.additionalManagedPresetIds]

  return {
    presetIds,
    sourceRoot: resolveContainedSourceRoot(repositoryRoot, configuration.preset.sourceRootRelativePath),
  }
}

async function loadYamlFile(path, options, label) {
  let source
  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    throw new Error(`${label} is unavailable at ${path}`, { cause: error })
  }
  try {
    return yaml.load(source, options)
  } catch (error) {
    const syntax = options?.schema === include.entryListSchema ? 'DSH YAML' : 'YAML'
    throw new Error(`${label} is invalid ${syntax} at ${path}`, { cause: error })
  }
}

async function readPresetResources(sourceRoot, presetId) {
  const presetDirectory = resolve(sourceRoot, presetId)
  const metadataPath = resolve(presetDirectory, 'preset.yml')
  const compositionPath = resolve(presetDirectory, 'agent.cordis.yml')
  const [metadata, composition] = await Promise.all([
    loadYamlFile(metadataPath, undefined, `Agent Preset ${presetId} preset.yml`),
    loadYamlFile(compositionPath, { schema: include.entryListSchema }, `Agent Preset ${presetId} composition`),
  ])

  if (!isRecord(metadata) || typeof metadata.name !== 'string' || metadata.name.trim().length === 0) {
    throw new TypeError(`Agent Preset ${presetId} preset.yml must define a non-empty name`)
  }
  if (!Array.isArray(composition)) {
    throw new TypeError(`Agent Preset ${presetId} composition must be a plugin list`)
  }
  const problem = registry.entryListProblem(composition)
  if (problem !== undefined) {
    throw new TypeError(`Agent Preset ${presetId} composition is invalid: ${problem}`)
  }

  return { id: presetId, metadata, composition }
}

export async function readProjectAgentPresetResources(repositoryRoot, presetId) {
  const root = resolve(repositoryRoot)
  const configuration = await loadProductPresetConfiguration(root)
  if (!configuration.presetIds.includes(presetId)) {
    throw new TypeError(`unknown project Agent Preset ID: ${String(presetId)}`)
  }
  return readPresetResources(configuration.sourceRoot, presetId)
}

export async function validateProjectAgentPresetResources(repositoryRoot) {
  const root = resolve(repositoryRoot)
  const configuration = await loadProductPresetConfiguration(root)
  const presets = []
  for (const presetId of configuration.presetIds) {
    presets.push(await readPresetResources(configuration.sourceRoot, presetId))
  }
  return { sourceRoot: configuration.sourceRoot, presetIds: configuration.presetIds, presets }
}
