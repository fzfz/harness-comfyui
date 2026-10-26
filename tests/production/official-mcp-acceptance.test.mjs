import { describe, expect, it } from 'vitest'

import { assertSuccessfulProjectActivations, assertSuccessfulProjectWorkflows, assertToolScope, isOfficialMcpChildRequest } from '../desktop/fixtures/official-mcp-acceptance.mjs'
import { startOfficialBusinessServices } from '../desktop/fixtures/official-business-services.mjs'
import businessFixture from '../desktop/fixtures/official-business-fixture.json' with { type: 'json' }
import { OFFICIAL_MCP_FIXTURE } from '../desktop/fixtures/official-mcp-services.mjs'

const presetIds = ['workbench']
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

  it('requires successful reactivation of every project Preset', () => {
    const sessions = presetIds.map(activated)
    expect(assertSuccessfulProjectActivations(sessions, presetIds)).toEqual(sessions)
    for (const sessions of [presetIds.map(failed), [activated('unregistered-preset')], [], [activated('workbench'), activated('workbench')]]) {
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
    const changed = patch => [{ ...workflows[0], ...patch }]
    for (const results of [
      [],
      [workflows[0], workflows[0]],
      changed({ calls: [] }),
      changed({ calls: [workflows[0].calls[0]] }),
      changed({ calls: [...workflows[0].calls].reverse() }),
      changed({ calls: [...workflows[0].calls, workflows[0].calls[1]] }),
      changed({ calls: workflows[0].calls.map(call => ({ ...call, method: 'tools/list' })) }),
      changed({ calls: workflows[0].calls.map(call => ({ ...call, status: 401 })) }),
      changed({ calls: workflows[0].calls.map(call => ({ ...call, result: { result: { isError: true } } })) }),
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
