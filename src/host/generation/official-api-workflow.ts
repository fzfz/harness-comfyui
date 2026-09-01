import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { GenerationRuntimeError, type ComfyConnection, type JsonValue } from './generation-runtime.ts'
import type { UiWorkflow } from './source-preparer.ts'

export const OFFICIAL_API_WORKFLOW_COMPILER_SCHEMA_VERSION = 2

type JsonObject = Readonly<Record<string, JsonValue>>
type MutableJsonObject = Record<string, JsonValue>

export interface ComfyFrontendExporterInput {
  readonly workflow: UiWorkflow
  readonly connection: ComfyConnection
  readonly signal?: AbortSignal
}

export interface ComfyFrontendExporter {
  exportWorkflow(input: ComfyFrontendExporterInput): Promise<JsonObject>
}

export interface OfficialApiWorkflowIdentitySource {
  readonly instanceId: string
  readonly instanceOrigin: string
  readonly instanceCacheEpoch: string
  readonly templateWorkflow: UiWorkflow
  readonly runtimeProjection: JsonObject
}

export interface OfficialApiWorkflowCacheIdentity {
  readonly instanceId: string
  readonly instanceOrigin: string
  readonly instanceCacheEpoch: string
  readonly compilerSchemaVersion: number
  readonly templateWorkflowHash: string
  readonly executionStructureHash: string
}

export interface OfficialApiWorkflowCacheAddress {
  readonly cacheKey: string
  readonly identity: OfficialApiWorkflowCacheIdentity
}

export interface OfficialApiWorkflowCompileInput {
  readonly instanceId: string
  readonly connection: ComfyConnection
  readonly templateWorkflow: UiWorkflow
  readonly actualWorkflow: UiWorkflow
  readonly runtimeProjection: JsonObject
  readonly signal?: AbortSignal
}

export interface OfficialApiWorkflowCompileResult {
  readonly apiWorkflow: JsonObject
  readonly cacheKey: string
  readonly cacheStatus: 'hit' | 'miss'
}

export interface OfficialApiWorkflowCompilerOptions {
  readonly cacheDirectory: string
  readonly instanceCacheEpoch: string
  readonly frontend: ComfyFrontendExporter
  readonly writeCacheFile?: (path: string, contents: string) => Promise<void>
}

interface CacheItem {
  readonly schemaVersion: number
  readonly cacheKey: string
  readonly identity: OfficialApiWorkflowCacheIdentity
  readonly apiWorkflow: JsonObject
}

interface InFlightExport {
  readonly controller: AbortController
  readonly promise: Promise<JsonObject>
  waiters: number
  settled: boolean
}

