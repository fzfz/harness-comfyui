import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { createConnection } from 'node:net'
import { spawn } from 'node:child_process'
import { access, cp, mkdir, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

import { isRunning, terminateChild } from './process-lifecycle.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const defaultManifestPath = resolve(repositoryRoot, '.release/quality/artifact.json')
const profileName = 'comfyui-workbench'
const configuration = 'release-smoke'
const profileBundles = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  'harness-comfyui',
]
const trackedChildren = new Map()
const terminationPromises = new Map()
const cancellation = {
  requested: false,
  signal: undefined,
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => requestCancellation(signal))
}

function trackChild(child, { processGroup = false } = {}) {
  trackedChildren.set(child, { processGroup })
  child.once('close', () => trackedChildren.delete(child))
  return child
}

function stopTrackedChild(child, signal) {
  const existing = terminationPromises.get(child)
  if (existing !== undefined) return existing
  const metadata = trackedChildren.get(child) ?? { processGroup: false }
  const termination = terminateChild(child, {
    processGroup: metadata.processGroup,
    gracefulSignal: signal,
    gracefulTimeoutMs: 1_000,
    forceTimeoutMs: 5_000,
  }).finally(() => terminationPromises.delete(child))
  terminationPromises.set(child, termination)
  return termination
}

function requestCancellation(signal) {
  if (cancellation.requested) return
  cancellation.requested = true
  cancellation.signal = signal
  for (const child of trackedChildren.keys()) {
    void stopTrackedChild(child, signal).catch(() => undefined)
  }
}

function throwIfCancelled() {
  if (cancellation.requested) throw new Error(`release-smoke cancelled by ${cancellation.signal}`)
}

