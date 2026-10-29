import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-jobs'
import { GenerationRunWaitService } from '../generation/run-wait-service.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import runtimeArtifacts from '../../../config/runtime-artifacts.json' with { type: 'json' }
import { CLI_ROUTE_PATH } from '../../cli/contract.ts'
import type { } from '../core/plugin.ts'
import type { } from '../image-reader/plugin.ts'
import { repositoryResource } from '../resource-path.ts'
import { createCliHandler } from './route.ts'
import { startCliServer } from './server.ts'
import { CLI_ENVIRONMENT_VARIABLES, CliShellCapabilityStore } from './shell-capability.ts'

export const name = 'harness-comfyui-cli'
export const inject = ['harnessComfyuiCore', 'imageReader', 'shellEnv', 'tools', 'workspaceRegistry', 'jobs'] as const

export async function apply(ctx: Context): Promise<void> {
  const core = ctx.harnessComfyuiCore.services
  const runWait = new GenerationRunWaitService({ runtime: core.runtime, jobs: ctx.jobs, pollIntervalMs: core.profile.jobs.pollIntervalMs })
  let capabilities: CliShellCapabilityStore
  const server = await startCliServer(origin => {
    capabilities = new CliShellCapabilityStore({
      cliPath: repositoryResource(runtimeArtifacts.managedCli.outputEntryRelativePath),
      nodeExecutable: process.execPath,
      apiUrl: `${origin}${CLI_ROUTE_PATH}`,
    })
    return createCliHandler({ capabilities, runWait, runtime: core.runtime, imageReader: ctx.imageReader, workspaceRegistry: ctx.workspaceRegistry })
  }, core.profile.cliServer)
  ctx.effect(() => async () => { capabilities.clear(); await Promise.all([server.close(), runWait.close()]) }, 'Managed CLI listener')
  ctx.effect(() => {
    const shellEnv = (ctx as unknown as { shellEnv: { register(contributor: { name: string; variables: typeof CLI_ENVIRONMENT_VARIABLES; resolve(execution: ToolExecution): Readonly<Record<string, string>> }): () => void } }).shellEnv
    return shellEnv.register({ name: 'harness-comfyui-cli', variables: CLI_ENVIRONMENT_VARIABLES, resolve: execution => capabilities.environment(execution) })
  }, 'Managed CLI environment')
  ctx.on('tools/result', execution => { capabilities.revoke(execution) })
  ctx.provide('harnessComfyuiCli', { origin: server.origin })
}

declare module '@deepseek-ai/cordis' { interface Context { harnessComfyuiCli: { readonly origin: string } } }
