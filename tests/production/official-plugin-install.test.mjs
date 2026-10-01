import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import sharp from 'sharp'

import { afterEach, describe, expect, it } from 'vitest'

import { loadDesktopE2EConfig } from '../desktop/fixtures/official-desktop-probe.mjs'
import { connectDesktopPageWithTransportForTest as connectDesktopPage } from '../desktop/fixtures/renderer-cdp.mjs'
import {
  installOfficialPluginCandidate,
  loadOfficialPluginInstallConfig,
} from '../desktop/fixtures/official-plugin-install.mjs'
import {
  parseOfficialPluginInstallConfig,
  parseOfficialPluginInstallEvidence,
} from '../desktop/fixtures/official-plugin-install-schema.mjs'
import { parseDesktopE2ERunRecord } from '../../config/desktop-e2e-schema.mjs'

const temporaryRoots = new Set()
const connectedPages = new Set()
const fakePageStates = new WeakMap()
const TEST_RUN_ID = '00000000-0000-4000-8000-000000000001'
const SCREENSHOT_PNG = await sharp({
  create: { width: 1, height: 1, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
}).png().toBuffer()
const screenshotStages = ['plugins-page', 'install-dialog', 'install-result', 'enabled-bundle']

function stateFor(page) {
  return fakePageStates.get(page)
}

afterEach(async () => {
  await Promise.all([...connectedPages].map(page => page.close()))
  connectedPages.clear()
  await Promise.all([...temporaryRoots].map(root => rm(root, { recursive: true, force: true })))
  temporaryRoots.clear()
})

describe('official Desktop plugin install UI configuration', () => {
  it('loads the Chinese controls and result labels from the module-owned configuration', async () => {
    const config = await loadOfficialPluginInstallConfig()

    expect(config.ui).toMatchObject({
      pluginNavigationAriaLabel: '插件',
      addPluginButtonText: '添加插件',
      packageInputPlaceholder: '例如 dsh-plugin-whale-pet',
      installButtonText: '安装',
      enableNowButtonText: '立即启用',
      restartRequiredText: '已安装，下次启动后加载。',
      enabledBundleSwitchLabelTemplate: '启用 {name}',
    })
    expect(config.evidence.screenshots).toEqual({
      pluginsPage: 'plugins-page.png',
      installDialog: 'install-dialog.png',
      installResult: 'install-result.png',
      enabledBundle: 'enabled-bundle.png',
    })
  })

  it('rejects unknown keys, empty labels, and invalid evidence filenames', async () => {
    const config = await loadOfficialPluginInstallConfig()
    expect(() => parseOfficialPluginInstallConfig({ ...config, extra: true })).toThrow(/unexpected/u)
    expect(() => parseOfficialPluginInstallConfig({
      ...config,
      ui: { ...config.ui, installButtonText: '  ' },
    })).toThrow(/installButtonText/u)
    expect(() => parseOfficialPluginInstallConfig({
      ...config,
      evidence: { ...config.evidence, resultFilename: '../outside.json' },
    })).toThrow(/resultFilename/u)
  })
})

describe('official Desktop candidate install adapter', () => {
  it('records official UI actions, restart notice, enabled switch, and only the necessary input value', async () => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage('installed')

    const result = await installOfficialPluginCandidate({
      page,
      tarballPath: fixture.tarballPath,
      probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot,
      timeoutMs: 2_000,
      pollIntervalMs: 1,
    })

    expect(result).toMatchObject({
      status: 'installed',
      restartRequired: true,
      enabled: true,
      evidenceComplete: true,
      runId: fixture.runRecord.runId,
      rendererTarget: {
        id: page.target.id,
        type: 'page',
        socketHost: '127.0.0.1',
        socketPort: fixture.runRecord.ports.rendererCdp,
      },
    })
    expect(result.portObservations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'hostInspector',
        port: fixture.runRecord.ports.hostInspector,
        requiredForReady: false,
        status: 'unavailable',
      }),
    ]))
    expect(stateFor(page).submittedSpec).toBe(fixture.tarballPath)
    expect(stateFor(page).enableClickCount).toBe(1)
    expect(result.operations.map(operation => operation.name)).toEqual([
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
    ])

    const evidence = JSON.parse(await readFile(result.evidencePath, 'utf8'))
    expect(parseOfficialPluginInstallEvidence(evidence)).toEqual(evidence)
    expect(() => parseOfficialPluginInstallEvidence({ ...evidence, status: 'imagined-success' })).toThrow(/status/u)
    const weakenedSuccessEvidence = {
      ...evidence,
      requiredScreenshotStages: ['plugins-page'],
      screenshots: evidence.screenshots.filter(item => item.stage === 'plugins-page'),
      evidenceComplete: true,
    }
    expect(() => parseOfficialPluginInstallEvidence(weakenedSuccessEvidence))
      .toThrow(/required screenshot stages.*success|success.*screenshot stages/iu)
    expect(evidence).toMatchObject({
      status: 'installed',
      restartRequired: true,
      enabled: true,
      evidenceComplete: true,
      runId: fixture.runRecord.runId,
      tarballPath: fixture.tarballPath,
      expectedPackageName: 'harness-comfyui',
      enabledObservation: {
        hasDialog: false,
        role: 'switch',
        ariaLabel: '启用 harness-comfyui',
        ariaChecked: 'true',
        disabled: false,
        inViewport: true,
        bounds: expect.objectContaining({ top: expect.any(Number), bottom: expect.any(Number) }),
        viewport: { width: 800, height: 600 },
      },
      portObservations: expect.arrayContaining([
        expect.objectContaining({ role: 'hostInspector', status: 'unavailable', requiredForReady: false }),
      ]),
    })
    expect(evidence.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        method: 'Target.getTargetInfo',
        operation: 'verify-renderer-target',
        result: expect.objectContaining({
          id: page.target.id,
          type: 'page',
          title: 'DeepSeek Harness',
        }),
      }),
      expect.objectContaining({ method: 'Runtime.evaluate', operation: 'open-plugins-page' }),
      expect.objectContaining({ method: 'Page.captureScreenshot', operation: 'capture-install-result' }),
      expect.objectContaining({
        method: 'Runtime.evaluate',
        operation: 'fill-local-tarball',
        result: expect.objectContaining({
          snapshot: expect.objectContaining({
            inputs: expect.arrayContaining([
              expect.objectContaining({ type: 'password', placeholder: '凭据' }),
              expect.objectContaining({ placeholder: '无关字段' }),
            ]),
          }),
        }),
      }),
    ]))
    const fillOperation = evidence.operations.find(operation => operation.name === 'fill-local-tarball')
    expect(fillOperation.value).toBe(fixture.tarballPath)
    const evidenceText = JSON.stringify(evidence)
    expect(evidenceText).not.toContain('secret-password-value')
    expect(evidenceText).not.toContain('unrelated-private-value')
    expect(evidenceText).not.toContain('session-search-value')
    expect(evidence.screenshots.map(item => item.stage)).toEqual(screenshotStages)
    for (const screenshot of evidence.screenshots) {
      expect(await readFile(screenshot.path)).toEqual(SCREENSHOT_PNG)
    }
    expect(stateFor(page).commands.filter(item => item.method === 'Runtime.evaluate').every(item => item.timeoutMs > 0)).toBe(true)
    expect(stateFor(page).commands.filter(item => item.method === 'Target.getTargetInfo').every(item => item.timeoutMs > 0)).toBe(true)
    expect(stateFor(page).commands.filter(item => item.method === 'Page.captureScreenshot').every(item => item.timeoutMs > 0)).toBe(true)
  })

  it('scrolls an off-screen enabled switch into the viewport and verifies its bounds before capture', async () => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage('installed', { switchInitiallyOffscreen: true })

    const result = await installOfficialPluginCandidate({
      page,
      tarballPath: fixture.tarballPath,
      probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot,
      timeoutMs: 2_000,
      pollIntervalMs: 1,
    })

    expect(result.status).toBe('installed')
    expect(stateFor(page).scrollIntoViewCount).toBe(1)
    const observation = JSON.parse(await readFile(result.evidencePath, 'utf8')).enabledObservation
    expect(observation.inViewport).toBe(true)
    expect(observation.bounds.top).toBeGreaterThanOrEqual(0)
    expect(observation.bounds).toMatchObject({ bottom: expect.any(Number) })
    expect(observation.bounds.bottom).toBeLessThanOrEqual(observation.viewport.height)
    expect(result.operations.map(operation => operation.name)).toContain('reveal-enabled-bundle')
  })

  it('rejects a page connected to a different verified probe run before UI interaction', async () => {
    const runA = await createInstallFixture({ portBase: 24001 })
    const runB = await createInstallFixture({ portBase: 24101, runId: '00000000-0000-4000-8000-000000000002' })
    const pageB = await createFakeOfficialPage('installed', {
      targetPort: runB.runRecord.ports.rendererCdp,
      runId: runB.runRecord.runId,
    })

    const result = await installOfficialPluginCandidate({
      page: pageB,
      tarballPath: runA.tarballPath,
      probeStatus: runA.probeStatus,
      repositoryRoot: runA.repositoryRoot,
      timeoutMs: 1_000,
    })
    expect(result.status).toBe('failed')
    expect(result.reason).toMatch(/Renderer CDP socket identity|target.*port|renderer.*port|different verified Desktop run/iu)
    expect(stateFor(pageB).commands.filter(item => item.method === 'Runtime.evaluate' || item.method === 'Page.captureScreenshot'))
      .toHaveLength(0)
  })

  it('rejects a mutable Renderer target URL that disguises a Run B socket as Run A', async () => {
    const runA = await createInstallFixture({ portBase: 24001 })
    const runB = await createInstallFixture({ portBase: 24101, runId: '00000000-0000-4000-8000-000000000002' })
    const pageB = await createFakeOfficialPage('installed', {
      targetPort: runB.runRecord.ports.rendererCdp,
      runId: runB.runRecord.runId,
    })
    const actualTargetId = pageB.target.id
    pageB.target.webSocketDebuggerUrl = pageB.target.webSocketDebuggerUrl.replace(
      ':' + runB.runRecord.ports.rendererCdp + '/',
      ':' + runA.runRecord.ports.rendererCdp + '/',
    )

    const result = await installOfficialPluginCandidate({
      page: pageB,
      tarballPath: runA.tarballPath,
      probeStatus: runA.probeStatus,
      repositoryRoot: runA.repositoryRoot,
      timeoutMs: 1_000,
      pollIntervalMs: 1,
    })
    expect(result.status).toBe('failed')
    expect(result.reason).toMatch(/immutable Renderer socket identity|different verified Desktop run/iu)
    expect(result.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'verify-renderer-target', error: expect.stringMatching(/different verified Desktop run|mutable Renderer target metadata/iu) }),
    ]))
    expect(pageB.target.id).toBe(actualTargetId)
    expect(stateFor(pageB).commands).toHaveLength(0)
    expect(JSON.parse(await readFile(result.evidencePath, 'utf8'))).toMatchObject({ status: 'failed', evidenceComplete: false })
  })

  it.each(['socket-host', 'socket-port', 'socket-id', 'target-type', 'target-title', 'target-url'])('rejects a Renderer target with invalid %s metadata', async mutation => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage('installed', { targetPort: fixture.runRecord.ports.rendererCdp })
    if (mutation === 'socket-host') {
      page.target.webSocketDebuggerUrl = page.target.webSocketDebuggerUrl.replace('127.0.0.1', '192.0.2.1')
    } else if (mutation === 'socket-port') {
      page.target.webSocketDebuggerUrl = page.target.webSocketDebuggerUrl.replace(
        ':' + fixture.runRecord.ports.rendererCdp + '/',
        ':' + (fixture.runRecord.ports.rendererCdp + 1) + '/',
      )
    } else if (mutation === 'socket-id') {
      page.target.id = 'different-target-id'
    } else if (mutation === 'target-type') {
      page.target.type = 'service_worker'
    } else if (mutation === 'target-title') {
      page.target.title = 'Unrelated page'
    } else {
      page.target.url = 'https://example.com/'
    }

    const result = await installOfficialPluginCandidate({
      page,
      tarballPath: fixture.tarballPath,
      probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot,
      timeoutMs: 1_000,
    })
    expect(result.status).toBe('failed')
    expect(result.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'verify-renderer-target', error: expect.any(String) }),
    ]))
    expect(stateFor(page).commands.filter(item => item.method === 'Runtime.evaluate' || item.method === 'Page.captureScreenshot'))
      .toHaveLength(0)
  })

  it.each(['targetId', 'type', 'title', 'url'])('rejects a live CDP session whose %s differs from the exposed Renderer target', async field => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage('installed', { targetPort: fixture.runRecord.ports.rendererCdp })
    stateFor(page).socketTargetInfo[field] = field === 'targetId'
      ? 'different-live-target-id'
      : field === 'type'
        ? 'service_worker'
        : field === 'title'
          ? 'Unrelated page'
          : 'https://example.com/'

    const result = await installOfficialPluginCandidate({
      page,
      tarballPath: fixture.tarballPath,
      probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot,
      timeoutMs: 1_000,
    })
    expect(result.status).toBe('failed')
    expect(result.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'verify-renderer-target',
        expected: { id: page.target.id, type: 'page', title: 'DeepSeek Harness', url: 'dsh-app://desktop/' },
        result: {
          id: field === 'targetId' ? 'different-live-target-id' : page.target.id,
          type: field === 'type' ? 'service_worker' : 'page',
          title: field === 'title' ? 'Unrelated page' : 'DeepSeek Harness',
          url: field === 'url' ? 'https://example.com/' : 'dsh-app://desktop/',
        },
        error: expect.stringMatching(/target metadata/iu),
      }),
    ]))
    expect(stateFor(page).commands.map(item => item.method)).toEqual(['Target.getTargetInfo'])
  })

  it.each(['never', 'late'])('records Target.getTargetInfo when the live target query is %s', async targetBehavior => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage('installed', {
      targetPort: fixture.runRecord.ports.rendererCdp,
      targetBehavior,
    })

    const result = await installOfficialPluginCandidate({
      page,
      tarballPath: fixture.tarballPath,
      probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot,
      timeoutMs: 100,
    })

    expect(result.status).toBe('timed-out')
    expect(result.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        method: 'Target.getTargetInfo',
        operation: 'verify-renderer-target',
        error: expect.stringMatching(/deadline|timed out/iu),
      }),
    ]))
    expect(JSON.parse(await readFile(result.evidencePath, 'utf8'))).toMatchObject({
      status: 'timed-out',
      requests: expect.arrayContaining([expect.objectContaining({ operation: 'verify-renderer-target', error: expect.any(String) })]),
    })
  })

  it('records an evidence result and issues no command for an unbranded page', async () => {
    const fixture = await createInstallFixture()
    let commandCount = 0

    const result = await installOfficialPluginCandidate({
      page: { target: {}, command: async () => { commandCount += 1; return {} } },
      tarballPath: fixture.tarballPath,
      probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot,
      timeoutMs: 1_000,
    })

    expect(result.status).toBe('failed')
    expect(result.rendererTarget).toBeNull()
    expect(result.evidenceComplete).toBe(false)
    expect(commandCount).toBe(0)
    expect(JSON.parse(await readFile(result.evidencePath, 'utf8'))).toMatchObject({
      status: 'failed',
      rendererTarget: null,
      evidenceComplete: false,
    })
  })

  it.each([
    ['already-installed', 'already-installed'],
    ['refused', 'refused'],
    ['failed', 'failed'],
    ['unknown', 'unknown'],
    ['no-new-dependency', 'no-new-dependency'],
  ])('preserves the official %s result without enabling anything', async (uiOutcome, expectedStatus) => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage(uiOutcome)

    const result = await installOfficialPluginCandidate({
      page,
      tarballPath: fixture.tarballPath,
      probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot,
      timeoutMs: 1_000,
      pollIntervalMs: 1,
    })

    expect(result.status).toBe(expectedStatus)
    expect(result.enabled).toBe(false)
    expect(result.restartRequired).toBe(false)
    expect(stateFor(page).enableClickCount).toBe(0)
    expect(JSON.parse(await readFile(result.evidencePath, 'utf8')).status).toBe(expectedStatus)
    expect(result.screenshots.map(screenshot => screenshot.stage)).toContain('install-result')
  })

  it('returns a bounded timeout when the official dialog stays in progress', async () => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage('pending')

    const result = await installOfficialPluginCandidate({
      page,
      tarballPath: fixture.tarballPath,
      probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot,
      timeoutMs: 40,
      pollIntervalMs: 2,
    })

    expect(result.status).toBe('timed-out')
    expect(result.enabled).toBe(false)
    expect(JSON.parse(await readFile(result.evidencePath, 'utf8')).status).toBe('timed-out')
  })

  it.each(['never', 'late'])('bounds a Runtime.evaluate that is %s and ignores any late response', async behavior => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage('installed', { evaluateBehavior: behavior })

    const result = await installOfficialPluginCandidate({
      page,
      tarballPath: fixture.tarballPath,
      probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot,
      timeoutMs: 300,
      pollIntervalMs: 1,
    })

    expect(result.status).toBe('timed-out')
    expect(result.enabled).toBe(false)
    expect(result.requests.find(request => request.operation === 'inspect-current-page')).toMatchObject({
      method: 'Runtime.evaluate',
      operation: 'inspect-current-page',
      error: expect.stringMatching(/deadline|timed out/iu),
    })
      expect(stateFor(page).enableClickCount).toBe(0)
  })

  it.each(['throw', 'empty', 'invalid-png', 'signature-only', 'truncated-png', 'write-failure'])(
    'does not report success when mandatory screenshot evidence has %s',
    async failure => {
      const fixture = await createInstallFixture()
      const page = await createFakeOfficialPage('installed', { screenshotFailure: failure })
      if (failure === 'write-failure') {
        await writeFile(join(fixture.evidenceDirectory, 'plugins-page.png'), 'existing evidence')
      }

      const result = await installOfficialPluginCandidate({
        page,
        tarballPath: fixture.tarballPath,
        probeStatus: fixture.probeStatus,
        repositoryRoot: fixture.repositoryRoot,
        timeoutMs: 1_000,
        pollIntervalMs: 1,
      })

      expect(result.status).toBe('evidence-incomplete')
      expect(result.enabled).toBe(true)
      expect(result.evidenceComplete).toBe(false)
      expect(result.evidenceErrors).toEqual(expect.arrayContaining([
        expect.objectContaining({ phase: 'capture-plugins-page' }),
      ]))
      expect(JSON.parse(await readFile(result.evidencePath, 'utf8'))).toMatchObject({
        status: 'evidence-incomplete',
        enabled: true,
        evidenceComplete: false,
      })
    },
  )

  it.each(['never', 'late'])('bounds a Page.captureScreenshot that is %s', async behavior => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage('installed', { screenshotBehavior: behavior })

    const result = await installOfficialPluginCandidate({
      page,
      tarballPath: fixture.tarballPath,
      probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot,
      timeoutMs: 300,
      pollIntervalMs: 1,
    })

    expect(result.status).toBe('timed-out')
    expect(result.enabled).toBe(false)
    expect(result.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        method: 'Page.captureScreenshot',
        operation: 'capture-plugins-page',
        error: expect.stringMatching(/deadline|timed out/iu),
      }),
    ]))
  })

  it('reports an enable timeout when the official switch never confirms checked state', async () => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage('enable-timeout')

    const result = await installOfficialPluginCandidate({
      page,
      tarballPath: fixture.tarballPath,
      probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot,
      timeoutMs: 5_000,
      pollIntervalMs: 1,
    })

    expect(result.status).toBe('enable-timeout')
    expect(result.enabled).toBe(false)
    expect(stateFor(page).enableClickCount).toBe(1)
    expect(result.enabledObservation).toMatchObject({ hasDialog: false, ariaChecked: null })
  }, 8_000)

  it('reports an enable timeout when its pending confirmation CDP request exhausts the deadline', async () => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage('enable-timeout', { enableObservationNeverResponds: true })
    const result = await installOfficialPluginCandidate({
      page,
      tarballPath: fixture.tarballPath,
      probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot,
      timeoutMs: 300,
      pollIntervalMs: 1,
    })
    expect(result.status).toBe('enable-timeout')
    expect(result.phase).toBe('waiting-for-enabled-bundle')
    expect(result.enabled).toBe(false)
    expect(stateFor(page).enableClickCount).toBe(1)
    expect(result.enabledObservation).toMatchObject({ hasDialog: false, ariaChecked: null })
    expect(result.requests).toContainEqual(expect.objectContaining({
      operation: 'wait-for-enabled-bundle-control', error: expect.stringMatching(/deadline|timed out/iu),
    }))
  })

  it('preserves confirmed installation when the Enable now request times out', async () => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage('installed', { enableActionNeverResponds: true })
    const result = await installOfficialPluginCandidate({
      page, tarballPath: fixture.tarballPath, probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot, timeoutMs: 300, pollIntervalMs: 1,
    })
    expect(result.status).toBe('enable-timeout')
    expect(result.phase).toBe('enabling-bundle')
    expect(result.enabled).toBe(false)
    expect(result.requests).toContainEqual(expect.objectContaining({
      operation: 'enable-installed-bundle', error: expect.stringMatching(/deadline|timed out/iu),
    }))
    expect(result.screenshots.map(item => item.stage)).toEqual(['plugins-page', 'install-dialog', 'install-result'])
  })

  it('preserves confirmed enabled state while reporting incomplete final screenshot evidence', async () => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage('installed', { enabledScreenshotNeverResponds: true })
    const result = await installOfficialPluginCandidate({
      page, tarballPath: fixture.tarballPath, probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot, timeoutMs: 300, pollIntervalMs: 1,
    })
    expect(result.status).toBe('evidence-incomplete')
    expect(result.enabled).toBe(true)
    expect(result.evidenceComplete).toBe(false)
    expect(result.enabledObservation).toMatchObject({ ariaChecked: 'true' })
    expect(result.evidenceErrors).toContainEqual(expect.objectContaining({ phase: 'capture-enabled-bundle' }))
    expect(JSON.parse(await readFile(result.evidencePath, 'utf8'))).toMatchObject({
      status: 'evidence-incomplete', enabled: true, evidenceComplete: false,
    })
  })

  it.each(['navigation', 'install', 'package-input', 'enabled-switch'])('stops when the official %s control is ambiguous', async ambiguousControl => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage('installed', { ambiguousControl })

    const result = await installOfficialPluginCandidate({
      page,
      tarballPath: fixture.tarballPath,
      probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot,
      timeoutMs: 1_000,
      pollIntervalMs: 1,
    })

    expect(result.status).toBe('failed')
    if (ambiguousControl === 'enabled-switch') {
      expect(result.reason).toContain('ambiguous')
      expect(result.status).toBe('failed')
      expect(stateFor(page).enableClickCount).toBe(1)
      return
    }
    expect(result.reason).toContain('ambiguous')
    expect(stateFor(page).submittedSpec).toBeUndefined()
    expect(stateFor(page).enableClickCount).toBe(0)
  })

  it('validates tarball, verified probe status, evidence ownership, and time bounds before UI interaction', async () => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage('installed')
    const base = {
      page,
      tarballPath: fixture.tarballPath,
      probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot,
    }

    await expect(installOfficialPluginCandidate({ ...base, tarballPath: '/missing/candidate.tgz' }))
      .rejects.toThrow(/regular tarball file/u)
    await expect(installOfficialPluginCandidate({ ...base, timeoutMs: 0 }))
      .rejects.toThrow(/timeoutMs/u)
    await expect(installOfficialPluginCandidate({ ...base, pollIntervalMs: 300_001 }))
      .rejects.toThrow(/pollIntervalMs/u)
    await expect(installOfficialPluginCandidate({ ...base, probeStatus: undefined }))
      .rejects.toThrow(/probeStatus/u)
    await expect(installOfficialPluginCandidate({
      ...base,
      probeStatus: { ...fixture.probeStatus, processGroupMatchesRun: false },
    })).rejects.toThrow(/process group/u)
    await expect(installOfficialPluginCandidate({
      ...base,
      probeStatus: {
        ...fixture.probeStatus,
        ports: fixture.probeStatus.ports.map(owner => ({ ...owner, pids: [] })),
      },
    })).rejects.toThrow(/port/u)
    expect(stateFor(page).commands).toHaveLength(0)
  })

  it('allows an unused optional reserved port and rejects a foreign owner of that port', async () => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage('installed', { targetPort: fixture.runRecord.ports.rendererCdp })
    const inspectorPort = fixture.runRecord.ports.hostInspector
    const inspector = fixture.probeStatus.ports.find(owner => owner.port === inspectorPort)
    expect(inspector.pids).toEqual([])

    const result = await installOfficialPluginCandidate({
      page,
      tarballPath: fixture.tarballPath,
      probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot,
      timeoutMs: 2_000,
      pollIntervalMs: 1,
    })
    expect(result.portObservations).toContainEqual({
      role: 'hostInspector',
      port: inspectorPort,
      requiredForReady: false,
      status: 'unavailable',
    })

    const foreignFixture = await createInstallFixture({ portBase: 24201 })
    const foreignPort = foreignFixture.runRecord.ports.hostInspector
    foreignFixture.probeStatus.ports.find(owner => owner.port === foreignPort).pids.push(process.pid + 1)
    const foreignPage = await createFakeOfficialPage('installed', { targetPort: foreignFixture.runRecord.ports.rendererCdp })
    await expect(installOfficialPluginCandidate({
      page: foreignPage,
      tarballPath: foreignFixture.tarballPath,
      probeStatus: foreignFixture.probeStatus,
      repositoryRoot: foreignFixture.repositoryRoot,
      timeoutMs: 1_000,
    })).rejects.toThrow(/foreign owner|port .*owned/u)
    expect(stateFor(foreignPage).commands).toHaveLength(0)
  })

  it('rejects a symlink in the verified run evidence path before UI interaction', async () => {
    const fixture = await createInstallFixture()
    const page = await createFakeOfficialPage('installed')
    await rm(fixture.evidenceDirectory, { recursive: true })
    await symlink(fixture.repositoryRoot, fixture.evidenceDirectory)

    await expect(installOfficialPluginCandidate({
      page,
      tarballPath: fixture.tarballPath,
      probeStatus: fixture.probeStatus,
      repositoryRoot: fixture.repositoryRoot,
      timeoutMs: 1_000,
    })).rejects.toThrow(/symbolic link/u)
    expect(stateFor(page).commands).toHaveLength(0)
  })
})

