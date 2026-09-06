import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const writerScript = join(repositoryRoot, '.agents/skills/comfyui-iterate-generation/scripts/write-json.mjs')

function runWriter(directory, input, argumentsList, { preload, environment = {} } = {}) {
  const environmentVariables = { ...process.env, ...environment }
  if (preload !== undefined) environmentVariables.NODE_OPTIONS = `--import=${preload}`
  const result = spawnSync(process.execPath, [writerScript, ...argumentsList], {
    cwd: directory,
    env: environmentVariables,
    input,
    encoding: 'utf8',
  })
  return {
    ...result,
    errorBody: result.stderr.length === 0 ? undefined : JSON.parse(result.stderr),
    outputBody: result.stdout.length === 0 ? undefined : JSON.parse(result.stdout),
  }
}

function createPreloadFixture(directory, mode) {
  const fixture = join(directory, `write-json-${mode}.mjs`)
  writeFileSync(fixture, `
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { writeFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const fsPromises = require('node:fs/promises')
const originalOpen = fsPromises.open
const originalUnlink = fsPromises.unlink
const mode = ${JSON.stringify(mode)}

function injectedError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

function temporaryPath(filePath, flags) {
  return typeof filePath === 'string' && flags === 'wx' && filePath.endsWith('.tmp')
}

function failedHandle(handle, writeMessage, closeMessage = null) {
  return {
    writeFile: async (...argumentsList) => {
      if (writeMessage !== null) throw injectedError(writeMessage, 'EIO')
      return handle.writeFile(...argumentsList)
    },
    close: async (...argumentsList) => {
      if (closeMessage !== null) throw injectedError(closeMessage, 'EIO')
      return handle.close(...argumentsList)
    },
  }
}

if (mode === 'collision') {
  fsPromises.open = async function openWithCollision(filePath, flags, ...argumentsList) {
    if (temporaryPath(filePath, flags)) {
      writeFileSync(filePath, 'collision sentinel\\n')
      throw injectedError('injected temporary collision', 'EEXIST')
    }
    return originalOpen.call(this, filePath, flags, ...argumentsList)
  }
}

if (mode === 'temporary-write-failure' || mode === 'temporary-write-failure-cleanup-failure') {
  fsPromises.open = async function openWithTemporaryWriteFailure(filePath, flags, ...argumentsList) {
    const handle = await originalOpen.call(this, filePath, flags, ...argumentsList)
    if (temporaryPath(filePath, flags)) return failedHandle(handle, 'injected temporary write failure')
    return handle
  }
}

if (mode === 'temporary-close-failure' || mode === 'temporary-write-and-close-failure') {
  fsPromises.open = async function openWithTemporaryCloseFailure(filePath, flags, ...argumentsList) {
    const handle = await originalOpen.call(this, filePath, flags, ...argumentsList)
    if (temporaryPath(filePath, flags)) {
      const writeMessage = mode === 'temporary-write-and-close-failure'
        ? 'injected temporary write failure'
        : null
      return failedHandle(handle, writeMessage, 'injected temporary close failure')
    }
    return handle
  }
}

if (mode === 'temporary-write-failure-cleanup-failure') {
  fsPromises.unlink = async function unlinkWithTemporaryFailure(filePath, ...argumentsList) {
    if (typeof filePath === 'string' && filePath.endsWith('.tmp')) {
      throw injectedError('injected temporary cleanup failure', 'EACCES')
    }
    return originalUnlink.call(this, filePath, ...argumentsList)
  }
}

if (mode === 'created-write-failure' || mode === 'created-write-failure-cleanup-failure') {
  fsPromises.open = async function openWithCreatedWriteFailure(filePath, flags, ...argumentsList) {
    const handle = await originalOpen.call(this, filePath, flags, ...argumentsList)
    if (filePath === process.env.WRITE_JSON_TEST_TARGET_PATH && flags === 'wx') {
      return failedHandle(handle, 'injected created-file write failure')
    }
    return handle
  }
}

if (mode === 'created-write-failure-cleanup-failure') {
  fsPromises.unlink = async function unlinkWithCreatedFileFailure(filePath, ...argumentsList) {
    if (filePath === process.env.WRITE_JSON_TEST_TARGET_PATH) {
      throw injectedError('injected created-file cleanup failure', 'EACCES')
    }
    return originalUnlink.call(this, filePath, ...argumentsList)
  }
}

syncBuiltinESMExports()
`)
  return fixture
}

