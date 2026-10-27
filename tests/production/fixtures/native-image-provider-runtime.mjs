import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import imageReaderRuntime from '../../../config/image-reader-runtime.json' with { type: 'json' }

const scenario = process.argv[2]
assert.ok(['success', 'max-tokens', 'cancel', 'auth', 'interrupted', 'disconnected'].includes(scenario))
const sdkRequire = createRequire(process.argv[3])
const { boot, initProfile, readProfilePatches } = sdkRequire('@deepseek-ai/dsh-app-boot')
const { credentialRef } = sdkRequire('@deepseek-ai/dsh-credentials')
const { createUserMessage } = sdkRequire('@deepseek-ai/dsh-llm')
const sharp = createRequire(sdkRequire.resolve('@deepseek-ai/dsh-attachment-local/package.json'))('sharp')
const rootDirectory = await mkdtemp(join(tmpdir(), 'native-image-provider-'))
const requests = []
const responseClosed = Promise.withResolvers()
let observedResponseClosed = false
const controller = new AbortController()
const server = createServer(async (request, response) => {
  response.once('close', () => { observedResponseClosed = true; responseClosed.resolve(true) })
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  requests.push({ method: request.method, path: request.url, authorization: request.headers.authorization,
    body: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
  if (scenario === 'auth') {
    response.writeHead(401, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { message: 'Controlled invalid API key', type: 'authentication_error' } }))
    return
  }
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  response.flushHeaders()
  const content = scenario === 'max-tokens' ? 'Truncated image observation' : 'Native image observation'
  response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\n`)
  if (scenario === 'cancel') return
  if (scenario === 'disconnected') {
    setImmediate(() => response.destroy())
    return
  }
  if (scenario === 'interrupted') {
    response.end()
    return
  }
  response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: scenario === 'max-tokens' ? 'length' : 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } })}\n\ndata: [DONE]\n\n`)
})

