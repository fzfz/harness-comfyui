import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import runtimeArtifacts from '../../config/runtime-artifacts.json' with { type: 'json' }
import { materializeClientModuleFromSources } from './client-module.mjs'
import { materializeManagedCliModuleFromSources } from './cli-module.mjs'
import {
  hostModulePath,
  hostWorkerModulePath,
  materializeHostModule,
} from './host-module.mjs'
import { packPlugin } from './package-plugin.mjs'
import { validateProjectAgentPresetResources } from './agent-preset-resources.mjs'

export async function buildPlugin({ repositoryRoot, outputRoot } = {}) {
  const sourceRoot = resolve(repositoryRoot ?? fileURLToPath(new URL('../..', import.meta.url)))
  const targetRoot = resolve(outputRoot ?? sourceRoot)

  await validateProjectAgentPresetResources(sourceRoot)
  await materializeHostModule(sourceRoot, { outputRoot: targetRoot })
  await Promise.all([
    materializeClientModuleFromSources(sourceRoot, targetRoot),
    materializeManagedCliModuleFromSources(sourceRoot, targetRoot),
  ])

  return {
    outputRoot: targetRoot,
    files: [
      hostModulePath(targetRoot),
      ...Object.values(runtimeArtifacts.hostPlugins).map(artifact => resolve(targetRoot, artifact.outputEntryRelativePath)),
      hostWorkerModulePath(targetRoot),
      resolve(targetRoot, runtimeArtifacts.managedCli.outputEntryRelativePath),
      resolve(targetRoot, runtimeArtifacts.client.outputEntryRelativePath),
    ],
  }
}

export { packPlugin }
