import { spawn } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { afterEach, expect, it, vi } from 'vitest'
import { materializeManagedCliModule } from '../../scripts/build/cli-module.mjs'
import * as cli from '../../src/host/cli/plugin.ts'
import { CLI_ENVIRONMENT_NAMES, CLI_ROUTE_PATH } from '../../src/cli/contract.ts'
import { createWorkbenchHostFixture, workbenchShellExecution } from '../support/workbench-host.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function fixture() {
  const host = await createWorkbenchHostFixture()
  cleanups.push(host.dispose)
  const cliPath = join(host.directory, 'installed-cli', 'harness-comfyui.mjs')
  await materializeManagedCliModule({ entry: resolve('scripts/cli/harness-comfyui.mjs'), output: cliPath })
  let contributor: { resolve(execution: ToolExecution): Readonly<Record<string, string>> } | undefined
  const unregister = vi.fn()
  host.ctx.provide('shellEnv' as never, { register(value: typeof contributor) { contributor = value; return unregister } } as never)
  host.ctx.provide('tools' as never, { register: vi.fn(() => vi.fn()) } as never)
  host.ctx.provide('jobs' as never, { start: vi.fn() } as never)
  host.ctx.provide('imageReader' as never, { inspect: vi.fn() } as never)
  const cliFiber = await host.ctx.plugin(cli)
  cleanups.push(() => cliFiber.dispose())
  const variables = (execution: ToolExecution) => {
    if (!contributor) throw new Error('The CLI plugin did not expose its foreground shell environment')
    return contributor.resolve(execution)
  }
  const run = async (args: string[], input: unknown, environment: Readonly<Record<string, string>>) => {
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolveResult, reject) => {
      const child = spawn(process.execPath, [cliPath, ...args], { env: { ...process.env, ...environment, TMPDIR: host.directory }, stdio: ['pipe', 'pipe', 'pipe'] })
      let stdout = '', stderr = ''
      child.stdout.on('data', data => { stdout += String(data) })
      child.stderr.on('data', data => { stderr += String(data) })
      child.on('error', reject)
      child.on('close', code => resolveResult({ code: code ?? 1, stdout, stderr }))
      child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input))
    })
    const resultPath = result.stdout.trim()
    return { ...result, resultPath, data: result.code === 0 ? JSON.parse(await readFile(resultPath, 'utf8')) : undefined }
  }
  return { ...host, run, variables, unregister, cliFiber }
}

