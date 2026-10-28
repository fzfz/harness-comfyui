import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { readProjectComposition as readProjectAgentPresetResources } from '../fixtures/preset-composition.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const PRODUCT_PRESET_ID = 'harness-comfyui-cli-candidate'
describe('project Agent Preset resources', () => {
  it('keeps the workbench identity and persona in project resources', async () => {
    const { metadata, composition } = await readProjectAgentPresetResources(repositoryRoot, PRODUCT_PRESET_ID)
    const persona = composition.find(row => row.name === '@deepseek-ai/dsh-persona')

    expect(metadata).toMatchObject({ name: 'ComfyUI工作台预设', order: 91 })
    expect(persona.config).toMatchObject({ complete: true, includeRuntimeContext: true })
    expect(persona.config.prefix).toEqual(expect.any(String))
    expect(persona.config).not.toHaveProperty('text')
  })
  it('mounts native Goal commands and tools with host defaults', async () => {
    const { composition } = await readProjectAgentPresetResources(repositoryRoot, PRODUCT_PRESET_ID)

    expect(composition.filter(row => ['command-goal', 'tool-goal'].includes(row.id))).toEqual([
      { id: 'command-goal', name: '@deepseek-ai/dsh-command-goal' },
      { id: 'tool-goal', name: '@deepseek-ai/dsh-tool-goal' },
    ])
  })
})
