import Schema from '@deepseek-ai/schemastery'
import { cliResultSchemas } from '../../src/cli/result-schema.ts'
import { cliGenerationRequestSchema, cliInputSchemas } from '../../src/cli/input-schema.ts'
import { describe, expect, it } from 'vitest'

import {
  CLI_ROUTE_PATH,
  parseCliArguments,
  parseCliGenerationManifest,
  parseCliRequest,
  toGenerationRequest,
} from '../../src/cli/contract.ts'

it('rejects explicit undefined values in optional CLI input fields', () => {
  for (const [command, input] of [
    ['generation resolve-media', { run_ids: ['run_1'], include_parameters: undefined }],
    ['image inspect', { file_path: '/tmp/result.png', prompt: undefined }],
  ] as const) {
    expect(() => Schema.resolve(input, cliInputSchemas[command], {})).toThrow()
    expect(() => parseCliRequest({ command: command.replace(' ', '.'), ...input })).toThrow()
  }
})

it('accepts an explicit parameter query and defaults media queries to lightweight results', () => {
  expect(parseCliArguments(['generation', 'resolve-media', '--stdin'], '{"run_ids":["run_1"],"include_parameters":true}'))
    .toEqual({ command: 'generation.resolve-media', run_ids: ['run_1'], include_parameters: true })
  expect(parseCliRequest({ command: 'generation.resolve-media', run_ids: ['run_1'] }))
    .toEqual({ command: 'generation.resolve-media', run_ids: ['run_1'], include_parameters: false })
  expect(Schema.resolve({ run_ids: ['run_1'] }, cliInputSchemas['generation resolve-media'], {})[0])
    .toEqual({ run_ids: ['run_1'], include_parameters: false })
  expect(() => parseCliRequest({ command: 'generation.resolve-media', run_ids: ['run_1'], include_parameters: 'true' }))
    .toThrow('include_parameters')
})

