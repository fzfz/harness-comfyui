import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const SEMANTIC_CLIENT = resolve('scripts/source-client/imagegen-semantic-query.mjs')
const SOURCE_READ_CLIENT = resolve('scripts/source-client/imagegen-comfyui-source-read.mjs')
const TEST_HTTPS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCMZUaUA0h/EI2i
ox2fIBnxhlw3agd1d+OMN2UEOfEsF3PuG9rjByxtewXDm6IU7SXGZu5vPf5FPguB
cdgXvjRPXKpSQXCLXlOp2QFgu5VcG/uSmoTpR13Ce4HhFlD32gmWrt6AEONhWNM9
bNqsfQ5BdGD+qG7Fu5HTVAggs65YJx5fYwuobAgYXFCFUu6P0w/y+AtNIs8gNi/S
Y+7wdsOVHLDBIbvWM+3FbC49Oh05BwQFfw+imx1LcDFxWMUjVAZmbXztmY9D8vfa
7l0xJN5hU+vtgjObcpGhRFjF+ZJePVL1/ElqXUKCmWOJorkpBcgc5oMqMDxbiBYF
DGkD7NijAgMBAAECggEAP2B+flWHFfkSfu8UcZ9LptiI62j9Sf1fZo4hF0nSwZ0q
s7u2UVMNLrTg0r8AaWLucQRJMUVyca6DAiGys3Ek6wiBSJWK6RchPGSeNx0m3Qgy
xijjw+z3+dHIPSRWU7SFLJTvEy/MfUbcQPfRNRlU5J5VJNBDBRbZyuS9sIl8NAV1
hef9PODwuGFM7ZucgcpX+7mhdD5J3jD5gSY+Q/4d2y+oosR6u8lwZk3+6XmtiR/t
8V5IRqG1yiQRvh6HhmvAeUCH+PzIk+SSsTH9Ok2wyMhqJHhDDmZHQ8ahWJ3nwM/n
HKSrdA8/S2u42/nCtLno/z/pKI2Kps5cRIDr5xAhyQKBgQDAQFzecWwOqZOKRc06
lLrYiO5bYrdOgU9r/Cgl46rqTR4Xe94RtXHvkuMUloqr0vTReZxmvX61hp2T9/r4
jI026VtEzq1Z316TPdB4IyJZOflUI4QfxngafFd64wi2pglMJrb6ce+QkixU/e5Y
NYuvgCjHeGkBwPY88zUIHN5AawKBgQC68wgATlTnih6W812ERbrEth2YueznyvFy
Fbleo8lhLCcdTA5aMSDLq1xdn0F7ir0+iGelF7cCEKJq/WPTKnMKPCaQsuuN//sW
le/5FZUDbOx5I/XepM68MjaPfI3jfzL1Zih6xVWE9EN3m0m2tn4eMTNB0+REaL6e
bIeCr0l2qQKBgHp3hbFd50vf0lC+7mFm5S+S6uPkGokz7ngHhTu9r97ZiVXEXk5B
m3bVxzoSO/wAwlu+cFcyV0kjm7XqvkEep8ZXGQDX963MkN6S/f3Jw9O7Doz+oufq
8g9NLhzmC2LumfWco+seMVGTDBKIQBCI65a8uT14AsxPM4zYEOw+F4ZJAoGAd8v8
uJV5etXbPEe/CV/VivBYjuG1meNGTSD2pFq4VPiCKBfwqoMIzPqGOcgvogcJteSa
5gQIVd5q9bxiF5MAHPLmk5rTry71q0dxe2AFGSjXb9lHWOCrSZWzuMbL9ZgxA2fv
UJzbbFNKWH6+AcN3lclZWzl48Q1d+Q761xeUL+ECgYAsR6n9z1KzAVJ3CEuF/3qz
uS6t6sXAOvd8cqztxZfVJyN3g43hbJhymRlw3oePMi0D76aqAOhekakKKGwHrwan
Pcht3UUQ4KbFEOqhbOJvs5nyir1lhIZ2cDdEf0FrubEi31YkGHFUbCXvnOsS5UZy
C9RjJpmlJWLopzq6+E1yRA==
-----END PRIVATE KEY-----`
const TEST_HTTPS_CERT = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUD8/QCyUpWCJhE+XA7+sHtkmWntQwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMB4XDTI2MDkwNjA1MjczOVoXDTI2MDkw
ODA1MjczOVowFDESMBAGA1UEAwwJMTI3LjAuMC4xMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAjGVGlANIfxCNoqMdnyAZ8YZcN2oHdXfjjDdlBDnxLBdz
7hva4wcsbXsFw5uiFO0lxmbubz3+RT4LgXHYF740T1yqUkFwi15TqdkBYLuVXBv7
kpqE6UddwnuB4RZQ99oJlq7egBDjYVjTPWzarH0OQXRg/qhuxbuR01QIILOuWCce
X2MLqGwIGFxQhVLuj9MP8vgLTSLPIDYv0mPu8HbDlRywwSG71jPtxWwuPTodOQcE
BX8PopsdS3AxcVjFI1QGZm187ZmPQ/L32u5dMSTeYVPr7YIzm3KRoURYxfmSXj1S
9fxJal1CgpljiaK5KQXIHOaDKjA8W4gWBQxpA+zYowIDAQABo1MwUTAdBgNVHQ4E
FgQU8bycQkH1LNh5/cpmt2tw0hUSrm4wHwYDVR0jBBgwFoAU8bycQkH1LNh5/cpm
t2tw0hUSrm4wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAaJ7f
ohDOyP5373NNyK8gODg8qx2TiABWGfriLJP1KBO1+QP5nCPjoVb+n3LU8mmNQ+jI
031UNsy1IVYpLO5TGA2AfNH1BAewvoFM4KZQZFg7O0n7ybTnqM60TfUuoGzeQiXV
w8f4BmTxDY6bKnJUrKiIaIkzXgnoOwwKt+RpFI8cgjcl+/xUWxTS4dWZZxuL/9Qc
fTYTuszUh2cjw7yHElyZS1X2v/k6XO4irFEwh7+49vro/g3mnM/rvC0IOV6LT054
9Ah5l3IACvqygOKXobAbkE+yku9RB+oEqw4HyRdIhINZcDxbEDJWaivaOgjVmKum
H+UccP1ArXiEqxhwnw==
-----END CERTIFICATE-----`