function runtimeError(code: string, message: string): never {
  throw new GenerationRuntimeError(code, message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function isConnectionTuple(value: unknown): value is readonly [string | number, number] {
  return Array.isArray(value)
    && value.length === 2
    && (typeof value[0] === 'string' || (typeof value[0] === 'number' && Number.isSafeInteger(value[0])))
    && typeof value[1] === 'number'
    && Number.isSafeInteger(value[1])
    && value[1] >= 0
}

function valueType(value: JsonValue): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function executionStructure(runtimeProjection: JsonObject): JsonObject {
  const structure: MutableJsonObject = {}
  for (const nodeId of Object.keys(runtimeProjection).sort()) {
    const rawNode = runtimeProjection[nodeId]
    if (!isRecord(rawNode) || typeof rawNode.class_type !== 'string' || !isRecord(rawNode.inputs)) {
      runtimeError('COMFYUI_API_WORKFLOW_OVERLAY_FAILED', `Runtime API Workflow node "${nodeId}" is invalid.`)
    }
    const inputs: MutableJsonObject = {}
    for (const inputName of Object.keys(rawNode.inputs).sort()) {
      const inputValue = rawNode.inputs[inputName] as JsonValue
      inputs[inputName] = isConnectionTuple(inputValue)
        ? structuredClone(inputValue)
        : { valueType: valueType(inputValue) }
    }
    structure[nodeId] = { class_type: rawNode.class_type, inputs }
  }
  return structure
}

export function createOfficialApiWorkflowCacheIdentity(
  source: OfficialApiWorkflowIdentitySource,
): OfficialApiWorkflowCacheAddress {
  const identity: OfficialApiWorkflowCacheIdentity = {
    instanceId: source.instanceId,
    instanceOrigin: source.instanceOrigin,
    instanceCacheEpoch: source.instanceCacheEpoch,
    compilerSchemaVersion: OFFICIAL_API_WORKFLOW_COMPILER_SCHEMA_VERSION,
    templateWorkflowHash: sha256(source.templateWorkflow),
    executionStructureHash: sha256(executionStructure(source.runtimeProjection)),
  }
  return Object.freeze({ cacheKey: sha256(identity), identity: Object.freeze(identity) })
}

function apiWorkflow(value: unknown, errorCode: string, label: string): JsonObject {
  if (!isRecord(value) || Object.keys(value).length === 0) runtimeError(errorCode, `${label} is invalid.`)
  for (const [nodeId, rawNode] of Object.entries(value)) {
    if (!isRecord(rawNode) || typeof rawNode.class_type !== 'string' || !isRecord(rawNode.inputs)) {
      runtimeError(errorCode, `${label} node "${nodeId}" is invalid.`)
    }
  }
  return value as JsonObject
}

function officialLiteralCarrier(value: unknown): JsonValue | undefined {
  if (!isRecord(value) || Object.hasOwn(value, 'class_type') || !isRecord(value.inputs)) return undefined
  const nodeKeys = Object.keys(value)
  const inputKeys = Object.keys(value.inputs)
  if (nodeKeys.some(key => key !== 'inputs' && key !== '_meta')
    || inputKeys.length !== 1
    || inputKeys[0] !== 'UNKNOWN') return undefined
  return structuredClone(value.inputs.UNKNOWN as JsonValue)
}

function normalizeOfficialApiWorkflow(value: unknown, errorCode: string, label: string): JsonObject {
  if (!isRecord(value) || Object.keys(value).length === 0) runtimeError(errorCode, `${label} is invalid.`)
  const normalized = structuredClone(value) as MutableJsonObject
  const carriers = new Map<string, JsonValue>()
  for (const [nodeId, rawNode] of Object.entries(value)) {
    const literal = officialLiteralCarrier(rawNode)
    if (literal !== undefined) carriers.set(nodeId, literal)
  }
  if (carriers.size === 0) return apiWorkflow(normalized, errorCode, label)

  const consumedCarriers = new Set<string>()
  for (const [nodeId, rawNode] of Object.entries(normalized)) {
    if (carriers.has(nodeId)
      || !isRecord(rawNode)
      || typeof rawNode.class_type !== 'string'
      || !isRecord(rawNode.inputs)) continue
    for (const [inputName, inputValue] of Object.entries(rawNode.inputs)) {
      if (!isConnectionTuple(inputValue)) continue
      const carrierNodeId = String(inputValue[0])
      const carrier = carriers.get(carrierNodeId)
      if (carrier === undefined) continue
      if (inputValue[1] !== 0) {
        runtimeError(errorCode, `${label} node "${nodeId}" input "${inputName}" references an invalid literal-carrier output.`)
      }
      ;(rawNode.inputs as MutableJsonObject)[inputName] = structuredClone(carrier)
      consumedCarriers.add(carrierNodeId)
    }
  }
  for (const nodeId of consumedCarriers) delete normalized[nodeId]
  return apiWorkflow(normalized, errorCode, label)
}

function sameIdentity(left: unknown, right: OfficialApiWorkflowCacheIdentity): boolean {
  return canonicalJson(left) === canonicalJson(right)
}

function cacheItem(value: unknown, address: OfficialApiWorkflowCacheAddress, path: string): CacheItem {
  if (!isRecord(value)
    || value.schemaVersion !== OFFICIAL_API_WORKFLOW_COMPILER_SCHEMA_VERSION
    || value.cacheKey !== address.cacheKey
    || !sameIdentity(value.identity, address.identity)) {
    runtimeError('COMFYUI_API_WORKFLOW_CACHE_INVALID', `Official API Workflow cache file "${path}" has an invalid identity.`)
  }
  return {
    schemaVersion: OFFICIAL_API_WORKFLOW_COMPILER_SCHEMA_VERSION,
    cacheKey: address.cacheKey,
    identity: address.identity,
    apiWorkflow: apiWorkflow(
      value.apiWorkflow,
      'COMFYUI_API_WORKFLOW_CACHE_INVALID',
      `Official API Workflow cache file "${path}"`,
    ),
  }
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    runtimeError('COMFYUI_REQUEST_CANCELED', 'Official ComfyUI frontend compilation was canceled.')
  }
}

export function overlayRuntimeApiWorkflow(officialBase: JsonObject, runtimeProjection: JsonObject): JsonObject {
  const result = structuredClone(apiWorkflow(
    officialBase,
    'COMFYUI_API_WORKFLOW_OVERLAY_FAILED',
    'Official API Workflow',
  )) as MutableJsonObject
  for (const [nodeId, rawProjectionNode] of Object.entries(runtimeProjection)) {
    if (!isRecord(rawProjectionNode)
      || typeof rawProjectionNode.class_type !== 'string'
      || !isRecord(rawProjectionNode.inputs)) {
      runtimeError('COMFYUI_API_WORKFLOW_OVERLAY_FAILED', `Runtime API Workflow node "${nodeId}" is invalid.`)
    }
    const rawOfficialNode = result[nodeId]
    if (!isRecord(rawOfficialNode)) {
      runtimeError('COMFYUI_API_WORKFLOW_OVERLAY_FAILED', `Official API Workflow does not contain runtime node "${nodeId}".`)
    }
    if (rawOfficialNode.class_type !== rawProjectionNode.class_type) {
      runtimeError('COMFYUI_API_WORKFLOW_OVERLAY_FAILED', `Official API Workflow node "${nodeId}" class_type does not match the runtime projection.`)
    }
    if (!isRecord(rawOfficialNode.inputs)) {
      runtimeError('COMFYUI_API_WORKFLOW_OVERLAY_FAILED', `Official API Workflow node "${nodeId}" inputs are invalid.`)
    }
    const officialInputs = rawOfficialNode.inputs
    for (const [inputName, rawRuntimeValue] of Object.entries(rawProjectionNode.inputs)) {
      const runtimeValue = rawRuntimeValue as JsonValue
      if (!Object.hasOwn(officialInputs, inputName)) {
        runtimeError('COMFYUI_API_WORKFLOW_OVERLAY_FAILED', `Official API Workflow node "${nodeId}" does not contain runtime input "${inputName}".`)
      }
      const officialValue = officialInputs[inputName]
      if (isRecord(officialValue) && Object.hasOwn(officialValue, '__value__')) {
        ;(officialValue as MutableJsonObject).__value__ = structuredClone(runtimeValue)
        continue
      }
      const runtimeConnection = isConnectionTuple(runtimeValue)
      const officialConnection = isConnectionTuple(officialValue)
      if (runtimeConnection || officialConnection) {
        if (!runtimeConnection || !officialConnection) {
          runtimeError('COMFYUI_API_WORKFLOW_OVERLAY_FAILED', `Official API Workflow node "${nodeId}" input "${inputName}" connection structure does not match the runtime projection.`)
        }
        continue
      }
      ;(officialInputs as MutableJsonObject)[inputName] = structuredClone(runtimeValue)
    }
  }
  return result
}

export class OfficialApiWorkflowCompiler {
  private readonly cacheDirectory: string
  private readonly instanceCacheEpoch: string
  private readonly frontend: ComfyFrontendExporter
  private readonly writeCacheFile: NonNullable<OfficialApiWorkflowCompilerOptions['writeCacheFile']>
  private readonly inFlight = new Map<string, InFlightExport>()

  constructor(options: OfficialApiWorkflowCompilerOptions) {
    if (options.cacheDirectory.trim().length === 0) throw new TypeError('Official API Workflow cache directory is invalid.')
    if (options.instanceCacheEpoch.trim().length === 0) throw new TypeError('Official API Workflow instance cache epoch is invalid.')
    this.cacheDirectory = options.cacheDirectory
    this.instanceCacheEpoch = options.instanceCacheEpoch
    this.frontend = options.frontend
    this.writeCacheFile = options.writeCacheFile ?? (async (path, contents) => {
      await writeFile(path, contents, { encoding: 'utf8', flag: 'wx' })
    })
  }

  async compile(input: OfficialApiWorkflowCompileInput): Promise<OfficialApiWorkflowCompileResult> {
    throwIfAborted(input.signal)
    const address = createOfficialApiWorkflowCacheIdentity({
      instanceId: input.instanceId,
      instanceOrigin: input.connection.origin,
      instanceCacheEpoch: this.instanceCacheEpoch,
      templateWorkflow: input.templateWorkflow,
      runtimeProjection: input.runtimeProjection,
    })
    const path = join(this.cacheDirectory, `${address.cacheKey}.json`)
    const existing = await this.read(path, address)
    throwIfAborted(input.signal)
    if (existing !== undefined) {
      return Object.freeze({
        apiWorkflow: overlayRuntimeApiWorkflow(existing, input.runtimeProjection),
        cacheKey: address.cacheKey,
        cacheStatus: 'hit',
      })
    }

    const base = await this.compileMiss(path, address, input)
    return Object.freeze({
      apiWorkflow: overlayRuntimeApiWorkflow(base, input.runtimeProjection),
      cacheKey: address.cacheKey,
      cacheStatus: 'miss',
    })
  }

  private async read(path: string, address: OfficialApiWorkflowCacheAddress): Promise<JsonObject | undefined> {
    let contents: string
    try {
      contents = await readFile(path, 'utf8')
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return undefined
      runtimeError('COMFYUI_API_WORKFLOW_CACHE_IO_FAILED', `Official API Workflow cache file "${path}" could not be read.`)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(contents)
    } catch {
      runtimeError('COMFYUI_API_WORKFLOW_CACHE_INVALID', `Official API Workflow cache file "${path}" contains invalid JSON.`)
    }
    return cacheItem(parsed, address, path).apiWorkflow
  }

  private async compileMiss(
    path: string,
    address: OfficialApiWorkflowCacheAddress,
    input: OfficialApiWorkflowCompileInput,
  ): Promise<JsonObject> {
    let shared = this.inFlight.get(address.cacheKey)
    if (shared?.controller.signal.aborted === true) {
      this.inFlight.delete(address.cacheKey)
      shared = undefined
    }
    if (shared === undefined) {
      const controller = new AbortController()
      shared = {
        controller,
        promise: this.exportAndWrite(path, address, input, controller.signal),
        waiters: 0,
        settled: false,
      }
      this.inFlight.set(address.cacheKey, shared)
      void shared.promise.then(
        () => this.finishInFlight(address.cacheKey, shared!),
        () => this.finishInFlight(address.cacheKey, shared!),
      )
    }
    shared.waiters += 1
    try {
      return await this.waitForSharedExport(shared.promise, input.signal)
    } finally {
      shared.waiters -= 1
      if (shared.waiters === 0 && !shared.settled) shared.controller.abort()
    }
  }

  private finishInFlight(cacheKey: string, shared: InFlightExport): void {
    shared.settled = true
    if (this.inFlight.get(cacheKey) === shared) this.inFlight.delete(cacheKey)
  }

  private async waitForSharedExport(pending: Promise<JsonObject>, signal: AbortSignal | undefined): Promise<JsonObject> {
    if (signal === undefined) return pending
    throwIfAborted(signal)
    let rejectAbort!: () => void
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => reject(new GenerationRuntimeError(
        'COMFYUI_REQUEST_CANCELED',
        'Official ComfyUI frontend compilation was canceled.',
      ))
    })
    signal.addEventListener('abort', rejectAbort, { once: true })
    try {
      return await Promise.race([pending, aborted])
    } finally {
      signal.removeEventListener('abort', rejectAbort)
    }
  }

  private async exportAndWrite(
    path: string,
    address: OfficialApiWorkflowCacheAddress,
    input: OfficialApiWorkflowCompileInput,
    signal: AbortSignal,
  ): Promise<JsonObject> {
    throwIfAborted(signal)
    const exported = normalizeOfficialApiWorkflow(
      await this.frontend.exportWorkflow({
        workflow: input.actualWorkflow,
        connection: input.connection,
        signal,
      }),
      'COMFYUI_FRONTEND_EXPORT_FAILED',
      `Official API Workflow exported by "${input.connection.origin}"`,
    )
    throwIfAborted(signal)
    const item: CacheItem = {
      schemaVersion: OFFICIAL_API_WORKFLOW_COMPILER_SCHEMA_VERSION,
      cacheKey: address.cacheKey,
      identity: address.identity,
      apiWorkflow: exported,
    }
    const temporaryPath = `${path}.${randomUUID()}.tmp`
    try {
      await mkdir(this.cacheDirectory, { recursive: true })
      await this.writeCacheFile(temporaryPath, `${JSON.stringify(item)}\n`)
      throwIfAborted(signal)
      await rename(temporaryPath, path)
    } catch (error) {
      try {
        await rm(temporaryPath, { force: true })
      } catch {
        // Preserve the cache write failure below.
      }
      if (error instanceof GenerationRuntimeError) throw error
      runtimeError('COMFYUI_API_WORKFLOW_CACHE_IO_FAILED', `Official API Workflow cache file "${path}" could not be written atomically.`)
    }
    return exported
  }
}
