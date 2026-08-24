import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { validateSourceRuntime } from './contract.mjs'
import { redactSensitiveLine } from './process.mjs'

const LOG_SOURCES = Object.freeze(['stdout', 'stderr', 'operations'])
const SOURCE_PATHS = Object.freeze({
  stdout: runtime => join(runtime.paths.logDirectory, 'host.stdout.log'),
  stderr: runtime => join(runtime.paths.logDirectory, 'host.stderr.log'),
  operations: runtime => join(runtime.runtimeRoot, 'state/operations.jsonl'),
})

function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`)
  return value
}

function normalizeOptions(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('logs options must be an object')
  }
  if (!['stdout', 'stderr', 'operations', 'all'].includes(options.source)) {
    throw new Error('logs source must be stdout, stderr, operations, or all')
  }
  const lines = requirePositiveInteger(options.lines, 'logs lines')
  if (options.transformLine !== undefined && typeof options.transformLine !== 'function') {
    throw new Error('logs transformLine must be a function')
  }
  return {
    source: options.source,
    lines,
    follow: options.follow === true,
    transformLine: options.transformLine ?? ((_source, line) => line),
  }
}

function selectedSources(source) {
  return source === 'all' ? [...LOG_SOURCES] : [source]
}

function splitLines(text) {
  const lines = text.split(/\r?\n/u)
  if (lines.at(-1) === '') lines.pop()
  return lines
}

async function readBuffer(path) {
  try {
    return await readFile(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return Buffer.alloc(0)
    throw error
  }
}

function writeLines(source, lines, transformLine) {
  for (const line of lines) process.stdout.write(`[${source}] ${redactSensitiveLine(transformLine(source, line))}\n`)
}

async function readInitialSource(path, lines) {
  const buffer = await readBuffer(path)
  const text = buffer.toString('utf8')
  return {
    offset: buffer.length,
    pending: '',
    lines: splitLines(text).slice(-lines),
  }
}

async function readAppendedSource(path, cursor) {
  const buffer = await readBuffer(path)
  const offset = buffer.length < cursor.offset ? 0 : cursor.offset
  const appended = buffer.subarray(offset).toString('utf8')
  cursor.offset = buffer.length
  if (appended.length === 0) return []
  const lines = `${cursor.pending}${appended}`.split(/\r?\n/u)
  cursor.pending = lines.pop() ?? ''
  return lines
}

async function followSources(runtime, sources, cursors, transformLine) {
  return new Promise((resolveResult, rejectResult) => {
    let stopped = false
    let polling = false
    const timer = setInterval(() => {
      if (stopped || polling) return
      polling = true
      Promise.all(sources.map(async source => {
        const lines = await readAppendedSource(SOURCE_PATHS[source](runtime), cursors.get(source))
        writeLines(source, lines, transformLine)
      })).then(() => {
        polling = false
      }, error => {
        polling = false
        stop()
        rejectResult(error)
      })
    }, 50)

    const stop = () => {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
      for (const source of sources) {
        const pending = cursors.get(source)?.pending
        if (pending) writeLines(source, [pending], transformLine)
      }
      resolveResult()
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
}

export async function runSourceLogs(input, options) {
  const runtime = validateSourceRuntime(input)
  const normalizedOptions = normalizeOptions(options)
  const sources = selectedSources(normalizedOptions.source)
  const cursors = new Map()
  for (const source of sources) {
    const initial = await readInitialSource(SOURCE_PATHS[source](runtime), normalizedOptions.lines)
    cursors.set(source, initial)
    writeLines(source, initial.lines, normalizedOptions.transformLine)
  }
  if (normalizedOptions.follow) {
    await followSources(runtime, sources, cursors, normalizedOptions.transformLine)
  }
  return {
    stage: 'logs',
    status: 'passed',
    source: normalizedOptions.source,
    lines: normalizedOptions.lines,
    follow: normalizedOptions.follow,
  }
}
