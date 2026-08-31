import { randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { afterEach, describe, expect, it } from 'vitest'

import { parseArguments, runSourceProductionCommand } from '../../scripts/production/cli.mjs'
import { inspectClientModuleRegistration, parseHealthBootGraph } from '../../scripts/production/health.mjs'
import { buildHostEnvironment } from '../../scripts/production/process.mjs'
import {
  SOURCE_PRODUCTION_COMMANDS,
  loadSourceProductionContext,
  parseSourceProductionDefinition,
  prepareSourceRuntime,
} from '../../scripts/production/runtime.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const temporaryPaths = []
const activeFixtures = []

async function pathExists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function findFreePort() {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('cannot reserve a test port')
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
  return address.port
}

async function assertPortAvailable(host, port) {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(port, host, resolveListen)
  })
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
}

async function waitForPath(path, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await pathExists(path)) return
    await delay(20)
  }
  throw new Error(`timed out waiting for ${path}`)
}

async function waitForProcessLaunchToken(path, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await pathExists(path)) {
      const state = JSON.parse(await readFile(path, 'utf8'))
      if (typeof state.launchToken === 'string' && state.launchToken.length > 0) return state.launchToken
    }
    await delay(20)
  }
  throw new Error(`timed out waiting for Harness Web launch token in ${path}`)
}

async function waitForRunning(context, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  let lastStatus
  while (Date.now() < deadline) {
    const result = await runSourceProductionCommand('status', { loadContext: async () => context })
    lastStatus = result.evidence.status
    if (lastStatus === 'running') return result
    await delay(20)
  }
  throw new Error(`timed out waiting for source production status running; last status was ${lastStatus}`)
}

async function createFixture(options = {}) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'harness-source-production-'))
  temporaryPaths.push(temporaryRoot)
  const runtimeRelativeRoot = `.local/source-production-test-${randomUUID()}`
  const runtimeRoot = resolve(repositoryRoot, runtimeRelativeRoot)
  temporaryPaths.push(runtimeRoot)
  await mkdir(runtimeRoot, { recursive: true })
  const catalogCliPath = resolve(runtimeRoot, 'catalog.mjs')
  const sourceCliPath = resolve(runtimeRoot, 'source.mjs')
  const dshExecutable = resolve(runtimeRoot, 'node_modules/.bin/dsh')
  const dshHostPath = resolve(runtimeRoot, 'fake-dsh-host.mjs')
  await writeFile(catalogCliPath, '#!/usr/bin/env node\n', 'utf8')
  await writeFile(sourceCliPath, '#!/usr/bin/env node\n', 'utf8')
  await writeFile(dshHostPath, `
import { createServer } from 'node:http'

const server = createServer((request, response) => {
  response.statusCode = 404
  response.end()
})
server.listen(
  Number(process.env.HARNESS_COMFYUI_SERVER_PORT),
  process.env.HARNESS_COMFYUI_SERVER_HOST,
  () => process.stdout.write('source-production-test-ready\\n'),
)
const shutdown = () => server.close(() => process.exit(0))
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
`, 'utf8')
  if (options.realDsh !== true) {
    await mkdir(dirname(dshExecutable), { recursive: true })
    await writeFile(dshExecutable, `#!/bin/sh
sleep 0.1
exec ${JSON.stringify(process.execPath)} ${JSON.stringify(dshHostPath)} "$@"
`, 'utf8')
    await chmod(dshExecutable, 0o755)
  }

  const definition = {
    schemaVersion: 1,
    runtimeId: `source-production-test-${randomUUID()}`,
    runtimeRelativeRoot,
    configurationProfile: 'production',
    source: {
      catalogPort: 18093,
      catalogCliRelativePath: relative(repositoryRoot, catalogCliPath),
      sourceCliRelativePath: relative(repositoryRoot, sourceCliPath),
    },
    logs: { source: 'all', lines: 50 },
  }
  const definitionPath = resolve(temporaryRoot, 'source-production.json')
  const managedStatePath = resolve(temporaryRoot, 'source-production-managed.json')
  await writeFile(definitionPath, `${JSON.stringify(definition, null, 2)}\n`, 'utf8')
  const context = await loadSourceProductionContext({
    repositoryRoot,
    definitionPath,
    managedStatePath,
    environment: { ...process.env, HARNESS_COMFYUI_SERVER_PORT: String(await findFreePort()) },
  })
  if (options.realDsh !== true) context.dshExecutable = dshExecutable
  const fixture = { context, definition, definitionPath, managedStatePath, runtimeRoot }
  activeFixtures.push(fixture)
  return fixture
}

