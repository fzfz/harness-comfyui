import { lstat, readFile, readlink, stat, symlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadDesktopBaseline } from './baseline.mjs'
import { prepareDesktopDependencies } from './dependencies.mjs'

const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

async function requirePath(path, expectedType, label) {
  let value
  try {
    value = await stat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`${label} is unavailable: ${path}`)
    throw error
  }
  if (expectedType === 'file' ? !value.isFile() : !value.isDirectory()) {
    throw new Error(`${label} must be a ${expectedType}: ${path}`)
  }
}

async function ensureLink(target, source, type) {
  try {
    const value = await lstat(target)
    if (!value.isSymbolicLink()) throw new Error(`development checkout path must be a symbolic link: ${target}`)
    const actualSource = resolve(dirname(target), await readlink(target))
    if (actualSource !== source) {
      throw new Error(`development checkout link must point to ${source}: ${target}`)
    }
    return
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  await symlink(source, target, type)
}

export async function prepareDesktopDevelopmentCheckout(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot)
  const definitionPath = resolve(options.definitionPath ?? resolve(repositoryRoot, 'config/desktop-worktree.json'))
  const definition = JSON.parse(await readFile(definitionPath, 'utf8'))
  const mainCheckoutPath = resolve(definition.mainCheckoutPath)
  const gitMetadataPath = resolve(repositoryRoot, '.git')
  let gitMetadata
  try {
    gitMetadata = await lstat(gitMetadataPath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`development checkout must be an independent linked git worktree: ${gitMetadataPath}`)
    }
    throw error
  }
  if (!gitMetadata.isFile()) {
    throw new Error(`development checkout must be an independent linked git worktree: ${gitMetadataPath}`)
  }

  const environmentSource = resolve(mainCheckoutPath, '.env')
  const dependenciesSource = resolve(mainCheckoutPath, 'node_modules')
  await requirePath(environmentSource, 'file', 'main checkout .env')
  await requirePath(dependenciesSource, 'directory', 'main checkout node_modules')
  await ensureLink(resolve(repositoryRoot, '.env'), environmentSource, 'file')
  const baseline = await (options.loadDesktopBaseline ?? loadDesktopBaseline)({
    repositoryRoot,
    desktopSourceRoot: mainCheckoutPath,
    ...(options.baselineDefinitionPath === undefined ? {} : { definitionPath: options.baselineDefinitionPath }),
  })
  const dependencyView = await (options.prepareDesktopDependencies ?? prepareDesktopDependencies)({
    repositoryRoot,
    mainCheckoutRoot: mainCheckoutPath,
    desktopWorkspace: baseline.desktopWorkspace,
  })
  return { definition, environmentSource, dependenciesSource, dependencyView, baseline, mainCheckoutPath }
}
