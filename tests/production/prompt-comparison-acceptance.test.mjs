import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'

import { describe, expect, it } from 'vitest'

import { assertPromptComparisonLayout, assertPromptComparisonTranslationAction, createPromptComparisonWorkspace, isPromptComparisonModelRequest, setPromptComparisonSidebarCollapsed } from '../desktop/fixtures/prompt-comparison-acceptance.mjs'

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height })
const viewport = { width: 1280, height: 720 }
const layout = () => ({
  modal: rect(24, 24, 1232, 672),
  requirement: rect(24, 92, 1232, 56),
  tabs: rect(48, 148, 1184, 56),
  compose: rect(24, 518, 1232, 114),
  footer: rect(24, 632, 1232, 64),
  rewrite: rect(1096, 541, 112, 64),
  adopt: rect(1078, 646, 154, 36),
  columns: [48, 648].map(left => ({
    bounds: rect(left, 218, 584, 284),
    source: { bounds: rect(left + 1, 294, 582, 80), overflowY: 'auto', scrollHeight: 1600, clientHeight: 80 },
    translation: { bounds: rect(left + 1, 402, 582, 80), overflowY: 'auto', scrollHeight: 1300, clientHeight: 80 },
  })),
  forbiddenControls: [],
})

describe('prompt comparison Desktop layout acceptance', () => {
  it('accepts two equal columns with independent original and translation scrolling', () => {
    expect(() => assertPromptComparisonLayout(layout(), viewport)).not.toThrow()
  })

  it.each(['rewrite', 'adopt', 'footer'])('rejects %s outside the viewport', region => {
    const observation = layout()
    observation[region] = rect(48, 710, 112, 64)
    expect(() => assertPromptComparisonLayout(observation, viewport)).toThrow(/viewport/)
  })

  it('rejects unequal columns and missing bilingual text', () => {
    const unequal = layout()
    unequal.columns[1].bounds = rect(648, 218, 584, 300)
    expect(() => assertPromptComparisonLayout(unequal, viewport)).toThrow(/equal height/)
    const missing = layout()
    missing.columns[1].translation = null
    expect(() => assertPromptComparisonLayout(missing, viewport)).toThrow(/translation/)
  })

  it('rejects a text pane that expands instead of scrolling', () => {
    const observation = layout()
    observation.columns[0].source.overflowY = 'visible'
    expect(() => assertPromptComparisonLayout(observation, viewport)).toThrow(/scroll/)
  })
})

describe('prompt comparison controlled model request boundary', () => {
  it('distinguishes direct prompt and translation tasks from official title generation', () => {
    const prompt = 'Desktop prompt comparison acceptance\nOriginal request and prompts'
    const translation = 'Desktop prompt translation acceptance\nWarm sunlight.'
    const captured = text => ({ body: { messages: [
      { role: 'system', content: 'Follow the session instructions.' },
      { role: 'user', content: text },
      { role: 'user', content: '<system-reminder>Current workspace.</system-reminder>' },
    ] } })
    const title = text => captured(`Generate the session title from this JSON array of human messages:\n${JSON.stringify([{ seq: 9, text }])}`)
    expect(isPromptComparisonModelRequest(captured(prompt), 'prompt')).toBe(true)
    expect(isPromptComparisonModelRequest(captured(translation), 'translation')).toBe(true)
    expect(isPromptComparisonModelRequest(title(prompt), 'prompt')).toBe(false)
    expect(isPromptComparisonModelRequest(title(translation), 'translation')).toBe(false)
    expect(isPromptComparisonModelRequest(captured(translation), 'prompt')).toBe(false)
    expect(isPromptComparisonModelRequest(captured(prompt), 'translation')).toBe(false)
  })

  it('registers a separate workspace inside the evidence directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'prompt-comparison-workspace-'))
    const requested = []
    const page = { evaluate: expression => runInNewContext(expression, { window: { __runPanelTestContext: {
      get(name) {
        expect(name).toBe('remote.workspace')
        return { create(input) { requested.push(input); return { ok: true, value: { workspace: { workspaceId: 'comparison-workspace' } } } } }
      },
    } } }) }
    try {
      const result = await createPromptComparisonWorkspace(page, directory)
      expect(result).toEqual({ workspaceId: 'comparison-workspace', workspacePath: join(directory, 'prompt-comparison-workspace') })
      expect(requested).toEqual([{ path: result.workspacePath }])
      expect((await stat(result.workspacePath)).isDirectory()).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('prompt comparison Desktop screenshot preparation', () => {
  it('collapses the official sidebar and restores its original state through its actual controls', async () => {
    let collapsed = false
    const clicks = []
    const page = { evaluate: expression => runInNewContext(expression, { document: {
      querySelector(selector) {
        if (selector === '[data-sidebar-collapsed="true"]') return collapsed ? {} : null
        if (selector === 'button[aria-label="收起侧边栏"]' && !collapsed) return { click() { collapsed = true; clicks.push('collapse') } }
        if (selector === 'button[aria-label="打开侧边栏"]' && collapsed) return { click() { collapsed = false; clicks.push('expand') } }
        return null
      },
    } }) }
    await setPromptComparisonSidebarCollapsed(page, true)
    expect(collapsed).toBe(true)
    await setPromptComparisonSidebarCollapsed(page, true)
    expect(clicks).toEqual(['collapse'])
    await setPromptComparisonSidebarCollapsed(page, false)
    expect(collapsed).toBe(false)
    expect(clicks).toEqual(['collapse', 'expand'])
  })
})

describe('prompt comparison translation action acceptance', () => {
  const observation = text => ({
    viewport,
    pane: rect(648, 390, 584, 80),
    state: rect(649, 408, 582, 61),
    message: { text: '原文已修改，请重新翻译。', visible: true, bounds: rect(664, 416, 310, 22) },
    button: { text, visible: true, enabled: true, hit: true, bounds: rect(1096, 410, 112, 32) },
  })

  it.each(['翻译当前原文', '重试翻译'])('accepts a fully visible and hit-tested %s action', label => {
    expect(() => assertPromptComparisonTranslationAction(observation(label), viewport, label)).not.toThrow()
  })

  it('rejects an action clipped by the translation pane while still inside the viewport', () => {
    const clipped = observation('重试翻译')
    clipped.button.bounds = rect(1096, 455, 112, 32)
    expect(() => assertPromptComparisonTranslationAction(clipped, viewport, '重试翻译')).toThrow(/translation pane/)
  })

  it('rejects a covered action and a clipped status message', () => {
    const covered = observation('翻译当前原文')
    covered.button.hit = false
    expect(() => assertPromptComparisonTranslationAction(covered, viewport, '翻译当前原文')).toThrow(/hit/)
    const clipped = observation('重试翻译')
    clipped.message.bounds = rect(664, 462, 310, 22)
    expect(() => assertPromptComparisonTranslationAction(clipped, viewport, '重试翻译')).toThrow(/translation pane/)
  })

  it.each(['message', 'button'])('rejects %s clipped by the state container inside the translation pane', name => {
    const clipped = observation('重试翻译')
    clipped[name].bounds = rect(664, 400, 112, 22)
    expect(() => assertPromptComparisonTranslationAction(clipped, viewport, '重试翻译')).toThrow(/state container/)
  })
})
