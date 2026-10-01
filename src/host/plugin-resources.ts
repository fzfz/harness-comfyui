import { accessSync, constants, lstatSync, type Stats } from 'node:fs'

import errorCatalog from '../../config/error-catalog.json' with { type: 'json' }
import runtimeArtifacts from '../../config/runtime-artifacts.json' with { type: 'json' }
import pluginRuntimeResources from '../../config/plugin-runtime-resources.json' with { type: 'json' }
import { parsePluginRuntimeResources } from '../../config/plugin-runtime-resources-schema.ts'
import { repositoryResource } from './resource-path.ts'

const configuration = parsePluginRuntimeResources(pluginRuntimeResources)

export interface PluginRuntimeResourcePaths {
  readonly semanticQueryClient: string
  readonly sourceReadClient: string
  readonly frontendCompilerWorker: string
  readonly managedCli: string
}

export interface PluginRuntimeResourceFailure {
  readonly resource: string
  readonly path: string
  readonly reason: string
  readonly cause: unknown
}

export interface PluginRuntimeResourceFileSystem {
  lstatSync(path: string): Pick<Stats, 'isFile'>
  accessSync(path: string, mode: number): void
}

export interface PluginRuntimeResourceValidationOptions {
  readonly resolvePath?: (relativePath: string) => string
  readonly fileSystem?: PluginRuntimeResourceFileSystem
}

export const PLUGIN_RUNTIME_RESOURCE_PATHS = Object.freeze({
  semanticQueryClient: configuration.sourceClients.semanticQueryClient.relativePath,
  sourceReadClient: configuration.sourceClients.sourceReadClient.relativePath,
  frontendCompilerWorker: runtimeArtifacts[configuration.runtimeArtifacts.frontendCompilerWorker.artifactKey]
    .outputEntryRelativePath,
  managedCli: runtimeArtifacts[configuration.runtimeArtifacts.managedCli.artifactKey].outputEntryRelativePath,
})

const resourceLabels = Object.freeze({
  semanticQueryClient: configuration.sourceClients.semanticQueryClient.label,
  sourceReadClient: configuration.sourceClients.sourceReadClient.label,
  frontendCompilerWorker: configuration.runtimeArtifacts.frontendCompilerWorker.label,
  managedCli: configuration.runtimeArtifacts.managedCli.label,
})

const defaultFileSystem: PluginRuntimeResourceFileSystem = { lstatSync, accessSync }

export function resolvePluginRuntimeResourcePaths(
  resolvePath: (relativePath: string) => string = repositoryResource,
): PluginRuntimeResourcePaths {
  return Object.freeze(Object.fromEntries(
    Object.entries(PLUGIN_RUNTIME_RESOURCE_PATHS).map(([key, path]) => [key, resolvePath(path)]),
  ) as unknown as PluginRuntimeResourcePaths)
}

function systemReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class PluginRuntimeResourcesUnavailableError extends Error {
  readonly code = errorCatalog.PLUGIN_PACKAGE_RESOURCES_UNAVAILABLE.code
  readonly detail: string
  readonly failures: readonly PluginRuntimeResourceFailure[]

  constructor(failures: readonly PluginRuntimeResourceFailure[]) {
    const resources = failures.map(failure => `${failure.resource}: ${failure.path} — ${failure.reason}`).join('\n')
    const detail = configuration.failureDetailsTemplate.replace(/\{resources\}/gu, () => resources)
    const entry = errorCatalog.PLUGIN_PACKAGE_RESOURCES_UNAVAILABLE
    super(`${entry.title}：${entry.reason} ${entry.next_step}\n${detail}`, {
      cause: new AggregateError(failures.map(failure => failure.cause), entry.title),
    })
    this.name = 'PluginRuntimeResourcesUnavailableError'
    this.detail = detail
    this.failures = failures
  }
}

export function assertPluginRuntimeResourcesAvailable(
  options: PluginRuntimeResourceValidationOptions = {},
): PluginRuntimeResourcePaths {
  const resolvePath = options.resolvePath ?? repositoryResource
  const paths = resolvePluginRuntimeResourcePaths(resolvePath)
  const fileSystem = options.fileSystem ?? defaultFileSystem
  const failures: PluginRuntimeResourceFailure[] = []
  const requiredResources = [
    ...(Object.keys(paths) as (keyof PluginRuntimeResourcePaths)[]).map(key => ({
      resource: resourceLabels[key],
      path: paths[key],
    })),
    ...configuration.requiredFiles.map(path => ({
      resource: 'Preset or Skill package resource',
      path: resolvePath(path),
    })),
  ]

  for (const { resource, path } of requiredResources) {
    try {
      const details = fileSystem.lstatSync(path)
      if (!details.isFile()) {
        const cause = new TypeError('resource path is not a regular file')
        failures.push({ resource, path, reason: cause.message, cause })
        continue
      }
      fileSystem.accessSync(path, constants.R_OK)
    } catch (cause) {
      failures.push({ resource, path, reason: systemReason(cause), cause })
    }
  }

  if (failures.length > 0) throw new PluginRuntimeResourcesUnavailableError(failures)
  return paths
}
