import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[]

export interface GenerationLoraSelection {
  readonly id: string
  readonly fileName: string
  readonly weight: number
  readonly triggerWords: readonly string[]
}

export interface GenerationModelSelection {
  readonly id: string
  readonly fileName: string
}

export interface GenerationRequest {
  readonly title: string
  readonly instanceId: string | null
  readonly templateId: string
  readonly model: GenerationModelSelection | null
  readonly parameters: Readonly<Record<string, JsonValue>>
  readonly loras: readonly GenerationLoraSelection[]
}

export interface GenerationIdentity {
  readonly workspaceId: string
  readonly sessionId: string
  readonly turn: number
  readonly callId: string
}

export interface ComfyConnection {
  readonly url: string
  readonly origin: string
  readonly authorization: string | null
}

export interface PreparedGeneration {
  readonly instanceId: string
  readonly instanceTitle: string
  readonly templateTitle: string
  readonly sourceSnapshot: Readonly<Record<string, JsonValue>>
  readonly actualWorkflow: Readonly<Record<string, JsonValue>>
  readonly apiWorkflow: Readonly<Record<string, JsonValue>>
  readonly expectedOutputNodeIds: readonly string[]
  readonly connection: ComfyConnection
}

export interface GenerationPreparationAdapter {
  prepare(request: GenerationRequest, signal?: AbortSignal): Promise<PreparedGeneration>
}

export interface GenerationOutputDescriptor {
  readonly nodeId: string
  readonly outputIndex: number
  readonly mediaKind: 'image' | 'video'
  readonly filename: string
  readonly subfolder: string
  readonly type: 'output'
}

export type GenerationObservation =
  | { readonly status: 'unknown' | 'pending' | 'running'; readonly outputs: readonly [] }
  | { readonly status: 'success'; readonly outputs: readonly GenerationOutputDescriptor[] }
  | { readonly status: 'error'; readonly outputs: readonly []; readonly error: { readonly code: string; readonly message: string } }

export interface GenerationTransport {
  submit(input: {
    readonly instanceId: string
    readonly instanceOrigin: string
    readonly promptId: string
    readonly apiWorkflow: Readonly<Record<string, JsonValue>>
    readonly actualWorkflow: Readonly<Record<string, JsonValue>>
    readonly onRequestStart: () => boolean
    readonly signal?: AbortSignal
  }): Promise<{ readonly promptId: string }>
  observe(input: {
    readonly instanceId: string
    readonly instanceOrigin: string
    readonly promptId: string
    readonly outputNodeIds: readonly string[]
    readonly signal?: AbortSignal
  }): Promise<GenerationObservation>
  download(input: {
    readonly instanceId: string
    readonly instanceOrigin: string
    readonly output: GenerationOutputDescriptor
    readonly signal?: AbortSignal
  }): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }>
}

export type GenerationRunStatus =
  | 'created'
  | 'prepared'
  | 'submitting'
  | 'submission_unknown'
  | 'remote_pending'
  | 'remote_running'
  | 'downloading'
  | 'succeeded'
  | 'failed'
  | 'cancelling'
  | 'cancelled'

export interface GenerationRunSnapshot {
  readonly runId: string
  readonly workspaceId: string
  readonly sessionId: string
  readonly turn: number
  readonly callId: string
  readonly title: string
  readonly instanceId: string | null
  readonly instanceTitle: string | null
  readonly templateId: string
  readonly templateTitle: string | null
  readonly status: GenerationRunStatus
  readonly revision: number
  readonly promptId: string | null
  readonly errorCode: string | null
  readonly errorMessage: string | null
  readonly createdAt: number
  readonly updatedAt: number
}

export interface GenerationRunQuery {
  readonly workspaceId: string
  readonly sessionId: string
  readonly turn?: number
}

export interface GenerationMediaQuery {
  readonly workspaceId: string
  readonly sessionId: string
  readonly turn?: number
  readonly runId?: string
}

export interface GenerationMediaSnapshot {
  readonly mediaId: string
  readonly runId: string
  readonly workspaceId: string
  readonly sessionId: string
  readonly turn: number
  readonly nodeId: string
  readonly outputIndex: number
  readonly mediaKind: 'image' | 'video'
  readonly filename: string
  readonly relativePath: string
  readonly mediaType: string
  readonly byteSize: number
  readonly createdAt: number
}

export interface GenerationRuntimeOptions {
  readonly runRepositoryFile: string
  readonly runDirectory: string
  readonly savedMediaDirectory: string
  readonly preparer: GenerationPreparationAdapter
  readonly transport?: GenerationTransport
  readonly createRunId?: () => string
  readonly createPromptId?: () => string
  readonly createMediaId?: () => string
  readonly now?: () => number
  readonly missingObservationMs?: number
}

interface RunRow {
  run_id: string
  workspace_id: string
  session_id: string
  turn: number
  call_id: string
  title: string
  instance_id: string | null
  instance_title: string | null
  instance_origin: string | null
  template_id: string
  template_title: string | null
  status: GenerationRunStatus
  revision: number
  prompt_id: string | null
  request_json: string
  api_workflow_path: string | null
  actual_workflow_path: string | null
  expected_output_node_ids_json: string | null
  missing_observed_at: number | null
  error_code: string | null
  error_message: string | null
  created_at: number
  updated_at: number
}

