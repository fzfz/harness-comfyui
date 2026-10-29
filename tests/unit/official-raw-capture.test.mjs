import { afterEach, expect, it } from 'vitest'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { startRawTraceCapture } from '../desktop/fixtures/official-raw-capture.mjs'

const cleanup = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

it('propagates client cancellation and records partial streamed bytes', async () => {
  let disconnected
  const upstreamClosed = new Promise(resolve => { disconnected = resolve })
  const url = await upstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: first\n\n')
    res.on('close', disconnected)
  })
  const capture = await startRawTraceCapture({ upstreamBaseUrl: url, outputDirectory: await directory() })
  cleanup.push(() => capture.stop())
  await new Promise((resolve, reject) => {
    const call = request(capture.baseURL + '/chat/completions', { method: 'POST' }, res => {
      res.once('data', () => { res.destroy(); resolve() })
    })
    call.on('error', reject)
    call.end('{"model":"test"}')
  })
  await upstreamClosed
  const { index } = await capture.collect()
  expect(index.requests[0].terminal).toBe('client-cancelled')
  expect(await readFile(index.requests[0].responseBody.path, 'utf8')).toBe('data: first\n\n')
  expect(await capture.stop()).toMatchObject({ portReleased: true })
})

it('retains structured Bash results and spills without modifying the input objects', async () => {
  const { createRawTraceObserver } = await import('../desktop/fixtures/official-raw-capture.mjs')
  const outputDirectory = await directory()
  const spill = join(outputDirectory, 'original-spill.txt')
  const { writeFile } = await import('node:fs/promises')
  await writeFile(spill, 'complete stdout\n')
  const observer = createRawTraceObserver({ outputDirectory })
  const exec = Object.freeze({ agent: Object.freeze({ id: 'child-session' }), callId: 'call-7', rootCallId: 'call-7', name: 'bash', arguments: Object.freeze({ command: 'example' }) })
  const value = Object.freeze({ exitCode: 7, signal: null, timedOut: false, cancelled: false,
    stdout: Object.freeze({ text: 'complete', truncated: true, spillPath: spill }), stderr: Object.freeze({ text: 'problem', truncated: false }) })
  const result = Object.freeze({ isError: false, content: Object.freeze([]), value })
  observer.observeToolResult(exec, result)
  expect(result.value).toBe(value)
  const flushed = observer.flush()
  expect(flushed.observations).toHaveLength(1)
  const record = flushed.observations[0]
  expect(record).toMatchObject({ sessionId: 'child-session', callId: 'call-7', result: { value: { exitCode: 7, signal: null, timedOut: false, cancelled: false, stdout: { text: 'complete', truncated: true }, stderr: { text: 'problem', truncated: false } } } })
  expect(await readFile(record.spills[0].copy.path, 'utf8')).toBe('complete stdout\n')
})

it('correlates concurrent identical inputs by returned tool call identities and records shared identities as ambiguous', async () => {
  const { createRawTraceObserver } = await import('../desktop/fixtures/official-raw-capture.mjs')
  const outputDirectory = await directory()
  const observer = createRawTraceObserver({ outputDirectory })
  let call = 0
  const url = await upstream((req, res) => {
    const callId = ['call-a', 'call-b'][call++]
    res.setHeader('content-type', 'text/event-stream')
    res.end('data: ' + JSON.stringify({ id: 'response-' + callId, choices: [{ delta: { tool_calls: [{ index: 0, id: callId, type: 'function', function: { name: 'bash', arguments: '{}' } }] } }] }) + '\n\ndata: [DONE]\n\n')
  })
  const capture = await startRawTraceCapture({ upstreamBaseUrl: url, outputDirectory })
  cleanup.push(() => capture.stop())
  await Promise.all(['a', 'b'].map(async suffix => {
    const response = await fetch(capture.baseURL + '/chat/completions', { method: 'POST', body: '{"model":"same","messages":[{"role":"user","content":"same"}]}' })
    await response.text()
    observer.observeToolResult({ callId: 'call-' + suffix, name: 'bash', arguments: {}, agent: { id: 'session-' + suffix } }, { isError: false, value: { exitCode: 0 } })
  }))
  observer.flush()
  const { index } = await capture.collect()
  expect(index.correlations.map(item => item.sessionId).sort()).toEqual(['session-a', 'session-b'])
  expect(index.correlations.every(item => item.status === 'unique-session')).toBe(true)
  observer.observeToolResult({ callId: 'call-a', name: 'bash', arguments: {}, agent: { id: 'other-session' } }, { isError: false, value: { exitCode: 0 } })
  const ambiguous = await capture.collect()
  expect(ambiguous.index.correlations.find(item => item.candidateSessionIds.includes('other-session'))).toMatchObject({ status: 'ambiguous', sessionId: null })
})

it('patches only the selected provider and restores temporary profile fields after independent edits', async () => {
  const { prepareRawCaptureProfile } = await import('../desktop/fixtures/official-raw-capture-profile.mjs')
  const { writeFile } = await import('node:fs/promises')
  const config = JSON.parse(await readFile(new URL('../../config/desktop-e2e.json', import.meta.url), 'utf8'))
  const originalRows = structuredClone(config.modes.development.initialProfilePatches)
  const providers = originalRows.find(row => row.id === 'llm-pi-ai').config.providers
  providers['lan-gpt'].models = [{ id: 'gpt-6.1-terra', maxTokens: 8192 }]
  providers.visual = { baseURL: 'https://visual.example/v1', models: [{ id: 'visual' }] }
  const adapter = { parse: JSON.parse, serialize: value => JSON.stringify(value), updateProfilePatch: value => value }
  const outputDirectory = await directory()
  const profilePath = join(outputDirectory, 'profile.json')
  const capture = { baseURL: 'http://127.0.0.1:12345/v1', directory: outputDirectory }
  const prepared = await prepareRawCaptureProfile({ config, capture, providerId: 'lan-gpt', profilePatchAdapter: adapter })
  const patched = await prepared.profilePatchAdapter.updateProfilePatch(originalRows, {})
  const selected = patched.find(row => row.id === 'llm-pi-ai').config.providers
  expect(selected['lan-gpt']).toMatchObject({ baseURL: capture.baseURL, models: [{ id: 'gpt-6.1-terra', maxTokens: 8192 }] })
  expect(selected.visual).toEqual(providers.visual)
  expect(patched.some(row => row.insert?.some(entry => entry.id === 'isolated-raw-trace-observer'))).toBe(true)
  selected['lan-gpt'].maxTokens = 7777
  await writeFile(profilePath, JSON.stringify(patched))
  await prepared.restore({ profilePath })
  const restored = JSON.parse(await readFile(profilePath, 'utf8'))
  expect(restored.some(row => row.id === 'isolated-raw-trace-observer')).toBe(false)
  expect(restored.find(row => row.id === 'llm-pi-ai').config.providers['lan-gpt']).toMatchObject({ baseURL: providers['lan-gpt'].baseURL, maxTokens: 7777, models: [{ id: 'gpt-6.1-terra', maxTokens: 8192 }] })
  expect(config.modes.development.initialProfilePatches).not.toEqual(patched)
})

it('keeps the official model stream and tool results unchanged when used as a plugin', async () => {
  const { apply } = await import('../desktop/fixtures/official-raw-observer.mjs')
  const handlers = new Map()
  let dispose
  apply({ on: (name, handler) => handlers.set(name, handler), effect: setup => { dispose = setup() } }, { outputDirectory: await directory() })
  const stream = Object.freeze({ async *[Symbol.asyncIterator]() { yield { type: 'finish' } } })
  const options = Object.freeze({ provider: 'lan-gpt', model: 'test', sessionId: 'session-1', messages: Object.freeze([]) })
  expect(handlers.get('llm/stream')(options, () => stream)).toBe(stream)
  const result = Object.freeze({ isError: true, error: Object.freeze({ message: 'cancelled' }) })
  expect(handlers.get('tools/result')({ callId: 'cancel-1', name: 'bash', arguments: {}, agent: { id: 'session-1' } }, result)).toBeUndefined()
  await dispose()
})

it('preserves non-success status and response bytes and records upstream disconnects', async () => {
  let calls = 0
  const url = await upstream((req, res) => {
    if (++calls === 1) { res.writeHead(429, { 'retry-after': '2' }); res.end('{"error":"quota"}'); return }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: partial\n\n')
    setTimeout(() => res.destroy(), 10)
  })
  const capture = await startRawTraceCapture({ upstreamBaseUrl: url, outputDirectory: await directory() })
  cleanup.push(() => capture.stop())
  const rejected = await fetch(capture.baseURL + '/chat/completions', { method: 'POST', body: '{}' })
  expect(rejected.status).toBe(429)
  expect(rejected.headers.get('retry-after')).toBe('2')
  expect(await rejected.text()).toBe('{"error":"quota"}')
  const broken = await fetch(capture.baseURL + '/chat/completions', { method: 'POST', body: '{}' })
  await expect(broken.text()).rejects.toThrow()
  const { index } = await capture.collect()
  expect(index.requests.map(item => item.terminal)).toEqual(['completed', 'upstream-disconnected'])
  expect(await readFile(index.requests[1].responseBody.path, 'utf8')).toBe('data: partial\n\n')
})

