import Schema from '@deepseek-ai/schemastery'

export const cliParameterFileKeySchema = Schema.string().min(1).required()

export function registerCliRequestId(requestIds: Set<string>, value: string, label: string): string {
  const requestId = value.toLowerCase()
  if (requestIds.has(requestId)) throw new TypeError(`${label} request_id duplicates ${requestId}`)
  requestIds.add(requestId)
  return requestId
}

export function cliParameterFiles(value: unknown, parameters: Readonly<Record<string, unknown>>, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} parameter_files must be an object`)
  }
  const files = value as Record<string, unknown>
  for (const [parameter, path] of Object.entries(files)) {
    try { Schema.resolve(parameter, cliParameterFileKeySchema, {}) }
    catch { throw new TypeError(`${label} parameter_files requires a parameter ID`) }
    if (Object.hasOwn(parameters, parameter)) {
      throw new TypeError(`${label} parameter ${parameter} is present in both parameters and parameter_files (${String(path)})`)
    }
  }
  return files
}
