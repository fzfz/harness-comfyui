import { builtinModules } from 'node:module'
import { basename, dirname, extname, join, resolve } from 'node:path'

import { build } from 'tsdown'

import runtimeArtifacts from '../../config/runtime-artifacts.json' with { type: 'json' }

const packageImport = /^(?:@[^/]+\/)?[^./][^/]*(?:\/.*)?$/u

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

function relativeOutput(outputRoot, artifactPath) {
  return resolve(outputRoot, artifactPath)
}

export function hostModulePath(outputRoot) {
  const corePath = runtimeArtifacts.hostPlugins.core.outputEntryRelativePath
  return relativeOutput(outputRoot, join(dirname(corePath), 'index.js'))
}

export function hostWorkerModulePath(outputRoot) {
  return relativeOutput(outputRoot, runtimeArtifacts.frontendCompilerWorker.outputEntryRelativePath)
}

export async function materializeHostModule(repositoryRoot, options = {}) {
  const sourceRoot = resolve(repositoryRoot)
  const outputRoot = resolve(options.outputRoot ?? sourceRoot)
  const hostEntries = Object.entries(runtimeArtifacts.hostPlugins)
  const outputs = hostEntries.map(([, artifact]) => relativeOutput(outputRoot, artifact.outputEntryRelativePath))
  outputs.push(hostWorkerModulePath(outputRoot))
  const outputDirectory = dirname(outputs[0])
  if (outputs.some(output => dirname(output) !== outputDirectory)) {
    throw new Error('Configured Host artifacts must share one output directory')
  }

  const entries = {
    index: resolve(sourceRoot, 'src/index.ts'),
    ...Object.fromEntries(hostEntries.map(([name, artifact]) => {
      const output = relativeOutput(outputRoot, artifact.outputEntryRelativePath)
      return [basename(output, extname(output)), resolve(sourceRoot, artifact.sourceEntryRelativePath)]
    })),
    [basename(hostWorkerModulePath(outputRoot), extname(hostWorkerModulePath(outputRoot)))]: resolve(
      sourceRoot,
      runtimeArtifacts.frontendCompilerWorker.sourceEntryRelativePath,
    ),
  }

  await build({
    config: false,
    logLevel: 'silent',
    entry: entries,
    outDir: outputDirectory,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    sourcemap: false,
    clean: true,
    dts: false,
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    plugins: [hostImportPolicy],
  })
  return hostModulePath(outputRoot)
}
