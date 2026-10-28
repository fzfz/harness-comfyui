import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'

import { parseCliGenerationManifest, parseCliRequest } from '../../src/cli/contract.ts'
import { CLI_MAX_BODY_BYTES } from '../../src/cli/limits.ts'

export function assertRequestSize(value) {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > CLI_MAX_BODY_BYTES) {
    throw Object.assign(new TypeError(`Expanded request exceeds ${CLI_MAX_BODY_BYTES} bytes. Reduce the manifest items or parameter text before retrying.`), { code: 'CLI_REQUEST_TOO_LARGE' })
  }
}

export function decodeUtf8(bytes) {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
}

async function readUtf8File(path, maxBytes = CLI_MAX_BODY_BYTES) {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
  const tooLarge = () => Object.assign(new TypeError(`File exceeds the remaining input limit (${maxBytes} bytes)`), { code: 'CLI_REQUEST_TOO_LARGE' })
  try {
    const details = await file.stat()
    if (!details.isFile()) throw new TypeError('Expected a regular file')
    if (details.size > maxBytes) throw tooLarge()
    const bytes = Buffer.allocUnsafe(maxBytes + 1)
    let length = 0
    while (length < bytes.length) {
      const result = await file.read(bytes, length, bytes.length - length, null)
      if (result.bytesRead === 0) break
      length += result.bytesRead
      if (length > maxBytes) throw tooLarge()
    }
    return decodeUtf8(bytes.subarray(0, length))
  } finally {
    await file.close()
  }
}

export async function loadGenerationManifest(argv, stdin) {
  const fromFile = argv.length === 4 && argv[2] === '--file' && argv[3].length > 0
  if (!fromFile && !(argv.length === 3 && argv[2] === '--stdin')) {
    throw new TypeError('Use generation submit --file <manifest.json> or generation submit --stdin; choose exactly one input.')
  }
  const manifestPath = fromFile ? resolve(argv[3]) : undefined
  let content
  try {
    content = manifestPath === undefined ? stdin : await readUtf8File(manifestPath)
  } catch (error) {
    throw Object.assign(new TypeError(`Cannot read Generation manifest ${manifestPath ?? 'stdin'} as UTF-8 text: ${error.message}`), { code: error.code })
  }
  let value
  try { value = JSON.parse(content) }
  catch { throw new TypeError(`Generation manifest ${manifestPath ?? 'stdin'} must contain one JSON object. Correct the JSON syntax before retrying.`) }
  const source = parseCliGenerationManifest(value)
  const items = []
  let remainingFileBytes = CLI_MAX_BODY_BYTES
  for (const [index, item] of source.entries()) {
    const parameters = Object.entries(item.request.parameters)
    for (const [parameter, path] of Object.entries(item.parameter_files ?? {})) {
      const label = `Generation items[${index}] parameter ${parameter} file ${path}`
      if (manifestPath === undefined && !isAbsolute(path)) {
        throw new TypeError(`${label}: stdin file references require an absolute path. Use --file <manifest.json> for relative references.`)
      }
      const absolute = manifestPath === undefined ? path : resolve(dirname(manifestPath), path)
      try {
        const content = await readUtf8File(absolute, remainingFileBytes)
        remainingFileBytes -= Buffer.byteLength(content, 'utf8')
        parameters.push([parameter, content])
      } catch (error) {
        throw Object.assign(new TypeError(`${label}: ${error.message}. Check the path and UTF-8 file content before retrying.`), { code: error.code === 'CLI_REQUEST_TOO_LARGE' ? error.code : 'CLI_REQUEST_INVALID' })
      }
    }
    items.push({ request_id: item.request_id, request: { ...item.request, parameters: Object.fromEntries(parameters) } })
  }
  const request = parseCliRequest({ command: 'generation.submit', items })
  assertRequestSize(request)
  return request
}