function semanticDiscovery() {
  const search = {
    type: 'object',
    additionalProperties: false,
    required: ['mode'],
    description: 'Search branch for the base-model Catalog operation.',
    properties: {
      mode: { const: 'search', description: 'Catalog request branch discriminator for text search', example: 'search' },
      query: { type: 'string', minLength: 0, maxLength: 200, default: '', description: 'Base-model name text normalized before a literal LIKE search', example: 'watercolor' },
      page: { type: 'integer', minimum: 1, maximum: 100000, default: 1, description: 'One-based result page number', example: 1 },
      page_size: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'Maximum number of base-model items returned on one page', example: 20 },
    },
  }
  const resolveRequest = {
    type: 'object',
    additionalProperties: false,
    required: ['mode', 'id'],
    description: 'Resolve branch for one base-model Catalog record.',
    properties: {
      mode: { const: 'resolve', description: 'Catalog request branch discriminator for stable-ID resolution', example: 'resolve' },
      id: { type: 'string', minLength: 1, maxLength: 20, pattern: '^[1-9][0-9]{0,19}$', description: 'Decimal base-model record identifier', example: '123' },
    },
  }
  return {
    openapi: '3.1.0',
    paths: {
      '/internal/semantic/base-models': {
        post: {
          summary: 'Search or resolve base-model records',
          description: 'Search or resolve base-model records by base-model name.',
          operationId: 'querySemanticBaseModelsForSkill',
          'x-harness-tool-name': 'query_semantic_base_models',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CatalogBaseModelRequest' },
                examples: {
                  search: { value: { mode: 'search', query: 'watercolor', page: 1, page_size: 20 } },
                  resolve: { value: { mode: 'resolve', id: '123' } },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        CatalogBaseModelRequest: {
          type: 'object',
          oneOf: [
            { $ref: '#/components/schemas/CatalogBaseModelSearchRequest' },
            { $ref: '#/components/schemas/CatalogBaseModelResolveRequest' },
          ],
          description: 'Closed search-or-resolve request for the base-model Catalog operation.',
          example: { mode: 'search', query: 'watercolor', page: 1, page_size: 20 },
        },
        CatalogBaseModelSearchRequest: search,
        CatalogBaseModelResolveRequest: resolveRequest,
      },
    },
  }
}

async function requestBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

async function startServer(handler) {
  const server = createServer((request, response) => void handler(request, response))
  await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Test server did not expose a TCP port.')
  return {
    port: address.port,
    close: () => new Promise((resolvePromise, rejectPromise) => server.close(error => error ? rejectPromise(error) : resolvePromise())),
  }
}

async function startSecureServer(handler) {
  const server = createHttpsServer({ key: TEST_HTTPS_KEY, cert: TEST_HTTPS_CERT }, (request, response) => void handler(request, response))
  await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('HTTPS test server did not expose a TCP port.')
  return {
    port: address.port,
    close: () => new Promise((resolvePromise, rejectPromise) => server.close(error => error ? rejectPromise(error) : resolvePromise())),
  }
}

async function runClient(script, args, env = {}, onSpawn = () => undefined) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } })
    onSpawn(child)
    const stdout = []
    const stderr = []
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)))
    child.once('error', rejectPromise)
    child.once('close', exitCode => resolvePromise({
      exitCode,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }))
  })
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value)
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
  response.end(body)
}

