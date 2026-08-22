import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const registryPath = 'src/host/tools/register-project-tools.ts'
const pluginPath = 'src/agent/plugin.ts'
const allowedHarnessImports = new Map([
  ['@deepseek-ai/cordis', 'value-or-type'],
  ['@deepseek-ai/dsh-client-runtime/client', 'value-or-type'],
  ['@deepseek-ai/dsh-client-ui-layout/client', 'value-or-type'],
  ['@deepseek-ai/dsh-tools', 'value-or-type'],
  ['@deepseek-ai/dsh-typert-protocol', 'value-or-type'],
  ['@deepseek-ai/schemastery', 'value-or-type'],
  ['@deepseek-ai/dsh-client-ui-input-trigger/client', 'type-only'],
])
const frozenClientInject = Object.freeze([
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-api-remotes',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-input-trigger',
  '@deepseek-ai/dsh-client-ui-layout',
])
const forbiddenSourceProtocols = /^(?:patch|file|link|workspace|npm|git|github|gitlab|bitbucket):/iu
const forbiddenSourceBinding = /(?:^|[\s{])(?:patch|file|link|workspace|npm):(?:[./*@]|https?:)/iu
const harnessPackagePattern = /^@deepseek-ai\/|^harness-comfyui$/u
const directDependencyFields = Object.freeze([
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
])
const expectedLoaderPatch = `- insert:
    - id: harness-comfyui
      name: harness-comfyui
      config:
        configurationProfile: !!js process.env.HARNESS_COMFYUI_CONFIGURATION_PROFILE
`

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

function collectSourceFiles(directory, result = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) collectSourceFiles(path, result)
    else if (entry.isFile() && /\.[cm]?tsx?$/u.test(entry.name)) result.push(path)
  }
  return result
}

function isDirectRegisterCall(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false
  const register = node.expression
  if (register.name.text !== 'register' || !ts.isPropertyAccessExpression(register.expression)) return false
  const tools = register.expression
  return tools.name.text === 'tools' && ts.isIdentifier(tools.expression) && tools.expression.text === 'ctx'
}

function isRegistryCall(node) {
  return ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === 'registerProjectTools'
}

function isAbsoluteSpecifier(specifier) {
  return specifier.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(specifier)
}

function isHarnessSourceCheckoutPath(path) {
  const normalized = path.replaceAll('\\', '/')
  if (!/(?:^|\/)src(?:\/|$)/u.test(normalized)) return false
  if (/(?:^|\/)node_modules\/@deepseek-ai\/[^/]+\/src(?:\/|$)/u.test(normalized)) return true
  return normalized.split('/').some(segment => /^(?:harness|harness-|dsh-|deepseek-harness)(?:$|[-_])/u.test(segment))
}

function isHarnessSourceSpecifier(specifier, filePath, root) {
  if (specifier.includes('/src/') || specifier.endsWith('/src')) return true
  if (!specifier.startsWith('.') && !isAbsoluteSpecifier(specifier)) return false
  const resolved = isAbsoluteSpecifier(specifier)
    ? resolve(specifier)
    : resolve(dirname(filePath), specifier)
  const projectSource = `${resolve(root, 'src')}/`
  if (!isAbsoluteSpecifier(specifier) && resolved.startsWith(projectSource)) return false
  if (isHarnessSourceCheckoutPath(resolved)) return true
  if (isAbsoluteSpecifier(specifier)) return resolved.includes('/src/') || resolved.endsWith('/src')
  return false
}

function checkImportSpecifier(specifier, filePath, root, typeOnly) {
  if (!specifier.startsWith('@deepseek-ai/')) {
    if (isHarnessSourceSpecifier(specifier, filePath, root)) {
      throw new Error(`${relative(root, filePath).replaceAll('\\', '/')} imports a Harness source checkout path '${specifier}'`)
    }
    return
  }
  if (isHarnessSourceSpecifier(specifier, filePath, root)) {
    throw new Error(`${relative(root, filePath).replaceAll('\\', '/')} imports a Harness source checkout path '${specifier}'`)
  }
  const allowedKind = allowedHarnessImports.get(specifier)
  if (allowedKind === undefined) {
    throw new Error(`${relative(root, filePath).replaceAll('\\', '/')} imports non-public Harness specifier '${specifier}'`)
  }
  if (allowedKind === 'type-only' && !typeOnly) {
    throw new Error(`${relative(root, filePath).replaceAll('\\', '/')} must import '${specifier}' as a type-only specifier`)
  }
}

function scanImportDeclarations(sourceFile, filePath, root) {
  function check(node, specifier, typeOnly) {
    checkImportSpecifier(specifier, filePath, root, typeOnly)
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      check(node, node.moduleSpecifier.text, node.importClause?.isTypeOnly === true)
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
      check(node, node.moduleSpecifier.text, node.isTypeOnly === true)
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments
      if (argument === undefined || !ts.isStringLiteral(argument)) {
        throw new Error(`${relative(root, filePath).replaceAll('\\', '/')} uses a non-literal dynamic import`)
      }
      check(node, argument.text, false)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`could not read ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sameStructuredValue(actual, expected) {
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return Array.isArray(actual)
      && Array.isArray(expected)
      && actual.length === expected.length
      && actual.every((value, index) => sameStructuredValue(value, expected[index]))
  }
  if (isPlainObject(actual) || isPlainObject(expected)) {
    if (!isPlainObject(actual) || !isPlainObject(expected)) return false
    const actualKeys = Object.keys(actual).sort()
    const expectedKeys = Object.keys(expected).sort()
    return actualKeys.length === expectedKeys.length
      && actualKeys.every((key, index) => key === expectedKeys[index] && sameStructuredValue(actual[key], expected[key]))
  }
  return actual === expected
}

function containsHarnessIdentity(value) {
  return typeof value === 'string' && (value.includes('@deepseek-ai/') || value.includes('harness-comfyui'))
}

function requireNormalizedRelativePath(config, field, path) {
  const value = config[field]
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || isAbsolute(value) || value.includes('\\') || value.startsWith('./') || value.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`${path}.${field} must be a normalized package-relative path`)
  }
  return value
}

function assertManifestDependencyFields(manifest, manifestPath) {
  for (const field of directDependencyFields) {
    const dependencies = manifest[field]
    if (dependencies === undefined) continue
    if (!isPlainObject(dependencies)) throw new Error(`${manifestPath}.${field} must be an object`)
    for (const [packageName, specifier] of Object.entries(dependencies)) {
      const fieldPath = `${manifestPath}.${field}.${packageName}`
      if (packageName === '@deepseek-ai/dsh-client-ui-sidebar' || packageName === '@deepseek-ai/dsh-client-ui-tool') {
        throw new Error(`${fieldPath} is forbidden as a direct project dependency`)
      }
      if (!harnessPackagePattern.test(packageName)) continue
      if (typeof specifier !== 'string') throw new Error(`${fieldPath} must use a public registry version`)
      if (forbiddenSourceProtocols.test(specifier) || /^(?:https?:|git\+)/iu.test(specifier)) {
        throw new Error(`${fieldPath} uses a forbidden Harness source binding '${specifier}'`)
      }
    }
  }
  for (const field of ['overrides', 'resolutions', 'patchedDependencies']) {
    if (!Object.hasOwn(manifest, field)) continue
    if (field === 'patchedDependencies') throw new Error(`${manifestPath}.${field} is forbidden`)
    const values = manifest[field]
    if (!isPlainObject(values)) throw new Error(`${manifestPath}.${field} must be an object`)
    for (const [packageName, specifier] of Object.entries(values)) {
      if (containsHarnessIdentity(packageName) || containsHarnessIdentity(specifier)) {
        throw new Error(`${manifestPath}.${field}.${packageName} targets a Harness package`)
      }
    }
  }
  if (isPlainObject(manifest.pnpm)) {
    if (Object.hasOwn(manifest.pnpm, 'patchedDependencies')) {
      throw new Error(`${manifestPath}.pnpm.patchedDependencies is forbidden`)
    }
    if (isPlainObject(manifest.pnpm.overrides)) {
      for (const [packageName, specifier] of Object.entries(manifest.pnpm.overrides)) {
        if (containsHarnessIdentity(packageName) || containsHarnessIdentity(specifier)) {
          throw new Error(`${manifestPath}.pnpm.overrides.${packageName} targets a Harness package`)
        }
      }
    }
  }
}

function assertPublicPackageMetadata(manifest, manifestPath) {
  const expectedBundle = { patch: './cordis.patch.yml' }
  const expectedClient = { platform: 'web', inject: frozenClientInject }
  if (!sameStructuredValue(manifest.dsh?.bundle, expectedBundle)) {
    throw new Error(`${manifestPath}.dsh.bundle must contain only the frozen public patch configuration`)
  }
  if (!sameStructuredValue(manifest.dsh?.client, expectedClient)) {
    throw new Error(`${manifestPath}.dsh.client must contain only the frozen public client configuration`)
  }
  if (!sameStructuredValue(manifest.dsh, { bundle: expectedBundle, client: expectedClient })) {
    throw new Error(`${manifestPath}.dsh contains an unsupported public configuration field`)
  }
}

function readProductAgentBoundary(path) {
  const config = readJson(path, path)
  if (!isPlainObject(config)) throw new Error(`${path} must be an object`)
  const agentPresetId = config.agentPresetId
  if (typeof agentPresetId !== 'string' || agentPresetId.length === 0 || agentPresetId.includes('/') || agentPresetId.includes('\\')) {
    throw new Error(`${path}.agentPresetId must be a non-empty single path segment`)
  }
  const agentPresetArtifactRelativeRoot = requireNormalizedRelativePath(config, 'agentPresetArtifactRelativeRoot', path)
  const agentPresetInstallRelativeRoot = requireNormalizedRelativePath(config, 'agentPresetInstallRelativeRoot', path)
  const skillRelativeRoot = requireNormalizedRelativePath(config, 'skillRelativeRoot', path)
  const agentPluginExport = config.agentPluginExport
  if (typeof agentPluginExport !== 'string' || !agentPluginExport.startsWith('./') || agentPluginExport.length <= 2 || agentPluginExport.includes('\\') || agentPluginExport.includes('..')) {
    throw new Error(`${path}.agentPluginExport must be a package-relative export without traversal`)
  }
  return {
    agentPresetId,
    agentPresetArtifactRelativeRoot,
    agentPresetInstallRelativeRoot,
    skillRelativeRoot,
    agentPluginExport,
  }
}

function assertAgentPackageMetadata(manifest, manifestPath, productAgent) {
  const exportTarget = `./lib/${productAgent.agentPluginExport.slice(2)}.js`
  const exports = manifest.exports
  if (!isPlainObject(exports) || !isPlainObject(exports[productAgent.agentPluginExport]) || exports[productAgent.agentPluginExport].default !== exportTarget) {
    throw new Error(`${manifestPath}.exports[${productAgent.agentPluginExport}] must default to ${exportTarget}`)
  }
  if (!Array.isArray(manifest.files)) throw new Error(`${manifestPath}.files must be an array`)
  const requiredFiles = [
    exportTarget.slice(2),
    `${productAgent.agentPresetArtifactRelativeRoot}/${productAgent.agentPresetId}/preset.yml`,
    `${productAgent.agentPresetArtifactRelativeRoot}/${productAgent.agentPresetId}/agent.cordis.yml`,
    'config/product-agent.json',
    'profiles/comfyui-workbench/cordis.patch.yml',
    `${productAgent.skillRelativeRoot}/**`,
  ]
  for (const entry of requiredFiles) {
    if (!manifest.files.includes(entry)) throw new Error(`${manifestPath}.files must contain ${entry}`)
  }
}

function readLines(path) {
  try {
    return readFileSync(path, 'utf8').split(/\r?\n/u)
  } catch (error) {
    throw new Error(`could not read ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function assertWorkspaceFile(path) {
  const lines = readLines(path)
  let section
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    if (!line.startsWith(' ') && trimmed.endsWith(':')) {
      section = trimmed.slice(0, -1)
      if (section === 'patchedDependencies') throw new Error(`${path}.${section} is forbidden`)
      continue
    }
    if (section === 'overrides') {
      if (containsHarnessIdentity(trimmed) || forbiddenSourceBinding.test(trimmed) || /(?:git\+|github:|gitlab:|bitbucket:)/iu.test(trimmed)) {
        throw new Error(`${path}.overrides contains a forbidden Harness source binding on line ${index + 1}`)
      }
    }
    if ((forbiddenSourceBinding.test(trimmed) || /(?:git\+|github:|gitlab:|bitbucket:)/iu.test(trimmed)) && (section === 'packages' || containsHarnessIdentity(trimmed))) {
      throw new Error(`${path} contains a forbidden Harness source binding on line ${index + 1}`)
    }
  }
}

function assertLockFile(path) {
  const lines = readLines(path)
  let section
  let inImporter = false
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    if (!line.startsWith(' ') && trimmed.endsWith(':')) {
      section = trimmed.slice(0, -1)
      inImporter = section === 'importers'
      if (section === 'patchedDependencies') throw new Error(`${path}.${section} is forbidden`)
      continue
    }
    if (section === 'overrides' && (containsHarnessIdentity(trimmed) || forbiddenSourceProtocols.test(trimmed))) {
      throw new Error(`${path}.overrides contains a forbidden Harness source binding on line ${index + 1}`)
    }
    if (inImporter) {
      if (trimmed === 'packages:' || trimmed === 'snapshots:') inImporter = false
      if (trimmed.includes('@deepseek-ai/dsh-client-ui-sidebar') || trimmed.includes('@deepseek-ai/dsh-client-ui-tool')) {
        throw new Error(`${path}.importers contains a forbidden direct UI dependency on line ${index + 1}`)
      }
      if (forbiddenSourceBinding.test(trimmed) || /(?:git\+|github:|gitlab:|bitbucket:)/iu.test(trimmed)) {
        throw new Error(`${path}.importers contains a forbidden Harness source binding on line ${index + 1}`)
      }
    }
    if (/^patchedDependencies:/u.test(trimmed)) throw new Error(`${path}.patchedDependencies is forbidden`)
    if (forbiddenSourceBinding.test(trimmed)) {
      throw new Error(`${path} contains a forbidden Harness source binding on line ${index + 1}`)
    }
    if (/\brepo:\s*['"]?(?:https?:|git)/iu.test(trimmed)) {
      throw new Error(`${path} contains a forbidden Harness fork resolution on line ${index + 1}`)
    }
    if (/(?:patch:|git\+|github:|gitlab:|bitbucket:)/iu.test(trimmed)) {
      throw new Error(`${path} contains a forbidden Harness patch or fork on line ${index + 1}`)
    }
  }
}

function assertPatchFile(path, expected) {
  const actual = readFileSync(path, 'utf8').replaceAll('\r\n', '\n')
  if (actual !== expected) throw new Error(`${path} must contain only the frozen public Harness Loader row and configuration seam`)
}

function validateStructuredHarnessBoundary(root) {
  const rootManifestPath = resolve(root, 'package.json')
  const productAgentPath = resolve(root, 'config/product-agent.json')
  const runtimeManifestPath = resolve(root, 'deployment/runtime/package.json')
  const profileManifestPath = resolve(root, 'profiles/comfyui-workbench/package.json')
  const rootManifest = readJson(rootManifestPath, rootManifestPath)
  const productAgent = readProductAgentBoundary(productAgentPath)
  const runtimeManifest = readJson(runtimeManifestPath, runtimeManifestPath)
  assertManifestDependencyFields(rootManifest, 'package.json')
  assertManifestDependencyFields(runtimeManifest, 'deployment/runtime/package.json')
  if (statSync(profileManifestPath, { throwIfNoEntry: false })?.isFile()) {
    assertManifestDependencyFields(readJson(profileManifestPath, profileManifestPath), 'profiles/comfyui-workbench/package.json')
  }
  assertPublicPackageMetadata(rootManifest, 'package.json')
  assertAgentPackageMetadata(rootManifest, 'package.json', productAgent)
  assertPatchFile(resolve(root, 'cordis.patch.yml'), expectedLoaderPatch)
  assertPatchFile(resolve(root, 'profiles/comfyui-workbench/cordis.patch.yml'), `- id: agent-presets\n  config:\n    default: ${productAgent.agentPresetId}\n    includeUserRoot: true\n`)
  assertWorkspaceFile(resolve(root, 'pnpm-workspace.yaml'))
  assertWorkspaceFile(resolve(root, 'deployment/runtime/pnpm-workspace.yaml'))
  assertLockFile(resolve(root, 'pnpm-lock.yaml'))
  assertLockFile(resolve(root, 'deployment/runtime/pnpm-lock.yaml'))
}

function scan(root) {
  const sourceRoot = resolve(root, 'src')
  const sourceFiles = collectSourceFiles(sourceRoot)
  const directRegistrations = []
  const registryCalls = []

  for (const filePath of sourceFiles) {
    const source = readFileSync(filePath, 'utf8')
    const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind)
    const relativePath = relative(root, filePath).replaceAll('\\', '/')
    scanImportDeclarations(sourceFile, filePath, root)
    function visit(node) {
      if (isDirectRegisterCall(node)) directRegistrations.push({ relativePath, node })
      if (isRegistryCall(node)) registryCalls.push({ relativePath, node })
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }

  for (const entry of directRegistrations) {
    if (entry.relativePath !== registryPath) {
      throw new Error(`ctx.tools.register() is only allowed in ${registryPath}; found ${entry.relativePath}`)
    }
  }
  if (directRegistrations.length !== 1) {
    throw new Error(`expected exactly one ctx.tools.register() call in ${registryPath}; found ${directRegistrations.length}`)
  }

  for (const entry of registryCalls) {
    if (entry.relativePath !== pluginPath) {
      throw new Error(`registerProjectTools() is only allowed in ${pluginPath}; found ${entry.relativePath}`)
    }
  }
  if (registryCalls.length !== 1) {
    throw new Error(`expected exactly one registerProjectTools() call in ${pluginPath}; found ${registryCalls.length}`)
  }
  validateStructuredHarnessBoundary(root)
}

export function main(argv = process.argv.slice(2)) {
  const root = parseArguments(argv)
  scan(root)
  process.stdout.write(`Harness project Tool registry boundary is valid: ${root}\n`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main()
  } catch (error) {
    process.stderr.write(`check:harness-boundary: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