it('keeps fixed source inputs, context and base model when running a branch from a Run, experience or generation candidate', async () => {
  const { remote, catalog, runtime, store, run, variables } = await fixture()
  const models = {
    '2': { id: '2', file_name: 'source.safetensors', base_model_id: '1' },
    '3': { id: '3', file_name: 'other.safetensors', base_model_id: '9' },
  }
  const templates = {
    '5': { id: '5', title: 'Source rain template', base_model_id: '1', model_id: null },
    '6': { id: '6', title: 'Current sunshine template', base_model_id: '9', model_id: null },
  }
  catalog.resolveGenerationModel.mockImplementation(async id => models[id as keyof typeof models])
  catalog.resolveTemplate.mockImplementation(async id => templates[id as keyof typeof templates])
  const readDetails = catalog.details.getMockImplementation()!
  catalog.details.mockImplementation(async (request, requestSignal) => {
    const details = await readDetails(request, requestSignal)
    const source = request.kind === 'model' ? models[request.id as keyof typeof models]
      : request.kind === 'comfyui-template' ? templates[request.id as keyof typeof templates] : null
    if (!source) return details
    const context = 'file_name' in source ? { kind: 'model' as const, id: source.id, file_name: source.file_name }
      : { kind: 'comfyui-template' as const, id: source.id, title: source.title }
    return {
      ...details,
      item: { ...details.item, context, baseModelId: source.base_model_id, label: 'file_name' in source ? source.file_name : source.title },
      fields: details.fields.map(field => ({ ...field, value: field.key in source ? source[field.key as keyof typeof source] : field.value })),
    }
  })
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  await remote.mutate({ ...selected, type: 'update-draft', field: 'instance_id', value: '8' }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'character', id: '4' } }, signal())
  await remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: 'Source rain on glass' }, signal())
  await remote.mutate({ ...selected, type: 'update-draft', field: 'negative_prompt', value: 'Source blur' }, signal())
  const startRun = async (scope: typeof selected) => {
    const before = new Set((await remote.getProjection(scope, signal())).tasks.map(task => task.task_id))
    await remote.mutate({ ...scope, type: 'run' }, signal())
    const task = (await remote.getProjection(scope, signal())).tasks.find(task => !before.has(task.task_id))!
    const result = await run(['generation', 'submit', '--stdin'], { workbench_task_id: task.task_id, items: [{ request_id: crypto.randomUUID(), request: task.input.generation_input }] }, variables(workbenchShellExecution(task.session_id!)))
    expect(result.code, result.stderr).toBe(0)
    return { task, actual: store.getRun(result.data.items[0].run_id) }
  }
  const source = await startRun(selected)
  await runtime.advance()
  const review = store.getRunReviewDraft(source.actual.run_id)
  await remote.mutate({ ...selected, type: 'evaluate', runId: source.actual.run_id, value: { expected: review, draft: { ...review, title: 'Source setup', conditions: 'Rain on glass', note: 'Retain the source setup' }, saveExperience: true } }, signal())
  const experience = (await remote.getProjection(selected, signal())).experiences[0]!
  await remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: 'Current branch sunshine' }, signal())
  await remote.mutate({ ...selected, type: 'update-draft', field: 'negative_prompt', value: 'Current branch darkness' }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'model', id: '3' } }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'comfyui-template', id: '6' } }, signal())
  await remote.mutate({ ...selected, type: 'resource-remove', id: '4', value: 'character' }, signal())
  expect(store.getBranch(selected.branchId!).draft).toMatchObject({ base_model_id: '9', prompt_input: { positive_prompt: 'Current branch sunshine' }, context_refs: [] })
  const fromRun = await remote.mutate({ ...selected, type: 'create-branch', runId: source.actual.run_id, value: { name: 'From source Run', original_request: 'Repeat the source Run' } }, signal())
  const fromExperience = await remote.mutate({ ...selected, type: 'reuse', id: experience.experience_id, value: { name: 'Experience recheck', baseModelId: '1' } }, signal())
  for (const scope of [fromRun, fromExperience]) {
    expect(store.getBranch(scope.branchId!).draft).toMatchObject({ base_model_id: '1', prompt_input: { positive_prompt: null, negative_prompt: null }, context_refs: [{ kind: 'character', id: '4' }], generation_input: source.actual.generation_input })
    const started = await startRun(scope)
    expect(started.task.input.base_model_id).toBe('1')
    expect(started.task.input.context_refs).toEqual([{ kind: 'character', id: '4' }])
    expect(started.actual.generation_input).toEqual(source.actual.generation_input)
  }
  await remote.mutate({ ...selected, type: 'experiment' }, signal())
  const experiment = (await remote.getProjection(selected, signal())).tasks.find(task => task.kind === 'experiment')!
  const candidateInput = { ...source.actual.generation_input, parameters: { ...source.actual.generation_input.parameters, positive: 'Candidate evening rain', negative: 'Candidate fog' } }
  const published = await run(['workbench', 'task', 'publish', '--stdin'], { task_id: experiment.task_id, artifact: { type: 'generation_input', generation_input: candidateInput, context_refs: [{ kind: 'character', id: '4' }] } }, variables(workbenchShellExecution(experiment.session_id!)))
  expect(published.code, published.stderr).toBe(0)
  const fromCandidate = await remote.mutate({ ...selected, type: 'task-branch', id: published.data.artifact_id, value: { name: 'From candidate' } }, signal())
  expect(store.getBranch(fromCandidate.branchId!).draft).toMatchObject({ base_model_id: '1', prompt_input: { positive_prompt: 'Candidate evening rain', negative_prompt: 'Candidate fog' }, context_refs: [{ kind: 'character', id: '4' }] })
  const started = await startRun(fromCandidate)
  expect(started.task.input.base_model_id).toBe('1')
  expect(started.actual.generation_input).toEqual(candidateInput)
})