it('reports write failures while forwarding remains successful and closes active upstream calls', async () => {
  const { writeFile } = await import('node:fs/promises')
  const outputDirectory = await directory()
  const url = await upstream((req, res) => { res.writeHead(200); res.end('ok') })
  const capture = await startRawTraceCapture({ upstreamBaseUrl: url, outputDirectory })
  cleanup.push(() => capture.stop())
  await writeFile(join(outputDirectory, 'requests'), 'directory collision')
  const result = await fetch(capture.baseURL + '/chat/completions', { method: 'POST', body: '{}' })
  expect(await result.text()).toBe('ok')
  const evidence = await capture.collect()
  expect(evidence.index.missing.some(item => item.source.endsWith('request.bin') && typeof item.code === 'string')).toBe(true)
  expect(evidence.index.requests[0].requestBody.path).toBeNull()
  expect(await capture.stop()).toMatchObject({ portReleased: true })
  const activeUrl = await upstream((req, res) => { res.writeHead(200); res.write('partial') })
  const active = await startRawTraceCapture({ upstreamBaseUrl: activeUrl, outputDirectory: await directory() })
  cleanup.push(() => active.stop())
  const response = await fetch(active.baseURL + '/chat/completions', { method: 'POST', body: '{}' })
  const reading = response.text().catch(() => undefined)
  const stopped = await active.stop()
  await reading
  expect(stopped).toMatchObject({ portReleased: true })
  expect(stopped.index.requests[0].terminal).toBe('capture-stopped')
})

it('redacts secrets spanning response chunks and reports missing Bash terminal values', async () => {
  const { createRawTraceObserver } = await import('../desktop/fixtures/official-raw-capture.mjs')
  const outputDirectory = await directory()
  const url = await upstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: {"content":"keep secret-')
    setImmediate(() => res.end('value end"}\n\ndata: [DONE]\n\n'))
  })
  const capture = await startRawTraceCapture({ upstreamBaseUrl: url, outputDirectory, secrets: ['secret-value'] })
  cleanup.push(() => capture.stop())
  const response = await fetch(capture.baseURL + '/chat/completions', { method: 'POST', body: '{}' })
  expect(await response.text()).toContain('secret-value')
  const observer = createRawTraceObserver({ outputDirectory })
  observer.observeToolResult({ agent: { id: 'cancelled-session' }, callId: 'cancelled', name: 'bash', arguments: {} }, { isError: true, error: { message: 'aborted' } })
  const { index } = await capture.collect()
  expect(await readFile(index.requests[0].responseBody.path, 'utf8')).toContain('keep [redacted] end')
  expect(index.requests[0].responseBody.redaction.replacements).toBeGreaterThan(0)
  expect(index.missing.some(item => item.code === 'BASH_STRUCTURED_RESULT_UNAVAILABLE' && item.callId === 'cancelled')).toBe(true)
})

it('preserves the installed official Provider request and outcome through the forwarder', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const config = JSON.parse(await readFile(new URL('../../config/desktop-e2e.json', import.meta.url), 'utf8'))
  const outputDirectory = await directory()
  const { stdout } = await promisify(execFile)(join(config.application.bundlePath, config.application.executableRelativePath), [
    new URL('../desktop/fixtures/official-raw-provider-runtime.mjs', import.meta.url).pathname,
    join(config.application.bundlePath, 'Contents/Resources/app.asar/dsh/package.json'), outputDirectory,
  ], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 15000, maxBuffer: 1024 * 1024 })
  expect(JSON.parse(stdout)).toMatchObject({ requestBodiesEqual: true, outcomesEqual: true, authorizationMatches: true,
    requestCount: 2, forwardedRequestCount: 1, model: 'gpt-6.1-terra', portReleased: true })
}, 20000)

it('keeps prepared probe configuration valid and installs the observer through the explicit initial adapter hook', async () => {
  const { prepareRawCaptureProfile } = await import('../desktop/fixtures/official-raw-capture-profile.mjs')
  const { parseDesktopE2EConfig } = await import('../../config/desktop-e2e-schema.mjs')
  const config = JSON.parse(await readFile(new URL('../../config/desktop-e2e.json', import.meta.url), 'utf8'))
  const capture = { baseURL: 'http://127.0.0.1:12345/v1', directory: await directory() }
  const adapter = { parse: JSON.parse, serialize: JSON.stringify, updateProfilePatch: value => value }
  const prepared = await prepareRawCaptureProfile({ config, capture, providerId: 'lan-gpt', profilePatchAdapter: adapter })
  expect(() => parseDesktopE2EConfig(prepared.config)).not.toThrow()
  expect(prepared.config.modes.development.initialProfilePatches.some(row => row.name)).toBe(false)
  const initialized = await prepared.profilePatchAdapter.updateInitialProfilePatch(config.modes.development.initialProfilePatches)
  const { applyEntryPatches } = await import('@deepseek-ai/cordis-plugin-include')
  const warnings = []
  const mounted = applyEntryPatches([{ id: 'llm-pi-ai', name: 'provider', config: {} }, { id: 'agent-default-model', name: 'default' }], initialized, message => warnings.push(message))
  expect(mounted.find(row => row.id === config.rawCapture.observer.entryId)?.name).toContain('official-raw-observer.mjs')
  expect(warnings).toEqual([])
})

it('reports observer storage failures through the capture index without changing model dispatch', async () => {
  const { writeFile } = await import('node:fs/promises')
  const { createRawTraceObserver } = await import('../desktop/fixtures/official-raw-capture.mjs')
  const outputDirectory = await directory()
  const capture = await startRawTraceCapture({ upstreamBaseUrl: 'http://127.0.0.1:9/v1', outputDirectory })
  cleanup.push(() => capture.stop())
  await writeFile(join(outputDirectory, 'observations'), 'directory collision')
  const observer = createRawTraceObserver({ outputDirectory })
  expect(() => observer.observeModelRequest({ sessionId: 'write-failed', model: 'm', messages: [] })).not.toThrow()
  const result = await capture.collect()
  expect(result.index.missing.some(item => item.source === 'observer-storage')).toBe(true)
})

