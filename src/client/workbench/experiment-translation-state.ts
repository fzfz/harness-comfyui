import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { ExperimentRemote } from './experiment-contract.ts'
import type { TranslationRequest, TranslationResult } from '../../workbench/translation.ts'
import translationConfig from '../../../config/workbench-translation.json' with { type: 'json' }

type Scope = Omit<TranslationRequest, 'request_id'>
export const promptFields = { positive_prompt: '正向提示词', negative_prompt: '负向提示词' } as const
export type PromptField = keyof typeof promptFields
export type TranslationRemote = Pick<ExperimentRemote, 'translate'>
export interface PromptTranslationSnapshot {
  readonly current: (TranslationRequest & TranslationResult) | null
  readonly stale: boolean
  readonly copied: boolean
}

export class PromptTranslationController {
  private state: PromptTranslationSnapshot = { current: null, stale: false, copied: false }
  private readonly listeners = new Set<() => void>()
  private scope: Scope | null = null
  private revision = ''
  private pending: AbortController | null = null
  private disposed = false

  constructor(private readonly remote: TranslationRemote) {}
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(change: Partial<PromptTranslationSnapshot>) {
    this.state = { ...this.state, ...change }
    for (const listener of this.listeners) listener()
  }
  sync(scope: Scope, revision: string, enabled: boolean) {
    if (this.disposed) return
    const previous = this.scope
    const reset = !previous || this.revision !== revision || previous.workspace_id !== scope.workspace_id || previous.work_id !== scope.work_id
      || previous.branch_id !== scope.branch_id || previous.target !== scope.target || previous.field !== scope.field
    this.scope = scope
    this.revision = revision
    if (reset || previous?.source_text !== scope.source_text) {
      this.pending?.abort()
      this.pending = null
      this.update({ current: null, stale: !reset, copied: false })
    }
    if (enabled && !this.state.current && !this.state.stale) this.request()
  }
  request = () => {
    if (this.disposed || !this.scope?.source_text.trim() || this.state.current?.status === 'running') return
    const request: TranslationRequest = { ...this.scope, request_id: crypto.randomUUID() }
    const abort = new AbortController()
    this.pending?.abort()
    this.pending = abort
    this.update({ current: { ...request, status: 'running' }, stale: false, copied: false })
    const current = () => !this.disposed && this.pending === abort && !abort.signal.aborted
      && this.scope?.source_text === request.source_text && this.state.current?.request_id === request.request_id
    void (async () => {
      try {
        for await (const result of this.remote.translate(request, abort.signal)) {
          if (!current()) return
          if (result.request_id !== request.request_id) continue
          this.update({ current: { ...request, ...result } })
        }
        if (current() && this.state.current?.status === 'running') this.update({ current: { ...request, status: 'failed', error: translationConfig.errors.incomplete } })
      } catch (error) {
        if (current()) this.update({ current: { ...request, status: 'failed', error: error instanceof Error ? error.message : '翻译失败，请重试。' } })
      } finally {
        if (this.pending === abort) this.pending = null
      }
    })()
  }
  markCopied = (requestId: string) => {
    if (!this.disposed && this.state.current?.request_id === requestId && this.state.current.status === 'succeeded') this.update({ copied: true })
  }
  dispose = () => {
    this.disposed = true
    this.pending?.abort()
    this.pending = null
    this.listeners.clear()
  }
}

export function usePromptTranslation(scope: Scope, remote: TranslationRemote, options: { readonly enabled?: boolean; readonly revision?: string } = {}) {
  const controller = useMemo(() => new PromptTranslationController(remote), [remote])
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  useEffect(() => {
    controller.sync(scope, options.revision ?? '', options.enabled ?? true)
  }, [controller, scope.workspace_id, scope.work_id, scope.branch_id, scope.target, scope.field, scope.source_text, options.revision, options.enabled])
  useEffect(() => () => controller.dispose(), [controller])
  const matching = state.current?.source_text === scope.source_text && state.current.field === scope.field && state.current.target === scope.target
  return { ...state, current: matching ? state.current : null, stale: state.stale || (!!state.current && !matching), request: controller.request, markCopied: controller.markCopied }
}