it('accepts a comparison with two Run references and rejects a single reference before creating a task', async () => {
  const { remote, runtime, run, variables } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Compare rain treatments' } }, signal())
  await remote.mutate({ ...selected, type: 'update-draft', field: 'instance_id', value: '8' }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal())
  const runIds: string[] = []
  for (const prompt of ['Gentle rain', 'Heavy rain']) {
    await remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: prompt }, signal())
    const before = new Set((await remote.getProjection(selected, signal())).tasks.map(task => task.task_id))
    await remote.mutate({ ...selected, type: 'run' }, signal())
    const task = (await remote.getProjection(selected, signal())).tasks.find(task => !before.has(task.task_id))!
    const submitted = await run(['generation', 'submit', '--stdin'], { workbench_task_id: task.task_id, items: [{ request_id: crypto.randomUUID(), request: task.input.generation_input }] }, variables(workbenchShellExecution(task.session_id!)))
    expect(submitted.code, submitted.stderr).toBe(0)
    runIds.push(submitted.data.items[0].run_id)
    await runtime.advance()
  }
  const draft = (await remote.getProjection(selected, signal())).runs.find(run => run.run_id === runIds[0])!.review_draft!
  const evaluationDraft = { expected: draft, draft }
  await expect(remote.mutate({ ...selected, type: 'agent-action', id: 'compare', runId: runIds[0], referenceRunIds: [runIds[0]!], value: { evaluationDraft } }, signal())).rejects.toMatchObject({ code: 'workbench/operation-failed' })
  expect((await remote.getProjection(selected, signal())).tasks.filter(task => task.kind === 'compare')).toEqual([])
  await remote.mutate({ ...selected, type: 'agent-action', id: 'compare', runId: runIds[0], referenceRunIds: runIds, value: { evaluationDraft } }, signal())
  const comparison = (await remote.getProjection(selected, signal())).tasks.find(task => task.kind === 'compare')!
  const result = await run(['workbench', 'task', 'get', '--stdin'], { task_id: comparison.task_id }, variables(workbenchShellExecution(comparison.session_id!)))
  expect(result.code, result.stderr).toBe(0)
  expect(result.data.reference_run_ids).toEqual(runIds)
  expect(result.data.evaluation_input.run_id).toBe(runIds[0])
})