it('keeps compressed wire bytes when safe and records a decoded redaction when the body contains credentials', async () => {
  const { gzipSync } = await import('node:zlib')
  const safe = gzipSync(Buffer.from('data: {"content":"safe"}\n\ndata: [DONE]\n\n'))
  const secret = gzipSync(Buffer.from('data: {"content":"secret-zipped-key"}\n\ndata: [DONE]\n\n'))
  let calls = 0
  const url = await upstream((req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream', 'content-encoding': 'gzip' }); res.end(calls++ ? secret : safe) })
  const capture = await startRawTraceCapture({ upstreamBaseUrl: url, outputDirectory: await directory(), secrets: ['secret-zipped-key'] })
  cleanup.push(() => capture.stop())
  for (let call = 0; call < 2; call++) {
    const response = await fetch(capture.baseURL + '/chat/completions', { method: 'POST', body: '{}' })
    expect(await response.text()).toContain(call ? 'secret-zipped-key' : 'safe')
  }
  const { index } = await capture.collect()
  expect(await readFile(index.requests[0].responseBody.path)).toEqual(safe)
  expect(index.requests[0].responseBody.storedEncoding).toBe('gzip')
  expect(await readFile(index.requests[1].responseBody.path, 'utf8')).toContain('[redacted]')
  expect(index.requests[1].responseBody.storedEncoding).toBe('identity')
})

it('applies to an existing isolated Profile and survives default probe adapter updates before restoration', async () => {
  const { prepareRawCaptureProfile } = await import('../desktop/fixtures/official-raw-capture-profile.mjs')
  const { loadOfficialProfilePatchAdapter } = await import('../desktop/fixtures/official-profile-patch.mjs')
  const { writeFile } = await import('node:fs/promises')
  const config = JSON.parse(await readFile(new URL('../../config/desktop-e2e.json', import.meta.url), 'utf8'))
  const adapter = await loadOfficialProfilePatchAdapter(config)
  const outputDirectory = await directory()
  const profilePath = join(outputDirectory, 'cordis.patch.yml')
  const rows = [...structuredClone(config.modes.development.initialProfilePatches), { id: 'webserver', config: { host: '127.0.0.1', port: 12345 } }, { id: 'visual-model', config: { model: 'gpt-6.1-terra', maxTokens: 8192 } }]
  await writeFile(profilePath, await adapter.serialize(rows))
  const prepared = await prepareRawCaptureProfile({ config, capture: { baseURL: 'http://127.0.0.1:23456/v1', directory: outputDirectory }, providerId: 'lan-gpt', profilePatchAdapter: adapter })
  await prepared.applyToProfile({ profilePath })
  const first = await adapter.parse(await readFile(profilePath, 'utf8'))
  const restarted = await adapter.updateProfilePatch(first, { entryId: 'webserver', config: { host: '127.0.0.1', port: 34567 } })
  await writeFile(profilePath, await adapter.serialize(restarted))
  await prepared.restore({ profilePath })
  const restored = await adapter.parse(await readFile(profilePath, 'utf8'))
  expect(restored.find(row => row.id === 'webserver').config.port).toBe(34567)
  expect(restored.find(row => row.id === 'visual-model').config).toEqual({ model: 'gpt-6.1-terra', maxTokens: 8192 })
  expect(restored.find(row => row.id === 'llm-pi-ai').config.providers['lan-gpt'].baseURL).toBe(rows.find(row => row.id === 'llm-pi-ai').config.providers['lan-gpt'].baseURL)
  expect(restored.some(row => row.insert)).toBe(false)
})

it.each(['stop-command', 'stdin-eof'])('runs the capture in a separate process and restores the Profile after %s', async control => {
  const { spawn } = await import('node:child_process')
  const { createInterface } = await import('node:readline')
  const { writeFile } = await import('node:fs/promises')
  const { loadOfficialProfilePatchAdapter } = await import('../desktop/fixtures/official-profile-patch.mjs')
  const config = JSON.parse(await readFile(new URL('../../config/desktop-e2e.json', import.meta.url), 'utf8'))
  const adapter = await loadOfficialProfilePatchAdapter(config)
  const outputDirectory = await directory()
  const profilePath = join(outputDirectory, 'cordis.patch.yml')
  const rows = structuredClone(config.modes.development.initialProfilePatches)
  await writeFile(profilePath, await adapter.serialize(rows))
  const upstreamBaseUrl = rows.find(row => row.id === 'llm-pi-ai').config.providers['lan-gpt'].baseURL
  const child = spawn(process.execPath, [new URL('../../scripts/verification/run-raw-trace-capture.mjs', import.meta.url).pathname,
    'start', '--upstream', upstreamBaseUrl, '--provider-id', 'lan-gpt', '--profile', profilePath, '--output', outputDirectory], { stdio: ['pipe', 'pipe', 'pipe'] })
  const exited = once(child, 'exit')
  cleanup.push(async () => { if (child.exitCode === null) child.kill(); await exited })
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]()
  const started = JSON.parse((await lines.next()).value)
  expect(started).toMatchObject({ status: 'started', profilePath })
  const live = await adapter.parse(await readFile(profilePath, 'utf8'))
  expect(live.some(row => row.insert?.some(entry => entry.id === config.rawCapture.observer.entryId))).toBe(true)
  child.stdin.write(JSON.stringify({ command: 'collect' }) + '\n')
  expect(JSON.parse((await lines.next()).value)).toMatchObject({ status: 'collected', indexPath: join(outputDirectory, config.rawCapture.filenames.index) })
  if (control === 'stdin-eof') child.stdin.end()
  else child.stdin.write(JSON.stringify({ command: 'stop' }) + '\n')
  const stoppedLine = await Promise.race([lines.next(), new Promise(resolve => setTimeout(() => resolve(null), 500))])
  expect(stoppedLine).not.toBeNull()
  expect(JSON.parse(stoppedLine.value)).toMatchObject({ status: 'stopped', portReleased: true, restored: true })
  expect((await exited)[0]).toBe(0)
  expect(await adapter.parse(await readFile(profilePath, 'utf8'))).toEqual(rows)
})

it('accepts stop while collect waits for an active Provider response', async () => {
  const { PassThrough } = await import('node:stream')
  const { createInterface } = await import('node:readline')
  const { writeFile } = await import('node:fs/promises')
  const { serveRawTraceCapture } = await import('../../scripts/verification/run-raw-trace-capture.mjs')
  const { loadOfficialProfilePatchAdapter } = await import('../desktop/fixtures/official-profile-patch.mjs')
  let pendingResponse
  const upstreamBaseUrl = await upstream((request, response) => { pendingResponse = response; response.writeHead(200); response.write('open response') })
  const config = JSON.parse(await readFile(new URL('../../config/desktop-e2e.json', import.meta.url), 'utf8'))
  const adapter = await loadOfficialProfilePatchAdapter(config)
  const outputDirectory = await directory()
  const profilePath = join(outputDirectory, 'cordis.patch.yml')
  const rows = structuredClone(config.modes.development.initialProfilePatches)
  rows.find(row => row.id === config.rawCapture.observer.providerEntryId).config.providers['lan-gpt'].baseURL = upstreamBaseUrl
  await writeFile(profilePath, await adapter.serialize(rows))
  const input = new PassThrough()
  const output = new PassThrough()
  const lines = createInterface({ input: output })[Symbol.asyncIterator]()
  const serving = serveRawTraceCapture({ config, upstreamBaseUrl, outputDirectory, providerId: 'lan-gpt', profilePath, input, output })
  const started = JSON.parse((await lines.next()).value)
  const response = await fetch(started.baseURL + '/chat/completions', { method: 'POST', body: '{}' })
  const reading = response.text().catch(() => undefined)
  input.write('{"command":"collect"}\n{"command":"stop"}\n')
  let result
  try {
    result = await Promise.race([serving, new Promise(resolve => setTimeout(() => resolve(null), 500))])
  } finally {
    pendingResponse.end()
    input.end()
    await serving
    await reading
  }
  expect(result).toMatchObject({ status: 'stopped', restored: true, portReleased: true })
  const index = JSON.parse(await readFile(result.indexPath, 'utf8'))
  expect(index.requests[0].terminal).toBe('capture-stopped')
})

it('uses --config rawCapture overrides in forwarding, Profile registration, observer artifacts and collection', async () => {
  const { spawn } = await import('node:child_process')
  const { createInterface } = await import('node:readline')
  const { writeFile } = await import('node:fs/promises')
  const { loadOfficialProfilePatchAdapter } = await import('../desktop/fixtures/official-profile-patch.mjs')
  const { apply } = await import('../desktop/fixtures/official-raw-observer.mjs')
  const config = JSON.parse(await readFile(new URL('../../config/desktop-e2e.json', import.meta.url), 'utf8'))
  config.rawCapture.filenames = Object.fromEntries(Object.entries(config.rawCapture.filenames).map(([key, value]) => [key, 'selected-' + value]))
  config.rawCapture.observer = { entryId: 'selected-observer', providerEntryId: 'selected-provider' }
  config.rawCapture.sensitiveHeaders.push('x-selected-credential')
  config.rawCapture.hopHeaders.push('x-selected-hop')
  config.rawCapture.sessionHeaders = ['x-selected-session']
  config.modes.development.initialProfilePatches.find(row => row.id === 'llm-pi-ai').id = 'selected-provider'
  const outputDirectory = await directory()
  const configPath = join(outputDirectory, 'config.json')
  const profilePath = join(outputDirectory, 'cordis.patch.yml')
  const adapter = await loadOfficialProfilePatchAdapter(config)
  const rows = structuredClone(config.modes.development.initialProfilePatches)
  let received
  const upstreamBaseUrl = await upstream(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    received = { headers: request.headers, body: Buffer.concat(chunks) }
    response.writeHead(200, { 'content-type': 'text/event-stream', 'x-selected-credential': 'selected-response-secret' })
    response.end('data: {"content":"preserved response"}\n\ndata: [DONE]\n\n')
  })
  rows.find(row => row.id === config.rawCapture.observer.providerEntryId).config.providers['lan-gpt'].baseURL = upstreamBaseUrl
  await writeFile(profilePath, await adapter.serialize(rows))
  await writeFile(configPath, JSON.stringify(config))
  const child = spawn(process.execPath, [new URL('../../scripts/verification/run-raw-trace-capture.mjs', import.meta.url).pathname,
    'start', '--upstream', upstreamBaseUrl, '--provider-id', 'lan-gpt', '--profile', profilePath, '--output', outputDirectory, '--config', configPath], { stdio: ['pipe', 'pipe', 'pipe'] })
  const exited = once(child, 'exit')
  cleanup.push(async () => { if (child.exitCode === null) child.kill(); await exited })
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]()
  const started = JSON.parse((await lines.next()).value)
  expect(JSON.parse(await readFile(started.statePath, 'utf8')).captureId).toBe(started.captureId)
  expect(started.restorationPath).toBe(join(outputDirectory, config.rawCapture.filenames.profileRestoration))
  const patched = await adapter.parse(await readFile(profilePath, 'utf8'))
  const observer = patched.flatMap(row => row.insert ?? []).find(row => row.id === config.rawCapture.observer.entryId)
  expect(observer).toBeDefined()
  const handlers = new Map()
  let dispose
  apply({ on: (name, handler) => handlers.set(name, handler), effect: setup => { dispose = setup() } }, observer.config)
  const spillPath = join(outputDirectory, 'retained-output.txt')
  await writeFile(spillPath, 'retained stdout')
  handlers.get('tools/result')({ callId: 'selected-call', name: 'bash', agent: { id: 'selected-session' }, arguments: {} },
    { isError: false, value: { exitCode: 0, stdout: { text: 'retained', truncated: true, spillPath } } })
  const body = Buffer.from('{ "model":"same", "messages":[] }')
  const response = await fetch(started.baseURL + '/chat/completions', { method: 'POST', body,
    headers: { 'x-selected-credential': 'selected-request-secret', 'x-selected-session': 'selected-session', 'x-selected-hop': 'remove-hop' } })
  expect(await response.text()).toContain('preserved response')
  expect(received.body).toEqual(body)
  expect(received.headers['x-selected-credential']).toBe('selected-request-secret')
  expect(received.headers['x-selected-hop']).toBeUndefined()
  await dispose()
  child.stdin.write('{"command":"collect"}\n')
  const collected = JSON.parse((await lines.next()).value)
  expect(collected.indexPath).toBe(join(outputDirectory, config.rawCapture.filenames.index))
  const index = JSON.parse(await readFile(collected.indexPath, 'utf8'))
  expect(index.observations[0].callId).toBe('selected-call')
  expect(index.observations[0].spills[0].copy.path).toContain('/' + config.rawCapture.filenames.spills + '/')
  expect(index.correlations[0]).toMatchObject({ sessionId: 'selected-session', status: 'unique-session' })
  expect(index.requests[0].requestBody.path).toContain('/' + config.rawCapture.filenames.requests + '/')
  expect(await readFile(index.requests[0].metadataPath, 'utf8')).not.toContain('selected-request-secret')
  expect(await readFile(index.requests[0].metadataPath, 'utf8')).not.toContain('selected-response-secret')
  child.stdin.end()
  expect(JSON.parse((await lines.next()).value)).toMatchObject({ status: 'stopped', restored: true, portReleased: true })
  expect((await exited)[0]).toBe(0)
  expect(await adapter.parse(await readFile(profilePath, 'utf8'))).toEqual(rows)
})

