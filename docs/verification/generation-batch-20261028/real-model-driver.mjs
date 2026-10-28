import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { loadDesktopE2EConfig, startProbe, stopProbe, getProbeStatus } from '../../../tests/desktop/fixtures/official-desktop-probe.mjs'
import { loadOfficialProfilePatchAdapter } from '../../../tests/desktop/fixtures/official-profile-patch.mjs'
import { installOfficialPluginCandidate } from '../../../tests/desktop/fixtures/official-plugin-install.mjs'
import { connectDesktopPage } from '../../../tests/desktop/fixtures/renderer-cdp.mjs'
import { captureProjectClientContext } from '../../../tests/desktop/fixtures/official-client-context.mjs'
import { compareOfficialCandidateFiles, writeOfficialCandidateSourceIdentity } from '../../../tests/desktop/fixtures/official-candidate-identity.mjs'
import { writeOfficialPresetProfilePatch } from '../../../tests/desktop/fixtures/official-preset-overrides.mjs'
import { collectOfficialSessionTrace } from '../../../scripts/verification/collect-session-trace.mjs'

const repositoryDefault = fileURLToPath(new URL('../../../', import.meta.url))
const model = Object.freeze({ provider: 'lan-gpt', model: 'gpt-6.1-terra', reasoningEffort: 'high' })
const json = value => JSON.stringify(value)

async function poll(page, expression, accept, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await page.evaluate(expression)
    if (accept(value)) return value
    await delay(250)
  }
  throw new Error('Official Desktop state did not reach the requested condition before the timeout.')
}

function requireOk(result, operation) {
  if (result?.ok !== true) throw new Error(`${operation} failed: ${json(result?.error ?? result)}`)
  return result.value
}

function entries(rows, id) {
  return rows.flatMap(row => [
    ...(row.id === id ? [row] : []),
    ...(row.group && Array.isArray(row.config) ? entries(row.config, id) : []),
  ])
}

async function boot(driver) {
  const started = await startProbe({ repositoryRoot: driver.repositoryRoot, mode: 'development', config: driver.config, profilePatchAdapter: driver.adapter })
  driver.record = started.record
  driver.runId = started.record.runId
  driver.runs.push({ runId: driver.runId, recordPath: started.recordPath })
  driver.configPath = join(driver.record.directories.evidence, 'real-model-config.json')
  try {
    await writeFile(driver.configPath, json(driver.config) + '\n', { mode: 0o600 })
    driver.page = await connectDesktopPage(driver.record.ports.rendererCdp, { runId: driver.runId, repositoryRoot: driver.repositoryRoot, config: driver.config })
  } catch (error) {
    await stop(driver)
    throw error
  }
  return driver
}

export async function start({ repositoryRoot = repositoryDefault, configPath, sourceAddress, mcpUrl, environmentName = 'generation-batch-real-model' } = {}) {
  repositoryRoot = resolve(repositoryRoot)
  if (!/^[a-z0-9-]+$/u.test(environmentName)) throw new TypeError('environmentName must use lowercase letters, digits, and hyphens.')
  const config = structuredClone(await loadDesktopE2EConfig(configPath ?? join(repositoryRoot, 'config/desktop-e2e.json')))
  config.modes.development.environmentRootRelativePath += '/' + environmentName
  const patches = config.modes.development.initialProfilePatches
  const defaults = patches.find(row => row.id === 'agent-default-model')
  const provider = patches.find(row => row.id === 'llm-pi-ai')?.config.providers?.[model.provider]
  if (!defaults || !provider) throw new Error('Desktop config must declare the LAN provider and default model.')
  defaults.config = { ...defaults.config, ...model }
  provider.reasoning = model.reasoningEffort
  provider.models = [...provider.models.filter(row => row.id !== model.model), {
    ...provider.models[0], id: model.model, reasoningEfforts: { high: 'high' },
  }]
  if (sourceAddress !== undefined) {
    const existing = patches.find(row => row.id === 'harness-comfyui-core')
    const patch = { configurationProfile: 'production', configuration: sourceAddress }
    if (existing) existing.config = { ...existing.config, ...patch }
    else patches.push({ id: 'harness-comfyui-core', config: patch })
  }
  const base = await loadOfficialProfilePatchAdapter(config)
  const adapter = { ...base, async updateProfilePatch(document, update) {
    const rows = await base.updateProfilePatch(document, update)
    for (const patch of patches) {
      const matches = entries(rows, patch.id)
      if (matches.length > 1) throw new Error(`Profile contains duplicate entry ${patch.id}.`)
      if (matches.length === 0) rows.push(structuredClone(patch))
      else matches[0].config = { ...matches[0].config, ...structuredClone(patch.config) }
    }
    return rows
  } }
  return boot({ repositoryRoot, config, adapter, mcpUrl, runs: [], page: null })
}

