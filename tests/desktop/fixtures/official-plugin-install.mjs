import { lstat, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

import { matchesDesktopRendererTitle, parseDesktopE2ERunRecord } from '../../../config/desktop-e2e-schema.mjs'
import { parsePluginPackageConfig } from '../../../config/plugin-package-schema.mjs'
import { loadDesktopE2EConfig, processGroupMatchesRun } from './official-desktop-probe.mjs'
import { getDesktopPageConnectionIdentity } from './renderer-cdp.mjs'
import {
  OFFICIAL_PLUGIN_INSTALL_SUCCESS_REQUIRED_SCREENSHOT_STAGES,
  parseOfficialPluginInstallConfig,
  parseOfficialPluginInstallEvidence,
} from './official-plugin-install-schema.mjs'

const UI_CONFIG_PATH = fileURLToPath(new URL('./official-plugin-install-config.json', import.meta.url))
const PLUGIN_PACKAGE_CONFIG_PATH = fileURLToPath(new URL('../../../config/plugin-package.json', import.meta.url))
const MAX_TIMEOUT_MS = 300_000
const UI_CONFIG_FILENAME = 'official-plugin-install-config.json'
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_IEND_PREFIX = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44])

export async function loadOfficialPluginInstallConfig() {
  const config = JSON.parse(await readFile(UI_CONFIG_PATH, 'utf8'))
  return parseOfficialPluginInstallConfig(config)
}

/**
 * Drive the official Plugins page to install a local candidate tarball and enable its bundle.
 * probeStatus must come from getProbeStatus; evidence is derived from its validated run record.
 */
