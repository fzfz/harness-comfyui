import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apply, inject } from '../../src/agent/plugin.ts'
import { registerProjectTools } from '../../src/host/tools/register-project-tools.ts'

vi.mock('../../src/host/tools/register-project-tools.ts', async () => {
  const actual = await vi.importActual<typeof import('../../src/host/tools/register-project-tools.ts')>('../../src/host/tools/register-project-tools.ts')
  return {
    ...actual,
    registerProjectTools: vi.fn(),
  }
})

type AgentContextFixture = {
  effect(execute: () => () => void, label?: string): unknown
  tools: {
    register(definition: unknown): () => void
  }
}

describe('harness-comfyui Agent plugin', () => {
  beforeEach(() => {
    vi.mocked(registerProjectTools).mockReturnValue(() => undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('declares the public Cordis Tools service required by the Agent plugin', () => {
    expect(inject).toEqual(['tools'])
  })

  it('registers the empty project Tool set directly in the Agent scope', () => {
    const calls: string[] = []
    let disposeEffect: (() => void) | undefined
    const context: AgentContextFixture = {
      effect(execute, label) {
        calls.push(`effect:${label}`)
        disposeEffect = execute()
        return disposeEffect
      },
      tools: {
        register() {
          calls.push('register:project-tool')
          return () => calls.push('dispose:project-tool')
        },
      },
    }

    apply(context as never)

    expect(calls).toEqual(['effect:project Agent Tool registry'])
    expect(registerProjectTools).toHaveBeenCalledWith(context, [])

    disposeEffect?.()

    expect(calls).toEqual(['effect:project Agent Tool registry'])
  })

  it('disposes the project registration and preserves a registration failure', () => {
    const disposeProjectTools = vi.fn()
    vi.mocked(registerProjectTools).mockReturnValue(disposeProjectTools)

    let disposeEffect: (() => void) | undefined
    const context: AgentContextFixture = {
      effect(execute) {
        disposeEffect = execute()
        return disposeEffect
      },
      tools: {
        register() {
          throw new Error('the plugin must use registerProjectTools')
        },
      },
    }

    apply(context as never)
    disposeEffect?.()

    expect(disposeProjectTools).toHaveBeenCalledTimes(1)
  })

  it('propagates a project registration failure without touching unrelated Tool filters', () => {
    const registrationError = new Error('project Tool registration failed')
    vi.mocked(registerProjectTools).mockImplementation(() => {
      throw registrationError
    })

    const context: AgentContextFixture = {
      effect(execute) {
        return execute()
      },
      tools: {
        register() {
          return () => undefined
        },
      },
    }

    expect(() => apply(context as never)).toThrow(registrationError)
    expect(registerProjectTools).toHaveBeenCalledTimes(1)
  })
})
