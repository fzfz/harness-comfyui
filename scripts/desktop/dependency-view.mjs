import { randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readlink, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, relative, resolve, sep } from 'node:path'

const markerName = '.desktop-dependency-view.json'

async function readJson(path, label) {
  let source
  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`${label} is unavailable: ${path}`)
    throw error
  }
  try {
    return JSON.parse(source)
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings`)
  }
  return value
}

function loadDefinition(value) {
  if (value?.schemaVersion !== 1) throw new Error('Desktop dependency view schemaVersion must equal 1')
  const mainManifestSections = requireStringArray(value.mainManifestSections, 'Desktop dependency view mainManifestSections')
  const candidateManifestSection = value.candidateManifestSection
  if (typeof candidateManifestSection !== 'string' || candidateManifestSection.length === 0) {
    throw new Error('Desktop dependency view candidateManifestSection must be a non-empty string')
  }
  const candidateDevelopmentPackages = requireStringArray(value.candidateDevelopmentPackages,
    'Desktop dependency view candidateDevelopmentPackages')
  if (value.candidateExecutables === null || typeof value.candidateExecutables !== 'object' || Array.isArray(value.candidateExecutables)) {
    throw new Error('Desktop dependency view candidateExecutables must be an object')
  }
  const candidateExecutables = Object.entries(value.candidateExecutables).map(([name, executable]) => {
    if (name.length === 0 || executable === null || typeof executable !== 'object' || Array.isArray(executable)
      || typeof executable.package !== 'string' || executable.package.length === 0
      || typeof executable.relativePath !== 'string' || executable.relativePath.length === 0) {
      throw new Error(`Desktop dependency view candidate executable ${name || '<empty>'} is invalid`)
    }
    return { name, package: executable.package, relativePath: executable.relativePath }
  })
  return { mainManifestSections, candidateManifestSection, candidateDevelopmentPackages, candidateExecutables }
}

function collectManifestPackages(manifest, sections, label) {
  const packages = new Map()
  for (const section of sections) {
    const values = manifest[section]
    if (values === null || typeof values !== 'object' || Array.isArray(values)) {
      throw new Error(`${label}.${section} must be an object`)
    }
    for (const [name, range] of Object.entries(values)) {
      if (typeof range !== 'string' || range.length === 0) {
        throw new Error(`${label}.${section}.${name} must be a non-empty version range`)
      }
      packages.set(name, range)
    }
  }
  return packages
}

function isInside(path, root) {
  const value = relative(root, path)
  return value === '' || (!value.startsWith(`..${sep}`) && value !== '..' && !value.startsWith(sep))
}

function resolveInstalledPackage(requireFromWorkspace, nodeModulesRoot, name, label, useWorkspaceEntry) {
  if (useWorkspaceEntry === 'direct') {
    const manifestPath = resolve(nodeModulesRoot, name, 'package.json')
    return { manifestPath, directory: resolve(nodeModulesRoot, name) }
  }
  let resolvedManifestPath
  try {
    resolvedManifestPath = requireFromWorkspace.resolve(`${name}/package.json`)
  } catch (error) {
    throw new Error(`${label} ${name} is not installed in ${nodeModulesRoot}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (useWorkspaceEntry) {
    const manifestPath = resolve(nodeModulesRoot, name, 'package.json')
    return { manifestPath, directory: resolve(nodeModulesRoot, name) }
  }
  const manifestPath = resolvedManifestPath
  if (!isInside(manifestPath, nodeModulesRoot)) {
    throw new Error(`${label} ${name} resolved outside ${nodeModulesRoot}: ${manifestPath}`)
  }
  return { manifestPath, directory: dirname(manifestPath) }
}

