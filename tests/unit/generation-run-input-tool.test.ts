import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'

import errorCatalog from '../../config/error-catalog.json' with { type: 'json' }
import {
  MAX_RUN_INPUT_QUERY_IDS,
  type GenerationRunInputResult,
} from '../../src/generation/run-input-contract.ts'
import {
  createGenerationRunInputTool,
  GENERATION_RUN_INPUT_TOOL_NAME,
} from '../../src/host/generation/generation-run-input-tool.ts'

function execution(events: readonly unknown[], callId = 'call_run_input_1') {
  return {
    callId,
    rootCallId: callId,
    name: GENERATION_RUN_INPUT_TOOL_NAME,
    arguments: {},
    signal: new AbortController().signal,
    token: Symbol('execution'),
    deferContext: vi.fn(),
    concludeTurn: vi.fn(),
    agent: {
      id: 'session_1',
      session: {
        id: 'session_1',
        header: { cwd: '/workspace' },
        snapshotEvents: () => events,
      },
    },
  }
}

describe('read_comfyui_run_inputs Tool', () => {
  it('derives the current Workspace and returns every Runtime lookup item', async () => {
    const result: GenerationRunInputResult = {
      runs: [
        {
          run_id: 'run_1',
          lookup_status: 'available' as const,
          arguments: {
            title: 'portrait',
            instance_id: '2',
            template_id: '39',
            model: { id: '3', file_name: 'model.safetensors' },
            parameters: {
              positive_prompt: '1girl',
              nested: { values: [1, true, null] },
            },
            loras: [{
              id: '91',
              file_name: 'portrait.safetensors',
              weight: 0.8,
              trigger_words: ['portrait'],
            }],
          },
          workflow_status: 'available' as const,
          workflow: { version: 0.4, nodes: [{ id: 1 }] },
        },
        {
          run_id: 'run_workflow_unavailable',
          lookup_status: 'available' as const,
          arguments: {
            title: 'portrait without workflow',
            template_id: '39',
            parameters: { positive_prompt: '1boy' },
            loras: [],
          },
          workflow_status: 'unavailable' as const,
          workflow_error: {
            code: 'GENERATION_ARTIFACT_NOT_FOUND',
            message: 'Actual Workflow could not be read.',
          },
        },
        {
          run_id: 'run_missing',
          lookup_status: 'error' as const,
          error: {
            code: 'GENERATION_RUN_NOT_FOUND',
            message: 'Generation Run was not found in the current Workspace.',
          },
        },
      ],
    }
    const readGenerationRunInputs = vi.fn(async () => result)
    const tool = createGenerationRunInputTool({
      runtime: { readGenerationRunInputs },
      workspaceRegistry: {
        resolveByPath: vi.fn(async () => ({ id: 'workspace_1', sessionIds: ['session_1'] })),
      } as never,
    })
    const events = [{
      type: 'tool/call',
      seq: 1,
      data: {
        turn: 7,
        step: 0,
        callId: 'call_run_input_1',
        name: GENERATION_RUN_INPUT_TOOL_NAME,
        arguments: '{"run_ids":["run_1","run_workflow_unavailable","run_missing"]}',
      },
    }]

    const actual = await tool.execute(
      { run_ids: ['run_1', 'run_workflow_unavailable', 'run_missing'] },
      execution(events) as never,
    )
    expect(actual).toEqual(result)
    expect(readGenerationRunInputs).toHaveBeenCalledWith({
      workspaceId: 'workspace_1',
      runIds: ['run_1', 'run_workflow_unavailable', 'run_missing'],
    }, expect.any(AbortSignal))
    expect(tool.output.render({ run_ids: ['run_1', 'run_workflow_unavailable', 'run_missing'] }, actual as never)).toEqual([
      { type: 'text', text: JSON.stringify(result) },
    ])
  })

  it('publishes closed schemas with the shared batch limit and item result fields', () => {
    const tool = createGenerationRunInputTool({ runtime: {} as never, workspaceRegistry: {} as never })

    expect(tool.parameters).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        run_ids: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    })
    const runIdsSchema = (tool.parameters as {
      properties: { run_ids: { description?: string } }
    }).properties.run_ids
    expect(runIdsSchema.description).toContain(`One to ${MAX_RUN_INPUT_QUERY_IDS}`)
    expect(tool.output.schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        runs: {
          type: 'array',
          items: { oneOf: expect.arrayContaining([
            expect.objectContaining({
              additionalProperties: false,
              required: ['run_id', 'lookup_status', 'arguments', 'workflow_status', 'workflow'],
            }),
            expect.objectContaining({
              additionalProperties: false,
              required: ['run_id', 'lookup_status', 'arguments', 'workflow_status', 'workflow_error'],
            }),
            expect.objectContaining({
              additionalProperties: false,
              required: ['run_id', 'lookup_status', 'error'],
            }),
          ]) },
        },
      },
    })

    const argumentsValue = {
      title: 'portrait',
      template_id: '39',
      parameters: { positive_prompt: '1girl' },
      loras: [],
    }
    expect(validateJsonSchemaValue(tool.output.schema, {
      runs: [{
        run_id: 'run_1',
        lookup_status: 'available',
        arguments: argumentsValue,
        workflow_status: 'available',
        workflow: { version: 0.4 },
      }],
    })).toEqual([])
    expect(validateJsonSchemaValue(tool.output.schema, {
      runs: [{
        run_id: 'run_2',
        lookup_status: 'available',
        arguments: argumentsValue,
        workflow_status: 'unavailable',
        workflow_error: { code: 'GENERATION_ARTIFACT_NOT_FOUND', message: 'Actual Workflow is unavailable.' },
      }],
    })).toEqual([])
    expect(validateJsonSchemaValue(tool.output.schema, {
      runs: [{
        run_id: 'run_missing',
        lookup_status: 'error',
        error: { code: 'GENERATION_RUN_NOT_FOUND', message: 'Generation Run was not found.' },
      }],
    })).toEqual([])
    expect(validateJsonSchemaValue(tool.output.schema, {
      runs: [{
        run_id: 'run_1',
        lookup_status: 'available',
        arguments: argumentsValue,
        workflow_status: 'available',
      }],
    })).not.toEqual([])
    expect(validateJsonSchemaValue(tool.output.schema, {
      runs: [{
        run_id: 'run_2',
        lookup_status: 'available',
        arguments: argumentsValue,
        workflow_status: 'unavailable',
        workflow: {},
        workflow_error: { code: 'GENERATION_ARTIFACT_NOT_FOUND', message: 'Actual Workflow is unavailable.' },
      }],
    })).not.toEqual([])
    expect(validateJsonSchemaValue(tool.output.schema, {
      runs: [{
        run_id: 'run_missing',
        lookup_status: 'error',
        arguments: argumentsValue,
        error: { code: 'GENERATION_RUN_NOT_FOUND', message: 'Generation Run was not found.' },
      }],
    })).not.toEqual([])
  })

  it('rejects empty and oversized batches before resolving execution identity', async () => {
    const readGenerationRunInputs = vi.fn()
    const tool = createGenerationRunInputTool({
      runtime: { readGenerationRunInputs },
      workspaceRegistry: { resolveByPath: vi.fn() } as never,
    })

    await expect(tool.execute({ run_ids: [] }, execution([]) as never)).rejects.toThrow('between 1 and 20')
    await expect(tool.execute(
      { run_ids: Array.from({ length: MAX_RUN_INPUT_QUERY_IDS + 1 }, (_, index) => `run_${index}`) },
      execution([]) as never,
    )).rejects.toThrow('between 1 and 20')
    expect(readGenerationRunInputs).not.toHaveBeenCalled()
  })

  it('requires a matching read_comfyui_run_inputs Tool Call', async () => {
    const tool = createGenerationRunInputTool({
      runtime: { readGenerationRunInputs: vi.fn() },
      workspaceRegistry: { resolveByPath: vi.fn() } as never,
    })
    const events = [{
      type: 'tool/call',
      data: {
        turn: 1,
        callId: 'call_run_input_1',
        name: 'generate_with_comfyui',
        arguments: '{}',
      },
    }]

    await expect(tool.execute(
      { run_ids: ['run_1'] },
      execution(events) as never,
    )).rejects.toMatchObject({ code: 'GENERATION_TOOL_CONTEXT_INVALID' })
  })

  it('declares both new lookup errors in the unique error catalog', () => {
    expect(errorCatalog.GENERATION_RUN_ID_AMBIGUOUS.code).toBe('GENERATION_RUN_ID_AMBIGUOUS')
    expect(errorCatalog.GENERATION_RUN_ID_INVALID.code).toBe('GENERATION_RUN_ID_INVALID')
    expect(errorCatalog.GENERATION_RUN_LOOKUP_FAILED.code).toBe('GENERATION_RUN_LOOKUP_FAILED')
  })
})
