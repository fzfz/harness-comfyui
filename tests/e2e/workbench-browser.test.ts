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
  await new Promise(resolve => setTimeout(resolve, 300));
  const probe = window.__HARNESS_BROWSER_PROBE__;
  const context = probe?.contexts?.['harness-comfyui'];
  const snapshot = context?.sessions?.list?.getSnapshot?.();
  return {
    bodyText: document.body?.innerText ?? '',
    buttons: [...document.querySelectorAll('button')].map(button => button.innerText),
    sessionIds: snapshot?.ids ?? [],
    sessionTitles: snapshot?.ids?.map(id => snapshot.byId[id]?.displayTitle) ?? [],
    serviceKeys: Object.keys(context?.sessions ?? {}),
  };
})()`

describe('Issue 3 real Harness workbench browser seam', () => {
  it('exposes the public Session service and deterministic fixture snapshot on the project workbench surface', async () => {
    const fixture = await createProfileFixture({ configuration: 'test' })
    fixtures.push(fixture)
    const scratch = await mkdtemp(join(tmpdir(), 'harness-comfyui-issue3-e2e-'))
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
      sessionTitles: Array<string | undefined>
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
    expect(result.sessionIds).toEqual([])
    expect(result.sessionTitles).toEqual([])
    expect(result.serviceKeys).toContain('list')
    expect(browser.consoleErrors).toEqual([])
    expect(browser.runtimeExceptions).toEqual([])
  }, 120000)
})
