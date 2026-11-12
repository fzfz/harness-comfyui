import type { JsonValue } from '#contracts'
import type { ContractReadonlyValue } from '#contracts'




export const MAX_RUN_INPUT_QUERY_IDS = 20
export const MIN_RUN_INPUT_ID_PREFIX_LENGTH = 8

export type GenerationRunInputRequest = ContractReadonlyValue<'cliRunIds'> extends infer Ids ? { readonly run_ids: Ids } : never

export type GenerationRunInputError = ContractReadonlyValue<'generationRunError'>

export type GenerationRunInputLora = ContractReadonlyValue<'generationRunInputLora'>

export type GenerationRunInputModel = ContractReadonlyValue<'generationRunInputModel'>

export type GenerationRunInputArguments = ContractReadonlyValue<'generationRunInputArguments'>

export type AvailableWorkflowGenerationRunInput = Extract<GenerationRunInput, { lookup_status: 'available'; workflow_status: 'available' }>

export type UnavailableWorkflowGenerationRunInput = Extract<GenerationRunInput, { lookup_status: 'available'; workflow_status: 'unavailable' }>

export type AvailableGenerationRunInput = Extract<GenerationRunInput, { lookup_status: 'available' }>

export type FailedGenerationRunInput = Extract<GenerationRunInput, { lookup_status: 'error' }>

export type GenerationRunInput = ContractReadonlyValue<'generationRunInput'>

export type GenerationRunInputResult = ContractReadonlyValue<'generationRunInputResult'>
