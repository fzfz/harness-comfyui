#!/usr/bin/env node

import { stdin, stdout, stderr } from 'node:process'
import definition from '../../config/managed-cli-help.json' with { type: 'json' }
import { parseManagedHelpDefinition } from './help-schema.mjs'
const help = parseManagedHelpDefinition(definition)
import { presentationArguments, renderHelp, helpHint, renderNextSteps, shellQuote } from './help.mjs'

import {
  CLI_MAX_BODY_BYTES,
  CLI_ENVIRONMENT_NAMES,
  CLI_ROUTE_PATH,
  parseCliArguments,
} from '../../src/cli/contract.ts'

import { prepareResultFile, writeResultFile, discardUnpublishedResult } from './result-file.mjs'

const MAX_RESPONSE_BYTES = 32 * 1024 * 1024

// Write callbacks report pipe failures; the listeners also consume Node's error events.
stdout.on('error', () => { process.exitCode = 1 })
stderr.on('error', () => { process.exitCode = 1 })

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
    throw new TypeError(message('invalidApiUrl', { name: CLI_ENVIRONMENT_NAMES.api, action: help.messages.environmentRecovery }))
  }
  if (
    url.protocol !== 'http:'
    || (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost' && url.hostname !== '::1')
    || url.pathname !== CLI_ROUTE_PATH
    || url.search.length > 0
    || url.hash.length > 0
  ) {
    throw new TypeError(message('nonLoopbackApi', { name: CLI_ENVIRONMENT_NAMES.api, action: help.messages.environmentRecovery }))
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
      throw Object.assign(new TypeError(message('requestTooLarge', { max_bytes: CLI_MAX_BODY_BYTES })), { code: 'CLI_REQUEST_TOO_LARGE' })
    }
    chunks.push(bytes)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function responseJson(response) {
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error(message('responseTooLarge', { max_bytes: MAX_RESPONSE_BYTES }))
  let body
  try {
    body = JSON.parse(Buffer.from(bytes).toString('utf8'))
  } catch {
    throw new Error('CLI_PROTOCOL_ERROR: Host response is not JSON')
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body) || typeof body.ok !== 'boolean') {
    throw new Error('CLI_PROTOCOL_ERROR: Host response envelope is invalid')
  }
  if (body.ok && (body.data === null || typeof body.data !== 'object' || Array.isArray(body.data))) {
    throw new Error('CLI_PROTOCOL_ERROR: Host response success data is invalid')
  }
  return body
}

async function writeOutput(stream, text) {
  await new Promise((resolve, reject) => {
    stream.write(text, error => error ? reject(error) : resolve())
  })
}

async function reportFailure(message, exitCode = 1) {
  process.exitCode = exitCode
  try { await writeOutput(stderr, `${message}\n`) }
  catch { process.exitCode = 1 }
}

function message(key, values = {}) {
  return help.messages[key].replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? values[name] : match)
}

function fileMessage(key, values, argv) {
  return message(key, values) + ` ${helpHint(help, argv)}`
}

async function discardResult(handle, message) {
  try { await discardUnpublishedResult(handle) }
  catch (error) { return `${message}; cleanup ${handle.directory}: ${error.message}` }
  return message
}

