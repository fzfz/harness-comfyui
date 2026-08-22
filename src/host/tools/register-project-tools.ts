import type { Context } from '@deepseek-ai/cordis'
import {
  assertObjectJsonSchema,
  assertSupportedJsonSchema,
  type ToolDefinition,
} from '@deepseek-ai/dsh-tools'

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertSchema(
  assertion: (value: unknown) => void,
  value: unknown,
  label: string,
): void {
  try {
    assertion(value)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new TypeError(`${label} is invalid: ${detail}`)
  }
}

function validateDefinition(definition: ToolDefinition, index: number, names: Set<string>): void {
  if (!isObject(definition)) throw new TypeError(`project Tool definition ${index} must be an object`)

  const name = definition.name
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new TypeError(`project Tool definition ${index} must have a non-empty name`)
  }
  if (names.has(name)) throw new TypeError(`duplicate project Tool name: ${name}`)
  names.add(name)

  if (typeof definition.description !== 'string' || definition.description.trim().length === 0) {
    throw new TypeError(`project Tool ${name} must have a non-empty description`)
  }

  assertSchema(assertObjectJsonSchema, definition.parameters, `project Tool ${name} input schema`)
  const output = definition.output
  if (!isObject(output)) throw new TypeError(`project Tool ${name} output schema is required`)
  assertSchema(assertSupportedJsonSchema, output.schema, `project Tool ${name} output schema`)
}

function disposeInReverse(disposers: Array<() => void>): void {
  let firstError: unknown
  for (let index = disposers.length - 1; index >= 0; index -= 1) {
    try {
      disposers[index]!()
    } catch (error) {
      firstError ??= error
    }
  }
  if (firstError !== undefined) throw firstError
}

/**
 * Register all project-owned Tools through the single Harness registration seam.
 * The returned disposer is safe to call more than once and unregisters in reverse order.
 */
export function registerProjectTools(
  ctx: Context,
  definitions: readonly ToolDefinition[],
): () => void {
  const names = new Set<string>()
  for (const [index, definition] of definitions.entries()) {
    validateDefinition(definition, index, names)
  }

  const disposers: Array<() => void> = []
  try {
    for (const definition of definitions) {
      disposers.push(ctx.tools.register(definition))
    }
  } catch (error) {
    try {
      disposeInReverse(disposers)
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'project Tool registration and rollback failed')
    }
    throw error
  }

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    disposeInReverse(disposers)
  }
}
