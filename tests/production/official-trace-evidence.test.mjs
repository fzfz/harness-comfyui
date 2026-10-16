import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createEvidenceRedactor, createTraceEvidenceWriter } from '../desktop/fixtures/official-trace-evidence.mjs'

describe('official trace evidence redaction', () => {
  it('removes URL credentials and credential_value while preserving ordinary URL bytes', () => {
    const input = {
      endpoint: 'http://admin:secret-pass@127.0.0.1/a?count=1#section',
      encoded: 'https://user:encoded%40password@example.test/a%2Fb?query=%20',
      safe: 'https://example.test/a%2Fb?query=%20',
      credential_value: 'fixture-credential-value',
      repeated: 'secret-pass encoded%40password fixture-credential-value',
      credential_label: 'kept',
    }
    const before = structuredClone(input)
    expect(createEvidenceRedactor().redact(input)).toEqual({
      endpoint: 'http://127.0.0.1/a?count=1#section',
      encoded: 'https://example.test/a%2Fb?query=%20',
      safe: input.safe,
      credential_value: '[redacted]',
      repeated: '[redacted] [redacted] [redacted]',
      credential_label: 'kept',
    })
    expect(input).toEqual(before)
    const text = ' { "url":"http://admin:secret-pass@127.0.0.1/a", "name":"\\u0061\\/b" } '
    expect(createEvidenceRedactor().redact(text)).toBe(' { "url":"http://127.0.0.1/a", "name":"\\u0061\\/b" } ')
  })
  it('redacts serialized credentials while keeping request declarations and unrelated bytes', () => {
    const parameters = { type: 'object', properties: { token: { type: 'string', description: 'Input token' } } }
    const request = { kind: 'request', tools: [{ name: 'fixture', parameters }] }
    const text = ' { "token":"fixture-private", "name":"\\u0061\\/b", "count":3 } '
    const input = [request, { event: { type: 'tool/result', data: { text } } }, { message: 'repeat fixture-private' }]
    const before = structuredClone(input)
    const result = createEvidenceRedactor().redactWithReport(input)

    expect(result.value[0]).toEqual(request)
    expect(result.value[1].event.data.text).toBe(' { "token":"[redacted]", "name":"\\u0061\\/b", "count":3 } ')
    expect(result.value[2].message).toBe('repeat [redacted]')
    expect(result.report.replacements).toBeGreaterThan(0)
    expect(input).toEqual(before)
  })
})

describe('official trace evidence files', () => {
  it('reports failed evidence directory creation without leaving temporary files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'official-trace-write-failure-'))
    try {
      const writer = createTraceEvidenceWriter({ directory })
      writeFileSync(join(directory, 'occupied'), 'retained')
      expect(() => writer.writeJson('occupied/session.json', [])).toThrow(expect.objectContaining({ code: 'TRACE_EVIDENCE_WRITE_FAILED' }))
      expect(readdirSync(directory)).toEqual(['occupied'])
      expect(readFileSync(join(directory, 'occupied'), 'utf8')).toBe('retained')
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
  it('redacts persisted interrupted messages and shared credentials in private export files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'official-trace-export-'))
    try {
      const writer = createTraceEvidenceWriter({ directory })
      const records = [
        { type: 'tool/result', data: { credential: 'fixture-secret' } },
        { type: 'assistant/message', data: {
          interrupted: true, message: { content: [
            { type: 'reasoning', text: 'retain this reasoning' },
            { type: 'text', text: 'API_TOKEN=fixture-cancelled-secret' },
          ] },
        } },
      ]
      const before = structuredClone(records)
      const result = writer.writeJson('sessions/session.json', records)
      const saved = JSON.parse(readFileSync(result.path, 'utf8'))
      expect(saved[0].data.credential).toBe('[redacted]')
      expect(saved[1].data.message.content).toEqual([
        { type: 'reasoning', text: 'retain this reasoning' },
        { type: 'text', text: 'API_TOKEN=[redacted]' },
      ])
      expect(saved[1].data.interrupted).toBe(true)
      expect(records).toEqual(before)
      const later = writer.writeJson('later.json', { text: 'fixture-secret fixture-cancelled-secret' })
      expect(JSON.parse(readFileSync(later.path, 'utf8'))).toEqual({ text: '[redacted] [redacted]' })
      expect(statSync(result.path).mode & 0o777).toBe(0o600)
      expect(statSync(join(directory, 'sessions')).mode & 0o777).toBe(0o700)
      expect(() => writer.writeJson('../outside.json', {})).toThrow(/relative/)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
