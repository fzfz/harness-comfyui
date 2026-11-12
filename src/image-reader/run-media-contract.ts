import type { ContractReadonlyValue } from '#contracts'

export type GenerationRunMediaImage = ContractReadonlyValue<'generationRunMediaImage'>

export type AvailableGenerationRunMedia = Extract<GenerationRunMedia, { lookup_status: 'available' }>

export type FailedGenerationRunMedia = Extract<GenerationRunMedia, { lookup_status: 'error' }>

export type GenerationRunMedia = ContractReadonlyValue<'generationRunMedia'>

export type GenerationRunMediaResult = ContractReadonlyValue<'generationRunMediaResult'>
