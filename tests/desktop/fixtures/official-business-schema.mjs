const ROOT_KEYS = ['schemaVersion', 'provider', 'imageReader', 'catalog', 'skills', 'sessions', 'generation', 'browserEvidenceFiles']
const PROVIDER_KEYS = ['id', 'displayName', 'api', 'apiKeyEnvironmentName', 'modelId', 'modelName', 'contextWindow', 'maxTokens', 'models']
const PROVIDER_MODELS_KEYS = ['promptCapture', 'vision']
const PROMPT_CAPTURE_MODEL_KEYS = ['input']
const CONTROLLED_MODEL_KEYS = ['id', 'name', 'contextWindow', 'maxTokens', 'input']
const IMAGE_READER_KEYS = ['defaultModel', 'alternateProvider']
const DEFAULT_MODEL_KEYS = ['provider', 'model']
const ALTERNATE_PROVIDER_KEYS = ['id', 'displayName', 'api', 'model']
const CATALOG_KEYS = ['baseModel', 'template', 'images', 'totalTemplates']
const BASE_MODEL_KEYS = ['id', 'name']
const TEMPLATE_KEYS = ['baseModelId', 'modelId', 'loraId', 'titlePrefix', 'templateType', 'detailText']
const IMAGES_KEYS = ['cover', 'wide', 'small']
const IMAGE_KEYS = ['width', 'height']
const SKILLS_KEYS = [
  'workspaceName', 'workspaceDescription', 'uniqueWorkspaceName', 'uniqueWorkspaceDescription',
  'workspaceMarker', 'userName', 'userDescription', 'userMarker', 'markerRequest',
]
const SESSIONS_KEYS = ['primaryTitle', 'switchTitle', 'skillMarkerTitle', 'promptRequestId']
const GENERATION_KEYS = [
  'triggerPrompt', 'sessionTitle', 'runTitle', 'instanceId', 'templateId',
  'templateTitle', 'positivePrompt', 'seed', 'filename', 'subfolder', 'outputNodeId',
  'workflow', 'objectInfo',
]
const WORKFLOW_KEYS = ['version', 'nodes', 'links']
const WORKFLOW_NODE_KEYS = ['id', 'type', 'inputs', 'outputs', 'widgets_values']
const WORKFLOW_INPUT_KEYS = ['name', 'type', 'link', 'widget']
const WORKFLOW_OUTPUT_KEYS = ['name', 'type', 'links']
const OBJECT_INFO_KEYS = ['input', 'input_order', 'output', 'output_node']
const INPUT_KEYS = ['required']
const INPUT_ORDER_KEYS = ['required', 'optional']

function object(value, keys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`)
  const missing = keys.filter(key => !Object.hasOwn(value, key))
  const unexpected = Object.keys(value).filter(key => !keys.includes(key))
  if (missing.length || unexpected.length) {
    throw new TypeError(`${label} must contain exactly ${keys.join(', ')}${missing.length ? `; missing ${missing.join(', ')}` : ''}${unexpected.length ? `; unexpected ${unexpected.join(', ')}` : ''}`)
  }
  return value
}

function nonEmptyString(value, label, pattern) {
  if (typeof value !== 'string' || value.trim() === '' || pattern && !pattern.test(value)) {
    throw new TypeError(`${label} has an invalid value`)
  }
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer`)
}

function stringArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  value.forEach((entry, index) => nonEmptyString(entry, `${label}[${index}]`))
}

function exactInputModalities(value, expected, label) {
  stringArray(value, label)
  if (value.length !== expected.length || expected.some((modality, index) => value[index] !== modality)) {
    throw new TypeError(`${label} must be [${expected.join(', ')}]`)
  }
}

function parseControlledModel(value, label, expectedInput) {
  const model = object(value, CONTROLLED_MODEL_KEYS, label)
  for (const key of ['id', 'name']) nonEmptyString(model[key], `${label}.${key}`)
  positiveInteger(model.contextWindow, `${label}.contextWindow`)
  positiveInteger(model.maxTokens, `${label}.maxTokens`)
  exactInputModalities(model.input, expectedInput, `${label} input`)
  return model
}

