import { describe, expect, it } from 'vitest'
import { defaultPresetForFunction } from '../../src/workbench/agent-roles.ts'
import Schema from '@deepseek-ai/schemastery'
import { delegateFunctionRequestSchema } from '../../src/workbench/delegation.ts'

describe('dedicated function presets', () => {
  it.each([{ type: 'candidate', artifact_id: '' }, { type: 'run', run_id: '' }])('rejects an empty delegation source identifier: %j', source => {
    expect(() => Schema.resolve({ task_id: 'task', function_id: 'prompt', instructions: '', source }, delegateFunctionRequestSchema, {})).toThrow()
  })
  it('selects dedicated presets for new functions while leaving translation to its own configuration', () => {
    expect(['prompt', 'parameters', 'resources', 'run', 'review', 'compare', 'diagnose', 'experience', 'experiment']
      .map(kind => defaultPresetForFunction(kind))).toEqual([
      'harness-comfyui-prompt', 'harness-comfyui-parameters', 'harness-comfyui-resources',
      'harness-comfyui-run', 'harness-comfyui-review', 'harness-comfyui-review', 'harness-comfyui-review',
      'harness-comfyui-experience', 'harness-comfyui-experiment',
    ])
    expect(defaultPresetForFunction('translate')).toBeUndefined()
    expect(defaultPresetForFunction('rewrite')).toBeUndefined()
  })
})
