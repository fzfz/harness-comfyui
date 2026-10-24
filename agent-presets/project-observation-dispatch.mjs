import { apply as registerDispatch } from './project-iteration-dispatch.mjs'
import observationContract from './project-observation.json' with { type: 'json' }

export const name = 'harness-comfyui-observation-dispatch'
export const inject = ['tools', 'subagents', 'harnessComfyuiCore']

/**
 * @param {import('@deepseek-ai/cordis').Context & {harnessComfyuiCore: {services: import('../src/host/core/schema.ts').CoreServices}}} ctx
 * @param {import('./project-iteration-dispatch.mjs').DispatchConfig} config
 */
export function apply(ctx, config) {
  registerDispatch(ctx, config, async (args, exec) => {
    const observation = /** @type {{mode: 'initial'} | {mode: 'supplement', missing_facts: string[]}} */ (args.observation)
    if (observation.mode === 'supplement'
      && (observation.missing_facts.length === 0 || observation.missing_facts.some(fact => fact.trim().length === 0))) {
      throw new Error(observationContract.missingFactsError)
    }
    const outputs = /** @type {{path: string}[]} */ (args.output_files)
    return {
      ...args,
      description: observationContract.label,
      output_files: outputs.map(({ path }) => ({ path })),
      observation: observation.mode === 'initial'
        ? { mode: observation.mode, instruction: observationContract.initialInstruction }
        : observation,
      images: await ctx.harnessComfyuiCore.services.resolveObservationMedia(exec, config.toolName, /** @type {import('../src/host/generation/observation-media.ts').ObservationMediaReference[]} */ (args.images)),
    }
  })
}
