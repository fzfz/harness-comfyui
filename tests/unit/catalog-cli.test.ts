import { describe, expect, it, vi } from 'vitest'

import {
  CatalogCli,
  CatalogCliError,
  runCatalogCliProcess,
  type CatalogCliProcess,
} from '../../src/host/catalog/catalog-cli.ts'

function response(results: readonly unknown[], totalCount = results.length, page = 1, pageSize = 9): string {
  return JSON.stringify({
    status: 'ok',
    message: null,
    results,
    page,
    page_size: pageSize,
    total_count: totalCount,
  })
}

function catalog(process: CatalogCliProcess): CatalogCli {
  return new CatalogCli({ executable: '/source/imagegen-semantic-query', port: 18093, process })
}

describe('Catalog CLI adapter', () => {
  it('queries the ComfyUI instance directory with the fixed CLI request and returns only instance ids', async () => {
    const execute = vi.fn<CatalogCliProcess>(async () => ({
      exitCode: 0,
      stdout: response([{
        id: 2,
        title: 'win3080',
        url: 'http://127.0.0.1:8188',
        authorization: 'not-agent-visible',
      }], 1, 1, 100),
      stderr: '',
    }))
    const controller = new AbortController()
    const request = { mode: 'search', query: '', page: 1, page_size: 100 } as const

    await expect(catalog(execute).queryComfyuiInstances(request, controller.signal)).resolves.toEqual({
      status: 'ok',
      message: null,
      results: [{ id: '2' }],
      page: 1,
      page_size: 100,
      total_count: 1,
    })
    expect(execute).toHaveBeenCalledWith('/source/imagegen-semantic-query', [
      '--port', '18093',
      '--timeout-ms', '15000',
      '--path', '/internal/semantic/comfyui-instances',
      '--mode', 'search',
      '--query', '',
      '--page', '1',
      '--page_size', '100',
    ], controller.signal)
  })

  it.each([
    [response([], 0, 1, 9), 'envelope'],
    [response([{ id: 0, title: 'win3080' }], 1, 1, 100), 'id'],
  ])('rejects an invalid ComfyUI instance CLI response %#', async (stdout, message) => {
    const execute: CatalogCliProcess = async () => ({ exitCode: 0, stdout, stderr: '' })
    await expect(catalog(execute).queryComfyuiInstances(
      { mode: 'search', query: '', page: 1, page_size: 100 },
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'CATALOG_PROTOCOL_ERROR', message: expect.stringContaining(message) })
  })

  it('rejects a non-fixed ComfyUI instance request before calling the CLI', async () => {
    const execute = vi.fn<CatalogCliProcess>()
    await expect(catalog(execute).queryComfyuiInstances(
      { mode: 'search', query: '', page: 1, page_size: 99 } as never,
      new AbortController().signal,
    )).rejects.toThrow('fixed search request')
    expect(execute).not.toHaveBeenCalled()
  })

  it('uses fixed CLI arguments and returns only the safe catalog projection', async () => {
    const execute = vi.fn<CatalogCliProcess>(async () => ({
      exitCode: 0,
      stdout: response([{
        id: 37,
        base_model_id: 2,
        model_id: 1,
        title: 'wai_txt2img_lora',
        template_type: 'text_to_image',
        cover_url: 'http://127.0.0.1:18092/media/images/template.webp',
        workflow_json: { secretHostOnlyGraph: true },
        parameters_json: [
          { parameter_id: 'prompt', kind: 'positive_prompt', value_type: 'string', required: true, visible: true },
          { parameter_id: 'sampler', kind: 'sampler_name', value_type: 'enum', required: true, visible: true },
          { parameter_id: 'reference', kind: 'image', value_type: 'image_reference', required: false, visible: true },
        ],
      }], 35, 2),
      stderr: '',
    }))
    const controller = new AbortController()

    await expect(catalog(execute).search({
      kind: 'comfyui-template', query: 'wai', page: 2, baseModelId: '2',
    }, controller.signal))
      .resolves.toEqual({
        kind: 'comfyui-template',
        query: 'wai',
        page: 2,
        items: [{
          context: {
            kind: 'comfyui-template', id: '37', title: 'wai_txt2img_lora',
          },
          label: 'wai_txt2img_lora',
          subtitle: 'text_to_image',
          coverUrl: 'http://127.0.0.1:18092/media/images/template.webp',
        }],
        totalCount: 35,
      })
    expect(execute).toHaveBeenCalledWith('/source/imagegen-semantic-query', [
      '--port', '18093',
      '--timeout-ms', '15000',
      '--path', '/internal/semantic/comfyui-templates',
      '--mode', 'search',
      '--query', 'wai',
      '--page', '2',
      '--page_size', '9',
      '--base_model_id', '2',
    ], controller.signal)
    expect(JSON.stringify((await catalog(execute).search(
      { kind: 'comfyui-template', query: 'wai', page: 2, baseModelId: '2' },
      controller.signal,
    )))).not.toContain('workflow_json')
  })

  it('resolves one Workflow template by id and removes its full Workflow from the Agent projection', async () => {
    const execute = vi.fn<CatalogCliProcess>(async () => ({
      exitCode: 0,
      stdout: response([{
        id: 37,
        base_model_id: 2,
        model_id: 1,
        title: 'wai_txt2img_lora',
        workflow_json: { hostOnlyGraph: true },
        parameters_json: [
          { parameter_id: 'positive_prompt', kind: 'positive_prompt', value_type: 'string', required: false, visible: true },
          { parameter_id: 'seed', kind: 'seed', value_type: 'integer', required: false, visible: true },
        ],
      }], 1, 1, 1),
      stderr: '',
    }))
    const controller = new AbortController()

    await expect(catalog(execute).resolveTemplate('37', controller.signal)).resolves.toEqual({
      id: '37',
      title: 'wai_txt2img_lora',
      base_model_id: '2',
      model_id: '1',
      parameters: [
        { parameter_id: 'positive_prompt', kind: 'positive_prompt', value_type: 'string', required: false },
        { parameter_id: 'seed', kind: 'seed', value_type: 'integer', required: false },
      ],
    })
    expect(execute).toHaveBeenCalledWith('/source/imagegen-semantic-query', [
      '--port', '18093',
      '--timeout-ms', '15000',
      '--path', '/internal/semantic/comfyui-templates',
      '--mode', 'resolve',
      '--id', '37',
    ], controller.signal)
    expect(JSON.stringify(await catalog(execute).resolveTemplate('37', controller.signal))).not.toContain('workflow_json')
  })

  it('resolves one LoRA with semantic guidance, trigger words, default weight, and the catalog file name', async () => {
    const execute = vi.fn<CatalogCliProcess>(async () => ({
      exitCode: 0,
      stdout: response([{
        id: 68,
        base_model_id: 2,
        model_id: 1,
        file_name: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors',
        description: '手绘质感、块面化明暗和冷暖对比。',
        usage: '使用 usnr，默认模型权重 1.0。',
        trigger_words_json: ['usnr'],
        weight: 1,
        cover_url: 'http://127.0.0.1:18092/media/images/lora.webp',
      }], 1, 1, 1),
      stderr: '',
    }))
    const controller = new AbortController()

    await expect(catalog(execute).resolveLora('68', controller.signal)).resolves.toEqual({
      id: '68',
      base_model_id: '2',
      model_id: '1',
      file_name: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors',
      description: '手绘质感、块面化明暗和冷暖对比。',
      usage: '使用 usnr，默认模型权重 1.0。',
      trigger_words: ['usnr'],
      weight: 1,
    })
    expect(execute).toHaveBeenCalledWith('/source/imagegen-semantic-query', [
      '--port', '18093',
      '--timeout-ms', '15000',
      '--path', '/internal/semantic/loras',
      '--mode', 'resolve',
      '--id', '68',
    ], controller.signal)
  })

  it('resolves one generation model with its semantic guidance and Prompt Skill', async () => {
    const execute = vi.fn<CatalogCliProcess>(async () => ({
      exitCode: 0,
      stdout: response([{
        id: 1,
        base_model_id: 2,
        file_name: 'waiIllustriousSDXL_v170.safetensors',
        description: 'WAI Illustrious generation model.',
        usage: 'Use the WAI Prompt Skill.',
        skill_name: 'wai-sdxl-prompt-builder',
      }], 1, 1, 1),
      stderr: '',
    }))
    const controller = new AbortController()

    await expect(catalog(execute).resolveGenerationModel('1', controller.signal)).resolves.toEqual({
      id: '1',
      base_model_id: '2',
      file_name: 'waiIllustriousSDXL_v170.safetensors',
      description: 'WAI Illustrious generation model.',
      usage: 'Use the WAI Prompt Skill.',
      skill_name: 'wai-sdxl-prompt-builder',
    })
    expect(execute).toHaveBeenCalledWith('/source/imagegen-semantic-query', [
      '--port', '18093',
      '--timeout-ms', '15000',
      '--path', '/internal/semantic/generation-models',
      '--mode', 'resolve',
      '--id', '1',
    ], controller.signal)
  })

  it.each([
    ['model', { id: 15, file_name: 'model.safetensors', author: 'author', cover_url: null }, { kind: 'model', id: '15', file_name: 'model.safetensors' }],
    ['lora', { id: 91, file_name: 'lora.safetensors', author: 'author', cover_url: null }, { kind: 'lora', id: '91', file_name: 'lora.safetensors' }],
    ['work', { id: 3761, name: '.flow', category_name: '.flow', cover_url: null }, { kind: 'work', id: '3761', name: '.flow' }],
    ['character', { id: 39933, name: '2b', 'works.name': '尼尔机械纪元', prompt_text: '2b, yorha no. 2 type b', cover_url: null }, {
      kind: 'character', id: '39933', work_name: '尼尔机械纪元', character_name: '2b', prompt_text: '2b, yorha no. 2 type b',
    }],
    ['style', { id: 12415, name: 'say_hana', prompt_text: 'say_hana', cover_url: null }, {
      kind: 'style', id: '12415', name: 'say_hana', prompt_text: 'say_hana',
    }],
    ['prompt-term', { id: 49856, canonical_tag: 'ryuujin_no_senpai', post_count: 50 }, {
      kind: 'prompt-term', id: '49856', tag: 'ryuujin_no_senpai',
    }],
    ['artist-string', { id: 7, title: 'watercolor', description: 'watercolor artists', artist_string: '@artist_a, @artist_b', cover_url: null }, {
      kind: 'artist-string', id: '7', title: 'watercolor', prompt_text: '@artist_a, @artist_b',
    }],
    ['comfyui-template', { id: 37, title: 'wai_txt2img_lora', template_type: 'text_to_image', cover_url: null, parameters_json: [] }, {
      kind: 'comfyui-template', id: '37', title: 'wai_txt2img_lora',
    }],
  ] as const)('projects the %s CLI record into exact Agent context data', async (kind, source, context) => {
    const execute: CatalogCliProcess = async () => ({ exitCode: 0, stdout: response([source]), stderr: '' })
    const result = await catalog(execute).search(
      { kind, query: '', page: 1, baseModelId: null },
      new AbortController().signal,
    )

    expect(result.items[0]?.context).toEqual(context)
    expect(JSON.stringify(result.items[0]?.context)).not.toMatch(/label|subtitle|coverUrl|description/u)
  })

  it('returns an empty real page without inserting fixtures', async () => {
    const execute: CatalogCliProcess = async () => ({ exitCode: 0, stdout: response([]), stderr: '' })
    await expect(catalog(execute).search(
      { kind: 'artist-string', query: '', page: 1, baseModelId: null },
      new AbortController().signal,
    )).resolves.toEqual({ kind: 'artist-string', query: '', page: 1, items: [], totalCount: 0 })
  })

  it('loads the actual base-model operation as a separate safe list', async () => {
    const execute = vi.fn<CatalogCliProcess>(async () => ({
      exitCode: 0,
      stdout: response([{ id: 3, name: 'krea2' }, { id: 2, name: 'wai' }, { id: 1, name: 'anima' }], 3, 1, 20),
      stderr: '',
    }))
    const controller = new AbortController()
    await expect(catalog(execute).baseModels(controller.signal)).resolves.toEqual({
      items: [{ id: '3', label: 'krea2' }, { id: '2', label: 'wai' }, { id: '1', label: 'anima' }],
    })
    expect(execute).toHaveBeenCalledWith('/source/imagegen-semantic-query', [
      '--port', '18093',
      '--timeout-ms', '15000',
      '--path', '/internal/semantic/base-models',
      '--mode', 'search',
      '--query', '',
      '--page', '1',
      '--page_size', '20',
    ], controller.signal)
  })

  it.each([
    [{ exitCode: 7, stdout: '', stderr: '{"status":"error"}' }, 'CATALOG_QUERY_FAILED'],
    [{ exitCode: 0, stdout: '', stderr: '' }, 'CATALOG_QUERY_FAILED'],
    [{ exitCode: 0, stdout: '{broken', stderr: '' }, 'CATALOG_PROTOCOL_ERROR'],
    [{ exitCode: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '' }, 'CATALOG_PROTOCOL_ERROR'],
    [{ exitCode: 0, stdout: response([{ id: 1 }]), stderr: '' }, 'CATALOG_PROTOCOL_ERROR'],
  ])('rejects CLI failure or invalid response %#', async (result, code) => {
    const execute: CatalogCliProcess = async () => result
    await expect(catalog(execute).search(
      { kind: 'model', query: '', page: 1, baseModelId: null },
      new AbortController().signal,
    )).rejects.toMatchObject({ code })
  })

  it('rejects invalid adapter configuration before a query', () => {
    expect(() => new CatalogCli({ executable: '', port: 18093 })).toThrow('executable')
    expect(() => new CatalogCli({ executable: '/catalog', port: 0 })).toThrow('port')
  })

  it('terminates a running child process when the caller aborts', async () => {
    const controller = new AbortController()
    const pending = runCatalogCliProcess(
      process.execPath,
      ['--input-type=module', '--eval', 'setInterval(() => undefined, 1000)'],
      controller.signal,
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects before spawning when the caller is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(runCatalogCliProcess(process.execPath, ['--version'], controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' })
  })

  it('collects both output streams and reports the child exit code', async () => {
    await expect(runCatalogCliProcess(process.execPath, [
      '--input-type=module',
      '--eval',
      'process.stdout.write("catalog-out"); process.stderr.write("catalog-error"); process.exitCode = 7',
    ], new AbortController().signal)).resolves.toEqual({
      exitCode: 7,
      stdout: 'catalog-out',
      stderr: 'catalog-error',
    })
  })

  it('maps a child spawn error to the stable query error', async () => {
    await expect(runCatalogCliProcess(
      '/path/that/does/not/exist/imagegen-semantic-query',
      [],
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'CATALOG_QUERY_FAILED' })
  })

  it('terminates a child whose combined output exceeds the fixed limit', async () => {
    await expect(runCatalogCliProcess(process.execPath, [
      '--input-type=module',
      '--eval',
      'process.stdout.write("x".repeat(33 * 1024 * 1024))',
    ], new AbortController().signal)).rejects.toMatchObject({ code: 'CATALOG_RESPONSE_TOO_LARGE' })
  })

  it('preserves a structured output-limit failure from the process runner', async () => {
    const execute: CatalogCliProcess = async () => {
      throw new CatalogCliError('CATALOG_RESPONSE_TOO_LARGE', 'too large')
    }
    await expect(catalog(execute).search(
      { kind: 'model', query: '', page: 1, baseModelId: null },
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'CATALOG_RESPONSE_TOO_LARGE' })
  })
})
