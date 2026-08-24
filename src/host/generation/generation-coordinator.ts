import type { GenerationRuntime } from './generation-runtime.ts'

export interface GenerationCoordinatorOptions {
  readonly runtime: Pick<GenerationRuntime, 'advance'>
  readonly pollIntervalMs: number
  readonly onError?: (error: unknown) => void
}

export class GenerationCoordinator {
  private readonly options: GenerationCoordinatorOptions
  private controller: AbortController | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private running: Promise<void> | undefined

  constructor(options: GenerationCoordinatorOptions) {
    this.options = options
    if (!Number.isSafeInteger(options.pollIntervalMs) || options.pollIntervalMs < 1) {
      throw new TypeError('Generation coordinator poll interval is invalid.')
    }
  }

  start(): void {
    if (this.controller !== undefined) return
    this.controller = new AbortController()
    this.schedule(0)
  }

  async stop(): Promise<void> {
    const controller = this.controller
    this.controller = undefined
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    controller?.abort()
    try {
      await this.running
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error
    }
  }

  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      this.timer = undefined
      const controller = this.controller
      if (controller === undefined) return
      const running = this.options.runtime.advance(controller.signal)
      this.running = running
      void running
        .catch(error => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) this.options.onError?.(error)
        })
        .finally(() => {
          if (this.running === running) this.running = undefined
          if (this.controller === controller) this.schedule(this.options.pollIntervalMs)
        })
    }, delay)
  }
}
