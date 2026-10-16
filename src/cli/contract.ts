import help from '../../config/managed-cli-help.json' with { type: 'json' }
import managedCliEnvironment from '../../config/managed-cli-environment.json' with { type: 'json' }
import { parseManagedCliEnvironment } from '../../config/managed-cli-environment-schema.ts'
import { parseCatalogStableId } from '../catalog/contract.ts'
import { MAX_RUN_INPUT_QUERY_IDS } from '../generation/run-input-contract.ts'
import type { GenerationRequest, JsonValue } from '../host/generation/generation-runtime.ts'

export const CLI_ROUTE_PATH = '/api/harness-comfyui/cli/v1'
export const CLI_MAX_BODY_BYTES = 1_048_576
export const CLI_ENVIRONMENT_NAMES = Object.freeze(parseManagedCliEnvironment(managedCliEnvironment).environmentNames)

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
  | { readonly command: 'generation.submit'; readonly request: CliGenerationRequest }
  | {
    readonly command: 'generation.inspect-template-parameters'
    readonly template_id: string
    readonly instance_id: string
  }
  | { readonly command: 'generation.random-seeds'; readonly count: number }
  | { readonly command: 'generation.run-inputs'; readonly run_ids: readonly string[] }
  | { readonly command: 'generation.resolve-media'; readonly run_ids: readonly string[] }
  | { readonly command: 'image.inspect'; readonly file_path: string; readonly prompt?: string }

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
    throw new TypeError(help.messages.invalidProperties.replaceAll('{label}', label).replaceAll('{expected}', wanted.join(', ')).replaceAll('{actual}', keys.join(', ')))
  }
}

function text(value: unknown, label: string, maxLength = 500): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new TypeError(`${label} is invalid`)
  }
  return value
}

function runIds(value: unknown): readonly string[] {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.length > MAX_RUN_INPUT_QUERY_IDS
    || value.some(runId => typeof runId !== 'string')
  ) {
    throw new TypeError(`CLI request run_ids must contain between 1 and ${MAX_RUN_INPUT_QUERY_IDS} strings`)
  }
  return Object.freeze([...value])
}

function generationInspectionId(value: unknown, name: 'template_id' | 'instance_id'): string {
  const result = text(value, `CLI request ${name}`)
  if (result.trim().length === 0) throw new TypeError(`CLI request ${name} is invalid`)
  return result
}

function randomSeedCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 20) {
    throw new TypeError('CLI request count must be an integer between 1 and 20')
  }
  return value as number
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

export function parseCliRequest(value: unknown): CliRequest {
  const source = record(value, 'CLI request')
  if (typeof source.command !== 'string') throw new TypeError('CLI request command is invalid')
  if (source.command === 'generation.submit') {
    exactKeys(source, ['command', 'request'], 'CLI request')
    return Object.freeze({ command: source.command, request: parseCliGenerationRequest(source.request) })
  }
  if (source.command === 'generation.inspect-template-parameters') {
    exactKeys(source, ['command', 'template_id', 'instance_id'], 'CLI request')
    return Object.freeze({
      command: source.command,
      template_id: generationInspectionId(source.template_id, 'template_id'),
      instance_id: generationInspectionId(source.instance_id, 'instance_id'),
    })
  }
  if (source.command === 'generation.random-seeds') {
    exactKeys(source, ['command', 'count'], 'CLI request')
    return Object.freeze({ command: source.command, count: randomSeedCount(source.count) })
  }
  if (source.command === 'generation.run-inputs' || source.command === 'generation.resolve-media') {
    exactKeys(source, ['command', 'run_ids'], 'CLI request')
    return Object.freeze({ command: source.command, run_ids: runIds(source.run_ids) })
  }
  if (source.command === 'image.inspect') {
    const hasPrompt = Object.hasOwn(source, 'prompt')
    exactKeys(source, hasPrompt ? ['command', 'file_path', 'prompt'] : ['command', 'file_path'], 'CLI request')
    if (hasPrompt && typeof source.prompt !== 'string') throw new TypeError('CLI request prompt must be a string')
    return Object.freeze({
      command: source.command,
      file_path: text(source.file_path, 'CLI request file_path', 10_000),
      ...(hasPrompt ? { prompt: source.prompt as string } : {}),
    })
  }
  throw new TypeError('CLI request command is invalid')
}

export function parseCliArguments(argv: readonly string[], stdin: string): CliRequest {
  const prefix = argv.slice(0, 3).join(' ')
  if (argv.length === 3 && prefix === 'generation submit --stdin') {
    let request: unknown
    try {
      request = JSON.parse(stdin) as unknown
    } catch {
      throw new TypeError('Generation stdin must contain one JSON object')
    }
    return parseCliRequest({ command: 'generation.submit', request })
  }
  if (argv.length === 3 && prefix === 'generation run-inputs --stdin') {
    let request: unknown
    try {
      request = JSON.parse(stdin) as unknown
    } catch {
      throw new TypeError('Generation Run stdin must contain one JSON object')
    }
    const source = record(request, 'Generation Run stdin')
    exactKeys(source, ['run_ids'], 'Generation Run stdin')
    return parseCliRequest({ command: 'generation.run-inputs', run_ids: source.run_ids })
  }
  if (argv.length === 3 && prefix === 'generation inspect-template-parameters --stdin') {
    let request: unknown
    try {
      request = JSON.parse(stdin) as unknown
    } catch {
      throw new TypeError('Generation template parameter inspection stdin must contain one JSON object')
    }
    const source = record(request, 'Generation template parameter inspection stdin')
    exactKeys(source, ['template_id', 'instance_id'], 'Generation template parameter inspection stdin')
    return parseCliRequest({
      command: 'generation.inspect-template-parameters',
      template_id: source.template_id,
      instance_id: source.instance_id,
    })
  }
  if (argv.length === 3 && prefix === 'generation random-seeds --stdin') {
    let request: unknown
    try {
      request = JSON.parse(stdin) as unknown
    } catch {
      throw new TypeError('Generation random Seed stdin must contain one JSON object')
    }
    const source = record(request, 'Generation random Seed stdin')
    exactKeys(source, ['count'], 'Generation random Seed stdin')
    return parseCliRequest({ command: 'generation.random-seeds', count: source.count })
  }
  if (argv.length === 3 && prefix === 'generation resolve-media --stdin') {
    let request: unknown
    try {
      request = JSON.parse(stdin) as unknown
    } catch {
      throw new TypeError('Generation media resolution stdin must contain one JSON object')
    }
    const source = record(request, 'Generation media resolution stdin')
    exactKeys(source, ['run_ids'], 'Generation media resolution stdin')
    return parseCliRequest({ command: 'generation.resolve-media', run_ids: source.run_ids })
  }
  if (argv.length === 3 && prefix === 'image inspect --stdin') {
    let request: unknown
    try {
      request = JSON.parse(stdin) as unknown
    } catch {
      throw new TypeError('Image inspection stdin must contain one JSON object')
    }
    const source = record(request, 'Image inspection stdin')
    if (!Object.hasOwn(source, 'file_path')) throw new TypeError('Image inspection stdin requires file_path')
    const hasPrompt = Object.hasOwn(source, 'prompt')
    exactKeys(source, hasPrompt ? ['file_path', 'prompt'] : ['file_path'], 'Image inspection stdin')
    return parseCliRequest({
      command: 'image.inspect',
      file_path: source.file_path,
      ...(hasPrompt ? { prompt: source.prompt } : {}),
    })
  }
  throw new TypeError(help.messages.invalidCommand.replace('{argv}', JSON.stringify(argv)))
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
