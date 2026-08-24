import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

const CONFIG_KEYS = Object.freeze([
  'agentPresetId', 'agentPresetSourceRelativeRoot', 'agentPresetRuntimeRelativeRoot',
  'agentPluginExport', 'sessionListConvergenceTimeoutMs', 'agentModel',
])
const AGENT_MODEL_KEYS = Object.freeze(['provider', 'model', 'reasoningEffort', 'apiKeyEnv'])
const AGENT_PRESET_FILES = Object.freeze(['preset.yml', 'agent.cordis.yml'])
const AGENT_PROFILE_PATCH = 'profiles/comfyui-workbench/cordis.patch.yml'
const FIXED_AGENT_MODEL = Object.freeze({
  provider: 'opencode-go',
  model: 'deepseek-v4-flash',
  reasoningEffort: 'max',
  apiKeyEnv: 'OPENCODE_GO_API_KEY',
})

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
  if (typeof value !== 'string' || value.length === 0 || value.trim().length === 0 || value.includes('\0')) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value
}

function requireRelativePath(value, name) {
  const path = requireString(value, name)
  if (isAbsolute(path) || path.includes('\\') || path.startsWith('./')
    || path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new TypeError(`${name} must be a normalized relative path`)
  }
  return path
}

export function parseAgentModelConfig(value, source = 'config/product-agent.json.agentModel') {
  const config = requireRecord(value, source)
  assertExactKeys(config, AGENT_MODEL_KEYS, source)
  const parsed = Object.fromEntries(AGENT_MODEL_KEYS.map(key => [key, requireString(config[key], `${source}.${key}`)]))
  if (JSON.stringify(parsed) !== JSON.stringify(FIXED_AGENT_MODEL)) {
    throw new TypeError(`${source} must select opencode-go/deepseek-v4-flash with max reasoning effort`)
  }
  return parsed
}

export function parseProductAgentConfig(value, source = 'config/product-agent.json') {
  const config = requireRecord(value, source)
  assertExactKeys(config, CONFIG_KEYS, source)
  const agentPresetId = requireString(config.agentPresetId, `${source}.agentPresetId`)
  if (agentPresetId.includes('/') || agentPresetId.includes('\\')) {
    throw new TypeError(`${source}.agentPresetId must be one path segment`)
  }
  const agentPluginExport = requireString(config.agentPluginExport, `${source}.agentPluginExport`)
  if (!agentPluginExport.startsWith('./') || agentPluginExport.includes('\\') || agentPluginExport.includes('..')) {
    throw new TypeError(`${source}.agentPluginExport must be a package export path`)
  }
  if (!Number.isSafeInteger(config.sessionListConvergenceTimeoutMs) || config.sessionListConvergenceTimeoutMs <= 0) {
    throw new TypeError(`${source}.sessionListConvergenceTimeoutMs must be a positive integer`)
  }
  return {
    agentPresetId,
    agentPresetSourceRelativeRoot: requireRelativePath(
      config.agentPresetSourceRelativeRoot,
      `${source}.agentPresetSourceRelativeRoot`,
    ),
    agentPresetRuntimeRelativeRoot: requireRelativePath(
      config.agentPresetRuntimeRelativeRoot,
      `${source}.agentPresetRuntimeRelativeRoot`,
    ),
    agentPluginExport,
    sessionListConvergenceTimeoutMs: config.sessionListConvergenceTimeoutMs,
    agentModel: parseAgentModelConfig(config.agentModel, `${source}.agentModel`),
  }
}

