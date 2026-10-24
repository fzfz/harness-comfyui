import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

import { expect, it } from 'vitest'

import { readProjectComposition } from '../fixtures/preset-composition.mjs'
import productAgent from '../../config/product-agent.json' with { type: 'json' }

import { buildPlugin, packPlugin } from '../../scripts/build/index.mjs'

it('rejects an invalid project Preset before writing plugin build outputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plugin-build-preset-'))
  const presetDirectory = join(root, 'agent-presets', 'invalid-preset')
  try {
    await mkdir(join(root, 'config'))
    await mkdir(presetDirectory, { recursive: true })
    await writeFile(join(root, 'config', 'product-agent.json'), JSON.stringify({
      schemaVersion: 3,
      preset: {
        id: 'invalid-preset',
        additionalManagedPresetIds: [],
        sourceRootRelativePath: 'agent-presets',
      },
      skills: { sourceRootRelativePath: '.agents/skills' },
    }))
    await writeFile(join(presetDirectory, 'preset.yml'), 'name: Invalid preset\n')
    await writeFile(join(presetDirectory, 'agent.cordis.yml'), '- id: missing-plugin-name\n')

    await expect(buildPlugin({ repositoryRoot: root, outputRoot: root }))
      .rejects.toThrow('composition is invalid: row 1 names no plugin')
    await expect(access(join(root, '.local'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('packages the shared MCP configuration for every managed Preset and the product control tool', async () => {
  const repositoryRoot = resolve(import.meta.dirname, '../..')
  const root = await mkdtemp(join(tmpdir(), 'plugin-package-mcp-'))
  const execFile = promisify(execFileCallback)
  try {
    await buildPlugin({ repositoryRoot, outputRoot: root })
    const { archivePath } = await packPlugin({ repositoryRoot, artifactRoot: root, outputFile: join(root, 'plugin.tgz') })
    await execFile('tar', ['-xzf', archivePath, '-C', root])
    await symlink(join(repositoryRoot, 'node_modules'), join(root, 'package/node_modules'), 'dir')
    for (const presetId of [productAgent.preset.id, ...productAgent.preset.additionalManagedPresetIds]) {
      const directory = join(root, 'package', 'agent-presets', presetId)
      const { composition } = await readProjectComposition(join(root, 'package'), presetId)
      const includes = composition.filter(row => row.name === 'cordis:include' && row.config?.path === '../noobai-mcp.cordis.yml')
      expect(includes).toHaveLength(1)
      const source = await readFile(resolve(directory, includes[0].config.path), 'utf8')
      expect(source).toBe(await readFile(join(repositoryRoot, 'agent-presets/noobai-mcp.cordis.yml'), 'utf8'))
      if (![productAgent.preset.id, 'harness-comfyui-iteration'].includes(presetId)) continue
      const control = composition.filter(row => row.id === 'tool-subagent-control')
      expect(control).toHaveLength(1)
      expect(control[0].name).toBe('../project-subagent-control.mjs')
      const module = await import(pathToFileURL(resolve(directory, control[0].name)).href)
      const registered = []
      module.apply({ tools: { register: tool => registered.push(tool) }, subagents: {} })
      expect(registered.map(tool => tool.name)).toEqual(['interrupt_agent'])
      expect(await readFile(resolve(directory, '../project-subagent-control.json'), 'utf8'))
        .toBe(await readFile(join(repositoryRoot, 'agent-presets/project-subagent-control.json'), 'utf8'))
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 60000)
