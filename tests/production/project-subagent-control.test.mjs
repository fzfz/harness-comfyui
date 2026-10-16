import { execFile as execFileCallback } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)
const fixture = resolve(import.meta.dirname, 'fixtures/project-subagent-control-runtime.mjs')

async function runFixture(argument) {
  const { stdout } = await execFile(process.execPath, [fixture, argument])
  return JSON.parse(stdout)
}

describe('official Tool registry restriction contract', () => {
  it('rejects unknown and exact-scope names and restricts inherited ancestor tools', async () => {
    const result = await runFixture('--restriction-contract')
    expect(result.errors).toEqual([
      'tools.restrict() names unknown global tool "send_message"; known global tools: inspect_image',
      'tools.restrict() names unknown global tool "send_message"; known global tools: inspect_image',
    ])
    expect(result).toMatchObject({ ownVisible: true, childVisible: false })
  })
})

describe('project Preset control registration', () => {
  it.each(['harness-comfyui-cli-candidate', 'harness-comfyui-iteration'])(
    'initializes %s against the official registry without local deny names',
    async presetId => {
      const result = await runFixture(presetId)
      expect(result).toMatchObject({
        presetId, names: ['interrupt_agent'], unloadPreservedList: true, controlScopeUnchanged: true,
      })
      const count = presetId === 'harness-comfyui-iteration' ? 5 : 2
      expect(result.surfaces).toHaveLength(count * 2)
      for (const surface of result.surfaces) {
        expect(surface.nativeNames).not.toContain('send_message')
        expect(surface.sdkNames).not.toContain('send_message')
        expect(surface.sdkNames.includes('interrupt_agent')).toBe(surface.toolName === 'parent')
        if (surface.mode === 'ptc') expect(surface.nativeNames).toEqual(['run_code'])
      }
    },
  )
})
