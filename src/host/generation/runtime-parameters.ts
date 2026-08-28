export const STANDARD_RUNTIME_PARAMETER_KINDS = Object.freeze([
  'positive_prompt',
  'negative_prompt',
  'width',
  'height',
  'seed',
  'cfg',
  'steps',
  'sampler_name',
  'scheduler',
  'denoise',
  'batch_size',
  'resolution_preset',
  'reference_image',
  'aspect_ratio',
  'megapixels',
] as const)

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

export type StandardRuntimeParameterKind = typeof STANDARD_RUNTIME_PARAMETER_KINDS[number]
