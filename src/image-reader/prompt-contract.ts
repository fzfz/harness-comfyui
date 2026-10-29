import Schema from '@deepseek-ai/schemastery'

export const IMAGE_READER_PROMPT_MAX_LENGTH = 32_768
export const imageReaderPromptSchema = Schema.string().min(1).max(IMAGE_READER_PROMPT_MAX_LENGTH).pattern(/\S/u)

export function imageReaderPromptIssue(value: unknown): 'required' | 'too-long' | undefined {
  const pattern = imageReaderPromptSchema.meta.pattern!
  if (typeof value !== 'string' || !new RegExp(pattern.source, pattern.flags).test(value)) return 'required'
  if (value.length > imageReaderPromptSchema.meta.max!) return 'too-long'
  return undefined
}
