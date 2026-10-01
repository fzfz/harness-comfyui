import { randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import repositorySkillCatalogFixture from '../fixtures/repository-skill-catalog.json' with { type: 'json' }
import officialBusinessFixtureJson from './fixtures/official-business-fixture.json' with { type: 'json' }
import productAgentConfig from '../../config/product-agent.json' with { type: 'json' }
import settingsEntryIds from '../../config/settings-entry-ids.json' with { type: 'json' }
import browserSettings from '../../config/browser-settings.json' with { type: 'json' }
import errorCatalog from '../../config/error-catalog.json' with { type: 'json' }
import lifecycleFixtureJson from './fixtures/official-lifecycle-fixture.json' with { type: 'json' }

import { loadDesktopE2EConfig, startProbe, stopProbe, getProbeStatus } from './fixtures/official-desktop-probe.mjs'
import { loadOfficialProfilePatchAdapter } from './fixtures/official-profile-patch.mjs'
import { installOfficialPluginCandidate } from './fixtures/official-plugin-install.mjs'
import {
  connectDesktopBrowser as connectOfficialDesktopBrowser,
  connectDesktopPage as connectOfficialDesktopPage,
  expectCompletedDownload as expectOfficialCompletedDownload,
} from './fixtures/renderer-cdp.mjs'
import { parseOfficialBusinessFixture } from './fixtures/official-business-schema.mjs'
import { parseOfficialLifecycleFixture } from './fixtures/official-lifecycle-schema.mjs'
import {
  assertOfficialCandidateClientSource,
  compareOfficialCandidateFiles,
  isOfficialCandidateClientScriptUrl,
  readOfficialCandidateClientSourceMap,
} from './fixtures/official-candidate-identity.mjs'
import { parseOfficialCandidateSourceIdentity } from './fixtures/official-candidate-identity-schema.mjs'
import { startOfficialBusinessServices } from './fixtures/official-business-services.mjs'
import { publishSavedDesktopRun } from './fixtures/official-business-media.mjs'
import { trackedStartProbe } from './fixtures/official-command-cancellation.mjs'
import { GenerationRuntime } from '../../src/host/generation/generation-runtime.ts'
import { loadProfile } from '../../src/config/load-profile.ts'

const sourceRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const active = []
const PRODUCT_PRESET_ID = productAgentConfig.preset.id
const PROJECT_PRESET_IDS = [PRODUCT_PRESET_ID, ...productAgentConfig.preset.additionalManagedPresetIds]
const REPOSITORY_SKILL_CATALOG = Object.freeze(repositorySkillCatalogFixture)
const OFFICIAL_BUSINESS_FIXTURE = parseOfficialBusinessFixture(officialBusinessFixtureJson)
const WORKSPACE_COMFYUI_GENERATE_DESCRIPTION = OFFICIAL_BUSINESS_FIXTURE.skills.workspaceDescription
const UNIQUE_WORKSPACE_SKILL_NAME = OFFICIAL_BUSINESS_FIXTURE.skills.uniqueWorkspaceName
const UNIQUE_WORKSPACE_SKILL_DESCRIPTION = OFFICIAL_BUSINESS_FIXTURE.skills.uniqueWorkspaceDescription
const WORKSPACE_SKILL_MARKER = OFFICIAL_BUSINESS_FIXTURE.skills.workspaceMarker
const USER_SKILL_NAME = OFFICIAL_BUSINESS_FIXTURE.skills.userName
const USER_SKILL_DESCRIPTION = OFFICIAL_BUSINESS_FIXTURE.skills.userDescription
const USER_SKILL_MARKER = OFFICIAL_BUSINESS_FIXTURE.skills.userMarker
const HOST_BUNDLED_SKILL_NAMES = new Set(['office-docx', 'office-pptx', 'office-xlsx'])
const DURABLE_BUSINESS_EVIDENCE_FILES = [
  'startup-ready.json',
  'stop-request.json',
  'stop-result.json',
  'official-plugin-install.json',
  'plugins-page.png',
  'install-dialog.png',
  'install-result.png',
  'enabled-bundle.png',
  'official-business-preset-skill-paths.json',
  'official-business-workspace-boundary.json',
  'official-business-skill-markers.json',
  'official-business-skill-markers.png',
  'official-business-controlled-generation.json',
  'official-business-controlled-generation.png',
  'official-business-generation-after-restart.json',
  'official-business-generation-after-restart.png',
  ...Object.values(OFFICIAL_BUSINESS_FIXTURE.browserEvidenceFiles),
  'official-business-result.json',
  'official-business-failure.json',
  'official-business-failure.png',
  'official-business-install-failure.json',
]

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

function isPathWithin(path, root) {
  const fromRoot = relative(resolve(root), resolve(path))
  return fromRoot === '' || (fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !fromRoot.startsWith(sep))
}

function classifySkillSource(skill, configuredRoots) {
  const candidatePath = Object.values(skill.pathFields).find(value => typeof value === 'string')
  if (candidatePath !== undefined) {
    if (isPathWithin(candidatePath, configuredRoots.installedPluginSkills)) return 'installed-project'
    if (isPathWithin(candidatePath, configuredRoots.workspaceSkills)) return 'workspace'
    if (isPathWithin(candidatePath, configuredRoots.userSkills)) return 'user'
    return 'other-path'
  }
  if (HOST_BUNDLED_SKILL_NAMES.has(skill.name)) return 'host-bundled'
  return 'unclassified'
}

async function readOfficialProfilePatch(dshHome, desktopConfig, profileYamlAdapter) {
  const profilePatchPath = join(
    dshHome,
    desktopConfig.paths.profileRelativePath,
    desktopConfig.paths.profilePatchFilename,
  )
  return profileYamlAdapter.parse(await readFile(profilePatchPath, 'utf8'))
}

async function persistOfficialBusinessEvidence(fixture) {
  await mkdir(fixture.auditDirectory, { recursive: true, mode: 0o700 })
  const runs = []
  for (const run of fixture.runs) {
    if (run.record === undefined) continue
    const durableRunDirectory = join(fixture.auditDirectory, run.runId)
    await mkdir(durableRunDirectory, { recursive: true, mode: 0o700 })
    const runRecordPath = join(
      fixture.repositoryRoot,
      run.config.paths.runRootRelativePath,
      run.runId,
      run.config.paths.runRecordFilename,
    )
    const runRecordContents = await readFile(runRecordPath)
    await writeFile(join(durableRunDirectory, 'run.json'), runRecordContents, { mode: 0o600 })
    const copiedEvidence = []
    for (const filename of DURABLE_BUSINESS_EVIDENCE_FILES) {
      const sourcePath = join(run.record.directories.evidence, filename)
      let contents
      try {
        contents = await readFile(sourcePath)
      } catch (error) {
        if (error?.code === 'ENOENT') continue
        throw error
      }
      await writeFile(join(durableRunDirectory, filename), contents, { mode: 0o600 })
      copiedEvidence.push(filename)
    }
    runs.push({
      runId: run.runId,
      state: JSON.parse(runRecordContents.toString('utf8')).state,
      externalRunRecordPath: runRecordPath,
      externalEvidenceDirectory: run.record.directories.evidence,
      durableRunDirectory,
      copiedEvidence,
    })
  }
  await writeFile(join(fixture.auditDirectory, 'official-business-audit.json'), JSON.stringify({
    schemaVersion: 1,
    classification: 'automated-regression',
    acceptanceClaim: false,
    sourceRepositoryRoot: fixture.sourceRepositoryRoot,
    fixtureRepositoryRoot: fixture.repositoryRoot,
    fixtureEnvironmentRoot: fixture.environmentRoot,
    durableAuditDirectory: fixture.auditDirectory,
    legacyDesktopContextImported: false,
    runs,
  }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
}

afterEach(async () => {
  const cleanupErrors = []
  for (const fixture of active.splice(0).reverse()) {
    for (const run of [...(fixture.runs ?? [])].reverse()) {
      if (!run.active) continue
      try {
        const stopped = await stopProbe({ runId: run.runId, repositoryRoot: fixture.repositoryRoot, config: run.config })
        run.active = false
        expect(stopped.record.state).toBe('stopped')
        expect(stopped.record.result.portsReleased).toBe(true)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    try {
      await fixture.close?.()
    } catch (error) {
      cleanupErrors.push(error)
    }
    try {
      await persistOfficialBusinessEvidence(fixture)
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Official Desktop E2E cleanup failed')
})

async function startModelRequestCaptureServer() {
  const services = await startOfficialBusinessServices(OFFICIAL_BUSINESS_FIXTURE)
  return {
    origin: services.origin,
    baseURL: services.baseURL,
    get requests() { return services.requests },
    get requestLog() { return services.requestLog },
    get comfyRequests() { return services.comfyRequests },
    get frontendEvents() { return services.frontendEvents },
    get skillToolCalls() { return services.skillToolCalls },
    get promptSubmission() { return services.promptSubmission },
    get controlledPngByteLength() { return services.controlledPngByteLength },
    get historyRequestCount() { return services.historyRequestCount },
    async request(timeoutMs = 10_000) { return services.nextRequest(timeoutMs) },
    async requestWhere(predicate, timeoutMs = 10_000) { return services.nextRequestWhere(predicate, timeoutMs) },
    async readHistory(promptId) { return services.readHistory(promptId) },
    async close() { return services.close() },
  }
}

async function desktopPageTargetCount(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  if (!response.ok) throw new Error(`Desktop debugger target list failed with ${response.status}`)
  return (await response.json()).filter(target => target.type === 'page').length
}

async function waitForValue(page, expression, accept, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  let value
  while (Date.now() < deadline) {
    try {
      value = await page.evaluate(expression)
    } catch {
      await delay(100)
      continue
    }
    if (accept(value)) return value
    await delay(100)
  }
  throw new Error(`timed out waiting for Desktop page state: ${expression}; last value was ${JSON.stringify(value)}`)
}

async function clickMainFrameElement(page, selector) {
  const deadline = Date.now() + 3_000
  let state
  do {
    const result = await page.command('Runtime.evaluate', {
      expression: `(() => {
        const element = document.querySelector(${JSON.stringify(selector)})
        if (!(element instanceof HTMLElement)) return { found: false, clicked: false }
        element.scrollIntoView({ block: 'center', inline: 'center' })
        const visible = element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        const disabled = element.matches(':disabled, [aria-disabled="true"]')
        const bounds = element.getBoundingClientRect()
        const x = bounds.left + bounds.width / 2
        const y = bounds.top + bounds.height / 2
        const inViewport = bounds.width > 0 && bounds.height > 0
          && x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight
        const hit = inViewport ? document.elementFromPoint(x, y) : null
        const hitTarget = hit ? {
          tag: hit.tagName,
          ariaLabel: hit.getAttribute('aria-label'),
          className: typeof hit.className === 'string' ? hit.className : null,
        } : null
        const state = {
          found: true, visible, disabled,
          bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
          inViewport, hit: hit === element || element.contains(hit), hitTarget,
          visibilityChecks: {
            default: element.checkVisibility(),
            opacity: element.checkVisibility({ checkOpacity: true }),
            opacityAndCSS: visible,
          },
          styleChain: (() => {
            const chain = []
            for (let node = element; node instanceof HTMLElement; node = node.parentElement) {
              const style = getComputedStyle(node)
              chain.push({
                tag: node.tagName,
                className: typeof node.className === 'string' ? node.className : null,
                opacity: style.opacity,
                visibility: style.visibility,
                display: style.display,
                animations: node.getAnimations({ subtree: false }).map(animation => ({
                  currentTime: animation.currentTime,
                  playState: animation.playState,
                })),
              })
            }
            return chain
          })(),
          clicked: false,
        }
        if (visible && !disabled && inViewport && state.hit) {
          element.click()
          state.clicked = true
        }
        return state
      })()`,
      returnByValue: true,
      userGesture: true,
    })
    state = result.exceptionDetails === undefined
      ? result.result.value
      : { exception: result.exceptionDetails.text ?? 'Runtime.evaluate failed' }
    if (state?.clicked === true) return
    await delay(100)
  } while (Date.now() < deadline)
  throw new Error(`Desktop element click failed: ${selector}; last state: ${JSON.stringify(state)}`)
}

async function openPluginSettings(page) {
  await clickMainFrameElement(page, 'button[aria-label="插件"]')
  await waitForValue(page, `document.querySelector('button[aria-label="查看 harness-comfyui"]') !== null`, value => value === true)
  await clickMainFrameElement(page, 'button[aria-label="查看 harness-comfyui"]')
  await waitForValue(page, `document.querySelector('.harness-comfyui-settings') !== null`, value => value === true)
}

async function closePluginSettings(page) {
  await clickMainFrameElement(page, 'button[aria-label="返回插件列表"]')
  await waitForValue(page, `document.querySelector('.harness-comfyui-settings') === null`, value => value === true)
}

async function openBusinessSession(page, sessionId) {
  await page.evaluate(`(() => {
    window.__runPanelTestContext.get('uiWorkspace').openSession(${JSON.stringify(sessionId)})
    return true
  })()`)
  await waitForValue(page, `window.__runPanelTestContext.get('sessions')
    .retainInfo(${JSON.stringify(sessionId)}).getSnapshot().retainedBy.mainView`, value => value === 1)
}

async function verifyWorkflowBrowserSettings(page, context, desktopConfig, profileAdapter, expectedPath) {
  await openPluginSettings(page)
  await waitForValue(page, `(() => {
    const tab = document.getElementById(${JSON.stringify(browserSettings.ui.tabId)})
    tab?.click()
    return tab?.getAttribute('aria-selected') === 'true'
  })()`, value => value === true)
  const inputSelector = `#${browserSettings.ui.panelId} input[name="${browserSettings.ui.inputName}"]`
  const stateExpression = `(() => {
    const panel = document.getElementById(${JSON.stringify(browserSettings.ui.panelId)})
    const input = document.querySelector(${JSON.stringify(inputSelector)})
    return input ? { path: input.value, disabled: input.disabled,
      alerts: [...panel.querySelectorAll('[role="alert"]')].map(node => node.textContent),
      status: [...panel.querySelectorAll('[role="status"]')].map(node => node.textContent) } : null
  })()`
  const initial = await waitForValue(page, stateExpression,
    value => value !== null && !value.disabled && isAbsolute(value.path))
  const savedPath = expectedPath ?? initial.path
  if (expectedPath === undefined) {
    const setPath = async path => {
      expect(await page.evaluate(`(() => {
        const input = document.querySelector(${JSON.stringify(inputSelector)})
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(path)})
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)).toBe(true)
      await waitForValue(page, stateExpression, value => value?.path === path)
    }
    const save = async () => {
      await waitForValue(page, `(() => {
        const panel = document.getElementById(${JSON.stringify(browserSettings.ui.panelId)})
        const button = [...panel.querySelectorAll('button')]
          .find(node => node.textContent?.trim() === ${JSON.stringify(browserSettings.ui.saveButton)})
        if (!button || button.disabled) return false
        button.click()
        return true
      })()`, value => value === true)
    }
    const missingPath = join(context.dshHome, 'missing-workflow-browser')
    await setPath(missingPath)
    await save()
    const rejected = await waitForValue(page, stateExpression,
      value => value?.alerts.some(text => text.includes(errorCatalog.BROWSER_EXECUTABLE_PATH_UNAVAILABLE.reason)))
    expect(rejected.path).toBe(missingPath)
    expect(rejected.alerts.join('\n')).toContain(missingPath)
    expect(rejected.alerts.join('\n')).toContain(errorCatalog.BROWSER_EXECUTABLE_PATH_UNAVAILABLE.next_step)
    await setPath(savedPath)
    await save()
    await waitForValue(page, stateExpression,
      value => value?.status.includes(browserSettings.ui.savedMessage))
    const screenshot = await page.command('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(context.businessEvidenceDirectory, OFFICIAL_BUSINESS_FIXTURE.browserEvidenceFiles.screenshot),
      Buffer.from(screenshot.data, 'base64'), { mode: 0o600 })
  } else {
    expect(initial.path).toBe(expectedPath)
  }
  const patch = await readOfficialProfilePatch(context.dshHome, desktopConfig, profileAdapter)
  expect(findProfileEntry(patch, settingsEntryIds.core)?.config?.[browserSettings.fieldName]).toBe(savedPath)
  const evidence = { classification: 'automated-regression', browserExecutablePath: savedPath,
    invalidPathDraftPreserved: expectedPath === undefined, verifiedAfterRestart: expectedPath !== undefined }
  const filename = expectedPath === undefined ? OFFICIAL_BUSINESS_FIXTURE.browserEvidenceFiles.saved
    : OFFICIAL_BUSINESS_FIXTURE.browserEvidenceFiles.restarted
  await writeFile(join(context.businessEvidenceDirectory, filename), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 })
  await closePluginSettings(page)
  return savedPath
}

async function setImageReaderField(page, label, value) {
  const changed = await page.evaluate(`(() => {
    const section = document.querySelector('.harness-comfyui-image-reader-settings')
    const field = [...(section?.querySelectorAll('label') ?? [])]
      .find(candidate => candidate.querySelector(':scope > span')?.textContent?.trim() === ${JSON.stringify(label)})
    const control = field?.querySelector('input:not([type="radio"]), textarea, select')
    if (!(control instanceof HTMLInputElement)
      && !(control instanceof HTMLTextAreaElement)
      && !(control instanceof HTMLSelectElement)) return false
    const prototype = control instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLSelectElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    setter?.call(control, ${JSON.stringify(value)})
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    return true
  })()`)
  if (!changed) throw new Error(`Image reader field is unavailable: ${label}`)
}

async function clickImageReaderButton(page, label) {
  const clicked = await page.evaluate(`(() => {
    const section = document.querySelector('.harness-comfyui-image-reader-settings')
    const button = [...(section?.querySelectorAll('button') ?? [])]
      .find(candidate => {
        const text = candidate.textContent?.trim() ?? ''
        if (text === ${JSON.stringify(label)}) return true
        if (${JSON.stringify(label)} === '保存当前配置') return text.startsWith('保存配置“')
        if (${JSON.stringify(label)} === '保存当前修改并切换') return text.startsWith('保存配置“') && text.includes('并切换到配置')
        if (${JSON.stringify(label)} === '放弃当前修改并切换') return text.startsWith('放弃配置“') && text.includes('并切换到配置')
        if (${JSON.stringify(label)} === '继续编辑当前配置') return text.startsWith('继续编辑配置“')
        return false
      })
    button?.click()
    return button !== undefined
  })()`)
  if (!clicked) throw new Error(`Image reader button is unavailable: ${label}`)
}

async function selectImageReaderConnection(page, label) {
  const selected = await page.evaluate(`(() => {
    const section = document.querySelector('.harness-comfyui-image-reader-settings')
    const option = [...(section?.querySelectorAll('label') ?? [])]
      .find(candidate => candidate.textContent?.includes(${JSON.stringify(label)}))
    const input = option?.querySelector('input[type="radio"]')
    input?.click()
    return input !== undefined
  })()`)
  if (!selected) throw new Error(`Image reader connection is unavailable: ${label}`)
}

async function selectImageReaderProfile(page, profileId) {
  const selected = await page.evaluate(`(() => {
    const section = document.querySelector('.harness-comfyui-image-reader-settings')
    const field = [...(section?.querySelectorAll('label') ?? [])]
      .find(candidate => candidate.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
    const select = field?.querySelector('select')
    if (!(select instanceof HTMLSelectElement)) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    setter?.call(select, ${JSON.stringify(profileId)})
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  if (!selected) throw new Error(`Image reader profile is unavailable: ${profileId}`)
}

async function seedOfficialBusinessSessions(page, workspacePath) {
  const sessions = OFFICIAL_BUSINESS_FIXTURE.sessions
  const result = await page.evaluate(`new Promise((resolve, reject) => {
    ;(async () => {
      try {
        const workspaceRemote = window.__runPanelTestContext.get('remote.workspace')
        const sessionRemote = window.__runPanelTestContext.get('remote.session')
        const workspace = await workspaceRemote.create({ path: ${JSON.stringify(workspacePath)} })
        if (!workspace.ok) { resolve({ workspace, created: [] }); return }
        const workspaceId = workspace.value.workspace.workspaceId
        const entries = ${JSON.stringify([
          { title: sessions.primaryTitle },
          { title: sessions.switchTitle },
        ])}
        const created = []
        for (const entry of entries) {
          const session = await sessionRemote.create({
            workspaceId,
            agentPreset: 'harness-comfyui-cli-candidate'
          })
          if (!session.ok) {
            created.push({ entry, session, sessionId: null, renamed: null })
            continue
          }
          const sessionId = session.value.sessionId
          const renamed = await sessionRemote.rename({ sessionId, title: entry.title })
          created.push({ entry, session, renamed, sessionId })
        }
        resolve({ workspace, created })
      } catch (error) { reject(error) }
    })()
  })`)
  expect(result.workspace).toEqual(expect.objectContaining({ ok: true }))
  expect(result.created).toHaveLength(2)
  for (const entry of result.created) {
    expect(entry.session).toEqual(expect.objectContaining({ ok: true }))
    expect(entry.sessionId).toEqual(expect.any(String))
    expect(entry.renamed).toEqual(expect.objectContaining({ ok: true }))
  }
  return {
    workspaceId: result.workspace.value.workspace.workspaceId,
    sessionId: result.created[0].sessionId,
    switchSessionId: result.created[1].sessionId,
  }
}

function createOfficialBusinessConfig(baseConfig, fixtureId, environmentFilePath, workspacePath, sourcePort, customProviders) {
  const config = structuredClone(baseConfig)
  const fixtureRelativePath = `.local/desktop-e2e/${fixtureId}`
  config.modes.development.environmentRootRelativePath = `${fixtureRelativePath}/official-environment`
  config.modes.development.environmentFilePath = environmentFilePath
  config.modes.development.credentialEnvironmentNames = [
    OFFICIAL_BUSINESS_FIXTURE.provider.apiKeyEnvironmentName,
  ]
  config.modes.development.requiredEnvironmentNames = [...config.modes.development.credentialEnvironmentNames]
  config.modes.development.initialProfilePatches = [
    {
      id: 'agent-default-model',
      config: {
        provider: OFFICIAL_BUSINESS_FIXTURE.provider.id,
        model: OFFICIAL_BUSINESS_FIXTURE.provider.modelId,
      },
    },
    {
      id: 'llm-pi-ai',
      config: { providers: customProviders },
    },
    {
      id: settingsEntryIds.imageReader,
      config: { imageReaderDefaultModel: OFFICIAL_BUSINESS_FIXTURE.imageReader.defaultModel },
    },
    {
      id: 'harness-comfyui-core',
      config: {
        configurationProfile: 'production',
        startupWorkspacePath: workspacePath,
        configuration: { url: 'http://127.0.0.1', port: sourcePort },
      },
    },
  ]
  return config
}

async function startOfficialBusinessDesktop({ repositoryRoot, runId, config, homeDirectory, agentsHome }) {
  return trackedStartProbe({
    repositoryRoot,
    runId,
    mode: 'development',
    config,
    profilePatchAdapter: await loadOfficialProfilePatchAdapter(config),
    spawnProcess(executable, args, options) {
      return spawn(executable, args, {
        ...options,
        env: { ...options.env, HOME: homeDirectory, DSH_AGENTS_HOME: agentsHome },
      })
    },
  }, { startProbe })
}

async function seedDesktopMedia(context, identity, stagedRunRepositoryFile) {
  const olderGifBytes = Uint8Array.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
    0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
    0x44, 0x01, 0x00, 0x3b,
  ])
  const newerGifBytes = Uint8Array.from(olderGifBytes)
  newerGifBytes.set([0xff, 0x00, 0x00, 0x00, 0xff, 0x00], 13)
  const older = {
    runId: 'run_desktop_media_older', promptId: '0193f85c-86fb-4ad9-8d2b-28cf39e8b041',
    mediaId: 'media_desktop_older', filename: 'desktop-older.gif',
  }
  const newer = {
    runId: 'run_desktop_media_newer', promptId: '0193f85c-86fb-4ad9-8d2b-28cf39e8b042',
    mediaId: 'media_desktop_newer', filename: 'desktop-newer.gif',
  }
  const runIds = [older.runId, newer.runId]
  const promptIds = [older.promptId, newer.promptId]
  const mediaIds = [older.mediaId, newer.mediaId]
  let currentTime = 1_700_000_000_000
  const runtime = new GenerationRuntime({
    runRepositoryFile: stagedRunRepositoryFile,
    runDirectory: context.paths.runDirectory,
    savedMediaDirectory: context.paths.savedMediaDirectory,
    preparer: {
      async prepare() {
        return {
          instanceId: 'desktop-test-instance',
          instanceTitle: 'Desktop Test ComfyUI',
          templateTitle: 'Desktop Test Workflow',
          sourceSnapshot: { template_id: 'desktop-test-template' },
          actualWorkflow: { version: 0.4, marker: 'desktop media modal' },
          apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } },
          expectedOutputNodeIds: ['3'],
          connection: { url: 'http://127.0.0.1:9', origin: 'http://127.0.0.1:9', authorization: null },
        }
      },
    },
    transport: {
      async submit(input) {
        if (!input.onRequestStart()) throw new Error('Desktop test Generation submission was not accepted')
        return { promptId: input.promptId }
      },
      async observe(input) {
        return {
          status: 'success',
          outputs: [{
            nodeId: '3', outputIndex: 0, mediaKind: 'image',
            filename: input.promptId === newer.promptId ? newer.filename : older.filename,
            subfolder: '', type: 'output',
          }],
        }
      },
      async download(input) {
        return {
          bytes: input.output.filename === newer.filename ? newerGifBytes : olderGifBytes,
          mediaType: 'image/gif',
        }
      },
    },
    createRunId: () => runIds.shift(),
    createPromptId: () => promptIds.shift(),
    createMediaId: () => mediaIds.shift(),
    now: () => currentTime,
  })
  try {
    await runtime.acceptGeneration(
      { ...identity, turn: 1, callId: 'call_desktop_media_older' },
      {
        title: 'Desktop older media modal',
        instanceId: 'desktop-test-instance',
        templateId: 'desktop-test-template',
        model: null,
        parameters: { positive_prompt: 'desktop older media modal' },
        loras: [],
      },
    )
    for (let step = 0; step < 4; step += 1) await runtime.advance()
    currentTime += 1_000
    await runtime.acceptGeneration(
      { ...identity, turn: 1, callId: 'call_desktop_media_newer' },
      {
        title: 'Desktop newer media modal',
        instanceId: 'desktop-test-instance',
        templateId: 'desktop-test-template',
        model: null,
        parameters: { positive_prompt: 'desktop newer media modal' },
        loras: [],
      },
    )
    for (let step = 0; step < 4; step += 1) await runtime.advance()
  } finally {
    runtime.close()
  }
  return { newer, older, newerGifBytes, olderGifBytes }
}

// Capture the plugin's normal Context without replacing its components or services.
async function captureProjectClientContext(page, sourceIdentity, evidenceDirectory) {
  await waitForValue(page,
    'document.readyState === "complete" && document.body.innerText.replace(/\\s+/gu, "").includes("ComfyUI工作台")',
    value => value === true)
  await page.command('Page.enable')
  await page.command('Debugger.enable')
  const parsedScriptPromise = page.waitForDebuggerScript(
    params => isOfficialCandidateClientScriptUrl(params.url, sourceIdentity), 30_000,
  )
  const { identifier } = await page.command('Page.addScriptToEvaluateOnNewDocument', { source: `
    let loader
    Object.defineProperty(window, '__ModuleLoader__', {
      configurable: true,
      get: () => loader,
      set: value => {
        loader = value
        const wrap = load => definition => {
          if (definition.id !== 'harness-comfyui') return load.call(loader, definition)
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
        Object.defineProperty(loader, 'load', {
          configurable: true,
          get: () => load,
          set: value => { load = wrap(value) },
        })
      },
    })
  ` })
  await page.command('Page.reload')
  await waitForValue(page, 'window.__runPanelTestContext !== undefined', value => value === true, 10_000)
  const parsedScript = await parsedScriptPromise
  const scriptSource = await page.command('Debugger.getScriptSource', { scriptId: parsedScript.scriptId })
  const sourceMapText = await readOfficialCandidateClientSourceMap({
    page,
    sourceIdentity,
    scriptUrl: parsedScript.url,
    sourceMapUrl: parsedScript.sourceMapURL,
  })
  const loadedClientSource = await assertOfficialCandidateClientSource({
    sourceIdentity,
    scriptId: parsedScript.scriptId,
    scriptUrl: parsedScript.url,
    sourceMapUrl: parsedScript.sourceMapURL,
    scriptSource: scriptSource.scriptSource,
    sourceMapText,
    evidenceDirectory,
  })
  return { identifier, loadedClientSource }
}

async function verifyContextDialog(page, context) {
  const viewport = await page.evaluate(`({ width: window.innerWidth, height: window.innerHeight, deviceScaleFactor: window.devicePixelRatio, mobile: false })`)
  await page.evaluate(`([...document.querySelectorAll('.harness-comfyui-dock-actions button')].find(b => b.textContent.trim() === '插入上下文').click(), true)`)
  await waitForValue(page, `document.querySelectorAll('.harness-comfyui-catalog-card').length`, count => count === 8)
  const cards = await page.evaluate(`(() => {
    const grid = document.querySelector('.harness-comfyui-catalog-items')
    const img = grid.querySelector('img')
    return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, fit: getComputedStyle(img).objectFit, base: document.querySelector('.harness-comfyui-base-model-row button').textContent.trim() }
  })()`)
  expect(cards).toEqual({ columns: 2, fit: 'contain', base: '全部底模' })
  await page.evaluate(`(document.querySelector('.harness-comfyui-catalog-modal-content').scrollTop = 200, true)`)
  const listScroll = await page.evaluate(`document.querySelector('.harness-comfyui-catalog-modal-content').scrollTop`)
  expect(listScroll).toBeGreaterThan(0)
  await page.evaluate(`(document.querySelector('.harness-comfyui-card-select').click(), document.querySelector('[aria-label="详情 Catalog template 1"]').click(), true)`)
  await waitForValue(page, `document.querySelector('.harness-comfyui-catalog-detail dl')?.textContent`, text => text?.includes('Catalog template 1'))
  expect(await page.evaluate(`document.querySelector('.harness-comfyui-catalog-detail').textContent.includes('workflow_json')`)).toBe(false)
  await page.evaluate(`(document.querySelector('.harness-comfyui-catalog-detail').scrollTop = 100, true)`)
  const detailScroll = await page.evaluate(`document.querySelector('.harness-comfyui-catalog-detail').scrollTop`)
  expect(detailScroll).toBeGreaterThan(0)
  expect(await page.evaluate(`document.querySelector('.harness-comfyui-detail-modal-content').scrollTop`)).toBe(0)
  await page.evaluate(`(document.querySelector('.harness-comfyui-detail-preview').click(), true)`)
  await page.command('Emulation.setDeviceMetricsOverride', { width: 700, height: 500, deviceScaleFactor: 1, mobile: false })
  for (const imageIndex of [0, 1, 2]) {
    await waitForValue(page, `(() => { const image = document.querySelector('.harness-comfyui-gallery-current img'); return !!image?.complete && image.naturalWidth > 0 })()`, ready => ready === true)
    expect(await page.evaluate(`(() => {
      const image = document.querySelector('.harness-comfyui-gallery-current img')
      const stage = image.parentElement
      const a = image.getBoundingClientRect(), b = stage.getBoundingClientRect()
      return getComputedStyle(image).objectFit === 'contain' && a.width <= b.width && a.height <= b.height && stage.scrollWidth === stage.clientWidth && stage.scrollHeight === stage.clientHeight
    })()`)).toBe(true)
    if (imageIndex < 2) await page.evaluate(`(document.querySelector('[aria-label="下一张图片"]').click(), true)`)
  }
  const screenshot = await page.command('Page.captureScreenshot', { format: 'png' })
  await writeFile(resolve(context.businessEvidenceDirectory, 'context-dialog-gallery.png'), Buffer.from(screenshot.data, 'base64'))
  await page.command('Emulation.setDeviceMetricsOverride', viewport)
  await waitForValue(page, `window.innerWidth`, width => width === viewport.width)
  await page.evaluate(`(document.querySelector('[role="dialog"] button[aria-label="返回详情"]').click(), true)`)
  await waitForValue(page, `document.querySelector('[role="dialog"]')?.getAttribute('aria-label')`, title => title === '详情：Catalog template 1')
  expect(await page.evaluate(`document.querySelector('.harness-comfyui-catalog-detail').scrollTop`)).toBe(detailScroll)
  await page.evaluate(`([...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === '返回资源列表').click(), true)`)
  await waitForValue(page, `document.activeElement?.getAttribute('aria-label')`, label => label === '详情 Catalog template 1')
  expect(await page.evaluate(`document.querySelector('.harness-comfyui-catalog-modal-content').scrollTop`)).toBe(listScroll)
  expect(await page.evaluate(`document.querySelector('.harness-comfyui-card-select').getAttribute('aria-pressed')`)).toBe('true')
  await page.evaluate(`([...document.querySelectorAll('.harness-comfyui-catalog-pagination button')].find(b => b.textContent.trim() === '下一页').click(), true)`)
  await waitForValue(page, `document.querySelectorAll('.harness-comfyui-catalog-card').length`, count => count === 1)
  await page.evaluate(`([...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === '取消').click(), true)`)
  await waitForValue(page, `document.querySelector('.harness-comfyui-catalog-modal') === null`, closed => closed === true)
}

async function verifyKimiPptDisabled(page, sessionId) {
  const state = await page.evaluate(`(async () => {
    const ctx = window.__runPanelTestContext
    const slotNames = [
      'conversation.hero.modeActions',
      'conversation.input.accessory',
      'conversation.composer.dock'
    ]
    const hostState = { skills: await ctx.get('remote.skills').list({ sessionId: ${JSON.stringify(sessionId)} }) }
    return {
      slots: Object.fromEntries(slotNames.map(name => [
        name,
        ctx.slots.entries(name).map(entry => entry.options.id ?? entry.options.key ?? null)
      ])),
      pptButtons: [...document.querySelectorAll('button')]
        .filter(button => button.textContent?.trim() === 'PPT').length,
      skills: hostState.skills
    }
  })()`)

  expect(Object.keys(state.slots)).toEqual([
    'conversation.hero.modeActions',
    'conversation.input.accessory',
    'conversation.composer.dock',
  ])
  for (const contributionIds of Object.values(state.slots)) {
    expect(contributionIds).not.toContain('kimi-ppt')
  }
  expect(state.pptButtons).toBe(0)
  expect(state.skills.ok).toBe(true)
  expect(state.skills.value.skills.map(skill => skill.name)).not.toContain('kimi-ppt')

}

async function verifyPresetScopedRepositorySkills(page, workspaceId, {
  evidenceDirectory,
  workspacePath,
  agentsHome,
  installedPluginSkillDirectory,
}) {
  const expectedRepositorySkills = structuredClone(REPOSITORY_SKILL_CATALOG)
  const state = await page.evaluate(`new Promise((resolve, reject) => {
    window.__runPanelTestContext.inject(
      ['remote.agentPresets', 'remote.session', 'remote.skills', 'remote.commands'],
      async injected => {
        try {
          const roster = await injected.remote.agentPresets.list()
          if (!roster.ok) {
            resolve({ roster })
            return
          }
          const productPresetId = ${JSON.stringify(PRODUCT_PRESET_ID)}
          const cases = [
            { key: 'implicit-default' },
            ...roster.value.presets
              .filter(preset => preset.id !== productPresetId)
              .map(preset => ({ key: preset.id, agentPreset: preset.id })),
            { key: productPresetId, agentPreset: productPresetId }
          ]
          const sessions = []
          for (const entry of cases) {
            const request = {
              workspaceId: ${JSON.stringify(workspaceId)},
              ...(entry.agentPreset === undefined ? {} : { agentPreset: entry.agentPreset })
            }
            const created = await injected.remote.session.create(request)
            const sessionId = created.ok ? created.value.sessionId : null
            const skills = created.ok
              ? await injected.remote.skills.list({ sessionId })
              : null
            const commands = created.ok
              ? await injected.remote.commands.list(sessionId)
              : null
            const goal = commands?.ok && commands.value.some(command => command.name === 'goal')
              ? await injected.remote.commands.execute(sessionId, '/goal', [])
              : null
            sessions.push({ ...entry, sessionId, created, skills, commands, goal })
          }
          resolve({ roster, sessions })
        } catch (error) {
          reject(error)
        }
      }
    )
  })`)

  const pathFields = skill => Object.fromEntries(Object.entries(skill)
    .filter(([key, value]) => typeof value === 'string' && /(?:path|directory|root|dir)/iu.test(key)))
  const configuredRoots = {
    workspace: workspacePath,
    workspaceSkills: join(workspacePath, '.agents', 'skills'),
    userHome: agentsHome,
    userSkills: join(agentsHome, 'skills'),
    installedPluginSkills: installedPluginSkillDirectory,
  }
  const diagnostic = {
    schemaVersion: 1,
    classification: 'automated-regression',
    acceptanceClaim: false,
    configuredRoots,
    presets: (state.sessions ?? []).map(session => ({
      id: session.agentPreset ?? state.roster?.value?.presets?.find(preset => preset.isDefault)?.id ?? null,
      skillCount: session.skills?.value?.skills?.length ?? 0,
      skillSources: Object.fromEntries(['installed-project', 'workspace', 'user', 'host-bundled', 'other-path', 'unclassified']
        .map(source => [source, (session.skills?.value?.skills ?? []).filter(skill => classifySkillSource({
          name: skill.name,
          pathFields: pathFields(skill),
        }, configuredRoots) === source).length])),
      skillFields: (session.skills?.value?.skills ?? []).map(skill => {
        const classified = { name: skill.name, pathFields: pathFields(skill) }
        return {
          name: skill.name,
          fields: Object.keys(skill).sort(),
          pathFields: classified.pathFields,
          sourceCategory: classifySkillSource(classified, configuredRoots),
        }
      }),
    })),
  }
  await writeFile(join(evidenceDirectory, 'official-business-preset-skill-paths.json'),
    `${JSON.stringify(diagnostic, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })

  expect(state.roster).toEqual(expect.objectContaining({ ok: true }))
  const presetIds = state.roster.value.presets.map(preset => preset.id)
  expect(presetIds).toContain('standard')
  for (const presetId of PROJECT_PRESET_IDS) expect(presetIds).toContain(presetId)
  const defaultPresetId = state.roster.value.presets.find(preset => preset.isDefault)?.id
  expect(defaultPresetId).toBe('standard')
  const sessions = new Map(state.sessions.map(session => [session.key, session]))
  for (const session of state.sessions) {
    expect(session.created).toEqual(expect.objectContaining({ ok: true }))
    expect(session.skills).toEqual(expect.objectContaining({ ok: true }))
  }
  const iterationSession = sessions.get('harness-comfyui-iteration')
  expect(iterationSession.commands).toEqual(expect.objectContaining({ ok: true }))
  expect(iterationSession.commands.value).toContainEqual(expect.objectContaining({ name: 'goal' }))
  expect(iterationSession.goal).toEqual(expect.objectContaining({
    ok: true,
    value: expect.objectContaining({
      result: expect.objectContaining({ kind: 'success', text: expect.stringContaining('No goal is currently set.') }),
    }),
  }))
  expect(sessions.get('implicit-default').created.value.agentPreset).toBe(defaultPresetId)
  expect(sessions.get(PRODUCT_PRESET_ID).created.value.agentPreset).toBe(PRODUCT_PRESET_ID)

  const expectedProductSkills = [...expectedRepositorySkills]
    .sort((left, right) => left.name.localeCompare(right.name))
  expect(expectedProductSkills).toHaveLength(8)
  for (const presetId of PROJECT_PRESET_IDS) {
    expect(sessions.get(presetId).created.value.agentPreset).toBe(presetId)
    const productSkills = sessions.get(presetId).skills.value.skills
      .map(({ name, description }) => ({ name, description }))
      .sort((left, right) => left.name.localeCompare(right.name))
    expect(productSkills).toEqual(expectedProductSkills)
    const productSkillSources = sessions.get(presetId).skills.value.skills.map(skill => classifySkillSource({
      name: skill.name,
      pathFields: pathFields(skill),
    }, configuredRoots))
    expect(productSkillSources).toEqual(Array.from({ length: 8 }, () => 'installed-project'))
    expect(productSkills).not.toContainEqual({ name: USER_SKILL_NAME, description: USER_SKILL_DESCRIPTION })
    expect(productSkills).not.toContainEqual({
      name: 'comfyui-generate',
      description: WORKSPACE_COMFYUI_GENERATE_DESCRIPTION,
    })
    expect(productSkills).not.toContainEqual({
      name: UNIQUE_WORKSPACE_SKILL_NAME,
      description: UNIQUE_WORKSPACE_SKILL_DESCRIPTION,
    })
  }

  const expectedWorkspaceSkills = [
    { name: 'comfyui-generate', description: WORKSPACE_COMFYUI_GENERATE_DESCRIPTION },
    { name: UNIQUE_WORKSPACE_SKILL_NAME, description: UNIQUE_WORKSPACE_SKILL_DESCRIPTION },
  ]
  const expectedUserSkills = [
    { name: USER_SKILL_NAME, description: USER_SKILL_DESCRIPTION },
  ]
  const standardSkills = sessions.get('standard').skills.value.skills
    .map(({ name, description }) => ({ name, description }))
  for (const id of ['standard', 'ptc']) {
    const visibleSkills = sessions.get(id).skills.value.skills
    const sources = visibleSkills.map(skill => classifySkillSource({
      name: skill.name,
      pathFields: pathFields(skill),
    }, configuredRoots))
    const projectedSkills = visibleSkills.map(({ name, description }) => ({ name, description }))
    expect.soft(projectedSkills, `${id} must retain its user and Workspace Skills`).toEqual(expect.arrayContaining([
      ...expectedUserSkills,
      ...expectedWorkspaceSkills,
    ]))
    expect.soft(sources.filter(source => source === 'user')).toHaveLength(1)
    expect.soft(sources.filter(source => source === 'workspace')).toHaveLength(2)
    expect.soft(sources.filter(source => source === 'host-bundled')).toHaveLength(3)
    expect.soft(sources.filter(source => source === 'installed-project')).toHaveLength(0)
    expect.soft(sources.filter(source => source === 'other-path' || source === 'unclassified')).toEqual([])
  }
  const minimalAndCordisOfficeSkills = ['office-docx', 'office-pptx', 'office-xlsx'].sort()
  for (const id of ['minimal', 'cordis']) {
    const visibleSkills = sessions.get(id).skills.value.skills
    expect(visibleSkills.map(skill => skill.name).sort()).toEqual(minimalAndCordisOfficeSkills)
    expect(visibleSkills.every(skill => classifySkillSource({
      name: skill.name,
      pathFields: pathFields(skill),
    }, configuredRoots) === 'host-bundled')).toBe(true)
  }
  const implicitSkills = sessions.get('implicit-default').skills.value.skills
    .map(({ name, description }) => ({ name, description }))
    .sort((left, right) => left.name.localeCompare(right.name))
  expect(implicitSkills).toEqual(standardSkills.sort((left, right) => left.name.localeCompare(right.name)))

  for (const [key, session] of sessions) {
    if (PROJECT_PRESET_IDS.includes(key) || key === 'implicit-default') continue
    const visible = session.skills.value.skills.map(({ name, description }) => ({ name, description }))
    const installedProjectSkills = session.skills.value.skills.filter(skill => classifySkillSource({
      name: skill.name,
      pathFields: pathFields(skill),
    }, configuredRoots) === 'installed-project')
    expect(installedProjectSkills.map(skill => ({ name: skill.name, description: skill.description })))
      .toEqual([])
    for (const repositorySkill of expectedRepositorySkills) {
      expect.soft(visible, `non-product preset ${key} must not receive repository skill ${repositorySkill.name}`)
        .not.toContainEqual(repositorySkill)
    }
  }
  const standardSkillRecords = sessions.get('standard').skills.value.skills
  const skillRecordFor = name => standardSkillRecords.find(skill => skill.name === name)
  const skillPaths = {
    workspace: pathFields(skillRecordFor(UNIQUE_WORKSPACE_SKILL_NAME) ?? {}).path,
    user: pathFields(skillRecordFor(USER_SKILL_NAME) ?? {}).path,
  }
  expect(isAbsolute(skillPaths.workspace)).toBe(true)
  expect(isAbsolute(skillPaths.user)).toBe(true)
  expect(isPathWithin(skillPaths.workspace, configuredRoots.workspaceSkills)).toBe(true)
  expect(isPathWithin(skillPaths.user, configuredRoots.userSkills)).toBe(true)
  return { standardSessionId: sessions.get('standard').sessionId, skillPaths }
}

async function verifyKimiPptHostRequestDisabled(page, capture, workspaceId) {
  const provider = OFFICIAL_BUSINESS_FIXTURE.provider
  const remoteResults = await page.evaluate(`new Promise((resolve, reject) => {
    window.__runPanelTestContext.inject(['remote.session'], async injected => {
      try {
        const created = await injected.remote.session.create({
          workspaceId: ${JSON.stringify(workspaceId)},
          agentPreset: 'harness-comfyui-cli-candidate'
        })
        const sessionId = created.ok ? created.value.sessionId : null
        const selected = created.ok ? await injected.remote.session.selectModel({
          sessionId,
          provider: ${JSON.stringify(provider.id)},
          model: ${JSON.stringify(provider.modelId)}
        }) : null
        const prompted = selected?.ok ? await injected.remote.session.prompt({
          requestId: ${JSON.stringify(OFFICIAL_BUSINESS_FIXTURE.sessions.promptRequestId)},
          sessionId,
          mode: 'queue',
          content: [{ type: 'text', text: 'Return one word.' }],
          clientTimeZone: 'Asia/Shanghai'
        }) : null
        resolve({ created, selected, prompted, sessionId })
      } catch (error) {
        reject(error)
      }
    })
  })`)

  expect(remoteResults.created).toEqual(expect.objectContaining({ ok: true }))
  expect(remoteResults.selected).toEqual(expect.objectContaining({ ok: true }))
  expect(remoteResults.prompted).toEqual(expect.objectContaining({ ok: true }))

  const request = await capture.requestWhere(request =>
    (request.body.messages ?? []).some(message => requestMessageText(message).includes('Return one word.')))
  expect(request.path).toBe('/v1/chat/completions')
  expect(request.body.model).toBe(provider.modelId)
  const sessionHistory = await page.evaluate(`new Promise((resolve, reject) => {
    window.__runPanelTestContext.inject(['remote.session'], async injected => {
      try {
        const remote = injected.remote.session
        const projection = await remote.projections({ sessionId: ${JSON.stringify(remoteResults.sessionId)} })
        const history = projection.ok
          ? await remote.page({
              address: { kind: 'session', sessionId: ${JSON.stringify(remoteResults.sessionId)} },
              throughSeq: projection.value.asOfSeq,
            })
          : null
        resolve({ projection, history })
      } catch (error) { reject(error) }
    })
  })`)
  expect(sessionHistory.projection).toEqual(expect.objectContaining({ ok: true }))
  expect(sessionHistory.history).toEqual(expect.objectContaining({ ok: true }))
  expect(sessionHistory.history.value.records).toEqual(expect.any(Array))
  expect(JSON.stringify(sessionHistory.history.value.records)).toContain('Return one word.')
  const systemPrompt = (request.body.messages ?? [])
    .filter(message => message.role === 'system')
    .map(message => typeof message.content === 'string' ? message.content : JSON.stringify(message.content))
    .join('\n')
  const toolNames = (request.body.tools ?? []).map(tool => tool.function?.name ?? tool.name ?? '')

  expect(systemPrompt).not.toMatch(/kimi-ppt|Kimi-compatible PPT|PPT composer|pptd_/iu)
  expect(toolNames.filter(name => /^ppt(?:d)?_/u.test(name))).toEqual([])
}

async function verifyRunDiscovery(page, context, identity, stagedRunRepository, mediaFixture) {
  const sessionId = JSON.stringify(identity.sessionId)
  await page.evaluate(`new Promise((resolve, reject) => {
    window.__runPanelTestContext.inject(['connection'], injected => {
      try {
        const rpc = injected.connection.rpc
        const original = rpc.call
        window.__generationProjectionResponses = []
        window.__restoreGenerationObserver = () => { rpc.call = original }
        rpc.call = async function (...args) {
          const response = await original.apply(this, args)
          if (args[1] === 'harnessComfyuiGeneration/list') window.__generationProjectionResponses.push(response)
          return response
        }
        resolve()
      } catch (error) { reject(error) }
    })
  })`)
  const waitForProjection = runCount => waitForValue(page, `
    window.__generationProjectionResponses.find(response => response.ok
      && response.value.sessionId === ${sessionId}
      && response.value.runs.length === ${runCount})?.value`, value => value !== undefined, 10_000)
  await page.evaluate(`(() => {
    const ctx = window.__runPanelTestContext
    const binding = ctx.sessions.binding(${sessionId})
    if (!binding) throw new Error('Selected Desktop session has no active binding')
    window.__runPanelSession = binding.session
    ctx.sessions.handleSessionStatus(${sessionId}, true)
  })()`)
  try {
    await waitForProjection(0)
    await page.evaluate('void (window.__runningSessionSnapshot = window.__runPanelSession.getSnapshot())')
    const counts = `(() => {
    const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.sessionId}"]')
    return drawer === null ? null : {
      runs: drawer.querySelectorAll('.harness-comfyui-run-card').length,
      summary: drawer.querySelector('header small')?.textContent,
    }
  })()`
    expect(await page.evaluate(counts)).toEqual({ runs: 0, summary: '0 个运行 · 0 个媒体' })
    publishSavedDesktopRun(context.paths.runRepositoryFile, stagedRunRepository, mediaFixture.older.runId)
    expect((await waitForProjection(1)).hasActiveRuns).toBe(false)
    await waitForValue(page, counts, value => value?.runs === 1 && value.summary === '1 个运行 · 1 个媒体')
    publishSavedDesktopRun(context.paths.runRepositoryFile, stagedRunRepository, mediaFixture.newer.runId)
    await waitForValue(page, counts, value => value?.runs === 2 && value.summary === '2 个运行 · 2 个媒体')
    expect(await page.evaluate('window.__runningSessionSnapshot === window.__runPanelSession.getSnapshot()')).toBe(true)
    expect(await page.evaluate('window.__runningSessionSnapshot.running')).toBe(true)
  } finally {
    await page.evaluate('window.__restoreGenerationObserver()')
    await page.evaluate(`window.__runPanelTestContext.sessions.handleSessionStatus(${sessionId}, false)`)
  }
}

async function submitComposerPrompt(page, prompt) {
  const focused = await page.evaluate(`(() => {
    const fields = [...document.querySelectorAll('textarea, [contenteditable="true"]')]
      .filter(element => element.getClientRects().length > 0)
    const composer = fields.find(element => /描述你想要构建的内容|发消息或创建任务/u.test([
      element.getAttribute('placeholder'),
      element.getAttribute('data-placeholder'),
      element.getAttribute('aria-label'),
    ].filter(Boolean).join(' ')))
    if (!composer || composer.matches(':disabled, [aria-disabled="true"]')) return {
      ready: false,
      fields: fields.map(element => ({ tag: element.tagName, placeholder: element.getAttribute('placeholder'), ariaLabel: element.getAttribute('aria-label') })),
    }
    composer.focus()
    return { ready: document.activeElement === composer, tag: composer.tagName }
  })()`)
  if (focused.ready !== true) throw new Error(`Official Desktop composer is unavailable: ${JSON.stringify(focused)}`)

  await page.command('Input.insertText', { text: prompt })
  const entered = await waitForValue(page, `(() => {
    const composer = document.activeElement
    if (!(composer instanceof HTMLElement) || !composer.matches('textarea, [contenteditable="true"]')) return null
    return composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement
      ? composer.value
      : composer?.textContent?.trim() ?? null
  })()`, value => value === prompt, 10_000)
  expect(entered).toBe(prompt)

  await page.command('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
  })
  await page.command('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
  })
}

async function verifyWorkspaceAndUserSkillMarkers(page, services, sessionId, skillPaths, evidenceDirectory) {
  const sessionJson = JSON.stringify(sessionId)
  const titleJson = JSON.stringify(OFFICIAL_BUSINESS_FIXTURE.sessions.skillMarkerTitle)
  const selection = await page.evaluate(`new Promise((resolve, reject) => {
    window.__runPanelTestContext.inject(['remote.session'], async injected => {
      try {
        const remote = injected.remote.session
        const renamed = await remote.rename({ sessionId: ${sessionJson}, title: ${titleJson} })
        const selected = renamed.ok ? await remote.selectModel({
          sessionId: ${sessionJson},
          provider: ${JSON.stringify(OFFICIAL_BUSINESS_FIXTURE.provider.id)},
          model: ${JSON.stringify(OFFICIAL_BUSINESS_FIXTURE.provider.modelId)},
        }) : null
        resolve({ renamed, selected })
      } catch (error) { reject(error) }
    })
  })`)
  expect(selection.renamed).toEqual(expect.objectContaining({ ok: true }))
  expect(selection.selected).toEqual(expect.objectContaining({ ok: true }))

  await page.evaluate(`(() => {
    window.__runPanelTestContext.get('uiWorkspace').openSession(${sessionJson})
    return true
  })()`)
  const mainView = await waitForValue(page, `(() => window.__runPanelTestContext
    .get('sessions').retainInfo(${sessionJson}).getSnapshot())()`, value => value?.retainedBy?.mainView === 1, 10_000)
  expect(mainView).toMatchObject({ retainedBy: { mainView: 1 } })

  const markerRequest = OFFICIAL_BUSINESS_FIXTURE.skills.markerRequest
  await waitForValue(page, `(() => {
    const composer = [...document.querySelectorAll('textarea, [contenteditable="true"]')]
      .find(element => /描述你想要构建的内容|发消息或创建任务/u.test([
        element.getAttribute('placeholder'), element.getAttribute('data-placeholder'), element.getAttribute('aria-label'),
      ].filter(Boolean).join(' ')))
    return composer !== undefined && !composer.matches(':disabled, [aria-disabled="true"]')
  })()`, value => value === true)
  await submitComposerPrompt(page, markerRequest)
  const firstRequest = await services.requestWhere(request =>
    (request.body.messages ?? []).some(message => message.role === 'user'
      && requestMessageText(message).includes(markerRequest)), 30_000)
  const firstRequestText = JSON.stringify({ messages: firstRequest.body.messages ?? [], tools: firstRequest.body.tools ?? [] })
  expect(firstRequest.body.model).toBe(OFFICIAL_BUSINESS_FIXTURE.provider.modelId)
  expect((firstRequest.body.messages ?? []).some(message => requestMessageText(message).includes(markerRequest))).toBe(true)
  expect((firstRequest.body.tools ?? []).some(tool => (tool.function?.name ?? tool.name) === 'skill')).toBe(true)
  expect(firstRequestText).not.toContain(WORKSPACE_SKILL_MARKER)
  expect(firstRequestText).not.toContain(USER_SKILL_MARKER)

  const workspaceSkillRequest = await services.requestWhere(request =>
    (request.body.messages ?? []).some(message => message.role === 'tool'
      && requestMessageText(message).includes(WORKSPACE_SKILL_MARKER)), 30_000)
  const workspaceSkillToolResult = (workspaceSkillRequest.body.messages ?? [])
    .filter(message => message.role === 'tool')
    .map(message => requestMessageText(message))
    .find(content => content.includes(WORKSPACE_SKILL_MARKER))
  expect(workspaceSkillToolResult).toContain(`<skill_content name="${UNIQUE_WORKSPACE_SKILL_NAME}">`)
  const userSkillRequest = await services.requestWhere(request =>
    (request.body.messages ?? []).some(message => message.role === 'tool'
      && requestMessageText(message).includes(USER_SKILL_MARKER)), 30_000)
  const userSkillToolResult = (userSkillRequest.body.messages ?? [])
    .filter(message => message.role === 'tool')
    .map(message => requestMessageText(message))
    .find(content => content.includes(USER_SKILL_MARKER))
  expect(userSkillToolResult).toContain(`<skill_content name="${USER_SKILL_NAME}">`)
  expect(userSkillRequest.body.model).toBe(OFFICIAL_BUSINESS_FIXTURE.provider.modelId)
  expect(services.skillToolCalls).toEqual([
    { name: 'skill', arguments: { name: UNIQUE_WORKSPACE_SKILL_NAME } },
    { name: 'skill', arguments: { name: USER_SKILL_NAME } },
  ])
  const workspaceSkillPath = await realpath(skillPaths.workspace)
  const userSkillPath = await realpath(skillPaths.user)
  const [workspaceSkillSource, userSkillSource] = await Promise.all([
    readFile(workspaceSkillPath, 'utf8'),
    readFile(userSkillPath, 'utf8'),
  ])
  expect(isAbsolute(workspaceSkillPath)).toBe(true)
  expect(isAbsolute(userSkillPath)).toBe(true)
  expect(workspaceSkillPath).toMatch(/\/SKILL\.md$/u)
  expect(userSkillPath).toMatch(/\/SKILL\.md$/u)
  expect(workspaceSkillSource).toContain(WORKSPACE_SKILL_MARKER)
  expect(workspaceSkillSource).not.toContain(USER_SKILL_MARKER)
  expect(userSkillSource).toContain(USER_SKILL_MARKER)
  expect(userSkillSource).not.toContain(WORKSPACE_SKILL_MARKER)

  await waitForValue(page, `document.body.innerText.includes(${JSON.stringify(WORKSPACE_SKILL_MARKER)})
    && document.body.innerText.includes(${JSON.stringify(USER_SKILL_MARKER)})`, value => value === true, 30_000)
  await waitForValue(page, `(() => [...document.querySelectorAll('[role="treeitem"]')]
    .some(node => node.textContent?.includes(${titleJson})))()`, value => value === true, 10_000)

  const historyText = await waitForValue(page, `(async () => {
    const remote = window.__runPanelTestContext.get('remote.session')
    const projection = await remote.projections({ sessionId: ${sessionJson} })
    if (!projection.ok) return null
    const history = await remote.page({
      address: { kind: 'session', sessionId: ${sessionJson} },
      throughSeq: projection.value.asOfSeq,
    })
    return history.ok ? JSON.stringify(history.value.records) : null
  })()`, value => typeof value === 'string'
    && value.includes(markerRequest)
    && value.includes(WORKSPACE_SKILL_MARKER)
    && value.includes(USER_SKILL_MARKER), 30_000)
  expect(historyText).toContain(markerRequest)
  expect(historyText).toContain(WORKSPACE_SKILL_MARKER)
  expect(historyText).toContain(USER_SKILL_MARKER)

  const screenshot = await page.command('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(evidenceDirectory, 'official-business-skill-markers.png'), Buffer.from(screenshot.data, 'base64'), {
    encoding: 'binary', mode: 0o600,
  })
  const evidence = {
    schemaVersion: 1,
    classification: 'automated-regression',
    acceptanceClaim: false,
    sessionId,
    selectedPreset: 'standard',
    model: firstRequest.body.model,
    userRequest: markerRequest,
    skillToolCalls: services.skillToolCalls,
    skillToolResults: [
      {
        skillName: UNIQUE_WORKSPACE_SKILL_NAME,
        skillPath: workspaceSkillPath,
        sourceFileContainsMarker: workspaceSkillSource.includes(WORKSPACE_SKILL_MARKER),
        content: workspaceSkillToolResult,
      },
      {
        skillName: USER_SKILL_NAME,
        skillPath: userSkillPath,
        sourceFileContainsMarker: userSkillSource.includes(USER_SKILL_MARKER),
        content: userSkillToolResult,
      },
    ],
    markerSources: {
      workspace: {
        skillName: UNIQUE_WORKSPACE_SKILL_NAME,
        skillPath: workspaceSkillPath,
        marker: WORKSPACE_SKILL_MARKER,
        sourceFileContainsMarker: workspaceSkillSource.includes(WORKSPACE_SKILL_MARKER),
        loadedBySkillTool: true,
        repeatedInAssistantResponse: true,
      },
      user: {
        skillName: USER_SKILL_NAME,
        skillPath: userSkillPath,
        marker: USER_SKILL_MARKER,
        sourceFileContainsMarker: userSkillSource.includes(USER_SKILL_MARKER),
        loadedBySkillTool: true,
        repeatedInAssistantResponse: true,
      },
    },
    cliCall: 'none',
    coldHistoryContainsPromptAndMarkers: true,
  }
  await writeFile(join(evidenceDirectory, 'official-business-skill-markers.json'),
    `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return evidence
}

async function verifyControlledGeneration(page, services, workspaceId, evidenceDirectory) {
  const generation = OFFICIAL_BUSINESS_FIXTURE.generation
  const sessionJson = JSON.stringify(generation.sessionTitle)
  const created = await page.evaluate(`new Promise((resolve, reject) => {
    window.__runPanelTestContext.inject(['remote.session'], async injected => {
      try {
        const remote = injected.remote.session
        const created = await remote.create({ workspaceId: ${JSON.stringify(workspaceId)}, agentPreset: 'standard' })
        if (!created.ok) { resolve({ created, renamed: null, selected: null, prompted: null }); return }
        const sessionId = created.value.sessionId
        const renamed = await remote.rename({ sessionId, title: ${sessionJson} })
        resolve({ created: { ...created, value: { ...created.value, sessionId } }, renamed, selected: null, prompted: null })
      } catch (error) { reject(error) }
    })
  })`)
  expect(created.created).toEqual(expect.objectContaining({ ok: true }))
  expect(created.renamed).toEqual(expect.objectContaining({ ok: true }))
  const sessionId = created.created.value.sessionId
  const sessionIdJson = JSON.stringify(sessionId)

  const selected = await page.evaluate(`new Promise((resolve, reject) => {
    window.__runPanelTestContext.inject(['remote.session'], async injected => {
      try {
        resolve(await injected.remote.session.selectModel({
          sessionId: ${sessionIdJson},
          provider: ${JSON.stringify(OFFICIAL_BUSINESS_FIXTURE.provider.id)},
          model: ${JSON.stringify(OFFICIAL_BUSINESS_FIXTURE.provider.modelId)},
        }))
      } catch (error) { reject(error) }
    })
  })`)
  expect(selected).toEqual(expect.objectContaining({ ok: true }))

  await page.evaluate(`(() => {
    window.__runPanelTestContext.get('uiWorkspace').openSession(${sessionIdJson})
    return true
  })()`)
  const mainView = await waitForValue(page, `(() => window.__runPanelTestContext
    .get('sessions').retainInfo(${sessionIdJson}).getSnapshot())()`, value => value?.retainedBy?.mainView === 1, 10_000)
  expect(mainView).toMatchObject({ retainedBy: { mainView: 1 } })

  await page.evaluate(`(() => {
    const context = window.__runPanelTestContext
    context.sidebarRight.openTab('guide')
  })()`)
  await waitForValue(page, `document.querySelector('[data-sidebar-right-guide]') !== null`, value => value === true)
  const openedPluginEntry = await page.evaluate(`(() => {
    const entry = document.querySelector('.harness-comfyui-sidebar-entry')
    if (!entry) return false
    entry.click()
    return true
  })()`)
  expect(openedPluginEntry).toBe(true)
  await waitForValue(page, `document.querySelector('.harness-comfyui-dock-actions') !== null`, value => value === true)
  await page.evaluate(`(() => {
    const context = window.__runPanelTestContext
    if (!context.sessions.binding(${sessionIdJson})) throw new Error('Generation Session has no active UI binding')
    context.sessions.handleSessionStatus(${sessionIdJson}, true)
  })()`)

  await submitComposerPrompt(page, generation.triggerPrompt)
  await waitForValue(page, `(() => [...document.querySelectorAll('[role="treeitem"]')]
    .some(node => node.getAttribute('aria-selected') === 'true'
      && node.textContent?.includes(${sessionJson})))()`, value => value === true, 30_000)

  const firstModelRequest = await services.requestWhere(request =>
    (request.body.messages ?? []).some(message => message.role === 'user'
      && requestMessageText(message).includes(generation.triggerPrompt))
      && (request.body.tools ?? []).some(tool =>
        (tool.function?.name ?? tool.name) === 'generate_with_comfyui'), 30_000)
  expect(firstModelRequest.body.messages.some(message => requestMessageText(message).includes(generation.triggerPrompt))).toBe(true)
  expect((firstModelRequest.body.tools ?? []).some(tool =>
    (tool.function?.name ?? tool.name) === 'generate_with_comfyui')).toBe(true)
  const followupModelRequest = await services.requestWhere(request =>
    (request.body.messages ?? []).some(message => message.role === 'tool'), 30_000)
  expect(followupModelRequest.body.messages.some(message => message.role === 'tool')).toBe(true)

  const projectionExpression = `(async () => window.__runPanelTestContext
    .get('remote.harnessComfyuiGeneration').list({ sessionId: ${sessionIdJson}, turn: null }))()`
  const projection = await waitForValue(page, projectionExpression, value => value?.ok === true
    && value.value.runs.length === 1
    && value.value.runs[0]?.status === 'succeeded'
    && value.value.media.length === 1, 180_000)
  const run = projection.value.runs[0]
  const media = projection.value.media[0]
  expect(run).toMatchObject({
    title: generation.runTitle,
    instanceTitle: 'Controlled Desktop Comfy Service',
    templateTitle: generation.templateTitle,
    status: 'succeeded',
    errorCode: null,
  })
  expect(media).toMatchObject({
    runId: run.runId,
    filename: generation.filename,
    mediaKind: 'image',
    mediaType: 'image/png',
    byteSize: services.controlledPngByteLength,
  })

  const promptSubmission = services.promptSubmission
  expect(promptSubmission).not.toBeNull()
  expect(promptSubmission.promptId).toMatch(/^[0-9a-f-]{36}$/u)
  expect(promptSubmission.body.prompt['1']).toMatchObject({
    class_type: 'FixturePrompt',
    inputs: { prompt: generation.positivePrompt },
  })
  expect(promptSubmission.body.prompt['2']).toMatchObject({
    class_type: 'FixtureImage',
    inputs: { conditioning: ['1', 0], seed: generation.seed },
  })
  expect(promptSubmission.body.prompt['3']).toMatchObject({
    class_type: 'SaveImage',
    inputs: { images: ['2', 0] },
  })
  expect(promptSubmission.body.extra_data.extra_pnginfo.workflow.nodes).toEqual(expect.any(Array))
  expect(services.comfyRequests.filter(item => item.pathname === '/object_info')).toHaveLength(1)
  expect(services.comfyRequests.filter(item => item.pathname === '/prompt')).toHaveLength(1)
  expect(services.comfyRequests.filter(item => item.pathname.startsWith('/api/jobs/')).length).toBeGreaterThanOrEqual(2)
  expect(services.comfyRequests.some(item => item.pathname === '/view' && item.matches)).toBe(true)
  expect(services.historyRequestCount).toBe(0)
  const history = await services.readHistory(promptSubmission.promptId)
  expect(history[promptSubmission.promptId]).toMatchObject({
    status: { status_str: 'success', completed: true },
    outputs: { [generation.outputNodeId]: { images: [expect.objectContaining({ filename: generation.filename })] } },
  })
  expect(services.historyRequestCount).toBe(1)
  await waitForValue(page, `(() => {
    const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${sessionId}"]')
    return drawer === null ? null : {
      visible: drawer.getAttribute('data-tab-visible') === 'true',
      runCards: [...drawer.querySelectorAll('.harness-comfyui-run-card')].map(card => card.textContent),
      mediaCards: [...drawer.querySelectorAll('.harness-comfyui-media-card')].map(card => card.textContent),
      summary: drawer.querySelector('.harness-comfyui-results-header small')?.textContent,
    }
  })()`, value => value?.visible === true
    && value.runCards.some(text => text.includes(generation.runTitle) && text.includes('已完成'))
    && value.mediaCards.some(text => text.includes(generation.filename))
    && value.summary === '1 个运行 · 1 个媒体', 30_000)
  const frontendEventTypes = [...new Set(services.frontendEvents.map(event => event.type))].sort()
  expect(frontendEventTypes).toEqual(['graph-to-prompt', 'nodes-registered', 'workflow-loaded'])
  expect(services.frontendEvents.find(event => event.type === 'nodes-registered')?.nodeTypes)
    .toEqual(['FixtureImage', 'FixturePrompt', 'SaveImage'])
  const screenshot = await page.command('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(evidenceDirectory, 'official-business-controlled-generation.png'), Buffer.from(screenshot.data, 'base64'))

  const evidence = {
    schemaVersion: 1,
    classification: 'automated-regression',
    acceptanceClaim: false,
    sessionTitle: generation.sessionTitle,
    sessionId,
    promptId: promptSubmission.promptId,
    runId: run.runId,
    runTitle: run.title,
    runStatus: run.status,
    output: {
      filename: media.filename,
      mediaType: media.mediaType,
      byteSize: media.byteSize,
    },
    frontend: {
      publicMethodsObserved: ['graph', 'loadGraphData', 'graphToPrompt'],
      nodeTypesRegistered: frontendEventTypes.includes('nodes-registered'),
      workflowLoaded: frontendEventTypes.includes('workflow-loaded'),
      graphExported: frontendEventTypes.includes('graph-to-prompt'),
    },
    transport: {
      objectInfoRequests: services.comfyRequests.filter(item => item.pathname === '/object_info').length,
      promptSubmissions: services.comfyRequests.filter(item => item.pathname === '/prompt').length,
      jobPolls: services.comfyRequests.filter(item => item.pathname.startsWith('/api/jobs/')).length,
      mediaDownloads: services.comfyRequests.filter(item => item.pathname === '/view' && item.matches).length,
      historyShapeVerified: true,
      productHistoryPolls: 0,
    },
    modelToolCalls: {
      generationToolAvailable: true,
      toolResultReturned: true,
    },
  }
  await writeFile(join(evidenceDirectory, 'official-business-controlled-generation.json'), JSON.stringify(evidence, null, 2) + '\n', {
    encoding: 'utf8', mode: 0o600,
  })
  return evidence
}

async function verifyGenerationAfterRestart(page, generationEvidence, evidenceDirectory) {
  const sessionJson = JSON.stringify(generationEvidence.sessionId)
  const runId = generationEvidence.runId
  const filename = generationEvidence.output.filename
  const projectionExpression = `(async () => window.__runPanelTestContext
    .get('remote.harnessComfyuiGeneration').list({ sessionId: ${sessionJson}, turn: null }))()`
  const projection = await waitForValue(page, projectionExpression, value => value?.ok === true
    && value.value.runs.some(run => run.runId === runId && run.status === 'succeeded')
    && value.value.media.some(media => media.runId === runId && media.filename === filename), 20_000)
  const opened = await page.evaluate(`new Promise((resolve, reject) => {
    try {
      const workspace = window.__runPanelTestContext.get('uiWorkspace')
      Promise.resolve(workspace.openSession(${sessionJson})).then(resolve, reject)
    } catch (error) { reject(error) }
  })`)
  expect(opened).not.toBe(false)
  await waitForValue(page, `(() => [...document.querySelectorAll('[role="treeitem"]')]
    .some(node => node.getAttribute('aria-selected') === 'true'
      && node.textContent?.includes(${JSON.stringify(generationEvidence.sessionTitle)})))()`, value => value === true)
  await page.evaluate(`window.__runPanelTestContext.sidebarRight.openTab('guide')`)
  await waitForValue(page, `document.querySelector('[data-sidebar-right-guide]') !== null`, value => value === true)
  const pluginEntryOpened = await page.evaluate(`(() => {
    const entry = document.querySelector('.harness-comfyui-sidebar-entry')
    entry?.click()
    return entry !== null
  })()`)
  expect(pluginEntryOpened).toBe(true)
  await waitForValue(page, `(() => {
    const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${generationEvidence.sessionId}"]')
    return drawer !== null && drawer.getAttribute('data-tab-visible') === 'true'
      && [...drawer.querySelectorAll('.harness-comfyui-run-card')]
        .some(card => card.textContent?.includes(${JSON.stringify(generationEvidence.runTitle)})
          && card.textContent?.includes('已完成'))
      && [...drawer.querySelectorAll('.harness-comfyui-media-card')]
        .some(card => card.textContent?.includes(${JSON.stringify(generationEvidence.output.filename)}))
  })()`, value => value === true, 20_000)
  const screenshot = await page.command('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(evidenceDirectory, 'official-business-generation-after-restart.png'),
    Buffer.from(screenshot.data, 'base64'), { encoding: 'binary', mode: 0o600 })
  const evidence = {
    schemaVersion: 1,
    classification: 'automated-regression',
    acceptanceClaim: false,
    sessionId: generationEvidence.sessionId,
    runId,
    runStatus: projection.value.runs.find(run => run.runId === generationEvidence.runId)?.status,
    mediaFilename: projection.value.media.find(media => media.runId === runId)?.filename,
    uiRunAndMediaVisible: true,
  }
  await writeFile(join(evidenceDirectory, 'official-business-generation-after-restart.json'),
    JSON.stringify(evidence, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
  return evidence
}

function requestMessageText(message) {
  if (typeof message.content === 'string') return message.content
  if (!Array.isArray(message.content)) return ''
  return message.content.flatMap(part => typeof part?.text === 'string' ? [part.text] : []).join('\n')
}

describe('official Desktop plugin regression', () => {
  it('installs the packed candidate through Desktop, restarts the app, and verifies workbench behavior', async () => {
    const repositoryRoot = sourceRepositoryRoot
    const fixtureId = randomUUID()
    const fixtureRepositoryRoot = await realpath(await mkdtemp(join(tmpdir(), 'official-desktop-e2e-')))
    const fixtureRoot = fixtureRepositoryRoot
    const environmentRoot = resolve(fixtureRoot, '.local/desktop-e2e', fixtureId, 'official-environment')
    const auditDirectory = resolve(repositoryRoot, '.local/desktop-e2e/official-business-audit', fixtureId)
    const environmentFilePath = resolve(environmentRoot, 'controlled.env')
    const startupWorkspacePath = resolve(environmentRoot, 'workspace')
    const agentsHome = resolve(environmentRoot, 'agents-home')
    let downloadPath
    const dshHome = resolve(environmentRoot, 'dsh-home')
    const context = {
      paths: loadProfile('production', { storageRoot: dshHome, environment: {} }).paths,
      dshHome,
    }
    const fixture = {
      repositoryRoot: fixtureRepositoryRoot,
      sourceRepositoryRoot: repositoryRoot,
      environmentRoot,
      auditDirectory,
      runs: [],
      context,
      close: undefined,
    }
    active.push(fixture)

    const relativeFixtureRoot = relative(repositoryRoot, fixtureRepositoryRoot)
    expect(relativeFixtureRoot === '..' || relativeFixtureRoot.startsWith(`..${sep}`)).toBe(true)
    await expect(lstat(join(fixtureRepositoryRoot, '.git'))).rejects.toMatchObject({ code: 'ENOENT' })
    await mkdir(resolve(fixtureRoot, 'artifacts'), { recursive: true, mode: 0o700 })
    await mkdir(startupWorkspacePath, { recursive: true, mode: 0o700 })
    await mkdir(agentsHome, { recursive: true, mode: 0o700 })
    const testApiKey = randomBytes(24).toString('hex')
    await writeFile(environmentFilePath,
      `${OFFICIAL_BUSINESS_FIXTURE.provider.apiKeyEnvironmentName}=${testApiKey}\n`,
      { encoding: 'utf8', mode: 0o600 })
    await mkdir(resolve(startupWorkspacePath, '.agents/skills', OFFICIAL_BUSINESS_FIXTURE.skills.workspaceName), { recursive: true, mode: 0o700 })
    await writeFile(resolve(startupWorkspacePath, '.agents/skills', OFFICIAL_BUSINESS_FIXTURE.skills.workspaceName, 'SKILL.md'), `---
name: ${OFFICIAL_BUSINESS_FIXTURE.skills.workspaceName}
description: ${WORKSPACE_COMFYUI_GENERATE_DESCRIPTION}
---

# Official Desktop E2E workspace skill fixture
`, 'utf8')
    await mkdir(resolve(startupWorkspacePath, '.agents/skills', UNIQUE_WORKSPACE_SKILL_NAME), { recursive: true, mode: 0o700 })
    await writeFile(resolve(startupWorkspacePath, '.agents/skills', UNIQUE_WORKSPACE_SKILL_NAME, 'SKILL.md'), `---
name: ${UNIQUE_WORKSPACE_SKILL_NAME}
description: ${UNIQUE_WORKSPACE_SKILL_DESCRIPTION}
---

For the workspace-skill verification task, repeat this unique token exactly: ${WORKSPACE_SKILL_MARKER}
`, { encoding: 'utf8', mode: 0o600 })
    await mkdir(resolve(agentsHome, 'skills', USER_SKILL_NAME), { recursive: true, mode: 0o700 })
    await writeFile(resolve(agentsHome, 'skills', USER_SKILL_NAME, 'SKILL.md'), `---
name: ${USER_SKILL_NAME}
description: ${USER_SKILL_DESCRIPTION}
---

# For the user-skill verification task, repeat this unique token exactly: ${USER_SKILL_MARKER}
`, { encoding: 'utf8', mode: 0o600 })

    const promptCapture = await startModelRequestCaptureServer()
    fixture.close = promptCapture.close
    const provider = OFFICIAL_BUSINESS_FIXTURE.provider
    const alternateVisionProvider = OFFICIAL_BUSINESS_FIXTURE.imageReader.alternateProvider
    const customProviders = {
      [provider.id]: {
        displayName: provider.displayName,
        api: provider.api,
        apiKeyEnv: provider.apiKeyEnvironmentName,
        baseURL: promptCapture.baseURL,
        models: [{
          id: provider.modelId,
          name: provider.modelName,
          contextWindow: provider.contextWindow,
          maxTokens: provider.maxTokens,
          input: provider.models.promptCapture.input,
        }, provider.models.vision],
      },
      [alternateVisionProvider.id]: {
        displayName: alternateVisionProvider.displayName,
        api: alternateVisionProvider.api,
        apiKeyEnv: provider.apiKeyEnvironmentName,
        baseURL: promptCapture.baseURL,
        models: [alternateVisionProvider.model],
      },
    }
    const desktopConfig = createOfficialBusinessConfig(
      await loadDesktopE2EConfig(), fixtureId, environmentFilePath, startupWorkspacePath,
      Number(new URL(promptCapture.baseURL).port), customProviders,
    )
    const profileYamlAdapter = await loadOfficialProfilePatchAdapter(desktopConfig)
    const stagedRunRepository = resolve(fixtureRoot, 'staged-runs.sqlite')
    await mkdir(dshHome, { recursive: true, mode: 0o700 })
    let identity
    let mediaFixture
    let generationEvidence
    let generationRestartEvidence
    let savedBrowserPath
    let businessRunStopped

    const lifecycleFixture = parseOfficialLifecycleFixture(lifecycleFixtureJson)
    const tarballPath = process.env[lifecycleFixture.artifact.sourcePathEnvironmentName]
    const sourceIdentityPath = process.env[lifecycleFixture.artifact.sourceIdentityPathEnvironmentName]
    if (typeof tarballPath !== 'string' || tarballPath.trim() === ''
      || typeof sourceIdentityPath !== 'string' || sourceIdentityPath.trim() === '') {
      throw new Error('The official Desktop test runner must provide the fixed candidate tarball and source identity.')
    }
    const packageManifest = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
    const sourceIdentity = parseOfficialCandidateSourceIdentity(JSON.parse(await readFile(sourceIdentityPath, 'utf8')), {
      archivePath: resolve(tarballPath),
      packageName: packageManifest.name,
      packageVersion: packageManifest.version,
    })
    expect(sourceIdentity.dirty).toEqual(expect.any(Boolean))

    const firstRunId = randomUUID()
    const firstRun = await startOfficialBusinessDesktop({
      repositoryRoot: fixtureRepositoryRoot, runId: firstRunId, config: desktopConfig,
      homeDirectory: environmentRoot, agentsHome,
    })
    fixture.runs.push({ runId: firstRunId, config: desktopConfig, active: true, record: firstRun.record })
    const firstPage = await connectOfficialDesktopPage(firstRun.record.ports.rendererCdp, {
      runId: firstRunId, repositoryRoot: fixtureRepositoryRoot, config: desktopConfig,
    })
    let installation
    try {
      await firstPage.evaluate(`(() => {
        const notice = [...document.querySelectorAll('[role="dialog"]')]
          .find(dialog => dialog.textContent?.includes('内测声明'))
        const proceed = [...(notice?.querySelectorAll('button') ?? [])]
          .find(button => button.textContent?.trim() === '继续')
        proceed?.click()
      })()`)
      await waitForValue(firstPage, `[...document.querySelectorAll('[role="dialog"]')]
        .every(dialog => !dialog.textContent?.includes('内测声明'))`, value => value === true)
      const firstStatus = await getProbeStatus({ runId: firstRunId, repositoryRoot: fixtureRepositoryRoot, config: desktopConfig })
      try {
        installation = await installOfficialPluginCandidate({
          page: firstPage,
          tarballPath,
          probeStatus: firstStatus,
          repositoryRoot: fixtureRepositoryRoot,
        })
      } catch (error) {
        const message = String(error)
          .split(testApiKey).join('[controlled-api-key]')
          .split('official-desktop-controlled-test-key').join('[controlled-api-key]')
        await writeFile(join(firstRun.record.directories.evidence, 'official-business-install-failure.json'), JSON.stringify({
          schemaVersion: 1,
          classification: 'automated-regression',
          acceptanceClaim: false,
          runId: firstRunId,
          error: message,
        }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
        throw error
      }
      expect(installation.status).toBe('installed')
      expect(installation.enabled).toBe(true)
      expect(installation.expectedPackageName).toBe('harness-comfyui')
      expect(installation.evidenceComplete).toBe(true)
      expect(installation.tarballPath).toBe(tarballPath)
      const installedPackagePath = join(
        dshHome,
        desktopConfig.paths.profileRelativePath,
        'node_modules',
        'harness-comfyui',
        'package.json',
      )
      const installedPackage = JSON.parse(await readFile(installedPackagePath, 'utf8'))
      expect(installedPackage).toMatchObject({ name: 'harness-comfyui', version: packageManifest.version })
      installation.installedPackageVersion = installedPackage.version
      installation.installedPackagePath = installedPackagePath
      installation.artifactComparisons = await compareOfficialCandidateFiles({
        sourceIdentity,
        installedPackageRoot: dirname(installedPackagePath),
      })
    } finally {
      await firstPage.close().catch(() => undefined)
    }
    fixture.installation = installation
    const firstStopped = await stopProbe({ runId: firstRunId, repositoryRoot: fixtureRepositoryRoot, config: desktopConfig })
    fixture.runs.find(run => run.runId === firstRunId).active = false
    expect(firstStopped.record.state).toBe('stopped')
    expect(firstStopped.record.result.portsReleased).toBe(true)

    const run = await startOfficialBusinessDesktop({
      repositoryRoot: fixtureRepositoryRoot, runId: randomUUID(), config: desktopConfig,
      homeDirectory: environmentRoot, agentsHome,
    })
    fixture.runs.push({ runId: run.record.runId, config: desktopConfig, active: true, record: run.record })
    const debuggingPort = run.record.ports.rendererCdp
    context.businessEvidenceDirectory = run.record.directories.evidence
    downloadPath = join(context.businessEvidenceDirectory, 'downloads')
    await mkdir(downloadPath, { recursive: true, mode: 0o700 })
    let page = await connectOfficialDesktopPage(debuggingPort, {
      runId: run.record.runId, repositoryRoot: fixtureRepositoryRoot, config: desktopConfig,
    })
    let browser = null
    let downloadBehaviorEnabled = false
    let clipboardCaptureInstalled = false
    let deviceMetricsOverridden = false
    let contextCaptureScript
    try {
      await page.command('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      })
      const firstClientLoad = await captureProjectClientContext(page, sourceIdentity, run.record.directories.evidence)
      contextCaptureScript = firstClientLoad.identifier
      installation.loadedClientSource = firstClientLoad.loadedClientSource
      const actualWorkspacePath = await realpath(startupWorkspacePath)
      expect(run.record.directories.workspace).toBe(actualWorkspacePath)
      const environmentIsOutsideSourceRepository = !isPathWithin(environmentRoot, sourceRepositoryRoot)
      const workspaceIsOutsideSourceRepository = !isPathWithin(actualWorkspacePath, sourceRepositoryRoot)
      expect(environmentIsOutsideSourceRepository).toBe(true)
      expect(workspaceIsOutsideSourceRepository).toBe(true)
      const outsideRepoWorkspaceProof = {
        schemaVersion: 1,
        classification: 'automated-regression',
        acceptanceClaim: false,
        sourceRepositoryRoot: repositoryRoot,
        probeRepositoryRoot: fixtureRepositoryRoot,
        configuredWorkspacePath: startupWorkspacePath,
        workspacePath: actualWorkspacePath,
        environmentIsOutsideSourceRepository,
        workspaceIsOutsideSourceRepository,
        probeRepositoryHasGitMarker: false,
      }
      await writeFile(join(run.record.directories.evidence, 'official-business-workspace-boundary.json'),
        `${JSON.stringify(outsideRepoWorkspaceProof, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      identity = await seedOfficialBusinessSessions(page, run.record.directories.workspace)
      mediaFixture = await seedDesktopMedia(context, identity, stagedRunRepository)
      await page.evaluate(`(() => {
        const notice = [...document.querySelectorAll('[role="dialog"]')]
          .find(dialog => dialog.textContent?.includes('内测声明'))
        const proceed = [...(notice?.querySelectorAll('button') ?? [])]
          .find(button => button.textContent?.trim() === '继续')
        proceed?.click()
      })()`)
      await waitForValue(page, `[...document.querySelectorAll('[role="dialog"]')]
        .every(dialog => !dialog.textContent?.includes('内测声明'))`, value => value === true)
      await page.evaluate(`(async () => {
        const remote = window.__runPanelTestContext.get('remote.session')
        for (const [id, title] of ${JSON.stringify([
          [identity.sessionId, OFFICIAL_BUSINESS_FIXTURE.sessions.primaryTitle],
          [identity.switchSessionId, OFFICIAL_BUSINESS_FIXTURE.sessions.switchTitle],
        ])}) {
          const renamed = await remote.rename({ sessionId: id, title })
          if (!renamed.ok) throw new Error(JSON.stringify(renamed))
        }
      })()`)
      const canonicalAgentsHome = await realpath(agentsHome)
      const installedPluginSkillDirectory = await realpath(join(
        context.dshHome,
        desktopConfig.paths.profileRelativePath,
        'node_modules',
        'harness-comfyui',
        '.agents',
        'skills',
      ))
      const presetSessions = await verifyPresetScopedRepositorySkills(page, identity.workspaceId, {
        evidenceDirectory: context.businessEvidenceDirectory,
        workspacePath: run.record.directories.workspace,
        agentsHome: canonicalAgentsHome,
        installedPluginSkillDirectory,
      })
      await verifyWorkspaceAndUserSkillMarkers(
        page,
        promptCapture,
        presetSessions.standardSessionId,
        presetSessions.skillPaths,
        context.businessEvidenceDirectory,
      )
      await verifyKimiPptDisabled(page, identity.sessionId)
      await verifyKimiPptHostRequestDisabled(page, promptCapture, identity.workspaceId)
      generationEvidence = await verifyControlledGeneration(
        page, promptCapture, identity.workspaceId, context.businessEvidenceDirectory,
      )
      const catalogRemote = await page.evaluate("window.__runPanelTestContext.get('remote.harnessComfyuiCatalog').baseModels()")
      expect(catalogRemote).toEqual({ ok: true, value: { ok: true, value: { items: [{ id: '123', label: 'Desktop catalog fixture' }] } } })
      const imageModels = await page.evaluate("window.__runPanelTestContext.get('remote.harnessComfyuiImageReader').models()")
      expect(imageModels.ok).toBe(true)
      expect(imageModels.value.groups.length).toBeGreaterThan(0)
      const primaryImageReaderModel = OFFICIAL_BUSINESS_FIXTURE.provider.models.vision
      const imageReaderModels = imageModels.value.groups
        .find(group => group.provider === OFFICIAL_BUSINESS_FIXTURE.provider.id)?.models.map(model => model.id) ?? []
      expect(imageReaderModels).toContain(primaryImageReaderModel.id)
      expect(imageReaderModels).not.toContain(OFFICIAL_BUSINESS_FIXTURE.provider.modelId)
      browser = await connectOfficialDesktopBrowser(debuggingPort, {
        runId: run.record.runId, repositoryRoot: fixtureRepositoryRoot, config: desktopConfig,
      })
      await browser.command('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath,
        eventsEnabled: true,
      })
      downloadBehaviorEnabled = true
      await waitForValue(page, 'window.innerWidth', value => value >= 680)
      const desktopViewport = await page.evaluate(`({ width: window.innerWidth, height: window.innerHeight, deviceScaleFactor: window.devicePixelRatio, mobile: false })`)
      const desktopOrigin = await page.evaluate('window.location.origin')
      const initial = await waitForValue(
        page,
        `(() => ({
          ready: document.readyState === 'complete',
          preset: document.body.innerText.replace(/\\s+/gu, '').includes('ComfyUI工作台'),
          workspaceChooser: [...document.querySelectorAll('[role="dialog"]')]
            .some(dialog => /选择工作区目录|Select Workspace Directory/i.test(dialog.textContent ?? ''))
        }))()`,
        value => value.ready && value.preset,
      )
      expect(initial.workspaceChooser).toBe(false)
      expect(installation).toMatchObject({ status: 'installed', expectedPackageName: sourceIdentity.packageName, enabled: true })
      expect(run.record.application.version).toBe('0.2.0-rc.2')
      expect(sourceIdentity.packageVersion).toBe(packageManifest.version)

      await openPluginSettings(page)

      const imageReaderDefaultModel = OFFICIAL_BUSINESS_FIXTURE.imageReader.defaultModel
      const alternateImageReaderProvider = OFFICIAL_BUSINESS_FIXTURE.imageReader.alternateProvider
      const alternateImageReaderModel = alternateImageReaderProvider.model
      const catalog = await waitForValue(
        page,
        `(() => {
          const labels = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          const selectFor = text => labels.find(label => label.querySelector('span')?.textContent?.trim() === text)?.querySelector('select')
          const provider = selectFor('系统 Provider')
          const model = selectFor('视觉模型')
          return provider && model ? {
            provider: { value: provider.value, disabled: provider.disabled, options: [...provider.options].map(option => option.value) },
            model: { value: model.value, disabled: model.disabled, options: [...model.options].map(option => option.value) },
            alerts: [...document.querySelectorAll('.harness-comfyui-image-reader-settings [role="alert"]')].length
          } : null
        })()`,
        value => value !== null
          && value.provider.value === imageReaderDefaultModel.provider
          && value.model.value === imageReaderDefaultModel.model,
      )
      expect(catalog).toMatchObject({
        provider: {
          value: imageReaderDefaultModel.provider,
          disabled: false,
          options: expect.arrayContaining([
            imageReaderDefaultModel.provider,
            alternateImageReaderProvider.id,
          ]),
        },
        model: {
          value: imageReaderDefaultModel.model,
          disabled: false,
          options: expect.arrayContaining([imageReaderDefaultModel.model]),
        },
        alerts: 0,
      })
      expect(catalog.model.options).not.toContain(OFFICIAL_BUSINESS_FIXTURE.provider.modelId)

      await page.evaluate(`(() => {
        const label = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          .find(candidate => candidate.querySelector('span')?.textContent?.trim() === '系统 Provider')
        const provider = label?.querySelector('select')
        const modelLabel = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          .find(candidate => candidate.querySelector('span')?.textContent?.trim() === '视觉模型')
        const model = modelLabel?.querySelector('select')
        if (!provider || !model) return null
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
        setter?.call(provider, ${JSON.stringify(alternateImageReaderProvider.id)})
        provider.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      })()`)
      const alternateModelCatalog = await waitForValue(
        page,
        `(() => {
          const labels = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          const controlFor = text => labels.find(label => label.querySelector('span')?.textContent?.trim() === text)
            ?.querySelector('select')
          const provider = controlFor('系统 Provider')
          const model = controlFor('视觉模型')
          return provider && model ? {
            provider: provider.value,
            model: model.value,
            options: [...model.options].map(option => option.value),
          } : null
        })()`,
        value => value?.provider === alternateImageReaderProvider.id
          && value.model === ''
          && value.options.includes(alternateImageReaderModel.id),
      )
      expect(alternateModelCatalog.model).toBe('')
      expect(alternateModelCatalog.options).toContain(alternateImageReaderModel.id)
      expect(alternateModelCatalog.options).not.toContain(imageReaderDefaultModel.model)

      await clickImageReaderButton(page, '保存当前配置')
      await waitForValue(
        page,
        `(() => {
          const text = document.body.innerText
          return text.includes('IMAGE_READER_MODEL_REQUIRED')
            && !text.includes('IMAGE_READER_SETTINGS_INVALID')
        })()`,
        value => value === true,
      )
      const selectedModel = alternateImageReaderModel.id
      await page.evaluate(`(() => {
          const label = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
            .find(candidate => candidate.querySelector('span')?.textContent?.trim() === '视觉模型')
          const select = label?.querySelector('select')
          const option = [...(select?.options ?? [])].find(candidate => candidate.value === ${JSON.stringify(selectedModel)})
          if (!select || !option) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
          setter?.call(select, option.value)
          select.dispatchEvent(new Event('change', { bubbles: true }))
          return true
        })()`)
      await waitForValue(
        page,
        `(() => {
          const label = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
            .find(candidate => candidate.querySelector('span')?.textContent?.trim() === '视觉模型')
          const select = label?.querySelector('select')
          return select?.value ?? null
        })()`,
        value => value === selectedModel,
      )
      await clickImageReaderButton(page, '保存当前配置')
      await waitForValue(
        page,
        `document.body.innerText.includes('已保存并生效。')`,
        value => value === true,
      )

      await page.evaluate('location.reload(), true')
      await delay(300)
      await waitForValue(
        page,
        `document.readyState === 'complete' && document.body.innerText.replace(/\\s+/gu, '').includes('ComfyUI工作台')`,
        value => value === true,
      )
      await openPluginSettings(page)
      const persisted = await waitForValue(
        page,
        `(() => {
          const labels = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          const selectFor = text => labels.find(label => label.querySelector('span')?.textContent?.trim() === text)?.querySelector('select')
          const provider = selectFor('系统 Provider')
          const model = selectFor('视觉模型')
          return provider && model ? { provider: provider.value, model: model.value } : null
        })()`,
        value => value?.provider === alternateImageReaderProvider.id && value?.model === selectedModel,
      )
      expect(persisted).toEqual({ provider: alternateImageReaderProvider.id, model: selectedModel })

      const firstProfile = await page.evaluate(`(() => {
        const select = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
          ?.querySelector('select')
        return select instanceof HTMLSelectElement
          ? { id: select.value, name: select.selectedOptions[0]?.textContent?.trim() ?? '' }
          : null
      })()`)
      expect(firstProfile).toEqual(expect.objectContaining({ id: expect.any(String), name: expect.any(String) }))

      await clickImageReaderButton(page, '新建配置')
      await selectImageReaderConnection(page, 'OpenAI 兼容接口')
      await waitForValue(
        page,
        `document.querySelector('.harness-comfyui-image-reader-settings input[type="url"]') !== null`,
        value => value === true,
      )
      await setImageReaderField(page, '配置名称', 'Desktop OpenAI 视觉')
      await setImageReaderField(page, 'Chat Completions 地址', 'http://127.0.0.1:11434/v1/chat/completions')
      await setImageReaderField(page, '模型 ID', 'desktop-qwen-vl')
      await setImageReaderField(page, 'API Key（可选）', 'desktop-write-only-key')
      await setImageReaderField(page, '读图提示词', 'Desktop 已保存的默认读图提示词')
      await setImageReaderField(page, '温度', '0.65')
      await setImageReaderField(page, '最大输出 Token 数', '4096')
      await clickImageReaderButton(page, '保存当前配置')
      const saveSurface = await waitForValue(page, `(() => {
        const section = document.querySelector('.harness-comfyui-image-reader-settings')
        const text = section?.innerText ?? ''
        return {
          present: !!section,
          saved: text.includes('配置“Desktop OpenAI 视觉”已保存并生效。'),
          error: [...(section?.querySelectorAll('[role="alert"]') ?? [])]
            .map(node => node.textContent?.trim()).find(message => message?.includes('保存失败')) ?? null,
          pending: text.includes('正在保存…'),
        }
      })()`, value => value.saved || value.error !== null || !value.present, 10_000)
      if (saveSurface.error !== null) throw new Error(`OpenAI image reader profile save failed: ${saveSurface.error}`)
      if (!saveSurface.present
        || await page.evaluate(`document.querySelector('.harness-comfyui-image-reader-settings') === null`)) {
        await openPluginSettings(page)
      }
      const openAiProfile = await waitForValue(
        page,
        `(() => {
          const section = document.querySelector('.harness-comfyui-image-reader-settings')
          const labels = [...(section?.querySelectorAll('label') ?? [])]
          const controlFor = text => labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === text)
            ?.querySelector('input, textarea, select')
          const select = controlFor('当前生效配置')
          return select instanceof HTMLSelectElement ? {
            id: select.value,
            options: [...select.options].map(option => option.value),
            name: controlFor('配置名称')?.value,
            endpoint: controlFor('Chat Completions 地址')?.value,
            model: controlFor('模型 ID')?.value,
            prompt: controlFor('读图提示词')?.value,
            temperature: controlFor('温度')?.value,
            maxTokens: controlFor('最大输出 Token 数')?.value,
            errors: [...section.querySelectorAll('[role="alert"]')].map(node => node.textContent?.trim()).filter(Boolean),
          } : null
        })()`,
        value => value?.options.length === 2 && value.id !== firstProfile.id,
        10_000,
      )
      expect(openAiProfile).toMatchObject({
        name: 'Desktop OpenAI 视觉',
        endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
        model: 'desktop-qwen-vl',
        prompt: 'Desktop 已保存的默认读图提示词',
        temperature: '0.65',
        maxTokens: '4096',
        errors: [],
      })
      const profilePatch = await readOfficialProfilePatch(context.dshHome, desktopConfig, profileYamlAdapter)
      const storedImageSettings = findProfileEntry(profilePatch, settingsEntryIds.imageReader)?.config
      const storedRuntimeProfile = storedImageSettings?.configuration?.profiles
        ?.find(profile => profile.id === firstProfile.id)
      const storedOpenAiProfile = storedImageSettings?.configuration?.profiles
        ?.find(profile => profile.id === openAiProfile.id)
      expect(storedImageSettings?.imageReaderDefaultModel).toEqual(imageReaderDefaultModel)
      expect(storedImageSettings?.configuration?.activeProfileId).toBe(openAiProfile.id)
      expect(storedRuntimeProfile).toMatchObject({
        id: firstProfile.id,
        connectionType: 'runtime',
        provider: alternateImageReaderProvider.id,
        model: alternateImageReaderModel.id,
      })
      expect(storedOpenAiProfile).toMatchObject({
        id: openAiProfile.id,
        name: 'Desktop OpenAI 视觉',
        connectionType: 'openai-compatible',
        endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
        model: 'desktop-qwen-vl',
        defaultPrompt: 'Desktop 已保存的默认读图提示词',
        temperature: 0.65,
        maxTokens: 4096,
        hasApiKey: true,
      })
      expect(storedImageSettings?.credentialRefs?.[openAiProfile.id]).toMatch(/^DSH_HARNESS_COMFYUI_IMAGE_READER_/u)
      expect(storedImageSettings).not.toHaveProperty('credentials')
      expect(JSON.stringify(storedImageSettings)).not.toContain('desktop-write-only-key')

      await setImageReaderField(page, '配置名称', '')
      await setImageReaderField(page, 'Chat Completions 地址', '')
      await setImageReaderField(page, '模型 ID', '')
      await setImageReaderField(page, '读图提示词', '')
      await setImageReaderField(page, '温度', '')
      await setImageReaderField(page, '最大输出 Token 数', '')
      await selectImageReaderProfile(page, firstProfile.id)
      await waitForValue(
        page,
        `document.body.innerText.includes('请选择保存修改、放弃修改或继续编辑。')`,
        value => value === true,
      )
      await clickImageReaderButton(page, '放弃当前修改并切换')
      const switchedSurface = await waitForValue(page, `(() => {
        const section = document.querySelector('.harness-comfyui-image-reader-settings')
        if (!section) return 'unmounted'
        const profile = [...section.querySelectorAll('label')]
          .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
          ?.querySelector('select')
        return profile?.value === ${JSON.stringify(firstProfile.id)} ? 'active' : null
      })()`, value => value !== null)
      if (switchedSurface === 'active') await delay(300)
      if (switchedSurface === 'unmounted'
        || await page.evaluate(`document.querySelector('.harness-comfyui-image-reader-settings') === null`)) {
        await openPluginSettings(page)
      }
      await waitForValue(
        page,
        `(() => {
          const labels = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          const profile = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          const provider = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '系统 Provider')
            ?.querySelector('select')
          const model = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '视觉模型')
            ?.querySelector('select')
          return { profile: profile?.value, provider: provider?.value, model: model?.value,
            feedback: [...document.querySelectorAll('.harness-comfyui-image-reader-settings [role="alert"]')]
              .map(node => node.textContent?.trim()).filter(Boolean) }
        })()`,
        value => value.profile === firstProfile.id
          && value.provider === alternateImageReaderProvider.id && value.model === selectedModel,
      )

      await selectImageReaderProfile(page, openAiProfile.id)
      await waitForValue(
        page,
        `(() => {
          const select = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
            .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          return select instanceof HTMLSelectElement
            && select.value === ${JSON.stringify(openAiProfile.id)}
            && document.body.innerText.includes('配置“Desktop OpenAI 视觉”已生效。下一次图片读取将使用该配置。')
        })()`,
        value => value === true,
      )
      await closePluginSettings(page)
      await openPluginSettings(page)
      const restoredOpenAi = await waitForValue(
        page,
        `(() => {
          const labels = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          const valueFor = text => labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === text)
            ?.querySelector('input, textarea')?.value
          const credential = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === 'API Key（可选）')
          const password = credential?.querySelector('input')
          return valueFor('配置名称') === 'Desktop OpenAI 视觉' ? {
            endpoint: valueFor('Chat Completions 地址'),
            model: valueFor('模型 ID'),
            prompt: valueFor('读图提示词'),
            temperature: valueFor('温度'),
            maxTokens: valueFor('最大输出 Token 数'),
            apiKey: password?.value,
            credentialText: credential?.textContent ?? ''
          } : null
        })()`,
        value => value !== null,
      )
      expect(restoredOpenAi).toEqual({
        endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
        model: 'desktop-qwen-vl',
        prompt: 'Desktop 已保存的默认读图提示词',
        temperature: '0.65',
        maxTokens: '4096',
        apiKey: '',
        credentialText: expect.stringContaining('这份配置已经保存 API Key；留空不会修改。'),
      })

      await setImageReaderField(page, '配置名称', 'Desktop OpenAI 视觉继续编辑草稿')
      await selectImageReaderProfile(page, firstProfile.id)
      await waitForValue(
        page,
        `document.body.innerText.includes('请选择保存修改、放弃修改或继续编辑。')`,
        value => value === true,
      )
      await clickImageReaderButton(page, '继续编辑当前配置')
      await waitForValue(
        page,
        `(() => {
          const name = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
            .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '配置名称')
            ?.querySelector('input')
          return name?.value === 'Desktop OpenAI 视觉继续编辑草稿'
            && !document.body.innerText.includes('请选择保存修改、放弃修改或继续编辑。')
        })()`,
        value => value === true,
      )

      await selectImageReaderProfile(page, firstProfile.id)
      await waitForValue(
        page,
        `document.body.innerText.includes('请选择保存修改、放弃修改或继续编辑。')`,
        value => value === true,
      )
      await clickImageReaderButton(page, '放弃当前修改并切换')
      const discardedSurface = await waitForValue(
        page,
        `(() => {
          const section = document.querySelector('.harness-comfyui-image-reader-settings')
          if (!section) return 'unmounted'
          const profile = [...section.querySelectorAll('label')]
            .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          return profile?.value === ${JSON.stringify(firstProfile.id)} ? 'active' : null
        })()`,
        value => value !== null,
        10_000,
      )
      if (discardedSurface === 'unmounted'
        || await page.evaluate(`document.querySelector('.harness-comfyui-image-reader-settings') === null`)) {
        await openPluginSettings(page)
      }
      await waitForValue(
        page,
        `(() => {
          const profile = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
            .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          return profile?.value === ${JSON.stringify(firstProfile.id)}
        })()`,
        value => value === true,
      )

      await selectImageReaderProfile(page, openAiProfile.id)
      await waitForValue(
        page,
        `(() => {
          const profile = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
            .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          return profile?.value === ${JSON.stringify(openAiProfile.id)}
        })()`,
        value => value === true,
      )
      await setImageReaderField(page, '读图提示词', 'Desktop 保存并切换后的读图提示词')
      await selectImageReaderProfile(page, firstProfile.id)
      await waitForValue(
        page,
        `document.body.innerText.includes('请选择保存修改、放弃修改或继续编辑。')`,
        value => value === true,
      )
      await clickImageReaderButton(page, '保存当前修改并切换')
      await waitForValue(
        page,
        `(() => {
          const profile = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
            .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          return profile?.value === ${JSON.stringify(firstProfile.id)}
        })()`,
        value => value === true,
      )
      await selectImageReaderProfile(page, openAiProfile.id)
      await waitForValue(
        page,
        `(() => {
          const labels = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          const profile = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          const prompt = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '读图提示词')
            ?.querySelector('textarea')
          return profile?.value === ${JSON.stringify(openAiProfile.id)}
            && prompt?.value === 'Desktop 保存并切换后的读图提示词'
        })()`,
        value => value === true,
      )

      await clickImageReaderButton(page, '复制配置')
      const copiedProfile = await waitForValue(
        page,
        `(() => {
          const labels = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          const profile = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          const name = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '配置名称')
            ?.querySelector('input')
          const credential = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === 'API Key（可选）')
          const password = credential?.querySelector('input')
          return profile instanceof HTMLSelectElement && profile.options.length === 2 && name?.value.endsWith(' 副本') ? {
            activeId: profile.value,
            name: name.value,
            placeholder: password?.getAttribute('placeholder') ?? ''
          } : null
        })()`,
        value => value !== null,
      )
      expect(copiedProfile).toEqual({
        activeId: openAiProfile.id,
        name: 'Desktop OpenAI 视觉 副本',
        placeholder: '本地免鉴权接口可以留空',
      })
      await closePluginSettings(page)
      await openPluginSettings(page)
      await waitForValue(
        page,
        `(() => {
          const labels = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
          const select = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          const name = labels.find(label => label.querySelector(':scope > span')?.textContent?.trim() === '配置名称')
            ?.querySelector('input')
          return select instanceof HTMLSelectElement
            && select.value === ${JSON.stringify(openAiProfile.id)}
            && select.options.length === 2
            && name?.value === 'Desktop OpenAI 视觉'
        })()`,
        value => value === true,
      )

      await clickImageReaderButton(page, '删除配置')
      await waitForValue(
        page,
        `(() => {
          const select = [...document.querySelectorAll('.harness-comfyui-image-reader-settings label')]
            .find(label => label.querySelector(':scope > span')?.textContent?.trim() === '当前生效配置')
            ?.querySelector('select')
          return select instanceof HTMLSelectElement && select.value === ${JSON.stringify(firstProfile.id)}
            && select.options.length === 1
        })()`,
        value => value === true,
      )

      await closePluginSettings(page)
      await openBusinessSession(page, identity.sessionId)
      await page.evaluate(`window.__runPanelTestContext.sidebarRight.openTab('guide')`)
      await waitForValue(page, `document.querySelector('[data-sidebar-right-guide]') !== null`, value => value === true)
      await page.evaluate(`(document.querySelector('.harness-comfyui-sidebar-entry')?.click(), true)`)
      await waitForValue(page, `!!document.querySelector('.harness-comfyui-dock-actions')`, value => value === true)
      await verifyRunDiscovery(page, context, identity, stagedRunRepository, mediaFixture)
      await waitForValue(
        page,
        `(() => {
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.sessionId}"]')
          const tabs = [...(drawer?.querySelectorAll('button[role="tab"]') ?? [])]
          const panels = [...(drawer?.querySelectorAll('[role="tabpanel"]') ?? [])]
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '关闭结果列')
          return drawer === null ? null : {
            tabVisible: drawer.getAttribute('data-tab-visible') === 'true',
            media: drawer.textContent?.includes('2 个媒体') === true,
            tabs: tabs.map(tab => tab.textContent?.trim()),
            selected: tabs.map(tab => tab.getAttribute('aria-selected')),
            hidden: panels.map(panel => panel.hidden),
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.tabVisible === true
          && value?.media === true
          && JSON.stringify(value?.tabs) === JSON.stringify(['本会话媒体', '运行状态'])
          && JSON.stringify(value?.selected) === JSON.stringify(['true', 'false'])
          && JSON.stringify(value?.hidden) === JSON.stringify([true, false])
          && value?.toggle === '关闭结果列',
      )
      await page.evaluate(`([...document.querySelectorAll('.harness-comfyui-dock-actions button')]
        .find(node => node.textContent?.trim() === '关闭结果列')?.click(), true)`)
      await waitForValue(
        page,
        `(() => {
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.sessionId}"]')
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '打开结果列')
          return {
            drawerExists: drawer !== null,
            nativeGuideVisible: (() => {
              const guide = document.querySelector('[data-sidebar-right-guide]')
              const panel = guide?.closest('[data-sidebar-right-panel]')
              return !!guide && panel?.hasAttribute('data-sidebar-right-open') === true
                && panel.getAttribute('aria-hidden') !== 'true'
                && guide.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
            })(),
            tabVisible: drawer?.getAttribute('data-tab-visible') === 'true',
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.drawerExists === false
          && value?.nativeGuideVisible === true
          && value?.tabVisible === false
          && value?.toggle === '打开结果列',
      )
      await page.evaluate(`([...document.querySelectorAll('.harness-comfyui-dock-actions button')]
        .find(node => node.textContent?.trim() === '打开结果列')?.click(), true)`)
      await waitForValue(
        page,
        `(() => {
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.sessionId}"]')
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '关闭结果列')
          return {
            drawerExists: drawer !== null,
            tabVisible: drawer?.getAttribute('data-tab-visible') === 'true',
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.drawerExists === true
          && value?.tabVisible === true
          && value?.toggle === '关闭结果列',
      )
      await page.evaluate(`([...document.querySelectorAll('.harness-comfyui-dock-actions button')]
        .find(node => node.textContent?.trim() === '关闭结果列')?.click(), true)`)
      await waitForValue(
        page,
        `(() => {
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.sessionId}"]')
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '打开结果列')
          return {
            drawerExists: drawer !== null,
            tabVisible: drawer?.getAttribute('data-tab-visible') === 'true',
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.drawerExists === false
          && value?.tabVisible === false
          && value?.toggle === '打开结果列',
      )
      await page.evaluate(`([...document.querySelectorAll('.harness-comfyui-dock-actions button')]
        .find(node => node.textContent?.trim() === '打开结果列')?.click(), true)`)
      await waitForValue(
        page,
        `(() => {
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.sessionId}"]')
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '关闭结果列')
          return {
            drawerExists: drawer !== null,
            tabVisible: drawer?.getAttribute('data-tab-visible') === 'true',
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.drawerExists === true
          && value?.tabVisible === true
          && value?.toggle === '关闭结果列',
      )
      await openBusinessSession(page, identity.switchSessionId)
      await waitForValue(
        page,
        `(() => {
          const selected = window.__runPanelTestContext.get('sessions')
            .retainInfo("${identity.switchSessionId}").getSnapshot().retainedBy.mainView === 1
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.switchSessionId}"]')
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '打开结果列')
          return {
            selected,
            drawerExists: drawer !== null,
            tabVisible: drawer?.getAttribute('data-tab-visible') === 'true',
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.selected === true
          && value?.drawerExists === false
          && value?.tabVisible === false
          && value?.toggle === '打开结果列',
      )
      await page.evaluate(`([...document.querySelectorAll('.harness-comfyui-dock-actions button')]
        .find(node => node.textContent?.trim() === '打开结果列')?.click(), true)`)
      await waitForValue(
        page,
        `(() => {
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.switchSessionId}"]')
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '关闭结果列')
          return {
            drawerExists: drawer !== null,
            tabVisible: drawer?.getAttribute('data-tab-visible') === 'true',
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.drawerExists === true
          && value?.tabVisible === true
          && value?.toggle === '关闭结果列',
      )
      await openBusinessSession(page, identity.sessionId)
      await waitForValue(
        page,
        `(() => {
          const selected = window.__runPanelTestContext.get('sessions')
            .retainInfo("${identity.sessionId}").getSnapshot().retainedBy.mainView === 1
          const drawer = document.querySelector('.harness-comfyui-results-drawer[data-session-id="${identity.sessionId}"]')
          const toggle = [...document.querySelectorAll('.harness-comfyui-dock-actions button')]
            .find(button => button.textContent?.trim() === '关闭结果列')
          return {
            selected,
            drawerExists: drawer !== null,
            tabVisible: drawer?.getAttribute('data-tab-visible') === 'true',
            toggle: toggle?.textContent?.trim() ?? ''
          }
        })()`,
        value => value?.selected === true
          && value?.drawerExists === true
          && value?.tabVisible === true
          && value?.toggle === '关闭结果列',
      )
      await page.evaluate(`([...document.querySelectorAll('[role="tab"]')]
        .find(node => node.textContent?.trim() === '本会话媒体')?.click(), true)`)
      await waitForValue(
        page,
        `document.querySelectorAll('.harness-comfyui-media-viewer-button').length`,
        value => value === 2,
      )
      const pageTargetsBefore = await desktopPageTargetCount(debuggingPort)
      await page.evaluate(`(document.querySelector('.harness-comfyui-media-viewer-button')?.click(), true)`)
      const viewer = await waitForValue(
        page,
        `(() => {
          const dialog = document.querySelector('[role="dialog"].harness-comfyui-media-viewer-modal')
          const frame = dialog?.querySelector('.harness-comfyui-media-viewer-frame')
          return dialog && frame ? {
            modal: dialog.getAttribute('aria-modal'),
            title: frame.title,
            url: frame.getAttribute('src'),
            loaded: frame.contentDocument?.querySelector('.media-viewer') !== null,
            runId: dialog.querySelector('.harness-comfyui-media-viewer-run-id-value')?.textContent ?? '',
            downloadButton: dialog.querySelector('button[aria-label^="下载当前原文件："]')?.textContent?.trim() ?? '',
            body: frame.contentDocument?.body?.innerText ?? ''
          } : null
        })()`,
        value => value?.loaded === true,
      )
      expect(viewer).toMatchObject({
        modal: 'true',
        title: `媒体查看器：${mediaFixture.newer.filename}`,
        url: expect.stringContaining(`/api/harness-comfyui/media/${mediaFixture.newer.mediaId}/view?session_id=${identity.sessionId}`),
        runId: mediaFixture.newer.runId,
        downloadButton: '下载原文件',
      })
      expect(viewer.body).toContain(mediaFixture.newer.filename)

      await clickMainFrameElement(
        page,
        `button[aria-label=${JSON.stringify(`下载当前原文件：${mediaFixture.newer.filename}`)}]`,
      )
      await expect.soft(expectOfficialCompletedDownload(browser, {
        url: new URL(
          `/api/harness-comfyui/media/${mediaFixture.newer.mediaId}/download?session_id=${identity.sessionId}`,
          desktopOrigin,
        ).href,
        filename: mediaFixture.newer.filename,
        bytes: mediaFixture.newerGifBytes,
        byteLength: mediaFixture.newerGifBytes.length,
        downloadPath,
      })).resolves.toMatchObject({ progress: { state: 'completed' } })

      await page.evaluate(`(() => {
        window.__desktopCopiedRunIds = []
        window.__desktopClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async value => { window.__desktopCopiedRunIds.push(value) } },
        })
      })()`)
      clipboardCaptureInstalled = true
      await clickMainFrameElement(page, '.harness-comfyui-media-viewer-copy-button')
      const newerCopy = await waitForValue(
        page,
        `(() => {
          const dialog = document.querySelector('[role="dialog"].harness-comfyui-media-viewer-modal')
          return dialog ? {
            runId: dialog.querySelector('.harness-comfyui-media-viewer-run-id-value')?.textContent ?? '',
            button: dialog.querySelector('.harness-comfyui-media-viewer-copy-button')?.textContent ?? '',
            announcement: dialog.querySelector('.harness-comfyui-media-viewer-copy-announcement')?.textContent ?? ''
          } : null
        })()`,
        value => value?.button === '已复制',
      )
      expect(newerCopy).toEqual({
        runId: mediaFixture.newer.runId,
        button: '已复制',
        announcement: `已复制完整 Run ID：${mediaFixture.newer.runId}`,
      })

      await page.evaluate(`(() => {
        const frame = document.querySelector('.harness-comfyui-media-viewer-frame')
        const button = frame?.contentDocument?.querySelector('#nav-older')
        button?.click()
        return button !== null && button !== undefined
      })()`)
      await waitForValue(
        page,
        `document.querySelector('.harness-comfyui-media-viewer-run-id-value')?.textContent ?? ''`,
        value => value === mediaFixture.older.runId,
      )
      await clickMainFrameElement(
        page,
        `button[aria-label=${JSON.stringify(`下载当前原文件：${mediaFixture.older.filename}`)}]`,
      )
      await expect.soft(expectOfficialCompletedDownload(browser, {
        url: new URL(
          `/api/harness-comfyui/media/${mediaFixture.older.mediaId}/download?session_id=${identity.sessionId}`,
          desktopOrigin,
        ).href,
        filename: mediaFixture.older.filename,
        bytes: mediaFixture.olderGifBytes,
        byteLength: mediaFixture.olderGifBytes.length,
        downloadPath,
      })).resolves.toMatchObject({ progress: { state: 'completed' } })
      await clickMainFrameElement(page, '.harness-comfyui-media-viewer-copy-button')
      const olderCopy = await waitForValue(
        page,
        `(() => {
          const dialog = document.querySelector('[role="dialog"].harness-comfyui-media-viewer-modal')
          return dialog ? {
            runId: dialog.querySelector('.harness-comfyui-media-viewer-run-id-value')?.textContent ?? '',
            button: dialog.querySelector('.harness-comfyui-media-viewer-copy-button')?.textContent ?? '',
            announcement: dialog.querySelector('.harness-comfyui-media-viewer-copy-announcement')?.textContent ?? ''
          } : null
        })()`,
        value => value?.button === '已复制',
      )
      expect(olderCopy).toEqual({
        runId: mediaFixture.older.runId,
        button: '已复制',
        announcement: `已复制完整 Run ID：${mediaFixture.older.runId}`,
      })
      expect(await page.evaluate('window.__desktopCopiedRunIds')).toEqual([
        mediaFixture.newer.runId,
        mediaFixture.older.runId,
      ])

      const geometryExpression = `(() => {
        const row = document.querySelector('.harness-comfyui-media-viewer-run-id-row')
        const frame = document.querySelector('.harness-comfyui-media-viewer-frame')
        const footer = document.querySelector('.harness-comfyui-media-viewer-footer-actions')
        const dialog = document.querySelector('[role="dialog"].harness-comfyui-media-viewer-modal')
        if (!(row instanceof HTMLElement) || !(frame instanceof HTMLIFrameElement)
          || !(footer instanceof HTMLElement) || !(dialog instanceof HTMLElement)) return null
        const rowBounds = row.getBoundingClientRect()
        const frameBounds = frame.getBoundingClientRect()
        const footerBounds = footer.getBoundingClientRect()
        return {
          viewportWidth: window.innerWidth,
          rowScrollWidth: row.scrollWidth,
          rowClientWidth: row.clientWidth,
          footerScrollWidth: footer.scrollWidth,
          footerClientWidth: footer.clientWidth,
          dialogScrollWidth: dialog.scrollWidth,
          dialogClientWidth: dialog.clientWidth,
          rowOverlapsFrame: rowBounds.bottom > frameBounds.top,
          footerOverlapsFrame: frameBounds.bottom > footerBounds.top
        }
      })()`
      const desktopGeometry = await waitForValue(
        page,
        geometryExpression,
        value => value?.viewportWidth >= 680,
      )
      expect(desktopGeometry.rowScrollWidth).toBeLessThanOrEqual(desktopGeometry.rowClientWidth)
      expect(desktopGeometry.footerScrollWidth).toBeLessThanOrEqual(desktopGeometry.footerClientWidth)
      expect(desktopGeometry.dialogScrollWidth).toBeLessThanOrEqual(desktopGeometry.dialogClientWidth)
      expect(desktopGeometry.rowOverlapsFrame).toBe(false)
      expect(desktopGeometry.footerOverlapsFrame).toBe(false)

      await page.command('Emulation.setDeviceMetricsOverride', {
        width: 600, height: 800, deviceScaleFactor: 1, mobile: false,
      })
      deviceMetricsOverridden = true
      const narrowGeometry = await waitForValue(
        page,
        geometryExpression,
        value => value?.viewportWidth < 680,
      )
      expect(narrowGeometry.rowScrollWidth).toBeLessThanOrEqual(narrowGeometry.rowClientWidth)
      expect(narrowGeometry.footerScrollWidth).toBeLessThanOrEqual(narrowGeometry.footerClientWidth)
      expect(narrowGeometry.dialogScrollWidth).toBeLessThanOrEqual(narrowGeometry.dialogClientWidth)
      expect(narrowGeometry.rowOverlapsFrame).toBe(false)
      expect(narrowGeometry.footerOverlapsFrame).toBe(false)
      await delay(300)
      expect(await desktopPageTargetCount(debuggingPort)).toBe(pageTargetsBefore)
      await page.evaluate(`([...document.querySelectorAll('button')]
        .find(node => node.getAttribute('aria-label') === '关闭媒体查看器')?.click(), true)`)
      await waitForValue(
        page,
        `document.querySelector('[role="dialog"].harness-comfyui-media-viewer-modal') === null`,
        value => value === true,
      )
      await page.command('Emulation.setDeviceMetricsOverride', desktopViewport)
      await waitForValue(page, 'window.innerWidth', width => width === desktopViewport.width)
      await verifyContextDialog(page, context)
      savedBrowserPath = await verifyWorkflowBrowserSettings(page, context, desktopConfig, profileYamlAdapter)
      if (contextCaptureScript !== undefined) {
        await page.command('Page.removeScriptToEvaluateOnNewDocument', { identifier: contextCaptureScript })
        contextCaptureScript = undefined
      }
      if (deviceMetricsOverridden) {
        await page.command('Emulation.clearDeviceMetricsOverride')
        deviceMetricsOverridden = false
      }
      if (clipboardCaptureInstalled) {
        await page.evaluate(`(() => {
          if (window.__desktopClipboardDescriptor === undefined) delete navigator.clipboard
          else Object.defineProperty(navigator, 'clipboard', window.__desktopClipboardDescriptor)
          delete window.__desktopClipboardDescriptor
          delete window.__desktopCopiedRunIds
        })()`)
        clipboardCaptureInstalled = false
      }
      if (browser !== null && downloadBehaviorEnabled) {
        await browser.command('Browser.setDownloadBehavior', { behavior: 'default' })
        downloadBehaviorEnabled = false
      }
      browser?.close()
      browser = null
      await page.close()
      businessRunStopped = await stopProbe({
        runId: run.record.runId,
        repositoryRoot: fixtureRepositoryRoot,
        config: desktopConfig,
      })
      fixture.runs.find(activeRun => activeRun.runId === run.record.runId).active = false
      expect(businessRunStopped.record.state).toBe('stopped')
      expect(businessRunStopped.record.result.portsReleased).toBe(true)

      const finalRun = await startOfficialBusinessDesktop({
        repositoryRoot: fixtureRepositoryRoot,
        runId: randomUUID(),
        config: desktopConfig,
        homeDirectory: environmentRoot,
        agentsHome,
      })
      fixture.runs.push({ runId: finalRun.record.runId, config: desktopConfig, active: true, record: finalRun.record })
      context.businessEvidenceDirectory = finalRun.record.directories.evidence
      const installedPackageAfterRestart = JSON.parse(await readFile(installation.installedPackagePath, 'utf8'))
      expect(installedPackageAfterRestart).toMatchObject({
        name: 'harness-comfyui',
        version: installation.installedPackageVersion,
      })
      page = await connectOfficialDesktopPage(finalRun.record.ports.rendererCdp, {
        runId: finalRun.record.runId,
        repositoryRoot: fixtureRepositoryRoot,
        config: desktopConfig,
      })
      const finalClientLoad = await captureProjectClientContext(page, sourceIdentity, finalRun.record.directories.evidence)
      contextCaptureScript = finalClientLoad.identifier
      installation.loadedClientSourceAfterRestart = finalClientLoad.loadedClientSource
      generationRestartEvidence = await verifyGenerationAfterRestart(
        page, generationEvidence, context.businessEvidenceDirectory,
      )
      await verifyWorkflowBrowserSettings(page, context, desktopConfig, profileYamlAdapter, savedBrowserPath)
      installation.artifactComparisonsAfterRestart = await compareOfficialCandidateFiles({
        sourceIdentity,
        installedPackageRoot: dirname(installation.installedPackagePath),
      })
      await writeFile(join(context.businessEvidenceDirectory, 'official-business-result.json'), JSON.stringify({
        schemaVersion: 1,
        classification: 'automated-regression',
        acceptanceClaim: false,
        package: {
          name: sourceIdentity.packageName,
          version: sourceIdentity.packageVersion,
          sourceIdentity,
        },
        application: { version: finalRun.record.application.version },
        installation: {
          status: installation.status,
          enabled: installation.enabled,
          evidenceComplete: installation.evidenceComplete,
          packageVersion: installation.installedPackageVersion,
          packagePath: installation.installedPackagePath,
          artifactComparisons: installation.artifactComparisons,
          artifactComparisonsAfterRestart: installation.artifactComparisonsAfterRestart,
          loadedClientSource: installation.loadedClientSource,
          loadedClientSourceAfterRestart: installation.loadedClientSourceAfterRestart,
        },
        restart: {
          installationRunStopped: firstStopped.record.state === 'stopped',
          generationRunStopped: businessRunStopped.record.state === 'stopped',
          finalRunRunning: finalRun.record.state === 'running',
          generationHistoryRecovered: generationRestartEvidence.uiRunAndMediaVisible,
        },
        workspaceBoundary: outsideRepoWorkspaceProof,
        businessAssertions: [
          'preset-and-skill-scope',
          'workspace-and-user-skill-marker-retrieval',
          'disabled-kimi-ppt-model-request',
          'catalog-and-base-model-settings',
          'image-reader-settings-and-secret-storage',
          'workflow-browser-invalid-path-draft-save-and-restart',
          'saved-media-history-viewer-download-copy-responsive-layout',
          'context-dialog',
          'controlled-official-generation-through-frontend-worker-runtime-and-media-ui',
        ],
        generation: generationEvidence,
        generationAfterRestart: generationRestartEvidence,
      }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
    } catch (error) {
      const pageState = await page.evaluate(`({
        text: document.body.innerText,
        dialogs: [...document.querySelectorAll('[role="dialog"]')].map(node => node.getAttribute('aria-label')),
      })`).catch(() => null)
      const sanitize = value => String(value)
        .split(testApiKey).join('[controlled-api-key]')
        .split('official-desktop-controlled-test-key').join('[controlled-api-key]')
        .split('desktop-write-only-key').join('[controlled-image-reader-key]')
      const sanitizedError = sanitize(error)
      const sanitizedPageState = JSON.parse(sanitize(JSON.stringify(pageState)))
      const generationPrompt = promptCapture.promptSubmission
      const fixtureDiagnostics = {
        frontendEventTypes: [...new Set(promptCapture.frontendEvents.map(event => event.type))].sort(),
        comfyRequestPaths: promptCapture.comfyRequests.map(item => item.pathname),
        modelRequests: promptCapture.requestLog.map(request => ({
          path: request.path,
          model: request.body.model,
          messageRoles: (request.body.messages ?? []).map(message => message.role ?? 'unknown'),
          userTexts: (request.body.messages ?? [])
            .filter(message => message.role === 'user')
            .map(requestMessageText),
          toolNames: (request.body.tools ?? []).map(tool => tool.function?.name ?? tool.name ?? ''),
          sessionIdentityHeader: request.headers['x-deepseek-harness-session-id'] ?? null,
          headerNames: Object.keys(request.headers).sort(),
        })),
        generationPrompt: generationPrompt === null ? null : {
          promptId: generationPrompt.promptId,
          nodeTypes: Object.values(generationPrompt.body.prompt ?? {})
            .map(node => node.class_type).filter(value => typeof value === 'string'),
        },
      }
      const uiDiagnostics = await page.evaluate(`(() => {
        const candidates = [...document.querySelectorAll('button, [role], [title], [data-testid]')]
          .filter(node => /模型|推理|Qwen3\.8|GLM-5\.3|grok-4\.6|hy4-preview/iu.test([
            node.getAttribute('aria-label') ?? '', node.getAttribute('title') ?? '',
            node.textContent ?? '', node.getAttribute('data-testid') ?? ''
          ].join(' ')))
          .slice(0, 120)
        return candidates.map(node => ({
          tag: node.tagName,
          role: node.getAttribute('role'),
          ariaLabel: node.getAttribute('aria-label'),
          title: node.getAttribute('title'),
          testId: node.getAttribute('data-testid'),
          className: typeof node.className === 'string' ? node.className : '',
          text: (node.textContent ?? '').trim().slice(0, 160),
        }))
      })()`).catch(() => [])
      fixtureDiagnostics.uiCandidates = uiDiagnostics
      await writeFile(join(context.businessEvidenceDirectory, 'official-business-failure.json'),
        JSON.stringify({
          classification: 'automated-regression', acceptanceClaim: false,
          error: sanitizedError, pageState: sanitizedPageState, fixtureDiagnostics,
        }, null, 2),
        { encoding: 'utf8', mode: 0o600 })
      const failureScreenshot = await page.command('Page.captureScreenshot', { format: 'png' }).catch(() => null)
      if (failureScreenshot?.data) {
        await writeFile(join(context.businessEvidenceDirectory, 'official-business-failure.png'),
          Buffer.from(failureScreenshot.data, 'base64'), { encoding: 'binary', mode: 0o600 })
      }
      throw error
    } finally {
      if (contextCaptureScript !== undefined) {
        await page.command('Page.removeScriptToEvaluateOnNewDocument', { identifier: contextCaptureScript }).catch(() => undefined)
      }
      if (deviceMetricsOverridden) await page.command('Emulation.clearDeviceMetricsOverride').catch(() => undefined)
      if (clipboardCaptureInstalled) {
        await page.evaluate(`(() => {
          if (window.__desktopClipboardDescriptor === undefined) delete navigator.clipboard
          else Object.defineProperty(navigator, 'clipboard', window.__desktopClipboardDescriptor)
          delete window.__desktopClipboardDescriptor
          delete window.__desktopCopiedRunIds
        })()`).catch(() => undefined)
      }
      if (browser !== null && downloadBehaviorEnabled) {
        await browser.command('Browser.setDownloadBehavior', { behavior: 'default' }).catch(() => undefined)
      }
      browser?.close()
      await page.close()
    }
  }, 900_000)
})
