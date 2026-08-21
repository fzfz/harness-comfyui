#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const runtimeDependencies = [
  '@deepseek-ai/dsh',
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
]

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function readRuntimeDependencies(rootManifest) {
  const dependencies = {}
  for (const name of runtimeDependencies) {
    const version = rootManifest.devDependencies?.[name]
    if (typeof version !== 'string' || version.length === 0) {
      throw new Error(`package.json.devDependencies.${name} must be a non-empty version`)
    }
    dependencies[name] = version
  }
  return dependencies
}

export async function syncRuntimeManifest(root = repositoryRoot) {
  const resolvedRoot = resolve(root)
  const rootManifest = await readJson(resolve(resolvedRoot, 'package.json'))
  const dependencies = readRuntimeDependencies(rootManifest)
  const rootWorkspace = await readFile(resolve(resolvedRoot, 'pnpm-workspace.yaml'), 'utf8')
  const outputDirectory = resolve(resolvedRoot, 'deployment/runtime')
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(resolve(outputDirectory, 'package.json'), `${JSON.stringify({
    name: 'harness-comfyui-runtime',
    private: true,
    dependencies,
  }, null, 2)}\n`, 'utf8')
  await writeFile(resolve(outputDirectory, 'pnpm-workspace.yaml'), rootWorkspace, 'utf8')
  return { directory: outputDirectory, dependencies }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncRuntimeManifest().then(
    result => process.stdout.write(`runtime manifest synchronized: ${result.directory}\n`),
    error => {
      process.stderr.write(`runtime manifest synchronization failed: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    },
  )
}
