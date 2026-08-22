import { spawn } from 'node:child_process'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { terminateChild } from './process-lifecycle.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const defaultManifestPath = resolve(repositoryRoot, '.release/quality/artifact.json')
const smokeTestPath = resolve(repositoryRoot, 'tests/release-smoke')
const manifestEnvironmentKey = 'HARNESS_COMFYUI_ARTIFACT_MANIFEST_PATH'

export function parseArguments(argv) {
  let artifactManifestPath = defaultManifestPath
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag !== '--artifact-manifest') throw new Error(`unknown argument ${flag}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--') || value.length === 0) {
      throw new Error('--artifact-manifest requires a non-empty value')
    }
    artifactManifestPath = resolve(value)
    index += 1
  }
  return { artifactManifestPath }
}

export function smokeTestCommand() {
  return [
    'exec',
    'vitest',
    'run',
    relative(repositoryRoot, smokeTestPath),
    '--maxWorkers=1',
    '--no-file-parallelism',
  ]
}

export function runReleaseSmoke({
  artifactManifestPath = defaultManifestPath,
  executable: configuredExecutable,
  command = smokeTestCommand(),
  cwd = repositoryRoot,
  environment = process.env,
} = {}) {
  const executable = configuredExecutable ?? (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  const processGroup = process.platform !== 'win32'
  const child = spawn(executable, command, {
    cwd,
    env: {
      ...environment,
      [manifestEnvironmentKey]: resolve(artifactManifestPath),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    detached: processGroup,
  })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => { stdout += String(chunk) })
  child.stderr.on('data', chunk => { stderr += String(chunk) })

  return new Promise((resolveResult, reject) => {
    let termination
    const forwardSignal = signal => {
      if (termination !== undefined || child.exitCode !== null || child.signalCode !== null) return
      termination = terminateChild(child, {
        processGroup,
        gracefulSignal: signal,
      })
    }
    const cleanupSignals = () => {
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onTerminate)
    }
    const onInterrupt = () => forwardSignal('SIGINT')
    const onTerminate = () => forwardSignal('SIGTERM')
    process.once('SIGINT', onInterrupt)
    process.once('SIGTERM', onTerminate)
    child.once('error', error => {
      cleanupSignals()
      reject(error)
    })
    child.once('close', async (code, signal) => {
      cleanupSignals()
      try {
        await termination
        resolveResult({ code, signal, stdout, stderr })
      } catch (error) {
        reject(error)
      }
    })
  })
}

async function main(argv) {
  const options = parseArguments(argv)
  const result = await runReleaseSmoke(options)
  if (result.stdout.length > 0) process.stdout.write(result.stdout)
  if (result.stderr.length > 0) process.stderr.write(result.stderr)
  if (result.signal !== null) process.exitCode = 1
  else if (result.code !== 0) process.exitCode = result.code ?? 1
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
