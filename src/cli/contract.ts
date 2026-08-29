import {
  parseCatalogPageNumber,
  parseCatalogQueryText,
  parseCatalogStableId,
  type CatalogKind,
} from '../catalog/contract.ts'
import type { GenerationRequest, JsonValue } from '../host/generation/generation-runtime.ts'

export const CLI_ROUTE_PATH = '/api/harness-comfyui/cli/v1'
export const CLI_MAX_BODY_BYTES = 1_048_576
export const CLI_ENVIRONMENT_NAMES = Object.freeze({
  executable: 'DSH_HARNESS_COMFYUI_CLI',
  api: 'DSH_HARNESS_COMFYUI_CLI_API',
  capability: 'DSH_HARNESS_COMFYUI_CLI_CAPABILITY',
} as const)

const CATALOG_KINDS = new Set<CatalogKind>([
  'model',
  'lora',
  'work',
  'character',
  'style',
  'prompt-term',
  'artist-string',
  'comfyui-template',
])

type CatalogResolveCommand =
  | { readonly command: 'catalog.template.resolve'; readonly id: string }
  | { readonly command: 'catalog.generation-model.resolve'; readonly id: string }
  | { readonly command: 'catalog.lora.resolve'; readonly id: string }

export interface CliCatalogSearchRequest {
  readonly command: 'catalog.search'
  readonly kind: CatalogKind
  readonly query: string
  readonly page: number
  readonly base_model_id: string | null
}

export interface CliGenerationModel {
  readonly id: string
  readonly file_name: string
}

export interface CliGenerationLora {
  readonly id: string
  readonly file_name: string
  readonly weight: number
  readonly trigger_words: readonly string[]
}

export interface CliGenerationRequest {
  readonly title: string
  readonly instance_id: string
  readonly template_id: string
  readonly model: CliGenerationModel | null
  readonly parameters: Readonly<Record<string, JsonValue>>
  readonly loras: readonly CliGenerationLora[]
}

export type CliRequest =
  | CatalogResolveCommand
  | CliCatalogSearchRequest
  | { readonly command: 'catalog.instance.list' }
  | { readonly command: 'generation.submit'; readonly request: CliGenerationRequest }

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} has invalid properties`)
  }
}

function text(value: unknown, label: string, maxLength = 500): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new TypeError(`${label} is invalid`)
  }
  return value
}

function jsonValue(value: unknown, label: string, depth = 0): JsonValue {
  if (depth > 64) throw new TypeError(`${label} exceeds the maximum JSON depth`)
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} contains an invalid number`)
    return value
  }
  if (Array.isArray(value)) return Object.freeze(value.map((item, index) => jsonValue(item, `${label}[${index}]`, depth + 1)))
  const source = record(value, label)
  const entries = Object.entries(source).map(([key, item]) => [
    text(key, `${label} key`),
    jsonValue(item, `${label}.${key}`, depth + 1),
  ] as const)
  return Object.freeze(Object.fromEntries(entries))
}

function generationModel(value: unknown): CliGenerationModel | null {
  if (value === null) return null
  const source = record(value, 'Generation model')
  exactKeys(source, ['id', 'file_name'], 'Generation model')
  return Object.freeze({
    id: parseCatalogStableId(source.id),
    file_name: text(source.file_name, 'Generation model file_name'),
  })
}

function generationLora(value: unknown, index: number): CliGenerationLora {
  const label = `Generation LoRA ${index}`
  const source = record(value, label)
  exactKeys(source, ['id', 'file_name', 'weight', 'trigger_words'], label)
  if (typeof source.weight !== 'number' || !Number.isFinite(source.weight)) {
    throw new TypeError(`${label} weight is invalid`)
  }
  if (!Array.isArray(source.trigger_words) || source.trigger_words.length > 100) {
    throw new TypeError(`${label} trigger_words is invalid`)
  }
  const triggerWords = source.trigger_words.map((word, wordIndex) => text(
    word,
    `${label} trigger_words[${wordIndex}]`,
  ))
  if (new Set(triggerWords).size !== triggerWords.length) {
    throw new TypeError(`${label} trigger_words contains duplicates`)
  }
  return Object.freeze({
    id: parseCatalogStableId(source.id),
    file_name: text(source.file_name, `${label} file_name`),
    weight: source.weight,
    trigger_words: Object.freeze(triggerWords),
  })
}

export function parseCliGenerationRequest(value: unknown): CliGenerationRequest {
  const source = record(value, 'Generation request')
  exactKeys(source, ['title', 'instance_id', 'template_id', 'model', 'parameters', 'loras'], 'Generation request')
  const parameters = jsonValue(source.parameters, 'Generation request parameters')
  if (parameters === null || Array.isArray(parameters) || typeof parameters !== 'object') {
    throw new TypeError('Generation request parameters must be an object')
  }
  if (!Array.isArray(source.loras) || source.loras.length > 100) {
    throw new TypeError('Generation request loras is invalid')
  }
  return Object.freeze({
    title: text(source.title, 'Generation request title'),
    instance_id: parseCatalogStableId(source.instance_id),
    template_id: parseCatalogStableId(source.template_id),
    model: generationModel(source.model),
    parameters: parameters as Readonly<Record<string, JsonValue>>,
    loras: Object.freeze(source.loras.map(generationLora)),
  })
}