describe('Harness ComfyUI CLI contract', () => {
  it('parses Run observation registration and rejects caller-owned identities', () => {
    expect(parseCliArguments(['generation', 'wait', '--stdin'], '{"run_ids":["run_1"]}')).toEqual({ command: 'generation.wait', run_ids: ['run_1'] })
    for (const source of [
      { run_ids: [] }, { run_ids: Array(21).fill('run_1') },
      { run_ids: ['run_1'], owner: 'forged' }, { run_ids: ['run_1'], session_id: 'forged' },
    ]) {
      expect(() => parseCliArguments(['generation', 'wait', '--stdin'], JSON.stringify(source))).toThrow()
    }
    expect(Schema.resolve({ job_id: 'generation-wait-1', run_ids: ['run_1'] }, cliResultSchemas['generation wait'], {})[0]).toEqual({ job_id: 'generation-wait-1', run_ids: ['run_1'] })
    expect(() => Schema.resolve({ job_id: '', run_ids: [] }, cliResultSchemas['generation wait'], {})).toThrow()
  })

  it.each(['request', 'model', 'lora', 'item', 'manifest'])('rejects unknown %s fields through schema and manifest parsing', location => {
    const extra = location === 'request' ? { extra: true } : {}
    const request = { title: 'portrait', instance_id: '2', template_id: '39', model: location === 'model' ? { id: '3', file_name: 'model.safetensors', extra: true } : null, parameters: {}, loras: location === 'lora' ? [{ id: '91', file_name: 'lora.safetensors', weight: 1, trigger_words: [], extra: true }] : [], ...extra }
    const item = { request_id: '01234567-89ab-4cde-8fab-0123456789ab', request, ...(location === 'item' ? { extra: true } : {}) }
    const manifest = { items: [item], ...(location === 'manifest' ? { extra: true } : {}) }
    expect(() => Schema.resolve(manifest, cliInputSchemas['generation submit'], {})).toThrow()
    expect(() => parseCliGenerationManifest(manifest)).toThrow('properties')
  })

  it.each(['duplicate request ID', 'parameter conflict', 'undefined files'])('rejects invalid submission fields through schema and manifest parsing: %s', kind => {
    const request = { title: 'portrait', instance_id: '2', template_id: '39', model: null, parameters: kind === 'parameter conflict' ? { prompt: 'inline' } : {}, loras: [] }
    const item = { request_id: '01234567-89ab-4cde-8fab-0123456789ab', request, ...(kind === 'parameter conflict' ? { parameter_files: { prompt: '/tmp/prompt.txt' } } : kind === 'undefined files' ? { parameter_files: undefined } : {}) }
    const manifest = { items: kind === 'duplicate request ID' ? [item, item] : [item] }
    expect(() => Schema.resolve(manifest, cliInputSchemas['generation submit'], {})).toThrow()
    expect(() => parseCliGenerationManifest(manifest)).toThrow()
  })

  it('rejects duplicate LoRA trigger words through schema and manifest parsing', () => {
    const request = { title: 'portrait', instance_id: '2', template_id: '39', model: null, parameters: {}, loras: [{ id: '91', file_name: 'lora.safetensors', weight: 0.7, trigger_words: ['portrait', 'portrait'] }] }
    expect(() => Schema.resolve(request, cliGenerationRequestSchema, {})).toThrow()
    expect(() => parseCliGenerationManifest({ items: [{ request_id: '01234567-89ab-4cde-8fab-0123456789ab', request }] })).toThrow('contains duplicates')
  })

  it.each([-Number.MAX_VALUE, -0, Number.MAX_VALUE])('preserves finite LoRA weight boundaries: %s', weight => {
    const request = { title: 'portrait', instance_id: '2', template_id: '39', model: null, parameters: {}, loras: [{ id: '91', file_name: 'lora.safetensors', weight, trigger_words: ['portrait', 'Portrait'] }] }
    expect(Schema.resolve(request, cliGenerationRequestSchema, {})[0]).toEqual(request)
    expect(parseCliGenerationManifest({ items: [{ request_id: '01234567-89ab-4cde-8fab-0123456789ab', request }] })[0]!.request).toEqual(request)
  })

  it('rejects a JSON exponent that overflows a LoRA weight before submission', () => {
    const document = '{"items":[{"request_id":"01234567-89ab-4cde-8fab-0123456789ab","request":{"title":"portrait","instance_id":"2","template_id":"39","model":null,"parameters":{},"loras":[{"id":"91","file_name":"lora.safetensors","weight":1e309,"trigger_words":[]}]}}]}'
    expect(() => parseCliGenerationManifest(JSON.parse(document))).toThrow('weight is invalid')
  })

  it('preserves result fields outside the input-only exact field boundary', () => {
    const result = { parameters: [], size_candidates: [], extra: 'preserved' }
    expect(Schema.resolve(result, cliResultSchemas['generation inspect-template-parameters'], {})[0]).toEqual(result)
  })

  it.each([Infinity, -Infinity, NaN])('rejects non-finite LoRA weights through schema and manifest parsing: %s', weight => {
    const request = { title: 'portrait', instance_id: '2', template_id: '39', model: null, parameters: {}, loras: [{ id: '91', file_name: 'lora.safetensors', weight, trigger_words: [] }] }
    expect(() => Schema.resolve(request, cliGenerationRequestSchema, {})).toThrow()
    expect(() => parseCliGenerationManifest({ items: [{ request_id: '01234567-89ab-4cde-8fab-0123456789ab', request }] })).toThrow('weight is invalid')
  })

  it.each(['', 'line\u0000break', 'x'.repeat(501)])('rejects invalid nested JSON keys at the shared schema and manifest boundaries: %j', key => {
    const request = { title: 'portrait', instance_id: '2', template_id: '39', model: null, parameters: { x: { [key]: 1 } }, loras: [] }
    expect(() => Schema.resolve(request, cliGenerationRequestSchema, {})).toThrow()
    expect(() => parseCliGenerationManifest({ items: [{ request_id: '01234567-89ab-4cde-8fab-0123456789ab', request }] })).toThrow('key is invalid')
  })

  it('requires an explicit model field while preserving a null model and nested JSON nulls', () => {
    const request: Record<string, unknown> = { title: 'portrait', instance_id: '2', template_id: '39', model: null, parameters: { x: [null, { key: null }] }, loras: [] }
    expect(Schema.resolve(request, cliGenerationRequestSchema, {})[0]).toEqual(request)
    delete request.model
    expect(() => Schema.resolve(request, cliGenerationRequestSchema, {})).toThrow('model')
    expect(() => parseCliGenerationManifest({ items: [{ request_id: '01234567-89ab-4cde-8fab-0123456789ab', request }] })).toThrow('properties')
  })

  it.each([{ depth: 64, accepted: true }, { depth: 65, accepted: false }])('applies the recursive JSON depth boundary at depth $depth', ({ depth, accepted }) => {
    let parameters: unknown = 'leaf'
    for (let index = 0; index < depth; index++) parameters = { x: parameters }
    const request = { title: 'portrait', instance_id: '2', template_id: '39', model: null, parameters, loras: [] }
    const schema = () => Schema.resolve(request, cliGenerationRequestSchema, {})
    const manifest = () => parseCliGenerationManifest({ items: [{ request_id: '01234567-89ab-4cde-8fab-0123456789ab', request }] })
    if (accepted) { expect(schema).not.toThrow(); expect(manifest).not.toThrow() }
    else { expect(schema).toThrow('JSON depth'); expect(manifest).toThrow('JSON depth') }
  })

  it('requires nullable template values and preserves nulls in result arrays and objects', () => {
    const parameter: Record<string, unknown> = { parameter_id: 'prompt', kind: 'positive_prompt', value_type: 'string', current_value: null, allowed_values: [null] }
    const mapped: Record<string, unknown> = { value: null, width: 1, height: 1 }
    const data = { parameters: [parameter], size_candidates: [{ candidate_id: 'size', representation: 'resolution_preset', parameter, mapped_options: [mapped], unmapped_values: [null] }] }
    const schema = cliResultSchemas['generation inspect-template-parameters']
    expect(Schema.resolve(data, schema, {})[0]).toEqual(data)
    delete parameter.current_value
    expect(() => Schema.resolve(data, schema, {})).toThrow()
    parameter.current_value = null
    delete mapped.value
    expect(() => Schema.resolve(data, schema, {})).toThrow()
  })

  it.each([
    { currentValue: 'portrait' },
    { currentValue: 20 },
    { currentValue: false },
    { currentValue: [null, 'preset'] },
    { currentValue: { enabled: true, options: [1, null] } },
  ])('preserves non-null JSON template values: $currentValue', ({ currentValue }) => {
    const data = { parameters: [{ parameter_id: 'preset', kind: 'resolution_preset', value_type: 'choice', current_value: currentValue }], size_candidates: [] }
    expect(Schema.resolve(data, cliResultSchemas['generation inspect-template-parameters'], {})[0]).toEqual(data)
  })

  it.each([Infinity, { nested: undefined }])('rejects invalid JSON template values: %j', currentValue => {
    const data = { parameters: [{ parameter_id: 'preset', kind: 'resolution_preset', value_type: 'choice', current_value: currentValue }], size_candidates: [] }
    expect(() => Schema.resolve(data, cliResultSchemas['generation inspect-template-parameters'], {})).toThrow()
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
      expect(() => parseCliArguments(argv, '')).toThrow('CLI command')
      expect(() => parseCliRequest(request)).toThrow('CLI request command')
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
    const manifest = parseCliGenerationManifest({ items })

    expect(manifest).toEqual(items)
    expect(toGenerationRequest(manifest[0]!.request)).toEqual({
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
    expect(parseCliArguments(
      ['generation', 'run-inputs', '--stdin'],
      JSON.stringify({ run_ids: ['run_1', 'not a valid run id'] }),
    )).toEqual({
      command: 'generation.run-inputs',
      run_ids: ['run_1', 'not a valid run id'],
    })
    expect(parseCliRequest({
      command: 'generation.run-inputs',
      run_ids: Array.from({ length: 20 }, (_, index) => `run_${index}`),
    })).toEqual({
      command: 'generation.run-inputs',
      run_ids: Array.from({ length: 20 }, (_, index) => `run_${index}`),
    })
  })

  it('parses strict template inspection and random Seed stdin contracts', () => {
    expect(parseCliArguments(
      ['generation', 'inspect-template-parameters', '--stdin'],
      JSON.stringify({ template_id: 'new-template', instance_id: 'gpu-2' }),
    )).toEqual({
      command: 'generation.inspect-template-parameters',
      template_id: 'new-template',
      instance_id: 'gpu-2',
    })
    expect(parseCliArguments(
      ['generation', 'random-seeds', '--stdin'],
      JSON.stringify({ count: 20 }),
    )).toEqual({ command: 'generation.random-seeds', count: 20 })
  })

  it('rejects invalid template inspection IDs and random Seed counts', () => {
    expect(() => parseCliArguments(
      ['generation', 'inspect-template-parameters', '--stdin'],
      JSON.stringify({ template_id: '', instance_id: '2' }),
    )).toThrow('template_id')
    expect(() => parseCliArguments(
      ['generation', 'inspect-template-parameters', '--stdin'],
      JSON.stringify({ template_id: '34', instance_id: '  ' }),
    )).toThrow('instance_id')
    expect(() => parseCliRequest({
      command: 'generation.inspect-template-parameters', template_id: '34', instance_id: '2', extra: true,
    })).toThrow('properties')
    for (const count of [0, 1.5, 21, '2']) {
      expect(() => parseCliArguments(
        ['generation', 'random-seeds', '--stdin'],
        JSON.stringify({ count }),
      )).toThrow('count')
    }
    expect(() => parseCliArguments(
      ['generation', 'random-seeds', '--stdin'],
      JSON.stringify({}),
    )).toThrow('properties')
    expect(() => parseCliArguments(
      ['generation', 'random-seeds', '--stdin'],
      JSON.stringify({ count: 1, extra: true }),
    )).toThrow('properties')
  })

  it('rejects malformed historical Run query envelopes and batch sizes', () => {
    expect(() => parseCliRequest({ command: 'generation.run-inputs', run_ids: [] })).toThrow('run_ids')
    expect(() => parseCliRequest({
      command: 'generation.run-inputs',
      run_ids: Array.from({ length: 21 }, (_, index) => `run_${index}`),
    })).toThrow('run_ids')
    expect(() => parseCliRequest({ command: 'generation.run-inputs', run_ids: ['run_1', 2] })).toThrow('run_ids')
    expect(() => parseCliRequest({ command: 'generation.run-inputs', run_ids: ['run_1'], extra: true })).toThrow('properties')
    expect(() => parseCliArguments(['generation', 'run-inputs', '--stdin'], '{')).toThrow('Generation Run stdin')
  })

  it('parses Generation media resolution and single-image inspection commands', () => {
    expect(parseCliArguments(
      ['generation', 'resolve-media', '--stdin'],
      JSON.stringify({ run_ids: ['run_1', 'run_2'] }),
    )).toEqual({ command: 'generation.resolve-media', run_ids: ['run_1', 'run_2'], include_parameters: false })
    expect(parseCliArguments(
      ['image', 'inspect', '--stdin'],
      JSON.stringify({ file_path: '/media/result.png' }),
    )).toEqual({ command: 'image.inspect', file_path: '/media/result.png' })
    expect(parseCliArguments(
      ['image', 'inspect', '--stdin'],
      JSON.stringify({ file_path: '/media/result.png', prompt: '只识别图片中的文字。\n保留原始顺序。' }),
    )).toEqual({
      command: 'image.inspect',
      file_path: '/media/result.png',
      prompt: '只识别图片中的文字。\n保留原始顺序。',
    })
  })

  it('rejects malformed Generation media resolution and image inspection stdin', () => {
    expect(() => parseCliArguments(['generation', 'resolve-media', '--stdin'], JSON.stringify({ run_ids: [] }))).toThrow('run_ids')
    expect(() => parseCliArguments(
      ['generation', 'resolve-media', '--stdin'],
      JSON.stringify({ run_ids: Array.from({ length: 21 }, (_, index) => `run_${index}`) }),
    )).toThrow('run_ids')
    expect(() => parseCliArguments(['image', 'inspect', '--stdin'], JSON.stringify({}))).toThrow('file_path')
    expect(() => parseCliArguments(
      ['image', 'inspect', '--stdin'],
      JSON.stringify({ file_path: '/media/result\n.png' }),
    )).toThrow('file_path')
    expect(() => parseCliArguments(
      ['image', 'inspect', '--stdin'],
      JSON.stringify({ file_path: '/media/result.png', prompt: 1 }),
    )).toThrow('prompt must be a string')
    expect(() => parseCliArguments(
      ['image', 'inspect', '--stdin'],
      JSON.stringify({ file_path: '/media/result.png', extra: true }),
    )).toThrow('properties')
  })

  it('rejects undocumented commands, extra properties, invalid ids, and invalid JSON values', () => {
    expect(() => parseCliArguments(['image', 'run-media', '--stdin'], JSON.stringify({ run_ids: ['run_1'] })))
      .toThrow('CLI command')
    expect(() => parseCliArguments(['catalog', 'model', 'guess'], '')).toThrow('CLI command')
    expect(() => parseCliArguments(['catalog', 'template', 'resolve', '--id', '0'], '')).toThrow('CLI command')
    expect(() => parseCliRequest({ command: 'catalog.instance.list', extra: true })).toThrow('CLI request command')
    expect(() => parseCliRequest({
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