function parseWorkflow(workflow, objectInfo) {
  const source = object(workflow, WORKFLOW_KEYS, 'official business fixture.generation.workflow')
  if (source.version !== 0.4) throw new TypeError('official business fixture.generation.workflow.version must be 0.4')
  if (!Array.isArray(source.nodes) || source.nodes.length === 0) {
    throw new TypeError('official business fixture.generation.workflow.nodes must be a non-empty array')
  }
  if (!Array.isArray(source.links)) throw new TypeError('official business fixture.generation.workflow.links must be an array')
  const nodeIds = new Set()
  const nodesById = new Map()
  const inputsByLink = new Map()
  const outputsByLink = new Map()
  const nodeTypes = new Set()
  source.nodes.forEach((rawNode, index) => {
    const node = object(rawNode, WORKFLOW_NODE_KEYS, `official business fixture.generation.workflow.nodes[${index}]`)
    positiveInteger(node.id, `official business fixture.generation.workflow.nodes[${index}].id`)
    if (nodeIds.has(node.id)) throw new TypeError('official business fixture.generation.workflow node ids must be unique')
    nodeIds.add(node.id)
    nodesById.set(node.id, node)
    nonEmptyString(node.type, `official business fixture.generation.workflow.nodes[${index}].type`)
    nodeTypes.add(node.type)
    if (!Array.isArray(node.inputs) || !Array.isArray(node.outputs) || !Array.isArray(node.widgets_values)) {
      throw new TypeError(`official business fixture.generation.workflow.nodes[${index}] collections must be arrays`)
    }
    node.inputs.forEach((rawInput, inputIndex) => {
      const inputKeys = rawInput !== null && typeof rawInput === 'object' && Object.hasOwn(rawInput, 'widget')
        ? WORKFLOW_INPUT_KEYS
        : WORKFLOW_INPUT_KEYS.filter(key => key !== 'widget')
      const input = object(rawInput, inputKeys, `official business fixture.generation.workflow.nodes[${index}].inputs[${inputIndex}]`)
      nonEmptyString(input.name, `official business fixture.generation.workflow.nodes[${index}].inputs[${inputIndex}].name`)
      nonEmptyString(input.type, `official business fixture.generation.workflow.nodes[${index}].inputs[${inputIndex}].type`)
      if (input.link !== null) {
        positiveInteger(input.link, `official business fixture.generation.workflow.nodes[${index}].inputs[${inputIndex}].link`)
        if (inputsByLink.has(input.link)) throw new TypeError('official business fixture.generation.workflow input links must be unique')
        inputsByLink.set(input.link, node.id)
      }
      if (Object.hasOwn(input, 'widget') && input.widget !== null) {
        const widget = object(input.widget, ['name'], `official business fixture.generation.workflow.nodes[${index}].inputs[${inputIndex}].widget`)
        nonEmptyString(widget.name, `official business fixture.generation.workflow.nodes[${index}].inputs[${inputIndex}].widget.name`)
      }
    })
    node.outputs.forEach((rawOutput, outputIndex) => {
      const output = object(rawOutput, WORKFLOW_OUTPUT_KEYS, `official business fixture.generation.workflow.nodes[${index}].outputs[${outputIndex}]`)
      nonEmptyString(output.name, `official business fixture.generation.workflow.nodes[${index}].outputs[${outputIndex}].name`)
      nonEmptyString(output.type, `official business fixture.generation.workflow.nodes[${index}].outputs[${outputIndex}].type`)
      if (!Array.isArray(output.links)) throw new TypeError('official business fixture.generation.workflow output links must be an array')
      output.links.forEach(linkId => {
        positiveInteger(linkId, 'official business fixture.generation.workflow output link id')
        if (outputsByLink.has(linkId)) throw new TypeError('official business fixture.generation.workflow output link ids must be unique')
        outputsByLink.set(linkId, node.id)
      })
    })
  })
  if (nodeTypes.size !== Object.keys(objectInfo).length || [...nodeTypes].some(type => !Object.hasOwn(objectInfo, type))) {
    throw new TypeError('official business fixture.generation.objectInfo must describe exactly the Workflow node types')
  }
  source.links.forEach((rawLink, index) => {
    if (!Array.isArray(rawLink) || rawLink.length !== 6) {
      throw new TypeError(`official business fixture.generation.workflow.links[${index}] must contain six entries`)
    }
    const [linkId, sourceId, sourceSlot, targetId, targetSlot, type] = rawLink
    for (const [label, value] of [['link id', linkId], ['source id', sourceId], ['source slot', sourceSlot], ['target id', targetId], ['target slot', targetSlot]]) {
      if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`official business fixture.generation.workflow ${label} must be a non-negative integer`)
    }
    nonEmptyString(type, `official business fixture.generation.workflow.links[${index}].type`)
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)
      || outputsByLink.get(linkId) !== sourceId || inputsByLink.get(linkId) !== targetId) {
      throw new TypeError(`official business fixture.generation.workflow.links[${index}] does not match its node ports`)
    }
    const sourceNode = nodesById.get(sourceId)
    const targetNode = nodesById.get(targetId)
    const sourceOutput = sourceNode.outputs[sourceSlot]
    const targetInput = targetNode.inputs[targetSlot]
    if (sourceOutput === undefined || targetInput === undefined
      || sourceOutput.type !== type || targetInput.type !== type
      || !sourceOutput.links.includes(linkId) || targetInput.link !== linkId) {
      throw new TypeError(`official business fixture.generation.workflow.links[${index}] references mismatched port indexes or types`)
    }
  })
  if (inputsByLink.size !== source.links.length || outputsByLink.size !== source.links.length) {
    throw new TypeError('official business fixture.generation.workflow contains unpaired node links')
  }

  for (const [nodeType, rawDefinition] of Object.entries(objectInfo)) {
    const definition = object(rawDefinition, OBJECT_INFO_KEYS, `official business fixture.generation.objectInfo.${nodeType}`)
    const input = object(definition.input, INPUT_KEYS, `official business fixture.generation.objectInfo.${nodeType}.input`)
    const required = object(input.required, Object.keys(input.required ?? {}), `official business fixture.generation.objectInfo.${nodeType}.input.required`)
    const order = object(definition.input_order, INPUT_ORDER_KEYS, `official business fixture.generation.objectInfo.${nodeType}.input_order`)
    stringArray(order.required, `official business fixture.generation.objectInfo.${nodeType}.input_order.required`)
    stringArray(order.optional, `official business fixture.generation.objectInfo.${nodeType}.input_order.optional`)
    if (new Set([...order.required, ...order.optional]).size !== Object.keys(required).length
      || Object.keys(required).some(name => !order.required.includes(name) && !order.optional.includes(name))) {
      throw new TypeError(`official business fixture.generation.objectInfo.${nodeType} input order does not cover its descriptors`)
    }
    for (const [name, descriptor] of Object.entries(required)) {
      if (!Array.isArray(descriptor) || typeof descriptor[0] !== 'string') {
        throw new TypeError(`official business fixture.generation.objectInfo.${nodeType}.${name} descriptor is invalid`)
      }
    }
    stringArray(definition.output, `official business fixture.generation.objectInfo.${nodeType}.output`)
    if (typeof definition.output_node !== 'boolean') {
      throw new TypeError(`official business fixture.generation.objectInfo.${nodeType}.output_node must be a boolean`)
    }
  }
}

