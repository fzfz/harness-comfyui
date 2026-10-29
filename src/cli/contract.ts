import help from '../../config/managed-cli-help.json' with { type: 'json' }
import managedCliEnvironment from '../../config/managed-cli-environment.json' with { type: 'json' }
import { parseManagedCliEnvironment } from '../../config/managed-cli-environment-schema.ts'
import { parseCatalogStableId } from '../catalog/contract.ts'
import Schema from '@deepseek-ai/schemastery'
import {
  cliFilePathSchema, cliGenerationRequestSchema, cliInputSchemas, cliInspectionIdSchema,
  cliLoraSchema, cliModelSchema, cliRunIdsSchema, cliSeedCountSchema,
  cliSubmissionItemSchema, cliTextSchema, CLI_JSON_CONTRACT,
} from './input-schema.ts'
import { cliParameterFiles, registerCliRequestId } from './submission-fields.ts'
import { fieldIsRequired } from '../shared/field-contract.ts'
import { isLoraWeight, loraTriggerWordsAreUnique } from '../generation/lora-contract.ts'
import { parseJsonValue } from '../shared/json-contract.ts'
import type { GenerationRequest, JsonValue } from '../host/generation/generation-runtime.ts'

import { GENERATION_MAX_SUBMISSION_ITEMS } from './limits.ts'
import { isGenerationRequestId } from '../generation/submission-contract.ts'
export const CLI_ROUTE_PATH = '/api/harness-comfyui/cli/v1'
export { CLI_MAX_BODY_BYTES } from './limits.ts'
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

export interface CliGenerationSubmissionItem {
  readonly request_id: string
  readonly request: CliGenerationRequest
}

export interface CliGenerationManifestItem extends CliGenerationSubmissionItem {
  readonly parameter_files?: Readonly<Record<string, string>>
}
export type CliRequest =
  | { readonly command: 'generation.submit'; readonly items: readonly CliGenerationSubmissionItem[] }
  | {
    readonly command: 'generation.inspect-template-parameters'
    readonly template_id: string
    readonly instance_id: string
  }
  | { readonly command: 'generation.random-seeds'; readonly count: number }
  | { readonly command: 'generation.run-inputs'; readonly run_ids: readonly string[] }
  | { readonly command: 'generation.wait'; readonly run_ids: readonly string[] }
  | { readonly command: 'generation.resolve-media'; readonly run_ids: readonly string[]; readonly include_parameters: boolean }
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

function inputKeys(source: Record<string, unknown>, command: keyof typeof cliInputSchemas, includeCommand = false): readonly string[] {
  const properties = cliInputSchemas[command].dict!
  const keys = Object.keys(properties).filter(key => fieldIsRequired(properties[key]!) || Object.hasOwn(source, key))
  return includeCommand ? ['command', ...keys] : keys
}

function text(value: unknown, label: string, maxLength = cliTextSchema.meta.max!): string {
  try { return Schema.resolve(value, Schema(cliTextSchema).max(maxLength), {})[0] as string }
  catch { throw new TypeError(`${label} is invalid`) }
}

function runIds(value: unknown): readonly string[] {
  if (
    !Array.isArray(value)
    || value.length < cliRunIdsSchema.meta.min!
    || value.length > cliRunIdsSchema.meta.max!
    || value.some(runId => typeof runId !== 'string')
  ) {
    throw new TypeError(`CLI request run_ids must contain between 1 and ${cliRunIdsSchema.meta.max} strings`)
  }
  return Object.freeze([...value])
}

function generationInspectionId(value: unknown, name: 'template_id' | 'instance_id'): string {
  try { return Schema.resolve(value, cliInspectionIdSchema, {})[0] as string }
  catch { throw new TypeError(`CLI request ${name} is invalid`) }
}

function randomSeedCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < cliSeedCountSchema.meta.min! || (value as number) > cliSeedCountSchema.meta.max!) {
    throw new TypeError(`CLI request count must be an integer between ${cliSeedCountSchema.meta.min} and ${cliSeedCountSchema.meta.max}`)
  }
  return value as number
}

function generationModel(value: unknown): CliGenerationModel | null {
  if (value === null) return null
  const source = record(value, 'Generation model')
  exactKeys(source, Object.keys(cliModelSchema.dict!), 'Generation model')
  return Object.freeze({
    id: parseCatalogStableId(source.id),
    file_name: text(source.file_name, 'Generation model file_name'),
  })
}

function generationLora(value: unknown, index: number): CliGenerationLora {
  const label = `Generation LoRA ${index}`
  const source = record(value, label)
  exactKeys(source, Object.keys(cliLoraSchema.dict!), label)
  if (!isLoraWeight(source.weight)) {
    throw new TypeError(`${label} weight is invalid`)
  }
  if (!Array.isArray(source.trigger_words) || source.trigger_words.length > cliLoraSchema.dict!.trigger_words!.inner!.meta.max!) {
    throw new TypeError(`${label} trigger_words is invalid`)
  }
  const triggerWords = source.trigger_words.map((word, wordIndex) => text(
    word,
    `${label} trigger_words[${wordIndex}]`,
  ))
  if (!loraTriggerWordsAreUnique(triggerWords)) {
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
  exactKeys(source, Object.keys(cliGenerationRequestSchema.dict!), 'Generation request')
  const parameters = parseJsonValue(source.parameters, CLI_JSON_CONTRACT, 'Generation request parameters')
  if (parameters === null || Array.isArray(parameters) || typeof parameters !== 'object') {
    throw new TypeError('Generation request parameters must be an object')
  }
  if (!Array.isArray(source.loras) || source.loras.length > cliGenerationRequestSchema.dict!.loras!.meta.max!) {
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

function generationSubmissionItems(value: unknown, allowFiles: boolean): readonly CliGenerationManifestItem[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > cliInputSchemas['generation submit'].dict!.items!.inner!.meta.max!) {
    throw new TypeError(`Generation items must contain between 1 and ${GENERATION_MAX_SUBMISSION_ITEMS} requests`)
  }
  const requestIds = new Set<string>()
  return Object.freeze(value.map((item, index) => {
    const label = `Generation items[${index}]`
    const source = record(item, label)
    const hasFiles = allowFiles && Object.hasOwn(source, 'parameter_files')
    exactKeys(source, hasFiles ? [...Object.keys(cliSubmissionItemSchema.dict!), 'parameter_files'] : Object.keys(cliSubmissionItemSchema.dict!), label)
    if (!isGenerationRequestId(source.request_id)) throw new TypeError(`${label} request_id must be a UUID`)
    const requestId = registerCliRequestId(requestIds, source.request_id, label)
    const request = parseCliGenerationRequest(source.request)
    if (!hasFiles) return Object.freeze({ request_id: requestId, request })
    const files = cliParameterFiles(source.parameter_files, request.parameters, label)
    const entries = Object.entries(files).map(([parameter, path]) => {
      return [parameter, text(path, `${label} parameter ${parameter} file path`, cliFilePathSchema.meta.max!)] as const
    })
    return Object.freeze({ request_id: requestId, request, parameter_files: Object.freeze(Object.fromEntries(entries)) })
  }))
}

export function parseCliGenerationManifest(value: unknown): readonly CliGenerationManifestItem[] {
  const source = record(value, 'Generation manifest')
  exactKeys(source, inputKeys(source, 'generation submit'), 'Generation manifest')
  return generationSubmissionItems(source.items, true)
}

export function parseCliRequest(value: unknown): CliRequest {
  const source = record(value, 'CLI request')
  if (typeof source.command !== 'string') throw new TypeError('CLI request command is invalid')
  if (source.command === 'generation.submit') {
    exactKeys(source, inputKeys(source, 'generation submit', true), 'CLI request')
    return Object.freeze({ command: source.command, items: generationSubmissionItems(source.items, false) })
  }
  if (source.command === 'generation.inspect-template-parameters') {
    exactKeys(source, inputKeys(source, 'generation inspect-template-parameters', true), 'CLI request')
    return Object.freeze({
      command: source.command,
      template_id: generationInspectionId(source.template_id, 'template_id'),
      instance_id: generationInspectionId(source.instance_id, 'instance_id'),
    })
  }
  if (source.command === 'generation.random-seeds') {
    exactKeys(source, inputKeys(source, 'generation random-seeds', true), 'CLI request')
    return Object.freeze({ command: source.command, count: randomSeedCount(source.count) })
  }
  if (source.command === 'generation.resolve-media') {
    const hasParameters = Object.hasOwn(source, 'include_parameters')
    exactKeys(source, inputKeys(source, 'generation resolve-media', true), 'CLI request')
    if (hasParameters && typeof source.include_parameters !== 'boolean') throw new TypeError('CLI request include_parameters must be a boolean')
    return Object.freeze({ command: source.command, run_ids: runIds(source.run_ids), include_parameters: Schema.resolve(source.include_parameters, cliInputSchemas['generation resolve-media'].dict!.include_parameters!, {})[0] as boolean })
  }
  if (source.command === 'generation.run-inputs' || source.command === 'generation.wait') {
    exactKeys(source, inputKeys(source, source.command.replaceAll('.', ' ') as 'generation run-inputs' | 'generation wait', true), 'CLI request')
    return Object.freeze({ command: source.command, run_ids: runIds(source.run_ids) })
  }
  if (source.command === 'image.inspect') {
    const hasPrompt = Object.hasOwn(source, 'prompt')
    exactKeys(source, inputKeys(source, 'image inspect', true), 'CLI request')
    if (hasPrompt && typeof source.prompt !== 'string') throw new TypeError('CLI request prompt must be a string')
    return Object.freeze({
      command: source.command,
      file_path: text(source.file_path, 'CLI request file_path', cliFilePathSchema.meta.max!),
      ...(hasPrompt ? { prompt: source.prompt as string } : {}),
    })
  }
  throw new TypeError('CLI request command is invalid')
}

export function parseCliArguments(argv: readonly string[], stdin: string): CliRequest {
  const prefix = argv.slice(0, 3).join(' ')
  if (argv.length === 3 && (prefix === 'generation run-inputs --stdin' || prefix === 'generation wait --stdin')) {
    let request: unknown
    try {
      request = JSON.parse(stdin) as unknown
    } catch {
      throw new TypeError('Generation Run stdin must contain one JSON object')
    }
    const source = record(request, 'Generation Run stdin')
    const command = argv[1] === 'wait' ? 'generation.wait' : 'generation.run-inputs'
    exactKeys(source, inputKeys(source, command.replaceAll('.', ' ') as 'generation run-inputs' | 'generation wait'), 'Generation Run stdin')
    return parseCliRequest({ command, run_ids: source.run_ids })
  }
  if (argv.length === 3 && prefix === 'generation inspect-template-parameters --stdin') {
    let request: unknown
    try {
      request = JSON.parse(stdin) as unknown
    } catch {
      throw new TypeError('Generation template parameter inspection stdin must contain one JSON object')
    }
    const source = record(request, 'Generation template parameter inspection stdin')
    exactKeys(source, inputKeys(source, 'generation inspect-template-parameters'), 'Generation template parameter inspection stdin')
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
    exactKeys(source, inputKeys(source, 'generation random-seeds'), 'Generation random Seed stdin')
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
    exactKeys(source, inputKeys(source, 'generation resolve-media'), 'Generation media resolution stdin')
    return parseCliRequest({ ...source, command: 'generation.resolve-media' })
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
    exactKeys(source, inputKeys(source, 'image inspect'), 'Image inspection stdin')
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
