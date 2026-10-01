import { createServer } from 'node:http'

const MAX_MODEL_REQUEST_BYTES = 1024 * 1024
const CONTROLLED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL+nwAAAABJRU5ErkJggg==',
  'base64',
)

export async function startOfficialBusinessServices(fixture) {
  const requests = []
  const requestLog = []
  const comfyRequests = []
  const frontendEvents = []
  const skillToolCalls = []
  const jobPollCounts = new Map()
  let submittedPrompt = null
  const waiters = []
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    if (request.method === 'GET' && pathname === '/internal/comfyui-source') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(createComfySourceDiscovery()))
      return
    }
    if (request.method === 'GET' && pathname === '/internal/comfyui-source/instances/1') {
      writeJson(response, sourceEnvelope({
        id: '1', title: 'Controlled Desktop Comfy Service',
        url: `http://127.0.0.1:${server.address().port}`, credential_type: 'none',
      }))
      return
    }
    if (request.method === 'GET' && pathname === `/internal/comfyui-source/templates/${fixture.generation.templateId}/bundle`) {
      writeJson(response, sourceEnvelope({
        id: fixture.generation.templateId,
        title: fixture.generation.templateTitle,
        workflow_json: fixture.generation.workflow,
      }))
      return
    }
    if (request.method === 'GET' && pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(createControlledComfyFrontend(fixture))
      return
    }
    if (request.method === 'GET' && pathname === '/object_info') {
      comfyRequests.push({ method: request.method, pathname })
      writeJson(response, fixture.generation.objectInfo)
      return
    }
    if (request.method === 'POST' && pathname === '/__fixture/frontend') {
      void readJson(request).then(event => {
        frontendEvents.push(event)
        response.writeHead(204)
        response.end()
      }).catch(error => writeFailure(response, error))
      return
    }
    if (request.method === 'POST' && pathname === '/prompt') {
      void readJson(request).then(body => {
        submittedPrompt = { promptId: body.prompt_id, body }
        comfyRequests.push({ method: request.method, pathname, promptId: body.prompt_id, body })
        writeJson(response, { prompt_id: body.prompt_id })
      }).catch(error => writeFailure(response, error))
      return
    }
    if (request.method === 'GET' && pathname.startsWith('/api/jobs/')) {
      const promptId = decodeURIComponent(pathname.slice('/api/jobs/'.length))
      const count = (jobPollCounts.get(promptId) ?? 0) + 1
      jobPollCounts.set(promptId, count)
      comfyRequests.push({ method: request.method, pathname, promptId, poll: count })
      writeJson(response, {
        id: promptId,
        status: count === 1 ? 'pending' : 'completed',
        outputs: { [fixture.generation.outputNodeId]: { images: [controlledOutputDescriptor(fixture)] } },
      })
      return
    }
    if (request.method === 'GET' && pathname.startsWith('/history/')) {
      const promptId = decodeURIComponent(pathname.slice('/history/'.length))
      comfyRequests.push({ method: request.method, pathname, promptId })
      const history = submittedPrompt?.promptId === promptId
        ? {
            prompt: [0, promptId, submittedPrompt.body.prompt, {}, ['official-desktop-regression-client']],
            outputs: { [fixture.generation.outputNodeId]: { images: [controlledOutputDescriptor(fixture)] } },
            status: { status_str: 'success', completed: true, messages: [] },
          }
        : null
      writeJson(response, history === null ? {} : { [promptId]: history })
      return
    }
    if (request.method === 'GET' && pathname === '/view') {
      const query = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams
      const output = controlledOutputDescriptor(fixture)
      const matches = query.get('filename') === output.filename
        && query.get('subfolder') === output.subfolder
        && query.get('type') === output.type
      comfyRequests.push({
        method: request.method, pathname,
        filename: query.get('filename'), subfolder: query.get('subfolder'), type: query.get('type'), matches,
      })
      if (!matches) {
        response.writeHead(404)
        response.end()
        return
      }
      response.writeHead(200, { 'content-type': 'image/png', 'content-length': CONTROLLED_PNG.length })
      response.end(CONTROLLED_PNG)
      return
    }
    if (request.method === 'GET' && request.url === '/internal/semantic') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(createSemanticDiscovery()))
      return
    }
    if (request.method === 'GET' && request.url?.startsWith('/catalog-image/')) {
      const key = request.url.slice('/catalog-image/'.length).replace(/\.svg$/u, '')
      const dimensions = fixture.catalog.images[key]
      if (dimensions === undefined) {
        response.writeHead(404)
        response.end()
        return
      }
      response.writeHead(200, { 'content-type': 'image/svg+xml' })
      response.end(`<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}"><rect width="100%" height="100%" fill="#508080"/><circle cx="50%" cy="50%" r="15" fill="white"/></svg>`)
      return
    }
    if (request.method === 'POST' && request.url === '/internal/semantic/base-models') {
      void readJson(request).then(input => {
        const resolving = input.mode === 'resolve'
        const results = resolving && input.id !== fixture.catalog.baseModel.id
          ? []
          : [{ id: fixture.catalog.baseModel.id, name: fixture.catalog.baseModel.name }]
        writeJson(response, { status: 'ok', message: null, results, page: 1, page_size: 20, total_count: results.length })
      }).catch(error => writeFailure(response, error))
      return
    }
    if (request.method === 'POST' && request.url === '/internal/semantic/comfyui-templates') {
      void readJson(request).then(input => {
        const origin = `http://127.0.0.1:${server.address().port}`
        const items = Array.from({ length: fixture.catalog.totalTemplates }, (_, index) => {
          const id = index + 1
          return {
            id,
            base_model_id: fixture.catalog.template.baseModelId,
            model_id: fixture.catalog.template.modelId,
            lora_id: fixture.catalog.template.loraId,
            title: `${fixture.catalog.template.titlePrefix}${id}`,
            template_type: input.mode === 'resolve'
              ? `${fixture.catalog.template.templateType}\n${fixture.catalog.template.detailText.repeat(200)}`
              : fixture.catalog.template.templateType,
            workflow_json: {},
            cover_url: `${origin}/catalog-image/cover.svg`,
            sample_image_urls: [`${origin}/catalog-image/wide.svg`, `${origin}/catalog-image/small.svg`],
          }
        })
        const page = input.mode === 'resolve' ? 1 : input.page
        const pageSize = input.mode === 'resolve' ? 1 : input.page_size
        const results = input.mode === 'resolve'
          ? items.filter(item => String(item.id) === input.id)
          : items.slice((page - 1) * pageSize, page * pageSize)
        writeJson(response, {
          status: 'ok', message: null, results, page, page_size: pageSize,
          total_count: input.mode === 'resolve' ? results.length : fixture.catalog.totalTemplates,
        })
      }).catch(error => writeFailure(response, error))
      return
    }
    if (request.method === 'POST' && pathname === '/v1/chat/completions') {
      void readBytes(request).then(bytes => {
        const body = JSON.parse(bytes.toString('utf8'))
        const captured = { path: request.url, headers: { ...request.headers }, body }
        requestLog.push(captured)
        const waiterIndex = waiters.findIndex(waiter => waiter.predicate(captured))
        if (waiterIndex < 0) requests.push(captured)
        else waiters.splice(waiterIndex, 1)[0].resolve(captured)
        const model = typeof body.model === 'string' ? body.model : fixture.provider.modelId
        const promptText = requestPromptText(body)
        const generationRequested = promptText.includes(fixture.generation.triggerPrompt)
        const skillMarkerTask = promptText.includes(fixture.skills.markerRequest)
        const modelContextText = JSON.stringify({ messages: body.messages ?? [], tools: body.tools ?? [] })
        const hasWorkspaceSkillResult = modelContextText.includes(fixture.skills.workspaceMarker)
        const hasUserSkillResult = modelContextText.includes(fixture.skills.userMarker)
        const skillToolAvailable = (body.tools ?? []).some(tool => (tool.function?.name ?? tool.name) === 'skill')
        const nextSkillName = hasWorkspaceSkillResult
          ? hasUserSkillResult ? null : fixture.skills.userName
          : fixture.skills.uniqueWorkspaceName
        const skillToolCall = skillMarkerTask && nextSkillName !== null && skillToolAvailable
        if (skillToolCall) {
          skillToolCalls.push({
            name: 'skill',
            arguments: { name: nextSkillName },
          })
        }
        const toolResultPresent = body.messages?.some(message => message.role === 'tool') === true
        const generationToolAvailable = (body.tools ?? []).some(tool =>
          (tool.function?.name ?? tool.name) === 'generate_with_comfyui')
        const generationCall = generationRequested && !toolResultPresent && generationToolAvailable
        const delta = generationCall
          ? {
              role: 'assistant',
              tool_calls: [{
                index: 0,
                id: 'official_desktop_generation_call',
                type: 'function',
                function: {
                  name: 'generate_with_comfyui',
                  arguments: JSON.stringify({
                    title: fixture.generation.runTitle,
                    instance_id: fixture.generation.instanceId,
                    template_id: fixture.generation.templateId,
                    parameters: {
                      positive_prompt: fixture.generation.positivePrompt,
                      seed: fixture.generation.seed,
                    },
                    loras: [],
                  }),
              },
              }],
            }
          : skillToolCall
            ? {
                role: 'assistant',
                tool_calls: [{
                  index: 0,
                  id: `official_desktop_skill_${skillToolCalls.length}`,
                  type: 'function',
                  function: {
                    name: 'skill',
                    arguments: JSON.stringify({ name: nextSkillName }),
                  },
                }],
              }
          : {
              role: 'assistant',
              content: skillMarkerTask
                ? hasWorkspaceSkillResult && hasUserSkillResult
                  ? `${fixture.skills.workspaceMarker}\n${fixture.skills.userMarker}`
                  : 'The requested verification Skills were not loaded through the skill tool.'
                : toolResultPresent ? 'Controlled generation accepted.' : 'captured',
            }
        const chunks = [
          { id: 'official-desktop-controlled-response', object: 'chat.completion.chunk', created: 1, model, choices: [{ index: 0, delta, finish_reason: null }] },
          { id: 'official-desktop-controlled-response', object: 'chat.completion.chunk', created: 1, model, choices: [{ index: 0, delta: {}, finish_reason: generationCall || skillToolCall ? 'tool_calls' : 'stop' }] },
        ]
        response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
        response.end(`${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`)
      }).catch(error => writeFailure(response, error))
      return
    }
    if (request.method === 'GET' && request.url === '/v1/models') {
      writeJson(response, { object: 'list', data: [{ id: fixture.provider.modelId, object: 'model' }] })
      return
    }
    response.writeHead(404)
    response.end()
  })

  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('official business fixture server has no TCP port')
  const origin = `http://127.0.0.1:${address.port}`

  return {
    origin,
    baseURL: `${origin}/v1`,
    get requests() { return [...requests] },
    get requestLog() { return structuredClone(requestLog) },
    get comfyRequests() { return [...comfyRequests] },
    get frontendEvents() { return [...frontendEvents] },
    get skillToolCalls() { return structuredClone(skillToolCalls) },
    get promptSubmission() { return submittedPrompt === null ? null : structuredClone(submittedPrompt) },
    get controlledPngByteLength() { return CONTROLLED_PNG.length },
    get historyRequestCount() { return comfyRequests.filter(item => item.pathname.startsWith('/history/')).length },
    async readHistory(promptId) {
      const response = await fetch(`${origin}/history/${encodeURIComponent(promptId)}`)
      if (!response.ok) throw new Error(`controlled ComfyUI /history returned ${response.status}`)
      return response.json()
    },
    async nextRequest(timeoutMs = 10_000) {
      return awaitMatchingRequest(() => true, timeoutMs)
    },
    async nextRequestWhere(predicate, timeoutMs = 10_000) {
      if (typeof predicate !== 'function') throw new TypeError('controlled model request predicate must be a function')
      return awaitMatchingRequest(predicate, timeoutMs)
    },
    async close() {
      for (const waiter of waiters.splice(0)) waiter.reject(new Error('official business services closed'))
      await new Promise((resolveClose, rejectClose) => {
        server.close(error => error ? rejectClose(error) : resolveClose())
        server.closeAllConnections?.()
      })
    },
  }

  async function awaitMatchingRequest(predicate, timeoutMs) {
    const queuedIndex = requests.findIndex(predicate)
    if (queuedIndex >= 0) return Promise.resolve(requests.splice(queuedIndex, 1)[0])
    let resolveRequest
    let rejectRequest
    const pending = new Promise((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject })
    const waiter = { predicate, resolve: resolveRequest, reject: rejectRequest }
    waiters.push(waiter)
    let timeout
    try {
      return await Promise.race([
        pending,
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('timed out waiting for a controlled model request')), timeoutMs)
        }),
      ])
    } finally {
      clearTimeout(timeout)
      const index = waiters.indexOf(waiter)
      if (index >= 0) waiters.splice(index, 1)
    }
  }
}

