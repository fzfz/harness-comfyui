#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdir, symlink, readlink, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import profileDefinition from '../../profiles/comfyui-cli/package.json' with { type: 'json' }
import definition from '../../config/cli-runtime.json' with { type: 'json' }
import { parseCliRuntime } from '../../config/cli-runtime-schema.mjs'
const configuration = parseCliRuntime(definition)
import { materializeSourceCliModule } from '../production/cli-module.mjs'
import { materializeSourceHostModule } from '../production/host-module.mjs'
import { materializeSourceProfile } from '../profile/source.mjs'
import { materializeSourceProductAgentPreset } from '../profile/agent-preset.mjs'
import { loadProductAgentConfiguration } from '../profile/product-agent-config.mjs'

export async function prepareCliRuntime(repositoryRoot) {
  const runtimeRoot = resolve(repositoryRoot, configuration.runtimeRelativeRoot)
  const dshHome = resolve(runtimeRoot, 'dsh-home')
  const sourceRequire = createRequire(resolve(repositoryRoot, 'package.json'))
  const dshManifest = sourceRequire.resolve('@deepseek-ai/dsh/package.json')
  const dshRequire = createRequire(dshManifest)
  for (const [name, version] of Object.entries(profileDefinition.dependencies)) {
    const manifest = JSON.parse(await readFile(dshRequire.resolve(`${name}/package.json`), 'utf8'))
    if (manifest.version !== version) throw new Error(`CLI dependency ${name} requires ${version}; installed ${manifest.version}. Prepare the declared CLI dependencies before starting.`)
  }
  await materializeSourceCliModule(repositoryRoot)
  await materializeSourceHostModule(repositoryRoot, { web: false })
  const { profileDirectory } = await materializeSourceProfile(repositoryRoot, dshHome, {
    profileName: configuration.profile,
    userEnvironmentFilePath: resolve(repositoryRoot, configuration.environmentFile),
  })
  // DSH resolves Profile bundles from the installed CLI environment.
  const profileModules = resolve(profileDirectory, 'node_modules/@deepseek-ai')
  await mkdir(profileModules, { recursive: true })
  for (const packageName of profileDefinition.dsh.profile.bundles.filter(name => name.startsWith('@deepseek-ai/'))) {
    const name = packageName.slice('@deepseek-ai/'.length)
    const target = resolve(profileModules, name)
    const source = dirname(dshRequire.resolve(`@deepseek-ai/${name}/package.json`))
    try { await symlink(source, target, 'dir') } catch (error) { if (error.code !== 'EEXIST') throw error; if (resolve(dirname(target), await readlink(target)) !== source) throw new Error(`CLI Profile dependency ${target} must point to ${source}. Recreate this Profile dependency link.`) }
  }
  await materializeSourceProductAgentPreset(repositoryRoot, dshHome)
  const product = await loadProductAgentConfiguration(repositoryRoot)
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('HARNESS_COMFYUI_')))
  return {
    executable: resolve(dirname(dshManifest), 'lib/bin.js'),
    environment: {
      ...environment,
      DSH_HOME: dshHome,
      [product.repositorySkillsEnvironmentVariable]: product.repositorySkillsRoot,
      HARNESS_COMFYUI_CONFIGURATION_PROFILE: configuration.configurationProfile,
      ...Object.fromEntries(Object.entries(configuration.runtimePaths).map(([name, path]) => [name, resolve(runtimeRoot, path)])),
    },
  }
}

export async function main(args = process.argv.slice(2)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const runtime = await prepareCliRuntime(root)
  process.exitCode = await runCliProcess(runtime, args)
}

export async function runCliProcess(runtime, args) {
  const child = spawn(process.execPath, [runtime.executable, '--profile', configuration.profile, ...args], { stdio: 'inherit', env: runtime.environment })
  const signal = () => child.kill('SIGTERM')
  process.once('SIGTERM', signal)
  process.once('SIGINT', signal)
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code) => resolve(code ?? 1))
    })
  } finally {
    process.removeListener('SIGTERM', signal)
    process.removeListener('SIGINT', signal)
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
