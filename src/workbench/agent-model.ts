import type { AgentModel, WorkbenchModelGroup } from './contract.ts'
import selection from './agent-model-selection.json' with { type: 'json' }

export function agentModelProblem(selectionModel: AgentModel, groups: readonly WorkbenchModelGroup[], routableProviders: readonly string[]): string {
  const provider = groups.find(item => item.id === selectionModel.provider)
  if (!provider) return selection.messages.providerMissing
  if (!routableProviders.includes(provider.id)) return selection.messages.providerUnroutable
  const model = provider.models.find(item => item.id === selectionModel.model)
  if (!model) return selection.messages.modelMissing
  const efforts = model.reasoning?.efforts ?? []
  if (efforts.length && !efforts.some(item => item.id === selectionModel.reasoningEffort)) return selection.messages.effortUnsupported
  if (!efforts.length && selectionModel.reasoningEffort !== undefined) return selection.messages.effortUnavailable
  return ''
}
