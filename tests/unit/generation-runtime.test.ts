import { mkdtempSync, rmSync, unlinkSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { MIN_RUN_INPUT_ID_PREFIX_LENGTH } from '../../src/generation/run-input-contract.ts'
import {
  GenerationRuntime,
  GenerationRuntimeError,
  readGenerationJsonArtifact,
  type GenerationPreparationAdapter,
  type GenerationRequest,
} from '../../src/host/generation/generation-runtime.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

type TestGenerationPreparationAdapter = Pick<GenerationPreparationAdapter, 'prepare'>
  & Partial<Pick<GenerationPreparationAdapter, 'inspectRuntimeParameters'>>

function createRuntime(preparer: TestGenerationPreparationAdapter): GenerationRuntime {
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-generation-'))
  temporaryDirectories.push(root)
  return createRuntimeAt(root, preparer)
}

function createRuntimeAt(root: string, preparer: TestGenerationPreparationAdapter): GenerationRuntime {
  return new GenerationRuntime({
    runRepositoryFile: join(root, 'data', 'runs.sqlite'),
    runDirectory: join(root, 'runs'),
    savedMediaDirectory: join(root, 'media'),
    preparer: {
      inspectRuntimeParameters: async () => { throw new Error('unreachable') },
      ...preparer,
    },
  })
}

function request(prompt: string): GenerationRequest {
  return {
    title: '角色立绘',
    instanceId: null,
    templateId: '34',
    model: null,
    parameters: { positive_prompt: prompt, width: 1024, height: 1024 },
    loras: [],
  }
}

describe('GenerationRuntime acceptance', () => {
  it('delegates template parameter inspection without creating a Generation Run', async () => {
    const inspectRuntimeParameters = vi.fn(async () => ({
      parameters: [],
      size_candidates: [],
    }))
    const runtime = createRuntime({
      inspectRuntimeParameters,
      async prepare() { throw new Error('unreachable') },
    })

    const inspection = await runtime.inspectTemplateRuntimeParameters({
      templateId: '34',
      instanceId: '2',
    })

    expect(inspection).toEqual({ parameters: [], size_candidates: [] })
    expect(inspectRuntimeParameters).toHaveBeenCalledWith({ templateId: '34', instanceId: '2' }, undefined)
    expect(runtime.queryRuns({ workspaceId: 'workspace_1', sessionId: 'session_1' })).toEqual([])
    runtime.close()
  })

  it('does not create a Generation Run when template parameter inspection fails', async () => {
    const runtime = createRuntime({
      inspectRuntimeParameters: async () => {
        throw new GenerationRuntimeError('COMFYUI_CONNECTION_FAILED', 'ComfyUI node definitions request failed.')
      },
      async prepare() { throw new Error('unreachable') },
    })

    await expect(runtime.inspectTemplateRuntimeParameters({
      templateId: 'new-template',
      instanceId: '2',
    })).rejects.toMatchObject({ code: 'COMFYUI_CONNECTION_FAILED' })
    expect(runtime.queryRuns({ workspaceId: 'workspace_1', sessionId: 'session_1' })).toEqual([])
    runtime.close()
  })

  it('returns the persisted positive prompt through the Run public interface', async () => {
    const runtime = createRuntime({
      async prepare(generationRequest) {
        return {
          instanceId: '2',
          instanceTitle: 'ComfyUI',
          templateTitle: 'Template',
          sourceSnapshot: {},
          actualWorkflow: {},
          apiWorkflow: {},
          expectedOutputNodeIds: ['10'],
          connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
        }
      },
    })
    const positivePrompt = '银发少女，蓝灰色电影光线\n保持原始换行。'
    const { runId } = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 3, callId: 'call_prompt' },
      request(positivePrompt),
    )

    expect(runtime.positivePromptForRun(runId)).toBe(positivePrompt)
    runtime.close()
  })

  it('returns null when the persisted positive prompt is missing or unusable', async () => {
    const runtime = createRuntime({
      async prepare() {
        return {
          instanceId: '2',
          instanceTitle: 'ComfyUI',
          templateTitle: 'Template',
          sourceSnapshot: {},
          actualWorkflow: {},
          apiWorkflow: {},
          expectedOutputNodeIds: ['10'],
          connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
        }
      },
    })
    const requests = [
      { ...request('unused'), parameters: { width: 1024 } },
      request(''),
      request('  \n  '),
      { ...request('unused'), parameters: { positive_prompt: 42 } },
    ] satisfies GenerationRequest[]

    for (const [index, generationRequest] of requests.entries()) {
      const { runId } = await runtime.acceptGeneration(
        { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 3, callId: `call_missing_prompt_${index}` },
        generationRequest,
      )
      expect(runtime.positivePromptForRun(runId)).toBeNull()
    }
    runtime.close()
  })

  it('rejects a positive prompt lookup for a missing Run', () => {
    const runtime = createRuntime({ async prepare() { throw new Error('unreachable') } })

    expect(() => runtime.positivePromptForRun('run_missing')).toThrow(
      expect.objectContaining({ code: 'GENERATION_RUN_NOT_FOUND' }),
    )
    runtime.close()
  })

  it('prepares one independent Run per Tool callId before accepting it', async () => {
    const preparedPrompts: string[] = []
    const runtime = createRuntime({
      async prepare(generationRequest) {
        const prompt = generationRequest.parameters.positive_prompt as string
        preparedPrompts.push(prompt)
        return {
          instanceId: '2',
          instanceTitle: 'ComfyUI',
          templateTitle: 'Anima Aesthetic 1.1｜文生图',
          sourceSnapshot: { template_id: '34', revision_number: 1 },
          actualWorkflow: { version: 0.4, prompt },
          apiWorkflow: { '7': { class_type: 'CLIPTextEncode', inputs: { text: prompt } } },
          expectedOutputNodeIds: ['10'],
          connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
        }
      },
    })

    const owner = { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 3 }
    const first = await runtime.acceptGeneration({ ...owner, callId: 'call_a' }, request('first prompt'))
    const second = await runtime.acceptGeneration({ ...owner, callId: 'call_b' }, request('second prompt'))
    const replay = await runtime.acceptGeneration({ ...owner, callId: 'call_a' }, request('first prompt'))

    expect(first.runId).not.toBe(second.runId)
    expect(replay).toEqual(first)
    expect(preparedPrompts).toEqual(['first prompt', 'second prompt'])
    expect(runtime.queryRuns({ workspaceId: owner.workspaceId, sessionId: owner.sessionId, turn: 3 })
      .map(run => run.status)).toEqual(['prepared', 'prepared'])

    const runs = runtime.queryRuns({ workspaceId: owner.workspaceId, sessionId: owner.sessionId, turn: 3 })
    expect(runs.map(run => ({ runId: run.runId, callId: run.callId, status: run.status }))).toEqual([
      { runId: second.runId, callId: 'call_b', status: 'prepared' },
      { runId: first.runId, callId: 'call_a', status: 'prepared' },
    ])

    const firstWorkflow = JSON.parse(await runtime.readActualWorkflow(first.runId)) as { prompt: string }
    const secondWorkflow = JSON.parse(await runtime.readActualWorkflow(second.runId)) as { prompt: string }
    expect(firstWorkflow.prompt).toBe('first prompt')
    expect(secondWorkflow.prompt).toBe('second prompt')

    runtime.close()
  })

  it('restores structured LoRA selections from the persisted Generation request', async () => {
    const preparedLoras: GenerationRequest['loras'][] = []
    const runtime = createRuntime({
      async prepare(generationRequest) {
        preparedLoras.push(generationRequest.loras)
        return {
          instanceId: '2',
          instanceTitle: 'ComfyUI',
          templateTitle: 'LoRA Template',
          sourceSnapshot: { template_id: generationRequest.templateId },
          actualWorkflow: { version: 0.4 },
          apiWorkflow: {},
          expectedOutputNodeIds: ['10'],
          connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
        }
      },
    })
    const generationRequest = {
      ...request('usnr, 1girl'),
      loras: [{
        id: '68',
        fileName: 'USNR_STYLE_ILL_V1_lokr3-000024.safetensors',
        weight: 1,
        triggerWords: ['usnr'],
      }],
    }

    await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 3, callId: 'call_lora' },
      generationRequest,
    )
    expect(preparedLoras).toEqual([generationRequest.loras])
    runtime.close()
  })

  it('restores the selected generation model from the persisted Generation request', async () => {
    const preparedModels: unknown[] = []
    const runtime = createRuntime({
      async prepare(generationRequest) {
        preparedModels.push(generationRequest.model)
        return {
          instanceId: '2',
          instanceTitle: 'ComfyUI',
          templateTitle: 'Model replacement template',
          sourceSnapshot: { template_id: generationRequest.templateId },
          actualWorkflow: { version: 0.4 },
          apiWorkflow: {},
          expectedOutputNodeIds: ['10'],
          connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
        }
      },
    })
    const generationRequest = {
      ...request('1girl'),
      model: {
        id: '1',
        fileName: 'waiIllustriousSDXL_v170.safetensors',
      },
    }

    await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 3, callId: 'call_model' },
      generationRequest,
    )
    expect(preparedModels).toEqual([generationRequest.model])
    runtime.close()
  })

  it('rejects an invalid selected model in the persisted Generation request', async () => {
    const runtime = createRuntime({
      async prepare() {
        throw new Error('unreachable')
      },
    })
    const invalidRequest = {
      ...request('1girl'),
      model: { id: '1', fileName: 37 },
    }

    await expect(runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 3, callId: 'call_invalid_model' },
      invalidRequest as never,
    )).rejects.toMatchObject({ code: 'GENERATION_REQUEST_INVALID' })

    expect(runtime.queryRuns({ workspaceId: 'workspace_1', sessionId: 'session_1' })[0]).toMatchObject({
      status: 'failed',
      errorCode: 'GENERATION_REQUEST_INVALID',
      errorMessage: 'The persisted Generation model is invalid.',
    })
    runtime.close()
  })

  it('rejects a different request for an already accepted Tool callId', async () => {
    const runtime = createRuntime({
      async prepare(generationRequest) {
        return {
          instanceId: '2',
          instanceTitle: 'ComfyUI',
          templateTitle: 'Template',
          sourceSnapshot: { template_id: generationRequest.templateId },
          actualWorkflow: { version: 0.4 },
          apiWorkflow: {},
          expectedOutputNodeIds: ['10'],
          connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
        }
      },
    })
    const identity = { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 3, callId: 'call_a' }

    await runtime.acceptGeneration(identity, request('first prompt'))

    await expect(runtime.acceptGeneration(identity, request('different prompt'))).rejects.toMatchObject({
      code: 'RUN_REQUEST_CONFLICT',
    })
    runtime.close()
  })

  it('returns preparation failures to the Tool caller, persists them, and replays the same error', async () => {
    const runtime = createRuntime({
      async prepare() {
        throw new Error('template is invalid')
      },
    })
    const identity = { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 3, callId: 'call_failed' }

    await expect(runtime.acceptGeneration(identity, request('prompt'))).rejects.toThrow('template is invalid')
    expect(runtime.queryRuns({ workspaceId: 'workspace_1', sessionId: 'session_1' })[0]).toMatchObject({
      status: 'failed',
      errorCode: 'GENERATION_PREPARATION_FAILED',
      errorMessage: 'template is invalid',
    })
    await expect(runtime.acceptGeneration(identity, request('prompt'))).rejects.toMatchObject({
      code: 'GENERATION_PREPARATION_FAILED',
      message: 'template is invalid',
    })
    runtime.close()
  })

  it('preserves created when the Tool caller cancels preparation', async () => {
    const controller = new AbortController()
    const runtime = createRuntime({
      async prepare(_request, signal) {
        await new Promise<void>((_resolve, reject) => {
          const abort = () => reject(new DOMException('cancelled', 'AbortError'))
          if (signal?.aborted === true) abort()
          else signal?.addEventListener('abort', abort, { once: true })
        })
        throw new Error('unreachable')
      },
    })
    const accepting = runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 3, callId: 'call_cancelled' },
      request('prompt'),
      controller.signal,
    )
    controller.abort()
    await expect(accepting).rejects.toMatchObject({ name: 'AbortError' })
    expect(runtime.queryRuns({ workspaceId: 'workspace_1', sessionId: 'session_1' })[0]).toMatchObject({
      status: 'created', errorCode: null,
    })
    runtime.close()
  })

  it('rejects invalid ownership, missing artifacts and unavailable worker transport', async () => {
    const runtime = createRuntime({ async prepare() { throw new GenerationRuntimeError('SOURCE_FAILED', 'source failed') } })
    const valid = { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 0, callId: 'call_1' }
    await expect(runtime.acceptGeneration({ ...valid, workspaceId: '../bad' }, request('prompt'))).rejects.toThrow('workspaceId')
    await expect(runtime.acceptGeneration({ ...valid, sessionId: '' }, request('prompt'))).rejects.toThrow('sessionId')
    await expect(runtime.acceptGeneration({ ...valid, turn: -1 }, request('prompt'))).rejects.toThrow('turn')
    await expect(runtime.acceptGeneration({ ...valid, callId: '' }, request('prompt'))).rejects.toThrow('callId')
    await expect(runtime.acceptGeneration(valid, request('prompt'))).rejects.toMatchObject({
      code: 'SOURCE_FAILED',
      message: 'source failed',
    })
    expect(() => runtime.actualWorkflowPath(runtime.queryRuns({ workspaceId: 'workspace_1', sessionId: 'session_1' })[0]!.runId))
      .toThrow('not ready')
    expect(() => runtime.getMedia('missing')).toThrow('not found')
    expect(() => runtime.actualWorkflowPath('missing')).toThrow('not found')
    expect(runtime.queryRuns({ workspaceId: 'workspace_1', sessionId: 'session_1' })[0]).toMatchObject({
      status: 'failed',
      errorCode: 'SOURCE_FAILED',
    })
    runtime.close()
  })
})

