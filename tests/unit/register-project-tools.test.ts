import { describe, expect, it } from 'vitest'

import { assertObjectJsonSchema, assertSupportedJsonSchema, defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { registerProjectTools } from '../../src/host/tools/register-project-tools.ts'

type ToolDefinitionFixture = {
  name?: string
  description?: string
  parameters?: Record<string, unknown>
  output?: {
    schema?: Record<string, unknown>
    render?: (...args: unknown[]) => unknown[]
  }
  execute?: (...args: unknown[]) => Promise<unknown>
}

type ToolsContextFixture = {
  tools: {
    register(definition: unknown): () => void
  }
}

const closedSchema = (): Record<string, unknown> => ({
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
})

function definition(name: string, overrides: ToolDefinitionFixture = {}): ToolDefinitionFixture {
  return {
    name,
    description: `${name} description`,
    parameters: closedSchema(),
    output: {
      schema: closedSchema(),
      render: () => [],
    },
    execute: async () => ({}),
    ...overrides,
  }
}

function createContext(
  register: (definition: unknown) => () => void,
): ToolsContextFixture {
  return { tools: { register } }
}

function register(
  context: ToolsContextFixture,
  definitions: readonly (ToolDefinitionFixture | ToolDefinition)[],
): () => void {
  return registerProjectTools(
    context as never,
    definitions as unknown as readonly ToolDefinition[],
  )
}

describe('registerProjectTools', () => {
  it('accepts a public defineTool definition with its open parameter root', () => {
    const publicDefinition = defineTool({
      name: 'public-definition',
      description: 'Definition created through the public Harness helper',
      parameters: {
        prompt: { type: 'string', required: true },
      },
      output: {
        schema: {
          type: 'object',
          properties: { accepted: { type: 'boolean', required: true } },
          additionalProperties: false,
        },
        render: () => [],
      },
      execute: async () => ({ accepted: true }),
    })
    assertObjectJsonSchema(publicDefinition.parameters)
    assertSupportedJsonSchema(publicDefinition.output.schema)
    expect(publicDefinition.parameters).not.toHaveProperty('additionalProperties')

    const calls: string[] = []
    const context = createContext((value) => {
      calls.push((value as ToolDefinitionFixture).name!)
      return () => undefined
    })

    register(context, [publicDefinition])

    expect(calls).toEqual(['public-definition'])
  })

  it('registers valid definitions in the supplied stable order', () => {
    const calls: string[] = []
    const context = createContext((value) => {
      calls.push((value as ToolDefinitionFixture).name!)
      return () => undefined
    })

    register(context, [definition('first'), definition('second'), definition('third')])

    expect(calls).toEqual(['first', 'second', 'third'])
  })

  it.each([
    ['blank name', definition('   '), 'name'],
    ['blank description', definition('valid', { description: '  ' }), 'description'],
    ['missing input schema', definition('valid', { parameters: undefined }), 'input schema'],
    ['invalid input schema', definition('valid', { parameters: { ...closedSchema(), additionalProperties: 'invalid' } }), 'input schema'],
    ['missing output schema', definition('valid', { output: undefined }), 'output schema'],
    ['invalid output schema', definition('valid', { output: { schema: { ...closedSchema(), additionalProperties: 'invalid' }, render: () => [] } }), 'output schema'],
  ])('rejects %s before calling Harness register', (_caseName, invalidDefinition, errorText) => {
    const calls: unknown[] = []
    const context = createContext((value) => {
      calls.push(value)
      return () => undefined
    })

    expect(() => register(context, [invalidDefinition])).toThrow(errorText)
    expect(calls).toHaveLength(0)
  })

  it('rejects duplicate names before calling the duplicate Harness register', () => {
    const calls: string[] = []
    const context = createContext((value) => {
      calls.push((value as ToolDefinitionFixture).name!)
      return () => undefined
    })

    expect(() => register(context, [definition('same'), definition('same')])).toThrow('duplicate')
    expect(calls).toEqual([])
  })

  it('disposes already registered definitions in reverse order when a later registration fails', () => {
    const calls: string[] = []
    let registrationCount = 0
    const context = createContext((value) => {
      const name = (value as ToolDefinitionFixture).name!
      registrationCount += 1
      calls.push(`register:${name}`)
      if (registrationCount === 3) throw new Error('third registration failed')
      return () => calls.push(`dispose:${name}`)
    })

    expect(() => register(context, [definition('first'), definition('second'), definition('third')])).toThrow(
      'third registration failed',
    )
    expect(calls).toEqual([
      'register:first',
      'register:second',
      'register:third',
      'dispose:second',
      'dispose:first',
    ])
  })

  it('reports registration and rollback failures while attempting remaining reverse cleanup', () => {
    const calls: string[] = []
    const registrationError = new Error('third registration failed')
    const cleanupError = new Error('second cleanup failed')
    let registrationCount = 0
    const context = createContext((value) => {
      const name = (value as ToolDefinitionFixture).name!
      registrationCount += 1
      calls.push(`register:${name}`)
      if (registrationCount === 3) throw registrationError
      return () => {
        calls.push(`dispose:${name}`)
        if (name === 'second') throw cleanupError
      }
    })

    let thrown: unknown
    try {
      register(context, [definition('first'), definition('second'), definition('third')])
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AggregateError)
    expect(thrown).toMatchObject({ message: 'project Tool registration and rollback failed' })
    expect((thrown as AggregateError).errors).toEqual([registrationError, cleanupError])
    expect(calls).toEqual([
      'register:first',
      'register:second',
      'register:third',
      'dispose:second',
      'dispose:first',
    ])
  })

  it('returns an idempotent disposer that unregisters all definitions in reverse order', () => {
    const calls: string[] = []
    const context = createContext((value) => {
      const name = (value as ToolDefinitionFixture).name!
      calls.push(`register:${name}`)
      return () => calls.push(`dispose:${name}`)
    })

    const dispose = register(context, [definition('first'), definition('second'), definition('third')])
    dispose()
    dispose()

    expect(calls).toEqual([
      'register:first',
      'register:second',
      'register:third',
      'dispose:third',
      'dispose:second',
      'dispose:first',
    ])
  })
})
