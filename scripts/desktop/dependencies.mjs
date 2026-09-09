#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadDesktopBaseline } from './baseline.mjs'
import { prepareDesktopDependencyView } from './dependency-view.mjs'

const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export async function loadDesktopHarnessDevelopmentDependencies(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot)
  let mainCheckoutRoot = options.mainCheckoutRoot
  if (mainCheckoutRoot === undefined) {
    const worktreeDefinitionPath = resolve(options.worktreeDefinitionPath
      ?? resolve(repositoryRoot, 'config/desktop-worktree.json'))
    const definition = JSON.parse(await readFile(worktreeDefinitionPath, 'utf8'))
    mainCheckoutRoot = definition.mainCheckoutPath
  }
  mainCheckoutRoot = resolve(mainCheckoutRoot)
  let desktopWorkspace = options.desktopWorkspace
  if (desktopWorkspace === undefined) {
    const baseline = options.baseline ?? await loadDesktopBaseline({
      repositoryRoot,
      desktopSourceRoot: mainCheckoutRoot,
      ...(options.baselineDefinitionPath === undefined ? {} : { definitionPath: options.baselineDefinitionPath }),
    })
    desktopWorkspace = baseline.desktopWorkspace
  }
  return {
    ...options,
    repositoryRoot,
    mainCheckoutRoot,
    desktopWorkspace: resolve(desktopWorkspace),
    definitionPath: resolve(options.definitionPath ?? resolve(repositoryRoot, 'config/desktop-harness-development.json')),
    rootManifestPath: resolve(options.rootManifestPath ?? resolve(repositoryRoot, 'package.json')),
  }
}

export async function prepareDesktopDependencies(options = {}) {
  return prepareDesktopDependencyView(await loadDesktopHarnessDevelopmentDependencies(options))
}

export async function main() {
  const result = await prepareDesktopDependencies()
  process.stdout.write(`${JSON.stringify({
    nodeModulesDir: result.nodeModulesDir,
    desktopWorkspace: result.desktopWorkspace,
    mainPackages: result.mainPackages.length,
    candidatePackages: result.candidatePackages.length,
    mainExecutables: result.mainExecutables.length,
    candidateExecutables: result.candidateExecutables.length,
    changed: result.changed,
  })}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`desktop dependencies: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
