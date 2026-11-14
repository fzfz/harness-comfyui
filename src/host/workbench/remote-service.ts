import { ContractError } from '#contracts'
import { randomUUID } from 'node:crypto'
import type { WorkbenchImageImportRequest, WorkbenchImageResolveRequest, WorkbenchTranslationLookup } from '../../workbench-remote.ts'
import type { WorkbenchRecord, WorkbenchRecordQuery, WorkbenchRun, ImageRef } from '../../workbench/contract.ts'
import type { PromptStartRequest, PromptLookupRequest, PromptListRequest, PromptAdoptRequest } from '../../workbench/prompt-edit.ts'
import type { TranslationRequest } from '../../workbench/translation.ts'
import { resolveInputImages } from './input-images.ts'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { WORKBENCH_REMOTE_NAMESPACE, type WorkbenchRunInputRequest, type WorkbenchInputDescriptionRequest, type WorkbenchEnvironmentRequest, type WorkbenchScope, type WorkbenchTaskDraftRequest, type WorkbenchSaveTaskDraftRequest } from '../../workbench-remote.ts'
import type { ExperimentWorkbenchAction } from '../../workbench-remote.ts'
import { WorkbenchError } from '../../workbench/validation.ts'
import { generationMediaContentUrl, generationMediaDownloadUrl } from '../../generation/contract.ts'
import { executeWorkbenchAction } from './actions.ts'
import type {} from './plugin.ts'

async function report<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() }
  catch (error) {
    if (error instanceof WorkbenchError || error instanceof ContractError) {
      const message = error instanceof ContractError ? error.message : error.issues.map(issue => issue.message).join('\n')
      throw new RemoteError('workbench/operation-failed', message, { code: error.code, issues: error.issues })
    }
    throw error
  }
}

export class WorkbenchRemoteService extends TypertRemoteService {
  constructor(private readonly host: Context) {
    super(host, WORKBENCH_REMOTE_NAMESPACE)
    for (const initialize of initializers) initialize(this)
  }
  async *subscribe(request: import('../../workbench-remote.ts').WorkbenchSubscription, signal: AbortSignal): import('@deepseek-ai/dsh-typert-protocol').RemoteStream<import('../../workbench-remote.ts').WorkbenchUpdate> {
    signal.throwIfAborted()
    const host = this.host.harnessComfyuiWorkbench
    signal = AbortSignal.any([signal, host.signal])
    await host.initializeWorkspace(request.workspaceId)
    const { store } = host.service
    for (const workId of request.workIds ?? []) store.assertScope(request.workspaceId, workId)
    const queue: import('../../workbench-remote.ts').WorkbenchUpdate[] = []
    let wake: (() => void) | undefined
    let failure: unknown
    const capture = (kind: 'snapshot' | 'change', sequence: number) => {
      const projection = host.service.getProjection({ workspaceId: request.workspaceId })
      if (request.workIds) {
        const works = new Set(request.workIds)
        projection.works = projection.works.filter(work => works.has(work.work_id))
        projection.branches = projection.branches.filter(branch => works.has(branch.work_id))
        const branches = new Set(projection.branches.map(branch => branch.branch_id))
        projection.tasks = projection.tasks.filter(task => branches.has(task.branch_id))
        const tasks = new Set(projection.tasks.map(task => task.task_id))
        projection.artifacts = projection.artifacts.filter(artifact => tasks.has(artifact.task_id))
        projection.runs = projection.runs.filter(run => tasks.has(run.workbench_task_id ?? '') || tasks.has(run.execution_task_id ?? ''))
        projection.experiments = projection.experiments.filter(experiment => tasks.has(experiment.task_id))
      }
      projection.runs = projection.runs.map(run => ({ ...run, media: run.media.map(media => ({ ...media, url: generationMediaContentUrl(media.media_id, run.session_id), download_url: generationMediaDownloadUrl(media.media_id, run.session_id) })) }))
      const promptTurns = projection.tasks.flatMap(task => store.listPromptTurns(task.task_id))
      const translations = store.listTranslations({ workspaceId: request.workspaceId }).filter(record => !request.workIds || request.workIds.includes(record.work_id))
      queue.push({ kind, sequence, projection, promptTurns, translations })
      wake?.()
    }
    const release = store.subscribe(sequence => {
      try { capture('change', sequence) }
      catch (error) { failure = error; wake?.() }
    }, error => { failure = error; wake?.() })
    const abort = () => wake?.()
    signal.addEventListener('abort', abort, { once: true })
    try {
      capture('snapshot', store.revision)
      while (!signal.aborted) {
        if (failure) throw failure
        const next = queue.shift()
        if (next) yield next
        else await new Promise<void>(resolve => { wake = resolve })
      }
    } finally { release(); signal.removeEventListener('abort', abort) }
  }