export async function installOfficialPluginCandidate(options) {
  const normalizedOptions = normalizeOptions(options)
  const [uiConfig, e2eConfig, packageConfig] = await Promise.all([
    loadOfficialPluginInstallConfig(),
    loadDesktopE2EConfig(),
    loadPluginPackageConfig(),
  ])
  const timeoutMs = normalizedOptions.timeoutMs ?? e2eConfig.startup.startupTimeoutMs
  const pollIntervalMs = normalizedOptions.pollIntervalMs ?? e2eConfig.startup.pollIntervalMs
  validateTimeout(timeoutMs, 'timeoutMs')
  validateTimeout(pollIntervalMs, 'pollIntervalMs')

  const verifiedRun = await validateProbeStatus(
    normalizedOptions.probeStatus,
    normalizedOptions.repositoryRoot,
    e2eConfig,
  )
  const tarballPath = await resolveTarballPath(normalizedOptions.tarballPath)
  const evidencePath = join(verifiedRun.evidenceDirectory, uiConfig.evidence.resultFilename)
  const deadline = Date.now() + timeoutMs
  const state = {
    runId: verifiedRun.record.runId,
    portObservations: verifiedRun.portObservations,
    rendererTarget: null,
    status: 'failed',
    phase: 'opening-plugins',
    reason: null,
    restartRequired: false,
    enabled: false,
    enabledObservation: null,
    evidenceComplete: false,
    requiredScreenshotStages: [],
    operations: [],
    requests: [],
    screenshots: [],
    evidenceErrors: [],
  }
  const connectionIdentity = getDesktopPageConnectionIdentity(normalizedOptions.page)
  state.rendererTarget = summarizeRendererIdentity(connectionIdentity)
  let lastSnapshot = null

  try {
    state.rendererTarget = await verifyRendererTarget(
      normalizedOptions.page,
      connectionIdentity,
      verifiedRun.record,
      e2eConfig.readiness,
      e2eConfig.ports.host,
      deadline,
      state,
    )
    lastSnapshot = await evaluatePage(normalizedOptions.page, 'inspect-current-page', { type: 'observe' }, state, deadline)
    addOperation(state, 'inspect-current-page', { hasAddPluginButton: hasButton(lastSnapshot, uiConfig.ui.addPluginButtonText) })
    if (!hasButton(lastSnapshot, uiConfig.ui.addPluginButtonText)) {
      const opened = await evaluatePage(normalizedOptions.page, 'open-plugins-page', {
        type: 'click-button',
        ariaLabel: uiConfig.ui.pluginNavigationAriaLabel,
      }, state, deadline)
      requireActionSucceeded(opened, 'Could not open the official Plugins page')
      lastSnapshot = opened.snapshot
      addOperation(state, 'open-plugins-page', { ariaLabel: uiConfig.ui.pluginNavigationAriaLabel })
    }

    state.phase = 'opening-plugins'
    const pluginsReady = await waitForSnapshot(
      normalizedOptions.page,
      'wait-for-add-plugin',
      snapshot => hasButton(snapshot, uiConfig.ui.addPluginButtonText),
      state,
      deadline,
      pollIntervalMs,
      lastSnapshot,
    )
    lastSnapshot = pluginsReady.snapshot
    if (pluginsReady.timedOut) {
      state.status = 'timed-out'
      state.reason = 'The Plugins page did not expose the Add plugin button before the deadline.'
      addOperation(state, 'wait-for-add-plugin', { attempts: pluginsReady.attempts, timedOut: true })
      return await finishResult(uiConfig, packageConfig, tarballPath, evidencePath, state)
    }
    addOperation(state, 'wait-for-add-plugin', { attempts: pluginsReady.attempts })
    await captureScreenshot(normalizedOptions.page, uiConfig, verifiedRun.evidenceDirectory, 'plugins-page', state, deadline)

    state.phase = 'opening-install-dialog'
    const dialogOpened = await evaluatePage(normalizedOptions.page, 'open-add-plugin-dialog', {
      type: 'click-button',
      text: uiConfig.ui.addPluginButtonText,
    }, state, deadline)
    requireActionSucceeded(dialogOpened, 'Could not open the official Add plugin dialog')
    lastSnapshot = dialogOpened.snapshot
    addOperation(state, 'open-add-plugin-dialog', { text: uiConfig.ui.addPluginButtonText })

    const dialogReady = await waitForSnapshot(
      normalizedOptions.page,
      'wait-for-package-field',
      snapshot => hasInput(snapshot, uiConfig.ui.packageInputPlaceholder),
      state,
      deadline,
      pollIntervalMs,
      lastSnapshot,
    )
    lastSnapshot = dialogReady.snapshot
    if (dialogReady.timedOut) {
      state.status = 'timed-out'
      state.phase = 'opening-install-dialog'
      state.reason = 'The Add plugin dialog did not expose its package field before the deadline.'
      addOperation(state, 'wait-for-package-field', { attempts: dialogReady.attempts, timedOut: true })
      return await finishResult(uiConfig, packageConfig, tarballPath, evidencePath, state)
    }
    addOperation(state, 'wait-for-package-field', { attempts: dialogReady.attempts })
    await captureScreenshot(normalizedOptions.page, uiConfig, verifiedRun.evidenceDirectory, 'install-dialog', state, deadline)

    state.phase = 'filling-tarball'
    const filled = await evaluatePage(normalizedOptions.page, 'fill-local-tarball', {
      type: 'fill-input',
      placeholder: uiConfig.ui.packageInputPlaceholder,
      value: tarballPath,
    }, state, deadline)
    requireActionSucceeded(filled, 'Could not fill the official plugin package field')
    if (filled.value !== tarballPath) throw new Error('The official plugin package field did not retain the tarball path')
    lastSnapshot = filled.snapshot
    addOperation(state, 'fill-local-tarball', {
      placeholder: uiConfig.ui.packageInputPlaceholder,
      value: tarballPath,
    })

    state.phase = 'submitting-install'
    const submitted = await evaluatePage(normalizedOptions.page, 'submit-install', {
      type: 'click-button',
      text: uiConfig.ui.installButtonText,
    }, state, deadline)
    requireActionSucceeded(submitted, 'Could not submit the official plugin install request')
    lastSnapshot = submitted.snapshot
    addOperation(state, 'submit-install', { text: uiConfig.ui.installButtonText })

    state.phase = 'waiting-for-install-result'
    const installResult = await waitForSnapshot(
      normalizedOptions.page,
      'wait-for-install-result',
      snapshot => classifyInstallResult(snapshot, uiConfig.ui).status !== null,
      state,
      deadline,
      pollIntervalMs,
      lastSnapshot,
    )
    lastSnapshot = installResult.snapshot
    const classified = classifyInstallResult(lastSnapshot, uiConfig.ui)
    state.status = installResult.timedOut ? 'timed-out' : classified.status
    state.reason = installResult.timedOut
      ? 'The official plugin manager did not report a terminal install result before the deadline.'
      : classified.reason
    state.restartRequired = classified.restartRequired
    addOperation(state, 'wait-for-install-result', {
      attempts: installResult.attempts,
      timedOut: installResult.timedOut,
      observedStatus: state.status,
    })
    await captureScreenshot(normalizedOptions.page, uiConfig, verifiedRun.evidenceDirectory, 'install-result', state, deadline)

    if (state.status !== 'installed') {
      return await finishResult(uiConfig, packageConfig, tarballPath, evidencePath, state)
    }

    state.phase = 'enabling-bundle'
    const enableClick = await evaluatePage(normalizedOptions.page, 'enable-installed-bundle', {
      type: 'click-button',
      text: uiConfig.ui.enableNowButtonText,
    }, state, deadline)
    requireActionSucceeded(enableClick, 'The install result did not expose the official Enable now action')
    lastSnapshot = enableClick.snapshot
    addOperation(state, 'enable-installed-bundle', { text: uiConfig.ui.enableNowButtonText })

    state.phase = 'waiting-for-enabled-bundle'
    const enabledLabel = uiConfig.ui.enabledBundleSwitchLabelTemplate.replace('{name}', packageConfig.packageName)
    const bundleControl = await waitForSnapshot(
      normalizedOptions.page,
      'wait-for-enabled-bundle-control',
      snapshot => !snapshot.hasDialog && enabledBundleControls(snapshot, enabledLabel).length > 0,
      state,
      deadline,
      pollIntervalMs,
      enableClick.snapshot,
    )
    lastSnapshot = bundleControl.snapshot
    if (bundleControl.timedOut) {
      state.status = 'enable-timeout'
      state.reason = 'The official plugin manager did not expose the enabled bundle switch before the deadline.'
      state.enabledObservation = describeEnabledBundle(lastSnapshot, enabledLabel)
      addOperation(state, 'wait-for-enabled-bundle-control', {
        attempts: bundleControl.attempts,
        timedOut: true,
        observation: state.enabledObservation,
      })
      return await finishResult(uiConfig, packageConfig, tarballPath, evidencePath, state)
    }
    addOperation(state, 'wait-for-enabled-bundle-control', { attempts: bundleControl.attempts })
    const revealed = await evaluatePage(normalizedOptions.page, 'reveal-enabled-bundle', {
      type: 'scroll-switch-into-view',
      ariaLabel: enabledLabel,
    }, state, deadline)
    requireActionSucceeded(revealed, 'The official plugin manager did not expose a unique enabled bundle switch')
    addOperation(state, 'reveal-enabled-bundle', { ariaLabel: enabledLabel })
    const enabledResult = await waitForSnapshot(
      normalizedOptions.page,
      'wait-for-enabled-bundle',
      snapshot => !snapshot.hasDialog && hasEnabledBundleSwitch(snapshot, enabledLabel),
      state,
      deadline,
      pollIntervalMs,
      enableClick.snapshot,
    )
    lastSnapshot = enabledResult.snapshot
    state.enabledObservation = describeEnabledBundle(lastSnapshot, enabledLabel)
    state.enabled = !enabledResult.timedOut && isEnabledObservation(state.enabledObservation)
    if (enabledResult.timedOut) {
      state.status = 'enable-timeout'
      state.phase = 'waiting-for-enabled-bundle'
      state.reason = 'The official plugin manager did not confirm the enabled switch before the deadline.'
    }
    addOperation(state, 'wait-for-enabled-bundle', {
      attempts: enabledResult.attempts,
      timedOut: enabledResult.timedOut,
      observation: state.enabledObservation,
    })
    if (state.enabled) {
      await captureScreenshot(normalizedOptions.page, uiConfig, verifiedRun.evidenceDirectory, 'enabled-bundle', state, deadline)
    }
  } catch (error) {
    state.reason = error instanceof Error ? error.message : String(error)
    if (isTimeoutError(error) && state.enabled) {
      state.status = 'evidence-incomplete'
    } else if (isTimeoutError(error) && ['enabling-bundle', 'waiting-for-enabled-bundle'].includes(state.phase)) {
      state.status = 'enable-timeout'
      const enabledLabel = uiConfig.ui.enabledBundleSwitchLabelTemplate.replace('{name}', packageConfig.packageName)
      state.enabledObservation = describeEnabledBundle(lastSnapshot, enabledLabel)
    } else {
      state.status = isTimeoutError(error) ? 'timed-out' : 'failed'
    }
    state.evidenceErrors.push({ phase: state.phase, message: state.reason })
  }

  return await finishResult(uiConfig, packageConfig, tarballPath, evidencePath, state)
}