export async function install(driver, { tarballPath, sourceIdentityPath } = {}) {
  tarballPath = resolve(tarballPath)
  const manifest = JSON.parse(await readFile(join(driver.repositoryRoot, 'package.json'), 'utf8'))
  driver.sourceIdentity = sourceIdentityPath
    ? JSON.parse(await readFile(resolve(sourceIdentityPath), 'utf8'))
    : await writeOfficialCandidateSourceIdentity({ repositoryRoot: driver.repositoryRoot, archivePath: tarballPath,
      identityPath: join(driver.record.directories.evidence, 'source-identity.json'), packageName: manifest.name, packageVersion: manifest.version })
  await driver.page.evaluate(`(() => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find(row => row.textContent?.includes('内测声明'))
    ;[...(dialog?.querySelectorAll('button') ?? [])].find(button => button.textContent?.trim() === '继续')?.click()
  })()`)
  const probeStatus = await getProbeStatus(driver)
  const result = await installOfficialPluginCandidate({ page: driver.page, tarballPath, probeStatus, repositoryRoot: driver.repositoryRoot })
  if (result.status !== 'installed' || result.enabled !== true || result.evidenceComplete !== true) {
    throw new Error(`Official plugin installation did not complete; inspect ${result.evidencePath}.`)
  }
  const installedPackageRoot = join(driver.record.directories.profile, 'node_modules', driver.sourceIdentity.packageName)
  const installed = JSON.parse(await readFile(join(installedPackageRoot, 'package.json'), 'utf8'))
  if (installed.version !== driver.sourceIdentity.packageVersion) throw new Error('Installed plugin version differs from the candidate identity.')
  await compareOfficialCandidateFiles({ sourceIdentity: driver.sourceIdentity, installedPackageRoot })
  const profilePatchPath = join(driver.record.directories.profile, driver.config.paths.profilePatchFilename)
  await stop(driver)
  await writeOfficialPresetProfilePatch({ profilePatchPath, profilePatchAdapter: driver.adapter, installedPackageRoot, mcpUrl: driver.mcpUrl })
  await boot(driver)
  await captureProjectClientContext(driver.page, driver.sourceIdentity, driver.record.directories.evidence, poll)
  const product = JSON.parse(await readFile(join(installedPackageRoot, 'config/product-agent.json'), 'utf8'))
  driver.presetId = product.preset.id
  driver.installation = { ...result, installedPackageRoot, version: installed.version }
  return driver.installation
}

export async function restart(driver) {
  if (!driver.sourceIdentity || !driver.installation || !driver.presetId) throw new Error('Install and identify the candidate before restarting it.')
  const previousRunId = driver.runId
  if (driver.record.state !== 'stopped') await stop(driver)
  await boot(driver)
  await compareOfficialCandidateFiles({ sourceIdentity: driver.sourceIdentity, installedPackageRoot: driver.installation.installedPackageRoot })
  await captureProjectClientContext(driver.page, driver.sourceIdentity, driver.record.directories.evidence, poll)
  return { previousRunId, runId: driver.runId, configPath: driver.configPath,
    presetId: driver.presetId, installedPackageRoot: driver.installation.installedPackageRoot, mcpUrl: driver.mcpUrl }
}

