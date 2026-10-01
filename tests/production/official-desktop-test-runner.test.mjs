import { EventEmitter } from 'node:events'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import lifecycleFixture from '../desktop/fixtures/official-lifecycle-fixture.json' with { type: 'json' }
import desktopE2EConfig from '../../config/desktop-e2e.json' with { type: 'json' }
import { parseDesktopE2ECommandCancellationResult } from '../../config/desktop-e2e-schema.mjs'
import { OFFICIAL_CANDIDATE_RUNTIME_PATHS } from '../desktop/fixtures/official-candidate-identity-schema.mjs'
import { trackedStartProbe } from '../desktop/fixtures/official-command-cancellation.mjs'
import { runDesktopTests } from '../desktop/run-desktop-tests.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const temporaryRoots = new Set()

afterEach(async () => {
  await Promise.all([...temporaryRoots].map(root => rm(root, { recursive: true, force: true })))
  temporaryRoots.clear()
})

describe('official Desktop test runner', () => {
  it('builds and packs the current package, then runs only the enabled official regressions with fixture-owned environment names', async () => {
    const fixtureRoot = await createRunnerRoot()
    const lifecycle = structuredClone(lifecycleFixture)
    lifecycle.artifact.sourcePathEnvironmentName = 'RUNNER_TARBALL_PATH'
    lifecycle.artifact.sourceIdentityPathEnvironmentName = 'RUNNER_IDENTITY_PATH'
    lifecycle.runGateEnvironmentName = 'RUNNER_LIFECYCLE_GATE'
    await writeFile(join(fixtureRoot, 'tests/desktop/fixtures/official-lifecycle-fixture.json'), JSON.stringify(lifecycle))

    const calls = []
    const spawnCommand = mockSpawn(calls)
    const signalSource = new EventEmitter()
    const environment = {
      PATH: '/runner/bin',
      HOME: '/runner/home',
      OPENROUTER_API_KEY: 'must-not-reach-tests',
      OPENCODE_GO_API_KEY: 'must-not-reach-tests',
      OFFICIAL_DESKTOP_E2E_API_KEY: 'must-not-reach-tests',
      RUNNER_LIFECYCLE_GATE: '0',
      RUNNER_TARBALL_PATH: '/old/candidate.tgz',
      PRESERVED_RUNNER_SETTING: 'preserved',
    }

    const result = await runDesktopTests({ repositoryRoot: fixtureRoot, spawnCommand, environment, signalSource })

    const expectedArchive = resolve(fixtureRoot,
      '.local/desktop-e2e/desktop-test-runner/artifacts/harness-comfyui-9.8.7.tgz')
    const expectedIdentityPath = resolve(dirname(expectedArchive), lifecycle.artifact.sourceIdentityFilename)
    expect(result).toMatchObject({ archivePath: expectedArchive, sourceIdentityPath: expectedIdentityPath })
    expect(await readFile(join(result.invocationDirectory, desktopE2EConfig.commandRunner.invocationFilename), 'utf8'))
      .toContain(result.invocationId)
    expect(signalSource.listenerCount('SIGINT')).toBe(0)
    expect(signalSource.listenerCount('SIGTERM')).toBe(0)
    expect(await stat(expectedArchive)).toMatchObject({ isFile: expect.any(Function) })
    expect(calls.map(({ command, args }) => [command, args.slice(0, 3)])).toEqual([
      ['pnpm', ['run', 'build']],
      [process.execPath, ['scripts/build/cli.mjs', 'pack', '--out']],
      ['pnpm', ['exec', 'vitest', 'run']],
    ])
    expect(calls[1].args).toEqual(['scripts/build/cli.mjs', 'pack', '--out', expectedArchive])
    const testCall = calls[2]
    expect(testCall.args).toEqual(expect.arrayContaining([
      'tests/desktop/official-desktop-live.test.mjs',
      'tests/desktop/official-desktop-lifecycle.test.mjs',
      'tests/desktop/fixtures/official-business-fixture.test.mjs',
      'tests/desktop/fixtures/official-business-media.test.mjs',
      'tests/production/official-desktop-lifecycle.test.mjs',
      'tests/production/official-desktop-probe.test.mjs',
      'tests/production/official-plugin-install.test.mjs',
      'tests/production/official-profile-patch.test.mjs',
      'tests/production/renderer-cdp.test.mjs',
      'tests/production/plugin-package.test.mjs',
      'tests/production/official-desktop-test-runner.test.mjs',
      'tests/production/official-command-cancellation.test.mjs',
      'tests/production/official-candidate-identity.test.mjs',
      '--maxWorkers=1',
      '--no-file-parallelism',
      '--testTimeout=120000',
    ]))
    expect(testCall.args).not.toContain('tests/desktop/desktop-live.test.mjs')
    expect(testCall.options).toMatchObject({ cwd: fixtureRoot, stdio: 'inherit' })
    expect(calls.slice(0, 3).map(call => call.options.detached)).toEqual([true, true, true])
    expect(testCall.options.env).toMatchObject({
      PATH: '/runner/bin',
      HOME: '/runner/home',
      RUNNER_LIFECYCLE_GATE: '1',
      RUNNER_TARBALL_PATH: expectedArchive,
      RUNNER_IDENTITY_PATH: expectedIdentityPath,
      PRESERVED_RUNNER_SETTING: 'preserved',
    })
    for (const name of [
      ...desktopE2EConfig.modes.development.credentialEnvironmentNames,
      lifecycle.credentials.testKeyEnvironmentName,
    ]) {
      expect(testCall.options.env).not.toHaveProperty(name)
      expect(calls[0].options.env).not.toHaveProperty(name)
      expect(calls[1].options.env).not.toHaveProperty(name)
    }
    const invocationDirectoryName = desktopE2EConfig.commandRunner.invocationDirectoryEnvironmentName
    expect(testCall.options.env[invocationDirectoryName]).toContain(fixtureRoot)
    expect(calls[0].options.env).not.toHaveProperty(invocationDirectoryName)
    expect(calls[1].options.env).not.toHaveProperty(invocationDirectoryName)
    const sourceIdentity = JSON.parse(await readFile(testCall.options.env.RUNNER_IDENTITY_PATH, 'utf8'))
    expect(sourceIdentity).toMatchObject({
      schemaVersion: 1,
      archivePath: expectedArchive,
      packageName: 'harness-comfyui',
      packageVersion: '9.8.7',
      sourceCommit: expect.stringMatching(/^[0-9a-f]{40,64}$/u),
      dirty: expect.any(Boolean),
      runtimeFiles: expect.arrayContaining(OFFICIAL_CANDIDATE_RUNTIME_PATHS),
    })
    expect(JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')).scripts['test:desktop'])
      .toBe('node tests/desktop/run-desktop-tests.mjs')
  })

  it.each([
    ['build', 23, 1],
    ['pack', 24, 2],
    ['tests', 25, 3],
  ])('propagates a nonzero %s child exit code and stops the runner', async (failedPhase, exitCode, expectedCallCount) => {
    const fixtureRoot = await createRunnerRoot()
    const calls = []
    const spawnCommand = mockSpawn(calls, { failedPhase, exitCode })

    await expect(runDesktopTests({ repositoryRoot: fixtureRoot, spawnCommand, environment: {} }))
      .rejects.toMatchObject({ phase: failedPhase, exitCode })
    expect(calls).toHaveLength(expectedCallCount)
  })

  it('fails before Vitest when pack exits successfully without producing its requested archive', async () => {
    const fixtureRoot = await createRunnerRoot()
    const calls = []

    await expect(runDesktopTests({
      repositoryRoot: fixtureRoot,
      spawnCommand: mockSpawn(calls, { omitArchive: true }),
      environment: {},
    })).rejects.toMatchObject({ phase: 'pack-output', exitCode: 1 })
    expect(calls.map(({ args }) => args[1])).toEqual(['build', 'pack'])
  })

  it('reports a child spawn error without continuing to later phases', async () => {
    const fixtureRoot = await createRunnerRoot()
    const calls = []
    const spawnCommand = (command, args, options) => {
      calls.push({ command, args, options })
      const child = new EventEmitter()
      queueMicrotask(() => child.emit('error', new Error('controlled spawn failure')))
      return child
    }

    await expect(runDesktopTests({ repositoryRoot: fixtureRoot, spawnCommand, environment: {} }))
      .rejects.toMatchObject({ phase: 'build', exitCode: 1, cause: expect.any(Error) })
    expect(calls).toHaveLength(1)
  })

  it('waits for owned probe cleanup before resolving SIGTERM and preserves command-run evidence', async () => {
    const fixtureRoot = await createRunnerRoot()
    const runId = 'e02a9244-447f-4f96-83c3-83a35abdaab7'
    const recordPath = resolve(fixtureRoot, desktopE2EConfig.paths.runRootRelativePath, runId, desktopE2EConfig.paths.runRecordFilename)
    const leasePath = resolve(fixtureRoot, desktopE2EConfig.modes.development.environmentRootRelativePath,
      desktopE2EConfig.modes.development.leaseFilename)
    await mkdir(dirname(leasePath), { recursive: true })
    await writeFile(leasePath, 'controlled lease')
    await mkdir(dirname(recordPath), { recursive: true })
    await writeFile(recordPath, '{}')
    const stopStarted = deferred()
    const stopGate = deferred()
    let statusReads = 0
    const runner = await startCancellationRunner({
      fixtureRoot,
      runId,
      recordPath,
      leasePath,
      getProbeStatus: async () => {
        statusReads += 1
        const stopped = statusReads > 1
        return createProbeStatus({ runId, recordPath, leasePath, state: stopped ? 'stopped' : 'running', portsReleased: stopped })
      },
      stopProbe: async args => {
        stopStarted.resolve(args)
        await stopGate.promise
        await rm(leasePath, { force: true })
        return { recordPath }
      },
    })
    let settled = false
    const run = runner.run.then(value => { settled = true; return value }, error => { settled = true; throw error })

    runner.signalSource.emit('SIGTERM')
    const stopCall = await stopStarted.promise
    expect(stopCall).toMatchObject({ runId, repositoryRoot: fixtureRoot, config: desktopE2EConfig })
    expect(settled).toBe(false)
    expect(runner.signals).toEqual([[48121, 'SIGTERM']])
    stopGate.resolve()
    await expect(run).rejects.toMatchObject({ phase: 'cancellation', exitCode: 143 })
    expect(settled).toBe(true)
    expect(runner.signalSource.listenerCount('SIGINT')).toBe(0)
    expect(runner.signalSource.listenerCount('SIGTERM')).toBe(0)

    const invocationDirectory = runner.invocationDirectory
    const cancellation = parseDesktopE2ECommandCancellationResult(JSON.parse(await readFile(
      join(invocationDirectory, desktopE2EConfig.commandRunner.resultFilename), 'utf8',
    )))
    expect(cancellation).toMatchObject({
      signal: 'SIGTERM', phase: 'tests', exitCode: 143, cleanupSucceeded: true,
      commandChild: { pid: 48121, processGroupId: 48121, workingDirectory: fixtureRoot },
      runs: [{ runId, state: 'stopped', processGroupAbsent: true, portsReleased: true, environmentLeaseReleased: true }],
    })
    expect(cancellation.runnerPid).toBe(process.pid)
    expect(cancellation.runnerCwd).toBe(fixtureRoot)
  })

  it('keeps completed stop evidence and does not stop an already-clean terminal Desktop run twice', async () => {
    const fixtureRoot = await createRunnerRoot()
    const runId = 'b62739be-cc74-4807-8bc9-2a61ab823789'
    const recordPath = resolve(fixtureRoot, desktopE2EConfig.paths.runRootRelativePath, runId, desktopE2EConfig.paths.runRecordFilename)
    const leasePath = resolve(fixtureRoot, desktopE2EConfig.modes.development.environmentRootRelativePath,
      desktopE2EConfig.modes.development.leaseFilename)
    await mkdir(dirname(recordPath), { recursive: true })
    await writeFile(recordPath, '{}')
    const stopResultPath = resolve(fixtureRoot, desktopE2EConfig.paths.runRootRelativePath, runId,
      desktopE2EConfig.paths.directoryNames.evidence, desktopE2EConfig.paths.outputFilenames.stopResultEvidence)
    await mkdir(dirname(stopResultPath), { recursive: true })
    await writeFile(stopResultPath, '{}')
    let stopCalls = 0
    const runner = await startCancellationRunner({
      fixtureRoot,
      runId,
      recordPath,
      leasePath,
      getProbeStatus: async () => createProbeStatus({
        runId, recordPath, leasePath, state: 'stopped', portsReleased: true, processGroup: null,
      }),
      stopProbe: async () => { stopCalls += 1; throw new Error('stopProbe must not repeat an already completed stop') },
    })

    runner.signalSource.emit('SIGINT')
    await expect(runner.run).rejects.toMatchObject({ phase: 'cancellation', exitCode: 130 })
    expect(stopCalls).toBe(0)
    const cancellation = parseDesktopE2ECommandCancellationResult(JSON.parse(await readFile(
      join(runner.invocationDirectory, desktopE2EConfig.commandRunner.resultFilename), 'utf8',
    )))
    expect(cancellation).toMatchObject({
      signal: 'SIGINT', exitCode: 130, cleanupSucceeded: true,
      runs: [{ runId, state: 'stopped', processGroupAbsent: true, portsReleased: true, environmentLeaseReleased: true }],
    })
  })

  it('retains the signalled child-group identity when its direct child closes during cancellation setup', async () => {
    const fixtureRoot = await createRunnerRoot()
    const runId = 'dbb00fdd-9966-415e-9839-c7bf46653b84'
    const recordPath = resolve(fixtureRoot, desktopE2EConfig.paths.runRootRelativePath, runId, desktopE2EConfig.paths.runRecordFilename)
    const leasePath = resolve(fixtureRoot, desktopE2EConfig.modes.development.environmentRootRelativePath,
      desktopE2EConfig.modes.development.leaseFilename)
    await mkdir(dirname(leasePath), { recursive: true })
    await writeFile(leasePath, 'controlled lease')
    await mkdir(dirname(recordPath), { recursive: true })
    await writeFile(recordPath, '{}')
    let statusReads = 0
    const runner = await startCancellationRunner({
      fixtureRoot,
      runId,
      recordPath,
      leasePath,
      closeCommandOnSignal: true,
      getProbeStatus: async () => {
        statusReads += 1
        const stopped = statusReads > 1
        return createProbeStatus({ runId, recordPath, leasePath, state: stopped ? 'stopped' : 'running', portsReleased: stopped })
      },
      stopProbe: async () => { await rm(leasePath, { force: true }) },
    })

    runner.signalSource.emit('SIGTERM')
    await expect(runner.run).rejects.toMatchObject({ phase: 'cancellation', exitCode: 143 })
    expect(runner.signals).toEqual([[48121, 'SIGTERM']])
    const cancellation = parseDesktopE2ECommandCancellationResult(JSON.parse(await readFile(
      join(runner.invocationDirectory, desktopE2EConfig.commandRunner.resultFilename), 'utf8',
    )))
    expect(cancellation.commandChild).toMatchObject({ pid: 48121, processGroupId: 48121, workingDirectory: fixtureRoot })
  })

  it('records a cancellation-marker failure and continues cleaning the captured process group and Desktop run', async () => {
    const fixtureRoot = await createRunnerRoot()
    const runId = '89e2e4fc-a6ca-4d73-91f7-92c83b2b37ab'
    const recordPath = resolve(fixtureRoot, desktopE2EConfig.paths.runRootRelativePath, runId, desktopE2EConfig.paths.runRecordFilename)
    const leasePath = resolve(fixtureRoot, desktopE2EConfig.modes.development.environmentRootRelativePath,
      desktopE2EConfig.modes.development.leaseFilename)
    await mkdir(dirname(leasePath), { recursive: true })
    await writeFile(leasePath, 'controlled lease')
    await mkdir(dirname(recordPath), { recursive: true })
    await writeFile(recordPath, '{}')
    let statusReads = 0
    const runner = await startCancellationRunner({
      fixtureRoot,
      runId,
      recordPath,
      leasePath,
      getProbeStatus: async () => {
        statusReads += 1
        const stopped = statusReads > 1
        return createProbeStatus({ runId, recordPath, leasePath, state: stopped ? 'stopped' : 'running', portsReleased: stopped })
      },
      stopProbe: async () => { await rm(leasePath, { force: true }) },
    })
    await writeFile(join(runner.invocationDirectory, desktopE2EConfig.commandRunner.cancellationFilename), '{ invalid json')

    runner.signalSource.emit('SIGTERM')
    await expect(runner.run).rejects.toMatchObject({ phase: 'cancellation', exitCode: 143 })
    expect(runner.signals).toEqual([[48121, 'SIGTERM']])
    const cancellation = parseDesktopE2ECommandCancellationResult(JSON.parse(await readFile(
      join(runner.invocationDirectory, desktopE2EConfig.commandRunner.resultFilename), 'utf8',
    )))
    expect(cancellation).toMatchObject({
      cleanupSucceeded: false,
      cleanupFailures: [expect.stringMatching(/^command cancellation marker:/u)],
      runs: [{ runId, state: 'stopped', processGroupAbsent: true, portsReleased: true, environmentLeaseReleased: true }],
    })
  })

  it('publishes cleanup-failed evidence with the original stop error and observed OS state', async () => {
    const fixtureRoot = await createRunnerRoot()
    const runId = 'df148c22-0e50-4809-b760-f12736414bab'
    const recordPath = resolve(fixtureRoot, desktopE2EConfig.paths.runRootRelativePath, runId, desktopE2EConfig.paths.runRecordFilename)
    const leasePath = resolve(fixtureRoot, desktopE2EConfig.modes.development.environmentRootRelativePath,
      desktopE2EConfig.modes.development.leaseFilename)
    await mkdir(dirname(leasePath), { recursive: true })
    await writeFile(leasePath, 'controlled lease')
    await mkdir(dirname(recordPath), { recursive: true })
    await writeFile(recordPath, '{}')
    let statusReads = 0
    const runner = await startCancellationRunner({
      fixtureRoot,
      runId,
      recordPath,
      leasePath,
      getProbeStatus: async () => {
        statusReads += 1
        return createProbeStatus({ runId, recordPath, leasePath, state: 'running', portsReleased: false })
      },
      stopProbe: async () => { throw new Error('controlled stop failure') },
    })

    runner.signalSource.emit('SIGTERM')
    await expect(runner.run).rejects.toMatchObject({ phase: 'cancellation', exitCode: 143 })
    const cancellation = parseDesktopE2ECommandCancellationResult(JSON.parse(await readFile(
      join(runner.invocationDirectory, desktopE2EConfig.commandRunner.resultFilename), 'utf8',
    )))
    expect(statusReads).toBe(2)
    expect(cancellation).toMatchObject({
      cleanupSucceeded: false,
      commandChild: { pid: 48121, processGroupId: 48121 },
      runs: [{
        runId,
        state: 'cleanup-failed',
        processGroupAbsent: false,
        portsReleased: false,
        environmentLeaseReleased: false,
        cleanupError: 'controlled stop failure',
      }],
    })
    expect(cancellation.cleanupFailures).toContain(`Desktop run ${runId}: controlled stop failure`)
  })

  it('uses the configured startup polling interval while waiting for the owned command group to exit', async () => {
    const config = structuredClone(desktopE2EConfig)
    config.startup.pollIntervalMs = 37
    const fixtureRoot = await createRunnerRoot(config)
    const runId = '06e7f288-35c5-4ce4-8158-e916b0ac9f22'
    const recordPath = resolve(fixtureRoot, config.paths.runRootRelativePath, runId, config.paths.runRecordFilename)
    const leasePath = resolve(fixtureRoot, config.modes.development.environmentRootRelativePath,
      config.modes.development.leaseFilename)
    await mkdir(dirname(leasePath), { recursive: true })
    await writeFile(leasePath, 'controlled lease')
    await mkdir(dirname(recordPath), { recursive: true })
    await writeFile(recordPath, '{}')
    let statusReads = 0
    const runner = await startCancellationRunner({
      fixtureRoot,
      runId,
      recordPath,
      leasePath,
      config,
      holdProcessGroupUntilPoll: true,
      getProbeStatus: async () => {
        statusReads += 1
        const stopped = statusReads > 1
        return createProbeStatus({ runId, recordPath, leasePath, state: stopped ? 'stopped' : 'running', portsReleased: stopped })
      },
      stopProbe: async () => { await rm(leasePath, { force: true }) },
    })

    runner.signalSource.emit('SIGTERM')
    await expect(runner.run).rejects.toMatchObject({ phase: 'cancellation', exitCode: 143 })
    expect(runner.sleepCalls).toContain(37)
    expect(runner.signals).toEqual([[48121, 'SIGTERM']])
  })

  it('returns the cancellation result after command-group timeout even when the child never closes', async () => {
    const config = structuredClone(desktopE2EConfig)
    config.startup.pollIntervalMs = 1
    config.commandRunner.commandStopTimeoutMs = 1
    config.commandRunner.commandKillTimeoutMs = 1
    const fixtureRoot = await createRunnerRoot(config)
    const runId = 'b1d18758-213e-465f-b23c-56d31e02f03e'
    const recordPath = resolve(fixtureRoot, config.paths.runRootRelativePath, runId, config.paths.runRecordFilename)
    const leasePath = resolve(fixtureRoot, config.modes.development.environmentRootRelativePath,
      config.modes.development.leaseFilename)
    await mkdir(dirname(leasePath), { recursive: true })
    await writeFile(leasePath, 'controlled lease')
    await mkdir(dirname(recordPath), { recursive: true })
    await writeFile(recordPath, '{}')
    let statusReads = 0
    const runner = await startCancellationRunner({
      fixtureRoot,
      runId,
      recordPath,
      leasePath,
      config,
      retainProcessGroup: true,
      emitCloseOnGroupSignal: false,
      advanceClockOnSleep: true,
      getProbeStatus: async () => {
        statusReads += 1
        const stopped = statusReads > 1
        return createProbeStatus({ runId, recordPath, leasePath, state: stopped ? 'stopped' : 'running', portsReleased: stopped })
      },
      stopProbe: async () => { await rm(leasePath, { force: true }) },
    })

    runner.signalSource.emit('SIGTERM')
    let timeout
    const completion = await Promise.race([
      runner.run.then(() => ({ finished: true }), error => ({ finished: true, error })),
      new Promise(resolvePromise => { timeout = setTimeout(() => resolvePromise({ finished: false }), 100) }),
    ])
    clearTimeout(timeout)

    expect(completion.finished).toBe(true)
    expect(completion.error).toMatchObject({ phase: 'cancellation', exitCode: 143 })
    expect(runner.signals).toEqual([[48121, 'SIGTERM'], [48121, 'SIGKILL']])
    expect(runner.unrefCalls).toBe(1)
    expect(runner.signalSource.listenerCount('SIGINT')).toBe(0)
    expect(runner.signalSource.listenerCount('SIGTERM')).toBe(0)
    const cancellation = parseDesktopE2ECommandCancellationResult(JSON.parse(await readFile(
      join(runner.invocationDirectory, config.commandRunner.resultFilename), 'utf8',
    )))
    expect(cancellation).toMatchObject({
      signal: 'SIGTERM', exitCode: 143, cleanupSucceeded: false,
      commandChild: { pid: 48121, processGroupId: 48121, workingDirectory: fixtureRoot },
      cleanupFailures: [expect.stringMatching(/^runner child process group:/u)],
      runs: [{ runId, state: 'stopped', portsReleased: true, environmentLeaseReleased: true }],
    })
  })

  it('does not spawn the pack command when cancellation arrives during pack directory preparation', async () => {
    const fixtureRoot = await createRunnerRoot()
    const calls = []
    const signals = []
    const signalSource = new EventEmitter()
    const spawnCommand = (command, args, options) => {
      calls.push({ command, args, options })
      const child = new EventEmitter()
      child.pid = 50000 + calls.length - 1
      queueMicrotask(() => {
        child.emit('close', 0, null)
        if (args[1] === 'build') {
          queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => signalSource.emit('SIGTERM'))))
        }
      })
      return child
    }

    await expect(runDesktopTests({
      repositoryRoot: fixtureRoot,
      spawnCommand,
      environment: {},
      signalSource,
      signalProcessGroup: async (processGroupId, signal) => { signals.push([processGroupId, signal]) },
      processGroupExists: async () => false,
    })).rejects.toMatchObject({ phase: 'cancellation', exitCode: 143 })

    expect(calls.map(({ command, args }) => [command, args.slice(0, 3)])).toEqual([
      ['pnpm', ['run', 'build']],
    ])
    expect(signals).toEqual([])
    const invocationRoot = join(fixtureRoot, desktopE2EConfig.commandRunner.invocationsRelativePath)
    const [invocationId] = await readdir(invocationRoot)
    const cancellation = parseDesktopE2ECommandCancellationResult(JSON.parse(await readFile(
      join(invocationRoot, invocationId, desktopE2EConfig.commandRunner.resultFilename), 'utf8',
    )))
    expect(cancellation).toMatchObject({
      signal: 'SIGTERM',
      phase: 'pack',
      commandChild: null,
      cleanupSucceeded: true,
      exitCode: 143,
    })
  })
})