async function createInstallFixture({ portBase = 23001, runId = TEST_RUN_ID } = {}) {
  const repositoryRoot = await realpath(await mkdtemp(join(tmpdir(), 'official-plugin-install-')))
  temporaryRoots.add(repositoryRoot)
  const config = await loadDesktopE2EConfig()
  const runDirectory = join(repositoryRoot, config.paths.runRootRelativePath, runId)
  const directories = {
    run: runDirectory,
    dshHome: join(runDirectory, config.paths.directoryNames.dshHome),
    electronUserData: join(runDirectory, config.paths.directoryNames.electronUserData),
    workspace: join(runDirectory, config.paths.directoryNames.workspace),
    logs: join(runDirectory, config.paths.directoryNames.logs),
    evidence: join(runDirectory, config.paths.directoryNames.evidence),
  }
  directories.profile = join(directories.dshHome, config.paths.profileRelativePath)
  directories.diagnosticFile = join(directories.logs, config.paths.diagnosticFilename)
  for (const directory of Object.values(directories)) {
    if (directory !== directories.diagnosticFile) await mkdir(directory, { recursive: true })
  }

  const tarballPath = join(repositoryRoot, 'harness-comfyui-0.44.3.tgz')
  await writeFile(tarballPath, 'test fixture tarball')
  const ports = { host: portBase, rendererCdp: portBase + 1, hostInspector: portBase + 2 }
  const arguments_ = config.invocation.arguments.map(argument => argument
    .replaceAll('{electronUserData}', directories.electronUserData)
    .replaceAll('{rendererCdpPort}', String(ports.rendererCdp))
    .replaceAll('{loopbackHost}', config.ports.host))
  const timestamp = new Date().toISOString()
  const application = {
    bundlePath: config.application.bundlePath,
    executablePath: join(config.application.bundlePath, config.application.executableRelativePath),
    version: config.application.version,
    bundleId: config.application.bundleId,
  }
  const command = [application.executablePath, ...arguments_].join(' ')
  const record = parseDesktopE2ERunRecord({
    schemaVersion: 1,
    runId,
    mode: 'fresh',
    state: 'running',
    createdAt: timestamp,
    updatedAt: timestamp,
    application,
    directories,
    environment: { root: null, leasePath: null },
    ports,
    launch: { arguments: arguments_, environment: {}, unsetEnvironmentNames: [] },
    process: {
      pid: process.pid,
      processGroupId: process.pid,
      command,
      workingDirectory: directories.workspace,
      observedAt: timestamp,
      listeningPorts: config.ports.requiredForReady.map(role => ports[role]),
    },
    result: null,
  }, config)
  const recordPath = join(runDirectory, config.paths.runRecordFilename)
  await writeFile(recordPath, JSON.stringify(record))
  const processGroup = {
    processGroupId: process.pid,
    members: [{
      pid: process.pid,
      parentPid: 1,
      processGroupId: process.pid,
      command,
      workingDirectory: directories.workspace,
      listeningPorts: config.ports.requiredForReady.map(role => ports[role]),
    }],
  }
  const probeStatus = {
    record,
    recordPath,
    processGroupMatchesRun: true,
    processGroup,
    ports: Object.values(ports).map(port => ({
      port,
      pids: config.ports.requiredForReady.some(role => ports[role] === port) ? [process.pid] : [],
    })),
    developmentEnvironment: null,
  }
  return {
    repositoryRoot,
    runRecord: record,
    probeStatus,
    evidenceDirectory: directories.evidence,
    tarballPath,
    desktopConfig: config,
  }
}

