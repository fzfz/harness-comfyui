import { constants } from 'node:buffer'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs, promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

import { parseDesktopE2EConfig } from '../../config/desktop-e2e-schema.mjs'
import { getProbeStatus, loadDesktopE2EConfig } from '../../tests/desktop/fixtures/official-desktop-probe.mjs'
import { createTraceEvidenceWriter, evidenceSecretsFromEnvironment } from '../../tests/desktop/fixtures/official-trace-evidence.mjs'
import { connectDesktopPage } from '../../tests/desktop/fixtures/renderer-cdp.mjs'

const execFileAsync = promisify(execFile)

export async function collectOfficialSessionTrace({ runId, sessionId, config: configValue, outputDirectory, page }) {
  const config = parseDesktopE2EConfig(configValue)
  if (typeof sessionId !== 'string' || !sessionId.trim()) throw new TypeError('collect 需要非空的主会话 sessionId。')
  if (typeof page?.evaluate !== 'function') throw new TypeError('collect 需要已有的官方应用页面连接。')
  const { route, sessionLogFilename } = config.sessionTrace.export
  const response = await page.evaluate(`(async () => {
    const url = new URL(${JSON.stringify(route)}, document.baseURI)
    url.searchParams.set('sessionId', ${JSON.stringify(sessionId)})
    url.searchParams.set('includeDescendants', 'true')
    const response = await fetch(url, { redirect: 'error' })
    return { status: response.status,
      bytes: response.ok ? Array.from(new Uint8Array(await response.arrayBuffer())) : null }
  })()`)
  if (response.status !== 200 || !Array.isArray(response.bytes)) {
    throw Object.assign(new Error('官方会话导出失败（HTTP ' + response.status + '）；请核对会话 ID 与应用状态后重试。'),
      { code: 'SESSION_EXPORT_HTTP_FAILED', status: response.status })
  }
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'official-session-export-'))
  try {
    const archivePath = join(temporaryDirectory, 'session.zip')
    await writeFile(archivePath, Buffer.from(response.bytes), { flag: 'wx', mode: 0o600 })
    let entries
    try {
      const { stdout } = await execFileAsync('/usr/bin/unzip', ['-Z1', archivePath], {
        encoding: 'utf8', maxBuffer: constants.MAX_STRING_LENGTH,
      })
      entries = stdout.trim().split('\n')
    } catch (cause) {
      throw Object.assign(new Error('官方会话 ZIP 无法读取；请确认应用连接正常后重新导出。', { cause }),
        { code: 'SESSION_EXPORT_ARCHIVE_INVALID' })
    }
    const sessionEntries = entries.filter(entry => {
      if (entry === sessionLogFilename) return true
      const parts = entry.split('/')
      return parts.length === 3 && parts[0] === 'subagents' && parts[2] === sessionLogFilename
    })
    if (!sessionEntries.includes(sessionLogFilename)) {
      throw Object.assign(new Error('官方会话 ZIP 缺少主会话日志；请核对会话 ID 后重新导出。'),
        { code: 'SESSION_EXPORT_ROOT_MISSING' })
    }
    const documents = []
    const missing = []
    for (const entry of sessionEntries) {
      let text
      try {
        text = (await execFileAsync('/usr/bin/unzip', ['-p', archivePath, entry], {
          encoding: 'utf8', maxBuffer: constants.MAX_STRING_LENGTH,
        })).stdout
      } catch {
        missing.push({ source: 'session-log', entry, code: 'SESSION_LOG_UNAVAILABLE' })
        continue
      }
      try {
        const [header, ...events] = text.trimEnd().split('\n').map(JSON.parse)
        if (header?.type !== 'session' || typeof header.id !== 'string' || !header.id
          || events.some(event => !Number.isSafeInteger(event?.seq) || typeof event.type !== 'string')) throw new TypeError()
        if (entry === sessionLogFilename && header.id !== sessionId) throw new TypeError()
        documents.push({ schemaVersion: 1, runId, sessionId: header.id,
          parentSessionId: header.parentSession ?? null, entry, header, events })
      } catch {
        missing.push({ source: 'session-log', entry, code: 'SESSION_LOG_INVALID' })
      }
    }
    for (const document of documents) {
      const lastTurn = document.events.findLast(event => ['turn/start', 'turn/end'].includes(event.type))
      if (lastTurn?.type === 'turn/start') {
        throw Object.assign(new Error('会话 ' + document.sessionId + ' 的任务尚未结束；请等待任务完成或取消结束后重新导出。'),
          { code: 'SESSION_STILL_RUNNING' })
      }
    }
    const writer = createTraceEvidenceWriter({ directory: outputDirectory, secrets: evidenceSecretsFromEnvironment() })
    writer.redactor.collect(documents)
    const sessions = []
    for (const document of documents) {
      const { events, sessionId: id } = document
      const complete = events.every((event, index) => event.seq === index)
      const coverage = { firstSeq: events[0]?.seq ?? null, lastSeq: events.at(-1)?.seq ?? null, complete }
      if (!complete) missing.push({ source: 'session-events', sessionId: id, code: 'SESSION_EVENT_GAP' })
      const lastTurn = events.findLast(event => ['turn/start', 'turn/end'].includes(event.type))
      if (lastTurn?.type !== 'turn/end') {
        missing.push({ source: 'task-terminal', sessionId: id, code: 'TASK_TERMINAL_MISSING' })
      }
      const saved = writer.writeJson(join(config.sessionTrace.filenames.sessionsDirectory,
        'session-' + encodeURIComponent(id), config.sessionTrace.filenames.session), document)
      sessions.push({ sessionId: id, parentSessionId: document.parentSessionId, entry: document.entry,
        path: saved.path, eventCount: events.length, coverage })
      missing.push(
        { source: 'model-request', sessionId: id, code: 'RAW_MODEL_REQUEST_NOT_PERSISTED' },
        { source: 'model-stream', sessionId: id, code: 'RAW_MODEL_STREAM_NOT_PERSISTED' })
    }
    const index = { schemaVersion: 1, runId, sessionId,
      source: { kind: 'official-session-export', route }, sessions, missing, complete: missing.length === 0 }
    const { path: indexPath } = writer.writeJson(config.sessionTrace.filenames.index, index)
    return { indexPath, index }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

export async function runOfficialSessionTraceCommand(argv) {
  const { positionals, values } = parseArgs({
    args: argv, allowPositionals: true, strict: true,
    options: {
      'run-id': { type: 'string' },
      'session-id': { type: 'string' },
      'repository-root': { type: 'string' },
      config: { type: 'string' },
      output: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const command = positionals[0]
  const usage = 'node scripts/verification/collect-session-trace.mjs'
  if (values.help && positionals.length <= 1 && [undefined, 'collect'].includes(command)) {
    return { help: [
      'collect：在任务结束后，通过正在运行的官方应用导出主会话及其子会话的持久记录，返回索引文件路径。',
      '--run-id <UUID>：string，必填；当前运行的 probe 标识。',
      '--config <JSON路径>：string，必填；与 probe 相同的配置。',
      '--output <目录>：string，必填；导出证据目录。',
      '--repository-root <路径>：string，可选；默认当前工作目录。',
      '--session-id <ID>：string，必填；主会话标识。',
      '示例：' + usage + ' collect --run-id <UUID> --config <配置JSON> --session-id <主会话ID> --output <导出目录>',
    ].join('\n') }
  }
  if (positionals.length !== 1 || command !== 'collect'
    || !values['run-id'] || !values.config || !values.output || !values['session-id']) {
    throw new TypeError('请运行 ' + usage + ' collect --help 查看必填参数及示例。')
  }
  const config = await loadDesktopE2EConfig(values.config)
  const repositoryRoot = resolve(values['repository-root'] ?? process.cwd())
  const status = await getProbeStatus({ runId: values['run-id'], repositoryRoot, config })
  if (status.record.state !== 'running' || !status.processGroupMatchesRun) {
    throw Object.assign(new Error('本轮官方应用尚未运行；请核对 probe status --run-id ' + values['run-id'] + ' 后重试。'),
      { code: 'PROBE_NOT_RUNNING' })
  }
  const page = await connectDesktopPage(status.record.ports.rendererCdp,
    { runId: status.record.runId, repositoryRoot, config })
  try {
    return await collectOfficialSessionTrace({ runId: status.record.runId, config,
      sessionId: values['session-id'], outputDirectory: resolve(values.output), page })
  } finally {
    await page.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runOfficialSessionTraceCommand(process.argv.slice(2))
    .then(result => process.stdout.write((result.help ?? result.indexPath) + '\n'))
    .catch(error => {
      process.stderr.write(JSON.stringify({ ok: false, code: error.code ?? 'TRACE_EXPORT_FAILED', message: error.message }) + '\n')
      process.exitCode = 1
    })
}