interface OutputRow {
  run_id: string
  node_id: string
  output_index: number
  media_kind: 'image' | 'video'
  filename: string
  subfolder: string
  output_type: 'output'
}

interface MediaRow {
  media_id: string
  run_id: string
  workspace_id: string
  session_id: string
  turn: number
  node_id: string
  output_index: number
  media_kind: 'image' | 'video'
  filename: string
  relative_path: string
  media_type: string
  byte_size: number
  created_at: number
}

interface MediaStagingRow extends MediaRow {
  temporary_relative_path: string
}

const SAFE_PATH_ID = /^[A-Za-z0-9_-]{1,128}$/u

function assertPathId(value: string, label: string): void {
  if (!SAFE_PATH_ID.test(value)) throw new TypeError(`${label} is invalid`)
}

function canonicalValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(item => canonicalValue(item))
  if (value !== null && typeof value === 'object') {
    const record = value as Readonly<Record<string, JsonValue>>
    return Object.fromEntries(
      Object.keys(record).sort().map(key => [key, canonicalValue(record[key]!)]),
    )
  }
  return value
}

function canonicalJson(value: JsonValue): string {
  return JSON.stringify(canonicalValue(value))
}

function jsonDocument(value: JsonValue): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function errorFacts(error: unknown): { code: string; message: string } {
  if (error instanceof GenerationRuntimeError) return { code: error.code, message: error.message }
  return { code: 'GENERATION_PREPARATION_FAILED', message: error instanceof Error ? error.message : String(error) }
}

function jsonRecord(document: string, label: string): Readonly<Record<string, JsonValue>> {
  let value: unknown
  try {
    value = JSON.parse(document) as unknown
  } catch {
    throw new GenerationRuntimeError('GENERATION_ARTIFACT_INVALID', `${label} contains invalid JSON.`)
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new GenerationRuntimeError('GENERATION_ARTIFACT_INVALID', `${label} must contain a JSON object.`)
  }
  return value as Readonly<Record<string, JsonValue>>
}

async function readJsonArtifact(path: string, label: string): Promise<Readonly<Record<string, JsonValue>>> {
  let document: string
  try {
    document = await readFile(path, 'utf8')
  } catch (error) {
    const code = error !== null && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    throw new GenerationRuntimeError(
      code === 'ENOENT' ? 'GENERATION_ARTIFACT_NOT_FOUND' : 'GENERATION_ARTIFACT_INVALID',
      `${label} could not be read.`,
    )
  }
  return jsonRecord(document, label)
}

function generationRequest(document: string): GenerationRequest {
  const source = jsonRecord(document, 'Generation request')
  if (
    typeof source.title !== 'string'
    || (source.instanceId !== null && typeof source.instanceId !== 'string')
    || typeof source.templateId !== 'string'
    || source.parameters === null
    || typeof source.parameters !== 'object'
    || Array.isArray(source.parameters)
    || !Array.isArray(source.loras)
  ) {
    throw new GenerationRuntimeError('GENERATION_REQUEST_INVALID', 'The persisted Generation request is invalid.')
  }
  const loras = source.loras.map((value, index): GenerationLoraSelection => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new GenerationRuntimeError('GENERATION_REQUEST_INVALID', `Persisted Generation LoRA ${index} is invalid.`)
    }
    const selection = value as Readonly<Record<string, JsonValue>>
    if (
      typeof selection.id !== 'string'
      || typeof selection.fileName !== 'string'
      || typeof selection.weight !== 'number'
      || !Number.isFinite(selection.weight)
      || !Array.isArray(selection.triggerWords)
      || selection.triggerWords.some(word => typeof word !== 'string')
    ) {
      throw new GenerationRuntimeError('GENERATION_REQUEST_INVALID', `Persisted Generation LoRA ${index} is invalid.`)
    }
    return Object.freeze({
      id: selection.id,
      fileName: selection.fileName,
      weight: selection.weight,
      triggerWords: Object.freeze(selection.triggerWords as string[]),
    })
  })
  let model: GenerationModelSelection | null = null
  if (source.model !== undefined && source.model !== null) {
    if (typeof source.model !== 'object' || Array.isArray(source.model)) {
      throw new GenerationRuntimeError('GENERATION_REQUEST_INVALID', 'The persisted Generation model is invalid.')
    }
    const selection = source.model as Readonly<Record<string, JsonValue>>
    if (typeof selection.id !== 'string' || typeof selection.fileName !== 'string') {
      throw new GenerationRuntimeError('GENERATION_REQUEST_INVALID', 'The persisted Generation model is invalid.')
    }
    model = Object.freeze({ id: selection.id, fileName: selection.fileName })
  }
  return Object.freeze({
    title: source.title,
    instanceId: source.instanceId,
    templateId: source.templateId,
    model,
    parameters: source.parameters as Readonly<Record<string, JsonValue>>,
    loras: Object.freeze(loras),
  })
}

