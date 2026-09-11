import { builtinModules } from 'node:module'
import { dirname, resolve } from 'node:path'

import { build } from 'tsdown'

import runtimeArtifacts from '../../config/runtime-artifacts.json' with { type: 'json' }

const packageImport = /^(?:@[^/]+\/)?[^./][^/]*(?:\/.*)?$/u

export const HOST_MODULE_POLICY = Object.freeze({
  external: Object.freeze([
    /^@deepseek-ai\//u,
  ]),
})

function isExternalPackageImport(specifier) {
  return packageImport.test(specifier)
    && !builtinModules.includes(specifier)
    && !specifier.startsWith('node:')
}

const hostImportPolicy = {
  name: 'harness-comfyui-host-import-policy',
  resolveId(specifier) {
    if (isExternalPackageImport(specifier)) return { id: specifier, external: true }
    return undefined
  },
}

export function sourceHostModulePath(repositoryRoot) {
  return resolve(repositoryRoot, '.local/source-host/index.js')
}

export function sourceHostWorkerModulePath(repositoryRoot) {
  return resolve(repositoryRoot, runtimeArtifacts.frontendCompilerWorker.outputEntryRelativePath)
}

export async function materializeSourceHostModule(repositoryRoot, options = {}) {
  const sourceRoot = resolve(repositoryRoot)
  const outputRoot = resolve(options.outputRoot ?? sourceRoot)
  const output = sourceHostModulePath(outputRoot)
  await build({
    config: false,
    logLevel: 'silent',
    entry: {
      ...(options.web === false ? {} : { index: resolve(sourceRoot, 'src/index.ts') }),
      ...Object.fromEntries(Object.entries(runtimeArtifacts.hostPlugins)
        .filter(([name]) => options.web !== false || name !== 'web')
        .map(([name, artifact]) => [name, resolve(sourceRoot, artifact.sourceEntryRelativePath)])),
      'comfy-frontend-worker': resolve(
        sourceRoot,
        runtimeArtifacts.frontendCompilerWorker.sourceEntryRelativePath,
      ),
    },
    outDir: dirname(output),
    format: 'esm',
    platform: 'node',
    target: 'node24',
    sourcemap: true,
    clean: true,
    dts: false,
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    plugins: [hostImportPolicy],
  })
  return options.web === false ? resolve(dirname(output), 'core.js') : output
}
