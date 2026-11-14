import { describe, expect, it } from 'vitest'

import { CLI_ROUTE_PATH } from '../../src/cli/contract.ts'
import { contracts, ContractError } from '#contracts'

it('rejects explicit undefined values in optional CLI input fields', () => {
  for (const [command, input] of [
    ['generation resolve-media', { run_ids: ['run_1'], include_parameters: undefined }],
    ['image inspect', { file_path: '/tmp/result.png', prompt: undefined }],
  ] as const) {
    expect(() => contracts.parse(command, 'input', input)).toThrow()
    expect(() => contracts.parse('cliRequest', 'input', { command: command.replace(' ', '.'), ...input })).toThrow()
  }
})

it('accepts an explicit parameter query and defaults media queries to lightweight results', () => {
  expect(contracts.parse('cliArguments', 'input', { argv: ['generation', 'resolve-media', '--stdin'], stdin: '{"run_ids":["run_1"],"include_parameters":true}' }))
    .toEqual({ command: 'generation.resolve-media', run_ids: ['run_1'], include_parameters: true })
  expect(contracts.parse('cliRequest', 'input', { command: 'generation.resolve-media', run_ids: ['run_1'] }))
    .toEqual({ command: 'generation.resolve-media', run_ids: ['run_1'], include_parameters: false })
  expect(contracts.parse('generation resolve-media', 'input', { run_ids: ['run_1'] }))
    .toEqual({ run_ids: ['run_1'], include_parameters: false })
  expect(() => contracts.parse('cliRequest', 'input', { command: 'generation.resolve-media', run_ids: ['run_1'], include_parameters: 'true' }))
    .toThrow('include_parameters')
})

