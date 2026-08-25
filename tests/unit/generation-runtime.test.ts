import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  GenerationRuntime,
  GenerationRuntimeError,
  type GenerationPreparationAdapter,
  type GenerationRequest,
} from '../../src/host/generation/generation-runtime.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function createRuntime(preparer: GenerationPreparationAdapter): GenerationRuntime {
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-generation-'))
  temporaryDirectories.push(root)
  return new GenerationRuntime({
    runRepositoryFile: join(root, 'data', 'runs.sqlite'),
    runDirectory: join(root, 'runs'),
    savedMediaDirectory: join(root, 'media'),
    preparer,
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
  it('persists one independent Run per Tool callId immediately and prepares it through the worker', async () => {
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
    expect(preparedPrompts).toEqual([])
    expect(runtime.queryRuns({ workspaceId: owner.workspaceId, sessionId: owner.sessionId, turn: 3 })
      .map(run => run.status)).toEqual(['created', 'created'])

    await runtime.advance()

    expect(preparedPrompts).toEqual(['first prompt', 'second prompt'])

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
    await runtime.advance()

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
    await runtime.advance()

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

    await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 3, callId: 'call_invalid_model' },
      invalidRequest as never,
    )
    await runtime.advance()

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

  it('persists asynchronous preparation failures and replays the accepted run id', async () => {
    const runtime = createRuntime({
      async prepare() {
        throw new Error('template is invalid')
      },
    })
    const identity = { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 3, callId: 'call_failed' }

    const accepted = await runtime.acceptGeneration(identity, request('prompt'))
    await runtime.advance()
    expect(runtime.queryRuns({ workspaceId: 'workspace_1', sessionId: 'session_1' })[0]).toMatchObject({
      status: 'failed',
      errorCode: 'GENERATION_PREPARATION_FAILED',
    })
    await expect(runtime.acceptGeneration(identity, request('prompt'))).resolves.toEqual(accepted)
    runtime.close()
  })

  it('preserves created when Host shutdown cancels asynchronous preparation', async () => {
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
    await runtime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 3, callId: 'call_cancelled' },
      request('prompt'),
    )
    const advancing = runtime.advance(controller.signal)
    controller.abort()
    await expect(advancing).rejects.toMatchObject({ name: 'AbortError' })
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
    await runtime.acceptGeneration(valid, request('prompt'))
    await runtime.advance()
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