  async queryRecords(request: WorkbenchRecordQuery, signal: AbortSignal): Promise<WorkbenchRecord[]> {
    signal.throwIfAborted()
    const media = (run: WorkbenchRun): WorkbenchRun => ({ ...run, media: run.media.map(item => ({ ...item, url: generationMediaContentUrl(item.media_id, run.session_id), download_url: generationMediaDownloadUrl(item.media_id, run.session_id) })) })
    return report(async () => (await this.host.harnessComfyuiWorkbench.service.queryRecords(request)).map((record): WorkbenchRecord => {
      if (record.type === 'run') return { ...record, run: media(record.run) }
      if (record.type === 'task') return { ...record, runs: record.runs.map(media) }
      return record
    }))
  }
  async importImages(request: WorkbenchImageImportRequest, signal: AbortSignal) {
    return report(async () => {
      const images: ImageRef[] = []
      for (const input of request.files) {
        signal.throwIfAborted()
        const file = await this.host.harnessComfyuiCore.services.inputFiles.importFile({ ...input, bytes: new Uint8Array(input.bytes) }, signal)
        images.push({ image_ref_id: randomUUID(), source: { kind: 'uploaded_file', file_id: file.file_id }, purpose: 'workflow', reference_requirement: '' })
      }
      return { images }
    })
  }
  async resolveImages(request: WorkbenchImageResolveRequest, signal: AbortSignal) {
    return report(async () => ({ images: await resolveInputImages(this.host.harnessComfyuiCore.services, request.image_refs, signal) }))
  }
  async promptPreview(request: PromptStartRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(() => this.host.harnessComfyuiWorkbench.prompts.preview(request))
  }
  async promptStart(request: PromptStartRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(async () => {
      await this.host.harnessComfyuiWorkbench.initializeWorkspace(request.workspace_id)
      return this.host.harnessComfyuiWorkbench.prompts.start(request)
    })
  }
  async promptGet(request: PromptLookupRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(() => this.host.harnessComfyuiWorkbench.prompts.get(request))
  }
  async promptList(request: PromptListRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(() => this.host.harnessComfyuiWorkbench.prompts.list(request))
  }
  async promptCancel(request: PromptLookupRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(async () => this.host.harnessComfyuiWorkbench.prompts.cancel(request))
  }
  async promptSaveCandidate(request: PromptAdoptRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(async () => this.host.harnessComfyuiWorkbench.prompts.saveCandidate(request))
  }

  async promptAdopt(request: PromptAdoptRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(async () => this.host.harnessComfyuiWorkbench.prompts.adopt(request))
  }
  async translateStart(request: TranslationRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(async () => {
      await this.host.harnessComfyuiWorkbench.initializeWorkspace(request.workspace_id)
      return this.host.harnessComfyuiWorkbench.translations.start(request)
    })
  }
  async translateGet(request: WorkbenchTranslationLookup, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(async () => this.host.harnessComfyuiWorkbench.translations.get(request.request_id))
  }
  async translateCancel(request: WorkbenchTranslationLookup, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(async () => this.host.harnessComfyuiWorkbench.translations.cancel(request.request_id))
  }
  async getEnvironment(request: WorkbenchEnvironmentRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(() => this.host.harnessComfyuiWorkbench.environment(request.workspaceId, request.presetId))
  }
  async getProjection(request: WorkbenchScope, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(async () => {
      this.host.harnessComfyuiWorkbench.assertWorkspace(request.workspaceId)
      const projection = await this.host.harnessComfyuiWorkbench.service.getProjection(request)
      signal.throwIfAborted()
      return { ...projection, runs: projection.runs.map(run => ({ ...run, media: run.media.map(media => ({ ...media, url: generationMediaContentUrl(media.media_id, run.session_id), download_url: generationMediaDownloadUrl(media.media_id, run.session_id) })) })) }
    })
  }
  async getTaskDraft(request: WorkbenchTaskDraftRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(async () => {
      this.host.harnessComfyuiWorkbench.assertWorkspace(request.workspaceId)
      signal.throwIfAborted()
      return this.host.harnessComfyuiWorkbench.service.getTaskDraft(request)
    })
  }
  async saveTaskDraft(request: WorkbenchSaveTaskDraftRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(async () => {
      await this.host.harnessComfyuiWorkbench.initializeWorkspace(request.workspaceId)
      signal.throwIfAborted()
      return this.host.harnessComfyuiWorkbench.service.saveTaskDraft(request)
    })
  }

  async getRunInput(request: WorkbenchRunInputRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(async () => {
      const input = await this.host.harnessComfyuiWorkbench.service.getRunInput(request)
      signal.throwIfAborted()
      return input
    })
  }

  async getInputDescription(request: WorkbenchInputDescriptionRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(async () => {
      const { store } = this.host.harnessComfyuiWorkbench.service
      store.assertScope(request.workspaceId, request.workId, request.branchId)
      const input = request.generationInput ?? store.getBranch(request.branchId).draft.generation_input
      if (!input.template_id || !input.instance_id) return null
      return this.host.harnessComfyuiCore.services.runtime.inspectTemplateRuntimeParameters({ templateId: input.template_id, instanceId: input.instance_id }, signal)
    })
  }
  async mutate(request: ExperimentWorkbenchAction, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(() => executeWorkbenchAction(this.host, request, signal))
  }
}
const initializers: Array<(service: WorkbenchRemoteService) => void> = []
for (const name of ['promptSaveCandidate', 'queryRecords', 'importImages', 'resolveImages', 'promptPreview', 'promptStart', 'promptGet', 'promptList', 'promptCancel', 'promptAdopt', 'translateStart', 'translateGet', 'translateCancel', 'getRunInput', 'getEnvironment', 'getProjection', 'getInputDescription', 'getTaskDraft', 'saveTaskDraft', 'mutate'] as const) {
  Remote(WorkbenchRemoteService.prototype[name] as never, { private: false, static: false, name,
    addInitializer(initialize: (this: WorkbenchRemoteService) => void) { initializers.push(service => initialize.call(service)) },
  } as never)
}

Remote({ mode: 'stream' })(WorkbenchRemoteService.prototype.subscribe as never, { private: false, static: false, name: 'subscribe',
  addInitializer(initialize: (this: WorkbenchRemoteService) => void) { initializers.push(service => initialize.call(service)) },
} as never)
