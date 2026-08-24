import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createStaticWorkflowDownload,
  downloadStaticWorkflow,
} from '../../src/client/workbench/static-workflow.ts'

const RUN_ID = 'run_01J8MEDIA01'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('static Actual Workflow download', () => {
  it('serializes an importable UI Workflow without API Workflow nodes', () => {
    const artifact = createStaticWorkflowDownload(RUN_ID)
    const parsed = JSON.parse(artifact.content) as {
      nodes: Array<{ id: number; widgets_values?: readonly unknown[] }>
      links: Array<readonly [number, number, number, number]>
      extra: { harness_comfyui: { run_id: string } }
    }

    expect(artifact.filename).toBe(`comfyui-run-${RUN_ID}-workflow.json`)
    expect(artifact.mimeType).toBe('application/json')
    expect(artifact.content.endsWith('\n')).toBe(true)
    expect(parsed.extra.harness_comfyui.run_id).toBe(RUN_ID)
    expect(parsed.nodes.find(node => node.id === 7)?.widgets_values).toEqual([`harness-comfyui/${RUN_ID}`])
    expect(parsed.nodes.length).toBeGreaterThan(0)
    expect(parsed.links.length).toBeGreaterThan(0)
    expect(artifact.content).not.toContain('"class_type"')

    const nodeIds = new Set(parsed.nodes.map(node => node.id))
    for (const link of parsed.links) {
      expect(nodeIds.has(link[1])).toBe(true)
      expect(nodeIds.has(link[3])).toBe(true)
    }
  })

  it('downloads the serialized JSON through one temporary browser anchor', async () => {
    const click = vi.fn()
    const remove = vi.fn()
    const anchor = { href: '', download: '', click, remove }
    const append = vi.fn()
    const createElement = vi.fn(() => anchor)
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:static-workflow')
    const revokeObjectURL = vi.fn((_url: string) => undefined)
    vi.stubGlobal('document', { createElement, body: { append } })
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    downloadStaticWorkflow(RUN_ID)

    expect(createElement).toHaveBeenCalledWith('a')
    expect(createObjectURL).toHaveBeenCalledOnce()
    const blob = createObjectURL.mock.calls[0]![0] as Blob
    expect(blob.type).toBe('application/json')
    expect(await blob.text()).toBe(createStaticWorkflowDownload(RUN_ID).content)
    expect(anchor).toMatchObject({
      href: 'blob:static-workflow',
      download: createStaticWorkflowDownload(RUN_ID).filename,
    })
    expect(append).toHaveBeenCalledWith(anchor)
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:static-workflow')
  })
})