export function parseOfficialBusinessFixture(value) {
  const root = object(value, ROOT_KEYS, 'official business fixture')
  const browserFiles = object(root.browserEvidenceFiles, ['saved', 'screenshot', 'restarted'], 'browser evidence files')
  for (const [key, filename] of Object.entries(browserFiles)) {
    nonEmptyString(filename, `browser evidence files.${key}`,
      key === 'screenshot' ? /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.png$/u : /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/u)
  }
  if (new Set(Object.values(browserFiles)).size !== 3) throw new TypeError('browser evidence filenames must be unique')
  if (root.schemaVersion !== 2) throw new TypeError('official business fixture.schemaVersion must be 2')

  const provider = object(root.provider, PROVIDER_KEYS, 'official business fixture.provider')
  for (const key of ['id', 'displayName', 'modelId', 'modelName']) nonEmptyString(provider[key], `official business fixture.provider.${key}`)
  if (provider.api !== 'openai-completions') throw new TypeError('official business fixture.provider.api must be openai-completions')
  nonEmptyString(provider.apiKeyEnvironmentName, 'official business fixture.provider.apiKeyEnvironmentName', /^[A-Za-z_][A-Za-z0-9_]*$/u)
  positiveInteger(provider.contextWindow, 'official business fixture.provider.contextWindow')
  positiveInteger(provider.maxTokens, 'official business fixture.provider.maxTokens')
  const providerModels = object(provider.models, PROVIDER_MODELS_KEYS, 'official business fixture.provider.models')
  const promptCaptureModel = object(providerModels.promptCapture, PROMPT_CAPTURE_MODEL_KEYS, 'official business fixture.provider.models.promptCapture')
  exactInputModalities(promptCaptureModel.input, ['text'], 'official business fixture prompt-capture model input')
  const visionModel = parseControlledModel(
    providerModels.vision,
    'official business fixture.provider.models.vision',
    ['text', 'image'],
  )

  const imageReader = object(root.imageReader, IMAGE_READER_KEYS, 'official business fixture.imageReader')
  const defaultModel = object(imageReader.defaultModel, DEFAULT_MODEL_KEYS, 'official business fixture.imageReader.defaultModel')
  nonEmptyString(defaultModel.provider, 'official business fixture.imageReader.defaultModel.provider')
  nonEmptyString(defaultModel.model, 'official business fixture.imageReader.defaultModel.model')
  const alternateProvider = object(imageReader.alternateProvider, ALTERNATE_PROVIDER_KEYS, 'official business fixture.imageReader.alternateProvider')
  for (const key of ['id', 'displayName']) nonEmptyString(alternateProvider[key], `official business fixture.imageReader.alternateProvider.${key}`)
  if (alternateProvider.api !== 'openai-completions') {
    throw new TypeError('official business fixture.imageReader.alternateProvider.api must be openai-completions')
  }
  const alternateVisionModel = parseControlledModel(
    alternateProvider.model,
    'official business fixture.imageReader.alternateProvider.model',
    ['text', 'image'],
  )
  if (defaultModel.provider !== provider.id || defaultModel.model !== visionModel.id) {
    throw new TypeError('official business fixture image reader default model must select the controlled vision model')
  }
  if (alternateProvider.id === provider.id) {
    throw new TypeError('official business fixture image reader provider ids must be distinct')
  }
  if (new Set([provider.modelId, visionModel.id, alternateVisionModel.id]).size !== 3) {
    throw new TypeError('official business fixture image reader model ids must be distinct')
  }

  const catalog = object(root.catalog, CATALOG_KEYS, 'official business fixture.catalog')
  const baseModel = object(catalog.baseModel, BASE_MODEL_KEYS, 'official business fixture.catalog.baseModel')
  nonEmptyString(baseModel.id, 'official business fixture.catalog.baseModel.id', /^[1-9][0-9]{0,19}$/u)
  nonEmptyString(baseModel.name, 'official business fixture.catalog.baseModel.name')
  const template = object(catalog.template, TEMPLATE_KEYS, 'official business fixture.catalog.template')
  positiveInteger(template.baseModelId, 'official business fixture.catalog.template.baseModelId')
  if (template.modelId !== null || template.loraId !== null) throw new TypeError('official business fixture.catalog template modelId and loraId must be null')
  for (const key of ['titlePrefix', 'templateType', 'detailText']) nonEmptyString(template[key], `official business fixture.catalog.template.${key}`)
  const images = object(catalog.images, IMAGES_KEYS, 'official business fixture.catalog.images')
  for (const [name, dimensions] of Object.entries(images)) {
    const image = object(dimensions, IMAGE_KEYS, `official business fixture.catalog.images.${name}`)
    positiveInteger(image.width, `official business fixture.catalog.images.${name}.width`)
    positiveInteger(image.height, `official business fixture.catalog.images.${name}.height`)
  }
  positiveInteger(catalog.totalTemplates, 'official business fixture.catalog.totalTemplates')

  const skills = object(root.skills, SKILLS_KEYS, 'official business fixture.skills')
  for (const key of ['workspaceName', 'uniqueWorkspaceName', 'userName']) {
    nonEmptyString(skills[key], `official business fixture.skills.${key}`, /^[a-z0-9-]+$/u)
  }
  for (const key of ['workspaceDescription', 'uniqueWorkspaceDescription', 'userDescription', 'markerRequest']) {
    nonEmptyString(skills[key], `official business fixture.skills.${key}`)
  }
  for (const key of ['workspaceMarker', 'userMarker']) {
    nonEmptyString(skills[key], `official business fixture.skills.${key}`, /^[A-Z][A-Z0-9_]+$/u)
  }
  if (new Set([skills.workspaceName, skills.uniqueWorkspaceName, skills.userName]).size !== 3) {
    throw new TypeError('official business fixture Skill names must be unique')
  }
  if (!skills.markerRequest.includes(skills.uniqueWorkspaceName)
    || !skills.markerRequest.includes(skills.userName)) {
    throw new TypeError('official business fixture markerRequest must name both scoped Skills')
  }
  if (skills.workspaceMarker === skills.userMarker
    || [skills.workspaceName, skills.workspaceDescription, skills.uniqueWorkspaceName,
      skills.uniqueWorkspaceDescription, skills.userName, skills.userDescription, skills.markerRequest]
      .some(value => value.includes(skills.workspaceMarker) || value.includes(skills.userMarker))) {
    throw new TypeError('official business fixture Skill markers must be unique and absent from metadata and the marker request')
  }

  const sessions = object(root.sessions, SESSIONS_KEYS, 'official business fixture.sessions')
  for (const key of SESSIONS_KEYS) nonEmptyString(sessions[key], `official business fixture.sessions.${key}`)
  if (new Set([sessions.primaryTitle, sessions.switchTitle, sessions.skillMarkerTitle]).size !== 3) {
    throw new TypeError('official business fixture session titles must be unique')
  }
  const generation = object(root.generation, GENERATION_KEYS, 'official business fixture.generation')
  for (const key of ['triggerPrompt', 'sessionTitle', 'runTitle', 'templateTitle', 'positivePrompt', 'filename', 'subfolder', 'outputNodeId']) {
    nonEmptyString(generation[key], `official business fixture.generation.${key}`)
  }
  for (const key of ['instanceId', 'templateId']) {
    nonEmptyString(generation[key], `official business fixture.generation.${key}`, /^[1-9][0-9]{0,19}$/u)
  }
  if (/[/\\]/u.test(generation.filename) || generation.filename.includes('..')
    || generation.subfolder.startsWith('/') || generation.subfolder.includes('\\') || generation.subfolder.includes('..')) {
    throw new TypeError('official business fixture.generation output path is invalid')
  }
  positiveInteger(generation.seed, 'official business fixture.generation.seed')
  if (generation.seed > 999_999_999_999_999) {
    throw new TypeError('official business fixture.generation.seed must not exceed its object_info maximum')
  }
  if (new Set([sessions.primaryTitle, sessions.switchTitle, sessions.skillMarkerTitle, generation.sessionTitle]).size !== 4) {
    throw new TypeError('official business fixture session titles must be unique')
  }
  const objectInfo = object(generation.objectInfo, Object.keys(generation.objectInfo ?? {}), 'official business fixture.generation.objectInfo')
  parseWorkflow(generation.workflow, objectInfo)
  if (!generation.workflow.nodes.some(node => String(node.id) === generation.outputNodeId
    && objectInfo[node.type]?.output_node === true)) {
    throw new TypeError('official business fixture.generation.outputNodeId must identify an output node')
  }
  return root
}