function catalogKind(value: unknown): CatalogKind {
  if (typeof value !== 'string' || !CATALOG_KINDS.has(value as CatalogKind)) {
    throw new TypeError('Catalog search kind is invalid')
  }
  return value as CatalogKind
}

export function parseCliRequest(value: unknown): CliRequest {
  const source = record(value, 'CLI request')
  if (typeof source.command !== 'string') throw new TypeError('CLI request command is invalid')
  if (source.command === 'catalog.instance.list') {
    exactKeys(source, ['command'], 'CLI request')
    return Object.freeze({ command: source.command })
  }
  if (
    source.command === 'catalog.template.resolve'
    || source.command === 'catalog.generation-model.resolve'
    || source.command === 'catalog.lora.resolve'
  ) {
    exactKeys(source, ['command', 'id'], 'CLI request')
    return Object.freeze({ command: source.command, id: parseCatalogStableId(source.id) })
  }
  if (source.command === 'catalog.search') {
    exactKeys(source, ['command', 'kind', 'query', 'page', 'base_model_id'], 'CLI request')
    return Object.freeze({
      command: source.command,
      kind: catalogKind(source.kind),
      query: parseCatalogQueryText(source.query),
      page: parseCatalogPageNumber(source.page),
      base_model_id: source.base_model_id === null ? null : parseCatalogStableId(source.base_model_id),
    })
  }
  if (source.command === 'generation.submit') {
    exactKeys(source, ['command', 'request'], 'CLI request')
    return Object.freeze({ command: source.command, request: parseCliGenerationRequest(source.request) })
  }
  throw new TypeError('CLI request command is invalid')
}

function optionMap(argv: readonly string[], allowed: readonly string[]): Map<string, string> {
  if (argv.length % 2 !== 0) throw new TypeError('CLI command options are invalid')
  const options = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]!
    const value = argv[index + 1]!
    if (!allowed.includes(name) || options.has(name)) throw new TypeError('CLI command options are invalid')
    options.set(name, value)
  }
  return options
}

function requiredOption(options: ReadonlyMap<string, string>, name: string): string {
  const value = options.get(name)
  if (value === undefined) throw new TypeError(`CLI command requires ${name}`)
  return value
}

export function parseCliArguments(argv: readonly string[], stdin: string): CliRequest {
  const prefix = argv.slice(0, 3).join(' ')
  if (
    prefix === 'catalog template resolve'
    || prefix === 'catalog generation-model resolve'
    || prefix === 'catalog lora resolve'
  ) {
    const options = optionMap(argv.slice(3), ['--id'])
    const command = {
      'catalog template resolve': 'catalog.template.resolve',
      'catalog generation-model resolve': 'catalog.generation-model.resolve',
      'catalog lora resolve': 'catalog.lora.resolve',
    }[prefix]!
    return parseCliRequest({ command, id: requiredOption(options, '--id') })
  }
  if (prefix === 'catalog instance list' && argv.length === 3) {
    return Object.freeze({ command: 'catalog.instance.list' })
  }
  if (argv[0] === 'catalog' && argv[1] === 'search') {
    const options = optionMap(argv.slice(2), ['--kind', '--query', '--page', '--base-model-id'])
    return parseCliRequest({
      command: 'catalog.search',
      kind: requiredOption(options, '--kind'),
      query: requiredOption(options, '--query'),
      page: Number(requiredOption(options, '--page')),
      base_model_id: options.get('--base-model-id') ?? null,
    })
  }
  if (argv.length === 3 && prefix === 'generation submit --stdin') {
    let request: unknown
    try {
      request = JSON.parse(stdin) as unknown
    } catch {
      throw new TypeError('Generation stdin must contain one JSON object')
    }
    return parseCliRequest({ command: 'generation.submit', request })
  }
  throw new TypeError('CLI command is invalid')
}

export function toGenerationRequest(request: CliGenerationRequest): GenerationRequest {
  return Object.freeze({
    title: request.title,
    instanceId: request.instance_id,
    templateId: request.template_id,
    model: request.model === null ? null : Object.freeze({
      id: request.model.id,
      fileName: request.model.file_name,
    }),
    parameters: request.parameters,
    loras: Object.freeze(request.loras.map(lora => Object.freeze({
      id: lora.id,
      fileName: lora.file_name,
      weight: lora.weight,
      triggerWords: lora.trigger_words,
    }))),
  })
}
