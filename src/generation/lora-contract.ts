import Schema from '@deepseek-ai/schemastery'

export const LORA_WEIGHT_ROLE = 'finite-lora-weight'
export const LORA_TRIGGER_WORDS_ROLE = 'unique-lora-trigger-words'
export const LORA_TRIGGER_WORDS_MAX_COUNT = 100

export function isLoraWeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export const loraWeightSchema = Schema.transform(Schema.number().required(), value => {
  if (!isLoraWeight(value)) throw new TypeError('LoRA weight is invalid')
  return value
}, true).required().role(LORA_WEIGHT_ROLE)

export function loraTriggerWordsAreUnique(words: readonly string[]): boolean {
  return new Set(words).size === words.length
}
