import Schema from '@deepseek-ai/schemastery'
import { jsonObjectSchema, jsonValueSchema } from '../shared/json-contract.ts'

export const GENERATION_JSON_CONTRACT = Object.freeze({ keySchema: Schema.string().required() })
export const generationJsonValueSchema = jsonValueSchema(GENERATION_JSON_CONTRACT)
export const generationParametersSchema = jsonObjectSchema(GENERATION_JSON_CONTRACT)
