import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { delimiter, dirname, resolve } from 'node:path'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const profileName = 'comfyui-workbench'
const configurationProfiles = new Set(['development', 'test', 'release-smoke', 'production'])
const signalNumbers = { SIGINT: 2, SIGTERM: 15 }

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!flag.startsWith('--')) throw new Error(`unknown argument ${flag}`)
    if (!['--configuration', '--dsh-home', '--host', '--port'].includes(flag)) {
      throw new Error(`unknown argument ${flag}`)
    }
    if (values.has(flag)) throw new Error(`duplicate argument ${flag}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--') || value.length === 0) throw new Error(`${flag} requires a non-empty value`)
    values.set(flag, value)
    index += 1
  }
  for (const flag of ['--configuration', '--dsh-home', '--host', '--port']) {
    if (!values.has(flag)) throw new Error(`missing required argument ${flag}`)
  }
  const configuration = values.get('--configuration')
  if (!configurationProfiles.has(configuration)) {
    throw new Error(`invalid --configuration ${JSON.stringify(configuration)}; expected development, test, release-smoke, or production`)
  }
  const port = values.get('--port')
  if (!/^\d+$/.test(port) || Number(port) > 65535) throw new Error(`invalid --port ${JSON.stringify(port)}`)
  const host = values.get('--host')
  if (host.length === 0) throw new Error('--host requires a non-empty value')
  return {
    configuration,
    dshHome: values.get('--dsh-home'),
    host,
    port,
  }
}

function sendSignal(child, signal) {
  if (child.pid === undefined) return
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal)
      return
    } catch {
      // The child may have exited between the close check and this signal.
    }
  }
  try {
    child.kill(signal)
  } catch {
    // The child may have exited while the signal was being forwarded.
  }
}

function runForeground(options) {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const child = spawn(command, [
    'exec',
    'dsh',
    '--profile',
    profileName,
    '--host',
    options.host,
    '--port',
    options.port,
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DSH_HOME: resolve(repositoryRoot, options.dshHome),
      HARNESS_COMFYUI_CONFIGURATION_PROFILE: options.configuration,
      PATH: `${resolve(repositoryRoot, 'node_modules/.bin')}${delimiter}${process.env.PATH ?? ''}`,
    },
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    shell: false,
  })

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
      process.stderr.write(`profile start: failed to execute pnpm: ${String(error)}\n`)
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

main(process.argv.slice(2))
  .then(exitCode => { process.exitCode = exitCode })
  .catch(error => {
    process.stderr.write(`profile start: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 2
  })