async function startCancellationRunner({ fixtureRoot, runId, recordPath, leasePath, getProbeStatus, stopProbe,
  config = desktopE2EConfig, closeCommandOnSignal = false, holdProcessGroupUntilPoll = false,
  retainProcessGroup = false, emitCloseOnGroupSignal = true, advanceClockOnSleep = false }) {
  const signalSource = new EventEmitter()
  const started = deferred()
  const processGroups = new Set()
  const signals = []
  const sleepCalls = []
  let unrefCalls = 0
  let clockTime = Date.now()
  const calls = []
  const automaticSpawn = mockSpawn(calls)
  let child
  let testEnvironment
  const spawnCommand = (command, args, options) => {
    const phase = args[1] === 'build' ? 'build'
      : command === process.execPath && args[1] === 'pack' ? 'pack'
        : 'tests'
    if (phase !== 'tests') return automaticSpawn(command, args, options)
    calls.push({ command, args, options })
    testEnvironment = options.env
    child = new EventEmitter()
    child.pid = 48121
    child.exitCode = null
    child.signalCode = null
    child.unref = () => { unrefCalls += 1 }
    processGroups.add(child.pid)
    queueMicrotask(async () => {
      const environmentName = desktopE2EConfig.commandRunner.invocationDirectoryEnvironmentName
      const previous = process.env[environmentName]
      process.env[environmentName] = options.env[environmentName]
      try {
        await trackedStartProbe({ runId, repositoryRoot: fixtureRoot, config: desktopE2EConfig, mode: 'development' }, {
          async startProbe() { return { recordPath } },
        })
        started.resolve()
      } catch (error) {
        started.reject(error)
      } finally {
        if (previous === undefined) delete process.env[environmentName]
        else process.env[environmentName] = previous
      }
    })
    return child
  }
  const run = runDesktopTests({
    repositoryRoot: fixtureRoot,
    spawnCommand,
    environment: {},
    signalSource,
    signalProcessGroup: async (processGroupId, signal) => {
      signals.push([processGroupId, signal])
      if (!holdProcessGroupUntilPoll && !retainProcessGroup) processGroups.delete(processGroupId)
      if (emitCloseOnGroupSignal) {
        child.signalCode = signal
        child.emit('close', null, signal)
      }
    },
    processGroupExists: async processGroupId => processGroups.has(processGroupId),
    sleep: async timeoutMs => {
      sleepCalls.push(timeoutMs)
      if (holdProcessGroupUntilPoll) processGroups.clear()
      if (advanceClockOnSleep) clockTime += timeoutMs
    },
    now: () => clockTime,
    getProbeStatus,
    stopProbe,
  })
  await started.promise
  if (closeCommandOnSignal) {
    signalSource.once('SIGTERM', () => child.emit('close', null, 'SIGTERM'))
  }
  return {
    run,
    signalSource,
    signals,
    sleepCalls,
    get unrefCalls() { return unrefCalls },
    invocationDirectory: testEnvironment[desktopE2EConfig.commandRunner.invocationDirectoryEnvironmentName],
  }
}

