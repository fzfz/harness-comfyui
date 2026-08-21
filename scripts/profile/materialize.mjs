import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { homedir } from 'node:os'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sourceProfileDirectory = resolve(repositoryRoot, 'profiles/comfyui-workbench')
const profileName = 'comfyui-workbench'
const profileBundles = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  'harness-comfyui',
]
const configurationProfiles = new Set(['development', 'test', 'release-smoke', 'production'])
const templateFiles = ['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml']
const defaultDshHome = resolve(homedir(), '.dsh')
const defaultProfileManifestPath = resolve(defaultDshHome, 'profiles', profileName, 'package.json')

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!flag.startsWith('--')) throw new Error(`unknown argument ${flag}`)
    if (!['--configuration', '--dsh-home', '--package-spec', '--dsh-executable', '--pnpm-executable'].includes(flag)) {
      throw new Error(`unknown argument ${flag}`)
    }
    if (values.has(flag)) throw new Error(`duplicate argument ${flag}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--') || value.length === 0) throw new Error(`${flag} requires a non-empty value`)
    values.set(flag, value)
    index += 1
  }
  for (const flag of ['--configuration', '--dsh-home', '--package-spec']) {
    if (!values.has(flag)) throw new Error(`missing required argument ${flag}`)
  }
  const configuration = values.get('--configuration')
  if (!configurationProfiles.has(configuration)) {
    throw new Error(`invalid --configuration ${JSON.stringify(configuration)}; expected development, test, release-smoke, or production`)
  }
  return {
    configuration,
    dshHome: values.get('--dsh-home'),
    packageSpec: values.get('--package-spec'),
    dshExecutable: values.get('--dsh-executable'),
    pnpmExecutable: values.get('--pnpm-executable'),
  }
}

function sameList(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index])
}

function materializeProfileFiles(dshHome) {
  const profileDirectory = resolve(dshHome, 'profiles', profileName)
  mkdirSync(profileDirectory, { recursive: true })
  for (const filename of templateFiles) {
    copyFileSync(resolve(sourceProfileDirectory, filename), resolve(profileDirectory, filename))
  }
  return profileDirectory
}

function runPluginInstall(dshHome, packageSpec, { dshExecutable, pnpmExecutable }) {
  if ((dshExecutable === undefined) !== (pnpmExecutable === undefined)) {
    throw new Error('--dsh-executable and --pnpm-executable must be provided together')
  }
  if (dshExecutable !== undefined) {
    const pnpmDirectory = dirname(resolve(pnpmExecutable))
    const result = spawnSync(resolve(dshExecutable), [
      'plugin',
      '--profile',
      profileName,
      'add',
      packageSpec,
    ], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        DSH_HOME: dshHome,
        PATH: `${pnpmDirectory}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
      },
      stdio: 'inherit',
      shell: false,
    })
    if (result.error !== undefined) {
      process.stderr.write(`profile materialize: failed to execute dsh: ${String(result.error)}\n`)
      return 127
    }
    return result.status ?? 1
  }
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const result = spawnSync(command, [
    'exec',
    'dsh',
    'plugin',
    '--profile',
    profileName,
    'add',
    packageSpec,
  ], {
    cwd: repositoryRoot,
    env: { ...process.env, DSH_HOME: dshHome },
    stdio: 'inherit',
    shell: false,
  })
  if (result.error !== undefined) {
    process.stderr.write(`profile materialize: failed to execute pnpm: ${String(result.error)}\n`)
    return 127
  }
  return result.status ?? 1
}

function readDefaultProfileManifestState() {
  try {
    return { exists: true, content: readFileSync(defaultProfileManifestPath, 'utf8') }
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, content: undefined }
    throw error
  }
}

function assertDefaultProfileManifestUnchanged(before) {
  const after = readDefaultProfileManifestState()
  if (after.exists !== before.exists) {
    throw new Error(`default DSH home profile manifest existence changed: ${defaultProfileManifestPath}`)
  }
  if (after.exists && after.content !== before.content) {
    throw new Error(`default DSH home profile manifest changed: ${defaultProfileManifestPath}`)
  }
}

function assertMaterializedProfile(profileDirectory) {
  const manifestPath = resolve(profileDirectory, 'package.json')
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`failed to read materialized profile manifest ${manifestPath}: ${String(error)}`)
  }
  if (manifest?.dependencies?.['harness-comfyui'] === undefined) {
    throw new Error(`materialized profile ${manifestPath} does not contain dependency harness-comfyui`)
  }
  if (!sameList(manifest?.dsh?.profile?.bundles, profileBundles)) {
    throw new Error(`materialized profile ${manifestPath} changed dsh.profile.bundles order`)
  }
}

function main(argv) {
  const options = parseArguments(argv)
  const dshHome = resolve(repositoryRoot, options.dshHome)
  if (dshHome === defaultDshHome) {
    throw new Error(`--dsh-home must not be the default DSH home: ${defaultDshHome}`)
  }
  const defaultProfileManifestBefore = readDefaultProfileManifestState()
  const profileDirectory = materializeProfileFiles(dshHome)
  let exitCode
  try {
    exitCode = runPluginInstall(dshHome, options.packageSpec, options)
  } finally {
    assertDefaultProfileManifestUnchanged(defaultProfileManifestBefore)
  }
  if (exitCode !== 0) return exitCode
  assertMaterializedProfile(profileDirectory)
  return 0
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  process.stderr.write(`profile materialize: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}
