import { describe, expect, it } from 'vitest'

import {
  GENERATION_IDENTIFIER_MAX_LENGTH,
  GENERATION_MEDIA_VIEWER_CURRENT_MESSAGE_TYPE,
  generationMediaContentUrl,
  generationMediaDownloadUrl,
  generationMediaViewerUrl,
  generationMediaWorkflowUrl,
  parseGenerationProjection,
  parseGenerationProjectionRequest,
  parseGenerationMediaViewerCurrentMessage,
} from '../../src/generation/contract.ts'
import { GENERATION_REMOTE } from '../../src/generation/remote.ts'

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
  it('exposes strict request and result parsers through the current Typert factories', () => {
    const descriptor = GENERATION_REMOTE.descriptors[0]
    expect(descriptor.parameters[0].codec.create().parse({ sessionId: 'session_1', turn: null }))
      .toEqual({ sessionId: 'session_1', turn: null })
    expect(descriptor.result.create().parse(projection)).toEqual(projection)
    expect(() => descriptor.parameters[0].codec.create().parse({ sessionId: '', turn: null })).toThrow()
    expect(() => descriptor.result.create().parse({ ...projection, runs: null })).toThrow()
  })

  it('parses only the closed Session Media Viewer current-media message', () => {
    const message = {
      type: GENERATION_MEDIA_VIEWER_CURRENT_MESSAGE_TYPE,
      mediaId: 'media_1',
      runId: 'run_1',
    }

    expect(parseGenerationMediaViewerCurrentMessage(message)).toEqual(message)
    for (const value of [
      null,
      [],
      { ...message, extra: true },
      { ...message, type: 'harness-comfyui.session-media-viewer.other.v1' },
      { ...message, mediaId: '' },
      { ...message, runId: '' },
      { ...message, mediaId: 'm'.repeat(GENERATION_IDENTIFIER_MAX_LENGTH + 1) },
      { ...message, runId: 'r'.repeat(GENERATION_IDENTIFIER_MAX_LENGTH + 1) },
    ]) {
      expect(() => parseGenerationMediaViewerCurrentMessage(value)).toThrow()
    }
  })

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

  it('builds same-origin viewer, content, download and per-media Workflow URLs', () => {
    expect(generationMediaViewerUrl('media / 1', 'session / 1'))
      .toBe('/api/harness-comfyui/media/media%20%2F%201/view?session_id=session%20%2F%201')
    expect(generationMediaContentUrl('media / 1', 'session / 1'))
      .toBe('/api/harness-comfyui/media/media%20%2F%201/content?session_id=session%20%2F%201')
    expect(generationMediaDownloadUrl('media / 1', 'session / 1'))
      .toBe('/api/harness-comfyui/media/media%20%2F%201/download?session_id=session%20%2F%201')
    expect(generationMediaWorkflowUrl('media / 1', 'session / 1'))
      .toBe('/api/harness-comfyui/media/media%20%2F%201/workflow?session_id=session%20%2F%201')
  })
})
