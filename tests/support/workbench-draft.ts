import type { TaskDraft } from '../../src/workbench/contract.ts'
import type { WorkbenchScope } from '../../src/workbench-remote.ts'

import type { WorkbenchRemoteService } from '../../src/host/workbench/remote-service.ts'

export async function saveFixtureDraft(
  remote: Pick<WorkbenchRemoteService, 'getProjection' | 'mutate'>,
  scope: WorkbenchScope,
  edit: (draft: TaskDraft) => void,
  signal: AbortSignal,
  metadata: { name?: string; expectedName?: string; originalRequest?: string; expectedOriginalRequest?: string } = {},
) {
  const projection = await remote.getProjection(scope, signal)
  const branch = projection.branches.find(item => item.branch_id === scope.branchId)!
  const draft = structuredClone(branch.editing_draft ?? branch.draft)
  edit(draft)
  return remote.mutate({ ...scope, type: 'save-draft', value: { expected: branch.draft, expectedEditingDraft: branch.editing_draft, draft, ...metadata } }, signal)
}