function expectClientResult(result, expected) {
  expect(result.exitCode).toBe(expected.exitCode)
  expect(result.stdout).toBe(expected.stdout)
  if (expected.exitCode === 0) {
    expect(result.stderr).toMatch(/^NEXT: /)
  } else {
    const separator = result.stderr.lastIndexOf('\nNEXT: ')
    expect(separator).toBeGreaterThanOrEqual(0)
    expect(result.stderr.slice(0, separator)).toBe(expected.stderr)
    expect(result.stderr.slice(separator)).toContain('--help')
  }
}

describe('built-in semantic query client', () => {
  it.each([false, true])('preserves discovery JSON and exit success with quiet=%s', async quiet => {
    const body = JSON.stringify(semanticDiscovery(), null, 2) + '\n'
    const server = await startServer((request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(body)
    })
    try {
      const result = await runClient(SEMANTIC_CLIENT, ['--url', 'http://127.0.0.1', '--port', String(server.port), '--discovery-json', ...(quiet ? ['--quiet'] : [])])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe(body)
      if (quiet) expect(result.stderr).toBe('')
      else expect(result.stderr).toMatch(/^NEXT: .*--path <实际路径> --help\n$/)
    } finally { await server.close() }
  })

  it('adds a next operation without changing the successful JSON bytes', async () => {
    const server = await startServer((request, response) => sendJson(response, 200,
      request.url === '/internal/semantic' ? semanticDiscovery() : { results: [{ id: '42' }] }))
    try {
      const result = await runClient(SEMANTIC_CLIENT, ['--url', 'http://127.0.0.1', '--port', String(server.port), '--path', '/internal/semantic/base-models', '--mode', 'search'])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('{"results":[{"id":"42"}]}')
      expect(result.stderr).toContain('NEXT:')
      expect(result.stderr).toContain("--mode resolve --id '42'")
    } finally { await server.close() }
  })
  it('distinguishes empty search results and quiet output', async () => {
    const server = await startServer((request, response) => sendJson(response, 200,
      request.url === '/internal/semantic' ? semanticDiscovery() : { results: [] }))
    try {
      const args = ['--url', 'http://127.0.0.1', '--port', String(server.port), '--path', '/internal/semantic/base-models', '--mode', 'search']
      const normal = await runClient(SEMANTIC_CLIENT, args)
      const quiet = await runClient(SEMANTIC_CLIENT, [...args, '--quiet'])
      expect(normal.exitCode).toBe(0)
      expect(normal.stderr).toContain('results 为空')
      expect(normal.stderr).not.toContain('--mode resolve --id')
      expect(quiet).toEqual({ exitCode: 0, stdout: normal.stdout, stderr: '' })
    } finally { await server.close() }
  })
  it.each([
    'http://catalog.example.com:80',
    'https://catalog.example.com:443',
  ])('rejects an explicit port in the URL even when URL normalization would remove it: %s', async (url) => {
    const result = await runClient(SEMANTIC_CLIENT, [
      '--url', url, '--port', '18093',
      '--path', '/internal/semantic/base-models', '--mode', 'search',
    ])
    expectClientResult(result, {
      exitCode: 2,
      stdout: '',
      stderr: '{"error":{"code":"INVALID_ARGUMENT","message":"CLI arguments are invalid."}}\n',
    })
  })

  it.each([
    ['search', ['--mode', 'search', '--query', 'flux', '--page', '2', '--page_size', '5'], { mode: 'search', query: 'flux', page: 2, page_size: 5 }],
    ['resolve', ['--mode', 'resolve', '--id', '42'], { mode: 'resolve', id: '42' }],
  ])('uses the configured HTTP origin for discovery and %s', async (_name, businessArgs, expectedBody) => {
    const requests = []
    const expectedResponse = { ok: true, data: { item: expectedBody } }
    const server = await startServer(async (request, response) => {
      requests.push({ method: request.method, path: request.url, body: await requestBody(request) })
      if (request.url === '/internal/semantic') sendJson(response, 200, semanticDiscovery())
      else sendJson(response, 200, expectedResponse)
    })
    try {
      const result = await runClient(SEMANTIC_CLIENT, [
        '--url', 'http://127.0.0.1', '--port', String(server.port),
        '--path', '/internal/semantic/base-models', ...businessArgs,
      ])
      expectClientResult(result, { exitCode: 0, stdout: JSON.stringify(expectedResponse), stderr: '' })
      expect(requests).toEqual([
        { method: 'GET', path: '/internal/semantic', body: '' },
        { method: 'POST', path: '/internal/semantic/base-models', body: JSON.stringify(expectedBody) },
      ])
    } finally {
      await server.close()
    }
  })

  it('forwards a non-2xx business response without changing its bytes', async () => {
    const errorBody = { error: { code: 'CATALOG_BUSY', message: 'retry later' } }
    const server = await startServer(async (request, response) => {
      await requestBody(request)
      if (request.url === '/internal/semantic') sendJson(response, 200, semanticDiscovery())
      else sendJson(response, 503, errorBody)
    })
    try {
      const result = await runClient(SEMANTIC_CLIENT, [
        '--url', 'http://127.0.0.1', '--port', String(server.port),
        '--path', '/internal/semantic/base-models', '--mode', 'search',
      ])
      expectClientResult(result, { exitCode: 7, stdout: '', stderr: JSON.stringify(errorBody) })
    } finally {
      await server.close()
    }
  })

  it('reports connection failures through the existing public error contract', async () => {
    const server = await startServer((_request, response) => response.end())
    const port = server.port
    await server.close()
    const result = await runClient(SEMANTIC_CLIENT, [
      '--url', 'http://127.0.0.1', '--port', String(port),
      '--path', '/internal/semantic/base-models', '--mode', 'search',
    ])
    expectClientResult(result, {
      exitCode: 4,
      stdout: '',
      stderr: '{"error":{"code":"SOURCE_CONNECTION_FAILED","message":"Source service is unavailable."}}\n',
    })
  })

  it('reports a business-request connection failure after successful discovery', async () => {
    const server = await startServer((request, response) => {
      if (request.url === '/internal/semantic') sendJson(response, 200, semanticDiscovery())
      else request.socket.destroy()
    })
    try {
      const result = await runClient(SEMANTIC_CLIENT, [
        '--url', 'http://127.0.0.1', '--port', String(server.port),
        '--path', '/internal/semantic/base-models', '--mode', 'search',
      ])
      expectClientResult(result, {
        exitCode: 4,
        stdout: '',
        stderr: '{"error":{"code":"SOURCE_CONNECTION_FAILED","message":"Source service is unavailable."}}\n',
      })
    } finally {
      await server.close()
    }
  })

  it('uses HTTPS for discovery and the business request', async () => {
    const paths = []
    const server = await startSecureServer(async (request, response) => {
      paths.push(request.url)
      await requestBody(request)
      if (request.url === '/internal/semantic') sendJson(response, 200, semanticDiscovery())
      else sendJson(response, 200, { ok: true })
    })
    try {
      const result = await runClient(SEMANTIC_CLIENT, [
        '--url', 'https://127.0.0.1', '--port', String(server.port),
        '--path', '/internal/semantic/base-models', '--mode', 'search',
      ], { NODE_TLS_REJECT_UNAUTHORIZED: '0', NODE_NO_WARNINGS: '1' })
      expectClientResult(result, { exitCode: 0, stdout: '{"ok":true}', stderr: '' })
      expect(paths).toEqual(['/internal/semantic', '/internal/semantic/base-models'])
    } finally {
      await server.close()
    }
  })
})

