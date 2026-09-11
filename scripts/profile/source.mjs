import { constants as fsConstants } from 'node:fs'
import { access, copyFile, lstat, mkdir, readFile, readlink, stat, symlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'

const PROFILE_FILES = Object.freeze(['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml'])

function requireRecord(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`)
  }
  return value
}

function requireProfileName(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]*$/u.test(value)) {
    throw new TypeError('source Profile name must contain only lowercase letters, numbers, and hyphens')
  }
  return value
}

async function validateUserEnvironmentFile(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) {
    throw new TypeError('source Profile user environment file must be an absolute path')
  }
  let stats
  try {
    stats = await stat(path)
    await access(path, fsConstants.R_OK)
  } catch (error) {
    throw new Error(
      `source Profile user environment file is unavailable at ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
  if (!stats.isFile()) throw new Error(`source Profile user environment file must be a regular file: ${path}`)
  return resolve(path)
}

async function ensureUserEnvironmentLink(dshHome, userEnvironmentFilePath) {
  const linkPath = resolve(dshHome, '.env')
  try {
    const stats = await lstat(linkPath)
    if (!stats.isSymbolicLink()) {
      throw new Error(`${linkPath} must be a symbolic link to ${userEnvironmentFilePath}`)
    }
    const target = resolve(dirname(linkPath), await readlink(linkPath))
    if (target !== userEnvironmentFilePath) {
      throw new Error(`${linkPath} must be a symbolic link to ${userEnvironmentFilePath}; it points to ${target}`)
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    await mkdir(dshHome, { recursive: true })
    await symlink(userEnvironmentFilePath, linkPath, 'file')
  }
  return linkPath
}

async function ensureSourcePackageLink(profileDirectory, repositoryRoot) {
  const nodeModules = resolve(profileDirectory, 'node_modules')
  const linkPath = resolve(nodeModules, 'harness-comfyui')
  await mkdir(nodeModules, { recursive: true })
  try {
    const stats = await lstat(linkPath)
    if (!stats.isSymbolicLink()) throw new Error(`${linkPath} must be a symbolic link to the current source repository`)
    const target = resolve(dirname(linkPath), await readlink(linkPath))
    if (target !== repositoryRoot) throw new Error(`${linkPath} points to ${target} instead of ${repositoryRoot}`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    await symlink(repositoryRoot, linkPath, 'dir')
  }
}

export async function materializeSourceProfile(repositoryRoot, dshHome, options) {
  const sourceRoot = resolve(repositoryRoot)
  const profileName = requireProfileName(options?.profileName)
  const userEnvironmentFilePath = options?.userEnvironmentFilePath === undefined
    ? undefined
    : await validateUserEnvironmentFile(options.userEnvironmentFilePath)
  const templateDirectory = resolve(sourceRoot, 'profiles', profileName)
  const profileDirectory = resolve(dshHome, 'profiles', profileName)
  const environmentLink = userEnvironmentFilePath === undefined
    ? undefined
    : await ensureUserEnvironmentLink(resolve(dshHome), userEnvironmentFilePath)
  await mkdir(profileDirectory, { recursive: true })
  for (const filename of PROFILE_FILES) {
    await copyFile(resolve(templateDirectory, filename), resolve(profileDirectory, filename))
  }
  const manifestPath = resolve(profileDirectory, 'package.json')
  const manifest = requireRecord(JSON.parse(await readFile(manifestPath, 'utf8')), 'source profile manifest')
  manifest.dependencies = { ...manifest.dependencies, 'harness-comfyui': `file:${sourceRoot}` }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await ensureSourcePackageLink(profileDirectory, sourceRoot)
  return {
    profileDirectory,
    packageLink: resolve(profileDirectory, 'node_modules/harness-comfyui'),
    ...(environmentLink === undefined ? {} : { environmentLink }),
  }
}
