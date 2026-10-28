import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { GenerationRuntime } from '../../../src/host/generation/generation-runtime.ts'
import { createCliHandler } from '../../../src/host/cli/route.ts'
import { CLI_ROUTE_PATH } from '../../../src/cli/contract.ts'

const archiveRoot = resolve(process.argv[2])
const outputPath = resolve(process.argv[3])
const cliPath = join(archiveRoot, '.local/source-cli/harness-comfyui.mjs')
const names = JSON.parse(await readFile(join(archiveRoot, 'config/managed-cli-environment.json'), 'utf8')).environmentNames
const root = await mkdtemp(join(tmpdir(), 'generation-root-cause-'))
let observation = { status: 'pending', outputs: [] }
let remoteSubmissions = 0
const runtime = new GenerationRuntime({
  runRepositoryFile: join(root, 'runs.sqlite'), runDirectory: join(root, 'runs'), savedMediaDirectory: join(root, 'media'),
  preparer: {
    async inspectRuntimeParameters() { throw new Error('unexpected inspection') },
    async prepare(request) {
      return {
        instanceId: request.instanceId, instanceTitle: 'Local controlled fixture', templateTitle: 'Fixture',
        sourceSnapshot: { template_id: request.templateId }, actualWorkflow: { version: 0.4 },
        apiWorkflow: {}, expectedOutputNodeIds: ['9'],
        connection: { url: 'http://127.0.0.1:1', origin: 'http://127.0.0.1:1', authorization: null },
      }
    },
  },
  transport: {
    async submit(input) { assert.equal(input.onRequestStart(), true); remoteSubmissions++; return { promptId: input.promptId } },
    async observe() { return observation },
    async download() { throw new Error('unexpected download') },
  },
})
const handler = createCliHandler({
  runtime,
  capabilities: { authorize(value) { return /^probe_[0-9]+$/.test(value) ? { sessionId: 'session_probe', turn: 1, callId: value, cwd: root } : undefined } },
  workspaceRegistry: { async resolveByPath() { return { id: 'workspace_probe', sessionIds: ['session_probe'] } } },
  imageReader: { async inspect() { throw new Error('unexpected image read') } },
})
const server = createServer((request, response) => { void handler(request, response) })
await new Promise<void>(ready => server.listen(0, '127.0.0.1', ready))
const endpoint = `http://127.0.0.1:${server.address().port}${CLI_ROUTE_PATH}`

async function cli(command, value, capability = 'probe_1') {
  const input = join(root, 'stdin.json')
  await writeFile(input, JSON.stringify(value))
  const result = await new Promise((done, reject) => {
    const child = spawn(process.execPath, [cliPath, '--quiet', 'generation', command, '--stdin'], {
      env: { ...process.env, TMPDIR: root, [names.api]: endpoint, [names.capability]: capability },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = '', stderr = ''
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    child.on('error', reject)
    child.on('close', code => done({ code, stdout, stderr }))
    createReadStream(input).pipe(child.stdin)
  })
  if (result.code === 0) result.data = JSON.parse(await readFile(result.stdout.trim(), 'utf8'))
  return result
}

try {
  const prompt = 'A detailed portrait with consistent appearance, composition and light. '.repeat(45)
  const request = { title: 'File request 1', instance_id: '2', template_id: '45', model: null, parameters: { positive_prompt: prompt, seed: 20261026 }, loras: [] }
  const first = await cli('submit', request)
  assert.equal(first.code, 0, first.stderr)
  assert.ok(first.data.run_id)
  const replay = await cli('submit', request)
  assert.equal(replay.data.run_id, first.data.run_id)
  const conflict = await cli('submit', { ...request, title: 'File request 2' })
  assert.equal(conflict.code, 1)
  assert.match(conflict.stderr, /RUN_REQUEST_CONFLICT/)
  const states = []
  async function capture() {
    const stored = runtime.queryRuns({ workspaceId: 'workspace_probe', sessionId: 'session_probe' })[0]
    const media = await cli('resolve-media', { run_ids: [first.data.run_id] })
    assert.equal(media.code, 0, media.stderr)
    const item = media.data.runs[0]
    assert.equal(item.parameters.positive_prompt, prompt)
    states.push({ storedStatus: stored.status, storedError: stored.errorCode, cliItem: item })
  }
  await capture()
  await runtime.advance()
  await capture()
  observation = { status: 'running', outputs: [] }
  await runtime.advance()
  await capture()
  observation = { status: 'error', outputs: [], error: { code: 'CONTROLLED_FAILURE', message: 'Controlled remote failure' } }
  await runtime.advance()
  await capture()
  assert.deepEqual(states.map(x => x.storedStatus), ['prepared', 'remote_pending', 'remote_running', 'failed'])
  for (const state of states) assert.deepEqual(state.cliItem, states[0].cliItem)
  for (let i = 2; i <= 11; i++) {
    const result = await cli('submit', { ...request, title: `File request ${i}` }, `probe_${i}`)
    assert.equal(result.code, 0, result.stderr)
  }
  const count = runtime.queryRuns({ workspaceId: 'workspace_probe', sessionId: 'session_probe' }).length
  assert.equal(count, 11)
  await writeFile(outputPath, JSON.stringify({
    releaseCliVersion: JSON.parse(await readFile(join(archiveRoot, 'package.json'), 'utf8')).version,
    fixture: 'Local CLI HTTP handler and temporary Generation Runtime; remote transport is controlled in process',
    promptCharacters: prompt.length,
    fileSubmit: { exitCode: first.code, stdoutContainsPrompt: first.stdout.includes(prompt), promptPreserved: true },
    sameCallReplay: { sameRun: replay.data.run_id === first.data.run_id },
    sameCallDifferentRequest: { exitCode: conflict.code, code: 'RUN_REQUEST_CONFLICT' },
    independentCalls: { count: 11, persistedRuns: count },
    statusProjection: states.map(({storedStatus, storedError, cliItem}) => ({ storedStatus, storedError, publicKeys: Object.keys(cliItem), lookupStatus: cliItem.lookup_status, images: cliItem.images.length })),
    identicalMediaResponsesAcrossStates: true,
    controlledTransportSubmissions: remoteSubmissions,
    externalComfyuiRequests: 0,
  }, null, 2) + '\n')
  process.stdout.write(`${outputPath}\n`)
} finally {
  server.closeAllConnections()
  await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()))
  runtime.close()
  await rm(root, { recursive: true, force: true })
}