export async function readProductAgentConfig(repositoryRoot) {
  const path = join(repositoryRoot, 'config/product-agent.json')
  try {
    return parseProductAgentConfig(JSON.parse(await readFile(path, 'utf8')), path)
  } catch (error) {
    throw new Error(`cannot read product Agent configuration ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function renderAgentSettings(productAgent) {
  const model = parseAgentModelConfig(productAgent.agentModel)
  return `agent-default-model:\n`
    + `  provider: ${model.provider}\n`
    + `  model: ${model.model}\n`
    + `  reasoningEffort: ${model.reasoningEffort}\n`
    + `llm-pi-ai:\n`
    + `  providers:\n`
    + `    ${model.provider}:\n`
    + `      apiKeyEnv: ${model.apiKeyEnv}\n`
}

function agentPresetSourceRoot(productAgent) {
  return `${productAgent.agentPresetSourceRelativeRoot}/${productAgent.agentPresetId}`
}

function agentPresetRuntimeRoot(productAgent) {
  return `${productAgent.agentPresetRuntimeRelativeRoot}/${productAgent.agentPresetId}`
}

function agentPluginPath(productAgent) {
  const exportName = productAgent.agentPluginExport.slice(2)
  if (exportName.length === 0 || exportName.endsWith('/')) {
    throw new TypeError('product Agent export must identify one source entry')
  }
  return `lib/${exportName}.js`
}

async function assertDirectory(path, name) {
  let stats
  try {
    stats = await lstat(path)
  } catch (error) {
    throw new Error(`${name} does not exist: ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`${name} must be a regular directory: ${path}`)
}

async function assertFile(path, name) {
  let stats
  try {
    stats = await lstat(path)
  } catch (error) {
    throw new Error(`${name} does not exist: ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`${name} must be a regular file: ${path}`)
}

async function ensureDirectoryPath(root, relativePath, name) {
  await mkdir(root, { recursive: true })
  let current = root
  for (const segment of relativePath.split('/')) {
    current = join(current, segment)
    try {
      const stats = await lstat(current)
      if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`${name} must be a regular directory: ${current}`)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      await mkdir(current)
    }
  }
  return current
}

async function copyDirectoryContents(source, target) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name)
    const targetPath = join(target, entry.name)
    const stats = await lstat(sourcePath)
    if (stats.isSymbolicLink()) throw new Error(`Agent Preset source contains a symlink: ${sourcePath}`)
    if (stats.isDirectory()) {
      await ensureDirectoryPath(target, entry.name, 'Agent Preset target')
      await copyDirectoryContents(sourcePath, targetPath)
    } else if (stats.isFile()) {
      await copyFile(sourcePath, targetPath)
    } else {
      throw new Error(`Agent Preset source contains a non-regular entry: ${sourcePath}`)
    }
  }
}

export async function materializeProductAgentRuntime(repositoryRoot, runtimeRoot, productAgent) {
  const sourceRoot = join(repositoryRoot, agentPresetSourceRoot(productAgent))
  await assertDirectory(sourceRoot, 'Agent Preset source')
  const targetRoot = await ensureDirectoryPath(runtimeRoot, agentPresetRuntimeRoot(productAgent), 'Agent Preset target')
  await copyDirectoryContents(sourceRoot, targetRoot)
  const dshHome = await ensureDirectoryPath(runtimeRoot, 'dsh-home', 'dsh home')
  await writeFile(join(dshHome, 'settings.yaml'), renderAgentSettings(productAgent), 'utf8')
  return { targetRoot }
}

export async function validateProductAgentRuntime(repositoryRoot, runtimeRoot) {
  const productAgent = await readProductAgentConfig(repositoryRoot)
  const sourceRoot = join(repositoryRoot, agentPresetSourceRoot(productAgent))
  const targetRoot = join(runtimeRoot, agentPresetRuntimeRoot(productAgent))
  await assertDirectory(sourceRoot, 'Agent Preset source')
  await assertDirectory(targetRoot, 'Agent Preset runtime')
  for (const file of AGENT_PRESET_FILES) {
    await assertFile(join(sourceRoot, file), `Agent Preset source ${file}`)
    await assertFile(join(targetRoot, file), `Agent Preset runtime ${file}`)
  }
  await assertFile(join(repositoryRoot, agentPluginPath(productAgent)), 'Agent plugin source')
  await assertFile(join(repositoryRoot, AGENT_PROFILE_PATCH), 'Agent profile patch')
  const settingsPath = join(runtimeRoot, 'dsh-home/settings.yaml')
  await assertFile(settingsPath, 'Agent settings')
  if (await readFile(settingsPath, 'utf8') !== renderAgentSettings(productAgent)) {
    throw new Error('Agent settings do not match config/product-agent.json')
  }
  return {
    productAgent,
    requiredEntries: AGENT_PRESET_FILES.map(file => `${agentPresetSourceRoot(productAgent)}/${file}`),
  }
}
