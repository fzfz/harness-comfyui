import { randomUUID } from 'node:crypto'
import type { WorkbenchImageImportRequest, WorkbenchImageResolveRequest, WorkbenchTranslationLookup } from '../../workbench-remote.ts'
import type { WorkbenchRecordQuery, WorkbenchRun, ImageRef } from '../../workbench/contract.ts'
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
    if (error instanceof WorkbenchError) throw new RemoteError('workbench/operation-failed', error.issues.map(issue => issue.message).join('\n'), { code: error.code, issues: error.issues })
    throw error
  }
}

export class WorkbenchRemoteService extends TypertRemoteService {
  constructor(private readonly host: Context) {
    super(host, WORKBENCH_REMOTE_NAMESPACE)
    for (const initialize of initializers) initialize(this)
  }
  async queryRecords(request: WorkbenchRecordQuery, signal: AbortSignal) {
    signal.throwIfAborted()
    const media = (run: WorkbenchRun): WorkbenchRun => ({ ...run, media: run.media.map(item => ({ ...item, url: generationMediaContentUrl(item.media_id, run.session_id), download_url: generationMediaDownloadUrl(item.media_id, run.session_id) })) })
    return report(async () => (await this.host.harnessComfyuiWorkbench.service.queryRecords(request)).map(record => ({ ...record, ...(record.run ? { run: media(record.run) } : {}), ...(record.runs ? { runs: record.runs.map(media) } : {}) })))
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
      await this.host.harnessComfyuiWorkbench.initializeWorkspace(request.workspaceId)
      const projection = await this.host.harnessComfyuiWorkbench.service.getProjection(request)
      signal.throwIfAborted()
      return { ...projection, runs: projection.runs.map(run => ({ ...run, media: run.media.map(media => ({ ...media, url: generationMediaContentUrl(media.media_id, run.session_id), download_url: generationMediaDownloadUrl(media.media_id, run.session_id) })) })) }
    })
  }
  async getTaskDraft(request: WorkbenchTaskDraftRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    return report(async () => {
      await this.host.harnessComfyuiWorkbench.initializeWorkspace(request.workspaceId)
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
for (const name of ['queryRecords', 'importImages', 'resolveImages', 'translateStart', 'translateGet', 'translateCancel', 'getRunInput', 'getEnvironment', 'getProjection', 'getInputDescription', 'getTaskDraft', 'saveTaskDraft', 'mutate'] as const) {
  Remote(WorkbenchRemoteService.prototype[name] as never, { private: false, static: false, name,
    addInitializer(initialize: (this: WorkbenchRemoteService) => void) { initializers.push(service => initialize.call(service)) },
  } as never)
}