it.each([
  ['stdin-eof', 'success'], ['stdin-eof', 'failure'],
  ['early-stop', 'success'], ['early-stop', 'failure'],
  ['initial-signal', 'success'], ['initial-signal', 'failure'],
])('cleans up after %s during delayed initialization: %s', async (control, initialization) => {
  const { PassThrough } = await import('node:stream')
  const { Server } = await import('node:http')
  const { vi } = await import('vitest')
  const { writeFile } = await import('node:fs/promises')
  const { serveRawTraceCapture } = await import('../../scripts/verification/run-raw-trace-capture.mjs')
  const { loadOfficialProfilePatchAdapter } = await import('../desktop/fixtures/official-profile-patch.mjs')
  const config = JSON.parse(await readFile(new URL('../../config/desktop-e2e.json', import.meta.url), 'utf8'))
  const adapter = await loadOfficialProfilePatchAdapter(config)
  const outputDirectory = await directory()
  const profilePath = join(outputDirectory, 'cordis.patch.yml')
  const rows = structuredClone(config.modes.development.initialProfilePatches)
  const upstreamBaseUrl = rows.find(row => row.id === config.rawCapture.observer.providerEntryId).config.providers['lan-gpt'].baseURL
  await writeFile(profilePath, await adapter.serialize(rows))
  const input = new PassThrough()
  const output = new PassThrough()
  const chunks = []
  const stopped = Promise.withResolvers()
  output.on('data', chunk => { chunks.push(chunk); if (JSON.parse(chunk.toString('utf8')).status === 'stopped') stopped.resolve() })
  const previousSignals = new Set(process.listeners('SIGINT'))
  const listen = Server.prototype.listen
  const delayedListen = vi.spyOn(Server.prototype, 'listen').mockImplementationOnce(function (...args) {
    setTimeout(() => listen.apply(this, args), 40)
    return this
  })
  const serving = serveRawTraceCapture({ config, upstreamBaseUrl, outputDirectory,
    providerId: initialization === 'failure' ? 'missing-provider' : 'lan-gpt', profilePath, input, output })
    .then(value => ({ value }), error => ({ error }))
  let outcome
  try {
    await new Promise(resolve => setTimeout(resolve, 10))
    if (control === 'stdin-eof') input.end()
    else if (control === 'early-stop') input.write('{"command":"stop"}\n')
    else process.listeners('SIGINT').find(listener => !previousSignals.has(listener))?.()
    outcome = await Promise.race([serving, new Promise(resolve => setTimeout(() => resolve(null), 500))])
  } finally {
    delayedListen.mockRestore()
    if (!outcome) {
      const signal = process.listeners('SIGINT').find(listener => !previousSignals.has(listener))
      signal?.()
      await stopped.promise
      if (signal) { process.off('SIGINT', signal); process.off('SIGTERM', signal) }
    } else await serving
  }
  expect(outcome).not.toBeNull()
  if (initialization === 'failure') expect(outcome.error?.message).toContain('missing-provider')
  else expect(outcome.value).toMatchObject({ status: 'stopped', restored: true, portReleased: true })
  const records = Buffer.concat(chunks).toString('utf8').trim().split('\n').map(JSON.parse)
  expect(records.at(-1)).toMatchObject({ status: 'stopped', restored: true, portReleased: true })
  expect(await adapter.parse(await readFile(profilePath, 'utf8'))).toEqual(rows)
  const state = JSON.parse(await readFile(join(outputDirectory, config.rawCapture.filenames.state), 'utf8'))
  await expect(fetch(state.baseURL + '/chat/completions', { method: 'POST', body: '{}' })).rejects.toThrow()
})

it.each(['stop', 'stdin-eof', 'SIGINT', 'SIGTERM'])('releases controller resources when final collection fails after %s', async control => {
  const { PassThrough } = await import('node:stream')
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { serveRawTraceCapture } = await import('../../scripts/verification/run-raw-trace-capture.mjs')
  const { loadOfficialProfilePatchAdapter } = await import('../desktop/fixtures/official-profile-patch.mjs')
  const config = JSON.parse(await readFile(new URL('../../config/desktop-e2e.json', import.meta.url), 'utf8'))
  const adapter = await loadOfficialProfilePatchAdapter(config)
  const outputDirectory = await directory()
  const profilePath = join(outputDirectory, 'cordis.patch.yml')
  const rows = structuredClone(config.modes.development.initialProfilePatches)
  const upstreamBaseUrl = rows.find(row => row.id === config.rawCapture.observer.providerEntryId).config.providers['lan-gpt'].baseURL
  await writeFile(profilePath, await adapter.serialize(rows))
  const input = new PassThrough()
  const output = new PassThrough()
  const signals = new Map(['SIGINT', 'SIGTERM'].map(name => [name, process.listeners(name)]))
  const started = once(output, 'data')
  const serving = serveRawTraceCapture({ config, upstreamBaseUrl, outputDirectory, providerId: 'lan-gpt', profilePath, input, output })
    .then(value => ({ value }), error => ({ error }))
  const record = JSON.parse((await started)[0].toString('utf8'))
  await mkdir(join(outputDirectory, config.rawCapture.filenames.observations), { recursive: true })
  await writeFile(join(outputDirectory, config.rawCapture.filenames.observations, 'invalid.json'), 'null')
  const collectionFailed = once(output, 'data')
  input.write('{"command":"collect"}\n')
  expect(JSON.parse((await collectionFailed)[0].toString('utf8')).status).toBe('command-failed')
  let outcome
  try {
    if (control === 'stop') input.write('{"command":"stop"}\n')
    else if (control === 'stdin-eof') input.end()
    else process.listeners(control).find(listener => !signals.get(control).includes(listener))()
    outcome = await Promise.race([serving, new Promise(resolve => setTimeout(() => resolve(null), 500))])
  } finally {
    input.end()
    await serving
  }
  expect(outcome).not.toBeNull()
  expect(outcome.error).toBeInstanceOf(TypeError)
  expect(outcome.error.message).toContain("reading 'missing'")
  for (const [name, listeners] of signals) expect(process.listeners(name)).toEqual(listeners)
  expect(input.listenerCount('data')).toBe(0)
  expect(await adapter.parse(await readFile(profilePath, 'utf8'))).toEqual(rows)
  await expect(fetch(record.baseURL + '/chat/completions', { method: 'POST', body: '{}' })).rejects.toThrow()
})

it.each(['initialization', 'profile-restoration'])('preserves %s and final collection errors together', async failure => {
  const { PassThrough } = await import('node:stream')
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { serveRawTraceCapture } = await import('../../scripts/verification/run-raw-trace-capture.mjs')
  const { loadOfficialProfilePatchAdapter } = await import('../desktop/fixtures/official-profile-patch.mjs')
  const config = JSON.parse(await readFile(new URL('../../config/desktop-e2e.json', import.meta.url), 'utf8'))
  const adapter = await loadOfficialProfilePatchAdapter(config)
  const outputDirectory = await directory()
  const profilePath = join(outputDirectory, 'cordis.patch.yml')
  const rows = structuredClone(config.modes.development.initialProfilePatches)
  const upstreamBaseUrl = rows.find(row => row.id === config.rawCapture.observer.providerEntryId).config.providers['lan-gpt'].baseURL
  await writeFile(profilePath, await adapter.serialize(rows))
  await mkdir(join(outputDirectory, config.rawCapture.filenames.observations), { recursive: true })
  await writeFile(join(outputDirectory, config.rawCapture.filenames.observations, 'invalid.json'), 'null')
  const input = new PassThrough()
  const signals = new Map(['SIGINT', 'SIGTERM'].map(name => [name, process.listeners(name)]))
  const output = new PassThrough()
  const started = once(output, 'data')
  const serving = serveRawTraceCapture({ config, upstreamBaseUrl, outputDirectory,
    providerId: failure === 'initialization' ? 'missing-provider' : 'lan-gpt', profilePath, input, output })
    .then(value => ({ value }), error => ({ error }))
  let expectedProfile = rows
  if (failure === 'profile-restoration') {
    await started
    expectedProfile = await adapter.parse(await readFile(profilePath, 'utf8'))
    expectedProfile.find(row => row.id === config.rawCapture.observer.providerEntryId).config.providers['lan-gpt'].baseURL += '/edited'
    await writeFile(profilePath, await adapter.serialize(expectedProfile))
    input.write('{"command":"stop"}\n')
  }
  const outcome = await serving
  expect(outcome.error).toBeInstanceOf(AggregateError)
  expect(outcome.error.cause.message).toContain(failure === 'initialization' ? 'missing-provider' : 'RAW_CAPTURE_PROFILE_RESTORE_CONFLICT')
  expect(outcome.error.errors[0]).toBe(outcome.error.cause)
  expect(outcome.error.errors[1]).toBeInstanceOf(TypeError)
  expect(outcome.error.errors[1].message).toContain("reading 'missing'")
  for (const [name, listeners] of signals) expect(process.listeners(name)).toEqual(listeners)
  expect(input.listenerCount('data')).toBe(0)
  expect(await adapter.parse(await readFile(profilePath, 'utf8'))).toEqual(expectedProfile)
  const state = JSON.parse(await readFile(join(outputDirectory, config.rawCapture.filenames.state), 'utf8'))
  await expect(fetch(state.baseURL + '/chat/completions', { method: 'POST', body: '{}' })).rejects.toThrow()
})

