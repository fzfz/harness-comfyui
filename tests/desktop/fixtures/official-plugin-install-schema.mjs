import { isAbsolute } from 'node:path'

const CONFIG_KEYS = ['schemaVersion', 'ui', 'evidence']
const UI_KEYS = [
  'pluginNavigationAriaLabel',
  'addPluginButtonText',
  'packageInputPlaceholder',
  'installButtonText',
  'enableNowButtonText',
  'alreadyInstalledText',
  'installedHeadingText',
  'installFailureHeadingText',
  'unknownResultHeadingText',
  'nothingInstalledText',
  'restartRequiredText',
  'enabledBundleSwitchLabelTemplate',
]
const EVIDENCE_KEYS = ['resultFilename', 'screenshots']
export const OFFICIAL_PLUGIN_INSTALL_SUCCESS_REQUIRED_SCREENSHOT_STAGES = Object.freeze([
  'plugins-page',
  'install-dialog',
  'install-result',
  'enabled-bundle',
])
const SCREENSHOT_KEYS = ['pluginsPage', 'installDialog', 'installResult', 'enabledBundle']
const INSTALL_STATUSES = [
  'installed',
  'already-installed',
  'refused',
  'failed',
  'unknown',
  'no-new-dependency',
  'timed-out',
  'enable-timeout',
  'evidence-incomplete',
]
const INSTALL_PHASES = [
  'opening-plugins',
  'opening-install-dialog',
  'filling-tarball',
  'submitting-install',
  'waiting-for-install-result',
  'enabling-bundle',
  'waiting-for-enabled-bundle',
]
const OPERATION_NAMES = [
  'verify-renderer-target',
  'inspect-current-page',
  'open-plugins-page',
  'wait-for-add-plugin',
  'capture-plugins-page',
  'open-add-plugin-dialog',
  'wait-for-package-field',
  'capture-install-dialog',
  'fill-local-tarball',
  'submit-install',
  'wait-for-install-result',
  'capture-install-result',
  'enable-installed-bundle',
  'wait-for-enabled-bundle-control',
  'reveal-enabled-bundle',
  'wait-for-enabled-bundle',
  'capture-enabled-bundle',
]
const SCREENSHOT_STAGES = OFFICIAL_PLUGIN_INSTALL_SUCCESS_REQUIRED_SCREENSHOT_STAGES
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function exactKeys(value, keys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(label + ' must be an object')
  }
  const missing = keys.filter(key => !Object.hasOwn(value, key))
  const unexpected = Object.keys(value).filter(key => !keys.includes(key))
  if (missing.length > 0 || unexpected.length > 0) {
    throw new TypeError(label + ' must contain exactly ' + keys.join(', ')
      + (missing.length > 0 ? '; missing ' + missing.join(', ') : '')
      + (unexpected.length > 0 ? '; unexpected ' + unexpected.join(', ') : ''))
  }
  return value
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(label + ' must be a non-empty string')
  }
  return value
}

function filename(value, label) {
  nonEmptyString(value, label)
  if (value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new TypeError(label + ' must be a filename')
  }
}

export function parseOfficialPluginInstallConfig(value) {
  const config = exactKeys(value, CONFIG_KEYS, 'official plugin install config')
  if (config.schemaVersion !== 1) {
    throw new TypeError('official plugin install config.schemaVersion must be 1')
  }

  const ui = exactKeys(config.ui, UI_KEYS, 'official plugin install config.ui')
  for (const key of UI_KEYS) nonEmptyString(ui[key], 'official plugin install config.ui.' + key)
  if (!ui.enabledBundleSwitchLabelTemplate.includes('{name}')) {
    throw new TypeError('official plugin install config.ui.enabledBundleSwitchLabelTemplate must contain {name}')
  }

  const evidence = exactKeys(config.evidence, EVIDENCE_KEYS, 'official plugin install config.evidence')
  filename(evidence.resultFilename, 'official plugin install config.evidence.resultFilename')
  const screenshots = exactKeys(evidence.screenshots, SCREENSHOT_KEYS, 'official plugin install config.evidence.screenshots')
  for (const [key, value] of Object.entries(screenshots)) {
    filename(value, 'official plugin install config.evidence.screenshots.' + key)
  }
  if (new Set([evidence.resultFilename, ...Object.values(screenshots)]).size !== 1 + SCREENSHOT_KEYS.length) {
    throw new TypeError('official plugin install config.evidence filenames must be unique')
  }
  return config
}

