import { afterEach, describe, expect, it } from 'vitest'

import { createProfileFixture } from '../../src/testing/profile-fixture.ts'

const fixtures: Array<Awaited<ReturnType<typeof createProfileFixture>>> = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
})

describe('project root boot order', () => {
  it('mounts one project root with the native roster and overlay', async () => {
    const fixture = await createProfileFixture({ configuration: 'test' })
    fixtures.push(fixture)

    await fixture.install()
    await fixture.start()

    const boot = await fixture.readBootGraph()
    const project = boot.entries.find(entry => entry.id === 'harness-comfyui')
    const renderer = boot.entries.find(entry => entry.id === '@deepseek-ai/dsh-client-ui-renderer')

    expect(project).toBeDefined()
    expect(renderer).toBeDefined()
    expect(project?.inject).toEqual([
      '@deepseek-ai/dsh-client-connection',
      '@deepseek-ai/dsh-api-remotes',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-runtime',
      '@deepseek-ai/dsh-client-ui-conversation',
      '@deepseek-ai/dsh-client-ui-input-trigger',
      '@deepseek-ai/dsh-client-ui-layout',
      '@deepseek-ai/dsh-client-ui-theme',
    ])
    expect(boot.entries.some(entry => entry.id === '@deepseek-ai/dsh-client-ui-layout')).toBe(false)
    expect(boot.entries.map(entry => entry.id)).toEqual(expect.arrayContaining([
      '@deepseek-ai/dsh-client-ui-conversation',
      '@deepseek-ai/dsh-client-ui-input-trigger',
      '@deepseek-ai/dsh-client-ui-skill',
    ]))

    const browser = await fixture.runRealBrowserProbe({
      viewport: { width: 1440, height: 1000 },
      scenarioScript: `(async () => {
        const probe = window.__HARNESS_BROWSER_PROBE__;
        const context = probe?.contexts?.['harness-comfyui'];
        if (!context) throw new Error('project Client context was not captured');
        const root = context.slots.snapshot('root')[0];
        const overlay = context.slots.snapshot('conversation.input.overlay')[0];
        const columns = document.querySelector('[data-layout-columns]');
        const shellOverlay = document.querySelector('[data-shell-overlay]');
        return {
          root,
          overlay,
          rootOwnerCount: context.slots.entriesOfSlot('root').length,
          loadedModules: probe.loadedModules,
          overlayOutsideColumns: shellOverlay !== null && columns !== null && !columns.contains(shellOverlay),
        };
      })()`,
    })

    const result = browser.scenarioResult as {
      root?: { declaredBy?: string; children?: Array<{ name: string }>; occupants?: Array<{ registrant?: string; active: boolean; priority: number }> }
      overlay?: { occupants?: Array<{ active: boolean }> }
      rootOwnerCount: number
      loadedModules: string[]
      overlayOutsideColumns: boolean
    }
    expect(result.rootOwnerCount).toBe(1)
    expect(browser.projectFiberActive).toBe(true)
    expect(result.root?.declaredBy).toBe('(built-in)')
    expect(result.root?.occupants).toEqual([{ registrant: 'harness-comfyui', priority: 0, active: true }])
    expect(result.root?.children?.map(child => child.name)).toEqual([
      'sidebar',
      'conversation',
      'details',
      'shell.overlay',
    ])
    expect(result.overlay?.occupants?.some(occupant => occupant.active)).toBe(true)
    expect(result.loadedModules).toEqual(expect.arrayContaining([
      '@deepseek-ai/dsh-client-ui-conversation',
      '@deepseek-ai/dsh-client-ui-input-trigger',
      '@deepseek-ai/dsh-client-ui-skill',
    ]))
    expect(result.overlayOutsideColumns).toBe(true)
    expect(browser.consoleErrors).toEqual([])
    expect(browser.runtimeExceptions).toEqual([])
  }, 240000)
})
