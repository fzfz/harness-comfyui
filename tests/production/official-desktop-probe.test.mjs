import { EventEmitter } from 'node:events'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { mkdirSync, unlinkSync } from 'node:fs'
import { access, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createStartCommandResult,
  getProbeStatus,
  loadDesktopE2EConfig,
  parseDesktopE2EConfig,
  prepareProbeRun,
  processGroupMatchesRun,
  releasePortReservations,
  reserveLoopbackPort,
  startProbe,
  stopProbe,
} from '../desktop/fixtures/official-desktop-probe.mjs'
import { parseDesktopE2ERunRecord } from '../../config/desktop-e2e-schema.mjs'
import {
  loadDevelopmentEnvironmentOverrides,
  prepareDevelopmentEnvironment,
} from '../desktop/fixtures/development-environment.mjs'

const temporaryRoots = new Set()

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await Promise.all([...temporaryRoots].map(root => rm(root, { recursive: true, force: true })))
  temporaryRoots.clear()
})

describe('official Desktop probe configuration and records', () => {
  it('prints a development stop command bound to the exact started run', () => {
    const runId = randomUUID()
    const repositoryRoot = '/tmp/official-desktop-probe-repository'
    const started = {
      record: {
        runId,
        mode: 'development',
        environment: { root: '/tmp/environment', leasePath: '/tmp/environment/active-probe.json' },
        directories: { evidence: '/tmp/run/evidence' },
        process: { listeningPorts: [51001, 51002] },
        ports: { host: 51001, rendererCdp: 51002, hostInspector: 51003 },
      },
      recordPath: '/tmp/run/run.json',
      renderer: { title: 'DeepSeek Harness', url: 'dsh-app://app/', readyState: 'complete' },
      config: { capabilities: { pluginIdentityVerified: false } },
    }

    const result = createStartCommandResult({ started, repositoryRoot })

    expect(result.stopCommand).toEqual({
      executable: process.execPath,
      arguments: [
        expect.stringMatching(/tests\/desktop\/fixtures\/official-desktop-probe\.mjs$/u),
        'stop', '--run-id', runId, '--repository-root', repositoryRoot,
      ],
    })
    expect(result.stopCommand.arguments.slice(result.stopCommand.arguments.indexOf('--run-id') + 1, -2))
      .toEqual([runId])
  })

  it('loads the approved installed app identity and bounded probe policy', async () => {
    const config = await loadDesktopE2EConfig()
    expect(config.application).toMatchObject({
      bundlePath: '/Applications/DeepSeek Harness.app',
      bundleId: 'com.deepseek.dsh',
      version: '0.2.0-rc.2',
    })
    expect(config.ports.allocation).toBe('held-loopback-ephemeral')
    expect(config.paths.runRootRelativePath).toBe('.local/desktop-e2e')
    expect(config.invocation.unsetEnvironmentNames).toContain('ELECTRON_RUN_AS_NODE')
    const initialProfilePatches = Object.fromEntries(config.modes.development.initialProfilePatches.map(row => [row.id, row.config]))
    expect(initialProfilePatches['agent-default-model']).toEqual({
      provider: 'openrouter',
      model: 'stealth/space-bunny-alpha',
    })
    expect(initialProfilePatches['llm-pi-ai'].providers.openrouter).toEqual({
      displayName: 'OpenRouter',
      api: 'openai-completions',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      models: [{
        id: 'stealth/space-bunny-alpha',
        input: ['text', 'image'],
        contextWindow: 1000000,
        maxTokens: 8192,
      }],
    })
    expect(config.capabilities).toMatchObject({
      defaultApplicationLogsIsolated: false,
      applicationHostHealthVerified: false,
      pluginIdentityVerified: false,
    })
  })

  it('rejects unsafe paths, malformed app identity, unknown keys, and timeout bounds', async () => {
    const config = await loadDesktopE2EConfig()
    expect(() => parseDesktopE2EConfig({ ...config, unexpected: true })).toThrow(/unexpected/u)
    expect(() => parseDesktopE2EConfig({
      ...config,
      application: { ...config.application, bundlePath: 'relative.app' },
    })).toThrow(/bundlePath/u)
    expect(() => parseDesktopE2EConfig({
      ...config,
      paths: { ...config.paths, runRootRelativePath: '../outside' },
    })).toThrow(/runRootRelativePath/u)
    expect(() => parseDesktopE2EConfig({
      ...config,
      startup: { ...config.startup, startupTimeoutMs: 300_001 },
    })).toThrow(/startupTimeoutMs/u)
    expect(() => parseDesktopE2EConfig({
      ...config,
      modes: {
        ...config.modes,
        development: {
          ...config.modes.development,
          directoryNames: { ...config.modes.development.directoryNames, workspace: 'dsh-home' },
        },
      },
    })).toThrow(/directoryNames.*unique/u)
    expect(() => parseDesktopE2EConfig({
      ...config,
      modes: {
        ...config.modes,
        development: {
          ...config.modes.development,
          initialProfilePatches: [
            ...config.modes.development.initialProfilePatches,
            config.modes.development.initialProfilePatches[0],
          ],
        },
      },
    })).toThrow(/duplicate id/u)
    expect(() => parseDesktopE2EConfig({
      ...config,
      modes: {
        ...config.modes,
        development: {
          ...config.modes.development,
          initialProfilePatches: [{ id: 'agent-default-model', config: [] }],
        },
      },
    })).toThrow(/config must be an object/u)
    const developmentPatches = structuredClone(config.modes.development.initialProfilePatches)
    developmentPatches[1].config.providers.openrouter.apiKey = null
    expect(() => parseDesktopE2EConfig({
      ...config,
      modes: { ...config.modes, development: { ...config.modes.development, initialProfilePatches: developmentPatches } },
    })).toThrow(/environment variable reference/u)
  })

  it('validates run record mode, port, and lifecycle boundaries', async () => {
    const config = await loadDesktopE2EConfig()
    const record = makeRunRecord()
    expect(parseDesktopE2ERunRecord(record, config)).toBe(record)
    expect(() => parseDesktopE2ERunRecord({ ...record, state: 'unknown' }, config)).toThrow(/state/u)
    expect(() => parseDesktopE2ERunRecord({
      ...record,
      ports: { ...record.ports, hostInspector: 0 },
    }, config)).toThrow(/hostInspector/u)
    expect(() => parseDesktopE2ERunRecord({
      ...record,
      ports: { ...record.ports, hostInspector: record.ports.host },
    }, config)).toThrow(/distinct/u)
    expect(() => parseDesktopE2ERunRecord({
      ...record,
      launch: { ...record.launch, unsetEnvironmentNames: ['bad-name'] },
    }, config)).toThrow(/unsetEnvironmentNames/u)
    expect(() => parseDesktopE2ERunRecord({ ...record, mode: 'development' }, config)).toThrow(/environment/u)

    const environmentRoot = join('/repo', config.modes.development.environmentRootRelativePath)
    const persistentRecord = {
      ...record,
      mode: 'development',
      environment: { root: environmentRoot, leasePath: join(environmentRoot, config.modes.development.leaseFilename) },
      directories: {
        ...record.directories,
        dshHome: join(environmentRoot, config.modes.development.directoryNames.dshHome),
        electronUserData: join(environmentRoot, config.modes.development.directoryNames.electronUserData),
        workspace: join(environmentRoot, config.modes.development.directoryNames.workspace),
        profile: join(environmentRoot, config.modes.development.directoryNames.dshHome, config.paths.profileRelativePath),
      },
    }
    expect(parseDesktopE2ERunRecord(persistentRecord, config)).toBe(persistentRecord)
    expect(() => parseDesktopE2ERunRecord({
      ...persistentRecord,
      directories: { ...persistentRecord.directories, logs: '/repo/.local/shared-logs' },
    }, config)).toThrow(/logs/u)
  })
})

