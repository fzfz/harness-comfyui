export const GENERATION_REMOTE_NAMESPACE = 'harnessComfyuiGeneration'
export const GENERATION_REMOTE_SERVICE = `remote.${GENERATION_REMOTE_NAMESPACE}`
export const GENERATION_MEDIA_URL_PREFIX = '/api/harness-comfyui/media'

export const GENERATION_RUN_STATUSES = [
  'created',
  'prepared',
  'submitting',
  'submission_unknown',
  'remote_pending',
  'remote_running',
  'downloading',
  'succeeded',
  'failed',
  'cancelling',
  'cancelled',
] as const

export type GenerationRunProjectionStatus = (typeof GENERATION_RUN_STATUSES)[number]
export type GenerationMediaKind = 'image' | 'video'

export interface GenerationProjectionRequest {
  readonly sessionId: string
  readonly turn: number | null
}

export interface GenerationRunProjection {
  readonly runId: string
  readonly turn: number
  readonly title: string
  readonly instanceTitle: string | null
  readonly templateTitle: string | null
  readonly status: GenerationRunProjectionStatus
  readonly errorCode: string | null
  readonly errorMessage: string | null
  readonly createdAt: number
  readonly updatedAt: number
}

export interface GenerationMediaProjection {
  readonly mediaId: string
  readonly runId: string
  readonly turn: number
  readonly outputIndex: number
  readonly mediaKind: GenerationMediaKind
  readonly filename: string
  readonly mediaType: string
  readonly byteSize: number
  readonly createdAt: number
}

export interface GenerationProjection {
  readonly sessionId: string
  readonly runs: readonly GenerationRunProjection[]
  readonly media: readonly GenerationMediaProjection[]
  readonly hasActiveRuns: boolean
  readonly refreshAfterMs: number
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) throw new TypeError(`${label} has invalid properties`)
}

function text(value: unknown, label: string, nullable = false, maxLength: number | null = 10_000): string | null {
  if (nullable && value === null) return null
  if (typeof value !== 'string' || value.length === 0 || maxLength !== null && value.length > maxLength) {
    throw new TypeError(`${label} is invalid`)
  }
  return value
}

function natural(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError(`${label} is invalid`)
  return value as number
}

export function parseGenerationProjectionRequest(value: unknown): GenerationProjectionRequest {
  const source = record(value, 'Generation projection request')
  exactKeys(source, ['sessionId', 'turn'], 'Generation projection request')
  const turn = source.turn
  if (turn !== null && (!Number.isSafeInteger(turn) || (turn as number) < 0)) throw new TypeError('Generation projection turn is invalid')
  return Object.freeze({
    sessionId: text(source.sessionId, 'Generation projection Session')!,
    turn: turn as number | null,
  })
}

function parseRun(value: unknown): GenerationRunProjection {
  const source = record(value, 'Generation Run projection')
  exactKeys(source, [
    'runId', 'turn', 'title', 'instanceTitle', 'templateTitle', 'status',
    'errorCode', 'errorMessage', 'createdAt', 'updatedAt',
  ], 'Generation Run projection')
  if (!GENERATION_RUN_STATUSES.includes(source.status as GenerationRunProjectionStatus)) throw new TypeError('Generation Run status is invalid')
  return Object.freeze({
    runId: text(source.runId, 'Generation Run id')!,
    turn: natural(source.turn, 'Generation Run turn'),
    title: text(source.title, 'Generation Run title')!,
    instanceTitle: text(source.instanceTitle, 'Generation Run instance title', true),
    templateTitle: text(source.templateTitle, 'Generation Run template title', true),
    status: source.status as GenerationRunProjectionStatus,
    errorCode: text(source.errorCode, 'Generation Run error code', true),
    errorMessage: text(source.errorMessage, 'Generation Run error message', true, null),
    createdAt: natural(source.createdAt, 'Generation Run created time'),
    updatedAt: natural(source.updatedAt, 'Generation Run updated time'),
  })
}

function parseMedia(value: unknown): GenerationMediaProjection {
  const source = record(value, 'Generation media projection')
  exactKeys(source, [
    'mediaId', 'runId', 'turn', 'outputIndex', 'mediaKind', 'filename',
    'mediaType', 'byteSize', 'createdAt',
  ], 'Generation media projection')
  if (source.mediaKind !== 'image' && source.mediaKind !== 'video') throw new TypeError('Generation media kind is invalid')
  return Object.freeze({
    mediaId: text(source.mediaId, 'Generation media id')!,
    runId: text(source.runId, 'Generation media Run id')!,
    turn: natural(source.turn, 'Generation media turn'),
    outputIndex: natural(source.outputIndex, 'Generation media output index'),
    mediaKind: source.mediaKind,
    filename: text(source.filename, 'Generation media filename')!,
    mediaType: text(source.mediaType, 'Generation media type')!,
    byteSize: natural(source.byteSize, 'Generation media byte size'),
    createdAt: natural(source.createdAt, 'Generation media created time'),
  })
}

export function parseGenerationProjection(value: unknown): GenerationProjection {
  const source = record(value, 'Generation projection')
  exactKeys(source, ['sessionId', 'runs', 'media', 'hasActiveRuns', 'refreshAfterMs'], 'Generation projection')
  if (!Array.isArray(source.runs) || !Array.isArray(source.media) || typeof source.hasActiveRuns !== 'boolean') {
    throw new TypeError('Generation projection collections are invalid')
  }
  return Object.freeze({
    sessionId: text(source.sessionId, 'Generation projection Session')!,
    runs: Object.freeze(source.runs.map(parseRun)),
    media: Object.freeze(source.media.map(parseMedia)),
    hasActiveRuns: source.hasActiveRuns,
    refreshAfterMs: natural(source.refreshAfterMs, 'Generation projection refresh interval'),
  })
}

export function generationMediaContentUrl(mediaId: string, sessionId: string): string {
  return `${GENERATION_MEDIA_URL_PREFIX}/${encodeURIComponent(mediaId)}/content?session_id=${encodeURIComponent(sessionId)}`
}

export function generationMediaViewerUrl(mediaId: string, sessionId: string): string {
  return `${GENERATION_MEDIA_URL_PREFIX}/${encodeURIComponent(mediaId)}/view?session_id=${encodeURIComponent(sessionId)}`
}

export function generationMediaWorkflowUrl(mediaId: string, sessionId: string): string {
  return `${GENERATION_MEDIA_URL_PREFIX}/${encodeURIComponent(mediaId)}/workflow?session_id=${encodeURIComponent(sessionId)}`
}
