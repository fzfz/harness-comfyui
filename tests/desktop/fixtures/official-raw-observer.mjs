import { createRawTraceObserver } from './official-raw-capture.mjs'

export const name = 'isolated-raw-trace-observer'

export function apply(ctx, config) {
  const observer = createRawTraceObserver(config)
  ctx.on('tools/result', (exec, result) => { observer.observeToolResult(exec, result) })
  ctx.on('llm/stream', (options, next) => {
    observer.observeModelRequest(options)
    return next()
  })
  ctx.effect(() => () => { observer.flush() }, 'Isolated raw trace evidence')
}
