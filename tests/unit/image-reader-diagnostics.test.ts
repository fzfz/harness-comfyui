import { describe, expect, it } from 'vitest'
import { imageReaderDiagnosticSchema } from '../../src/image-reader/diagnostics-schema.ts'
import { imageReaderRuntimeSchema } from '../../src/image-reader/plugin-schema.ts'
import runtime from '../../config/image-reader-runtime.json' with { type: 'json' }

const record = { stage: 'request_sent', elapsedMs: 2, stageElapsedMs: 1, profileId: 'profile', model: 'vision' } as const
describe('image reader diagnostic contracts', () => {
  it('accepts a record with or without the provider request ID', () => {
    expect(imageReaderDiagnosticSchema(record)).toMatchObject(record)
    const identified = { ...record, requestId: 'request-1' }
    expect(imageReaderDiagnosticSchema(identified)).toEqual(identified)
  })
  it.each([
    { stage: 'unknown' }, { elapsedMs: -1 }, { stageElapsedMs: -1 },
    { profileId: '' }, { model: '' }, { requestId: '' },
    { stage: undefined }, { elapsedMs: undefined }, { stageElapsedMs: undefined },
    { profileId: undefined }, { model: undefined },
  ])('rejects an invalid diagnostic field: %j', invalid => {
    expect(() => imageReaderDiagnosticSchema({ ...record, ...invalid } as never)).toThrow()
  })
  it('validates the structured runtime log template and shutdown deadline', () => {
    expect(imageReaderRuntimeSchema(runtime)).toEqual(runtime)
    expect(() => imageReaderRuntimeSchema({ ...runtime, diagnosticLogFormat: '' })).toThrow()
    expect(() => imageReaderRuntimeSchema({ ...runtime, shutdownTimeoutMs: 0 })).toThrow()
  })
})
