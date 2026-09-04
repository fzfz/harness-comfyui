import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import runtimeArtifacts from '../../config/runtime-artifacts.json' with { type: 'json' }
import { materializeCliModule, sourceCliModulePath } from '../../scripts/production/cli-module.mjs'
import { CLI_MAX_BODY_BYTES } from '../../src/cli/contract.ts'
import { registerHarnessComfyuiCliRoute } from '../../src/host/cli/route.ts'
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
  await materializeCliModule({
    entry: CLI_SOURCE_PATH,
    output: cliPath,
  })
})

afterAll(async () => {
  if (temporaryRoot.length > 0) await rm(temporaryRoot, { recursive: true, force: true })
})

async function runCli(input: {
  readonly args: readonly string[]
  readonly stdin?: string
  readonly apiUrl: string
  readonly capability?: string
}): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...input.args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        DSH_HARNESS_COMFYUI_CLI_API: input.apiUrl,
        DSH_HARNESS_COMFYUI_CLI_CAPABILITY: input.capability ?? 'test_capability',
      },
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)))
    child.once('error', reject)
    child.once('close', code => resolve({
      exitCode: code ?? 1,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }))
    child.stdin.end(input.stdin ?? '')
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
    catalog: {},
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

describe('installed managed Harness ComfyUI CLI executable', () => {
  it('derives the source runtime output from the managed CLI artifact definition', () => {
    expect(sourceCliModulePath(process.cwd()))
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

    expect(result).toEqual({ exitCode: 0, stdout: '{"run_id":"run_cli_1"}\n', stderr: '' })
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

    expect(result).toEqual({ exitCode: 0, stdout: `${JSON.stringify(data)}\n`, stderr: '' })
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

    expect(inspection).toEqual({
      exitCode: 0,
      stdout: `${JSON.stringify({ parameters: [], size_candidates: [] })}\n`,
      stderr: '',
    })
    expect(seeds).toEqual({ exitCode: 0, stdout: `${JSON.stringify({ seeds: [12, 34] })}\n`, stderr: '' })
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

    expect(mediaResult).toEqual({ exitCode: 0, stdout: `${JSON.stringify(media)}\n`, stderr: '' })
    expect(inspectionResult).toEqual({ exitCode: 0, stdout: `${JSON.stringify(inspection)}\n`, stderr: '' })
    expect(promptedInspectionResult).toEqual({ exitCode: 0, stdout: `${JSON.stringify(inspection)}\n`, stderr: '' })
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

    expect(result).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: 'CLI_ARGUMENT_INVALID: CLI command is invalid\n',
    })
    expect(requests).toBe(0)
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
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

    expect(result).toEqual({
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
    expect(result.stderr).toBe('CLI_REQUEST_INVALID: CLI request run_ids must contain between 1 and 20 strings\n')
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
      expect(result.stderr).toContain('CLI_ARGUMENT_INVALID: ')
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

    expect(result).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: 'CLI_REQUEST_TOO_LARGE: stdin exceeds the maximum request size\n',
    })
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
      args: ['catalog', 'template', 'resolve', '--id', '39', '--session-id', 'forged'],
      apiUrl: `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`,
    })

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('CLI_ARGUMENT_INVALID: CLI command options are invalid')
    expect(requests).toBe(0)
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it('returns structured Host errors and rejects non-loopback endpoints', async () => {
    const server = createServer(async (_request, response) => {
      const body = JSON.stringify({
        ok: false,
        error: { code: 'CATALOG_QUERY_FAILED', message: 'Catalog is unavailable.' },
      })
      response.writeHead(502, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
      response.end(body)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server address is unavailable.')

    const hostFailure = await runCli({
      args: ['catalog', 'template', 'resolve', '--id', '39'],
      apiUrl: `http://127.0.0.1:${address.port}/api/harness-comfyui/cli/v1`,
    })
    const endpointRejected = await runCli({
      args: ['catalog', 'instance', 'list'],
      apiUrl: 'https://example.com/api/harness-comfyui/cli/v1',
    })

    expect(hostFailure).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: 'CATALOG_QUERY_FAILED: Catalog is unavailable.\n',
    })
    expect(endpointRejected.exitCode).toBe(2)
    expect(endpointRejected.stdout).toBe('')
    expect(endpointRejected.stderr).toContain('CLI_ENVIRONMENT_INVALID: DSH_HARNESS_COMFYUI_CLI_API')
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })
})
