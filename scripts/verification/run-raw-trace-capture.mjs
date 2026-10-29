import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parseDesktopE2EConfig } from '../../config/desktop-e2e-schema.mjs'
import { startRawTraceCapture } from '../../tests/desktop/fixtures/official-raw-capture.mjs'
import { prepareRawCaptureProfile } from '../../tests/desktop/fixtures/official-raw-capture-profile.mjs'

export async function serveRawTraceCapture({ config, upstreamBaseUrl, outputDirectory, providerId, profilePath,
  input = process.stdin, output = process.stdout }) {
  let capture
  let prepared
  let result
  let restorationError
  let closing = false
  let outputFailed = false
  let resourcesReleased = false
  let callbackErrorPending = false
  const failures = []
  const pendingCollections = new Set()
  const pendingWrites = new Map()
  const lines = createInterface({ input, terminal: false })
  const lineIterator = lines[Symbol.asyncIterator]()
  const remember = error => { if (!failures.includes(error)) failures.push(error) }
  const releaseOutput = () => {
    if (!resourcesReleased || pendingWrites.size || callbackErrorPending) return
    output.off('error', outputErrorEvent)
    output.off('close', outputClosed)
    output.off('finish', outputClosed)
  }
  const settleWrites = () => { for (const settle of pendingWrites.values()) settle() }
  const finishOutput = () => {
    settleWrites()
    pendingWrites.clear()
    callbackErrorPending = false
    releaseOutput()
  }
  const closeInput = () => { closing = true; lines.close(); settleWrites() }
  const fail = error => { remember(error); closeInput() }
  const outputError = error => {
    outputFailed = true
    if (resourcesReleased) settleWrites()
    else fail(error)
  }
  const outputErrorEvent = error => { outputError(error); finishOutput() }
  const outputClosed = () => {
    if (!outputFailed) outputError(output.errored ?? Object.assign(new Error('Raw capture output closed before completion.'), { code: 'RAW_CAPTURE_OUTPUT_CLOSED' }))
    finishOutput()
  }
  const inputClosed = () => { if (!input.readableEnded) closeInput() }
  const emit = async value => {
    if (outputFailed) return
    try {
      await new Promise((resolve, reject) => {
        const settle = error => { error ? reject(error) : resolve() }
        const complete = error => {
          if (!pendingWrites.delete(complete)) return
          if (error) { callbackErrorPending = true; outputError(error) }
          settle(error)
          releaseOutput()
        }
        pendingWrites.set(complete, settle)
        try { output.write(JSON.stringify(value) + '\n', complete) } catch (error) {
          pendingWrites.delete(complete)
          settle(error)
          releaseOutput()
        }
        if ((closing || input.readableEnded) && !output.errored) settle()
      })
    } catch (error) { outputError(error) }
  }
  input.on('error', fail)
  input.on('end', settleWrites)
  input.on('close', inputClosed)
  lines.on('error', fail)
  output.on('error', outputErrorEvent)
  output.on('close', outputClosed)
  output.on('finish', outputClosed)
  process.on('SIGTERM', closeInput)
  process.on('SIGINT', closeInput)
  if (input.errored) fail(input.errored)
  else if (input.destroyed || input.readableEnded) closeInput()
  if (output.destroyed || output.writableEnded) outputClosed()
  try {
    capture = await startRawTraceCapture({ config, upstreamBaseUrl, outputDirectory })
    prepared = await prepareRawCaptureProfile({ config, capture, providerId })
    await prepared.applyToProfile({ profilePath })
    void emit({ status: 'started', captureId: capture.captureId, baseURL: capture.baseURL,
      statePath: resolve(capture.directory, config.rawCapture.filenames.state), restorationPath: prepared.restorationPath, profilePath })
    for await (const line of lineIterator) {
      if (closing) break
      try {
        const command = JSON.parse(line)
        if (command.command === 'collect') {
          const collection = capture.collect({ officialIndexPath: command.officialIndexPath }).then(collected =>
            emit({ status: 'collected', indexPath: collected.indexPath }), () =>
            emit({ status: 'command-failed', error: { code: 'RAW_CAPTURE_COMMAND_FAILED', message: 'Check the capture evidence directory before retrying collect.' } }))
            .catch(fail)
          pendingCollections.add(collection)
          void collection.then(() => pendingCollections.delete(collection), fail)
        } else if (command.command === 'stop') break
        else void emit({ status: 'command-rejected', error: { code: 'RAW_CAPTURE_COMMAND_INVALID', message: 'Use a JSON line with command collect or stop.' } })
      } catch {
        void emit({ status: 'command-failed', error: { code: 'RAW_CAPTURE_COMMAND_FAILED', message: 'Send a valid JSON line and check the capture evidence directory.' } })
      }
    }
  } catch (error) { remember(error) } finally {
    closeInput()
    try {
      let restoration
      let closed
      try { restoration = await prepared?.restore({ profilePath }) } catch (error) { restorationError = error; remember(error) }
      try { closed = await capture?.stop() } catch (error) { remember(error) }
      await Promise.allSettled([...pendingCollections])
      result = { status: restorationError ? 'restore-failed' : 'stopped', restored: restoration?.restored ?? false,
        indexPath: closed?.indexPath ?? null, portReleased: closed?.portReleased ?? true,
        ...(restorationError ? { error: { code: 'RAW_CAPTURE_PROFILE_RESTORE_FAILED', message: restorationError.message } } : {}) }
      await emit(result)
    } finally {
      input.off('error', fail)
      input.off('end', settleWrites)
      input.off('close', inputClosed)
      lines.off('error', fail)
      process.off('SIGTERM', closeInput)
      process.off('SIGINT', closeInput)
      resourcesReleased = true
      releaseOutput()
    }
  }
  if (failures.length > 1) throw new AggregateError(failures, failures[0].message, { cause: failures[0] })
  if (failures.length === 1 && failures[0] !== restorationError) throw failures[0]
  return result
}

