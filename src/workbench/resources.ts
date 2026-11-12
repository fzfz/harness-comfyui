import { CATALOG_KIND_DEFINITIONS } from '../catalog/contract.ts'
import type { PromptResourceKind, PromptResourceRef, ResourceRef, TaskDraft } from './contract.ts'

export function isPromptResourceKind(kind: ResourceRef['kind']): kind is PromptResourceKind {
  return kind !== 'model' && kind !== 'lora' && kind !== 'comfyui-template'
}

export function promptResourceRefs(resources: readonly ResourceRef[]): PromptResourceRef[] {
  return resources.filter((resource): resource is PromptResourceRef => isPromptResourceKind(resource.kind)).map(({ kind, id }) => ({ kind, id }))
}

export const PROMPT_RESOURCE_KINDS = CATALOG_KIND_DEFINITIONS.map(definition => definition.kind).filter(isPromptResourceKind)

export function selectedResourceRefs(draft: Pick<TaskDraft, 'generation_input' | 'prompt_resource_refs'>): ResourceRef[] {
  const input = draft.generation_input
  return [
    ...(input.model ? [{ kind: 'model' as const, id: input.model.id }] : []),
    ...(input.template_id ? [{ kind: 'comfyui-template' as const, id: input.template_id }] : []),
    ...input.loras.map(lora => ({ kind: 'lora' as const, id: lora.id })),
    ...(draft.prompt_resource_refs ?? []),
  ]
}
