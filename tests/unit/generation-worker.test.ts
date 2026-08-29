import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  GenerationRuntime,
  GenerationRuntimeError,
  GenerationSubmissionNotSentError,
  type GenerationPreparationAdapter,
  type GenerationRequest,
  type GenerationTransport,
} from '../../src/host/generation/generation-runtime.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

const request: GenerationRequest = {
  title: '两个结果',
  instanceId: '2',
  templateId: '34',
  model: null,
  parameters: { positive_prompt: 'first prompt' },
  loras: [],
}

const webpBytes = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const preparer: GenerationPreparationAdapter = {
  async prepare() {
    return {
      instanceId: '2',
      instanceTitle: 'ComfyUI',
      templateTitle: 'Template',
      sourceSnapshot: { template_id: '34' },
      actualWorkflow: { version: 0.4, marker: 'first prompt' },
      apiWorkflow: { '3': { class_type: 'SaveImage', inputs: {} } },
      expectedOutputNodeIds: ['3'],
      connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
    }
  },
}

function runtime(
  root: string,
  transport: GenerationTransport,
  timing: { readonly now?: () => number; readonly missingObservationMs?: number } = {},
): GenerationRuntime {
  let runSequence = 0
  let mediaSequence = 0
  return new GenerationRuntime({
    runRepositoryFile: join(root, 'data', 'runs.sqlite'),
    runDirectory: join(root, 'runs'),
    savedMediaDirectory: join(root, 'media'),
    preparer,
    transport,
    createRunId: () => `run_${++runSequence}`,
    createPromptId: () => '0193f85c-86fb-4ad9-8d2b-28cf39e8b042',
    createMediaId: () => `media_aa_bb_${++mediaSequence}`,
    now: timing.now,
    missingObservationMs: timing.missingObservationMs,
  })
}

function acceptSubmission(input: Parameters<GenerationTransport['submit']>[0]): { readonly promptId: string } {
  if (!input.onRequestStart()) throw new Error('submission was not accepted')
  return { promptId: input.promptId }
}