async function createFakeOfficialPage(outcome, options = {}) {
  const fixture = new FakeOfficialPage(outcome, options)
  const fakeTransport = {
    onCommand: command => {
      fixture.commands.push(command)
      fixture.nextCommandTimeoutMs = command.timeoutMs
    },
    fetch: async url => {
      const pathname = new URL(String(url)).pathname
      if (pathname !== '/json/list') return { ok: false, status: 404, redirected: false, url: String(url), json: async () => null }
      return { ok: true, status: 200, redirected: false, url: String(url), json: async () => [fixture.target] }
    },
    WebSocket: class extends EventTarget {
      constructor(url) {
        super()
        this.url = url
        this.readyState = 0
        queueMicrotask(() => {
          this.readyState = 1
          this.dispatchEvent(new Event('open'))
        })
      }

      send(payload) {
        const request = JSON.parse(payload)
        const response = fixture.respondToCommand(request.method, request.params, fixture.nextCommandTimeoutMs)
        if (response === null) return
        Promise.resolve(response).then(result => {
          const event = new Event('message')
          Object.defineProperty(event, 'data', {
            value: JSON.stringify(result.error === undefined
              ? { id: request.id, result }
              : { id: request.id, error: result.error }),
          })
          this.dispatchEvent(event)
        })
      }

      close() {
        if (this.readyState === 3) return
        this.readyState = 3
        this.dispatchEvent(new Event('close'))
      }
    },
  }
  const page = await connectDesktopPage(fixture.targetPort, {
    runId: fixture.runId,
    transport: fakeTransport,
    timeoutMs: 1_000,
  })
  fakePageStates.set(page, fixture)
  connectedPages.add(page)
  return page
}