function mediaSnapshot(row: MediaRow): GenerationMediaSnapshot {
  return Object.freeze({
    mediaId: row.media_id,
    runId: row.run_id,
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
    turn: row.turn,
    nodeId: row.node_id,
    outputIndex: row.output_index,
    mediaKind: row.media_kind,
    filename: row.filename,
    relativePath: row.relative_path,
    mediaType: row.media_type,
    byteSize: row.byte_size,
    createdAt: row.created_at,
  })
}

function snapshot(row: RunRow): GenerationRunSnapshot {
  return Object.freeze({
    runId: row.run_id,
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
    turn: row.turn,
    callId: row.call_id,
    title: row.title,
    instanceId: row.instance_id,
    instanceTitle: row.instance_title,
    templateId: row.template_id,
    templateTitle: row.template_title,
    status: row.status,
    revision: row.revision,
    promptId: row.prompt_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export class GenerationRuntimeError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'GenerationRuntimeError'
  }
}

export class GenerationSubmissionNotSentError extends GenerationRuntimeError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'GenerationSubmissionNotSentError'
  }
}

export class GenerationRuntime {
  private readonly options: GenerationRuntimeOptions
  private readonly database: DatabaseSync
  private readonly createRunId: () => string
  private readonly createPromptId: () => string
  private readonly createMediaId: () => string
  private readonly now: () => number
  private readonly missingObservationMs: number
  private readonly preparations = new Map<string, Promise<void>>()
  private advanceInFlight: Promise<void> | undefined

