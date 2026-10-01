import { spawn } from 'node:child_process'
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parsePluginPackageConfig, validatePluginPackagePath } from '../../config/plugin-package-schema.mjs'

const packageConfigRelativePath = 'config/plugin-package.json'

function isWithin(root, target) {
  const pathFromRoot = relative(root, target)
  return pathFromRoot === ''
    || (!isAbsolute(pathFromRoot) && pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`))
}

async function assertNoLinks(root, path) {
  const resourcePath = relative(root, path).split(sep).join('/')
  validatePluginPackagePath(resourcePath)
  if (resourcePath.endsWith('.map')) {
    throw new Error(`Plugin package contains a source map at ${resourcePath}; remove stale build outputs, rebuild, and pack again`)
  }
  const info = await lstat(path)
  if (info.isSymbolicLink()) throw new Error(`Plugin package resource must not be a symbolic link: ${relative(root, path)}`)
  if (!info.isFile() && !info.isDirectory()) {
    throw new Error(`Plugin package resource must be a regular file or directory: ${relative(root, path)}`)
  }
  if (info.isDirectory()) {
    for (const name of await readdir(path)) await assertNoLinks(root, resolve(path, name))
  }
}

async function sourcePath(root, relativePath) {
  const safePath = validatePluginPackagePath(relativePath)
  const rootRealPath = await realpath(root)
  const path = resolve(rootRealPath, ...safePath.split('/'))
  if (!isWithin(rootRealPath, path)) throw new Error(`Plugin package resource escapes its root: ${relativePath}`)
  let resolvedPath
  try {
    resolvedPath = await realpath(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return { missing: safePath }
    throw error
  }
  if (!isWithin(rootRealPath, resolvedPath)) {
    throw new Error(`Plugin package resource resolves outside its root: ${relativePath}`)
  }
  let current = rootRealPath
  for (const segment of safePath.split('/')) {
    current = resolve(current, segment)
    if ((await lstat(current)).isSymbolicLink()) {
      throw new Error(`Plugin package resource path must not cross a symbolic link: ${relativePath}`)
    }
  }
  await assertNoLinks(rootRealPath, path)
  return { path, relativePath: safePath }
}

function stripTypeExports(value) {
  if (Array.isArray(value)) return value.map(stripTypeExports)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'types')
    .map(([key, child]) => [key, stripTypeExports(child)]))
}

function collectPathTargets(value, target = []) {
  if (typeof value === 'string') {
    if (value.startsWith('./')) target.push(value)
    return target
  }
  if (Array.isArray(value)) {
    for (const child of value) collectPathTargets(child, target)
    return target
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) collectPathTargets(child, target)
  }
  return target
}

async function validateStagedReferences(stageRoot, manifest) {
  const references = [
    ...collectPathTargets(manifest.exports),
    manifest.dsh?.bundle?.patch,
  ].filter(value => typeof value === 'string' && value.startsWith('./'))
  const missing = []
  for (const reference of references) {
    const target = resolve(stageRoot, reference.slice(2))
    if (!isWithin(stageRoot, target)) throw new Error(`Plugin package reference escapes package root: ${reference}`)
    try {
      const resolvedTarget = await realpath(target)
      if (!isWithin(stageRoot, resolvedTarget)) throw new Error(`Plugin package reference resolves outside package root: ${reference}`)
      await stat(resolvedTarget)
    } catch (error) {
      if (error?.code === 'ENOENT') missing.push(reference)
      else throw error
    }
  }
  if (missing.length > 0) {
    throw new Error(`Plugin package manifest references missing resources:\n${missing.map(path => `- ${path}`).join('\n')}`)
  }
}

async function readSourceManifest(repositoryRoot, packageName) {
  const manifestPath = resolve(repositoryRoot, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.name !== packageName) {
    throw new Error(`Plugin package config names ${packageName}, but package.json names ${manifest.name}`)
  }
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error('Plugin package.json must declare a version')
  }
  if (!manifest.dependencies?.sharp || manifest.dependencies.sharp !== '0.35.4') {
    throw new Error('Plugin package.json must retain the approved sharp 0.35.4 runtime dependency')
  }

  const packaged = {
    name: manifest.name,
    version: manifest.version,
    type: 'module',
    engines: manifest.engines,
    dependencies: manifest.dependencies,
    peerDependencies: manifest.peerDependencies,
    peerDependenciesMeta: manifest.peerDependenciesMeta,
    dsh: manifest.dsh,
    exports: stripTypeExports(manifest.exports),
  }
  return packaged
}

function runPnpmPack(stageRoot, outputFile) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('pnpm', ['pack', '--out', outputFile], {
      cwd: stageRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
    child.once('error', error => rejectPromise(new Error(`Cannot run pnpm pack: ${error.message}`)))
    child.once('close', code => {
      if (code === 0) resolvePromise(stdout.trim())
      else rejectPromise(new Error(`pnpm pack failed with exit code ${code}: ${stderr.trim() || stdout.trim()}`))
    })
  })
}

export async function packPlugin({ repositoryRoot, artifactRoot, outputFile } = {}) {
  const sourceRoot = resolve(repositoryRoot ?? fileURLToPath(new URL('../..', import.meta.url)))
  const builtRoot = resolve(artifactRoot ?? sourceRoot)
  const configPath = resolve(sourceRoot, packageConfigRelativePath)
  const packageConfig = parsePluginPackageConfig(JSON.parse(await readFile(configPath, 'utf8')))
  const sourceManifest = await readSourceManifest(sourceRoot, packageConfig.packageName)
  const stagedFileList = [...packageConfig.files, ...packageConfig.artifacts]
  const resolvedResources = []
  const missing = []

  for (const resource of packageConfig.files) {
    const checked = await sourcePath(sourceRoot, resource)
    if (checked.missing) missing.push(checked.missing)
    else resolvedResources.push(checked)
  }
  for (const resource of packageConfig.artifacts) {
    const checked = await sourcePath(builtRoot, resource)
    if (checked.missing) missing.push(checked.missing)
    else resolvedResources.push(checked)
  }
  if (missing.length > 0) {
    throw new Error(`Plugin package is missing configured resources:\n${missing.map(path => `- ${path}`).join('\n')}`)
  }

  const stagingDirectory = await mkdtemp(resolve(tmpdir(), 'harness-plugin-package-'))
  const stageRoot = resolve(stagingDirectory, 'package')
  const requestedOutput = resolve(outputFile ?? resolve(sourceRoot, '.local/plugin-packages', `${packageConfig.packageName}-${sourceManifest.version}.tgz`))
  try {
    await mkdir(stageRoot, { recursive: true })
    for (const resource of resolvedResources) {
      const destination = resolve(stageRoot, resource.relativePath)
      await mkdir(dirname(destination), { recursive: true })
      await cp(resource.path, destination, { recursive: true, errorOnExist: true, force: false })
    }
    const stagedManifest = { ...sourceManifest, files: stagedFileList }
    await writeFile(resolve(stageRoot, 'package.json'), `${JSON.stringify(stagedManifest, null, 2)}\n`, 'utf8')
    await validateStagedReferences(await realpath(stageRoot), stagedManifest)
    await mkdir(dirname(requestedOutput), { recursive: true })
    await runPnpmPack(stageRoot, requestedOutput)
    return { archivePath: requestedOutput, packageName: stagedManifest.name, version: stagedManifest.version }
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true })
  }
}