function parseArguments(argv) {
  let artifactManifestPath = defaultManifestPath
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag !== '--artifact-manifest') throw new Error(`unknown argument ${flag}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--') || value.length === 0) throw new Error('--artifact-manifest requires a non-empty value')
    artifactManifestPath = resolve(value)
    index += 1
  }
  return { artifactManifestPath }
}

function requireString(value, property) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`artifact manifest ${property} must be a non-empty string`)
  return value
}

async function hashFile(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', () => resolveHash(hash.digest('hex')))
  })
}

async function readArtifact(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error(`artifact manifest ${manifestPath} must be an object`)
  const artifact = {
    tarballPath: resolve(requireString(manifest.tarballPath, 'tarballPath')),
    filename: requireString(manifest.filename, 'filename'),
    version: requireString(manifest.version, 'version'),
    commit: requireString(manifest.commit, 'commit'),
    byteLength: manifest.byteLength,
    sha256: requireString(manifest.sha256, 'sha256'),
  }
  if (!Number.isSafeInteger(artifact.byteLength) || artifact.byteLength <= 0) throw new Error('artifact manifest byteLength must be a positive integer')
  const [file, digest] = await Promise.all([stat(artifact.tarballPath), hashFile(artifact.tarballPath)])
  if (!file.isFile()) throw new Error(`artifact tarball is not a file: ${artifact.tarballPath}`)
  if (file.size !== artifact.byteLength) throw new Error(`artifact byteLength changed: ${file.size}`)
  if (digest !== artifact.sha256) throw new Error(`artifact sha256 changed: ${digest}`)
  return artifact
}

function assertIsolatedCwd(cwd, isolatedRoot) {
  const root = resolve(isolatedRoot)
  const current = resolve(cwd)
  if (current !== root && !current.startsWith(`${root}/`)) throw new Error(`release-smoke command cwd escaped isolated root: ${current}`)
}

function runCommand(command, args, options) {
  assertIsolatedCwd(options.cwd, options.isolatedRoot)
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    trackChild(child)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', error => {
      reject(error)
    })
    child.once('close', (code, signal) => {
      resolveResult({ code, signal, stdout, stderr })
    })
  })
}

async function extractArtifact(artifact, runtimeRoot, smokeRoot) {
  const listing = await runCommand('tar', ['-tzf', artifact.tarballPath], { cwd: runtimeRoot, isolatedRoot: smokeRoot, env: process.env })
  if (listing.code !== 0) throw new Error(`could not inspect artifact tarball: ${listing.stderr || listing.stdout}`)
  for (const entry of listing.stdout.split('\n').map(value => value.replace(/^package\//, '')).filter(Boolean)) {
    if (entry.startsWith('/') || entry.split('/').includes('..') || /(^|\/)(src|prototype|tests)(\/|$)/.test(entry)) {
      throw new Error(`release artifact contains a forbidden runtime path: ${entry}`)
    }
  }
  const extracted = await runCommand('tar', ['-xzf', artifact.tarballPath, '-C', runtimeRoot, '--strip-components=1'], { cwd: runtimeRoot, isolatedRoot: smokeRoot, env: process.env })
  if (extracted.code !== 0) throw new Error(`could not extract artifact tarball: ${extracted.stderr || extracted.stdout}`)
}

function runtimeEnvironment(profileHome) {
  return {
    ...process.env,
    DSH_HOME: profileHome,
    HARNESS_COMFYUI_DATA_DIR: join(profileHome, 'data'),
    HARNESS_COMFYUI_RUN_REPOSITORY_FILE: join(profileHome, 'runs.sqlite'),
    HARNESS_COMFYUI_RUN_DIRECTORY: join(profileHome, 'runs'),
    HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY: join(profileHome, 'media'),
    HARNESS_COMFYUI_LOG_DIRECTORY: join(profileHome, 'logs'),
    HARNESS_COMFYUI_CATALOG_CLI_PATH: 'node',
    HARNESS_COMFYUI_SOURCE_CLI_PATH: 'node',
  }
}

async function waitUntil(probe, description, timeoutMs = 30000, { respectCancellation = true } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (respectCancellation) throwIfCancelled()
    const result = await probe()
    if (result !== undefined) return result
    await delay(100)
  }
  throw new Error(`timed out waiting for ${description}`)
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2000)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function parseBootGraph(html) {
  const match = html.match(/window\.__DSH_BOOT__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)
  if (!match?.[1]) throw new Error('release smoke HTML omitted window.__DSH_BOOT__')
  const graph = JSON.parse(match[1])
  if (typeof graph.rev !== 'string' || !Array.isArray(graph.entries)) throw new Error('release smoke boot graph has an invalid shape')
  return graph
}

async function readRuntimePackageVersion(runtimeRoot, packageName, developmentNodeModules) {
  const manifestPath = resolve(runtimeRoot, 'node_modules', packageName, 'package.json')
  const manifestRealpath = await realpath(manifestPath)
  if (manifestRealpath === developmentNodeModules || manifestRealpath.startsWith(`${developmentNodeModules}/`)) {
    throw new Error(`release runtime resolved ${packageName} through the development checkout: ${manifestRealpath}`)
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  return requireString(manifest.version, `${packageName}.version`)
}

function parseHostLoaderRow(patch) {
  const row = patch.match(/- id:\s*(harness-comfyui)\s+name:\s*(harness-comfyui)\s+config:\s+configurationProfile:\s*([^\n]+)/)
  if (!row?.[1] || !row[2] || !row[3]) throw new Error('release artifact omitted the harness Host Loader row')
  return {
    id: row[1],
    name: row[2],
    configurationExpression: row[3],
  }
}

async function assertPortReleased(port) {
  return waitUntil(async () => await new Promise(result => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const timeout = setTimeout(() => {
      socket.destroy()
      result(undefined)
    }, 250)
    socket.once('connect', () => {
      clearTimeout(timeout)
      socket.destroy()
      result(false)
    })
    socket.once('error', () => {
      clearTimeout(timeout)
      result(true)
    })
  }), 'release-smoke port release', 5000, { respectCancellation: false })
}

async function runSmoke(artifact) {
  const smokeRoot = await mkdtemp(join(tmpdir(), 'harness-comfyui-release-smoke-'))
  const runtimeRoot = join(smokeRoot, 'dependency-install')
  const profileHome = join(smokeRoot, 'dsh-home')
  let startChild
  let port
  let processExited = false
  let portReleased = false
  let result
  let cleanupError
  try {
    await mkdir(runtimeRoot)
    throwIfCancelled()
    const developmentNodeModules = await realpath(resolve(repositoryRoot, 'node_modules'))
    await cp(resolve(repositoryRoot, 'node_modules'), join(runtimeRoot, 'node_modules'), {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
    })
    let isolatedNodeModules
    try {
      isolatedNodeModules = await realpath(join(runtimeRoot, 'node_modules'))
    } catch (error) {
      throw new Error('isolated dependency materialization did not create node_modules', { cause: error })
    }
    if (isolatedNodeModules === developmentNodeModules || isolatedNodeModules.startsWith(`${developmentNodeModules}/`)) {
      throw new Error(`release runtime resolved node_modules through the development checkout: ${isolatedNodeModules}`)
    }
    await extractArtifact(artifact, runtimeRoot, smokeRoot)
    throwIfCancelled()
    for (const forbidden of ['src', 'prototype', 'tests']) {
      try {
        await access(join(runtimeRoot, forbidden))
        throw new Error(`release runtime unexpectedly contains ${forbidden}`)
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
    const environment = runtimeEnvironment(profileHome)
    const materialize = await runCommand(process.execPath, [join(runtimeRoot, 'scripts/profile/materialize.mjs'), '--configuration', configuration, '--dsh-home', profileHome, '--package-spec', artifact.tarballPath], {
      cwd: runtimeRoot,
      isolatedRoot: smokeRoot,
      env: environment,
    })
    if (materialize.code !== 0) throw new Error(`release artifact materialize failed: ${materialize.stderr || materialize.stdout}`)
    throwIfCancelled()
    const profileDirectory = join(profileHome, 'profiles', profileName)
    const profileManifest = JSON.parse(await readFile(join(profileDirectory, 'package.json'), 'utf8'))
    if (profileManifest.dependencies?.['harness-comfyui'] !== `file:${artifact.tarballPath}`) throw new Error('release artifact profile dependency changed')
    if (JSON.stringify(profileManifest.dsh?.profile?.bundles) !== JSON.stringify(profileBundles)) throw new Error('release artifact Host Loader bundle order changed')
    const hostLoaderRow = parseHostLoaderRow(await readFile(join(runtimeRoot, 'cordis.patch.yml'), 'utf8'))
    const harnessVersion = await readRuntimePackageVersion(profileDirectory, 'harness-comfyui', developmentNodeModules)
    const startOutput = { value: '', error: '' }
    assertIsolatedCwd(runtimeRoot, smokeRoot)
    startChild = trackChild(spawn(process.execPath, [join(runtimeRoot, 'scripts/profile/start.mjs'), '--configuration', configuration, '--dsh-home', profileHome, '--host', '127.0.0.1', '--port', '0'], {
      cwd: runtimeRoot,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      detached: process.platform !== 'win32',
    }), { processGroup: process.platform !== 'win32' })
    startChild.stdout.on('data', chunk => { startOutput.value += String(chunk) })
    startChild.stderr.on('data', chunk => { startOutput.error += String(chunk) })
    port = await waitUntil(async () => {
      const match = startOutput.value.match(/dsh web: http:\/\/127\.0\.0\.1:(\d+)/)
      if (!match?.[1]) {
        if (startChild.exitCode !== null) throw new Error(`release artifact start exited before readiness: ${startOutput.error}`)
        return undefined
      }
      const candidate = Number(match[1])
      const response = await fetchWithTimeout(`http://127.0.0.1:${candidate}/`)
      if (!response.ok) return undefined
      parseBootGraph(await response.text())
      return candidate
    }, 'release artifact web readiness')
    const html = await (await fetchWithTimeout(`http://127.0.0.1:${port}/`)).text()
    const graph = parseBootGraph(html)
    const bootEntries = graph.entries.map(entry => entry.id)
    for (const required of ['@deepseek-ai/dsh-client-ui-layout', '@deepseek-ai/dsh-client-ui-conversation', 'harness-comfyui']) {
      if (!bootEntries.includes(required)) throw new Error(`release artifact client manifest omitted ${required}`)
    }
    const harnessEntry = graph.entries.find(entry => entry.id === 'harness-comfyui')
    const clientResponse = await fetchWithTimeout(`http://127.0.0.1:${port}${harnessEntry.url}`)
    if (!clientResponse.ok || !(await clientResponse.text()).includes('__ModuleLoader__')) throw new Error('release artifact Client module did not load')
    const apiResponse = await fetchWithTimeout(`http://127.0.0.1:${port}/api/pluginStatus/get`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'release-smoke', method: 'pluginStatus/get', payload: { args: {} } }),
    })
    const wire = JSON.parse(await apiResponse.text())
    if (!apiResponse.ok || wire.type !== 'server-response' || wire.result?.ok !== true) throw new Error('release artifact pluginStatus bridge failed')
    const runtimeVersions = {
      cliDsh: await readRuntimePackageVersion(runtimeRoot, '@deepseek-ai/dsh', developmentNodeModules),
      dshBase: await readRuntimePackageVersion(runtimeRoot, '@deepseek-ai/dsh-base', developmentNodeModules),
      dshWebApp: await readRuntimePackageVersion(runtimeRoot, '@deepseek-ai/dsh-web-app', developmentNodeModules),
      harnessComfyui: harnessVersion,
    }
    result = { artifact: { commit: artifact.commit, sha256: artifact.sha256, version: artifact.version }, configuration, bootEntries, hostLoaderRow, runtimeVersions }
  } finally {
    const stopSignal = cancellation.signal ?? 'SIGTERM'
    for (const child of trackedChildren.keys()) {
      try {
        await stopTrackedChild(child, stopSignal)
      } catch (error) {
        cleanupError ??= error
      }
    }
    if (startChild) {
      processExited = !isRunning(startChild)
      if (port !== undefined) {
        try {
          portReleased = await assertPortReleased(port)
        } catch (error) {
          cleanupError ??= error
        }
      }
    }
    try {
      await rm(smokeRoot, { recursive: true, force: true })
    } catch (error) {
      cleanupError ??= error
    }
    let directoryRemoved = false
    try {
      await access(smokeRoot)
    } catch (error) {
      if (error?.code !== 'ENOENT') cleanupError ??= error
      directoryRemoved = true
    }
    result = result === undefined ? undefined : { ...result, cleanup: { processExited, portReleased, directoryRemoved } }
  }
  if (cleanupError !== undefined) throw cleanupError
  throwIfCancelled()
  if (result === undefined) throw new Error('release-smoke completed without evidence')
  return result
}

async function main(argv) {
  const options = parseArguments(argv)
  const artifact = await readArtifact(options.artifactManifestPath)
  let evidence
  try {
    evidence = await runSmoke(artifact)
  } catch (error) {
    throw new Error(`release-smoke failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  process.stdout.write(`${JSON.stringify(evidence)}\n`)
}

main(process.argv.slice(2)).catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
