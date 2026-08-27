import { spawn } from 'node:child_process'
import { delimiter, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export function spawnForeground(options) {
  const environment = options.environment ?? process.env
  return spawn(
    options.dshExecutable,
    ['--profile', options.profile, '--host', options.host, '--port', options.port, '--no-open'],
    {
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
    },
  )
}
