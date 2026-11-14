import { contracts } from '#contracts'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'


import { CLI_MAX_BODY_BYTES } from '../../src/cli/limits.ts'

export function decodeUtf8(bytes) {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
}

export async function readUtf8File(path, maxBytes = CLI_MAX_BODY_BYTES) {
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

export const loadCliFileRequest = contracts.bind('cliRequest', 'cli-files', {
  readUtf8File,
  resolvePath: resolve,
  dirname,
  isAbsolute,
  byteLength: text => Buffer.byteLength(text, 'utf8'),
})