it('publishes a terminal Run review without an optional generation candidate through the actual CLI', async () => {
  const { ctx, remote, run, variables, runtime, store } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  await remote.mutate({ ...selected, type: 'update-draft', field: 'instance_id', value: '8' }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'model', id: '2' } }, signal())
  await remote.mutate({ ...selected, type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } }, signal())
  await remote.mutate({ ...selected, type: 'run' }, signal())
  const generationTask = (await remote.getProjection(selected, signal())).tasks[0]!
  const submitted = await run(['generation', 'submit', '--stdin'], { workbench_task_id: generationTask.task_id, items: [{ request_id: crypto.randomUUID(), request: generationTask.input.generation_input }] }, variables(workbenchShellExecution(generationTask.session_id!)))
  expect(submitted.code, submitted.stderr).toBe(0)
  const runId = submitted.data.items[0].run_id as string
  await runtime.advance()
  expect(store.getRun(runId).status).toBe('failed')
  const initialDraft = (await remote.getProjection(selected, signal())).runs.find(run => run.run_id === runId)!.review_draft!
  await remote.mutate({ ...selected, type: 'agent-action', id: 'review', runId, value: { evaluationDraft: { expected: initialDraft, draft: initialDraft } } }, signal())
  const reviewTask = (await remote.getProjection(selected, signal())).tasks.find(item => item.kind === 'review')!
  const environment = variables(workbenchShellExecution(reviewTask.session_id!))
  const fetched = await run(['workbench', 'task', 'get', '--stdin'], { task_id: reviewTask.task_id }, environment)
  expect(fetched.code, fetched.stderr).toBe(0)
  expect(fetched.data.evaluation_input.run_id).toBe(runId)
  const result = await run(['workbench', 'task', 'publish', '--stdin'], { task_id: reviewTask.task_id, artifact: { type: 'review', observation: 'Controlled generation failed before submission', conclusion: 'Select a reachable instance', run_ids: [runId] } }, environment)
  expect(result.code, result.stderr).toBe(0)
  expect(result.data).toMatchObject({ task_id: reviewTask.task_id, disposition: 'applied' })
  expect(store.getRunReviewDraft(runId)).toMatchObject({ observation: 'Controlled generation failed before submission', conclusion: 'Select a reachable instance', review_artifact_id: result.data.artifact_id })
  await remote.mutate({ ...selected, type: 'favorite', id: runId, value: { targetType: 'run', favorite: true } }, signal())
  expect((await remote.getProjection(selected, signal())).favorites).toEqual([{ target_type: 'run', target_id: runId }])
  await remote.mutate({ ...selected, type: 'favorite', id: runId, value: { targetType: 'run', favorite: false } }, signal())
  expect((await remote.getProjection(selected, signal())).favorites).toEqual([])
  const expected = store.getRunReviewDraft(runId)
  const draft = { ...expected, verdict: 'needs-work', title: 'Check the instance', conditions: 'The instance is unreachable', note: 'Select a reachable instance before retrying' }
  await remote.mutate({ ...selected, type: 'evaluate', runId, value: { expected, draft, saveExperience: true } }, signal())
  const saved = await remote.getProjection(selected, signal())
  const experience = saved.experiences[0]!
  expect(saved.runs[0]!.review).toMatchObject({ verdict: 'needs-work', source_artifact_id: result.data.artifact_id })
  await remote.mutate({ ...selected, type: 'favorite', id: experience.experience_id, value: { targetType: 'experience', favorite: true } }, signal())
  expect((await remote.getProjection(selected, signal())).favorites).toEqual([{ target_type: 'experience', target_id: experience.experience_id }])
  const reused = await remote.mutate({ ...selected, type: 'reuse', id: experience.experience_id, value: { name: 'Experience recheck', baseModelId: '1' } }, signal())
  expect(store.getBranch(reused.branchId!)).toMatchObject({ source_run_id: runId, name: 'Experience recheck', source_experience_id: experience.experience_id, original_request: 'Paint rain', draft: { generation_input: generationTask.input.generation_input } })
  const fork = await remote.mutate({ ...selected, type: 'create-branch', runId, value: { name: 'Retry idea', original_request: 'Try another instance' } }, signal())
  expect(store.getBranch(fork.branchId!)).toMatchObject({ source_run_id: runId, draft: { generation_input: generationTask.input.generation_input } })
  await remote.mutate({ ...selected, type: 'retry', runId }, signal())
  const retry = (await remote.getProjection(selected, signal())).tasks.find(item => item.retry_of_run_id === runId)!
  expect(retry.input.generation_input).toEqual(generationTask.input.generation_input)
})
const signal = () => new AbortController().signal

