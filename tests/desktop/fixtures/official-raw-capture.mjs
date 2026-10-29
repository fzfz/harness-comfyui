import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { TextDecoder } from 'node:util'
import { brotliDecompressSync, constants as zlibConstants, gunzipSync, inflateSync } from 'node:zlib'
import { createTraceEvidenceWriter, evidenceSecretsFromEnvironment } from './official-trace-evidence.mjs'

const desktopConfig = JSON.parse(readFileSync(new URL('../../../config/desktop-e2e.json', import.meta.url), 'utf8'))
export function rawCaptureConfiguration(config = desktopConfig) {
  return { ...config.rawCapture, host: config.ports.host }
}

function evidenceDirectory(path, repositoryRoot = resolve(import.meta.dirname, '../../..')) {
  if (!isAbsolute(path)) throw new TypeError('Raw capture outputDirectory must be an absolute path under this checkout .local directory')
  const root = resolve(repositoryRoot, '.local')
  const target = resolve(path)
  const child = relative(root, target)
  if (!child || child === '..' || child.startsWith('..' + sep) || isAbsolute(child)) throw new TypeError('Raw capture outputDirectory must remain under this checkout .local directory')
  for (let path = target; path !== dirname(path); path = dirname(path)) {
    try { if (lstatSync(path).isSymbolicLink()) throw new TypeError('Raw capture paths must not contain symbolic links') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  mkdirSync(target, { recursive: true, mode: 0o700 })
  return target
}

function atomicBytes(path, bytes) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = path + '.' + randomUUID() + '.tmp'
  let descriptor
  try {
    descriptor = openSync(temporary, 'wx', 0o600)
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    renameSync(temporary, path)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    try { unlinkSync(temporary) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}

function decodedBody(bytes, encoding = 'identity') {
  if (encoding === 'identity') return { bytes, complete: true }
  const decode = encoding === 'gzip' ? gunzipSync : encoding === 'deflate' ? inflateSync : encoding === 'br' ? brotliDecompressSync : null
  if (!decode) return { bytes: null, complete: false, code: 'BODY_ENCODING_UNSUPPORTED' }
  try { return { bytes: decode(bytes), complete: true } } catch (error) {
    if (error.code === 'Z_BUF_ERROR') {
      try {
        const prefix = decode(bytes, { finishFlush: encoding === 'br' ? zlibConstants.BROTLI_OPERATION_FLUSH : zlibConstants.Z_SYNC_FLUSH })
        if (prefix.length) return { bytes: prefix, complete: false, code: error.code }
      } catch {}
    }
    return { bytes: null, complete: false, code: error.code ?? 'BODY_DECODING_FAILED' }
  }
}

function createRawWriter(options) {
  const captureConfig = options.captureConfig ?? rawCaptureConfiguration(options.config)
  const directory = evidenceDirectory(options.outputDirectory, options.repositoryRoot)
  const secrets = new Set(options.secrets ?? evidenceSecretsFromEnvironment())
  const writer = createTraceEvidenceWriter({ directory, secrets: [...secrets] })
  const failures = []
  const fail = (source, error) => { failures.push({ source, code: error.code ?? 'CAPTURE_WRITE_FAILED', errorType: error.name ?? 'Error' }) }
  const headers = value => {
    for (const [name, item] of Object.entries(value)) {
      if (!captureConfig.sensitiveHeaders.includes(name.toLowerCase())) continue
      for (const text of Array.isArray(item) ? item : [item]) {
        if (typeof text !== 'string' || !text) continue
        secrets.add(text)
        if (/^Bearer\s+/iu.test(text)) secrets.add(text.replace(/^Bearer\s+/iu, ''))
        if (/cookie/iu.test(name)) for (const part of text.split(';')) {
          const equals = part.indexOf('=')
          if (equals >= 0 && part.slice(equals + 1).trim()) secrets.add(part.slice(equals + 1).trim())
        }
      }
    }
    writer.redactor.collect({ authorization: [...secrets] })
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name,
      captureConfig.sensitiveHeaders.includes(name.toLowerCase()) ? '[REDACTED]' : item]))
  }
  const json = (filename, value) => {
    try { return writer.writeJson(filename, value).path }
    catch (error) { fail(filename, error); return null }
  }
  const bytes = (filename, value, encoding, { messageComplete = true, decoded = decodedBody(value, encoding) } = {}) => {
    const body = { wireBytes: value.length, messageComplete, decoding: { complete: decoded.complete,
      decodedBytes: decoded.bytes?.length ?? 0, ...(decoded.code ? { code: decoded.code } : {}) } }
    if (!decoded.bytes) {
      failures.push({ source: filename, code: decoded.code, encoding })
      return { path: null, ...body, savedBytes: 0, redaction: null }
    }
    let safe = decoded.bytes
    let redaction
    try {
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(decoded.bytes)
      const result = writer.redactor.redactWithReport(text)
      safe = Buffer.from(result.value)
      redaction = result.report
    } catch {
      let replacements = 0
      for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
        const needle = Buffer.from(secret)
        for (let offset = safe.indexOf(needle); offset !== -1; offset = safe.indexOf(needle, offset + 10)) {
          safe = Buffer.concat([safe.subarray(0, offset), Buffer.from('[REDACTED]'), safe.subarray(offset + needle.length)])
          replacements++
        }
      }
      redaction = { replacements, binaryKnownSecretsOnly: true }
    }
    const storedEncoding = redaction.replacements || !decoded.complete ? 'identity' : encoding ?? 'identity'
    if (!redaction.replacements && decoded.complete) safe = value
    try {
      const path = join(directory, filename)
      atomicBytes(path, safe)
      return { path, ...body, savedBytes: safe.length, storedEncoding, redaction }
    } catch (error) {
      fail(filename, error)
      return { path: null, ...body, savedBytes: 0, redaction }
    }
  }
  return { directory, json, bytes, headers, failures, redactor: writer.redactor }
}

