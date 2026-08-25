import { describe, expect, it, vi } from 'vitest'

import type { CatalogContext } from '../../src/catalog/contract.ts'

import {
  parseWorkbenchContext,
  replaceWorkbenchContextLines,
  serializeWorkbenchContext,
  WORKBENCH_CONTEXT_RECORD_TYPE,
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
    const layout = { openDetails: vi.fn(), closeDetails: vi.fn() }
    const controller = new WorkbenchController(layout)
    const listener = vi.fn()
    const unsubscribe = controller.subscribe(listener)

    expect(controller.getSnapshot()).toBe(false)
    controller.toggle()
    expect(controller.getSnapshot()).toBe(true)
    expect(listener).toHaveBeenCalledOnce()
    expect(layout.openDetails).toHaveBeenCalledOnce()

    unsubscribe()
    controller.toggle()
    expect(controller.getSnapshot()).toBe(false)
    expect(listener).toHaveBeenCalledOnce()
    expect(layout.closeDetails).toHaveBeenCalledOnce()
  })

  it('opens and closes the native result drawer without changing workbench state', () => {
    const layout = { openDetails: vi.fn(), closeDetails: vi.fn() }
    const controller = new WorkbenchController(layout)
    const listener = vi.fn()
    const unsubscribe = controller.subscribeResults(listener)

    expect(controller.getResultsSnapshot()).toBe(false)
    controller.openResults()
    expect(controller.getResultsSnapshot()).toBe(true)
    controller.closeResults()
    expect(controller.getResultsSnapshot()).toBe(false)

    expect(controller.getSnapshot()).toBe(false)
    expect(layout.openDetails).toHaveBeenCalledOnce()
    expect(layout.closeDetails).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    controller.openResults()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('keeps the result state aligned with the workbench entry toggle', () => {
    const controller = new WorkbenchController({ openDetails: vi.fn(), closeDetails: vi.fn() })

    controller.toggle()
    expect(controller.getSnapshot()).toBe(true)
    expect(controller.getResultsSnapshot()).toBe(true)

    controller.toggle()
    expect(controller.getSnapshot()).toBe(false)
    expect(controller.getResultsSnapshot()).toBe(false)
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
