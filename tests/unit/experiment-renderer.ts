import type React from 'react'
import { vi } from 'vitest'

export interface ExperimentTestNode {
  readonly type: unknown
  readonly parent: ExperimentTestNode | null
  readonly props: Record<string, any>
  readonly children: readonly (ExperimentTestNode | string)[]
  findByType(type: string): ExperimentTestNode
  findByProps(props: Record<string, unknown>): ExperimentTestNode
  findAllByType(type: string): ExperimentTestNode[]
  findAllByProps(props: Record<string, unknown>): ExperimentTestNode[]
}
interface Renderer {
  readonly root: ExperimentTestNode
  unmount(): void
  toJSON(): unknown
}
export const { act, create } = (await vi.importActual('react-test-renderer')) as {
  act: (callback: () => void | Promise<void>) => Promise<void>
  create: (node: React.ReactElement) => Renderer
}