let root
let result
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  const profileDirectory = join(rootDirectory, 'profiles/test')
  initProfile(profileDirectory, ['native-image-provider-test'])
  const bundleDirectory = join(profileDirectory, 'node_modules/native-image-provider-test')
  await mkdir(bundleDirectory, { recursive: true })
  await writeFile(join(rootDirectory, 'package.json'), JSON.stringify({ name: 'native-image-provider-installation' }))
  await writeFile(join(bundleDirectory, 'package.json'), JSON.stringify({
    name: 'native-image-provider-test', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  await writeFile(join(bundleDirectory, 'cordis.patch.yml'), JSON.stringify([{ insert: [
    { id: 'config-editor', name: 'cordis:editor' },
    { id: 'settings', name: 'cordis:settings' },
    { id: 'credentials', name: 'cordis:credentials', config: { dshHome: rootDirectory, watch: false } },
    { id: 'attachments', name: 'cordis:attachments', config: { dshHome: rootDirectory } },
    { id: 'llm', name: 'cordis:llm' },
    { id: 'llm-pi-ai', name: 'cordis:pi', config: { providers: {} } },
  ] }]))
  const basePath = join(profileDirectory, 'cordis.yml')
  await writeFile(basePath, '[]\n')
  const profile = {
    name: 'test', startedBundles: ['native-image-provider-test'], dir: profileDirectory,
    patchPath: join(profileDirectory, 'cordis.patch.yml'), installAnchor: join(rootDirectory, 'package.json'),
    cwd: rootDirectory, home: rootDirectory, overlays: [], telemetryDisabledEnv: undefined,
  }
  root = await boot('test', basePath, readProfilePatches('test', profile), context => {
    context.provide('profileContext', profile)
    context.provide('appReady', { onReady: listener => { listener(); return () => {} } })
    Object.assign(context.loader.builtins, {
      editor: sdkRequire('@deepseek-ai/dsh-config-editor'),
      settings: sdkRequire('@deepseek-ai/dsh-settings'),
      credentials: sdkRequire('@deepseek-ai/dsh-credentials-local'),
      attachments: sdkRequire('@deepseek-ai/dsh-attachment-local'),
      llm: sdkRequire('@deepseek-ai/dsh-llm'),
      pi: sdkRequire('@deepseek-ai/dsh-llm-pi-ai'),
    })
  })
  const reference = credentialRef('NATIVE_IMAGE_PROVIDER_FIXTURE_KEY')
  await root.credentials.set(reference, 'native-image-provider-fixture-key')
  const route = `${imageReaderRuntime.providerRoutePrefix}native-fixture${imageReaderRuntime.providerRouteSeparator}1`
  await root.settings.mutate('llm-pi-ai', [{ op: 'set', path: ['providers', route], value: {
    displayName: 'ComfyUI 图片读取 · native-fixture', api: 'openai-completions',
    baseURL: `http://127.0.0.1:${port}/v1`, apiKeyEnv: reference,
    models: [{ id: 'fixture-vision', input: ['text', 'image'], contextWindow: 16384, maxTokens: 1024 }],
  } }])
  const settings = root.settings.describe().find(row => row.ns === 'llm-pi-ai')
  assert.equal(settings.value.providers[route].baseURL, `http://127.0.0.1:${port}/v1`)
  const bytes = new Uint8Array(await sharp({ create: {
    width: 2, height: 2, channels: 3, background: { r: 1, g: 2, b: 3 },
  } }).png().toBuffer())
  const attachment = await root.attachments.saveImage({ data: bytes, mediaType: 'image/png' })
  const prepared = await root.llm.prepareCall({ provider: route, model: 'fixture-vision', temperature: 0.35, maxTokens: 256 }, controller.signal)
  assert.ok(prepared.inputModalities.includes('image'))
  const messages = [createUserMessage({ source: { kind: 'harness-comfyui-image-reader' }, content: [
    { type: 'text', text: 'Describe the controlled local image.' }, { type: 'image', attachment },
  ] })]
  const streamChunks = []
  for await (const chunk of prepared.stream({ ...prepared.config, messages, signal: controller.signal, sessionId: 'native-image-fixture-session' })) {
    streamChunks.push(chunk)
    if (scenario === 'cancel' && chunk.type === 'text-delta') controller.abort(new DOMException('Controlled cancellation', 'AbortError'))
  }
  const finished = streamChunks.filter(chunk => chunk.type === 'finish')
  assert.equal(finished.length, 1)
  if (scenario === 'cancel') await responseClosed.promise
  const wireRequest = requests[0]
  const wireImages = wireRequest.body.messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
    .filter(part => part.type === 'image_url')
  const images = []
  for (const image of wireImages) {
    assert.ok(image.image_url.url.startsWith('data:image/png;base64,'))
    const imageBytes = Buffer.from(image.image_url.url.slice('data:image/png;base64,'.length), 'base64')
    const metadata = await sharp(imageBytes).metadata()
    images.push({ mediaType: 'image/png', width: metadata.width, height: metadata.height, bytes: imageBytes.length })
  }
  const application = sdkRequire('../package.json')
  result = {
    scenario, settingsConfigured: true, requestCount: requests.length,
    runtime: {
      applicationVersion: application.version, buildCommit: application.dshBuildCommit, buildDirty: application.dshBuildDirty,
      nodeVersion: process.versions.node, electronVersion: process.versions.electron,
      providerVersion: sdkRequire('@deepseek-ai/dsh-llm-pi-ai/package.json').version,
    },
    request: {
      method: wireRequest.method, path: wireRequest.path, url: `http://127.0.0.1:${port}${wireRequest.path}`,
      authorizationMatches: wireRequest.authorization === 'Bearer native-image-provider-fixture-key',
      body: {
        model: wireRequest.body.model, stream: wireRequest.body.stream, temperature: wireRequest.body.temperature,
        ...wireRequest.body.max_tokens === undefined ? {} : { max_tokens: wireRequest.body.max_tokens },
        ...wireRequest.body.max_completion_tokens === undefined ? {} : { max_completion_tokens: wireRequest.body.max_completion_tokens },
      },
      images,
    },
    finish: finished[0].reason, text: streamChunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join(''),
  }
} finally {
  controller.abort()
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeAllConnections()
  })
  if (root !== undefined) await root.fiber.dispose()
  await rm(rootDirectory, { recursive: true, force: true })
}
assert.equal(server.listening, false)
console.log(JSON.stringify({ ...result, responseClosed: observedResponseClosed, portReleased: true }))
