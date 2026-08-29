import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const CLI_PATH = fileURLToPath(new URL('../../scripts/cli/harness-comfyui.mjs', import.meta.url))

async function runCli(input: {
  readonly args: readonly string[]
  readonly stdin?: string
  readonly apiUrl: string
  readonly capability?: string
}): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...input.args], {
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

describe('managed Harness ComfyUI CLI executable', () => {
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