function forwardedHeaders(headers, host, captureConfig) {
  const excluded = new Set(captureConfig.hopHeaders)
  for (const value of String(headers.connection ?? '').split(',')) excluded.add(value.trim().toLowerCase())
  const result = Object.fromEntries(Object.entries(headers).filter(([name]) => !excluded.has(name.toLowerCase())))
  if (host) result.host = host
  return result
}

function sseEvents(bytes) {
  const source = bytes.toString('utf8').replace(/^\uFEFF/u, '').replace(/\r\n|\r/gu, '\n')
  const frames = source.split(/\n{2,}/u)
  return frames.filter(Boolean).map((text, index, events) => {
    const data = text.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /u, '')).join('\n')
    let value
    try { value = JSON.parse(data) } catch { value = null }
    return { index, text, data, value, complete: frames.at(-1) === '' || index < events.length - 1 }
  })
}

function jsonBody(bytes) {
  try { return JSON.parse(bytes.toString('utf8')) } catch { return null }
}

function toolCallIds(value, result = new Set()) {
  if (value?.type === 'tool-call' && typeof value.id === 'string') result.add(value.id)
  if (Array.isArray(value)) for (const item of value) toolCallIds(item, result)
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (['tool_call_id', 'toolCallId', 'callId'].includes(key) && typeof item === 'string') result.add(item)
      else if (key === 'tool_calls' && Array.isArray(item)) for (const call of item) { if (typeof call.id === 'string') result.add(call.id) }
      else toolCallIds(item, result)
    }
  }
  return [...result].sort()
}