class FakeOfficialPage {
  constructor(outcome, {
    evaluateBehavior = null,
    screenshotBehavior = null,
    screenshotFailure = null,
    ambiguousControl = null,
    targetPort = 23002,
    runId = TEST_RUN_ID,
    targetBehavior = null,
    switchInitiallyOffscreen = false,
    enableObservationNeverResponds = false,
    enableActionNeverResponds = false,
    enabledScreenshotNeverResponds = false,
  } = {}) {
    this.outcome = outcome
    this.enableObservationNeverResponds = enableObservationNeverResponds
    this.enableActionNeverResponds = enableActionNeverResponds
    this.enabledScreenshotNeverResponds = enabledScreenshotNeverResponds
    this.evaluateBehavior = evaluateBehavior
    this.screenshotBehavior = screenshotBehavior
    this.screenshotFailure = screenshotFailure
    this.ambiguousControl = ambiguousControl
    this.switchInitiallyOffscreen = switchInitiallyOffscreen
    this.switchInViewport = !switchInitiallyOffscreen
    this.scrollIntoViewCount = 0
    this.state = 'home'
    this.submittedSpec = undefined
    this.enableClickCount = 0
    this.evaluations = []
    this.commands = []
    this.packageInput = null
    this.targetPort = targetPort
    this.runId = runId
    this.targetBehavior = targetBehavior
    this.document = new FakeDocument(this)
    const targetId = 'page-' + targetPort
    this.target = {
      id: targetId,
      type: 'page',
      title: 'DeepSeek Harness',
      url: 'dsh-app://desktop/',
      webSocketDebuggerUrl: 'ws://127.0.0.1:' + targetPort + '/devtools/page/' + targetId,
    }
    this.socketTargetInfo = {
      targetId,
      type: this.target.type,
      title: this.target.title,
      url: this.target.url,
    }
  }

