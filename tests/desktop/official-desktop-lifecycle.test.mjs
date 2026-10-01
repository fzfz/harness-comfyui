import { randomUUID } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import pluginPackageConfig from '../../config/plugin-package.json' with { type: 'json' }
import lifecycleFixtureJson from './fixtures/official-lifecycle-fixture.json' with { type: 'json' }
import pluginInstallUi from './fixtures/official-plugin-install-config.json' with { type: 'json' }
import providerFixture from '../fixtures/custom-provider-reasoning.json' with { type: 'json' }
import browserSettings from '../../config/browser-settings.json' with { type: 'json' }
import settingsEntryIds from '../../config/settings-entry-ids.json' with { type: 'json' }
import productionProfile from '../../config/profiles/production.json' with { type: 'json' }
import { parseDesktopE2EConfig } from '../../config/desktop-e2e-schema.mjs'
import {
  getProbeStatus,
  inspectProcessGroup,
  loadDesktopE2EConfig,
  startProbe,
  stopProbe,
} from './fixtures/official-desktop-probe.mjs'
import { loadOfficialProfilePatchAdapter } from './fixtures/official-profile-patch.mjs'
import { installOfficialPluginCandidate } from './fixtures/official-plugin-install.mjs'
import {
  assertOfficialCandidateClientSource,
  compareOfficialCandidateFiles,
  isOfficialCandidateClientScriptUrl,
  readOfficialCandidateClientSourceMap,
} from './fixtures/official-candidate-identity.mjs'
import { parseOfficialCandidateSourceIdentity } from './fixtures/official-candidate-identity-schema.mjs'
import { connectDesktopPage, getDesktopPageConnectionIdentity } from './fixtures/renderer-cdp.mjs'
import { parseOfficialPluginManagerListBundlesResponse } from './fixtures/official-lifecycle-schema.mjs'
import { trackedStartProbe } from './fixtures/official-command-cancellation.mjs'
import {
  assertIndependentLifecycleEnvironments,
  captureLifecycleFailureAndCleanup,
  cleanupRegisteredLifecycleRun,
  createDebugRetentionEvidence,
  createIsolatedDesktopSpawn,
  createLifecycleDesktopConfig,
  createLifecycleRunRegistry,
  createLifecycleRunObservation,
  createOfficialLifecycleEvidence,
  invokeLifecycleStartUnlessAborted,
  loadOfficialLifecycleFixture,
  observeLifecyclePortOwners,
  readLifecycleSessionCache,
  stageLifecycleTarball,
  writeDebugRetentionEvidence,
  writeLifecycleTestEnvironmentFile,
  writeOfficialLifecycleEvidence,
} from './fixtures/official-lifecycle-services.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const execFileAsync = promisify(execFile)
const lifecycleRunGate = process.env[lifecycleFixtureJson.runGateEnvironmentName] === '1'
const liveDescribe = lifecycleRunGate ? describe : describe.skip
const activeRuns = createLifecycleRunRegistry()
const activePages = new Set()
const cleanupErrors = []
let sharedLifecycleContext
let activeLifecycleCaseController = null
const pendingStartOperations = new Set()

beforeEach(() => { activeLifecycleCaseController = new AbortController() })
afterEach(cleanupActiveDesktopRuns, lifecycleFixtureJson.timeouts.cleanupTimeoutMs)
afterAll(cleanupActiveDesktopRuns, lifecycleFixtureJson.timeouts.cleanupTimeoutMs)

