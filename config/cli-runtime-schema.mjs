import Schema from '@deepseek-ai/schemastery'

const relativePath = Schema.string().pattern(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))\S+$/u).required()
export const CliRuntimeSchema = Schema.object({
  profile: Schema.string().pattern(/^[a-z0-9-]+$/u).required(),
  runtimeRelativeRoot: relativePath,
  environmentFile: relativePath,
  configurationProfile: Schema.const('production').required(),
  runtimePaths: Schema.dict(relativePath).required(),
})
export function parseCliRuntime(value) {
  return Schema.resolve(value, CliRuntimeSchema, {}, true)[0]
}
