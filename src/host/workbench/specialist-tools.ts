import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { repositoryResource } from '../resource-path.ts'
import { nodeScriptEnvironment } from '../node-script-environment.ts'
import Schema from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import { assertSupportedJsonSchema, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import configuration from '../../../config/workbench-agent-roles.json' with { type: 'json' }
import { contracts } from '#contracts'
import { dispatch } from '../cli/dispatch.ts'
import type { CliExecutionIdentity } from '../cli/shell-capability.ts'
import { GenerationRunWaitService } from '../generation/run-wait-service.ts'
import { WorkbenchError } from '../../workbench/validation.ts'
import type {} from '../core/plugin.ts'
import type {} from '../image-reader/plugin.ts'
import type {} from './plugin.ts'

export const name = 'harness-comfyui-specialist-tools'
export const inject = ['tools', 'harnessComfyuiCore', 'harnessComfyuiWorkbench', 'workspaceRegistry', 'imageReader', 'jobs']
export const Config = Schema.object({ roleId: Schema.string().required() })

const commands = {
  workbench_run_submit: 'generation.submit',
  workbench_run_media: 'generation.resolve-media',
  workbench_run_inputs: 'generation.run-inputs',
  workbench_workflow_parameters: 'generation.inspect-template-parameters',
  workbench_image_read: 'image.inspect',
} as const

function caller(execution: ToolRunContext): CliExecutionIdentity {
  const session = execution.agent?.session
  const call = session?.snapshotEvents().find(event => event.type === 'tool/call' && String(event.data.callId) === String(execution.rootCallId))
  if (!session?.header.cwd || call?.type !== 'tool/call') throw new WorkbenchError('WORKBENCH_TOOL_IDENTITY_REQUIRED', '请通过当前 Agent 会话调用工作台工具。', 'session_id')
  return { cwd: session.header.cwd, sessionId: String(session.id), turn: call.data.turn, callId: String(execution.callId), rootCallId: String(execution.rootCallId) }
}

export function apply(ctx: Context, config: { roleId: string }): void {
  const role = configuration.roles.find(role => role.id === config.roleId)
  if (!role) throw new TypeError(`Unknown ComfyUI role: ${config.roleId}`)
  const core = ctx.harnessComfyuiCore.services
  const wait = role.nativeTools.includes('workbench_run_submit') ? new GenerationRunWaitService({
    runtime: core.runtime, jobs: ctx.jobs, pollIntervalMs: core.profile.jobs.pollIntervalMs,
  }) : undefined
  if (wait) {
    ctx.jobs.attachController('comfyui-specialist-generation')
    ctx.effect(() => () => wait.close(), 'Specialist generation observation')
  }

  registerPromptTools(ctx, role)

  for (const [toolName, command] of Object.entries(commands)) {
    if (!role.nativeTools.includes(toolName)) continue
    ctx.tools.register(contracts.bind(toolName as keyof typeof commands, 'native', {
      assertSchema: assertSupportedJsonSchema,
      async execute(args, execution: ToolRunContext) {
        execution.signal.throwIfAborted()
        const request = contracts.parse('cliRequest', 'input', { ...args as Record<string, unknown>, command })
        const identity = caller(execution)
        const result = await dispatch({
          workbench: ctx.harnessComfyuiWorkbench.service, runtime: core.runtime, imageReader: ctx.imageReader,
          workspaceRegistry: ctx.workspaceRegistry,

        }, identity, request, execution.signal)
        if (request.command !== 'generation.submit') return result
        const accepted = result as { items: { run_id: string }[] }
        const completion = await wait!.register(identity, accepted.items.map(item => item.run_id), execution.signal)
        const owner = identity.sessionId as Parameters<typeof ctx.jobs.wait>[2]
        const jobId = completion.job_id as Parameters<typeof ctx.jobs.wait>[0]
        try {
          let observation = await ctx.jobs.wait(jobId, configuration.generationWait.timeoutMs, owner, execution.signal)
          while (observation.status === 'running' || observation.status === 'stopping') {
            observation = await ctx.jobs.wait(jobId, configuration.generationWait.timeoutMs, owner, execution.signal)
          }
          if (observation.status !== 'completed') throw new Error(observation.detail ?? configuration.generationWait.failureMessage)
          const media = await core.runtime.readGenerationRunMedia({ runIds: completion.run_ids }, execution.signal)
          ctx.jobs.remove(jobId, owner)
          return { ...accepted, ...media }
        } catch (error) {
          ctx.jobs.kill(jobId, owner)
          throw error
        }
      },
    }))
  }
}

function registerPromptTools(ctx: Context, role: typeof configuration.roles[number]): void {
  const handlers = {
    workbench_file_read: { async execute(args: Record<string, unknown>, execution: ToolRunContext) {
      const path = resolve(caller(execution).cwd, args.file_path as string)
      const offset = args.offset as number, limit = args.limit as number
      if ((await stat(path)).isDirectory()) {
        const entries = (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
        return { file_path: path, entries: entries.slice(offset, offset + limit).map(entry => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' })), total_entries: entries.length, next_offset: offset + limit < entries.length ? offset + limit : null }
      }
      const lines = (await readFile(path, { encoding: 'utf8', signal: execution.signal })).split('\n')
      const entries = lines.map((text, line) => ({ line, text })).filter(entry => args.search === undefined || entry.text.includes(args.search as string))
      return { file_path: path, offset, total_lines: lines.length, text: entries.slice(offset, offset + limit).map(entry => entry.text).join('\n'), ...(args.search === undefined ? {} : { matches: entries.slice(offset, offset + limit) }), next_offset: offset + limit < entries.length ? offset + limit : null }
    } },
    workbench_file_write: { async execute(args: Record<string, unknown>, execution: ToolRunContext) {
      const path = resolve(caller(execution).cwd, args.file_path as string)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, args.content as string, { encoding: 'utf8', signal: execution.signal })
      return { file_path: path }
    } },
    workbench_prompt_validate: { async execute(args: Record<string, unknown>, execution: ToolRunContext) {
      const skill = args.skill_name as keyof typeof configuration.promptValidators
      const validator = configuration.promptValidators[skill]
      if (!validator || !role.skills.some(candidate => candidate.name === skill)) throw new TypeError(`skill_name 无效，请选择当前预设支持的提示词校验器：${role.skills.filter(candidate => Object.hasOwn(configuration.promptValidators, candidate.name)).map(candidate => candidate.name).join('、')}。`)
      const mode = args.mode as string | undefined
      const modes: string[] = 'helpConfig' in validator
        ? Object.keys(JSON.parse(await readFile(repositoryResource(`.agents/skills/${skill}/${validator.helpConfig}`), 'utf8')).modes).filter(Boolean)
        : validator.modes
      if (mode !== undefined && !modes.includes(mode)) throw new TypeError(`请选择校验模式：${modes.join('、')}。`)
      const script = repositoryResource(`.agents/skills/${skill}/${validator.script}`)
      const directory = await mkdtemp(resolve(tmpdir(), 'comfyui-prompt-'))
      const draftPath = resolve(directory, 'draft.json')
      const outputPath = resolve(directory, 'prompt.txt')
      if (!args.help && args.input !== undefined) await writeFile(draftPath, JSON.stringify(args.input), { signal: execution.signal })
      const argv = validator.runtime === 'node' ? ['--expose-internals', script, ...(mode ? [mode] : []), ...(args.help ? ['--help'] : ['--quiet'])]
        : [script, ...(args.help ? ['--help'] : ['-', '--output', outputPath])]
      const result = await runValidator(validator.runtime === 'node' ? process.execPath : validator.runtime, argv, args.input, execution.signal)
      const value = !args.help && result.exit_code === 0 ? validator.runtime === 'node'
        ? JSON.parse(result.stdout) as unknown : await readFile(outputPath, 'utf8') : null
      return { ...result, result: value, draft_path: args.input === undefined ? null : draftPath, output_path: validator.runtime === 'python3' && !args.help && result.exit_code === 0 ? outputPath : null }
    } },
  }
  for (const [toolName, handler] of Object.entries(handlers)) {
    if (!role.nativeTools.includes(toolName)) continue
    ctx.tools.register(contracts.bind(toolName as keyof typeof handlers, 'native', {
      assertSchema: assertSupportedJsonSchema,
      async execute(args, execution: ToolRunContext) {
        execution.signal.throwIfAborted()
        return handler.execute(args as Record<string, unknown>, execution)
      },
    }))
  }
}

function runValidator(executable: string, argv: string[], input: unknown, signal: AbortSignal): Promise<{ exit_code: number; stdout: string; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(executable, argv, { signal, env: nodeScriptEnvironment(executable), stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.stdin.on('error', reject)
    child.on('close', code => code === null ? reject(new Error('提示词校验进程已中断，请重新校验。')) : resolveResult({ exit_code: code, stdout, stderr }))
    child.stdin.end(input === undefined ? '' : JSON.stringify(input))
  })
}