describe('built-in Source read client', () => {
  it.each(['instance', 'template-bundle'])('describes actual %s responses', async command => {
    const successful = command === 'instance'
      ? { id: '31', title: 'test', url: 'http://localhost', credential_type: 'none' }
      : { id: '31', title: 'test', workflow_json: { nodes: [] } }
    for (const [body, message] of [[null, '空 JSON 结果'], [[], '空 JSON 结果'], [{}, '未提供记录 id'], [successful, command === 'instance' ? '实例记录已返回' : '模板源已返回']]) {
      const server = await startServer((request, response) => sendJson(response, 200,
        request.url === '/internal/comfyui-source' ? { openapi: '3.1.0', paths: {} } : body))
      try {
        for (const quiet of [false, true]) {
          const result = await runClient(SOURCE_READ_CLIENT, ['--url', 'http://127.0.0.1', '--port', String(server.port), command, '--id', '31', ...(quiet ? ['--quiet'] : [])])
          expect(result.exitCode).toBe(0)
          expect(result.stdout).toBe(JSON.stringify(body))
          if (quiet) expect(result.stderr).toBe('')
          else expect(result.stderr).toContain(message)
        }
      } finally { await server.close() }
    }
  })

  it.each([
    'http://catalog.example.com:80',
    'https://catalog.example.com:443',
  ])('rejects an explicit port in the URL even when URL normalization would remove it: %s', async (url) => {
    const result = await runClient(SOURCE_READ_CLIENT, [
      '--url', url, '--port', '18093', 'instance', '--id', '31',
    ])
    expectClientResult(result, {
      exitCode: 2,
      stdout: '',
      stderr: '{"error":{"code":"INVALID_ARGUMENT","message":"CLI arguments are invalid."}}\n',
    })
  })

  it.each([
    ['instance', '31', '/internal/comfyui-source/instances/31'],
    ['template-bundle', '284001', '/internal/comfyui-source/templates/284001/bundle'],
  ])('uses the configured HTTP origin for %s reads', async (command, id, targetPath) => {
    const requests = []
    const expectedResponse = { status: 'ok', results: [{ id }] }
    const server = await startServer(async (request, response) => {
      requests.push({ method: request.method, path: request.url, body: await requestBody(request) })
      if (request.url === '/internal/comfyui-source') sendJson(response, 200, { openapi: '3.1.0', paths: {} })
      else sendJson(response, 200, expectedResponse)
    })
    try {
      const result = await runClient(SOURCE_READ_CLIENT, [
        '--url', 'http://127.0.0.1', '--port', String(server.port), command, '--id', id,
      ])
      expectClientResult(result, { exitCode: 0, stdout: JSON.stringify(expectedResponse), stderr: '' })
      expect(requests).toEqual([
        { method: 'GET', path: '/internal/comfyui-source', body: '' },
        { method: 'GET', path: targetPath, body: '' },
      ])
    } finally {
      await server.close()
    }
  })

  it('reports connection failures through the existing public error contract', async () => {
    const server = await startServer((_request, response) => response.end())
    const port = server.port
    await server.close()
    const result = await runClient(SOURCE_READ_CLIENT, [
      '--url', 'http://127.0.0.1', '--port', String(port), 'instance', '--id', '31',
    ])
    expectClientResult(result, {
      exitCode: 4,
      stdout: '',
      stderr: '{"error":{"code":"SOURCE_CONNECTION_FAILED","message":"Source service is unavailable."}}\n',
    })
  })

  it('forwards a non-2xx Source response without changing its bytes', async () => {
    const errorBody = { error: { code: 'SOURCE_BUSY', message: 'retry later' } }
    const server = await startServer(async (request, response) => {
      await requestBody(request)
      if (request.url === '/internal/comfyui-source') sendJson(response, 200, { openapi: '3.1.0', paths: {} })
      else sendJson(response, 503, errorBody)
    })
    try {
      const result = await runClient(SOURCE_READ_CLIENT, [
        '--url', 'http://127.0.0.1', '--port', String(server.port), 'instance', '--id', '31',
      ])
      expectClientResult(result, { exitCode: 7, stdout: '', stderr: JSON.stringify(errorBody) })
    } finally {
      await server.close()
    }
  })

  it('uses HTTPS for discovery and the Source read request', async () => {
    const paths = []
    const server = await startSecureServer(async (request, response) => {
      paths.push(request.url)
      await requestBody(request)
      sendJson(response, 200, request.url === '/internal/comfyui-source' ? { openapi: '3.1.0', paths: {} } : { status: 'ok' })
    })
    try {
      const result = await runClient(SOURCE_READ_CLIENT, [
        '--url', 'https://127.0.0.1', '--port', String(server.port), 'instance', '--id', '31',
      ], { NODE_TLS_REJECT_UNAUTHORIZED: '0', NODE_NO_WARNINGS: '1' })
      expectClientResult(result, { exitCode: 0, stdout: '{"status":"ok"}', stderr: '' })
      expect(paths).toEqual(['/internal/comfyui-source', '/internal/comfyui-source/instances/31'])
    } finally {
      await server.close()
    }
  })
})

