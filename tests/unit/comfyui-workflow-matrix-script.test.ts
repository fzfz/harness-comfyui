import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChromeComfyFrontend } from '../../src/host/generation/comfy-frontend-browser.ts'
import { semanticDiscovery } from './fixtures/source-client-contract.mjs'

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readFile: vi.fn(actual.readFile) }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.mocked(readFile).mockReset()
})

import {
  classifyParameterResult,
  compareParameterSupport,
  MATRIX_PARAMETER_VALUES,
  matrixParameterCandidates,
  parseArguments,
  parseParameterSupportBaseline,
  reportHasFailures,
  runMatrix,
  type MatrixTemplateReport,
} from '../../scripts/verification/comfyui-workflow-matrix.mjs'

const parameterResults = (
  overrides: Readonly<Record<string, { readonly status: 'passed' | 'not_found' | 'failed' }>>,
) => Object.fromEntries(Object.keys(MATRIX_PARAMETER_VALUES).map(parameterId => [
  parameterId,
  overrides[parameterId] ?? { status: 'not_found' },
]))

describe('real ComfyUI Workflow matrix verification command', () => {
  it('requires an explicit instance and resolves an optional report path', () => {
    expect(parseArguments(['--instance-id', '2'])).toEqual({ instanceId: '2' })
    expect(parseArguments(['--', '--instance-id', '2'])).toEqual({ instanceId: '2' })
    expect(parseArguments([
      '--instance-id', '2', '--source-url', 'https://catalog.example.com', '--source-port', '443',
    ])).toEqual({ instanceId: '2', sourceUrl: 'https://catalog.example.com', sourcePort: 443 })
    expect(parseArguments(['--instance-id', '2', '--output', 'matrix.json'])).toEqual({
      instanceId: '2',
      outputPath: expect.stringMatching(/matrix\.json$/u),
    })
    expect(() => parseArguments([])).toThrow('--instance-id')
    expect(() => parseArguments(['--instance-id', '2', '--unknown'])).toThrow('Unknown argument')
    expect(() => parseArguments(['--instance-id', '2', '--source-url', 'file:///tmp/catalog'])).toThrow('--source-url')
    expect(() => parseArguments(['--instance-id', '2', '--source-port', '0'])).toThrow('--source-port')
  })

  it('accepts only target-not-found as an unsupported template parameter', () => {
    expect(classifyParameterResult(undefined)).toEqual({ status: 'passed' })
    expect(classifyParameterResult(Object.assign(new Error('missing'), {
      code: 'GENERATION_PARAMETER_TARGET_NOT_FOUND',
    }))).toMatchObject({ status: 'not_found', code: 'GENERATION_PARAMETER_TARGET_NOT_FOUND' })
    expect(classifyParameterResult(Object.assign(new Error('ambiguous'), {
      code: 'GENERATION_PARAMETER_TARGET_AMBIGUOUS',
    }))).toMatchObject({ status: 'failed', code: 'GENERATION_PARAMETER_TARGET_AMBIGUOUS' })
  })

  it('uses each Workflow node live enum before the fixed matrix fallback value', () => {
    const workflow = {
      nodes: [
        { id: 1, type: 'ClownSampler', mode: 0 },
        { id: 2, type: 'LoadImage', mode: 0 },
        { id: 3, type: 'ResolutionPicker', mode: 0 },
      ],
    }
    const objectInfo = {
      ClownSampler: { input: { required: { sampler_name: [['none', 'linear/euler'], {}] } } },
      LoadImage: { input: { required: { image: [['instance-input.png'], {}] } } },
      ResolutionPicker: { input: { required: { resolution: [['1024x1024 (1.0)'], {}] } } },
    }

    expect(matrixParameterCandidates('sampler_name', workflow, objectInfo))
      .toEqual(['none', MATRIX_PARAMETER_VALUES.sampler_name])
    expect(matrixParameterCandidates('reference_image', workflow, objectInfo))
      .toEqual(['instance-input.png', MATRIX_PARAMETER_VALUES.reference_image])
    expect(matrixParameterCandidates('resolution_preset', workflow, objectInfo))
      .toEqual(['1024x1024 (1.0)', MATRIX_PARAMETER_VALUES.resolution_preset])
    expect(matrixParameterCandidates('cfg', workflow, objectInfo))
      .toEqual([MATRIX_PARAMETER_VALUES.cfg])
  })

  it('fails a report for a parameter error, combined error, or official cache error', () => {
    const template = {
      parameters: { seed: { status: 'passed' } },
      supportBaseline: { status: 'passed' },
      combined: { status: 'passed' },
      official: { status: 'passed' },
    } as const
    expect(reportHasFailures({ templates: [template] })).toBe(false)
    expect(reportHasFailures({ templates: [{ ...template, parameters: { seed: { status: 'failed' } } }] })).toBe(true)
    expect(reportHasFailures({ templates: [{ ...template, combined: { status: 'failed' } }] })).toBe(true)
    expect(reportHasFailures({ templates: [{ ...template, official: { status: 'failed' } }] })).toBe(true)
  })

  it('fails when every parameter is reported as not found against a nonempty support baseline', () => {
    const parameters = parameterResults({})

    const supportBaseline = compareParameterSupport(['seed', 'steps'], parameters)

    expect(supportBaseline).toMatchObject({
      status: 'failed',
      mismatches: [
        { parameterId: 'seed', expectedStatus: 'passed', actualStatus: 'not_found' },
        { parameterId: 'steps', expectedStatus: 'passed', actualStatus: 'not_found' },
      ],
    })
    expect(reportHasFailures({
      templates: [{
        parameters,
        supportBaseline,
        combined: { status: 'passed' },
        official: { status: 'passed' },
      }],
    })).toBe(true)
  })

  it('fails exact support comparison for a missing expected target or an unexpected target', () => {
    expect(compareParameterSupport(['seed'], parameterResults({
      seed: { status: 'not_found' },
    }))).toMatchObject({
      status: 'failed',
      mismatches: [{ parameterId: 'seed', expectedStatus: 'passed', actualStatus: 'not_found' }],
    })
    expect(compareParameterSupport(['seed'], parameterResults({
      seed: { status: 'passed' },
      steps: { status: 'passed' },
    }))).toMatchObject({
      status: 'failed',
      mismatches: [{ parameterId: 'steps', expectedStatus: 'not_found', actualStatus: 'passed' }],
    })
  })

  it('requires the baseline to cover exactly the current Catalog template ids', () => {
    const baseline = {
      schemaVersion: 1,
      templates: [
        { id: '1', supportedParameters: ['seed', 'steps'] },
        { id: '2', supportedParameters: ['positive_prompt'] },
      ],
    }
    expect(parseParameterSupportBaseline(baseline, ['1', '2'])).toEqual(new Map([
      ['1', ['seed', 'steps']],
      ['2', ['positive_prompt']],
    ]))
    expect(() => parseParameterSupportBaseline(baseline, ['1'])).toThrow('does not match current Catalog template ids')
    expect(() => parseParameterSupportBaseline(baseline, ['1', '2', '3'])).toThrow('does not match current Catalog template ids')
  })

  it('rejects an empty expected support set so one template cannot pass with all targets missing', () => {
    expect(() => parseParameterSupportBaseline({
      schemaVersion: 1,
      templates: [{ id: '1', supportedParameters: [] }],
    }, ['1'])).toThrow('must declare at least one supported parameter')
  })
})

