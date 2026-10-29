export const GENERATION_RUN_STATUSES = [
  'created', 'prepared', 'submitting', 'submission_unknown', 'remote_pending',
  'remote_running', 'downloading', 'succeeded', 'failed', 'cancelling', 'cancelled',
] as const

export type GenerationRunStatus = typeof GENERATION_RUN_STATUSES[number]

export const GENERATION_RUN_TERMINAL_STATUSES = ['succeeded', 'failed', 'cancelled', 'submission_unknown'] as const satisfies readonly GenerationRunStatus[]

export function isGenerationRunTerminal(status: GenerationRunStatus): boolean {
  return (GENERATION_RUN_TERMINAL_STATUSES as readonly GenerationRunStatus[]).includes(status)
}
