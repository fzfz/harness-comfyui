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

export type StandardRuntimeParameterKind = typeof STANDARD_RUNTIME_PARAMETER_KINDS[number]
