import { rmSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { assertSuccessfulProjectActivations, assertSuccessfulProjectWorkflows, assertToolScope } from '../desktop/fixtures/official-mcp-acceptance.mjs'
import { startOfficialBusinessServices } from '../desktop/fixtures/official-business-services.mjs'
import businessFixture from '../desktop/fixtures/official-business-fixture.json' with { type: 'json' }
import { OFFICIAL_MCP_FIXTURE } from '../desktop/fixtures/official-mcp-services.mjs'
import { readProjectAgentPresetResources } from '../../scripts/build/agent-preset-resources.mjs'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { observationMediaFixture } from '../unit/fixtures/observation-media-runtime.ts'

const presetIds = ['workbench', 'iteration']
const activated = presetId => ({ presetId, result: { ok: true, value: { sessionId: `${presetId}-session` } } })
const failed = presetId => ({ presetId, result: { ok: false, error: { code: 'agent-preset/invalid' } } })

describe('official MCP acceptance assertions', () => {
  it('retains the first controlled response fragment until cancellation and resumes later requests', async () => {
    const services = await startOfficialBusinessServices(businessFixture)
    const controller = new AbortController()
    const prompt = OFFICIAL_MCP_FIXTURE.workflowPrompt
    let paused
    try {
      paused = services.pauseNextModelResponse(request =>
        request.body.messages?.some(message => message.role === 'user' && message.content === prompt))
      const request = signal => fetch(`${services.baseURL}/chat/completions`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal,
        body: JSON.stringify({
          model: businessFixture.provider.modelId, stream: true,
          messages: [{ role: 'user', content: prompt }],
          tools: OFFICIAL_MCP_FIXTURE.tools.map(tool => ({ type: 'function', function: tool })),
        }),
      })
      const response = await request(controller.signal)
      const reader = response.body.getReader()
      const first = await reader.read()
      const fragment = new TextDecoder().decode(first.value)
      expect(fragment).toContain('search_workflows')
      expect(fragment).not.toContain('[DONE]')
      expect((await paused.started).body.model).toBe(businessFixture.provider.modelId)
      controller.abort()
      await expect(reader.read()).rejects.toThrow()
      expect(await paused.closed).toMatchObject({ finished: false })
      expect(await (await request()).text()).toContain('data: [DONE]')
      expect(services.requestLog).toHaveLength(2)
    } finally {
      controller.abort()
      paused?.release()
      await services.close()
    }
  })

  it('dispatches each actual iteration role with valid structured inputs for child scope capture', async () => {
    const { composition } = await readProjectAgentPresetResources(process.cwd(), 'harness-comfyui-iteration')
    const roles = composition.filter(entry => ['../project-iteration-dispatch.mjs', '../project-observation-dispatch.mjs'].includes(entry.name))
    expect(roles).toHaveLength(4)
    const services = await startOfficialBusinessServices(businessFixture)
    const media = observationMediaFixture()
    try {
      const runId = await media.accept()
      const saved = await media.runtime.readGenerationRunMedia({ workspaceId: 'workspace-1', runIds: [runId] })
      const images = [{ run_id: runId, media_id: saved.runs[0].images[0].media_id }]
      services.setMcpObservationImages(images)
      for (const role of roles) {
        const tool = role.config.toolName
        const response = await fetch(`${services.baseURL}/chat/completions`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: businessFixture.provider.modelId, stream: true,
            messages: [{ role: 'user', content: `${OFFICIAL_MCP_FIXTURE.childPrompt} ${tool}` }],
            tools: [{ type: 'function', function: { name: tool, parameters: role.config.parameters } }],
          }),
        })
        expect(response.status).toBe(200)
        const chunks = (await response.text()).split('\n').filter(line => line.startsWith('data: {'))
          .map(line => JSON.parse(line.slice('data: '.length)))
        const calls = chunks.flatMap(chunk => chunk.choices?.[0]?.delta?.tool_calls ?? [])
        expect(calls).toHaveLength(1)
        expect(calls[0].function.name).toBe(tool)
        const args = JSON.parse(calls[0].function.arguments)
        expect(validateJsonSchemaValue(role.config.parameters, args, '')).toEqual([])
        expect(JSON.stringify(args)).toContain(OFFICIAL_MCP_FIXTURE.workflowPrompt)
        expect(args.description).toBe(`${OFFICIAL_MCP_FIXTURE.childPrompt} ${tool}`)
        if (tool === 'subagent_observation') {
          expect(args.images).toEqual(images)
          expect(await media.resolve(args.images)).toEqual([
            expect.objectContaining({ ...images[0], path: expect.any(String) }),
          ])
        }
      }
    } finally {
      await services.close()
      media.runtime.close()
      rmSync(media.root, { recursive: true, force: true })
    }
  })
  it('requires successful reactivation of every project Preset', () => {
    const sessions = presetIds.map(activated)
    expect(assertSuccessfulProjectActivations(sessions, presetIds)).toEqual(sessions)
    for (const sessions of [presetIds.map(failed), [activated('workbench'), failed('iteration')],
      [activated('workbench')], [activated('workbench'), activated('workbench')]]) {
      expect(() => assertSuccessfulProjectActivations(sessions, presetIds)).toThrow()
    }
  })

  it('requires both MCP query results to reach the model for every recovered project Preset', () => {
    const toolNames = OFFICIAL_MCP_FIXTURE.tools.map(tool => tool.name)
    const workflows = presetIds.map(presetId => ({
      presetId, sessionId: `${presetId}-session`, resultReceivedByModel: true,
      calls: toolNames.map(name => ({
        method: 'tools/call', params: { name }, status: 200, result: { result: { isError: false } },
      })),
    }))
    expect(assertSuccessfulProjectWorkflows(workflows, presetIds, toolNames)).toEqual(workflows)
    const changed = patch => [workflows[0], { ...workflows[1], ...patch }]
    for (const results of [
      [],
      [workflows[0]],
      [workflows[0], workflows[0]],
      changed({ calls: [] }),
      changed({ calls: [workflows[1].calls[0]] }),
      changed({ calls: [...workflows[1].calls].reverse() }),
      changed({ calls: [...workflows[1].calls, workflows[1].calls[1]] }),
      changed({ calls: workflows[1].calls.map(call => ({ ...call, method: 'tools/list' })) }),
      changed({ calls: workflows[1].calls.map(call => ({ ...call, status: 401 })) }),
      changed({ calls: workflows[1].calls.map(call => ({ ...call, result: { result: { isError: true } } })) }),
      changed({ resultReceivedByModel: false }),
    ]) {
      expect(() => assertSuccessfulProjectWorkflows(results, presetIds, toolNames)).toThrow()
    }
  })

  it('requires declared MCP tools and rejects Host Catalog tools in project sessions', () => {
    const required = ['search_workflows', 'get_catalog_resource']
    const forbidden = ['query_semantic_comfyui_instances', 'query_semantic_comfyui_templates',
      'query_semantic_generation_models', 'query_semantic_loras']
    const tools = ['mcp__catalog__search_workflows', 'mcp__catalog__get_catalog_resource', 'bash']
    expect(() => assertToolScope(tools, { required, forbidden })).not.toThrow()
    expect(() => assertToolScope([tools[0]], { required, forbidden })).toThrow()
    for (const name of forbidden) {
      expect(() => assertToolScope([...tools, name], { required, forbidden })).toThrow()
      expect(() => assertToolScope([...tools, `host__${name}`], { required, forbidden })).toThrow()
    }
  })
})
