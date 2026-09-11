import { createGenerationRunMediaTool } from '../../src/host/generation/generation-media-tool.ts'
import type { Context } from '@deepseek-ai/cordis'
import { loadProfile } from '../../src/config/load-profile.ts'
import { ComfyuiCoreService } from '../../src/host/core/plugin.ts'
import { GenerationRuntime } from '../../src/host/generation/generation-runtime.ts'
import { GenerationCoordinator } from '../../src/host/generation/generation-coordinator.ts'
import { ComfyHttpTransport } from '../../src/host/generation/comfy-http-transport.ts'

// Replace Workflow compilation at the preparation seam; retain durable Runtime,
// coordinator, HTTP ComfyUI transport, DSH identity and Workspace services.
export const name = 'headless-generation-fixture'
export const inject = ['workspaceRegistry', 'tools', 'settings']
export function apply(ctx: Context) {
  const profile = loadProfile('production')
  const origin = process.env.HEADLESS_TEST_ORIGIN!
  const source = {
    readInstance: async () => ({ id: '1', title: 'Controlled ComfyUI', url: origin, credentialType: 'none' as const, authorization: null }),
    readTemplate: async () => ({ id: '1', title: 'Controlled template', workflow: { nodes: [] } }),
  }
  const runtime = new GenerationRuntime({
    runRepositoryFile: profile.paths.runRepositoryFile,
    runDirectory: profile.paths.runDirectory,
    savedMediaDirectory: profile.paths.savedMediaDirectory,
    preparer: {
      inspectRuntimeParameters: async () => ({ parameters: [], size_candidates: [] }),
      async prepare(_request, signal) {
        return {
          instanceId: '1', instanceTitle: 'Controlled ComfyUI', templateTitle: 'Controlled template',
          sourceSnapshot: {}, actualWorkflow: { nodes: [] }, apiWorkflow: { '1': { class_type: 'SaveImage', inputs: {} } },
          expectedOutputNodeIds: ['1'], connection: { url: origin, origin, authorization: null },
        }
      },
    },
    transport: new ComfyHttpTransport({ source }),
  })
  const coordinator = new GenerationCoordinator({ runtime, pollIntervalMs: 10 })
  ctx.effect(() => {
    coordinator.start()
    return async () => { await coordinator.stop(); runtime.close() }
  })
  ctx.effect(() => ctx.tools.register(createGenerationRunMediaTool({ runtime, workspaceRegistry: ctx.workspaceRegistry })))
  new ComfyuiCoreService(ctx, {
    runtime, profile, catalog: {} as never,
    sourceAddress: () => ({ url: origin, port: Number(new URL(origin).port) }),
    semanticQueryClientPath: '/unused-semantic-client.mjs',
  })
}