async function validateInstalledPackage({ name, range, requireFromWorkspace, nodeModulesRoot, label, versionSatisfies,
  useWorkspaceEntry = false }) {
  const resolved = resolveInstalledPackage(requireFromWorkspace, nodeModulesRoot, name, label, useWorkspaceEntry)
  let packageDirectory
  try {
    packageDirectory = await stat(resolved.directory)
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`${label} ${name} is not installed in ${nodeModulesRoot}`)
    throw error
  }
  if (!packageDirectory.isDirectory()) throw new Error(`${label} ${name} must resolve to a directory: ${resolved.directory}`)
  const manifest = await readJson(resolved.manifestPath, `${label} ${name} package manifest`)
  if (manifest.name !== name) {
    throw new Error(`${label} ${name} resolved package name ${JSON.stringify(manifest.name)} does not match`)
  }
  if (typeof manifest.version !== 'string' || !versionSatisfies(manifest.version, range)) {
    throw new Error(`${label} ${name} version ${JSON.stringify(manifest.version)} does not satisfy ${range}`)
  }
  return { name, range, version: manifest.version, source: resolved.directory }
}

async function loadVersionSatisfies(desktopWorkspace) {
  const requireFromCandidate = createRequire(resolve(desktopWorkspace, 'package.json'))
  let semver
  try {
    semver = requireFromCandidate('semver')
  } catch (error) {
    throw new Error(`Candidate Desktop semver dependency is unavailable: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (typeof semver?.satisfies !== 'function') throw new Error('Candidate Desktop semver dependency does not export satisfies()')
  return (version, range) => semver.satisfies(version, range, { includePrerelease: true })
}

async function packageExecutables(packages, label) {
  const result = []
  for (const item of packages) {
    const manifest = await readJson(resolve(item.source, 'package.json'), `${label} ${item.name} package manifest`)
    const entries = typeof manifest.bin === 'string'
      ? [[item.name.includes('/') ? item.name.slice(item.name.lastIndexOf('/') + 1) : item.name, manifest.bin]]
      : Object.entries(manifest.bin ?? {})
    for (const [name, relativePath] of entries) {
      if (name.length === 0 || typeof relativePath !== 'string' || relativePath.length === 0) {
        throw new Error(`${label} ${item.name} has an invalid package.json bin entry`)
      }
      const source = resolve(item.source, relativePath)
      if (!isInside(source, item.source)) throw new Error(`${label} executable ${name} leaves package ${item.name}`)
      let value
      try {
        value = await stat(source)
      } catch (error) {
        if (error?.code === 'ENOENT') throw new Error(`${label} executable ${name} is unavailable: ${source}`)
        throw error
      }
      if (!value.isFile()) throw new Error(`${label} executable ${name} must be a file: ${source}`)
      result.push({ name, package: item.name, source })
    }
  }
  return result.sort((left, right) => left.name.localeCompare(right.name))
}

function markerFor({ mainCheckoutRoot, desktopWorkspace, mainPackages, candidatePackages, mainExecutables, candidateExecutables }) {
  return {
    schemaVersion: 1,
    mainCheckoutRoot,
    desktopWorkspace,
    mainPackages: mainPackages.map(({ name, version }) => ({ name, version })),
    candidatePackages: candidatePackages.map(({ name, version }) => ({ name, version })),
    mainExecutables: mainExecutables.map(({ name }) => name),
    candidateExecutables: candidateExecutables.map(({ name, package: packageName, version }) => ({ name, package: packageName, version })),
  }
}

async function linkPlanMatches(nodeModulesDir, marker, links) {
  let actualMarker
  try {
    actualMarker = JSON.parse(await readFile(resolve(nodeModulesDir, markerName), 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return false
    throw error
  }
  if (JSON.stringify(actualMarker) !== JSON.stringify(marker)) return false
  for (const { relativePath, source } of links) {
    const target = resolve(nodeModulesDir, relativePath)
    try {
      const value = await lstat(target)
      if (!value.isSymbolicLink()) return false
      if (resolve(dirname(target), await readlink(target)) !== source) return false
    } catch (error) {
      if (error?.code === 'ENOENT') return false
      throw error
    }
  }
  return true
}

async function createView(directory, marker, links) {
  await mkdir(directory, { recursive: true })
  for (const { relativePath, source, type } of links) {
    const target = resolve(directory, relativePath)
    await mkdir(dirname(target), { recursive: true })
    await symlink(source, target, type)
  }
  await writeFile(resolve(directory, markerName), `${JSON.stringify(marker, null, 2)}\n`)
}

async function replaceOwnedView(nodeModulesDir, mainNodeModulesDir, stagingDirectory) {
  let existing
  try {
    existing = await lstat(nodeModulesDir)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  if (existing !== undefined) {
    if (existing.isSymbolicLink()) {
      const linked = resolve(dirname(nodeModulesDir), await readlink(nodeModulesDir))
      if (linked !== mainNodeModulesDir) {
        throw new Error(`Existing node_modules link does not point to the main checkout: ${nodeModulesDir}`)
      }
    } else if (existing.isDirectory()) {
      try {
        await stat(resolve(nodeModulesDir, markerName))
      } catch (error) {
        if (error?.code === 'ENOENT') throw new Error(`Existing node_modules directory is not an owned Desktop dependency view: ${nodeModulesDir}`)
        throw error
      }
    } else {
      throw new Error(`Existing node_modules path cannot become a Desktop dependency view: ${nodeModulesDir}`)
    }
  }

  const backup = resolve(dirname(nodeModulesDir), `.${basename(nodeModulesDir)}.desktop-dependency-view-backup-${randomUUID()}`)
  if (existing !== undefined) await rename(nodeModulesDir, backup)
  try {
    await rename(stagingDirectory, nodeModulesDir)
  } catch (error) {
    if (existing !== undefined) await rename(backup, nodeModulesDir)
    throw error
  }
  if (existing !== undefined) await rm(backup, { recursive: true, force: true })
}

export async function prepareDesktopDependencyView(options) {
  if (options === null || typeof options !== 'object') throw new Error('Desktop dependency view options are required')
  const repositoryRoot = resolve(options.repositoryRoot)
  const mainCheckoutRoot = resolve(options.mainCheckoutRoot)
  const desktopWorkspace = resolve(options.desktopWorkspace)
  const definitionPath = resolve(options.definitionPath ?? resolve(repositoryRoot, 'config/desktop-harness-development.json'))
  const rootManifestPath = resolve(options.rootManifestPath ?? resolve(repositoryRoot, 'package.json'))
  const mainNodeModulesDir = resolve(options.mainNodeModulesDir ?? resolve(mainCheckoutRoot, 'node_modules'))
  const nodeModulesDir = resolve(options.nodeModulesDir ?? resolve(repositoryRoot, 'node_modules'))
  if (isInside(nodeModulesDir, mainCheckoutRoot)) {
    throw new Error('Desktop dependency view must stay outside the main checkout')
  }

  const [definitionValue, rootManifest, candidateManifest] = await Promise.all([
    readJson(definitionPath, 'Desktop dependency view definition'),
    readJson(rootManifestPath, 'Harness root package manifest'),
    readJson(resolve(desktopWorkspace, 'package.json'), 'Candidate Desktop workspace package manifest'),
  ])
  const definition = loadDefinition(definitionValue)
  const versionSatisfies = options.versionSatisfies ?? await loadVersionSatisfies(desktopWorkspace)
  const mainRanges = collectManifestPackages(rootManifest, definition.mainManifestSections, 'Harness root package manifest')
  const candidateRanges = collectManifestPackages(rootManifest, [definition.candidateManifestSection], 'Harness root package manifest')
  const candidateDeclarationSections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
  const candidateDeclarations = collectManifestPackages(candidateManifest,
    candidateDeclarationSections.filter(section => candidateManifest[section] !== undefined), 'Candidate Desktop workspace package manifest')
  for (const name of definition.candidateDevelopmentPackages) {
    if (candidateRanges.has(name)) continue
    const range = candidateDeclarations.get(name)
    if (range === undefined) throw new Error(`Candidate Desktop workspace does not declare development package ${name}`)
    candidateRanges.set(name, range)
  }
  for (const name of candidateRanges.keys()) mainRanges.delete(name)

  const requireFromMain = createRequire(resolve(mainCheckoutRoot, 'package.json'))
  const requireFromCandidate = createRequire(resolve(desktopWorkspace, 'package.json'))
  const mainPackages = await Promise.all([...mainRanges].sort(([left], [right]) => left.localeCompare(right)).map(([name, range]) =>
    validateInstalledPackage({ name, range, requireFromWorkspace: requireFromMain, nodeModulesRoot: mainNodeModulesDir,
      label: 'Main checkout dependency', versionSatisfies, useWorkspaceEntry: 'direct' })))
  const candidatePackages = await Promise.all([...candidateRanges].sort(([left], [right]) => left.localeCompare(right)).map(([name, range]) =>
    validateInstalledPackage({ name, range, requireFromWorkspace: requireFromCandidate,
      nodeModulesRoot: resolve(desktopWorkspace, 'node_modules'), label: 'Candidate Desktop peer dependency', versionSatisfies,
      useWorkspaceEntry: true })))
  const mainExecutables = await packageExecutables(mainPackages, 'Main checkout dependency')

  const candidateExecutables = await Promise.all(definition.candidateExecutables.map(async executable => {
    const range = candidateDeclarations.get(executable.package)
    if (range === undefined) {
      throw new Error(`Candidate Desktop workspace does not declare executable package ${executable.package}`)
    }
    const installed = await validateInstalledPackage({ name: executable.package, range, requireFromWorkspace: requireFromCandidate,
      nodeModulesRoot: resolve(desktopWorkspace, 'node_modules'), label: 'Candidate Desktop executable package', versionSatisfies,
      useWorkspaceEntry: true })
    const source = resolve(installed.source, executable.relativePath)
    if (!isInside(source, installed.source)) {
      throw new Error(`Candidate Desktop executable ${executable.name} leaves package ${executable.package}`)
    }
    let value
    try {
      value = await stat(source)
    } catch (error) {
      if (error?.code === 'ENOENT') throw new Error(`Candidate Desktop executable ${executable.name} is unavailable: ${source}`)
      throw error
    }
    if (!value.isFile()) throw new Error(`Candidate Desktop executable ${executable.name} must be a file: ${source}`)
    return { ...executable, version: installed.version, source }
  }))

  const linksByTarget = new Map()
  for (const item of mainPackages) linksByTarget.set(item.name, { relativePath: item.name, source: item.source, type: 'dir' })
  for (const item of candidatePackages) linksByTarget.set(item.name, { relativePath: item.name, source: item.source, type: 'dir' })
  for (const item of mainExecutables) linksByTarget.set(`.bin/${item.name}`, {
    relativePath: `.bin/${item.name}`, source: item.source, type: 'file',
  })
  for (const item of candidateExecutables) linksByTarget.set(`.bin/${item.name}`, {
    relativePath: `.bin/${item.name}`, source: item.source, type: 'file',
  })
  const links = [...linksByTarget.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  const marker = markerFor({ mainCheckoutRoot, desktopWorkspace, mainPackages, candidatePackages,
    mainExecutables, candidateExecutables })
  if (await linkPlanMatches(nodeModulesDir, marker, links)) {
    return { nodeModulesDir, mainCheckoutRoot, desktopWorkspace, mainPackages, candidatePackages,
      mainExecutables, candidateExecutables, changed: false }
  }

  await mkdir(dirname(nodeModulesDir), { recursive: true })
  const stagingDirectory = await mkdtemp(resolve(dirname(nodeModulesDir), `.${basename(nodeModulesDir)}.desktop-dependency-view-staging-`))
  try {
    await createView(stagingDirectory, marker, links)
    await replaceOwnedView(nodeModulesDir, mainNodeModulesDir, stagingDirectory)
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true })
    throw error
  }
  return { nodeModulesDir, mainCheckoutRoot, desktopWorkspace, mainPackages, candidatePackages,
    mainExecutables, candidateExecutables, changed: true }
}