function createSemanticDiscovery() {
  const search = {
    type: 'object', additionalProperties: false, required: ['mode'],
    description: 'Search branch for the Catalog operation.',
    properties: {
      mode: { const: 'search', description: 'Request branch discriminator for text search', example: 'search' },
      query: { type: 'string', minLength: 0, maxLength: 200, default: '', description: 'Catalog name search', example: 'watercolor' },
      page: { type: 'integer', minimum: 1, maximum: 100000, default: 1, description: 'One-based result page number', example: 1 },
      page_size: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'Maximum number of records returned on one page', example: 20 },
    },
  }
  const resolve = {
    type: 'object', additionalProperties: false, required: ['mode', 'id'],
    description: 'Resolve branch for one Catalog record.',
    properties: {
      mode: { const: 'resolve', description: 'Request branch discriminator for stable-ID lookup', example: 'resolve' },
      id: { type: 'string', minLength: 1, maxLength: 20, pattern: '^[1-9][0-9]{0,19}$', description: 'Decimal Catalog record identifier', example: '123' },
    },
  }
  const schemas = Object.fromEntries(['CatalogBaseModel', 'CatalogTemplate'].map(prefix => [
    `${prefix}Request`, {
      type: 'object', oneOf: [
        { $ref: `#/components/schemas/${prefix}SearchRequest` },
        { $ref: `#/components/schemas/${prefix}ResolveRequest` },
      ],
      description: 'Closed search-or-resolve Catalog request.',
      example: { mode: 'search', query: 'watercolor', page: 1, page_size: 20 },
    },
  ]))
  schemas.CatalogBaseModelSearchRequest = search
  schemas.CatalogBaseModelResolveRequest = resolve
  schemas.CatalogTemplateSearchRequest = structuredClone(search)
  schemas.CatalogTemplateSearchRequest.properties.base_model_id = {
    type: 'string', minLength: 1, maxLength: 20, pattern: '^[1-9][0-9]{0,19}$',
    description: 'Base-model identifier for Catalog filtering', example: '123',
  }
  schemas.CatalogTemplateResolveRequest = resolve
  return {
    openapi: '3.1.0',
    paths: Object.fromEntries([
      ['/internal/semantic/base-models', 'BaseModel'],
      ['/internal/semantic/comfyui-templates', 'Template'],
    ].map(([path, type]) => [path, { post: {
      summary: `Search or resolve ${type === 'BaseModel' ? 'base-model' : 'ComfyUI template'} records`,
      description: 'Search or resolve Catalog records using stable identifiers.',
      operationId: type === 'BaseModel' ? 'querySemanticBaseModelsForSkill' : 'querySemanticComfyuiTemplatesForSkill',
      'x-harness-tool-name': type === 'BaseModel' ? 'query_semantic_base_models' : 'query_semantic_comfyui_templates',
      requestBody: {
        required: true,
        content: { 'application/json': {
          schema: { $ref: `#/components/schemas/Catalog${type}Request` },
          examples: {
            search: { value: { mode: 'search', query: 'watercolor', page: 1, page_size: 20 } },
            resolve: { value: { mode: 'resolve', id: '123' } },
          },
        } },
      },
    } }])) ,
    components: { schemas },
  }
}

