import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { vi } from 'vitest'
import { GenerationRuntime } from '../../src/host/generation/generation-runtime.ts'
import { WorkbenchStore } from '../../src/host/storage/workbench-store.ts'
import * as workbench from '../../src/host/workbench/plugin.ts'
import { WorkbenchRemoteService } from '../../src/host/workbench/remote-service.ts'
import type { WorkflowRuntimeParameterInspection } from '../../src/generation/inspection-contract.ts'

export function provideWorkbenchOfficialServices(ctx: Context, workspaces = [
  { id: 'workspace_1', title: 'Project', path: '/workspace/project' },
]) {
  const sessions = new Map<string, { header: { cwd: string } }>()
  const events = new Map<string, SessionEvent[]>()
  const skills = [
    { name: 'prompt-builder', description: 'Compose prompts', invocation: { modelInvocable: true } },
    { name: 'internal-only', description: 'Internal skill', invocation: { modelInvocable: false } },
  ]
  const agents = new Map<string, { status: 'idle' | 'running'; session: { header: { cwd: string }; snapshotEvents(): readonly SessionEvent[] }; ctx: { skills: { list: ReturnType<typeof vi.fn> }; get(name: string): unknown } }>()
  const controller = {
    modelCatalog: vi.fn(async () => ({
      default: { provider: 'provider-a', model: 'model-a' },
      groups: [{ id: 'provider-a', name: 'Provider A', models: [{ id: 'model-a', name: 'Model A' }] }],
      routableProviders: ['provider-a'], failures: [],
    })),
    create: vi.fn(async (input: { workspaceId: string; agentPreset: string }) => {
      const sessionId = `session-${randomUUID()}`
      const session = { header: { cwd: workspaces.find(item => item.id === input.workspaceId)!.path }, snapshotEvents: () => events.get(sessionId) ?? [] }
      sessions.set(sessionId, session)
      agents.set(sessionId, { status: 'running', session, ctx: { skills: { list: vi.fn(async () => skills) }, get(name: string) { if (name !== 'skills') throw new Error(`Unknown agent service: ${name}`); return this.skills } } })
      return { sessionId, agentPreset: input.agentPreset }
    }),
    selectModel: vi.fn(async (input: { provider: string; model: string; reasoningEffort?: string }) => ({
      selected: { provider: input.provider, model: input.model, ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}) },
    })),
    prompt: vi.fn(async () => ({ accepted: true as const })),
    cancel: vi.fn(() => ({ accepted: true as const })),
  }
  const disposeScope = vi.fn(async () => {})
  const acquireScope = vi.fn(async () => ({ key: 'preset-scope', [Symbol.asyncDispose]: disposeScope }))
  const listSkills = vi.fn(async () => skills)
  const listPresets = vi.fn(async (): Promise<{ id: string; name?: string; broken?: string }[]> => [{ id: 'preset-a', name: 'Preset A' }, { id: 'preset-broken', broken: 'Missing component' }])
  ctx.provide('sessionController' as never, controller as never)
  ctx.provide('agents' as never, agents as never)
  ctx.provide('agentPresets' as never, {
    list: listPresets,
    acquireScope,
  } as never)
  ctx.provide('skills' as never, { list: listSkills } as never)
  return { sessions, events, agents, controller, acquireScope, disposeScope, listSkills, listPresets }
}

