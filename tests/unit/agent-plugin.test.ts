import { describe, expect, it } from 'vitest'

import { apply } from '../../src/agent/plugin.ts'

type AgentContextFixture = {
  effect(execute: () => () => void, label?: string): unknown
  tools: {
    restrict(filter: unknown): () => void
    register(definition: unknown): () => void
  }
}

describe('harness-comfyui Agent plugin', () => {
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
})