it('reports initialization and cleanup failures in CLI diagnostics', async () => {
  const { spawn } = await import('node:child_process')
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { loadOfficialProfilePatchAdapter } = await import('../desktop/fixtures/official-profile-patch.mjs')
  const config = JSON.parse(await readFile(new URL('../../config/desktop-e2e.json', import.meta.url), 'utf8'))
  const adapter = await loadOfficialProfilePatchAdapter(config)
  const outputDirectory = await directory()
  const profilePath = join(outputDirectory, 'cordis.patch.yml')
  const rows = structuredClone(config.modes.development.initialProfilePatches)
  const upstreamBaseUrl = rows.find(row => row.id === config.rawCapture.observer.providerEntryId).config.providers['lan-gpt'].baseURL
  await writeFile(profilePath, await adapter.serialize(rows))
  await mkdir(join(outputDirectory, config.rawCapture.filenames.observations), { recursive: true })
  await writeFile(join(outputDirectory, config.rawCapture.filenames.observations, 'invalid.json'), 'null')
  const child = spawn(process.execPath, [new URL('../../scripts/verification/run-raw-trace-capture.mjs', import.meta.url).pathname,
    'start', '--upstream', upstreamBaseUrl, '--provider-id', 'missing-provider', '--profile', profilePath, '--output', outputDirectory], { stdio: ['pipe', 'pipe', 'pipe'] })
  const exited = once(child, 'exit')
  cleanup.push(async () => { if (child.exitCode === null) child.kill(); await exited })
  const chunks = []
  child.stderr.on('data', chunk => chunks.push(chunk))
  expect((await exited)[0]).toBe(1)
  const diagnostic = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  expect(diagnostic.message).toContain('missing-provider')
  expect(diagnostic.errors).toHaveLength(2)
  expect(diagnostic.errors[0].message).toBe(diagnostic.message)
  expect(diagnostic.errors[1].message).toContain("reading 'missing'")
  expect(await adapter.parse(await readFile(profilePath, 'utf8'))).toEqual(rows)
})

it.each(['collect', 'stop', 'stdin-eof'])('restores the Profile when the CLI stdout reader closes before %s', async terminal => {
  const { spawn } = await import('node:child_process')
  const { createInterface } = await import('node:readline')
  const { writeFile } = await import('node:fs/promises')
  const { loadOfficialProfilePatchAdapter } = await import('../desktop/fixtures/official-profile-patch.mjs')
  const config = JSON.parse(await readFile(new URL('../../config/desktop-e2e.json', import.meta.url), 'utf8'))
  const adapter = await loadOfficialProfilePatchAdapter(config)
  const outputDirectory = await directory()
  const profilePath = join(outputDirectory, 'cordis.patch.yml')
  const rows = structuredClone(config.modes.development.initialProfilePatches)
  const upstreamBaseUrl = rows.find(row => row.id === config.rawCapture.observer.providerEntryId).config.providers['lan-gpt'].baseURL
  await writeFile(profilePath, await adapter.serialize(rows))
  const child = spawn(process.execPath, [new URL('../../scripts/verification/run-raw-trace-capture.mjs', import.meta.url).pathname,
    'start', '--upstream', upstreamBaseUrl, '--provider-id', 'lan-gpt', '--profile', profilePath, '--output', outputDirectory], { stdio: ['pipe', 'pipe', 'pipe'] })
  const exited = once(child, 'exit')
  cleanup.push(async () => { if (child.exitCode === null) child.kill(); await exited })
  const lines = createInterface({ input: child.stdout })
  const started = JSON.parse((await lines[Symbol.asyncIterator]().next()).value)
  lines.close()
  const diagnostics = []
  child.stderr.on('data', chunk => diagnostics.push(chunk))
  child.stdout.destroy()
  if (terminal === 'stdin-eof') child.stdin.end()
  else child.stdin.write(JSON.stringify({ command: terminal }) + '\n')
  const exit = await Promise.race([exited, new Promise(resolve => setTimeout(() => resolve(null), 1000))])
  expect(exit).not.toBeNull()
  expect(exit[0]).toBe(1)
  expect(await adapter.parse(await readFile(profilePath, 'utf8'))).toEqual(rows)
  const diagnostic = JSON.parse(Buffer.concat(diagnostics).toString('utf8'))
  expect(diagnostic.code).toBe('EPIPE')
  await expect(fetch(started.baseURL + '/chat/completions', { method: 'POST', body: '{}' })).rejects.toThrow()
})

it.each([
  ['throw', 'started'], ['throw', 'collected'], ['throw', 'command-failed'], ['throw', 'command-rejected'], ['throw', 'stopped'],
  ['write-error', 'started'], ['write-error', 'collected'], ['write-error', 'command-failed'], ['write-error', 'command-rejected'], ['write-error', 'stopped'],
  ['output-error', 'initializing'], ['output-error', 'idle'], ['output-error', 'collecting'],
  ['output-close', 'idle'], ['output-close', 'collecting'],
  ['output-finish', 'idle'], ['output-finish', 'collecting'],
  ['input-error', 'initializing'], ['input-error', 'idle'], ['input-error', 'collecting'],
  ['input-close', 'idle'], ['input-close', 'collecting'],
])('cleans up all controller I/O listeners after %s during %s', async (fault, phase) => {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const fixture = await controllerIoFixture()
  const { input, output, config, outputDirectory } = fixture
  const failure = Object.assign(new Error('injected ' + fault), { code: 'TEST_IO_FAILURE' })
  if (fault === 'throw') {
    const write = output.write
    output.write = function (chunk, ...args) {
      if (JSON.parse(chunk.toString()).status === phase) throw failure
      return write.call(this, chunk, ...args)
    }
  } else if (fault === 'write-error') {
    output._transform = function (chunk, encoding, callback) {
      if (JSON.parse(chunk.toString()).status === phase) callback(failure)
      else callback(null, chunk)
    }
  }
  const listeners = new Map([input, output].map(emitter => [emitter,
    new Map(emitter.eventNames().map(name => [name, emitter.listeners(name)]))]))
  const signals = new Map(['SIGINT', 'SIGTERM'].map(name => [name, process.listeners(name)]))
  const serving = fixture.start()
  const trigger = () => {
    if (fault === 'input-error') input.destroy(failure)
    else if (fault === 'input-close') input.destroy()
    else if (fault === 'output-error') output.emit('error', failure)
    else if (fault === 'output-close') output.destroy()
    else if (fault === 'output-finish') output.end()
  }
  let reading
  if (phase === 'initializing') trigger()
  else if (phase !== 'started') {
    const started = await fixture.started
    if (phase === 'collecting') {
      const response = await fetch(started.baseURL + '/chat/completions', { method: 'POST', body: '{}' })
      reading = response.text().catch(() => undefined)
      input.write('{"command":"collect"}\n')
    } else if (phase === 'command-failed') {
      await mkdir(join(outputDirectory, config.rawCapture.filenames.observations), { recursive: true })
      await writeFile(join(outputDirectory, config.rawCapture.filenames.observations, 'invalid.json'), 'null')
    }
    if (fault === 'throw' || fault === 'write-error') {
      input.write(JSON.stringify({ command: phase === 'stopped' ? 'stop' : phase === 'command-rejected' ? 'unknown' : 'collect' }) + '\n')
    } else trigger()
  }
  const outcome = await Promise.race([serving, new Promise(resolve => setTimeout(() => resolve(null), 1000))])
  expect(outcome).not.toBeNull()
  if (fault === 'input-close') expect(outcome.value).toMatchObject({ status: 'stopped', restored: true, portReleased: true })
  else if (fault === 'output-close' || fault === 'output-finish') expect(outcome.error.code).toBe('RAW_CAPTURE_OUTPUT_CLOSED')
  else {
    const primary = outcome.error instanceof AggregateError ? outcome.error.cause : outcome.error
    expect(primary).toBe(failure)
    if (phase === 'command-failed') {
      expect(outcome.error.errors).toHaveLength(2)
      expect(outcome.error.errors[1].message).toContain("reading 'missing'")
    }
  }
  await reading
  expect(await fixture.readProfile()).toEqual(fixture.rows)
  const state = JSON.parse(await readFile(join(outputDirectory, config.rawCapture.filenames.state), 'utf8'))
  await expect(fetch(state.baseURL + '/chat/completions', { method: 'POST', body: '{}' })).rejects.toThrow()
  for (const [emitter, before] of listeners) {
    for (const name of new Set([...before.keys(), ...emitter.eventNames()])) expect(emitter.listeners(name)).toEqual(before.get(name) ?? [])
  }
  for (const [name, before] of signals) expect(process.listeners(name)).toEqual(before)
})

