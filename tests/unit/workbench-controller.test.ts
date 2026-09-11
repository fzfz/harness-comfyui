import { describe, expect, it, vi } from 'vitest'

import type { CatalogContext } from '../../src/catalog/contract.ts'

import {
  parseWorkbenchContext,
  replaceWorkbenchContextLines,
  serializeWorkbenchContext,
  WORKBENCH_CONTEXT_RECORD_TYPE,
  WORKBENCH_RESULTS_TAB,
  workbenchContextsFromDraft,
} from '../../src/client/workbench/contract.ts'
import {
  removeWorkbenchContext,
  setWorkbenchContexts,
  WorkbenchController,
} from '../../src/client/workbench/controller.ts'

const CONTEXT_OPTIONS: readonly CatalogContext[] = [
  { kind: 'model', id: '15', file_name: 'rinSoftsketch_v20.safetensors' },
  { kind: 'lora', id: '91', file_name: 'StS_Age_Slider_Illustrious_v1.safetensors' },
  { kind: 'comfyui-template', id: '37', title: 'wai_txt2img_lora' },
]

function sessionInput(draft = '') {
  let current = draft
  return {
    state: { getSnapshot: () => ({ draft: current }) },
    setDraft: vi.fn((next: string) => { current = next }),
  }
}

describe('ComfyUI workbench controller', () => {
  it('publishes entry state changes and removes subscribers', () => {
    const sidebarRight = { openTab: vi.fn() }
    const controller = new WorkbenchController(sidebarRight)
    const listener = vi.fn()
    const unsubscribe = controller.subscribe(listener)

    expect(controller.getSnapshot()).toBe(false)
    controller.toggle()
    expect(controller.getSnapshot()).toBe(true)
    expect(listener).toHaveBeenCalledOnce()
    expect(sidebarRight.openTab).toHaveBeenCalledWith(WORKBENCH_RESULTS_TAB.kind)

    unsubscribe()
    controller.toggle()
    expect(controller.getSnapshot()).toBe(false)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('opens the native result tab and closes only the visible owned tab without changing workbench state', () => {
    const sidebarRight = { openTab: vi.fn() }
    const controller = new WorkbenchController(sidebarRight)
    const listener = vi.fn()
    const closeOwnedTab = vi.fn()
    const unsubscribe = controller.subscribeResults(listener)
    controller.syncCurrentSession('session-1')

    expect(controller.getResultsSnapshot()).toBe(false)
    controller.openResults()
    expect(controller.getResultsSnapshot()).toBe(true)
    const unbind = controller.bindResultsTab('session-1', 'result-tab-1', true, closeOwnedTab)
    controller.closeResults()
    expect(controller.getResultsSnapshot()).toBe(false)

    expect(controller.getSnapshot()).toBe(false)
    expect(sidebarRight.openTab).toHaveBeenCalledWith(WORKBENCH_RESULTS_TAB.kind)
    expect(closeOwnedTab).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    unbind()
    controller.openResults()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('tracks current Session tab visibility and ignores stale binding cleanup', () => {
    const sidebarRight = { openTab: vi.fn() }
    const controller = new WorkbenchController(sidebarRight)
    const listener = vi.fn()
    controller.subscribeResults(listener)
    controller.syncCurrentSession('session-1')
    const staleUnbind = controller.bindResultsTab('session-1', 'result-tab', true, vi.fn())

    expect(controller.getResultsSnapshot()).toBe(true)
    expect(listener).toHaveBeenCalledOnce()

    const currentUnbind = controller.bindResultsTab('session-1', 'result-tab', false, vi.fn())
    expect(controller.getResultsSnapshot()).toBe(false)
    staleUnbind()
    expect(controller.getResultsSnapshot()).toBe(false)

    currentUnbind()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(sidebarRight.openTab).not.toHaveBeenCalled()
  })

  it('switches result state between Sessions without closing either Session tab', () => {
    const controller = new WorkbenchController({ openTab: vi.fn() })
    const closeSession1 = vi.fn()
    const closeSession2 = vi.fn()
    controller.syncCurrentSession('session-1')
    const unbindSession1 = controller.bindResultsTab('session-1', 'tab-1', true, closeSession1)
    controller.bindResultsTab('session-2', 'tab-2', false, closeSession2)

    expect(controller.getResultsSnapshot()).toBe(true)
    controller.syncCurrentSession('session-2')
    expect(controller.getResultsSnapshot()).toBe(false)
    expect(closeSession1).not.toHaveBeenCalled()

    unbindSession1()
    expect(controller.getResultsSnapshot()).toBe(false)
    expect(closeSession1).not.toHaveBeenCalled()
    expect(closeSession2).not.toHaveBeenCalled()
  })

  it('keeps the result state aligned with the workbench entry toggle when the owned tab is bound', () => {
    const controller = new WorkbenchController({ openTab: vi.fn() })
    const close = vi.fn()
    controller.syncCurrentSession('session-1')

    controller.toggle()
    expect(controller.getSnapshot()).toBe(true)
    expect(controller.getResultsSnapshot()).toBe(true)
    controller.bindResultsTab('session-1', 'tab-1', true, close)

    controller.toggle()
    expect(controller.getSnapshot()).toBe(false)
    expect(controller.getResultsSnapshot()).toBe(false)
    expect(close).toHaveBeenCalledOnce()
  })

  it('serializes only the exact structured context JSON record', () => {
    const line = serializeWorkbenchContext(CONTEXT_OPTIONS[0]!)

    expect(JSON.parse(line)).toEqual({
      type: WORKBENCH_CONTEXT_RECORD_TYPE,
      data: CONTEXT_OPTIONS[0],
    })
    expect(line).not.toMatch(/label|subtitle|coverUrl/u)
    expect(parseWorkbenchContext(line)).toEqual(CONTEXT_OPTIONS[0])
    expect(parseWorkbenchContext('{}')).toBeNull()
    expect(parseWorkbenchContext('{broken')).toBeNull()
    expect(parseWorkbenchContext(JSON.stringify({
      type: WORKBENCH_CONTEXT_RECORD_TYPE,
      data: CONTEXT_OPTIONS[0],
      extra: true,
    }))).toBeNull()
    expect(parseWorkbenchContext(JSON.stringify({
      type: WORKBENCH_CONTEXT_RECORD_TYPE,
      data: { ...CONTEXT_OPTIONS[0], id: '0' },
    }))).toBeNull()
  })

  it('serializes character meaning without UI projection fields', () => {
    const line = serializeWorkbenchContext({
      kind: 'character',
      id: '39933',
      work_name: '尼尔机械纪元',
      character_name: '2b',
      prompt_text: '2b, yorha no. 2 type b',
    })

    expect(JSON.parse(line)).toEqual({
      type: WORKBENCH_CONTEXT_RECORD_TYPE,
      data: {
        kind: 'character',
        id: '39933',
        work_name: '尼尔机械纪元',
        character_name: '2b',
        prompt_text: '2b, yorha no. 2 type b',
      },
    })
  })

  it('serializes a Workflow template with only its identity and title', () => {
    const templateWithCatalogParameters = {
      kind: 'comfyui-template',
      id: '37',
      title: 'wai_txt2img_lora',
      parameters: [{ parameter_id: 'positive_prompt', kind: 'positive_prompt', value_type: 'string', required: false }],
    } as unknown as CatalogContext

    const line = serializeWorkbenchContext(templateWithCatalogParameters)

    expect(JSON.parse(line)).toEqual({
      type: WORKBENCH_CONTEXT_RECORD_TYPE,
      data: { kind: 'comfyui-template', id: '37', title: 'wai_txt2img_lora' },
    })
    expect(parseWorkbenchContext(line)).toEqual({
      kind: 'comfyui-template', id: '37', title: 'wai_txt2img_lora',
    })
  })

  it('replaces context JSON lines without changing ordinary draft text', () => {
    const original = `保留当前草稿\n${serializeWorkbenchContext(CONTEXT_OPTIONS[0]!)}`
    const next = replaceWorkbenchContextLines(original, CONTEXT_OPTIONS.slice(1))

    expect(next.startsWith('保留当前草稿\n')).toBe(true)
    expect(workbenchContextsFromDraft(next)).toEqual(CONTEXT_OPTIONS.slice(1))
    expect(replaceWorkbenchContextLines(next, [])).toBe('保留当前草稿')
    expect(replaceWorkbenchContextLines('', [CONTEXT_OPTIONS[0]!]))
      .toBe(serializeWorkbenchContext(CONTEXT_OPTIONS[0]!))
    expect(replaceWorkbenchContextLines('正文\n', [CONTEXT_OPTIONS[0]!]))
      .toBe(`正文\n${serializeWorkbenchContext(CONTEXT_OPTIONS[0]!)}`)
  })

  it('writes selected JSON through the public native draft path and removes one selected item', () => {
    const input = sessionInput('用户正文')
    setWorkbenchContexts(input as never, CONTEXT_OPTIONS.slice(0, 2))
    expect(workbenchContextsFromDraft(input.state.getSnapshot().draft)).toEqual(CONTEXT_OPTIONS.slice(0, 2))

    removeWorkbenchContext(input as never, CONTEXT_OPTIONS[0]!)
    expect(workbenchContextsFromDraft(input.state.getSnapshot().draft)).toEqual([CONTEXT_OPTIONS[1]])
    expect(input.state.getSnapshot().draft.startsWith('用户正文\n')).toBe(true)
    expect(input.setDraft).toHaveBeenCalledTimes(2)
  })
})