export async function startRawTraceCapture(options) {
  const captureConfig = options.captureConfig ?? rawCaptureConfiguration(options.config)
  const upstream = new URL(options.upstreamBaseUrl)
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.search || upstream.hash) throw new TypeError('upstreamBaseUrl must be an HTTP(S) base URL without credentials, query or fragment')
  const writer = createRawWriter({ ...options, captureConfig })
  const requests = []
  const active = new Set()
  let stopped = false
  let stopPromise
  const server = createServer((incoming, outgoing) => {
    if (stopped) { outgoing.writeHead(503); outgoing.end(); return }
    const requestId = randomUUID()
    const prefix = join(captureConfig.filenames.requests, requestId)
    const record = { requestId, startedAt: new Date().toISOString(), terminal: null, chunks: [],
      request: { method: incoming.method, path: incoming.url, headers: writer.headers(incoming.headers) }, response: null }
    requests.push(record)
    const requestChunks = []
    const responseChunks = []
    let requestEnded = false
    let finished = false
    let upstreamResponse
    let settle
    const done = new Promise(resolve => { settle = resolve })
    const target = new URL(upstream)
    const incomingUrl = new URL(incoming.url, 'http://127.0.0.1')
    const basePath = upstream.pathname.replace(/\/$/u, '')
    if (incomingUrl.pathname !== basePath && !incomingUrl.pathname.startsWith(basePath + '/')) {
      outgoing.writeHead(404); outgoing.end(); record.terminal = 'route-rejected'; settle(); return
    }
    target.pathname = incomingUrl.pathname
    target.search = incomingUrl.search
    const upstreamRequest = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, {
      method: incoming.method, headers: forwardedHeaders(incoming.headers, target.host, captureConfig),
    })
    const finish = terminal => {
      if (finished) return
      finished = true
      record.terminal = terminal
      record.finishedAt = new Date().toISOString()
      record.requestComplete = requestEnded
      const requestBytes = Buffer.concat(requestChunks)
      const responseBytes = Buffer.concat(responseChunks)
      const requestDecoded = decodedBody(requestBytes, incoming.headers['content-encoding'])
      const requestDocument = jsonBody(requestDecoded.bytes)
      record.requestModel = requestDocument?.model ?? null
      record.toolCallIds = toolCallIds(requestDocument)
      const responseDecoded = decodedBody(responseBytes, upstreamResponse?.headers['content-encoding'])
      const responseDocument = jsonBody(responseDecoded.bytes)
      record.responseModel = responseDocument?.model ?? null
      record.responseToolCallIds = toolCallIds(responseDocument)
      record.requestBody = writer.bytes(join(prefix, captureConfig.filenames.requestBody), requestBytes, incoming.headers['content-encoding'],
        { messageComplete: requestEnded, decoded: requestDecoded })
      record.responseBody = writer.bytes(join(prefix, captureConfig.filenames.responseBody), responseBytes, upstreamResponse?.headers['content-encoding'],
        { messageComplete: terminal === 'completed', decoded: responseDecoded })
      if (String(upstreamResponse?.headers['content-type']).includes('text/event-stream') && record.responseBody.path) {
        const events = sseEvents(responseDecoded.bytes)
        record.responseModel = events.map(event => event.value?.model).find(Boolean) ?? null
        record.responseToolCallIds = [...new Set(events.flatMap(event => toolCallIds(event.value)))].sort()
        record.sseIndexPath = writer.json(join(prefix, captureConfig.filenames.sseIndex), { source: record.responseBody, events })
      }
      record.metadataPath = writer.json(join(prefix, captureConfig.filenames.requestMetadata), record)
      active.delete(operation)
      settle()
    }
    const operation = { done, abort() { finish('capture-stopped'); upstreamResponse?.destroy(); upstreamRequest.destroy(); incoming.destroy(); outgoing.destroy() } }
    active.add(operation)
    incoming.on('data', chunk => {
      requestChunks.push(Buffer.from(chunk))
      record.chunks.push({ direction: 'request', sequence: record.chunks.length, bytes: chunk.length, receivedAt: new Date().toISOString() })
    })
    incoming.on('end', () => { requestEnded = true })
    incoming.on('aborted', () => { finish('client-cancelled'); upstreamRequest.destroy() })
    incoming.on('error', () => { finish('client-failed'); upstreamRequest.destroy() })
    outgoing.on('close', () => {
      if (!outgoing.writableFinished && !finished) { finish('client-cancelled'); upstreamResponse?.destroy(); upstreamRequest.destroy() }
    })
    upstreamRequest.on('response', response => {
      upstreamResponse = response
      record.response = { statusCode: response.statusCode, statusMessage: response.statusMessage, headers: writer.headers(response.headers) }
      outgoing.writeHead(response.statusCode, response.statusMessage, forwardedHeaders(response.headers, undefined, captureConfig))
      response.on('data', chunk => {
        responseChunks.push(Buffer.from(chunk))
        record.chunks.push({ direction: 'response', sequence: record.chunks.length, bytes: chunk.length, receivedAt: new Date().toISOString() })
      })
      response.on('end', () => { if (Object.keys(response.trailers).length) outgoing.addTrailers(forwardedHeaders(response.trailers, undefined, captureConfig)); finish('completed') })
      response.on('aborted', () => { finish('upstream-disconnected'); outgoing.destroy() })
      response.on('error', () => { finish('upstream-failed'); outgoing.destroy() })
      response.pipe(outgoing)
    })
    upstreamRequest.on('error', error => {
      if (finished) return
      record.upstreamError = { code: error.code ?? 'UPSTREAM_ERROR' }
      if (!outgoing.headersSent) outgoing.writeHead(502)
      outgoing.end()
      finish('upstream-failed')
    })
    incoming.pipe(upstreamRequest)
  })
  server.listen(0, captureConfig.host)
  await once(server, 'listening')
  const port = server.address().port
  const baseURL = `http://${captureConfig.host}:${port}${upstream.pathname.replace(/\/$/u, '')}`
  const state = { schemaVersion: 1, captureId: randomUUID(), baseURL, upstreamBaseUrl: upstream.href, directory: writer.directory, startedAt: new Date().toISOString() }
  writer.json(captureConfig.filenames.state, state)
  let officialIndexPath = null
  const collect = async (options = {}) => {
    if (options.officialIndexPath !== undefined) officialIndexPath = options.officialIndexPath
    await Promise.all([...active].map(item => item.done))
    const storageMissing = []
    const observations = readRawObservations(writer.directory, storageMissing, captureConfig)
    try {
      const observerIndex = JSON.parse(readFileSync(join(writer.directory, captureConfig.filenames.observerIndex), 'utf8'))
      storageMissing.push(...observerIndex.missing.map(item => ({ ...item, source: 'observer-storage' })))
    } catch (error) {
      if (error.code !== 'ENOENT') storageMissing.push({ source: 'observer-storage', code: error.code ?? 'OBSERVER_INDEX_INVALID' })
    }
    const observationMissing = [...storageMissing, ...observations.flatMap(item => (item.missing ?? []).map(missing => ({ ...missing, observationId: item.observationId, sessionId: item.sessionId, callId: item.callId })))]
    const index = { ...state, collectedAt: new Date().toISOString(), stopped, requests, officialIndexPath,
      observations, missing: [...writer.failures, ...observationMissing], correlations: correlateRawRequests(requests, observations, captureConfig),
      source: { sessions: 'official-session-export', requestBodies: 'loopback-http-forwarder', responseBodies: 'loopback-http-forwarder', toolResults: 'read-only-tools/result-observer' } }
    const indexPath = writer.json(captureConfig.filenames.index, index)
    index.missing = [...writer.failures, ...observationMissing]
    return { indexPath, index }
  }
  return { ...state, captureConfig, collect, stop() {
    if (!stopPromise) stopPromise = (async () => {
      stopped = true
      const closed = new Promise(resolve => server.close(resolve))
      for (const operation of active) operation.abort()
      server.closeAllConnections()
      await closed
      const result = await collect()
      return { ...result, portReleased: !server.listening }
    })()
    return stopPromise
  } }
}

