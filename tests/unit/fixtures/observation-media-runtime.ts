import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { vi } from 'vitest'

import { GenerationRuntime } from '../../../src/host/generation/generation-runtime.ts'
import { resolveObservationMedia } from '../../../src/host/generation/observation-media.ts'

export function observationExecution(callId = 'observation-1') {
  const events = [{ type: 'tool/call', data: { callId, name: 'subagent_observation', turn: 3 } }]
  return {
    callId, name: 'subagent_observation', signal: new AbortController().signal,
    agent: { id: 'parent-1', session: {
      id: 'parent-1', header: { cwd: '/workspace' }, snapshotEvents: () => events,
    } },
  }
}

export function observationMediaFixture() {
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-observation-'))
  let runSequence = 0
  let mediaSequence = 0
  const runtime = new GenerationRuntime({
    runRepositoryFile: join(root, 'runs.sqlite'), runDirectory: join(root, 'runs'),
    savedMediaDirectory: join(root, 'media'),
    createRunId: () => `run_${(++runSequence).toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`,
    createMediaId: () => `media_aa_bb_${++mediaSequence}`,
    preparer: {
      async inspectRuntimeParameters() { throw new Error('unused') },
      async prepare() { return {
        instanceId: '2', instanceTitle: 'ComfyUI', templateTitle: 'Template', sourceSnapshot: {},
        actualWorkflow: { version: 0.4 }, apiWorkflow: {}, expectedOutputNodeIds: ['10'],
        connection: { url: 'http://127.0.0.1:8188', origin: 'http://127.0.0.1:8188', authorization: null },
      } },
    },
    transport: {
      async submit(input) {
        if (!input.onRequestStart()) throw new Error('submission rejected')
        return { promptId: input.promptId }
      },
      async observe() { return { status: 'success', outputs: [0, 1, 2].map(outputIndex => ({
        nodeId: '10', outputIndex, mediaKind: 'image', filename: `image-${outputIndex}.png`, subfolder: '', type: 'output',
      })) } },
      async download() { return { bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), mediaType: 'image/png' } },
    },
  })
  const workspaceRegistry = { resolveByPath: vi.fn(async () => ({ id: 'workspace-1', sessionIds: ['parent-1'] })) }
  const accept = async (workspaceId = 'workspace-1', complete = true) => {
    const accepted = await runtime.acceptGeneration({ workspaceId, sessionId: 'generator-1', turn: 1, callId: `generation-${runSequence}` }, {
      title: 'TARGET_TITLE_MUST_STAY_PRIVATE', instanceId: '2', templateId: '34', model: null, loras: [],
      parameters: { positive_prompt: 'TARGET_PROMPT_MUST_STAY_PRIVATE' },
    })
    if (complete) for (let step = 0; step < 3; step += 1) await runtime.advance()
    return accepted.runId
  }
  const resolveMedia = (exec: ToolRunContext, toolName: string, images: Parameters<typeof resolveObservationMedia>[3]) => resolveObservationMedia(
    { runtime, workspaceRegistry: workspaceRegistry as never }, exec, toolName, images,
  )
  const resolve = (images: unknown, exec = observationExecution()) => resolveMedia(
    exec as unknown as ToolRunContext, 'subagent_observation', images as never,
  )
  return { root, runtime, workspaceRegistry, accept, resolve, resolveMedia }
}