it('routes task get and file-backed publish through the mounted Host and saves complete result files', async () => {
  const { ctx, remote, run, variables, directory, official, store } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Portrait', goal: 'Paint a portrait' } }, signal())
  await remote.mutate({ ...selected, type: 'agent-action', id: 'prompt' }, signal())
  const task = (await remote.getProjection(selected, signal())).tasks[0]!
  const execution = workbenchShellExecution(task.session_id!)
  const environment = variables(execution)
  expect(environment[CLI_ENVIRONMENT_NAMES.capability]).toEqual(expect.any(String))
  const first = await run(['workbench', 'task', 'get', '--stdin'], { task_id: task.task_id }, environment)
  expect(first.code, first.stderr).toBe(0)
  expect(first.stdout).toBe(`${first.resultPath}\n`)
  expect(isAbsolute(first.resultPath)).toBe(true)
  expect(first.stderr).toContain('NEXT:')
  expect(first.data).toMatchObject({ task_id: task.task_id, kind: 'prompt', prompt_input: { positive_prompt: '', negative_prompt: '' }, requirements: { original_request: 'Paint a portrait' }, output_contract: { artifact_types: ['prompt'] } })
  await remote.mutate({ ...selected, type: 'update-draft', field: 'positive_prompt', value: 'Manual portrait' }, signal())
  const second = await run(['workbench', 'task', 'get', '--stdin'], { task_id: task.task_id }, environment)
  expect(second.resultPath).not.toBe(first.resultPath)
  expect(second.data.prompt_input.positive_prompt).toBe('')
  const nativeText = 'native output\nwith a full prompt\n'
  await writeFile(join(directory, 'native.txt'), nativeText)
  official.events.set(task.session_id!, [
    { type: 'tool/call', seq: 1, time: 1, data: { turn: 1, step: 1, callId: 'skill-portrait', name: 'skill', arguments: '{"name":"prompt-builder"}' } },
    { type: 'tool/result', seq: 2, time: 2, data: { turn: 1, step: 1, message: createToolResultMessage({ callId: 'skill-portrait' as never, isError: false, content: [] }) } },
  ] as SessionEvent[])
  const artifactFile = join(directory, 'artifact.json')
  await writeFile(artifactFile, JSON.stringify({ task_id: task.task_id, artifact: { type: 'prompt', positive_prompt: 'Agent portrait', negative_prompt: 'blur', source_files: ['native.txt'] } }))
  const published = await run(['workbench', 'task', 'publish', '--file', artifactFile], '', environment)
  expect(published.code).toBe(0)
  expect(published.data).toMatchObject({ task_id: task.task_id, artifact_id: expect.any(String), disposition: 'candidate' })
  const again = await run(['workbench', 'task', 'publish', '--file', artifactFile], '', environment)
  expect(again.data).toEqual(published.data)
  const projection = await remote.getProjection(selected, signal())
  expect(projection.artifacts).toHaveLength(1)
  expect(projection.artifacts[0]).toMatchObject({ session_id: task.session_id, turn: 2, call_id: execution.callId, skill_refs: [{ name: 'prompt-builder', session_id: task.session_id, turn: 1, call_id: 'skill-portrait', source_file: null }] })
  expect(await readFile(projection.artifacts[0]!.source_files[0]!, 'utf8')).toBe(nativeText)
  expect(store.getBranch(selected.branchId!).draft.prompt_input.positive_prompt).toBe('Manual portrait')
  official.agents.get(task.session_id!)!.status = 'idle'
  expect((await remote.getProjection(selected, signal())).tasks[0]!.status).toBe('succeeded')
  ctx.emit('tools/result', execution, { status: 'success', value: null } as never)
  const revoked = await run(['workbench', 'task', 'get', '--stdin'], { task_id: task.task_id }, environment)
  expect(revoked).toMatchObject({ code: 1, stdout: '' })
  expect(revoked.stderr).toContain('CLI_CAPABILITY_INVALID')
})

