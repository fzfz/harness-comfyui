import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import sharp from 'sharp'
import { startOfficialBusinessServices } from '../../../tests/desktop/fixtures/official-business-services.mjs'
import baseFixture from '../../../tests/desktop/fixtures/official-business-fixture.json' with { type: 'json' }
import instanceTools from './controlled-instance-tools.json' with { type: 'json' }
import mcpFixture from '../../../tests/desktop/fixtures/official-mcp-fixture.json' with { type: 'json' }
import desktopConfig from '../../../config/desktop-e2e.json' with { type: 'json' }

const environment = parseEnv(await readFile(desktopConfig.modes.development.environmentFilePath, 'utf8'))
const fixture = structuredClone(baseFixture)
const imageNode = fixture.generation.workflow.nodes.find(node => node.type === 'FixtureImage')
const definition = fixture.generation.objectInfo.FixtureImage
for (const [name, type, value, spec] of [
  ['ckpt_name', 'COMBO', 'fixture.safetensors', [['fixture.safetensors']]],
  ['width', 'INT', 512, ['INT', { min: 64, max: 2048, step: 64 }]],
  ['height', 'INT', 512, ['INT', { min: 64, max: 2048, step: 64 }]],
  ['batch_size', 'INT', 1, ['INT', { min: 1, max: 20 }]],
]) {
  imageNode.inputs.push({ name, type, link: null, widget: { name } })
  imageNode.widgets_values.push(value)
  definition.input.required[name] = spec
  definition.input_order.required.push(name)
}
const baseModel = { id: '123', name: 'Controlled image base' }
const selectedModel = { id: '1', name: 'Controlled image model' }
const outputPngBytes = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#7f9fbfff' } }).png().toBuffer()
const comfy = await startOfficialBusinessServices(fixture, { outputPngBytes })
const calls = []
let release
const server = createServer(async (request, response) => {
  const send = (status, value) => {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(value))
  }
  try {
    const url = new URL(request.url, 'http://localhost')
    if (url.pathname === '/state') return send(200, {
      submissions: comfy.promptSubmissions, requests: comfy.comfyRequests, mcp: calls,
    })
    if (request.method === 'POST' && url.pathname === '/hold') {
      release = comfy.holdGenerationCompletion()
      return send(200, { held: true })
    }
    if (request.method === 'POST' && url.pathname === '/release') {
      release?.()
      return send(200, { held: false })
    }
    if (request.method === 'POST' && url.pathname === '/fail') {
      comfy.failGeneration(url.searchParams.get('prompt_id'))
      return send(200, { failed: true })
    }
    if (url.pathname !== '/mcp') return send(404, { error: 'Unknown fixture route' })
    if (request.headers.authorization !== `Bearer ${environment.NOOBAI_MCP_TOKEN}`) return send(401, { error: 'Fixture authentication failed' })
    if (request.method !== 'POST') return send(405, {})
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    calls.push({ method: body.method, params: body.params ?? null })
    if (body.id === undefined) return send(202, {})
    let result
    if (body.method === 'initialize') result = {
      protocolVersion: mcpFixture.protocolVersion, capabilities: { tools: {} }, serverInfo: mcpFixture.serverInfo,
    }
    else if (body.method === 'tools/list') result = { tools: [...mcpFixture.tools, ...instanceTools.filter(tool => tool.name === 'search_instances')] }
    else if (body.method === 'tools/call') {
      const ref = body.params.arguments?.ref
      let data
      if (body.params.name === 'search_workflows') data = { results: [{
        ref: { kind: 'workflow', id: fixture.generation.templateId }, name: fixture.generation.templateTitle,
        base_model: baseModel, model: selectedModel, lora: null, workflow_type: 'text_to_image',
      }], next: null }
      else if (body.params.name === 'get_catalog_resource' && ref?.kind === 'workflow') data = { item: {
        ref, name: fixture.generation.templateTitle, base_model: baseModel, model: selectedModel, lora: null,
        workflow_type: 'text_to_image', workflow_json: fixture.generation.workflow,
      } }
      else if (body.params.name === 'get_catalog_resource' && ref?.kind === 'model') data = { item: {
        ref, name: selectedModel.name, base_model: baseModel, file_name: 'fixture.safetensors',
        file_format: 'safetensors', precision_or_quantization: 'fp32', author: null, version: null,
        description: 'Controlled fixture model', usage: null, skill_name: null,
      } }
      else if (body.params.name === 'search_instances') data = { results: [{
        ref: { kind: 'instance', id: '1' }, name: 'Controlled Desktop Comfy Service',
        url: comfy.origin, enabled: true, validation_passed: true,
      }], next: null }
      else if (body.params.name === 'get_catalog_resource' && ref?.kind === 'instance') data = { item: {
        ref, name: 'Controlled Desktop Comfy Service', url: comfy.origin, credential_type: 'none', enabled: true, validation_passed: true,
      } }
      else return send(200, { jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Fixture contains workflow 1 and instance 1.' } })
      result = { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: false }
    }
    else return send(200, { jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Unknown fixture method' } })
    send(200, { jsonrpc: '2.0', id: body.id, result })
  } catch (error) { send(400, { error: error.message }) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const identity = { comfyOrigin: comfy.origin, sourcePort: new URL(comfy.origin).port, mcpUrl: `${origin}/mcp`, controlOrigin: origin }
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(identity, null, 2) + '\n')
process.stdout.write(JSON.stringify(identity) + '\n')
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await comfy.close()
  process.exit(0)
})