export function parseOfficialPluginInstallEvidence(value) {
  const evidence = exactKeys(value, [
    'schemaVersion',
    'createdAt',
    'runId',
    'portObservations',
    'rendererTarget',
    'status',
    'phase',
    'reason',
    'tarballPath',
    'expectedPackageName',
    'restartRequired',
    'enabled',
    'enabledObservation',
    'evidenceComplete',
    'requiredScreenshotStages',
    'operations',
    'requests',
    'screenshots',
    'evidenceErrors',
    'uiConfig',
  ], 'official plugin install evidence')
  if (evidence.schemaVersion !== 1) throw new TypeError('official plugin install evidence.schemaVersion must be 1')
  isoTimestamp(evidence.createdAt, 'official plugin install evidence.createdAt')
  if (typeof evidence.runId !== 'string' || !UUID_PATTERN.test(evidence.runId)) {
    throw new TypeError('official plugin install evidence.runId must be a UUID')
  }
  if (!Array.isArray(evidence.portObservations) || evidence.portObservations.length < 1) {
    throw new TypeError('official plugin install evidence.portObservations must be a non-empty array')
  }
  const observedRoles = new Set()
  const observedPorts = new Set()
  for (const [index, observation] of evidence.portObservations.entries()) {
    const label = 'official plugin install evidence.portObservations[' + index + ']'
    exactKeys(observation, ['role', 'port', 'requiredForReady', 'status'], label)
    nonEmptyString(observation.role, label + '.role')
    if (!Number.isInteger(observation.port) || observation.port < 1 || observation.port > 65535) {
      throw new TypeError(label + '.port must be a valid TCP port')
    }
    if (typeof observation.requiredForReady !== 'boolean') {
      throw new TypeError(label + '.requiredForReady must be boolean')
    }
    if (!['owned-by-run', 'unavailable'].includes(observation.status)) {
      throw new TypeError(label + '.status is invalid')
    }
    if (observation.requiredForReady && observation.status !== 'owned-by-run') {
      throw new TypeError(label + ' required ports must be owned by the verified run')
    }
    if (observedRoles.has(observation.role) || observedPorts.has(observation.port)) {
      throw new TypeError('official plugin install evidence.portObservations must not repeat roles or ports')
    }
    observedRoles.add(observation.role)
    observedPorts.add(observation.port)
  }
  if (!INSTALL_STATUSES.includes(evidence.status)) throw new TypeError('official plugin install evidence.status is invalid')
  if (evidence.rendererTarget === null) {
    if (!['failed', 'timed-out'].includes(evidence.status)) {
      throw new TypeError('official plugin install evidence.rendererTarget may be null only when Renderer verification fails')
    }
  } else {
    const rendererTarget = exactKeys(evidence.rendererTarget, [
      'id', 'type', 'title', 'url', 'socketHost', 'socketPort',
    ], 'official plugin install evidence.rendererTarget')
    nonEmptyString(rendererTarget.id, 'official plugin install evidence.rendererTarget.id')
    if (rendererTarget.type !== 'page') throw new TypeError('official plugin install evidence.rendererTarget.type must be page')
    for (const key of ['title', 'url', 'socketHost']) {
      nonEmptyString(rendererTarget[key], 'official plugin install evidence.rendererTarget.' + key)
    }
    if (!Number.isInteger(rendererTarget.socketPort) || rendererTarget.socketPort < 1 || rendererTarget.socketPort > 65535) {
      throw new TypeError('official plugin install evidence.rendererTarget.socketPort must be a valid TCP port')
    }
  }
  if (!INSTALL_PHASES.includes(evidence.phase)) throw new TypeError('official plugin install evidence.phase is invalid')
  if (evidence.reason !== null) nonEmptyString(evidence.reason, 'official plugin install evidence.reason')

  const tarballPath = nonEmptyString(evidence.tarballPath, 'official plugin install evidence.tarballPath')
  if (!isAbsolute(tarballPath)) throw new TypeError('official plugin install evidence.tarballPath must be absolute')
  nonEmptyString(evidence.expectedPackageName, 'official plugin install evidence.expectedPackageName')
  for (const key of ['restartRequired', 'enabled', 'evidenceComplete']) {
    if (typeof evidence[key] !== 'boolean') throw new TypeError('official plugin install evidence.' + key + ' must be boolean')
  }
  nonEmptyString(evidence.uiConfig, 'official plugin install evidence.uiConfig')
  filename(evidence.uiConfig, 'official plugin install evidence.uiConfig')

  if (evidence.enabledObservation !== null) {
    const observation = exactKeys(evidence.enabledObservation, [
      'hasDialog',
      'role',
      'ariaLabel',
      'ariaChecked',
      'disabled',
      'inViewport',
      'bounds',
      'viewport',
    ], 'official plugin install evidence.enabledObservation')
    if (typeof observation.hasDialog !== 'boolean') {
      throw new TypeError('official plugin install evidence.enabledObservation.hasDialog must be boolean')
    }
    for (const key of ['role', 'ariaLabel', 'ariaChecked']) {
      if (observation[key] !== null) {
        nonEmptyString(observation[key], 'official plugin install evidence.enabledObservation.' + key)
      }
    }
    if (observation.disabled !== null && typeof observation.disabled !== 'boolean') {
      throw new TypeError('official plugin install evidence.enabledObservation.disabled must be boolean or null')
    }
    if (observation.inViewport !== null && typeof observation.inViewport !== 'boolean') {
      throw new TypeError('official plugin install evidence.enabledObservation.inViewport must be boolean or null')
    }
    if (observation.bounds !== null) parseBounds(observation.bounds, 'official plugin install evidence.enabledObservation.bounds')
    if (observation.viewport !== null) parseViewport(observation.viewport, 'official plugin install evidence.enabledObservation.viewport')
  }
  if (evidence.enabled && (evidence.enabledObservation?.hasDialog !== false
    || evidence.rendererTarget === null
    || evidence.enabledObservation.role !== 'switch'
    || evidence.enabledObservation.ariaChecked !== 'true'
    || evidence.enabledObservation.disabled !== false
    || evidence.enabledObservation.inViewport !== true
    || !boundsInsideViewport(evidence.enabledObservation.bounds, evidence.enabledObservation.viewport))) {
    throw new TypeError('official plugin install evidence.enabled requires an observed enabled switch state')
  }

  if (!Array.isArray(evidence.requiredScreenshotStages)
    || evidence.requiredScreenshotStages.some(stage => !SCREENSHOT_STAGES.includes(stage))
    || new Set(evidence.requiredScreenshotStages).size !== evidence.requiredScreenshotStages.length) {
    throw new TypeError('official plugin install evidence.requiredScreenshotStages must contain unique known screenshot stages')
  }
  if (evidence.enabled && !sameItems(evidence.requiredScreenshotStages, OFFICIAL_PLUGIN_INSTALL_SUCCESS_REQUIRED_SCREENSHOT_STAGES)) {
    throw new TypeError('enabled evidence must declare all success-required screenshot stages')
  }
  if (!Array.isArray(evidence.operations)) throw new TypeError('official plugin install evidence.operations must be an array')
  for (const [index, operation] of evidence.operations.entries()) {
    const label = 'official plugin install evidence.operations[' + index + ']'
    if (operation === null || typeof operation !== 'object' || Array.isArray(operation)) {
      throw new TypeError(label + ' must be an object')
    }
    if (!OPERATION_NAMES.includes(operation.name)) throw new TypeError(label + '.name is invalid')
    isoTimestamp(operation.at, label + '.at')
    assertJsonValue(operation, label)
  }

  if (!Array.isArray(evidence.requests)) throw new TypeError('official plugin install evidence.requests must be an array')
  for (const [index, request] of evidence.requests.entries()) {
    const label = 'official plugin install evidence.requests[' + index + ']'
    if (request === null || typeof request !== 'object' || Array.isArray(request)) {
      throw new TypeError(label + ' must be an object')
    }
    if (!['Runtime.evaluate', 'Page.captureScreenshot', 'Target.getTargetInfo'].includes(request.method)) {
      throw new TypeError(label + '.method is invalid')
    }
    nonEmptyString(request.operation, label + '.operation')
    isoTimestamp(request.startedAt, label + '.startedAt')
    isoTimestamp(request.completedAt, label + '.completedAt')
    if (!Object.hasOwn(request, 'result') && !Object.hasOwn(request, 'error')) {
      throw new TypeError(label + ' must contain result or error')
    }
    if (!Number.isSafeInteger(request.timeoutMs) || request.timeoutMs < 0) {
      throw new TypeError(label + '.timeoutMs must be a non-negative integer')
    }
    assertJsonValue(request, label)
  }

  if (!Array.isArray(evidence.screenshots)) throw new TypeError('official plugin install evidence.screenshots must be an array')
  for (const [index, screenshot] of evidence.screenshots.entries()) {
    const label = 'official plugin install evidence.screenshots[' + index + ']'
    exactKeys(screenshot, ['stage', 'path'], label)
    if (!SCREENSHOT_STAGES.includes(screenshot.stage)) throw new TypeError(label + '.stage is invalid')
    const path = nonEmptyString(screenshot.path, label + '.path')
    if (!isAbsolute(path)) throw new TypeError(label + '.path must be absolute')
  }
  const screenshotStages = new Set(evidence.screenshots.map(screenshot => screenshot.stage))
  if (evidence.screenshots.length !== screenshotStages.size) {
    throw new TypeError('official plugin install evidence.screenshots must not repeat a stage')
  }
  const expectedEvidenceComplete = evidence.requiredScreenshotStages.length > 0
    && evidence.requiredScreenshotStages.every(stage => screenshotStages.has(stage))
  if (evidence.evidenceComplete !== expectedEvidenceComplete) {
    throw new TypeError('official plugin install evidence.evidenceComplete must match required screenshot evidence')
  }
  if (evidence.status === 'installed' && (!evidence.enabled || !evidence.evidenceComplete)) {
    throw new TypeError('official plugin install success requires an enabled UI and complete screenshot evidence')
  }
  if (evidence.status === 'evidence-incomplete' && (!evidence.enabled || evidence.evidenceComplete)) {
    throw new TypeError('official plugin install evidence-incomplete status requires enabled UI and missing screenshot evidence')
  }

  if (!Array.isArray(evidence.evidenceErrors)) throw new TypeError('official plugin install evidence.evidenceErrors must be an array')
  for (const [index, item] of evidence.evidenceErrors.entries()) {
    const label = 'official plugin install evidence.evidenceErrors[' + index + ']'
    exactKeys(item, ['phase', 'message'], label)
    nonEmptyString(item.phase, label + '.phase')
    nonEmptyString(item.message, label + '.message')
  }
  assertJsonValue(evidence, 'official plugin install evidence')
  return evidence
}

