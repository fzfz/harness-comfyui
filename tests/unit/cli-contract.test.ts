import { describe, expect, it } from 'vitest'

import {
  CLI_ROUTE_PATH,
  parseCliArguments,
  parseCliGenerationManifest,
  parseCliRequest,
  toGenerationRequest,
} from '../../src/cli/contract.ts'

it('accepts an explicit parameter query and defaults media queries to lightweight results', () => {
  expect(parseCliArguments(['generation', 'resolve-media', '--stdin'], '{"run_ids":["run_1"],"include_parameters":true}'))
    .toEqual({ command: 'generation.resolve-media', run_ids: ['run_1'], include_parameters: true })
  expect(parseCliRequest({ command: 'generation.resolve-media', run_ids: ['run_1'] }))
    .toEqual({ command: 'generation.resolve-media', run_ids: ['run_1'], include_parameters: false })
  expect(() => parseCliRequest({ command: 'generation.resolve-media', run_ids: ['run_1'], include_parameters: 'true' }))
    .toThrow('include_parameters')
})

describe('Harness ComfyUI CLI contract', () => {
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