export async function runRawTraceCaptureCommand(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true,
    options: { upstream: { type: 'string' }, output: { type: 'string' }, 'provider-id': { type: 'string' },
      profile: { type: 'string' }, config: { type: 'string' }, help: { type: 'boolean' } } })
  if (values.help) {
    process.stdout.write('Start isolated Provider and tool-result capture while the official application is stopped.\n'
      + 'Usage: node scripts/verification/run-raw-trace-capture.mjs start --upstream <HTTP-base-URL> --provider-id <provider-id> --profile <absolute-isolated-Profile-path> --output <absolute-.local-evidence-directory> [--config <JSON-path>]\n'
      + 'All options are strings. Required: upstream, provider-id, profile, output. Config defaults to config/desktop-e2e.json.\n'
      + 'Keep this process running while other drivers start, run and restart the official application.\n'
      + 'stdin JSON lines: {"command":"collect","officialIndexPath":"/absolute/trace-index.json"}\n'
      + 'After stopping the official application, send {"command":"stop"} to restore the temporary Profile fields and close the listener.\n')
    return
  }
  if (positionals.length !== 1 || positionals[0] !== 'start' || ['upstream', 'output', 'provider-id', 'profile'].some(key => !values[key])) {
    throw new TypeError('Use start with --upstream, --provider-id, --profile and --output. Run --help for an example.')
  }
  const configPath = values.config ?? new URL('../../config/desktop-e2e.json', import.meta.url)
  const config = parseDesktopE2EConfig(JSON.parse(await readFile(configPath, 'utf8')))
  return await serveRawTraceCapture({ config, upstreamBaseUrl: values.upstream, outputDirectory: values.output,
    providerId: values['provider-id'], profilePath: values.profile })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let completed = false
  const report = error => {
    process.stderr.write(JSON.stringify({ code: error.code ?? 'RAW_CAPTURE_START_FAILED', message: error.message,
      ...(error instanceof AggregateError ? { errors: error.errors.map(cause => ({ message: cause.message, ...(cause.code ? { code: cause.code } : {}) })) } : {}) }) + '\n')
    process.exitCode = 1
  }
  process.stdout.on('error', error => { if (completed) report(error) })
  runRawTraceCaptureCommand(process.argv.slice(2)).then(result => {
    completed = true
    if (result?.status === 'restore-failed') process.exitCode = 1
  }, error => {
    completed = true
    report(error)
  })
}
