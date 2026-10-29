export { STANDARD_RUNTIME_PARAMETER_KINDS, type StandardRuntimeParameterKind } from '../../generation/inspection-contract.ts'

export const RUNTIME_PARAMETER_INPUT_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  positive_prompt: Object.freeze(['text', 'wildcard_text', 'prompt', 'positive']),
  negative_prompt: Object.freeze(['text', 'wildcard_text', 'prompt', 'negative']),
  width: Object.freeze(['width', 'width_override']),
  height: Object.freeze(['height', 'height_override']),
  seed: Object.freeze(['seed', 'noise_seed']),
  sampler_name: Object.freeze(['sampler_name', 'sampler']),
  resolution_preset: Object.freeze(['resolution', 'resolution_preset']),
  reference_image: Object.freeze(['image', 'reference_image']),
})