afterEach(async () => {
  for (const fixture of activeFixtures.splice(0)) {
    try {
      await runSourceProductionCommand('stop', { loadContext: async () => fixture.context })
    } catch {
      // A test may fail before the process state is created.
    }
  }
  for (const path of temporaryPaths.splice(0).reverse()) {
    await rm(path, { recursive: true, force: true })
  }
})

describe('Web Host shared process commands', () => {
  it('exposes only current-source process management commands without command arguments', () => {
    expect(SOURCE_PRODUCTION_COMMANDS).toEqual(['start', 'stop', 'restart', 'status', 'health', 'logs'])
    for (const command of SOURCE_PRODUCTION_COMMANDS) expect(parseArguments([command])).toEqual({ command })
    expect(parseArguments([])).toEqual({ command: 'help' })
    expect(() => parseArguments(['start', '--anything'])).toThrow('do not accept arguments')
    expect(() => parseArguments(['unknown'])).toThrow('unknown Web Host command')
  })

  it('requires one repository-local runtime directory and resolves source paths from the repository', () => {
    const definition = {
      schemaVersion: 1,
      runtimeId: 'source-production-test',
      runtimeRelativeRoot: '.local/production-test',
      configurationProfile: 'production',
      source: {
        catalogPort: 18093,
        catalogCliRelativePath: '../catalog.mjs',
        sourceCliRelativePath: '../source.mjs',
      },
      logs: { source: 'all', lines: 50 },
    }
    const parsed = parseSourceProductionDefinition(definition, repositoryRoot)
    expect(parsed.runtimeRoot).toBe(resolve(repositoryRoot, '.local/production-test'))
    expect(parsed.catalogCliPath).toBe(resolve(repositoryRoot, '../catalog.mjs'))
    expect(parsed.catalogPort).toBe(18093)
    expect(() => parseSourceProductionDefinition({ ...definition, runtimeRelativeRoot: '../production-test' }, repositoryRoot))
      .toThrow('must identify a directory inside the source repository')
    expect(() => parseSourceProductionDefinition({ ...definition, schemaVersion: 2 }, repositoryRoot))
      .toThrow('schemaVersion must be 1')
    expect(() => parseSourceProductionDefinition({ ...definition, configurationProfile: 'invalid' }, repositoryRoot))
      .toThrow('configurationProfile must be production')
    expect(() => parseSourceProductionDefinition({ ...definition, extra: true }, repositoryRoot))
      .toThrow('must contain exactly')
    expect(() => parseSourceProductionDefinition({ ...definition, logs: { source: 'unknown', lines: 50 } }, repositoryRoot))
      .toThrow('logs.source must be stdout, stderr, operations, or all')
    expect(() => parseSourceProductionDefinition({ ...definition, logs: { source: 'all', lines: 0 } }, repositoryRoot))
      .toThrow('logs.lines must be a positive integer')
    expect(() => parseSourceProductionDefinition({
      ...definition,
      source: { ...definition.source, catalogCliRelativePath: '/absolute/catalog.mjs' },
    }, repositoryRoot)).toThrow('must be relative to the source repository')
  })

  it('loads the production configuration files in one fixed order and applies declared environment overrides last', async () => {
    const fixture = await createFixture()
    expect(fixture.context.configReadOrder).toEqual([
      fixture.context.definitionPath,
      resolve(repositoryRoot, 'config/base.json'),
      resolve(repositoryRoot, 'config/profiles/production.json'),
      resolve(repositoryRoot, 'config/environment-overrides.json'),
    ])
    expect(fixture.context.profile).toMatchObject({
      configurationProfile: 'production',
      server: { host: '127.0.0.1', port: fixture.context.runtime.port },
      comfyui: { defaultInstanceId: '1' },
      source: {
        contractId: 'imagegen-source-contract',
        sourceReleaseVersion: '0.86.1',
      },
      client: { runRefreshIntervalMs: 1000 },
      process: { shutdownTimeoutMs: 10_000 },
    })
    const overridden = await loadSourceProductionContext({
      repositoryRoot,
      definitionPath: fixture.definitionPath,
      managedStatePath: fixture.managedStatePath,
      environment: {
        HARNESS_COMFYUI_DATA_DIR: '/ignored/data',
        HARNESS_COMFYUI_RUN_REPOSITORY_FILE: '/ignored/runs.sqlite',
        HARNESS_COMFYUI_RUN_DIRECTORY: '/ignored/runs',
        HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY: '/ignored/saved-media',
        HARNESS_COMFYUI_LOG_DIRECTORY: '/ignored/logs',
        HARNESS_COMFYUI_CATALOG_CLI_PATH: '/ignored/catalog.mjs',
        HARNESS_COMFYUI_CATALOG_PORT: '19093',
        HARNESS_COMFYUI_SOURCE_CLI_PATH: '/ignored/source.mjs',
        HARNESS_COMFYUI_DEFAULT_INSTANCE_ID: 'environment-instance',
        HARNESS_COMFYUI_CLIENT_RUN_REFRESH_INTERVAL_MS: '2345',
        HARNESS_COMFYUI_SERVER_HOST: '0.0.0.0',
        HARNESS_COMFYUI_SERVER_PORT: String(await findFreePort()),
      },
    })
    expect(overridden.profile).toMatchObject({
      paths: {
        dataDir: resolve(fixture.runtimeRoot, 'shared/data'),
        runRepositoryFile: resolve(fixture.runtimeRoot, 'shared/data/runs.sqlite'),
        runDirectory: resolve(fixture.runtimeRoot, 'shared/runs'),
        savedMediaDirectory: resolve(fixture.runtimeRoot, 'shared/saved-media'),
        logDirectory: resolve(fixture.runtimeRoot, 'shared/logs'),
      },
      comfyui: { defaultInstanceId: 'environment-instance' },
      source: {
        catalogPort: 18093,
        catalogCliPath: resolve(fixture.runtimeRoot, 'catalog.mjs'),
        sourceCliPath: resolve(fixture.runtimeRoot, 'source.mjs'),
      },
      client: { runRefreshIntervalMs: 2345 },
      server: { host: '127.0.0.1' },
    })
    await expect(loadSourceProductionContext({
      repositoryRoot,
      definitionPath: fixture.context.definitionPath,
      environment: { ...process.env, HARNESS_COMFYUI_UNDECLARED: 'rejected' },
    })).rejects.toThrow('environment override is not allowed')
  })

  it('derives every managed Host environment variable from the structured override map', async () => {
    const fixture = await createFixture()
    const overrideMap = JSON.parse(await readFile(resolve(repositoryRoot, 'config/environment-overrides.json'), 'utf8'))
    const expectedKeys = Object.entries(overrideMap)
      .filter(([, value]) => typeof value?.hostRuntimePath === 'string')
      .map(([key]) => key)
      .sort()
    const environment = await buildHostEnvironment(fixture.context.runtime, {
      packageRoot: repositoryRoot,
      dshHome: resolve(fixture.runtimeRoot, 'dsh-home'),
    })

    expect(Object.keys(environment).filter(key => key.startsWith('HARNESS_COMFYUI_')).sort()).toEqual(expectedKeys)
    expect(environment.HARNESS_COMFYUI_FRONTEND_COMPILER_TIMEOUT_MS).toBe(
      String(fixture.context.runtime.comfyui.frontendCompiler.timeoutMs),
    )
  })

  it('reports a stopped source process without preparing a profile', async () => {
    const fixture = await createFixture()
    const result = await runSourceProductionCommand('status', { loadContext: async () => fixture.context })
    expect(result.evidence).toMatchObject({ status: 'stopped', pid: null })
    expect(await pathExists(resolve(fixture.runtimeRoot, 'dsh-home'))).toBe(false)
  })

  it('starts and stops the current source through the shared managed-process lifecycle', async () => {
    const fixture = await createFixture()
    const processStatePath = resolve(fixture.runtimeRoot, 'state/process.json')
    const start = runSourceProductionCommand('start', { loadContext: async () => fixture.context })
    await waitForPath(processStatePath)

    const managedState = JSON.parse(await readFile(fixture.managedStatePath, 'utf8'))
    const processState = JSON.parse(await readFile(processStatePath, 'utf8'))
    expect(managedState.runtimeId).toBe(fixture.context.definition.runtimeId)
    expect(processState.runtimeId).toBe(fixture.context.definition.runtimeId)

    const status = await waitForRunning(fixture.context)
    expect(status.evidence).toMatchObject({ status: 'running', activeVersion: fixture.context.activeVersion })
    expect(status.evidence.runtimeId).toBe(fixture.context.definition.runtimeId)
    await expect(runSourceProductionCommand('start', {
      loadContext: async () => fixture.context,
      commandPrefix: 'web',
    })).rejects.toThrow('run pnpm web:stop or pnpm web:restart')
    const health = await runSourceProductionCommand('health', { loadContext: async () => fixture.context })
    expect(health.evidence).toHaveProperty('sourceRuntime')
    expect(health.evidence).not.toHaveProperty('agentPresetRuntime')
    expect(health.evidence).not.toHaveProperty('agentPresetRoster')
    const operationLog = await readFile(resolve(fixture.runtimeRoot, 'state/operations.jsonl'), 'utf8')
    expect(operationLog).toContain('"runtimeId"')

    const profileLink = resolve(fixture.runtimeRoot, 'dsh-home/profiles/comfyui-workbench/node_modules/harness-comfyui')
    expect(resolve(dirname(profileLink), await readlink(profileLink))).toBe(repositoryRoot)
    const profileManifest = JSON.parse(await readFile(resolve(dirname(dirname(profileLink)), 'package.json'), 'utf8'))
    expect(profileManifest.dependencies).toEqual({ 'harness-comfyui': `file:${repositoryRoot}` })
    expect(await readFile(resolve(dirname(dirname(profileLink)), 'cordis.patch.yml'), 'utf8')).toBe('[]\n')
    expect(await pathExists(resolve(fixture.runtimeRoot, 'dsh-home/.env'))).toBe(false)
    expect(await pathExists(resolve(
      fixture.runtimeRoot,
      'dsh-home/.agent-presets/harness-comfyui-schema-control',
    ))).toBe(false)
    const productPresetMetadata = await readFile(resolve(
      fixture.runtimeRoot,
      'dsh-home/.agent-presets/harness-comfyui-cli-candidate/preset.yml',
    ), 'utf8')
    expect(productPresetMetadata).toBe(await readFile(resolve(
      repositoryRoot,
      'agent-presets/harness-comfyui-cli-candidate/preset.yml',
    ), 'utf8'))
    expect(productPresetMetadata).toContain('name: ComfyUI工作台预设\n')
    expect(await pathExists(resolve(
      fixture.runtimeRoot,
      'dsh-home/.agent-presets/project-tool-visibility.mjs',
    ))).toBe(true)

    const stop = await runSourceProductionCommand('stop', { loadContext: async () => fixture.context })
    expect(stop.evidence).toMatchObject({ stage: 'stop', status: 'stopped' })
    expect((await start).evidence).toMatchObject({ stage: 'start', status: 'stopped' })
    expect(await pathExists(processStatePath)).toBe(false)
  })

  it('does not publish managed runtime state when Agent Preset materialization fails', async () => {
    const fixture = await createFixture()

    await expect(prepareSourceRuntime(fixture.context, {
      materializeProductAgentPreset: async () => { throw new Error('Agent Preset materialization failed') },
    })).rejects.toThrow('Agent Preset materialization failed')

    expect(await pathExists(fixture.managedStatePath)).toBe(false)
    expect(await pathExists(fixture.context.sourceRuntimeStatePath)).toBe(false)
  })

  it('does not publish managed runtime state when CLI materialization fails', async () => {
    const fixture = await createFixture()

    await expect(prepareSourceRuntime(fixture.context, {
      materializeCli: async () => { throw new Error('CLI bundle failed') },
    })).rejects.toThrow('CLI bundle failed')

    expect(await pathExists(fixture.managedStatePath)).toBe(false)
    expect(await pathExists(fixture.context.sourceRuntimeStatePath)).toBe(false)
  })

  it('serves a real Harness Client bundle that registers with ModuleLoader', async () => {
    const invalidUrl = 'http://127.0.0.1:4173/plugins/harness-comfyui/client.js'
    expect(() => inspectClientModuleRegistration(
      'import { apply } from "./client.tsx"',
      'harness-comfyui',
      invalidUrl,
    )).toThrow(
      `client-modules: bundle ${invalidUrl} loaded without registering "harness-comfyui" via __ModuleLoader__.load`,
    )

    const fixture = await createFixture({ realDsh: true })
    const processStatePath = resolve(fixture.runtimeRoot, 'state/process.json')
    const start = runSourceProductionCommand('start', { loadContext: async () => fixture.context })
    await waitForPath(processStatePath)
    await waitForRunning(fixture.context)

    const baseUrl = `http://${fixture.context.runtime.host}:${fixture.context.runtime.port}`
    const launchToken = await waitForProcessLaunchToken(processStatePath)
    const anonymousResponse = await fetch(`${baseUrl}/`)
    expect(anonymousResponse.status).toBe(401)

    const tokenUrl = new URL('/', baseUrl)
    tokenUrl.searchParams.set('token', launchToken)
    const exchange = await fetch(tokenUrl, { redirect: 'manual' })
    expect(exchange.status).toBe(303)
    const cookie = exchange.headers.getSetCookie()[0]?.split(';', 1)[0]
    expect(cookie).toBeTypeOf('string')
    const rootResponse = await fetch(`${baseUrl}/`, { headers: { cookie } })
    expect(rootResponse.ok).toBe(true)
    const graph = parseHealthBootGraph(await rootResponse.text())
    const entry = graph.entries.find(candidate => candidate.id === 'harness-comfyui')
    expect(entry).toBeDefined()
    const bundleUrl = new URL(entry.url, baseUrl).href
    const response = await fetch(bundleUrl, { headers: { cookie } })
    expect(response.ok).toBe(true)
    const source = await response.text()
    const registration = inspectClientModuleRegistration(source, 'harness-comfyui', bundleUrl)
    expect(registration.factory).toBeTypeOf('function')

    const health = await runSourceProductionCommand('health', { loadContext: async () => fixture.context })
    expect(health.evidence).toMatchObject({ status: 'passed', clientBundle: { status: 'passed' } })

    const stop = await runSourceProductionCommand('stop', { loadContext: async () => fixture.context })
    expect(stop.evidence).toMatchObject({ status: 'stopped' })
    expect((await start).evidence).toMatchObject({ status: 'stopped' })
  })

  it.each([
    {
      name: 'runtimeId',
      change: async fixture => ({
        definition: { ...fixture.definition, runtimeId: `changed-${randomUUID()}` },
        environment: { HARNESS_COMFYUI_SERVER_PORT: String(fixture.context.runtime.port) },
      }),
    },
    {
      name: 'runtimeRelativeRoot',
      change: async fixture => ({
        definition: {
          ...fixture.definition,
          runtimeRelativeRoot: `.local/changed-source-production-${randomUUID()}`,
        },
        environment: { HARNESS_COMFYUI_SERVER_PORT: String(fixture.context.runtime.port) },
      }),
    },
    {
      name: 'HARNESS_COMFYUI_SERVER_PORT',
      change: async fixture => ({
        definition: fixture.definition,
        environment: { HARNESS_COMFYUI_SERVER_PORT: String(await findFreePort()) },
      }),
    },
  ])('uses the saved running configuration to stop after $name changes', async ({ change }) => {
    const fixture = await createFixture()
    const processState = resolve(fixture.runtimeRoot, 'state/process.json')
    const start = runSourceProductionCommand('start', { loadContext: async () => fixture.context })
    await waitForPath(processState)
    await waitForRunning(fixture.context)
    const runningState = JSON.parse(await readFile(processState, 'utf8'))

    const changed = await change(fixture)
    await writeFile(fixture.definitionPath, `${JSON.stringify(changed.definition, null, 2)}\n`, 'utf8')
    const changedContext = await loadSourceProductionContext({
      repositoryRoot,
      definitionPath: fixture.definitionPath,
      managedStatePath: fixture.managedStatePath,
      environment: changed.environment,
    })
    const status = await runSourceProductionCommand('status', { loadContext: async () => changedContext })
    expect(status.evidence).toMatchObject({
      runtimeId: fixture.context.definition.runtimeId,
      pid: runningState.pid,
      host: fixture.context.runtime.host,
      port: fixture.context.runtime.port,
      status: 'running',
    })

    const stop = await runSourceProductionCommand('stop', { loadContext: async () => changedContext })
    expect(stop.evidence).toMatchObject({
      runtimeId: fixture.context.definition.runtimeId,
      pid: null,
      status: 'stopped',
    })
    expect(await pathExists(processState)).toBe(false)
    expect(await pathExists(fixture.managedStatePath)).toBe(false)
    await assertPortAvailable(fixture.context.runtime.host, fixture.context.runtime.port)
    expect((await start).evidence).toMatchObject({ runtimeId: fixture.context.definition.runtimeId, status: 'stopped' })
  })

  it.each([
    {
      name: 'a missing source configuration file',
      breakConfiguration: async fixture => { await rm(fixture.definitionPath) },
      environment: {},
    },
    {
      name: 'malformed source configuration JSON',
      breakConfiguration: async fixture => { await writeFile(fixture.definitionPath, '{broken', 'utf8') },
      environment: {},
    },
    {
      name: 'an invalid source configuration value type',
      breakConfiguration: async fixture => {
        await writeFile(
          fixture.definitionPath,
          `${JSON.stringify({ ...fixture.definition, runtimeId: 42 }, null, 2)}\n`,
          'utf8',
        )
      },
      environment: {},
    },
    {
      name: 'an undeclared Harness environment variable',
      breakConfiguration: async () => {},
      environment: { HARNESS_COMFYUI_UNDECLARED: 'rejected-without-a-snapshot' },
    },
  ])('manages the saved process when current input contains $name', async ({ breakConfiguration, environment }) => {
    const fixture = await createFixture()
    const processState = resolve(fixture.runtimeRoot, 'state/process.json')
    const start = runSourceProductionCommand('start', { loadContext: async () => fixture.context })
    await waitForPath(processState)
    await waitForRunning(fixture.context)
    await breakConfiguration(fixture)
    const contextOptions = {
      repositoryRoot,
      definitionPath: fixture.definitionPath,
      managedStatePath: fixture.managedStatePath,
      environment,
    }

    const status = await runSourceProductionCommand('status', { contextOptions })
    expect(status.evidence).toMatchObject({
      runtimeId: fixture.context.definition.runtimeId,
      status: 'running',
    })
    const health = await runSourceProductionCommand('health', { contextOptions })
    expect(health.evidence).toHaveProperty('sourceRuntime')
    const logs = await runSourceProductionCommand('logs', { contextOptions })
    expect(logs.evidence).toMatchObject({ stage: 'logs', status: 'passed' })

    const stop = await runSourceProductionCommand('stop', { contextOptions })
    expect(stop.evidence).toMatchObject({
      runtimeId: fixture.context.definition.runtimeId,
      status: 'stopped',
    })
    expect(await pathExists(processState)).toBe(false)
    expect(await pathExists(fixture.managedStatePath)).toBe(false)
    await assertPortAvailable(fixture.context.runtime.host, fixture.context.runtime.port)
    expect((await start).evidence).toMatchObject({ status: 'stopped' })
  })

  it('stops the saved process before restart applies the changed configuration', async () => {
    const fixture = await createFixture()
    const oldProcessState = resolve(fixture.runtimeRoot, 'state/process.json')
    const oldStart = runSourceProductionCommand('start', { loadContext: async () => fixture.context })
    await waitForPath(oldProcessState)
    await waitForRunning(fixture.context)

    const runtimeRelativeRoot = `.local/restarted-source-production-${randomUUID()}`
    const runtimeRoot = resolve(repositoryRoot, runtimeRelativeRoot)
    temporaryPaths.push(runtimeRoot)
    const runtimeId = `restarted-${randomUUID()}`
    const port = await findFreePort()
    const definition = { ...fixture.definition, runtimeId, runtimeRelativeRoot }
    await writeFile(fixture.definitionPath, `${JSON.stringify(definition, null, 2)}\n`, 'utf8')
    const changedContext = await loadSourceProductionContext({
      repositoryRoot,
      definitionPath: fixture.definitionPath,
      managedStatePath: fixture.managedStatePath,
      environment: { HARNESS_COMFYUI_SERVER_PORT: String(port) },
    })
    changedContext.dshExecutable = fixture.context.dshExecutable

    const restart = runSourceProductionCommand('restart', { loadContext: async () => changedContext })
    const newProcessState = resolve(runtimeRoot, 'state/process.json')
    await waitForPath(newProcessState)
    const status = await waitForRunning(changedContext)
    expect(status.evidence).toMatchObject({ runtimeId, port, status: 'running' })
    expect(await pathExists(oldProcessState)).toBe(false)

    const stop = await runSourceProductionCommand('stop', { loadContext: async () => changedContext })
    expect(stop.evidence).toMatchObject({ runtimeId, port, status: 'stopped' })
    expect((await oldStart).evidence).toMatchObject({ runtimeId: fixture.context.definition.runtimeId, status: 'stopped' })
    expect((await restart).evidence).toMatchObject({ runtimeId, stage: 'restart', status: 'stopped' })
  })
})