async function main() {
  let argv
  let quiet
  let output
  try {
    ({ args: argv, quiet } = presentationArguments(process.argv.slice(2), help.valueOptions))
    output = renderHelp(help, argv)
  } catch (error) {
    await reportFailure(`CLI_ARGUMENT_INVALID: ${error.message} ${helpHint(help, [])}`, 2)
    return
  }
  if (output !== undefined) {
    try { await writeOutput(stdout, output) }
    catch (error) { await reportFailure(`CLI_OUTPUT_FAILED: Help could not be written: ${error.message}`) }
    return
  }
  const command = argv.join(' ')
  const needsStdin = argv.length === 3 && (
    command === 'generation submit --stdin'
    || command === 'generation inspect-template-parameters --stdin'
    || command === 'generation random-seeds --stdin'
    || command === 'generation run-inputs --stdin'
    || command === 'generation resolve-media --stdin'
    || command === 'image inspect --stdin'
  )
  let request
  try {
    if (/^(image|generation) /.test(argv[0] ?? '')) {
      const words = argv.flatMap((value, index) => index === 0 ? value.split(/\s+/) : [value])
      const example = "['node', CLI, " + words.map(shellQuote).join(', ') + ']'
      throw new TypeError(help.messages.splitCommand.replaceAll('{argv}', example).replaceAll('{help}', helpHint(help, words)))
    }
    request = parseCliArguments(argv, await stdinText(needsStdin))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CLI arguments are invalid'
    const code = error !== null && typeof error === 'object' && error.code === 'CLI_REQUEST_TOO_LARGE'
      ? error.code
      : needsStdin ? 'CLI_REQUEST_INVALID' : 'CLI_ARGUMENT_INVALID'
    await reportFailure(`${code}: ${message} ${helpHint(help, argv)}`, 2)
    return
  }

  let endpoint
  let capability
  try {
    endpoint = apiUrl()
    capability = environment(CLI_ENVIRONMENT_NAMES.capability)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Managed CLI environment is invalid'
    await reportFailure(`CLI_ENVIRONMENT_INVALID: ${message} ${helpHint(help, argv)}`, 2)
    return
  }

  let handle
  try { handle = await prepareResultFile() }
  catch (error) {
    await reportFailure(fileMessage('resultFilePrepareFailed', { path: error.path, system_error: error.message }, argv), 2)
    return
  }

  let data
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${capability}`, 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    const envelope = await responseJson(response)
    if (!response.ok || envelope.ok !== true) {
      const error = envelope.error
      if (error === null || typeof error !== 'object' || Array.isArray(error)
        || typeof error.code !== 'string' || typeof error.message !== 'string') {
        throw new Error(`CLI_PROTOCOL_ERROR: Host returned HTTP ${response.status} without a valid error`)
      }
      const message = `${error.code}: ${error.message} ${help.providerErrorCodes.includes(error.code) ? help.messages.providerFailure + ' ' : ''}${helpHint(help, argv)}`
      await reportFailure(await discardResult(handle, message))
      return
    }
    if (request.command === 'generation.submit' && (typeof envelope.data.run_id !== 'string' || envelope.data.run_id.length === 0)) {
      throw new Error('CLI_PROTOCOL_ERROR: Host submit response has no valid run_id')
    }
    data = envelope.data
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Host request failed'
    await reportFailure(await discardResult(handle, `${message.includes(':') ? message : `CLI_REQUEST_FAILED: ${message}`}${/[.!?。！？]$/u.test(message) ? '' : '.'} ${helpHint(help, argv)}`))
    return
  }

  try { await writeResultFile(handle, data) }
  catch (error) {
    const message = fileMessage('resultFileWriteFailed', {
      command: request.command, path: handle.path, system_error: error.message,
      accepted_run_id_if_submit: request.command === 'generation.submit' ? `Run was accepted: ${data.run_id}.` : '',
    }, argv)
    await reportFailure(await discardResult(handle, message))
    return
  }

  try { await writeOutput(stdout, `${handle.path}\n`) }
  catch (error) {
    await reportFailure(fileMessage('resultPathWriteFailed', { path: handle.path, stream: 'stdout', system_error: error.message }, argv))
    return
  }
  try {
    const next = renderNextSteps(help, request.command.replaceAll('.', ' '), quiet, {
      run_ids_json: request.command === 'generation.submit' ? shellQuote(JSON.stringify({ run_ids: [data.run_id] })) : '',
    })
    if (next) await writeOutput(stderr, next)
  } catch (error) {
    await reportFailure(fileMessage('resultPathWriteFailed', { path: handle.path, stream: 'stderr (NEXT)', system_error: error.message }, argv))
  }
}

await main()
