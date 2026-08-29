#!/usr/bin/env node

import { stdin, stdout, stderr } from 'node:process'

import {
  CLI_MAX_BODY_BYTES,
  CLI_ENVIRONMENT_NAMES,
  CLI_ROUTE_PATH,
  parseCliArguments,
} from '../../src/cli/contract.ts'

const MAX_RESPONSE_BYTES = 32 * 1024 * 1024

function environment(name) {
  const value = process.env[name]
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} is unavailable outside a managed foreground shell Tool call`)
  }
  return value
}

function apiUrl() {
  const value = environment(CLI_ENVIRONMENT_NAMES.api)
  let url
  try {
    url = new URL(value)
  } catch {
    throw new TypeError(`${CLI_ENVIRONMENT_NAMES.api} is invalid`)
  }
  if (
    url.protocol !== 'http:'
    || (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost' && url.hostname !== '::1')
    || url.pathname !== CLI_ROUTE_PATH
    || url.search.length > 0
    || url.hash.length > 0
  ) {
    throw new TypeError(`${CLI_ENVIRONMENT_NAMES.api} is not the managed loopback endpoint`)
  }
  return url.href
}

async function stdinText(required) {
  if (!required) return ''
  const chunks = []
  let byteLength = 0
  for await (const chunk of stdin) {
    const bytes = Buffer.from(chunk)
    byteLength += bytes.length
    if (byteLength > CLI_MAX_BODY_BYTES) {
      throw Object.assign(new TypeError('stdin exceeds the maximum request size'), { code: 'CLI_REQUEST_TOO_LARGE' })
    }
    chunks.push(bytes)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function responseJson(response) {
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error('CLI_RESPONSE_TOO_LARGE: Host response exceeds the maximum size')
  let body
  try {
    body = JSON.parse(Buffer.from(bytes).toString('utf8'))
  } catch {
    throw new Error('CLI_PROTOCOL_ERROR: Host response is not JSON')
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body) || typeof body.ok !== 'boolean') {
    throw new Error('CLI_PROTOCOL_ERROR: Host response envelope is invalid')
  }
  return body
}

async function main() {
  const argv = process.argv.slice(2)
  const command = argv.join(' ')
  const needsStdin = argv.length === 3 && (
    command === 'generation submit --stdin'
    || command === 'generation run-inputs --stdin'
    || command === 'image run-media --stdin'
    || command === 'image inspect --stdin'
  )
  let request
  try {
    request = parseCliArguments(argv, await stdinText(needsStdin))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CLI arguments are invalid'
    const code = error !== null && typeof error === 'object' && error.code === 'CLI_REQUEST_TOO_LARGE'
      ? error.code
      : command === 'generation run-inputs --stdin'
      || command === 'image run-media --stdin'
      || command === 'image inspect --stdin'
      ? 'CLI_REQUEST_INVALID'
      : 'CLI_ARGUMENT_INVALID'
    stderr.write(`${code}: ${message}\n`)
    process.exitCode = 2
    return
  }

  let endpoint
  let capability
  try {
    endpoint = apiUrl()
    capability = environment(CLI_ENVIRONMENT_NAMES.capability)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Managed CLI environment is invalid'
    stderr.write(`CLI_ENVIRONMENT_INVALID: ${message}\n`)
    process.exitCode = 2
    return
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${capability}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    })
    const envelope = await responseJson(response)
    if (!response.ok || envelope.ok !== true) {
      const error = envelope.error
      if (
        error === null
        || typeof error !== 'object'
        || Array.isArray(error)
        || typeof error.code !== 'string'
        || typeof error.message !== 'string'
      ) {
        throw new Error(`CLI_PROTOCOL_ERROR: Host returned HTTP ${response.status} without a valid error`)
      }
      stderr.write(`${error.code}: ${error.message}\n`)
      process.exitCode = 1
      return
    }
    stdout.write(`${JSON.stringify(envelope.data)}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Host request failed'
    stderr.write(`${message.includes(':') ? message : `CLI_REQUEST_FAILED: ${message}`}\n`)
    process.exitCode = 1
  }
}

await main()