it('authorizes descendants, rejects unrelated sessions and returns retryable experiment end receipts', async () => {
  const { ctx, remote, run, variables, official, descendants, cliFiber, unregister } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  for (const request of [
    { type: 'update-draft', field: 'instance_id', value: '8' },
    { type: 'resource-select', value: { kind: 'model', id: '2' } },
    { type: 'resource-select', value: { kind: 'comfyui-template', id: '5' } },
    { type: 'update-execution', field: 'max_runs', value: 2 },
    { type: 'experiment' },
  ] as const) await remote.mutate({ ...selected, ...request }, signal())
  const task = (await remote.getProjection(selected, signal())).tasks[0]!
  official.sessions.set('session-child', { header: { cwd: '/workspace/project' } })
  descendants.set(task.session_id!, [{ id: 'session-child', mode: 'internal' }])
  const childEnvironment = variables(workbenchShellExecution('session-child'))
  const childResult = await run(['workbench', 'task', 'get', '--stdin'], { task_id: task.task_id }, childEnvironment)
  expect(childResult.code, childResult.stderr).toBe(0)
  const unrelated = variables(workbenchShellExecution('session-unrelated'))
  const denied = await run(['workbench', 'task', 'get', '--stdin'], { task_id: task.task_id }, unrelated)
  expect(denied).toMatchObject({ code: 1, stdout: '' })
  expect(denied.stderr).toContain('WORKBENCH_ACCESS_DENIED')
  const otherWorkspace = variables(workbenchShellExecution('session-other', '/workspace/other'))
  const crossWorkspace = await run(['workbench', 'task', 'get', '--stdin'], { task_id: task.task_id }, otherWorkspace)
  expect(crossWorkspace.stderr).toContain('WORKBENCH_ACCESS_DENIED')
  const environment = variables(workbenchShellExecution(task.session_id!))
  const ended = await run(['workbench', 'experiment', 'end', '--stdin'], { task_id: task.task_id, reason: 'user_ended' }, environment)
  expect(ended.code).toBe(0)
  expect(ended.data).toEqual({ task_id: task.task_id, control_state: 'ended', end_reason: 'user_ended', submitted_count: 0, max_runs: 2 })
  const repeated = await run(['workbench', 'experiment', 'end', '--stdin'], { task_id: task.task_id, reason: 'user_ended' }, environment)
  expect(repeated.data).toEqual(ended.data)
  const origin = ctx.harnessComfyuiCli.origin
  await cliFiber.dispose()
  expect(unregister).toHaveBeenCalledOnce()
  expect(ctx.reflect.get('harnessComfyuiCli')).toBeUndefined()
  await expect(fetch(`${origin}${CLI_ROUTE_PATH}`)).rejects.toThrow()
})

it('returns structured field errors without publishing artifacts or leaving a successful result file', async () => {
  const { remote, run, variables, directory, store } = await fixture()
  const selected = await remote.mutate({ type: 'new-work', workspaceId: 'workspace_1', value: { name: 'Rain', goal: 'Paint rain' } }, signal())
  await remote.mutate({ ...selected, type: 'agent-action', id: 'prompt' }, signal())
  const task = (await remote.getProjection(selected, signal())).tasks[0]!
  const before = (await readdir(directory)).sort()
  const environment = variables(workbenchShellExecution(task.session_id!))
  const result = await run(['workbench', 'task', 'publish', '--stdin'], { task_id: task.task_id, artifact: { type: 'prompt', positive_prompt: 12, negative_prompt: '' } }, environment)
  expect(result).toMatchObject({ code: 2, stdout: '' })
  expect(result.stderr).toContain('positive_prompt')
  expect(store.listArtifacts(task.task_id)).toEqual([])
  const rejected = await run(['workbench', 'task', 'publish', '--stdin'], { task_id: task.task_id, artifact: { type: 'parameters', parameters: { seed: 42 } } }, environment)
  expect(rejected).toMatchObject({ code: 1, stdout: '' })
  expect(rejected.stderr).toContain('artifact.type')
  expect(store.listArtifacts(task.task_id)).toEqual([])
  expect((await readdir(directory)).sort()).toEqual(before)
})