describe('GenerationRuntime worker lifecycle', () => {
  it('orders Session media by creation time, output index, and media ID', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-media-order-'))
    temporaryDirectories.push(root)
    const transport: GenerationTransport = {
      submit: vi.fn(), observe: vi.fn(), download: vi.fn(),
    }
    const first = runtime(root, transport)
    const accepted = await first.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 4, callId: 'call_order' }, request,
    )
    first.close()
    const database = new DatabaseSync(join(root, 'data', 'runs.sqlite'))
    const insert = database.prepare(`
      INSERT INTO generation_media(
        media_id, run_id, workspace_id, session_id, turn, node_id, output_index,
        media_kind, filename, relative_path, media_type, byte_size, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const row = (mediaId: string, outputIndex: number, createdAt: number) => insert.run(
      mediaId, accepted.runId, 'workspace_1', 'session_1', 4, mediaId, outputIndex,
      'image', `${mediaId}.png`, `aa/bb/${mediaId}.png`, 'image/png', pngBytes.byteLength, createdAt,
    )
    row('media_earlier', 9, 99)
    row('media_output_low', 1, 100)
    row('media_id_low', 2, 100)
    row('media_id_high', 2, 100)
    database.close()

    const reopened = runtime(root, transport)
    expect(reopened.queryMedia({ workspaceId: 'workspace_1', sessionId: 'session_1' })
      .map(item => item.mediaId)).toEqual([
      'media_id_low', 'media_id_high', 'media_output_low', 'media_earlier',
    ])
    reopened.close()
  })

  it('submits, observes, downloads multiple outputs, and stores media in two-level shards', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-worker-'))
    temporaryDirectories.push(root)
    const observe = vi.fn<GenerationTransport['observe']>()
      .mockResolvedValueOnce({ status: 'running', outputs: [] })
      .mockResolvedValueOnce({
        status: 'success',
        outputs: [
          { nodeId: '3', outputIndex: 0, mediaKind: 'image', filename: 'first.webp', subfolder: '', type: 'output' },
          { nodeId: '3', outputIndex: 1, mediaKind: 'image', filename: 'second.png', subfolder: 'batch', type: 'output' },
        ],
      })
    const transport: GenerationTransport = {
      submit: vi.fn(async input => acceptSubmission(input)),
      observe,
      download: vi.fn(async input => ({
        bytes: input.output.outputIndex === 0 ? webpBytes : pngBytes,
        mediaType: input.output.outputIndex === 0 ? 'image/webp' : 'image/png',
      })),
    }
    const generation = runtime(root, transport)
    const accepted = await generation.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 4, callId: 'call_1' },
      request,
    )

    expect(generation.queryRuns({ workspaceId: 'workspace_1', sessionId: 'session_1' })[0]?.status).toBe('prepared')
    await generation.advance()
    expect(generation.queryRuns({ workspaceId: 'workspace_1', sessionId: 'session_1' })[0]?.status).toBe('remote_pending')
    await generation.advance()
    expect(generation.queryRuns({ workspaceId: 'workspace_1', sessionId: 'session_1' })[0]?.status).toBe('remote_running')
    await generation.advance()
    expect(generation.queryRuns({ workspaceId: 'workspace_1', sessionId: 'session_1' })[0]?.status).toBe('downloading')
    await generation.advance()

    const run = generation.queryRuns({ workspaceId: 'workspace_1', sessionId: 'session_1' })[0]
    expect(run).toMatchObject({ runId: accepted.runId, status: 'succeeded' })
    const media = generation.queryMedia({ workspaceId: 'workspace_1', sessionId: 'session_1' })
    expect(media.map(item => ({ runId: item.runId, mediaKind: item.mediaKind, outputIndex: item.outputIndex }))).toEqual([
      { runId: accepted.runId, mediaKind: 'image', outputIndex: 1 },
      { runId: accepted.runId, mediaKind: 'image', outputIndex: 0 },
    ])
    expect(media[0]?.relativePath.split('/')).toHaveLength(3)
    expect(readFileSync(generation.mediaContentPath(media[0]!.mediaId))).toEqual(Buffer.from(pngBytes))
    expect(await generation.readActualWorkflow(generation.mediaRunId(media[0]!.mediaId))).toContain('first prompt')
    generation.close()
  })

  it('continues a prepared persisted Run after the Host runtime is recreated', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-recovery-'))
    temporaryDirectories.push(root)
    const transport: GenerationTransport = {
      submit: vi.fn(async input => acceptSubmission(input)),
      observe: vi.fn<GenerationTransport['observe']>(async () => ({ status: 'pending', outputs: [] })),
      download: vi.fn(),
    }
    const first = runtime(root, transport)
    const accepted = await first.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 4, callId: 'call_1' },
      request,
    )
    await first.advance()
    first.close()

    const recovered = runtime(root, transport)
    await recovered.advance()

    expect(transport.submit).toHaveBeenCalledOnce()
    expect(recovered.queryRuns({ workspaceId: 'workspace_1', sessionId: 'session_1' })[0]).toMatchObject({
      runId: accepted.runId,
      status: 'remote_pending',
    })
    recovered.close()
  })

  it('recovers a created Run through preparation after the Host runtime is recreated', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-created-recovery-'))
    temporaryDirectories.push(root)
    const transport: GenerationTransport = {
      submit: vi.fn(async input => acceptSubmission(input)),
      observe: vi.fn(),
      download: vi.fn(),
    }
    const first = runtime(root, transport)
    const accepted = await first.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 4, callId: 'call_1' },
      request,
    )
    const database = new DatabaseSync(join(root, 'data', 'runs.sqlite'))
    database.prepare(`
      UPDATE generation_runs SET status = 'created', revision = 0,
        instance_id = NULL, instance_title = NULL, instance_origin = NULL, template_title = NULL,
        source_snapshot_path = NULL, actual_workflow_path = NULL, api_workflow_path = NULL,
        expected_output_node_ids_json = NULL
      WHERE run_id = ?
    `).run(accepted.runId)
    database.close()
    expect(first.queryRunsForSession('session_1')[0]?.status).toBe('created')
    first.close()

    const recovered = runtime(root, transport)
    await recovered.advance()

    expect(recovered.queryRunsForSession('session_1')[0]).toMatchObject({
      runId: accepted.runId,
      status: 'prepared',
    })
    expect(transport.submit).not.toHaveBeenCalled()
    recovered.close()
  })

  it('marks a submitting Run as unknown when the Host runtime is recreated', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-submitting-recovery-'))
    temporaryDirectories.push(root)
    const transport: GenerationTransport = {
      submit: vi.fn(async input => acceptSubmission(input)),
      observe: vi.fn(),
      download: vi.fn(),
    }
    const first = runtime(root, transport)
    const accepted = await first.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 4, callId: 'call_1' },
      request,
    )
    first.close()
    const database = new DatabaseSync(join(root, 'data', 'runs.sqlite'))
    database.prepare("UPDATE generation_runs SET status = 'submitting', prompt_id = ? WHERE run_id = ?")
      .run('0193f85c-86fb-4ad9-8d2b-28cf39e8b042', accepted.runId)
    database.close()

    const recovered = runtime(root, transport)

    expect(recovered.queryRunsForSession('session_1')[0]).toMatchObject({
      runId: accepted.runId,
      status: 'submission_unknown',
      promptId: null,
      errorCode: 'COMFYUI_SUBMISSION_RESULT_UNKNOWN',
    })
    expect(transport.submit).not.toHaveBeenCalled()
    recovered.close()
  })

  it('marks a remote error and a completed job without outputs as failed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-worker-failed-'))
    temporaryDirectories.push(root)
    const transport: GenerationTransport = {
      submit: vi.fn(async input => acceptSubmission(input)),
      observe: vi.fn<GenerationTransport['observe']>()
        .mockResolvedValueOnce({ status: 'error', outputs: [], error: { code: 'REMOTE_NODE_FAILED', message: 'node failed' } })
        .mockResolvedValueOnce({ status: 'success', outputs: [] }),
      download: vi.fn(),
    }
    const generation = runtime(root, transport)
    await generation.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 4, callId: 'call_1' },
      request,
    )
    await generation.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 5, callId: 'call_2' },
      request,
    )
    await generation.advance()
    await generation.advance()
    await generation.advance()

    const runs = generation.queryRunsForSession('session_1')
    expect(runs.map(run => ({ status: run.status, code: run.errorCode }))).toEqual([
      { status: 'failed', code: 'COMFYUI_OUTPUT_MISSING' },
      { status: 'failed', code: 'REMOTE_NODE_FAILED' },
    ])
    generation.close()
  })

  it('distinguishes an unknown submission result from an explicit prompt rejection', async () => {
    for (const [code, expectedStatus, expectedCode] of [
      ['CONNECTION_DROPPED', 'submission_unknown', 'COMFYUI_SUBMISSION_RESULT_UNKNOWN'],
      ['COMFYUI_PROMPT_REJECTED', 'failed', 'COMFYUI_PROMPT_REJECTED'],
    ] as const) {
      const root = mkdtempSync(join(tmpdir(), `harness-comfyui-worker-${expectedStatus}-`))
      temporaryDirectories.push(root)
      const transport: GenerationTransport = {
        submit: vi.fn(async input => {
          input.onRequestStart()
          throw new GenerationRuntimeError(code, code)
        }),
        observe: vi.fn(),
        download: vi.fn(),
      }
      const generation = runtime(root, transport)
      await generation.acceptGeneration(
        { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 4, callId: `call_${expectedStatus}` },
        request,
      )
      await generation.advance()
      await generation.advance()
      expect(generation.queryRunsForSession('session_1')[0]).toMatchObject({ status: expectedStatus, errorCode: expectedCode })
      generation.close()
    }
  })

  it('keeps deterministic submission preflight failures out of submission_unknown', async () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), 'harness-comfyui-worker-artifact-'))
    temporaryDirectories.push(artifactRoot)
    const artifactTransport: GenerationTransport = {
      submit: vi.fn(), observe: vi.fn(), download: vi.fn(),
    }
    const artifactRuntime = runtime(artifactRoot, artifactTransport)
    await artifactRuntime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 4, callId: 'call_artifact' },
      request,
    )
    unlinkSync(join(artifactRoot, 'runs', 'workspaces', 'workspace_1', 'runs', 'run_1', 'api-workflow.json'))
    await artifactRuntime.advance()
    expect(artifactRuntime.queryRunsForSession('session_1')[0]).toMatchObject({
      status: 'failed', errorCode: 'GENERATION_ARTIFACT_NOT_FOUND',
    })
    expect(artifactTransport.submit).not.toHaveBeenCalled()
    artifactRuntime.close()

    const sourceRoot = mkdtempSync(join(tmpdir(), 'harness-comfyui-worker-source-'))
    temporaryDirectories.push(sourceRoot)
    const sourceTransport: GenerationTransport = {
      submit: vi.fn(async () => {
        throw new GenerationSubmissionNotSentError('COMFYUI_INSTANCE_SOURCE_CHANGED', 'origin changed')
      }),
      observe: vi.fn(), download: vi.fn(),
    }
    const sourceRuntime = runtime(sourceRoot, sourceTransport)
    await sourceRuntime.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 4, callId: 'call_source' },
      request,
    )
    await sourceRuntime.advance()
    expect(sourceRuntime.queryRunsForSession('session_1')[0]).toMatchObject({
      status: 'failed', errorCode: 'COMFYUI_INSTANCE_SOURCE_CHANGED',
    })
    sourceRuntime.close()
  })

  it('preserves a recoverable Run when the Host lifecycle signal is cancelled', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-worker-cancel-'))
    temporaryDirectories.push(root)
    const controller = new AbortController()
    const transport: GenerationTransport = {
      submit: vi.fn(async input => acceptSubmission(input)),
      observe: vi.fn(async () => {
        controller.abort()
        throw new GenerationRuntimeError('COMFYUI_REQUEST_CANCELED', 'cancelled')
      }),
      download: vi.fn(),
    }
    const generation = runtime(root, transport)
    await generation.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 4, callId: 'call_cancel' },
      request,
    )
    await generation.advance()
    await expect(generation.advance(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(generation.queryRunsForSession('session_1')[0]).toMatchObject({
      status: 'remote_pending', errorCode: null,
    })
    generation.close()
  })

  it('keeps prepared when Host shutdown cancels submission before the request boundary', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-worker-submit-preflight-cancel-'))
    temporaryDirectories.push(root)
    const controller = new AbortController()
    const firstTransport: GenerationTransport = {
      submit: vi.fn(async () => {
        controller.abort()
        throw new DOMException('cancelled', 'AbortError')
      }),
      observe: vi.fn(), download: vi.fn(),
    }
    const first = runtime(root, firstTransport)
    await first.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 4, callId: 'call_preflight_cancel' }, request,
    )
    await expect(first.advance(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(first.queryRunsForSession('session_1')[0]).toMatchObject({ status: 'prepared', promptId: null })
    first.close()

    const recoveredTransport: GenerationTransport = {
      submit: vi.fn(async input => acceptSubmission(input)), observe: vi.fn(), download: vi.fn(),
    }
    const recovered = runtime(root, recoveredTransport)
    await recovered.advance()
    expect(recovered.queryRunsForSession('session_1')[0]).toMatchObject({ status: 'remote_pending' })
    expect(recoveredTransport.submit).toHaveBeenCalledOnce()
    recovered.close()
  })

  it('keeps transient observation failures recoverable until the missing-observation deadline', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-worker-observation-gap-'))
    temporaryDirectories.push(root)
    let now = 1_000
    const observe = vi.fn<GenerationTransport['observe']>()
      .mockRejectedValueOnce(new GenerationRuntimeError('COMFYUI_CONNECTION_FAILED', 'offline'))
      .mockResolvedValueOnce({ status: 'running', outputs: [] })
      .mockRejectedValueOnce(new GenerationRuntimeError('COMFYUI_REQUEST_TIMEOUT', 'timeout'))
      .mockRejectedValueOnce(new GenerationRuntimeError('COMFYUI_REQUEST_TIMEOUT', 'timeout'))
    const transport: GenerationTransport = {
      submit: vi.fn(async input => acceptSubmission(input)), observe, download: vi.fn(),
    }
    const generation = runtime(root, transport, { now: () => now, missingObservationMs: 50 })
    await generation.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 4, callId: 'call_gap' }, request,
    )
    await generation.advance()

    await generation.advance()
    expect(generation.queryRunsForSession('session_1')[0]).toMatchObject({
      status: 'remote_pending', promptId: '0193f85c-86fb-4ad9-8d2b-28cf39e8b042', errorCode: null,
    })
    now = 1_020
    await generation.advance()
    expect(generation.queryRunsForSession('session_1')[0]?.status).toBe('remote_running')
    now = 1_030
    await generation.advance()
    expect(generation.queryRunsForSession('session_1')[0]).toMatchObject({ status: 'remote_running', errorCode: null })
    now = 1_081
    await generation.advance()
    expect(generation.queryRunsForSession('session_1')[0]).toMatchObject({
      status: 'failed', promptId: '0193f85c-86fb-4ad9-8d2b-28cf39e8b042', errorCode: 'COMFYUI_REQUEST_TIMEOUT',
    })
    expect(transport.submit).toHaveBeenCalledOnce()
    generation.close()
  })

  it('uses default random media identities and exposes Session/media lookup methods', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-worker-default-media-'))
    temporaryDirectories.push(root)
    const transport: GenerationTransport = {
      submit: vi.fn(async input => acceptSubmission(input)),
      observe: vi.fn<GenerationTransport['observe']>(async () => ({
        status: 'success',
        outputs: [{ nodeId: '3', outputIndex: 0, mediaKind: 'image', filename: 'result', subfolder: '', type: 'output' }],
      })),
      download: vi.fn(async () => ({ bytes: pngBytes, mediaType: 'image/png' })),
    }
    const generation = new GenerationRuntime({
      runRepositoryFile: join(root, 'data', 'runs.sqlite'),
      runDirectory: join(root, 'runs'),
      savedMediaDirectory: join(root, 'media'),
      preparer,
      transport,
      createRunId: () => 'run_default_media',
      createPromptId: () => '0193f85c-86fb-4ad9-8d2b-28cf39e8b042',
    })
    await generation.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 6, callId: 'call_default_media' },
      request,
    )
    await generation.advance()
    await generation.advance()
    await generation.advance()
    await generation.advance()

    const media = generation.queryMediaForSession('session_1', 6)
    expect(media).toHaveLength(1)
    expect(media[0]!.mediaId).toMatch(/^media_/u)
    expect(media[0]!.relativePath).toMatch(/\.png$/u)
    expect(generation.getMedia(media[0]!.mediaId)).toEqual(media[0])
    expect(generation.queryRunsForSession('session_1', 6)[0]?.status).toBe('succeeded')
    generation.close()
  })

  it('publishes a staged final media file and removes an incomplete staging file on restart', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-media-recovery-'))
    temporaryDirectories.push(root)
    const transport: GenerationTransport = {
      submit: vi.fn(), observe: vi.fn(), download: vi.fn(),
    }
    const first = runtime(root, transport)
    const accepted = await first.acceptGeneration(
      { workspaceId: 'workspace_1', sessionId: 'session_1', turn: 4, callId: 'call_1' }, request,
    )
    first.close()
    const database = new DatabaseSync(join(root, 'data', 'runs.sqlite'))
    const insert = database.prepare(`
      INSERT INTO generation_media_staging(
        media_id, run_id, workspace_id, session_id, turn, node_id, output_index,
        media_kind, filename, relative_path, temporary_relative_path, media_type, byte_size, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insert.run(
      'media_recovered', accepted.runId, 'workspace_1', 'session_1', 4, '3', 0,
      'image', 'result.png', 'aa/bb/media_recovered.png', 'aa/bb/media_recovered.png.tmp',
      'image/png', pngBytes.byteLength, 1,
    )
    insert.run(
      'media_incomplete', accepted.runId, 'workspace_1', 'session_1', 4, '4', 0,
      'image', 'incomplete.png', 'cc/dd/media_incomplete.png', 'cc/dd/media_incomplete.png.tmp',
      'image/png', pngBytes.byteLength, 2,
    )
    database.close()
    mkdirSync(join(root, 'media/aa/bb'), { recursive: true })
    mkdirSync(join(root, 'media/cc/dd'), { recursive: true })
    writeFileSync(join(root, 'media/aa/bb/media_recovered.png'), pngBytes)
    writeFileSync(join(root, 'media/cc/dd/media_incomplete.png.tmp'), pngBytes)

    const recovered = runtime(root, transport)

    expect(recovered.queryMediaForSession('session_1').map(item => item.mediaId)).toEqual(['media_recovered'])
    expect(existsSync(join(root, 'media/cc/dd/media_incomplete.png.tmp'))).toBe(false)
    recovered.close()
  })
})
