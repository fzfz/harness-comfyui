import { delimiter, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const preflightScript = join(repositoryRoot, 'scripts/deploy/preflight.mjs')
const healthScript = join(repositoryRoot, 'scripts/deploy/health.mjs')
const cliScript = join(repositoryRoot, 'scripts/deploy/cli.mjs')

type ProcessResult = {
  status: number
  stdout: string
  stderr: string
}

function runNode(script: string, args: string[] = []): Promise<ProcessResult> {
  return new Promise(resolveResult => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        PATH: [process.env.PATH, join(repositoryRoot, 'node_modules/.bin')].filter(Boolean).join(delimiter),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('close', code => resolveResult({ status: code ?? 1, stdout, stderr }))
  })
}

describe('product deployment helper modules', () => {
  it('are import-only helpers and do not expose a second direct CLI', async () => {
    const [preflight, health] = await Promise.all([
      runNode(preflightScript),
      runNode(healthScript),
    ])

    expect(preflight).toEqual({ status: 0, stdout: '', stderr: '' })
    expect(health).toEqual({ status: 0, stdout: '', stderr: '' })
  })

  it('exports product helpers while the unified CLI remains the management entrypoint', async () => {
    const [preflight, health, help] = await Promise.all([
      import(preflightScript),
      import(healthScript),
      runNode(cliScript, ['--help']),
    ])

    expect(typeof preflight.runProductPreflight).toBe('function')
    expect(typeof health.runProductHealth).toBe('function')
    expect(help.status).toBe(0)
    expect(help.stderr).toBe('')
    for (const command of [
      'install', 'preflight', 'start', 'stop', 'restart',
      'status', 'health', 'logs', 'upgrade', 'rollback',
    ]) {
      expect(help.stdout).toContain(`  ${command}`)
    }
  })
})
