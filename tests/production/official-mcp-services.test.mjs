import { afterEach, describe, expect, it } from 'vitest'
import { startOfficialMcpServices, OFFICIAL_MCP_FIXTURE } from '../desktop/fixtures/official-mcp-services.mjs'

const active = []
afterEach(async () => Promise.all(active.splice(0).map(service => service.close())))
const start = async () => { const service = await startOfficialMcpServices(); active.push(service); return service }
const rpc = (service, method, params = {}, token = service.token) => fetch(service.url, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
    ...(token === null ? {} : { Authorization: `Bearer ${token}` }) },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
})

describe('controlled official MCP service', () => {
  it('rejects missing and invalid credentials, restores service, and releases its assigned port', async () => {
    const service = await start()
    expect((await rpc(service, 'initialize', {}, null)).status).toBe(401)
    expect((await rpc(service, 'initialize', {}, 'invalid')).status).toBe(401)
    service.setAvailable(false)
    expect((await rpc(service, 'initialize')).status).toBe(503)
    service.setAvailable(true)
    expect((await rpc(service, 'initialize')).status).toBe(200)
    await service.pause()
    await expect(rpc(service, 'initialize')).rejects.toThrow()
    await service.resume()
    service.setAuthenticationToken('changed')
    expect((await rpc(service, 'tools/list')).status).toBe(401)
    service.setAuthenticationToken(service.token)
    expect((await rpc(service, 'tools/list')).status).toBe(200)
    await service.close()
    await expect(rpc(service, 'initialize')).rejects.toThrow()
    expect(service.requests.map(request => request.status)).toEqual([401, 401, 503, 200, 401, 200])
  })

  it('serves Workflow declarations and matching text and structured results without image fields', async () => {
    const service = await start()
    const { result: { tools } } = await (await rpc(service, 'tools/list')).json()
    const search = tools.find(tool => tool.name === 'search_workflows')
    expect(search.outputSchema.properties.results.items.properties).not.toHaveProperty('cover_url')
    const detail = tools.find(tool => tool.name === 'get_catalog_resource')
    for (const variant of detail.outputSchema.properties.item.oneOf) {
      expect(variant.properties).not.toHaveProperty('cover_url')
      expect(variant.properties).not.toHaveProperty('sample_image_urls')
    }
    for (const tool of tools) {
      const { result } = await (await rpc(service, 'tools/call', { name: tool.name, arguments: {} })).json()
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
      const record = result.structuredContent.item ?? result.structuredContent.results[0]
      expect(record).not.toHaveProperty('cover_url')
      expect(record).not.toHaveProperty('sample_image_urls')
      expect(record).toMatchObject({ ref: { kind: 'workflow', id: '9001' }, model: null })
    }
  })

  it('initializes, discovers the verified Workflow tools, and serves structured calls concurrently', async () => {
    const service = await start()
    const initial = await (await rpc(service, 'initialize', { protocolVersion: OFFICIAL_MCP_FIXTURE.protocolVersion })).json()
    expect(initial.result).toMatchObject({ capabilities: { tools: {} }, serverInfo: OFFICIAL_MCP_FIXTURE.serverInfo })
    expect((await (await rpc(service, 'tools/list')).json()).result.tools).toEqual(OFFICIAL_MCP_FIXTURE.tools)
    const calls = await Promise.all(OFFICIAL_MCP_FIXTURE.tools.map(tool => rpc(service, 'tools/call', { name: tool.name, arguments: {} })))
    for (let index = 0; index < calls.length; index++) {
      expect((await calls[index].json()).result.structuredContent).toEqual(OFFICIAL_MCP_FIXTURE.responses[OFFICIAL_MCP_FIXTURE.tools[index].name])
    }
    expect(service.requests.every(request => request.authenticationMatches)).toBe(true)
    expect(JSON.stringify(service.requests)).not.toContain(service.token)
  })
})