function createProbeStatus({ runId, recordPath, leasePath, state, portsReleased, processGroup }) {
  const portValues = [43101, 43102, 43103]
  const ports = Object.fromEntries(desktopE2EConfig.ports.roles.map((role, index) => [role, portValues[index]]))
  return {
    record: {
      runId,
      state,
      process: { pid: 43210, processGroupId: 43210 },
      ports,
      environment: { leasePath },
    },
    recordPath,
    processGroup: processGroup === undefined ? (portsReleased ? null : { members: [{ pid: 43210 }] }) : processGroup,
    ports: portValues.map(port => ({ port, pids: portsReleased ? [] : [43210] })),
  }
}

function deferred() {
  let resolvePromise
  let rejectPromise
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

async function createRunnerRoot(config = desktopE2EConfig) {
  const root = await mkdtemp(join(tmpdir(), 'official-desktop-test-runner-'))
  temporaryRoots.add(root)
  await mkdir(join(root, 'config'), { recursive: true })
  await mkdir(join(root, 'tests/desktop/fixtures'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'harness-comfyui', version: '9.8.7' }))
  await writeFile(join(root, 'config/desktop-e2e.json'), JSON.stringify(config))
  await writeFile(join(root, 'tests/desktop/fixtures/official-lifecycle-fixture.json'), JSON.stringify(lifecycleFixture))
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['-c', 'user.name=Runner Test', '-c', 'user.email=runner@example.test', 'add', '.'], { cwd: root })
  execFileSync('git', ['-c', 'user.name=Runner Test', '-c', 'user.email=runner@example.test', 'commit', '-m', 'runner fixture'], { cwd: root })
  return root
}