export async function createWorkbenchHostFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-host-'))
  const database = new DatabaseSync(':memory:')
  let store: WorkbenchStore
  const description: WorkflowRuntimeParameterInspection = {
    parameters: [
      { parameter_id: 'positive', kind: 'positive_prompt', value_type: 'string', current_value: '' },
      { parameter_id: 'negative', kind: 'negative_prompt', value_type: 'string', current_value: '' },
      { parameter_id: 'seed', kind: 'seed', value_type: 'integer', current_value: 17 },
      { parameter_id: 'steps', kind: 'steps', value_type: 'integer', current_value: 20 },
      { parameter_id: 'reference', kind: 'reference_image', value_type: 'string', current_value: '' },
    ],
    size_candidates: [{
      candidate_id: 'width_height:width:height', representation: 'width_height',
      width: { parameter_id: 'width', kind: 'width', value_type: 'integer', current_value: 512, minimum: 64, maximum: 2048 },
      height: { parameter_id: 'height', kind: 'height', value_type: 'integer', current_value: 512, minimum: 64, maximum: 2048 },
    }],
  }
  const inspect = vi.fn(async () => structuredClone(description))
  const runtime = new GenerationRuntime({
    database, runRepositoryFile: join(directory, 'runs.sqlite'), runDirectory: join(directory, 'runs'), savedMediaDirectory: join(directory, 'media'),
    preparer: { inspectRuntimeParameters: inspect, validateInput: vi.fn(async () => {}), prepare: async () => { throw new Error('Generation must be advanced explicitly') } },
    workbench: {
      assertGenerationAcceptance: input => store.assertGenerationAcceptance(input),
      registerGenerationRun: input => store.registerGenerationRun(input),
    },
  })
  store = new WorkbenchStore({ database, artifactDirectory: join(directory, 'artifacts') })
  const ctx = new Context()
  const workspaces = [
    { id: 'workspace_1', title: 'First project', path: '/workspace/project' },
    { id: 'workspace_2', title: 'Second project', path: '/workspace/other' },
  ]
  let official!: ReturnType<typeof provideWorkbenchOfficialServices>
  const descendants = new Map<string, { id: string; mode: string }[]>()
  const createWorkspace = vi.fn(async (path: string, title: string) => {
    const workspace = { id: `workspace_${workspaces.length + 1}`, title, path }
    workspaces.push(workspace)
    return workspace
  })
  const officialFiber = await ctx.plugin({
    name: 'test-workbench-official-services',
    apply(context: Context) {
      official = provideWorkbenchOfficialServices(context, workspaces)
      context.provide('workspaceRegistry' as never, {
        list: () => workspaces,
        resolveByPath: async (path: string) => workspaces.find(workspace => workspace.path === path),
        create: createWorkspace,
      } as never)
      context.provide('sessionPersistence' as never, { stat: async (id: string) => official.sessions.get(id) } as never)
      context.provide('subagents' as never, { listDescendants: async (id: string) => descendants.get(id) ?? [] } as never)
    },
  })
  const catalog = {
    queryComfyuiInstances: vi.fn(async () => ({ results: [{ id: '8' }] })),
    resolveGenerationModel: vi.fn(async (id: string) => ({ id, file_name: 'paint.safetensors', base_model_id: '1' })),
    resolveLora: vi.fn(async (id: string) => ({ id, file_name: 'rain.safetensors', weight: 0.65, trigger_words: ['rain'] })),
    resolveTemplate: vi.fn(async (id: string) => ({ id, base_model_id: '1' })),
    details: vi.fn(async (ref: unknown) => ref),
  }
  ctx.provide('harnessComfyuiCore' as never, { services: {
    runtime, catalog, workbenchStore: store,
    profile: { client: { runRefreshIntervalMs: 777 }, cliServer: { host: '127.0.0.1', port: 0, shutdownTimeoutMs: 1000 }, jobs: { pollIntervalMs: 1000 }, paths: {} },
  } } as never)
  const fiber = await ctx.plugin(workbench)
  const remoteFiber = await ctx.plugin({ name: 'test-workbench-remote', inject: ['harnessComfyuiWorkbench', 'harnessComfyuiCore', 'workspaceRegistry'], apply(context: Context) { new WorkbenchRemoteService(context) } })
  const remote = ctx.reflect.get('harnessComfyuiWorkbenchRemote') as WorkbenchRemoteService
  return {
    ctx, store, runtime, directory, database, description, inspect, catalog, official, workspaces, descendants, createWorkspace, officialFiber, fiber, remoteFiber, remote,
    async dispose() {
      await remoteFiber.dispose()
      await fiber.dispose()
      await officialFiber.dispose()
      runtime.close()
      database.close()
      rmSync(directory, { recursive: true, force: true })
    },
  }
}

export function workbenchShellExecution(sessionId: string, cwd = '/workspace/project'): ToolExecution {
  const callId = `shell-${randomUUID()}`
  return {
    callId, rootCallId: 'shell-root', name: 'bash', arguments: {}, token: Symbol('shell-execution'), signal: new AbortController().signal,
    agent: { session: { id: sessionId, header: { cwd }, snapshotEvents: () => [{ type: 'tool/call', data: { callId, name: 'bash', turn: 2 } }] } },
  } as unknown as ToolExecution
}