describe('Workflow matrix official compiler configuration', () => {
  it('passes the configured source address over HTTP and the loaded cache epoch into the single-template cache', async () => {
    vi.stubEnv('HARNESS_COMFYUI_FRONTEND_CACHE_EPOCH', 'matrix-fixture-epoch-42')
    const workflow = {
      version: 0.4,
      nodes: [{
        id: 1, type: 'MatrixOutput', title: 'Seed', mode: 0,
        inputs: [], outputs: [], widgets_values: [7],
      }],
      links: [],
    }
    const objectInfo = {
      MatrixOutput: {
        input: { required: { seed: ['INT', { min: 0, max: 2147483647 }] } },
        input_order: { required: ['seed'], optional: [] },
        output_node: true,
      },
    }
    const envelope = (result: unknown) => ({
      status: 'ok', message: null, results: [result], page: 1, page_size: 1, total_count: 1,
    })
    const discovery = semanticDiscovery()
    discovery.paths['/internal/semantic/comfyui-templates'] = { post: {
      ...discovery.paths['/internal/semantic/base-models']!.post,
      operationId: 'querySemanticComfyuiTemplatesForSkill',
      'x-harness-tool-name': 'query_semantic_comfyui_templates',
    } }
    delete discovery.paths['/internal/semantic/base-models']
    const schemas = discovery.components.schemas as {
      CatalogBaseModelSearchRequest: { properties: Record<string, unknown> }
    }
    schemas.CatalogBaseModelSearchRequest.properties.base_model_id = {
      type: 'string', minLength: 1, maxLength: 20, pattern: '^[1-9][0-9]{0,19}$',
      description: 'Base-model identifier for the template filter', example: '123',
    }
    const requests: Array<{ host: string | undefined; method: string | undefined; path: string | undefined }> = []
    const server = createServer((request, response) => {
      requests.push({ host: request.headers.host, method: request.method, path: request.url })
      response.setHeader('content-type', 'application/json')
      let result: unknown
      switch (request.url) {
        case '/internal/semantic': result = discovery; break
        case '/internal/comfyui-source': result = { openapi: '3.1.0', paths: {} }; break
        case '/internal/semantic/comfyui-templates': result = { ...envelope({
          id: 43, title: 'Matrix fixture', template_type: 'text_to_image',
          cover_url: null, sample_image_urls: [],
        }), page_size: 8 }; break
        case '/internal/comfyui-source/instances/2': result = envelope({
          id: 2, title: 'Matrix instance', url: 'http://comfyui.fixture.invalid:8188/',
          credential_type: 'none',
        }); break
        case '/internal/comfyui-source/templates/43/bundle': result = envelope({
          id: 43, title: 'Matrix fixture', workflow_json: workflow,
        }); break
        default: response.statusCode = 404; result = { error: 'Unexpected fixture request' }
      }
      response.end(JSON.stringify(result))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('Test server has no port')
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(objectInfo), { status: 200 })))
      const snapshots: Array<{ identity: { instanceCacheEpoch: string } }> = []
      const filesystem = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      vi.mocked(readFile).mockImplementation(async (path, options) => {
        if (String(path).endsWith('comfyui-workflow-parameter-support.json')) {
          return JSON.stringify({
            schemaVersion: 1, templates: [{ id: '43', supportedParameters: ['seed'] }],
          })
        }
        const contents = await filesystem.readFile(path, options)
        if (typeof contents === 'string' && contents.includes('"instanceCacheEpoch"')) {
          snapshots.push(JSON.parse(contents))
        }
        return contents
      })
      const exported = vi.spyOn(ChromeComfyFrontend.prototype, 'exportWorkflow')
        .mockImplementation(async input => {
          const node = input.workflow.nodes[0] as Record<string, unknown>
          return { '1': {
            class_type: 'MatrixOutput',
            inputs: { seed: (node.widgets_values as number[])[0]! },
          } }
        })

      const report = await runMatrix(parseArguments([
        '--instance-id', '2', '--source-url', 'http://127.0.0.1', '--source-port', String(address.port),
      ])) as {
        readonly templateCount: number
        readonly templates: readonly MatrixTemplateReport[]
      }

      expect(requests).toHaveLength(6)
      expect(requests.every(request => request.host === '127.0.0.1:' + address.port)).toBe(true)
      expect(requests).toEqual(expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/internal/semantic' }),
        expect.objectContaining({ method: 'POST', path: '/internal/semantic/comfyui-templates' }),
        expect.objectContaining({ method: 'GET', path: '/internal/comfyui-source/instances/2' }),
        expect.objectContaining({ method: 'GET', path: '/internal/comfyui-source/templates/43/bundle' }),
      ]))
      expect(report.templateCount).toBe(1)
      expect(reportHasFailures(report)).toBe(false)
      expect(report.templates[0]?.official).toMatchObject({
        status: 'passed', miss: 'miss', hit: 'hit', frontendExports: 1,
      })
      expect(exported).toHaveBeenCalledOnce()
      expect(snapshots).toEqual([
        expect.objectContaining({ identity: expect.objectContaining({ instanceCacheEpoch: 'matrix-fixture-epoch-42' }) }),
      ])
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
