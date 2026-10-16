import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import errorCatalog from '../../config/error-catalog.json' with { type: 'json' }
import { GenerationRuntime } from '../../src/host/generation/generation-runtime.ts'
import { GenerationSourceClient } from '../../src/host/generation/source-client.ts'
import { SourceGenerationPreparer } from '../../src/host/generation/source-preparer.ts'
import { SourceClientError } from '../../src/host/source-client/http-client.ts'
import { ImageReaderError } from '../../src/host/image-reader/errors.ts'
import runtimeArtifacts from '../../config/runtime-artifacts.json' with { type: 'json' }
import { materializeManagedCliModule, managedCliModulePath } from '../../scripts/build/cli-module.mjs'
import { CLI_MAX_BODY_BYTES } from '../../src/cli/contract.ts'
import { createCliHandler } from '../../src/host/cli/route.ts'
import {
  IMAGE_READER_FORBIDDEN_SOURCE_SENTINELS,
  IMAGE_READER_SENTINEL_PROMPT,
  createImageReaderProviderFailureFixture,
} from '../support/image-reader-provider-failure.ts'

const CLI_SOURCE_PATH = resolve(process.cwd(), runtimeArtifacts.managedCli.sourceEntryRelativePath)
let cliPath = ''
let temporaryRoot = ''

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'harness-comfyui-installed-cli-'))
  cliPath = resolve(
    temporaryRoot,
    'node_modules/harness-comfyui',
    runtimeArtifacts.managedCli.outputEntryRelativePath,
  )
  await materializeManagedCliModule({
    entry: CLI_SOURCE_PATH,
    output: cliPath,
  })
})

afterAll(async () => {
  if (temporaryRoot.length > 0) await rm(temporaryRoot, { recursive: true, force: true })
})

const callDirectories: string[] = []
afterEach(async () => {
  await Promise.all(callDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function runCli(input: {
  readonly args: readonly string[]
  readonly stdin?: string
  readonly apiUrl: string
  readonly capability?: string
  readonly keepStdinOpen?: boolean
  readonly temporaryDirectory?: string
  readonly fault?: 'write' | 'close' | 'request'
  readonly requestError?: string
  readonly brokenStdout?: boolean
  readonly brokenStderr?: boolean
}): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string; readonly resultFileContent?: string; readonly temporaryDirectory: string }> {
  const directory = input.temporaryDirectory ?? await mkdtemp(join(temporaryRoot, 'call-中文 space-'))
  if (input.temporaryDirectory === undefined) callDirectories.push(directory)
  const faultPath = resolve('tests/support/managed-cli-result-file-fault.mjs')
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      ...(input.fault ? ['--import', faultPath] : []),
      cliPath, ...input.args,
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TMPDIR: directory,
        CLI_RESULT_FILE_TEST_FAULT: input.fault,
        CLI_RESULT_FILE_TEST_REQUEST_ERROR: input.requestError,
        DSH_HARNESS_COMFYUI_CLI_API: input.apiUrl,
        DSH_HARNESS_COMFYUI_CLI_CAPABILITY: input.capability ?? 'test_capability',
      },
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)))
    if (input.brokenStdout) child.stdout.destroy()
    if (input.brokenStderr) child.stderr.destroy()
    child.once('error', reject)
    child.once('close', code => {
      const output = Buffer.concat(stdout).toString('utf8')
      const result = { exitCode: code ?? 1, stdout: output, stderr: Buffer.concat(stderr).toString('utf8'), temporaryDirectory: directory }
      if (/^\/[^\r\n]+\n$/u.test(output)) {
        void readFile(output.slice(0, -1), 'utf8').then(resultFileContent => resolve({ ...result, resultFileContent }), reject)
      } else resolve(result)
    })
    if (!input.keepStdinOpen) child.stdin.end(input.stdin ?? '')
  })
}

