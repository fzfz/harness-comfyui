import type { DetailsSlotProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

type GenerationResultsProps = Omit<DetailsSlotProps, 'renderSlot' | '__renders' | 'SessionProvider'>

/** Minimal details-slot contribution reserved for ComfyUI generation results. */
export function GenerationResultsPanel(_props: GenerationResultsProps): null {
  return null
}