  respondToCommand(method, params, timeoutMs) {
    if (method === 'Target.getTargetInfo') {
      if (this.targetBehavior === 'never') return null
      if (this.targetBehavior === 'late') return delay(timeoutMs + 10).then(() => ({ targetInfo: { ...this.socketTargetInfo } }))
      return { targetInfo: { ...this.socketTargetInfo } }
    }
    if (method === 'Runtime.evaluate') {
      if (this.enableActionNeverResponds && this.state === 'installed' && params.expression.includes('"type":"click-button"')) return null
      if (this.enableObservationNeverResponds && this.state === 'enable-pending') return null
      this.evaluations.push(params.expression)
      if (this.evaluateBehavior === 'never') return null
      const response = () => {
        const value = runInNewContext(params.expression, {
          document: this.document,
          HTMLInputElement: FakeInput,
          Event: FakeEvent,
          innerWidth: 800,
          innerHeight: 600,
        })
        return { result: { type: 'object', value: JSON.parse(JSON.stringify(value)) } }
      }
      if (this.evaluateBehavior === 'late') return delay(timeoutMs + 10).then(response)
      return response()
    }
    if (method !== 'Page.captureScreenshot') return { error: { code: -32601, message: 'unexpected CDP command ' + method } }
    if (this.enabledScreenshotNeverResponds && this.state === 'enabled') return null
    if (this.screenshotBehavior === 'never') return null
    if (this.screenshotBehavior === 'late') {
      return delay(timeoutMs + 10).then(() => ({ data: SCREENSHOT_PNG.toString('base64') }))
    }
    if (this.screenshotFailure === 'throw') return { error: { code: -32000, message: 'simulated screenshot command failure' } }
    if (this.screenshotFailure === 'empty') return { data: '' }
    if (this.screenshotFailure === 'invalid-png') return { data: Buffer.from('not a PNG').toString('base64') }
    if (this.screenshotFailure === 'signature-only') return { data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64') }
    if (this.screenshotFailure === 'truncated-png') return { data: SCREENSHOT_PNG.subarray(0, SCREENSHOT_PNG.length - 12).toString('base64') }
    return { data: SCREENSHOT_PNG.toString('base64') }
  }

  hasDialog() {
    return ['dialog', 'pending', 'already-installed', 'refused', 'installed', 'failed', 'unknown', 'no-new-dependency'].includes(this.state)
  }

  currentText() {
    if (this.state === 'home') return '新会话'
    if (this.state === 'plugins' || this.state === 'enabled') return '插件\n添加插件'
    if (this.state === 'dialog') return '添加插件\n输入插件的包名、GitHub 仓库地址或本地目录路径。\n安装'
    if (this.state === 'pending') return '插件安装中…'
    if (this.state === 'already-installed') return '添加插件\n该插件已安装。如需升级，请卸载后重新安装'
    if (this.state === 'refused') return '添加插件\n无法识别这个包名或地址'
    if (this.state === 'installed') return '已安装\n已安装，下次启动后加载。\n立即启用'
    if (this.state === 'enable-pending') return '插件\n添加插件'
    if (this.state === 'failed') return '插件安装失败\n安装超时'
    if (this.state === 'unknown') return '未能获取安装结果'
    if (this.state === 'no-new-dependency') return '安装完成，没有新增依赖。'
    return '插件\n添加插件'
  }

  currentButtons() {
    const nav = new FakeElement(this, {
      tagName: 'button',
      textContent: '插件',
      attributes: { 'aria-label': '插件' },
      onClick: () => { this.state = 'plugins' },
    })
    if (this.state === 'home') {
      if (this.ambiguousControl === 'navigation') return [nav, new FakeElement(this, {
        tagName: 'button',
        textContent: '插件',
        attributes: { 'aria-label': '插件' },
      })]
      return [nav]
    }
    const add = new FakeElement(this, {
      tagName: 'button',
      textContent: '添加插件',
      onClick: () => { this.state = 'dialog' },
    })
    if (this.state === 'plugins' || this.state === 'enable-pending') return [nav, add]
    if (this.state === 'enabled') {
      const switchControl = new FakeElement(this, {
        tagName: 'button',
        attributes: { 'aria-label': '启用 harness-comfyui', role: 'switch', 'aria-checked': 'true' },
      })
      return [
        nav,
        add,
        switchControl,
        ...(this.ambiguousControl === 'enabled-switch' ? [new FakeElement(this, {
          tagName: 'button',
          attributes: { 'aria-label': '启用 harness-comfyui', role: 'switch', 'aria-checked': 'true' },
        })] : []),
      ]
    }
    if (this.state === 'dialog' || this.state === 'already-installed' || this.state === 'refused') {
      return [
        nav,
        add,
        new FakeElement(this, { tagName: 'button', attributes: { 'aria-label': '关闭' } }),
        new FakeElement(this, { tagName: 'button', textContent: '安装', onClick: () => this.submitInstall() }),
        ...(this.ambiguousControl === 'install' ? [new FakeElement(this, { tagName: 'button', textContent: '安装' })] : []),
      ]
    }
    if (this.state === 'installed') {
      return [
        nav,
        add,
        new FakeElement(this, { tagName: 'button', textContent: '立即启用', onClick: () => this.enableBundle() }),
      ]
    }
    if (this.state === 'failed') return [nav, add, new FakeElement(this, { tagName: 'button', textContent: '重试' })]
    return [nav, add]
  }

  currentInputs() {
    if (!this.hasDialog() || ['pending', 'installed', 'failed', 'unknown', 'no-new-dependency'].includes(this.state)) return []
    this.packageInput ??= new FakeInput(this, {
      placeholder: '例如 dsh-plugin-whale-pet',
      value: '',
    })
    return [
      new FakeInput(this, { placeholder: '搜索会话名称', value: 'session-search-value' }),
      new FakeInput(this, { type: 'password', placeholder: '凭据', value: 'secret-password-value' }),
      new FakeInput(this, { placeholder: '无关字段', value: 'unrelated-private-value' }),
      this.packageInput,
      ...(this.ambiguousControl === 'package-input'
        ? [new FakeInput(this, { placeholder: '例如 dsh-plugin-whale-pet' })]
        : []),
    ]
  }

  currentAlerts() {
    const text = this.state === 'already-installed'
      ? '该插件已安装。如需升级，请卸载后重新安装'
      : this.state === 'refused'
        ? '无法识别这个包名或地址：未找到相关插件'
        : this.state === 'failed'
          ? '插件安装失败'
          : ''
    return text === '' ? [] : [new FakeElement(this, { tagName: 'p', textContent: text, attributes: { role: 'alert' } })]
  }

  currentSwitches() { return this.currentButtons().filter(button => button.getAttribute('role') === 'switch') }

  submitInstall() {
    this.submittedSpec = this.packageInput?.value
    if (this.outcome === 'installed' || this.outcome === 'enable-timeout') this.state = 'installed'
    else if (this.outcome === 'pending') this.state = 'pending'
    else this.state = this.outcome
  }

  enableBundle() {
    this.enableClickCount += 1
    this.state = this.outcome === 'enable-timeout' ? 'enable-pending' : 'enabled'
  }
}

class FakeEvent {
  constructor(type) { this.type = type }
}

class FakeElement {
  constructor(page, { tagName, textContent = '', attributes = {}, disabled = false, onClick = () => {} }) {
    this.page = page
    this.tagName = tagName.toUpperCase()
    this.textContent = textContent
    this.attributes = attributes
    this.disabled = disabled
    this.onClick = onClick
  }

