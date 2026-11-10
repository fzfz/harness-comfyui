import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const requireFromModule = createRequire(import.meta.url)
import { parsePresetYaml } from '../support/preset-yaml.mjs'
const executeFile = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '../..')

async function readYaml(path) {
  return parsePresetYaml(await readFile(path, 'utf8'))
}

function findRow(rows, id) {
  return rows.find(row => row.id === id)
}

async function entryListProblemFor(rows) {
  const registryEntry = requireFromModule.resolve('@deepseek-ai/dsh-agent-preset-registry')
  const registryModule = await import(pathToFileURL(registryEntry).href)
  return registryModule.entryListProblem(rows)
}

describe('official installed Preset declarations', () => {
  it('loads the Client-bearing package and installed Presets without changing Host defaults', async () => {
    const patch = await readFile(resolve(repositoryRoot, 'cordis.patch.yml'), 'utf8')
    expect(patch).toMatch(/name: harness-comfyui\s*$/m)
    expect(patch).toContain('name: harness-comfyui/presets')
    expect(patch).not.toMatch(/^- id: (?:agent-default-model|llm-pi-ai|agent-preset-registry|bash-sandbox)$/m)
    expect(patch).not.toContain('process.env.HARNESS_COMFYUI_CONFIGURATION_PROFILE')
  })

  it('declares the workbench Preset using the Host Skills service', async () => {
    const entries = await readYaml(resolve(repositoryRoot, 'agent-presets/presets.cordis.yml'))
    expect(entries.map(row => row.id)).toEqual(['preset-harness-comfyui-cli-candidate', 'preset-harness-comfyui-translation', 'preset-harness-comfyui-prompt', 'preset-harness-comfyui-parameters', 'preset-harness-comfyui-resources', 'preset-harness-comfyui-run', 'preset-harness-comfyui-review', 'preset-harness-comfyui-experience', 'preset-harness-comfyui-experiment'])
    expect(findRow(entries, 'preset-harness-comfyui-cli-candidate').config)
      .toMatchObject({ name: 'ComfyUI工作台预设', order: 91 })
    for (const row of entries) {
      if (row.config.roleId) {
        const { default: SpecialistPreset } = await import('../../agent-presets/specialist-preset.mjs')
        const config = SpecialistPreset.Config(row.config)
        expect(row.name).toBe('./specialist-preset.mjs')
        expect(config.id).toBe(row.config.roleId)
        expect(await entryListProblemFor(config.plugins)).toBeUndefined()
        continue
      }
      expect(row.name).toBe(row.id === 'preset-harness-comfyui-translation' ? './translation-preset.mjs' : '@deepseek-ai/dsh-agent-preset')
      expect(await entryListProblemFor(row.config.plugins)).toBeUndefined()
      expect(row.config.plugins).toEqual([{
        id: 'composition', name: 'cordis:include', config: { path: `./${row.id.replace('preset-', '')}/agent.cordis.yml` },
      }])
    }
    expect(await entryListProblemFor([{ name: 'cordis:group', group: true, config: {} }]))
      .toBe('group row 1 must hold a list of plugin rows')
  })

  it('loads installed declarations through the official Loader with Profile patches and lazy expressions', async () => {
    const { stdout } = await executeFile(process.execPath, [
      resolve(repositoryRoot, 'tests/unit/fixtures/installed-presets-runtime.mjs'),
    ], { cwd: repositoryRoot, env: { NODE_ENV: 'test' }, encoding: 'utf8' })
    expect(JSON.parse(stdout.trim())).toEqual({
      defaultPresetIds: ['harness-comfyui-cli-candidate', 'harness-comfyui-experience', 'harness-comfyui-experiment', 'harness-comfyui-parameters', 'harness-comfyui-prompt', 'harness-comfyui-resources', 'harness-comfyui-review', 'harness-comfyui-run', 'harness-comfyui-translation'],
      patchedOrder: 193,
      nestedExpressionPreserved: true,
      reloadedOrder: 91,
      disposed: true,
    })
  })

})
