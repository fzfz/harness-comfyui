import type { GenerationProjection } from '../../generation/contract.ts'

export interface GenerationProjectionClient {
  list(sessionId: string, signal: AbortSignal): Promise<GenerationProjection>
}

export interface GenerationStoreSnapshot {
  readonly projection: GenerationProjection
  readonly errorCode: string | null
}

interface SessionRecord {
  snapshot: GenerationStoreSnapshot
  sessionRunning: boolean
  readonly listeners: Set<() => void>
  controller?: AbortController
  timer?: ReturnType<typeof setTimeout>
}

function emptyProjection(sessionId: string, refreshAfterMs: number): GenerationProjection {
  return Object.freeze({
    sessionId,
    runs: Object.freeze([]),
    media: Object.freeze([]),
    hasActiveRuns: false,
    refreshAfterMs,
  })
}

export class GenerationProjectionStore {
  private readonly records = new Map<string, SessionRecord>()

  constructor(
    private readonly client: GenerationProjectionClient,
    private readonly initialRefreshAfterMs: number,
  ) {
    if (!Number.isSafeInteger(initialRefreshAfterMs) || initialRefreshAfterMs < 1) {
      throw new TypeError('Generation projection refresh interval is invalid.')
    }
  }

  readonly subscribe = (sessionId: string, listener: () => void): (() => void) => {
    const record = this.record(sessionId)
    record.listeners.add(listener)
    if (record.listeners.size === 1) this.refresh(sessionId, record)
    return () => {
      record.listeners.delete(listener)
      if (record.listeners.size === 0) {
        record.controller?.abort()
        if (record.timer !== undefined) clearTimeout(record.timer)
        this.records.delete(sessionId)
      }
    }
  }

  readonly getSnapshot = (sessionId: string): GenerationStoreSnapshot => this.record(sessionId).snapshot

  readonly setSessionRunning = (sessionId: string, running: boolean): void => {
    const record = this.records.get(sessionId)
    if (record === undefined || record.listeners.size === 0 || record.sessionRunning === running) return
    record.sessionRunning = running
    this.refreshSession(sessionId)
  }

  readonly refreshSession = (sessionId: string): void => {
    const record = this.records.get(sessionId)
    if (record === undefined || record.listeners.size === 0) return
    if (record.timer !== undefined) clearTimeout(record.timer)
    record.timer = undefined
    this.refresh(sessionId, record)
  }

  dispose(): void {
    for (const record of this.records.values()) {
      record.controller?.abort()
      if (record.timer !== undefined) clearTimeout(record.timer)
    }
    this.records.clear()
  }

  private record(sessionId: string): SessionRecord {
    const current = this.records.get(sessionId)
    if (current !== undefined) return current
    const created: SessionRecord = {
      snapshot: Object.freeze({ projection: emptyProjection(sessionId, this.initialRefreshAfterMs), errorCode: null }),
      sessionRunning: false,
      listeners: new Set(),
    }
    this.records.set(sessionId, created)
    return created
  }

  private refresh(sessionId: string, record: SessionRecord): void {
    record.controller?.abort()
    const controller = new AbortController()
    record.controller = controller
    void this.client.list(sessionId, controller.signal)
      .then(projection => {
        if (controller.signal.aborted || record.controller !== controller) return
        record.snapshot = Object.freeze({ projection, errorCode: null })
        for (const listener of record.listeners) listener()
      })
      .catch(error => {
        if (controller.signal.aborted || record.controller !== controller) return
        record.snapshot = Object.freeze({
          projection: record.snapshot.projection,
          errorCode: error instanceof Error ? error.message : String(error),
        })
        for (const listener of record.listeners) listener()
      })
      .finally(() => {
        if (
          controller.signal.aborted
          || record.controller !== controller
          || record.listeners.size === 0
          || (!record.sessionRunning && !record.snapshot.projection.hasActiveRuns)
        ) return
        record.controller = undefined
        record.timer = setTimeout(() => {
          record.timer = undefined
          this.refresh(sessionId, record)
        }, record.snapshot.projection.refreshAfterMs)
      })
  }
}
