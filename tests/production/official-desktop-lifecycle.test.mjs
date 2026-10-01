import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { access, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import desktopE2EConfig from '../../config/desktop-e2e.json' with { type: 'json' }
import providerFixture from '../fixtures/custom-provider-reasoning.json' with { type: 'json' }
import lifecycleFixtureJson from '../desktop/fixtures/official-lifecycle-fixture.json' with { type: 'json' }
import browserSettings from '../../config/browser-settings.json' with { type: 'json' }
import settingsEntryIds from '../../config/settings-entry-ids.json' with { type: 'json' }
import { OFFICIAL_CANDIDATE_RUNTIME_PATHS } from '../desktop/fixtures/official-candidate-identity-schema.mjs'
import {
  getProbeStatus,
  loadDesktopE2EConfig,
  startProbe,
  stopProbe,
} from '../desktop/fixtures/official-desktop-probe.mjs'
import {
  assertIndependentLifecycleEnvironments,
  captureLifecycleFailureAndCleanup,
  cleanupRegisteredLifecycleRun,
  createDebugRetentionEvidence,
  createLifecycleDesktopConfig,
  createLifecycleRunObservation,
  createIsolatedDesktopSpawn,
  createLifecycleRunRegistry,
  loadOfficialLifecycleFixture,
  observeLifecyclePortOwners,
  invokeLifecycleStartUnlessAborted,
  readLifecycleSessionCache,
  stageLifecycleTarball,
  writeLifecycleTestEnvironmentFile,
  writeOfficialLifecycleEvidence,
} from '../desktop/fixtures/official-lifecycle-services.mjs'
import { loadOfficialProfilePatchAdapter } from '../desktop/fixtures/official-profile-patch.mjs'
import {
  parseOfficialLifecycleDebugRetentionEvidence,
  parseOfficialLifecycleEvidence,
  parseOfficialLifecycleFixture,
  parseOfficialPluginManagerListBundlesResponse,
} from '../desktop/fixtures/official-lifecycle-schema.mjs'

function lifecycleEnvironment(label, firstPort, owner = label.replace(/-restart$/u, '')) {
  const runId = randomUUID()
  const processGroupId = firstPort
  const dshHome = `/tmp/official-lifecycle-a13/${owner}/dsh-home`
  const directories = {
    home: `${dshHome}/os-home`,
    dshHome,
    electronUserData: `/tmp/official-lifecycle-a13/${owner}/user-data`,
    workspace: `/tmp/official-lifecycle-a13/${owner}/workspace`,
    evidence: `/tmp/official-lifecycle-a13/runs/${label}/evidence`,
    pluginInstallPath: `${dshHome}/profiles/desktop/node_modules/harness-comfyui`,
  }
  const ports = { host: firstPort, rendererCdp: firstPort + 1, hostInspector: firstPort + 2 }
  const portValues = Object.values(ports)
  const restarted = label.endsWith('-restart')
  return {
    label,
    runId,
    state: 'stopped',
    application: {
      bundlePath: '/Applications/DeepSeek Harness.app',
      bundleId: 'com.deepseek.dsh',
      version: '0.2.0-rc.2',
    },
    directories,
    ports,
    processObservedDuringStart: {
      rootPid: processGroupId,
      processGroupId,
      matchesRun: true,
      members: [{
        pid: processGroupId,
        parentPid: 1,
        processGroupId,
        command: '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness',
        workingDirectory: directories.workspace,
        listeningPorts: [ports.host, ports.rendererCdp],
      }],
    },
    portOwnersAtReady: portValues.map((port, index) => ({ port, pids: index < 2 ? [processGroupId] : [] })),
    install: {
      packageName: 'harness-comfyui',
      packageVersion: '0.44.3',
      path: directories.pluginInstallPath,
      status: 'installed',
      restartRequired: true,
      enabled: true,
      evidenceComplete: true,
      artifactComparisons: candidateComparisons(),
      loadedClientSource: {
        scriptId: `client-${owner}`,
        scriptUrl: 'dsh-app://app/plugins/??harness-comfyui/client.js&rev=66fdfd55bb7d',
        sourceMapUrl: '??harness-comfyui/client.js.map&rev=66fdfd55bb7d',
        moduleRoutes: ['harness-comfyui/client.js'],
        candidateModuleIndex: 0,
        sectionOffsetLine: 0,
        sectionOffsetColumn: 0,
        matchesCandidate: true,
      },
    },
    session: lifecycleSession(owner, directories.workspace),
    savedSetting: {
      entryId: settingsEntryIds.core,
      [browserSettings.fieldName]: owner === 'left'
        ? '/Applications/Google Chrome.app/Contents/MacOS/./Google Chrome'
        : '/Applications/Google Chrome.app/Contents/MacOS/././Google Chrome',
    },
    pluginManagerRecord: restarted
      ? { name: 'harness-comfyui', version: '0.44.3', installed: true, enabled: true }
      : null,
    pluginManagerResponse: restarted
      ? { ok: true, value: [{
        name: 'harness-comfyui', version: '0.44.3', enabled: true, installed: true, optional: false, removable: true,
        rows: [], overrides: [],
      }] }
      : null,
    cleanup: {
      state: 'stopped',
      exitCode: 0,
      error: null,
      portsReleased: true,
      processGroupMembers: null,
      portOwners: portValues.map(port => ({ port, pids: [] })),
    },
    failure: null,
  }
}

function lifecycleSession(owner, workspacePath) {
  const workspaceId = `workspace-${owner}`
  const sessionId = `session-${owner}`
  const title = `${owner} lifecycle session`
  return {
    workspaceId,
    sessionId,
    title,
    remoteResponse: { ok: true, value: { items: [{
      sessionId,
      cwd: workspacePath,
      projections: { values: { title } },
    }] } },
    workspaceReadback: { workspaceId, path: workspacePath, sessionIds: [sessionId] },
    identityReadback: { sessionId, cwd: workspacePath },
    visibleSessionIds: [sessionId],
  }
}

function candidateSourceIdentity(archivePath = '/tmp/candidate.tgz', packageVersion = '0.44.3') {
  return {
    schemaVersion: 1,
    packageName: 'harness-comfyui',
    packageVersion,
    archivePath,
    sourceCommit: 'a'.repeat(40),
    dirty: false,
    runtimeFiles: [...OFFICIAL_CANDIDATE_RUNTIME_PATHS],
  }
}

function candidateComparisons() {
  return OFFICIAL_CANDIDATE_RUNTIME_PATHS.map(relativePath => ({ relativePath, matchesCandidate: true }))
}

function lifecycleCleanupEntry(runId = randomUUID(), leasePath = join(tmpdir(), 'official-lifecycle-leases', runId, 'active-probe.json')) {
  return {
    runId,
    config: { marker: 'owned-config' },
    run: { record: { runId, environment: { leasePath } } },
  }
}

const temporaryRoots = new Set()

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all([...temporaryRoots].map(root => rm(root, { recursive: true, force: true })))
  temporaryRoots.clear()
})

