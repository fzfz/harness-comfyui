import { describe, expect, it } from 'vitest'
import resultsTab from '../../src/client/workbench/results-tab.json' with { type: 'json' }
import { resultsTabSchema } from '../../src/client/workbench/results-tab-schema.ts'

describe('native result tab configuration', () => {
  it('accepts the shipped tab identity and title', () => {
    expect(resultsTabSchema(resultsTab)).toEqual({
      id: 'harness-comfyui/results', kind: 'harness-comfyui-results', title: 'ComfyUI 结果',
    })
  })
  it.each(['id', 'kind', 'title'])('rejects missing or invalid %s', (field) => {
    const missing: Record<string, unknown> = { ...resultsTab }
    delete missing[field]
    expect(() => resultsTabSchema(missing)).toThrow()
    for (const value of ['', ' ', 42, null]) {
      expect(() => resultsTabSchema({ ...resultsTab, [field]: value })).toThrow()
    }
  })
})
