#!/usr/bin/env node

import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { lstat, open, rename, stat, unlink } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

const MODES = new Set(['create', 'replace'])

class CliError extends Error {
  constructor(code, message, cause = undefined) {
    super(message, { cause })
    this.name = 'CliError'
    this.code = code
  }
}

function parseArguments(argumentsList) {
  if (argumentsList.length !== 4) {
    throw new CliError(
      'ARGUMENTS_INVALID',
      'Expected exactly --path FILE --mode create|replace.'
    )
  }

  let pathValue
  let mode
  for (let index = 0; index < argumentsList.length; index += 2) {
    const option = argumentsList[index]
    const value = argumentsList[index + 1]
    if (option === '--path' && pathValue === undefined) {
      if (value.length === 0 || value.startsWith('--')) {
        throw new CliError('ARGUMENTS_INVALID', 'The --path option requires a file path.')
      }
      pathValue = value
      continue
    }
    if (option === '--mode' && mode === undefined) {
      mode = value
      continue
    }
    throw new CliError(
      'ARGUMENTS_INVALID',
      'Expected exactly --path FILE --mode create|replace.'
    )
  }

  if (pathValue === undefined || mode === undefined || !MODES.has(mode)) {
    throw new CliError(
      'ARGUMENTS_INVALID',
      'Expected exactly --path FILE --mode create|replace.'
    )
  }

  return { path: resolve(pathValue), mode }
}

async function readAndValidateJson() {
  let source
  try {
    source = readFileSync(0, 'utf8')
  } catch (error) {
    throw new CliError('STDIN_READ_FAILED', `Could not read JSON from stdin: ${error.message}`, error)
  }

  try {
    JSON.parse(source)
  } catch (error) {
    throw new CliError('JSON_INPUT_INVALID', `stdin does not contain valid JSON: ${error.message}`, error)
  }

  // Keep the caller's valid JSON bytes, including intentional indentation and a trailing newline.
  return source
}

async function assertParentDirectory(targetPath) {
  const parentPath = dirname(targetPath)
  let parent
  try {
    parent = await stat(parentPath)
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new CliError('PARENT_DIRECTORY_MISSING', `Parent directory does not exist: ${parentPath}`, error)
    }
    throw new CliError(
      'FILESYSTEM_ERROR',
      `Could not access parent directory ${parentPath}: ${error.message}`,
      error
    )
  }
  if (!parent.isDirectory()) {
    throw new CliError('PARENT_NOT_DIRECTORY', `Parent path is not a directory: ${parentPath}`)
  }
}

async function assertReplacementTarget(targetPath) {
  try {
    await lstat(targetPath)
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new CliError('TARGET_MISSING', `Cannot replace missing target: ${targetPath}`, error)
    }
    throw new CliError('FILESYSTEM_ERROR', `Could not inspect replacement target ${targetPath}: ${error.message}`, error)
  }
}

function filesystemError(operation, targetPath, error) {
  return new CliError(
    'FILESYSTEM_ERROR',
    `Could not ${operation} ${targetPath}: ${error.message}`,
    error
  )
}

function combinedError(primary, additional) {
  if (primary === undefined) return additional
  return new CliError(
    primary.code,
    `${primary.message}; additionally, ${additional.message}`,
    additional
  )
}

async function removeOwnedFile(filePath, originalError, code, description) {
  try {
    await unlink(filePath)
  } catch (error) {
    throw new CliError(
      code,
      `Could not remove ${description} ${filePath} after failure (${originalError.message}): ${error.message}`,
      error
    )
  }
}

async function writeAndClose(handle, filePath, operation, source) {
  let failure
  try {
    await handle.writeFile(source, 'utf8')
  } catch (error) {
    failure = filesystemError(operation, filePath, error)
  }

  try {
    await handle.close()
  } catch (error) {
    failure = combinedError(failure, filesystemError('close', filePath, error))
  }

  if (failure !== undefined) throw failure
}

async function createExclusive(targetPath, source) {
  let handle
  let created = false
  try {
    try {
      handle = await open(targetPath, 'wx')
      created = true
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw new CliError('TARGET_EXISTS', `Target already exists: ${targetPath}`, error)
      }
      throw filesystemError('create', targetPath, error)
    }

    try {
      await writeAndClose(handle, targetPath, 'write', source)
    } finally {
      handle = undefined
    }
  } catch (error) {
    if (created) {
      await removeOwnedFile(targetPath, error, 'CREATED_FILE_CLEANUP_FAILED', 'created file')
    }
    throw error
  }
}

async function createTemporaryFile(parentPath, fileName, source) {
  const suffix = `${process.pid}.${randomBytes(8).toString('hex')}`
  const temporaryPath = resolve(parentPath, `.${fileName}.${suffix}.tmp`)
  let handle
  let created = false
  try {
    try {
      handle = await open(temporaryPath, 'wx')
      created = true
    } catch (error) {
      throw filesystemError('create temporary file', temporaryPath, error)
    }

    try {
      await writeAndClose(handle, temporaryPath, 'write temporary file', source)
    } finally {
      handle = undefined
    }
    return temporaryPath
  } catch (error) {
    if (created) {
      await removeOwnedFile(
        temporaryPath,
        error,
        'TEMPORARY_FILE_CLEANUP_FAILED',
        'temporary file'
      )
    }
    throw error
  }
}

async function replaceExisting(targetPath, source) {
  await assertReplacementTarget(targetPath)

  const parentPath = dirname(targetPath)
  const fileName = basename(targetPath)
  const temporaryPath = await createTemporaryFile(parentPath, fileName, source)
  try {
    await rename(temporaryPath, targetPath)
  } catch (error) {
    const replacementFailure = filesystemError('replace', targetPath, error)
    await removeOwnedFile(
      temporaryPath,
      replacementFailure,
      'TEMPORARY_FILE_CLEANUP_FAILED',
      'temporary file'
    )
    throw replacementFailure
  }
}

async function main() {
  const { path: targetPath, mode } = parseArguments(process.argv.slice(2))
  const source = await readAndValidateJson()

  // The writer reports a missing or invalid parent before trying either write mode.
  await assertParentDirectory(targetPath)
  if (mode === 'create') await createExclusive(targetPath, source)
  else await replaceExisting(targetPath, source)

  process.stdout.write(`${JSON.stringify({ path: targetPath })}\n`)
}

try {
  await main()
} catch (error) {
  const failure = error instanceof CliError
    ? error
    : new CliError('INTERNAL_ERROR', error instanceof Error ? error.message : String(error), error)
  process.stderr.write(`${JSON.stringify({ code: failure.code, message: failure.message })}\n`)
  process.exitCode = 1
}