describe('official Desktop lifecycle fixture configuration', () => {
  it('loads the module-owned regression policy and required app scenarios', async () => {
    const fixture = await loadOfficialLifecycleFixture()

    expect(fixture.classification).toBe('automated-regression')
    expect(fixture.acceptanceClaim).toBe(false)
    expect(fixture.scenarios).toEqual(expect.arrayContaining([
      'a13-parallel-instances',
      'a15-successful-start-stop',
      'a15-start-failure',
      'a15-cancel-after-launch',
      'a15-startup-timeout',
      'a15-port-conflict',
      'a15-debug-retention',
    ]))
    expect(fixture.scenarioLabels.successfulStartStop).toBe('success')
    expect(fixture.timeouts.a13CaseTimeoutMs)
      .toBeGreaterThan(fixture.timeouts.operationTimeoutMs + fixture.timeouts.cleanupTimeoutMs)
    expect(fixture.timeouts.a15CaseTimeoutMs).toBeGreaterThan(fixture.timeouts.cleanupTimeoutMs)
    expect(fixture.operations).toMatchObject({
      sessionPresetId: 'harness-comfyui-cli-candidate',
      defaultProviderId: 'siliconflow',
      defaultModelId: 'deepseek-ai/DeepSeek-V4-Flash',
      viewBundleButtonAriaLabelTemplate: '查看 {name}',
      candidateClientScript: {
        scriptUrlPrefix: 'dsh-app://app/plugins/??',
        sourceMapUrlPrefix: '??',
        sourceMapRequestPrefix: 'dsh-app://app/plugins/',
        revisionQueryPrefix: '&rev=',
        revisionPattern: '^[a-f0-9]{12}$',
        moduleRoutePattern: '^(?:@deepseek-ai/[a-z0-9][a-z0-9-]*|harness-comfyui)/client\\.js$',
        candidateModuleMustBeLast: true,
        moduleMapSuffix: '.map',
        sourceUrlDirectivePrefix: '//# sourceURL=',
        sourceUrlDirectiveValuePattern: '+',
        sourceMapDirectiveValuePattern: '*',
        moduleSeparator: ';\n',
        sourceMapTrailerTemplate: '//# sourceMappingURL={sourceMapUrl}\n',
      },
    })
  })

  it('parses the SDK RemoteResult envelope and validates BundleInfo records', () => {
    const response = {
      ok: true,
      value: [{
        name: 'harness-comfyui',
        version: '0.44.3',
        enabled: true,
        installed: true,
        optional: false,
        removable: true,
        rows: [{ rowId: 'workflow', moduleName: 'harness-comfyui/workflow' }],
        overrides: [],
      }],
    }
    expect(parseOfficialPluginManagerListBundlesResponse(response, 'harness-comfyui', '0.44.3')).toEqual({
      name: 'harness-comfyui', version: '0.44.3', installed: true, enabled: true,
    })
    expect(() => parseOfficialPluginManagerListBundlesResponse(response.value, 'harness-comfyui', '0.44.3'))
      .toThrow(/RemoteResult envelope/u)
    expect(() => parseOfficialPluginManagerListBundlesResponse({ ok: false, error: { code: 'operation-error' } }, 'harness-comfyui', '0.44.3'))
      .toThrow(/Remote pluginManager\.listBundles failed/u)
    expect(() => parseOfficialPluginManagerListBundlesResponse({ ok: true, value: [{ name: 'harness-comfyui' }] }, 'harness-comfyui', '0.44.3'))
      .toThrow(/BundleInfo/u)
    expect(() => parseOfficialPluginManagerListBundlesResponse({ ok: true, value: response.value }, 'harness-comfyui', '0.45.0'))
      .toThrow(/expected package version/u)
  })

  it('rejects unknown keys, false acceptance claims, invalid names, and unbounded timeouts', () => {
    const fixture = structuredClone(lifecycleFixtureJson)
    expect(() => parseOfficialLifecycleFixture({ ...fixture, extra: true })).toThrow(/unexpected/u)
    expect(() => parseOfficialLifecycleFixture({ ...fixture, acceptanceClaim: true })).toThrow(/acceptanceClaim/u)
    expect(() => parseOfficialLifecycleFixture({
      ...fixture,
      paths: { ...fixture.paths, supportDirectoryName: '../outside' },
    })).toThrow(/supportDirectoryName/u)
    expect(() => parseOfficialLifecycleFixture({
      ...fixture,
      timeouts: { ...fixture.timeouts, a13CaseTimeoutMs: 900_001 },
    })).toThrow(/a13CaseTimeoutMs/u)
    expect(() => parseOfficialLifecycleFixture({
      ...fixture,
      paths: { ...fixture.paths, evidenceFilenames: {
        ...fixture.paths.evidenceFilenames,
        'a13-parallel-instances': 'shared.json',
        'a15-successful-start-stop': 'shared.json',
      } },
    })).toThrow(/unique/u)
    expect(() => parseOfficialLifecycleFixture({
      ...fixture,
      scenarioLabels: { ...fixture.scenarioLabels, rightSettingsRestart: fixture.scenarioLabels.savedSettingsRestart },
    })).toThrow(/unique/u)
    expect(() => parseOfficialLifecycleFixture({
      ...fixture,
      operations: { ...fixture.operations, viewBundleButtonAriaLabelTemplate: '查看 harness-comfyui' },
    })).toThrow(/must contain \{name\} exactly once/u)
    expect(() => parseOfficialLifecycleFixture({
      ...fixture,
      operations: { ...fixture.operations, candidateClientScript: {
        ...fixture.operations.candidateClientScript,
        scriptUrlPrefix: 'file:///',
      } },
    })).toThrow(/candidateClientScript must match/u)
    expect(() => parseOfficialLifecycleFixture({
      ...fixture,
      operations: { ...fixture.operations, candidateClientScript: {
        ...fixture.operations.candidateClientScript,
        sourceMapTrailerTemplate: '//# sourceURL={sourceMapUrl}\n',
      } },
    })).toThrow(/candidateClientScript must match/u)
    expect(() => parseOfficialLifecycleFixture({
      ...fixture,
      operations: { ...fixture.operations, candidateClientScript: {
        ...fixture.operations.candidateClientScript,
        sourceUrlDirectiveValuePattern: '*',
      } },
    })).toThrow(/candidateClientScript must match/u)
  })

  it('rejects evidence that omits either restarted environment from the A13 record', () => {
    const fixture = structuredClone(lifecycleFixtureJson)
    fixture.scenarioLabels.rightSettingsRestart = fixture.scenarioLabels.savedSettingsRestart
    expect(() => parseOfficialLifecycleFixture(fixture)).toThrow(/unique/u)
  })
})

