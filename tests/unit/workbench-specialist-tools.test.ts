import type { Context } from '@deepseek-ai/cordis'
import { validateJsonSchemaValue, type ToolDefinition, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { GenerationRuntime } from '../../src/host/generation/generation-runtime.ts'
import { apply } from '../../src/host/workbench/specialist-tools.ts'
import { dispatch } from '../../src/host/cli/dispatch.ts'

function observationJobs() {
  let hooks: { done: Promise<unknown>; cancel(): void }
  const api = {
    attachController: vi.fn(),
    start(spec: { run(): typeof hooks }) { hooks = spec.run(); return 'job-observation' },
    wait: vi.fn(async (_id: string, _timeout: number, _owner: string, signal?: AbortSignal) => {
      signal?.throwIfAborted()
      return new Promise((resolveResult, reject) => {
        const abort = () => reject(signal?.reason)
        signal?.addEventListener('abort', abort, { once: true })
        hooks.done.then(result => { signal?.removeEventListener('abort', abort); resolveResult(result) }, reject)
      })
    }),
    remove: vi.fn(),
    kill: vi.fn(() => hooks.cancel()),
  }
  return { api, done: () => hooks.done }
}

describe('specialist business tools', () => {
  it('delivers nullable Workflow values through the registered tool and host output validator', async () => {
    const result = { parameters: [{ parameter_id: 'seed', kind: 'seed', value_type: 'integer', current_value: null }], size_candidates: [] }
    const runtime = { inspectTemplateRuntimeParameters: vi.fn(async () => result) }
    const tools = new Map<string, ToolDefinition>()
    apply({ tools: { register: (tool: ToolDefinition) => tools.set(tool.name, tool) }, harnessComfyuiWorkbench: { service: {} }, harnessComfyuiCore: { services: { runtime } } } as unknown as Context, { roleId: 'harness-comfyui-parameters' })
    const tool = tools.get('workbench_workflow_parameters')!
    const value = await tool.execute({ template_id: '47', instance_id: '2' }, {
      signal: new AbortController().signal, callId: 'parameters', rootCallId: 'parameters',
      agent: { session: { id: 'parameter-session', header: { cwd: '/project' }, snapshotEvents: () => [{ type: 'tool/call', data: { callId: 'parameters', turn: 1 } }] } },
    } as unknown as ToolRunContext)
    expect(value).toEqual(result)
    expect(validateJsonSchemaValue(tool.output.schema, value)).toEqual([])
  })

  it('rejects an invalid Workflow size before the registered tool delivers its output', async () => {
    const parameter = { parameter_id: 'size', kind: 'resolution_preset', value_type: 'choice', current_value: 'small' }
    const result = { parameters: [], size_candidates: [{ candidate_id: 'preset', representation: 'resolution_preset', parameter, mapped_options: [{ value: 'small', width: -1, height: 1024 }], unmapped_values: [] }] }
    const tools = new Map<string, ToolDefinition>()
    apply({ tools: { register: (tool: ToolDefinition) => tools.set(tool.name, tool) }, harnessComfyuiWorkbench: { service: {} }, harnessComfyuiCore: { services: { runtime: { inspectTemplateRuntimeParameters: async () => result } } } } as unknown as Context, { roleId: 'harness-comfyui-parameters' })
    await expect(tools.get('workbench_workflow_parameters')!.execute({ template_id: '47', instance_id: '2' }, {
      signal: new AbortController().signal, callId: 'parameters', rootCallId: 'parameters',
      agent: { session: { id: 'parameter-session', header: { cwd: '/project' }, snapshotEvents: () => [{ type: 'tool/call', data: { callId: 'parameters', turn: 1 } }] } },
    } as unknown as ToolRunContext)).rejects.toThrow(/width|output/u)
  })

  it('reports a missing Run observer only when the consumer requests generation.wait', async () => {
    await expect(dispatch({ runtime: {} as never, imageReader: {} as never, workspaceRegistry: {} as never },
      { sessionId: 'session', cwd: '/project', callId: 'wait-call', rootCallId: 'wait-call', turn: 1 },
      { command: 'generation.wait', run_ids: ['run-one'] }, new AbortController().signal)).rejects.toThrow('Run observation is unavailable')
  })

  it.each(['abort', 'observation_error'])('preserves the accepted Run after %s ends foreground observation', async failure => {
    const directory = await mkdtemp(join(tmpdir(), 'specialist-wait-'))
    const runtime = new GenerationRuntime({ runRepositoryFile: join(directory, 'runs.sqlite'), runDirectory: join(directory, 'runs'), savedMediaDirectory: join(directory, 'media'),
      preparer: { async prepare() { throw new Error('Stored preparation error') }, async inspectRuntimeParameters() { throw new Error('unused') } },
    })
    const tools = new Map<string, ToolDefinition>(), effects: (() => unknown)[] = []
    const jobs = observationJobs(), controller = new AbortController()
    const ctx = { tools: { register: (tool: ToolDefinition) => tools.set(tool.name, tool) },
      harnessComfyuiCore: { services: { runtime, profile: { jobs: { pollIntervalMs: 5 } } } },
      harnessComfyuiWorkbench: { service: { async authorizeGeneration() {} } },
      workspaceRegistry: { async resolveByPath() { return { id: 'workspace-wait' } } }, jobs: jobs.api, imageReader: {},
      effect: (dispose: () => () => unknown) => effects.push(dispose()),
    } as unknown as Context
    const execution = { signal: controller.signal, callId: 'submit', rootCallId: 'submit', agent: { session: { id: 'wait-session', header: { cwd: directory }, snapshotEvents: () => [{ type: 'tool/call', data: { callId: 'submit', turn: 1 } }] } } } as unknown as ToolRunContext
    try {
      apply(ctx, { roleId: 'harness-comfyui-run' })
      jobs.api.wait.mockResolvedValueOnce({ status: 'running' })
      const pending = tools.get('workbench_run_submit')!.execute({ items: [{ request_id: randomUUID(), request: { title: 'portrait', instance_id: '2', template_id: '34', model: null, parameters: {}, loras: [] } }] }, execution)
      const rejected = expect(pending).rejects.toThrow(failure === 'abort' ? 'User stopped observation' : 'Media query unavailable')
      await vi.waitFor(() => expect(jobs.api.wait).toHaveBeenCalledTimes(2))
      if (failure === 'abort') controller.abort(new Error('User stopped observation'))
      else vi.spyOn(runtime, 'readGenerationRunMedia').mockRejectedValueOnce(new Error('Media query unavailable'))
      await rejected
      await jobs.done()
      expect(jobs.api.kill).toHaveBeenCalledWith('job-observation', 'wait-session')
      expect(runtime.queryRunsForSession('wait-session')).toMatchObject([{ status: 'created' }])
      await runtime.advance()
      expect(runtime.queryRunsForSession('wait-session')).toMatchObject([{ status: 'failed', errorMessage: 'Stored preparation error' }])
    } finally { for (const dispose of effects.reverse()) await dispose(); runtime.close(); await rm(directory, { recursive: true, force: true }) }
  })
  it('reads Skill references and compiles a MOSS draft through the fixed compiler without a shell', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'specialist-prompt-'))
    const tools = new Map<string, ToolDefinition>()
    const ctx = {
      tools: { register: (tool: ToolDefinition) => tools.set(tool.name, tool) },
      harnessComfyuiCore: { services: {} },
    } as unknown as Context
    const execute = async (name: string, args: unknown) => {
      const tool = tools.get(name)!
      const result = await tool.execute(args, {
        signal: new AbortController().signal, callId: name, rootCallId: name,
        agent: { session: { id: 'prompt-session', header: { cwd: directory }, snapshotEvents: () => [{ type: 'tool/call', data: { callId: name, name, turn: 1 } }] } },
      } as unknown as ToolRunContext)
      expect(tool.output.render(args, result as Parameters<ToolDefinition['output']['render']>[1])).toEqual([{ type: 'text', text: JSON.stringify(result) }])
      return result
    }
    try {
      apply(ctx, { roleId: 'harness-comfyui-prompt' })
      expect(tools.get('workbench_file_read')!.description).toContain('offset')
      expect(tools.get('workbench_file_read')!.description).toContain('search')
      expect(tools.get('workbench_file_write')!.description).toContain('content')
      expect(tools.get('workbench_prompt_validate')!.description).toContain('help=true')
      expect(tools.get('workbench_prompt_validate')!.description).toContain('mode')
      await execute('workbench_file_write', { file_path: 'character.txt', content: 'brown hair\nblue eyes' })
      expect(await execute('workbench_file_read', { file_path: 'character.txt', offset: 1, limit: 1 })).toMatchObject({ text: 'blue eyes', total_lines: 2 })
      expect(await execute('workbench_prompt_validate', { skill_name: 'moss-prompt-builder', help: true })).toMatchObject({ exit_code: 0, stdout: expect.stringContaining('Caption') })
      expect(await execute('workbench_prompt_validate', { skill_name: 'moss-prompt-builder', mode: 'compile', input: { caption: 'A woman standing by the window.' } })).toMatchObject({ exit_code: 0, result: 'A woman standing by the window.\n' })
      await execute('workbench_file_write', { file_path: 'notes.txt', content: 'portrait notes' })
      expect(await execute('workbench_file_read', { file_path: directory })).toMatchObject({ entries: [{ name: 'character.txt', kind: 'file' }, { name: 'notes.txt', kind: 'file' }] })
      expect(await execute('workbench_prompt_validate', { skill_name: 'moss-prompt-builder', mode: 'compile', input: { caption: '' } })).toMatchObject({ exit_code: 2, stderr: expect.stringContaining('caption'), result: null })
      expect(await execute('workbench_file_read', { file_path: 'character.txt', search: 'eyes' })).toMatchObject({ matches: [{ line: 1, text: 'blue eyes' }] })
      for (const [skill_name, model_route] of [['anima-prompt-builder', 'anima-aesthetic-v1.1'], ['wai-sdxl-prompt-builder', 'wai-illustrious-sdxl'], ['krea2-anime-prompt-builder', 'krea2-turbo']]) {
        const krea = skill_name === 'krea2-anime-prompt-builder'
        const input = { model_route, positive_prompt: 'one adult dancer, full body', negative_mode: krea ? 'positive_rewrite' : 'native_negative', negative_prompt: krea ? null : 'bad quality', positive_avoidance: krea ? 'two clear hands' : null, generation_purpose: 'test', aspect_ratio: '1:1', width: 1024, height: 1024, megapixels: 1 }
        expect(await execute('workbench_prompt_validate', { skill_name, mode: '--generation-output', input })).toMatchObject({ exit_code: 0, result: input })
      }
      expect(tools.has('workbench_run_submit')).toBe(false)
      await expect(execute('workbench_prompt_validate', { skill_name: 'comfyui-generate', help: true })).rejects.toThrow()
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('submits and replays a generation in a normal session, then reads the persisted failure and actual input', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'specialist-tools-'))
    const runtime = new GenerationRuntime({
      runRepositoryFile: join(directory, 'runs.sqlite'), runDirectory: join(directory, 'runs'), savedMediaDirectory: join(directory, 'media'),
      preparer: { async prepare() { throw new Error('Controlled compiler failure') }, async inspectRuntimeParameters() { throw new Error('unused') } },
    })
    const tools = new Map<string, ToolDefinition>()
    const effects: (() => unknown)[] = []
    const jobs: Promise<unknown>[] = []
    const ctx = {
      tools: { register: (tool: ToolDefinition) => tools.set(tool.name, tool) },
      harnessComfyuiCore: { services: { runtime, profile: { jobs: { pollIntervalMs: 1 } } } },
      harnessComfyuiWorkbench: { service: { async authorizeGeneration(taskId: string | null) { expect(taskId).toBeNull() } } },
      workspaceRegistry: { async resolveByPath() { return { id: 'workspace-one' } } },
      jobs: {
        attachController() {},
        start(spec: { run(): { done: Promise<unknown> } }) { jobs.push(spec.run().done); return 'job-one' },
        async wait() { return await jobs.at(-1) },
        remove() {}, kill() {},
      },
      imageReader: {}, effect: (dispose: () => () => unknown) => effects.push(dispose()),
    } as unknown as Context
    const signal = new AbortController().signal
    const execution = (name: string): ToolRunContext => ({
      name, callId: name, rootCallId: name, signal,
      agent: { session: { id: 'session-one', header: { cwd: directory }, snapshotEvents: () => [
        { type: 'tool/call', data: { name, callId: name, turn: 1 } },
      ] } },
    } as unknown as ToolRunContext)
    try {
      apply(ctx, { roleId: 'harness-comfyui-run' })
      const submit = tools.get('workbench_run_submit')!
      const input = { items: [{ request_id: randomUUID(), request: { title: 'portrait', instance_id: '2', template_id: '34', model: null, parameters: { positive_prompt: 'portrait' }, loras: [] } }] }
      let returned = false
      const pending = submit.execute(input, execution(submit.name)).then(result => { returned = true; return result })
      await vi.waitFor(() => expect(jobs).toHaveLength(1))
      expect(returned).toBe(false)
      await runtime.advance()
      const accepted = await pending as { items: { run_id: string; acceptance: string }[]; runs: { status: string }[] }
      expect(submit.output.render(input, accepted)).toEqual([{ type: 'text', text: JSON.stringify(accepted) }])
      expect(accepted.items[0]!.acceptance).toBe('accepted')
      expect(accepted.runs[0]!.status).toBe('failed')
      const replay = await submit.execute(input, execution(submit.name)) as typeof accepted
      expect(replay.items[0]).toMatchObject({ run_id: accepted.items[0]!.run_id, acceptance: 'reused' })
      await Promise.all(jobs)
      const media = await tools.get('workbench_run_media')!.execute({ run_ids: [accepted.items[0]!.run_id] }, execution('workbench_run_media'))
      expect(media).toMatchObject({ runs: [{ status: 'failed', run_error: { message: 'Controlled compiler failure' } }] })
      apply(ctx, { roleId: 'harness-comfyui-parameters' })
      const saved = await tools.get('workbench_run_inputs')!.execute({ run_ids: [accepted.items[0]!.run_id] }, execution('workbench_run_inputs'))
      expect(saved).toMatchObject({ runs: [{ arguments: { parameters: { positive_prompt: 'portrait' } } }] })
    } finally {
      for (const dispose of effects.reverse()) await dispose()
      runtime.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