async function readJson(request) {
  const bytes = await readBytes(request)
  return JSON.parse(bytes.toString('utf8'))
}

async function readBytes(request) {
  const chunks = []
  let byteLength = 0
  for await (const chunk of request) {
    byteLength += chunk.length
    if (byteLength > MAX_MODEL_REQUEST_BYTES) throw new Error('controlled business request exceeded 1 MiB')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function writeJson(response, value) {
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify(value))
}

function writeFailure(response, error) {
  if (response.headersSent) {
    response.destroy(error instanceof Error ? error : new Error(String(error)))
    return
  }
  response.writeHead(400, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : String(error), results: [] }))
}

function sourceEnvelope(result) {
  return { status: 'ok', message: null, results: [result], page: 1, page_size: 1, total_count: 1 }
}

function createComfySourceDiscovery() {
  const instancePath = '/internal/comfyui-source/instances/{instance_id}'
  const templatePath = '/internal/comfyui-source/templates/{template_id}/bundle'
  return {
    openapi: '3.1.0',
    paths: {
      [instancePath]: { get: { operationId: 'getComfyuiInstanceSourceForHost' } },
      [templatePath]: { get: { operationId: 'getComfyuiTemplateBundleForHost' } },
    },
  }
}

function controlledOutputDescriptor(fixture) {
  return {
    filename: fixture.generation.filename,
    subfolder: fixture.generation.subfolder,
    type: 'output',
  }
}