describe('GenerationRuntime historical Run input lookup', () => {
  it('resolves unique Run ID prefixes and isolates ambiguous or missing prefixes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-run-prefix-'))
    temporaryDirectories.push(root)
    const runIds = [
      'run_3c0ad3ed-1111-4111-8111-111111111111',
      'run_d26923be-2222-4222-8222-222222222222',
      'run_deadbeef-3333-4333-8333-333333333333',
      'run_deadbeef-4444-4444-8444-444444444444',
      'run_3c0ad3ed-5555-4555-8555-555555555555',
      'run_3c0ad3ed-legacy',
      'legacy_other_run',
    ] as const
    let runIdIndex = 0
    const runtime = new GenerationRuntime({
      runRepositoryFile: join(root, 'data', 'runs.sqlite'),
      runDirectory: join(root, 'runs'),
      savedMediaDirectory: join(root, 'media'),
      createRunId: () => runIds[runIdIndex++]!,
      preparer: {
        async inspectRuntimeParameters() { throw new Error('unreachable') },
        async prepare(generationRequest) {
          return {
            instanceId: '2',
            instanceTitle: 'ComfyUI',
            templateTitle: 'Template',
            sourceSnapshot: {},
            actualWorkflow: { version: 0.4, prompt: generationRequest.parameters.positive_prompt },
            apiWorkflow: {},
            expectedOutputNodeIds: ['10'],
            connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
          }
        },
      },
    })

    for (const [index, runId] of runIds.entries()) {
      const accepted = await runtime.acceptGeneration(
        {
          workspaceId: index === 4 || index === 6 ? 'workspace_2' : 'workspace_1',
          sessionId: `session_${index}`,
          turn: 1,
          callId: `call_prefix_${index}`,
        },
        request(`prompt ${index}`),
      )
      expect(accepted.runId).toBe(runId)
    }

    const result = await runtime.readGenerationRunInputs({
      workspaceId: 'workspace_1',
      runIds: [
        'run_3c0ad3ed',
        'run_3c0ad3ed-1111',
        'run_deadbeef',
        'run_ffffffff',
        'run_1234567',
        'run_1234567g',
        'run_3C0AD3ED',
        'run_3c0ad3e-d',
        'foo',
        'not a valid run id',
        runIds[1],
        runIds[5],
        runIds[6],
      ],
    })

    expect(result.runs.map(item => item.lookup_status === 'available'
      ? { run_id: item.run_id, lookup_status: item.lookup_status }
      : { run_id: item.run_id, lookup_status: item.lookup_status, code: item.error.code }))
      .toEqual([
        { run_id: runIds[0], lookup_status: 'available' },
        { run_id: runIds[0], lookup_status: 'available' },
        { run_id: 'run_deadbeef', lookup_status: 'error', code: 'GENERATION_RUN_ID_AMBIGUOUS' },
        { run_id: 'run_ffffffff', lookup_status: 'error', code: 'GENERATION_RUN_NOT_FOUND' },
        { run_id: 'run_1234567', lookup_status: 'error', code: 'GENERATION_RUN_ID_INVALID' },
        { run_id: 'run_1234567g', lookup_status: 'error', code: 'GENERATION_RUN_NOT_FOUND' },
        { run_id: 'run_3C0AD3ED', lookup_status: 'error', code: 'GENERATION_RUN_NOT_FOUND' },
        { run_id: 'run_3c0ad3e-d', lookup_status: 'error', code: 'GENERATION_RUN_ID_INVALID' },
        { run_id: 'foo', lookup_status: 'error', code: 'GENERATION_RUN_NOT_FOUND' },
        { run_id: 'not a valid run id', lookup_status: 'error', code: 'GENERATION_RUN_ID_INVALID' },
        { run_id: runIds[1], lookup_status: 'available' },
        { run_id: runIds[5], lookup_status: 'available' },
        { run_id: runIds[6], lookup_status: 'error', code: 'GENERATION_RUN_NOT_FOUND' },
      ])
    runtime.close()
  })

  it('returns ordered success and error items without stopping after one missing Run', async () => {
    const runtime = createRuntime({
      async prepare(generationRequest) {
        return {
          instanceId: '2',
          instanceTitle: 'ComfyUI',
          templateTitle: 'Template',
          sourceSnapshot: {},
          actualWorkflow: { version: 0.4, prompt: generationRequest.parameters.positive_prompt },
          apiWorkflow: {},
          expectedOutputNodeIds: ['10'],
          connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
        }
      },
    })
    const firstRequest: GenerationRequest = {
      ...request('first prompt'),
      instanceId: '2',
      model: { id: '3', fileName: 'anima-aesthetic-v1.1.safetensors' },
      loras: [{ id: '91', fileName: 'style.safetensors', weight: 0.8, triggerWords: ['style'] }],
    }
    const first = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 1, callId: 'call_lookup_first' },
      firstRequest,
    )
    const second = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_2', turn: 2, callId: 'call_lookup_second' },
      request('second prompt'),
    )

    await expect(runtime.readGenerationRunInputs({
      workspaceId: 'workspace_1',
      runIds: [first.runId, 'run_missing', second.runId, first.runId],
    })).resolves.toEqual({
      runs: [
        {
          run_id: first.runId,
          lookup_status: 'available',
          arguments: {
            title: '角色立绘',
            instance_id: '2',
            template_id: '34',
            model: { id: '3', file_name: 'anima-aesthetic-v1.1.safetensors' },
            parameters: { positive_prompt: 'first prompt', width: 1024, height: 1024 },
            loras: [{ id: '91', file_name: 'style.safetensors', weight: 0.8, trigger_words: ['style'] }],
          },
          workflow_status: 'available',
          workflow: { version: 0.4, prompt: 'first prompt' },
        },
        {
          run_id: 'run_missing',
          lookup_status: 'error',
          error: { code: 'GENERATION_RUN_NOT_FOUND', message: 'Generation Run was not found in the current Workspace.' },
        },
        {
          run_id: second.runId,
          lookup_status: 'available',
          arguments: {
            title: '角色立绘',
            template_id: '34',
            parameters: { positive_prompt: 'second prompt', width: 1024, height: 1024 },
            loras: [],
          },
          workflow_status: 'available',
          workflow: { version: 0.4, prompt: 'second prompt' },
        },
        {
          run_id: first.runId,
          lookup_status: 'available',
          arguments: {
            title: '角色立绘',
            instance_id: '2',
            template_id: '34',
            model: { id: '3', file_name: 'anima-aesthetic-v1.1.safetensors' },
            parameters: { positive_prompt: 'first prompt', width: 1024, height: 1024 },
            loras: [{ id: '91', file_name: 'style.safetensors', weight: 0.8, trigger_words: ['style'] }],
          },
          workflow_status: 'available',
          workflow: { version: 0.4, prompt: 'first prompt' },
        },
      ],
    })
    runtime.close()
  })

  it('keeps querying after an invalid ID and hides Runs owned by another Workspace', async () => {
    const runtime = createRuntime({
      async prepare(generationRequest) {
        return {
          instanceId: '2',
          instanceTitle: 'ComfyUI',
          templateTitle: 'Template',
          sourceSnapshot: {},
          actualWorkflow: { version: 0.4, prompt: generationRequest.parameters.positive_prompt },
          apiWorkflow: {},
          expectedOutputNodeIds: ['10'],
          connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
        }
      },
    })
    const otherWorkspace = await runtime.acceptGeneration(
      { workspaceId: 'workspace_2', sessionId: 'session_2', turn: 1, callId: 'call_other_workspace' },
      request('hidden prompt'),
    )
    const visible = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 1, callId: 'call_visible' },
      request('visible prompt'),
    )

    const result = await runtime.readGenerationRunInputs({
      workspaceId: 'workspace_1',
      runIds: ['../invalid', otherWorkspace.runId, visible.runId],
    })

    expect(result.runs.map(item => item.lookup_status === 'error' ? item.error.code : item.arguments.parameters.positive_prompt))
      .toEqual(['GENERATION_RUN_ID_INVALID', 'GENERATION_RUN_NOT_FOUND', 'visible prompt'])
    runtime.close()
  })

  it('normalizes missing historical fields without discarding persisted LoRAs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-historical-run-'))
    temporaryDirectories.push(root)
    const preparer: TestGenerationPreparationAdapter = {
      async prepare(generationRequest) {
        return {
          instanceId: '2',
          instanceTitle: 'ComfyUI',
          templateTitle: 'Template',
          sourceSnapshot: {},
          actualWorkflow: { version: 0.4, prompt: generationRequest.parameters.positive_prompt },
          apiWorkflow: {},
          expectedOutputNodeIds: ['10'],
          connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
        }
      },
    }
    let runtime = createRuntimeAt(root, preparer)
    const withoutLoras = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 1, callId: 'call_pre_lora' },
      request('pre-LoRA prompt'),
    )
    const withHistoricalLora = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 2, callId: 'call_pre_model' },
      {
        ...request('historical LoRA prompt'),
        loras: [{ id: '68', fileName: 'historical.safetensors', weight: 1, triggerWords: ['historical'] }],
      },
    )
    runtime.close()

    const database = new DatabaseSync(join(root, 'data', 'runs.sqlite'))
    database.prepare('UPDATE generation_runs SET request_json = ? WHERE run_id = ?').run(JSON.stringify({
      title: '角色立绘',
      instanceId: null,
      templateId: '34',
      parameters: { positive_prompt: 'pre-LoRA prompt', width: 1024, height: 1024 },
    }), withoutLoras.runId)
    database.prepare('UPDATE generation_runs SET request_json = ? WHERE run_id = ?').run(JSON.stringify({
      title: '角色立绘',
      instanceId: null,
      templateId: '34',
      parameters: { positive_prompt: 'historical LoRA prompt', width: 1024, height: 1024 },
      loras: [{ id: '68', fileName: 'historical.safetensors', weight: 1, triggerWords: ['historical'] }],
    }), withHistoricalLora.runId)
    database.close()

    runtime = createRuntimeAt(root, preparer)
    await expect(runtime.readGenerationRunInputs({
      workspaceId: 'workspace_1',
      runIds: [withoutLoras.runId, withHistoricalLora.runId],
    })).resolves.toMatchObject({
      runs: [
        {
          run_id: withoutLoras.runId,
          lookup_status: 'available',
          arguments: { loras: [] },
          workflow_status: 'available',
        },
        {
          run_id: withHistoricalLora.runId,
          lookup_status: 'available',
          arguments: {
            loras: [{
              id: '68',
              file_name: 'historical.safetensors',
              weight: 1,
              trigger_words: ['historical'],
            }],
          },
          workflow_status: 'available',
        },
      ],
    })
    const result = await runtime.readGenerationRunInputs({
      workspaceId: 'workspace_1',
      runIds: [withoutLoras.runId, withHistoricalLora.runId],
    })
    expect(result.runs[0]).not.toHaveProperty('arguments.model')
    expect(result.runs[1]).not.toHaveProperty('arguments.model')
    runtime.close()
  })

  it('returns persisted arguments and the preparation error when the Workflow is unavailable', async () => {
    const runtime = createRuntime({
      async prepare() {
        throw new GenerationRuntimeError('GENERATION_PARAMETER_INVALID', 'Sampler selection is invalid.')
      },
    })
    await expect(runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 1, callId: 'call_failed_lookup' },
      request('failed prompt'),
    )).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_INVALID' })
    const failedRun = runtime.queryRuns({ workspaceId: 'workspace_1', sessionId: 'session_1' })[0]!

    await expect(runtime.readGenerationRunInputs({
      workspaceId: 'workspace_1',
      runIds: [failedRun.runId],
    })).resolves.toEqual({
      runs: [{
        run_id: failedRun.runId,
        lookup_status: 'available',
        arguments: {
          title: '角色立绘',
          template_id: '34',
          parameters: { positive_prompt: 'failed prompt', width: 1024, height: 1024 },
          loras: [],
        },
        workflow_status: 'unavailable',
        workflow_error: { code: 'GENERATION_PARAMETER_INVALID', message: 'Sampler selection is invalid.' },
      }],
    })
    runtime.close()
  })

  it('keeps persisted arguments when the declared Actual Workflow file is missing', async () => {
    const runtime = createRuntime({
      async prepare() {
        return {
          instanceId: '2',
          instanceTitle: 'ComfyUI',
          templateTitle: 'Template',
          sourceSnapshot: {},
          actualWorkflow: { version: 0.4 },
          apiWorkflow: {},
          expectedOutputNodeIds: ['10'],
          connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
        }
      },
    })
    const accepted = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 1, callId: 'call_missing_artifact' },
      request('saved prompt'),
    )
    unlinkSync(runtime.actualWorkflowPath(accepted.runId))

    const result = await runtime.readGenerationRunInputs({
      workspaceId: 'workspace_1',
      runIds: [accepted.runId],
    })

    expect(result.runs[0]).toMatchObject({
      lookup_status: 'available',
      arguments: { parameters: { positive_prompt: 'saved prompt' } },
      workflow_status: 'unavailable',
      workflow_error: { code: 'GENERATION_ARTIFACT_NOT_FOUND' },
    })
    expect(result.runs[0]).not.toHaveProperty('workflow')
    runtime.close()
  })

  it('keeps persisted arguments for invalid Actual Workflow JSON and continues to a later Run', async () => {
    const runtime = createRuntime({
      async prepare(generationRequest) {
        return {
          instanceId: '2',
          instanceTitle: 'ComfyUI',
          templateTitle: 'Template',
          sourceSnapshot: {},
          actualWorkflow: { version: 0.4, prompt: generationRequest.parameters.positive_prompt },
          apiWorkflow: {},
          expectedOutputNodeIds: ['10'],
          connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
        }
      },
    })
    const corrupted = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 1, callId: 'call_invalid_workflow' },
      request('corrupted workflow prompt'),
    )
    const valid = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 2, callId: 'call_after_invalid_workflow' },
      request('valid workflow prompt'),
    )
    await writeFile(runtime.actualWorkflowPath(corrupted.runId), '{', 'utf8')

    const result = await runtime.readGenerationRunInputs({
      workspaceId: 'workspace_1',
      runIds: [corrupted.runId, valid.runId],
    })

    expect(result.runs).toEqual([
      expect.objectContaining({
        run_id: corrupted.runId,
        lookup_status: 'available',
        arguments: expect.objectContaining({ parameters: expect.objectContaining({ positive_prompt: 'corrupted workflow prompt' }) }),
        workflow_status: 'unavailable',
        workflow_error: { code: 'GENERATION_ARTIFACT_INVALID', message: 'Actual Workflow contains invalid JSON.' },
      }),
      expect.objectContaining({
        run_id: valid.runId,
        lookup_status: 'available',
        workflow_status: 'available',
      }),
    ])
    runtime.close()
  })

  it('returns one request error and continues to a later valid Run', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-invalid-request-'))
    temporaryDirectories.push(root)
    const preparer: TestGenerationPreparationAdapter = {
      async prepare(generationRequest) {
        return {
          instanceId: '2',
          instanceTitle: 'ComfyUI',
          templateTitle: 'Template',
          sourceSnapshot: {},
          actualWorkflow: { version: 0.4, prompt: generationRequest.parameters.positive_prompt },
          apiWorkflow: {},
          expectedOutputNodeIds: ['10'],
          connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
        }
      },
    }
    let runtime = createRuntimeAt(root, preparer)
    const corrupted = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 1, callId: 'call_corrupted_request' },
      request('corrupted prompt'),
    )
    const valid = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 2, callId: 'call_after_corruption' },
      request('valid prompt'),
    )
    runtime.close()
    const database = new DatabaseSync(join(root, 'data', 'runs.sqlite'))
    database.prepare('UPDATE generation_runs SET request_json = ? WHERE run_id = ?')
      .run('{', corrupted.runId)
    database.close()
    runtime = createRuntimeAt(root, preparer)

    const result = await runtime.readGenerationRunInputs({
      workspaceId: 'workspace_1',
      runIds: [corrupted.runId, valid.runId],
    })

    expect(result.runs.map(item => item.lookup_status === 'error' ? item.error.code : item.arguments.parameters.positive_prompt))
      .toEqual(['GENERATION_REQUEST_INVALID', 'valid prompt'])
    runtime.close()
  })

  it('does not treat present invalid model or LoRA fields as historical omissions', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-invalid-historical-fields-'))
    temporaryDirectories.push(root)
    const preparer: TestGenerationPreparationAdapter = {
      async prepare() {
        return {
          instanceId: '2',
          instanceTitle: 'ComfyUI',
          templateTitle: 'Template',
          sourceSnapshot: {},
          actualWorkflow: { version: 0.4 },
          apiWorkflow: {},
          expectedOutputNodeIds: ['10'],
          connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
        }
      },
    }
    let runtime = createRuntimeAt(root, preparer)
    const invalidLoras = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 1, callId: 'call_invalid_historical_loras' },
      request('invalid loras'),
    )
    const invalidModel = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 2, callId: 'call_invalid_historical_model' },
      request('invalid model'),
    )
    runtime.close()
    const database = new DatabaseSync(join(root, 'data', 'runs.sqlite'))
    database.prepare('UPDATE generation_runs SET request_json = ? WHERE run_id = ?').run(JSON.stringify({
      title: '角色立绘', instanceId: null, templateId: '34', parameters: {}, loras: 'invalid',
    }), invalidLoras.runId)
    database.prepare('UPDATE generation_runs SET request_json = ? WHERE run_id = ?').run(JSON.stringify({
      title: '角色立绘', instanceId: null, templateId: '34', parameters: {}, loras: [], model: 'invalid',
    }), invalidModel.runId)
    database.close()
    runtime = createRuntimeAt(root, preparer)

    const result = await runtime.readGenerationRunInputs({
      workspaceId: 'workspace_1',
      runIds: [invalidLoras.runId, invalidModel.runId],
    })

    expect(result.runs.map(item => item.lookup_status === 'error' ? item.error.code : 'unexpected'))
      .toEqual(['GENERATION_REQUEST_INVALID', 'GENERATION_REQUEST_INVALID'])
    runtime.close()
  })

  it('accepts twenty IDs and rejects twenty-one before querying any Run', async () => {
    const runtime = createRuntime({ async prepare() { throw new Error('unreachable') } })
    const missingRunIds = Array.from(
      { length: 21 },
      (_value, index) => `run_${index.toString(16).padStart(MIN_RUN_INPUT_ID_PREFIX_LENGTH, '0')}`,
    )

    const accepted = await runtime.readGenerationRunInputs({
      workspaceId: 'workspace_1',
      runIds: missingRunIds.slice(0, 20),
    })

    expect(accepted.runs).toHaveLength(20)
    expect(accepted.runs.every(item => item.lookup_status === 'error' && item.error.code === 'GENERATION_RUN_NOT_FOUND')).toBe(true)
    await expect(runtime.readGenerationRunInputs({
      workspaceId: 'workspace_1',
      runIds: missingRunIds,
    })).rejects.toThrow('between 1 and 20')
    runtime.close()
  })

  it('sanitizes an unexpected item failure and continues to the next Run', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-unexpected-lookup-'))
    temporaryDirectories.push(root)
    let failingRunId = ''
    const unexpectedError = new Error('sensitive /private/run/path SELECT * FROM generation_runs')
    const reportRunInputLookupError = vi.fn()
    const runtime = new GenerationRuntime({
      runRepositoryFile: join(root, 'data', 'runs.sqlite'),
      runDirectory: join(root, 'runs'),
      savedMediaDirectory: join(root, 'media'),
      preparer: {
        async inspectRuntimeParameters() { throw new Error('unreachable') },
        async prepare(generationRequest) {
          return {
            instanceId: '2',
            instanceTitle: 'ComfyUI',
            templateTitle: 'Template',
            sourceSnapshot: {},
            actualWorkflow: { version: 0.4, prompt: generationRequest.parameters.positive_prompt },
            apiWorkflow: {},
            expectedOutputNodeIds: ['10'],
            connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
          }
        },
      },
      async readJsonArtifact(path) {
        if (path.includes(failingRunId)) {
          throw unexpectedError
        }
        return JSON.parse(await readFile(path, 'utf8')) as Record<string, never>
      },
      reportRunInputLookupError,
    })
    const first = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 1, callId: 'call_unexpected_first' },
      request('first prompt'),
    )
    const second = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 2, callId: 'call_unexpected_second' },
      request('second prompt'),
    )
    failingRunId = first.runId

    const result = await runtime.readGenerationRunInputs({
      workspaceId: 'workspace_1',
      runIds: [first.runId, second.runId],
    })

    expect(result.runs).toEqual([
      {
        run_id: first.runId,
        lookup_status: 'error',
        error: {
          code: 'GENERATION_RUN_LOOKUP_FAILED',
          message: 'Generation Run lookup failed. Check the Harness ComfyUI Host logs and retry this run_id.',
        },
      },
      expect.objectContaining({
        run_id: second.runId,
        lookup_status: 'available',
        workflow_status: 'available',
      }),
    ])
    expect(JSON.stringify(result)).not.toContain('sensitive')
    expect(JSON.stringify(result)).not.toContain('/private/run/path')
    expect(JSON.stringify(result)).not.toContain('SELECT')
    expect(reportRunInputLookupError).toHaveBeenCalledOnce()
    expect(reportRunInputLookupError).toHaveBeenCalledWith({
      workspaceId: 'workspace_1',
      runId: first.runId,
      error: unexpectedError,
    })
    runtime.close()
  })

  it('propagates cancellation from the default JSON artifact reader', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-default-reader-cancel-'))
    temporaryDirectories.push(root)
    const artifactPath = join(root, 'actual-workflow.json')
    await writeFile(artifactPath, '{}', 'utf8')
    const controller = new AbortController()
    controller.abort()

    await expect(readGenerationJsonArtifact(
      artifactPath,
      'Actual Workflow',
      controller.signal,
    )).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('keeps the generic missing Run message for Runtime readers without a Workspace query', () => {
    const runtime = createRuntime({ async prepare() { throw new Error('unreachable') } })

    expect(() => runtime.actualWorkflowPath('run_missing')).toThrow('Generation Run was not found.')
    runtime.close()
  })

  it('propagates cancellation instead of converting it into an item error', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-cancelled-lookup-'))
    temporaryDirectories.push(root)
    let reads = 0
    const runtime = new GenerationRuntime({
      runRepositoryFile: join(root, 'data', 'runs.sqlite'),
      runDirectory: join(root, 'runs'),
      savedMediaDirectory: join(root, 'media'),
      preparer: {
        async inspectRuntimeParameters() { throw new Error('unreachable') },
        async prepare() {
          return {
            instanceId: '2',
            instanceTitle: 'ComfyUI',
            templateTitle: 'Template',
            sourceSnapshot: {},
            actualWorkflow: { version: 0.4 },
            apiWorkflow: {},
            expectedOutputNodeIds: ['10'],
            connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
          }
        },
      },
      async readJsonArtifact() {
        reads += 1
        throw new DOMException('cancelled', 'AbortError')
      },
    })
    const first = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 1, callId: 'call_cancel_lookup_first' },
      request('first prompt'),
    )
    const second = await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 2, callId: 'call_cancel_lookup_second' },
      request('second prompt'),
    )

    await expect(runtime.readGenerationRunInputs({
      workspaceId: 'workspace_1',
      runIds: [first.runId, second.runId],
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(reads).toBe(1)
    runtime.close()
  })
})
