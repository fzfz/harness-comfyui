import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createProfileFixture } from '../../src/testing/profile-fixture.ts'

const fixtures: Array<Awaited<ReturnType<typeof createProfileFixture>>> = []

type RpcEnvelope = {
  result?: {
    ok?: boolean
    value?: unknown
    error?: { code?: string; message?: string }
  }
}

async function rpc(port: number, method: string, payload: Record<string, unknown>): Promise<any> {
  const response = await fetch(`http://127.0.0.1:${port}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `issue3-root-${method}-${Date.now()}-${Math.random()}`,
      method,
      payload,
    }),
  })
  const envelope = await response.json() as RpcEnvelope
  if (!response.ok || envelope.result?.ok !== true) {
    const error = envelope.result?.error
    throw new Error(`${method} failed: ${error?.code ?? response.status} ${error?.message ?? ''}`.trim())
  }
  return envelope.result.value
}

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

  it('diagnoses the public chat view seam for a real blank Session', async () => {
    const fixture = await createProfileFixture({ configuration: 'test' })
    fixtures.push(fixture)

    await fixture.install()
    await fixture.start()

    const workspaceResult = await rpc(fixture.port, 'workspace.create', { path: fixture.runtimeCwd }) as {
      workspace?: { workspaceId?: string }
    }
    const workspaceId = workspaceResult.workspace?.workspaceId
    if (typeof workspaceId !== 'string') throw new Error('diagnostic workspace.create did not return a workspaceId')
    const sessionResult = await rpc(fixture.port, 'session.create', {
      workspaceId,
      agentPreset: 'harness-comfyui',
    }) as { sessionId?: string }
    const sessionId = sessionResult.sessionId
    if (typeof sessionId !== 'string') throw new Error('diagnostic session.create did not return a sessionId')

    const browser = await fixture.runRealBrowserProbe({
      viewport: { width: 1440, height: 1000 },
      scenarioScript: `(async () => {
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const until = async (probe, label, timeout = 20000) => {
          const deadline = Date.now() + timeout;
          while (Date.now() < deadline) {
            const value = await probe();
            if (value) return value;
            await wait(100);
          }
          throw new Error('timed out waiting for ' + label);
        };
        const row = await until(() => document.querySelector('[data-session-id="${sessionId}"]'), 'blank Session row');
        row.click();
        await until(() => document.querySelector('[data-layout-column="conversation"]'), 'conversation column');
        await wait(500);
        const context = window.__HARNESS_BROWSER_PROBE__?.contexts?.['harness-comfyui'];
        const viewEntries = context?.slots.snapshot('conversation.view')[0]?.occupants.map(entry => ({
          id: entry.id,
          priority: entry.priority,
          active: entry.active,
        })) ?? [];
        return {
          sessionId: '${sessionId}',
          projectViewRegistered: viewEntries.some(entry => entry.id === 'chat' && entry.priority === -10 && entry.active),
          projectEmptyView: document.querySelector('.message-list .empty-conversation') !== null,
          projectMessageList: document.querySelector('.message-list') !== null,
          harnessBlankHero: document.body.innerText.includes('探索未至之境'),
          viewEntries,
        };
      })()`,
    })

    const result = browser.scenarioResult as {
      sessionId: string
      projectViewRegistered: boolean
      projectEmptyView: boolean
      projectMessageList: boolean
      harnessBlankHero: boolean
      viewEntries: Array<{ id?: string; priority?: number; active?: boolean }>
    }
    expect(result.sessionId).toBe(sessionId)
    expect(result.projectViewRegistered).toBe(true)
    expect(result.projectEmptyView).toBe(false)
    expect(result.projectMessageList).toBe(false)
    expect(result.harnessBlankHero).toBe(true)
    expect(browser.consoleErrors).toEqual([])
    expect(browser.runtimeExceptions).toEqual([])
  }, 240000)

  it('selects a real workspace Skill through the native MenuView overlay', async () => {
    const fixture = await createProfileFixture({ configuration: 'test' })
    fixtures.push(fixture)

    await fixture.install()
    const skillRoot = join(fixture.installationRoot, 'releases', fixture.artifact.version, 'package', 'skills')
    const skillDirectory = join(skillRoot, 'issue3-native-menu')
    await mkdir(skillDirectory, { recursive: true })
    await writeFile(join(skillDirectory, 'SKILL.md'), `---
name: issue3-native-menu
description: Proves the native Skill menu in an isolated composition.
---
Use this fixture only to verify the public native input menu.
`, 'utf8')

    await fixture.start()
    const workspaceResult = await rpc(fixture.port, 'workspace.create', { path: fixture.runtimeCwd }) as {
      workspace?: { workspaceId?: string; path?: string }
      created?: boolean
    }
    const workspaceId = workspaceResult.workspace?.workspaceId
    if (typeof workspaceId !== 'string') throw new Error('composition workspace.create did not return a workspaceId')
    const sessionResult = await rpc(fixture.port, 'session.create', {
      workspaceId,
      agentPreset: 'harness-comfyui',
    }) as { sessionId?: string; agentPreset?: string }
    if (typeof sessionResult.sessionId !== 'string') throw new Error('composition session.create did not return a sessionId')
    expect(sessionResult.agentPreset).toBe('harness-comfyui')
    const skillResult = await rpc(fixture.port, 'skill.list', { sessionId: sessionResult.sessionId }) as {
      skills?: Array<{ name?: string }>
    }
    expect(skillResult.skills?.map(skill => skill.name)).toContain('issue3-native-menu')

    const browser = await fixture.runRealBrowserProbe({
      viewport: { width: 1440, height: 1000 },
      scenarioScript: `(async () => {
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const until = async (probe, label, timeout = 20000) => {
          const deadline = Date.now() + timeout;
          while (Date.now() < deadline) {
            const value = await probe();
            if (value) return value;
            await wait(100);
          }
          throw new Error('timed out waiting for ' + label);
        };
        const sessionRow = await until(() => document.querySelector('[data-session-id="${sessionResult.sessionId}"]'), 'created Session row');
        sessionRow.click();
        const input = await until(() => {
          const element = document.querySelector('#message-input');
          return element instanceof HTMLTextAreaElement && !element.disabled ? element : undefined;
        }, 'enabled project textarea');
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
        if (typeof setter !== 'function') throw new Error('textarea value setter unavailable');
        input.focus();
        setter.call(input, '/');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        const menu = await until(() => {
          const element = document.querySelector('[role="listbox"]');
          const option = [...document.querySelectorAll('[role="option"]')].find(item => item.textContent?.includes('issue3-native-menu'));
          if (!element || !option) return undefined;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 ? { element, option } : undefined;
        }, 'visible native Skill MenuView with issue3-native-menu option');
        const listboxVisible = true;
        const { element: listbox, option } = menu;
        const context = window.__HARNESS_BROWSER_PROBE__?.contexts?.['harness-comfyui'];
        const overlayEntries = context?.slots.snapshot('conversation.input.overlay')[0]?.occupants.map(entry => ({
          id: entry.id,
          active: entry.active,
        })) ?? [];
        option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        await until(() => input.value === '/issue3-native-menu ' && document.querySelector('[role="listbox"]') === null, 'native Skill selection');
        return {
          listboxVisible,
          overlayEntries,
          optionText: option.textContent?.trim() ?? '',
          inputValue: input.value,
          menuClosed: document.querySelector('[role="listbox"]') === null,
        };
      })()`,
    })

    const result = browser.scenarioResult as {
      listboxVisible: boolean
      overlayEntries: Array<{ id?: string; active?: boolean }>
      optionText: string
      inputValue: string
      menuClosed: boolean
    }
    expect(result.listboxVisible).toBe(true)
    expect(result.overlayEntries).toContainEqual({ id: 'slash-menu', active: true })
    expect(result.optionText).toContain('issue3-native-menu')
    expect(result.inputValue).toBe('/issue3-native-menu ')
    expect(result.menuClosed).toBe(true)
    expect(browser.consoleErrors).toEqual([])
    expect(browser.runtimeExceptions).toEqual([])
  }, 240000)
})
