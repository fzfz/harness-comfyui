import { builtinModules } from 'node:module'
import { dirname, resolve } from 'node:path'

import { build } from 'tsdown'

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

export async function materializeSourceHostModule(repositoryRoot) {
  const sourceRoot = resolve(repositoryRoot)
  const output = sourceHostModulePath(sourceRoot)
  await build({
    config: false,
    logLevel: 'silent',
    entry: { index: resolve(sourceRoot, 'src/index.ts') },
    outDir: dirname(output),
    format: 'esm',
    platform: 'node',
    target: 'node24',
    sourcemap: true,
    clean: false,
    dts: false,
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    plugins: [hostImportPolicy],
  })
  return output
}