function sameItems(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function isoTimestamp(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new TypeError(label + ' must be an ISO timestamp')
  }
}

function parseBounds(value, label) {
  exactKeys(value, ['left', 'top', 'right', 'bottom', 'width', 'height'], label)
  for (const key of ['left', 'top', 'right', 'bottom', 'width', 'height']) {
    if (!Number.isFinite(value[key])) throw new TypeError(label + '.' + key + ' must be finite')
  }
  if (value.width <= 0 || value.height <= 0) throw new TypeError(label + ' must have positive width and height')
}

function parseViewport(value, label) {
  exactKeys(value, ['width', 'height'], label)
  for (const key of ['width', 'height']) {
    if (!Number.isFinite(value[key]) || value[key] <= 0) throw new TypeError(label + '.' + key + ' must be positive and finite')
  }
}

function boundsInsideViewport(bounds, viewport) {
  return bounds !== null && viewport !== null
    && bounds.left >= 0 && bounds.top >= 0
    && bounds.right <= viewport.width && bounds.bottom <= viewport.height
}

function assertJsonValue(value, label, active = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || typeof value === 'number' && Number.isFinite(value)) return
  if (typeof value !== 'object') {
    throw new TypeError(label + ' must contain JSON-compatible values')
  }
  if (active.has(value)) throw new TypeError(label + ' must not contain cycles')
  active.add(value)
  for (const item of Array.isArray(value) ? value : Object.values(value)) assertJsonValue(item, label, active)
  active.delete(value)
}
