import { describe, expect, it, vi } from 'vitest'

import { ComfyWorkflowCompiler } from '../../src/host/generation/workflow-compiler.ts'
import type { UiWorkflow } from '../../src/host/generation/source-preparer.ts'

const workflow: UiWorkflow = {
  version: 0.4,
  nodes: [
    {
      id: 1,
      type: 'ImageProducer',
      title: 'Image source',
      mode: 0,
      inputs: [],
      outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [11] }],
      widgets_values: ['source.png'],
    },
    {
      id: 2,
      type: 'CLIPTextEncode',
      mode: 0,
      inputs: [
        { name: 'clip', type: 'CLIP', link: 10 },
        { name: 'text', type: 'STRING', link: null, widget: { name: 'text' } },
      ],
      outputs: [],
      widgets_values: ['1girl, white hair'],
    },
    {
      id: 3,
      type: 'SaveImage',
      mode: 0,
      inputs: [
        { name: 'images', type: 'IMAGE', link: 11 },
        { name: 'filename_prefix', type: 'STRING', link: null, widget: { name: 'filename_prefix' } },
      ],
      outputs: [],
      widgets_values: ['harness-comfyui'],
    },
  ],
  links: [
    [10, 1, 0, 2, 0, 'CLIP'],
    [11, 1, 0, 3, 0, 'IMAGE'],
  ],
}

const objectInfo = {
  ImageProducer: {
    input: { required: { source: ['STRING', {}] } },
    input_order: { required: ['source'], optional: [] },
    output_node: false,
  },
  CLIPTextEncode: {
    input: { required: { clip: ['CLIP'], text: ['STRING', {}] } },
    input_order: { required: ['clip', 'text'], optional: [] },
    output_node: false,
  },
  SaveImage: {
    input: { required: { images: ['IMAGE'], filename_prefix: ['STRING', {}] } },
    input_order: { required: ['images', 'filename_prefix'], optional: [] },
    output_node: true,
  },
}

describe('ComfyWorkflowCompiler', () => {
  it('compiles connected inputs and widget values from the UI Workflow with live node definitions', async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify(objectInfo), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const compiler = new ComfyWorkflowCompiler({ fetchImplementation })

    const compiled = await compiler.compile({
      workflow,
      connection: { url: 'http://127.0.0.1:8188/', origin: 'http://127.0.0.1:8188', authorization: 'Bearer token' },
      expectedOutputNodeIds: ['3'],
    })

    expect(compiled).toEqual({
      apiWorkflow: {
        '1': {
        class_type: 'ImageProducer',
        inputs: { source: 'source.png' },
        _meta: { title: 'Image source' },
        },
        '2': {
        class_type: 'CLIPTextEncode',
        inputs: { clip: ['1', 0], text: '1girl, white hair' },
        },
        '3': {
        class_type: 'SaveImage',
        inputs: { images: ['1', 0], filename_prefix: 'harness-comfyui' },
        },
      },
      activeOutputNodeIds: ['3'],
    })
    expect(fetchImplementation).toHaveBeenCalledWith(
      'http://127.0.0.1:8188/object_info',
      expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer token' }) }),
    )
  })

  it('discovers active output nodes when the template output declaration is null', async () => {
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })

    const compiled = await compiler.compile({
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: null,
    })

    expect(compiled.activeOutputNodeIds).toEqual(['3'])
  })

  it('rejects a declared output node that is not an active ComfyUI output node', async () => {
    const compiler = new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })),
    })

    await expect(compiler.compile({
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: ['2'],
    })).rejects.toMatchObject({ code: 'WORKFLOW_COMPILE_FAILED' })
  })

  it('aborts a live node-definition request at the configured timeout', async () => {
    const compiler = new ComfyWorkflowCompiler({
      timeoutMs: 1,
      fetchImplementation: vi.fn<typeof fetch>(async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })),
    })
    await expect(compiler.compile({
      workflow,
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      expectedOutputNodeIds: null,
    })).rejects.toMatchObject({ code: 'COMFYUI_CONNECTION_FAILED' })
  })

  it('rejects invalid timeout, HTTP status and node-definition JSON', async () => {
    expect(() => new ComfyWorkflowCompiler({ timeoutMs: 0 })).toThrow('timeout')
    await expect(new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response('{}', { status: 503 })),
    }).compile({ workflow, connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null }, expectedOutputNodeIds: null }))
      .rejects.toMatchObject({ code: 'COMFYUI_HTTP_ERROR' })
    await expect(new ComfyWorkflowCompiler({
      fetchImplementation: vi.fn(async () => new Response('{', { status: 200 })),
    }).compile({ workflow, connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null }, expectedOutputNodeIds: null }))
      .rejects.toMatchObject({ code: 'COMFYUI_PROTOCOL_ERROR' })
  })
})
