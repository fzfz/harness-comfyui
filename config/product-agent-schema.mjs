import Schema from '@deepseek-ai/schemastery'

const presetId = Schema.string().pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).required()
const relativePath = Schema.string().pattern(/^(?=.*\S)(?![\\/])(?![a-z]:)(?!.*\u0000).+$/iu).required()

export const ProductAgentConfigurationSchema = Schema.object({
  schemaVersion: Schema.const(4).required(),
  preset: Schema.object({
    id: presetId,
    sourceRootRelativePath: relativePath,
  }).required(),
})

function rejectUnknownFields(value, schema, path) {
  if (schema.type === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const unknownFields = Object.keys(value).filter(key => !Object.hasOwn(schema.dict, key))
    if (unknownFields.length > 0) {
      throw new TypeError(`${path} contains unknown field${unknownFields.length === 1 ? '' : 's'}: ${unknownFields.join(', ')}`)
    }
    for (const key of Object.keys(schema.dict)) {
      if (Object.hasOwn(value, key)) rejectUnknownFields(value[key], schema.dict[key], `${path}.${key}`)
    }
  }
}

export function parseProductAgentConfiguration(value) {
  try {
    rejectUnknownFields(value, ProductAgentConfigurationSchema, 'product Agent configuration')
    const configuration = Schema.resolve(structuredClone(value), ProductAgentConfigurationSchema, {}, true)[0]

    return configuration
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new TypeError(`product Agent configuration validation failed: ${message}`, { cause: error })
  }
}
