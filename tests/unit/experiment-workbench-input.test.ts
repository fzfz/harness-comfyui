import { describe, expect, it, vi } from 'vitest'
import {
  ExperimentInputDescriptionCache,
  readExperimentParameter,
  experimentSizeOptions,
} from '../../src/client/workbench/experiment-input.ts'
import type {
  WorkflowRuntimeParameterInspection,
  WorkflowRuntimeParameterInspectionParameter,
} from '../../src/generation/inspection-contract.ts'
import { draft } from './experiment-workbench-fixtures.ts'

const parameter = (
  kind: WorkflowRuntimeParameterInspectionParameter['kind'],
  parameter_id: string,
  current_value: WorkflowRuntimeParameterInspectionParameter['current_value'],
  extra: Partial<WorkflowRuntimeParameterInspectionParameter> = {},
): WorkflowRuntimeParameterInspectionParameter => ({
  kind,
  parameter_id,
  current_value,
  value_type: typeof current_value === 'number' ? 'integer' : 'string',
  ...extra,
})
const width = parameter('width', 'width_1', 1024, {
    minimum: 768,
    maximum: 1280,
  }),
  height = parameter('height', 'height_1', 768, { minimum: 768, maximum: 1024 })
const description: WorkflowRuntimeParameterInspection = {
  parameters: [
    parameter('steps', 'steps_1', 28),
    parameter('positive_prompt', 'text_7', 'template prompt'),
    width,
    height,
  ],
  size_candidates: [
    { candidate_id: 'latent_1', representation: 'width_height', width, height },
  ],
}
describe('experiment input metadata', () => {
  it('retries an inspection after its request fails', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(description)
    const cache = new ExperimentInputDescriptionCache(load)
    const scope = { workspaceId: 'ws', workId: 'work', branchId: 'branch' }
    await expect(cache.load(scope, draft.generation_input)).rejects.toThrow(
      'offline',
    )
    await expect(cache.load(scope, draft.generation_input)).resolves.toBe(
      description,
    )
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('reads declared parameter IDs and uses template defaults only for omitted values', () => {
    expect(
      readExperimentParameter(description, { steps: 1, steps_1: 34 }, 'steps'),
    ).toBe(34)
    expect(
      readExperimentParameter(
        description,
        { text_7: 'actual run prompt' },
        'positive_prompt',
      ),
    ).toBe('actual run prompt')
    expect(readExperimentParameter(description, {}, 'steps')).toBe(28)
    expect(
      readExperimentParameter(null, { steps: 99 }, 'steps'),
    ).toBeUndefined()
  })
  it('derives width and height choices from the actual candidate IDs, ranges and current values', () => {
    const choices = experimentSizeOptions(description, {
      width_1: 1280,
      height_1: 768,
    })
    expect(choices.map((choice) => choice.label)).toEqual([
      '1280 × 768',
      '1024 × 768',
      '1024 × 1024',
      '768 × 1024',
    ])
    expect(choices[0]?.parameters).toEqual({ width_1: 1280, height_1: 768 })
    expect(choices[0]?.candidate_id).toBe('latent_1')
    expect(experimentSizeOptions(null, {})).toEqual([])
  })
  it('preserves native resolution presets and ratio parameters', () => {
    const preset = parameter('resolution_preset', 'preset_8', 'square', {
      value_type: 'choice',
    })
    const ratio = parameter('aspect_ratio', 'ratio_4', '3:2'),
      megapixels = parameter('megapixels', 'mp_4', 1.5, {
        value_type: 'number',
      })
    const description: WorkflowRuntimeParameterInspection = {
      parameters: [preset, ratio, megapixels],
      size_candidates: [
        {
          candidate_id: 'preset',
          representation: 'resolution_preset',
          parameter: preset,
          mapped_options: [
            { value: 'square', width: 1024, height: 1024 },
            { value: 'wide', width: 1536, height: 1024 },
          ],
          unmapped_values: [],
        },
        {
          candidate_id: 'ratio',
          representation: 'aspect_ratio_megapixels',
          aspect_ratio: ratio,
          megapixels,
        },
      ],
    }
    const choices = experimentSizeOptions(description, {
      preset_8: 'wide',
      ratio_4: '3:2',
      mp_4: 1.5,
    })
    expect(choices[0]).toMatchObject({
      label: '1536 × 1024',
      parameters: { preset_8: 'wide' },
    })
    expect(
      choices.find((choice) => choice.candidate_id === 'ratio'),
    ).toMatchObject({
      label: '3:2 · 1.5 MP',
      parameters: { ratio_4: '3:2', mp_4: 1.5 },
    })
  })
  it('shares an inspection only within the same workspace, template and instance', async () => {
    const load = vi.fn(async () => description)
    const cache = new ExperimentInputDescriptionCache(load)
    const first = { workspaceId: 'ws', workId: 'work', branchId: 'one' }
    await cache.load(first, draft.generation_input)
    await cache.load(
      { ...first, branchId: 'two', runId: 'run' },
      draft.generation_input,
    )
    expect(load).toHaveBeenCalledTimes(1)
    await cache.load({ ...first, workspaceId: 'other' }, draft.generation_input)
    expect(load).toHaveBeenCalledTimes(2)
    await expect(
      cache.load(first, { ...draft.generation_input, template_id: null }),
    ).resolves.toBeNull()
  })
})