function mockSpawn(calls, { failedPhase, exitCode = 1, omitArchive = false } = {}) {
  return (command, args, options) => {
    calls.push({ command, args, options })
    const child = new EventEmitter()
    queueMicrotask(async () => {
      const phase = args[1] === 'build' ? 'build'
        : command === process.execPath && args[1] === 'pack' ? 'pack'
          : 'tests'
      if (phase === 'pack' && failedPhase !== 'pack' && !omitArchive) {
        const archivePath = args[args.indexOf('--out') + 1]
        const packageRoot = join(dirname(archivePath), 'mock-pack-root', 'package')
        await mkdir(packageRoot, { recursive: true })
        await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'harness-comfyui', version: '9.8.7' }))
        for (const [index, relativePath] of OFFICIAL_CANDIDATE_RUNTIME_PATHS.entries()) {
          const outputPath = join(packageRoot, relativePath)
          await mkdir(dirname(outputPath), { recursive: true })
          await writeFile(outputPath, `controlled-runtime-${index}`)
        }
        await mkdir(dirname(archivePath), { recursive: true })
        execFileSync('tar', ['-czf', archivePath, 'package'], { cwd: dirname(packageRoot) })
      }
      child.emit('close', phase === failedPhase ? exitCode : 0, null)
    })
    return child
  }
}
