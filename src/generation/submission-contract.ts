import type { ContractReadonlyValue } from '#contracts'

export const GENERATION_ACCEPTANCE_STATUSES = ['accepted', 'reused'] as const
export const RANDOM_SEED_MAX_EXCLUSIVE = 2 ** 31

export type GenerationLoraSelection = GenerationRequest['loras'][number]

export type GenerationModelSelection = NonNullable<GenerationRequest['model']>

export type GenerationRequest = ContractReadonlyValue<'generationRequest'>

export type GenerationImageUpload = import('../workbench/contract.ts').ImageUpload

export interface GenerationSubmissionItem {
  readonly requestId: string
  readonly request: GenerationRequest
}

export type GenerationSubmissionResult = ContractReadonlyValue<'generationSubmissionResult'>

export const GENERATION_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
