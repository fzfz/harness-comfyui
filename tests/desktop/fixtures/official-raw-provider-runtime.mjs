import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { startRawTraceCapture } from './official-raw-capture.mjs'

const sdkRequire = createRequire(process.argv[2])
const outputDirectory = process.argv[3]
const { boot, initProfile, readProfilePatches } = sdkRequire('@deepseek-ai/dsh-app-boot')
const { createUserMessage } = sdkRequire('@deepseek-ai/dsh-llm')
const requests = []
const server = createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  requests.push({ body: Buffer.concat(chunks), authorizationMatches: request.headers.authorization === 'Bearer controlled-raw-provider-key' })
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  response.end('data: ' + JSON.stringify({ id: 'controlled-response', model: 'gpt-6.1-terra', choices: [{ index: 0, delta: { role: 'assistant', content: 'controlled response' }, finish_reason: null }] })
    + '\n\ndata: ' + JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 } })
    + '\n\ndata: [DONE]\n\n')
})
let root
let capture
let result
process.env.RAW_CAPTURE_PROVIDER_FIXTURE_KEY = 'controlled-raw-provider-key'
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const upstreamBaseUrl = `http://127.0.0.1:${server.address().port}/v1`
  capture = await startRawTraceCapture({ upstreamBaseUrl, outputDirectory })
  const home = join(outputDirectory, 'official-boot')
  const profileDirectory = join(home, 'profiles/test')
  initProfile(profileDirectory, ['raw-provider-test'])
  const bundleDirectory = join(profileDirectory, 'node_modules/raw-provider-test')
  await mkdir(bundleDirectory, { recursive: true })
  await writeFile(join(home, 'package.json'), JSON.stringify({ name: 'raw-provider-installation' }))
  await writeFile(join(bundleDirectory, 'package.json'), JSON.stringify({ name: 'raw-provider-test', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } }))
  await writeFile(join(bundleDirectory, 'cordis.patch.yml'), JSON.stringify([{ insert: [
    { id: 'config-editor', name: 'cordis:editor' },
    { id: 'settings', name: 'cordis:settings' },
    { id: 'credentials', name: 'cordis:credentials', config: { dshHome: home, watch: false } },
    { id: 'llm', name: 'cordis:llm' },
    { id: 'llm-pi-ai', name: 'cordis:pi', config: { providers: {} } },
    { id: 'raw-observer', name: new URL('./official-raw-observer.mjs', import.meta.url).href, config: { outputDirectory } },
  ] }]))
  const basePath = join(profileDirectory, 'cordis.yml')
  await writeFile(basePath, '[]\n')
  const profile = { name: 'test', startedBundles: ['raw-provider-test'], dir: profileDirectory,
    patchPath: join(profileDirectory, 'cordis.patch.yml'), installAnchor: join(home, 'package.json'),
    cwd: home, home, overlays: [], telemetryDisabledEnv: undefined }
  root = await boot('test', basePath, readProfilePatches('test', profile), context => {
    context.provide('profileContext', profile)
    context.provide('appReady', { onReady: listener => { listener(); return () => {} } })
    Object.assign(context.loader.builtins, {
      editor: sdkRequire('@deepseek-ai/dsh-config-editor'), settings: sdkRequire('@deepseek-ai/dsh-settings'),
      credentials: sdkRequire('@deepseek-ai/dsh-credentials-local'), llm: sdkRequire('@deepseek-ai/dsh-llm'),
      pi: sdkRequire('@deepseek-ai/dsh-llm-pi-ai'),
    })
  })
  const provider = { displayName: 'Controlled LAN', api: 'openai-completions', apiKeyEnv: 'RAW_CAPTURE_PROVIDER_FIXTURE_KEY',
    models: [{ id: 'gpt-6.1-terra', input: ['text'], contextWindow: 16384, maxTokens: 8192, reasoningEfforts: { high: 'high' } }] }
  const messages = [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Keep this exact request.' }] })]
  const outcomes = []
  for (const baseURL of [upstreamBaseUrl, capture.baseURL]) {
    await root.settings.mutate('llm-pi-ai', [{ op: 'set', path: ['providers', 'lan-gpt'], value: { ...provider, baseURL } }])
    const prepared = await root.llm.prepareCall({ provider: 'lan-gpt', model: 'gpt-6.1-terra', reasoningEffort: 'high', maxTokens: 8192 })
    const chunks = []
    for await (const chunk of prepared.stream({ ...prepared.config, messages, sessionId: 'controlled-session' })) chunks.push(chunk)
    outcomes.push(chunks)
  }
  assert.equal(requests.length, 2)
  assert.deepEqual(requests[0].body, requests[1].body)
  assert.ok(requests.every(request => request.authorizationMatches))
  assert.deepEqual(outcomes[0], outcomes[1])
  const collected = await capture.collect()
  assert.equal(collected.index.observations.filter(item => item.kind === 'model-request-options').length, 2)
  const application = sdkRequire('../package.json')
  result = { requestBodiesEqual: true, outcomesEqual: true, authorizationMatches: true,
    applicationVersion: application.version, buildCommit: application.dshBuildCommit,
    requestCount: requests.length, forwardedRequestCount: collected.index.requests.length,
    model: JSON.parse(requests[1].body.toString('utf8')).model, indexPath: collected.indexPath }
} finally {
  if (root) await root.fiber.dispose()
  if (capture) await capture.stop()
  await new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })
  delete process.env.RAW_CAPTURE_PROVIDER_FIXTURE_KEY
}
console.log(JSON.stringify({ ...result, portReleased: !server.listening }))
