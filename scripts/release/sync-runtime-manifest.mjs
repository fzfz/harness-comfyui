#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deepStrictEqual } from 'node:assert/strict'

import {
  RUNTIME_DEPENDENCY_POLICY,
  readPnpmPackageManagerVersion,
} from '../deploy/runtime-contract.mjs'
import { readWorkspacePolicy } from '../security/check-manifest-lock.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`could not read ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function readRuntimeDependencies(rootManifest) {
  const dependencies = {}
  for (const name of RUNTIME_DEPENDENCY_POLICY.packages) {
    const version = rootManifest.devDependencies?.[name]
    if (typeof version !== 'string' || version.length === 0) {
      throw new Error(`package.json.devDependencies.${name} must be a non-empty version`)
    }
    dependencies[name] = version
  }
  return dependencies
}

async function buildRuntimeFiles(root) {
  const resolvedRoot = resolve(root)
  const rootManifest = await readJson(resolve(resolvedRoot, 'package.json'), 'package.json')
  const packageManagerVersion = readPnpmPackageManagerVersion(rootManifest, 'package.json')
  const dependencies = readRuntimeDependencies(rootManifest)
  let rootPolicy
  try {
    rootPolicy = readWorkspacePolicy(resolvedRoot)
    deepStrictEqual(rootPolicy, RUNTIME_DEPENDENCY_POLICY.workspace)
  } catch (error) {
    throw new Error(`pnpm-workspace.yaml policy differs from the runtime contract: ${error instanceof Error ? error.message : String(error)}`)
  }
  let workspace
  try {
    workspace = await readFile(resolve(resolvedRoot, 'pnpm-workspace.yaml'), 'utf8')
  } catch (error) {
    throw new Error(`could not read pnpm-workspace.yaml: ${error instanceof Error ? error.message : String(error)}`)
  }
  const packageText = `${JSON.stringify({
    name: 'harness-comfyui-runtime',
    private: true,
    packageManager: `pnpm@${packageManagerVersion}`,
    dependencies,
  }, null, 2)}\n`
  return {
    directory: resolve(resolvedRoot, 'deployment/runtime'),
    packageText,
    workspaceText: workspace,
    dependencies,
    packageManagerVersion,
  }
}

export async function syncRuntimeManifest(root = repositoryRoot) {
  const files = await buildRuntimeFiles(root)
  await mkdir(files.directory, { recursive: true })
  await writeFile(resolve(files.directory, 'package.json'), files.packageText, 'utf8')
  await writeFile(resolve(files.directory, 'pnpm-workspace.yaml'), files.workspaceText, 'utf8')
  return {
    directory: files.directory,
    dependencies: files.dependencies,
    packageManagerVersion: files.packageManagerVersion,
  }
}

export async function checkRuntimeManifest(root = repositoryRoot) {
  const files = await buildRuntimeFiles(root)
  const packagePath = resolve(files.directory, 'package.json')
  const workspacePath = resolve(files.directory, 'pnpm-workspace.yaml')
  let packageText
  let workspaceText
  try {
    packageText = await readFile(packagePath, 'utf8')
    workspaceText = await readFile(workspacePath, 'utf8')
  } catch (error) {
    throw new Error(`runtime manifest is stale: ${error instanceof Error ? error.message : String(error)}`)
  }
  const staleFiles = []
  if (packageText !== files.packageText) staleFiles.push('deployment/runtime/package.json')
  if (workspaceText !== files.workspaceText) staleFiles.push('deployment/runtime/pnpm-workspace.yaml')
  if (staleFiles.length > 0) throw new Error(`runtime manifest is stale: ${staleFiles.join(', ')}`)
  return {
    current: true,
    directory: files.directory,
    dependencies: files.dependencies,
    packageManagerVersion: files.packageManagerVersion,
  }
}

function parseArguments(argv) {
  let root = repositoryRoot
  let rootProvided = false
  let check = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--check') {
      if (check) throw new Error('duplicate option: --check')
      check = true
      continue
    }
    if (argument === '--root') {
      if (rootProvided) throw new Error('duplicate option: --root')
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--') || value.length === 0) throw new Error('--root requires a non-empty value')
      root = resolve(value)
      rootProvided = true
      index += 1
      continue
    }
    throw new Error(`unknown option: ${argument}`)
  }
  return { root, check }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv)
  if (options.check) {
    await checkRuntimeManifest(options.root)
    process.stdout.write(`runtime manifest is current: ${resolve(options.root, 'deployment/runtime')}\n`)
    return 0
  }
  const result = await syncRuntimeManifest(options.root)
  process.stdout.write(`runtime manifest synchronized: ${result.directory}\n`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    status => { process.exitCode = status },
    error => {
      process.stderr.write(`runtime manifest synchronization failed: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    },
  )
}