  constructor(options: GenerationRuntimeOptions) {
    this.options = options
    mkdirSync(dirname(options.runRepositoryFile), { recursive: true })
    mkdirSync(options.runDirectory, { recursive: true })
    mkdirSync(options.savedMediaDirectory, { recursive: true })
    this.database = new DatabaseSync(options.runRepositoryFile)
    this.createRunId = options.createRunId ?? (() => `run_${randomUUID()}`)
    this.createPromptId = options.createPromptId ?? randomUUID
    this.createMediaId = options.createMediaId ?? (() => `media_${randomUUID()}`)
    this.now = options.now ?? Date.now
    this.missingObservationMs = options.missingObservationMs ?? 30_000
    if (!Number.isSafeInteger(this.missingObservationMs) || this.missingObservationMs < 0) {
      throw new TypeError('missingObservationMs is invalid')
    }
    this.database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS generation_runs (
        run_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        call_id TEXT NOT NULL,
        title TEXT NOT NULL,
        instance_id TEXT,
        instance_title TEXT,
        instance_origin TEXT,
        template_id TEXT NOT NULL,
        template_title TEXT,
        status TEXT NOT NULL,
        revision INTEGER NOT NULL,
        prompt_id TEXT,
        request_json TEXT NOT NULL,
        source_snapshot_path TEXT,
        actual_workflow_path TEXT,
        api_workflow_path TEXT,
        expected_output_node_ids_json TEXT,
        missing_observed_at INTEGER,
        error_code TEXT,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(workspace_id, session_id, call_id)
      );
      CREATE INDEX IF NOT EXISTS generation_runs_session_turn
        ON generation_runs(workspace_id, session_id, turn, created_at DESC);
      CREATE INDEX IF NOT EXISTS generation_runs_status
        ON generation_runs(status, updated_at);
      CREATE TABLE IF NOT EXISTS generation_run_outputs (
        run_id TEXT NOT NULL REFERENCES generation_runs(run_id) ON DELETE CASCADE,
        node_id TEXT NOT NULL,
        output_index INTEGER NOT NULL,
        media_kind TEXT NOT NULL,
        filename TEXT NOT NULL,
        subfolder TEXT NOT NULL,
        output_type TEXT NOT NULL,
        PRIMARY KEY(run_id, node_id, output_index, media_kind)
      );
      CREATE TABLE IF NOT EXISTS generation_media (
        media_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES generation_runs(run_id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        node_id TEXT NOT NULL,
        output_index INTEGER NOT NULL,
        media_kind TEXT NOT NULL,
        filename TEXT NOT NULL,
        relative_path TEXT NOT NULL UNIQUE,
        media_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(run_id, node_id, output_index, media_kind)
      );
      CREATE INDEX IF NOT EXISTS generation_media_session
        ON generation_media(workspace_id, session_id, turn, created_at DESC);
      CREATE TABLE IF NOT EXISTS generation_media_staging (
        media_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES generation_runs(run_id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        node_id TEXT NOT NULL,
        output_index INTEGER NOT NULL,
        media_kind TEXT NOT NULL,
        filename TEXT NOT NULL,
        relative_path TEXT NOT NULL UNIQUE,
        temporary_relative_path TEXT NOT NULL UNIQUE,
        media_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(run_id, node_id, output_index, media_kind)
      );
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, ${this.now()});
    `)
    const runColumns = this.database.prepare('PRAGMA table_info(generation_runs)').all() as unknown as readonly { name: string }[]
    if (!runColumns.some(column => column.name === 'instance_origin')) {
      this.database.exec('ALTER TABLE generation_runs ADD COLUMN instance_origin TEXT')
    }
    this.database.prepare(`
      UPDATE generation_runs SET status = 'submission_unknown', revision = revision + 1,
        prompt_id = NULL, error_code = 'COMFYUI_SUBMISSION_RESULT_UNKNOWN',
        error_message = 'ComfyUI submission result was not confirmed before the Host stopped.',
        updated_at = ?
      WHERE status = 'submitting'
    `).run(this.now())
    this.recoverStagedMedia()
  }

  async acceptGeneration(
    identity: GenerationIdentity,
    request: GenerationRequest,
    signal?: AbortSignal,
  ): Promise<{ readonly runId: string }> {
    assertPathId(identity.workspaceId, 'workspaceId')
    if (identity.sessionId.trim().length === 0) throw new TypeError('sessionId is invalid')
    if (!Number.isSafeInteger(identity.turn) || identity.turn < 0) throw new TypeError('turn is invalid')
    if (identity.callId.trim().length === 0) throw new TypeError('callId is invalid')
    const requestJson = canonicalJson(request as unknown as JsonValue)
    let row = this.findByCall(identity)
    if (row !== undefined) {
      if (row.request_json !== requestJson) {
        throw new GenerationRuntimeError('RUN_REQUEST_CONFLICT', 'The Tool call was already accepted with a different Generation request.')
      }
      if (row.status === 'failed' && row.actual_workflow_path === null) {
        throw new GenerationRuntimeError(
          row.error_code ?? 'GENERATION_PREPARATION_FAILED',
          row.error_message ?? 'Generation preparation failed.',
        )
      }
      if (row.status === 'created') {
        await this.preparePersistedRequest(row.run_id, row.request_json, signal)
      }
      return Object.freeze({ runId: row.run_id })
    }

    const runId = this.createRunId()
    assertPathId(runId, 'runId')
    const createdAt = this.now()
    this.database.prepare(`
      INSERT INTO generation_runs(
        run_id, workspace_id, session_id, turn, call_id, title, template_id,
        status, revision, request_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'created', 0, ?, ?, ?)
    `).run(
      runId,
      identity.workspaceId,
      identity.sessionId,
      identity.turn,
      identity.callId,
      request.title,
      request.templateId,
      requestJson,
      createdAt,
      createdAt,
    )
    await this.preparePersistedRequest(runId, requestJson, signal)
    return Object.freeze({ runId })
  }

  queryRuns(query: GenerationRunQuery): readonly GenerationRunSnapshot[] {
    const params: Array<string | number> = [query.workspaceId, query.sessionId]
    let sql = 'SELECT rowid, * FROM generation_runs WHERE workspace_id = ? AND session_id = ?'
    if (query.turn !== undefined) {
      sql += ' AND turn = ?'
      params.push(query.turn)
    }
    sql += ' ORDER BY created_at DESC, rowid DESC'
    const rows = this.database.prepare(sql).all(...params) as unknown as RunRow[]
    return Object.freeze(rows.map(snapshot))
  }

  queryRunsForSession(sessionId: string, turn?: number): readonly GenerationRunSnapshot[] {
    const params: Array<string | number> = [sessionId]
    let sql = 'SELECT rowid, * FROM generation_runs WHERE session_id = ?'
    if (turn !== undefined) {
      sql += ' AND turn = ?'
      params.push(turn)
    }
    sql += ' ORDER BY created_at DESC, rowid DESC'
    const rows = this.database.prepare(sql).all(...params) as unknown as RunRow[]
    return Object.freeze(rows.map(snapshot))
  }

  queryMedia(query: GenerationMediaQuery): readonly GenerationMediaSnapshot[] {
    const params: Array<string | number> = [query.workspaceId, query.sessionId]
    let sql = 'SELECT * FROM generation_media WHERE workspace_id = ? AND session_id = ?'
    if (query.turn !== undefined) {
      sql += ' AND turn = ?'
      params.push(query.turn)
    }
    if (query.runId !== undefined) {
      sql += ' AND run_id = ?'
      params.push(query.runId)
    }
    sql += ' ORDER BY created_at DESC, output_index DESC, media_id DESC'
    const rows = this.database.prepare(sql).all(...params) as unknown as MediaRow[]
    return Object.freeze(rows.map(mediaSnapshot))
  }

  queryMediaForSession(sessionId: string, turn?: number): readonly GenerationMediaSnapshot[] {
    const params: Array<string | number> = [sessionId]
    let sql = 'SELECT * FROM generation_media WHERE session_id = ?'
    if (turn !== undefined) {
      sql += ' AND turn = ?'
      params.push(turn)
    }
    sql += ' ORDER BY created_at DESC, output_index DESC, media_id DESC'
    const rows = this.database.prepare(sql).all(...params) as unknown as MediaRow[]
    return Object.freeze(rows.map(mediaSnapshot))
  }

  getMedia(mediaId: string): GenerationMediaSnapshot {
    return mediaSnapshot(this.getMediaRow(mediaId))
  }

  async advance(signal?: AbortSignal): Promise<void> {
    if (this.advanceInFlight !== undefined) return this.advanceInFlight
    const work = this.advanceOnce(signal).finally(() => {
      this.advanceInFlight = undefined
    })
    this.advanceInFlight = work
    return work
  }

  async readActualWorkflow(runId: string): Promise<string> {
    return readFile(this.actualWorkflowPath(runId), 'utf8')
  }

  actualWorkflowPath(runId: string): string {
    const row = this.getRow(runId)
    if (row.actual_workflow_path === null) {
      throw new GenerationRuntimeError('GENERATION_ARTIFACT_NOT_READY', 'The Actual Workflow is not ready.')
    }
    return join(this.options.runDirectory, row.actual_workflow_path)
  }

  mediaContentPath(mediaId: string): string {
    const row = this.getMediaRow(mediaId)
    return join(this.options.savedMediaDirectory, row.relative_path)
  }

  mediaRunId(mediaId: string): string {
    return this.getMediaRow(mediaId).run_id
  }

  close(): void {
    this.database.close()
  }

  private findByCall(identity: GenerationIdentity): RunRow | undefined {
    return this.database.prepare(`
      SELECT * FROM generation_runs
      WHERE workspace_id = ? AND session_id = ? AND call_id = ?
    `).get(identity.workspaceId, identity.sessionId, identity.callId) as unknown as RunRow | undefined
  }

  private getRow(runId: string): RunRow {
    const row = this.database.prepare('SELECT * FROM generation_runs WHERE run_id = ?').get(runId) as unknown as RunRow | undefined
    if (row === undefined) throw new GenerationRuntimeError('GENERATION_RUN_NOT_FOUND', 'Generation Run was not found.')
    return row
  }

  private getMediaRow(mediaId: string): MediaRow {
    const row = this.database.prepare('SELECT * FROM generation_media WHERE media_id = ?').get(mediaId) as unknown as MediaRow | undefined
    if (row === undefined) throw new GenerationRuntimeError('GENERATION_MEDIA_NOT_FOUND', 'Generation media was not found.')
    return row
  }

  private async advanceOnce(signal?: AbortSignal): Promise<void> {
    const rows = this.database.prepare(`
      SELECT * FROM generation_runs
      WHERE status IN ('created', 'prepared', 'remote_pending', 'remote_running', 'downloading')
      ORDER BY created_at, rowid
    `).all() as unknown as RunRow[]
    for (const row of rows) {
      if (signal?.aborted === true) throw new DOMException('Generation worker was cancelled.', 'AbortError')
      await this.advanceRun(row, signal)
    }
  }

  private async advanceRun(row: RunRow, signal?: AbortSignal): Promise<void> {
    try {
      if (row.status === 'created') {
        await this.prepare(row.run_id, generationRequest(row.request_json), signal)
        return
      }
      if (row.status === 'prepared') {
        await this.submitRun(row, signal)
        return
      }
      if (row.status === 'remote_pending' || row.status === 'remote_running') {
        await this.observeRun(row, signal)
        return
      }
      if (row.status === 'downloading') await this.downloadRun(row, signal)
    } catch (error) {
      if (signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new DOMException('Generation worker was cancelled.', 'AbortError')
      }
      const facts = errorFacts(error)
      const current = this.getRow(row.run_id)
      if (
        (row.status === 'remote_pending' || row.status === 'remote_running')
        && (facts.code === 'COMFYUI_CONNECTION_FAILED' || facts.code === 'COMFYUI_REQUEST_TIMEOUT')
      ) {
        this.recordObservationGap(row, facts)
        return
      }
      if (
        row.status === 'prepared'
        && current.status === 'submitting'
        && facts.code !== 'COMFYUI_PROMPT_REJECTED'
        && !(error instanceof GenerationSubmissionNotSentError)
      ) {
        const changed = this.database.prepare(`
          UPDATE generation_runs SET status = 'submission_unknown', revision = revision + 1,
            prompt_id = NULL, error_code = 'COMFYUI_SUBMISSION_RESULT_UNKNOWN',
            error_message = 'ComfyUI submission result could not be confirmed.', updated_at = ?
          WHERE run_id = ? AND status = 'submitting'
        `).run(this.now(), row.run_id)
        if (changed.changes === 1) return
      }
      this.markFailed(row.run_id, facts)
    }
  }

  private async submitRun(row: RunRow, signal?: AbortSignal): Promise<void> {
    const transport = this.requireTransport()
    if (
      row.instance_id === null
      || row.instance_origin === null
      || row.actual_workflow_path === null
      || row.api_workflow_path === null
    ) {
      throw new GenerationRuntimeError('GENERATION_ARTIFACT_NOT_READY', 'Prepared Generation Run is missing submission data.')
    }
    const promptId = this.createPromptId()
    if (promptId.trim().length === 0) throw new TypeError('promptId is invalid')
    const actualWorkflow = await readJsonArtifact(join(this.options.runDirectory, row.actual_workflow_path), 'Actual Workflow')
    const apiWorkflow = await readJsonArtifact(join(this.options.runDirectory, row.api_workflow_path), 'API Workflow')
    let requestStarted = false
    const submitted = await transport.submit({
      instanceId: row.instance_id,
      instanceOrigin: row.instance_origin,
      promptId,
      apiWorkflow,
      actualWorkflow,
      onRequestStart: () => {
        if (signal?.aborted === true) return false
        const changed = this.database.prepare(`
          UPDATE generation_runs SET status = 'submitting', prompt_id = ?, revision = revision + 1, updated_at = ?
          WHERE run_id = ? AND status = 'prepared'
        `).run(promptId, this.now(), row.run_id)
        requestStarted = changed.changes === 1
        return requestStarted
      },
      signal,
    })
    if (!requestStarted) {
      throw new GenerationSubmissionNotSentError('GENERATION_TRANSPORT_UNAVAILABLE', 'ComfyUI submission did not reach the request boundary.')
    }
    if (submitted.promptId !== promptId) {
      throw new GenerationRuntimeError('COMFYUI_PROTOCOL_ERROR', 'ComfyUI returned a different prompt identity.')
    }
    this.database.prepare(`
      UPDATE generation_runs SET status = 'remote_pending', revision = revision + 1,
        error_code = NULL, error_message = NULL, updated_at = ?
      WHERE run_id = ? AND status = 'submitting' AND prompt_id = ?
    `).run(this.now(), row.run_id, promptId)
  }

  private async observeRun(row: RunRow, signal?: AbortSignal): Promise<void> {
    const transport = this.requireTransport()
    if (row.instance_id === null || row.instance_origin === null || row.prompt_id === null || row.expected_output_node_ids_json === null) {
      throw new GenerationRuntimeError('GENERATION_ARTIFACT_NOT_READY', 'Generation Run is missing observation data.')
    }
    const outputNodeIds = JSON.parse(row.expected_output_node_ids_json) as unknown
    if (!Array.isArray(outputNodeIds) || outputNodeIds.some(value => typeof value !== 'string')) {
      throw new GenerationRuntimeError('GENERATION_ARTIFACT_INVALID', 'Generation Run output node identities are invalid.')
    }
    const observation = await transport.observe({
      instanceId: row.instance_id,
      instanceOrigin: row.instance_origin,
      promptId: row.prompt_id,
      outputNodeIds,
      signal,
    })
    if (observation.status === 'unknown') {
      this.recordObservationGap(row, { code: 'COMFYUI_JOB_MISSING', message: 'ComfyUI no longer reports the submitted job.' })
      return
    }
    if (observation.status === 'pending' || observation.status === 'running') {
      this.database.prepare(`
        UPDATE generation_runs SET status = ?, revision = revision + 1,
          missing_observed_at = NULL, updated_at = ?
        WHERE run_id = ? AND status IN ('remote_pending', 'remote_running')
      `).run(observation.status === 'pending' ? 'remote_pending' : 'remote_running', this.now(), row.run_id)
      return
    }
    if (observation.status === 'error') {
      this.markFailed(row.run_id, observation.error)
      return
    }
    if (observation.outputs.length === 0) {
      this.markFailed(row.run_id, { code: 'COMFYUI_OUTPUT_MISSING', message: 'ComfyUI completed without a saved media output.' })
      return
    }
    const insert = this.database.prepare(`
      INSERT OR IGNORE INTO generation_run_outputs(
        run_id, node_id, output_index, media_kind, filename, subfolder, output_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    for (const output of observation.outputs) {
      insert.run(row.run_id, output.nodeId, output.outputIndex, output.mediaKind, output.filename, output.subfolder, output.type)
    }
    this.database.prepare(`
      UPDATE generation_runs SET status = 'downloading', revision = revision + 1,
        missing_observed_at = NULL, updated_at = ?
      WHERE run_id = ? AND status IN ('remote_pending', 'remote_running')
    `).run(this.now(), row.run_id)
  }

  private async downloadRun(row: RunRow, signal?: AbortSignal): Promise<void> {
    const transport = this.requireTransport()
    if (row.instance_id === null || row.instance_origin === null) throw new GenerationRuntimeError('GENERATION_ARTIFACT_NOT_READY', 'Generation Run instance is missing.')
    const outputs = this.database.prepare(`
      SELECT output.* FROM generation_run_outputs output
      LEFT JOIN generation_media media
        ON media.run_id = output.run_id AND media.node_id = output.node_id
        AND media.output_index = output.output_index AND media.media_kind = output.media_kind
      WHERE output.run_id = ? AND media.media_id IS NULL
      ORDER BY output.node_id, output.media_kind, output.output_index
    `).all(row.run_id) as unknown as OutputRow[]
    for (const outputRow of outputs) {
      const output: GenerationOutputDescriptor = {
        nodeId: outputRow.node_id,
        outputIndex: outputRow.output_index,
        mediaKind: outputRow.media_kind,
        filename: outputRow.filename,
        subfolder: outputRow.subfolder,
        type: outputRow.output_type,
      }
      const downloaded = await transport.download({
        instanceId: row.instance_id,
        instanceOrigin: row.instance_origin,
        output,
        signal,
      })
      await this.persistMedia(row, output, downloaded.bytes, downloaded.mediaType)
    }
    const remaining = this.database.prepare(`
      SELECT COUNT(*) AS count FROM generation_run_outputs output
      LEFT JOIN generation_media media
        ON media.run_id = output.run_id AND media.node_id = output.node_id
        AND media.output_index = output.output_index AND media.media_kind = output.media_kind
      WHERE output.run_id = ? AND media.media_id IS NULL
    `).get(row.run_id) as unknown as { count: number }
    if (remaining.count === 0) {
      this.database.prepare(`
        UPDATE generation_runs SET status = 'succeeded', revision = revision + 1, updated_at = ?
        WHERE run_id = ? AND status = 'downloading'
      `).run(this.now(), row.run_id)
    }
  }

  private async persistMedia(
    row: RunRow,
    output: GenerationOutputDescriptor,
    bytes: Uint8Array,
    mediaType: string,
  ): Promise<void> {
    if (bytes.byteLength < 1) throw new GenerationRuntimeError('COMFYUI_OUTPUT_INVALID', 'ComfyUI returned an empty media file.')
    if (!/^[-a-z0-9]+\/[+.a-z0-9-]+$/u.test(mediaType)) {
      throw new GenerationRuntimeError('COMFYUI_OUTPUT_INVALID', 'ComfyUI returned an invalid media type.')
    }
    const mediaId = this.createMediaId()
    assertPathId(mediaId, 'mediaId')
    const shardSource = mediaId.replace(/^media_/u, '').replaceAll('_', '')
    if (shardSource.length < 4) throw new TypeError('mediaId is too short for storage sharding')
    const extension = this.mediaExtension(output.filename, mediaType)
    const relativePath = join(shardSource.slice(0, 2), shardSource.slice(2, 4), `${mediaId}${extension}`)
    const absolutePath = join(this.options.savedMediaDirectory, relativePath)
    await mkdir(dirname(absolutePath), { recursive: true })
    const temporaryRelativePath = `${relativePath}.${randomUUID()}.tmp`
    const temporary = join(this.options.savedMediaDirectory, temporaryRelativePath)
    const createdAt = this.now()
    this.database.prepare(`
      INSERT INTO generation_media_staging(
        media_id, run_id, workspace_id, session_id, turn, node_id, output_index,
        media_kind, filename, relative_path, temporary_relative_path, media_type, byte_size, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      mediaId, row.run_id, row.workspace_id, row.session_id, row.turn, output.nodeId,
      output.outputIndex, output.mediaKind, output.filename, relativePath,
      temporaryRelativePath, mediaType, bytes.byteLength, createdAt,
    )
    await writeFile(temporary, bytes, { flag: 'wx' })
    await rename(temporary, absolutePath)
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare(`
        INSERT INTO generation_media(
        media_id, run_id, workspace_id, session_id, turn, node_id, output_index,
        media_kind, filename, relative_path, media_type, byte_size, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        mediaId, row.run_id, row.workspace_id, row.session_id, row.turn, output.nodeId,
        output.outputIndex, output.mediaKind, output.filename, relativePath,
        mediaType, bytes.byteLength, createdAt,
      )
      this.database.prepare('DELETE FROM generation_media_staging WHERE media_id = ?').run(mediaId)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  private mediaExtension(filename: string, mediaType: string): string {
    const extension = extname(filename).toLowerCase()
    if (/^\.[a-z0-9]{1,10}$/u.test(extension)) return extension
    const known: Readonly<Record<string, string>> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
    }
    const resolved = known[mediaType]
    if (resolved === undefined) throw new GenerationRuntimeError('COMFYUI_OUTPUT_INVALID', 'ComfyUI media filename has no supported extension.')
    return resolved
  }

  private markFailed(runId: string, facts: { readonly code: string; readonly message: string }): void {
    this.database.prepare(`
      UPDATE generation_runs SET status = 'failed', revision = revision + 1,
        error_code = ?, error_message = ?, updated_at = ?
      WHERE run_id = ? AND status NOT IN ('succeeded', 'failed', 'cancelled')
    `).run(facts.code, facts.message, this.now(), runId)
  }

  private recordObservationGap(
    row: RunRow,
    terminal: { readonly code: string; readonly message: string },
  ): void {
    const firstMissing = row.missing_observed_at ?? this.now()
    if (row.missing_observed_at === null) {
      this.database.prepare('UPDATE generation_runs SET missing_observed_at = ?, updated_at = ? WHERE run_id = ?')
        .run(firstMissing, this.now(), row.run_id)
    }
    if (this.now() - firstMissing >= this.missingObservationMs) this.markFailed(row.run_id, terminal)
  }

  private async prepare(runId: string, request: GenerationRequest, signal?: AbortSignal): Promise<void> {
    const current = this.preparations.get(runId)
    if (current !== undefined) return current
    const preparation = this.prepareOnce(runId, request, signal).finally(() => {
      this.preparations.delete(runId)
    })
    this.preparations.set(runId, preparation)
    return preparation
  }

  private async preparePersistedRequest(runId: string, document: string, signal?: AbortSignal): Promise<void> {
    let request: GenerationRequest
    try {
      request = generationRequest(document)
    } catch (error) {
      const facts = errorFacts(error)
      this.database.prepare(`
        UPDATE generation_runs SET status = 'failed', revision = revision + 1,
          error_code = ?, error_message = ?, updated_at = ?
        WHERE run_id = ? AND status = 'created'
      `).run(facts.code, facts.message, this.now(), runId)
      if (error instanceof GenerationRuntimeError) throw error
      throw new GenerationRuntimeError(facts.code, facts.message)
    }
    await this.prepare(runId, request, signal)
  }

  private async prepareOnce(runId: string, request: GenerationRequest, signal?: AbortSignal): Promise<void> {
    try {
      const prepared = await this.options.preparer.prepare(request, signal)
      const row = this.getRow(runId)
      const relativeDirectory = join('workspaces', row.workspace_id, 'runs', runId)
      const absoluteDirectory = join(this.options.runDirectory, relativeDirectory)
      await mkdir(absoluteDirectory, { recursive: true })
      const files = {
        request: join(relativeDirectory, 'request.json'),
        source: join(relativeDirectory, 'source-snapshot.json'),
        actual: join(relativeDirectory, 'actual-workflow.json'),
        api: join(relativeDirectory, 'api-workflow.json'),
      }
      await Promise.all([
        this.writeAtomic(join(this.options.runDirectory, files.request), request as unknown as JsonValue),
        this.writeAtomic(join(this.options.runDirectory, files.source), prepared.sourceSnapshot),
        this.writeAtomic(join(this.options.runDirectory, files.actual), prepared.actualWorkflow),
        this.writeAtomic(join(this.options.runDirectory, files.api), prepared.apiWorkflow),
      ])
      const updatedAt = this.now()
      this.database.prepare(`
        UPDATE generation_runs SET
          instance_id = ?, instance_title = ?, instance_origin = ?, template_title = ?, status = 'prepared',
          revision = revision + 1, source_snapshot_path = ?, actual_workflow_path = ?,
          api_workflow_path = ?, expected_output_node_ids_json = ?, updated_at = ?
        WHERE run_id = ? AND status = 'created'
      `).run(
        prepared.instanceId,
        prepared.instanceTitle,
        prepared.connection.origin,
        prepared.templateTitle,
        files.source,
        files.actual,
        files.api,
        canonicalJson(prepared.expectedOutputNodeIds as unknown as JsonValue),
        updatedAt,
        runId,
      )
    } catch (error) {
      if (signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new DOMException('Generation preparation was cancelled.', 'AbortError')
      }
      const facts = errorFacts(error)
      this.database.prepare(`
        UPDATE generation_runs SET status = 'failed', revision = revision + 1,
          error_code = ?, error_message = ?, updated_at = ?
        WHERE run_id = ? AND status = 'created'
      `).run(facts.code, facts.message, this.now(), runId)
      if (error instanceof GenerationRuntimeError) throw error
      throw new GenerationRuntimeError(facts.code, facts.message)
    }
  }

  private requireTransport(): GenerationTransport {
    if (this.options.transport === undefined) {
      throw new GenerationRuntimeError('GENERATION_TRANSPORT_UNAVAILABLE', 'Generation transport is unavailable.')
    }
    return this.options.transport
  }

  private recoverStagedMedia(): void {
    const staged = this.database.prepare('SELECT * FROM generation_media_staging ORDER BY created_at, media_id')
      .all() as unknown as MediaStagingRow[]
    for (const row of staged) {
      const finalPath = join(this.options.savedMediaDirectory, row.relative_path)
      const temporaryPath = join(this.options.savedMediaDirectory, row.temporary_relative_path)
      const finalReady = existsSync(finalPath) && statSync(finalPath).isFile() && statSync(finalPath).size === row.byte_size
      if (finalReady) {
        this.database.exec('BEGIN IMMEDIATE')
        try {
          this.database.prepare(`
            INSERT OR IGNORE INTO generation_media(
              media_id, run_id, workspace_id, session_id, turn, node_id, output_index,
              media_kind, filename, relative_path, media_type, byte_size, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            row.media_id, row.run_id, row.workspace_id, row.session_id, row.turn,
            row.node_id, row.output_index, row.media_kind, row.filename,
            row.relative_path, row.media_type, row.byte_size, row.created_at,
          )
          this.database.prepare('DELETE FROM generation_media_staging WHERE media_id = ?').run(row.media_id)
          this.database.exec('COMMIT')
        } catch (error) {
          this.database.exec('ROLLBACK')
          throw error
        }
      } else {
        if (existsSync(finalPath)) unlinkSync(finalPath)
        this.database.prepare('DELETE FROM generation_media_staging WHERE media_id = ?').run(row.media_id)
      }
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
    }
  }

  private async writeAtomic(path: string, value: JsonValue): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`
    await writeFile(temporary, jsonDocument(value), { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, path)
  }
}
