import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apply, inject } from '../../src/agent/plugin.ts'
import { registerProjectTools } from '../../src/host/tools/register-project-tools.ts'

var actualRegisterProjectTools: typeof registerProjectTools

vi.mock('../../src/host/tools/register-project-tools.ts', async () => {
  const actual = await vi.importActual<typeof import('../../src/host/tools/register-project-tools.ts')>('../../src/host/tools/register-project-tools.ts')
  actualRegisterProjectTools = actual.registerProjectTools
  return {
    ...actual,
    registerProjectTools: vi.fn(actual.registerProjectTools),
  }
})

type AgentContextFixture = {
  effect(execute: () => () => void, label?: string): unknown
  tools: {
    restrict(filter: unknown): () => void
    register(definition: unknown): () => void
  }
}

describe('harness-comfyui Agent plugin', () => {
  beforeEach(() => {
    vi.mocked(registerProjectTools).mockImplementation((...args) => actualRegisterProjectTools(...args))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('declares the public Cordis Tools service required by the Agent plugin', () => {
    expect(inject).toEqual(['tools'])
  })

  it('restricts inherited tools before applying the empty project Tool set', () => {
    const calls: string[] = []
    let disposeEffect: (() => void) | undefined
    const context: AgentContextFixture = {
      effect(execute, label) {
        calls.push(`effect:${label}`)
        disposeEffect = execute()
        return disposeEffect
      },
      tools: {
        restrict(filter) {
          calls.push(`restrict:${JSON.stringify(filter)}`)
          return () => calls.push('dispose:restriction')
        },
        register() {
          calls.push('register:project-tool')
          return () => calls.push('dispose:project-tool')
        },
      },
    }

    apply(context as never)

    expect(calls).toEqual([
      'effect:project Agent Tool registry',
      'restrict:{"allow":[]}',
    ])

    disposeEffect?.()

    expect(calls).toEqual([
      'effect:project Agent Tool registry',
      'restrict:{"allow":[]}',
      'dispose:restriction',
    ])
  })

  it('releases the restriction exactly once and preserves a registration failure', () => {
    const registrationError = new Error('project Tool registration failed')
    vi.mocked(registerProjectTools).mockImplementation(() => {
      throw registrationError
    })

    let restrictionDisposeCount = 0
    let projectDisposerCount = 0
    const context: AgentContextFixture = {
      effect(execute) {
        return execute()
      },
      tools: {
        restrict() {
          return () => {
            restrictionDisposeCount += 1
          }
        },
        register() {
          projectDisposerCount += 1
          return () => undefined
        },
      },
    }

    expect(() => apply(context as never)).toThrow(registrationError)
    expect(restrictionDisposeCount).toBe(1)
    expect(projectDisposerCount).toBe(0)
    expect(registerProjectTools).toHaveBeenCalledTimes(1)
  })
})
