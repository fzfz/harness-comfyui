import { describe, expect, it, vi } from 'vitest'
import { GenerationSourceClient } from '../../src/host/generation/source-client.ts'
import type { SourceRead } from '../../src/host/source-client/source-client.ts'
import { SourceClientError } from '../../src/host/source-client/http-client.ts'
import { GenerationRuntimeError } from '../../src/host/generation/generation-runtime.ts'

function success(result: unknown) {
  return {
    status: 'ok',
    message: null,
    results: [result],
    page: 1,
    page_size: 1,
    total_count: 1,
  }
}

const workflow = {
  version: 0.4,
  nodes: [{ id: 1, type: 'SaveImage', widgets_values: ['output'] }],
  links: [],
}

function settings() {
  return { get: () => ({ url: 'https://catalog.example.com', port: 18093 }) }
}

describe('GenerationSourceClient', () => {
  it('reads and validates an instance source without changing the source response contract', async () => {
    const process = vi.fn<SourceRead>(async () => (success({
        id: 2,
        title: 'win3080',
        url: 'http://192.168.110.122:8188/',
        credential_type: 'none',
      })))
    const source = new GenerationSourceClient({ settings: settings(), read: process })

    await expect(source.readInstance('2')).resolves.toEqual({
      id: '2',
      title: 'win3080',
      url: 'http://192.168.110.122:8188/',
      credentialType: 'none',
      authorization: null,
    })
    expect(process).toHaveBeenCalledWith({ address: { url: 'https://catalog.example.com', port: 18093 }, operation: 'instance', id: '2', signal: undefined })
  })

  it('reads a Source v0.86.1 three-field TemplateBundle response', async () => {
    const process = vi.fn<SourceRead>(async () => (success({
        id: 34,
        title: 'Anima',
        workflow_json: workflow,
      })))
    const source = new GenerationSourceClient({ settings: settings(), read: process })

    const bundle = await source.readTemplate('34')

    expect(bundle).toEqual({
      id: '34',
      title: 'Anima',
      workflow,
    })
  })

  it.each([
    ['missing Workflow', undefined, 'Template Workflow must be an object.'],
    ['non-object Workflow', [], 'Template Workflow must be an object.'],
    ['missing Workflow nodes', { version: 0.4 }, 'Template Workflow nodes are invalid.'],
    ['non-object Workflow node', { version: 0.4, nodes: ['invalid'] }, 'Template Workflow node 0 must be an object.'],
  ])('rejects a TemplateBundle with %s', async (_label, workflowJson, message) => {
    const process = vi.fn<SourceRead>(async () => (success({
        id: 34,
        title: 'Anima',
        workflow_json: workflowJson,
      })))
    const source = new GenerationSourceClient({ settings: settings(), read: process })

    await expect(source.readTemplate('34')).rejects.toMatchObject({
      code: 'SOURCE_PROTOCOL_ERROR',
      message,
    })
  })

  it('accepts a connection-only Workflow node without widgets_values', async () => {
    const workflowWithConnectionOnlyNode = {
      version: 0.4,
      nodes: [
        { id: 1, type: 'KSampler', widgets_values: [0, 'fixed'] },
        { id: 7, type: 'VAEDecode', inputs: [{ name: 'samples', type: 'LATENT', link: 9 }] },
      ],
      links: [[9, 1, 0, 7, 0, 'LATENT']],
    }
    const process = vi.fn<SourceRead>(async () => (success({
        id: 37,
        title: 'wai_txt2img_lora',
        workflow_json: workflowWithConnectionOnlyNode,
      })))
    const source = new GenerationSourceClient({ settings: settings(), read: process })

    await expect(source.readTemplate('37')).resolves.toMatchObject({
      id: '37',
      workflow: { nodes: expect.arrayContaining([{ id: 7, type: 'VAEDecode', inputs: expect.any(Array) }]) },
    })
  })

  it('rejects an invalid success envelope and a failed source request with stable error codes', async () => {
    const invalid = new GenerationSourceClient({
      settings: settings(),
      read: vi.fn(async () => ({})),
    })
    await expect(invalid.readTemplate('34')).rejects.toMatchObject({ code: 'SOURCE_PROTOCOL_ERROR' })

    const failed = new GenerationSourceClient({
      settings: settings(),
      read: vi.fn(async () => { throw new SourceClientError('SOURCE_HTTP_ERROR', 'not found') }),
    })
    await expect(failed.readInstance('2')).rejects.toMatchObject({ code: 'SOURCE_QUERY_FAILED', message: 'not found' })
  })

  it.each([
    ['instance', '2', 401],
    ['instance', '2', 403],
    ['instance', '2', 404],
    ['instance', '2', 503],
    ['template-bundle', '29', 404],
    ['template-bundle', '29', 503],
  ] as const)('reports the operation, record ID and HTTP status for %s/%s HTTP %s', async (operation, id, status) => {
    const source = new GenerationSourceClient({
      settings: settings(),
      read: async () => {
        throw new SourceClientError('SOURCE_HTTP_ERROR', 'Source service returned an HTTP error.', {
          status,
          responseBody: { message: 'Unverified server explanation', extra: 'private-body-value' },
        })
      },
    })

    await expect(operation === 'instance' ? source.readInstance(id) : source.readTemplate(id)).rejects.toMatchObject({
      code: 'SOURCE_QUERY_FAILED',
      message: `数据源读取 ${operation} 记录（ID：${id}）返回 HTTP ${status}。请核对当前目录记录和数据源配置。`,
    })
  })

  it.each([
    ['RESPONSE_TOO_LARGE', 'SOURCE_RESPONSE_TOO_LARGE'],
    ['CONTRACT_PROTOCOL_ERROR', 'SOURCE_PROTOCOL_ERROR'],
    ['DISCOVERY_PROTOCOL_ERROR', 'SOURCE_PROTOCOL_ERROR'],
    ['INVALID_ARGUMENT', 'SOURCE_PROTOCOL_ERROR'],
    ['SOURCE_CONNECTION_FAILED', 'SOURCE_CONNECTION_FAILED'],
    ['TOTAL_TIMEOUT', 'SOURCE_REQUEST_TIMEOUT'],
    ['DISCOVERY_HTTP_ERROR', 'SOURCE_QUERY_FAILED'],
  ])('preserves the message and classification for %s', async (sourceCode, code) => {
    const source = new GenerationSourceClient({
      settings: settings(),
      read: async () => {
        throw new SourceClientError(sourceCode, 'Original source diagnostic.', {
          status: 503, responseBody: { extra: 'private-body-value' },
        })
      },
    })

    await expect(source.readInstance('2')).rejects.toMatchObject({ code, message: 'Original source diagnostic.' })
  })

  it.each([
    new GenerationRuntimeError('SOURCE_PROTOCOL_ERROR', 'Original parsed-source diagnostic.'),
    Object.assign(new Error('Original cancellation diagnostic.'), { name: 'AbortError' }),
  ])('preserves an existing or cancellation error: %s', async error => {
    const source = new GenerationSourceClient({ settings: settings(), read: async () => { throw error } })

    await expect(source.readTemplate('29')).rejects.toBe(error)
  })

  it('preserves the thrown error when the source signal has been aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const error = new SourceClientError('SOURCE_HTTP_ERROR', 'Original cancellation diagnostic.', {
      status: 503, responseBody: {},
    })
    const source = new GenerationSourceClient({ settings: settings(), read: async () => { throw error } })

    await expect(source.readInstance('2', controller.signal)).rejects.toBe(error)
  })

  it.each(['instance', 'template-bundle'] as const)('validates %s IDs before reading the source', async operation => {
    const read = vi.fn<SourceRead>()
    const source = new GenerationSourceClient({ settings: settings(), read })

    await expect(operation === 'instance' ? source.readInstance('invalid-id') : source.readTemplate('invalid-id')).rejects.toThrow(TypeError)
    expect(read).not.toHaveBeenCalled()
  })

  it('reads the latest Settings address before every Source read', async () => {
    let address = { url: 'http://127.0.0.1', port: 18093 }
    const process = vi.fn<SourceRead>(async () => (success({ id: 2, title: 'win3080', url: 'http://127.0.0.1:8188', credential_type: 'none' })))
    const source = new GenerationSourceClient({
      settings: { get: () => address },
      read: process,
    })

    await source.readInstance('2')
    address = { url: 'https://catalog.example.com', port: 443 }
    await source.readInstance('2')

    expect(process.mock.calls[0]?.[0].address).toEqual({ url: 'http://127.0.0.1', port: 18093 })
    expect(process.mock.calls[1]?.[0].address).toEqual({ url: 'https://catalog.example.com', port: 443 })
  })
})