async function loadPluginPackageConfig() {
  const value = JSON.parse(await readFile(PLUGIN_PACKAGE_CONFIG_PATH, 'utf8'))
  return parsePluginPackageConfig(value)
}

function normalizeOptions(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('official plugin install options must be an object')
  }
  const allowed = new Set(['page', 'tarballPath', 'probeStatus', 'repositoryRoot', 'timeoutMs', 'pollIntervalMs'])
  const unexpected = Object.keys(options).filter(key => !allowed.has(key))
  if (unexpected.length > 0) throw new TypeError('official plugin install options contain unexpected keys: ' + unexpected.join(', '))
  if (typeof options.page?.command !== 'function') {
    throw new TypeError('page must expose command from connectDesktopPage')
  }
  if (typeof options.tarballPath !== 'string' || options.tarballPath.trim() === '' || !isAbsolute(options.tarballPath)) {
    throw new TypeError('tarballPath must be an absolute local path')
  }
  if (options.probeStatus === null || typeof options.probeStatus !== 'object' || Array.isArray(options.probeStatus)) {
    throw new TypeError('probeStatus must be a verified getProbeStatus result')
  }
  if (typeof options.repositoryRoot !== 'string' || options.repositoryRoot.trim() === '' || !isAbsolute(options.repositoryRoot)) {
    throw new TypeError('repositoryRoot must be an absolute path')
  }
  for (const key of ['timeoutMs', 'pollIntervalMs']) {
    if (options[key] !== undefined) validateTimeout(options[key], key)
  }
  return options
}

function validateTimeout(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
    throw new TypeError(label + ' must be an integer from 1 through ' + MAX_TIMEOUT_MS + ' milliseconds')
  }
}