it.each(['profile-restoration', 'final-collection', 'both'])('retains the first I/O error with %s cleanup failure', async failure => {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const fixture = await controllerIoFixture()
  const serving = fixture.start()
  await fixture.started
  let expectedProfile = fixture.rows
  if (failure !== 'final-collection') {
    expectedProfile = await fixture.readProfile()
    expectedProfile.find(row => row.id === fixture.config.rawCapture.observer.providerEntryId).config.providers['lan-gpt'].baseURL += '/edited'
    await fixture.writeProfile(expectedProfile)
  }
  if (failure !== 'profile-restoration') {
    const observations = join(fixture.outputDirectory, fixture.config.rawCapture.filenames.observations)
    await mkdir(observations, { recursive: true })
    await writeFile(join(observations, 'invalid.json'), 'null')
  }
  const primary = Object.assign(new Error('input failed before cleanup'), { code: 'TEST_INPUT_FAILED' })
  fixture.input.destroy(primary)
  const outcome = await Promise.race([serving, new Promise(resolve => setTimeout(() => resolve(null), 1000))])
  expect(outcome).not.toBeNull()
  expect(outcome.error).toBeInstanceOf(AggregateError)
  expect(outcome.error.cause).toBe(primary)
  expect(outcome.error.errors[0]).toBe(primary)
  expect(outcome.error.errors).toHaveLength(failure === 'both' ? 3 : 2)
  if (failure !== 'final-collection') expect(outcome.error.errors[1].message).toContain('RAW_CAPTURE_PROFILE_RESTORE_CONFLICT')
  if (failure !== 'profile-restoration') expect(outcome.error.errors.at(-1).message).toContain("reading 'missing'")
  expect(await fixture.readProfile()).toEqual(expectedProfile)
})

it('keeps collection failures retryable while controller I/O remains usable', async () => {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const fixture = await controllerIoFixture()
  const serving = fixture.start()
  await fixture.started
  const invalid = join(fixture.outputDirectory, fixture.config.rawCapture.filenames.observations, 'invalid.json')
  await mkdir(join(fixture.outputDirectory, fixture.config.rawCapture.filenames.observations), { recursive: true })
  await writeFile(invalid, 'null')
  let reply = once(fixture.output, 'data')
  fixture.input.write('{"command":"collect"}\n')
  expect(JSON.parse((await reply)[0].toString('utf8')).status).toBe('command-failed')
  await rm(invalid)
  reply = once(fixture.output, 'data')
  fixture.input.write('{"command":"collect"}\n')
  expect(JSON.parse((await reply)[0].toString('utf8')).status).toBe('collected')
  reply = once(fixture.output, 'data')
  fixture.input.write('not json\n')
  expect(JSON.parse((await reply)[0].toString('utf8')).status).toBe('command-failed')
  reply = once(fixture.output, 'data')
  fixture.input.write('{"command":"unknown"}\n')
  expect(JSON.parse((await reply)[0].toString('utf8')).status).toBe('command-rejected')
  fixture.input.write('{"command":"stop"}\n')
  expect((await serving).value).toMatchObject({ status: 'stopped', restored: true, portReleased: true })
  expect(await fixture.readProfile()).toEqual(fixture.rows)
})

it.each([
  ['input', 'end'], ['input', 'close'], ['input', 'error'],
  ['output', 'end'], ['output', 'close'], ['output', 'error'],
])('cleans up when %s has already reached %s before initialization', async (channel, terminal) => {
  const fixture = await controllerIoFixture()
  const stream = fixture[channel]
  const failure = Object.assign(new Error('stream failed before initialization'), { code: 'TEST_PREEXISTING_IO_ERROR' })
  if (terminal === 'end' && channel === 'input') {
    const ended = once(stream, 'end')
    stream.resume()
    stream.end()
    await ended
  } else {
    const closed = new Promise(resolve => stream.once('close', resolve))
    if (terminal === 'error') { stream.once('error', () => {}); stream.destroy(failure) }
    else if (terminal === 'end') stream.end()
    else stream.destroy()
    await closed
  }
  const serving = fixture.start()
  let outcome
  try {
    outcome = await Promise.race([serving, new Promise(resolve => setTimeout(() => resolve(null), 500))])
  } finally {
    if (!outcome) fixture.input.emit('error', failure)
    await serving
  }
  expect(outcome).not.toBeNull()
  if (terminal === 'error') expect(outcome.error).toBe(failure)
  else if (channel === 'output') expect(outcome.error.code).toBe('RAW_CAPTURE_OUTPUT_CLOSED')
  else expect(outcome.value).toMatchObject({ status: 'stopped', restored: true, portReleased: true })
  expect(await fixture.readProfile()).toEqual(fixture.rows)
})

it('retains the restore-failed result when Profile restoration is the only failure', async () => {
  const fixture = await controllerIoFixture()
  const serving = fixture.start()
  await fixture.started
  const edited = await fixture.readProfile()
  edited.find(row => row.id === fixture.config.rawCapture.observer.providerEntryId).config.providers['lan-gpt'].baseURL += '/edited'
  await fixture.writeProfile(edited)
  fixture.input.write('{"command":"stop"}\n')
  const outcome = await serving
  expect(outcome.error).toBeUndefined()
  expect(outcome.value).toMatchObject({ status: 'restore-failed', restored: false, portReleased: true,
    error: { code: 'RAW_CAPTURE_PROFILE_RESTORE_FAILED' } })
  expect(fixture.records.at(-1)).toEqual(outcome.value)
  expect(await fixture.readProfile()).toEqual(edited)
})

it.each([
  ...['started', 'collected'].flatMap(phase => ['output-close', 'output-error', 'output-finish', 'input-error', 'SIGINT', 'SIGTERM', 'stdin-eof', 'stop'].map(terminal => [phase, terminal])),
  ['stopped', 'output-close'], ['stopped', 'none'],
])('settles the pending %s reply after %s under backpressure', async (phase, terminal) => {
  const fixture = await controllerIoFixture({ highWaterMark: 1, consumeOutput: false })
  const { input, output } = fixture
  const listeners = new Map([input, output].map(emitter => [emitter,
    new Map(emitter.eventNames().map(name => [name, emitter.listeners(name)]))]))
  const signals = new Map(['SIGINT', 'SIGTERM'].map(name => [name, process.listeners(name)]))
  let releaseWrite
  const write = output.write
  output.write = function (chunk, ...args) {
    releaseWrite = args.at(-1)
    return write.call(this, chunk, ...args)
  }
  let buffered = once(output, 'readable')
  const serving = fixture.start()
  await buffered
  if (phase !== 'started') {
    expect(JSON.parse(output.read().toString('utf8')).status).toBe('started')
    await new Promise(resolve => setImmediate(resolve))
    buffered = once(output, 'readable')
    input.write(JSON.stringify({ command: phase === 'stopped' ? 'stop' : 'collect' }) + '\n')
    await buffered
  }
  expect(output.readableLength).toBeGreaterThan(0)
  const failure = Object.assign(new Error('terminal stream failure under backpressure'), { code: 'TEST_BACKPRESSURE_IO_ERROR' })
  if (terminal === 'output-close') output.destroy()
  else if (terminal === 'output-error') output.destroy(failure)
  else if (terminal === 'output-finish') output.emit('finish')
  else if (terminal === 'input-error') input.destroy(failure)
  else if (terminal === 'SIGINT' || terminal === 'SIGTERM') process.listeners(terminal).find(listener => !signals.get(terminal).includes(listener))()
  else if (terminal === 'stdin-eof') input.end()
  else if (terminal === 'stop') input.write('{"command":"stop"}\n')
  let outcome
  try {
    outcome = await Promise.race([serving, new Promise(resolve => setTimeout(() => resolve(null), 500))])
  } finally {
    if (!outcome) { output.resume(); releaseWrite() }
    await serving
  }
  expect(outcome).not.toBeNull()
  if (terminal === 'input-error' || terminal === 'output-error') expect(outcome.error).toBe(failure)
  else if (phase !== 'stopped' && (terminal === 'output-close' || terminal === 'output-finish')) expect(outcome.error.code).toBe('RAW_CAPTURE_OUTPUT_CLOSED')
  else expect(outcome.value).toMatchObject({ status: 'stopped', restored: true, portReleased: true })
  if (!terminal.startsWith('output-')) expect(output.destroyed).toBe(false)
  expect(await fixture.readProfile()).toEqual(fixture.rows)
  const state = JSON.parse(await readFile(join(fixture.outputDirectory, fixture.config.rawCapture.filenames.state), 'utf8'))
  await expect(fetch(state.baseURL + '/chat/completions', { method: 'POST', body: '{}' })).rejects.toThrow()
  output.resume()
  await new Promise(resolve => setImmediate(resolve))
  for (const [emitter, before] of listeners) {
    for (const name of new Set([...before.keys(), ...emitter.eventNames()])) expect(emitter.listeners(name)).toEqual(before.get(name) ?? [])
  }
  for (const [name, before] of signals) expect(process.listeners(name)).toEqual(before)
})