export function createRawTraceObserver(options) {
  const captureConfig = options.captureConfig ?? rawCaptureConfiguration(options.config)
  const writer = createRawWriter({ ...options, captureConfig })
  const observations = []
  const record = value => {
    try {
      const redacted = writer.redactor.redactWithReport(value)
      const safe = { ...redacted.value, sequence: observations.length, redaction: redacted.report }
      writer.json(join(captureConfig.filenames.observations, safe.observationId + '.json'), safe)
      observations.push(safe)
      writer.json(captureConfig.filenames.observerIndex, { observations: observations.map(item => item.observationId), missing: writer.failures })
    } catch (error) {
      writer.failures.push({ source: value.kind, code: 'OBSERVER_CAPTURE_FAILED', errorType: error.name ?? 'Error' })
    }
  }
  return {
    observeModelRequest(options) {
      const { signal, ...request } = options
      record({ kind: 'model-request-options', observationId: randomUUID(), observedAt: new Date().toISOString(),
        sessionId: options.sessionId ?? null, purpose: options.purpose ?? null, request })
    },
    observeToolResult(exec, result) {
      const observationId = randomUUID()
      const spills = []
      const missing = []
      for (const channel of ['stdout', 'stderr']) {
        const spillPath = result.value?.[channel]?.spillPath
        if (typeof spillPath !== 'string') {
          if (result.value?.[channel]?.truncated === true) missing.push({ channel, source: 'spill', code: 'TRUNCATED_OUTPUT_WITHOUT_SPILL' })
          continue
        }
        try {
          const copy = writer.bytes(join(captureConfig.filenames.spills, observationId, channel + '.bin'), readFileSync(spillPath))
          spills.push({ channel, originalPath: spillPath, copy })
        } catch (error) {
          missing.push({ channel, source: 'spill', code: error.code ?? 'SPILL_READ_FAILED' })
        }
      }
      if (exec.name === 'bash' && (result.isError || result.value?.exitCode === undefined)) {
        missing.push({ source: 'bash-process-terminal', code: 'BASH_STRUCTURED_RESULT_UNAVAILABLE' })
      }
      record({ kind: 'tool-result', observationId, observedAt: new Date().toISOString(),
        sessionId: exec.agent?.session?.id ?? exec.agent?.id ?? null, agentId: exec.agent?.id ?? null,
        callId: exec.callId, rootCallId: exec.rootCallId ?? exec.callId, toolName: exec.name,
        arguments: exec.arguments, result, spills, missing })
    },
    flush() {
      return { observations, missing: [...writer.failures],
        indexPath: writer.json(captureConfig.filenames.observerIndex, { observations: observations.map(item => item.observationId), missing: writer.failures }) }
    },
  }
}

