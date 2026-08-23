import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createProfileFixture } from '../../src/testing/profile-fixture.ts'

const fixtures: Array<Awaited<ReturnType<typeof createProfileFixture>>> = []
const scratchDirectories: string[] = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
  await Promise.all(scratchDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

const inspectHarnessPage = `(async () => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const probe = window.__HARNESS_BROWSER_PROBE__;
    const context = probe?.contexts?.['harness-comfyui'];
    const snapshot = context?.sessions?.list?.getSnapshot?.();
    const sessions = snapshot?.ids?.map(id => snapshot.byId?.[id]).filter(session => session !== undefined) ?? [];
    const eligibleSessions = sessions.filter(session => session.origin !== 'subagent' && session.agentPreset === 'harness-comfyui');
    const currentSession = snapshot?.current === undefined ? undefined : snapshot.byId?.[snapshot.current];
    if (
      snapshot?.phase === 'ready'
      && eligibleSessions.length === 1
      && currentSession !== undefined
      && currentSession.origin !== 'subagent'
      && currentSession.agentPreset === 'harness-comfyui'
      && currentSession.id === eligibleSessions[0].id
    ) {
      return {
        bodyText: document.body?.innerText ?? '',
        buttons: [...document.querySelectorAll('button')].map(button => button.innerText),
        sessionIds: [...snapshot.ids].sort(),
        eligibleSessions: eligibleSessions.map(session => ({
          id: session.id,
          agentPreset: session.agentPreset,
          origin: session.origin,
        })),
        currentSessionId: currentSession.id,
        currentAgentPreset: currentSession.agentPreset,
        currentOrigin: currentSession.origin,
        serviceKeys: Object.keys(context?.sessions ?? {}),
      };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Harness Session list did not converge to one project Session within 10 seconds');
})()`

describe('Issue 17 real Harness workbench Session binding browser seam', () => {
  it('creates one preset Session and keeps the same current Session across a fresh browser connection', async () => {
    const fixture = await createProfileFixture({ configuration: 'test' })
    fixtures.push(fixture)
    const scratch = await mkdtemp(join(tmpdir(), 'harness-comfyui-issue17-e2e-'))
    scratchDirectories.push(scratch)

    await fixture.install()
    await fixture.start()
    const browser = await fixture.runRealBrowserProbe({
      viewport: { width: 1440, height: 1000 },
      scenarioScript: inspectHarnessPage,
      screenshotPath: join(scratch, 'workbench.png'),
    })

    const result = browser.scenarioResult as {
      bodyText: string
      buttons: string[]
      sessionIds: string[]
      eligibleSessions: Array<{
        id: string
        agentPreset: string | undefined
        origin: string | undefined
      }>
      currentSessionId: string
      currentAgentPreset: string | undefined
      currentOrigin: string | undefined
      serviceKeys: string[]
    }
    expect(browser.screenshot).toMatchObject({
      path: join(scratch, 'workbench.png'),
      viewport: { width: 1440, height: 1000 },
    })
    expect((await readFile(join(scratch, 'workbench.png'))).subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
    expect(result.bodyText).toContain('生成工作台')
    expect(result.eligibleSessions).toHaveLength(1)
    expect(result.currentSessionId).toBe(result.eligibleSessions[0]?.id)
    expect(result.eligibleSessions[0]?.agentPreset).toBe('harness-comfyui')
    expect(result.eligibleSessions[0]?.origin).not.toBe('subagent')
    expect(result.currentAgentPreset).toBe('harness-comfyui')
    expect(result.currentOrigin).not.toBe('subagent')
    expect(result.serviceKeys).toContain('list')
    expect(browser.consoleErrors).toEqual([])
    expect(browser.runtimeExceptions).toEqual([])

    const reconnect = await fixture.runRealBrowserProbe({
      viewport: { width: 1440, height: 1000 },
      scenarioScript: inspectHarnessPage,
    })
    const reconnectResult = reconnect.scenarioResult as typeof result
    expect(reconnectResult.bodyText).toContain('生成工作台')
    expect(reconnectResult.sessionIds).toEqual(result.sessionIds)
    expect(reconnectResult.eligibleSessions).toHaveLength(1)
    expect(reconnectResult.currentSessionId).toBe(result.currentSessionId)
    expect(reconnectResult.currentAgentPreset).toBe('harness-comfyui')
    expect(reconnectResult.currentOrigin).not.toBe('subagent')
    expect(reconnectResult.serviceKeys).toContain('list')
    expect(reconnect.consoleErrors).toEqual([])
    expect(reconnect.runtimeExceptions).toEqual([])
  }, 180000)
})
