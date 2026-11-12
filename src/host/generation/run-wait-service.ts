import { contracts, type ContractReadonlyValue } from '#contracts'
import help from '../../../config/managed-cli-help.json' with { type: 'json' }
import type { JobOutcome, JobRegistry, JobSpec } from '@deepseek-ai/dsh-jobs'
import { isGenerationRunTerminal, type GenerationRunStatus } from '../../generation/run-status.ts'
import type { GenerationRuntime } from './generation-runtime.ts'
import { GenerationRuntimeError } from './generation-error.ts'

export interface GenerationRunWaitIdentity {
  readonly workspaceId?: string
  readonly sessionId: string
  readonly callId: string
  readonly rootCallId: string
}

export type GenerationRunWaitReceipt = ContractReadonlyValue<'generationRunWaitReceipt'>

export interface GenerationRunWaitOptions {
  readonly runtime: Pick<GenerationRuntime, 'readGenerationRunMedia'>
  readonly jobs: Pick<JobRegistry, 'start'>
  readonly pollIntervalMs: number
}

declare module '@deepseek-ai/dsh-jobs/view' {
  interface JobKindMap {
    generationWait: 'generation-wait'
  }
}

export class GenerationRunWaitService {
  private closed = false
  private readonly active = new Map<string, {
    readonly receipt: GenerationRunWaitReceipt
    readonly cancel: () => void
    readonly done: Promise<JobOutcome>
  }>()

  private readonly options: GenerationRunWaitOptions

  constructor(options: GenerationRunWaitOptions) {
    this.options = options
  }

  async register(identity: GenerationRunWaitIdentity, runIds: readonly string[], signal?: AbortSignal): Promise<GenerationRunWaitReceipt> {
    this.assertOpen()
    signal?.throwIfAborted()
    const initial = await this.read(identity.workspaceId, runIds, signal)
    signal?.throwIfAborted()
    this.assertOpen()
    const canonicalIds = Object.freeze(initial.map(run => run.run_id))
    const key = JSON.stringify([identity.sessionId, initial.map(run => [run.workspaceId, run.run_id])])
    const existing = this.active.get(key)
    if (existing !== undefined) return existing.receipt
    const controller = new AbortController()
    const cancel = () => controller.abort()
    let done!: Promise<JobOutcome>
    let jobId: string
    try {
      jobId = this.options.jobs.start({
        kind: 'generation-wait',
        label: canonicalIds.join(', '),
        owner: identity.sessionId as JobSpec['owner'],
        toolCall: { callId: identity.callId, rootCallId: identity.rootCallId } as JobSpec['toolCall'],
        run: () => {
          done = this.observe(initial, controller.signal).finally(() => { this.active.delete(key) })
          return { done, cancel }
        },
      })
    } catch (error) {
      throw new GenerationRuntimeError('GENERATION_WAIT_UNAVAILABLE', `${help.messages.generationWaitUnavailable} ${error instanceof Error ? error.message : String(error)}`)
    }
    const receipt = contracts.parse('generationRunWaitReceipt', 'output', { job_id: jobId, run_ids: canonicalIds })
    this.active.set(key, { receipt, cancel, done })
    return receipt
  }

  private async read(workspaceId: string | undefined, runIds: readonly string[], signal?: AbortSignal) {
    const { runs } = await this.options.runtime.readGenerationRunMedia({ workspaceId, runIds }, signal)
    const facts = runs.map(run => {
      if (run.lookup_status === 'error') throw new GenerationRuntimeError(run.error.code, `${run.error.message} Use generation resolve-media --stdin to check this Run before retrying generation wait.`)
      return { run_id: run.run_id, status: run.status, workspaceId: run.workspace_id }
    })
    return [...new Map(facts.map(run => [run.run_id, run])).values()].sort((left, right) => left.run_id.localeCompare(right.run_id))
  }

  private async observe(initial: readonly { run_id: string; status: GenerationRunStatus; workspaceId: string }[], signal: AbortSignal): Promise<JobOutcome> {
    try {
      let current = initial
      while (!current.every(run => isGenerationRunTerminal(run.status))) {
        await new Promise<void>(resolve => {
          const finish = () => {
            clearTimeout(timer)
            signal.removeEventListener('abort', finish)
            resolve()
          }
          const timer = setTimeout(finish, this.options.pollIntervalMs)
          signal.addEventListener('abort', finish, { once: true })
          if (signal.aborted) finish()
        })
        signal.throwIfAborted()
        const groups = new Map<string, string[]>()
        for (const run of current) groups.set(run.workspaceId, [...(groups.get(run.workspaceId) ?? []), run.run_id])
        current = (await Promise.all([...groups].map(([sourceWorkspace, ids]) => this.read(sourceWorkspace, ids, signal)))).flat()
          .sort((left, right) => left.run_id.localeCompare(right.run_id))
      }
      signal.throwIfAborted()
      return { status: 'completed', result: JSON.stringify(contracts.parse('generationRunWaitSummary', 'output', { runs: current.map(({ run_id, status }) => ({ run_id, status })) })) }
    } catch (error) {
      if (signal.aborted) return { status: 'killed' }
      return { status: 'failed', detail: error instanceof Error ? error.message : 'Run observation failed. Query the Runs with generation resolve-media --stdin.' }
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new GenerationRuntimeError('GENERATION_WAIT_UNAVAILABLE', help.messages.generationWaitUnavailable)
  }

  async close(): Promise<void> {
    this.closed = true
    const observations = [...this.active.values()]
    observations.forEach(observation => observation.cancel())
    await Promise.all(observations.map(observation => observation.done))
  }
}
