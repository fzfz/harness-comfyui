import { describe, expect, it } from 'vitest'

import {
  CLI_ROUTE_PATH,
  parseCliArguments,
  parseCliRequest,
  toGenerationRequest,
} from '../../src/cli/contract.ts'

describe('Harness ComfyUI CLI contract', () => {
  it('parses every Catalog command from the documented argv grammar', () => {
    expect(CLI_ROUTE_PATH).toBe('/api/harness-comfyui/cli/v1')
    expect(parseCliArguments(['catalog', 'template', 'resolve', '--id', '39'], '')).toEqual({
      command: 'catalog.template.resolve', id: '39',
    })
    expect(parseCliArguments(['catalog', 'generation-model', 'resolve', '--id', '3'], '')).toEqual({
      command: 'catalog.generation-model.resolve', id: '3',
    })
    expect(parseCliArguments(['catalog', 'lora', 'resolve', '--id', '91'], '')).toEqual({
      command: 'catalog.lora.resolve', id: '91',
    })
    expect(parseCliArguments(['catalog', 'instance', 'list'], '')).toEqual({
      command: 'catalog.instance.list',
    })
    expect(parseCliArguments([
      'catalog', 'search', '--kind', 'model', '--query', 'portrait', '--page', '2', '--base-model-id', '1',
    ], '')).toEqual({
      command: 'catalog.search',
      kind: 'model',
      query: 'portrait',
      page: 2,
      base_model_id: '1',
    })
  })

  it('parses stdin Generation JSON and maps it to the existing runtime request', () => {
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
    const request = parseCliArguments(['generation', 'submit', '--stdin'], JSON.stringify(input))

    expect(request).toEqual({ command: 'generation.submit', request: input })
    if (request.command !== 'generation.submit') throw new Error('Expected a generation request.')
    expect(toGenerationRequest(request.request)).toEqual({
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
    )).toEqual({ command: 'generation.resolve-media', run_ids: ['run_1', 'run_2'] })
    expect(parseCliArguments(
      ['image', 'inspect', '--stdin'],
      JSON.stringify({ file_path: '/media/result.png' }),
    )).toEqual({ command: 'image.inspect', file_path: '/media/result.png' })
    expect(parseCliArguments(
      ['image', 'inspect', '--stdin'],
      JSON.stringify({ file_path: '/media/result.png', prompt: '只描述构图' }),
    )).toEqual({ command: 'image.inspect', file_path: '/media/result.png', prompt: '只描述构图' })
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
      JSON.stringify({ file_path: '/media/result.png', prompt: 3 }),
    )).toThrow('prompt')
    expect(() => parseCliArguments(
      ['image', 'inspect', '--stdin'],
      JSON.stringify({ file_path: '/media/result.png', extra: true }),
    )).toThrow('properties')
  })

  it('rejects undocumented commands, extra properties, invalid ids, and invalid JSON values', () => {
    expect(() => parseCliArguments(['image', 'run-media', '--stdin'], JSON.stringify({ run_ids: ['run_1'] })))
      .toThrow('CLI command')
    expect(() => parseCliArguments(['catalog', 'model', 'guess'], '')).toThrow('CLI command')
    expect(() => parseCliArguments(['catalog', 'template', 'resolve', '--id', '0'], '')).toThrow('id')
    expect(() => parseCliRequest({ command: 'catalog.instance.list', extra: true })).toThrow('properties')
    expect(() => parseCliArguments(['generation', 'submit', '--stdin'], '{')).toThrow('Generation stdin')
    expect(() => parseCliRequest({
      command: 'generation.submit',
      request: {
        title: 'portrait',
        instance_id: '2',
        template_id: '39',
        model: null,
        parameters: { steps: Number.NaN },
        loras: [],
      },
    })).toThrow('parameters')
  })
})
