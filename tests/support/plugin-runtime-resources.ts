import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import packageResources from '../../config/plugin-runtime-resources.json' with { type: 'json' }
import { PLUGIN_RUNTIME_RESOURCE_PATHS } from '../../src/host/plugin-resources.ts'
import { materializeHostModule } from '../../scripts/build/host-module.mjs'
import { materializeManagedCliModuleFromSources } from '../../scripts/build/cli-module.mjs'

export async function materializeTestPluginResources(options: {
  repositoryRoot?: string
  omitResource?: keyof typeof PLUGIN_RUNTIME_RESOURCE_PATHS
  omitRequiredFile?: string
} = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? fileURLToPath(new URL('../..', import.meta.url)))
  const packageRoot = await mkdtemp(join(repositoryRoot, '.host-module-test-'))
  const resource = (relativePath: string) => resolve(packageRoot, relativePath)
  const dispose = () => rm(packageRoot, { recursive: true, force: true })
  try {
    const entry = await materializeHostModule(repositoryRoot, { outputRoot: packageRoot })
    await materializeManagedCliModuleFromSources(repositoryRoot, packageRoot)
    if (options.omitResource) await rm(resource(PLUGIN_RUNTIME_RESOURCE_PATHS[options.omitResource]))
    for (const path of packageResources.requiredFiles) {
      if (path === options.omitRequiredFile) continue
      const destination = resource(path)
      await mkdir(dirname(destination), { recursive: true })
      await copyFile(resolve(repositoryRoot, path), destination)
    }
    return { entry, packageRoot, resource, dispose }
  } catch (error) {
    await dispose()
    throw error
  }
}
