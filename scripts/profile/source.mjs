import { copyFile, lstat, mkdir, readFile, readlink, symlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const PROFILE_FILES = Object.freeze(['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml'])

function requireRecord(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`)
  }
  return value
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

export async function materializeSourceProfile(repositoryRoot, dshHome) {
  const sourceRoot = resolve(repositoryRoot)
  const templateDirectory = resolve(sourceRoot, 'profiles/comfyui-workbench')
  const profileDirectory = resolve(dshHome, 'profiles/comfyui-workbench')
  await mkdir(profileDirectory, { recursive: true })
  for (const filename of PROFILE_FILES) {
    await copyFile(resolve(templateDirectory, filename), resolve(profileDirectory, filename))
  }
  const manifestPath = resolve(profileDirectory, 'package.json')
  const manifest = requireRecord(JSON.parse(await readFile(manifestPath, 'utf8')), 'source profile manifest')
  manifest.dependencies = { 'harness-comfyui': `file:${sourceRoot}` }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await ensureSourcePackageLink(profileDirectory, sourceRoot)
  return { profileDirectory, packageLink: resolve(profileDirectory, 'node_modules/harness-comfyui') }
}
