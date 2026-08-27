import { describe, expect, it, vi } from 'vitest'

import { ComfyHttpTransport } from '../../src/host/generation/comfy-http-transport.ts'
import type { GenerationSource } from '../../src/host/generation/source-preparer.ts'

const source: GenerationSource = {
  async readInstance(instanceId) {
    return {
      id: instanceId,
      title: 'ComfyUI',
      url: 'http://127.0.0.1:8188/',
      credentialType: 'bearer',
      authorization: 'Bearer token',
    }
  },
  async readTemplate() {
    throw new Error('not used')
  },
}

const instanceOrigin = 'http://127.0.0.1:8188'
const webpBytes = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

describe('ComfyHttpTransport', () => {
  it('submits a stable prompt id and projects job outputs from configured output nodes', async () => {
    const fetchImplementation = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        prompt_id: '0193f85c-86fb-4ad9-8d2b-28cf39e8b042',
        number: 12,
        node_errors: {},
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: '0193f85c-86fb-4ad9-8d2b-28cf39e8b042',
        status: 'completed',
        outputs: {
          '3': { images: [{ filename: 'result.webp', subfolder: 'batch', type: 'output' }] },
          '9': { images: [{ filename: 'ignored.webp', subfolder: '', type: 'output' }] },
        },
      }), { status: 200 }))
    const transport = new ComfyHttpTransport({ source, fetchImplementation })

    const submitted = await transport.submit({
      instanceId: '2', instanceOrigin,
      promptId: '0193f85c-86fb-4ad9-8d2b-28cf39e8b042',
      apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } },
      actualWorkflow: { version: 0.4, nodes: [{ id: 3, type: 'SaveImage' }] },
      onRequestStart: () => true,
    })
    const observed = await transport.observe({
      instanceId: '2', instanceOrigin,
      promptId: submitted.promptId,
      outputNodeIds: ['3'],
    })

    expect(observed).toEqual({
      status: 'success',
      outputs: [{
        nodeId: '3',
        outputIndex: 0,
        mediaKind: 'image',
        filename: 'result.webp',
        subfolder: 'batch',
        type: 'output',
      }],
    })
    const submitBody = JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
    expect(submitBody).toMatchObject({
      prompt_id: submitted.promptId,
      prompt: { '3': { class_type: 'SaveImage' } },
      extra_data: {
        extra_pnginfo: {
          workflow: { version: 0.4, nodes: [{ id: 3, type: 'SaveImage' }] },
        },
      },
    })
    expect(fetchImplementation.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({ authorization: 'Bearer token' }))
  })

  it('ignores temporary preview media when a completed job also contains saved output media', async () => {
    const promptId = '0193f85c-86fb-4ad9-8d2b-28cf39e8b042'
    const transport = new ComfyHttpTransport({
      source,
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        id: promptId,
        status: 'completed',
        outputs: {
          '10': {
            images: [{ filename: 'ComfyUI_temp_pxndl_00001_.png', subfolder: '', type: 'temp' }],
          },
          '12': {
            images: [{ filename: 'ComfyUI_00158_.png', subfolder: '', type: 'output' }],
          },
        },
      }), { status: 200 })),
    })

    await expect(transport.observe({
      instanceId: '2', instanceOrigin, promptId, outputNodeIds: ['10', '12'],
    })).resolves.toEqual({
      status: 'success',
      outputs: [{
        nodeId: '12',
        outputIndex: 0,
        mediaKind: 'image',
        filename: 'ComfyUI_00158_.png',
        subfolder: '',
        type: 'output',
      }],
    })
  })

  it('downloads one validated output descriptor through the ComfyUI view route', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => new Response(webpBytes, {
      status: 200,
      headers: { 'content-type': 'image/webp' },
    }))
    const transport = new ComfyHttpTransport({ source, fetchImplementation })

    const downloaded = await transport.download({
      instanceId: '2', instanceOrigin,
      output: { nodeId: '3', outputIndex: 0, mediaKind: 'image', filename: 'result.webp', subfolder: 'batch', type: 'output' },
    })

    expect(downloaded.bytes).toEqual(webpBytes)
    expect(downloaded.mediaType).toBe('image/webp')
    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:8188/view?filename=result.webp&subfolder=batch&type=output',
    )
  })

  it('rejects changed instance origins before sending a request', async () => {
    const fetchImplementation = vi.fn<typeof fetch>()
    const changedSource: GenerationSource = {
      ...source,
      async readInstance(instanceId) {
        return {
          id: instanceId,
          title: 'Changed ComfyUI',
          url: 'http://127.0.0.1:8288',
          credentialType: 'none',
          authorization: null,
        }
      },
    }
    const transport = new ComfyHttpTransport({ source: changedSource, fetchImplementation })

    await expect(transport.observe({
      instanceId: '2', instanceOrigin, promptId: '0193f85c-86fb-4ad9-8d2b-28cf39e8b042', outputNodeIds: ['3'],
    })).rejects.toMatchObject({ code: 'COMFYUI_INSTANCE_SOURCE_CHANGED' })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('does not cross the request boundary when instance lookup is cancelled', async () => {
    const controller = new AbortController()
    const requestStarted = vi.fn(() => true)
    const fetchImplementation = vi.fn<typeof fetch>()
    const waitingSource: GenerationSource = {
      ...source,
      async readInstance(_instanceId, signal) {
        await new Promise<void>((_resolve, reject) => {
          const abort = () => reject(new DOMException('cancelled', 'AbortError'))
          if (signal?.aborted === true) abort()
          else signal?.addEventListener('abort', abort, { once: true })
        })
        throw new Error('unreachable')
      },
    }
    const transport = new ComfyHttpTransport({ source: waitingSource, fetchImplementation })
    const submitting = transport.submit({
      instanceId: '2', instanceOrigin,
      promptId: '0193f85c-86fb-4ad9-8d2b-28cf39e8b042',
      apiWorkflow: {}, actualWorkflow: {}, onRequestStart: requestStarted, signal: controller.signal,
    })
    controller.abort()
    await expect(submitting).rejects.toMatchObject({ name: 'AbortError' })
    expect(requestStarted).not.toHaveBeenCalled()
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('rejects media with a false signature or a body over the configured byte limit', async () => {
    const descriptor = {
      nodeId: '3', outputIndex: 0, mediaKind: 'image' as const,
      filename: 'result.png', subfolder: '', type: 'output' as const,
    }
    const falseSignature = new ComfyHttpTransport({
      source,
      fetchImplementation: vi.fn(async () => new Response('not-a-png', {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })),
    })
    await expect(falseSignature.download({ instanceId: '2', instanceOrigin, output: descriptor }))
      .rejects.toMatchObject({ code: 'COMFYUI_OUTPUT_INVALID' })

    const tooLarge = new ComfyHttpTransport({
      source,
      maxMediaBytes: 4,
      fetchImplementation: vi.fn(async () => new Response(webpBytes, {
        status: 200,
        headers: { 'content-type': 'image/webp' },
      })),
    })
    await expect(tooLarge.download({ instanceId: '2', instanceOrigin, output: { ...descriptor, filename: 'result.webp' } }))
      .rejects.toMatchObject({ code: 'COMFYUI_OUTPUT_TOO_LARGE' })
  })

  it('rejects unsafe remote output descriptors', async () => {
    const transport = new ComfyHttpTransport({
      source,
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        id: '0193f85c-86fb-4ad9-8d2b-28cf39e8b042',
        status: 'completed',
        outputs: { '3': { images: [{ filename: '../secret.webp', subfolder: '', type: 'output' }] } },
      }), { status: 200 })),
    })

    await expect(transport.observe({
      instanceId: '2', instanceOrigin,
      promptId: '0193f85c-86fb-4ad9-8d2b-28cf39e8b042',
      outputNodeIds: ['3'],
    })).rejects.toMatchObject({ code: 'COMFYUI_OUTPUT_INVALID' })
  })

  it('rejects unrecognized remote output descriptor types', async () => {
    const promptId = '0193f85c-86fb-4ad9-8d2b-28cf39e8b042'
    const transport = new ComfyHttpTransport({
      source,
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        id: promptId,
        status: 'completed',
        outputs: { '3': { images: [{ filename: 'result.webp', subfolder: '', type: 'cache' }] } },
      }), { status: 200 })),
    })

    await expect(transport.observe({
      instanceId: '2', instanceOrigin, promptId, outputNodeIds: ['3'],
    })).rejects.toMatchObject({ code: 'COMFYUI_OUTPUT_INVALID' })
  })

  it('projects pending, running, missing, failed and cancelled job states', async () => {
    const promptId = '0193f85c-86fb-4ad9-8d2b-28cf39e8b042'
    const fetchImplementation = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: promptId, status: 'pending' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: promptId, status: 'in_progress' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: promptId,
        status: 'failed',
        execution_error: { exception_message: 'node failed' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: promptId, status: 'cancelled' }), { status: 200 }))
    const transport = new ComfyHttpTransport({ source, fetchImplementation })
    const observe = () => transport.observe({ instanceId: '2', instanceOrigin, promptId, outputNodeIds: ['3'] })

    await expect(observe()).resolves.toEqual({ status: 'pending', outputs: [] })
    await expect(observe()).resolves.toEqual({ status: 'running', outputs: [] })
    await expect(observe()).resolves.toEqual({ status: 'unknown', outputs: [] })
    await expect(observe()).resolves.toMatchObject({
      status: 'error',
      error: { message: 'ComfyUI Job failed: {"exception_message":"node failed"}' },
    })
    await expect(observe()).resolves.toMatchObject({
      status: 'error',
      error: { message: 'ComfyUI Job status is cancelled.' },
    })
  })

  it('classifies timeout, caller cancellation and connection failures', async () => {
    const promptId = '0193f85c-86fb-4ad9-8d2b-28cf39e8b042'
    const abortingFetch = vi.fn<typeof fetch>(async (_url, init) => new Promise<Response>((_resolve, reject) => {
      const rejectAbort = () => reject(new DOMException('aborted', 'AbortError'))
      if (init?.signal?.aborted === true) rejectAbort()
      else init?.signal?.addEventListener('abort', rejectAbort, { once: true })
    }))
    const timeoutTransport = new ComfyHttpTransport({ source, fetchImplementation: abortingFetch, timeoutMs: 1 })
    await expect(timeoutTransport.observe({ instanceId: '2', instanceOrigin, promptId, outputNodeIds: ['3'] }))
      .rejects.toMatchObject({ code: 'COMFYUI_REQUEST_TIMEOUT' })

    const controller = new AbortController()
    const cancelled = new ComfyHttpTransport({ source, fetchImplementation: abortingFetch }).observe({
      instanceId: '2', instanceOrigin, promptId, outputNodeIds: ['3'], signal: controller.signal,
    })
    controller.abort()
    await expect(cancelled).rejects.toMatchObject({ code: 'COMFYUI_REQUEST_CANCELED' })

    const disconnected = new ComfyHttpTransport({
      source,
      fetchImplementation: vi.fn(async () => { throw new Error('offline') }),
    })
    await expect(disconnected.observe({ instanceId: '2', instanceOrigin, promptId, outputNodeIds: ['3'] }))
      .rejects.toMatchObject({ code: 'COMFYUI_CONNECTION_FAILED' })
  })

  it('keeps the request timeout active while JSON and media bodies are read', async () => {
    const stalledResponse = (init?: RequestInit, mediaType = 'application/json') => new Response(new ReadableStream({
      start(controller) {
        const reject = () => controller.error(new DOMException('aborted', 'AbortError'))
        if (init?.signal?.aborted === true) reject()
        else init?.signal?.addEventListener('abort', reject, { once: true })
      },
    }), { status: 200, headers: { 'content-type': mediaType } })
    const fetchImplementation = vi.fn<typeof fetch>(async (_url, init) => stalledResponse(init))
    const transport = new ComfyHttpTransport({ source, fetchImplementation, timeoutMs: 1 })
    const promptId = '0193f85c-86fb-4ad9-8d2b-28cf39e8b042'
    await expect(transport.observe({ instanceId: '2', instanceOrigin, promptId, outputNodeIds: ['3'] }))
      .rejects.toMatchObject({ code: 'COMFYUI_REQUEST_TIMEOUT' })

    fetchImplementation.mockImplementationOnce(async (_url, init) => stalledResponse(init, 'image/png'))
    await expect(transport.download({
      instanceId: '2', instanceOrigin,
      output: { nodeId: '3', outputIndex: 0, mediaKind: 'image', filename: 'result.png', subfolder: '', type: 'output' },
    })).rejects.toMatchObject({ code: 'COMFYUI_REQUEST_TIMEOUT' })
  })

  it('rejects invalid configuration, prompt responses, JSON and media types', async () => {
    expect(() => new ComfyHttpTransport({ source, timeoutMs: 0 })).toThrow('timeout')
    const promptId = '0193f85c-86fb-4ad9-8d2b-28cf39e8b042'
    const rejected = new ComfyHttpTransport({
      source,
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({ prompt_id: promptId, node_errors: { 3: {} } }), { status: 200 })),
    })
    await expect(rejected.submit({ instanceId: '2', instanceOrigin, promptId, apiWorkflow: {}, actualWorkflow: {}, onRequestStart: () => true }))
      .rejects.toMatchObject({ code: 'COMFYUI_PROMPT_REJECTED' })
    const rejectedWithHttp400 = new ComfyHttpTransport({
      source,
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        error: { type: 'prompt_outputs_failed_validation' },
        node_errors: { 3: { errors: [] } },
      }), { status: 400 })),
    })
    await expect(rejectedWithHttp400.submit({ instanceId: '2', instanceOrigin, promptId, apiWorkflow: {}, actualWorkflow: {}, onRequestStart: () => true }))
      .rejects.toMatchObject({
        code: 'COMFYUI_PROMPT_REJECTED',
        message: 'ComfyUI rejected the API Workflow: {"error":{"type":"prompt_outputs_failed_validation"},"node_errors":{"3":{"errors":[]}}}',
      })
    const mismatchedPromptId = '30f70d6d-8449-4a11-a8d0-26f846a7614b'
    const mismatched = new ComfyHttpTransport({
      source,
      fetchImplementation: vi.fn(async () => new Response(JSON.stringify({
        prompt_id: mismatchedPromptId,
        node_errors: {},
      }), { status: 200 })),
    })
    await expect(mismatched.submit({ instanceId: '2', instanceOrigin, promptId, apiWorkflow: {}, actualWorkflow: {}, onRequestStart: () => true }))
      .rejects.toMatchObject({
        code: 'COMFYUI_PROTOCOL_ERROR',
        message: `ComfyUI /prompt returned prompt_id "${mismatchedPromptId}" for requested prompt_id "${promptId}".`,
      })
    const invalidJson = new ComfyHttpTransport({
      source,
      fetchImplementation: vi.fn(async () => new Response('{', { status: 200 })),
    })
    await expect(invalidJson.observe({ instanceId: '2', instanceOrigin, promptId, outputNodeIds: ['3'] }))
      .rejects.toMatchObject({ code: 'COMFYUI_PROTOCOL_ERROR' })
    const invalidMedia = new ComfyHttpTransport({
      source,
      fetchImplementation: vi.fn(async () => new Response('text', { status: 200, headers: { 'content-type': 'text/plain' } })),
    })
    await expect(invalidMedia.download({
      instanceId: '2', instanceOrigin,
      output: { nodeId: '3', outputIndex: 0, mediaKind: 'image', filename: 'result.webp', subfolder: '', type: 'output' },
    })).rejects.toMatchObject({ code: 'COMFYUI_OUTPUT_INVALID' })
  })
})