export async function openSession(driver, { workspacePath, workspaceId, sessionId, title } = {}) {
  if (!driver.presetId) throw new Error('Install the candidate before opening a model session.')
  const saved = driver.sessions?.get(sessionId)
  workspacePath = resolve(workspacePath ?? saved?.workspacePath ?? driver.record.directories.workspace)
  if (!sessionId) {
    const workspace = requireOk(await driver.page.evaluate(`window.__runPanelTestContext.get('remote.workspace').create({ path: ${json(workspacePath)} })`), 'Workspace creation')
    workspaceId = workspace.workspace.workspaceId
    const created = requireOk(await driver.page.evaluate(`window.__runPanelTestContext.get('remote.session').create({ workspaceId: ${json(workspaceId)}, agentPreset: ${json(driver.presetId)} })`), 'Session creation')
    sessionId = created.sessionId
  } else {
    workspaceId ??= saved?.workspaceId
    if (typeof workspaceId !== 'string' || !workspaceId) throw new TypeError('Provide the existing Session workspaceId when reopening it.')
  }
  requireOk(await driver.page.evaluate(`window.__runPanelTestContext.get('remote.session').selectModel(${json({ sessionId, provider: model.provider, model: model.model })})`), 'Model selection')
  if (title) requireOk(await driver.page.evaluate(`window.__runPanelTestContext.get('remote.session').rename(${json({ sessionId, title })})`), 'Session rename')
  await driver.page.evaluate(`(() => { window.__runPanelTestContext.get('uiWorkspace').openSession(${json(sessionId)}); return true })()`)
  await poll(driver.page, `window.__runPanelTestContext.get('sessions').retainInfo(${json(sessionId)}).getSnapshot().retainedBy.mainView`, value => value === 1)
  driver.sessionId = sessionId
  driver.sessions ??= new Map()
  const identity = { sessionId, workspaceId, workspacePath, presetId: driver.presetId, ...model }
  driver.sessions.set(sessionId, identity)
  return identity
}

async function waitForNaturalEnd(driver, { sessionId = driver.sessionId, afterSeq, timeoutMs = 900_000 }) {
  // Host API: packages/goal/goal/src/types.ts#GoalView and remote.goals.get.
  const terminal = await poll(driver.page, `(async () => {
    const remote = window.__runPanelTestContext.get('remote.session')
    const projection = await remote.projections(${json({ sessionId })})
    if (!projection.ok) return null
    const history = await remote.page({ address: { kind: 'session', sessionId: ${json(sessionId)} }, throughSeq: projection.value.asOfSeq, maxMessages: 1 })
    const sessions = await remote.list({})
    if (!history.ok || !sessions.ok || !sessions.value.items.some(row => row.sessionId === ${json(sessionId)} && row.running === false)) return null
    const goal = await window.__runPanelTestContext.get('remote.goals').get(${json(sessionId)})
    if (!goal.ok || (goal.value?.phase === 'active' && goal.value?.activation === 'armed')) return null
    return history.value.records.findLast(row => row.event.type === 'turn/end' && row.event.seq > ${json(afterSeq)})?.event ?? null
  })()`, value => value !== null, timeoutMs)
  if (terminal.data.reason.kind !== 'completed') throw Object.assign(new Error(`Session ended with ${terminal.data.reason.kind}.`), { terminal })
  return { sessionId, terminal }
}

