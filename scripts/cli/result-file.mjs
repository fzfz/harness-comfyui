import * as fileSystem from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

function failure(error, stage, path) {
  return Object.assign(new Error(`${stage}: ${error instanceof Error ? error.message : String(error)}`, { cause: error }), { stage, path })
}

export async function prepareResultFile({ temporaryDirectory = tmpdir(), fs = fileSystem } = {}) {
  const root = resolve(temporaryDirectory)
  let handle
  let directory
  try {
    if (/[\u0000-\u001f\u007f-\u009f]/u.test(root)) throw new TypeError('Temporary directory contains a control character')
    directory = await fs.mkdtemp(join(root, 'harness-comfyui-cli-'))
    await fs.chmod(directory, 0o700)
    const path = join(directory, 'result.json')
    handle = { directory, path, file: await fs.open(path, 'wx', 0o600), fs, closed: false, saved: false }
    await handle.file.chmod(0o600)
    return handle
  } catch (error) {
    const result = failure(error, 'prepare', handle?.path ?? directory ?? root)
    try {
      if (handle) await discardUnpublishedResult(handle)
      else if (directory) await fs.rm(directory, { recursive: true, force: true })
    } catch (cleanupError) { result.message += `; cleanup ${directory}: ${cleanupError.message}` }
    throw result
  }
}

export async function writeResultFile(handle, data) {
  let bytes
  try {
    const json = JSON.stringify(data)
    if (json === undefined) throw new TypeError('Host data cannot be serialized as JSON')
    bytes = `${json}\n`
  } catch (error) { throw failure(error, 'serialization', handle.path) }
  try { await handle.file.writeFile(bytes, 'utf8') }
  catch (error) { throw failure(error, 'write', handle.path) }
  try { await handle.file.close(); handle.closed = true }
  catch (error) { throw failure(error, 'close', handle.path) }
  handle.saved = true
}

export async function discardUnpublishedResult(handle) {
  if (handle.saved) return
  const errors = []
  if (!handle.closed) {
    try { await handle.file.close(); handle.closed = true }
    catch (error) { errors.push(`close: ${error.message}`) }
  }
  try { await handle.fs.rm(handle.directory, { recursive: true, force: true }) }
  catch (error) { errors.push(`remove: ${error.message}`) }
  if (errors.length) throw failure(new Error(errors.join('; ')), 'cleanup', handle.directory)
}