async function validateProbeStatus(probeStatus, repositoryRoot, config) {
  const record = parseDesktopE2ERunRecord(probeStatus.record, config)
  if (record.state !== 'running' || record.process === null) {
    throw new TypeError('probeStatus must contain a running Desktop run record')
  }
  if (config.ports.roles.some(role => !Object.hasOwn(record.ports, role))
    || Object.keys(record.ports).length !== config.ports.roles.length) {
    throw new TypeError('probeStatus run record ports do not match the configured Desktop port roles')
  }
  if (probeStatus.processGroupMatchesRun !== true
    || !processGroupMatchesRun(probeStatus.processGroup, record)) {
    throw new TypeError('probeStatus process group does not match the run record')
  }

  const members = probeStatus.processGroup.members
  if (!Array.isArray(members) || members.length === 0) {
    throw new TypeError('probeStatus process group must contain verified members')
  }
  const memberPids = new Set(members.map(member => member.pid))
  if (!Array.isArray(probeStatus.ports) || probeStatus.ports.length !== config.ports.roles.length) {
    throw new TypeError('probeStatus must contain ownership observations for every configured port')
  }
  const requiredRoles = new Set(config.ports.requiredForReady)
  const portObservations = []
  for (const role of config.ports.roles) {
    const port = record.ports[role]
    const owners = probeStatus.ports.filter(item => item?.port === port)
    if (owners.length !== 1 || !Array.isArray(owners[0].pids)) {
      throw new TypeError('probeStatus has no unique owner observation for port ' + port)
    }
    const runPids = owners[0].pids.filter(pid => memberPids.has(pid))
    const foreignPids = owners[0].pids.filter(pid => !memberPids.has(pid))
    if (requiredRoles.has(role) && (runPids.length === 0 || foreignPids.length > 0)) {
      throw new TypeError('probeStatus does not confirm required port ' + role + ' belongs only to this run process group')
    }
    if (!requiredRoles.has(role) && foreignPids.length > 0) {
      throw new TypeError('probeStatus optional port ' + role + ' has a foreign owner')
    }
    portObservations.push({
      role,
      port,
      requiredForReady: requiredRoles.has(role),
      status: runPids.length > 0 ? 'owned-by-run' : 'unavailable',
    })
  }

  const root = await realpath(repositoryRoot)
  const runDirectory = resolve(root, config.paths.runRootRelativePath, record.runId)
  const evidenceDirectory = join(runDirectory, config.paths.directoryNames.evidence)
  const recordPath = join(runDirectory, config.paths.runRecordFilename)
  if (probeStatus.recordPath !== recordPath || record.directories.run !== runDirectory
    || record.directories.evidence !== evidenceDirectory) {
    throw new TypeError('probeStatus run and evidence paths do not belong to this repository run')
  }
  await assertNoSymlinkAncestors(root, runDirectory)
  await assertNoSymlinkAncestors(root, evidenceDirectory)
  const diskRecord = parseDesktopE2ERunRecord(JSON.parse(await readFile(recordPath, 'utf8')), config)
  if (JSON.stringify(diskRecord) !== JSON.stringify(record)) {
    throw new TypeError('probeStatus run record changed after process verification')
  }
  return { record, evidenceDirectory, portObservations }
}