  getAttribute(name) { return this.attributes[name] ?? null }
  getClientRects() { return [1] }
  getBoundingClientRect() {
    const offscreen = this.getAttribute('role') === 'switch'
      && this.page.switchInitiallyOffscreen
      && !this.page.switchInViewport
    const top = offscreen ? 900 : 20
    const left = 20
    const width = 100
    const height = 24
    return { top, left, right: left + width, bottom: top + height, width, height }
  }
  scrollIntoView() {
    if (this.getAttribute('role') === 'switch') {
      this.page.switchInViewport = true
      this.page.scrollIntoViewCount += 1
    }
  }
  click() { if (!this.disabled) this.onClick() }
}

class FakeInput extends FakeElement {
  constructor(page, properties) {
    super(page, { ...properties, tagName: 'input' })
    this.type = properties.type ?? 'text'
    this.placeholder = properties.placeholder ?? ''
    this.value = properties.value ?? ''
    this.disabled = properties.disabled ?? false
  }

  get value() { return this._value ?? '' }
  set value(value) { this._value = String(value) }

  dispatchEvent() { return true }
}

class FakeDocument {
  constructor(page) { this.page = page }

  get body() { return { innerText: this.page.currentText() } }
  get documentElement() { return { clientWidth: 800, clientHeight: 600 } }

  querySelectorAll(selector) {
    if (selector === 'button') return this.page.currentButtons()
    if (selector === 'button, [role="switch"]') return this.page.currentButtons()
    if (selector === 'input') return this.page.currentInputs()
    if (selector === '[role="alert"]') return this.page.currentAlerts()
    if (selector === '[role="alert"], [role="status"]') return this.page.currentAlerts()
    if (selector === '[role="switch"]') return this.page.currentSwitches()
    return []
  }

  querySelector(selector) {
    if (selector === '[role="dialog"]') return this.page.hasDialog() ? new FakeDialog(this.page) : null
    return this.querySelectorAll(selector)[0] ?? null
  }
}

class FakeDialog extends FakeElement {
  constructor(page) {
    super(page, { tagName: 'div', textContent: page.currentText(), attributes: { role: 'dialog' } })
  }

  querySelectorAll(selector) {
    if (selector === '[role="alert"]') return this.page.currentAlerts()
    if (selector === '[role="alert"], [role="status"]') return this.page.currentAlerts()
    return []
  }
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}