function withTemporaryDirectory(callback) {
  const directory = mkdtempSync(join(tmpdir(), 'comfyui-iterate-write-json-'))
  try {
    return callback(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function temporaryFilesFor(directory, fileName) {
  return readdirSync(directory).filter(name => name.startsWith(`.${fileName}.`) && name.endsWith('.tmp'))
}

describe('comfyui-iterate-generation JSON record writer', () => {
  it('creates a new record and reports its absolute path while preserving valid JSON bytes', () => {
    withTemporaryDirectory(directory => {
      const input = '{\n  "stage": "baseline",\n  "attempt": 1\n}\n'
      const relativeTarget = join('records', 'baseline.json')
      mkdirSync(join(directory, 'records'))

      const result = runWriter(directory, input, ['--path', relativeTarget, '--mode', 'create'])

      expect(result.status).toBe(0)
      expect(result.signal).toBeNull()
      expect(result.error).toBeUndefined()
      expect(result.stderr).toBe('')
      expect(result.outputBody).toEqual({ path: resolve(realpathSync(directory), relativeTarget) })
      expect(readFileSync(resolve(directory, relativeTarget), 'utf8')).toBe(input)
      expect(temporaryFilesFor(join(directory, 'records'), 'baseline.json')).toEqual([])
    })
  })

  it('rejects malformed JSON before creating the target', () => {
    withTemporaryDirectory(directory => {
      const target = join(directory, 'malformed.json')
      const before = readdirSync(directory)

      const result = runWriter(directory, '{"stage":', ['--path', target, '--mode', 'create'])

      expect(result.status).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.errorBody).toMatchObject({ code: 'JSON_INPUT_INVALID' })
      expect(existsSync(target)).toBe(false)
      expect(readdirSync(directory)).toEqual(before)
    })
  })

  it('fails exclusive create without changing an existing target', () => {
    withTemporaryDirectory(directory => {
      const target = join(directory, 'existing.json')
      const original = '{"stage":"original"}\n'
      writeFileSync(target, original)

      const result = runWriter(directory, '{"stage":"replacement"}\n', [
        '--path', target,
        '--mode', 'create',
      ])

      expect(result.status).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.errorBody).toMatchObject({ code: 'TARGET_EXISTS' })
      expect(readFileSync(target, 'utf8')).toBe(original)
    })
  })

  it('requires an existing target for replacement', () => {
    withTemporaryDirectory(directory => {
      const target = join(directory, 'missing.json')

      const result = runWriter(directory, '{"stage":"replacement"}\n', [
        '--path', target,
        '--mode', 'replace',
      ])

      expect(result.status).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.errorBody).toMatchObject({ code: 'TARGET_MISSING' })
      expect(existsSync(target)).toBe(false)
      expect(temporaryFilesFor(directory, 'missing.json')).toEqual([])
    })
  })

  it('replaces an existing target through a same-directory temporary file', () => {
    withTemporaryDirectory(directory => {
      const target = join(directory, 'record.json')
      const replacement = '{\n  "stage": "candidate",\n  "accepted": true\n}\n'
      writeFileSync(target, '{"stage":"baseline"}\n')

      const result = runWriter(directory, replacement, ['--path', target, '--mode', 'replace'])

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.outputBody).toEqual({ path: target })
      expect(readFileSync(target, 'utf8')).toBe(replacement)
      expect(temporaryFilesFor(directory, 'record.json')).toEqual([])
    })
  })

  it.each([
    { name: 'missing options', argumentsList: [] },
    { name: 'unknown option', argumentsList: ['--path', 'record.json', '--mode', 'create', '--extra'] },
    { name: 'unsupported mode', argumentsList: ['--path', 'record.json', '--mode', 'append'] },
  ])('rejects $name before any write', ({ argumentsList }) => {
    withTemporaryDirectory(directory => {
      const result = runWriter(directory, '{"valid":true}\n', argumentsList)

      expect(result.status).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.errorBody).toMatchObject({ code: 'ARGUMENTS_INVALID' })
      expect(readdirSync(directory)).toEqual([])
    })
  })

  it('reports a missing parent directory without creating it', () => {
    withTemporaryDirectory(directory => {
      const parent = join(directory, 'missing-parent')
      const target = join(parent, 'record.json')

      const result = runWriter(directory, '{"valid":true}\n', ['--path', target, '--mode', 'create'])

      expect(result.status).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.errorBody).toMatchObject({ code: 'PARENT_DIRECTORY_MISSING' })
      expect(existsSync(parent)).toBe(false)
    })
  })

  it('reports a non-directory parent without writing', () => {
    withTemporaryDirectory(directory => {
      const parent = join(directory, 'parent-file')
      const target = join(parent, 'record.json')
      writeFileSync(parent, 'parent')

      const result = runWriter(directory, '{"valid":true}\n', ['--path', target, '--mode', 'create'])

      expect(result.status).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.errorBody).toMatchObject({ code: 'PARENT_NOT_DIRECTORY' })
      expect(readFileSync(parent, 'utf8')).toBe('parent')
    })
  })

  it('cleans the temporary replacement file when the final rename fails', () => {
    withTemporaryDirectory(directory => {
      const target = join(directory, 'record.json')
      mkdirSync(target)

      const result = runWriter(directory, '{"stage":"candidate"}\n', [
        '--path', target,
        '--mode', 'replace',
      ])

      expect(result.status).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.errorBody).toMatchObject({ code: 'FILESYSTEM_ERROR' })
      expect(existsSync(target)).toBe(true)
      expect(temporaryFilesFor(directory, 'record.json')).toEqual([])
    })
  })

  it('does not delete an existing temporary path when exclusive creation collides', () => {
    withTemporaryDirectory(directory => {
      const target = join(directory, 'record.json')
      const preload = createPreloadFixture(directory, 'collision')
      writeFileSync(target, '{"stage":"baseline"}\n')

      const result = runWriter(directory, '{"stage":"candidate"}\n', [
        '--path', target,
        '--mode', 'replace',
      ], {
        preload,
        environment: { WRITE_JSON_TEST_INJECT: 'collision' },
      })

      expect(result.status).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.errorBody).toMatchObject({ code: 'FILESYSTEM_ERROR' })
      expect(readFileSync(target, 'utf8')).toBe('{"stage":"baseline"}\n')
      const collisionFiles = temporaryFilesFor(directory, 'record.json')
      expect(collisionFiles).toHaveLength(1)
      expect(readFileSync(join(directory, collisionFiles[0]), 'utf8')).toBe('collision sentinel\n')
    })
  })

  it('cleans the temporary file created before an injected temporary write failure', () => {
    withTemporaryDirectory(directory => {
      const target = join(directory, 'record.json')
      const preload = createPreloadFixture(directory, 'temporary-write-failure')
      writeFileSync(target, '{"stage":"baseline"}\n')

      const result = runWriter(directory, '{"stage":"candidate"}\n', [
        '--path', target,
        '--mode', 'replace',
      ], { preload })

      expect(result.status).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.errorBody).toMatchObject({ code: 'FILESYSTEM_ERROR' })
      expect(readFileSync(target, 'utf8')).toBe('{"stage":"baseline"}\n')
      expect(temporaryFilesFor(directory, 'record.json')).toEqual([])
    })
  })

  it('reports an injected close failure and cleans the owned temporary file', () => {
    withTemporaryDirectory(directory => {
      const target = join(directory, 'record.json')
      const preload = createPreloadFixture(directory, 'temporary-close-failure')
      writeFileSync(target, '{"stage":"baseline"}\n')

      const result = runWriter(directory, '{"stage":"candidate"}\n', [
        '--path', target,
        '--mode', 'replace',
      ], { preload })

      expect(result.status).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.errorBody).toMatchObject({
        code: 'FILESYSTEM_ERROR',
        message: expect.stringContaining('injected temporary close failure'),
      })
      expect(readFileSync(target, 'utf8')).toBe('{"stage":"baseline"}\n')
      expect(temporaryFilesFor(directory, 'record.json')).toEqual([])
    })
  })

  it('reports both injected write and close failures and cleans the owned temporary file', () => {
    withTemporaryDirectory(directory => {
      const target = join(directory, 'record.json')
      const preload = createPreloadFixture(directory, 'temporary-write-and-close-failure')
      writeFileSync(target, '{"stage":"baseline"}\n')

      const result = runWriter(directory, '{"stage":"candidate"}\n', [
        '--path', target,
        '--mode', 'replace',
      ], { preload })

      expect(result.status).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.errorBody).toMatchObject({
        code: 'FILESYSTEM_ERROR',
        message: expect.stringContaining('injected temporary write failure'),
      })
      expect(result.errorBody.message).toContain('injected temporary close failure')
      expect(readFileSync(target, 'utf8')).toBe('{"stage":"baseline"}\n')
      expect(temporaryFilesFor(directory, 'record.json')).toEqual([])
    })
  })

  it('cleans the created target after an injected create write failure', () => {
    withTemporaryDirectory(directory => {
      const target = join(directory, 'record.json')
      const preload = createPreloadFixture(directory, 'created-write-failure')

      const result = runWriter(directory, '{"stage":"candidate"}\n', [
        '--path', target,
        '--mode', 'create',
      ], {
        preload,
        environment: { WRITE_JSON_TEST_TARGET_PATH: target },
      })

      expect(result.status).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.errorBody).toMatchObject({ code: 'FILESYSTEM_ERROR' })
      expect(existsSync(target)).toBe(false)
    })
  })

  it('reports temporary cleanup failure instead of hiding it', () => {
    withTemporaryDirectory(directory => {
      const target = join(directory, 'record.json')
      const preload = createPreloadFixture(directory, 'temporary-write-failure-cleanup-failure')
      writeFileSync(target, '{"stage":"baseline"}\n')

      const result = runWriter(directory, '{"stage":"candidate"}\n', [
        '--path', target,
        '--mode', 'replace',
      ], { preload })

      expect(result.status).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.errorBody).toMatchObject({ code: 'TEMPORARY_FILE_CLEANUP_FAILED' })
      expect(readFileSync(target, 'utf8')).toBe('{"stage":"baseline"}\n')
      expect(temporaryFilesFor(directory, 'record.json')).toHaveLength(1)
    })
  })

  it('reports created-file cleanup failure instead of hiding it', () => {
    withTemporaryDirectory(directory => {
      const target = join(directory, 'record.json')
      const preload = createPreloadFixture(directory, 'created-write-failure-cleanup-failure')

      const result = runWriter(directory, '{"stage":"candidate"}\n', [
        '--path', target,
        '--mode', 'create',
      ], {
        preload,
        environment: { WRITE_JSON_TEST_TARGET_PATH: target },
      })

      expect(result.status).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.errorBody).toMatchObject({ code: 'CREATED_FILE_CLEANUP_FAILED' })
      expect(existsSync(target)).toBe(true)
      expect(readFileSync(target, 'utf8')).toBe('')
    })
  })
})