export async function resumeGoal(driver, { timeoutMs = 900_000 } = {}) {
  const sessionId = driver.sessionId
  const beforeGoal = requireOk(await driver.page.evaluate(`window.__runPanelTestContext.get('remote.goals').get(${json(sessionId)})`), 'Goal read')
  if (beforeGoal?.phase !== 'paused' && !(beforeGoal?.phase === 'active' && beforeGoal?.activation === 'disarmed')) {
    throw new Error('GoalBar resume requires a paused Goal or an active, disarmed Goal.')
  }
  const projection = requireOk(await driver.page.evaluate(`window.__runPanelTestContext.get('remote.session').projections(${json({ sessionId })})`), 'Session projection')
  const position = await poll(driver.page, `(() => {
    const button = document.querySelector('[data-goal-bar] button[aria-label="Resume goal"], [data-goal-bar] button[aria-label="恢复目标"]')
    if (!button || button.matches(':disabled, [aria-disabled="true"]')) return null
    button.scrollIntoView({ block: 'center', inline: 'center' })
    const rect = button.getBoundingClientRect()
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
    const hit = document.elementFromPoint(x, y)
    return rect.width > 0 && rect.height > 0 && (hit === button || button.contains(hit)) ? { x, y } : null
  })()`, value => value !== null)
  await driver.page.command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...position })
  await driver.page.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...position, button: 'left', clickCount: 1 })
  await driver.page.command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...position, button: 'left', clickCount: 1 })
  const result = await waitForNaturalEnd(driver, { sessionId, afterSeq: projection.asOfSeq, timeoutMs })
  return { ...result, action: 'goal-bar', beforeGoal }
}

export async function submit(driver, { prompt, promptFile, timeoutMs = 900_000 } = {}) {
  if (!driver.sessionId) throw new Error('Open a workbench session before submitting a prompt.')
  if (promptFile !== undefined) prompt = await readFile(resolve(promptFile), 'utf8')
  if (typeof prompt !== 'string' || !prompt.trim()) throw new TypeError('Provide prompt or promptFile.')
  const sessionId = driver.sessionId
  const projection = requireOk(await driver.page.evaluate(`window.__runPanelTestContext.get('remote.session').projections(${json({ sessionId })})`), 'Session projection')
  await poll(driver.page, `(() => {
    const field = [...document.querySelectorAll('textarea, [contenteditable="true"]')].find(element => element.getClientRects().length
      && /描述你想要构建的内容|发消息或创建任务/u.test([element.getAttribute('placeholder'), element.getAttribute('data-placeholder'), element.getAttribute('aria-label')].join(' ')))
    if (!field || field.matches(':disabled, [aria-disabled="true"]')) return false
    field.focus()
    return document.activeElement === field
  })()`, value => value === true)
  await driver.page.command('Input.insertText', { text: prompt })
  await poll(driver.page, `(() => {
    const field = document.activeElement
    return field instanceof HTMLTextAreaElement ? field.value : field?.textContent ?? null
  })()`, value => value === prompt)
  for (const type of ['keyDown', 'keyUp']) await driver.page.command('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
  return waitForNaturalEnd(driver, { sessionId, afterSeq: projection.asOfSeq, timeoutMs })
}

export async function exportSession(driver, { sessionId = driver.sessionId, outputDirectory = join(driver.record.directories.evidence, driver.config.sessionTrace.directoryName, encodeURIComponent(sessionId), String(Date.now())), timeoutMs = 900_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (true) {
    try {
      const result = await collectOfficialSessionTrace({ runId: driver.runId, sessionId, config: driver.config, outputDirectory: resolve(outputDirectory), page: driver.page })
      return { indexPath: result.indexPath, sessions: result.index.sessions.map(row => ({ sessionId: row.sessionId, path: row.path })), missing: result.index.missing }
    } catch (error) {
      if (error.code !== 'SESSION_STILL_RUNNING' || Date.now() >= deadline) throw error
      await delay(250)
    }
  }
}

export async function stop(driver) {
  let pageError
  try { await driver.page?.close() } catch (error) { pageError = error } finally { driver.page = null }
  const stopped = await stopProbe(driver)
  driver.record = stopped.record
  if (stopped.record.result?.portsReleased !== true || stopped.record.state !== 'stopped') throw new Error(`Desktop cleanup remains incomplete; inspect ${stopped.recordPath}.`)
  if (pageError) throw pageError
  return { runId: driver.runId, recordPath: stopped.recordPath, portsReleased: true }
}