it.each([true, false])('handles a late stopped Writable callback error after API completion with autoDestroy %s', async autoDestroy => {
  const { Writable } = await import('node:stream')
  const started = Promise.withResolvers()
  const stopped = Promise.withResolvers()
  const failure = Object.assign(new Error('late standard Writable callback failure'), { code: 'TEST_LATE_WRITE_ERROR' })
  const output = new Writable({ autoDestroy, write(chunk, encoding, callback) {
    const record = JSON.parse(chunk.toString('utf8'))
    if (record.status === 'stopped') stopped.resolve(callback)
    else { callback(); if (record.status === 'started') started.resolve(record) }
  } })
  const before = new Map(output.eventNames().map(name => [name, output.listeners(name)]))
  const fixture = await controllerIoFixture({ output, consumeOutput: false })
  const serving = fixture.start()
  const start = await started.promise
  fixture.input.write('{"command":"stop"}\n')
  const outcome = await serving
  const callback = await stopped.promise
  const errorListenersAtReturn = output.listenerCount('error')
  const lateError = once(output, 'error')
  try {
    expect(outcome.value).toMatchObject({ status: 'stopped', restored: true, portReleased: true })
    expect(errorListenersAtReturn).toBeGreaterThan(0)
    expect(fixture.input.listenerCount('data')).toBe(0)
    expect(fixture.input.listenerCount('error')).toBe(0)
    expect(await fixture.readProfile()).toEqual(fixture.rows)
    await expect(fetch(start.baseURL + '/chat/completions', { method: 'POST', body: '{}' })).rejects.toThrow()
  } finally {
    setTimeout(() => callback(failure), 30)
    expect((await lateError)[0]).toBe(failure)
    await new Promise(resolve => setImmediate(resolve))
  }
  for (const name of new Set([...before.keys(), ...output.eventNames()])) expect(output.listeners(name)).toEqual(before.get(name) ?? [])
})

it('reports a late stopped-write error through the CLI after business cleanup', async () => {
  const { spawn } = await import('node:child_process')
  const { createInterface } = await import('node:readline')
  const fixture = await controllerIoFixture()
  const controllerPath = new URL('../../scripts/verification/run-raw-trace-capture.mjs', import.meta.url).pathname
  const script = `
    import { Writable } from 'node:stream'
    import { pathToFileURL } from 'node:url'
    const originalOutput = process.stdout
    const output = new Writable({ write(chunk, encoding, callback) {
      originalOutput.write(chunk)
      if (JSON.parse(chunk.toString()).status === 'stopped') {
        setTimeout(() => callback(Object.assign(new Error('late CLI Writable callback failure'), { code: 'TEST_LATE_CLI_WRITE_ERROR' })), 30)
      } else callback()
    } })
    Object.defineProperty(process, 'stdout', { value: output })
    process.argv = [process.execPath, ...process.argv.slice(1)]
    await import(pathToFileURL(process.argv[1]).href)
  `
  const provider = fixture.rows.find(row => row.id === fixture.config.rawCapture.observer.providerEntryId).config.providers['lan-gpt']
  const child = spawn(process.execPath, ['--input-type=module', '--eval', script, controllerPath,
    'start', '--upstream', provider.baseURL, '--provider-id', 'lan-gpt', '--profile', fixture.profilePath, '--output', fixture.outputDirectory],
    { stdio: ['pipe', 'pipe', 'pipe'] })
  const exited = once(child, 'exit')
  cleanup.push(async () => { if (child.exitCode === null) child.kill(); await exited })
  const diagnostics = []
  child.stderr.on('data', chunk => diagnostics.push(chunk))
  const lines = createInterface({ input: child.stdout })
  const iterator = lines[Symbol.asyncIterator]()
  const started = JSON.parse((await iterator.next()).value)
  child.stdin.write('{"command":"stop"}\n')
  const stopped = JSON.parse((await iterator.next()).value)
  expect(stopped).toMatchObject({ status: 'stopped', restored: true, portReleased: true })
  expect((await exited)[0]).toBe(1)
  const diagnostic = JSON.parse(Buffer.concat(diagnostics).toString('utf8'))
  expect(diagnostic).toEqual({ code: 'TEST_LATE_CLI_WRITE_ERROR', message: 'late CLI Writable callback failure' })
  expect(await fixture.readProfile()).toEqual(fixture.rows)
  await expect(fetch(started.baseURL + '/chat/completions', { method: 'POST', body: '{}' })).rejects.toThrow()
  lines.close()
})

it.each(['gzip', 'deflate', 'br'])('preserves decodable %s response prefixes after downstream cancellation', async encoding => {
  const { gzipSync, deflateSync, brotliCompressSync } = await import('node:zlib')
  const payload = Buffer.from('data: {"content":"captured response"}\n\ndata: [DONE]\n\n')
  const codecs = { gzip: [gzipSync, 8], deflate: [deflateSync, 4], br: [brotliCompressSync, 1] }
  const [compress, trailerBytes] = codecs[encoding]
  const complete = compress(payload)
  const wire = complete.subarray(0, complete.length - trailerBytes)
  const url = await upstream((request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream', 'content-encoding': encoding })
    response.write(wire)
  })
  const capture = await startRawTraceCapture({ upstreamBaseUrl: url, outputDirectory: await directory() })
  cleanup.push(() => capture.stop())
  expect(await readCapturedResponse(capture, wire.length)).toEqual(wire)
  const { index } = await capture.collect()
  const record = index.requests[0]
  expect(record.terminal).toBe('client-cancelled')
  expect(record.responseBody.path).not.toBeNull()
  expect(record.requestBody.messageComplete).toBe(true)
  expect(record.responseBody).toMatchObject({ messageComplete: false, storedEncoding: 'identity',
    decoding: { complete: false, code: 'Z_BUF_ERROR', decodedBytes: payload.length } })
  expect(await readFile(record.responseBody.path)).toEqual(payload)
  expect(index.missing).toEqual([])
  const events = JSON.parse(await readFile(record.sseIndexPath, 'utf8')).events
  expect(events.map(event => [event.data, event.complete])).toEqual([
    ['{"content":"captured response"}', true], ['[DONE]', true],
  ])
})

it('redacts a recovered gzip prefix and marks its unterminated SSE frame within a completed HTTP response', async () => {
  const { gzipSync } = await import('node:zlib')
  const secret = 'secret-partial-capture-key'
  const payload = Buffer.from('data: {"content":"' + secret + '"}\n\ndata: {"unfinished":"' + secret)
  const compressed = gzipSync(payload)
  const wire = compressed.subarray(0, compressed.length - 8)
  const url = await upstream((request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream', 'content-encoding': 'gzip' })
    response.end(wire)
  })
  const capture = await startRawTraceCapture({ upstreamBaseUrl: url, outputDirectory: await directory(), secrets: [secret] })
  cleanup.push(() => capture.stop())
  expect(await readCapturedResponse(capture)).toEqual(wire)
  const { index } = await capture.collect()
  const record = index.requests[0]
  expect(record.terminal).toBe('completed')
  expect(record.responseBody).toMatchObject({ messageComplete: true, storedEncoding: 'identity',
    decoding: { complete: false, code: 'Z_BUF_ERROR', decodedBytes: payload.length } })
  const saved = await readFile(record.responseBody.path, 'utf8')
  expect(saved).not.toContain(secret)
  expect(saved).toContain('[redacted]')
  const source = await readFile(record.sseIndexPath, 'utf8')
  expect(source).not.toContain(secret)
  const sse = JSON.parse(source)
  expect(sse.source.messageComplete).toBe(true)
  expect(sse.source.decoding.complete).toBe(false)
  expect(sse.events.map(event => event.complete)).toEqual([true, false])
  expect(sse.events[1].value).toBeNull()
  expect(index.missing).toEqual([])
})