describe('Harness ComfyUI CLI contract', () => {
  it('parses Run observation registration and rejects caller-owned identities', () => {
    expect(contracts.parse('cliArguments', 'input', { argv: ['generation', 'wait', '--stdin'], stdin: '{"run_ids":["run_1"]}' })).toEqual({ command: 'generation.wait', run_ids: ['run_1'] })
    for (const source of [
      { run_ids: [] }, { run_ids: Array(21).fill('run_1') },
      { run_ids: ['run_1'], owner: 'forged' }, { run_ids: ['run_1'], session_id: 'forged' },
    ]) {
      expect(() => contracts.parse('cliArguments', 'input', { argv: ['generation', 'wait', '--stdin'], stdin: JSON.stringify(source) })).toThrow()
    }
    expect(contracts.parse('generation wait', 'output', { job_id: 'generation-wait-1', run_ids: ['run_1'] })).toEqual({ job_id: 'generation-wait-1', run_ids: ['run_1'] })
    expect(() => contracts.parse('generation wait', 'output', { job_id: '', run_ids: [] })).toThrow()
  })

  it.each(['request', 'model', 'lora', 'item', 'manifest'])('rejects unknown %s fields through schema and manifest parsing', location => {
    const extra = location === 'request' ? { extra: true } : {}
    const request = { title: 'portrait', instance_id: '2', template_id: '39', model: location === 'model' ? { id: '3', file_name: 'model.safetensors', extra: true } : null, parameters: {}, loras: location === 'lora' ? [{ id: '91', file_name: 'lora.safetensors', weight: 1, trigger_words: [], extra: true }] : [], ...extra }
    const item = { request_id: '01234567-89ab-4cde-8fab-0123456789ab', request, ...(location === 'item' ? { extra: true } : {}) }
    const manifest = { items: [item], ...(location === 'manifest' ? { extra: true } : {}) }
    expect(() => contracts.parse('generation submit', 'input', manifest)).toThrow()
    expect(() => contracts.parse('cliGenerationManifest', 'input', manifest)).toThrow(ContractError)
  })

  it.each(['duplicate request ID', 'parameter conflict', 'undefined files'])('rejects invalid submission fields through schema and manifest parsing: %s', kind => {
    const request = { title: 'portrait', instance_id: '2', template_id: '39', model: null, parameters: kind === 'parameter conflict' ? { prompt: 'inline' } : {}, loras: [] }
    const item = { request_id: '01234567-89ab-4cde-8fab-0123456789ab', request, ...(kind === 'parameter conflict' ? { parameter_files: { prompt: '/tmp/prompt.txt' } } : kind === 'undefined files' ? { parameter_files: undefined } : {}) }
    const manifest = { items: kind === 'duplicate request ID' ? [item, item] : [item] }
    expect(() => contracts.parse('generation submit', 'input', manifest)).toThrow()
    expect(() => contracts.parse('cliGenerationManifest', 'input', manifest)).toThrow()
  })

  it('rejects duplicate LoRA trigger words through schema and manifest parsing', () => {
    const request = { title: 'portrait', instance_id: '2', template_id: '39', model: null, parameters: {}, loras: [{ id: '91', file_name: 'lora.safetensors', weight: 0.7, trigger_words: ['portrait', 'portrait'] }] }
    expect(() => contracts.parse('cliGenerationRequest', 'input', request)).toThrow()
    expect(() => contracts.parse('cliGenerationManifest', 'input', { items: [{ request_id: '01234567-89ab-4cde-8fab-0123456789ab', request }] })).toThrow('contains duplicates')
  })

  it.each([-Number.MAX_VALUE, -0, Number.MAX_VALUE])('preserves finite LoRA weight boundaries: %s', weight => {
    const request = { title: 'portrait', instance_id: '2', template_id: '39', model: null, parameters: {}, loras: [{ id: '91', file_name: 'lora.safetensors', weight, trigger_words: ['portrait', 'Portrait'] }] }
    expect(contracts.parse('cliGenerationRequest', 'input', request)).toEqual(request)
    expect(contracts.parse('cliGenerationManifest', 'input', { items: [{ request_id: '01234567-89ab-4cde-8fab-0123456789ab', request }] })[0]!.request).toEqual(request)
  })

  it('rejects a JSON exponent that overflows a LoRA weight before submission', () => {
    const document = '{"items":[{"request_id":"01234567-89ab-4cde-8fab-0123456789ab","request":{"title":"portrait","instance_id":"2","template_id":"39","model":null,"parameters":{},"loras":[{"id":"91","file_name":"lora.safetensors","weight":1e309,"trigger_words":[]}]}}]}'
    expect(() => contracts.parse('cliGenerationManifest', 'input', JSON.parse(document))).toThrow('weight is invalid')
  })

  it('preserves result fields outside the input-only exact field boundary', () => {
    const result = { parameters: [], size_candidates: [], extra: 'preserved' }
    expect(contracts.parse('generation inspect-template-parameters', 'output', result)).toEqual(result)
  })

  it.each([Infinity, -Infinity, NaN])('rejects non-finite LoRA weights through schema and manifest parsing: %s', weight => {
    const request = { title: 'portrait', instance_id: '2', template_id: '39', model: null, parameters: {}, loras: [{ id: '91', file_name: 'lora.safetensors', weight, trigger_words: [] }] }
    expect(() => contracts.parse('cliGenerationRequest', 'input', request)).toThrow()
    expect(() => contracts.parse('cliGenerationManifest', 'input', { items: [{ request_id: '01234567-89ab-4cde-8fab-0123456789ab', request }] })).toThrow('weight is invalid')
  })

  it.each(['', 'line\u0000break', 'x'.repeat(501)])('rejects invalid nested JSON keys at the shared schema and manifest boundaries: %j', key => {
    const request = { title: 'portrait', instance_id: '2', template_id: '39', model: null, parameters: { x: { [key]: 1 } }, loras: [] }
    expect(() => contracts.parse('cliGenerationRequest', 'input', request)).toThrow()
    expect(() => contracts.parse('cliGenerationManifest', 'input', { items: [{ request_id: '01234567-89ab-4cde-8fab-0123456789ab', request }] })).toThrow('key is invalid')
  })

  it('requires an explicit model field while preserving a null model and nested JSON nulls', () => {
    const request: Record<string, unknown> = { title: 'portrait', instance_id: '2', template_id: '39', model: null, parameters: { x: [null, { key: null }] }, loras: [] }
    expect(contracts.parse('cliGenerationRequest', 'input', request)).toEqual(request)
    delete request.model
    expect(() => contracts.parse('cliGenerationRequest', 'input', request)).toThrow('model')
    expect(() => contracts.parse('cliGenerationManifest', 'input', { items: [{ request_id: '01234567-89ab-4cde-8fab-0123456789ab', request }] })).toThrow(ContractError)
  })

  it.each([{ depth: 64, accepted: true }, { depth: 65, accepted: false }])('applies the recursive JSON depth boundary at depth $depth', ({ depth, accepted }) => {
    let parameters: unknown = 'leaf'
    for (let index = 0; index < depth; index++) parameters = { x: parameters }
    const request = { title: 'portrait', instance_id: '2', template_id: '39', model: null, parameters, loras: [] }
    const schema = () => contracts.parse('cliGenerationRequest', 'input', request)
    const manifest = () => contracts.parse('cliGenerationManifest', 'input', { items: [{ request_id: '01234567-89ab-4cde-8fab-0123456789ab', request }] })
    if (accepted) { expect(schema).not.toThrow(); expect(manifest).not.toThrow() }
    else { expect(schema).toThrow('JSON depth'); expect(manifest).toThrow('JSON depth') }
  })

  it('requires nullable template values and preserves nulls in result arrays and objects', () => {
    const parameter: Record<string, unknown> = { parameter_id: 'prompt', kind: 'positive_prompt', value_type: 'string', current_value: null, allowed_values: [null] }
    const mapped: Record<string, unknown> = { value: null, width: 1, height: 1 }
    const data = { parameters: [parameter], size_candidates: [{ candidate_id: 'size', representation: 'resolution_preset', parameter, mapped_options: [mapped], unmapped_values: [null] }] }
    expect(contracts.parse('generation inspect-template-parameters', 'output', data)).toEqual(data)
    delete parameter.current_value
    expect(() => contracts.parse('generation inspect-template-parameters', 'output', data)).toThrow()
    parameter.current_value = null
    delete mapped.value
    expect(() => contracts.parse('generation inspect-template-parameters', 'output', data)).toThrow()
  })

  it.each([
    { currentValue: 'portrait' },
    { currentValue: 20 },
    { currentValue: false },
    { currentValue: [null, 'preset'] },
    { currentValue: { enabled: true, options: [1, null] } },
  ])('preserves non-null JSON template values: $currentValue', ({ currentValue }) => {
    const data = { parameters: [{ parameter_id: 'preset', kind: 'resolution_preset', value_type: 'choice', current_value: currentValue }], size_candidates: [] }
    expect(contracts.parse('generation inspect-template-parameters', 'output', data)).toEqual(data)
  })

  it.each([Infinity, { nested: undefined }])('rejects invalid JSON template values: %j', currentValue => {
    const data = { parameters: [{ parameter_id: 'preset', kind: 'resolution_preset', value_type: 'choice', current_value: currentValue }], size_candidates: [] }
    expect(() => contracts.parse('generation inspect-template-parameters', 'output', data)).toThrow()
  })

  it('rejects retired Catalog commands at argv and JSON request boundaries', () => {
    expect(CLI_ROUTE_PATH).toBe('/api/harness-comfyui/cli/v1')
    const commands = [
      { argv: ['catalog', 'template', 'resolve', '--id', '39'], request: { command: 'catalog.template.resolve', id: '39' } },
      { argv: ['catalog', 'generation-model', 'resolve', '--id', '3'], request: { command: 'catalog.generation-model.resolve', id: '3' } },
      { argv: ['catalog', 'lora', 'resolve', '--id', '91'], request: { command: 'catalog.lora.resolve', id: '91' } },
      { argv: ['catalog', 'instance', 'list'], request: { command: 'catalog.instance.list' } },
      {
        argv: ['catalog', 'search', '--kind', 'model', '--query', 'portrait', '--page', '2'],
        request: { command: 'catalog.search', kind: 'model', query: 'portrait', page: 2, base_model_id: null },
      },
    ]
    for (const { argv, request } of commands) {
      expect(() => contracts.parse('cliArguments', 'input', { argv: argv, stdin: '' })).toThrow('CLI command')
      expect(() => contracts.parse('cliRequest', 'input', request)).toThrow('CLI request command')
    }
  })

  it('parses a Generation manifest and maps its request to the runtime contract', () => {
    const input = {
      title: 'portrait',
      instance_id: '2',
      template_id: '39',
      model: { id: '3', file_name: 'anima-aesthetic-v1.1.safetensors' },
      parameters: {
        positive_prompt: 'adult woman, portrait',
        steps: 20,
        nested: { enabled: true, values: ['a', null] },
      },
      loras: [{
        id: '91',
        file_name: 'age-slider.safetensors',
        weight: 0.7,
        trigger_words: ['mature woman'],
      }],
    }
    const items = [{ request_id: '01234567-89ab-4cde-8fab-0123456789ab', request: input, parameter_files: { negative_prompt: '/tmp/negative.txt' } }]
    const manifest = contracts.parse('cliGenerationManifest', 'input', { items })

    expect(manifest).toEqual(items)
    expect(contracts.parse('runtimeGenerationRequest', 'input', manifest[0]!.request)).toEqual({
      title: 'portrait',
      instanceId: '2',
      templateId: '39',
      model: { id: '3', fileName: 'anima-aesthetic-v1.1.safetensors' },
      parameters: {
        positive_prompt: 'adult woman, portrait',
        steps: 20,
        nested: { enabled: true, values: ['a', null] },
      },
      loras: [{
        id: '91',
        fileName: 'age-slider.safetensors',
        weight: 0.7,
        triggerWords: ['mature woman'],
      }],
    })
  })

  it('parses one to twenty historical Generation Run IDs without validating each ID as a top-level failure', () => {
    expect(contracts.parse('cliArguments', 'input', { argv: ['generation', 'run-inputs', '--stdin'], stdin: JSON.stringify({ run_ids: ['run_1', 'not a valid run id'] }) })).toEqual({
      command: 'generation.run-inputs',
      run_ids: ['run_1', 'not a valid run id'],
    })
    expect(contracts.parse('cliRequest', 'input', {
      command: 'generation.run-inputs',
      run_ids: Array.from({ length: 20 }, (_, index) => `run_${index}`),
    })).toEqual({
      command: 'generation.run-inputs',
      run_ids: Array.from({ length: 20 }, (_, index) => `run_${index}`),
    })
  })

  it('parses strict template inspection and random Seed stdin contracts', () => {
    expect(contracts.parse('cliArguments', 'input', { argv: ['generation', 'inspect-template-parameters', '--stdin'], stdin: JSON.stringify({ template_id: 'new-template', instance_id: 'gpu-2' }) })).toEqual({
      command: 'generation.inspect-template-parameters',
      template_id: 'new-template',
      instance_id: 'gpu-2',
    })
    expect(contracts.parse('cliArguments', 'input', { argv: ['generation', 'random-seeds', '--stdin'], stdin: JSON.stringify({ count: 20 }) })).toEqual({ command: 'generation.random-seeds', count: 20 })
  })

  it('rejects invalid template inspection IDs and random Seed counts', () => {
    expect(() => contracts.parse('cliArguments', 'input', { argv: ['generation', 'inspect-template-parameters', '--stdin'], stdin: JSON.stringify({ template_id: '', instance_id: '2' }) })).toThrow('template_id')
    expect(() => contracts.parse('cliArguments', 'input', { argv: ['generation', 'inspect-template-parameters', '--stdin'], stdin: JSON.stringify({ template_id: '34', instance_id: '  ' }) })).toThrow('instance_id')
    expect(() => contracts.parse('cliRequest', 'input', {
      command: 'generation.inspect-template-parameters', template_id: '34', instance_id: '2', extra: true,
    })).toThrow(ContractError)
    for (const count of [0, 1.5, 21, '2']) {
      expect(() => contracts.parse('cliArguments', 'input', { argv: ['generation', 'random-seeds', '--stdin'], stdin: JSON.stringify({ count }) })).toThrow('count')
    }
    expect(() => contracts.parse('cliArguments', 'input', { argv: ['generation', 'random-seeds', '--stdin'], stdin: JSON.stringify({}) })).toThrow(ContractError)
    expect(() => contracts.parse('cliArguments', 'input', { argv: ['generation', 'random-seeds', '--stdin'], stdin: JSON.stringify({ count: 1, extra: true }) })).toThrow(ContractError)
  })

  it('rejects malformed historical Run query envelopes and batch sizes', () => {
    expect(() => contracts.parse('cliRequest', 'input', { command: 'generation.run-inputs', run_ids: [] })).toThrow('run_ids')
    expect(() => contracts.parse('cliRequest', 'input', {
      command: 'generation.run-inputs',
      run_ids: Array.from({ length: 21 }, (_, index) => `run_${index}`),
    })).toThrow('run_ids')
    expect(() => contracts.parse('cliRequest', 'input', { command: 'generation.run-inputs', run_ids: ['run_1', 2] })).toThrow('run_ids')
    expect(() => contracts.parse('cliRequest', 'input', { command: 'generation.run-inputs', run_ids: ['run_1'], extra: true })).toThrow(ContractError)
    expect(() => contracts.parse('cliArguments', 'input', { argv: ['generation', 'run-inputs', '--stdin'], stdin: '{' })).toThrow('Generation Run stdin')
  })

  it('parses Generation media resolution and single-image inspection commands', () => {
    expect(contracts.parse('cliArguments', 'input', { argv: ['generation', 'resolve-media', '--stdin'], stdin: JSON.stringify({ run_ids: ['run_1', 'run_2'] }) })).toEqual({ command: 'generation.resolve-media', run_ids: ['run_1', 'run_2'], include_parameters: false })
    expect(contracts.parse('cliArguments', 'input', { argv: ['image', 'inspect', '--stdin'], stdin: JSON.stringify({ file_path: '/media/result.png' }) })).toEqual({ command: 'image.inspect', file_path: '/media/result.png' })
    expect(contracts.parse('cliArguments', 'input', { argv: ['image', 'inspect', '--stdin'], stdin: JSON.stringify({ file_path: '/media/result.png', prompt: '只识别图片中的文字。\n保留原始顺序。' }) })).toEqual({
      command: 'image.inspect',
      file_path: '/media/result.png',
      prompt: '只识别图片中的文字。\n保留原始顺序。',
    })
  })

  it('rejects malformed Generation media resolution and image inspection stdin', () => {
    expect(() => contracts.parse('cliArguments', 'input', { argv: ['generation', 'resolve-media', '--stdin'], stdin: JSON.stringify({ run_ids: [] }) })).toThrow('run_ids')
    expect(() => contracts.parse('cliArguments', 'input', { argv: ['generation', 'resolve-media', '--stdin'], stdin: JSON.stringify({ run_ids: Array.from({ length: 21 }, (_, index) => `run_${index}`) }) })).toThrow('run_ids')
    expect(() => contracts.parse('cliArguments', 'input', { argv: ['image', 'inspect', '--stdin'], stdin: JSON.stringify({}) })).toThrow('file_path')
    expect(() => contracts.parse('cliArguments', 'input', { argv: ['image', 'inspect', '--stdin'], stdin: JSON.stringify({ file_path: '/media/result\n.png' }) })).toThrow('file_path')
    expect(() => contracts.parse('cliArguments', 'input', { argv: ['image', 'inspect', '--stdin'], stdin: JSON.stringify({ file_path: '/media/result.png', prompt: 1 }) })).toThrow(/prompt.*string/u)
    expect(() => contracts.parse('cliArguments', 'input', { argv: ['image', 'inspect', '--stdin'], stdin: JSON.stringify({ file_path: '/media/result.png', extra: true }) })).toThrow(ContractError)
  })

  it('rejects undocumented commands, extra properties, invalid ids, and invalid JSON values', () => {
    expect(() => contracts.parse('cliArguments', 'input', { argv: ['image', 'run-media', '--stdin'], stdin: JSON.stringify({ run_ids: ['run_1'] }) }))
      .toThrow('CLI command')
    expect(() => contracts.parse('cliArguments', 'input', { argv: ['catalog', 'model', 'guess'], stdin: '' })).toThrow('CLI command')
    expect(() => contracts.parse('cliArguments', 'input', { argv: ['catalog', 'template', 'resolve', '--id', '0'], stdin: '' })).toThrow('CLI command')
    expect(() => contracts.parse('cliRequest', 'input', { command: 'catalog.instance.list', extra: true })).toThrow('CLI request command')
    expect(() => contracts.parse('cliRequest', 'input', {
      command: 'generation.submit',
      items: [{ request_id: '01234567-89ab-4cde-8fab-0123456789ab', request: {
        title: 'portrait',
        instance_id: '2',
        template_id: '39',
        model: null,
        parameters: { steps: Number.NaN },
        loras: [],
      } }],
    })).toThrow('parameters')
  })
})