async function verifyRendererTarget(page, connectionIdentity, record, readiness, host, deadline, state) {
  const startedAt = new Date().toISOString()
  let timeoutMs = Math.max(0, deadline - Date.now())
  const expected = summarizeLiveTarget({
    targetId: connectionIdentity?.targetId,
    type: connectionIdentity?.type,
    title: connectionIdentity?.title,
    url: connectionIdentity?.url,
  })
  let result = null
  try {
    if (connectionIdentity === null) {
      throw new TypeError('page must be the original connectDesktopPage result with an immutable Renderer socket identity')
    }
    if (connectionIdentity.runId !== null && connectionIdentity.runId !== record.runId) {
      throw new TypeError('immutable Renderer connection belongs to a different verified Desktop run')
    }
    const target = page.target
    if (target === null || typeof target !== 'object' || Array.isArray(target)) {
      throw new TypeError('page must expose the Renderer target from connectDesktopPage')
    }
    if (target.id !== connectionIdentity.targetId || target.type !== connectionIdentity.type
      || target.title !== connectionIdentity.title || target.url !== connectionIdentity.url
      || target.webSocketDebuggerUrl !== connectionIdentity.socketUrl) {
      throw new TypeError('mutable Renderer target metadata differs from the immutable Renderer socket identity')
    }
    if (typeof connectionIdentity.targetId !== 'string' || connectionIdentity.targetId.trim() === ''
      || connectionIdentity.type !== 'page'
      || typeof connectionIdentity.title !== 'string' || !matchesDesktopRendererTitle(connectionIdentity.title, readiness)
      || typeof connectionIdentity.url !== 'string' || !connectionIdentity.url.startsWith(readiness.applicationUrlPrefix)
      || typeof connectionIdentity.socketUrl !== 'string') {
      throw new TypeError('immutable Renderer target identity does not match the configured Desktop page')
    }
    let socketUrl
    try {
      socketUrl = new URL(connectionIdentity.socketUrl)
    } catch {
      throw new TypeError('Renderer target CDP WebSocket URL is invalid')
    }
    if (socketUrl.protocol !== 'ws:' || socketUrl.hostname !== host
      || socketUrl.port !== String(record.ports.rendererCdp)
      || connectionIdentity.socketHost !== host
      || connectionIdentity.socketPort !== record.ports.rendererCdp
      || socketUrl.username !== '' || socketUrl.password !== '') {
      throw new TypeError('immutable Renderer CDP socket identity does not belong to this verified run')
    }

    const response = await withDeadline(deadline, 'Target.getTargetInfo', remainingMs => {
      timeoutMs = remainingMs
      return page.command('Target.getTargetInfo', {}, remainingMs)
    })
    const liveTarget = response?.targetInfo
    result = summarizeLiveTarget(liveTarget)
    if (liveTarget === null || typeof liveTarget !== 'object' || Array.isArray(liveTarget)
      || liveTarget.targetId !== connectionIdentity.targetId || liveTarget.type !== connectionIdentity.type
      || liveTarget.title !== connectionIdentity.title || liveTarget.url !== connectionIdentity.url) {
      throw new TypeError('live CDP target metadata does not match the verified Renderer target id, type, title, and URL')
    }
    const summary = summarizeRendererIdentity(connectionIdentity)
    state.requests.push({
      method: 'Target.getTargetInfo',
      operation: 'verify-renderer-target',
      startedAt,
      completedAt: new Date().toISOString(),
      timeoutMs,
      expected,
      result,
    })
    addOperation(state, 'verify-renderer-target', summary)
    return summary
  } catch (error) {
    state.requests.push({
      method: 'Target.getTargetInfo',
      operation: 'verify-renderer-target',
      startedAt,
      completedAt: new Date().toISOString(),
      timeoutMs,
      expected,
      result,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

function summarizeLiveTarget(targetInfo) {
  if (targetInfo === null || typeof targetInfo !== 'object' || Array.isArray(targetInfo)) return null
  const field = value => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null
    ? value
    : null
  return {
    id: field(targetInfo.targetId),
    type: field(targetInfo.type),
    title: field(targetInfo.title),
    url: field(targetInfo.url),
  }
}

function summarizeRendererIdentity(identity) {
  if (identity === null) return null
  return {
    id: identity.targetId,
    type: identity.type,
    title: identity.title,
    url: identity.url,
    socketHost: identity.socketHost,
    socketPort: identity.socketPort,
  }
}

async function assertNoSymlinkAncestors(root, target) {
  const relativeTarget = relative(root, target)
  if (relativeTarget === '..' || relativeTarget.startsWith('..' + sep) || isAbsolute(relativeTarget)) {
    throw new TypeError('desktop E2E path must remain inside the repository')
  }
  let current = root
  for (const part of relativeTarget.split(sep).filter(Boolean)) {
    current = join(current, part)
    const info = await lstat(current)
    if (info.isSymbolicLink()) throw new Error('desktop E2E path contains a symbolic link: ' + current)
    if (!info.isDirectory()) throw new Error('desktop E2E path component is not a directory: ' + current)
  }
}

async function resolveTarballPath(value) {
  if (!/[.](?:tgz|tar[.]gz)$/iu.test(value)) {
    throw new TypeError('tarballPath must name a regular tarball file ending in .tgz or .tar.gz')
  }
  let details
  try {
    details = await stat(value)
  } catch {
    throw new TypeError('tarballPath must name a regular tarball file')
  }
  if (!details.isFile() || details.size === 0) throw new TypeError('tarballPath must name a non-empty regular tarball file')
  return value
}

async function evaluatePage(page, operation, action, state, deadline) {
  const startedAt = new Date().toISOString()
  let timeoutMs = Math.max(0, deadline - Date.now())
  try {
    const response = await withDeadline(deadline, 'Runtime.evaluate', remainingMs => {
      timeoutMs = remainingMs
      return page.command('Runtime.evaluate', {
        expression: '(' + performOfficialPluginUIAction.toString() + ')(' + JSON.stringify(action) + ')',
        returnByValue: true,
        awaitPromise: true,
      }, remainingMs)
    })
    if (response?.exceptionDetails !== undefined) {
      const details = response.exceptionDetails
      throw new Error(details.exception?.description ?? details.text ?? 'Renderer expression threw an exception')
    }
    const rendererValue = response?.result?.value
    const value = JSON.parse(JSON.stringify(rendererValue))
    state.requests.push({
      method: 'Runtime.evaluate',
      operation,
      startedAt,
      completedAt: new Date().toISOString(),
      timeoutMs,
      result: summarizeSnapshot(value),
    })
    return value
  } catch (error) {
    state.requests.push({
      method: 'Runtime.evaluate',
      operation,
      startedAt,
      completedAt: new Date().toISOString(),
      timeoutMs,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

async function withDeadline(deadline, operation, invoke) {
  const remainingMs = deadline - Date.now()
  if (remainingMs <= 0) throw deadlineError(operation)
  let timer
  const timeout = new Promise((resolveTimeout, rejectTimeout) => {
    timer = setTimeout(() => rejectTimeout(deadlineError(operation)), remainingMs)
  })
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => invoke(remainingMs)),
      timeout,
    ])
    if (Date.now() >= deadline) throw deadlineError(operation)
    return result
  } finally {
    clearTimeout(timer)
  }
}

function deadlineError(operation) {
  const error = new Error('timed out waiting for ' + operation + ' before the install deadline')
  error.code = 'OFFICIAL_INSTALL_DEADLINE'
  return error
}

async function waitForSnapshot(page, operation, predicate, state, deadline, pollIntervalMs, initialSnapshot) {
  let snapshot = initialSnapshot
  let attempts = 0
  while (true) {
    if (snapshot !== null && predicate(snapshot)) return { snapshot, attempts, timedOut: false }
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) return { snapshot, attempts, timedOut: true }
    if (snapshot === null) {
      snapshot = await evaluatePage(page, operation, { type: 'observe' }, state, deadline)
      attempts += 1
      if (predicate(snapshot)) return { snapshot, attempts, timedOut: false }
    }
    const pauseMs = Math.min(pollIntervalMs, deadline - Date.now())
    if (pauseMs <= 0) return { snapshot, attempts, timedOut: true }
    await new Promise(resolvePause => setTimeout(resolvePause, pauseMs))
    snapshot = null
  }
}

function classifyInstallResult(snapshot, ui) {
  const messages = [...(snapshot?.messages ?? []), snapshot?.dialogText ?? '']
  const includes = text => messages.some(message => typeof message === 'string' && message.includes(text))
  const reason = snapshot?.alerts?.find(message => message.trim() !== '') ?? null
  if (includes(ui.alreadyInstalledText)) return { status: 'already-installed', restartRequired: false, reason }
  if (includes(ui.installFailureHeadingText)) return { status: 'failed', restartRequired: false, reason }
  if (includes(ui.unknownResultHeadingText)) return { status: 'unknown', restartRequired: false, reason }
  if (includes(ui.nothingInstalledText)) return { status: 'no-new-dependency', restartRequired: false, reason }
  if (includes(ui.installedHeadingText) && hasButton(snapshot, ui.enableNowButtonText)) {
    return { status: 'installed', restartRequired: includes(ui.restartRequiredText), reason: null }
  }
  if (snapshot?.alerts?.length > 0) return { status: 'refused', restartRequired: false, reason }
  return { status: null, restartRequired: false, reason: null }
}

function hasButton(snapshot, text) {
  return snapshot?.buttons?.some(button => button.visible && !button.disabled && button.text === text) ?? false
}

function hasInput(snapshot, placeholder) {
  const matches = snapshot?.inputs?.filter(input => input.visible && !input.disabled && input.placeholder === placeholder) ?? []
  return matches.length > 0
}

function enabledBundleControl(snapshot, label) {
  const controls = enabledBundleControls(snapshot, label)
  return controls.length === 1 ? controls[0] : null
}

function enabledBundleControls(snapshot, label) {
  return snapshot?.buttons?.filter(button => button.ariaLabel === label && button.role === 'switch') ?? []
}

function hasEnabledBundleSwitch(snapshot, label) {
  const control = enabledBundleControl(snapshot, label)
  return control !== null && !control.disabled && control.ariaChecked === 'true'
    && control.inViewport === true && boundsInsideViewport(control.bounds, snapshot.viewport)
}

function describeEnabledBundle(snapshot, label) {
  const control = enabledBundleControl(snapshot, label)
  return {
    hasDialog: snapshot?.hasDialog === true,
    role: control?.role ?? null,
    ariaLabel: control?.ariaLabel ?? null,
    ariaChecked: control?.ariaChecked ?? null,
    disabled: control?.disabled ?? null,
    inViewport: control?.inViewport ?? null,
    bounds: control?.bounds ?? null,
    viewport: snapshot?.viewport ?? null,
  }
}

function isEnabledObservation(observation) {
  return observation?.hasDialog === false
    && observation.role === 'switch'
    && observation.ariaChecked === 'true'
    && observation.disabled === false
    && observation.inViewport === true
    && boundsInsideViewport(observation.bounds, observation.viewport)
}

function boundsInsideViewport(bounds, viewport) {
  return bounds !== null && typeof bounds === 'object'
    && viewport !== null && typeof viewport === 'object'
    && Number.isFinite(bounds.left) && Number.isFinite(bounds.top)
    && Number.isFinite(bounds.right) && Number.isFinite(bounds.bottom)
    && Number.isFinite(bounds.width) && Number.isFinite(bounds.height)
    && Number.isFinite(viewport.width) && Number.isFinite(viewport.height)
    && bounds.width > 0 && bounds.height > 0
    && bounds.left >= 0 && bounds.top >= 0
    && bounds.right <= viewport.width && bounds.bottom <= viewport.height
}

function requireActionSucceeded(actionResult, message) {
  if (actionResult?.ok !== true) throw new Error(message + ': ' + (actionResult?.reason ?? 'the control was not available'))
}

function isTimeoutError(error) {
  return error?.code === 'OFFICIAL_INSTALL_DEADLINE'
    || error?.code === 'RENDERER_CDP_TIMEOUT'
    || /timed out|deadline/iu.test(error instanceof Error ? error.message : String(error))
}

function addOperation(state, name, details = {}) {
  state.operations.push({ name, at: new Date().toISOString(), ...details })
}

async function captureScreenshot(page, config, evidenceDirectory, stage, state, deadline) {
  const key = {
    'plugins-page': 'pluginsPage',
    'install-dialog': 'installDialog',
    'install-result': 'installResult',
    'enabled-bundle': 'enabledBundle',
  }[stage]
  if (key === undefined) throw new TypeError('unknown official install screenshot stage: ' + stage)
  const screenshotPath = join(evidenceDirectory, config.evidence.screenshots[key])
  const operation = 'capture-' + stage
  const startedAt = new Date().toISOString()
  let timeoutMs = Math.max(0, deadline - Date.now())
  try {
    const result = await withDeadline(deadline, 'Page.captureScreenshot', remainingMs => {
      timeoutMs = remainingMs
      return page.command('Page.captureScreenshot', { format: 'png' }, remainingMs)
    })
    if (typeof result?.data !== 'string' || result.data.trim() === '') {
      throw new Error('Renderer CDP returned no screenshot data')
    }
    const bytes = Buffer.from(result.data, 'base64')
    if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      throw new Error('Renderer CDP did not return a PNG screenshot')
    }
    if (bytes.length < PNG_IEND_PREFIX.length + 4
      || !bytes.subarray(bytes.length - PNG_IEND_PREFIX.length - 4, bytes.length - 4).equals(PNG_IEND_PREFIX)) {
      throw new Error('Renderer CDP screenshot PNG is truncated before its complete IEND chunk')
    }
    const metadata = await sharp(bytes, { failOn: 'warning' }).metadata()
    if (metadata.format !== 'png' || !Number.isSafeInteger(metadata.width) || metadata.width < 1
      || !Number.isSafeInteger(metadata.height) || metadata.height < 1
      || !Number.isSafeInteger(metadata.width * metadata.height)) {
      throw new Error('Renderer CDP screenshot is not a decodable PNG image with positive dimensions')
    }
    const decoded = await sharp(bytes, { failOn: 'warning' }).raw().toBuffer({ resolveWithObject: true })
    const decodedByteLength = metadata.width * metadata.height * decoded.info.channels
    if (decoded.info.width !== metadata.width || decoded.info.height !== metadata.height
      || !Number.isSafeInteger(decodedByteLength) || decoded.data.byteLength !== decodedByteLength) {
      throw new Error('Renderer CDP screenshot PNG did not decode to complete image pixels')
    }
    await writeFile(screenshotPath, bytes, { flag: 'wx', mode: 0o600 })
    if (Date.now() >= deadline) throw deadlineError('saving ' + operation)
    state.requests.push({
      method: 'Page.captureScreenshot',
      operation,
      startedAt,
      completedAt: new Date().toISOString(),
      timeoutMs,
      result: 'saved',
    })
    state.screenshots.push({ stage, path: screenshotPath })
    addOperation(state, operation, { path: screenshotPath })
    return screenshotPath
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    state.requests.push({
      method: 'Page.captureScreenshot',
      operation,
      startedAt,
      completedAt: new Date().toISOString(),
      timeoutMs,
      error: message,
    })
    state.evidenceErrors.push({ phase: operation, message })
    if (isTimeoutError(error)) throw error
    return null
  }
}

async function finishResult(config, packageConfig, tarballPath, evidencePath, state) {
  const completedOperations = new Set(state.operations.map(operation => operation.name))
  state.requiredScreenshotStages = state.enabled
    ? [...OFFICIAL_PLUGIN_INSTALL_SUCCESS_REQUIRED_SCREENSHOT_STAGES]
    : [
        ...(completedOperations.has('wait-for-add-plugin') ? ['plugins-page'] : []),
        ...(completedOperations.has('wait-for-package-field') ? ['install-dialog'] : []),
        ...(completedOperations.has('wait-for-install-result') ? ['install-result'] : []),
      ]
  const screenshotStages = new Set(state.screenshots.map(screenshot => screenshot.stage))
  state.evidenceComplete = state.requiredScreenshotStages.length > 0
    && state.requiredScreenshotStages.every(stage => screenshotStages.has(stage))
  if (state.status === 'installed' && state.enabled && !state.evidenceComplete) {
    state.status = 'evidence-incomplete'
    state.reason = 'The official UI enabled the plugin, but required screenshot evidence is incomplete.'
  }

  const evidence = parseOfficialPluginInstallEvidence({
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    runId: state.runId,
    portObservations: state.portObservations,
    rendererTarget: state.rendererTarget,
    status: state.status,
    phase: state.phase,
    reason: state.reason,
    tarballPath,
    expectedPackageName: packageConfig.packageName,
    restartRequired: state.restartRequired,
    enabled: state.enabled,
    enabledObservation: state.enabledObservation,
    evidenceComplete: state.evidenceComplete,
    requiredScreenshotStages: state.requiredScreenshotStages,
    operations: state.operations,
    requests: state.requests,
    screenshots: state.screenshots,
    evidenceErrors: state.evidenceErrors,
    uiConfig: UI_CONFIG_FILENAME,
  })
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  return {
    runId: state.runId,
    portObservations: state.portObservations,
    rendererTarget: state.rendererTarget,
    status: state.status,
    phase: state.phase,
    reason: state.reason,
    tarballPath,
    expectedPackageName: packageConfig.packageName,
    restartRequired: state.restartRequired,
    enabled: state.enabled,
    enabledObservation: state.enabledObservation,
    evidenceComplete: state.evidenceComplete,
    requiredScreenshotStages: state.requiredScreenshotStages,
    evidencePath,
    operations: state.operations,
    requests: state.requests,
    screenshots: state.screenshots,
    evidenceErrors: state.evidenceErrors,
  }
}

function summarizeSnapshot(snapshot) {
  if (snapshot === null || typeof snapshot !== 'object') return snapshot
  if (snapshot.snapshot !== null && typeof snapshot.snapshot === 'object') {
    return {
      ...(snapshot.ok === undefined ? {} : { ok: snapshot.ok }),
      ...(snapshot.reason === undefined ? {} : { reason: snapshot.reason }),
      snapshot: summarizeSnapshot(snapshot.snapshot),
    }
  }
  return {
    dialogText: snapshot.dialogText,
    hasDialog: snapshot.hasDialog,
    viewport: snapshot.viewport,
    messages: snapshot.messages,
    buttons: snapshot.buttons?.map(({ text, ariaLabel, disabled, role, ariaChecked, inViewport, bounds }) => ({
      text,
      ariaLabel,
      disabled,
      role,
      ariaChecked,
      inViewport,
      ...(role === 'switch' ? { bounds } : {}),
    })),
    inputs: snapshot.inputs?.map(({ type, placeholder, disabled, visible }) => ({
      type,
      placeholder,
      disabled,
      visible,
    })),
  }
}

function performOfficialPluginUIAction(action) {
  const viewport = () => ({
    width: document.documentElement?.clientWidth || globalThis.innerWidth || 0,
    height: document.documentElement?.clientHeight || globalThis.innerHeight || 0,
  })
  const bounds = element => {
    if (typeof element.getBoundingClientRect !== 'function') return null
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    }
  }
  const inViewport = element => {
    if (element.hidden === true || typeof element.getClientRects === 'function' && element.getClientRects().length === 0) {
      return false
    }
    const rect = bounds(element)
    const size = viewport()
    return rect !== null && rect.width > 0 && rect.height > 0
      && rect.left >= 0 && rect.top >= 0 && rect.right <= size.width && rect.bottom <= size.height
  }
  const visible = element => inViewport(element)
  const readAttribute = (element, name) => element.getAttribute?.(name) ?? null
  const buttonSnapshot = element => ({
    text: String(element.innerText ?? element.textContent ?? '').trim(),
    ariaLabel: readAttribute(element, 'aria-label'),
    disabled: element.disabled === true,
    role: readAttribute(element, 'role'),
    ariaChecked: readAttribute(element, 'aria-checked') ?? (typeof element.checked === 'boolean' ? String(element.checked) : null),
    visible: visible(element),
    inViewport: inViewport(element),
    bounds: readAttribute(element, 'role') === 'switch' ? bounds(element) : null,
  })
  const inputSnapshot = element => ({
    type: element.type ?? readAttribute(element, 'type') ?? 'text',
    placeholder: element.placeholder ?? readAttribute(element, 'placeholder') ?? '',
    disabled: element.disabled === true,
    visible: visible(element),
  })
  const snapshot = () => {
    const dialog = document.querySelector('[role="dialog"]')
    const messages = Array.from(dialog?.querySelectorAll('[role="alert"], [role="status"]') ?? [])
      .filter(visible)
      .map(element => String(element.innerText ?? element.textContent ?? '').trim())
      .filter(Boolean)
    const alerts = Array.from(dialog?.querySelectorAll('[role="alert"]') ?? [])
      .filter(visible)
      .map(element => String(element.innerText ?? element.textContent ?? '').trim())
      .filter(Boolean)
    return {
      viewport: viewport(),
      hasDialog: dialog !== null,
      dialogText: String(dialog?.innerText ?? dialog?.textContent ?? '').trim().slice(0, 3_000),
      messages,
      alerts,
      buttons: Array.from(document.querySelectorAll('button, [role="switch"]')).map(buttonSnapshot),
      inputs: Array.from(document.querySelectorAll('input')).map(inputSnapshot),
    }
  }

  if (action.type === 'observe') return snapshot()
  if (action.type === 'click-button') {
    const candidates = Array.from(document.querySelectorAll('button, [role="switch"]')).filter(element => {
      if (!visible(element)) return false
      const text = String(element.innerText ?? element.textContent ?? '').trim()
      const ariaLabel = readAttribute(element, 'aria-label')
      return action.text !== undefined && text === action.text
        || action.ariaLabel !== undefined && ariaLabel === action.ariaLabel
    })
    if (candidates.length === 0) return { ok: false, reason: 'not-found', snapshot: snapshot() }
    if (candidates.length > 1) return { ok: false, reason: 'ambiguous', snapshot: snapshot() }
    if (candidates[0].disabled === true) return { ok: false, reason: 'disabled', snapshot: snapshot() }
    candidates[0].click()
    return { ok: true, snapshot: snapshot() }
  }
  if (action.type === 'fill-input') {
    const candidates = Array.from(document.querySelectorAll('input')).filter(element => visible(element)
      && (element.placeholder ?? readAttribute(element, 'placeholder')) === action.placeholder)
    if (candidates.length === 0) return { ok: false, reason: 'not-found', snapshot: snapshot() }
    if (candidates.length > 1) return { ok: false, reason: 'ambiguous', snapshot: snapshot() }
    const input = candidates[0]
    if (input.disabled === true) return { ok: false, reason: 'disabled', snapshot: snapshot() }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (typeof setter === 'function') setter.call(input, action.value)
    else input.value = action.value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return { ok: true, value: String(input.value), snapshot: snapshot() }
  }
  if (action.type === 'scroll-switch-into-view') {
    const candidates = Array.from(document.querySelectorAll('[role="switch"]'))
      .filter(element => readAttribute(element, 'aria-label') === action.ariaLabel)
    if (candidates.length === 0) return { ok: false, reason: 'not-found', snapshot: snapshot() }
    if (candidates.length > 1) return { ok: false, reason: 'ambiguous', snapshot: snapshot() }
    if (candidates[0].disabled === true) return { ok: false, reason: 'disabled', snapshot: snapshot() }
    candidates[0].scrollIntoView?.({ block: 'center', inline: 'nearest' })
    return { ok: true, snapshot: snapshot() }
  }
  return { ok: false, reason: 'unsupported-action:' + String(action.type), snapshot: snapshot() }
}
