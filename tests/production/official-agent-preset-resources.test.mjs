import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  readProjectAgentPresetResources,
  validateProjectAgentPresetResources,
} from '../../scripts/build/agent-preset-resources.mjs'

import productAgent from '../../config/product-agent.json' with { type: 'json' }
import { readProjectComposition } from '../fixtures/preset-composition.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const temporaryRoots = []

async function fixture({
  malformedPresetId,
  composition = '- name: "@deepseek-ai/dsh-tool-bash"\n',
  metadata = 'name: Test Preset\ndescription: test\norder: 1\n',
  productAgent,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'official-agent-preset-resources-'))
  temporaryRoots.push(root)
  const presetIds = ['fixture-workbench']
  const sourceRoot = resolve(root, 'project-presets')
  await mkdir(resolve(root, 'config'), { recursive: true })
  await writeFile(resolve(root, 'config/product-agent.json'), JSON.stringify(productAgent ?? {
    schemaVersion: 4,
    preset: {
      id: presetIds[0],
      sourceRootRelativePath: 'project-presets',
    },
  }, null, 2), 'utf8')
  for (const presetId of presetIds) {
    const directory = resolve(sourceRoot, presetId)
    await mkdir(directory, { recursive: true })
    await writeFile(resolve(directory, 'preset.yml'), metadata.replace('Test Preset', presetId), 'utf8')
    await writeFile(resolve(directory, 'agent.cordis.yml'),
      presetId === malformedPresetId ? composition : '- name: "@deepseek-ai/dsh-tool-bash"\n', 'utf8')
  }
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('project Agent Preset resource reader', () => {
  it.each([
    ['harness-comfyui-cli-candidate', 'ComfyUI工作台预设'],
  ])('reads and validates the %s source resources', async (presetId, name) => {
    const resources = await readProjectComposition(repositoryRoot, presetId)

    expect(resources).toMatchObject({
      id: presetId,
      metadata: { name },
    })
    expect(resources.composition.length).toBeGreaterThan(0)
    expect(resources.composition.every(row => typeof row.name === 'string')).toBe(true)
    expect(resources.composition.filter(row => row.name === '@deepseek-ai/dsh-tool-subagent-control/list-agents')).toHaveLength(1)
  })

  it.each([productAgent.preset.id])(
    'resolves the shared NoobAI include for %s without embedding credentials',
    async (presetId) => {
      const { composition } = await readProjectComposition(repositoryRoot, presetId)
      const includes = composition.filter(row => row.name === 'cordis:include'
        && row.config?.path === '../noobai-mcp.cordis.yml')
      expect(includes).toHaveLength(1)
      const require = createRequire(import.meta.url)
      const yaml = require('js-yaml')
      const { entryListSchema } = await import('@deepseek-ai/cordis-plugin-include')
      const source = await readFile(resolve(repositoryRoot, 'agent-presets', presetId, includes[0].config.path), 'utf8')
      const [client] = yaml.load(source, { schema: entryListSchema })
      expect(client.name).toBe('@deepseek-ai/dsh-mcp-client')
      expect(client.config).toMatchObject({
        serverName: 'noobai',
        transport: 'streamable-http',
        url: 'http://127.0.0.1:18943/mcp',
        toolCallTimeoutMs: 60000,
        failOnStartupError: true,
      })
      expect(source.match(/Authorization:.*/)?.[0]).toBe("Authorization: !!js '`Bearer ${process.env.NOOBAI_MCP_TOKEN}`'")
    },
  )

  it('loads native delegation, control, and working directory tools for the workbench', async () => {
    const { composition } = await readProjectComposition(repositoryRoot, productAgent.preset.id)
    expect(composition.filter(row => row.id === 'task-agent')).toEqual([{
      id: 'task-agent', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', maxDepth: 1 },
    }])
    expect(composition.filter(row => row.id === 'tool-subagent-control')).toEqual([{
      id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control',
    }])
    expect(composition.filter(row => row.name === '@deepseek-ai/dsh-tool-subagent-control/list-agents')).toHaveLength(1)
    expect(composition.filter(row => row.name === '@deepseek-ai/dsh-tool-working-directory')).toHaveLength(1)
  })

  it('rejects an id outside the configured project Presets before reading files', async () => {
    await expect(readProjectAgentPresetResources(repositoryRoot, '../outside'))
      .rejects.toThrow('unknown project Agent Preset ID')
  })

  it('rejects malformed DSH YAML', async () => {
    const root = await fixture({ malformedPresetId: 'fixture-workbench', composition: '- id: [broken\n' })

    await expect(readProjectAgentPresetResources(root, 'fixture-workbench'))
      .rejects.toThrow('composition is invalid DSH YAML')
  })

  it('rejects a plugin row that violates the public Agent Preset registry contract', async () => {
    const root = await fixture({
      malformedPresetId: 'fixture-workbench',
      composition: '- id: missing-name\n  config: {}\n',
    })

    await expect(readProjectAgentPresetResources(root, 'fixture-workbench'))
      .rejects.toThrow('composition is invalid: row 1 names no plugin')
  })

  it('rejects a group row whose nested configuration is not a plugin list', async () => {
    const root = await fixture({
      malformedPresetId: 'fixture-workbench',
      composition: [
        '- name: cordis:group',
        '  group: true',
        '  config: {}',
        '',
      ].join('\n'),
    })

    await expect(readProjectAgentPresetResources(root, 'fixture-workbench'))
      .rejects.toThrow('composition is invalid')
  })

  it('rejects preset metadata without a display name', async () => {
    const root = await fixture({ metadata: 'order: 1\n' })

    await expect(readProjectAgentPresetResources(root, 'fixture-workbench'))
      .rejects.toThrow('preset.yml must define a non-empty name')
  })

  it('reports malformed preset metadata as YAML', async () => {
    const root = await fixture({ metadata: 'name: [broken\n' })

    await expect(readProjectAgentPresetResources(root, 'fixture-workbench'))
      .rejects.toThrow('preset.yml is invalid YAML')
  })

  it('validates every Preset selected by product-agent.json', async () => {
    const result = await validateProjectAgentPresetResources(repositoryRoot)

    expect(result.presetIds).toEqual([productAgent.preset.id])
    expect(result.presets.map(({ metadata }) => metadata.name)).toEqual(['ComfyUI工作台预设'])
  })

  it('uses the configured source root and Preset ID', async () => {
    const root = await fixture()

    await expect(validateProjectAgentPresetResources(root)).resolves.toMatchObject({
      sourceRoot: resolve(root, 'project-presets'),
      presetIds: ['fixture-workbench'],
      presets: [
        { id: 'fixture-workbench', metadata: { name: 'fixture-workbench' } },
      ],
    })
  })

  it('rejects an invalid configured Preset ID', async () => {
    const root = await fixture({
      productAgent: {
        schemaVersion: 4,
        preset: {
          id: 'Invalid_ID',
          sourceRootRelativePath: 'project-presets',
        },
      },
    })

    await expect(validateProjectAgentPresetResources(root)).rejects.toThrow('preset.id')
  })

  it('rejects a source root that resolves outside the repository root', async () => {
    const root = await fixture({
      productAgent: {
        schemaVersion: 4,
        preset: {
          id: 'fixture-workbench',
          sourceRootRelativePath: '../outside',
        },
      },
    })

    await expect(validateProjectAgentPresetResources(root)).rejects.toThrow('inside repositoryRoot')
  })

  it.each([
    ['unsupported schema version', { schemaVersion: 2, preset: {}, skills: {} }],
    ['previous schema version', { schemaVersion: 3, preset: { id: 'fixture-workbench', sourceRootRelativePath: 'project-presets' } }],
    ['unsupported skills configuration', {
      schemaVersion: 4,
      preset: {
        id: 'fixture-workbench',
        sourceRootRelativePath: 'project-presets',
      },
      skills: {},
    }],
  ])('rejects product-agent data with %s', async (_label, productAgent) => {
    const root = await fixture({ productAgent })

    await expect(validateProjectAgentPresetResources(root)).rejects.toThrow('product Agent configuration')
  })

  it.each([
    ['preset.additionalManagedPresetIds', 'preset', 'additionalManagedPresetIds'],
    ['preset.installRootRelativePath', 'preset', 'installRootRelativePath'],
    ['preset.retiredManagedPresetIds', 'preset', 'retiredManagedPresetIds'],
    ['preset.sharedFiles', 'preset', 'sharedFiles'],
  ])('rejects retired product-agent field %s', async (_label, section, field) => {
    const productAgent = {
      schemaVersion: 4,
      preset: {
        id: 'fixture-workbench',
        sourceRootRelativePath: 'project-presets',
      },
    }
    productAgent[section][field] = 'retired'
    const root = await fixture({ productAgent })

    await expect(validateProjectAgentPresetResources(root)).rejects.toThrow('product Agent configuration')
  })

  it.each([
    ['fixture-workbench', 'invalid DSH YAML', '- id: [broken\n', 'composition is invalid DSH YAML'],
    ['fixture-workbench', 'invalid plugin row', '- id: missing-name\n  config: {}\n', 'composition is invalid'],
  ])('fails complete validation when %s contains an %s', async (presetId, _problem, composition, message) => {
    const root = await fixture({ malformedPresetId: presetId, composition })

    await expect(validateProjectAgentPresetResources(root)).rejects.toThrow(message)
  })
})