describe('built-in source client lifecycle', () => {
  const clients = [
    ['semantic query', SEMANTIC_CLIENT, ['--path', '/internal/semantic/base-models', '--mode', 'search'], '/internal/semantic', semanticDiscovery()],
    ['Source read', SOURCE_READ_CLIENT, ['instance', '--id', '31'], '/internal/comfyui-source', { openapi: '3.1.0', paths: {} }],
  ]

  it.each(clients)('enforces the total timeout during the %s business request', async (_name, script, clientArgs, discoveryPath, discoveryBody) => {
    const server = await startServer((request, response) => {
      if (request.url === discoveryPath) sendJson(response, 200, discoveryBody)
    })
    try {
      const result = await runClient(script, [
        '--url', 'http://127.0.0.1', '--port', String(server.port), '--timeout-ms', '25', ...clientArgs,
      ])
      expectClientResult(result, {
        exitCode: 5,
        stdout: '',
        stderr: '{"error":{"code":"TOTAL_TIMEOUT","message":"Source request timed out."}}\n',
      })
    } finally {
      await server.close()
    }
  })

  const cancellationCases = clients.flatMap(client => [
    [client[0], 'SIGINT', ...client.slice(1), 130, 'Source request was cancelled by SIGINT.'],
    [client[0], 'SIGTERM', ...client.slice(1), 143, 'Source request was cancelled by SIGTERM.'],
  ])

  it.each(cancellationCases)('reports %s business-request cancellation on %s', async (_name, signal, script, clientArgs, discoveryPath, discoveryBody, exitCode, message) => {
    let childProcess
    const server = await startServer((request, response) => {
      if (request.url === discoveryPath) sendJson(response, 200, discoveryBody)
      else childProcess.kill(signal)
    })
    try {
      const result = await runClient(script, [
        '--url', 'http://127.0.0.1', '--port', String(server.port), ...clientArgs,
      ], {}, child => { childProcess = child })
      expectClientResult(result, {
        exitCode,
        stdout: '',
        stderr: `${JSON.stringify({ error: { code: 'PROCESS_CANCELLED', message } })}\n`,
      })
    } finally {
      await server.close()
    }
  })
})
