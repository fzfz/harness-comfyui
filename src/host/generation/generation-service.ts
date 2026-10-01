import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'

import {
  GENERATION_REMOTE_NAMESPACE,
  type GenerationProjection,
  type GenerationProjectionRequest,
  type GenerationRunProjectionStatus,
} from '../../generation/contract.ts'
import type { GenerationRuntime } from './generation-runtime.ts'
import {
  workspaceSessionScopeForSession,
  type WorkspaceRegistryProjection,
} from './workspace-access.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    harnessComfyuiGeneration: GenerationRemoteService
  }
}

const terminalStatuses = new Set<GenerationRunProjectionStatus>(['succeeded', 'failed', 'cancelled', 'submission_unknown'])

export class GenerationRemoteService extends TypertRemoteService {
  private readonly runtime: Pick<GenerationRuntime, 'queryRuns' | 'queryMedia'>
  private readonly refreshAfterMs: number
  private readonly workspaceRegistry: WorkspaceRegistryProjection
  private readonly sessionPersistence: Pick<SessionPersistence, 'stat'>

  constructor(
    ctx: Context,
    runtime: Pick<GenerationRuntime, 'queryRuns' | 'queryMedia'>,
    refreshAfterMs: number,
    workspaceRegistry: WorkspaceRegistryProjection,
  ) {
    super(ctx, GENERATION_REMOTE_NAMESPACE)
    this.runtime = runtime
    this.refreshAfterMs = refreshAfterMs
    this.workspaceRegistry = workspaceRegistry
    this.sessionPersistence = ctx.sessionPersistence
    if (!Number.isSafeInteger(refreshAfterMs) || refreshAfterMs < 1) throw new TypeError('Generation refresh interval is invalid.')
    for (const initialize of generationRemoteInitializers) initialize(this)
  }

  async list(request: GenerationProjectionRequest, signal: AbortSignal): Promise<GenerationProjection> {
    signal.throwIfAborted()
    const sessionScope = await workspaceSessionScopeForSession(
      this.workspaceRegistry,
      this.sessionPersistence,
      request.sessionId,
      signal,
    )
    signal.throwIfAborted()
    const turn = request.turn ?? undefined
    const runSnapshots = sessionScope.sessionIds.flatMap(sessionId => this.runtime.queryRuns({
      workspaceId: sessionScope.workspaceId,
      sessionId,
      turn,
    }))
    runSnapshots.sort((left, right) =>
      right.createdAt - left.createdAt
      || right.updatedAt - left.updatedAt
      || (left.runId === right.runId ? 0 : left.runId > right.runId ? -1 : 1),
    )
    const runs = runSnapshots.map(run => Object.freeze({
      runId: run.runId,
      turn: run.turn,
      title: run.title,
      instanceTitle: run.instanceTitle,
      templateTitle: run.templateTitle,
      status: run.status,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    }))
    const mediaSnapshots = sessionScope.sessionIds.flatMap(sessionId => this.runtime.queryMedia({
      workspaceId: sessionScope.workspaceId,
      sessionId,
      turn,
    }))
    mediaSnapshots.sort((left, right) =>
      right.createdAt - left.createdAt
      || right.outputIndex - left.outputIndex
      || (left.mediaId === right.mediaId ? 0 : left.mediaId > right.mediaId ? -1 : 1),
    )
    const media = mediaSnapshots.map(item => Object.freeze({
      mediaId: item.mediaId,
      runId: item.runId,
      turn: item.turn,
      outputIndex: item.outputIndex,
      mediaKind: item.mediaKind,
      filename: item.filename,
      mediaType: item.mediaType,
      byteSize: item.byteSize,
      createdAt: item.createdAt,
    }))
    signal.throwIfAborted()
    return Object.freeze({
      sessionId: request.sessionId,
      runs: Object.freeze(runs),
      media: Object.freeze(media),
      hasActiveRuns: runs.some(run => !terminalStatuses.has(run.status)),
      refreshAfterMs: this.refreshAfterMs,
    })
  }
}

const generationRemoteInitializers: Array<(service: GenerationRemoteService) => void> = []

Remote(GenerationRemoteService.prototype.list, {
  private: false,
  static: false,
  name: 'list',
  addInitializer(initialize: (this: GenerationRemoteService) => void) {
    generationRemoteInitializers.push(service => initialize.call(service))
  },
} as never)
