import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'

export const OFFICIAL_MCP_FIXTURE = JSON.parse(await readFile(new URL('./official-mcp-fixture.json', import.meta.url), 'utf8'))

export async function startOfficialMcpServices() {
  const token = randomUUID()
  const requests = []
  let available = true
  let authenticationToken = token
  const server = createServer(async (request, response) => {
    const authenticationMatches = request.headers.authorization === `Bearer ${authenticationToken}`
    const evidence = { httpMethod: request.method, authenticationMatches, method: null, params: null, status: null, result: null }
    requests.push(evidence)
    const send = (status, value) => {
      evidence.status = status
      evidence.result = value
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(value === undefined ? undefined : JSON.stringify(value))
    }
    if (!available) return send(503, { error: 'Controlled MCP service is unavailable' })
    if (!authenticationMatches) return send(401, { error: 'Controlled MCP credential does not match' })
    if (request.method === 'GET' || request.method === 'DELETE') return send(405)
    if (request.method !== 'POST' || request.url !== '/mcp') return send(404)
    try {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      evidence.method = body.method
      evidence.params = body.params ?? null
      if (body.id === undefined) return send(202)
      let result
      if (body.method === 'initialize') result = {
        protocolVersion: OFFICIAL_MCP_FIXTURE.protocolVersion,
        capabilities: { tools: {} }, serverInfo: OFFICIAL_MCP_FIXTURE.serverInfo,
      }
      else if (body.method === 'tools/list') result = { tools: OFFICIAL_MCP_FIXTURE.tools }
      else if (body.method === 'tools/call' && Object.hasOwn(OFFICIAL_MCP_FIXTURE.responses, body.params?.name)) {
        const structuredContent = OFFICIAL_MCP_FIXTURE.responses[body.params.name]
        result = { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent, isError: false }
      } else return send(200, { jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Unknown controlled MCP method or tool' } })
      send(200, { jsonrpc: '2.0', id: body.id, result })
    } catch {
      send(400, { error: 'Expected a JSON-RPC request' })
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  async function stop() {
    if (!server.listening) return
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
  return {
    url: `http://127.0.0.1:${port}/mcp`, port, token, requests,
    credentialEnvironmentName: OFFICIAL_MCP_FIXTURE.credentialEnvironmentName,
    setAvailable(value) { available = value },
    setAuthenticationToken(value) { authenticationToken = value },
    pause: stop,
    async resume() {
      if (server.listening) return
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', resolve)
      })
    },
    close: stop,
  }
}