describe('official Desktop probe preparation and lifecycle', () => {
  it('creates private run directories, writes the isolated Host port patch, and reserves distinct loopback ports', async () => {
    const repositoryRoot = await temporaryRepository()
    const prepared = await prepareProbeRun({ repositoryRoot })
    try {
      expect(prepared.record.state).toBe('prepared')
      expect(relative(repositoryRoot, prepared.record.directories.run).startsWith('..')).toBe(false)
      for (const key of ['dshHome', 'electronUserData', 'workspace', 'logs', 'evidence', 'profile']) {
        expect((await stat(prepared.record.directories[key])).isDirectory()).toBe(true)
      }
      const persisted = JSON.parse(await readFile(prepared.recordPath, 'utf8'))
      expect(persisted.launch.unsetEnvironmentNames).toContain('ELECTRON_RUN_AS_NODE')
      expect(persisted.launch.environment.DSH_HOME).toBe(prepared.record.directories.dshHome)
      expect(Object.hasOwn(persisted.launch.environment, 'HOME')).toBe(false)
      expect(persisted.launch.arguments).toContain(`--user-data-dir=${prepared.record.directories.electronUserData}`)

      const profilePatch = JSON.parse(await readFile(join(prepared.record.directories.profile, prepared.config.paths.profilePatchFilename), 'utf8'))
      const profileConfig = {
        [prepared.config.profilePortPatch.hostField]: prepared.config.ports.host,
        [prepared.config.profilePortPatch.portField]: prepared.record.ports.host,
      }
      expect(profilePatch).toEqual([{ id: prepared.config.profilePortPatch.entryId, config: profileConfig }])
      expect(new Set(Object.values(prepared.record.ports)).size).toBe(prepared.config.ports.roles.length)
      for (const port of Object.values(prepared.record.ports)) await expect(listenAt(port)).rejects.toMatchObject({ code: 'EADDRINUSE' })
    } finally {
      await releasePortReservations(prepared.record.runId)
    }
  })

  it('reports an occupied requested port and releases its own reservation idempotently', async () => {
    const occupied = await listenAt(0)
    const occupiedPort = occupied.address().port
    try {
      await expect(reserveLoopbackPort({ port: occupiedPort })).rejects.toMatchObject({ code: 'PORT_CONFLICT' })
    } finally {
      await closeServer(occupied)
    }
    const reservation = await reserveLoopbackPort()
    await reservation.release()
    await reservation.release()
    const available = await listenAt(reservation.port)
    await closeServer(available)
  })

  it('does not accept readiness from a Renderer WebSocket outside the current CDP port', async () => {
    const repositoryRoot = await temporaryRepository()
    const baseConfig = await fakeApplicationConfig()
    const config = parseDesktopE2EConfig({
      ...baseConfig,
      startup: { ...baseConfig.startup, startupTimeoutMs: 20, portReadyTimeoutMs: 20, pollIntervalMs: 20 },
    })
    const harness = createFakeProcessHarness({ config, fakeClock: true })
    const transport = createDefaultRendererTransport({ config, socketPort: 9, targetId: 'foreign-page' })

    const outcome = await startProbe({
      repositoryRoot,
      config,
      ...harness.options,
      rendererStatus: undefined,
    }).then(started => ({ started }), error => ({ error }))

    try {
      expect(outcome.error).toMatchObject({ code: 'STARTUP_TIMEOUT' })
      expect(transport.socketUrls).toEqual([])
      expect(transport.requests.length).toBeGreaterThan(0)
      expect(transport.requests.every(request => request.options.redirect === 'error')).toBe(true)
    } finally {
      if (outcome.started !== undefined) {
        await stopProbe({ repositoryRoot, runId: outcome.started.record.runId, ...harness.statusOptions })
      }
    }
  })

  it('does not accept Renderer readiness from a redirected CDP response', async () => {
    const repositoryRoot = await temporaryRepository()
    const baseConfig = await fakeApplicationConfig()
    const config = parseDesktopE2EConfig({
      ...baseConfig,
      startup: { ...baseConfig.startup, startupTimeoutMs: 20, portReadyTimeoutMs: 20, pollIntervalMs: 20 },
    })
    const harness = createFakeProcessHarness({ config, fakeClock: true })
    const transport = createDefaultRendererTransport({ config, responseMode: 'redirect' })
    const outcome = await startProbe({
      repositoryRoot,
      config,
      ...harness.options,
      rendererStatus: undefined,
    }).then(started => ({ started }), error => ({ error }))

    try {
      expect(outcome.error).toMatchObject({ code: 'STARTUP_TIMEOUT' })
      expect(transport.socketUrls).toEqual([])
      expect(transport.requests[0].options.redirect).toBe('error')
    } finally {
      if (outcome.started !== undefined) {
        await stopProbe({ repositoryRoot, runId: outcome.started.record.runId, ...harness.statusOptions })
      }
    }
  })

  it('uses the default Renderer readiness transport for a same-port completed page', async () => {
    const repositoryRoot = await temporaryRepository()
    const baseConfig = await fakeApplicationConfig()
    const config = parseDesktopE2EConfig({
      ...baseConfig,
      startup: { ...baseConfig.startup, startupTimeoutMs: 50, portReadyTimeoutMs: 50, pollIntervalMs: 1 },
    })
    const harness = createFakeProcessHarness({ config, fakeClock: true })
    const transport = createDefaultRendererTransport({ config })
    const started = await startProbe({
      repositoryRoot,
      config,
      ...harness.options,
      rendererStatus: undefined,
    })

    try {
      expect(started.record.state).toBe('running')
      expect(started.renderer).toMatchObject({ ready: true, readyState: 'complete', bodyTextLength: 1 })
      expect(transport.requests[0].options.redirect).toBe('error')
      expect(transport.socketUrls).toEqual([`ws://${config.ports.host}:${started.record.ports.rendererCdp}/devtools/page/renderer-page`])
      expect(transport.closeCalls).toBe(1)
    } finally {
      await stopProbe({ repositoryRoot, runId: started.record.runId, ...harness.statusOptions })
    }
  })

  it('rejects Renderer readiness when the child exits during the default readiness probe', async () => {
    const repositoryRoot = await temporaryRepository()
    const config = await fakeApplicationConfig()
    const harness = createFakeProcessHarness({ config })
    let child
    let exited = false
    const transport = createDefaultRendererTransport({
      config,
      beforeFetch: () => {
        exited = true
        child.exitCode = 17
        child.emit('exit', 17, null)
      },
    })
    const inspect = async pid => exited ? null : harness.options.inspect(pid)
    const portOwners = async ports => exited
      ? ports.map(port => ({ port, pids: [] }))
      : harness.options.portOwners(ports)
    const options = {
      ...harness.options,
      inspect,
      portOwners,
      spawnProcess: (...args) => {
        child = harness.options.spawnProcess(...args)
        return child
      },
    }

    const outcome = await startProbe({
      repositoryRoot,
      config,
      ...options,
      rendererStatus: undefined,
    }).then(started => ({ started }), error => ({ error }))

    try {
      expect(transport.closeCalls).toBe(0)
      expect(transport.socketUrls).toEqual([])
      expect(transport.commands).toEqual([])
      expect(outcome.error.code).toMatch(/^(?:APPLICATION_EARLY_EXIT|SINGLE_INSTANCE_LOCK_OR_EARLY_EXIT)$/u)
      expect(outcome.error.run.record.state).toBe('failed')
      expect(outcome.error.run.record.result).toMatchObject({ exitCode: 17, portsReleased: true })
      expect(harness.signals).toEqual([])
      const failure = JSON.parse(await readFile(join(
        outcome.error.run.record.directories.evidence,
        config.paths.outputFilenames.failureEvidence,
      ), 'utf8'))
      const stopResult = JSON.parse(await readFile(join(
        outcome.error.run.record.directories.evidence,
        config.paths.outputFilenames.stopResultEvidence,
      ), 'utf8'))
      expect(failure).toMatchObject({ code: outcome.error.code, process: { pid: harness.pid }, portsReleased: true })
      expect(stopResult).toMatchObject({ portsReleased: true })
    } finally {
      if (outcome.started !== undefined) {
        await stopProbe({ repositoryRoot, runId: outcome.started.record.runId, config, inspect, portOwners, signalProcessGroup: harness.signalProcessGroup })
      }
    }
  })

  it('does not open a Renderer socket when CDP ownership changes during the HTTP target request', async () => {
    const repositoryRoot = await temporaryRepository()
    const config = await fakeApplicationConfig()
    const harness = createFakeProcessHarness({ config })
    const foreignPid = harness.pid + 1
    let rendererPort
    let ownershipChanged = false
    const transport = createDefaultRendererTransport({
      config,
      beforeFetch: () => { ownershipChanged = true },
    })
    const portOwners = async ports => {
      const owners = await harness.options.portOwners(ports)
      if (!ownershipChanged) return owners
      return owners.map(owner => owner.port === rendererPort ? { port: owner.port, pids: [foreignPid] } : owner)
    }
    const outcome = await startProbe({
      repositoryRoot,
      config,
      ...harness.options,
      portOwners,
      spawnProcess: (command, args, options) => {
        rendererPort = Number(args.find(argument => argument.startsWith('--remote-debugging-port='))?.split('=')[1])
        return harness.options.spawnProcess(command, args, options)
      },
      rendererStatus: undefined,
    }).then(started => ({ started }), error => ({ error }))

    expect(transport.requests).toHaveLength(1)
    expect({ socketUrls: transport.socketUrls, commands: transport.commands }).toEqual({ socketUrls: [], commands: [] })
    expect(outcome.error).toMatchObject({ code: 'PORT_CONFLICT' })
    expect(harness.signals).toEqual([])
    expect(outcome.error.cleanupError).toMatchObject({ code: 'PROCESS_IDENTITY_MISMATCH' })
  })

  it('does not send Runtime.evaluate when CDP ownership changes while the Renderer socket opens', async () => {
    const repositoryRoot = await temporaryRepository()
    const config = await fakeApplicationConfig()
    const harness = createFakeProcessHarness({ config })
    const foreignPid = harness.pid + 1
    let rendererPort
    let ownershipChanged = false
    const transport = createDefaultRendererTransport({
      config,
      onSocketOpen: () => { ownershipChanged = true },
    })
    const portOwners = async ports => {
      const owners = await harness.options.portOwners(ports)
      if (!ownershipChanged) return owners
      return owners.map(owner => owner.port === rendererPort ? { port: owner.port, pids: [foreignPid] } : owner)
    }
    const outcome = await startProbe({
      repositoryRoot,
      config,
      ...harness.options,
      portOwners,
      spawnProcess: (command, args, options) => {
        rendererPort = Number(args.find(argument => argument.startsWith('--remote-debugging-port='))?.split('=')[1])
        return harness.options.spawnProcess(command, args, options)
      },
      rendererStatus: undefined,
    }).then(started => ({ started }), error => ({ error }))

    expect(transport.requests).toHaveLength(1)
    expect(transport.socketUrls).toHaveLength(1)
    expect(transport.closeCalls).toBe(1)
    expect(transport.commands).toEqual([])
    expect(outcome.error).toMatchObject({ code: 'PORT_CONFLICT' })
    expect(harness.signals).toEqual([])
  })

  it('cancels startup when the default Renderer socket closes after cancellation', async () => {
    const repositoryRoot = await temporaryRepository()
    const baseConfig = await fakeApplicationConfig()
    const config = parseDesktopE2EConfig({
      ...baseConfig,
      startup: { ...baseConfig.startup, startupTimeoutMs: 1_000, portReadyTimeoutMs: 1_000 },
    })
    const harness = createFakeProcessHarness({ config })
    const controller = new AbortController()
    const transport = createDefaultRendererTransport({
      config,
      onSocketClose: () => controller.abort(new Error('cancelled while Renderer socket closed')),
    })
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout
    const pendingTimers = new Set()
    vi.stubGlobal('setTimeout', (callback, milliseconds, ...args) => {
      let timer
      timer = originalSetTimeout((...callbackArgs) => {
        pendingTimers.delete(timer)
        callback(...callbackArgs)
      }, milliseconds, ...args)
      pendingTimers.add(timer)
      return timer
    })
    vi.stubGlobal('clearTimeout', timer => {
      pendingTimers.delete(timer)
      return originalClearTimeout(timer)
    })

    const outcome = await startProbe({
      repositoryRoot,
      config,
      signal: controller.signal,
      ...harness.options,
      rendererStatus: undefined,
    }).then(started => ({ started }), error => ({ error }))

    try {
      expect(transport.closeCalls).toBe(1)
      expect(controller.signal.aborted).toBe(true)
      expect(outcome.error?.run?.record.result.error).toMatch(/^CANCELLED:/u)
      expect(outcome.error?.run?.record.state).toBe('cancelled')
      expect(outcome.error?.run?.record.result).toMatchObject({ portsReleased: true })
      expect(harness.signals).toEqual([[harness.pid, 'SIGTERM']])
      expect([...transport.sockets[0].listeners.values()].every(listeners => listeners.size === 0)).toBe(true)
      expect(pendingTimers.size).toBe(0)
    } finally {
      if (outcome.started !== undefined) {
        await stopProbe({ repositoryRoot, runId: outcome.started.record.runId, ...harness.statusOptions })
      }
    }
  })

  it('closes the stdout log handle when opening the stderr log fails', async () => {
    const repositoryRoot = await temporaryRepository()
    const config = await fakeApplicationConfig()
    const runId = randomUUID()
    const runDirectory = join(repositoryRoot, config.paths.runRootRelativePath, runId)
    const stdoutPath = join(runDirectory, config.paths.directoryNames.logs, config.paths.outputFilenames.stdoutLog)
    const stderrPath = join(runDirectory, config.paths.directoryNames.logs, config.paths.outputFilenames.stderrLog)
    const harness = createFakeProcessHarness({ config })
    let spawned = false
    const outcome = await startProbe({
      repositoryRoot,
      runId,
      config,
      ...harness.options,
      spawnProcess: (...args) => {
        spawned = true
        return harness.options.spawnProcess(...args)
      },
      verifyApplication: async () => {
        await writeFile(stderrPath, 'controlled collision')
        return {
          version: config.application.version,
          bundleId: config.application.bundleId,
          executablePath: join(config.application.bundlePath, config.application.executableRelativePath),
        }
      },
    }).then(started => ({ started }), error => ({ error }))
    let descriptorOutput = ''
    try {
      descriptorOutput = execFileSync('lsof', ['-a', '-p', String(process.pid), '-Ff', stdoutPath], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    } catch (error) {
      descriptorOutput = error.stdout?.toString() ?? ''
    }

    expect(outcome.error).toMatchObject({ code: 'EEXIST' })
    expect(spawned).toBe(false)
    expect(descriptorOutput).not.toMatch(/^f\d+$/mu)
    if (outcome.started !== undefined) {
      await stopProbe({ repositoryRoot, runId: outcome.started.record.runId, config, ...harness.statusOptions })
    }
  })

  it('closes a Renderer socket when its open event reports an error', async () => {
    const { outcome, transport } = await runDefaultRendererStartupFailure({ openMode: 'error' })

    expect(outcome.error).toMatchObject({ code: 'STARTUP_TIMEOUT' })
    expect(transport.socketUrls).toHaveLength(1)
    expect(transport.closeCalls).toBe(1)
  })

  it('bounds Renderer WebSocket opening by the remaining startup deadline', async () => {
    const { outcome, transport, elapsedMs } = await runDefaultRendererStartupFailure({ openMode: 'timeout' })

    expect(outcome.error).toMatchObject({ code: 'STARTUP_TIMEOUT' })
    expect(transport.socketUrls).toHaveLength(1)
    expect(transport.closeCalls).toBe(1)
    expect(elapsedMs).toBeLessThan(250)
  })

  it('bounds Renderer document evaluation by the same startup deadline', async () => {
    const { outcome, transport, elapsedMs } = await runDefaultRendererStartupFailure({ commandMode: 'timeout' })

    expect(outcome.error).toMatchObject({ code: 'STARTUP_TIMEOUT' })
    expect(transport.socketUrls).toHaveLength(1)
    expect(transport.closeCalls).toBe(1)
    expect(elapsedMs).toBeLessThan(250)
  })

  it('reports Renderer socket close failure as not ready and still stops the owned process', async () => {
    const { outcome, transport, harness } = await runDefaultRendererStartupFailure({ openMode: 'error', closeMode: 'throw' })

    expect(outcome.error).toMatchObject({ code: 'STARTUP_TIMEOUT' })
    expect(transport.closeCalls).toBe(1)
    expect(harness.signals).toEqual([[harness.pid, 'SIGTERM']])
  })

  it('aborts the default Renderer readiness request and clears its socket listeners and timers', async () => {
    const repositoryRoot = await temporaryRepository()
    const baseConfig = await fakeApplicationConfig()
    const config = parseDesktopE2EConfig({
      ...baseConfig,
      startup: {
        ...baseConfig.startup,
        startupTimeoutMs: 1_000,
        portReadyTimeoutMs: 1_000,
        stopTimeoutMs: 10,
        killTimeoutMs: 10,
        pollIntervalMs: 1,
      },
    })
    const harness = createFakeProcessHarness({ config })
    const transport = createDefaultRendererTransport({ config, openMode: 'timeout' })
    const controller = new AbortController()
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout
    const pendingTimers = new Set()
    vi.stubGlobal('setTimeout', (callback, milliseconds, ...args) => {
      let timer
      timer = originalSetTimeout((...callbackArgs) => {
        pendingTimers.delete(timer)
        callback(...callbackArgs)
      }, milliseconds, ...args)
      pendingTimers.add(timer)
      return timer
    })
    vi.stubGlobal('clearTimeout', timer => {
      pendingTimers.delete(timer)
      return originalClearTimeout(timer)
    })

    const startup = startProbe({
      repositoryRoot,
      config,
      signal: controller.signal,
      ...harness.options,
      rendererStatus: undefined,
    }).then(started => ({ started }), error => ({ error }))
    await transport.firstSocketCreated
    const abortTimer = originalSetTimeout(() => controller.abort(new Error('controlled cancellation')), 10)
    const outcome = await startup
    originalClearTimeout(abortTimer)

    expect(outcome.error?.run?.record.state).toBe('cancelled')
    expect(outcome.error?.run?.record.result.error).toMatch(/^CANCELLED:/u)
    expect(transport.closeCalls).toBe(1)
    expect([...transport.sockets[0].listeners.values()].every(listeners => listeners.size === 0)).toBe(true)
    expect(pendingTimers.size).toBe(0)
    expect(harness.signals).toEqual([[harness.pid, 'SIGTERM']])
  })

  it('tracks an early child exit while launch records are being persisted and still cleans it up', async () => {
    const repositoryRoot = await temporaryRepository()
    const baseConfig = await fakeApplicationConfig()
    const config = parseDesktopE2EConfig({
      ...baseConfig,
      startup: { ...baseConfig.startup, startupTimeoutMs: 20, portReadyTimeoutMs: 20 },
    })
    const harness = createFakeProcessHarness({ config, fakeClock: true })
    let earlyChild
    const spawnProcess = (...args) => {
      earlyChild = harness.options.spawnProcess(...args)
      queueMicrotask(() => {
        earlyChild.exitCode = 0
        earlyChild.emit('exit', 0, null)
      })
      return earlyChild
    }
    const startup = startProbe({ repositoryRoot, config, ...harness.options, spawnProcess })
    const outcome = await Promise.race([
      startup.then(started => ({ started }), error => ({ error })),
      new Promise(resolveTimeout => setTimeout(() => resolveTimeout({ timedOut: true }), 100)),
    ])

    if (outcome.timedOut) {
      earlyChild?.emit('exit', 0, null)
      await startup.catch(() => undefined)
    }

    expect(outcome.timedOut).toBeUndefined()
    expect(outcome.error).toMatchObject({ code: 'SINGLE_INSTANCE_LOCK_OR_EARLY_EXIT' })
    expect(outcome.error.run.record.state).toBe('failed')
    expect(outcome.error.run.record.result.portsReleased).toBe(true)
    expect(harness.signals).toEqual([[harness.pid, 'SIGTERM']])
  })

  it('checks cancellation after reading the development environment and before spawning', async () => {
    const repositoryRoot = await temporaryRepository()
    const runId = randomUUID()
    const baseConfig = await fakeApplicationConfig()
    const config = parseDesktopE2EConfig({
      ...baseConfig,
      modes: {
        ...baseConfig.modes,
        development: {
          ...baseConfig.modes.development,
          environmentRootRelativePath: `.local/desktop-e2e/${runId}/environment`,
          environmentFilePath: join(repositoryRoot, '.local/desktop-e2e', runId, 'test-credentials.env'),
          credentialEnvironmentNames: [],
          requiredEnvironmentNames: [],
        },
      },
    })
    const harness = createFakeProcessHarness({ config })
    const controller = new AbortController()
    const spawnProcess = vi.fn(harness.options.spawnProcess)

    const outcome = await startProbe({
      repositoryRoot,
      runId,
      mode: 'development',
      config,
      profilePatchAdapter: jsonYamlProfileAdapter(),
      ...harness.options,
      signal: controller.signal,
      spawnProcess,
      readEnvironmentFile: async () => {
        controller.abort(new Error('cancelled during environment loading'))
        return ''
      },
    }).then(started => ({ started }), error => ({ error }))

    expect(outcome.error).toMatchObject({
      name: 'AbortError',
      run: { record: { process: null, state: 'cancelled', result: { portsReleased: true } } },
    })
    expect(spawnProcess).not.toHaveBeenCalled()
    expect(harness.signals).toEqual([])
    await expect(access(outcome.error.run.record.environment.leasePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('cleans up a spawned process when closing a launch log handle fails', async () => {
    const repositoryRoot = await temporaryRepository()
    const runId = randomUUID()
    const baseConfig = await fakeApplicationConfig()
    const config = parseDesktopE2EConfig({
      ...baseConfig,
      modes: {
        ...baseConfig.modes,
        development: {
          ...baseConfig.modes.development,
          environmentRootRelativePath: `.local/desktop-e2e/${runId}/environment`,
          environmentFilePath: join(repositoryRoot, '.local/desktop-e2e', runId, 'test-credentials.env'),
          credentialEnvironmentNames: [],
          requiredEnvironmentNames: [],
        },
      },
    })
    const harness = createFakeProcessHarness({ config })
    const closeFailure = new Error('controlled log handle close failure')
    const handleCloseCalls = []
    let openCount = 0
    const openLog = vi.fn(async () => {
      const handleIndex = openCount
      openCount += 1
      let closeCount = 0
      return {
        fd: 100 + handleIndex,
        async close() {
          closeCount += 1
          handleCloseCalls[handleIndex] = closeCount
          if (handleIndex === 0 && closeCount === 1) throw closeFailure
        },
      }
    })

    const outcome = await startProbe({
      repositoryRoot,
      runId,
      mode: 'development',
      config,
      profilePatchAdapter: jsonYamlProfileAdapter(),
      ...harness.options,
      openLog,
    }).then(started => ({ started }), error => ({ error }))

    expect(outcome.error).toBe(closeFailure)
    expect(outcome.error.run.record).toMatchObject({
      state: 'failed',
      result: { portsReleased: true },
    })
    expect(handleCloseCalls).toEqual([2, 1])
    expect(harness.signals).toEqual([[harness.pid, 'SIGTERM']])
    await expect(access(outcome.error.run.record.environment.leasePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('releases its development lease when spawn fails before returning a PID', async () => {
    const repositoryRoot = await temporaryRepository()
    const baseConfig = await fakeApplicationConfig()
    const config = parseDesktopE2EConfig({
      ...baseConfig,
      modes: {
        ...baseConfig.modes,
        development: { ...baseConfig.modes.development, requiredEnvironmentNames: [] },
      },
    })
    const harness = createFakeProcessHarness({ config })
    const child = new EventEmitter()
    child.exitCode = null
    child.signalCode = null
    child.unref = () => undefined
    const spawnProcess = () => {
      queueMicrotask(() => {
        const error = new Error('spawn /tmp/Probe Test EACCES')
        error.code = 'EACCES'
        child.emit('error', error)
      })
      return child
    }

    const outcome = await startProbe({
      repositoryRoot,
      mode: 'development',
      config,
      ...harness.options,
      spawnProcess,
    }).then(started => ({ started }), error => ({ error }))

    expect(outcome.error).toMatchObject({ code: 'SPAWN_FAILED' })
    expect(outcome.error.run.record).toMatchObject({
      process: null,
      state: 'failed',
      result: { portsReleased: true },
    })
    await expect(access(outcome.error.run.record.environment.leasePath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(harness.signals).toEqual([])
  })

  it('stops the spawned process and reports evidence when the run record cannot be persisted', async () => {
    const repositoryRoot = await temporaryRepository()
    const config = await fakeApplicationConfig()
    const runId = randomUUID()
    const runRecordPath = join(repositoryRoot, config.paths.runRootRelativePath, runId, config.paths.runRecordFilename)
    const harness = createFakeProcessHarness({ config })
    const spawnProcess = (...args) => {
      const child = harness.options.spawnProcess(...args)
      unlinkSync(runRecordPath)
      mkdirSync(runRecordPath)
      return child
    }
    const outcome = await startProbe({ repositoryRoot, runId, config, ...harness.options, spawnProcess })
      .then(started => ({ started }), error => ({ error }))

    expect(outcome.error?.run?.record.state).toBe('failed')
    expect(outcome.error?.run?.record.result.portsReleased).toBe(true)
    expect(outcome.error?.persistenceFailure).toMatchObject({
      runRecordPath,
      failureEvidenceWritten: true,
      stopResultEvidenceWritten: true,
      portsReleased: true,
    })
    expect(harness.signals).toEqual([[harness.pid, 'SIGTERM']])
    const failureEvidencePath = join(
      repositoryRoot,
      config.paths.runRootRelativePath,
      runId,
      config.paths.directoryNames.evidence,
      config.paths.outputFilenames.failureEvidence,
    )
    expect(JSON.parse(await readFile(failureEvidencePath, 'utf8'))).toMatchObject({
      runId,
      code: 'EISDIR',
      portsReleased: true,
    })
  })

  it('waits for Host and a real ready Renderer document, then stops only the verified process group', async () => {
    const repositoryRoot = await temporaryRepository()
    const config = await fakeApplicationConfig()
    const harness = createFakeProcessHarness({ config })
    vi.stubEnv('ELECTRON_RUN_AS_NODE', '1')
    vi.stubEnv('OPENROUTER_API_KEY', 'ambient-test-value')
    const started = await startProbe({ repositoryRoot, config, ...harness.options })
    expect(started.record.state).toBe('running')
    expect(started.renderer).toMatchObject({ ready: true, readyState: 'complete', bodyTextLength: 1 })
    expect(harness.spawnEnvironment.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(harness.spawnEnvironment.OPENROUTER_API_KEY).toBeUndefined()
    expect(started.record.process.listeningPorts).toEqual(expect.arrayContaining([
      started.record.ports.host,
      started.record.ports.rendererCdp,
    ]))

    const status = await getProbeStatus({ repositoryRoot, runId: started.record.runId, ...harness.statusOptions })
    expect(status.processGroupMatchesRun).toBe(true)
    const stopped = await stopProbe({ repositoryRoot, runId: started.record.runId, ...harness.statusOptions })
    expect(stopped.record.state).toBe('stopped')
    expect(harness.signals).toEqual([[started.record.process.processGroupId, 'SIGTERM']])
    expect(JSON.parse(await readFile(join(started.record.directories.evidence, config.paths.outputFilenames.stopResultEvidence), 'utf8')).portsReleased).toBe(true)
  })

  it('does not pass the configured Desktop runner context to the launched application', async () => {
    const repositoryRoot = await temporaryRepository()
    const baseConfig = await fakeApplicationConfig()
    const invocationName = 'HARNESS_COMFYUI_CUSTOM_TEST_RUNNER_CONTEXT'
    const config = parseDesktopE2EConfig({
      ...baseConfig,
      commandRunner: { ...baseConfig.commandRunner, invocationDirectoryEnvironmentName: invocationName },
    })
    const defaultInvocationName = baseConfig.commandRunner.invocationDirectoryEnvironmentName
    const unrelatedName = 'UNRELATED_DESKTOP_APP_TEST_SETTING'
    const harness = createFakeProcessHarness({ config })
    vi.stubEnv(invocationName, 'runner-only-invocation-directory')
    vi.stubEnv(defaultInvocationName, 'unconfigured-runner-context')
    vi.stubEnv(unrelatedName, 'preserve-for-the-application')
    vi.stubEnv('OPENROUTER_API_KEY', 'ambient-test-value')
    const started = await startProbe({ repositoryRoot, config, ...harness.options })

    try {
      expect(started.record.launch.environment[invocationName]).toBeUndefined()
      expect(harness.spawnEnvironment[invocationName]).toBeUndefined()
      expect(harness.spawnEnvironment[defaultInvocationName]).toBe('unconfigured-runner-context')
      expect(harness.spawnEnvironment[unrelatedName]).toBe('preserve-for-the-application')
      expect(harness.spawnEnvironment.OPENROUTER_API_KEY).toBeUndefined()
      expect(harness.spawnEnvironment[config.invocation.environmentNames.dshHome]).toBe(started.record.directories.dshHome)
      expect(harness.spawnEnvironment[config.invocation.environmentNames.electronUserData]).toBe(started.record.directories.electronUserData)
      expect(harness.spawnEnvironment[config.invocation.environmentNames.hostInspectorPort]).toBe(String(started.record.ports.hostInspector))
    } finally {
      await stopProbe({ repositoryRoot, runId: started.record.runId, ...harness.statusOptions })
    }
  })

  it('does not accept open Host and CDP ports without a completed, visible application document', async () => {
    const repositoryRoot = await temporaryRepository()
    const config = await fakeApplicationConfig()
    const harness = createFakeProcessHarness({ config, rendererReady: false, fakeClock: true })
    await expect(startProbe({ repositoryRoot, config, ...harness.options })).rejects.toMatchObject({ code: 'STARTUP_TIMEOUT' })
    const runDirectory = join(repositoryRoot, config.paths.runRootRelativePath)
    const [runId] = await (await import('node:fs/promises')).readdir(runDirectory)
    const evidenceDirectory = join(runDirectory, runId, config.paths.directoryNames.evidence)
    const failure = JSON.parse(await readFile(join(evidenceDirectory, config.paths.outputFilenames.failureEvidence), 'utf8'))
    expect(failure.code).toBe('STARTUP_TIMEOUT')
    expect(harness.signals).toEqual([[harness.pid, 'SIGTERM']])
  })

  it('cancels after launch, saves evidence, and completes owned-process cleanup', async () => {
    const repositoryRoot = await temporaryRepository()
    const baseConfig = await fakeApplicationConfig()
    const config = parseDesktopE2EConfig({
      ...baseConfig,
      modes: {
        ...baseConfig.modes,
        development: { ...baseConfig.modes.development, requiredEnvironmentNames: [] },
      },
    })
    const controller = new AbortController()
    const harness = createFakeProcessHarness({
      config,
      listenersReady: false,
      sleep: async () => controller.abort(new Error('test cancellation')),
    })
    await expect(startProbe({ repositoryRoot, config, mode: 'development', signal: controller.signal, ...harness.options }))
      .rejects.toMatchObject({ code: 'ABORT_ERR' })
    const runDirectory = join(repositoryRoot, config.paths.runRootRelativePath)
    const [runId] = await (await import('node:fs/promises')).readdir(runDirectory)
    const record = JSON.parse(await readFile(join(runDirectory, runId, config.paths.runRecordFilename), 'utf8'))
    const evidence = JSON.parse(await readFile(join(runDirectory, runId, config.paths.directoryNames.evidence, config.paths.outputFilenames.failureEvidence), 'utf8'))
    expect(record.state).toBe('cancelled')
    expect(record.result.portsReleased).toBe(true)
    expect(evidence.code).toBe('CANCELLED')
    expect(harness.signals).toEqual([[harness.pid, 'SIGTERM']])
    await expect(access(record.environment.leasePath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await stat(record.directories.dshHome)).isDirectory()).toBe(true)
    expect((await stat(record.directories.electronUserData)).isDirectory()).toBe(true)
    const recordPath = join(runDirectory, runId, config.paths.runRecordFilename)
    const failureEvidencePath = join(runDirectory, runId, config.paths.directoryNames.evidence, config.paths.outputFilenames.failureEvidence)
    const stopResultEvidencePath = join(runDirectory, runId, config.paths.directoryNames.evidence, config.paths.outputFilenames.stopResultEvidence)
    const originalRecord = await readFile(recordPath, 'utf8')
    const originalFailureEvidence = await readFile(failureEvidencePath, 'utf8')
    const originalStopResultEvidence = await readFile(stopResultEvidencePath, 'utf8')
    const stoppedAgain = await stopProbe({ repositoryRoot, runId, config, ...harness.statusOptions })
    expect(stoppedAgain.record).toEqual(record)
    expect(await readFile(recordPath, 'utf8')).toBe(originalRecord)
    expect(await readFile(failureEvidencePath, 'utf8')).toBe(originalFailureEvidence)
    expect(await readFile(stopResultEvidencePath, 'utf8')).toBe(originalStopResultEvidence)
    expect(harness.signals).toEqual([[harness.pid, 'SIGTERM']])
  })

  it('keeps a cleaned startup failure unchanged when stopProbe is called again', async () => {
    const repositoryRoot = await temporaryRepository()
    const baseConfig = await fakeApplicationConfig()
    const config = parseDesktopE2EConfig({
      ...baseConfig,
      startup: {
        ...baseConfig.startup,
        startupTimeoutMs: 2,
        portReadyTimeoutMs: 2,
        stopTimeoutMs: 5,
        killTimeoutMs: 5,
        pollIntervalMs: 1,
      },
      modes: {
        ...baseConfig.modes,
        development: { ...baseConfig.modes.development, requiredEnvironmentNames: [] },
      },
    })
    const harness = createFakeProcessHarness({ config, rendererReady: false, fakeClock: true })
    let lastGroup = null
    const inspect = async pid => {
      const group = await harness.options.inspect(pid)
      if (group !== null) lastGroup = group
      return group
    }
    const outcome = await startProbe({
      repositoryRoot,
      config,
      mode: 'development',
      ...harness.options,
      inspect,
      rendererStatus: async () => ({ ready: false }),
    }).then(started => ({ started }), error => ({ error }))
    const record = outcome.error?.run?.record
    const recordContents = await readFile(outcome.error.run.recordPath, 'utf8')
    const failureEvidencePath = join(record.directories.evidence, config.paths.outputFilenames.failureEvidence)
    const stopResultEvidencePath = join(record.directories.evidence, config.paths.outputFilenames.stopResultEvidence)
    const failureEvidence = await readFile(failureEvidencePath, 'utf8')
    const stopResultEvidence = await readFile(stopResultEvidencePath, 'utf8')

    const expectedStop = {
      repositoryRoot,
      runId: record.runId,
      config,
      inspect,
      portOwners: harness.options.portOwners,
      signalProcessGroup: harness.signalProcessGroup,
    }
    const foreignPortOwners = async ports => ports.map(port => ({
      port,
      pids: port === record.ports.host ? [harness.pid + 10] : [],
    }))
    await expect(stopProbe({ ...expectedStop, inspect: async () => null, portOwners: foreignPortOwners }))
      .rejects.toMatchObject({ code: 'PROCESS_IDENTITY_MISMATCH' })
    await expect(stopProbe({ ...expectedStop, inspect: async () => lastGroup }))
      .rejects.toMatchObject({ code: 'PROCESS_IDENTITY_MISMATCH' })

    const reusedPidAlive = vi.fn(async pid => pid === record.process.pid)
    await expect(stopProbe({ ...expectedStop, inspect: async () => null, processIsAlive: reusedPidAlive }))
      .rejects.toMatchObject({ code: 'PROCESS_IDENTITY_MISMATCH' })
    expect(reusedPidAlive).toHaveBeenCalledWith(record.process.pid)
    expect(harness.signals).toEqual([[harness.pid, 'SIGTERM']])

    await writeFile(record.environment.leasePath, `${JSON.stringify({
      schemaVersion: 1,
      runId: record.runId,
      processId: process.pid,
      createdAt: new Date().toISOString(),
    })}\n`)
    const stoppedAfterReleasingOwnLease = await stopProbe(expectedStop)
    expect(stoppedAfterReleasingOwnLease.record).toEqual(record)
    await expect(access(record.environment.leasePath)).rejects.toMatchObject({ code: 'ENOENT' })

    const nextRunId = randomUUID()
    await writeFile(record.environment.leasePath, `${JSON.stringify({
      schemaVersion: 1,
      runId: nextRunId,
      processId: process.pid,
      createdAt: new Date().toISOString(),
    })}\n`)
    await expect(stopProbe(expectedStop)).rejects.toMatchObject({ code: 'DEVELOPMENT_ENVIRONMENT_LEASE_MISMATCH' })
    await rm(record.environment.leasePath)

    const stoppedAgain = await stopProbe({
      ...expectedStop,
    })

    expect(outcome.error).toMatchObject({ code: 'STARTUP_TIMEOUT' })
    expect(record).toMatchObject({ state: 'failed', result: { error: expect.stringMatching(/^STARTUP_TIMEOUT:/u), portsReleased: true } })
    expect(lastGroup).not.toBeNull()
    expect(stoppedAgain.record).toEqual(record)
    expect(await readFile(outcome.error.run.recordPath, 'utf8')).toBe(recordContents)
    expect(await readFile(failureEvidencePath, 'utf8')).toBe(failureEvidence)
    expect(await readFile(stopResultEvidencePath, 'utf8')).toBe(stopResultEvidence)
    expect(harness.signals).toEqual([[harness.pid, 'SIGTERM']])
    await expect(access(record.environment.leasePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('passes configured development environment values only to the child process', async () => {
    const repositoryRoot = await temporaryRepository()
    const config = await fakeApplicationConfig()
    const harness = createFakeProcessHarness({ config })
    const injectedValue = 'unit-test-only-value'
    const started = await startProbe({
      repositoryRoot,
      ...harness.options,
      config,
      mode: 'development',
      readEnvironmentFile: async () => `OPENROUTER_API_KEY=${injectedValue}\nUNRELATED_SETTING=omit-this\n`,
    })
    try {
      expect(harness.spawnEnvironment.OPENROUTER_API_KEY).toBe(injectedValue)
      expect(harness.spawnEnvironment.UNRELATED_SETTING).toBeUndefined()
      const recordJson = await readFile(started.recordPath, 'utf8')
      const readyEvidence = await readFile(join(
        started.record.directories.evidence,
        config.paths.outputFilenames.startupReadyEvidence,
      ), 'utf8')
      expect(recordJson).not.toContain(injectedValue)
      expect(readyEvidence).not.toContain(injectedValue)
      expect(started.record.launch.environment.OPENROUTER_API_KEY).toBeUndefined()
    } finally {
      await stopProbe({ repositoryRoot, runId: started.record.runId, ...harness.statusOptions })
    }
  })

  it('uses a UUID-scoped config override to inspect and stop its initialized environment', async () => {
    const repositoryRoot = await temporaryRepository()
    const runId = randomUUID()
    const config = perRunDevelopmentConfig(await loadDesktopE2EConfig(), repositoryRoot, runId)
    const harness = createFakeProcessHarness({ config })
    const started = await startProbe({
      repositoryRoot,
      runId,
      mode: 'development',
      config,
      profilePatchAdapter: jsonYamlProfileAdapter(),
      ...harness.options,
    })

    try {
      const status = await getProbeStatus({ repositoryRoot, runId, config, ...harness.statusOptions })
      expect(status.record.environment.root).toBe(started.developmentEnvironment.environmentRoot)
      expect(status.developmentEnvironment).toMatchObject({
        environmentRoot: started.developmentEnvironment.environmentRoot,
        environmentExists: true,
      })

      const stopped = await stopProbe({ repositoryRoot, runId, config, ...harness.statusOptions })
      expect(stopped.record.state).toBe('stopped')
      await expect(access(started.developmentEnvironment.leasePath)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await readFile(stopped.recordPath, 'utf8')).toContain('"state": "stopped"')
    } finally {
      await started.developmentEnvironment.release()
      await releasePortReservations(runId)
    }
  })

  it('validates config overrides before status reads or stop signals', async () => {
    const repositoryRoot = await temporaryRepository()
    const prepared = await prepareProbeRun({ repositoryRoot })
    const invalidConfig = { schemaVersion: -1 }
    try {
      await expect(getProbeStatus({ repositoryRoot, runId: prepared.record.runId, config: invalidConfig }))
        .rejects.toThrow(/schemaVersion/u)
      await expect(stopProbe({ repositoryRoot, runId: prepared.record.runId, config: invalidConfig }))
        .rejects.toThrow(/schemaVersion/u)
    } finally {
      await releasePortReservations(prepared.record.runId)
    }
  })

  it('binds status reads to the configured application and exact repository run directory before OS inspection', async () => {
    const repositoryRoot = await temporaryRepository()
    const prepared = await prepareProbeRun({ repositoryRoot })
    const originalRecord = await readFile(prepared.recordPath, 'utf8')
    const inspect = vi.fn(async () => null)
    const portOwners = vi.fn(async ports => ports.map(port => ({ port, pids: [] })))
    const getStatus = options => getProbeStatus({
      repositoryRoot,
      runId: prepared.record.runId,
      inspect,
      portOwners,
      ...options,
    })
    try {
      const wrongApplication = structuredClone(prepared.record)
      wrongApplication.application.version = '9.9.9'
      await writeFile(prepared.recordPath, `${JSON.stringify(wrongApplication)}\n`)
      await expect(getStatus()).rejects.toMatchObject({ code: 'RUN_IDENTITY_MISMATCH' })
      expect(inspect).not.toHaveBeenCalled()
      expect(portOwners).not.toHaveBeenCalled()

      await writeFile(prepared.recordPath, originalRecord)
      const wrongRun = structuredClone(prepared.record)
      const alternateRun = join(prepared.record.directories.run, 'foreign-run')
      wrongRun.directories = {
        run: alternateRun,
        dshHome: join(alternateRun, prepared.config.paths.directoryNames.dshHome),
        electronUserData: join(alternateRun, prepared.config.paths.directoryNames.electronUserData),
        workspace: join(alternateRun, prepared.config.paths.directoryNames.workspace),
        logs: join(alternateRun, prepared.config.paths.directoryNames.logs),
        evidence: join(alternateRun, prepared.config.paths.directoryNames.evidence),
        profile: join(alternateRun, prepared.config.paths.directoryNames.dshHome, prepared.config.paths.profileRelativePath),
        diagnosticFile: join(alternateRun, prepared.config.paths.directoryNames.logs, prepared.config.paths.diagnosticFilename),
      }
      await writeFile(prepared.recordPath, `${JSON.stringify(wrongRun)}\n`)
      await expect(getStatus()).rejects.toMatchObject({ code: 'RUN_IDENTITY_MISMATCH' })
      expect(inspect).not.toHaveBeenCalled()
      expect(portOwners).not.toHaveBeenCalled()

      await writeFile(prepared.recordPath, originalRecord)
      const wrongWorkspace = structuredClone(prepared.record)
      wrongWorkspace.directories.workspace = join(wrongWorkspace.directories.run, 'foreign-workspace')
      await writeFile(prepared.recordPath, `${JSON.stringify(wrongWorkspace)}\n`)
      await expect(getStatus()).rejects.toMatchObject({ code: 'RUN_IDENTITY_MISMATCH' })
      expect(inspect).not.toHaveBeenCalled()
      expect(portOwners).not.toHaveBeenCalled()

      await writeFile(join(repositoryRoot, 'foreign-run.json'), originalRecord)
      await rm(prepared.recordPath)
      await symlink(join(repositoryRoot, 'foreign-run.json'), prepared.recordPath)
      await expect(getStatus()).rejects.toMatchObject({ code: 'RUN_IDENTITY_MISMATCH' })
      expect(inspect).not.toHaveBeenCalled()
      expect(portOwners).not.toHaveBeenCalled()
    } finally {
      await releasePortReservations(prepared.record.runId)
    }
  })

  it('binds persistent home, user-data, workspace, and lease paths to the configured shared environment', async () => {
    const repositoryRoot = await temporaryRepository()
    const config = await fakeApplicationConfig()
    const prepared = await prepareProbeRun({
      repositoryRoot,
      mode: 'development',
      config,
      profilePatchAdapter: jsonYamlProfileAdapter(),
    })
    try {
      const wrongEnvironment = structuredClone(prepared.record)
      const foreignRoot = join(repositoryRoot, '.local/desktop-development/foreign-environment')
      wrongEnvironment.environment = {
        root: foreignRoot,
        leasePath: join(foreignRoot, config.modes.development.leaseFilename),
      }
      for (const key of ['dshHome', 'electronUserData', 'workspace']) {
        wrongEnvironment.directories[key] = join(foreignRoot, config.modes.development.directoryNames[key])
      }
      wrongEnvironment.directories.profile = join(
        wrongEnvironment.directories.dshHome,
        config.paths.profileRelativePath,
      )
      await writeFile(prepared.recordPath, `${JSON.stringify(wrongEnvironment)}\n`)
      const inspect = vi.fn(async () => null)
      const portOwners = vi.fn(async ports => ports.map(port => ({ port, pids: [] })))
      await expect(getProbeStatus({ repositoryRoot, runId: prepared.record.runId, config, inspect, portOwners }))
        .rejects.toMatchObject({ code: 'RUN_IDENTITY_MISMATCH' })
      expect(inspect).not.toHaveBeenCalled()
      expect(portOwners).not.toHaveBeenCalled()
    } finally {
      await prepared.developmentEnvironment.release()
      await releasePortReservations(prepared.record.runId)
    }
  })

  it('refuses to signal a verified run when one assigned port has a foreign owner', async () => {
    const repositoryRoot = await temporaryRepository()
    const runId = randomUUID()
    const config = perRunDevelopmentConfig(await fakeApplicationConfig(), repositoryRoot, runId)
    const harness = createFakeProcessHarness({ config })
    const started = await startProbe({ repositoryRoot, runId, mode: 'development', config, ...harness.options })
    const portOwners = async ports => ports.map(port => ({ port, pids: port === started.record.ports.host ? [99999] : [harness.pid] }))
    try {
      const status = await getProbeStatus({ repositoryRoot, runId, config, ...harness.statusOptions })
      expect(status.processGroupMatchesRun).toBe(true)
      await expect(stopProbe({
        repositoryRoot,
        runId,
        config,
        inspect: harness.inspect,
        portOwners,
        signalProcessGroup: harness.signalProcessGroup,
      })).rejects.toMatchObject({ code: 'PROCESS_IDENTITY_MISMATCH' })
      expect(harness.signals).toEqual([])
      const cleanupFailure = JSON.parse(await readFile(join(
        started.record.directories.evidence,
        config.paths.outputFilenames.cleanupFailureEvidence,
      ), 'utf8'))
      expect(cleanupFailure.code).toBe('PROCESS_IDENTITY_MISMATCH')
    } finally {
      await started.developmentEnvironment.release()
      await releasePortReservations(runId)
    }
  })

  it('checks development lease ownership before sending a stop signal', async () => {
    const repositoryRoot = await temporaryRepository()
    const runId = randomUUID()
    const config = perRunDevelopmentConfig(await fakeApplicationConfig(), repositoryRoot, runId)
    const harness = createFakeProcessHarness({ config })
    const started = await startProbe({ repositoryRoot, runId, mode: 'development', config, ...harness.options })
    const leasePath = started.record.environment.leasePath
    const replacementRunId = randomUUID()
    const replacementLease = `${JSON.stringify({
      schemaVersion: 1,
      runId: replacementRunId,
      processId: process.pid,
      createdAt: new Date().toISOString(),
    })}\n`

    try {
      await writeFile(leasePath, replacementLease)
      await expect(stopProbe({ repositoryRoot, runId, config, ...harness.statusOptions }))
        .rejects.toMatchObject({ code: 'DEVELOPMENT_ENVIRONMENT_LEASE_MISMATCH' })
      expect(harness.signals).toEqual([])
      expect(await readFile(leasePath, 'utf8')).toBe(replacementLease)
    } finally {
      await writeFile(leasePath, `${JSON.stringify({
        schemaVersion: 1,
        runId,
        processId: process.pid,
        createdAt: new Date().toISOString(),
      })}\n`)
      if (harness.signals.length === 0) {
        await stopProbe({ repositoryRoot, runId, config, ...harness.statusOptions })
      }
      await releasePortReservations(runId)
    }
  })

  it('waits for remaining child processes after the recorded group leader exits', async () => {
    const repositoryRoot = await temporaryRepository()
    const config = await fakeApplicationConfig()
    const harness = createFakeProcessHarness({ config })
    const started = await startProbe({ repositoryRoot, config, ...harness.options })
    const fullGroup = await harness.inspect(started.record.process.processGroupId)
    const remainingChild = {
      processGroupId: started.record.process.processGroupId,
      members: [{
        pid: harness.pid + 1,
        parentPid: harness.pid,
        processGroupId: started.record.process.processGroupId,
        command: 'packaged desktop host child',
        workingDirectory: started.record.directories.workspace,
        listeningPorts: [],
      }],
    }
    let termSent = false
    let postSignalInspection = 0
    const inspect = async () => {
      if (!termSent) return fullGroup
      postSignalInspection += 1
      return postSignalInspection < 3 ? remainingChild : null
    }
    const portOwners = async ports => ports.map(port => ({ port, pids: termSent ? [] : [harness.pid] }))
    const signalProcessGroup = async () => { termSent = true }

    const stopped = await stopProbe({
      repositoryRoot,
      runId: started.record.runId,
      config,
      inspect,
      portOwners,
      signalProcessGroup,
      sleep: async () => undefined,
    })

    expect(stopped.record.state).toBe('stopped')
    expect(postSignalInspection).toBe(3)
  })

  it.each(['owned', 'lease-changed', 'foreign-port'])('checks ownership before forced stop: %s', async scenario => {
    const repositoryRoot = await temporaryRepository()
    const runId = randomUUID()
    const config = perRunDevelopmentConfig(await fakeApplicationConfig(), repositoryRoot, runId)
    const harness = createFakeProcessHarness({ config })
    const started = await startProbe({ repositoryRoot, runId, mode: 'development', config, ...harness.options })
    const leasePath = started.record.environment.leasePath
    const originalLease = await readFile(leasePath, 'utf8')
    const signals = []
    let foreignPort = false
    let clock = 0
    const signalProcessGroup = async (group, signal) => {
      signals.push([group, signal])
      if (signal === 'SIGKILL') return harness.signalProcessGroup(group, signal)
      if (scenario === 'lease-changed') {
        await writeFile(leasePath, JSON.stringify({
          schemaVersion: 1, runId: randomUUID(), processId: process.pid, createdAt: new Date().toISOString(),
        }))
      }
      if (scenario === 'foreign-port') foreignPort = true
    }
    const portOwners = async ports => ports.map(port => ({
      port, pids: foreignPort && port === started.record.ports.host ? [harness.pid + 100] : [harness.pid],
    }))
    try {
      const stopped = stopProbe({
        repositoryRoot, runId, config, inspect: harness.inspect,
        portOwners: async ports => (await harness.inspect(harness.pid)) === null
          ? ports.map(port => ({ port, pids: [] })) : portOwners(ports),
        signalProcessGroup, now: () => clock, sleep: async () => { clock += config.startup.stopTimeoutMs },
      })
      if (scenario === 'owned') {
        expect((await stopped).record.state).toBe('stopped')
        expect(signals).toEqual([[harness.pid, 'SIGTERM'], [harness.pid, 'SIGKILL']])
      } else {
        await expect(stopped).rejects.toMatchObject({
          code: scenario === 'lease-changed' ? 'DEVELOPMENT_ENVIRONMENT_LEASE_MISMATCH' : 'PROCESS_IDENTITY_MISMATCH',
        })
        expect(signals).toEqual([[harness.pid, 'SIGTERM']])
        expect(await harness.inspect(harness.pid)).not.toBeNull()
      }
    } finally {
      await writeFile(leasePath, originalLease)
      await harness.signalProcessGroup(harness.pid, 'SIGTERM')
      await started.developmentEnvironment.release()
      await releasePortReservations(runId)
    }
  })
})

describe('persistent worktree development environment', () => {
  it('parses only configured child environment variables without changing the parent process', async () => {
    const environmentFilePath = '/repo/.env'
    const before = process.env.OPENROUTER_API_KEY
    const source = [
      'OPENROUTER_API_KEY=unit-test-only-value',
      "OPENCODE_GO_API_KEY='optional-unit-test-value'",
      'UNRELATED_SETTING=keep-out-of-child',
    ].join('\n')
    const overrides = await loadDevelopmentEnvironmentOverrides({
      environmentFilePath,
      environmentNames: ['OPENROUTER_API_KEY', 'OPENCODE_GO_API_KEY'],
      requiredEnvironmentNames: ['OPENROUTER_API_KEY'],
      readEnvironmentFile: async path => {
        expect(path).toBe(environmentFilePath)
        return source
      },
    })

    expect(Object.keys(overrides)).toEqual(['OPENROUTER_API_KEY', 'OPENCODE_GO_API_KEY'])
    expect(process.env.OPENROUTER_API_KEY).toBe(before)
  })

  it('fails without disclosing environment file contents when a required value is absent', async () => {
    const environmentFilePath = '/repo/.env'
    const failure = await loadDevelopmentEnvironmentOverrides({
      environmentFilePath,
      environmentNames: ['OPENROUTER_API_KEY', 'OPENCODE_GO_API_KEY'],
      requiredEnvironmentNames: ['OPENROUTER_API_KEY'],
      readEnvironmentFile: async () => 'OPENCODE_GO_API_KEY=unit-test-only-value',
    }).catch(error => error)

    expect(failure).toMatchObject({ code: 'DEVELOPMENT_ENVIRONMENT_VARIABLE_MISSING' })
    expect(failure.message).toContain('OPENROUTER_API_KEY')
    expect(failure.message).not.toContain('unit-test-only-value')
  })

  it('reuses fixed DSH home, Electron user-data, and Workspace paths without claiming official initialization', async () => {
    const repositoryRoot = await temporaryRepository()
    const config = await loadDesktopE2EConfig()
    const first = await prepareDevelopmentEnvironment({
      repositoryRoot,
      runId: '5b7011a8-69e2-4788-805b-0ea2c3fb5537',
      config,
    })
    const settingsPath = join(first.directories.dshHome, 'user-setting.txt')
    const settingBytes = 'user-owned-setting=preserved\n'
    try {
      expect(first.environmentExistsBefore).toBe(false)
      expect(first.initializationStatus).toBe('unverified')
      expect(first.directories.dshHome).toBe(join(repositoryRoot, '.local/desktop-development/official-environment/dsh-home'))
      expect(first.directories.electronUserData).toBe(join(repositoryRoot, '.local/desktop-development/official-environment/user-data'))
      expect(first.directories.workspace).toBe(join(repositoryRoot, '.local/desktop-development/official-environment/workspace'))
      await writeFile(settingsPath, settingBytes, { mode: 0o600 })
      await expect(prepareDevelopmentEnvironment({
        repositoryRoot,
        runId: '68b00d2e-6df4-4af6-a8dc-35b9de3ac354',
        config,
      })).rejects.toMatchObject({ code: 'DEVELOPMENT_ENVIRONMENT_BUSY' })
      await first.release()

      const second = await prepareDevelopmentEnvironment({
        repositoryRoot,
        runId: 'e2fc1fe0-cbc9-4f37-b9d4-e322edc34db7',
        config,
      })
      try {
        expect(second.environmentExistsBefore).toBe(true)
        expect(second.initializationStatus).toBe('unverified')
        expect(second.directories).toEqual(first.directories)
        expect(await readFile(settingsPath, 'utf8')).toBe(settingBytes)
      } finally {
        await second.release()
      }
    } finally {
      await first.release()
    }
  })

  it('keeps shared development state and per-run logs separate across repeated preparations', async () => {
    const repositoryRoot = await temporaryRepository()
    const first = await prepareProbeRun({ repositoryRoot, mode: 'development' })
    try {
      expect(first.record.mode).toBe('development')
      expect(first.record.environment.root).toBe(first.developmentEnvironment.environmentRoot)
      expect(first.developmentEnvironment.initializationStatus).toBe('unverified')
      expect(first.record.directories.dshHome).toBe(first.developmentEnvironment.directories.dshHome)
      expect(first.record.directories.electronUserData).toBe(first.developmentEnvironment.directories.electronUserData)
      expect(first.record.directories.workspace).toBe(first.developmentEnvironment.directories.workspace)
      expect(first.record.directories.run).toContain('.local/desktop-e2e/')
      const firstProfilePatch = JSON.parse(await readFile(join(
        first.record.directories.profile,
        first.config.paths.profilePatchFilename,
      ), 'utf8'))
      expect(firstProfilePatch.slice(0, -1)).toEqual(first.config.modes.development.initialProfilePatches)
      expect(firstProfilePatch.at(-1)).toEqual({
        id: first.config.profilePortPatch.entryId,
        config: {
          [first.config.profilePortPatch.hostField]: first.config.ports.host,
          [first.config.profilePortPatch.portField]: first.record.ports.host,
        },
      })
      await expect(prepareProbeRun({ repositoryRoot, mode: 'development' }))
        .rejects.toMatchObject({ code: 'DEVELOPMENT_ENVIRONMENT_BUSY' })

      await first.developmentEnvironment.release()
      await releasePortReservations(first.record.runId)
      const second = await prepareProbeRun({
        repositoryRoot,
        mode: 'development',
        profilePatchAdapter: jsonYamlProfileAdapter(),
      })
      try {
        expect(second.record.directories.dshHome).toBe(first.record.directories.dshHome)
        expect(second.record.directories.electronUserData).toBe(first.record.directories.electronUserData)
        expect(second.record.directories.workspace).toBe(first.record.directories.workspace)
        expect(second.record.launch.environment.DSH_HOME).toBe(first.record.launch.environment.DSH_HOME)
        expect(second.record.launch.arguments).toContain(`--user-data-dir=${first.record.directories.electronUserData}`)
        expect(second.record.directories.run).not.toBe(first.record.directories.run)
        expect(second.record.directories.logs).not.toBe(first.record.directories.logs)
        expect(second.record.directories.evidence).not.toBe(first.record.directories.evidence)
        expect(new Set(Object.values(second.record.ports)).size).toBe(second.config.ports.roles.length)
        expect(second.developmentEnvironment.environmentExistsBefore).toBe(true)
        expect(second.developmentEnvironment.initializationStatus).toBe('unverified')
        const status = await getProbeStatus({
          repositoryRoot,
          runId: second.record.runId,
          inspect: async () => null,
          portOwners: async ports => ports.map(port => ({ port, pids: [] })),
        })
        expect(status.developmentEnvironment).toMatchObject({ environmentExists: true, initializationStatus: 'unverified' })
      } finally {
        await second.developmentEnvironment.release()
        await releasePortReservations(second.record.runId)
      }
    } finally {
      await first.developmentEnvironment.release()
      await releasePortReservations(first.record.runId)
    }
  })

  it('requires an explicit parser before updating an existing official YAML profile and preserves the original on failure', async () => {
    const repositoryRoot = await temporaryRepository()
    const initial = await prepareProbeRun({ repositoryRoot, mode: 'development' })
    const profilePath = join(initial.record.directories.profile, initial.config.paths.profilePatchFilename)
    const officialYaml = [
      '- id: agent-default-model',
      '  config:',
      '    provider: openrouter',
      '    model: user-selected-model',
      '- id: llm-pi-ai',
      '  config:',
      '    providers:',
      '      openrouter:',
      '        apiKeyEnv: OPENROUTER_API_KEY',
      '        models:',
      '          - id: user-selected-model',
      '            input: [text, image]',
      '            contextWindow: 125000',
      '            maxTokens: 4096',
      '    requestTemplate: !!js/function >',
      '      function makeRequest(context) { return context.model }',
      '- id: webserver',
      '  config:',
      '    host: 127.0.0.1',
      '    port: 19387',
      '    path: /api',
      '',
    ].join('\n')
    try {
      await writeFile(profilePath, officialYaml, 'utf8')
      await initial.developmentEnvironment.release()
      await releasePortReservations(initial.record.runId)

      const parserRequiredFailure = await prepareProbeRun({ repositoryRoot, mode: 'development' }).catch(error => error)
      expect(parserRequiredFailure).toMatchObject({
        code: 'DEVELOPMENT_PROFILE_PARSER_REQUIRED',
        preparationFailure: { evidenceWritten: true },
      })
      expect(parserRequiredFailure.message).toContain(profilePath)
      expect(parserRequiredFailure.message).toContain('preserves other settings')
      expect(await readFile(profilePath, 'utf8')).toBe(officialYaml)
      await expect(access(join(initial.record.environment.root, initial.config.modes.development.leaseFilename)))
        .rejects.toMatchObject({ code: 'ENOENT' })
      const parserRequiredEvidence = JSON.parse(await readFile(parserRequiredFailure.preparationFailure.evidencePath, 'utf8'))
      expect(parserRequiredEvidence).toMatchObject({
        code: 'DEVELOPMENT_PROFILE_PARSER_REQUIRED',
        mode: 'development',
        cleanup: { portsReleased: true, environmentLease: 'released' },
      })
      await expect(access(join(dirname(parserRequiredFailure.preparationFailure.evidencePath), initial.config.paths.runRecordFilename)))
        .rejects.toMatchObject({ code: 'ENOENT' })

      const invalidAdapterFailure = await prepareProbeRun({
        repositoryRoot,
        mode: 'development',
        profilePatchAdapter: { parse() {} },
      }).catch(error => error)
      expect(invalidAdapterFailure).toMatchObject({
        code: 'DEVELOPMENT_PROFILE_PARSER_INVALID',
        preparationFailure: { evidenceWritten: true },
      })
      expect(await readFile(profilePath, 'utf8')).toBe(officialYaml)
      expect(JSON.parse(await readFile(invalidAdapterFailure.preparationFailure.evidencePath, 'utf8')).cleanup)
        .toEqual({ portsReleased: true, environmentLease: 'released' })

      const privateYamlMarker = 'private-profile-text-test-marker'
      const parserError = new TypeError(privateYamlMarker)
      const invalidProfileFailure = await prepareProbeRun({
        repositoryRoot,
        mode: 'development',
        profilePatchAdapter: {
          parse() { throw parserError },
          updateProfilePatch() { throw new Error('unreachable') },
          serialize() { throw new Error('unreachable') },
        },
      }).catch(error => error)
      expect(invalidProfileFailure).toMatchObject({
        code: 'DEVELOPMENT_PROFILE_PATCH_INVALID',
        preparationFailure: { evidenceWritten: true },
      })
      expect(invalidProfileFailure.message).not.toContain(privateYamlMarker)
      expect(invalidProfileFailure.message).not.toContain('user-selected-model')
      expect(invalidProfileFailure.cause).toBeUndefined()
      const invalidProfileEvidence = await readFile(invalidProfileFailure.preparationFailure.evidencePath, 'utf8')
      expect(invalidProfileEvidence).not.toContain(privateYamlMarker)
      expect(JSON.parse(invalidProfileEvidence).errorType).toBe('TypeError')
      const concurrentlyUpdatedYaml = `${officialYaml}# user saved settings during preparation\n`
      await expect(prepareProbeRun({
        repositoryRoot,
        mode: 'development',
        profilePatchAdapter: {
          parse: source => ({ source }),
          async updateProfilePatch(document) {
            await writeFile(profilePath, concurrentlyUpdatedYaml, 'utf8')
            return document
          },
          serialize: document => document.source,
        },
      })).rejects.toMatchObject({ code: 'DEVELOPMENT_PROFILE_PATCH_CHANGED' })
      expect(await readFile(profilePath, 'utf8')).toBe(concurrentlyUpdatedYaml)
    } finally {
      await initial.developmentEnvironment.release()
      await releasePortReservations(initial.record.runId)
    }
  })

  it('records preparation cancellation after acquiring ports and the environment lease, then releases both', async () => {
    const repositoryRoot = await temporaryRepository()
    const first = await prepareProbeRun({ repositoryRoot, mode: 'development' })
    const profilePath = join(first.record.directories.profile, first.config.paths.profilePatchFilename)
    const profileBeforeCancellation = await readFile(profilePath, 'utf8')
    const controller = new AbortController()
    try {
      await first.developmentEnvironment.release()
      await releasePortReservations(first.record.runId)

      const cancellation = await prepareProbeRun({
        repositoryRoot,
        mode: 'development',
        signal: controller.signal,
        profilePatchAdapter: {
          parse(source) {
            controller.abort(new Error('cancel the preparation test'))
            return { source }
          },
          updateProfilePatch(document) { return document },
          serialize(document) { return document.source },
        },
      }).catch(error => error)

      expect(cancellation).toMatchObject({
        code: 'ABORT_ERR',
        preparationFailure: { evidenceWritten: true },
      })
      const evidence = JSON.parse(await readFile(cancellation.preparationFailure.evidencePath, 'utf8'))
      expect(evidence).toMatchObject({
        code: 'ABORT_ERR',
        errorType: 'AbortError',
        cleanup: { portsReleased: true, environmentLease: 'released' },
      })
      await expect(access(join(dirname(cancellation.preparationFailure.evidencePath), first.config.paths.runRecordFilename)))
        .rejects.toMatchObject({ code: 'ENOENT' })
      await expect(access(join(first.record.environment.root, first.config.modes.development.leaseFilename)))
        .rejects.toMatchObject({ code: 'ENOENT' })
      expect(await readFile(profilePath, 'utf8')).toBe(profileBeforeCancellation)
    } finally {
      await first.developmentEnvironment.release()
      await releasePortReservations(first.record.runId)
    }
  })

  it('updates only the webserver host and port through the injected YAML adapter', async () => {
    const repositoryRoot = await temporaryRepository()
    const first = await prepareProbeRun({ repositoryRoot, mode: 'development' })
    const profilePath = join(first.record.directories.profile, first.config.paths.profilePatchFilename)
    const officialYaml = [
      '- id: agent-default-model',
      '  config:',
      '    provider: openrouter',
      '    model: user-selected-model',
      '- id: llm-pi-ai',
      '  config:',
      '    providers:',
      '      openrouter:',
      '        displayName: Saved OpenRouter',
      '        api: openai-completions',
      '        baseURL: https://gateway.example/v1',
      '        apiKeyEnv: OPENROUTER_API_KEY',
      '        models:',
      '          - id: user-selected-model',
      '            input: [text, image]',
      '            contextWindow: 125000',
      '            maxTokens: 4096',
      '    requestTemplate: !!js/function >',
      '      function makeRequest(context) { return context.model }',
      '- id: webserver',
      '  config:',
      '    host: 127.0.0.1',
      '    port: 19387',
      '    path: /api',
      '',
    ].join('\n')
    let seenDocument
    const profilePatchAdapter = {
      parse(source) {
        expect(source).toBe(officialYaml)
        seenDocument = {
          providerYaml: source.slice(0, source.indexOf('- id: webserver')),
          webserver: { host: '127.0.0.1', port: 19387, path: '/api' },
        }
        return seenDocument
      },
      updateProfilePatch(document, { entryId, config: patch }) {
        expect(entryId).toBe(first.config.profilePortPatch.entryId)
        expect(patch).toEqual({ host: first.config.ports.host, port: expect.any(Number) })
        return {
          ...document,
          webserver: { ...document.webserver, host: patch.host, port: patch.port },
        }
      },
      serialize(document) {
        return `${document.providerYaml}- id: webserver\n  config:\n    host: ${document.webserver.host}\n    port: ${document.webserver.port}\n    path: ${document.webserver.path}\n`
      },
    }
    try {
      await writeFile(profilePath, officialYaml, 'utf8')
      await first.developmentEnvironment.release()
      await releasePortReservations(first.record.runId)
      const second = await prepareProbeRun({ repositoryRoot, mode: 'development', profilePatchAdapter })
      try {
        const updatedYaml = await readFile(profilePath, 'utf8')
        expect(updatedYaml).toContain('provider: openrouter')
        expect(updatedYaml).toContain('requestTemplate: !!js/function >')
        expect(updatedYaml).toContain('function makeRequest(context) { return context.model }')
        expect(updatedYaml).toContain('model: user-selected-model')
        expect(updatedYaml).toContain('displayName: Saved OpenRouter')
        expect(updatedYaml).toContain('api: openai-completions')
        expect(updatedYaml).toContain('baseURL: https://gateway.example/v1')
        expect(updatedYaml).toContain('apiKeyEnv: OPENROUTER_API_KEY')
        expect(updatedYaml).toContain('contextWindow: 125000')
        expect(updatedYaml).toContain('maxTokens: 4096')
        expect(updatedYaml).toContain('path: /api')
        expect(updatedYaml).not.toContain('dots-studio/dots-3-note-preview:free')
        expect(updatedYaml).toContain(`host: ${second.config.ports.host}`)
        expect(updatedYaml).toContain(`port: ${second.record.ports.host}`)
        expect(seenDocument.providerYaml).toContain('!!js/function')
      } finally {
        await second.developmentEnvironment.release()
        await releasePortReservations(second.record.runId)
      }
    } finally {
      await first.developmentEnvironment.release()
      await releasePortReservations(first.record.runId)
    }
  })
})

function makeRunRecord() {
  const timestamp = '2026-09-30T00:00:00.000Z'
  return {
    schemaVersion: 1,
    runId: '3f30f049-6696-4cdb-89c5-29779e2d774d',
    mode: 'fresh',
    state: 'prepared',
    createdAt: timestamp,
    updatedAt: timestamp,
    application: {
      bundlePath: '/Applications/DeepSeek Harness.app',
      executablePath: '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness',
      version: '0.2.0-rc.2',
      bundleId: 'com.deepseek.dsh',
    },
    directories: {
      run: '/repo/.local/desktop-e2e/3f30f049-6696-4cdb-89c5-29779e2d774d',
      dshHome: '/repo/.local/desktop-e2e/3f30f049-6696-4cdb-89c5-29779e2d774d/dsh-home',
      electronUserData: '/repo/.local/desktop-e2e/3f30f049-6696-4cdb-89c5-29779e2d774d/user-data',
      workspace: '/repo/.local/desktop-e2e/3f30f049-6696-4cdb-89c5-29779e2d774d/workspace',
      logs: '/repo/.local/desktop-e2e/3f30f049-6696-4cdb-89c5-29779e2d774d/logs',
      evidence: '/repo/.local/desktop-e2e/3f30f049-6696-4cdb-89c5-29779e2d774d/evidence',
      profile: '/repo/.local/desktop-e2e/3f30f049-6696-4cdb-89c5-29779e2d774d/dsh-home/profiles/desktop',
      diagnosticFile: '/repo/.local/desktop-e2e/3f30f049-6696-4cdb-89c5-29779e2d774d/logs/diagnostic.log',
    },
    environment: { root: null, leasePath: null },
    ports: { host: 23001, rendererCdp: 23002, hostInspector: 23003 },
    launch: { arguments: [], environment: {}, unsetEnvironmentNames: [] },
    process: null,
    result: null,
  }
}

async function fakeApplicationConfig() {
  const source = await loadDesktopE2EConfig()
  return parseDesktopE2EConfig({
    ...source,
    application: {
      ...source.application,
      bundlePath: '/tmp/Probe Test.app',
      executableRelativePath: 'Contents/MacOS/Probe Test',
    },
  })
}

async function temporaryRepository() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'desktop-e2e-probe-')))
  temporaryRoots.add(root)
  return root
}

function createFakeProcessHarness({ config, listenersReady = true, rendererReady = true, fakeClock = false, sleep } = {}) {
  const pid = 54321
  let groupPresent = true
  let child
  let launched
  let assignedPorts = []
  let clock = 0
  let spawnEnvironment
  const signals = []
  const now = fakeClock ? () => clock : Date.now
  const wait = sleep ?? (fakeClock ? async milliseconds => { clock += milliseconds } : undefined)
  const spawnProcess = (command, args, options) => {
    launched = { command, args, options }
    spawnEnvironment = options.env
    child = new EventEmitter()
    child.pid = pid
    child.exitCode = null
    child.signalCode = null
    child.unref = () => undefined
    return child
  }
  const group = processId => {
    if (!groupPresent) return null
    return {
      processGroupId: processId,
      members: [{
        pid,
        parentPid: 1,
        processGroupId: pid,
        command: `${launched.command} ${launched.args.join(' ')}`,
        workingDirectory: launched.options.cwd,
        listeningPorts: listenersReady ? [hostPort(), rendererPort()] : [],
      }],
    }
  }
  const hostPort = () => assignedPorts.find(port => port !== rendererPort() && port !== inspectorPort())
  const rendererPort = () => Number(launched.args.find(argument => argument.startsWith('--remote-debugging-port='))?.split('=')[1])
  const inspectorPort = () => Number(spawnEnvironment[config.invocation.environmentNames.hostInspectorPort])
  const inspect = async processId => group(processId)
  const portOwners = async ports => {
    assignedPorts = ports
    if (launched === undefined) return ports.map(port => ({ port, pids: [] }))
    return ports.map(port => ({
      port,
      pids: groupPresent && listenersReady && (port === hostPort() || port === rendererPort()) ? [pid] : [],
    }))
  }
  const signalProcessGroup = async (processGroupId, signal) => {
    signals.push([processGroupId, signal])
    groupPresent = false
    if (child !== undefined) {
      child.exitCode = 0
      child.emit('exit', 0, null)
    }
  }
  const options = {
    inspect,
    portOwners,
    spawnProcess,
    verifyApplication: async () => ({
      version: config.application.version,
      bundleId: config.application.bundleId,
      executablePath: join(config.application.bundlePath, config.application.executableRelativePath),
    }),
    accessExecutable: async () => undefined,
    readEnvironmentFile: async () => '',
    rendererStatus: async (port, readiness, host) => ({
      ready: rendererReady,
      title: readiness.rendererTargetTitle,
      url: `${readiness.applicationUrlPrefix}app/`,
      readyState: readiness.documentReadyState,
      bodyTextLength: rendererReady ? 1 : 0,
      host,
      port,
    }),
    signalProcessGroup,
    now,
    ...(wait === undefined ? {} : { sleep: wait }),
  }
  return {
    pid,
    options,
    inspect,
    signalProcessGroup,
    get signals() { return signals },
    get spawnEnvironment() { return spawnEnvironment },
    statusOptions: { config, inspect, portOwners, signalProcessGroup },
  }
}

async function runDefaultRendererStartupFailure({ openMode = 'open', commandMode = 'ready', closeMode = 'close' } = {}) {
  const repositoryRoot = await temporaryRepository()
  const baseConfig = await fakeApplicationConfig()
  const config = parseDesktopE2EConfig({
    ...baseConfig,
    startup: {
      ...baseConfig.startup,
      startupTimeoutMs: 50,
      portReadyTimeoutMs: 50,
      stopTimeoutMs: 3,
      killTimeoutMs: 3,
      pollIntervalMs: 1,
    },
  })
  let fakeNow = 0
  const harness = createFakeProcessHarness({ config })
  const harnessOptions = { ...harness.options, now: () => fakeNow, sleep: async () => { fakeNow += 50 } }
  const transport = createDefaultRendererTransport({ config, openMode, commandMode, closeMode })
  const startedAt = performance.now()
  const outcome = await startProbe({
    repositoryRoot,
    config,
    ...harnessOptions,
    rendererStatus: undefined,
  }).then(started => ({ started }), error => ({ error }))
  const elapsedMs = performance.now() - startedAt
  if (outcome.started !== undefined) {
    await stopProbe({ repositoryRoot, runId: outcome.started.record.runId, ...harness.statusOptions })
  }
  return { outcome, transport, harness, elapsedMs }
}

function createDefaultRendererTransport({
  config,
  responseMode = 'normal',
  socketPort,
  targetId = 'renderer-page',
  openMode = 'open',
  commandMode = 'ready',
  closeMode = 'close',
  beforeFetch,
  onSocketOpen,
  onSocketClose,
} = {}) {
  const requests = []
  const socketUrls = []
  const commands = []
  const sockets = []
  let resolveFirstSocket
  const firstSocketCreated = new Promise(resolveSocket => { resolveFirstSocket = resolveSocket })
  let closeCalls = 0
  vi.stubGlobal('fetch', async (url, options) => {
    const endpoint = new URL(String(url))
    requests.push({ url: String(url), options })
    beforeFetch?.({ url: String(url), options })
    const target = {
      id: targetId,
      type: 'page',
      title: config.readiness.rendererTargetTitle,
      url: `${config.readiness.applicationUrlPrefix}app/`,
      webSocketDebuggerUrl: `ws://${config.ports.host}:${socketPort ?? endpoint.port}/devtools/page/${targetId}`,
    }
    return {
      ok: true,
      status: 200,
      redirected: responseMode === 'redirect',
      url: responseMode === 'redirect' ? `http://${config.ports.host}:9/redirected` : String(url),
      json: async () => [target],
    }
  })
  vi.stubGlobal('WebSocket', class ControlledWebSocket {
    constructor(url) {
      this.url = url
      this.listeners = new Map()
      this.readyState = 0
      socketUrls.push(url)
      sockets.push(this)
      resolveFirstSocket(this)
      resolveFirstSocket = undefined
      if (openMode === 'open') {
        queueMicrotask(() => {
          this.readyState = 1
          onSocketOpen?.()
          this.emit('open', {})
        })
      } else if (openMode === 'error') {
        queueMicrotask(() => this.emit('error', {}))
      }
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? new Set()
      listeners.add(listener)
      this.listeners.set(type, listeners)
    }

    removeEventListener(type, listener) {
      this.listeners.get(type)?.delete(listener)
    }

    send(source) {
      commands.push(JSON.parse(source))
      if (commandMode === 'timeout') return
      const request = JSON.parse(source)
      queueMicrotask(() => this.emit('message', {
        data: JSON.stringify({
          id: request.id,
          result: { result: { value: { readyState: 'complete', bodyTextLength: 1 } } },
        }),
      }))
    }

    close() {
      closeCalls += 1
      onSocketClose?.()
      if (closeMode === 'throw') throw new Error('controlled WebSocket close failure')
      if (closeMode === 'close') {
        this.readyState = 3
        this.emit('close', {})
      }
    }

    emit(type, event) {
      for (const listener of this.listeners.get(type) ?? []) listener(event)
    }
  })
  return {
    requests,
    socketUrls,
    commands,
    sockets,
    firstSocketCreated,
    get closeCalls() { return closeCalls },
  }
}

function listenAt(port) {
  const server = createServer()
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}

function jsonYamlProfileAdapter() {
  return {
    parse(source) {
      return JSON.parse(source)
    },
    updateProfilePatch(document, { entryId, config }) {
      const row = document.find(candidate => candidate.id === entryId)
      if (row === undefined) document.push({ id: entryId, config })
      else row.config = { ...row.config, ...config }
      return document
    },
    serialize(document) {
      return JSON.stringify(document, null, 2)
    },
  }
}

function perRunDevelopmentConfig(config, repositoryRoot, runId) {
  return parseDesktopE2EConfig({
    ...config,
    modes: {
      ...config.modes,
      development: {
        ...config.modes.development,
        environmentRootRelativePath: `.local/desktop-e2e/${runId}/business-environment`,
        environmentFilePath: join(repositoryRoot, '.local/desktop-e2e', runId, 'test-credentials.env'),
        credentialEnvironmentNames: [],
        requiredEnvironmentNames: [],
      },
    },
  })
}
