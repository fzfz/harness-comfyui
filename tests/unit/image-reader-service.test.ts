import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import errorCatalog from '../../config/error-catalog.json' with { type: 'json' }
import {
  createImageReaderProfile,
  IMAGE_READER_PROMPT_MAX_LENGTH,
} from '../../src/image-reader/settings.ts'
import { ImageReaderService } from '../../src/host/image-reader/image-reader-service.ts'
import {
  IMAGE_READER_FAILURE_DIAGNOSTIC_LIMITS,
  createRuntimeImageReaderFailureContext,
  normalizeImageReaderFailureDiagnosticField,
  runtimeImageReaderFailureMessage,
  type ImageReaderError,
} from '../../src/host/image-reader/errors.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-image-reader-'))
  temporaryDirectories.push(root)
  const filePath = join(root, 'result.png')
  writeFileSync(filePath, Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const scope = {
    get: vi.fn(() => ({
      configuration: {
        activeProfileId: 'runtime',
        profiles: [{
          ...createImageReaderProfile('runtime'),
          provider: 'vision-provider',
          model: 'vision-model',
          defaultPrompt: '默认读图提示词',
          temperature: 0.35,
          maxTokens: 1536,
        }],
      },
      credentials: {},
    })),
  }
  const imageLimits = {
    maxImageBytes: 1024,
    maxImagesPerMessage: 1,
    maxMessageImageBytes: 1024,
    maxImagePixels: 1_000_000,
    maxImageDimension: 4096,
    mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  } as const
  const attachment = {
    attachmentId: 'attachment_1', mediaType: 'image/png', bytes: 8, width: 1, height: 1,
  }
  const saveImage = vi.fn(async () => attachment)
  const stream = vi.fn(async function* () {
    yield { type: 'text-delta', index: 0, text: '主体为白发角色。' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })
  const prepareCall = vi.fn(async (): Promise<any> => ({
    config: { provider: 'vision-provider', model: 'vision-model', temperature: 0.35, maxTokens: 1536 },
    inputModalities: ['text', 'image'],
    stream,
  }))
  const fetch = vi.fn<typeof globalThis.fetch>()
  return {
    filePath,
    scope,
    saveImage,
    prepareCall,
    fetch,
    service: new ImageReaderService({ scope, attachments: { imageLimits, saveImage }, llm: { prepareCall }, fetch } as never),
  }
}

describe('ImageReaderService', () => {
  it('forwards each inspection session to the runtime model stream', async () => {
    const { service, filePath, prepareCall } = fixture()
    await Promise.all(['parent', 'child'].map(sessionId => service.inspect(filePath, { sessionId, prompt: sessionId })))
    const prepared = await prepareCall.mock.results[0]!.value
    expect(prepared.stream.mock.calls.map((call: any[]) => call[0].sessionId).sort()).toEqual(['child', 'parent'])
    for (const [request] of prepared.stream.mock.calls) {
      expect(request.messages[0].content[0].text).toBe(request.sessionId)
    }
  })

  it('publishes every image reading error code in the project error catalog', () => {
    expect(Object.keys(errorCatalog).filter(code => code.startsWith('IMAGE_READER_')).sort()).toEqual([
      'IMAGE_READER_API_KEY_REQUIRED',
      'IMAGE_READER_API_KEY_TOO_LONG',
      'IMAGE_READER_ATTACHMENT_FAILED',
      'IMAGE_READER_DEFAULT_PROMPT_REQUIRED',
      'IMAGE_READER_DEFAULT_PROMPT_TOO_LONG',
      'IMAGE_READER_EMPTY_RESPONSE',
      'IMAGE_READER_ENDPOINT_CREDENTIALS_FORBIDDEN',
      'IMAGE_READER_ENDPOINT_FRAGMENT_FORBIDDEN',
      'IMAGE_READER_ENDPOINT_PROTOCOL_INVALID',
      'IMAGE_READER_ENDPOINT_REQUIRED',
      'IMAGE_READER_ENDPOINT_TOO_LONG',
      'IMAGE_READER_ENDPOINT_URL_INVALID',
      'IMAGE_READER_ENDPOINT_WHITESPACE_INVALID',
      'IMAGE_READER_FILE_INVALID',
      'IMAGE_READER_LAST_PROFILE_DELETE_FORBIDDEN',
      'IMAGE_READER_MAX_TOKENS_INTEGER_INVALID',
      'IMAGE_READER_MAX_TOKENS_RANGE_INVALID',
      'IMAGE_READER_MODEL_IMAGE_UNSUPPORTED',
      'IMAGE_READER_MODEL_NOT_CONFIGURED',
      'IMAGE_READER_MODEL_REQUIRED',
      'IMAGE_READER_MODEL_TOO_LONG',
      'IMAGE_READER_MODEL_UNAVAILABLE',
      'IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND',
      'IMAGE_READER_PROFILE_ALREADY_EXISTS',
      'IMAGE_READER_PROFILE_ID_FORMAT_INVALID',
      'IMAGE_READER_PROFILE_LIMIT_REACHED',
      'IMAGE_READER_PROFILE_NAME_REQUIRED',
      'IMAGE_READER_PROFILE_NAME_TOO_LONG',
      'IMAGE_READER_PROFILE_NOT_FOUND',
      'IMAGE_READER_PROFILE_UPDATE_TARGET_NOT_FOUND',
      'IMAGE_READER_PROMPT_REQUIRED',
      'IMAGE_READER_PROMPT_TOO_LONG',
      'IMAGE_READER_PROVIDER_FAILED',
      'IMAGE_READER_RUNTIME_PROVIDER_REQUIRED',
      'IMAGE_READER_RUNTIME_PROVIDER_TOO_LONG',
      'IMAGE_READER_SETTINGS_ACTIVATE_FAILED',
      'IMAGE_READER_SETTINGS_DELETE_FAILED',
      'IMAGE_READER_SETTINGS_REQUEST_FAILED',
      'IMAGE_READER_SETTINGS_SAVE_FAILED',
      'IMAGE_READER_TEMPERATURE_NUMBER_INVALID',
      'IMAGE_READER_TEMPERATURE_RANGE_INVALID',
    ])
  })

  it('reads one image with the configured independent route and settings prompt', async () => {
    const { service, filePath, saveImage, prepareCall } = fixture()

    await expect(service.inspect(filePath, { signal: new AbortController().signal })).resolves.toEqual({
      provider: 'vision-provider',
      model: 'vision-model',
      filePath,
      observation: '主体为白发角色。',
    })
    expect(saveImage).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'image/png', name: 'result.png' }))
    expect(prepareCall).toHaveBeenCalledWith({
      provider: 'vision-provider', model: 'vision-model', temperature: 0.35, maxTokens: 1536,
    }, expect.any(AbortSignal))
    const request = (await prepareCall.mock.results[0]!.value).stream.mock.calls[0]![0]
    expect(request.messages[0].content).toEqual([
      { type: 'text', text: '默认读图提示词' },
      { type: 'image', attachment: expect.objectContaining({ attachmentId: 'attachment_1' }) },
    ])
  })

  it('uses the active settings prompt as the only prompt source', async () => {
    const { service, filePath, scope, prepareCall } = fixture()
    scope.get.mockReturnValue({
      configuration: {
        activeProfileId: 'runtime',
        profiles: [{
          ...createImageReaderProfile('runtime'),
          provider: 'vision-provider',
          model: 'vision-model',
          defaultPrompt: '设置页保存的读图提示词',
          temperature: 0.35,
          maxTokens: 1536,
        }],
      },
      credentials: {},
    })

    await service.inspect(filePath, { signal: new AbortController().signal })

    const request = (await prepareCall.mock.results[0]!.value).stream.mock.calls[0]![0]
    expect(request.messages[0].content[0]).toEqual({ type: 'text', text: '设置页保存的读图提示词' })
    expect(scope.get).toHaveBeenCalledOnce()
  })

  it('uses a per-call prompt verbatim without changing the saved default prompt', async () => {
    const { service, filePath, scope, prepareCall } = fixture()

    await service.inspect(filePath, {
      prompt: '  只说明图片中可见的服饰。  ',
      signal: new AbortController().signal,
    } as never)

    const request = (await prepareCall.mock.results[0]!.value).stream.mock.calls[0]![0]
    expect(request.messages[0].content[0]).toEqual({
      type: 'text',
      text: '  只说明图片中可见的服饰。  ',
    })
    expect(scope.get().configuration.profiles[0]!.defaultPrompt).toBe('默认读图提示词')
  })

  it.each([
    ['', 'IMAGE_READER_PROMPT_REQUIRED'],
    ['   \n\t', 'IMAGE_READER_PROMPT_REQUIRED'],
    ['x'.repeat(32_769), 'IMAGE_READER_PROMPT_TOO_LONG'],
  ])('rejects an invalid per-call prompt before provider access %#', async (prompt, code) => {
    const { service, filePath, saveImage, prepareCall, fetch } = fixture()

    await expect(service.inspect(filePath, { prompt })).rejects.toMatchObject({ code })
    expect(saveImage).not.toHaveBeenCalled()
    expect(prepareCall).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('accepts a per-call prompt at the configured maximum length', async () => {
    const { service, filePath, prepareCall } = fixture()
    const prompt = 'x'.repeat(IMAGE_READER_PROMPT_MAX_LENGTH)

    await service.inspect(filePath, { prompt })

    const request = (await prepareCall.mock.results[0]!.value).stream.mock.calls[0]![0]
    expect(request.messages[0].content[0]).toEqual({ type: 'text', text: prompt })
  })

  it.each([
    [{ provider: '', model: 'model' }, 'IMAGE_READER_MODEL_NOT_CONFIGURED'],
    [{ provider: 'provider', model: '' }, 'IMAGE_READER_MODEL_NOT_CONFIGURED'],
  ])('rejects incomplete route settings %#', async (patch, code) => {
    const { service, filePath, scope } = fixture()
    scope.get.mockReturnValue({
      configuration: {
        activeProfileId: 'runtime',
        profiles: [{
          ...createImageReaderProfile('runtime'),
          provider: patch.provider,
          model: patch.model,
          defaultPrompt: 'prompt',
          temperature: 0.2,
          maxTokens: 1000,
        }],
      },
      credentials: {},
    })
    await expect(service.inspect(filePath)).rejects.toMatchObject({ code })
  })

  it('rejects unsupported paths and models without image input capability', async () => {
    const { service, filePath, prepareCall } = fixture()
    await expect(service.inspect(join(tmpdir(), 'missing.png'))).rejects.toMatchObject({ code: 'IMAGE_READER_FILE_INVALID' })
    prepareCall.mockResolvedValueOnce({
      config: { provider: 'vision-provider', model: 'vision-model', temperature: 0.35, maxTokens: 1536 },
      inputModalities: ['text'],
      stream: vi.fn(),
    })
    await expect(service.inspect(filePath)).rejects.toMatchObject({ code: 'IMAGE_READER_MODEL_IMAGE_UNSUPPORTED' })
  })

  it('uses the encoded image signature and rejects invalid or oversized files before attachment admission', async () => {
    const mismatch = fixture()
    const jpegPath = join(mismatch.filePath, '..', 'mislabeled.png')
    writeFileSync(jpegPath, Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))
    await mismatch.service.inspect(jpegPath)
    expect(mismatch.saveImage).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'image/jpeg' }))

    const invalid = fixture()
    writeFileSync(invalid.filePath, 'not an image')
    await expect(invalid.service.inspect(invalid.filePath)).rejects.toMatchObject({ code: 'IMAGE_READER_FILE_INVALID' })
    expect(invalid.saveImage).not.toHaveBeenCalled()

    const oversized = fixture()
    truncateSync(oversized.filePath, 1025)
    await expect(oversized.service.inspect(oversized.filePath)).rejects.toMatchObject({ code: 'IMAGE_READER_FILE_INVALID' })
    expect(oversized.saveImage).not.toHaveBeenCalled()
  })

  it('maps provider failure and empty output into stable errors', async () => {
    const { service, filePath, prepareCall } = fixture()
    prepareCall.mockResolvedValueOnce({
      config: { provider: 'vision-provider', model: 'vision-model', temperature: 0.35, maxTokens: 1536 },
      inputModalities: ['image'],
      stream: async function* () {
        yield { type: 'finish', reason: { kind: 'error', failure: { code: 'REMOTE', message: 'failed' } } }
      },
    })
    await expect(service.inspect(filePath)).rejects.toMatchObject({ code: 'IMAGE_READER_PROVIDER_FAILED' })

    prepareCall.mockResolvedValueOnce({
      config: { provider: 'vision-provider', model: 'vision-model', temperature: 0.35, maxTokens: 1536 },
      inputModalities: ['image'],
      stream: async function* () {
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    })
    await expect(service.inspect(filePath)).rejects.toMatchObject({ code: 'IMAGE_READER_EMPTY_RESPONSE' })
  })

  it('preserves the runtime profile snapshot and provider failure whitelist without copying prohibited values', async () => {
    const { service, filePath, scope, saveImage, prepareCall } = fixture()
    writeFileSync(filePath, Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...Buffer.from('IMAGE_INPUT_SENTINEL'),
    ]))
    saveImage.mockResolvedValueOnce({
      attachmentId: 'ATTACHMENT_REF_SENTINEL', mediaType: 'image/png', bytes: 28, width: 1, height: 1,
    })
    const consoleSpies = [
      vi.spyOn(console, 'debug').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ]
    scope.get.mockReturnValue({
      configuration: {
        activeProfileId: 'runtime-profile',
        profiles: [{
          ...createImageReaderProfile('runtime-profile', '生产视觉配置'),
          provider: 'opencode-go',
          endpoint: 'ENDPOINT_SENTINEL',
          model: 'qwen3.8-flash',
          defaultPrompt: 'PROMPT_SENTINEL',
          temperature: 0.1,
          maxTokens: 8192,
        }],
      },
      credentials: { 'runtime-profile': 'CREDENTIAL_SENTINEL' },
    })
    prepareCall.mockResolvedValueOnce({
      config: { provider: 'opencode-go', model: 'qwen3.8-flash', temperature: 0.1, maxTokens: 8192 },
      inputModalities: ['image'],
      stream: async function* () {
        yield {
          type: 'finish',
          reason: {
            kind: 'error',
            failure: {
              code: 'UPSTREAM_IMAGE_ERROR',
              message: 'FAILURE_MESSAGE_SENTINEL',
              status: 422,
              providerRetryAfterMs: 1250,
              requestId: 'request-123',
            },
          },
        }
      },
    })

    const error = await service.inspect(filePath, { prompt: 'PROMPT_SENTINEL' })
      .catch((cause: ImageReaderError) => cause) as ImageReaderError
    expect(error).toMatchObject({
      code: 'IMAGE_READER_PROVIDER_FAILED',
      runtimeFailure: {
        finishKind: 'error',
        profileId: 'runtime-profile',
        profileName: '生产视觉配置',
        connectionType: 'runtime',
        provider: 'opencode-go',
        model: 'qwen3.8-flash',
        temperature: 0.1,
        maxTokens: 8192,
        failureCode: 'UPSTREAM_IMAGE_ERROR',
        failureStatus: 422,
        providerRetryAfterMs: 1250,
        requestId: 'request-123',
      },
    })
    expect(error.message).toBe('The runtime visual model did not complete the image inspection. profile_name="生产视觉配置"; profile_id="runtime-profile"; connection_type="runtime"; provider="opencode-go"; model="qwen3.8-flash"; temperature=0.1; max_tokens=8192; finish_kind="error"; failure_code="UPSTREAM_IMAGE_ERROR"; failure_status=422; provider_retry_after_ms=1250; request_id="request-123".')
    const forbiddenSources = [
      'CREDENTIAL_SENTINEL',
      'ENDPOINT_SENTINEL',
      'PROMPT_SENTINEL',
      'IMAGE_INPUT_SENTINEL',
      'ATTACHMENT_REF_SENTINEL',
      'FAILURE_MESSAGE_SENTINEL',
    ]
    const serializedError = JSON.stringify(error)
    for (const source of forbiddenSources) {
      expect(serializedError).not.toContain(source)
      expect(error.message).not.toContain(source)
    }
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    }
  })

  it('normalizes runtime failure strings at the fixed UTF-16 boundaries and keeps the complete diagnostic on one line', () => {
    expect(normalizeImageReaderFailureDiagnosticField(` \uD800a\uDC00\u0000\u0001b\u2028c `)).toBe('�a� b c')
    expect(normalizeImageReaderFailureDiagnosticField('x'.repeat(95))).toBe('x'.repeat(95))
    expect(normalizeImageReaderFailureDiagnosticField('x'.repeat(96))).toBe('x'.repeat(96))
    expect(normalizeImageReaderFailureDiagnosticField('x'.repeat(97))).toBe(`${'x'.repeat(95)}…`)
    expect(normalizeImageReaderFailureDiagnosticField(`${'x'.repeat(94)}😀z`)).toBe(`${'x'.repeat(94)}…`)

    const worstCase = `${'"\\'.repeat(46)}😀zz`
    expect(worstCase).toHaveLength(96)
    const context = createRuntimeImageReaderFailureContext({
      finishKind: 'aborted',
      profileId: worstCase,
      profileName: worstCase,
      connectionType: 'runtime',
      provider: worstCase,
      model: worstCase,
      temperature: 0.1,
      maxTokens: 8192,
      failureCode: worstCase,
      failureStatus: 503,
      providerRetryAfterMs: 1250.5,
      requestId: worstCase,
    })
    const message = runtimeImageReaderFailureMessage(context)
    expect(message.length).toBeLessThanOrEqual(IMAGE_READER_FAILURE_DIAGNOSTIC_LIMITS.totalChars)
    expect(message).not.toMatch(/[\r\n\u2028\u2029]/u)
    expect(message).toContain('finish_kind="aborted"')
    expect(message).toContain('; failure_status=503; provider_retry_after_ms=1250.5; request_id=')
    expect(message.endsWith('.')).toBe(true)
  })

  it('distinguishes provider abort finishes from caller cancellation', async () => {
    const providerAbort = fixture()
    providerAbort.prepareCall.mockResolvedValueOnce({
      config: { provider: 'vision-provider', model: 'vision-model', temperature: 0.35, maxTokens: 1536 },
      inputModalities: ['image'],
      stream: async function* () {
        yield {
          type: 'finish',
          reason: { kind: 'aborted', failure: { code: 'PROVIDER_ABORTED', message: 'not copied' } },
        }
      },
    })
    await expect(providerAbort.service.inspect(providerAbort.filePath)).rejects.toMatchObject({
      code: 'IMAGE_READER_PROVIDER_FAILED',
      runtimeFailure: { finishKind: 'aborted', failureCode: 'PROVIDER_ABORTED' },
    })

    const callerAbort = fixture()
    const controller = new AbortController()
    callerAbort.prepareCall.mockResolvedValueOnce({
      config: { provider: 'vision-provider', model: 'vision-model', temperature: 0.35, maxTokens: 1536 },
      inputModalities: ['image'],
      stream: async function* () {
        controller.abort(new DOMException('cancelled by caller', 'AbortError'))
        yield {
          type: 'finish',
          reason: { kind: 'aborted', failure: { code: 'PROVIDER_ABORTED', message: 'not copied' } },
        }
      },
    })
    await expect(callerAbort.service.inspect(callerAbort.filePath, { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
  })

  it('maps attachment admission and model preparation failures into stable errors', async () => {
    const attachmentFailure = fixture()
    attachmentFailure.saveImage.mockRejectedValueOnce(new Error('invalid bytes'))
    await expect(attachmentFailure.service.inspect(attachmentFailure.filePath))
      .rejects.toMatchObject({ code: 'IMAGE_READER_ATTACHMENT_FAILED' })

    const modelFailure = fixture()
    modelFailure.prepareCall.mockRejectedValueOnce(new Error('route missing'))
    await expect(modelFailure.service.inspect(modelFailure.filePath))
      .rejects.toMatchObject({ code: 'IMAGE_READER_MODEL_UNAVAILABLE' })
  })

  it('reads one image through an OpenAI-compatible Chat Completions endpoint without attachment admission', async () => {
    const { service, filePath, scope, fetch, saveImage, prepareCall } = fixture()
    scope.get.mockReturnValue({
      configuration: {
        activeProfileId: 'custom',
        profiles: [{
          ...createImageReaderProfile('custom'),
          connectionType: 'openai-compatible',
          endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
          model: 'qwen-vl',
          hasApiKey: true,
          defaultPrompt: '完整观察图片',
          temperature: 0.15,
          maxTokens: 3072,
        }],
      },
      credentials: { custom: 'local-secret' },
    })
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: '可见一名银发人物。' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(service.inspect(filePath)).resolves.toEqual({
      provider: 'openai-compatible',
      model: 'qwen-vl',
      filePath,
      observation: '可见一名银发人物。',
    })
    expect(fetch).toHaveBeenCalledOnce()
    const [endpoint, request] = fetch.mock.calls[0]!
    expect(endpoint).toBe('http://127.0.0.1:11434/v1/chat/completions')
    expect(request).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer local-secret' },
    })
    expect(JSON.parse(request!.body as string)).toEqual({
      model: 'qwen-vl',
      messages: [{ role: 'user', content: [
        { type: 'text', text: '完整观察图片' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
      ] }],
      temperature: 0.15,
      max_tokens: 3072,
    })
    expect(saveImage).not.toHaveBeenCalled()
    expect(prepareCall).not.toHaveBeenCalled()
  })

  it('sends a per-call prompt verbatim to an OpenAI-compatible endpoint', async () => {
    const { service, filePath, scope, fetch } = fixture()
    scope.get.mockReturnValue({
      configuration: {
        activeProfileId: 'custom',
        profiles: [{
          ...createImageReaderProfile('custom'),
          connectionType: 'openai-compatible',
          endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
          model: 'qwen-vl',
          defaultPrompt: '不应使用的默认提示词',
        }],
      },
      credentials: {},
    })
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: '普通文本观察，不是 JSON。' } }],
    }), { status: 200 }))

    await expect(service.inspect(filePath, { prompt: '  只读取可见文字。  ' })).resolves.toMatchObject({
      observation: '普通文本观察，不是 JSON。',
    })
    const requestBody = JSON.parse(fetch.mock.calls[0]![1]!.body as string)
    expect(requestBody.messages[0].content[0]).toEqual({ type: 'text', text: '  只读取可见文字。  ' })
  })

  it('omits authorization for an unkeyed endpoint and maps HTTP or response failures', async () => {
    const { service, filePath, scope, fetch } = fixture()
    scope.get.mockReturnValue({
      configuration: {
        activeProfileId: 'custom',
        profiles: [{
          ...createImageReaderProfile('custom'),
          connectionType: 'openai-compatible',
          endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
          model: 'qwen-vl',
        }],
      },
      credentials: {},
    })
    fetch.mockResolvedValueOnce(new Response('', { status: 401 }))
    await expect(service.inspect(filePath)).rejects.toMatchObject({
      code: 'IMAGE_READER_PROVIDER_FAILED',
      message: 'The configured OpenAI-compatible endpoint returned HTTP 401.',
    })
    expect(fetch.mock.calls[0]![1]!.headers).toEqual({ 'Content-Type': 'application/json' })

    fetch.mockResolvedValueOnce(new Response('not json', { status: 200 }))
    await expect(service.inspect(filePath)).rejects.toMatchObject({ code: 'IMAGE_READER_PROVIDER_FAILED' })

    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }))
    await expect(service.inspect(filePath)).rejects.toMatchObject({ code: 'IMAGE_READER_PROVIDER_FAILED' })

    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '   ' } }] }), { status: 200 }))
    await expect(service.inspect(filePath)).rejects.toMatchObject({ code: 'IMAGE_READER_EMPTY_RESPONSE' })
  })

  it('maps OpenAI-compatible network failure and preserves cancellation', async () => {
    const { service, filePath, scope, fetch } = fixture()
    scope.get.mockReturnValue({
      configuration: {
        activeProfileId: 'custom',
        profiles: [{
          ...createImageReaderProfile('custom'),
          connectionType: 'openai-compatible',
          endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
          model: 'qwen-vl',
        }],
      },
      credentials: {},
    })
    fetch.mockRejectedValueOnce(new Error('connection refused'))
    await expect(service.inspect(filePath)).rejects.toMatchObject({ code: 'IMAGE_READER_PROVIDER_FAILED' })

    const controller = new AbortController()
    fetch.mockImplementationOnce(async (_url, init) => {
      controller.abort(new DOMException('cancelled', 'AbortError'))
      throw init!.signal!.reason
    })
    await expect(service.inspect(filePath, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('limits OpenAI-compatible response bytes and preserves response-body cancellation', async () => {
    const { service, filePath, scope, fetch } = fixture()
    scope.get.mockReturnValue({
      configuration: {
        activeProfileId: 'custom',
        profiles: [{
          ...createImageReaderProfile('custom'),
          connectionType: 'openai-compatible',
          endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
          model: 'qwen-vl',
        }],
      },
      credentials: {},
    })
    fetch.mockResolvedValueOnce(new Response('{}', {
      status: 200,
      headers: { 'Content-Length': '1048577' },
    }))
    await expect(service.inspect(filePath)).rejects.toMatchObject({
      code: 'IMAGE_READER_PROVIDER_FAILED',
      message: 'The configured OpenAI-compatible endpoint returned a response larger than 1 MiB.',
    })

    fetch.mockResolvedValueOnce(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1_048_577))
        controller.close()
      },
    }), { status: 200 }))
    await expect(service.inspect(filePath)).rejects.toMatchObject({
      code: 'IMAGE_READER_PROVIDER_FAILED',
      message: 'The configured OpenAI-compatible endpoint returned a response larger than 1 MiB.',
    })

    const controller = new AbortController()
    let finishRead!: (value: { done: true; value: undefined }) => void
    let markReadStarted!: () => void
    const readStarted = new Promise<void>(resolve => { markReadStarted = resolve })
    const reader = {
      read: vi.fn(async () => {
        markReadStarted()
        return new Promise<{ done: true; value: undefined }>(resolve => { finishRead = resolve })
      }),
      cancel: vi.fn(async () => { finishRead({ done: true, value: undefined }) }),
      releaseLock: vi.fn(),
    }
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: { getReader: () => reader },
    } as never)
    const inspection = service.inspect(filePath, { signal: controller.signal })
    await readStarted
    controller.abort(new DOMException('cancelled while reading', 'AbortError'))
    await expect(inspection).rejects.toMatchObject({ name: 'AbortError' })
    expect(reader.cancel).toHaveBeenCalledOnce()
  })

  it('preserves caller cancellation as AbortError', async () => {
    const { service, filePath, saveImage } = fixture()
    const controller = new AbortController()
    controller.abort(new DOMException('cancelled', 'AbortError'))
    await expect(service.inspect(filePath, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(saveImage).not.toHaveBeenCalled()
  })
})
