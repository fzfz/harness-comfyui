import { describe, expect, it } from 'vitest'

import {
  generationMediaContentUrl,
  generationMediaViewerUrl,
  generationMediaWorkflowUrl,
  parseGenerationProjection,
  parseGenerationProjectionRequest,
} from '../../src/generation/contract.ts'

const projection = {
  sessionId: 'session_1',
  runs: [{
    runId: 'run_1', turn: 2, title: '肖像', instanceTitle: null, templateTitle: 'Anima',
    status: 'succeeded', errorCode: null, errorMessage: null, createdAt: 1, updatedAt: 2,
  }],
  media: [{
    mediaId: 'media_1', runId: 'run_1', turn: 2, outputIndex: 0, mediaKind: 'image',
    filename: 'result.webp', mediaType: 'image/webp', byteSize: 123, createdAt: 3,
  }],
  hasActiveRuns: false,
  refreshAfterMs: 1000,
} as const

describe('Generation projection contract', () => {
  it('parses closed projection requests and complete Run/Media projections', () => {
    expect(parseGenerationProjectionRequest({ sessionId: 'session_1', turn: null }))
      .toEqual({ sessionId: 'session_1', turn: null })
    expect(parseGenerationProjectionRequest({ sessionId: 'session_1', turn: 0 }))
      .toEqual({ sessionId: 'session_1', turn: 0 })
    expect(parseGenerationProjection(projection)).toEqual(projection)
  })

  it('rejects invalid request, Run, Media and collection fields', () => {
    for (const value of [null, {}, { sessionId: '', turn: null }, { sessionId: 's', turn: -1 }, { sessionId: 's', turn: null, extra: true }]) {
      expect(() => parseGenerationProjectionRequest(value)).toThrow()
    }
    expect(() => parseGenerationProjection({ ...projection, runs: null })).toThrow('collections')
    expect(() => parseGenerationProjection({ ...projection, extra: true })).toThrow('properties')
    expect(() => parseGenerationProjection({
      ...projection,
      runs: [{ ...projection.runs[0], status: 'unknown' }],
    })).toThrow('status')
    expect(() => parseGenerationProjection({
      ...projection,
      media: [{ ...projection.media[0], mediaKind: 'audio' }],
    })).toThrow('kind')
    expect(() => parseGenerationProjection({
      ...projection,
      media: [{ ...projection.media[0], byteSize: -1 }],
    })).toThrow('byte size')
  })

  it('preserves a complete ComfyUI error detail larger than ordinary labels', () => {
    const errorMessage = `ComfyUI rejected the API Workflow: ${'x'.repeat(12_000)}`

    expect(parseGenerationProjection({
      ...projection,
      runs: [{
        ...projection.runs[0],
        status: 'failed',
        errorCode: 'COMFYUI_PROMPT_REJECTED',
        errorMessage,
      }],
    }).runs[0]?.errorMessage).toBe(errorMessage)
  })

  it('builds same-origin viewer, content and per-media Workflow URLs', () => {
    expect(generationMediaViewerUrl('media / 1', 'session / 1'))
      .toBe('/api/harness-comfyui/media/media%20%2F%201/view?session_id=session%20%2F%201')
    expect(generationMediaContentUrl('media / 1', 'session / 1'))
      .toBe('/api/harness-comfyui/media/media%20%2F%201/content?session_id=session%20%2F%201')
    expect(generationMediaWorkflowUrl('media / 1', 'session / 1'))
      .toBe('/api/harness-comfyui/media/media%20%2F%201/workflow?session_id=session%20%2F%201')
  })
})