export function readRawObservations(directory, missing = [], captureConfig = rawCaptureConfiguration()) {
  const path = join(directory, captureConfig.filenames.observations)
  let filenames
  try { filenames = readdirSync(path).filter(name => name.endsWith('.json')).sort() }
  catch (error) {
    if (error.code !== 'ENOENT') missing.push({ source: 'observer-storage', code: error.code ?? 'OBSERVER_DIRECTORY_READ_FAILED' })
    return []
  }
  return filenames.flatMap(name => {
    try { return [JSON.parse(readFileSync(join(path, name), 'utf8'))] }
    catch (error) { missing.push({ source: 'observer-storage', filename: name, code: error.code ?? 'OBSERVER_RECORD_INVALID' }); return [] }
  })
}

export function correlateRawRequests(requests, observations, captureConfig = rawCaptureConfiguration()) {
  return requests.map(request => {
    const headerSessions = captureConfig.sessionHeaders.flatMap(name => {
      const value = request.request.headers[name]
      return typeof value === 'string' ? [value] : []
    })
    const returnedIds = request.responseToolCallIds ?? []
    const identityIds = returnedIds.length ? returnedIds : request.toolCallIds ?? []
    const toolMatches = observations.filter(observation => observation.kind === 'tool-result' && identityIds.includes(observation.callId))
    const candidates = [...new Set([...headerSessions, ...toolMatches.map(item => item.sessionId).filter(Boolean)])]
    return { requestId: request.requestId, status: candidates.length === 1 ? 'unique-session' : candidates.length ? 'ambiguous' : 'unresolved',
      sessionId: candidates.length === 1 ? candidates[0] : null, candidateSessionIds: candidates,
      basis: { sessionHeaders: headerSessions, toolResultIds: toolMatches.map(item => item.observationId) },
      logicalRequestId: null, logicalRequestCoverage: 'provider request has no injected correlation identifier' }
  })
}
