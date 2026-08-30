#!/usr/bin/env node

import { lstat, mkdir, readFile, rm, symlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

async function pathExists(path, expectedType) {
  try {
    const stat = await lstat(path)
    return expectedType === 'directory' ? stat.isDirectory() : stat.isFile()
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

export async function linkDesktopHarnessDevelopmentDependencies({ repositoryRoot, desktopSource, executables = {}, packages }) {
  const sources = packages.map(name => ({ name, source: resolve(desktopSource, 'node_modules', name) }))
  for (const { name, source } of sources) {
    if (!await pathExists(source, 'directory')) throw new Error(`DSH Desktop dependency ${name} is not installed`)
  }
  const executableSources = Object.entries(executables).map(([name, relativePath]) => ({
    name,
    source: resolve(desktopSource, 'node_modules', relativePath),
  }))
  for (const { name, source } of executableSources) {
    if (!await pathExists(source, 'file')) throw new Error(`DSH Desktop executable ${name} is not installed`)
  }
  for (const { name, source } of sources) {
    const target = resolve(repositoryRoot, 'node_modules', name)
    await mkdir(dirname(target), { recursive: true })
    await rm(target, { recursive: true, force: true })
    await symlink(source, target, 'dir')
  }
  for (const { name, source } of executableSources) {
    const target = resolve(repositoryRoot, 'node_modules/.bin', name)
    await mkdir(dirname(target), { recursive: true })
    await rm(target, { force: true })
    await symlink(source, target, 'file')
  }
  return { linked: sources.length, executables: executableSources.length }
}

export async function loadDesktopHarnessDevelopmentDependencies(repositoryRoot = defaultRepositoryRoot) {
  const desktopDefinition = JSON.parse(await readFile(resolve(repositoryRoot, 'config/desktop-production.json'), 'utf8'))
  const dependencyDefinition = JSON.parse(await readFile(resolve(repositoryRoot, 'config/desktop-harness-development.json'), 'utf8'))
  return {
    repositoryRoot,
    desktopSource: resolve(repositoryRoot, desktopDefinition.desktopSourceRelativePath),
    executables: dependencyDefinition.executables,
    packages: dependencyDefinition.packages,
  }
}

export async function main() {
  const definition = await loadDesktopHarnessDevelopmentDependencies()
  const result = await linkDesktopHarnessDevelopmentDependencies(definition)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`desktop dependencies: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
