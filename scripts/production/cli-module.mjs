import { basename, dirname, extname, resolve } from 'node:path'

import { build } from 'tsdown'

import runtimeArtifacts from '../../config/runtime-artifacts.json' with { type: 'json' }

export function sourceCliModulePath(repositoryRoot) {
  return resolve(repositoryRoot, runtimeArtifacts.managedCli.outputEntryRelativePath)
}

export async function materializeCliModule(options) {
  const entry = resolve(options.entry)
  const output = resolve(options.output)
  const outputExtension = extname(output)
  const outputName = basename(output, outputExtension)
  await build({
    config: false,
    logLevel: 'silent',
    entry: { [outputName]: entry },
    outDir: dirname(output),
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: true,
    clean: false,
    dts: false,
    outExtensions: () => ({ js: outputExtension, dts: '.d.mts' }),
  })
  return output
}

export async function materializeSourceCliModule(repositoryRoot) {
  const sourceRoot = resolve(repositoryRoot)
  return materializeCliModule({
    entry: resolve(sourceRoot, runtimeArtifacts.managedCli.sourceEntryRelativePath),
    output: sourceCliModulePath(sourceRoot),
  })
}
