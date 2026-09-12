import definition from '../../config/source-cli-guidance.json' with { type: 'json' }
import { shellQuote } from '../cli/help.mjs'
import { parseSourceGuidance } from './guidance-schema.mjs'
const guidance = parseSourceGuidance(definition)
function text(kind, key, options = {}) {
  const values = { cli: kind === 'source' ? `node ${shellQuote(process.argv[1])}` : guidance[kind].invocation,
    url: shellQuote(options.url), port: shellQuote(options.port), path: shellQuote(options.path), id: shellQuote(options.resultId) }
  return guidance[kind][key].replace(/\{(\w+)\}/g, (_, name) => values[name])
}
export function helpGuidance(kind) { return `\n${text(kind, 'help')}\n` }
export function sourceNext(kind, options, result) {
  if (options.quiet) return
  let key = options.discoveryJson ? 'discovery' : kind === 'semantic' ? options.businessArguments.mode : options.command
  if (kind === 'semantic' && key === 'search') {
    if (Array.isArray(result?.results) && result.results.length === 0) key = 'searchEmpty'
    else {
      const id = Array.isArray(result?.results) ? result.results[0]?.id : undefined
      if ((typeof id === 'string' && id.length > 0) || (typeof id === 'number' && Number.isFinite(id))) options = { ...options, resultId: id }
      else key = 'searchUnstructured'
    }
  }
  if (kind === 'source' && !options.discoveryJson) {
    if (result === null || (Array.isArray(result) && result.length === 0)) key = 'empty'
    else if (typeof result?.id !== 'string' && typeof result?.id !== 'number') key = 'unstructured'
  }
  process.stderr.write(`NEXT: ${text(kind, key, options)}\n`)
}
export function sourceErrorNext(kind, error) {
  const detail = error?.code === 'INVALID_ARGUMENT' ? JSON.stringify(error.message) + '. ' : ''
  process.stderr.write(`\nNEXT: ${detail}${text(kind, 'error')}\n`)
}

export function renderedHelp(kind, name, body) {
  const invocation = kind === 'source' ? `node ${shellQuote(process.argv[1])}` : guidance[kind].invocation
  return body.replaceAll(name, invocation) + helpGuidance(kind)
}
