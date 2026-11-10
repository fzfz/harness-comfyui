import Schema from '@deepseek-ai/schemastery'
import { contractObject } from '../shared/field-contract.ts'

export const agentModelSchema = contractObject({
  provider: Schema.string().required(),
  model: Schema.string().required(),
  reasoningEffort: Schema.string().default(undefined as never),
}, { exact: true })
