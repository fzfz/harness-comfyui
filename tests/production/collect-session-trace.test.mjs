import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import defaults from '../../config/desktop-e2e.json' with { type: 'json' }
import { collectOfficialSessionTrace } from '../../scripts/verification/collect-session-trace.mjs'

const roots = []
const event = (seq, type, data = {}) => ({ seq, type, time: seq, data })
const log = (id, parentSession, events) => [
  { type: 'session', version: 4, id, createdAt: 1, cwd: '/fixture/workspace', ...(parentSession ? { parentSession } : {}) },
  ...events,
].map(JSON.stringify).join('\n') + '\n'

async function fixture(entries) {
  const root = await mkdtemp(join(tmpdir(), 'official-export-test-'))
  roots.push(root)
  for (const [name, text] of Object.entries(entries)) {
    await mkdir(dirname(join(root, name)), { recursive: true })
    await writeFile(join(root, name), text)
  }
  const archive = join(root, 'fixture.zip')
  execFileSync('/usr/bin/zip', ['-q', archive, ...Object.keys(entries)], { cwd: root })
  return { root, bytes: await readFile(archive) }
}

function officialPage(responses) {
  const requests = []
  const page = {
    evaluate(expression) {
      return runInNewContext(expression, {
        document: { baseURI: 'dsh-app://app/' }, URL,
        async fetch(url, options) {
          requests.push({ url: String(url), options })
          const response = responses.shift()
          return new Response(response.bytes, { status: response.status ?? 200,
            headers: { 'content-type': response.contentType ?? 'application/zip' } })
        },
      })
    },
  }
  return { page, requests }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('official Session ZIP export', () => {
  it('exports native parent and child records through the running application', async () => {
    const parentEvents = [
      event(0, 'turn/start', { turn: 1 }),
      event(1, 'subagent/catalog', { childId: 'child-session', mode: 'continuable' }),
      event(2, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ]
    const childEvents = [
      event(0, 'turn/start', { turn: 1 }),
      event(1, 'tool/call', { name: 'Read', args: { path: 'SKILL.md' } }),
      event(2, 'tool/result', { content: 'saved tool return' }),
      event(3, 'assistant/message', { content: [
        { type: 'thinking', thinking: 'recorded reasoning' }, { type: 'text', text: 'recorded answer' },
      ] }),
      event(4, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ]
    const { root, bytes } = await fixture({
      [defaults.sessionTrace.export.sessionLogFilename]: log('parent-session', undefined, parentEvents),
      ['subagents/child-session/' + defaults.sessionTrace.export.sessionLogFilename]: log('child-session', 'parent-session', childEvents),
      'media/fixture.png': 'attachment bytes',
    })
    const { page, requests } = officialPage([{ bytes }])
    const result = await collectOfficialSessionTrace({
      runId: randomUUID(), sessionId: 'parent-session', config: defaults, outputDirectory: join(root, 'export'), page,
    })
    expect(requests).toEqual([{ url: 'dsh-app://app/api/session.export?sessionId=parent-session&includeDescendants=true',
      options: { redirect: 'error' } }])
    expect(result.index.sessions.map(session => [session.sessionId, session.parentSessionId]))
      .toEqual([['parent-session', null], ['child-session', 'parent-session']])
    const parent = JSON.parse(await readFile(result.index.sessions[0].path, 'utf8'))
    const child = JSON.parse(await readFile(result.index.sessions[1].path, 'utf8'))
    expect(parent.events).toEqual(parentEvents)
    expect(child.header).toMatchObject({ id: 'child-session', parentSession: 'parent-session' })
    expect(child.events).toEqual(childEvents)
    expect(result.index.sessions[1].coverage).toEqual({ firstSeq: 0, lastSeq: 4, complete: true })
    expect(result.index.missing).toEqual([
      { source: 'model-request', sessionId: 'parent-session', code: 'RAW_MODEL_REQUEST_NOT_PERSISTED' },
      { source: 'model-stream', sessionId: 'parent-session', code: 'RAW_MODEL_STREAM_NOT_PERSISTED' },
      { source: 'model-request', sessionId: 'child-session', code: 'RAW_MODEL_REQUEST_NOT_PERSISTED' },
      { source: 'model-stream', sessionId: 'child-session', code: 'RAW_MODEL_STREAM_NOT_PERSISTED' },
    ])
    expect(result.index.complete).toBe(false)
  })
})

describe('unfinished official Session exports', () => {
  it('rejects an unfinished selected task before writing evidence and clears its temporary ZIP', async () => {
    const { root, bytes } = await fixture({
      [defaults.sessionTrace.export.sessionLogFilename]: log('parent-session', undefined, [
        event(0, 'turn/start', { turn: 1 }), event(1, 'assistant/message', { content: 'unfinished' }),
      ]),
    })
    const previous = process.env.TMPDIR
    process.env.TMPDIR = root
    try {
      const { page } = officialPage([{ bytes }])
      await expect(collectOfficialSessionTrace({
        runId: randomUUID(), sessionId: 'parent-session', config: defaults, outputDirectory: join(root, 'export'), page,
      })).rejects.toMatchObject({ code: 'SESSION_STILL_RUNNING' })
      expect((await readdir(root)).filter(name => name.startsWith('official-session-export-'))).toEqual([])
      await expect(readFile(join(root, 'export', defaults.sessionTrace.filenames.index))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      if (previous === undefined) delete process.env.TMPDIR
      else process.env.TMPDIR = previous
    }
  })
})

describe('repeated official exports and missing evidence', () => {
  it('exports two completed tasks through the same page and leaves no source ZIP behind', async () => {
    const first = await fixture({ [defaults.sessionTrace.export.sessionLogFilename]: log('task-one', undefined, [
      event(0, 'turn/start', { turn: 1 }), event(1, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ]) })
    const second = await fixture({ [defaults.sessionTrace.export.sessionLogFilename]: log('task-two', undefined, [
      event(0, 'turn/start', { turn: 1 }), event(1, 'turn/end', { turn: 1, reason: { kind: 'aborted' } }),
    ]) })
    const { page, requests } = officialPage([{ bytes: first.bytes }, { bytes: second.bytes }])
    const previous = process.env.TMPDIR
    process.env.TMPDIR = first.root
    try {
      const runId = randomUUID()
      for (const [sessionId, root] of [['task-one', first.root], ['task-two', second.root]]) {
        const result = await collectOfficialSessionTrace({ runId, sessionId, config: defaults,
          outputDirectory: join(root, 'export'), page })
        expect(result.index).toMatchObject({ runId, sessionId })
        expect(result.index.sessions[0].coverage.complete).toBe(true)
      }
      expect(requests.map(request => new URL(request.url).searchParams.get('sessionId'))).toEqual(['task-one', 'task-two'])
      expect((await readdir(first.root)).filter(name => name.startsWith('official-session-export-'))).toEqual([])
    } finally {
      if (previous === undefined) delete process.env.TMPDIR
      else process.env.TMPDIR = previous
    }
  })

  it.each([404, 500])('reports HTTP %s without creating evidence', async status => {
    const root = await mkdtemp(join(tmpdir(), 'official-export-test-'))
    roots.push(root)
    const { page } = officialPage([{ bytes: 'private upstream error', status }])
    await expect(collectOfficialSessionTrace({
      runId: randomUUID(), sessionId: 'parent-session', config: defaults, outputDirectory: join(root, 'export'), page,
    })).rejects.toMatchObject({ code: 'SESSION_EXPORT_HTTP_FAILED', status })
    await expect(readFile(join(root, 'export', defaults.sessionTrace.filenames.index))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes an unreadable ZIP after the native archive reader fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'official-export-test-'))
    roots.push(root)
    const { page } = officialPage([{ bytes: 'invalid zip' }])
    const previous = process.env.TMPDIR
    process.env.TMPDIR = root
    try {
      await expect(collectOfficialSessionTrace({
        runId: randomUUID(), sessionId: 'parent-session', config: defaults, outputDirectory: join(root, 'export'), page,
      })).rejects.toMatchObject({ code: 'SESSION_EXPORT_ARCHIVE_INVALID' })
      expect(await readdir(root)).toEqual([])
    } finally {
      if (previous === undefined) delete process.env.TMPDIR
      else process.env.TMPDIR = previous
    }
  })

  it('rejects an archive missing its root log', async () => {
    const { root, bytes } = await fixture({ 'media/fixture.png': 'attachment bytes' })
    const { page } = officialPage([{ bytes }])
    await expect(collectOfficialSessionTrace({
      runId: randomUUID(), sessionId: 'parent-session', config: defaults, outputDirectory: join(root, 'export'), page,
    })).rejects.toMatchObject({ code: 'SESSION_EXPORT_ROOT_MISSING' })
  })

  it('preserves a valid root and identifies an invalid child log', async () => {
    const childEntry = 'subagents/child-session/' + defaults.sessionTrace.export.sessionLogFilename
    const { root, bytes } = await fixture({
      [defaults.sessionTrace.export.sessionLogFilename]: log('parent-session', undefined, [
        event(0, 'turn/start', { turn: 1 }), event(1, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
      ]),
      [childEntry]: '{invalid\n',
    })
    const { page } = officialPage([{ bytes }])
    const result = await collectOfficialSessionTrace({
      runId: randomUUID(), sessionId: 'parent-session', config: defaults, outputDirectory: join(root, 'export'), page,
    })
    expect(result.index.sessions.map(session => session.sessionId)).toEqual(['parent-session'])
    expect(result.index.missing).toContainEqual({ source: 'session-log', entry: childEntry, code: 'SESSION_LOG_INVALID' })
  })

  it('records insufficient evidence when the root log cannot be parsed', async () => {
    const entry = defaults.sessionTrace.export.sessionLogFilename
    const { root, bytes } = await fixture({ [entry]: '{invalid\n' })
    const { page } = officialPage([{ bytes }])
    const result = await collectOfficialSessionTrace({
      runId: randomUUID(), sessionId: 'parent-session', config: defaults, outputDirectory: join(root, 'export'), page,
    })
    expect(result.index).toMatchObject({ sessions: [], complete: false,
      missing: [{ source: 'session-log', entry, code: 'SESSION_LOG_INVALID' }] })
  })

  it('retains a Session with no task records and reports its missing terminal', async () => {
    const { root, bytes } = await fixture({
      [defaults.sessionTrace.export.sessionLogFilename]: log('parent-session', undefined, [event(0, 'permission/preset')]),
    })
    const { page } = officialPage([{ bytes }])
    const result = await collectOfficialSessionTrace({
      runId: randomUUID(), sessionId: 'parent-session', config: defaults, outputDirectory: join(root, 'export'), page,
    })
    expect(result.index.sessions[0].eventCount).toBe(1)
    expect(result.index.missing).toContainEqual({
      source: 'task-terminal', sessionId: 'parent-session', code: 'TASK_TERMINAL_MISSING',
    })
  })

  it('discovers credentials across all native logs before writing the first Session', async () => {
    const { root, bytes } = await fixture({
      [defaults.sessionTrace.export.sessionLogFilename]: log('parent-session', undefined, [
        event(0, 'user/message', { content: 'shared-fixture-credential' }),
        event(1, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
      ]),
      ['subagents/child-session/' + defaults.sessionTrace.export.sessionLogFilename]: log('child-session', 'parent-session', [
        event(0, 'tool/call', { apiKey: 'shared-fixture-credential' }),
        event(1, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
      ]),
    })
    const { page } = officialPage([{ bytes }])
    const result = await collectOfficialSessionTrace({
      runId: randomUUID(), sessionId: 'parent-session', config: defaults, outputDirectory: join(root, 'export'), page,
    })
    for (const session of result.index.sessions) expect(await readFile(session.path, 'utf8')).not.toContain('shared-fixture-credential')
  })
})

describe('official Session export CLI', () => {
  it('prints command help without connecting to or changing an application', () => {
    const script = fileURLToPath(new URL('../../scripts/verification/collect-session-trace.mjs', import.meta.url))
    const result = spawnSync(process.execPath, [script, 'collect', '--help'], { encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('collect --run-id')
    expect(result.stdout).toContain('--session-id')
  })

  it('rejects missing required arguments with an actionable stderr response and empty stdout', () => {
    const script = fileURLToPath(new URL('../../scripts/verification/collect-session-trace.mjs', import.meta.url))
    const result = spawnSync(process.execPath, [script, 'collect'], { encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, code: 'TRACE_EXPORT_FAILED' })
    expect(JSON.parse(result.stderr).message).toContain('collect --help')
  })
})
