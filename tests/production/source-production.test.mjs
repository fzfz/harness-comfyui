import { randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { afterEach, describe, expect, it } from 'vitest'

import { parseArguments, runSourceProductionCommand } from '../../scripts/production/cli.mjs'
import {
  SOURCE_PRODUCTION_COMMANDS,
  loadSourceProductionContext,
  parseSourceProductionDefinition,
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

async function createFixture() {
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
  if (request.url !== '/api/agentPreset.list') {
    response.statusCode = 404
    response.end()
    return
  }
  let body = ''
  request.setEncoding('utf8')
  request.on('data', chunk => { body += chunk })
  request.on('end', () => {
    const rpcId = JSON.parse(body).rpcId
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({
      type: 'server-response',
      rpcId,
      result: {
        ok: true,
        value: { presets: [{ id: 'harness-comfyui', trust: 'user', isDefault: true }] },
      },
    }))
  })
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
  await mkdir(dirname(dshExecutable), { recursive: true })
  await writeFile(dshExecutable, `#!/bin/sh
sleep 0.1
exec ${JSON.stringify(process.execPath)} ${JSON.stringify(dshHostPath)} "$@"
`, 'utf8')
  await chmod(dshExecutable, 0o755)

  const definition = {
    schemaVersion: 1,
    runtimeId: `source-production-test-${randomUUID()}`,
    runtimeRelativeRoot,
    configurationProfile: 'production',
    source: {
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
  context.dshExecutable = dshExecutable
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

describe('source production commands', () => {
  it('exposes only current-source process management commands without command arguments', () => {
    expect(SOURCE_PRODUCTION_COMMANDS).toEqual(['start', 'stop', 'restart', 'status', 'health', 'logs'])
    for (const command of SOURCE_PRODUCTION_COMMANDS) expect(parseArguments([command])).toEqual({ command })
    expect(parseArguments([])).toEqual({ command: 'help' })
    expect(() => parseArguments(['start', '--anything'])).toThrow('do not accept arguments')
    expect(() => parseArguments(['install'])).toThrow('unknown source production command')
    expect(() => parseArguments(['upgrade'])).toThrow('unknown source production command')
  })

  it('requires one repository-local runtime directory and resolves source paths from the repository', () => {
    const definition = {
      schemaVersion: 1,
      runtimeId: 'source-production-test',
      runtimeRelativeRoot: '.local/production-test',
      configurationProfile: 'production',
      source: {
        catalogCliRelativePath: '../catalog.mjs',
        sourceCliRelativePath: '../source.mjs',
      },
      logs: { source: 'all', lines: 50 },
    }
    const parsed = parseSourceProductionDefinition(definition, repositoryRoot)
    expect(parsed.runtimeRoot).toBe(resolve(repositoryRoot, '.local/production-test'))
    expect(parsed.catalogCliPath).toBe(resolve(repositoryRoot, '../catalog.mjs'))
    expect(() => parseSourceProductionDefinition({ ...definition, runtimeRelativeRoot: '../production-test' }, repositoryRoot))
      .toThrow('must identify a directory inside the source repository')
    expect(() => parseSourceProductionDefinition({ ...definition, schemaVersion: 2 }, repositoryRoot))
      .toThrow('schemaVersion must be 1')
    expect(() => parseSourceProductionDefinition({ ...definition, configurationProfile: 'development' }, repositoryRoot))
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
      comfyui: { defaultInstanceId: 'production' },
      source: {
        contractId: 'imagegen-source-contract',
        sourceReleaseVersion: '0.82.2',
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
        HARNESS_COMFYUI_SOURCE_CLI_PATH: '/ignored/source.mjs',
        HARNESS_COMFYUI_DEFAULT_INSTANCE_ID: 'environment-instance',
        HARNESS_COMFYUI_CLIENT_RUN_REFRESH_INTERVAL_MS: '2345',
        HARNESS_COMFYUI_SERVER_HOST: '127.0.0.2',
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
        catalogCliPath: resolve(fixture.runtimeRoot, 'catalog.mjs'),
        sourceCliPath: resolve(fixture.runtimeRoot, 'source.mjs'),
      },
      client: { runRefreshIntervalMs: 2345 },
      server: { host: '127.0.0.2' },
    })
    await expect(loadSourceProductionContext({
      repositoryRoot,
      definitionPath: fixture.context.definitionPath,
      environment: { ...process.env, HARNESS_COMFYUI_UNDECLARED: 'rejected' },
    })).rejects.toThrow('environment override is not allowed')
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
    expect(JSON.stringify(managedState)).not.toContain('installation')
    expect(JSON.stringify(processState)).not.toContain('installation')

    const status = await waitForRunning(fixture.context)
    expect(status.evidence).toMatchObject({ status: 'running', activeVersion: fixture.context.activeVersion })
    expect(status.evidence.runtimeId).toBe(fixture.context.definition.runtimeId)
    expect(JSON.stringify(status.evidence)).not.toContain('installation')
    const health = await runSourceProductionCommand('health', { loadContext: async () => fixture.context })
    expect(health.evidence).toHaveProperty('sourceRuntime')
    expect(health.evidence).toHaveProperty('agentPresetRuntime')
    expect(health.evidence).not.toHaveProperty('activeRelease')
    expect(health.evidence).not.toHaveProperty('agentPresetInstallation')
    expect(JSON.stringify(health.evidence)).not.toContain('installation')
    expect(JSON.stringify(health.evidence)).not.toContain('releaseRelativeRoot')
    expect(health.evidence.agentPresetRuntime).toHaveProperty('agentPresetRelativeRoot')
    const operationLog = await readFile(resolve(fixture.runtimeRoot, 'state/operations.jsonl'), 'utf8')
    expect(operationLog).toContain('"runtimeId"')
    expect(operationLog).not.toContain('installation')

    const profileLink = resolve(fixture.runtimeRoot, 'dsh-home/profiles/comfyui-workbench/node_modules/harness-comfyui')
    expect(resolve(dirname(profileLink), await readlink(profileLink))).toBe(repositoryRoot)
    const profileManifest = JSON.parse(await readFile(resolve(dirname(dirname(profileLink)), 'package.json'), 'utf8'))
    expect(profileManifest.dependencies).toEqual({ 'harness-comfyui': `file:${repositoryRoot}` })

    const stop = await runSourceProductionCommand('stop', { loadContext: async () => fixture.context })
    expect(stop.evidence).toMatchObject({ stage: 'stop', status: 'stopped' })
    expect((await start).evidence).toMatchObject({ stage: 'start', status: 'stopped' })
    expect(await pathExists(processStatePath)).toBe(false)
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
      name: 'HARNESS_COMFYUI_SERVER_HOST',
      change: async fixture => ({
        definition: fixture.definition,
        environment: {
          HARNESS_COMFYUI_SERVER_HOST: '127.0.0.2',
          HARNESS_COMFYUI_SERVER_PORT: String(fixture.context.runtime.port),
        },
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