async function cleanupActiveDesktopRuns() {
  activeLifecycleCaseController?.abort()
  await Promise.allSettled([...pendingStartOperations])
  for (const page of activePages) {
    try {
      await page.close()
      activePages.delete(page)
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  for (const [runId, entry] of activeRuns.entries()) {
    try {
      await cleanupProbeEntry(runId)
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  if (cleanupErrors.length > 0) {
    const errors = cleanupErrors.splice(0)
    throw new AggregateError(errors, 'Official Desktop lifecycle fixture cleanup failed')
  }
  activeLifecycleCaseController = null
}

function lifecycleContextForActiveCase() {
  if (sharedLifecycleContext === undefined || activeLifecycleCaseController === null) {
    throw new Error('Official Desktop lifecycle case context is unavailable')
  }
  return { ...sharedLifecycleContext, lifecycleSignal: activeLifecycleCaseController.signal }
}

liveDescribe('installed official Desktop A13 and A15 lifecycle regression', () => {
  beforeAll(async () => {
    sharedLifecycleContext = await createLifecycleContext()
  })

  it('keeps two development environments independent through plugin install, saved settings, real Sessions, and cross-stop requests', async () => {
    const context = lifecycleContextForActiveCase()
    const [left, right] = await Promise.all([
      createRunContext(context, 'left'),
      createRunContext(context, 'right'),
    ])
    const initialRuns = await Promise.all([startOwnedRun(left), startOwnedRun(right)])
    const initialStatuses = await Promise.all(initialRuns.map(run => getProbeStatus({
      runId: run.record.runId, repositoryRoot, config: run.config,
    })))
    const initialObservations = initialRuns.map((run, index) => createLifecycleRunObservation({
      fixture: context.fixture,
      label: context.fixture.instanceLabels[index],
      repositoryRoot,
      run,
      status: initialStatuses[index],
    }))
    expect(assertIndependentLifecycleEnvironments(initialObservations)).toBe(true)

    const pages = await Promise.all(initialRuns.map(run => connectRunPage(run)))
    await Promise.all(pages.map(page => waitForMainRenderer(page, context.fixture)))
    const installs = []
    const savedSettings = []
    for (const [index, page] of pages.entries()) {
      const run = initialRuns[index]
      const status = await getProbeStatus({ runId: run.record.runId, repositoryRoot, config: run.config })
      const installation = await installOfficialPluginCandidate({
        page,
        tarballPath: context.artifact.stagedPath,
        probeStatus: status,
        repositoryRoot,
        timeoutMs: context.fixture.timeouts.installTimeoutMs,
        pollIntervalMs: context.fixture.timeouts.pollIntervalMs,
      })
      expect(installation.status).toBe('installed')
      expect(installation.enabled).toBe(true)
      expect(typeof installation.restartRequired).toBe('boolean')
      expect(installation.evidenceComplete).toBe(true)
      installs.push(await verifyInstalledManifest(run, installation, context.packageManifest, context.sourceIdentity))
      const expectedBrowserPath = index === 0 ? context.browserPaths.left : context.browserPaths.right
      savedSettings.push(await saveBrowserExecutableSetting(
        page, run, context.fixture, context.profileAdapter, expectedBrowserPath,
      ))
    }

    const sessions = []
    for (const [index, page] of pages.entries()) {
      await acceptOfficialPluginNotice(page, context.fixture)
      installs[index].loadedClientSource = await capturePluginContext(
        page, initialRuns[index], context.fixture, context.sourceIdentity,
      )
      sessions[index] = await createLifecycleSession(page, initialRuns[index], context.fixture, context.fixture.instanceLabels[index])
    }
    await closeRunPage(pages[0])
    const stoppedLeft = await stopOwnedRun(initialRuns[0])
    const rightAfterLeftStop = await getProbeStatus({
      runId: initialRuns[1].record.runId,
      repositoryRoot,
      config: initialRuns[1].config,
    })
    expect(rightAfterLeftStop.record.state).toBe('running')
    expect(rightAfterLeftStop.processGroupMatchesRun).toBe(true)
    const parallelRequest = await hostSessionListObservation(
      pages[1], initialRuns[1], context.fixture, sessions[1], sessions[0],
    )
    const restartedLeft = await restartRunContext(context, left, context.fixture.scenarioLabels.savedSettingsRestart)
    const restartedLeftRun = await startOwnedRun(restartedLeft)
    const restartedLeftPage = await connectRunPage(restartedLeftRun)
    await waitForMainRenderer(restartedLeftPage, context.fixture)
    await acceptOfficialPluginNotice(restartedLeftPage, context.fixture)
    const leftInstall = {
      ...installs[0],
      artifactComparisons: await compareOfficialCandidateFiles({
        sourceIdentity: context.sourceIdentity,
        installedPackageRoot: dirname(installs[0].installedPackagePath),
      }),
    }
    leftInstall.loadedClientSource = await capturePluginContext(
      restartedLeftPage, restartedLeftRun, context.fixture, context.sourceIdentity,
    )
    const leftSession = await readLifecycleSession(restartedLeftRun, {
      workspaceId: sessions[0].workspaceId,
      sessionId: sessions[0].sessionId,
    }, restartedLeftPage, context.fixture)
    const leftBundle = await readOfficialPluginManagerBundle(restartedLeftPage, context.packageManifest)
    const leftSavedSetting = await verifySavedBrowserExecutableSetting(
      restartedLeftPage, restartedLeftRun, context.fixture, context.profileAdapter, context.browserPaths.left,
    )

    await closeRunPage(pages[1])
    const stoppedRight = await stopOwnedRun(initialRuns[1])
    await expectRunningRequest(restartedLeftPage, context.fixture)
    const restartedRight = await restartRunContext(context, right, context.fixture.scenarioLabels.rightSettingsRestart)
    const restartedRightRun = await startOwnedRun(restartedRight)
    const restartedRightPage = await connectRunPage(restartedRightRun)
    await waitForMainRenderer(restartedRightPage, context.fixture)
    await acceptOfficialPluginNotice(restartedRightPage, context.fixture)
    const rightInstall = {
      ...installs[1],
      artifactComparisons: await compareOfficialCandidateFiles({
        sourceIdentity: context.sourceIdentity,
        installedPackageRoot: dirname(installs[1].installedPackagePath),
      }),
    }
    rightInstall.loadedClientSource = await capturePluginContext(
      restartedRightPage, restartedRightRun, context.fixture, context.sourceIdentity,
    )
    const rightSession = await readLifecycleSession(restartedRightRun, {
      workspaceId: sessions[1].workspaceId,
      sessionId: sessions[1].sessionId,
    }, restartedRightPage, context.fixture)
    const rightBundle = await readOfficialPluginManagerBundle(restartedRightPage, context.packageManifest)
    const rightSavedSetting = await verifySavedBrowserExecutableSetting(
      restartedRightPage, restartedRightRun, context.fixture, context.profileAdapter, context.browserPaths.right,
    )

    const runData = [
      { run: initialRuns[0], status: initialStatuses[0], label: 'left', install: installs[0], setting: savedSettings[0], cleanup: stoppedLeft, session: sessions[0], bundle: null },
      { run: initialRuns[1], status: initialStatuses[1], label: 'right', install: installs[1], setting: savedSettings[1], cleanup: stoppedRight, session: sessions[1], bundle: null },
      { run: restartedLeftRun, status: await getProbeStatus({ runId: restartedLeftRun.record.runId, repositoryRoot, config: restartedLeftRun.config }), label: 'left-restart', install: leftInstall, setting: leftSavedSetting, cleanup: null, session: leftSession, bundle: leftBundle },
      { run: restartedRightRun, status: await getProbeStatus({ runId: restartedRightRun.record.runId, repositoryRoot, config: restartedRightRun.config }), label: 'right-restart', install: rightInstall, setting: rightSavedSetting, cleanup: null, session: rightSession, bundle: rightBundle },
    ]

    await closeRunPage(restartedLeftPage)
    await closeRunPage(restartedRightPage)
    await stopOwnedRun(restartedLeftRun)
    await stopOwnedRun(restartedRightRun)
    const finalRunData = await Promise.all(runData.map(async item => {
      const cleanup = item.cleanup ?? await readCleanup(item.run)
      return { ...item, run: { ...item.run, record: cleanup.record }, cleanup }
    }))
    const finalReport = createOfficialLifecycleEvidence({
      fixture: context.fixture,
      scenario: 'a13-parallel-instances',
      fixtureId: context.fixtureId,
      fixtureRoot: context.supportRoot,
      artifact: context.artifactEvidence,
      environments: finalRunData.map(item => createLifecycleRunObservation({
        fixture: context.fixture,
        label: item.label,
        repositoryRoot,
        run: item.run,
        status: item.status,
        install: toLifecycleInstall(item.install, context.packageManifest),
        savedSetting: item.setting,
        session: item.session,
        pluginManagerRecord: item.bundle?.record ?? null,
        pluginManagerResponse: item.bundle?.response ?? null,
        cleanup: item.cleanup,
      })),
      parallelRequest,
    })
    expect(finalReport.cleanup).toMatchObject({ allRunsStopped: true, allPortsReleased: true })
    await writeOfficialLifecycleEvidence({
      evidence: finalReport,
      directory: join(context.supportRoot, 'evidence'),
      repositoryRoot,
      fixture: context.fixture,
    })
  }, lifecycleFixtureJson.timeouts.a13CaseTimeoutMs)

  it('records a successful real start and stop as an A15 automated regression', async () => {
    const context = lifecycleContextForActiveCase()
    const entry = await createRunContext(context, 'success')
    const run = await startOwnedRun(entry)
    const page = await connectRunPage(run)
    await waitForMainRenderer(page, context.fixture)
    const status = await getProbeStatus({ runId: run.record.runId, repositoryRoot, config: run.config })
    await closeRunPage(page)
    const cleanup = await stopOwnedRun(run)
    const report = createOfficialLifecycleEvidence({
      fixture: context.fixture,
      scenario: 'a15-successful-start-stop',
      fixtureId: context.fixtureId,
      fixtureRoot: context.supportRoot,
      artifact: context.artifactEvidence,
      environments: [createLifecycleRunObservation({
        fixture: context.fixture,
        label: context.fixture.scenarioLabels.successfulStartStop,
        repositoryRoot,
        run: { ...run, record: cleanup.record },
        status,
        cleanup,
      })],
    })
    expect(report.environments[0].processObservedDuringStart?.matchesRun).toBe(true)
    expect(report.cleanup).toMatchObject({ allRunsStopped: true, allPortsReleased: true })
    await writeOfficialLifecycleEvidence({ evidence: report, directory: join(context.supportRoot, 'evidence'), repositoryRoot, fixture: context.fixture })
  }, lifecycleFixtureJson.timeouts.a15CaseTimeoutMs)

  it('records a controlled post-launch renderer failure and its owned-process cleanup', async () => {
    const context = lifecycleContextForActiveCase()
    const entry = await createRunContext(context, context.fixture.scenarioLabels.startFailure)
    const outcome = await captureProbeFailure(entry, {
      rendererStatus: async () => { throw new Error('controlled lifecycle failure at renderer readiness boundary') },
    })
    expect(outcome.error).toBeDefined()
    expect(outcome.error.code).not.toBe('PORT_CONFLICT')
    await writeFailureReport(context, entry, outcome, 'a15-start-failure', 'failed')
  }, lifecycleFixtureJson.timeouts.a15CaseTimeoutMs)

  it('records cancellation after the app launches and confirms process cleanup', async () => {
    const context = lifecycleContextForActiveCase()
    const entry = await createRunContext(context, context.fixture.scenarioLabels.startupCancellation)
    const controller = new AbortController()
    let cancelled = false
    const outcome = await captureProbeFailure(entry, {
      signal: controller.signal,
      rendererStatus: async (port, readiness, host) => {
        if (!cancelled) {
          cancelled = true
          controller.abort()
        }
        return { ready: false, title: readiness.rendererTargetTitle, url: `${readiness.applicationUrlPrefix}app/`, readyState: 'loading', bodyTextLength: 0, host, port }
      },
    })
    expect(outcome.error).toBeDefined()
    expect(cancelled).toBe(true)
    await writeFailureReport(context, entry, outcome, 'a15-cancel-after-launch', 'cancelled')
  }, lifecycleFixtureJson.timeouts.a15CaseTimeoutMs)

  it('records the real app process timing out at the controlled Renderer readiness boundary', async () => {
    const context = lifecycleContextForActiveCase()
    const entry = await createRunContext(context, context.fixture.scenarioLabels.startupTimeout)
    const timeoutConfig = withStartupTimeout(entry.config, context.fixture.timeouts.timeoutStartupTimeoutMs, context.fixture.timeouts.timeoutPortReadyMs)
    entry.config = timeoutConfig
    const outcome = await captureProbeFailure(entry, {
      rendererStatus: async (port, readiness, host) => ({
        ready: false,
        title: readiness.rendererTargetTitle,
        url: `${readiness.applicationUrlPrefix}app/`,
        readyState: 'loading',
        bodyTextLength: 0,
        host,
        port,
      }),
    })
    expect(outcome.error?.code).toBe('STARTUP_TIMEOUT')
    await writeFailureReport(context, entry, outcome, 'a15-startup-timeout', 'failed')
  }, lifecycleFixtureJson.timeouts.a15CaseTimeoutMs)

  it('records a real OS port conflict before spawning the app', async () => {
    const context = lifecycleContextForActiveCase()
    const entry = await createRunContext(context, context.fixture.scenarioLabels.portConflict)
    let conflictServer = null
    let conflictingPort = null
    const outcome = await captureProbeFailure(entry, {
      afterFailure: async () => closeServer(conflictServer),
      portOwners: async ports => {
        if (conflictServer === null) {
          conflictingPort = ports[0]
          conflictServer = await listenLoopback(conflictingPort, context.desktopConfig.ports.host)
        }
        return observeLifecyclePortOwners(ports)
      },
    })
    expect(outcome.error?.code).toBe('PORT_CONFLICT')
    expect(outcome.status.ports.find(owner => owner.port === conflictingPort)?.pids).toContain(process.pid)
    await writeFailureReport(context, entry, outcome, 'a15-port-conflict', 'failed')
  }, lifecycleFixtureJson.timeouts.a15CaseTimeoutMs)

  it('records explicit debug retention before stopping the actual app through stopProbe', async () => {
    const context = lifecycleContextForActiveCase()
    const entry = await createRunContext(context, context.fixture.scenarioLabels.debugRetention)
    const run = await startOwnedRun(entry)
    const status = await getProbeStatus({ runId: run.record.runId, repositoryRoot, config: run.config })
    expect(status.processGroupMatchesRun).toBe(true)
    const debugEvidence = createDebugRetentionEvidence({ run, repositoryRoot, desktopConfig: run.config, fixture: context.fixture })
    const debugEvidencePath = await writeDebugRetentionEvidence({ evidence: debugEvidence, repositoryRoot, fixture: context.fixture })
    expect(debugEvidencePath).toBe(join(run.record.directories.evidence, context.fixture.paths.debugRetentionFilename))
    const cleanup = await stopOwnedRun(run)
    const report = createOfficialLifecycleEvidence({
      fixture: context.fixture,
      scenario: 'a15-debug-retention',
      fixtureId: context.fixtureId,
      fixtureRoot: context.supportRoot,
      artifact: context.artifactEvidence,
      environments: [createLifecycleRunObservation({
        fixture: context.fixture,
        label: context.fixture.scenarioLabels.debugRetention,
        repositoryRoot,
        run: { ...run, record: cleanup.record },
        status,
        cleanup,
      })],
    })
    expect(report.cleanup).toMatchObject({ allRunsStopped: true, allPortsReleased: true })
    await writeOfficialLifecycleEvidence({ evidence: report, directory: join(context.supportRoot, 'evidence'), repositoryRoot, fixture: context.fixture })
  }, lifecycleFixtureJson.timeouts.a15CaseTimeoutMs)
})

async function createLifecycleContext() {
  const fixture = await loadOfficialLifecycleFixture()
  const desktopConfig = await loadDesktopE2EConfig()
  const fixtureId = randomUUID()
  const supportRoot = resolve(repositoryRoot, desktopConfig.paths.runRootRelativePath, fixture.paths.supportDirectoryName, fixtureId)
  await mkdir(supportRoot, { recursive: true, mode: 0o700 })
  const artifactRoot = join(supportRoot, fixture.paths.artifactsDirectoryName)
  const environmentFilePath = join(supportRoot, fixture.paths.testEnvironmentFilename)
  await writeLifecycleTestEnvironmentFile(environmentFilePath, fixture)
  const sourcePath = process.env[fixture.artifact.sourcePathEnvironmentName]
  if (typeof sourcePath !== 'string' || sourcePath.trim() === '') {
    throw new Error(`Set ${fixture.artifact.sourcePathEnvironmentName} to the fixed, prebuilt lifecycle candidate tarball path.`)
  }
  const sourceIdentityPath = process.env[fixture.artifact.sourceIdentityPathEnvironmentName]
  if (typeof sourceIdentityPath !== 'string' || sourceIdentityPath.trim() === '') {
    throw new Error(`Set ${fixture.artifact.sourceIdentityPathEnvironmentName} to the source identity for the fixed candidate tarball.`)
  }
  const packageManifest = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
  if (packageManifest.name !== pluginPackageConfig.packageName) throw new Error('Lifecycle source package name does not match config/plugin-package.json')
  const sourceIdentity = parseOfficialCandidateSourceIdentity(JSON.parse(await readFile(sourceIdentityPath, 'utf8')), {
    archivePath: resolve(sourcePath),
    packageName: packageManifest.name,
    packageVersion: packageManifest.version,
  })
  const artifact = await stageLifecycleTarball({
    sourcePath,
    artifactRoot,
    repositoryRoot,
    packageName: pluginPackageConfig.packageName,
    packageVersion: packageManifest.version,
    fixture,
  })
  const candidateManifest = await readTarballPackageManifest(artifact.stagedPath)
  if (candidateManifest.name !== packageManifest.name || candidateManifest.version !== packageManifest.version) {
    throw new Error(`Lifecycle candidate is ${candidateManifest.name}@${candidateManifest.version}; source requires ${packageManifest.name}@${packageManifest.version}`)
  }
  const canonicalBrowserPath = productionProfile.comfyui?.frontendCompiler?.browserExecutablePath
  if (typeof canonicalBrowserPath !== 'string' || !isAbsolute(canonicalBrowserPath)) {
    throw new Error('config/profiles/production.json must provide an absolute Workflow browser executable path for A13.')
  }
  const browserExecutable = await stat(canonicalBrowserPath)
  if (!browserExecutable.isFile()) throw new Error('The configured Workflow browser path must identify a regular executable file.')
  await access(canonicalBrowserPath, constants.X_OK)
  const browserDirectory = dirname(canonicalBrowserPath)
  const browserName = basename(canonicalBrowserPath)
  const browserPaths = {
    left: `${browserDirectory}/./${browserName}`,
    right: `${browserDirectory}/././${browserName}`,
  }
  if (browserPaths.left === browserPaths.right) throw new Error('A13 Workflow browser path variants must differ as saved values.')
  for (const browserPath of Object.values(browserPaths)) {
    const candidate = await stat(browserPath)
    if (!candidate.isFile()) throw new Error(`The Workflow browser path does not identify a regular executable file: ${browserPath}`)
    await access(browserPath, constants.X_OK)
  }
  const provider = structuredClone(providerFixture)
  const profileAdapter = await loadOfficialProfilePatchAdapter(desktopConfig)
  return {
    fixture,
    fixtureId,
    supportRoot,
    desktopConfig,
    environmentFilePath,
    artifact,
    artifactEvidence: {
      packageName: candidateManifest.name,
      packageVersion: candidateManifest.version,
      sourcePath: artifact.sourcePath,
      stagedPath: artifact.stagedPath,
      sourceIdentity,
    },
    packageManifest: candidateManifest,
    sourceIdentity,
    providers: provider,
    profileAdapter,
    browserPaths,
  }
}

async function createRunContext(context, label, previous = null) {
  const runId = randomUUID()
  const environmentRootRelativePath = previous?.config.modes.development.environmentRootRelativePath
  const environmentRoot = environmentRootRelativePath === undefined
    ? resolve(repositoryRoot, context.desktopConfig.paths.runRootRelativePath,
      context.fixture.paths.environmentDirectoryName, context.fixtureId, runId)
    : resolve(repositoryRoot, environmentRootRelativePath)
  const workspacePath = previous?.workspacePath
    ?? join(environmentRoot, context.desktopConfig.modes.development.directoryNames.workspace)
  const config = createLifecycleDesktopConfig(context.desktopConfig, {
    fixture: context.fixture,
    fixtureId: context.fixtureId,
    runId,
    workspacePath,
    environmentFilePath: context.environmentFilePath,
    providers: context.providers,
  })
  if (environmentRootRelativePath !== undefined) {
    const reusedConfig = structuredClone(config)
    reusedConfig.modes.development.environmentRootRelativePath = environmentRootRelativePath
  return { label, runId, config: parseDesktopE2EConfig(reusedConfig), workspacePath, lifecycleSignal: context.lifecycleSignal }
  }
  return { label, runId, config, workspacePath, lifecycleSignal: context.lifecycleSignal }
}

async function restartRunContext(context, previous, label) {
  return createRunContext(context, label, previous)
}

async function startOwnedRun(entry, overrides = {}) {
  const { signal: overrideSignal, ...startOverrides } = overrides
  const signals = [entry.lifecycleSignal, overrideSignal].filter(signal => signal !== undefined)
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0]
  const profilePatchAdapter = await loadOfficialProfilePatchAdapter(entry.config)
  const startPromise = invokeLifecycleStartUnlessAborted({
    signal,
    start: guardedSignal => trackedStartProbe({
      repositoryRoot,
      runId: entry.runId,
      mode: 'development',
      config: entry.config,
      profilePatchAdapter,
      spawnProcess: createIsolatedDesktopSpawn(spawn, entry.config, lifecycleFixtureJson),
      ...startOverrides,
      signal: guardedSignal,
    }, { startProbe }),
  })
  pendingStartOperations.add(startPromise)
  try {
    const run = await startPromise
    entry.run = run
    if (entry.runId !== run.record.runId) throw new Error(`Desktop probe started unexpected run ${run.record.runId}`)
    activeRuns.register(entry)
    return run
  } catch (error) {
    if (error?.run !== undefined) {
      if (entry.runId !== error.run.record.runId) {
        throw new Error(`Desktop probe failed with unexpected run ${error.run.record.runId}`, { cause: error })
      }
      entry.run = { ...error.run, config: entry.config }
      if (activeRuns.get(entry.runId) === undefined) activeRuns.register(entry)
    }
    throw error
  } finally {
    pendingStartOperations.delete(startPromise)
  }
}

async function connectRunPage(run) {
  const page = await connectDesktopPage(run.record.ports.rendererCdp, {
    runId: run.record.runId,
    repositoryRoot,
    config: run.config,
  })
  activePages.add(page)
  return page
}

async function waitForMainRenderer(page, fixture) {
    const state = await waitForValue(page, `(() => {
      const body = document.body?.innerText ?? ''
      return {
        readyState: document.readyState,
        newSessionButton: document.querySelector('button[aria-label=${JSON.stringify(fixture.operations.newSessionButtonAriaLabel)}]') !== null,
        pluginBrand: body.includes(${JSON.stringify(fixture.operations.pluginBrandText)}),
        unexpectedOnboarding: [...document.querySelectorAll('button')]
          .some(button => button.textContent?.trim() === ${JSON.stringify(fixture.operations.unexpectedOnboardingButtonText)}),
        bodyLength: body.length,
      }
    })()`, value => value?.newSessionButton === true || value?.unexpectedOnboarding === true,
    fixture.timeouts.operationTimeoutMs, 'main Renderer readiness')
    if (state.unexpectedOnboarding) {
      throw new Error('The controlled test provider key did not reach the main workspace; the observed setup screen needs a source-backed flow before this run can continue.')
    }
    if (state.readyState !== 'complete') throw new Error(`The official Desktop Renderer did not complete: ${JSON.stringify(state)}`)
    return state
}

async function saveBrowserExecutableSetting(page, run, fixture, profileAdapter, browserExecutablePath) {
  await openWorkflowBrowserSettings(page, run, fixture)
  const inputSelector = `#${browserSettings.ui.panelId} input[name="${browserSettings.ui.inputName}"]`
  const stateExpression = browserSettingsInputState(inputSelector)
  await waitForValue(page, stateExpression,
    value => value !== null && !value.disabled && value.visible,
    fixture.timeouts.operationTimeoutMs, 'Workflow browser executable field readiness')

  await page.evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(inputSelector)})
    if (!(input instanceof HTMLInputElement)) return false
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(browserExecutablePath)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await waitForValue(page, stateExpression, value => value?.path === browserExecutablePath,
    fixture.timeouts.operationTimeoutMs, 'Workflow browser executable draft')

  const saved = await page.evaluate(`(() => {
    const panel = document.getElementById(${JSON.stringify(browserSettings.ui.panelId)})
    const buttons = [...(panel?.querySelectorAll('button') ?? [])]
      .filter(button => button.textContent?.trim() === ${JSON.stringify(browserSettings.ui.saveButton)})
    if (buttons.length !== 1 || buttons[0].disabled) return { ok: false, count: buttons.length, disabled: buttons[0]?.disabled ?? null }
    buttons[0].click()
    return { ok: true }
  })()`)
  if (!saved?.ok) throw new Error(`Could not save Workflow browser settings: ${JSON.stringify(saved)}`)
  const savedState = await waitForValue(page, stateExpression,
    value => value?.path === browserExecutablePath
      && value.status.includes(browserSettings.ui.savedMessage),
    fixture.timeouts.operationTimeoutMs, 'Workflow browser settings save confirmation')
  expect(savedState.path).toBe(browserExecutablePath)
  const profileSetting = await readSavedBrowserExecutableSetting(run, profileAdapter)
  expect(profileSetting).toEqual({ entryId: settingsEntryIds.core, browserExecutablePath })
  return profileSetting
}

async function verifySavedBrowserExecutableSetting(page, run, fixture, profileAdapter, expectedPath) {
  await openWorkflowBrowserSettings(page, run, fixture)
  const inputSelector = `#${browserSettings.ui.panelId} input[name="${browserSettings.ui.inputName}"]`
  const state = await waitForValue(page, browserSettingsInputState(inputSelector),
    value => value !== null && !value.disabled && value.visible,
    fixture.timeouts.operationTimeoutMs, 'restarted Workflow browser settings readiness')
  expect(state.path).toBe(expectedPath)
  const profileSetting = await readSavedBrowserExecutableSetting(run, profileAdapter)
  expect(profileSetting).toEqual({ entryId: settingsEntryIds.core, browserExecutablePath: expectedPath })
  return profileSetting
}

function browserSettingsInputState(inputSelector) {
  return `(() => {
    const panel = document.getElementById(${JSON.stringify(browserSettings.ui.panelId)})
    const input = document.querySelector(${JSON.stringify(inputSelector)})
    if (!(input instanceof HTMLInputElement)) return null
    const rect = input.getBoundingClientRect()
    const style = getComputedStyle(input)
    return {
      path: input.value,
      disabled: input.disabled,
      visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
      status: [...(panel?.querySelectorAll('[role="status"]') ?? [])].map(node => node.textContent?.trim() ?? ''),
      alerts: [...(panel?.querySelectorAll('[role="alert"]') ?? [])].map(node => node.textContent?.trim() ?? ''),
      buttons: [...(panel?.querySelectorAll('button') ?? [])].map(button => ({
        text: (button.innerText ?? button.textContent ?? '').trim(),
        disabled: button.disabled,
      })),
    }
  })()`
}

async function openWorkflowBrowserSettings(page, run, fixture) {
  const pluginNavigation = await page.evaluate(`(() => {
    const matches=[...document.querySelectorAll('button[aria-label=${JSON.stringify(pluginInstallUi.ui.pluginNavigationAriaLabel)}]')]
    if(matches.length!==1||matches[0].disabled)return {ok:false,count:matches.length,disabled:matches[0]?.disabled??null}
    matches[0].click();return {ok:true}
  })()`)
  if (!pluginNavigation?.ok) throw new Error(`Could not open Plugins: ${JSON.stringify(pluginNavigation)}`)
  await waitForValue(page, `(() => {
    const addPlugin=[...document.querySelectorAll('button')].some(button=>button.textContent?.trim()===${JSON.stringify(pluginInstallUi.ui.addPluginButtonText)})
    const bundleVisible=document.body?.innerText?.includes(${JSON.stringify(pluginPackageConfig.packageName)})===true
    return addPlugin&&bundleVisible
  })()`, value => value === true, fixture.timeouts.operationTimeoutMs, 'installed plugin list readiness')

  const viewBundleLabel = fixture.operations.viewBundleButtonAriaLabelTemplate.replace('{name}', pluginPackageConfig.packageName)
  const bundleDetailsCount = await waitForValue(page,
    `document.querySelectorAll('button[aria-label=${JSON.stringify(viewBundleLabel)}]').length`,
    value => value === 1, fixture.timeouts.operationTimeoutMs, 'installed bundle detail button visibility')
  if (bundleDetailsCount !== 1) throw new Error(`Expected one installed bundle detail button, found ${bundleDetailsCount}.`)
  const bundleDetails = await page.evaluate(`(() => {
    const matches=[...document.querySelectorAll('button[aria-label=${JSON.stringify(viewBundleLabel)}]')]
    if(matches.length!==1||matches[0].disabled)return {ok:false,count:matches.length,disabled:matches[0]?.disabled??null}
    matches[0].click();return {ok:true}
  })()`)
  if (!bundleDetails?.ok) throw new Error(`Could not open the installed bundle details: ${JSON.stringify(bundleDetails)}`)
  await waitForValue(page, `document.querySelectorAll('button[aria-label=${JSON.stringify(viewBundleLabel)}]').length===0`,
    value => value === true, fixture.timeouts.operationTimeoutMs, 'installed bundle detail page transition')

  const connectionIdentity = getDesktopPageConnectionIdentity(page)
  if (connectionIdentity === null || connectionIdentity.runId !== run.record.runId) {
    throw new Error('Cannot save plugin detail controls because the Renderer page has no matching immutable run identity.')
  }
  const controls = await page.evaluate(`(() => {
    const visible=node=>{const rect=node.getBoundingClientRect(),style=getComputedStyle(node);return rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden'}
    const browserTab=document.getElementById(${JSON.stringify(browserSettings.ui.tabId)})
    const tabPanels=[...document.querySelectorAll('[role="tabpanel"]')].filter(visible).map(panel=>{
      const labelledBy=panel.getAttribute('aria-labelledby')
      const title=labelledBy?document.getElementById(labelledBy)?.textContent?.trim()??null:panel.querySelector('h1,h2,h3')?.textContent?.trim()??null
      return {id:panel.id||null,labelledBy:labelledBy||null,title}
    })
    return {
      buttons:[...document.querySelectorAll('button')].filter(visible).map(button=>({id:button.id||null,ariaLabel:button.getAttribute('aria-label'),text:(button.innerText??button.textContent??'').trim().slice(0,240),title:button.getAttribute('title'),role:button.getAttribute('role'),disabled:button.disabled===true})),
      tabPanels,
      browserTabIdExists:browserTab!==null,
      browserTabSelected:browserTab?.getAttribute('aria-selected')==='true',
      browserPanelIdExists:document.getElementById(${JSON.stringify(browserSettings.ui.panelId)})!==null,
    }
  })()`)
  const status = await getProbeStatus({ runId: run.record.runId, repositoryRoot, config: run.config })
  if (status.record.runId !== run.record.runId || status.record.state !== 'running'
    || status.record.directories.evidence !== run.record.directories.evidence) {
    throw new Error('Cannot save plugin detail controls because the verified Desktop run changed.')
  }
  const evidence = {
    runId: run.record.runId,
    stage: 'official-plugin-bundle-details',
    target: { id: connectionIdentity.targetId, type: connectionIdentity.type, title: connectionIdentity.title, url: connectionIdentity.url },
    openedBundleButton: { ariaLabel: viewBundleLabel, clicked: bundleDetails.ok },
    buttons: controls.buttons,
    tabPanels: controls.tabPanels,
    browserTabIdExists: controls.browserTabIdExists,
    browserTabSelected: controls.browserTabSelected,
    browserPanelIdExists: controls.browserPanelIdExists,
  }
  const controlsPath = join(status.record.directories.evidence, 'official-browser-config-controls.json')
  await writeFile(controlsPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  if (!controls.browserTabIdExists && !controls.browserPanelIdExists) {
    throw new Error(`The verified plugin detail page did not expose the canonical Browser settings control; inspect ${controlsPath}`)
  }
  if (controls.browserTabIdExists) {
    const tabClicked = await page.evaluate(`(() => {
      const tab=document.getElementById(${JSON.stringify(browserSettings.ui.tabId)})
      if(!tab)return false
      if(tab.getAttribute('aria-selected')!=='true')tab.click()
      return true
    })()`)
    if (tabClicked !== true) throw new Error('The canonical Workflow browser tab disappeared from plugin details.')
    await waitForValue(page, `document.getElementById(${JSON.stringify(browserSettings.ui.tabId)})?.getAttribute('aria-selected')==='true'`,
      value => value === true, fixture.timeouts.operationTimeoutMs, 'Workflow browser settings tab selection')
  }
}

async function readSavedBrowserExecutableSetting(run, profileAdapter) {
  const patchPath = join(run.record.directories.dshHome, run.config.paths.profileRelativePath, run.config.paths.profilePatchFilename)
  const document = await profileAdapter.parse(await readFile(patchPath, 'utf8'))
  const entry = findProfileEntry(document, settingsEntryIds.core)
  const browserExecutablePath = entry?.config?.[browserSettings.fieldName]
  if (typeof browserExecutablePath !== 'string' || !isAbsolute(browserExecutablePath)) {
    throw new Error('The official Profile patch does not contain an absolute Workflow browser executable path.')
  }
  return {
    entryId: settingsEntryIds.core,
    browserExecutablePath,
  }
}

async function capturePluginContext(page, run, fixture, sourceIdentity) {
  await waitForValue(page, `document.body.innerText.replace(/\\s+/gu, '').includes(${JSON.stringify(fixture.operations.pluginBrandText)})`, value => value === true,
    fixture.timeouts.operationTimeoutMs, 'official plugin context load')
  await page.command('Page.enable')
  await page.command('Debugger.enable')
  const parsedScriptPromise = page.waitForDebuggerScript(
    params => isOfficialCandidateClientScriptUrl(params.url, sourceIdentity),
    fixture.timeouts.operationTimeoutMs,
  )
  await page.command('Page.addScriptToEvaluateOnNewDocument', { source: `
    let loader
    Object.defineProperty(window, '__ModuleLoader__', {
      configurable: true,
      get: () => loader,
      set: value => {
        loader = value
        const wrap = load => definition => {
          if (definition.id !== ${JSON.stringify(pluginPackageConfig.packageName)}) return load.call(loader, definition)
          const factory = definition.factory
          return load.call(loader, { ...definition, factory: require => {
            const plugin = factory(require)
            return { ...plugin, apply: ctx => {
              window.__runPanelTestContext = ctx
              return plugin.apply(ctx)
            } }
          } })
        }
        let load = wrap(loader.load)
        Object.defineProperty(loader, 'load', { configurable: true, get: () => load, set: value => { load = wrap(value) } })
      },
    })
  ` })
  await page.command('Page.reload')
  await waitForValue(page, 'window.__runPanelTestContext !== undefined', value => value === true,
    fixture.timeouts.operationTimeoutMs)
  const parsedScript = await parsedScriptPromise
  const sourceResult = await page.command('Debugger.getScriptSource', { scriptId: parsedScript.scriptId })
  const sourceMapText = await readOfficialCandidateClientSourceMap({
    page,
    sourceIdentity,
    scriptUrl: parsedScript.url,
    sourceMapUrl: parsedScript.sourceMapURL,
  })
  return assertOfficialCandidateClientSource({
    sourceIdentity,
    scriptId: parsedScript.scriptId,
    scriptUrl: parsedScript.url,
    sourceMapUrl: parsedScript.sourceMapURL,
    scriptSource: sourceResult.scriptSource,
    sourceMapText,
    evidenceDirectory: run.record.directories.evidence,
  })
}

async function acceptOfficialPluginNotice(page, fixture) {
  await page.evaluate(`(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')]
      .filter(dialog => dialog.textContent?.includes(${JSON.stringify(fixture.operations.pluginNoticeText)}))
    if (dialogs.length === 0) return false
    if (dialogs.length !== 1) throw new Error('More than one official plugin notice is open')
    const buttons = [...dialogs[0].querySelectorAll('button')]
      .filter(button => button.textContent?.trim() === ${JSON.stringify(fixture.operations.pluginNoticeContinueButtonText)})
    if (buttons.length !== 1) throw new Error('The official plugin notice continue action is ambiguous')
    buttons[0].click()
    return true
  })()`)
  await waitForValue(page, `([...document.querySelectorAll('[role="dialog"]')]
    .every(dialog => !dialog.textContent?.includes(${JSON.stringify(fixture.operations.pluginNoticeText)})))`, value => value === true,
  fixture.timeouts.operationTimeoutMs)
}

async function createLifecycleSession(page, run, fixture, label) {
  const title = fixture.operations.sessionTitleTemplate
    .replaceAll('{fixtureId}', run.record.runId)
    .replaceAll('{instance}', label)
  const result = await page.evaluate(`(async () => {
    const workspaceRemote = window.__runPanelTestContext.get('remote.workspace')
    const sessionRemote = window.__runPanelTestContext.get('remote.session')
    const workspace = await workspaceRemote.create({ path: ${JSON.stringify(run.record.directories.workspace)} })
    if (!workspace.ok) return { ok: false, phase: 'workspace', response: workspace }
    const workspaceId = workspace.value.workspace.workspaceId
    const session = await sessionRemote.create({ workspaceId, agentPreset: ${JSON.stringify(fixture.operations.sessionPresetId)} })
    if (!session.ok) return { ok: false, phase: 'session', response: session }
    const renamed = await sessionRemote.rename({ sessionId: session.value.sessionId, title: ${JSON.stringify(title)} })
    if (!renamed.ok) return { ok: false, phase: 'rename', response: renamed }
    return { ok: true, workspaceId, sessionId: session.value.sessionId, title: ${JSON.stringify(title)} }
  })()`)
  if (!result?.ok) throw new Error(`Could not create a real Workspace and Session: ${JSON.stringify(result)}`)
  return readLifecycleSession(run, { workspaceId: result.workspaceId, sessionId: result.sessionId, title: result.title }, page, fixture)
}

async function readLifecycleSession(run, expected, page, fixture) {
  const response = await page.evaluate(`(async () => {
    const remote = window.__runPanelTestContext.get('remote.session')
    if (!remote || typeof remote.list !== 'function') throw new Error('Host Remote session.list is unavailable')
    return await remote.list({})
  })()`)
  if (response?.ok !== true || !Array.isArray(response.value?.items)) {
    throw new Error(`Host Remote session.list did not return a successful response: ${JSON.stringify(response)}`)
  }
  const matches = response.value.items.filter(item => item.sessionId === expected.sessionId)
  if (matches.length !== 1) throw new Error(`Host Remote session.list must contain exactly one Session ${expected.sessionId}`)
  const item = matches[0]
  const title = item.projections?.values?.title
  if (item.cwd !== run.record.directories.workspace || title !== null && (typeof title !== 'string' || title.trim() === '')
    || expected.title !== undefined && title !== expected.title) {
    throw new Error(`Host Remote session.list did not return the expected Session owner and title for ${expected.sessionId}`)
  }

  const workspacePath = join(run.record.directories.dshHome, 'storages', 'workspace.json')
  const workspaceStorage = JSON.parse(await readFile(workspacePath, 'utf8'))
  const workspace = workspaceStorage.tables?.workspaces?.[expected.workspaceId]
  if (workspace === undefined) throw new Error(`Official Workspace storage does not contain ${expected.workspaceId}`)
  const sessionStoragePath = join(
    run.record.directories.dshHome,
    'storages',
    'session_projcache',
    'sessions',
    `${expected.sessionId}.json`,
  )
  const sessionStorage = await readLifecycleSessionCache({
    path: sessionStoragePath,
    timeoutMs: fixture.timeouts.operationTimeoutMs,
    pollIntervalMs: fixture.timeouts.pollIntervalMs,
  })
  const cwd = sessionStorage.record?.identity?.cwd
  if (workspace.path !== run.record.directories.workspace
    || !Array.isArray(workspace.sessionIds) || !workspace.sessionIds.includes(expected.sessionId)
    || cwd !== run.record.directories.workspace) {
    throw new Error(`Official Workspace or Session storage does not confirm run ownership for ${expected.sessionId}`)
  }
  return {
    workspaceId: expected.workspaceId,
    sessionId: expected.sessionId,
    title,
    remoteResponse: response,
    workspaceReadback: {
      workspaceId: expected.workspaceId,
      path: workspace.path,
      sessionIds: workspace.sessionIds,
    },
    identityReadback: { sessionId: expected.sessionId, cwd },
    visibleSessionIds: response.value.items.map(session => session.sessionId),
  }
}

async function readOfficialPluginManagerBundle(page, packageManifest) {
  const response = await page.evaluate(`(async () => {
    const manager = window.__runPanelTestContext.get('remote.pluginManager')
    if (!manager || typeof manager.listBundles !== 'function') throw new Error('Official pluginManager.listBundles is unavailable')
    return await manager.listBundles()
  })()`)
  const record = parseOfficialPluginManagerListBundlesResponse(
    response,
    packageManifest.name,
    packageManifest.version,
  )
  expect(record).toEqual({ name: packageManifest.name, version: packageManifest.version, installed: true, enabled: true })
  return { response, record }
}

async function verifyInstalledManifest(run, installation, packageManifest, sourceIdentity) {
  const packagePath = join(
    run.record.directories.dshHome,
    run.config.paths.profileRelativePath,
    'node_modules',
    packageManifest.name,
    'package.json',
  )
  const installed = JSON.parse(await readFile(packagePath, 'utf8'))
  expect(installed).toMatchObject({ name: packageManifest.name, version: packageManifest.version })
  const artifactComparisons = await compareOfficialCandidateFiles({
    sourceIdentity,
    installedPackageRoot: dirname(packagePath),
  })
  return { ...installation, installedPackagePath: packagePath, packageVersion: installed.version, artifactComparisons }
}

function toLifecycleInstall(installation, packageManifest) {
  if (installation === null) return null
  return {
    expectedPackageName: packageManifest.name,
    packageVersion: installation.packageVersion ?? packageManifest.version,
    installedPackagePath: installation.installedPackagePath,
    status: installation.status,
    restartRequired: installation.restartRequired,
    enabled: installation.enabled,
    evidenceComplete: installation.evidenceComplete,
    artifactComparisons: installation.artifactComparisons,
    loadedClientSource: installation.loadedClientSource,
  }
}

async function expectRunningRequest(page, fixture) {
  const response = await page.evaluate(`(() => ({
    readyState: document.readyState,
    mainWindow: document.querySelector('button[aria-label=${JSON.stringify(fixture.operations.newSessionButtonAriaLabel)}]') !== null,
    bodyLength: document.body?.innerText?.length ?? 0,
  }))()`)
  expect(response).toMatchObject({ readyState: 'complete', mainWindow: true })
  return response
}

async function hostSessionListObservation(page, run, fixture, expectedSession, stoppedSession) {
  const response = await page.evaluate(`(async () => {
    const context = window.__runPanelTestContext
    const remote = context?.get('remote.session')
    if (!remote || typeof remote.list !== 'function') throw new Error('Host Remote session.list is unavailable')
    return await remote.list({})
  })()`)
  if (response?.ok !== true || !Array.isArray(response.value?.items)) {
    throw new Error(`Host Remote session.list did not return a successful response: ${JSON.stringify(response)}`)
  }
  const sessions = response.value.items.filter(item => item.sessionId === expectedSession.sessionId)
  const visibleSessionIds = response.value.items.map(item => item.sessionId)
  if (sessions.length !== 1 || sessions[0].cwd !== expectedSession.identityReadback.cwd
    || sessions[0].projections?.values?.title !== expectedSession.title
    || visibleSessionIds.includes(stoppedSession.sessionId)) {
    throw new Error('Host Remote session.list did not read the existing right Session while excluding the stopped left Session')
  }
  return {
    runId: run.record.runId,
    operation: fixture.operations.hostReadOnlyRequestOperation,
    result: JSON.stringify(response),
    sessionId: expectedSession.sessionId,
    workspaceId: expectedSession.workspaceId,
    workspacePath: expectedSession.workspaceReadback.path,
    cwd: expectedSession.identityReadback.cwd,
    visibleSessionIds,
    ok: true,
  }
}

async function stopOwnedRun(run) {
  if (activeRuns.get(run.record.runId) === undefined) {
    throw new Error(`Lifecycle run ${run.record.runId} is not registered for verified cleanup`)
  }
  return cleanupProbeEntry(run.record.runId)
}

async function cleanupProbeEntry(runId) {
  return cleanupRegisteredLifecycleRun({
    registry: activeRuns,
    runId,
    getStatus: entry => getProbeStatus({ runId, repositoryRoot, config: entry.config }),
    stopRun: entry => stopProbe({ runId, repositoryRoot, config: entry.config }),
  })
}

async function closeRunPage(page) {
  await page.close()
  activePages.delete(page)
}

async function readCleanup(run) {
  const status = await getProbeStatus({ runId: run.record.runId, repositoryRoot, config: run.config })
  return { record: status.record, status }
}

async function captureProbeFailure(entry, overrides) {
  let processGroupObserved = null
  const { afterFailure, rendererStatus, ...startOverrides } = overrides
  const inspect = startOverrides.inspect ?? (async pid => {
    const group = await inspectProcessGroup(pid)
    if (group !== null) processGroupObserved = group
    return group
  })
  const options = { ...startOverrides, inspect }
  let error
  try {
    await startOwnedRun(entry, {
      ...options,
      rendererStatus: rendererStatus === undefined ? undefined : async (...args) => {
        const result = await rendererStatus(...args)
        return result
      },
    })
    throw new Error('Expected this controlled lifecycle start to fail')
  } catch (caught) {
    if (caught.message === 'Expected this controlled lifecycle start to fail') throw caught
    error = caught
  }
  const failedRun = error.run === undefined ? null : { ...error.run, config: entry.config }
  if (failedRun !== null) {
    entry.run = failedRun
    if (entry.runId !== failedRun.record.runId) throw new Error(`Desktop probe failed with unexpected run ${failedRun.record.runId}`)
    if (activeRuns.get(entry.runId) === undefined) activeRuns.register(entry)
  }
  let cleanup = null
  let status = null
  if (failedRun !== null) {
    const snapshots = await captureLifecycleFailureAndCleanup({
      readStatus: () => getProbeStatus({ runId: entry.runId, repositoryRoot, config: entry.config }),
      afterFailure,
      cleanup: () => cleanupProbeEntry(entry.runId),
    })
    const current = snapshots.failureStatus
    status = processGroupObserved === null ? current : {
      ...current,
      processGroup: processGroupObserved,
      processGroupMatchesRun: true,
    }
    cleanup = snapshots.cleanup
  } else {
    await afterFailure?.(null)
  }
  return { error, run: failedRun, status, cleanup }
}

async function writeFailureReport(context, entry, outcome, scenario, state) {
  if (outcome.run === null) throw new Error(`A15 ${scenario} did not retain the failed probe run record`, { cause: outcome.error })
  const observation = createLifecycleRunObservation({
    fixture: context.fixture,
    label: entry.label,
    repositoryRoot,
    run: outcome.run,
    status: outcome.status,
    cleanup: outcome.cleanup,
    stateOverride: state,
    failure: `${outcome.error.code ?? outcome.error.name}: ${outcome.error.message}`,
  })
  const report = createOfficialLifecycleEvidence({
    fixture: context.fixture,
    scenario,
    fixtureId: context.fixtureId,
    fixtureRoot: context.supportRoot,
    artifact: context.artifactEvidence,
    environments: [observation],
  })
  expect(report.cleanup).toMatchObject({ allRunsStopped: true, allPortsReleased: true })
  await writeOfficialLifecycleEvidence({ evidence: report, directory: join(context.supportRoot, 'evidence'), repositoryRoot, fixture: context.fixture })
}

async function waitForValue(page, expression, accept, timeoutMs, phase = 'lifecycle condition') {
  const deadline = Date.now() + timeoutMs
  let lastValue
  do {
    try {
      lastValue = await page.evaluate(expression)
    } catch (error) {
      throw new Error(`Official Desktop lifecycle ${phase} observation failed: ${error.message}`, { cause: error })
    }
    if (accept(lastValue)) return lastValue
    await new Promise(resolveDelay => setTimeout(resolveDelay, lifecycleFixtureJson.timeouts.pollIntervalMs))
  } while (Date.now() < deadline)
  throw new Error(`Official Desktop lifecycle ${phase} timed out after ${timeoutMs}ms: ${JSON.stringify(lastValue)}`)
}

function withStartupTimeout(configValue, startupTimeoutMs, portReadyTimeoutMs) {
  const config = structuredClone(configValue)
  config.startup.startupTimeoutMs = startupTimeoutMs
  config.startup.portReadyTimeoutMs = portReadyTimeoutMs
  return parseDesktopE2EConfig(config)
}

function findProfileEntry(entries, entryId) {
  for (const entry of entries) {
    if (entry.id === entryId) return entry
    if (entry.group && Array.isArray(entry.config)) {
      const nested = findProfileEntry(entry.config, entryId)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

async function readTarballPackageManifest(tarballPath) {
  const { stdout } = await execFileAsync('tar', ['-xOzf', tarballPath, 'package/package.json'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })
  const manifest = JSON.parse(stdout)
  if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') {
    throw new TypeError('Lifecycle candidate package manifest must name a package and version')
  }
  return { name: manifest.name, version: manifest.version }
}

async function listenLoopback(port, host) {
  const { createServer } = await import('node:net')
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen({ port, host, exclusive: true }, resolveListen)
  })
  return server
}

async function closeServer(server) {
  if (server === null || server === undefined || !server.listening) return
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
}