it.each(['corrupt-checksum', 'undecodable-header'])('keeps an explicit capture gap for %s gzip input', async kind => {
  const { gzipSync } = await import('node:zlib')
  const complete = gzipSync(Buffer.from('data: {"content":"source"}\n\n'))
  const wire = kind === 'undecodable-header' ? complete.subarray(0, 5) : Buffer.from(complete)
  if (kind === 'corrupt-checksum') wire[wire.length - 8] ^= 0xff
  const url = await upstream((request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream', 'content-encoding': 'gzip' })
    response.end(wire)
  })
  const capture = await startRawTraceCapture({ upstreamBaseUrl: url, outputDirectory: await directory() })
  cleanup.push(() => capture.stop())
  expect(await readCapturedResponse(capture)).toEqual(wire)
  const { index } = await capture.collect()
  const record = index.requests[0]
  const code = kind === 'corrupt-checksum' ? 'Z_DATA_ERROR' : 'Z_BUF_ERROR'
  expect(record.terminal).toBe('completed')
  expect(record.responseBody).toMatchObject({ path: null, messageComplete: true, savedBytes: 0,
    decoding: { complete: false, code, decodedBytes: 0 } })
  expect(record.sseIndexPath).toBeUndefined()
  expect(index.missing).toEqual([expect.objectContaining({ code, encoding: 'gzip' })])
})

it.each([
  ['LF', ['\n', '\n', '\n', '\n', '\n']],
  ['CRLF', ['\r\n', '\r\n', '\r\n', '\r\n', '\r\n']],
  ['CR', ['\r', '\r', '\r', '\r', '\r']],
  ['mixed', ['\r\n', '\n', '\r', '\r\n', '\r']],
].flatMap(([name, endings]) => [false, true].map(bom => ({ name, endings, bom }))))(
  'indexes recovered SSE with $name separators and initial BOM=$bom',
  async ({ endings, bom }) => {
    const { gzipSync } = await import('node:zlib')
    const lines = [
      'data: {"model":"probe",',
      'data: "choices":[{"delta":{"tool_calls":[{"id":"call-probe"}],"content":"\uFEFFinside"}}]}',
      '',
      'data: [DONE]',
      '',
      'data: {"unfinished":',
    ]
    const payload = Buffer.from((bom ? '\uFEFF' : '') + lines.map((line, index) => line + (endings[index] ?? '')).join(''))
    const compressed = gzipSync(payload)
    const wire = compressed.subarray(0, compressed.length - 8)
    const url = await upstream((request, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'content-encoding': 'gzip' })
      response.end(wire)
    })
    const capture = await startRawTraceCapture({ upstreamBaseUrl: url, outputDirectory: await directory() })
    cleanup.push(() => capture.stop())
    expect(await readCapturedResponse(capture)).toEqual(wire)
    const { index } = await capture.collect()
    const record = index.requests[0]
    expect(await readFile(record.responseBody.path)).toEqual(payload)
    expect(record.responseBody).toMatchObject({ messageComplete: true, storedEncoding: 'identity',
      decoding: { complete: false, code: 'Z_BUF_ERROR', decodedBytes: payload.length } })
    expect(record.responseModel).toBe('probe')
    expect(record.responseToolCallIds).toEqual(['call-probe'])
    const events = JSON.parse(await readFile(record.sseIndexPath, 'utf8')).events
    expect(events.map(event => [event.data, event.complete])).toEqual([
      [lines.slice(0, 2).map(line => line.slice(6)).join('\n'), true],
      ['[DONE]', true],
      ['{"unfinished":', false],
    ])
    expect(events[0].value.choices[0].delta.content).toBe('\uFEFFinside')
    expect(events[2].value).toBeNull()
    expect(index.missing).toEqual([])
  },
)

it.each([1, 2, 3])('ignores %i surplus SSE blank lines without inventing an incomplete frame', async count => {
  const payload = Buffer.from('data: {"model":"probe"}\r\n\r\n' + '\r\n'.repeat(count)
    + 'data: [DONE]\r\n\r\n' + '\r\n'.repeat(count))
  const url = await upstream((request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end(payload)
  })
  const capture = await startRawTraceCapture({ upstreamBaseUrl: url, outputDirectory: await directory() })
  cleanup.push(() => capture.stop())
  expect(await readCapturedResponse(capture)).toEqual(payload)
  const { index } = await capture.collect()
  const record = index.requests[0]
  expect(await readFile(record.responseBody.path)).toEqual(payload)
  const events = JSON.parse(await readFile(record.sseIndexPath, 'utf8')).events
  expect(events.map(event => [event.data, event.complete])).toEqual([
    ['{"model":"probe"}', true], ['[DONE]', true],
  ])
})

async function readCapturedResponse(capture, cancelAfter) {
  return await new Promise((resolve, reject) => {
    const call = request(capture.baseURL + '/chat/completions', { method: 'POST' }, response => {
      const chunks = []
      response.on('data', chunk => {
        chunks.push(Buffer.from(chunk))
        if (cancelAfter !== undefined && chunks.reduce((size, item) => size + item.length, 0) >= cancelAfter) {
          response.destroy()
          resolve(Buffer.concat(chunks))
        }
      })
      response.on('end', () => resolve(Buffer.concat(chunks)))
      response.on('error', reject)
    })
    call.on('error', reject)
    call.end('{}')
  })
}

async function controllerIoFixture({ highWaterMark, consumeOutput = true, output: providedOutput } = {}) {
  const { PassThrough } = await import('node:stream')
  const { writeFile } = await import('node:fs/promises')
  const { serveRawTraceCapture } = await import('../../scripts/verification/run-raw-trace-capture.mjs')
  const { loadOfficialProfilePatchAdapter } = await import('../desktop/fixtures/official-profile-patch.mjs')
  const config = JSON.parse(await readFile(new URL('../../config/desktop-e2e.json', import.meta.url), 'utf8'))
  const adapter = await loadOfficialProfilePatchAdapter(config)
  const outputDirectory = await directory()
  const profilePath = join(outputDirectory, 'cordis.patch.yml')
  const rows = structuredClone(config.modes.development.initialProfilePatches)
  const upstreamBaseUrl = await upstream((request, response) => { response.writeHead(200); response.write('pending response') })
  rows.find(row => row.id === config.rawCapture.observer.providerEntryId).config.providers['lan-gpt'].baseURL = upstreamBaseUrl
  await writeFile(profilePath, await adapter.serialize(rows))
  const input = new PassThrough()
  const output = providedOutput ?? new PassThrough({ highWaterMark })
  const records = []
  const started = Promise.withResolvers()
  if (consumeOutput) output.on('data', chunk => {
    const record = JSON.parse(chunk.toString('utf8'))
    records.push(record)
    if (record.status === 'started') started.resolve(record)
  })
  let serving
  cleanup.push(async () => { input.end(); output.resume?.(); await serving })
  return { config, outputDirectory, profilePath, rows, input, output, records, started: started.promise,
    readProfile: async () => adapter.parse(await readFile(profilePath, 'utf8')),
    writeProfile: async document => writeFile(profilePath, await adapter.serialize(document)),
    start() {
      serving = serveRawTraceCapture({ config, upstreamBaseUrl, outputDirectory, providerId: 'lan-gpt', profilePath, input, output })
        .then(value => ({ value }), error => ({ error }))
      return serving
    } }
}

async function directory() {
  const path = await mkdtemp(join(process.cwd(), '.local/raw-capture-test-'))
  cleanup.push(() => rm(path, { recursive: true, force: true }))
  return path
}

async function upstream(handler) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  cleanup.push(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  return `http://127.0.0.1:${server.address().port}/v1`
}

it('forwards request and streamed response bytes and credentials without storing auth or cookies', async () => {
  const body = Buffer.from('{ "model":"gpt-6.1-terra", "messages":[{"role":"user","content":"原文"}],"stream":true }')
  const responseBytes = Buffer.from('data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n')
  let received
  const url = await upstream(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    received = { body: Buffer.concat(chunks), headers: req.headers, url: req.url }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'set-cookie': 'private=response-cookie' })
    res.write(responseBytes.subarray(0, 48))
    setImmediate(() => { res.write(responseBytes.subarray(48, 49)); res.end(responseBytes.subarray(49)) })
  })
  const outputDirectory = await directory()
  const capture = await startRawTraceCapture({ upstreamBaseUrl: url, outputDirectory })
  cleanup.push(() => capture.stop())
  const response = await fetch(capture.baseURL + '/chat/completions', { method: 'POST', body,
    headers: { authorization: 'Bearer secret-request-key', cookie: 'private=request-cookie', 'content-type': 'application/json' } })
  expect(Buffer.from(await response.arrayBuffer())).toEqual(responseBytes)
  expect(response.headers.get('set-cookie')).toBe('private=response-cookie')
  expect(received).toMatchObject({ body, url: '/v1/chat/completions', headers: { authorization: 'Bearer secret-request-key', cookie: 'private=request-cookie' } })
  const result = await capture.collect()
  expect(result.index.requests).toHaveLength(1)
  const entry = result.index.requests[0]
  expect(await readFile(entry.requestBody.path)).toEqual(body)
  expect(await readFile(entry.responseBody.path)).toEqual(responseBytes)
  expect(entry).toMatchObject({ terminal: 'completed', requestModel: 'gpt-6.1-terra', response: { statusCode: 200 } })
  const metadata = await readFile(entry.metadataPath, 'utf8')
  expect(metadata).not.toContain('secret-request-key')
  expect(metadata).not.toContain('request-cookie')
  expect(metadata).not.toContain('response-cookie')
  expect((await readFile(entry.sseIndexPath, 'utf8'))).toContain('[DONE]')
  expect(await capture.stop()).toMatchObject({ portReleased: true })
})