describe('official Desktop lifecycle environment builder', () => {
  it('waits for the official asynchronous Session cache file and returns its complete JSON record', async () => {
    const missing = Object.assign(new Error('not persisted yet'), { code: 'ENOENT' })
    const reads = [missing, missing, JSON.stringify({ record: { identity: { cwd: '/tmp/lifecycle/workspace' } } })]
    const delays = []
    let now = 0

    const result = await readLifecycleSessionCache({
      path: '/tmp/lifecycle/session.json',
      timeoutMs: 10,
      pollIntervalMs: 2,
      now: () => now,
      delay: async milliseconds => { delays.push(milliseconds); now += milliseconds },
      readFileImplementation: async (path, encoding) => {
        expect(path).toBe('/tmp/lifecycle/session.json')
        expect(encoding).toBe('utf8')
        const next = reads.shift()
        if (next instanceof Error) throw next
        return next
      },
    })

    expect(result).toEqual({ record: { identity: { cwd: '/tmp/lifecycle/workspace' } } })
    expect(delays).toEqual([2, 2])
  })

  it('stops waiting at the operation deadline and immediately propagates other filesystem or JSON errors', async () => {
    let now = 0
    const missing = Object.assign(new Error('not persisted yet'), { code: 'ENOENT' })
    await expect(readLifecycleSessionCache({
      path: '/tmp/lifecycle/session.json',
      timeoutMs: 3,
      pollIntervalMs: 2,
      now: () => now,
      delay: async milliseconds => { now += milliseconds },
      readFileImplementation: async () => { throw missing },
    })).rejects.toThrow(/timed out waiting for the official Session cache file/u)

    const permissionError = Object.assign(new Error('permission denied'), { code: 'EACCES' })
    const noDelay = vi.fn(async () => undefined)
    await expect(readLifecycleSessionCache({
      path: '/tmp/lifecycle/session.json', timeoutMs: 10, pollIntervalMs: 2,
      delay: noDelay, readFileImplementation: async () => { throw permissionError },
    })).rejects.toBe(permissionError)
    expect(noDelay).not.toHaveBeenCalled()

    await expect(readLifecycleSessionCache({
      path: '/tmp/lifecycle/session.json', timeoutMs: 10, pollIntervalMs: 2,
      readFileImplementation: async () => '{partial',
    })).rejects.toThrow(SyntaxError)
  })

  it('rejects an invalid lifecycle Session cache polling boundary', async () => {
    await expect(readLifecycleSessionCache({ path: '/tmp/lifecycle/session.json', timeoutMs: 0, pollIntervalMs: 1 }))
      .rejects.toThrow(/positive integer/u)
    await expect(readLifecycleSessionCache({ path: 'relative/session.json', timeoutMs: 10, pollIntervalMs: 1 }))
      .rejects.toThrow(/absolute path/u)
  })

  it('retains a run after explicit cleanup failure and removes it only after the retry verifies process and ports', async () => {
    const registry = createLifecycleRunRegistry()
    const entry = lifecycleCleanupEntry()
    registry.register(entry)
    let running = true
    let portsReleased = false
    let stopCalls = 0
    const getStatus = async () => ({
      record: {
        runId: entry.runId,
        environment: entry.run.record.environment,
        state: running ? 'running' : 'stopped',
        result: running ? null : { portsReleased },
      },
      processGroup: running ? { processGroupId: 9001 } : null,
      ports: [{ port: 59001, pids: running || !portsReleased ? [9001] : [] }],
    })
    const stopRun = async observedEntry => {
      expect(observedEntry).toBe(entry)
      stopCalls += 1
      if (stopCalls === 1) throw new Error('controlled stop failure')
      running = false
      if (stopCalls >= 3) portsReleased = true
      return { record: { runId: entry.runId, state: 'stopped', result: { portsReleased } } }
    }
    const options = { registry, runId: entry.runId, getStatus, stopRun }

    await expect(cleanupRegisteredLifecycleRun(options)).rejects.toThrow('controlled stop failure')
    expect(registry.get(entry.runId)).toBe(entry)

    await expect(cleanupRegisteredLifecycleRun(options)).rejects.toThrow(/did not verify stopped process ownership/u)
    expect(registry.get(entry.runId)).toBe(entry)

    const result = await cleanupRegisteredLifecycleRun(options)
    expect(result.record.state).toBe('stopped')
    expect(result.status.ports[0].pids).toEqual([])
    expect(stopCalls).toBe(3)
    expect(registry.get(entry.runId)).toBeUndefined()
  })

  it.each(['failed', 'cancelled'])('accepts an internally finalized %s run only after process and port ownership are clear', async state => {
    const registry = createLifecycleRunRegistry()
    const entry = lifecycleCleanupEntry()
    registry.register(entry)
    const status = {
      record: { runId: entry.runId, environment: entry.run.record.environment, state, result: { error: `${state}: original startup failure`, portsReleased: true } },
      processGroup: null,
      ports: [{ port: 59001, pids: [] }],
    }
    const stopRun = vi.fn()

    const result = await cleanupRegisteredLifecycleRun({
      registry,
      runId: entry.runId,
      getStatus: async () => status,
      stopRun,
    })

    expect(result.record.result.error).toBe(`${state}: original startup failure`)
    expect(stopRun).not.toHaveBeenCalled()
    expect(registry.get(entry.runId)).toBeUndefined()
  })

  it('keeps a terminal run registered when its lease remains and releases it only after a successful retry', async () => {
    const registry = createLifecycleRunRegistry()
    const root = await mkdtemp(join(tmpdir(), 'official-lifecycle-lease-'))
    temporaryRoots.add(root)
    const runId = randomUUID()
    const leasePath = join(root, 'active-probe.json')
    const entry = lifecycleCleanupEntry(runId, leasePath)
    registry.register(entry)
    const originalFailure = 'STARTUP_TIMEOUT: preserved lifecycle reason'
    await writeFile(leasePath, `${JSON.stringify({
      schemaVersion: 1,
      runId,
      processId: process.pid,
      createdAt: '2026-10-01T00:00:00.000Z',
    })}\n`)
    const status = {
      record: { runId, environment: { leasePath }, state: 'failed', result: { error: originalFailure, portsReleased: true } },
      processGroup: null,
      ports: [{ port: 59001, pids: [] }],
    }
    const stopRun = vi.fn()
      .mockRejectedValueOnce(new Error('controlled lease release failure'))
      .mockImplementationOnce(async () => {
        await rm(leasePath)
        return { record: status.record }
      })
    const options = { registry, runId, getStatus: async () => status, stopRun }

    await expect(cleanupRegisteredLifecycleRun(options)).rejects.toThrow('controlled lease release failure')
    expect(registry.get(runId)).toBe(entry)
    await expect(access(leasePath)).resolves.toBeUndefined()

    const result = await cleanupRegisteredLifecycleRun(options)
    expect(result.record.result.error).toBe(originalFailure)
    expect(await access(leasePath).then(() => false, error => error.code === 'ENOENT')).toBe(true)
    expect(stopRun).toHaveBeenCalledTimes(2)
    expect(registry.get(runId)).toBeUndefined()
  })

  it('preserves a terminal run when the existing lease belongs to another run', async () => {
    const registry = createLifecycleRunRegistry()
    const root = await mkdtemp(join(tmpdir(), 'official-lifecycle-foreign-lease-'))
    temporaryRoots.add(root)
    const runId = randomUUID()
    const leasePath = join(root, 'active-probe.json')
    const entry = lifecycleCleanupEntry(runId, leasePath)
    registry.register(entry)
    await writeFile(leasePath, `${JSON.stringify({
      schemaVersion: 1,
      runId: randomUUID(),
      processId: process.pid,
      createdAt: '2026-10-01T00:00:00.000Z',
    })}\n`)
    const status = {
      record: { runId, environment: { leasePath }, state: 'failed', result: { error: 'PROBE_FAILED: startup', portsReleased: true } },
      processGroup: null,
      ports: [{ port: 59001, pids: [] }],
    }
    const stopRun = vi.fn(async () => {
      const error = new Error('DEVELOPMENT_ENVIRONMENT_LEASE_MISMATCH: lease belongs to another run')
      error.code = 'DEVELOPMENT_ENVIRONMENT_LEASE_MISMATCH'
      throw error
    })

    await expect(cleanupRegisteredLifecycleRun({ registry, runId, getStatus: async () => status, stopRun }))
      .rejects.toThrow('DEVELOPMENT_ENVIRONMENT_LEASE_MISMATCH')
    expect(stopRun).toHaveBeenCalledTimes(1)
    expect(registry.get(runId)).toBe(entry)
    await expect(access(leasePath)).resolves.toBeUndefined()
  })

  it('keeps the port-conflict failure snapshot and reads cleanup after the external listener closes', async () => {
    const runId = randomUUID()
    const initialFailure = {
      record: { runId, state: 'failed', process: null, result: { error: 'PORT_CONFLICT: assigned port is already listening', portsReleased: false } },
      processGroup: null,
      processGroupMatchesRun: false,
      ports: [{ port: 59001, pids: [process.pid] }],
    }
    let externalListenerOpen = true
    let statusReads = 0
    const readStatus = vi.fn(async () => {
      statusReads += 1
      if (externalListenerOpen) return initialFailure
      return {
        record: { runId, state: 'failed', process: null, result: { error: 'no process was recorded', portsReleased: true } },
        processGroup: null,
        processGroupMatchesRun: false,
        ports: [{ port: 59001, pids: [] }],
      }
    })
    const snapshots = await captureLifecycleFailureAndCleanup({
      readStatus,
      afterFailure: async () => { externalListenerOpen = false },
      cleanup: async () => {
        const status = await readStatus()
        return { record: status.record, status }
      },
    })

    expect(snapshots.failureStatus.ports[0].pids).toEqual([process.pid])
    expect(snapshots.cleanup.status.ports[0].pids).toEqual([])
    expect(snapshots.cleanup.record.result.portsReleased).toBe(true)
    expect(statusReads).toBe(2)
  })

  it('propagates a cleanup failure instead of substituting a final status', async () => {
    const runId = randomUUID()
    const failureStatus = {
      record: { runId, state: 'failed', process: null, result: { error: 'PORT_CONFLICT: assigned port is already listening', portsReleased: false } },
      processGroup: null,
      ports: [{ port: 59001, pids: [] }],
    }
    const readStatus = vi.fn(async () => failureStatus)
    const cleanup = vi.fn(async () => { throw new Error('controlled cleanup failure') })

    await expect(captureLifecycleFailureAndCleanup({ readStatus, cleanup }))
      .rejects.toThrow('controlled cleanup failure')
    expect(readStatus).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('releases an unspawned port-conflict run only after OS ownership is clear', async () => {
    const registry = createLifecycleRunRegistry()
    const entry = lifecycleCleanupEntry()
    registry.register(entry)
    let externalListenerOpen = true
    const getStatus = async () => ({
      record: {
        runId: entry.runId,
        environment: entry.run.record.environment,
        state: 'failed',
        process: null,
        result: { error: 'PORT_CONFLICT: assigned ports are already listening', portsReleased: false },
      },
      processGroup: null,
      ports: [{ port: 59001, pids: externalListenerOpen ? [process.pid] : [] }],
    })
    const stopRun = vi.fn(async () => { throw new Error('unexpected stop of unspawned process') })
    const options = { registry, runId: entry.runId, getStatus, stopRun }

    await expect(cleanupRegisteredLifecycleRun(options)).rejects.toThrow('unexpected stop of unspawned process')
    expect(registry.get(entry.runId)).toBe(entry)
    externalListenerOpen = false
    const result = await cleanupRegisteredLifecycleRun(options)

    expect(result.record.result.error).toMatch(/^PORT_CONFLICT:/u)
    expect(result.status.ports).toEqual([{ port: 59001, pids: [] }])
    expect(stopRun).toHaveBeenCalledTimes(1)
    expect(registry.get(entry.runId)).toBeUndefined()
  })

  it('does not invoke a Desktop start after the lifecycle case signal has been aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const start = vi.fn()

    await expect(invokeLifecycleStartUnlessAborted({ signal: controller.signal, start }))
      .rejects.toHaveProperty('name', 'AbortError')
    expect(start).not.toHaveBeenCalled()
  })

  it('forwards an active lifecycle case signal to the Desktop start operation', async () => {
    const controller = new AbortController()
    const start = vi.fn(async signal => signal)

    await expect(invokeLifecycleStartUnlessAborted({ signal: controller.signal, start }))
      .resolves.toBe(controller.signal)
    expect(start).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledWith(controller.signal)
  })

  it('reports an actual loopback listener PID from the operating system', async () => {
    const server = createServer()
    await new Promise((resolveListen, reject) => {
      server.once('error', reject)
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolveListen)
    })
    try {
      const address = server.address()
      expect(address).toMatchObject({ address: '127.0.0.1' })
      const [observation] = await observeLifecyclePortOwners([address.port])
      expect(observation).toEqual({ port: address.port, pids: [process.pid] })
      await expect(observeLifecyclePortOwners([0])).rejects.toThrow(/valid TCP port numbers/u)
    } finally {
      await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
    }
  })

  it('creates validated isolated development profiles with only a controlled test credential reference', () => {
    const fixtureId = randomUUID()
    const runA = randomUUID()
    const runB = randomUUID()
    const workspaceA = `/tmp/${fixtureId}/workspace-a`
    const workspaceB = `/tmp/${fixtureId}/workspace-b`
    const environmentFilePath = `/tmp/${fixtureId}/test.env`
    const configA = createLifecycleDesktopConfig(desktopE2EConfig, {
      fixture: lifecycleFixtureJson,
      fixtureId,
      runId: runA,
      workspacePath: workspaceA,
      environmentFilePath,
      providers: providerFixture,
    })
    const configB = createLifecycleDesktopConfig(desktopE2EConfig, {
      fixture: lifecycleFixtureJson,
      fixtureId,
      runId: runB,
      workspacePath: workspaceB,
      environmentFilePath,
      providers: providerFixture,
    })

    expect(configA.modes.development.environmentRootRelativePath)
      .not.toBe(configB.modes.development.environmentRootRelativePath)
    expect(configA.modes.development.credentialEnvironmentNames).toEqual([
      ...desktopE2EConfig.modes.development.credentialEnvironmentNames,
      lifecycleFixtureJson.credentials.testKeyEnvironmentName,
    ])
    expect(configA.modes.development.credentialEnvironmentNames).toEqual(expect.arrayContaining([
      'OPENROUTER_API_KEY', 'OPENCODE_GO_API_KEY', lifecycleFixtureJson.credentials.testKeyEnvironmentName,
    ]))
    expect(configA.modes.development.requiredEnvironmentNames)
      .toEqual([lifecycleFixtureJson.credentials.testKeyEnvironmentName])
    expect(configA.modes.development.initialProfilePatches.find(row => row.id === 'harness-comfyui-core').config)
      .toMatchObject({ startupWorkspacePath: workspaceA })
    expect(configA.modes.development.initialProfilePatches.find(row => row.id === 'llm-pi-ai')
      .config.providers.siliconflow.apiKeyEnv).toBe(lifecycleFixtureJson.credentials.testKeyEnvironmentName)
  })

  it('records the configured profile path in debug-retention evidence', () => {
    const evidence = createDebugRetentionEvidence({
      run: {
        record: {
          runId: randomUUID(),
          state: 'running',
          application: {
            bundlePath: '/Applications/DeepSeek Harness.app',
            executablePath: '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness',
            bundleId: 'com.deepseek.dsh',
            version: '0.2.0-rc.2',
          },
          directories: { evidence: '/repo/.local/desktop-e2e/run/evidence' },
          ports: { host: 51001, rendererCdp: 51002, hostInspector: 51003 },
          process: { pid: 700, processGroupId: 700 },
        },
      },
      repositoryRoot: '/repo',
      desktopConfig: desktopE2EConfig,
      fixture: lifecycleFixtureJson,
    })

    expect(parseOfficialLifecycleDebugRetentionEvidence(evidence).configuredProfile)
      .toBe(desktopE2EConfig.paths.profileRelativePath)
  })

  it('writes only the fixture fake key into its private development environment file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'official-lifecycle-env-'))
    temporaryRoots.add(root)
    const environmentFilePath = join(root, 'controlled-test.env')
    await writeLifecycleTestEnvironmentFile(environmentFilePath, lifecycleFixtureJson)
    const contents = await readFile(environmentFilePath, 'utf8')

    expect(contents).toBe(`${lifecycleFixtureJson.credentials.testKeyEnvironmentName}=${lifecycleFixtureJson.credentials.testKeyValue}\n`)
    expect(contents).not.toContain('OPENROUTER_API_KEY=')
    expect(contents).not.toContain('OPENCODE_GO_API_KEY=')
  })

  it('strips inherited production keys and starts only with the controlled key from the fixture environment file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'official-lifecycle-credentials-'))
    temporaryRoots.add(root)
    const fixtureId = randomUUID()
    const runId = randomUUID()
    const environmentFilePath = join(root, 'controlled.env')
    await writeLifecycleTestEnvironmentFile(environmentFilePath, lifecycleFixtureJson)
    const baseConfig = await loadDesktopE2EConfig()
    const dshHome = join(root, 'isolated-dsh-home')
    const workspacePath = join(root, 'workspace')
    const config = createLifecycleDesktopConfig(baseConfig, {
      fixture: lifecycleFixtureJson,
      fixtureId,
      runId,
      workspacePath,
      environmentFilePath,
      providers: providerFixture,
    })
    const profilePatchAdapter = await loadOfficialProfilePatchAdapter(config)
    const pid = process.pid + 1000
    const state = { launched: null, groupPresent: false, child: null, ports: [] }
    const inspect = async processId => {
      if (!state.groupPresent || processId !== pid) return null
      return {
        processGroupId: pid,
        members: [{
          pid,
          parentPid: process.pid,
          processGroupId: pid,
          command: `${state.launched.command} ${state.launched.args.join(' ')}`,
          workingDirectory: state.launched.options.cwd,
          listeningPorts: state.ports.slice(0, 2),
        }],
      }
    }
    const portOwners = async ports => {
      state.ports = ports
      return ports.map((port, index) => ({
        port,
        pids: state.groupPresent && index < 2 ? [pid] : [],
      }))
    }
    const spawnProcess = (command, args, options) => {
      state.launched = { command, args, options }
      state.groupPresent = true
      const child = new EventEmitter()
      child.pid = pid
      child.exitCode = null
      child.signalCode = null
      child.unref = () => undefined
      state.child = child
      return child
    }
    const signalProcessGroup = async () => {
      state.groupPresent = false
      state.child.exitCode = 0
      state.child.emit('exit', 0, null)
    }
    vi.stubEnv('OPENROUTER_API_KEY', 'inherited-openrouter-test-secret')
    vi.stubEnv('OPENCODE_GO_API_KEY', 'inherited-opencode-test-secret')

    const started = await startProbe({
      repositoryRoot: root,
      runId,
      mode: 'development',
      config,
      profilePatchAdapter,
      inspect,
      portOwners,
      spawnProcess,
      verifyApplication: async () => ({
        version: config.application.version,
        bundleId: config.application.bundleId,
        executablePath: join(config.application.bundlePath, config.application.executableRelativePath),
      }),
      accessExecutable: async () => undefined,
      rendererStatus: async (port, readiness, host) => ({
        ready: true,
        title: readiness.rendererTargetTitle,
        url: `${readiness.applicationUrlPrefix}app/`,
        readyState: readiness.documentReadyState,
        bodyTextLength: 1,
        host,
        port,
      }),
      signalProcessGroup,
    })

    expect(state.launched.options.env.OPENROUTER_API_KEY).toBeUndefined()
    expect(state.launched.options.env.OPENCODE_GO_API_KEY).toBeUndefined()
    expect(state.launched.options.env[lifecycleFixtureJson.credentials.testKeyEnvironmentName])
      .toBe(lifecycleFixtureJson.credentials.testKeyValue)
    const status = await getProbeStatus({ repositoryRoot: root, runId, config, inspect, portOwners })
    expect(status.processGroupMatchesRun).toBe(true)
    const stopped = await stopProbe({ repositoryRoot: root, runId, config, inspect, portOwners, signalProcessGroup })
    expect(stopped.record.result.portsReleased).toBe(true)
  })

  it('isolates HOME and agent-home under the run-owned DSH home', async () => {
    const root = await mkdtemp(join(tmpdir(), 'official-lifecycle-home-'))
    temporaryRoots.add(root)
    const dshHome = join(root, 'dsh-home')
    const calls = []
    const spawn = createIsolatedDesktopSpawn((executable, args, options) => {
      calls.push({ executable, args, options })
      return { pid: 111, unref() {}, once() {} }
    }, desktopE2EConfig, lifecycleFixtureJson)

    spawn('/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness', ['--flag'], {
      cwd: join(root, 'workspace'),
      env: { DSH_HOME: dshHome, EXISTING: 'kept' },
    })

    expect(calls[0].options.env).toMatchObject({
      DSH_HOME: dshHome,
      EXISTING: 'kept',
      HOME: join(dshHome, 'os-home'),
      DSH_AGENTS_HOME: join(dshHome, 'agents-home'),
    })
    await expect(access(join(dshHome, 'os-home'))).resolves.toBeUndefined()
    await expect(access(join(dshHome, 'agents-home'))).resolves.toBeUndefined()
  })

  it('copies only a regular lifecycle tarball into its worktree-owned artifact directory', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'official-lifecycle-tarball-')))
    temporaryRoots.add(root)
    const sourcePath = join(root, 'candidate-source.tgz')
    const sourceBytes = Buffer.from('controlled tarball fixture bytes')
    await writeFile(sourcePath, sourceBytes, { mode: 0o600 })
    const result = await stageLifecycleTarball({
      sourcePath,
      artifactRoot: join(root, '.local', 'desktop-e2e', 'artifacts'),
      repositoryRoot: root,
      packageName: 'harness-comfyui',
      packageVersion: '0.44.3',
      fixture: lifecycleFixtureJson,
    })
    expect(await readFile(result.stagedPath)).toEqual(sourceBytes)

    const linkedSource = join(root, 'linked-source.tgz')
    await symlink(sourcePath, linkedSource)
    await expect(stageLifecycleTarball({
      sourcePath: linkedSource,
      artifactRoot: join(root, '.local', 'desktop-e2e', 'link-artifacts'),
      repositoryRoot: root,
      packageName: 'harness-comfyui',
      packageVersion: '0.44.3',
      fixture: lifecycleFixtureJson,
    })).rejects.toThrow(/regular file/u)
  })

  it('requires independent OS ports and per-run paths for the two A13 environments', () => {
    const base = {
      runId: randomUUID(),
      directories: {
        home: '/tmp/left/home', dshHome: '/tmp/left/dsh', electronUserData: '/tmp/left/user',
        workspace: '/tmp/left/workspace', evidence: '/tmp/left/evidence', pluginInstallPath: '/tmp/left/plugin',
      },
      ports: { host: 50001, rendererCdp: 50002, hostInspector: 50003 },
    }
    const other = {
      runId: randomUUID(),
      directories: {
        home: '/tmp/right/home', dshHome: '/tmp/right/dsh', electronUserData: '/tmp/right/user',
        workspace: '/tmp/right/workspace', evidence: '/tmp/right/evidence', pluginInstallPath: '/tmp/right/plugin',
      },
      ports: { host: 50101, rendererCdp: 50102, hostInspector: 50103 },
    }
    expect(assertIndependentLifecycleEnvironments([base, other])).toBe(true)
    expect(() => assertIndependentLifecycleEnvironments([base, { ...other, ports: { ...other.ports, rendererCdp: base.ports.host } }]))
      .toThrow(/different OS-allocated ports/u)
    expect(() => assertIndependentLifecycleEnvironments([base, { ...other, directories: { ...other.directories, workspace: base.directories.workspace } }]))
      .toThrow(/different workspace directories/u)
  })

  it('accepts complete A13 evidence and rejects missing restart, identity, persistence, or OS-owner proof', () => {
    const initialLeft = lifecycleEnvironment('left', 53001)
    const initialRight = lifecycleEnvironment('right', 53101)
    const restartedLeft = lifecycleEnvironment('left-restart', 53201, 'left')
    const restartedRight = lifecycleEnvironment('right-restart', 53301, 'right')
    const fixtureId = '00000000-0000-4000-8000-000000000010'
    const artifact = {
      packageName: 'harness-comfyui',
      packageVersion: '0.44.3',
      sourcePath: '/tmp/candidate.tgz',
      stagedPath: '/repo/.local/desktop-e2e/candidate.tgz',
      sourceIdentity: candidateSourceIdentity('/tmp/candidate.tgz'),
    }
    const evidence = {
      schemaVersion: 1,
      classification: 'automated-regression',
      acceptanceClaim: false,
      scenario: 'a13-parallel-instances',
      recordedAt: '2026-09-30T00:00:00.000Z',
      fixtureId,
      fixtureRoot: '/repo/.local/desktop-e2e/lifecycle-fixtures/a13',
      artifact,
      environments: [initialLeft, initialRight, restartedLeft, restartedRight],
      parallelRequest: {
        runId: initialRight.runId,
        operation: lifecycleFixtureJson.operations.hostReadOnlyRequestOperation,
        result: JSON.stringify({ ok: true, value: { items: [{
          sessionId: initialRight.session.sessionId,
          cwd: initialRight.directories.workspace,
          projections: { values: { title: initialRight.session.title } },
        }] } }),
        sessionId: initialRight.session.sessionId,
        workspaceId: initialRight.session.workspaceId,
        workspacePath: initialRight.directories.workspace,
        cwd: initialRight.directories.workspace,
        visibleSessionIds: [initialRight.session.sessionId],
        ok: true,
      },
      cleanup: { allRunsStopped: true, allPortsReleased: true, verifiedAt: '2026-09-30T00:00:01.000Z' },
    }

    const parsedEvidence = parseOfficialLifecycleEvidence(evidence)
    expect(parsedEvidence.scenario).toBe('a13-parallel-instances')
    expect(parsedEvidence.environments.find(environment => environment.label === 'left-restart').pluginManagerResponse)
      .toEqual(evidence.environments.find(environment => environment.label === 'left-restart').pluginManagerResponse)
    const nullableRestartTitle = structuredClone(evidence)
    const nullableRestartSession = nullableRestartTitle.environments.find(environment => environment.label === 'left-restart').session
    nullableRestartSession.title = null
    nullableRestartSession.remoteResponse.value.items[0].projections.values.title = null
    expect(parseOfficialLifecycleEvidence(nullableRestartTitle)
      .environments.find(environment => environment.label === 'left-restart').session.title).toBeNull()
    const nullableInitialTitle = structuredClone(evidence)
    const nullableInitialSession = nullableInitialTitle.environments.find(environment => environment.label === 'left').session
    nullableInitialSession.title = null
    nullableInitialSession.remoteResponse.value.items[0].projections.values.title = null
    expect(() => parseOfficialLifecycleEvidence(nullableInitialTitle)).toThrow(/initial environment left must record the created Session title/u)
    const mismatchedRemoteReadback = structuredClone(evidence)
    const mismatchedRemoteSession = mismatchedRemoteReadback.environments.find(environment => environment.label === 'left-restart').session
    mismatchedRemoteSession.remoteResponse.value.items[0].cwd = '/tmp/other-workspace'
    expect(() => parseOfficialLifecycleEvidence(mismatchedRemoteReadback)).toThrow(/remoteResponse.*Workspace|remote Session response/u)
    const mismatchedRemoteIdentity = structuredClone(evidence)
    const mismatchedRemoteIdentitySession = mismatchedRemoteIdentity.environments.find(environment => environment.label === 'left-restart').session
    mismatchedRemoteIdentitySession.remoteResponse.value.items[0].sessionId = 'session-foreign'
    expect(() => parseOfficialLifecycleEvidence(mismatchedRemoteIdentity)).toThrow(/remoteResponse Session identities must match visibleSessionIds/u)
    const invalidRestartTitle = structuredClone(evidence)
    const invalidRestartSession = invalidRestartTitle.environments.find(environment => environment.label === 'left-restart').session
    invalidRestartSession.title = 7
    invalidRestartSession.remoteResponse.value.items[0].projections.values.title = 7
    expect(() => parseOfficialLifecycleEvidence(invalidRestartTitle)).toThrow(/title must be a non-empty string or null/u)
    expect(() => parseOfficialLifecycleEvidence({
      ...evidence,
      parallelRequest: { ...evidence.parallelRequest, operation: 'Renderer readiness check' },
    })).toThrow(/configured Host Remote read-only operation/u)
    expect(() => parseOfficialLifecycleEvidence({
      ...evidence,
      parallelRequest: { ...evidence.parallelRequest, result: 'renderer remains responsive' },
    })).toThrow(/successful session\.list response/u)
    expect(() => parseOfficialLifecycleEvidence({
      ...evidence,
      environments: evidence.environments.map(environment => environment.label === 'right'
        ? { ...environment, session: { ...environment.session, sessionId: initialLeft.session.sessionId,
          remoteResponse: { ...environment.session.remoteResponse, value: { ...environment.session.remoteResponse.value,
            items: environment.session.remoteResponse.value.items.map(item => item.sessionId === environment.session.sessionId
              ? { ...item, sessionId: initialLeft.session.sessionId }
              : item) } },
          workspaceReadback: { ...environment.session.workspaceReadback, sessionIds: [initialLeft.session.sessionId] },
          identityReadback: { sessionId: initialLeft.session.sessionId, cwd: environment.directories.workspace },
          visibleSessionIds: [initialLeft.session.sessionId] } }
        : environment),
    })).toThrow(/unique Session identities|opposite Session|cross-instance/u)
    expect(() => parseOfficialLifecycleEvidence({
      ...evidence,
      environments: evidence.environments.map(environment => environment.label === 'right'
        ? { ...environment, session: { ...environment.session,
          workspaceReadback: { ...environment.session.workspaceReadback, path: initialLeft.directories.workspace } } }
        : environment),
    })).toThrow(/workspaceReadback must identify this run Workspace/u)
    expect(() => parseOfficialLifecycleEvidence({
      ...evidence,
      environments: evidence.environments.map(environment => environment.label === 'right'
        ? { ...environment, session: { ...environment.session,
          remoteResponse: { ...environment.session.remoteResponse, value: { ...environment.session.remoteResponse.value,
            items: [...environment.session.remoteResponse.value.items, {
              sessionId: initialLeft.session.sessionId,
              cwd: initialLeft.directories.workspace,
              projections: { values: { title: initialLeft.session.title } },
            }] } },
          visibleSessionIds: [environment.session.sessionId, initialLeft.session.sessionId] } }
        : environment),
    })).toThrow(/opposite Session|cross-instance/u)
    expect(() => parseOfficialLifecycleEvidence({
      ...evidence,
      parallelRequest: { ...evidence.parallelRequest, sessionId: initialLeft.session.sessionId },
    })).toThrow(/remaining right Session/u)
    expect(parseOfficialLifecycleEvidence({
      ...evidence,
      environments: evidence.environments.map(environment => environment.label === 'left'
        ? { ...environment, install: { ...environment.install, restartRequired: false } }
        : environment),
    }).environments.find(environment => environment.label === 'left').install.restartRequired).toBe(false)
    expect(() => parseOfficialLifecycleEvidence({
      ...evidence,
      environments: evidence.environments.map(environment => environment.label === 'left-restart'
        ? {
          ...environment,
          directories: { ...environment.directories, workspace: '/tmp/other/workspace' },
          session: {
            ...environment.session,
            remoteResponse: { ...environment.session.remoteResponse, value: { ...environment.session.remoteResponse.value,
              items: environment.session.remoteResponse.value.items.map(item => item.sessionId === environment.session.sessionId
                ? { ...item, cwd: '/tmp/other/workspace' }
                : item) } },
            workspaceReadback: { ...environment.session.workspaceReadback, path: '/tmp/other/workspace' },
            identityReadback: { ...environment.session.identityReadback, cwd: '/tmp/other/workspace' },
          },
        }
        : environment),
    })).toThrow(/restart must reuse/u)
    expect(() => parseOfficialLifecycleEvidence({
      ...evidence,
      environments: evidence.environments.map(environment => environment.label === 'right'
        ? { ...environment, ports: initialLeft.ports }
        : environment),
    })).toThrow(/different OS ports/u)
    expect(() => parseOfficialLifecycleEvidence({
      ...evidence,
      environments: evidence.environments.map(environment => environment.label === 'right-restart'
        ? {
          ...environment,
          pluginManagerRecord: { ...environment.pluginManagerRecord, version: '0.1.0' },
          pluginManagerResponse: {
            ...environment.pluginManagerResponse,
            value: environment.pluginManagerResponse.value.map(bundle => bundle.name === 'harness-comfyui'
              ? { ...bundle, version: '0.1.0' }
              : bundle),
          },
        }
        : environment),
    })).toThrow(/official plugin-manager bundle/u)
    expect(() => parseOfficialLifecycleEvidence({
      ...evidence,
      environments: evidence.environments.map(environment => environment.label === 'left'
        ? {
          ...environment,
          directories: { ...environment.directories, pluginInstallPath: initialRight.directories.pluginInstallPath },
          install: { ...environment.install, path: initialRight.directories.pluginInstallPath },
        }
        : environment),
    })).toThrow(/different pluginInstallPath directories/u)
    expect(() => parseOfficialLifecycleEvidence({
      ...evidence,
      environments: evidence.environments.map(environment => environment.label === 'right'
        ? { ...environment, savedSetting: { ...environment.savedSetting, [browserSettings.fieldName]: initialLeft.savedSetting[browserSettings.fieldName] } }
        : environment),
    })).toThrow(/save different browserExecutablePath values/u)
    expect(() => parseOfficialLifecycleEvidence({
      ...evidence,
      environments: evidence.environments.map(environment => environment.label === 'left-restart'
        ? { ...environment, savedSetting: { ...environment.savedSetting, [browserSettings.fieldName]: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } }
        : environment),
    })).toThrow(/left restart must preserve/u)
    expect(() => parseOfficialLifecycleEvidence({
      ...evidence,
      environments: evidence.environments.map(environment => environment.label === 'left'
        ? { ...environment, savedSetting: { ...environment.savedSetting, entryId: 'unexpected-entry' } }
        : environment),
    })).toThrow(/entryId must equal config\/settings-entry-ids.json core/u)
    expect(() => parseOfficialLifecycleEvidence({
      ...evidence,
      environments: evidence.environments.map(environment => environment.label === 'left'
        ? { ...environment, savedSetting: { ...environment.savedSetting, [browserSettings.fieldName]: 'Applications/Chrome' } }
        : environment),
    })).toThrow(/browserExecutablePath must be an absolute path/u)
  })

  it('summarizes actual process, OS port, install, Session, and cleanup observations', async () => {
    const fixture = parseOfficialLifecycleFixture(lifecycleFixtureJson)
    const observation = createLifecycleRunObservation({
      fixture,
      label: 'left',
      repositoryRoot: '/repo',
      run: {
        record: {
          runId: '00000000-0000-4000-8000-000000000001',
          state: 'running',
          application: { bundlePath: '/Applications/DeepSeek Harness.app', bundleId: 'com.deepseek.dsh', version: '0.2.0-rc.2' },
          directories: { run: '/repo/.local/desktop-e2e/run', dshHome: '/repo/dsh', electronUserData: '/repo/user', workspace: '/repo/workspace', evidence: '/repo/evidence' },
          ports: { host: 51001, rendererCdp: 51002, hostInspector: 51003 },
          process: {
            pid: 700,
            processGroupId: 700,
            command: '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness',
            workingDirectory: '/repo/workspace',
            listeningPorts: [],
          },
          result: null,
        },
        config: desktopE2EConfig,
      },
      status: {
        processGroupMatchesRun: true,
        processGroup: { processGroupId: 700, members: [
          { pid: 700, parentPid: 1, processGroupId: 700, command: '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness', workingDirectory: '', listeningPorts: [51001, 51002] },
          { pid: 701, parentPid: 700, processGroupId: 700, command: '/Applications/DeepSeek Harness.app/Contents/Frameworks/Electron Framework.framework/Helpers/Renderer', workingDirectory: '', listeningPorts: [] },
        ] },
        ports: [{ port: 51001, pids: [700] }, { port: 51002, pids: [700] }, { port: 51003, pids: [] }],
      },
      homePath: '/repo/dsh/os-home',
      install: {
        expectedPackageName: 'harness-comfyui',
        packageVersion: '0.44.3',
        installedPackagePath: '/repo/dsh/profiles/desktop/node_modules/harness-comfyui/package.json',
        status: 'installed', restartRequired: true, enabled: true, evidenceComplete: true,
        artifactComparisons: candidateComparisons(),
        loadedClientSource: {
          scriptId: 'client-left',
          scriptUrl: 'dsh-app://app/plugins/??harness-comfyui/client.js&rev=66fdfd55bb7d',
          sourceMapUrl: '??harness-comfyui/client.js.map&rev=66fdfd55bb7d',
          moduleRoutes: ['harness-comfyui/client.js'],
          candidateModuleIndex: 0,
          sectionOffsetLine: 0,
          sectionOffsetColumn: 0,
          matchesCandidate: true,
        },
      },
      session: lifecycleSession('left', '/repo/workspace'),
      savedSetting: {
        entryId: settingsEntryIds.core,
        [browserSettings.fieldName]: '/Applications/Google Chrome.app/Contents/MacOS/./Google Chrome',
      },
      pluginManagerRecord: { name: 'harness-comfyui', version: '0.44.3', installed: true, enabled: true },
      pluginManagerResponse: {
        ok: true,
        value: [{
          name: 'harness-comfyui', version: '0.44.3', enabled: true, installed: true, optional: false, removable: true,
          rows: [], overrides: [],
        }],
      },
      cleanup: {
        record: { state: 'stopped', result: { exitCode: 0, error: null, portsReleased: true } },
        status: { processGroup: null, ports: [{ port: 51001, pids: [] }, { port: 51002, pids: [] }, { port: 51003, pids: [] }] },
      },
      stateOverride: 'stopped',
    })

    expect(observation).toMatchObject({
      label: 'left',
      runId: '00000000-0000-4000-8000-000000000001',
      state: 'stopped',
      directories: { home: '/repo/dsh/os-home', pluginInstallPath: '/repo/dsh/profiles/desktop/node_modules/harness-comfyui' },
      processObservedDuringStart: {
        rootPid: 700,
        processGroupId: 700,
        members: [{ workingDirectory: '/repo/workspace' }, { workingDirectory: null }],
      },
      session: { sessionId: 'session-left' },
      savedSetting: {
        entryId: settingsEntryIds.core,
        [browserSettings.fieldName]: '/Applications/Google Chrome.app/Contents/MacOS/./Google Chrome',
      },
    })
    const evidence = parseOfficialLifecycleEvidence({
      schemaVersion: 1,
      classification: 'automated-regression',
      acceptanceClaim: false,
      scenario: 'a15-successful-start-stop',
      recordedAt: '2026-09-30T00:00:00.000Z',
      fixtureId: '00000000-0000-4000-8000-000000000002',
      fixtureRoot: '/repo/.local/desktop-e2e/fixtures/fixture',
      artifact: {
        packageName: 'harness-comfyui',
        packageVersion: '0.44.3',
        sourcePath: '/tmp/candidate.tgz',
        stagedPath: '/repo/.local/desktop-e2e/artifacts/candidate.tgz',
        sourceIdentity: candidateSourceIdentity('/tmp/candidate.tgz'),
      },
      environments: [observation],
      parallelRequest: null,
      cleanup: { allRunsStopped: true, allPortsReleased: true, verifiedAt: '2026-09-30T00:00:01.000Z' },
    })
    expect(evidence).toMatchObject({ scenario: 'a15-successful-start-stop', environments: [expect.objectContaining({ runId: observation.runId })] })
    const incompleteA13 = {
      ...evidence,
      scenario: 'a13-parallel-instances',
      parallelRequest: {
        runId: observation.runId,
        operation: lifecycleFixtureJson.operations.hostReadOnlyRequestOperation,
        result: JSON.stringify({ ok: true, value: { items: [{
          sessionId: observation.session.sessionId,
          cwd: observation.directories.workspace,
          projections: { values: { title: observation.session.title } },
        }] } }),
        sessionId: observation.session.sessionId,
        workspaceId: observation.session.workspaceId,
        workspacePath: observation.directories.workspace,
        cwd: observation.directories.workspace,
        visibleSessionIds: [observation.session.sessionId],
        ok: true,
      },
    }
    expect(() => parseOfficialLifecycleEvidence(incompleteA13)).toThrow(/both original and restarted/u)
    expect(() => parseOfficialLifecycleEvidence({
      ...evidence,
      environments: [{
        ...observation,
        processObservedDuringStart: {
          ...observation.processObservedDuringStart,
          members: observation.processObservedDuringStart.members.map((member, index) => index === 1
            ? { ...member, workingDirectory: '' }
            : member),
        },
      }],
    })).toThrow(/workingDirectory must be null or an absolute path/u)

    const conflictRun = {
      config: desktopE2EConfig,
      record: {
        runId: observation.runId,
        state: 'failed',
        application: observation.application,
        directories: {
          dshHome: observation.directories.dshHome,
          electronUserData: observation.directories.electronUserData,
          workspace: observation.directories.workspace,
          evidence: observation.directories.evidence,
        },
        ports: observation.ports,
        process: null,
        result: { error: 'PORT_CONFLICT: assigned ports are already listening', portsReleased: false },
      },
    }
    const conflictPorts = Object.values(observation.ports)
    const conflictObservation = createLifecycleRunObservation({
      fixture,
      label: fixture.scenarioLabels.portConflict,
      repositoryRoot: '/repo',
      run: conflictRun,
      status: {
        processGroup: null,
        processGroupMatchesRun: false,
        ports: conflictPorts.map((port, index) => ({ port, pids: index === 0 ? [process.pid] : [] })),
      },
      cleanup: {
        record: {
          runId: observation.runId,
          state: 'failed',
          result: { error: 'PORT_CONFLICT: assigned ports are already listening', portsReleased: false },
        },
        status: {
          processGroup: null,
          processGroupMatchesRun: false,
          ports: conflictPorts.map(port => ({ port, pids: [] })),
        },
      },
      stateOverride: 'failed',
      failure: 'PORT_CONFLICT: assigned ports are already listening',
    })
    expect(conflictObservation.portOwnersAtReady[0].pids).toEqual([process.pid])
    expect(conflictObservation.cleanup).toMatchObject({
      error: 'PORT_CONFLICT: assigned ports are already listening',
      portsReleased: true,
      portOwners: conflictPorts.map(port => ({ port, pids: [] })),
    })
    expect(parseOfficialLifecycleEvidence({
      ...evidence,
      scenario: 'a15-port-conflict',
      environments: [conflictObservation],
    }).environments[0].cleanup.portsReleased).toBe(true)

    const conflictEvidence = parseOfficialLifecycleEvidence({
      ...evidence,
      scenario: 'a15-port-conflict',
      environments: [{
        ...observation,
        label: 'conflict',
        state: 'failed',
        processObservedDuringStart: null,
        failure: 'PORT_CONFLICT: the lifecycle fixture held an OS loopback port',
      }],
    })
    expect(conflictEvidence.environments[0].processObservedDuringStart).toBeNull()
    expect(() => parseOfficialLifecycleEvidence({
      ...conflictEvidence,
      environments: [{ ...conflictEvidence.environments[0], processObservedDuringStart: observation.processObservedDuringStart }],
    })).toThrow(/no app process was spawned/u)
    expect(() => parseOfficialLifecycleEvidence({
      ...conflictEvidence,
      environments: [{
        ...conflictEvidence.environments[0],
        portOwnersAtReady: conflictEvidence.environments[0].portOwnersAtReady.map(owner => ({ ...owner, pids: [] })),
      }],
    })).toThrow(/operating-system listener/u)
    expect(() => parseOfficialLifecycleEvidence({
      ...conflictEvidence,
      environments: [{
        ...conflictEvidence.environments[0],
        portOwnersAtReady: [{ port: 52000, pids: [process.pid] }],
      }],
    })).toThrow(/operating-system listener/u)

    const root = await realpath(await mkdtemp(join(tmpdir(), 'official-lifecycle-evidence-')))
    temporaryRoots.add(root)
    const evidenceDirectory = join(root, '.local', 'desktop-e2e', 'lifecycle-fixtures', 'evidence')
    const evidencePath = await writeOfficialLifecycleEvidence({
      evidence,
      directory: evidenceDirectory,
      repositoryRoot: root,
      fixture: lifecycleFixtureJson,
    })
    expect(evidencePath.endsWith(lifecycleFixtureJson.paths.evidenceFilenames[evidence.scenario])).toBe(true)
    expect(JSON.parse(await readFile(evidencePath, 'utf8'))).toEqual(evidence)
    await expect(writeOfficialLifecycleEvidence({
      evidence,
      directory: evidenceDirectory,
      repositoryRoot: root,
      fixture: lifecycleFixtureJson,
    })).rejects.toMatchObject({ code: 'EEXIST' })
  })
})