function requestPromptText(body) {
  return (body.messages ?? []).flatMap(message => {
    if (typeof message.content === 'string') return [message.content]
    if (!Array.isArray(message.content)) return []
    return message.content.flatMap(part => typeof part?.text === 'string' ? [part.text] : [])
  }).join('\n')
}

function createControlledComfyFrontend(fixture) {
  const nodeTypes = Object.keys(fixture.generation.objectInfo)
  const script = `
    (() => {
      const workflowNodeTypes = ${JSON.stringify(nodeTypes)}
      const report = event => {
        void fetch('/__fixture/frontend', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(event),
        }).catch(() => undefined)
      }
      class ControlledComfyNode {}
      const registered = Object.create(null)
      globalThis.LiteGraph = {
        registered_node_types: registered,
        registerNodeType(name, constructor) {
          if (typeof name !== 'string' || typeof constructor !== 'function') throw new TypeError('invalid LiteGraph node registration')
          registered[name] = constructor
        },
      }
      for (const type of workflowNodeTypes) globalThis.LiteGraph.registerNodeType(type, ControlledComfyNode)
      report({ type: 'nodes-registered', nodeTypes: Object.keys(registered).sort() })

      const graph = {
        _nodes: [],
        links: [],
        configure(workflow) {
          this._nodes = structuredClone(workflow.nodes)
          this.links = structuredClone(workflow.links)
        },
      }
      const app = {
        graph,
        async loadGraphData(workflow) {
          for (const node of workflow.nodes) {
            if (typeof globalThis.LiteGraph.registered_node_types[node.type] !== 'function') {
              throw new Error('workflow node is not registered: ' + node.type)
            }
          }
          graph.configure(workflow)
          report({ type: 'workflow-loaded', nodeCount: graph._nodes.length })
        },
        async graphToPrompt() {
          const output = Object.create(null)
          for (const node of graph._nodes) {
            const inputs = Object.create(null)
            let widgetIndex = 0
            for (const input of node.inputs ?? []) {
              if (input.link !== null && input.link !== undefined) {
                const edge = graph.links.find(link => link[0] === input.link)
                if (!edge) throw new Error('workflow input link is unavailable: ' + input.link)
                inputs[input.name] = [String(edge[1]), edge[2]]
              } else if (input.widget) {
                inputs[input.name] = node.widgets_values?.[widgetIndex]
                widgetIndex += 1
              }
            }
            output[String(node.id)] = { class_type: node.type, inputs }
          }
          report({ type: 'graph-to-prompt', nodeIds: Object.keys(output).sort() })
          return { output }
        },
      }
      globalThis.app = app
      globalThis.comfyAPI = { app: { app } }
    })()
  `
  return `<!doctype html><html><head><meta charset="utf-8"><style>#splash-loader{display:none}</style></head><body><div id="splash-loader"></div><main>Controlled ComfyUI frontend regression service</main><script>${script}</script></body></html>`
}
