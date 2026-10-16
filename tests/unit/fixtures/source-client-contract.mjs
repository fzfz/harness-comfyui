import { createServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'

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

function promptTermDiscovery() {
  const discovery = semanticDiscovery()
  const path = discovery.paths['/internal/semantic/base-models']
  delete discovery.paths['/internal/semantic/base-models']
  discovery.paths['/internal/semantic/prompt-terms'] = path
  path.post.operationId = 'querySemanticPromptTermsForSkill'
  path.post['x-harness-tool-name'] = 'query_semantic_prompt_terms'
  const search = discovery.components.schemas.CatalogBaseModelSearchRequest
  search.properties.root_id = { type: 'string', pattern: '^[a-z][a-z0-9_]*$', description: 'Root ID', example: 'clothing' }
  search.properties.category_ids = { type: 'array', minItems: 1, maxItems: 16, uniqueItems: true, items: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' }, description: 'Category IDs', example: ['skirts'] }
  search.properties.category_match = { type: 'string', enum: ['any', 'all'], default: 'all', description: 'Category matching mode', example: 'any' }
  search.properties.classification_status = { type: 'string', enum: ['classified', 'evidence_gap', 'coverage_gap', 'unclassified'], description: 'Classification status', example: 'classified' }
  search.allOf = [{ if: { required: ['category_match'] }, then: { required: ['category_ids'] } }]
  return discovery
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
    close: () => new Promise((resolvePromise, rejectPromise) => (server.closeAllConnections(), server.close(error => error ? rejectPromise(error) : resolvePromise()))),
  }
}

async function startSecureServer(handler) {
  const server = createHttpsServer({ key: TEST_HTTPS_KEY, cert: TEST_HTTPS_CERT }, (request, response) => void handler(request, response))
  await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('HTTPS test server did not expose a TCP port.')
  return {
    port: address.port,
    close: () => new Promise((resolvePromise, rejectPromise) => (server.closeAllConnections(), server.close(error => error ? rejectPromise(error) : resolvePromise()))),
  }
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value)
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
  response.end(body)
}
export { semanticDiscovery, promptTermDiscovery, requestBody, startServer, startSecureServer, sendJson }