async function serveImageReader(imageReader: unknown) {
  let handler: ((request: unknown, response: unknown) => void | Promise<void>) | undefined
  registerHarnessComfyuiCliRoute({
    webServer: {
      register(route: { readonly handler: typeof handler }) {
        handler = route.handler
        return () => undefined
      },
    },
    capabilities: {
      authorize: () => ({ sessionId: 'session_1', turn: 1, callId: 'call_1', cwd: '/workspace' }),
    },
    runtime: {},
    imageReader,
    workspaceRegistry: {},
  } as never)
  const server = createServer((request, response) => void handler!(request, response))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable.')
  return {
    apiUrl: `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  }
}

function expectCliResult(actual: {exitCode: number; stdout: string; stderr: string; resultFileContent?: string}, expected: {exitCode: number; stdout?: string; resultFileContent?: string; stderr: string}) {
  expect(actual.exitCode).toBe(expected.exitCode)
  if (expected.exitCode === 0) {
    expect(actual.stdout).toMatch(/^\/[^\r\n]+\n$/u)
    expect(actual.resultFileContent).toBe(expected.resultFileContent)
    expect(actual.stderr).toMatch(/^NEXT: /)
  } else {
    expect(actual.stdout).toBe(expected.stdout)
    expect(actual.stderr).toContain(expected.stderr.trimEnd())
    expect(actual.stderr).toContain('--help')
  }
}

async function serveCliData(data: unknown) {
  const requests: unknown[] = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown)
    response.end(JSON.stringify({ ok: true, data }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable')
  return {
    apiUrl: `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`, requests,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  }
}

describe('managed CLI result-file transport', () => {
  const commands = [
    { args: ['generation', 'submit', '--stdin'], input: { title: 'test', template_id: '1', instance_id: '2', model: null, parameters: {}, loras: [] }, data: { run_id: 'run_accepted' } },
    { args: ['generation', 'inspect-template-parameters', '--stdin'], input: { template_id: '1', instance_id: '2' }, data: { parameters: [], size_candidates: [] } },
    { args: ['generation', 'random-seeds', '--stdin'], input: { count: 2 }, data: { seeds: [12, 34] } },
    { args: ['generation', 'run-inputs', '--stdin'], input: { run_ids: ['run_1'] }, data: { runs: [{ run_id: 'run_1', workflow_status: 'available', workflow: { title: '中文 Workflow', nodes: [{ id: 9 }] } }] } },
    { args: ['generation', 'resolve-media', '--stdin'], input: { run_ids: ['run_1'] }, data: { runs: [{ run_id: 'run_1', images: [] }] } },
    { args: ['image', 'inspect', '--stdin'], input: { file_path: '/tmp/image.png' }, data: { provider: 'test', model: 'vision', file_path: '/tmp/image.png', observation: 'blue square' } },
  ]
  it.each(commands)('retains original JSON for normal and quiet $args', async ({ args, input, data }) => {
    const host = await serveCliData(data)
    try {
      const normal = await runCli({ args, stdin: JSON.stringify(input), apiUrl: host.apiUrl })
      const quiet = await runCli({ args: [...args, '--quiet'], stdin: JSON.stringify(input), apiUrl: host.apiUrl })
      expectCliResult(normal, { exitCode: 0, resultFileContent: `${JSON.stringify(data)}\n`, stderr: '' })
      expect(quiet.exitCode).toBe(0)
      expect(quiet.stdout).toMatch(/^\/[^\r\n]+\n$/u)
      expect(quiet.resultFileContent).toBe(normal.resultFileContent)
      expect(quiet.stdout).not.toBe(normal.stdout)
      expect(quiet.stderr).toBe('')
      expect(host.requests).toHaveLength(2)
    } finally { await host.close() }
  })

  it('executes the documented Python consumer by reading the installed CLI result file', async () => {
    const host = await serveCliData({ provider: 'test', model: 'vision', file_path: '/absolute/local/path/result.png', observation: 'blue square' })
    const directory = await mkdtemp(join(temporaryRoot, 'python-中文 space-'))
    callDirectories.push(directory)
    try {
      const reference = await readFile(resolve('.agents/skills/local-image-reader/references/image-inspection-cli.md'), 'utf8')
      const body = reference.match(/```python\n([\s\S]*?)\n\s*```/u)?.[1]
      if (!body) throw new Error('Documented Python example is unavailable')
      const code = body.split('\n').map(line => line.slice(3)).join('\n')
      const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn('python3', ['-c', code], { env: {
          ...process.env, TMPDIR: directory,
          DSH_HARNESS_COMFYUI_NODE_EXECUTABLE: process.execPath,
          DSH_HARNESS_COMFYUI_CLI: cliPath,
          DSH_HARNESS_COMFYUI_CLI_API: host.apiUrl,
          DSH_HARNESS_COMFYUI_CLI_CAPABILITY: 'python-capability',
        } })
        const stdout: Buffer[] = []; const stderr: Buffer[] = []
        child.stdout.on('data', value => stdout.push(Buffer.from(value)))
        child.stderr.on('data', value => stderr.push(Buffer.from(value)))
        child.once('error', reject)
        child.once('close', code => resolve({ exitCode: code ?? 1, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }))
      })
      expect(result).toEqual({ exitCode: 0, stdout: 'blue square\n', stderr: '' })
      expect(host.requests).toHaveLength(1)
      expect(await readdir(directory)).toHaveLength(1)
    } finally { await host.close() }
  })

  it.each([{ ok: true }, { ok: true, data: null }, { ok: true, data: [] }, { ok: true, data: {} }, { ok: true, data: { run_id: null } }])('rejects a successful submit envelope without valid result data before reporting acceptance: %j', async envelope => {
    let requests = 0
    const server = createServer((_request, response) => {
      requests += 1
      response.end(JSON.stringify(envelope))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable')
    try {
      const result = await runCli({ args: commands[0].args, stdin: JSON.stringify(commands[0].input), apiUrl: `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1` })
      expect(result.exitCode).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('CLI_PROTOCOL_ERROR')
      expect(result.stderr).not.toContain('Run was accepted')
      expect(result.stderr).not.toContain('CLI_RESULT_FILE_WRITE_FAILED')
      expect(await readdir(result.temporaryDirectory)).toEqual([])
      expect(requests).toBe(1)
    } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  })

  it('discards the unpublished file after a Host or protocol failure', async () => {
    let requests = 0
    const server = createServer((_request, response) => {
      requests += 1
      response.end(requests === 1
        ? JSON.stringify({ ok: false, error: { code: 'TEST_HOST_FAILURE', message: 'controlled error' } })
        : 'invalid JSON')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable')
    try {
      for (const error of ['TEST_HOST_FAILURE', 'CLI_PROTOCOL_ERROR']) {
        const result = await runCli({ args: ['generation', 'random-seeds', '--stdin'], stdin: '{"count":1}', apiUrl: `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1` })
        expect(result.exitCode).toBe(1)
        expect(result.stdout).toBe('')
        expect(result.stderr).toContain(error)
        expect(await readdir(result.temporaryDirectory)).toEqual([])
      }
      expect(requests).toBe(2)
    } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  })

  it.each([
    ['network unavailable', 'CLI_REQUEST_FAILED: network unavailable. Next:'],
    ['network unavailable.', 'CLI_REQUEST_FAILED: network unavailable. Next:'],
    ['CLI_PROTOCOL_ERROR: invalid response', 'CLI_PROTOCOL_ERROR: invalid response. Next:'],
    ['CLI_PROTOCOL_ERROR: invalid response.', 'CLI_PROTOCOL_ERROR: invalid response. Next:'],
    ['cannot reach http://127.0.0.1:1234/api', 'cannot reach http://127.0.0.1:1234/api. Next:'],
    ['cannot reach http://127.0.0.1:1234/api.', 'cannot reach http://127.0.0.1:1234/api. Next:'],
    ['请求失败。', 'CLI_REQUEST_FAILED: 请求失败。 Next:'],
    ['request failed!', 'CLI_REQUEST_FAILED: request failed! Next:'],
  ])('separates request diagnostics from help with one sentence ending: %s', async (requestError, expectedPrefix) => {
    const result = await runCli({
      args: ['generation', 'random-seeds', '--stdin'], stdin: '{"count":1}',
      apiUrl: 'http://127.0.0.1:1/api/harness-comfyui/cli/v1',
      fault: 'request', requestError,
    })
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr.startsWith(expectedPrefix)).toBe(true)
    expect(await readdir(result.temporaryDirectory)).toEqual([])
  })

  it('reports the configured response byte limit after one completed Host request', async () => {
    let requests = 0
    const server = createServer((_request, response) => {
      requests += 1
      response.end('x'.repeat(32 * 1024 * 1024 + 1))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable')
    try {
      const result = await runCli({ args: ['generation', 'random-seeds', '--stdin'], stdin: '{"count":1}', apiUrl: `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1` })
      expect(result.exitCode).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('CLI_RESPONSE_TOO_LARGE')
      expect(result.stderr).toContain('33554432')
      expect(result.stderr).toContain('stop dependent work. Next:')
      expect(result.stderr).not.toContain('work..')
      expect(result.stderr).toContain('generation random-seeds --help')
      expect(requests).toBe(1)
      expect(await readdir(result.temporaryDirectory)).toEqual([])
    } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  })

  it('does not send a Host request when allocation fails or the temporary path has control characters', async () => {
    const host = await serveCliData({ seeds: [1] })
    try {
      for (const temporaryDirectory of [join(temporaryRoot, 'missing'), join(temporaryRoot, 'bad\npath')]) {
        const result = await runCli({ args: ['generation', 'random-seeds', '--stdin'], stdin: '{"count":1}', apiUrl: host.apiUrl, temporaryDirectory })
        expect(result.exitCode).toBe(2)
        expect(result.stdout).toBe('')
        expect(result.stderr).toContain('CLI_RESULT_FILE_PREPARE_FAILED')
        expect(result.stderr).toContain('Host request was not sent')
      }
      const help = await runCli({ args: ['generation', 'random-seeds', '--help'], apiUrl: host.apiUrl, temporaryDirectory: join(temporaryRoot, 'missing'), keepStdinOpen: true })
      expect(help.exitCode).toBe(0)
      expect(help.stdout).toContain('CLI_RESULT_FILE_PREPARE_FAILED')
      expect(host.requests).toHaveLength(0)
    } finally { await host.close() }
  })

  it.each(['write', 'close'] as const)('reports an accepted Run after a %s failure without resubmitting', async fault => {
    const host = await serveCliData({ run_id: 'run_already_accepted' })
    try {
      const result = await runCli({ args: commands[0].args, stdin: JSON.stringify(commands[0].input), apiUrl: host.apiUrl, fault })
      expect(result.exitCode).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('CLI_RESULT_FILE_WRITE_FAILED')
      expect(result.stderr).toContain('Host command generation.submit succeeded')
      expect(result.stderr).toContain('Run was accepted: run_already_accepted')
      expect(result.stderr).toContain(fault)
      expect(await readdir(result.temporaryDirectory)).toEqual([])
      expect(host.requests).toHaveLength(1)
    } finally { await host.close() }
  })

  it('reports a completed image inspection without repeating the Provider request after saving fails', async () => {
    let providerCalls = 0
    const host = await serveImageReader({ inspect: async () => {
      providerCalls += 1
      return { provider: 'test', model: 'vision', filePath: '/tmp/image.png', observation: 'blue square' }
    } })
    try {
      const result = await runCli({ args: ['image', 'inspect', '--stdin'], stdin: '{"file_path":"/tmp/image.png"}', apiUrl: host.apiUrl, fault: 'write' })
      expect(result.exitCode).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('Host command image.inspect succeeded')
      expect(await readdir(result.temporaryDirectory)).toEqual([])
      expect(providerCalls).toBe(1)
    } finally { await host.close() }
  })

  it('retains a completed result when stdout has EPIPE and reports its path', async () => {
    const host = await serveCliData({ seeds: [98] })
    try {
      const result = await runCli({ args: ['generation', 'random-seeds', '--stdin'], stdin: '{"count":1}', apiUrl: host.apiUrl, brokenStdout: true })
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('CLI_RESULT_PATH_WRITE_FAILED')
      expect(result.stderr).toContain('stdout')
      const directories = await readdir(result.temporaryDirectory)
      expect(directories).toHaveLength(1)
      const path = join(result.temporaryDirectory, directories[0]!, 'result.json')
      expect(result.stderr).toContain(path)
      expect(await readFile(path, 'utf8')).toBe('{"seeds":[98]}\n')
      expect(host.requests).toHaveLength(1)
    } finally { await host.close() }
  })

  it('retains the published file and exits nonzero when NEXT cannot be written to stderr', async () => {
    const host = await serveCliData({ seeds: [98] })
    try {
      const result = await runCli({ args: ['generation', 'random-seeds', '--stdin'], stdin: '{"count":1}', apiUrl: host.apiUrl, brokenStderr: true })
      expect(result.exitCode).toBe(1)
      expect(result.resultFileContent).toBe('{"seeds":[98]}\n')
      expect(host.requests).toHaveLength(1)
    } finally { await host.close() }
  })

  it('does not retry or claim delivery when an error diagnostic cannot be written', async () => {
    const host = await serveCliData({ seeds: [98] })
    try {
      const result = await runCli({ args: ['generation', 'random-seeds', '--stdin'], stdin: '{"count":1}', apiUrl: host.apiUrl, temporaryDirectory: join(temporaryRoot, 'missing'), brokenStderr: true })
      expect(result.exitCode).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toBe('')
      expect(host.requests).toHaveLength(0)
    } finally { await host.close() }
  })

  it('preserves ordering, duplicates, partial errors and full Workflow in concurrent queries', async () => {
    const run = { run_id: 'run_12345678', lookup_status: 'available', workflow_status: 'available', workflow: { nodes: [{ id: 1, title: '中文', widgets_values: ['x'.repeat(50000)] }] } }
    const data = { runs: [run, { run_id: 'missing', lookup_status: 'error', error: { code: 'GENERATION_RUN_NOT_FOUND', message: 'missing' } }, run] }
    const host = await serveCliData(data)
    try {
      const input = { args: ['generation', 'run-inputs', '--stdin', '--quiet'], stdin: '{"run_ids":["run_12345678","missing","run_12345678"]}', apiUrl: host.apiUrl }
      const results = await Promise.all([runCli(input), runCli(input), runCli(input)])
      expect(new Set(results.map(result => result.stdout)).size).toBe(3)
      for (const result of results) {
        expect(result.exitCode).toBe(0)
        expect(result.resultFileContent).toBe(`${JSON.stringify(data)}\n`)
      }
      expect(host.requests).toHaveLength(3)
      expect(host.requests).toEqual(Array(3).fill({ command: 'generation.run-inputs', run_ids: ['run_12345678', 'missing', 'run_12345678'] }))
    } finally { await host.close() }
  })
})

describe('installed managed Harness ComfyUI CLI executable', () => {
  it('rejects Catalog execution and help before contacting the Host', async () => {
    let requests = 0
    const server = createServer((_request, response) => { requests += 1; response.end() })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable.')
    try {
      const commands = [
        ['catalog', 'template', 'resolve', '--id', '39'],
        ['catalog', 'generation-model', 'resolve', '--id', '3'],
        ['catalog', 'lora', 'resolve', '--id', '91'],
        ['catalog', 'instance', 'list'],
        ['catalog', 'search', '--kind', 'model', '--query', '', '--page', '1'],
        ['catalog', '--help'],
        ['catalog', 'instance', 'list', '--help'],
        ['catalog instance list'],
      ]
      for (const args of commands) {
        const result = await runCli({
          args, apiUrl: `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`, keepStdinOpen: true,
        })
        expect(result.exitCode).toBe(2)
        expect(result.stdout).toBe('')
        expect(result.stderr).toContain('CLI_ARGUMENT_INVALID')
        expect(result.stderr).toContain('--help')
        expect(result.stderr).not.toMatch(/Next:.*catalog|NEXT:.*catalog/u)
      }
      expect(requests).toBe(0)
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
  it('keeps successful JSON identical when quiet suppresses the next action', async () => {
    const host = await serveImageReader({ inspect: async () => ({ provider: 'test', model: 'vision', filePath: '/tmp/image.png', observation: 'blue square' }) })
    try {
      const input = { apiUrl: host.apiUrl, stdin: '{"file_path":"/tmp/image.png"}' }
      const normal = await runCli({ ...input, args: ['image', 'inspect', '--stdin'] })
      const quiet = await runCli({ ...input, args: ['image', 'inspect', '--stdin', '--quiet'] })
      expect(normal.exitCode).toBe(0)
      expect(quiet.exitCode).toBe(0)
      expect(normal.stdout).toMatch(/^\/[^\r\n]+\n$/u)
      expect(normal.stdout).not.toBe(quiet.stdout)
      expect(normal.resultFileContent).toBe(quiet.resultFileContent)
      expect(JSON.parse(normal.resultFileContent!)).toEqual({ provider: 'test', model: 'vision', file_path: '/tmp/image.png', observation: 'blue square' })
      expect(normal.stderr).toContain('observation')
      expect(quiet.stderr).toBe('')
    } finally { await host.close() }
  })

  it.each([
    ['generation'], ['generation', 'submit'], ['generation', 'inspect-template-parameters'], ['generation', 'random-seeds'], ['generation', 'run-inputs'], ['generation', 'resolve-media'],
  ])('provides offline help for %j', async (...command) => {
    const result = await runCli({ args: [...command, '--help'], apiUrl: '', keepStdinOpen: true })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('下一步')
    expect(result.stdout).not.toContain('catalog')
    expect(result.stderr).toBe('')
  })

  it.each([
    ['image inspect --stdin'], ['image inspect', '--stdin'], ['image', 'inspect'],
    ['image', 'inspect', '--stdin', '--extra'], ['--hlep'], ['--quiet', '--quiet'],
  ])('classifies malformed argv %j before reading input', async (...args) => {
    const result = await runCli({ args, apiUrl: '', keepStdinOpen: true })
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('CLI_ARGUMENT_INVALID')
    expect(result.stderr).toContain('--help')
  })
  it('guides from offline root help to image help without waiting for stdin', async () => {
    for (const args of [['--help'], ['image', '--help'], ['image', 'inspect', '--help']]) {
      const result = await runCli({ args, apiUrl: '', keepStdinOpen: true })
      expect(result.exitCode).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout).toContain('下一步')
      expect(result.stdout).toContain('image')
      if (args.length === 3) {
        expect(result.stdout).toContain('file_path')
        expect(result.stdout).toContain('EOF')
        expect(result.stdout).toContain('observation')
      }
    }
  })

  it('explains the production Python argv mistake as an argument error', async () => {
    const result = await runCli({ args: ['image inspect', '--stdin'], stdin: '{}', apiUrl: '' })
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('CLI_ARGUMENT_INVALID:')
    expect(result.stderr).toContain("'image', 'inspect', '--stdin'")
    expect(result.stderr).toContain('image inspect --help')
    expect(result.stdout).toBe('')
  })

  it('derives the source runtime output from the managed CLI artifact definition', () => {
    expect(managedCliModulePath(process.cwd()))
      .toBe(resolve(process.cwd(), runtimeArtifacts.managedCli.outputEntryRelativePath))
  })

  it('posts only the documented business request with the Host capability', async () => {
    let posted: unknown
    let authorization: string | undefined
    const server = createServer(async (request, response) => {
      authorization = request.headers.authorization
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      posted = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
      const body = JSON.stringify({ ok: true, data: { run_id: 'run_cli_1' } })
      response.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
      response.end(body)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable.')
    const apiUrl = `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`
    const generation = {
      title: 'CLI generation',
      instance_id: '2',
      template_id: '39',
      model: null,
      parameters: { positive_prompt: '1girl' },
      loras: [],
    }

    const result = await runCli({
      args: ['generation', 'submit', '--stdin'],
      stdin: JSON.stringify(generation),
      apiUrl,
      capability: 'capability_from_host',
    })

    expectCliResult(result, { exitCode: 0, resultFileContent: '{"run_id":"run_cli_1"}\n', stderr: '' })
    expect(authorization).toBe('Bearer capability_from_host')
    expect(posted).toEqual({ command: 'generation.submit', request: generation })
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it('prints ordered per-Run lookup errors as a successful JSON result', async () => {
    let posted: unknown
    const data = {
      runs: [
        {
          run_id: 'run_1',
          lookup_status: 'available',
          arguments: { title: 'portrait', template_id: '39', parameters: {}, loras: [] },
          workflow_status: 'available',
          workflow: { version: 0.4 },
        },
        {
          run_id: 'missing',
          lookup_status: 'error',
          error: { code: 'GENERATION_RUN_NOT_FOUND', message: 'Generation Run was not found.' },
        },
      ],
    }
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      posted = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
      const body = JSON.stringify({ ok: true, data })
      response.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
      response.end(body)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable.')

    const result = await runCli({
      args: ['generation', 'run-inputs', '--stdin'],
      stdin: JSON.stringify({ run_ids: ['run_1', 'missing'] }),
      apiUrl: `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`,
    })

    expectCliResult(result, { exitCode: 0, resultFileContent: `${JSON.stringify(data)}\n`, stderr: '' })
    expect(posted).toEqual({ command: 'generation.run-inputs', run_ids: ['run_1', 'missing'] })
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it('posts template parameter inspection and ordinary random Seed requests', async () => {
    const posted: unknown[] = []
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { readonly command: string }
      posted.push(body)
      const data = body.command === 'generation.inspect-template-parameters'
        ? { parameters: [], size_candidates: [] }
        : { seeds: [12, 34] }
      const responseBody = JSON.stringify({ ok: true, data })
      response.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(responseBody) })
      response.end(responseBody)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable.')
    const apiUrl = `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`

    const inspection = await runCli({
      args: ['generation', 'inspect-template-parameters', '--stdin'],
      stdin: JSON.stringify({ template_id: '34', instance_id: '2' }),
      apiUrl,
    })
    const seeds = await runCli({
      args: ['generation', 'random-seeds', '--stdin'],
      stdin: JSON.stringify({ count: 2 }),
      apiUrl,
    })

    expectCliResult(inspection, {
      exitCode: 0,
      resultFileContent: `${JSON.stringify({ parameters: [], size_candidates: [] })}\n`,
      stderr: '',
    })
    expectCliResult(seeds, { exitCode: 0, resultFileContent: `${JSON.stringify({ seeds: [12, 34] })}\n`, stderr: '' })
    expect(posted).toEqual([
      { command: 'generation.inspect-template-parameters', template_id: '34', instance_id: '2' },
      { command: 'generation.random-seeds', count: 2 },
    ])
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it('posts the documented Run media and single-image inspection requests', async () => {
    const posted: unknown[] = []
    const media = {
      runs: [{
        run_id: 'run_1', lookup_status: 'available', title: 'portrait', parameters: { positive_prompt: '1girl' },
        images: [{
          media_id: 'media_1', node_id: '10', output_index: 0, filename: 'result.png',
          media_type: 'image/png', file_path: '/media/result.png',
        }],
      }],
    }
    const inspection = {
      provider: 'provider-a', model: 'vision-a', file_path: '/media/result.png', observation: '可见一名人物。',
    }
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { readonly command: string }
      posted.push(requestBody)
      const data = requestBody.command === 'generation.resolve-media' ? media : inspection
      const body = JSON.stringify({ ok: true, data })
      response.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
      response.end(body)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable.')
    const apiUrl = `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`

    const mediaResult = await runCli({
      args: ['generation', 'resolve-media', '--stdin'],
      stdin: JSON.stringify({ run_ids: ['run_1'] }),
      apiUrl,
    })
    const inspectionResult = await runCli({
      args: ['image', 'inspect', '--stdin'],
      stdin: JSON.stringify({ file_path: '/media/result.png' }),
      apiUrl,
    })
    const promptedInspectionResult = await runCli({
      args: ['image', 'inspect', '--stdin'],
      stdin: JSON.stringify({ file_path: '/media/result.png', prompt: '只识别图片中的文字。' }),
      apiUrl,
    })

    expectCliResult(mediaResult, { exitCode: 0, resultFileContent: `${JSON.stringify(media)}\n`, stderr: '' })
    expectCliResult(inspectionResult, { exitCode: 0, resultFileContent: `${JSON.stringify(inspection)}\n`, stderr: '' })
    expectCliResult(promptedInspectionResult, { exitCode: 0, resultFileContent: `${JSON.stringify(inspection)}\n`, stderr: '' })
    expect(posted).toEqual([
      { command: 'generation.resolve-media', run_ids: ['run_1'] },
      { command: 'image.inspect', file_path: '/media/result.png' },
      { command: 'image.inspect', file_path: '/media/result.png', prompt: '只识别图片中的文字。' },
    ])
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it('rejects the old Run media command without making an HTTP request', async () => {
    let requests = 0
    const server = createServer((_request, response) => {
      requests += 1
      response.end()
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable.')

    const result = await runCli({
      args: ['image', 'run-media', '--stdin'],
      stdin: JSON.stringify({ run_ids: ['run_1'] }),
      apiUrl: `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`,
    })

    expectCliResult(result, {
      exitCode: 2,
      stdout: '',
      stderr: 'CLI_ARGUMENT_INVALID: CLI command is invalid; received argv: ["image","run-media","--stdin"]. Pass the command words and options shown by --help\n',
    })
    expect(requests).toBe(0)
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it('reports an output limit through the Host route and installed CLI with an actionable next step', async () => {
    const entry = errorCatalog.IMAGE_READER_OUTPUT_LIMIT
    const server = await serveImageReader({ inspect: async () => {
      throw new ImageReaderError('IMAGE_READER_OUTPUT_LIMIT', `${entry.reason} ${entry.next_step}`)
    } })
    try {
      const result = await runCli({ args: ['image', 'inspect', '--stdin'], stdin: JSON.stringify({ file_path: '/media/result.png' }), apiUrl: server.apiUrl })
      expect(result.exitCode).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('IMAGE_READER_OUTPUT_LIMIT')
      expect(result.stderr).toContain(entry.reason)
      expect(result.stderr).toContain(entry.next_step)
      expect(result.stderr).toContain('image inspect --help')
    } finally { await server.close() }
  })

  it('prints the complete Host image provider diagnostic as one stderr line', async () => {
    const diagnostic = 'The runtime visual model did not complete the image inspection. profile_name="配置 B"; profile_id="profile-b"; connection_type="runtime"; provider="opencode-go"; model="qwen3.8-flash"; temperature=0.1; max_tokens=8192; finish_kind="error"; failure_code="UPSTREAM_IMAGE_ERROR"; failure_status=422; provider_retry_after_ms=1250; request_id="request-123".'
    const server = createServer(async (_request, response) => {
      const body = JSON.stringify({
        ok: false,
        error: { code: 'IMAGE_READER_PROVIDER_FAILED', message: diagnostic },
      })
      response.writeHead(409, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
      response.end(body)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable.')

    const result = await runCli({
      args: ['image', 'inspect', '--stdin'],
      stdin: JSON.stringify({ file_path: '/media/result.png' }),
      apiUrl: `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`,
    })

    expectCliResult(result, {
      exitCode: 1,
      stdout: '',
      stderr: `IMAGE_READER_PROVIDER_FAILED: ${diagnostic}\n`,
    })
    expect(result.stderr.trimEnd().split('\n')).toHaveLength(1)
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it('prints an actual sentinel-bearing service failure without copying forbidden sources to CLI stderr', async () => {
    const failureFixture = createImageReaderProviderFailureFixture()
    const server = await serveImageReader(failureFixture.service)
    try {
      const result = await runCli({
        args: ['image', 'inspect', '--stdin'],
        stdin: JSON.stringify({
          file_path: failureFixture.filePath,
          prompt: IMAGE_READER_SENTINEL_PROMPT,
        }),
        apiUrl: server.apiUrl,
      })

      expect(result.exitCode).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('IMAGE_READER_PROVIDER_FAILED: ')
      for (const source of IMAGE_READER_FORBIDDEN_SOURCE_SENTINELS) {
        expect(result.stderr).not.toContain(source)
      }
    } finally {
      await server.close()
      failureFixture.dispose()
    }
  })

  it('reports an invalid historical Run stdin contract without making an HTTP request', async () => {
    let requests = 0
    const server = createServer((_request, response) => {
      requests += 1
      response.end()
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable.')

    const result = await runCli({
      args: ['generation', 'run-inputs', '--stdin'],
      stdin: JSON.stringify({ run_ids: [] }),
      apiUrl: `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`,
    })

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('CLI_REQUEST_INVALID: CLI request run_ids must contain between 1 and 20 strings')
    expect(requests).toBe(0)
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it('reports malformed and invalid Generation submit stdin without making an HTTP request', async () => {
    let requests = 0
    const server = createServer((_request, response) => {
      requests += 1
      response.end()
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable.')
    const apiUrl = `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`

    for (const stdin of ['{', '{}']) {
      const result = await runCli({
        args: ['generation', 'submit', '--stdin'],
        stdin,
        apiUrl,
      })

      expect(result.exitCode).toBe(2)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('CLI_REQUEST_INVALID: ')
    }
    expect(requests).toBe(0)
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it.each([
    ['Generation media resolution', ['generation', 'resolve-media', '--stdin']],
    ['image inspection', ['image', 'inspect', '--stdin']],
  ])('rejects oversized %s stdin with the documented command-level error', async (_label, args) => {
    const result = await runCli({
      args,
      stdin: 'x'.repeat(CLI_MAX_BODY_BYTES + 1),
      apiUrl: 'http://127.0.0.1:1/api/harness-comfyui/cli/v1',
    })

    expectCliResult(result, {
      exitCode: 2,
      stdout: '',
      stderr: 'CLI_REQUEST_TOO_LARGE: stdin exceeds the maximum request size',
    })
    expect(result.stderr).toContain(String(CLI_MAX_BODY_BYTES))
  })

  it('rejects undocumented identity options before making an HTTP request', async () => {
    let requests = 0
    const server = createServer((_request, response) => {
      requests += 1
      response.end()
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable.')

    const result = await runCli({
      args: ['generation', 'submit', '--stdin', '--session-id', 'forged'],
      stdin: '{}',
      apiUrl: `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`,
    })

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('CLI_ARGUMENT_INVALID: CLI command is invalid')
    expect(requests).toBe(0)
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it.each([
    ['instance', 404, ['template-bundle/29', 'instance/2'], '数据源读取 instance 记录（ID：2）返回 HTTP 404。请核对当前目录记录和数据源配置。'],
    ['template-bundle', 503, ['template-bundle/29'], '数据源读取 template-bundle 记录（ID：29）返回 HTTP 503。请核对当前目录记录和数据源配置。'],
  ] as const)('prints the %s HTTP %s diagnostic through the parameter inspection route and installed CLI', async (failedOperation, status, expectedReads, message) => {
    const reads: string[] = []
    const runtime = new GenerationRuntime({
      runRepositoryFile: join(temporaryRoot, 'source-diagnostic', 'runs.sqlite'),
      runDirectory: join(temporaryRoot, 'source-diagnostic', 'runs'),
      savedMediaDirectory: join(temporaryRoot, 'source-diagnostic', 'media'),
      preparer: new SourceGenerationPreparer({
        source: new GenerationSourceClient({
          settings: { get: () => ({ url: 'http://127.0.0.1', port: 18093 }) },
          read: async ({ operation, id }) => {
            reads.push(`${operation}/${id}`)
            if (operation === failedOperation) {
              throw new SourceClientError('SOURCE_HTTP_ERROR', 'Source service returned an HTTP error.', {
                status, responseBody: { message: 'Unverified server explanation', extra: 'private-body-value' },
              })
            }
            return { status: 'ok', message: null, results: [{ id: 29, title: 'Test template', workflow_json: { nodes: [] } }], page: 1, page_size: 1, total_count: 1 }
          },
        }),
        defaultInstanceId: '2',
        compiler: {
          compile: async () => { throw new Error('unreachable') },
          inspectRuntimeParameters: async () => { throw new Error('unreachable') },
        },
      }),
    })
    const handler = createCliHandler({
      capabilities: {
        authorize: () => ({ sessionId: 'session_1', turn: 1, callId: 'call_1', cwd: '/workspace' }),
      },
      runtime,
      imageReader: { inspect: async () => { throw new Error('unreachable') } },
      workspaceRegistry: { resolveByPath: async () => undefined },
    })
    const server = createServer((request, response) => void handler(request, response))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable.')
    try {
      const result = await runCli({
        args: ['generation', 'inspect-template-parameters', '--stdin'],
        stdin: '{"template_id":"29","instance_id":"2"}',
        apiUrl: `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`,
      })

      expectCliResult(result, {
        exitCode: 1,
        stdout: '',
        stderr: `SOURCE_QUERY_FAILED: ${message}\n`,
      })
      expect(reads).toEqual(expectedReads)
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      runtime.close()
    }
  })

  it('returns structured Host errors and rejects non-loopback endpoints', async () => {
    const server = createServer(async (_request, response) => {
      const body = JSON.stringify({
        ok: false,
        error: { code: 'GENERATION_PARAMETERS_INVALID', message: 'Template parameters are unavailable.' },
      })
      response.writeHead(502, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
      response.end(body)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable.')

    const hostFailure = await runCli({
      args: ['generation', 'inspect-template-parameters', '--stdin'],
      stdin: '{"template_id":"39","instance_id":"2"}',
      apiUrl: `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`,
    })
    const endpointRejected = await runCli({
      args: ['generation', 'random-seeds', '--stdin'],
      stdin: '{"count":1}',
      apiUrl: 'https://example.com/api/harness-comfyui/cli/v1',
    })

    expectCliResult(hostFailure, {
      exitCode: 1,
      stdout: '',
      stderr: 'GENERATION_PARAMETERS_INVALID: Template parameters are unavailable.\n',
    })
    expect(endpointRejected.exitCode).toBe(2)
    expect(endpointRejected.stdout).toBe('')
    expect(endpointRejected.stderr).toContain('CLI_ENVIRONMENT_INVALID: DSH_HARNESS_COMFYUI_CLI_API')
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })
})

function registerHarnessComfyuiCliRoute(options: Parameters<typeof createCliHandler>[0] & { webServer: { register(route: { kind: 'prefix'; path: string; handler: ReturnType<typeof createCliHandler> }): () => void } }) {
  return options.webServer.register({ kind: 'prefix', path: '/api/harness-comfyui/cli/v1', handler: createCliHandler(options) })
}
