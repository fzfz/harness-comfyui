import { spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { delimiter, dirname, isAbsolute, resolve } from 'node:path'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const profileName = 'comfyui-workbench'
const configurationProfiles = new Set(['development', 'test', 'production'])
const signalNumbers = { SIGINT: 2, SIGTERM: 15 }

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!flag.startsWith('--')) throw new Error(`unknown argument ${flag}`)
    if (!['--configuration', '--dsh-home', '--dsh-executable', '--host', '--port'].includes(flag)) {
      throw new Error(`unknown argument ${flag}`)
    }
    if (values.has(flag)) throw new Error(`duplicate argument ${flag}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--') || value.length === 0) throw new Error(`${flag} requires a non-empty value`)
    values.set(flag, value)
    index += 1
  }
  for (const flag of ['--configuration', '--dsh-home', '--dsh-executable', '--host', '--port']) {
    if (!values.has(flag)) throw new Error(`missing required argument ${flag}`)
  }
  const configuration = values.get('--configuration')
  if (!configurationProfiles.has(configuration)) {
    throw new Error(`invalid --configuration ${JSON.stringify(configuration)}; expected development, test, or production`)
  }
  const port = values.get('--port')
  if (!/^\d+$/.test(port) || Number(port) > 65535) throw new Error(`invalid --port ${JSON.stringify(port)}`)
  const host = values.get('--host')
  if (host.length === 0) throw new Error('--host requires a non-empty value')
  const dshExecutable = values.get('--dsh-executable')
  if (dshExecutable !== undefined && !isAbsolute(dshExecutable)) {
    throw new Error('--dsh-executable must be an absolute path')
  }
  return {
    configuration,
    dshHome: values.get('--dsh-home'),
    dshExecutable,
    host,
    port,
  }
}

function sendSignal(child, signal) {
  if (child.pid === undefined) return
  try {
    child.kill(signal)
  } catch {
    // The child may have exited while the signal was being forwarded.
  }
}

export function spawnForeground(options) {
  const command = options.dshExecutable
  const dshArguments = ['--profile', profileName, '--host', options.host, '--port', options.port, '--no-open']
  const environment = options.environment ?? process.env
  return spawn(command, dshArguments, {
    cwd: options.cwd ?? process.cwd(),
    env: {
      ...environment,
      DSH_HOME: resolve(repositoryRoot, options.dshHome),
      HARNESS_COMFYUI_CONFIGURATION_PROFILE: options.configuration,
      PATH: `${resolve(repositoryRoot, 'node_modules/.bin')}${delimiter}${environment.PATH ?? ''}`,
    },
    stdio: options.stdio ?? 'inherit',
    detached: false,
    shell: false,
  })
}

export function runForeground(options) {
  const child = spawnForeground(options)

  let forwardedSignal
  const forward = signal => {
    if (forwardedSignal !== undefined) return
    forwardedSignal = signal
    sendSignal(child, signal)
  }
  process.once('SIGINT', () => forward('SIGINT'))
  process.once('SIGTERM', () => forward('SIGTERM'))

  return new Promise(resolveResult => {
    child.once('error', error => {
      process.stderr.write(`profile start: failed to execute dsh: ${String(error)}\n`)
      resolveResult(127)
    })
    child.once('close', (code, signal) => {
      if (code !== null) {
        resolveResult(code)
        return
      }
      if (signal !== null) {
        resolveResult(128 + (signalNumbers[signal] ?? 1))
        return
      }
      resolveResult(1)
    })
  })
}

async function main(argv) {
  const options = parseArguments(argv)
  return runForeground(options)
}

function isMainModule() {
  if (process.argv[1] === undefined) return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMainModule()) {
  main(process.argv.slice(2))
    .then(exitCode => { process.exitCode = exitCode })
    .catch(error => {
      process.stderr.write(`profile start: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 2
    })
}
