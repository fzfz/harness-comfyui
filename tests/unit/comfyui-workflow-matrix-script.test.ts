import { describe, expect, it } from 'vitest'

import {
  classifyParameterResult,
  compareParameterSupport,
  MATRIX_PARAMETER_VALUES,
  matrixParameterCandidates,
  parseArguments,
  parseParameterSupportBaseline,
  reportHasFailures,
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
